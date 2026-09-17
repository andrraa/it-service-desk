import { describe, expect, test } from 'bun:test';
import { bootstrapAdmin } from '../scripts/bootstrap-admin';
import type { SQL } from 'bun';

function createMockSql(impl: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    return impl(strings.join('?'), ...values);
  }) as unknown as SQL;
  return sqlMock;
}

describe('Super Admin Bootstrap Script', () => {
  test('rejects bootstrap when required env variables are missing', async () => {
    const mockSql = createMockSql(() => []);
    expect(bootstrapAdmin({}, mockSql)).rejects.toThrow('ADMIN_NIK, ADMIN_USERNAME, dan ADMIN_PASSWORD wajib');
  });

  test('rejects password shorter than 12 characters', async () => {
    const mockSql = createMockSql(() => []);
    expect(bootstrapAdmin({
      ADMIN_NIK: '00001',
      ADMIN_USERNAME: 'superadmin',
      ADMIN_PASSWORD: 'short',
    }, mockSql)).rejects.toThrow('minimal 12 karakter');
  });

  test('creates new Super Admin when none exists', async () => {
    const mockSql = createMockSql((query, ...values) => {
      if (query.includes('FROM users')) {
        return [];
      }
      if (query.includes('INSERT INTO users')) {
        return [{
          id: 1,
          nik: values[0],
          username: values[1],
          role: 'Super Admin',
        }];
      }
      return [];
    });

    const res = await bootstrapAdmin({
      ADMIN_NIK: '00001',
      ADMIN_USERNAME: 'superadmin',
      ADMIN_PASSWORD: 'super_secure_admin_password_123',
    }, mockSql);

    expect(res.created).toBe(true);
    expect(res.user?.role).toBe('Super Admin');
    expect(res.user?.username).toBe('superadmin');
    expect(res.user?.nik).toBe('00001');
  });

  test('is idempotent when Super Admin already exists', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM users')) {
        return [{
          id: 1,
          nik: '00001',
          username: 'superadmin',
          role: 'Super Admin',
        }];
      }
      return [];
    });

    const res = await bootstrapAdmin({
      ADMIN_NIK: '00001',
      ADMIN_USERNAME: 'superadmin',
      ADMIN_PASSWORD: 'super_secure_admin_password_123',
    }, mockSql);

    expect(res.created).toBe(false);
    expect(res.message).toContain('sudah ada');
  });
});
