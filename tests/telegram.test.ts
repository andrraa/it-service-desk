import { expect, test } from 'bun:test';
import { handleRequest, readConfig } from '../src/server/app';
import {
  createTelegramNotifier,
  escapeHtml,
  formatNewTicketMessage,
  readTelegramConfig,
  truncate,
  type NewTicketNotification,
} from '../src/server/telegram';
import type { SQL } from 'bun';

function createMockSql(impl: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    return impl(strings.join('?'), ...values);
  }) as unknown as SQL;
  return sqlMock;
}

const sessionRow = { id: '1', username: 'budi', fullName: 'Budi Santoso', role: 'User', isActive: true, mustChangePassword: false, createdAt: '2026-09-24T09:00:00.000Z' };

function ticketRow(isNew: boolean) {
  return [{
    id: '1', ticketNumber: 'TKT-000123', creatorId: '1', title: 'Printer rusak',
    description: 'Monitor menampilkan error offline', priority: 'Critical', status: 'Open',
    createdAt: '2026-09-24T09:42:00.000Z', updatedAt: '2026-09-24T09:42:00.000Z', isNew,
  }];
}

test('POST /api/tickets notifies the channel once, with creator identity and link', async () => {
  const sent: string[] = [];
  const sql = createMockSql((query) => {
    if (query.includes('FROM sessions')) return [sessionRow];
    if (query.includes('ticket_number_seq')) return [{ seq: 123 }];
    if (query.includes('INSERT INTO tickets')) return ticketRow(true);
    return [];
  });
  const request = () => new Request('http://localhost/api/tickets', {
    method: 'POST',
    body: JSON.stringify({ title: 'Printer rusak', description: 'Monitor menampilkan error offline', priority: 'Critical' }),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: 'session_id=token' },
  });
  const notifier = {
    notifyNewTicket: async (t: Parameters<typeof formatNewTicketMessage>[0]) => { sent.push(formatNewTicketMessage(t, 'https://desk.example')); },
    close: async () => {},
  };

  expect((await handleRequest(request(), { sql }, { notifier })).status).toBe(201);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toContain('🔴 <b>TIKET BARU — CRITICAL</b>');
  expect(sent[0]).toContain('Budi Santoso (@budi)');
  expect(sent[0]).toContain('<a href="https://desk.example/tickets/TKT-000123">');

  // Same requestId replayed => the row is reused (isNew = false), so no second notification.
  const replaySql = createMockSql((query) => {
    if (query.includes('FROM sessions')) return [sessionRow];
    if (query.includes('ticket_number_seq')) return [{ seq: 123 }];
    if (query.includes('INSERT INTO tickets')) return ticketRow(false);
    return [];
  });
  await handleRequest(request(), { sql: replaySql }, { notifier });
  expect(sent).toHaveLength(1);
});

test('POST /api/tickets still returns 201 without a notifier or when Telegram fails', async () => {
  const sql = createMockSql((query) => {
    if (query.includes('FROM sessions')) return [sessionRow];
    if (query.includes('ticket_number_seq')) return [{ seq: 124 }];
    if (query.includes('INSERT INTO tickets')) return ticketRow(true);
    return [];
  });
  const request = () => new Request('http://localhost/api/tickets', {
    method: 'POST',
    body: JSON.stringify({ title: 'Wifi mati total', description: 'Wifi ruang rapat mati total', priority: 'Low' }),
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: 'session_id=token' },
  });

  expect((await handleRequest(request(), { sql })).status).toBe(201);
  const failing = {
    notifyNewTicket: async () => { throw new Error('telegram down'); },
    close: async () => {},
  };
  expect((await handleRequest(request(), { sql }, { notifier: failing })).status).toBe(201);
});

const ticket: NewTicketNotification = {
  ticketNumber: 'TKT-000123',
  title: 'Printer <lantai 2> tidak bisa print',
  description: 'Monitor menampilkan error "offline" & lampu merah.',
  priority: 'Critical',
  creatorFullName: 'Budi & Santoso',
  creatorUsername: 'budi',
  createdAt: '2026-09-24T09:42:00.000Z',
};

test('config: telegram is optional and validated when present', () => {
  expect(readConfig({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db' }).telegram).toBeNull();
  expect(readTelegramConfig({})).toBeNull();
  expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: '-1001234567890' }))
    .toEqual({ token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatIds: ['-1001234567890'] });
  expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: '-1001234567890, -1009876543210' })?.chatIds)
    .toEqual(['-1001234567890', '-1009876543210']);

  expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: '-1001234567890', TELEGRAM_THREAD_ID: '45' })?.threadId).toBe(45);
  expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: '-1001234567890', TELEGRAM_THREAD_ID: ' 45 ' })?.threadId).toBe(45);
  for (const badThread of ['0', '-1', 'abc', '4.5'])
    expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: '-1001234567890', TELEGRAM_THREAD_ID: badThread }))
      .toThrow('TELEGRAM_THREAD_ID');

  expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: 'not-a-token', TELEGRAM_CHAT_ID: '-1001234567890' }))
    .toThrow('TELEGRAM_BOT_TOKEN');
  expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw' }))
    .toThrow('TELEGRAM_CHAT_ID');
  expect(() => readTelegramConfig({ TELEGRAM_BOT_TOKEN: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', TELEGRAM_CHAT_ID: 'abc' }))
    .toThrow('TELEGRAM_CHAT_ID');
});

test('format: escapes HTML, truncates long text, keeps ticket fields readable', () => {
  const message = formatNewTicketMessage(ticket, 'https://desk.example.com/');
  expect(message).toContain('🔴 <b>TIKET BARU — CRITICAL</b>');
  expect(message).toContain('\n\n'); // header block is separated from the detail block
  expect(message).toContain('📌 <b>Printer &lt;lantai 2&gt; tidak bisa print</b>');
  expect(message).toContain('👤 Budi &amp; Santoso (@budi)');
  // Telegram only renders links from anchors; a bare URL is shown as plain text.
  expect(message).toContain('🔗 <a href="https://desk.example.com/tickets/TKT-000123">Buka tiket TKT-000123</a>');
  expect(message).not.toContain('<lantai');
  expect(message.split('\n')).toHaveLength(9); // header + blank + seven detail lines

  expect(escapeHtml('a & b <c>')).toBe('a &amp; b &lt;c&gt;');
  expect(truncate('a'.repeat(200), 10)).toBe(`${'a'.repeat(9)}…`);
  expect(truncate('  spasi\n\tbanyak  ', 50)).toBe('spasi banyak');
});

test('notifier: one sendMessage per chat, HTML payload, no retry after 4xx', async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const notifier = createTelegramNotifier(
    { token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatIds: ['-1001234567890', '-1002'] },
    {
      fetchImpl: (async (url: string, init: any) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return new Response('{"ok":true}', { status: 200 });
      }) as unknown as typeof fetch,
    },
  );

  await notifier.notifyNewTicket(ticket);
  await notifier.close();

  expect(calls).toHaveLength(2);
  expect(calls[0]!.url).toBe('https://api.telegram.org/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/sendMessage');
  expect(calls[0]!.body).toMatchObject({ chat_id: '-1001234567890', parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  expect(calls[1]!.body.chat_id).toBe('-1002');

  // Topic of a forum group: Telegram needs message_thread_id on every send.
  const topicCalls: any[] = [];
  const topicNotifier = createTelegramNotifier(
    { token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatIds: ['-1001234567890'], threadId: 45 },
    { fetchImpl: (async (_url: string, init: any) => { topicCalls.push(JSON.parse(init.body)); return new Response('{"ok":true}', { status: 200 }); }) as unknown as typeof fetch },
  );
  await topicNotifier.notifyNewTicket(ticket);
  await topicNotifier.close();
  expect(topicCalls[0].message_thread_id).toBe(45);

  let attempts = 0;
  const rejected = createTelegramNotifier(
    { token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatIds: ['-1001234567890'] },
    { fetchImpl: (async () => { attempts++; return new Response('{"ok":false}', { status: 400 }); }) as unknown as typeof fetch },
  );
  await rejected.notifyNewTicket(ticket);
  expect(attempts).toBe(1);
});

test('notifier: retries transient failures then gives up without throwing', async () => {
  let attempts = 0;
  const notifier = createTelegramNotifier(
    { token: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatIds: ['-1001234567890'] },
    { fetchImpl: (async () => { attempts++; throw new Error('network down'); }) as unknown as typeof fetch },
  );

  const send = notifier.notifyNewTicket(ticket);
  await notifier.close();
  await expect(send).resolves.toBeUndefined();
  expect(attempts).toBe(3);
}, 10_000);