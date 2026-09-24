import { expect, test } from 'bun:test';
import { readConfig, handleRequest } from '../src/server/app';
import type { SQL } from 'bun';

const databaseUrl = 'postgresql://test:unused@127.0.0.1:5432/service_desk_test';

function createMockSql(impl?: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    if (impl) return impl(strings.join('?'), ...values);
    return [];
  }) as unknown as SQL;
  return sqlMock;
}

test('configuration requires a complete PostgreSQL URL without leaking secrets', () => {
  expect(readConfig({ DATABASE_URL: databaseUrl })).toEqual({ databaseUrl, port: 3000, telegram: null, mailer: null, appUrl: '' });
  for (const value of [undefined, '', 'not-a-url', 'sqlite://local.db', 'postgres://localhost/']) {
    expect(() => readConfig({ DATABASE_URL: value })).toThrow('DATABASE_URL');
  }
  expect(() => readConfig({ DATABASE_URL: 'https://user:secret@example.com/db' }))
    .toThrow('DATABASE_URL harus berupa URL PostgreSQL lengkap.');
});

test('configuration rejects invalid ports rather than silently choosing another', () => {
  expect(readConfig({ DATABASE_URL: databaseUrl, PORT: '3100' }).port).toBe(3100);
  for (const port of ['0', '65536', '-1', '3.5', 'abc', '', '3000junk']) {
    expect(() => readConfig({ DATABASE_URL: databaseUrl, PORT: port })).toThrow('PORT');
  }
});

test('health checks the database and returns a non-cacheable JSON response', async () => {
  const mockSql = createMockSql(async () => [1]);
  const response = await handleRequest(new Request('http://localhost/api/health'), { sql: mockSql });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', database: 'connected' });
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
});

test('database failure returns 503 without exposing credentials or error internals', async () => {
  const mockSql = createMockSql(async () => {
    throw new Error('postgresql://private:secret@internal/database');
  });
  const response = await handleRequest(new Request('http://localhost/api/health'), { sql: mockSql });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Layanan sementara tidak tersedia.' },
  });
});

test('unknown routes and unsupported methods do not query the database', async () => {
  let queried = false;
  const mockSql = createMockSql(async () => { queried = true; return []; });
  const missing = await handleRequest(new Request('http://localhost/api/missing'), { sql: mockSql });
  expect(missing.status).toBe(404);
  const wrongMethod = await handleRequest(
    new Request('http://localhost/api/health', { method: 'POST', headers: { 'X-Requested-With': 'fetch' } }), { sql: mockSql },
  );
  expect(wrongMethod.status).toBe(405);
  expect(wrongMethod.headers.get('Allow')).toBe('GET');
  expect(queried).toBe(false);
});
