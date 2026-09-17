import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../src/server/app';
import { hashPassword } from '../src/server/auth';
import type { SQL } from 'bun';

function createMockSql(impl: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    return impl(strings.join('?'), ...values);
  }) as unknown as SQL;
  return sqlMock;
}

describe('Auth Endpoints (Login, Me, Logout)', () => {
  test('POST /api/auth/login with valid credentials returns 200 and Set-Cookie', async () => {
    const validPass = 'password_super_aman_123';
    const passHash = await hashPassword(validPass);

    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) {
        return [{
          id: 1,
          nik: '00123',
          username: 'johndoe',
          passwordHash: passHash,
          role: 'User',
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
        }];
      }
      if (query.includes('INSERT INTO sessions')) {
        return [];
      }
      return [];
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'johndoe', password: validPass }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('johndoe');
    expect(res.headers.get('Set-Cookie')).toContain('session_id=');
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');
  });

  test('POST /api/auth/login with wrong password returns 401', async () => {
    const validPass = 'password_super_aman_123';
    const passHash = await hashPassword(validPass);

    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) {
        return [{
          id: 1,
          nik: '00123',
          username: 'johndoe',
          passwordHash: passHash,
          role: 'User',
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'johndoe', password: 'wrongPassword123' }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns current user when valid cookie is passed', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM sessions')) {
        return [{
          id: '1',
          nik: '00123',
          username: 'johndoe',
          role: 'User',
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: { Cookie: 'session_id=dummy_token_123' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe('johndoe');
  });

  test('POST /api/auth/logout clears session cookie', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: 'session_id=dummy_token_123', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
