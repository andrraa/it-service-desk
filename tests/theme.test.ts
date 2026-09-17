import { expect, test } from 'bun:test';
import { resolveTheme } from '../src/web/theme';

test('saved Light/Dark preference takes precedence over the system', () => {
  expect(resolveTheme('light', true)).toBe('light');
  expect(resolveTheme('dark', false)).toBe('dark');
});

test('missing or invalid preference follows the system theme', () => {
  for (const preference of [null, undefined, '', 'invalid']) {
    expect(resolveTheme(preference, true)).toBe('dark');
    expect(resolveTheme(preference, false)).toBe('light');
  }
});
