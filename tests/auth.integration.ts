import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';

describe('Auth Registration Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);
    await sql`DELETE FROM users WHERE username LIKE 'test_user_%'`;
  });

  afterAll(async () => {
    await sql`DELETE FROM users WHERE username LIKE 'test_user_%'`;
    await sql`close()`;
  });

  test('acceptance: formats full name to Title Case', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        fullName: 'budi santoso wijaya',
        username: 'test_user_titlecase',
        password: 'password_super_aman_123',
      }),
    });

    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.fullName).toBe('Budi Santoso Wijaya');
    expect(body.user.username).toBe('test_user_titlecase');

    const rows = await sql`SELECT full_name AS "fullName" FROM users WHERE username = 'test_user_titlecase'`;
    expect(rows.length).toBe(1);
    expect(rows[0].fullName).toBe('Budi Santoso Wijaya');
  });

  test('acceptance: username is case-insensitively unique', async () => {
    const req1 = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        fullName: 'User CI 1',
        username: 'test_user_ci',
        password: 'password_super_aman_123',
      }),
    });
    const res1 = await handleRequest(req1, { sql });
    expect(res1.status).toBe(201);

    const req2 = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        fullName: 'User CI 2',
        username: 'TEST_USER_CI',
        password: 'password_super_aman_123',
      }),
    });
    const res2 = await handleRequest(req2, { sql });
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error.code).toBe('CONFLICT');
    expect(body2.error.details.username).toBe('Username sudah digunakan.');
  });

  test('acceptance: request cannot specify role (always default to User)', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        fullName: 'Role Hacker',
        username: 'test_user_role_hack',
        password: 'password_super_aman_123',
        role: 'Super Admin',
      }),
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.role).toBe('User');

    const rows = await sql`SELECT role FROM users WHERE username = 'test_user_role_hack'`;
    expect(rows[0].role).toBe('User');
  });

  test('acceptance: password hash is never leaked in response', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        fullName: 'No Hash Leak',
        username: 'test_user_no_hash',
        password: 'password_super_aman_123',
      }),
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.password).toBeUndefined();
    expect(body.user.password_hash).toBeUndefined();
    expect(body.user.passwordHash).toBeUndefined();
  });

  test('verification: concurrent registrations with same username only one succeeds', async () => {
    const promises = Array.from({ length: 5 }).map((_) => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({
          fullName: 'Concurrent User',
          username: 'test_user_concurrent',
          password: 'password_super_aman_123',
        }),
      });
      return handleRequest(req, { sql });
    });

    const responses = await Promise.all(promises);
    const statuses = responses.map((r) => r.status);
    const successCount = statuses.filter((s) => s === 201).length;
    const conflictCount = statuses.filter((s) => s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);
  });
});
