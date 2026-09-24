import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';

// Queue scoping is SQL-level (active-only by default, archive on demand), so it runs live.
describe('IT queue status filter (Live PostgreSQL)', () => {
  test('default scope hides Closed; status=closed and scope=all show it', async () => {
    const sql = await openTestDatabase();
    try {
      const pass = await hashPassword('password_aman_queue_123');
      const [reporter] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('queue_reporter', 'Queue Reporter', ${pass}, 'User') RETURNING id`;
      const [staff] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('queue_staff', 'Queue Staff', ${pass}, 'IT Staff') RETURNING id`;
      await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES ('queue_sess', ${staff.id}, NOW() + INTERVAL '1 day')`;
      await sql`
        INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
        VALUES
          ('QUEUE-OPEN-1', ${reporter.id}, 'QUEUE_TEST_Pending', 'Desc', 'High', 'Open'),
          ('QUEUE-CLOSED-1', ${reporter.id}, 'QUEUE_TEST_Done', 'Desc', 'High', 'Closed')
      `;

      const headers = { Cookie: 'session_id=queue_sess' };
      const titles = async (query: string) => {
        const res = await handleRequest(new Request(`http://localhost/api/dashboard/queue${query}`, { headers }), { sql });
        expect(res.status).toBe(200);
        const body: any = await res.json();
        return body.queue.filter((t: any) => t.title.startsWith('QUEUE_TEST_')).map((t: any) => t.title);
      };

      expect(await titles('')).toEqual(['QUEUE_TEST_Pending']); // active-only default
      expect(await titles('?status=closed')).toEqual(['QUEUE_TEST_Done']);
      expect((await titles('?scope=all')).sort()).toEqual(['QUEUE_TEST_Done', 'QUEUE_TEST_Pending']);

      const invalid = await handleRequest(new Request('http://localhost/api/dashboard/queue?status=Nope', { headers }), { sql });
      expect(invalid.status).toBe(422);
    } finally {
      await closeTestDatabase(sql);
    }
  });
});