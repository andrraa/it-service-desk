import { expect, test } from 'bun:test';
import { testDatabaseUrl } from './database';

test('integration database guard refuses missing, application, and alias targets', () => {
  expect(() => testDatabaseUrl({})).toThrow();
  expect(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://localhost/service_desk' })).toThrow();
  expect(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://localhost/app_test', DATABASE_URL: 'postgres://alias/app_test' })).toThrow();
  expect(testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://localhost/service_desk_test' }).pathname).toBe('/service_desk_test');
});
