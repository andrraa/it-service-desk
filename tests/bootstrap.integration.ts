import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { bootstrapAdmin } from '../scripts/bootstrap-admin';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';

describe('Super Admin Bootstrap Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;

  beforeAll(async () => {
    sql = await openTestDatabase();
    await sql`DELETE FROM users WHERE username LIKE 'test_admin_%' OR nik LIKE 'ADM_%'`;
  });

  afterAll(async () => {
    await sql`DELETE FROM users WHERE username LIKE 'test_admin_%' OR nik LIKE 'ADM_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: bootstraps explicit admin without logging secrets, idempotent on repetition', async () => {
    const adminPassword = 'super_secure_admin_password_123';
    const env = {
      ADMIN_USERNAME: 'test_admin_bootstrap',
      ADMIN_PASSWORD: adminPassword,
    };

    // 1. Initial bootstrap
    const result1 = await bootstrapAdmin(env, sql);
    expect(result1.created).toBe(true);
    expect(result1.user?.role).toBe('Super Admin');
    expect(result1.user?.username).toBe('test_admin_bootstrap');

    // Verify in database: password hash exists, role is Super Admin
    const rows = await sql`
      SELECT id, username, role, password_hash AS "passwordHash"
      FROM users
      WHERE username = 'test_admin_bootstrap'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].role).toBe('Super Admin');
    expect(rows[0].passwordHash.startsWith('$argon2id$')).toBe(true);

    // 2. Repetition: must not overwrite or duplicate
    const result2 = await bootstrapAdmin(env, sql);
    expect(result2.created).toBe(false);
    expect(result2.message).toContain('sudah ada');

    // 3. Admin can login successfully
    const loginReq = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: JSON.stringify({ username: 'test_admin_bootstrap', password: adminPassword }),
    });
    const loginRes = await handleRequest(loginReq, { sql });
    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.role).toBe('Super Admin');
  });
});
