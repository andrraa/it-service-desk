import { describe, expect, test } from 'bun:test';
import type { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';
import type { Mailer, OutboundEmail } from '../src/server/mailer';

// Guards (role, ticket status) and the audit trail are SQL-backed, so they run live.
describe('Send ticket email (Live PostgreSQL)', () => {
  const validBody = { to: 'budi@perusahaan.com', subject: '[EMAIL-CLOSED-1] Tindak lanjut', body: 'Halo, tiket sudah selesai.' };

  async function withTicket(run: (ctx: { sql: SQL; openId: number; closedId: number; sent: OutboundEmail[]; mailer: Mailer }) => Promise<void>) {
    const sql = await openTestDatabase();
    try {
      const pass = await hashPassword('password_aman_email_123');
      const [reporter] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('email_reporter', 'Email Reporter', ${pass}, 'User') RETURNING id`;
      const [staff] = await sql`INSERT INTO users (username, full_name, password_hash, role) VALUES ('email_staff', 'Email Staff', ${pass}, 'IT Staff') RETURNING id`;
      await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES ('email_sess_user', ${reporter.id}, NOW() + INTERVAL '1 day'), ('email_sess_staff', ${staff.id}, NOW() + INTERVAL '1 day')`;
      const [open] = await sql`INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status) VALUES ('EMAIL-OPEN-1', ${reporter.id}, 'EMAIL_TEST_Open', 'Desc', 'High', 'Open') RETURNING id`;
      const [closed] = await sql`INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status) VALUES ('EMAIL-CLOSED-1', ${reporter.id}, 'EMAIL_TEST_Closed', 'Desc', 'High', 'Closed') RETURNING id`;
      await sql`INSERT INTO resolutions (ticket_id, resolver_id, solution) VALUES (${closed.id}, ${staff.id}, 'Sudah diperbaiki.')`;

      const sent: OutboundEmail[] = [];
      const mailer: Mailer = { send: async (email) => { sent.push(email); }, close: async () => {} };
      await run({ sql, openId: open.id, closedId: closed.id, sent, mailer });
    } finally {
      await closeTestDatabase(sql);
    }
  }

  const post = (sql: SQL, id: number | string, session: string | null, body: unknown, mailer?: Mailer) =>
    handleRequest(new Request(`http://localhost/api/tickets/${id}/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'fetch',
        ...(session ? { Cookie: `session_id=${session}` } : {}),
      },
      body: JSON.stringify(body),
    }), { sql }, { mailer });

  test('rejects non-staff, unknown tickets, missing session and unconfigured SMTP', async () => {
    await withTicket(async ({ sql, openId, sent, mailer }) => {
      expect((await post(sql, openId, 'email_sess_user', validBody, mailer)).status).toBe(403);
      expect((await post(sql, 999999, 'email_sess_staff', validBody, mailer)).status).toBe(404);
      expect((await post(sql, openId, null, validBody, mailer)).status).toBe(401);

      const disabled = await post(sql, openId, 'email_sess_staff', validBody, undefined);
      expect(disabled.status).toBe(503);
      expect((await disabled.json() as any).error.code).toBe('EMAIL_DISABLED');
      expect(sent).toHaveLength(0);
    });
  });

  test('validates the payload before touching SMTP', async () => {
    await withTicket(async ({ sql, openId, sent, mailer }) => {
      const invalid = await post(sql, openId, 'email_sess_staff', { to: 'bukan-email', subject: 'Halo\r\nBcc: x@y.z', body: '' }, mailer);
      expect(invalid.status).toBe(422);
      const body: any = await invalid.json();
      expect(Object.keys(body.error.details).sort()).toEqual(['body', 'subject', 'to']);
      expect(sent).toHaveLength(0);
    });
  });

  // Email is allowed at any status, so staff can update the reporter before the ticket is done.
  test('sends for an open ticket and records an audit entry without the body', async () => {
    await withTicket(async ({ sql, openId, sent, mailer }) => {
      const res = await post(sql, openId, 'email_sess_staff', validBody, mailer);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toMatchObject({ to: validBody.to, subject: validBody.subject });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ to: validBody.to, subject: validBody.subject, body: validBody.body });

      const logs = await sql`SELECT action, new_value FROM audit_logs WHERE ticket_id = ${openId} AND action = 'SEND_EMAIL'`;
      expect(logs).toHaveLength(1);
      expect(logs[0]!.new_value).toMatchObject({ to: validBody.to, subject: validBody.subject });
      expect(JSON.stringify(logs[0]!.new_value)).not.toContain(validBody.body);
    });
  });

  test('reports a relay failure and records nothing', async () => {
    await withTicket(async ({ sql, openId }) => {
      const failing: Mailer = {
        send: async () => { throw Object.assign(new Error('relay down'), { code: 'ECONNECTION' }); },
        close: async () => {},
      };
      const res = await post(sql, openId, 'email_sess_staff', validBody, failing);
      expect(res.status).toBe(502);
      const body: any = await res.json();
      expect(body.error.code).toBe('EMAIL_SEND_FAILED');
      expect(body.error.message).toContain('Tidak dapat terhubung');
      const logs = await sql`SELECT id FROM audit_logs WHERE ticket_id = ${openId} AND action = 'SEND_EMAIL'`;
      expect(logs).toHaveLength(0);
    });
  });
});