import type { SQL } from 'bun';
import {
  validateRegisterInput,
  validateLoginInput,
  hashPassword,
  verifyPassword,
  generateSessionId,
  parseCookies,
  buildSessionCookie,
  buildClearSessionCookie,
  getSessionUser,
} from './auth';

export function readConfig(env: Record<string, string | undefined>) {
  const databaseUrl = env.DATABASE_URL ?? '';
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || url.pathname.length < 2) throw new Error();
  } catch {
    throw new Error('DATABASE_URL harus berupa URL PostgreSQL lengkap.');
  }

  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT harus berupa bilangan bulat antara 1 dan 65535.');
  }
  return { databaseUrl, port };
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      ...extraHeaders,
    },
  });
}

export interface AppContext {
  sql: SQL;
}

export async function handleRequest(request: Request, ctx: AppContext) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/api/health') {
    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }
    try {
      await ctx.sql`SELECT 1`;
      return json({ status: 'ok', database: 'connected' });
    } catch {
      return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Layanan sementara tidak tersedia.' } }, 503);
    }
  }

  if (pathname === '/api/auth/register') {
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    const validation = validateRegisterInput(body);
    if (!validation.valid) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Data pendaftaran tidak valid.', details: validation.errors } }, 422);
    }

    const { nik, username, password } = validation.data;

    try {
      const existing = await ctx.sql`
        SELECT nik, username FROM users
        WHERE nik = ${nik} OR LOWER(username) = LOWER(${username})
        LIMIT 1
      `;

      if (existing.length > 0) {
        const found = existing[0] as { nik: string; username: string };
        const details: Record<string, string> = {};
        if (found.nik === nik) details.nik = 'NIK sudah terdaftar.';
        if (found.username.toLowerCase() === username.toLowerCase()) details.username = 'Username sudah digunakan.';
        return json({ error: { code: 'CONFLICT', message: 'Data sudah terdaftar.', details } }, 409);
      }

      const passwordHash = await hashPassword(password);

      const inserted = await ctx.sql`
        INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
        VALUES (${nik}, ${username}, ${passwordHash}, 'User', TRUE, FALSE)
        RETURNING id, nik, username, role, is_active AS "isActive", must_change_password AS "mustChangePassword", created_at AS "createdAt"
      `;

      const newUser = inserted[0];
      return json({ message: 'Registrasi berhasil.', user: newUser }, 201);
    } catch (err) {
      console.error('Registration error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem.' } }, 500);
    }
  }

  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    const validation = validateLoginInput(body);
    if (!validation.valid) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Input login tidak valid.', details: validation.errors } }, 422);
    }

    const { username, password } = validation.data;

    try {
      const rows = await ctx.sql`
        SELECT id, nik, username, password_hash AS "passwordHash", role, is_active AS "isActive", must_change_password AS "mustChangePassword", created_at AS "createdAt"
        FROM users
        WHERE LOWER(username) = LOWER(${username})
        LIMIT 1
      `;

      if (rows.length === 0) {
        return json({ error: { code: 'UNAUTHORIZED', message: 'Username atau password salah.' } }, 401);
      }

      const user = rows[0] as {
        id: number | string;
        nik: string;
        username: string;
        passwordHash: string;
        role: 'User' | 'IT Staff' | 'Super Admin';
        isActive: boolean;
        mustChangePassword: boolean;
        createdAt: string;
      };

      if (!user.isActive) {
        return json({ error: { code: 'FORBIDDEN', message: 'Akun Anda telah dinonaktifkan. Hubungi administrator IT.' } }, 403);
      }

      const isPasswordValid = await verifyPassword(password, user.passwordHash);
      if (!isPasswordValid) {
        return json({ error: { code: 'UNAUTHORIZED', message: 'Username atau password salah.' } }, 401);
      }

      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await ctx.sql`
        INSERT INTO sessions (id, user_id, expires_at)
        VALUES (${sessionId}, ${user.id}, ${expiresAt.toISOString()})
      `;

      const cookieHeader = buildSessionCookie(sessionId);

      return json({
        message: 'Login berhasil.',
        user: {
          id: String(user.id),
          nik: user.nik,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          createdAt: user.createdAt,
        },
      }, 200, { 'Set-Cookie': cookieHeader });
    } catch (err) {
      console.error('Login error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat login.' } }, 500);
    }
  }

  if (pathname === '/api/auth/me') {
    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionId = cookies.session_id;

    if (!sessionId) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Belum terautentikasi.' } }, 401);
    }

    try {
      const user = await getSessionUser(ctx.sql, sessionId);
      if (!user) {
        return json({ error: { code: 'UNAUTHORIZED', message: 'Sesi tidak valid atau telah berakhir.' } }, 401, {
          'Set-Cookie': buildClearSessionCookie(),
        });
      }

      return json({ user });
    } catch (err) {
      console.error('Session check error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan memeriksa sesi.' } }, 500);
    }
  }

  if (pathname === '/api/auth/logout') {
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionId = cookies.session_id;

    if (sessionId) {
      try {
        await ctx.sql`DELETE FROM sessions WHERE id = ${sessionId}`;
      } catch (err) {
        console.error('Logout error:', err);
      }
    }

    return json({ message: 'Logout berhasil.' }, 200, {
      'Set-Cookie': buildClearSessionCookie(),
    });
  }

  return json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404);
}
