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
  type User,
} from './auth';
import {
  validateCreateTicketInput,
  formatTicketNumber,
  type Ticket,
} from './tickets';
import { MemoryRateLimiter } from './rate-limit';
import { validateCsrf } from './csrf';

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
  rateLimiter?: MemoryRateLimiter;
}

const defaultAuthRateLimiter = new MemoryRateLimiter(5, 60 * 1000); // 5 attempts per minute

export async function handleRequest(request: Request, ctx: AppContext) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const rateLimiter = ctx.rateLimiter ?? defaultAuthRateLimiter;

  // CSRF validation on mutating requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    if (!validateCsrf(request)) {
      return json({ error: { code: 'CSRF_ERROR', message: 'Permintaan ditolak: Header CSRF tidak valid.' } }, 403);
    }
  }

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

  // Auth Routes
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
    } catch (err: any) {
      if (err?.code === '23505' || err?.errno === '23505') {
        return json({ error: { code: 'CONFLICT', message: 'Data sudah terdaftar.', details: { _conflict: 'NIK atau Username sudah digunakan.' } } }, 409);
      }
      console.error('Registration error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem.' } }, 500);
    }
  }

  if (pathname === '/api/auth/login') {
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    // Rate limiting key: IP or header
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateCheck = rateLimiter.isAllowed(`login:${ip}`);
    if (!rateCheck.allowed) {
      return json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Terlalu banyak percobaan login. Silakan tunggu ${rateCheck.retryAfterSeconds} detik lagi.`,
        },
      }, 429, { 'Retry-After': String(rateCheck.retryAfterSeconds) });
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

      // Successful login resets rate limit attempts
      rateLimiter.reset(`login:${ip}`);

      const sessionId = generateSessionId();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

  // Authentication Helper for Protected Routes
  const getAuthUser = async (): Promise<User | null> => {
    const cookies = parseCookies(request.headers.get('Cookie'));
    const sessionId = cookies.session_id;
    if (!sessionId) return null;
    return await getSessionUser(ctx.sql, sessionId);
  };

  // Ticket Routes
  if (pathname === '/api/tickets') {
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }

    if (request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
      }

      const validation = validateCreateTicketInput(body);
      if (!validation.valid) {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'Data tiket tidak valid.', details: validation.errors } }, 422);
      }

      const { title, description, priority } = validation.data;

      try {
        const seqResult = await ctx.sql`SELECT nextval('ticket_number_seq') AS seq`;
        const seq = Number((seqResult[0] as { seq: number | string }).seq);
        const ticketNumber = formatTicketNumber(seq);

        const inserted = await ctx.sql`
          INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
          VALUES (${ticketNumber}, ${user.id}, ${title}, ${description}, ${priority}, 'Open')
          RETURNING 
            id, 
            ticket_number AS "ticketNumber", 
            creator_id AS "creatorId", 
            title, 
            description, 
            priority, 
            status, 
            created_at AS "createdAt", 
            updated_at AS "updatedAt"
        `;

        const newTicket = inserted[0] as Ticket;
        return json({ message: 'Tiket berhasil dibuat.', ticket: newTicket }, 201);
      } catch (err) {
        console.error('Create ticket error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat membuat tiket.' } }, 500);
      }
    }

    if (request.method === 'GET') {
      try {
        const queryParam = url.searchParams.get('q')?.trim() || '';
        const rawPage = url.searchParams.get('page') || '1';
        const rawLimit = url.searchParams.get('limit') || '20';

        const page = Math.max(1, parseInt(rawPage, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));
        const offset = (page - 1) * limit;

        const searchPattern = queryParam ? `%${queryParam}%` : null;

        let ticketsQuery;
        let countQuery;

        if (user.role === 'User') {
          if (searchPattern) {
            ticketsQuery = await ctx.sql`
              SELECT 
                t.id, 
                t.ticket_number AS "ticketNumber", 
                t.creator_id AS "creatorId", 
                u.username AS "creatorUsername",
                u.nik AS "creatorNik",
                t.assignee_id AS "assigneeId",
                a.username AS "assigneeUsername",
                t.title, 
                t.description, 
                t.priority, 
                t.status, 
                t.created_at AS "createdAt", 
                t.updated_at AS "updatedAt"
              FROM tickets t
              JOIN users u ON t.creator_id = u.id
              LEFT JOIN users a ON t.assignee_id = a.id
              WHERE t.creator_id = ${user.id}
                AND (t.ticket_number ILIKE ${searchPattern} OR t.title ILIKE ${searchPattern} OR t.description ILIKE ${searchPattern})
              ORDER BY t.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = await ctx.sql`
              SELECT COUNT(*)::int AS count
              FROM tickets t
              WHERE t.creator_id = ${user.id}
                AND (t.ticket_number ILIKE ${searchPattern} OR t.title ILIKE ${searchPattern} OR t.description ILIKE ${searchPattern})
            `;
          } else {
            ticketsQuery = await ctx.sql`
              SELECT 
                t.id, 
                t.ticket_number AS "ticketNumber", 
                t.creator_id AS "creatorId", 
                u.username AS "creatorUsername",
                u.nik AS "creatorNik",
                t.assignee_id AS "assigneeId",
                a.username AS "assigneeUsername",
                t.title, 
                t.description, 
                t.priority, 
                t.status, 
                t.created_at AS "createdAt", 
                t.updated_at AS "updatedAt"
              FROM tickets t
              JOIN users u ON t.creator_id = u.id
              LEFT JOIN users a ON t.assignee_id = a.id
              WHERE t.creator_id = ${user.id}
              ORDER BY t.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = await ctx.sql`
              SELECT COUNT(*)::int AS count
              FROM tickets t
              WHERE t.creator_id = ${user.id}
            `;
          }
        } else {
          // IT Staff or Super Admin: View all tickets
          if (searchPattern) {
            ticketsQuery = await ctx.sql`
              SELECT 
                t.id, 
                t.ticket_number AS "ticketNumber", 
                t.creator_id AS "creatorId", 
                u.username AS "creatorUsername",
                u.nik AS "creatorNik",
                t.assignee_id AS "assigneeId",
                a.username AS "assigneeUsername",
                t.title, 
                t.description, 
                t.priority, 
                t.status, 
                t.created_at AS "createdAt", 
                t.updated_at AS "updatedAt"
              FROM tickets t
              JOIN users u ON t.creator_id = u.id
              LEFT JOIN users a ON t.assignee_id = a.id
              WHERE (t.ticket_number ILIKE ${searchPattern} OR t.title ILIKE ${searchPattern} OR t.description ILIKE ${searchPattern})
              ORDER BY t.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = await ctx.sql`
              SELECT COUNT(*)::int AS count
              FROM tickets t
              WHERE (t.ticket_number ILIKE ${searchPattern} OR t.title ILIKE ${searchPattern} OR t.description ILIKE ${searchPattern})
            `;
          } else {
            ticketsQuery = await ctx.sql`
              SELECT 
                t.id, 
                t.ticket_number AS "ticketNumber", 
                t.creator_id AS "creatorId", 
                u.username AS "creatorUsername",
                u.nik AS "creatorNik",
                t.assignee_id AS "assigneeId",
                a.username AS "assigneeUsername",
                t.title, 
                t.description, 
                t.priority, 
                t.status, 
                t.created_at AS "createdAt", 
                t.updated_at AS "updatedAt"
              FROM tickets t
              JOIN users u ON t.creator_id = u.id
              LEFT JOIN users a ON t.assignee_id = a.id
              ORDER BY t.created_at DESC
              LIMIT ${limit} OFFSET ${offset}
            `;
            countQuery = await ctx.sql`
              SELECT COUNT(*)::int AS count
              FROM tickets t
            `;
          }
        }

        const total = (countQuery[0] as { count: number }).count;

        return json({
          tickets: ticketsQuery,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (err) {
        console.error('List tickets error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat mengambil daftar tiket.' } }, 500);
      }
    }

    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET, POST' });
  }

  // Single Ticket Detail: /api/tickets/:id
  const ticketDetailMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (ticketDetailMatch) {
    const ticketIdOrNumber = ticketDetailMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }

    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }

    try {
      const rows = await ctx.sql`
        SELECT 
          t.id, 
          t.ticket_number AS "ticketNumber", 
          t.creator_id AS "creatorId", 
          u.username AS "creatorUsername",
          u.nik AS "creatorNik",
          t.assignee_id AS "assigneeId",
          a.username AS "assigneeUsername",
          t.title, 
          t.description, 
          t.priority, 
          t.status, 
          t.created_at AS "createdAt", 
          t.updated_at AS "updatedAt"
        FROM tickets t
        JOIN users u ON t.creator_id = u.id
        LEFT JOIN users a ON t.assignee_id = a.id
        WHERE t.id = ${ticketIdOrNumber} OR t.ticket_number = ${ticketIdOrNumber}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      }

      const ticket = rows[0] as Ticket;

      // Access control: User can only view their own tickets. IT Staff / Super Admin can view all.
      if (user.role === 'User' && String(ticket.creatorId) !== String(user.id)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke tiket ini.' } }, 403);
      }

      return json({ ticket });
    } catch (err) {
      console.error('Get ticket error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat mengambil detail tiket.' } }, 500);
    }
  }

  return json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404);
}
