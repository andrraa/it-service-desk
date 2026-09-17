import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';
import { hashPassword } from '../src/server/auth';

describe('IT Administration & Staff Management Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let superAdminId: string;
  let superAdminSession: string;
  let itStaffSession: string;
  let regularUserSession: string;

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);

    // Cleanup
    await sql`DELETE FROM audit_logs WHERE reason LIKE 'TEST_ADMIN_%' OR reason LIKE 'Dialihkan oleh Super Admin%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'ADMIN_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'adm_test_%'`;

    const passHash = await hashPassword('password_aman_adm_123');

    // Create Super Admin
    const adm = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('ADM_NIK_01', 'adm_test_super', ${passHash}, 'Super Admin', TRUE)
      RETURNING id
    `;
    superAdminId = String(adm[0].id);
    superAdminSession = 'adm_session_super';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${superAdminSession}, ${adm[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff
    const it = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('ADM_NIK_IT', 'adm_test_staff', ${passHash}, 'IT Staff', TRUE)
      RETURNING id
    `;
    itStaffSession = 'adm_session_staff';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaffSession}, ${it[0].id}, NOW() + INTERVAL '1 day')`;

    // Create Regular User
    const usr = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('ADM_NIK_USR', 'adm_test_user', ${passHash}, 'User', TRUE)
      RETURNING id
    `;
    regularUserSession = 'adm_session_user';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${regularUserSession}, ${usr[0].id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM audit_logs WHERE reason LIKE 'TEST_ADMIN_%' OR reason LIKE 'Dialihkan oleh Super Admin%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'ADMIN_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'adm_test_%'`;
    await sql.close();
  });

  test('acceptance: non-Super-Admin is strictly forbidden (403) from accessing admin routes', async () => {
    // Regular User
    const userRes = await handleRequest(new Request('http://localhost/api/admin/users', {
      method: 'GET',
      headers: { Cookie: `session_id=${regularUserSession}` },
    }), { sql });
    expect(userRes.status).toBe(403);

    // IT Staff
    const itRes = await handleRequest(new Request('http://localhost/api/admin/users', {
      method: 'GET',
      headers: { Cookie: `session_id=${itStaffSession}` },
    }), { sql });
    expect(itRes.status).toBe(403);
  });

  test('acceptance: Super Admin creates new IT Staff with must_change_password=TRUE and temporary password', async () => {
    const res = await handleRequest(new Request('http://localhost/api/admin/users', {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
      body: JSON.stringify({
        nik: '008192',
        username: 'adm_test_new_tech',
      }),
    }), { sql });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.role).toBe('IT Staff');
    expect(body.user.mustChangePassword).toBe(true);
    expect(body.temporaryPassword).toBeDefined();
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // Verify in database
    const dbUser = await sql`SELECT must_change_password AS "mustChangePassword", role FROM users WHERE username = 'adm_test_new_tech'`;
    expect(dbUser[0].mustChangePassword).toBe(true);
    expect(dbUser[0].role).toBe('IT Staff');
  });

  test('acceptance: protects last active Super Admin from being disabled', async () => {
    // Only 1 super admin was created in beforeAll (adm_test_super)
    const res = await handleRequest(new Request(`http://localhost/api/admin/users/${superAdminId}`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
      body: JSON.stringify({ isActive: false }),
    }), { sql });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('Super Admin aktif terakhir');
  });

  test('acceptance: cannot disable IT staff who still has active assigned tickets until reassigned', async () => {
    // 1. Create a staff with active ticket
    const passHash = await hashPassword('pass123456789');
    const staffRows = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('BUSY_STAFF', 'adm_test_busy_staff', ${passHash}, 'IT Staff', TRUE)
      RETURNING id
    `;
    const busyStaffId = staffRows[0].id;

    // Insert active ticket assigned to busy staff
    const ticketRows = await sql`
      INSERT INTO tickets (ticket_number, creator_id, assignee_id, title, description, priority, status)
      VALUES ('ADMIN-TKT-BUSY', (SELECT id FROM users WHERE username = 'adm_test_user'), ${busyStaffId}, 'ADMIN_TKT_Active', 'Sedang dikerjakan', 'High', 'In Progress')
      RETURNING id
    `;
    const activeTicketId = ticketRows[0].id;

    // 2. Attempt to disable busy staff without reassigning ticket: must be rejected with 409 Conflict
    const disableRes = await handleRequest(new Request(`http://localhost/api/admin/users/${busyStaffId}`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
      body: JSON.stringify({ isActive: false }),
    }), { sql });

    expect(disableRes.status).toBe(409);
    const disableBody = await disableRes.json();
    expect(disableBody.error.message).toContain('tiket aktif');

    // 3. Super Admin reassigns the ticket to another IT Staff
    const otherStaffId = (await sql`SELECT id FROM users WHERE username = 'adm_test_staff'`)[0].id;
    const reassignRes = await handleRequest(new Request(`http://localhost/api/admin/tickets/${activeTicketId}/assign`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
      body: JSON.stringify({ newAssigneeId: otherStaffId, reason: 'TEST_ADMIN_REASSIGN: Alihkan sebelum penonaktifan' }),
    }), { sql });
    expect(reassignRes.status).toBe(200);

    // 4. Now disabling the former busy staff succeeds and revokes their active sessions
    // First simulate staff having an active session
    const staffSessionToken = 'busy_staff_session_token';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${staffSessionToken}, ${busyStaffId}, NOW() + INTERVAL '1 day')`;

    const disableOkRes = await handleRequest(new Request(`http://localhost/api/admin/users/${busyStaffId}`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
      body: JSON.stringify({ isActive: false }),
    }), { sql });

    expect(disableOkRes.status).toBe(200);

    // Verify session revoked in DB
    const activeSessions = await sql`SELECT 1 FROM sessions WHERE id = ${staffSessionToken}`;
    expect(activeSessions.length).toBe(0);
  });
});
