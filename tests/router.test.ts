import { expect, test } from 'bun:test';
import { parseRoute, getDefaultPathForRole } from '../src/web/router';

test('parseRoute maps known paths correctly', () => {
  expect(parseRoute('/login')).toEqual({ view: 'login' });
  expect(parseRoute('/login/')).toEqual({ view: 'login' });
  expect(parseRoute('/register')).toEqual({ view: 'register' });
  expect(parseRoute('/tickets')).toEqual({ view: 'tickets' });
  expect(parseRoute('/tickets/new')).toEqual({ view: 'tickets-new' });
  expect(parseRoute('/tickets/TKT-000001')).toEqual({ view: 'ticket-detail', ticketNumber: 'TKT-000001' });
  expect(parseRoute('/tickets/123')).toEqual({ view: 'ticket-detail', ticketNumber: '123' });
  expect(parseRoute('/it/queue')).toEqual({ view: 'it-queue' });
  expect(parseRoute('/it/queue/')).toEqual({ view: 'it-queue' });
  expect(parseRoute('/')).toEqual({ view: 'unknown', path: '/' });
  expect(parseRoute('/unknown-path')).toEqual({ view: 'unknown', path: '/unknown-path' });
});

test('getDefaultPathForRole directs roles to correct starting paths', () => {
  expect(getDefaultPathForRole('User')).toBe('/tickets');
  expect(getDefaultPathForRole(undefined)).toBe('/tickets');
  expect(getDefaultPathForRole('IT Staff')).toBe('/it/queue');
  expect(getDefaultPathForRole('Super Admin')).toBe('/it/queue');
});
