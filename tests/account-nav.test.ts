import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// The account page holds the self-service email form. A nav link that only renders while
// mustChangePassword is true made it unreachable for every normal account, so pin the shape.
const app = readFileSync(new URL('../src/web/App.svelte', import.meta.url), 'utf8');
const nav = app.slice(app.indexOf('<nav class="sidebar-nav"'), app.indexOf('</nav>'));

test('the account settings link is outside the mustChangePassword branch', () => {
  const firstOpen = nav.indexOf('{#if currentUser.mustChangePassword}');
  const firstElse = nav.indexOf('{:else}', firstOpen);
  const close = nav.indexOf('{/if}', firstElse);

  expect(firstOpen).toBeGreaterThan(-1);
  expect(firstElse).toBeGreaterThan(firstOpen);
  expect(close).toBeGreaterThan(firstElse);

  // Everything after the guard's closing {/if} is visible to logged-in users.
  const alwaysVisible = nav.slice(close);
  expect(alwaysVisible).toContain('href="/password"');
  expect(alwaysVisible).toContain('Pengaturan Akun');
});

test('the account page still reaches the password changer and the email form', () => {
  const page = readFileSync(new URL('../src/web/Password.svelte', import.meta.url), 'utf8');
  expect(page).toContain('handleSaveEmail');
  expect(page).toContain("fetch('/api/auth/email'");
  expect(page).toContain('handleSubmit');
  expect(page).toContain("fetch('/api/auth/change-password'");
});