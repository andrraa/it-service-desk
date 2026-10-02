import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../src/server/app';
import type { SQL } from 'bun';
import { MemoryRateLimiter } from '../src/server/rate-limit';

// Each request gets its own limiter so the shared default (5/min) never leaks between tests.
const freshLimiter = () => ({ rateLimiter: new MemoryRateLimiter(50, 60 * 1000) });

function createMockSql(impl: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    return impl(strings.join('?'), ...values);
  }) as unknown as SQL;
  return sqlMock;
}

describe('POST /api/auth/register', () => {
  test('returns 400 when body is not valid JSON', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: 'invalid-json',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  test('returns 422 when fields fail validation', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: '', username: '', email: '', password: '123' }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.fullName).toBeDefined();
    expect(body.error.details.username).toBeDefined();
    expect(body.error.details.email).toBeDefined();
    expect(body.error.details.password).toBeDefined();
  });

  test('rejects a malformed email at registration', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Budi Santoso', username: 'budi', email: 'budi@', password: 'password_super_panjang_123' }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.email).toBe('Format email tidak valid.');
  });

  test('returns 409 when username already exists', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) {
        return [{ username: 'existing_user', email: 'lain@perusahaan.com' }];
      }
      return [];
    });
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Existing User',
        username: 'existing_user',
        email: 'existing@perusahaan.com',
        password: 'password_super_panjang_123',
      }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details.username).toBe('Username sudah digunakan.');
  });

  test('returns 409 pointing at the email when the address is already used', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) return [{ username: 'orang_lain', email: 'budi@perusahaan.com' }];
      return [];
    });
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'Budi Santoso',
        username: 'budi',
        email: 'Budi@Perusahaan.com',
        password: 'password_super_panjang_123',
      }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.details.email).toBe('Email sudah digunakan.');
  });

  test('creates new User with hashed password and returns 201', async () => {
    const mockSql = createMockSql((query, ...values) => {
      if (query.includes('FROM users')) {
        return [];
      }
      if (query.includes('INSERT INTO users')) {
        return [{
          id: '1',
          username: values[0],
          fullName: values[1],
          role: 'User',
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName: 'new employee',
        username: 'new_employee',
        email: 'new_employee@perusahaan.com',
        password: 'password_super_panjang_123',
      }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql, ...freshLimiter() });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe('Registrasi berhasil.');
    expect(body.user.username).toBe('new_employee');
    expect(body.user.fullName).toBe('New Employee');
    expect(body.user.role).toBe('User');
    expect(body.user.passwordHash).toBeUndefined();
  });
});
