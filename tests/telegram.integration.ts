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
    const notifier = {
      notifyNewTicket: async (t: Parameters<typeof formatNewTicketMessage>[0]) => { sent.push(t); },
      notifyTicketReply: async () => {},
      close: async () => {},
    };
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

describe('Reply notification integration (Live PostgreSQL)', () => {
  test('only the reporter\'s new message notifies; staff replies and ticket close stay silent', async () => {
    const sql = await openTestDatabase();
    try {
      const pass = await hashPassword('password_aman_notif_123');
      const [owner] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('notif_owner', 'Notif Owner', ${pass}, 'User') RETURNING id`;
      const [staff] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('notif_staff', 'Notif Staff', ${pass}, 'IT Staff') RETURNING id`;
      await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES ('notif_owner_s', ${owner.id}, NOW() + INTERVAL '1 day'), ('notif_staff_s', ${staff.id}, NOW() + INTERVAL '1 day')`;

      const replies: any[] = [];
      const notifier = {
        notifyNewTicket: async () => {},
        notifyTicketReply: async (r: any) => { replies.push(r); },
        close: async () => {},
      };
      const auth = (session: string) => ({ 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: `session_id=${session}` });
      const send = (id: number | string, session: string, messageText: string) => handleRequest(new Request(`http://localhost/api/tickets/${id}/messages`, {
        method: 'POST', headers: auth(session), body: JSON.stringify({ messageText }),
      }), { sql }, { notifier });

      const created = await handleRequest(new Request('http://localhost/api/tickets', {
        method: 'POST', headers: auth('notif_owner_s'),
        body: JSON.stringify({ title: 'NOTIF_TEST: Jaringan mati', description: 'Seluruh lantai 3 tidak ada internet', priority: 'High' }),
      }), { sql }, { notifier });
      expect(created.status).toBe(201);
      const { ticket } = await created.json();
      expect((await handleRequest(new Request(`http://localhost/api/tickets/${ticket.id}/claim`, { method: 'POST', headers: auth('notif_staff_s') }), { sql }, { notifier })).status).toBe(200);

      // Staff reply: visible in the conversation, but never in Telegram.
      expect((await send(ticket.id, 'notif_staff_s', 'Sedang kami cek ya.')).status).toBe(201);
      await Bun.sleep(0);
      expect(replies).toHaveLength(0);

      // Reporter reply: notifies once, with the reporter as sender.
      expect((await send(ticket.id, 'notif_owner_s', 'Masih belum bisa, pak.')).status).toBe(201);
      await Bun.sleep(0);
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({ ticketNumber: ticket.ticketNumber, senderRole: 'User', messageText: 'Masih belum bisa, pak.' });

      // Closing notifies nothing.
      expect((await handleRequest(new Request(`http://localhost/api/tickets/${ticket.id}/close`, {
        method: 'POST', headers: auth('notif_staff_s'), body: JSON.stringify({ solution: 'Restart switch lantai 3.' }),
      }), { sql }, { notifier })).status).toBe(200);
      await Bun.sleep(0);
      expect(replies).toHaveLength(1);
    } finally {
      await closeTestDatabase(sql);
    }
  });
});
