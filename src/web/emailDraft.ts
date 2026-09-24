import type { Ticket } from '../server/tickets';

export interface EmailDraft {
  subject: string;
  body: string;
}

/** Pre-fills the email from the ticket so the agent edits instead of writing from scratch. */
export function buildEmailDraft(ticket: Ticket, options: { agentName?: string } = {}): EmailDraft {
  const subject = `[${ticket.ticketNumber}] ${ticket.title}`;
  const lines = [
    'Halo,',
    '',
    `Berikut tindak lanjut untuk tiket ${ticket.ticketNumber} dengan judul "${ticket.title}".`,
    '',
    'Ringkasan masalah:',
    ticket.description?.trim() || '-',
  ];

  const solution = ticket.resolution?.solution?.trim();
  if (solution) lines.push('', 'Penanganan yang dilakukan:', solution);

  const closing = ticket.status === 'Closed'
    ? 'Tiket ini sudah kami tutup. Silakan hubungi kami kembali bila kendala masih berlanjut.'
    : `Tiket ini masih berstatus "${ticket.status}". Kami akan mengabari perkembangannya.`;
  lines.push('', closing, '', options.agentName?.trim() || 'Tim IT');
  return { subject, body: lines.join('\n') };
}