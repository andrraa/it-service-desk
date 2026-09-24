// Smoke test manual: bun run scripts/telegram-smoke.ts <botToken> <chatId>
import { createTelegramNotifier } from '../src/server/telegram';
const [token, chatId] = process.argv.slice(2);
if (!token || !chatId) { console.error('usage: bun run scripts/telegram-smoke.ts <botToken> <chatId>'); process.exit(1); }
const notifier = createTelegramNotifier({ token, chatIds: [chatId] }, { appUrl: 'http://localhost:3000' });
await notifier.notifyNewTicket({
  ticketNumber: 'TKT-000999', title: 'Uji coba notifikasi',
  description: 'Pesan ini dikirim oleh smoke test integrasi Telegram.',
  priority: 'High', creatorFullName: 'Uji Coba', creatorUsername: 'qa', createdAt: new Date().toISOString(),
});
await notifier.close();
console.log('selesai — cek chat Telegram Anda');
