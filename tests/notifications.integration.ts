import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';

describe('Notifications Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const authHeaders = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };

  let userSession: string;
  let itSession: string;
  let itId: string;
  let ticketId: string;

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql`DELETE FROM tickets WHERE ticket_number LIKE 'NOTIF-TKT-%'`;
    await sql`DELETE FROM users WHERE username LIKE 'notif_test_%'`;

    const passHash = await hashPassword('password_aman_notif_123');
    const u = await sql`
      INSERT INTO users (username, password_hash, role)
      VALUES ('notif_test_user', ${passHash}, 'User') RETURNING id`;
    userSession = 'notif_session_user';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userSession}, ${u[0].id}, NOW() + INTERVAL '1 day')`;

    const it = await sql`
      INSERT INTO users (username, password_hash, role)
      VALUES ('notif_test_it', ${passHash}, 'IT Staff') RETURNING id`;
    itId = String(it[0].id);
    itSession = 'notif_session_it';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itSession}, ${it[0].id}, NOW() + INTERVAL '1 day')`;

    const t = await sql`
      INSERT INTO tickets (ticket_number, creator_id, assignee_id, title, description, priority, status)
      VALUES ('NOTIF-TKT-01', ${u[0].id}, ${it[0].id}, 'NOTIF ticket', 'Deskripsi', 'Medium', 'Open')
      RETURNING id`;
    ticketId = String(t[0].id);
  });

  afterAll(async () => {
    await sql`DELETE FROM tickets WHERE ticket_number LIKE 'NOTIF-TKT-%'`;
    await sql`DELETE FROM users WHERE username LIKE 'notif_test_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: opening a notification marks it read and drops it from the unread panel list', async () => {
    const sendRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userSession}` },
      body: JSON.stringify({ messageText: 'NOTIF_MSG: ada kendala baru.' }),
    }), { sql });
    expect(sendRes.status).toBe(201);

    // Panel awal: 1 notifikasi, belum dibaca
    const before = await handleRequest(new Request('http://localhost/api/notifications', {
      headers: { Cookie: `session_id=${itSession}` },
    }), { sql });
    expect(before.status).toBe(200);
    const beforeBody = await before.json();
    expect(beforeBody.unreadCount).toBe(1);
    const unread = beforeBody.notifications.filter((n: { readAt: string | null }) => !n.readAt);
    expect(unread.length).toBe(1);

    // Buka notifikasi
    const readRes = await handleRequest(new Request(`http://localhost/api/notifications/${unread[0].id}/read`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${itSession}` },
    }), { sql });
    expect(readRes.status).toBe(200);

    // Setelah dibuka: badge 0 dan daftar panel (filter readAt) kosong
    const after = await handleRequest(new Request('http://localhost/api/notifications', {
      headers: { Cookie: `session_id=${itSession}` },
    }), { sql });
    const afterBody = await after.json();
    expect(afterBody.unreadCount).toBe(0);
    expect(afterBody.notifications.filter((n: { readAt: string | null }) => !n.readAt).length).toBe(0);
  });

  test('acceptance: another user cannot read someone else notification', async () => {
    const rows = await sql`SELECT id FROM notifications WHERE recipient_id = ${itId} LIMIT 1`;
    const res = await handleRequest(new Request(`http://localhost/api/notifications/${rows[0].id}/read`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${userSession}` },
    }), { sql });
    expect(res.status).toBe(404);
  });
});