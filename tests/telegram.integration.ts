import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';
import { formatNewTicketMessage } from '../src/server/telegram';

// isNew relies on PostgreSQL's xmax semantics, so it is verified against a live database.
describe('New-ticket notification integration (Live PostgreSQL)', () => {
  let sql: SQL;
  let session: string;
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };

  beforeAll(async () => {
    sql = await openTestDatabase();
    const pass = await hashPassword('password_aman_notif_123');
    const [user] = await sql`
      INSERT INTO users (username, full_name, password_hash, role)
      VALUES ('notif_test_user', 'Notif Test User', ${pass}, 'User') RETURNING id`;
    session = 'notif_test_session';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${session}, ${user.id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM tickets WHERE title LIKE 'NOTIF_TEST_%'`.catch(() => {});
    await closeTestDatabase(sql);
  });

  test('exactly one notification per ticket, and a replayed requestId notifies nothing', async () => {
    const sent: Array<Parameters<typeof formatNewTicketMessage>[0]> = [];
    const notifier = { notifyNewTicket: async (t: Parameters<typeof formatNewTicketMessage>[0]) => { sent.push(t); }, close: async () => {} };
    const requestId = crypto.randomUUID();
    const body = JSON.stringify({ title: 'NOTIF_TEST: Printer rusak', description: 'Monitor lantai 2 error offline', priority: 'Critical', requestId });
    const post = () => new Request('http://localhost/api/tickets', {
      method: 'POST', body, headers: { ...headers, Cookie: `session_id=${session}` },
    });

    const created = await handleRequest(post(), { sql }, { notifier });
    expect(created.status).toBe(201);
    const { ticket } = await created.json();
    expect(ticket.ticketNumber).toMatch(/^TKT-\d{6}$/);
    expect(ticket.isNew).toBeUndefined(); // internal flag must not leak to the API response
    await Bun.sleep(0); // notification is fire-and-forget
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ ticketNumber: ticket.ticketNumber, priority: 'Critical', creatorUsername: 'notif_test_user', creatorFullName: 'Notif Test User' });

    // Same requestId replayed: row is reused, so the channel must stay silent.
    const replay = await handleRequest(post(), { sql }, { notifier });
    expect(replay.status).toBe(201);
    await Bun.sleep(0);
    expect(sent).toHaveLength(1);

    const count = await sql`SELECT COUNT(*)::int AS count FROM tickets WHERE request_id = ${requestId}`;
    expect(count[0].count).toBe(1);
  });
});
