import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';

describe('Auth Registration Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;

  beforeAll(async () => {
    sql = await openTestDatabase();
    // Clean up test users
    await sql`DELETE FROM users WHERE username LIKE 'test_user_%' OR nik LIKE 'TEST_%'`;
  });

  afterAll(async () => {
    await sql`DELETE FROM users WHERE username LIKE 'test_user_%' OR nik LIKE 'TEST_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: preserves leading zero in NIK string', async () => {
    const nikWithLeadingZero = '000847291';
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        nik: nikWithLeadingZero,
        username: 'test_user_nik_zero',
        password: 'password_super_aman_123',
      }),
    });

    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.nik).toBe(nikWithLeadingZero);

    // Verify directly in DB that leading zeros are stored as string
    const rows = await sql`SELECT nik FROM users WHERE username = 'test_user_nik_zero'`;
    expect(rows.length).toBe(1);
    expect(rows[0].nik).toBe(nikWithLeadingZero);
  });

  test('acceptance: username is case-insensitively unique', async () => {
    // First registration: test_user_ci
    const req1 = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        nik: 'TEST_CI_1',
        username: 'test_user_ci',
        password: 'password_super_aman_123',
      }),
    });
    const res1 = await handleRequest(req1, { sql });
    expect(res1.status).toBe(201);

    // Duplicate registration with different casing: TEST_USER_CI
    const req2 = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        nik: 'TEST_CI_2',
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
        nik: 'TEST_ROLE_HACK',
        username: 'test_user_role_hack',
        password: 'password_super_aman_123',
        role: 'Super Admin', // Malicious attempt to escalate role
      }),
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.role).toBe('User');

    // Verify in DB
    const rows = await sql`SELECT role FROM users WHERE username = 'test_user_role_hack'`;
    expect(rows[0].role).toBe('User');
  });

  test('acceptance: password hash is never leaked in response', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({
        nik: 'TEST_NO_HASH_LEAK',
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
    const promises = Array.from({ length: 5 }).map((_, i) => {
      const req = new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: JSON.stringify({
          nik: `TEST_CONCURRENT_${i}`,
          username: 'test_user_concurrent',
          password: 'password_super_aman_123',
        }),
      });
      return handleRequest(req, { sql });
    });

    const responses = await Promise.all(promises);
    const statuses = responses.map(r => r.status);
    const successCount = statuses.filter(s => s === 201).length;
    const conflictCount = statuses.filter(s => s === 409).length;

    expect(successCount).toBe(1);
    expect(conflictCount).toBe(4);
  });
});
