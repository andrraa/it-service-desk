import nodemailer, { type Transporter } from 'nodemailer';

export interface MailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string;
}

export interface Mailer {
  send(email: OutboundEmail): Promise<void>;
  /** Closes the SMTP pool. Call on shutdown. */
  close(): Promise<void>;
}

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;
const ADDRESS = /^[^\s@,;:<>"]+@[^\s@,;:<>"]+\.[a-z]{2,}$/i;
// CR/LF in a header lets a caller inject extra SMTP headers (e.g. Bcc).
const HEADER_BREAK = /[\r\n]/;

/**
 * Reads SMTP settings. Returns null when SMTP_HOST is empty (feature off, like Telegram);
 * a half-configured relay throws so the server fails at boot instead of silently dropping mail.
 */
export function readMailerConfig(env: Record<string, string | undefined>): MailerConfig | null {
  const host = env.SMTP_HOST?.trim() ?? '';
  if (!host) return null;

  const portRaw = env.SMTP_PORT?.trim() || '587';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT harus berupa angka 1-65535.');
  }

  const secureRaw = env.SMTP_SECURE?.trim().toLowerCase() ?? '';
  if (secureRaw && !['true', 'false', '1', '0'].includes(secureRaw)) {
    throw new Error('SMTP_SECURE harus true atau false.');
  }
  // 465 speaks TLS from the first byte; 587/25 upgrade with STARTTLS.
  const secure = secureRaw ? secureRaw === 'true' || secureRaw === '1' : port === 465;

  const user = env.SMTP_USER?.trim() || undefined;
  const password = env.SMTP_PASSWORD?.trim() || undefined;
  if ((user && !password) || (!user && password)) {
    throw new Error('SMTP_USER dan SMTP_PASSWORD harus diisi bersama atau dikosongkan bersama.');
  }

  const from = env.SMTP_FROM?.trim() || user;
  if (!from) {
    throw new Error('SMTP_FROM wajib diisi (alamat pengirim email).');
  }
  if (HEADER_BREAK.test(from)) {
    throw new Error('SMTP_FROM tidak boleh mengandung baris baru.');
  }

  return { host, port, secure, user, password, from };
}

export function validateEmailInput(input: unknown): { valid: true; data: OutboundEmail } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }
  const { to, subject, body } = input as Record<string, unknown>;

  const toText = typeof to === 'string' ? to.trim() : '';
  if (!toText) {
    errors.to = 'Alamat email tujuan wajib diisi.';
  } else if (HEADER_BREAK.test(toText) || !ADDRESS.test(toText)) {
    errors.to = 'Format alamat email tujuan tidak valid.';
  }

  const subjectText = typeof subject === 'string' ? subject.trim() : '';
  if (!subjectText) {
    errors.subject = 'Subjek wajib diisi.';
  } else if (HEADER_BREAK.test(subjectText)) {
    errors.subject = 'Subjek tidak boleh mengandung baris baru.';
  } else if (subjectText.length > MAX_SUBJECT) {
    errors.subject = `Subjek terlalu panjang (maksimal ${MAX_SUBJECT} karakter).`;
  }

  const bodyText = typeof body === 'string' ? body.trim() : '';
  if (!bodyText) {
    errors.body = 'Isi pesan wajib diisi.';
  } else if (bodyText.length > MAX_BODY) {
    errors.body = `Isi pesan terlalu panjang (maksimal ${MAX_BODY} karakter).`;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { to: toText, subject: subjectText, body: bodyText } };
}

/**
 * Sends one email per call through a pooled SMTP connection.
 * ponytail: no retry/queue — the request waits and the agent sees the failure, so a
 * resend is a button click. Add an outbox table if sending ever moves off the request path.
 */
export function createMailer(config: MailerConfig, options: { transport?: Transporter } = {}): Mailer {
  const transport = options.transport ?? nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return {
    async send(email) {
      await transport.sendMail({
        from: config.from,
        to: email.to,
        subject: email.subject,
        text: email.body,
      });
    },
    async close() {
      transport.close();
    },
  };
}

/** Maps SMTP failures to something an IT agent can act on. */
export function describeMailError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const response = (error as { responseCode?: number })?.responseCode;
  if (['EAUTH', 'AUTH', 'ENOAUTH'].includes(code) || response === 535) return 'Autentikasi SMTP ditolak. Periksa SMTP_USER dan SMTP_PASSWORD.';
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') return `Tidak dapat terhubung ke server SMTP (${code}).`;
  if (code === 'EENVELOPE' || response === 550 || response === 553) return 'Alamat email tujuan ditolak oleh server SMTP.';
  if (code === 'EMESSAGE') return 'Isi email ditolak oleh server SMTP.';
  return 'Pengiriman email gagal. Hubungi administrator sistem.';
}