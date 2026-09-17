import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';
import { hashPassword } from '../src/server/auth';

describe('Security Audit & Role Hardening Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let user1Session: string;
  let user1Id: string;
  let user2Session: string;
  let itStaffSession: string;
  let user1TicketId: string;

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);

    // Cleanup
    await sql`DELETE FROM tickets WHERE title LIKE 'SEC_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'sec_user_%'`;

    const passHash = await hashPassword('password_aman_sec_123');

    // Create User 1
    const u1 = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('SEC_NIK_1', 'sec_user_1', ${passHash}, 'User', TRUE)
      RETURNING id
    `;
    user1Id = String(u1[0].id);
    user1Session = 'sec_session_user_1';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${user1Session}, ${u1[0].id}, NOW() + INTERVAL '1 day')`;

    // Create User 2
    const u2 = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('SEC_NIK_2', 'sec_user_2', ${passHash}, 'User', TRUE)
      RETURNING id
    `;
    user2Session = 'sec_session_user_2';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${user2Session}, ${u2[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff
    const uIT = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('SEC_NIK_IT', 'sec_user_it', ${passHash}, 'IT Staff', TRUE)
      RETURNING id
    `;
    itStaffSession = 'sec_session_it';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaffSession}, ${uIT[0].id}, NOW() + INTERVAL '1 day')`;

    // Create User 1's Ticket
    const t1 = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('SEC-TKT-01', ${user1Id}, 'SEC_TKT_Confidential', 'Data rahasia keuangan User 1', 'High', 'Open')
      RETURNING id
    `;
    user1TicketId = String(t1[0].id);
  });

  afterAll(async () => {
    await sql`DELETE FROM tickets WHERE title LIKE 'SEC_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'sec_user_%'`;
    await sql.close();
  });

  test('security: User 2 cannot access User 1 ticket via direct ID or ticketNumber spoofing', async () => {
    // Attempt by ID
    const resId = await handleRequest(new Request(`http://localhost/api/tickets/${user1TicketId}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${user2Session}` },
    }), { sql });
    expect(resId.status).toBe(403);

    // Attempt by ticketNumber
    const resNum = await handleRequest(new Request('http://localhost/api/tickets/SEC-TKT-01', {
      method: 'GET',
      headers: { Cookie: `session_id=${user2Session}` },
    }), { sql });
    expect(resNum.status).toBe(403);
  });

  test('security: User cannot claim ticket or modify status directly', async () => {
    const claimRes = await handleRequest(new Request(`http://localhost/api/tickets/${user1TicketId}/claim`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${user1Session}` },
    }), { sql });
    expect(claimRes.status).toBe(403);
    const body = await claimRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('security: User cannot alter ticket priority after creation', async () => {
    const prioRes = await handleRequest(new Request(`http://localhost/api/tickets/${user1TicketId}/priority`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${user1Session}` },
      body: JSON.stringify({ priority: 'Critical', reason: 'User attempts to escalate priority' }),
    }), { sql });
    expect(prioRes.status).toBe(403);
  });

  test('security: IT Staff cannot access Super Admin administration routes', async () => {
    const adminRes = await handleRequest(new Request('http://localhost/api/admin/users', {
      method: 'GET',
      headers: { Cookie: `session_id=${itStaffSession}` },
    }), { sql });
    expect(adminRes.status).toBe(403);

    const resetRes = await handleRequest(new Request(`http://localhost/api/admin/users/${user1Id}/reset-password`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaffSession}` },
    }), { sql });
    expect(resetRes.status).toBe(403);
  });

  test('security: SQL injection in search query is safely parameterized by Bun SQL', async () => {
    const sqlInjectionPayload = "'; DROP TABLE tickets; --";
    const searchReq = new Request(`http://localhost/api/tickets?q=${encodeURIComponent(sqlInjectionPayload)}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${user1Session}` },
    });
    const searchRes = await handleRequest(searchReq, { sql });
    expect(searchRes.status).toBe(200);

    // Verify tickets table is completely intact
    const verifyTable = await sql`SELECT COUNT(*)::int AS count FROM tickets`;
    expect(verifyTable[0].count).toBeGreaterThan(0);
  });
});
