import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../src/server/app';
import type { SQL } from 'bun';

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
    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  test('returns 422 when fields fail validation', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nik: '', fullName: '', username: '', password: '123' }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.nik).toBeDefined();
    expect(body.error.details.fullName).toBeDefined();
    expect(body.error.details.username).toBeDefined();
    expect(body.error.details.password).toBeDefined();
  });

  test('returns 409 when NIK or username already exists', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) {
        return [{ nik: '00123', username: 'existing_user' }];
      }
      return [];
    });
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        nik: '00123',
        fullName: 'Existing User',
        username: 'existing_user',
        password: 'password_super_panjang_123',
      }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });
    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.details.nik).toBe('NIK sudah terdaftar.');
    expect(body.error.details.username).toBe('Username sudah digunakan.');
  });

  test('creates new User with hashed password and returns 201', async () => {
    const mockSql = createMockSql((query, ...values) => {
      if (query.includes('FROM users')) {
        return []; // No existing user
      }
      if (query.includes('INSERT INTO users')) {
        return [{
          id: '1',
          nik: values[0],
          username: values[1],
          fullName: values[2],
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
        nik: '00.987.12',
        fullName: 'new employee',
        username: 'new_employee',
        password: 'password_super_panjang_123',
      }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe('Registrasi berhasil.');
    expect(body.user.nik).toBe('00.987.12');
    expect(body.user.username).toBe('new_employee');
    expect(body.user.fullName).toBe('New Employee');
    expect(body.user.role).toBe('User');
    expect(body.user.passwordHash).toBeUndefined();
  });
});
