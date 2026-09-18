import { describe, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { handleRequest } from '../src/server/app';

function mockSql(): SQL {
  return (async (strings: TemplateStringsArray) => {
    const query = strings.join('?');
    if (query.includes('FROM sessions')) return [{ id: '1', username: 'staff', fullName: 'Staff IT', role: 'IT Staff', isActive: true, mustChangePassword: true, createdAt: new Date().toISOString() }];
    if (query.includes('password_hash')) return [{ id: '1', passwordHash: 'unused' }];
    return [];
  }) as unknown as SQL;
}

describe('Required password change', () => {
  test('allows restricted user to replace temporary password', async () => {
    const response = await handleRequest(new Request('http://localhost/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: 'session_id=valid' },
      body: JSON.stringify({ newPassword: 'PasswordBaru123!' }),
    }), { sql: mockSql() });

    expect(response.status).toBe(200);
  });
});
