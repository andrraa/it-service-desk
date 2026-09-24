// Smoke test manual: bun run scripts/telegram-smoke.ts <botToken> <chatId> [threadId] [new|reply]
// Link memakai APP_URL (default: web dev server lokal).
import { createTelegramNotifier } from '../src/server/telegram';

const [token, chatId, threadId, kind = 'new'] = process.argv.slice(2);
if (!token || !chatId || !['new', 'reply'].includes(kind)) {
  console.error('usage: bun run scripts/telegram-smoke.ts <botToken> <chatId> [threadId] [new|reply]');
  process.exit(1);
}

const notifier = createTelegramNotifier(
  { token, chatIds: [chatId], threadId: threadId ? Number(threadId) : undefined },
  { appUrl: process.env.APP_URL?.trim() || 'http://localhost:5173' },
);

const now = new Date().toISOString();
const base = { ticketNumber: 'TKT-000999', title: 'Uji coba notifikasi', priority: 'High' };
if (kind === 'new') {
  await notifier.notifyNewTicket({ ...base, description: 'Pesan ini dikirim oleh smoke test.', creatorFullName: 'Uji Coba', creatorUsername: 'qa', createdAt: now });
} else {
  await notifier.notifyTicketReply({ ...base, messageText: 'Sudah kami tangani, silakan dicoba lagi.', senderFullName: 'Uji Coba', senderUsername: 'qa', senderRole: 'IT Staff', createdAt: now });
}
await notifier.close();
console.log(`selesai — notifikasi "${kind}" terkirim, cek chat Telegram Anda`);
