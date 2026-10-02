import { describe, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';
import { MemoryRateLimiter } from '../src/server/rate-limit';
import type { Mailer, OutboundEmail } from '../src/server/mailer';

// The three email triggers are wired in app.ts, so they need a live database.
describe('Automatic notification emails (Live PostgreSQL)', () => {
  let sql: SQL;

  const pass = 'password_super_aman_123';
  const sent: OutboundEmail[] = [];
  const mailer: Mailer = { send: async (email) => { sent.push(email); }, close: async () => {} };
  const options = { mailer, appUrl: 'http://helpdesk.perusahaan.co.id' };

  async function withDb(run: () => Promise<void>) {
    sql = await openTestDatabase();
    sent.length = 0;
    try { await run(); } finally { await closeTestDatabase(sql); }
  }

  const post = (path: string, session: string | null, body: unknown) =>
    handleRequest(new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(session ? { Cookie: `session_id=${session}` } : {}) },
      body: JSON.stringify(body),
    // A fresh limiter per request keeps the shared default (5/min) from leaking across cases.
    }), { sql, rateLimiter: new MemoryRateLimiter(50, 60 * 1000) }, options);

  const uuid = () => crypto.randomUUID();
  // New-ticket mail looks recipients up in the database asynchronously, so poll for it.
  async function settle(count: number) {
    for (let i = 0; i < 100 && sent.length < count; i++) await Bun.sleep(10);
  }

  test('registering sends one welcome mail to the new address', () => withDb(async () => {
    const res = await post('/api/auth/register', null, { fullName: 'Budi Santoso', username: 'notif_budi', email: 'budi@perusahaan.com', password: pass });

    expect(res.status).toBe(201);
    expect(sent.map((m) => m.to)).toEqual(['budi@perusahaan.com']);
    expect((await sql`SELECT email FROM users WHERE username = 'notif_budi'`)[0]!.email).toBe('budi@perusahaan.com');
  }));

  test('a new ticket mails staff once, blind-copied; a replay sends nothing', () => withDb(async () => {
    const hash = await hashPassword(pass);
    await sql`INSERT INTO users (username, full_name, email, password_hash, role) VALUES
      ('notif_user', 'Notif User', 'pelapor@perusahaan.com', ${hash}, 'User'),
      ('notif_staff1', 'Staff Satu', 'staff1@perusahaan.com', ${hash}, 'IT Staff'),
      ('notif_staff2', 'Staff Dua', 'staff2@perusahaan.com', ${hash}, 'Super Admin'),
      ('notif_staff3', 'Staff Tiga', NULL, ${hash}, 'IT Staff')`;
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES ('notif_sess_user', (SELECT id FROM users WHERE username = 'notif_user'), NOW() + INTERVAL '1 day')`;

    const ticket = { title: 'Tiket Notif', description: 'Printer di lantai 3 tidak bisa mencetak.', priority: 'High', requestId: uuid() };
    expect((await post('/api/tickets', 'notif_sess_user', ticket)).status).toBe(201);
    await settle(1);
    expect(sent.map((m) => m.bcc)).toEqual([['staff2@perusahaan.com']]);
    expect(sent[0]!.body).toContain('Tiket Notif');

    await post('/api/tickets', 'notif_sess_user', ticket);
    await settle(2);
    expect(sent).toHaveLength(1);
  }));

  test('replies are mailed to the other party in both directions', () => withDb(async () => {
    const hash = await hashPassword(pass);
    await sql`INSERT INTO users (username, full_name, email, password_hash, role) VALUES
      ('notif_reporter', 'Pelapor', 'pelapor@perusahaan.com', ${hash}, 'User'),
      ('notif_it', 'Staf IT', 'it@perusahaan.com', ${hash}, 'IT Staff')`;
    const [ticket] = await sql`INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status, assignee_id)
      VALUES ('NOTIF-1', (SELECT id FROM users WHERE username = 'notif_reporter'), 'Notif Reply', 'Desc', 'Medium', 'In Progress', (SELECT id FROM users WHERE username = 'notif_it')) RETURNING id`;
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES
      ('notif_sess_reporter', (SELECT id FROM users WHERE username = 'notif_reporter'), NOW() + INTERVAL '1 day'),
      ('notif_sess_it', (SELECT id FROM users WHERE username = 'notif_it'), NOW() + INTERVAL '1 day')`;

    await post(`/api/tickets/${ticket.id}/messages`, 'notif_sess_reporter', { messageText: 'Tolong dibantu.', requestId: uuid() });
    expect(sent.map((m) => m.to)).toEqual(['it@perusahaan.com']);

    await post(`/api/tickets/${ticket.id}/messages`, 'notif_sess_it', { messageText: 'Sedang kami cek.', requestId: uuid() });
    expect(sent.map((m) => m.to)).toEqual(['it@perusahaan.com', 'pelapor@perusahaan.com']);
  }));
});
// Existing accounts predate the email requirement, so Super Admin must be able to fill it in.
describe('Admin sets a user email (Live PostgreSQL)', () => {
  test('lists the missing email, rejects a malformed one, then saves it', async () => {
    const sql = await openTestDatabase();
    try {
      const hash = await hashPassword('password_super_aman_123');
      await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES
        ('adm_admin', 'Admin Uji', ${hash}, 'Super Admin'),
        ('adm_staff', 'Staf Uji', ${hash}, 'IT Staff')`;
      await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES
        ('adm_sess_admin', (SELECT id FROM users WHERE username = 'adm_admin'), NOW() + INTERVAL '1 day'),
        ('adm_sess_staff', (SELECT id FROM users WHERE username = 'adm_staff'), NOW() + INTERVAL '1 day')`;

      const list = await handleRequest(new Request('http://localhost/api/admin/users?q=adm_staff', { headers: { Cookie: 'session_id=adm_sess_admin' } }), { sql });
      const staff = (await list.json() as any).users[0];
      expect(staff.email).toBe(null);

      const patch = (body: unknown, session: string) => handleRequest(new Request(`http://localhost/api/admin/users/${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: `session_id=${session}` },
        body: JSON.stringify(body),
      }), { sql });

      // A non-admin cannot set anyone's address.
      expect((await patch({ email: 'hacker@jahat.com' }, 'adm_sess_staff')).status).toBe(403);
      expect((await patch({ email: 'bukan-email' }, 'adm_sess_admin')).status).toBe(422);
      expect((await patch({ email: '' }, 'adm_sess_admin')).status).toBe(422);

      expect((await patch({ email: 'staf@perusahaan.com' }, 'adm_sess_admin')).status).toBe(200);
      expect((await sql`SELECT email FROM users WHERE username = 'adm_staff'`)[0]!.email).toBe('staf@perusahaan.com');
    } finally {
      await closeTestDatabase(sql);
    }
  });
});
