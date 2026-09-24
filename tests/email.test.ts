import { describe, expect, test } from 'bun:test';
import { readMailerConfig, validateEmailInput, describeMailError, createMailer } from '../src/server/mailer';
import { buildEmailDraft } from '../src/web/emailDraft';
import type { Ticket } from '../src/server/tickets';

const baseEnv = { SMTP_HOST: 'relay.perusahaan.local', SMTP_FROM: 'helpdesk@perusahaan.com' };

describe('readMailerConfig', () => {
  test('is off until a host is configured', () => {
    expect(readMailerConfig({})).toBeNull();
    expect(readMailerConfig({ SMTP_HOST: '   ' })).toBeNull();
  });

  test('defaults to STARTTLS on 587 and TLS on 465', () => {
    expect(readMailerConfig(baseEnv)).toMatchObject({ host: 'relay.perusahaan.local', port: 587, secure: false });
    expect(readMailerConfig({ ...baseEnv, SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true });
    // Explicit flag wins over the port heuristic.
    expect(readMailerConfig({ ...baseEnv, SMTP_PORT: '465', SMTP_SECURE: 'false' })).toMatchObject({ secure: false });
  });

  test('rejects half-configured credentials instead of starting up broken', () => {
    expect(() => readMailerConfig({ ...baseEnv, SMTP_USER: 'helpdesk' })).toThrow('SMTP_PASSWORD');
    expect(() => readMailerConfig({ ...baseEnv, SMTP_PASSWORD: 'rahasia' })).toThrow('SMTP_USER');
    expect(() => readMailerConfig({ ...baseEnv, SMTP_PORT: 'abc' })).toThrow('SMTP_PORT');
    expect(() => readMailerConfig({ ...baseEnv, SMTP_SECURE: 'yes' })).toThrow('SMTP_SECURE');
    expect(() => readMailerConfig({ SMTP_HOST: 'relay.local' })).toThrow('SMTP_FROM');
    expect(() => readMailerConfig({ ...baseEnv, SMTP_FROM: 'a@b.c\r\nBcc: x@y.z' })).toThrow('baris baru');
  });

  test('falls back to the authenticated user as sender', () => {
    expect(readMailerConfig({ SMTP_HOST: 'relay.local', SMTP_USER: 'helpdesk', SMTP_PASSWORD: 'p' }))
      .toMatchObject({ from: 'helpdesk' });
  });
});

describe('validateEmailInput', () => {
  const valid = { to: 'budi@perusahaan.com', subject: 'Tindak lanjut', body: 'Halo, tiket sudah selesai.' };

  test('accepts a well-formed email', () => {
    const result = validateEmailInput(valid);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data).toEqual(valid);
  });

  test('rejects malformed addresses', () => {
    for (const to of ['', 'budi', 'budi@', '@perusahaan.com', 'a@b', 'a b@c.com', 'a@b.com, c@d.com', 'a@b.com\nBcc: x@y.z']) {
      const result = validateEmailInput({ ...valid, to });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.errors.to).toBeDefined();
    }
  });

  test('blocks header injection through the subject', () => {
    const result = validateEmailInput({ ...valid, subject: 'Halo\r\nBcc: penyerang@jahat.com' });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.subject).toContain('baris baru');
  });

  test('enforces length limits', () => {
    expect(validateEmailInput({ ...valid, subject: 'x'.repeat(201) }).valid).toBe(false);
    expect(validateEmailInput({ ...valid, body: 'x'.repeat(5001) }).valid).toBe(false);
    expect(validateEmailInput({ ...valid, subject: 'x'.repeat(200) }).valid).toBe(true);
    expect(validateEmailInput({ ...valid, body: 'x'.repeat(5000) }).valid).toBe(true);
  });

  test('requires every field', () => {
    const result = validateEmailInput({});
    expect(result.valid).toBe(false);
    if (!result.valid) expect(Object.keys(result.errors).sort()).toEqual(['body', 'subject', 'to']);
  });
});

describe('describeMailError', () => {
  test('maps SMTP failures to actionable Indonesian messages', () => {
    expect(describeMailError({ code: 'EAUTH' })).toContain('SMTP_USER');
    expect(describeMailError({ responseCode: 535 })).toContain('SMTP_USER');
    expect(describeMailError({ code: 'ETIMEDOUT' })).toContain('tidak dapat terhubung'.replace('t', 'T'));
    expect(describeMailError({ code: 'EENVELOPE' })).toContain('ditolak');
    expect(describeMailError(new Error('boom'))).toContain('Hubungi administrator');
  });
});

describe('createMailer', () => {
  test('hands the composed message to the transport and forwards failures', async () => {
    const sent: any[] = [];
    const mailer = createMailer(
      { host: 'relay.local', port: 587, secure: false, from: 'helpdesk@perusahaan.com' },
      { transport: { sendMail: async (msg: any) => { sent.push(msg); }, close: () => {} } as any },
    );

    await mailer.send({ to: 'budi@perusahaan.com', subject: 'Tindak lanjut', body: 'Halo' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: 'helpdesk@perusahaan.com', to: 'budi@perusahaan.com', subject: 'Tindak lanjut', text: 'Halo' });

    const failing = createMailer(
      { host: 'relay.local', port: 587, secure: false, from: 'a@b.com' },
      { transport: { sendMail: async () => { throw Object.assign(new Error('nope'), { code: 'EAUTH' }); }, close: () => {} } as any },
    );
    expect(failing.send({ to: 'x@y.com', subject: 's', body: 'b' })).rejects.toThrow('nope');
  });
});

describe('buildEmailDraft', () => {
  const ticket = {
    id: '1', ticketNumber: 'TKT-000123', creatorId: '9', title: 'Printer rusak', description: 'Tidak bisa mencetak.',
    priority: 'High', status: 'Closed', createdAt: '2026-09-24T10:00:00.000Z', updatedAt: '2026-09-24T11:00:00.000Z',
    resolution: { solution: 'Kabel LAN diganti.', resolverUsername: 'siti', closedAt: '2026-09-24T11:00:00.000Z' },
  } as Ticket;

  test('prefills subject and body from the ticket, including the resolution', () => {
    const draft = buildEmailDraft(ticket, { agentName: 'Siti IT' });
    expect(draft.subject).toBe('[TKT-000123] Printer rusak');
    expect(draft.body).toContain('Tidak bisa mencetak.');
    expect(draft.body).toContain('Kabel LAN diganti.');
    expect(draft.body).toContain('Siti IT');
  });

  test('still produces a usable draft without a resolution', () => {
    const draft = buildEmailDraft({ ...ticket, resolution: null }, {});
    expect(draft.body).toContain('Tidak bisa mencetak.');
    expect(draft.body).not.toContain('Penanganan yang dilakukan:');
    expect(draft.body).toContain('Tim IT');
  });
});