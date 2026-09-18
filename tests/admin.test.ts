import { describe, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { handleRequest } from '../src/server/app';

function createMockSql(impl: (query: string, ...values: unknown[]) => unknown): SQL {
  return (async (strings: TemplateStringsArray, ...values: unknown[]) => impl(strings.join('?'), ...values)) as unknown as SQL;
}

describe('Admin user pagination', () => {
  test('GET /api/admin/users paginates users in the database', async () => {
    const queries: string[] = [];
    const sql = createMockSql((query) => {
      queries.push(query);
      if (query.includes('FROM sessions')) {
        return [{ id: '1', username: 'superadmin', fullName: 'Super Admin', role: 'Super Admin', isActive: true, mustChangePassword: false }];
      }
      if (query.includes('COUNT(*)')) return [{ count: 23 }];
      if (query.includes('FROM users')) return [{ id: '2', username: 'staff', role: 'IT Staff' }];
      return [];
    });

    const response = await handleRequest(new Request('http://localhost/api/admin/users?page=2&limit=10', {
      headers: { Cookie: 'session_id=valid_token' },
    }), { sql });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(queries.some((query) => query.includes('LIMIT ? OFFSET ?'))).toBe(true);
    expect(body.pagination).toEqual({ page: 2, limit: 10, total: 23, totalPages: 3 });
  });

  test('GET /api/admin/users rejects unsupported filters', async () => {
    const sql = createMockSql((query) => query.includes('FROM sessions')
      ? [{ id: '1', username: 'superadmin', role: 'Super Admin', isActive: true, mustChangePassword: false }]
      : []);

    const response = await handleRequest(new Request('http://localhost/api/admin/users?role=Owner', {
      headers: { Cookie: 'session_id=valid_token' },
    }), { sql });

    expect(response.status).toBe(422);
  });
});
