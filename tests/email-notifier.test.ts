import { describe, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { sendWelcomeEmail, sendNewTicketEmail, sendTicketReplyEmail } from '../src/server/email-notifier';
import type { Mailer, OutboundEmail } from '../src/server/mailer';

const appUrl = 'http://helpdesk.perusahaan.co.id';

function collector() {
  const sent: OutboundEmail[] = [];
  const mailer: Mailer = { send: async (email) => { sent.push(email); }, close: async () => {} };
  const staff = (emails: string[]) => (async () => emails.map((email) => ({ email }))) as unknown as SQL;
  return { sent, mailer, staff };
}

describe('notification emails', () => {
  test('welcome mail names the account and links to login', async () => {
    const { sent, mailer } = collector();
    sendWelcomeEmail(mailer, { email: 'budi@perusahaan.com', fullName: 'Budi Santoso', username: 'budi' }, appUrl);
    await Bun.sleep(0);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'budi@perusahaan.com' });
    expect(sent[0]!.body).toContain('Budi Santoso');
    expect(sent[0]!.body).toContain(`${appUrl}/login`);
  });

  test('new ticket goes out once, bcc the other staff', async () => {
    const { sent, mailer, staff } = collector();
    await sendNewTicketEmail(staff(['a@perusahaan.com', 'b@perusahaan.com']), mailer, {
      ticketNumber: 'TKT-000042', title: 'Printer macet', description: 'Tidak bisa mencetak.', priority: 'High',
      creatorFullName: 'Budi Santoso', creatorUsername: 'budi', createdAt: new Date().toISOString(),
    }, appUrl);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'a@perusahaan.com', bcc: ['b@perusahaan.com'] });
    expect(sent[0]!.body).toContain(`${appUrl}/tickets/TKT-000042`);
  });

  test('the reporter is kept in the loop via bcc', async () => {
    const { sent, mailer, staff } = collector();
    await sendNewTicketEmail(staff(['it@perusahaan.com']), mailer, {
      ticketNumber: 'TKT-000042', title: 'Printer macet', description: 'Tidak bisa mencetak.', priority: 'High',
      creatorFullName: 'Budi Santoso', creatorUsername: 'budi', creatorEmail: 'budi@perusahaan.com', createdAt: new Date().toISOString(),
    }, appUrl);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'it@perusahaan.com', bcc: ['budi@perusahaan.com'] });
  });

  test('a staff member creating their own ticket is not listed twice', async () => {
    const { sent, mailer, staff } = collector();
    await sendNewTicketEmail(staff(['it@perusahaan.com', 'budi@perusahaan.com']), mailer, {
      ticketNumber: 'TKT-000042', title: 'Printer macet', description: 'Tidak bisa mencetak.', priority: 'High',
      creatorFullName: 'Budi', creatorUsername: 'budi', creatorEmail: 'budi@perusahaan.com', createdAt: new Date().toISOString(),
    }, appUrl);

    expect(sent[0]!.bcc).toEqual(['budi@perusahaan.com']);
    // Case-insensitive, because the same mailbox may be stored with different casing.
    expect(sent[0]!.to).not.toBe('budi@perusahaan.com');
  });

  test('a reporter without an address still notifies staff', async () => {
    const { sent, mailer, staff } = collector();
    await sendNewTicketEmail(staff(['it@perusahaan.com']), mailer, {
      ticketNumber: 'TKT-000042', title: 'Printer macet', description: 'Tidak bisa mencetak.', priority: 'High',
      creatorFullName: 'Budi', creatorUsername: 'budi', creatorEmail: null, createdAt: new Date().toISOString(),
    }, appUrl);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'it@perusahaan.com' });
    expect(sent[0]!.bcc).toBeUndefined();
  });

  test('reply mail reaches the counterparty, and is skipped without an address', () => {
    const { sent, mailer } = collector();
    const reply = { ticketNumber: 'TKT-000042', title: 'Printer macet', messageText: 'Toner habis.', senderFullName: 'Siti IT', senderRole: 'IT Staff' };

    sendTicketReplyEmail(mailer, 'budi@perusahaan.com', reply, appUrl);
    sendTicketReplyEmail(mailer, null, reply, appUrl);
    sendTicketReplyEmail(undefined, undefined, reply, appUrl);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toContain('Toner habis.');
  });
});