import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestDatabase, closeTestDatabase } from './database';
import { handleRequest } from '../src/server/app';

let sql: SQL;
let owner: string;
let staff: string;
let stranger: string;
let uploads: string;
let originalUploads: string | undefined;
const baseHeaders = { 'X-Requested-With': 'fetch' };

beforeAll(async () => {
  sql = await openTestDatabase();
  originalUploads = process.env.UPLOADS_DIR;
  uploads = await mkdtemp(join(tmpdir(), 'desk-audit-'));
  process.env.UPLOADS_DIR = uploads;
  const users = await sql`INSERT INTO users (nik, username, password_hash, role) VALUES
    ('001', 'owner', 'unused', 'User'), ('002', 'staff', 'unused', 'IT Staff'), ('003', 'stranger', 'unused', 'User') RETURNING id, username`;
  owner = String(users.find((u: any) => u.username === 'owner').id);
  staff = String(users.find((u: any) => u.username === 'staff').id);
  stranger = String(users.find((u: any) => u.username === 'stranger').id);
  for (const id of [owner, staff, stranger]) await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${`audit-${id}`}, ${id}, NOW() + INTERVAL '1 hour')`;
});

afterAll(async () => {
  await closeTestDatabase(sql);
  if (originalUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = originalUploads;
  if (uploads) await rm(uploads, { recursive: true, force: true });
});

function request(path: string, user = owner, method = 'GET', body?: unknown) {
  return new Request(`http://localhost/api${path}`, { method, headers: { ...baseHeaders, Cookie: `session_id=audit-${user}` },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) });
}
async function ticket(creator = owner) {
  const rows = await sql`INSERT INTO tickets (ticket_number, creator_id, assignee_id, title, description, priority, status)
    VALUES (${`AUD-${crypto.randomUUID().slice(0, 20)}`}, ${creator}, ${staff}, 'Audit ticket', 'Audit description', 'Medium', 'In Progress') RETURNING id`;
  return String(rows[0].id);
}
function form(messageId?: string) {
  const data = new FormData();
  data.append('files', new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'proof.png', { type: 'image/png' }));
  if (messageId) data.append('messageId', messageId);
  return data;
}

test('upload, attachment listing, and replay retain exactly one message and file', async () => {
  const id = await ticket();
  const data = form();
  data.append('messageText', '');
  data.append('uploadId', crypto.randomUUID());
  for (let i = 0; i < 2; i++) expect((await handleRequest(request(`/tickets/${id}/attachments`, owner, 'POST', data), { sql })).status).toBe(201);
  const listed = await handleRequest(request(`/tickets/${id}/attachments`), { sql });
  expect(listed.status).toBe(200);
  expect((await listed.json()).attachments).toHaveLength(1);
  const messages = await sql`SELECT * FROM messages WHERE ticket_id = ${id}`;
  expect(messages).toHaveLength(1);
  expect(messages[0].message_text).toBe('');
  expect((await handleRequest(request(`/tickets/${id}/attachments`, stranger), { sql })).status).toBe(403);
});

test('cross-ticket and cross-sender message attachment injection is rejected', async () => {
  const ownTicket = await ticket();
  const otherTicket = await ticket(stranger);
  for (const [ticketId, sender] of [[otherTicket, stranger], [ownTicket, staff]]) {
    const rows = await sql`INSERT INTO messages (ticket_id, sender_id, message_text) VALUES (${ticketId!}, ${sender!}, 'Existing message') RETURNING id`;
    const response = await handleRequest(request(`/tickets/${ownTicket}/attachments`, owner, 'POST', form(String(rows[0].id))), { sql });
    expect(response.status).toBe(403);
  }
});

test('second metadata insert failure rolls back message, rows, and staged files', async () => {
  const id = await ticket();
  const before = await readdir(uploads);
  await sql.unsafe(`CREATE FUNCTION reject_second_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.upload_index = 1 THEN RAISE EXCEPTION 'private database detail'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_second_file BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION reject_second_file();`);
  try {
    const data = form();
    data.append('messageText', 'This entire delivery must roll back');
    data.append('files', new File(['%PDF-1.4'], 'second.pdf', { type: 'application/pdf' }));
    const response = await handleRequest(request(`/tickets/${id}/attachments`, owner, 'POST', data), { sql });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private database detail');
    expect(await sql`SELECT id FROM attachments WHERE ticket_id = ${id}`).toHaveLength(0);
    expect(await sql`SELECT id FROM messages WHERE ticket_id = ${id}`).toHaveLength(0);
    expect((await readdir(uploads)).sort()).toEqual(before.sort());
  } finally { await sql.unsafe('DROP TRIGGER reject_second_file ON attachments; DROP FUNCTION reject_second_file()'); }
});

// Pause immediately before a writer obtains the row lock, then close via the real API.
function pauseBeforeLock(database: SQL, reached: () => void, release: Promise<void>): SQL {
  return new Proxy(database, {
    apply(target, _thisArg, args) {
      if (Array.isArray(args[0]) && args[0].join('').includes('FOR UPDATE')) {
        reached();
        return release.then(() => Reflect.apply(target, target, args));
      }
      return Reflect.apply(target, target, args);
    },
    get(target, property) {
      if (property === 'begin') return (callback: (tx: SQL) => unknown) => target.begin(tx => callback(pauseBeforeLock(tx, reached, release)));
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('close wins before locked message/upload/priority writes; late writes are rejected', async () => {
  for (const kind of ['messages', 'attachments', 'priority']) {
    const id = await ticket();
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const database = pauseBeforeLock(sql, () => reached.resolve(), release.promise);
    const body = kind === 'attachments' ? form() : kind === 'messages' ? { messageText: 'Late message' } : { priority: 'Critical', reason: 'Late priority update' };
    const pending = handleRequest(request(`/tickets/${id}/${kind}`, kind === 'priority' ? staff : owner, kind === 'priority' ? 'PATCH' : 'POST', body), { sql: database });
    try {
      await reached.promise;
      const closed = await handleRequest(request(`/tickets/${id}/close`, staff, 'POST', { solution: 'The issue has been resolved.' }), { sql });
      expect(closed.status).toBe(200);
    } finally { release.resolve(); }
    expect((await pending).status).toBe(403);
    expect(await sql`SELECT id FROM messages WHERE ticket_id = ${id}`).toHaveLength(0);
    expect(await sql`SELECT id FROM attachments WHERE ticket_id = ${id}`).toHaveLength(0);
    expect((await sql`SELECT priority FROM tickets WHERE id = ${id}`)[0].priority).toBe('Medium');
  }
});

test('audit failure rolls back claim and priority updates', async () => {
  const id = await ticket();
  await sql`UPDATE tickets SET status = 'Open', assignee_id = NULL WHERE id = ${id}`;
  await sql.unsafe(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
    CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit();`);
  try {
    expect((await handleRequest(request(`/tickets/${id}/claim`, staff, 'POST'), { sql })).status).toBe(500);
    expect((await sql`SELECT status FROM tickets WHERE id = ${id}`)[0].status).toBe('Open');
    expect((await handleRequest(request(`/tickets/${id}/priority`, staff, 'PATCH', { priority: 'Critical', reason: 'Important adjustment' }), { sql })).status).toBe(500);
    expect((await sql`SELECT priority FROM tickets WHERE id = ${id}`)[0].priority).toBe('Medium');
  } finally { await sql.unsafe('DROP TRIGGER reject_audit ON audit_logs; DROP FUNCTION reject_audit()'); }
});

test('message pages, incremental updates, and history are scoped and bounded', async () => {
  const id = await ticket();
  await sql`INSERT INTO messages (ticket_id, sender_id, message_text) SELECT ${id}, ${owner}, 'Message ' || n FROM generate_series(1, 65) n`;
  const latest = await (await handleRequest(request(`/tickets/${id}/messages`), { sql })).json();
  expect(latest.messages).toHaveLength(50);
  expect(latest.pagination.hasMore).toBe(true);
  const older = await (await handleRequest(request(`/tickets/${id}/messages?before=${latest.pagination.before}`), { sql })).json();
  expect(older.messages).toHaveLength(15);
  expect(older.pagination.hasMore).toBe(false);
  const incremental = await (await handleRequest(request(`/tickets/${id}/messages?after=${older.messages.at(-1).id}`), { sql })).json();
  expect(incremental.messages.map((m: any) => m.id)).toEqual(latest.messages.map((m: any) => m.id));
  expect((await handleRequest(request(`/tickets/${id}/history`, stranger), { sql })).status).toBe(403);
});

test('replaying a create request does not create duplicate tickets or text messages', async () => {
  const requestId = crypto.randomUUID();
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const response = await handleRequest(request('/tickets', owner, 'POST', { title: 'Replay ticket', description: 'Replay safely after response loss', priority: 'Low', requestId }), { sql });
    expect(response.status).toBe(201);
    ids.push((await response.json()).ticket.id);
  }
  expect(ids[0]).toBe(ids[1]);
  const key = crypto.randomUUID();
  for (let i = 0; i < 2; i++) expect((await handleRequest(request(`/tickets/${ids[0]}/messages`, owner, 'POST', { messageText: 'Same message', requestId: key }), { sql })).status).toBe(201);
  expect(await sql`SELECT id FROM messages WHERE ticket_id = ${ids[0]}`).toHaveLength(1);
});
