export interface TelegramConfig {
  token: string;
  chatIds: string[];
  /** Forum group topic (message thread) to post into; omit for non-forum chats. */
  threadId?: number;
}

export interface NewTicketNotification {
  ticketNumber: string;
  title: string;
  description: string;
  priority: string;
  creatorFullName: string;
  creatorUsername: string;
  createdAt: string;
}

export interface TicketClosedNotification {
  ticketNumber: string;
  title: string;
  priority: string;
  solution: string;
  resolverFullName: string;
  resolverUsername: string;
  closedAt: string;
}

export interface TicketReplyNotification {
  ticketNumber: string;
  title: string;
  messageText: string;
  senderFullName: string;
  senderUsername: string;
  senderRole: string;
  createdAt: string;
}

export interface TelegramNotifier {
  notifyNewTicket(ticket: NewTicketNotification): Promise<void>;
  notifyTicketClosed(ticket: TicketClosedNotification): Promise<void>;
  notifyTicketReply(reply: TicketReplyNotification): Promise<void>;
  /** Waits for in-flight notifications to finish. Call on shutdown. */
  close(): Promise<void>;
}

const PRIORITY_ICONS: Record<string, string> = {
  Critical: '🔴',
  High: '🟠',
  Medium: '🟡',
  Low: '🟢',
};

const TELEGRAM_API = 'https://api.telegram.org';
const MAX_ATTEMPTS = 3;
const FIELD_LIMIT = 300;

export function readTelegramConfig(env: Record<string, string | undefined>): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const chatIdRaw = env.TELEGRAM_CHAT_ID?.trim() ?? '';
  if (!token && !chatIdRaw) return null;

  if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) {
    throw new Error('TELEGRAM_BOT_TOKEN tidak valid (format: <bot_id>:<secret>).');
  }
  const chatIds = chatIdRaw.split(',').map((id) => id.trim()).filter(Boolean);
  if (chatIds.length === 0) {
    throw new Error('TELEGRAM_CHAT_ID wajib diisi bila TELEGRAM_BOT_TOKEN diset.');
  }
  for (const chatId of chatIds) {
    if (!/^-?\d{5,}$/.test(chatId) && !/^@[A-Za-z0-9_]{5,}$/.test(chatId)) {
      throw new Error(`TELEGRAM_CHAT_ID "${chatId}" tidak valid (gunakan numeric chat id atau @channelusername).`);
    }
  }

  // Topic (message thread) of a forum group. Find it via "Copy Link" on the topic:
  // https://t.me/c/<internal_chat_id>/<thread_id> - the last number is the thread id.
  const threadIdRaw = env.TELEGRAM_THREAD_ID?.trim() ?? '';
  if (threadIdRaw && !/^[1-9]\d*$/.test(threadIdRaw)) {
    throw new Error('TELEGRAM_THREAD_ID harus berupa bilangan bulat positif (id topic di grup forum).');
  }

  return { token, chatIds, threadId: threadIdRaw ? Number(threadIdRaw) : undefined };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] as string));
}

export function truncate(value: string, max: number): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function icon(priority: string): string {
  return PRIORITY_ICONS[priority] ?? '⚪';
}

function localTime(iso: string): string {
  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
  return `${formatted} WIB`;
}

/**
 * One notification body: bold headline, a blank line, then one emoji field per line.
 * Telegram renders bare URLs as plain text, so the ticket link is always an anchor; emoji,
 * bold and escaping are applied here so user text can never break the markup.
 */
function message(headline: string, fields: Array<[string, string]>, ticketNumber: string, appUrl: string): string {
  const rows = fields.map(([key, value]) => {
    const max = key === '🕒' || key === '🏷️' ? 64 : FIELD_LIMIT;
    const text = escapeHtml(truncate(key === '🕒' ? localTime(value) : value, max));
    return key === '📌' ? `${key} <b>${text}</b>` : `${key} ${text}`;
  });
  const link = appUrl ? `${appUrl.replace(/\/+$/, '')}/tickets/${encodeURIComponent(ticketNumber)}` : '';
  if (link) rows.push(`🔗 <a href="${escapeHtml(link)}">Buka tiket ${escapeHtml(ticketNumber)}</a>`);
  return `${headline}\n\n${rows.join('\n')}`;
}

export function formatNewTicketMessage(ticket: NewTicketNotification, appUrl = ''): string {
  const fields: Array<[string, string]> = [
    ['🔖', ticket.ticketNumber],
    ['📌', ticket.title],
    ['👤', `${ticket.creatorFullName} (@${ticket.creatorUsername})`],
    ['🏷️', ticket.priority],
    ['🕒', ticket.createdAt],
  ];
  if (ticket.description.trim()) fields.push(['📝', ticket.description]);
  return message(
    `${icon(ticket.priority)} <b>TIKET BARU — ${ticket.priority.toUpperCase()}</b>`,
    fields,
    ticket.ticketNumber,
    appUrl,
  );
}

export function formatTicketClosedMessage(ticket: TicketClosedNotification, appUrl = ''): string {
  const fields: Array<[string, string]> = [
    ['🔖', ticket.ticketNumber],
    ['📌', ticket.title],
    ['🏷️', ticket.priority],
    ['✅', `Ditutup oleh ${ticket.resolverFullName} (@${ticket.resolverUsername})`],
    ['🕒', ticket.closedAt],
  ];
  if (ticket.solution.trim()) fields.push(['🛠️', ticket.solution]);
  return message('✅ <b>TIKET SELESAI / DITUTUP</b>', fields, ticket.ticketNumber, appUrl);
}

export function formatTicketReplyMessage(reply: TicketReplyNotification, appUrl = ''): string {
  const fromStaff = reply.senderRole === 'IT Staff' || reply.senderRole === 'Super Admin';
  const fields: Array<[string, string]> = [
    ['🔖', reply.ticketNumber],
    ['📌', reply.title],
    ['👤', `${reply.senderFullName} (@${reply.senderUsername}) · ${reply.senderRole}`],
    ['🕒', reply.createdAt],
  ];
  if (reply.messageText.trim()) fields.push(['💬', reply.messageText]);
  return message(
    `💬 <b>BALASAN BARU — ${fromStaff ? 'DARI TIM IT' : 'DARI PELAPOR'}</b>`,
    fields,
    reply.ticketNumber,
    appUrl,
  );
}

/**
 * Fire-and-forget Telegram notifier. Notifications are serialized and retried up to
 * 3 times on network/5xx/429; a permanently failed notification is logged and dropped.
 * ponytail: no durable queue, in-memory chain only — a crash mid-flight can lose one
 * notification. Swap in an outbox table if delivery must be guaranteed.
 */
export function createTelegramNotifier(
  config: TelegramConfig,
  options: { appUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): TelegramNotifier {
  const appUrl = options.appUrl ?? '';
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();

  async function send(chatId: string, text: string): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await doFetch(`${TELEGRAM_API}/bot${config.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            ...(config.threadId ? { message_thread_id: config.threadId } : {}),
            text,
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) return;
        const detail = (await response.text().catch(() => '')).slice(0, 200);
        console.error(`Telegram notify failed (chat ${chatId}, HTTP ${response.status}): ${detail}`);
        if (response.status < 500 && response.status !== 429) return; // 4xx will not heal by retrying
      } catch (err) {
        console.error('Telegram notify error:', err instanceof Error ? err.name : 'UnknownError');
      }
      if (attempt < MAX_ATTEMPTS) await Bun.sleep(250 * 2 ** (attempt - 1));
    }
  }

  return {
    notifyNewTicket: (ticket) => enqueue(formatNewTicketMessage(ticket, appUrl)),
    notifyTicketClosed: (ticket) => enqueue(formatTicketClosedMessage(ticket, appUrl)),
    notifyTicketReply: (reply) => enqueue(formatTicketReplyMessage(reply, appUrl)),
    async close() {
      closed = true;
      await chain;
    },
  };

  function enqueue(text: string): Promise<void> {
    if (closed) return Promise.resolve();
    const run = chain.then(async () => {
      await Promise.all(config.chatIds.map((chatId) => send(chatId, text)));
    });
    chain = run.catch(() => {});
    return run;
  }
}