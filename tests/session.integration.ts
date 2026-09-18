import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword, parseCookies } from '../src/server/auth';
import { MemoryRateLimiter } from '../src/server/rate-limit';

describe('Auth & Session Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql`DELETE FROM users WHERE username LIKE 'task4_%' OR nik LIKE 'T4_%'`;
  });

  afterAll(async () => {
    await sql`DELETE FROM users WHERE username LIKE 'task4_%' OR nik LIKE 'T4_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: rejects mutating requests with invalid CSRF headers', async () => {
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // Missing CSRF header
      body: JSON.stringify({ username: 'any', password: 'any' }),
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('CSRF_ERROR');
  });

  test('acceptance: successful login sets secure, HttpOnly, SameSite=Lax cookie and retrieves session', async () => {
    const password = 'task4_secure_password_123';
    const passwordHash = await hashPassword(password);

    await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
      VALUES ('T4_VALID', 'task4_user_valid', ${passwordHash}, 'User', TRUE, FALSE)
    `;

    // 1. Login
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ username: 'task4_user_valid', password }),
    });

    const loginRes = await handleRequest(loginReq, { sql });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('Set-Cookie') || '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('session_id=');

    const cookies = parseCookies(setCookie);
    const sessionId = cookies.session_id;
    expect(sessionId).toBeDefined();

    // 2. Access /api/auth/me with session
    const meReq = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_id=${sessionId}` },
    });
    const meRes = await handleRequest(meReq, { sql });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.user.username).toBe('task4_user_valid');

    // 3. Logout revokes session from database
    const logoutReq = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: {
        ...authHeaders,
        Cookie: `session_id=${sessionId}`,
      },
    });
    const logoutRes = await handleRequest(logoutReq, { sql });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('Set-Cookie')).toContain('Max-Age=0');

    // 4. Access /api/auth/me after logout is rejected
    const afterLogoutReq = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_id=${sessionId}` },
    });
    const afterLogoutRes = await handleRequest(afterLogoutReq, { sql });
    expect(afterLogoutRes.status).toBe(401);
  });

  test('acceptance: disabled/inactive user is rejected at login and active session becomes invalid', async () => {
    const password = 'task4_secure_password_123';
    const passwordHash = await hashPassword(password);

    const inserted = await sql`
      INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
      VALUES ('T4_DISABLED', 'task4_user_disabled', ${passwordHash}, 'User', TRUE, FALSE)
      RETURNING id
    `;
    const userId = inserted[0].id;

    // Login while active
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ username: 'task4_user_disabled', password }),
    });
    const loginRes = await handleRequest(loginReq, { sql });
    expect(loginRes.status).toBe(200);
    const cookies = parseCookies(loginRes.headers.get('Set-Cookie'));
    const sessionId = cookies.session_id;

    // Now disable the user in DB
    await sql`UPDATE users SET is_active = FALSE WHERE id = ${userId}`;

    // Active session must now be rejected
    const meReq = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_id=${sessionId}` },
    });
    const meRes = await handleRequest(meReq, { sql });
    expect(meRes.status).toBe(401);

    // New login attempt must be rejected with 403 Forbidden
    const newLoginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ username: 'task4_user_disabled', password }),
    });
    const newLoginRes = await handleRequest(newLoginReq, { sql });
    expect(newLoginRes.status).toBe(403);
    const body = await newLoginRes.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('acceptance: expired session is rejected', async () => {
    const expiredSessionId = 'expired_session_test_token_123';
    // Insert session already expired
    await sql`
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES (${expiredSessionId}, (SELECT id FROM users LIMIT 1), NOW() - INTERVAL '1 hour')
    `;

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: `session_id=${expiredSessionId}` },
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(401);
  });

  test('acceptance: rate limiter enforces limit on repeated login attempts', async () => {
    const rateLimiter = new MemoryRateLimiter(3, 10000); // 3 attempts allowed

    for (let i = 0; i < 3; i++) {
      const req = new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { ...authHeaders, 'x-forwarded-for': '192.168.1.100' },
        body: JSON.stringify({ username: 'non_existing_user', password: 'password123456' }),
      });
      const res = await handleRequest(req, { sql, rateLimiter });
      expect(res.status).toBe(401); // wrong credentials
    }

    // 4th attempt should be blocked by rate limit
    const blockedReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { ...authHeaders, 'x-forwarded-for': '192.168.1.100' },
      body: JSON.stringify({ username: 'non_existing_user', password: 'password123456' }),
    });
    const blockedRes = await handleRequest(blockedReq, { sql, rateLimiter });
    expect(blockedRes.status).toBe(429);
    const body = await blockedRes.json();
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
