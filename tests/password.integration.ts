import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';
import { hashPassword, parseCookies } from '../src/server/auth';

describe('Password Recovery, Expiry, & Mandatory Change Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let targetUserId: string;
  let targetUserOldSession: string;
  let superAdminSession: string;

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);

    // Cleanup
    await sql`DELETE FROM password_resets WHERE temp_password_hash LIKE '$argon2id$%'`;
    await sql`DELETE FROM users WHERE username LIKE 'pw_test_%'`;

    const passHash = await hashPassword('old_secure_password_123');

    // Create Super Admin
    const adm = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active)
      VALUES ('PW_ADM', 'pw_test_admin', ${passHash}, 'Super Admin', TRUE)
      RETURNING id
    `;
    superAdminSession = 'pw_session_admin';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${superAdminSession}, ${adm[0].id}, NOW() + INTERVAL '1 day')`;

    // Create Target User
    const usr = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
      VALUES ('PW_USR', 'pw_test_target', ${passHash}, 'User', TRUE, FALSE)
      RETURNING id
    `;
    targetUserId = String(usr[0].id);
    targetUserOldSession = 'pw_session_target_old';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${targetUserOldSession}, ${usr[0].id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM password_resets WHERE temp_password_hash LIKE '$argon2id$%'`;
    await sql`DELETE FROM users WHERE username LIKE 'pw_test_%'`;
    await sql.close();
  });

  test('acceptance: Super Admin reset issues temporary password, revokes old sessions, and sets must_change_password=TRUE', async () => {
    const resetRes = await handleRequest(new Request(`http://localhost/api/admin/users/${targetUserId}/reset-password`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${superAdminSession}` },
    }), { sql });

    expect(resetRes.status).toBe(200);
    const resetBody = await resetRes.json();
    expect(resetBody.temporaryPassword).toBeDefined();
    expect(resetBody.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // 1. Verify old session is revoked immediately
    const oldSessionCheck = await handleRequest(new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_id=${targetUserOldSession}` },
    }), { sql });
    expect(oldSessionCheck.status).toBe(401);

    // 2. User logs in using temporary password
    const loginRes = await handleRequest(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'pw_test_target',
        password: resetBody.temporaryPassword,
      }),
    }), { sql });
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.mustChangePassword).toBe(true);

    const newCookies = parseCookies(loginRes.headers.get('Set-Cookie'));
    const tempSession = newCookies.session_id;

    // 3. Restricted session: attempt to create ticket or view queue must be rejected with 403 (PASSWORD_CHANGE_REQUIRED)
    const ticketRes = await handleRequest(new Request('http://localhost/api/tickets', {
      method: 'GET',
      headers: { Cookie: `session_id=${tempSession}` },
    }), { sql });
    expect(ticketRes.status).toBe(403);
    const ticketBody = await ticketRes.json();
    expect(ticketBody.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // 4. User changes password to a new permanent one
    const changeRes = await handleRequest(new Request('http://localhost/api/auth/change-password', {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${tempSession}` },
      body: JSON.stringify({
        newPassword: 'my_brand_new_permanent_password_123',
      }),
    }), { sql });
    expect(changeRes.status).toBe(200);

    // 5. Verification: user can now freely access tickets without restriction
    const freeTicketRes = await handleRequest(new Request('http://localhost/api/tickets', {
      method: 'GET',
      headers: { Cookie: `session_id=${tempSession}` },
    }), { sql });
    expect(freeTicketRes.status).toBe(200);

    // 6. Temporary password is no longer valid for login
    const reuseTempRes = await handleRequest(new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        username: 'pw_test_target',
        password: resetBody.temporaryPassword,
      }),
    }), { sql });
    expect(reuseTempRes.status).toBe(401);
  });
});
