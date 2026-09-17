import { expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { handleRequest, MAX_REQUEST_BODY_SIZE } from '../src/server/app';
import { MemoryRateLimiter } from '../src/server/rate-limit';
import { validateAttachment } from '../src/server/attachments';

const user = { id: '1', nik: '001', username: 'test', role: 'User', isActive: true, mustChangePassword: false };
const headers = { Cookie: 'session_id=test', 'X-Requested-With': 'fetch' };
const noDb = (async () => { throw new Error('Database must not be queried'); }) as unknown as SQL;

test('attachment GET reaches list route and still enforces ticket ownership', async () => {
  let owner = '1';
  const sql = (async (parts: TemplateStringsArray) => {
    const query = parts.join('?');
    if (query.includes('FROM sessions')) return [user];
    if (query.includes('FROM tickets')) return [{ id: '2', creatorId: owner }];
    if (query.includes('FROM attachments')) return [{ id: '3', originalName: 'test.png' }];
    throw new Error(query);
  }) as unknown as SQL;
  const request = () => new Request('http://localhost/api/tickets/2/attachments', { headers });
  const ok = await handleRequest(request(), { sql });
  expect(ok.status).toBe(200);
  expect((await ok.json()).attachments[0].originalName).toBe('test.png');
  owner = '999';
  expect((await handleRequest(request(), { sql })).status).toBe(403);
});

test('malformed cookies and database failures return bounded JSON responses', async () => {
  const invalid = await handleRequest(new Request('http://localhost/api/auth/me', { headers: { Cookie: 'session_id=%' } }), { sql: noDb });
  expect(invalid.status).toBe(401);
  const failure = await handleRequest(new Request('http://localhost/api/tickets', { headers }), { sql: noDb });
  expect(failure.status).toBe(500);
  expect(await failure.text()).not.toContain('Database must not');
});

test('login and registration limits use trusted context, not forwarded headers', async () => {
  for (const route of ['login', 'register']) {
    const limiter = new MemoryRateLimiter(1, 60000);
    const request = (forwarded: string) => new Request(`http://localhost/api/auth/${route}`, {
      method: 'POST', headers: { ...headers, 'X-Forwarded-For': forwarded }, body: '{}',
    });
    expect((await handleRequest(request('one'), { sql: noDb, rateLimiter: limiter, clientAddress: 'socket' })).status).toBe(422);
    expect((await handleRequest(request('two'), { sql: noDb, rateLimiter: limiter, clientAddress: 'socket' })).status).toBe(429);
    expect((await handleRequest(request('two'), { sql: noDb, rateLimiter: limiter, clientAddress: 'other-socket' })).status).toBe(422);
  }
});

test('extension, declared type, detected type, and file size must agree', () => {
  expect(validateAttachment(new File(['data'], 'x.exe', { type: 'image/png' }), 'image/png')).not.toBeNull();
  expect(validateAttachment(new File(['data'], 'x.png', { type: 'application/pdf' }), 'application/pdf')).not.toBeNull();
  expect(validateAttachment(new File(['data'], 'x.png'), 'application/pdf')).not.toBeNull();
  expect(validateAttachment(new File([], 'x.png'))).not.toBeNull();
  expect(validateAttachment(new File(['data'], 'x.png', { type: 'image/png' }), 'image/png')).toBeNull();
});

test('HTTP accepts upload-sized bodies while JSON retains the 64 KiB boundary', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
    fetch: request => handleRequest(request, { sql: noDb }),
  });
  try {
    const form = new FormData();
    form.append('files', new File([new Uint8Array(1024 * 1024)], 'x.png', { type: 'image/png' }));
    const upload = await fetch(new URL('/api/tickets/1/attachments', server.url), { method: 'POST', headers: { 'X-Requested-With': 'fetch' }, body: form });
    expect(upload.status).toBe(401); // Reaches auth, not rejected by the old transport cap.
    const json = await fetch(new URL('/api/auth/register', server.url), { method: 'POST', headers, body: 'x'.repeat(65537) });
    expect(json.status).toBe(413);
  } finally { await server.stop(true); }
});
