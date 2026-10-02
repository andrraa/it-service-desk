import type { SQL } from 'bun';
import type { Mailer } from './mailer';

/**
 * Notification emails. All three helpers are fire-and-forget: the caller uses `void ... .catch()`,
 * so a dead relay never fails a registration or a ticket action. Telegram stays the primary channel.
 * ponytail: no outbox/retry — a dropped email is gone. Add an outbox table if delivery must be guaranteed.
 */

const MAX_FIELD = 500;

function truncate(value: string, max = MAX_FIELD): string {
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function localTime(iso: string): string {
  return `${new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))} WIB`;
}

function ticketLink(ticketNumber: string, appUrl: string): string {
  return appUrl ? `${appUrl.replace(/\/+$/, '')}/tickets/${encodeURIComponent(ticketNumber)}` : '';
}

function send(mailer: Mailer | undefined, email: { to?: string; bcc?: string[]; subject: string; body: string }): void {
  if (!mailer) return;
  void mailer.send(email).catch((err) => console.error('Email notify error:', err instanceof Error ? err.name : 'UnknownError'));
}

/** Welcome mail after a successful registration. */
export function sendWelcomeEmail(mailer: Mailer | undefined, user: { email: string; fullName: string; username: string }, appUrl = ''): void {
  const login = appUrl ? `${appUrl.replace(/\/+$/, '')}/login` : '';
  const lines = [
    `Halo ${user.fullName},`,
    '',
    'Pendaftaran akun IT Service Desk Anda berhasil. Akun sudah aktif dan dapat langsung digunakan.',
    '',
    `Username: ${user.username}`,
  ];
  if (login) lines.push('', `Masuk di: ${login}`);
  lines.push('', 'Simpan email ini sebagai bukti pendaftaran.', '', 'Tim IT');
  send(mailer, { to: user.email, subject: 'Pendaftaran akun IT Service Desk berhasil', body: lines.join('\n') });
}

/** One mail per new ticket: staff notified, reporter kept in the loop via bcc. */
export async function sendNewTicketEmail(
  sql: SQL,
  mailer: Mailer | undefined,
  ticket: { ticketNumber: string; title: string; description: string; priority: string; creatorFullName: string; creatorUsername: string; creatorEmail?: string | null; createdAt: string },
  appUrl = '',
): Promise<void> {
  if (!mailer) return;
  const rows = await sql`
    SELECT email FROM users
    WHERE role IN ('IT Staff', 'Super Admin') AND is_active = TRUE AND email IS NOT NULL AND email <> ''
  `;

  // Reporter is added so they get a confirmation with the ticket link. Deduplicated
  // because a staff member may create a ticket themselves and would otherwise appear twice.
  const recipients: string[] = [];
  for (const email of [...rows.map((row: { email: string }) => String(row.email)), ticket.creatorEmail ?? '']) {
    const address = email.trim();
    if (address && !recipients.some((existing) => existing.toLowerCase() === address.toLowerCase())) {
      recipients.push(address);
    }
  }
  if (recipients.length === 0) return;

  const link = ticketLink(ticket.ticketNumber, appUrl);
  const lines = [
    `Tiket baru dengan prioritas ${ticket.priority} menunggu penanganan.`,
    '',
    `Nomor: ${ticket.ticketNumber}`,
    `Judul: ${ticket.title}`,
    `Pelapor: ${ticket.creatorFullName} (@${ticket.creatorUsername})`,
    `Dibuat: ${localTime(ticket.createdAt)}`,
    '',
    'Deskripsi:',
    truncate(ticket.description) || '-',
  ];
  if (link) lines.push('', `Buka tiket: ${link}`);
  lines.push('', 'Tim IT Service Desk');

  send(mailer, {
    to: recipients[0],
    bcc: recipients.length > 1 ? recipients.slice(1) : undefined,
    subject: `[${ticket.ticketNumber}] Tiket baru (${ticket.priority}): ${truncate(ticket.title, 120)}`,
    body: lines.join('\n'),
  });
}

/** Reply mail to the other party in the ticket conversation. */
export function sendTicketReplyEmail(
  mailer: Mailer | undefined,
  recipientEmail: string | null | undefined,
  reply: { ticketNumber: string; title: string; messageText: string; senderFullName: string; senderRole: string },
  appUrl = '',
): void {
  if (!mailer || !recipientEmail) return;
  const link = ticketLink(reply.ticketNumber, appUrl);
  const lines = [
    `${reply.senderFullName} (${reply.senderRole}) membalas tiket ${reply.ticketNumber}.`,
    '',
    `Judul: ${reply.title}`,
    '',
    'Isi balasan:',
    truncate(reply.messageText) || '(tanpa teks)',
  ];
  if (link) lines.push('', `Buka tiket: ${link}`);
  lines.push('', 'Tim IT Service Desk');

  send(mailer, { to: recipientEmail, subject: `[${reply.ticketNumber}] Balasan baru: ${truncate(reply.title, 120)}`, body: lines.join('\n') });
}
