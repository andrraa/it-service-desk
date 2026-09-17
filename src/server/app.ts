import type { SQL } from 'bun';
import { join } from 'node:path';
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
  validateUpdatePriorityInput,
  validateCloseTicketInput,
  formatTicketNumber,
  type Ticket,
} from './tickets';
import { validateMessageInput, type TicketMessage } from './messages';
import {
  detectMimeFromBytes,
  ensureUploadsDirExists,
  generateStorageFilename,
  safeDeleteFile,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  ALLOWED_MIME_TYPES,
  getUploadsDir,
} from './attachments';
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

const defaultAuthRateLimiter = new MemoryRateLimiter(5, 60 * 1000);

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

  // Dashboard IT Summary: GET /api/dashboard/summary
  if (pathname === '/api/dashboard/summary') {
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'IT Staff' && user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya staf IT dan Super Admin yang dapat mengakses dashboard.' } }, 403);
    }
    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }

    try {
      const summary = await ctx.sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'Open')::int AS "openCount",
          COUNT(*) FILTER (WHERE status = 'In Progress')::int AS "inProgressCount",
          COUNT(*) FILTER (WHERE status IN ('Open', 'In Progress') AND priority = 'Critical')::int AS "criticalActiveCount",
          COUNT(*) FILTER (WHERE status = 'Closed' AND updated_at >= CURRENT_DATE)::int AS "closedTodayCount"
        FROM tickets
      `;

      return json({ summary: summary[0] });
    } catch (err) {
      console.error('Dashboard summary error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil ringkasan dashboard.' } }, 500);
    }
  }

  // Dashboard IT Queue: GET /api/dashboard/queue
  if (pathname === '/api/dashboard/queue') {
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'IT Staff' && user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya staf IT dan Super Admin yang dapat mengakses antrean.' } }, 403);
    }
    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }

    try {
      const statusFilter = url.searchParams.get('status')?.trim();
      const priorityFilter = url.searchParams.get('priority')?.trim();
      const unassignedOnly = url.searchParams.get('unassigned') === 'true';
      const assignedToMe = url.searchParams.get('assignedToMe') === 'true';
      const queryParam = url.searchParams.get('q')?.trim() || '';

      const searchPattern = queryParam ? `%${queryParam}%` : null;

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
        WHERE t.status IN ('Open', 'In Progress')
          AND (${statusFilter ? ctx.sql`t.status = ${statusFilter}` : ctx.sql`TRUE`})
          AND (${priorityFilter ? ctx.sql`t.priority = ${priorityFilter}` : ctx.sql`TRUE`})
          AND (${unassignedOnly ? ctx.sql`t.assignee_id IS NULL` : ctx.sql`TRUE`})
          AND (${assignedToMe ? ctx.sql`t.assignee_id = ${user.id}` : ctx.sql`TRUE`})
          AND (${searchPattern ? ctx.sql`(t.ticket_number ILIKE ${searchPattern} OR t.title ILIKE ${searchPattern})` : ctx.sql`TRUE`})
        ORDER BY 
          CASE t.priority 
            WHEN 'Critical' THEN 1 
            WHEN 'High' THEN 2 
            WHEN 'Medium' THEN 3 
            WHEN 'Low' THEN 4 
            ELSE 5 
          END ASC,
          t.created_at ASC,
          t.id ASC
      `;

      return json({ queue: rows });
    } catch (err) {
      console.error('Queue query error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil antrean tiket.' } }, 500);
    }
  }

  // Claim Ticket: POST /api/tickets/:id/claim
  const claimMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/claim$/);
  if (claimMatch) {
    const ticketId = claimMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'IT Staff' && user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya IT Staff atau Super Admin yang dapat mengambil tiket.' } }, 403);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    try {
      const updated = await ctx.sql`
        UPDATE tickets
        SET 
          assignee_id = ${user.id},
          status = 'In Progress',
          updated_at = NOW()
        WHERE (id = ${ticketId} OR ticket_number = ${ticketId})
          AND status = 'Open'
          AND assignee_id IS NULL
        RETURNING 
          id, 
          ticket_number AS "ticketNumber", 
          creator_id AS "creatorId", 
          assignee_id AS "assigneeId",
          title, 
          description, 
          priority, 
          status, 
          created_at AS "createdAt", 
          updated_at AS "updatedAt"
      `;

      if (updated.length === 0) {
        return json({
          error: {
            code: 'CONFLICT',
            message: 'Tiket sudah diambil oleh staf lain atau statusnya bukan Open.',
          },
        }, 409);
      }

      const claimedTicket = updated[0] as Ticket;

      await ctx.sql`
        INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, reason)
        VALUES (
          ${claimedTicket.id},
          ${user.id},
          'CLAIM_TICKET',
          ${{ status: 'Open', assigneeId: null }},
          ${{ status: 'In Progress', assigneeId: user.id }},
          'Tiket diambil oleh staf IT untuk penanganan.'
        )
      `;

      return json({ message: 'Tiket berhasil diambil.', ticket: claimedTicket });
    } catch (err) {
      console.error('Claim ticket error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat mengambil tiket.' } }, 500);
    }
  }

  // Update Ticket Priority: PATCH /api/tickets/:id/priority
  const priorityMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/priority$/);
  if (priorityMatch) {
    const ticketId = priorityMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'IT Staff' && user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya staf IT dan Super Admin yang dapat mengubah prioritas tiket.' } }, 403);
    }
    if (request.method !== 'PATCH') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'PATCH' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    const validation = validateUpdatePriorityInput(body);
    if (!validation.valid) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Data prioritas tidak valid.', details: validation.errors } }, 422);
    }

    const { priority, reason } = validation.data;

    try {
      const currentRows = await ctx.sql`
        SELECT id, priority, status FROM tickets WHERE id = ${ticketId} OR ticket_number = ${ticketId} LIMIT 1
      `;
      if (currentRows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      }

      const currentTicket = currentRows[0] as { id: number | string; priority: string; status: string };
      if (currentTicket.status === 'Closed') {
        return json({ error: { code: 'FORBIDDEN', message: 'Tiket yang sudah ditutup tidak dapat diubah prioritasnya.' } }, 403);
      }

      const oldPriority = currentTicket.priority;

      const updated = await ctx.sql`
        UPDATE tickets
        SET priority = ${priority}, updated_at = NOW()
        WHERE id = ${currentTicket.id}
        RETURNING id, ticket_number AS "ticketNumber", creator_id AS "creatorId", assignee_id AS "assigneeId", title, description, priority, status, created_at AS "createdAt", updated_at AS "updatedAt"
      `;

      await ctx.sql`
        INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, reason)
        VALUES (
          ${currentTicket.id},
          ${user.id},
          'CHANGE_PRIORITY',
          ${{ priority: oldPriority }},
          ${{ priority }},
          ${reason}
        )
      `;

      return json({ message: 'Prioritas tiket berhasil diperbarui.', ticket: updated[0] });
    } catch (err) {
      console.error('Update priority error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat mengubah prioritas.' } }, 500);
    }
  }

  // Close Ticket with Solution: POST /api/tickets/:id/close
  const closeMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/close$/);
  if (closeMatch) {
    const ticketId = closeMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    const validation = validateCloseTicketInput(body);
    if (!validation.valid) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Data penutupan tiket tidak valid.', details: validation.errors } }, 422);
    }

    const { solution } = validation.data;

    try {
      const ticketRows = await ctx.sql`
        SELECT id, creator_id AS "creatorId", assignee_id AS "assigneeId", status
        FROM tickets
        WHERE id = ${ticketId} OR ticket_number = ${ticketId}
        LIMIT 1
      `;
      if (ticketRows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      }

      const t = ticketRows[0] as { id: number | string; creatorId: number | string; assigneeId: number | string | null; status: string };

      if (t.status === 'Closed') {
        return json({ error: { code: 'CONFLICT', message: 'Tiket sudah ditutup sebelumnya.' } }, 409);
      }

      // Acceptance: hanya pemilik penanganan (assignee) atau admin yang dapat menutup tiket
      const isAssignee = t.assigneeId && String(t.assigneeId) === String(user.id);
      const isAdmin = user.role === 'Super Admin';

      if (!isAssignee && !isAdmin) {
        return json({ error: { code: 'FORBIDDEN', message: 'Hanya penanggung jawab tiket atau Super Admin yang dapat menutup tiket ini.' } }, 403);
      }

      // Atomic transaction: update ticket to Closed + insert resolution + insert audit log
      const closeResult = await ctx.sql.begin(async (tx) => {
        const updatedTickets = await tx`
          UPDATE tickets
          SET status = 'Closed', updated_at = NOW()
          WHERE id = ${t.id} AND status != 'Closed'
          RETURNING id, ticket_number AS "ticketNumber", creator_id AS "creatorId", assignee_id AS "assigneeId", title, description, priority, status, created_at AS "createdAt", updated_at AS "updatedAt"
        `;

        if (updatedTickets.length === 0) {
          throw new Error('ALREADY_CLOSED');
        }

        const resRows = await tx`
          INSERT INTO resolutions (ticket_id, resolver_id, solution)
          VALUES (${t.id}, ${user.id}, ${solution})
          RETURNING id, solution, closed_at AS "closedAt"
        `;

        await tx`
          INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, reason)
          VALUES (
            ${t.id},
            ${user.id},
            'CLOSE_TICKET',
            ${{ status: t.status }},
            ${{ status: 'Closed' }},
            ${solution}
          )
        `;

        return { ticket: updatedTickets[0], resolution: resRows[0] };
      });

      return json({
        message: 'Tiket berhasil diselesaikan dan ditutup.',
        ticket: closeResult.ticket,
        resolution: closeResult.resolution,
      });
    } catch (err: any) {
      if (err?.message === 'ALREADY_CLOSED') {
        return json({ error: { code: 'CONFLICT', message: 'Tiket sudah ditutup oleh proses lain.' } }, 409);
      }
      console.error('Close ticket error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat menutup tiket.' } }, 500);
    }
  }

  // Conversation Routes: /api/tickets/:id/messages
  const messagesMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/messages$/);
  if (messagesMatch) {
    const ticketIdOrNumber = messagesMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }

    const ticketRows = await ctx.sql`
      SELECT id, creator_id AS "creatorId", status FROM tickets
      WHERE id = ${ticketIdOrNumber} OR ticket_number = ${ticketIdOrNumber}
      LIMIT 1
    `;

    if (ticketRows.length === 0) {
      return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
    }

    const ticket = ticketRows[0] as { id: number | string; creatorId: number | string; status: string };

    if (user.role === 'User' && String(ticket.creatorId) !== String(user.id)) {
      return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke percakapan tiket ini.' } }, 403);
    }

    if (request.method === 'GET') {
      try {
        const rows = await ctx.sql`
          SELECT 
            m.id, 
            m.ticket_id AS "ticketId", 
            m.sender_id AS "senderId", 
            u.username AS "senderUsername",
            u.role AS "senderRole",
            m.message_text AS "messageText", 
            m.created_at AS "createdAt",
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', a.id,
                  'originalName', a.original_name,
                  'mimeType', a.mime_type,
                  'fileSize', a.file_size
                )
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'
            ) AS attachments
          FROM messages m
          JOIN users u ON m.sender_id = u.id
          LEFT JOIN attachments a ON a.message_id = m.id
          WHERE m.ticket_id = ${ticket.id}
          GROUP BY m.id, u.username, u.role
          ORDER BY m.created_at ASC, m.id ASC
        `;

        return json({ messages: rows });
      } catch (err) {
        console.error('Fetch messages error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil pesan tiket.' } }, 500);
      }
    }

    if (request.method === 'POST') {
      if (ticket.status === 'Closed') {
        return json({ error: { code: 'FORBIDDEN', message: 'Tiket telah ditutup dan bersifat read-only. Pesan baru tidak diizinkan.' } }, 403);
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
      }

      const validation = validateMessageInput(body);
      if (!validation.valid) {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'Pesan tidak valid.', details: validation.errors } }, 422);
      }

      const { messageText } = validation.data;

      try {
        const inserted = await ctx.sql`
          INSERT INTO messages (ticket_id, sender_id, message_text)
          VALUES (${ticket.id}, ${user.id}, ${messageText})
          RETURNING id, ticket_id AS "ticketId", sender_id AS "senderId", message_text AS "messageText", created_at AS "createdAt"
        `;

        const newMsg = inserted[0] as TicketMessage;
        newMsg.senderUsername = user.username;
        newMsg.senderRole = user.role;

        return json({ message: 'Pesan berhasil dikirim.', data: newMsg }, 201);
      } catch (err) {
        console.error('Send message error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengirim pesan.' } }, 500);
      }
    }

    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET, POST' });
  }

  // Upload Attachment: POST /api/tickets/:id/attachments
  const uploadMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/attachments$/);
  if (uploadMatch) {
    const ticketIdOrNumber = uploadMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (request.method !== 'POST') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'POST' });
    }

    const ticketRows = await ctx.sql`
      SELECT id, creator_id AS "creatorId", status FROM tickets
      WHERE id = ${ticketIdOrNumber} OR ticket_number = ${ticketIdOrNumber}
      LIMIT 1
    `;
    if (ticketRows.length === 0) {
      return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
    }

    const ticket = ticketRows[0] as { id: number | string; creatorId: number | string; status: string };

    if (ticket.status === 'Closed') {
      return json({ error: { code: 'FORBIDDEN', message: 'Tiket telah ditutup. Tidak dapat mengunggah berkas baru.' } }, 403);
    }

    if (user.role === 'User' && String(ticket.creatorId) !== String(user.id)) {
      return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke tiket ini.' } }, 403);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format formulir tidak valid.' } }, 400);
    }

    const files = formData.getAll('files') as File[];
    if (files.length === 0) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Tidak ada berkas yang diunggah.' } }, 422);
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return json({ error: { code: 'VALIDATION_ERROR', message: `Maksimal ${MAX_FILES_PER_UPLOAD} berkas per pengiriman.` } }, 422);
    }

    const messageId = formData.get('messageId')?.toString() || null;
    const uploadsDir = await ensureUploadsDirExists();
    const savedFiles: { originalName: string; storageName: string; mimeType: string; size: number; fullPath: string }[] = [];

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`Ukuran berkas '${file.name}' melebihi batas maksimal 10 MB.`);
        }

        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const detectedMime = detectMimeFromBytes(bytes);

        if (!detectedMime || !ALLOWED_MIME_TYPES.includes(detectedMime)) {
          throw new Error(`Tipe berkas '${file.name}' tidak didukung atau signature berkas tidak valid. Format yang diizinkan: JPG, PNG, WebP, PDF.`);
        }

        const storageName = generateStorageFilename(file.name);
        const fullPath = join(uploadsDir, storageName);

        await Bun.write(fullPath, bytes);
        savedFiles.push({
          originalName: file.name,
          storageName,
          mimeType: detectedMime,
          size: file.size,
          fullPath,
        });
      }

      // Persist in DB
      const insertedRows = [];
      for (const sf of savedFiles) {
        const inserted = await ctx.sql`
          INSERT INTO attachments (ticket_id, message_id, uploader_id, original_name, storage_path, mime_type, file_size)
          VALUES (${ticket.id}, ${messageId}, ${user.id}, ${sf.originalName}, ${sf.storageName}, ${sf.mimeType}, ${sf.size})
          RETURNING id, ticket_id AS "ticketId", message_id AS "messageId", uploader_id AS "uploaderId", original_name AS "originalName", mime_type AS "mimeType", file_size AS "fileSize", created_at AS "createdAt"
        `;
        insertedRows.push(inserted[0]);
      }

      return json({ message: 'Berkas berhasil diunggah.', attachments: insertedRows }, 201);
    } catch (err: any) {
      // Clean up staged files on disk in case of error
      for (const sf of savedFiles) {
        await safeDeleteFile(sf.fullPath);
      }
      return json({ error: { code: 'VALIDATION_ERROR', message: err.message || 'Gagal menyimpan berkas.' } }, 422);
    }
  }

  // Download / View Attachment: GET /api/attachments/:id
  const downloadMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (downloadMatch) {
    const attachmentId = downloadMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (request.method !== 'GET') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET' });
    }

    try {
      const rows = await ctx.sql`
        SELECT a.id, a.ticket_id AS "ticketId", a.original_name AS "originalName", a.storage_path AS "storagePath", a.mime_type AS "mimeType", t.creator_id AS "creatorId"
        FROM attachments a
        JOIN tickets t ON a.ticket_id = t.id
        WHERE a.id = ${attachmentId}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Lampiran tidak ditemukan.' } }, 404);
      }

      const att = rows[0] as { id: number | string; originalName: string; storagePath: string; mimeType: string; creatorId: number | string };

      if (user.role === 'User' && String(att.creatorId) !== String(user.id)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke berkas ini.' } }, 403);
      }

      const safeBasename = att.storagePath.replace(/^.*[\\\/]/, '');
      const filePath = join(getUploadsDir(), safeBasename);

      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return json({ error: { code: 'NOT_FOUND', message: 'Berkas fisik tidak ditemukan di penyimpanan server.' } }, 404);
      }

      const isInline = url.searchParams.get('view') === 'inline';
      const disposition = isInline ? 'inline' : `attachment; filename="${encodeURIComponent(att.originalName)}"`;

      return new Response(file, {
        headers: {
          'Content-Type': att.mimeType,
          'Content-Disposition': disposition,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-cache',
        },
      });
    } catch (err) {
      console.error('Download error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengunduh berkas.' } }, 500);
    }
  }

  // List Attachments for Ticket: GET /api/tickets/:id/attachments
  const listAttachmentsMatch = pathname.match(/^\/api\/tickets\/([^/]+)\/attachments$/);
  if (listAttachmentsMatch && request.method === 'GET') {
    const ticketIdOrNumber = listAttachmentsMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }

    try {
      const ticketRows = await ctx.sql`
        SELECT id, creator_id AS "creatorId" FROM tickets WHERE id = ${ticketIdOrNumber} OR ticket_number = ${ticketIdOrNumber} LIMIT 1
      `;
      if (ticketRows.length === 0) return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      const ticket = ticketRows[0] as { id: number | string; creatorId: number | string };

      if (user.role === 'User' && String(ticket.creatorId) !== String(user.id)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke berkas tiket ini.' } }, 403);
      }

      const rows = await ctx.sql`
        SELECT 
          a.id, a.ticket_id AS "ticketId", a.message_id AS "messageId", a.uploader_id AS "uploaderId", 
          u.username AS "uploaderUsername", a.original_name AS "originalName", a.mime_type AS "mimeType", 
          a.file_size AS "fileSize", a.created_at AS "createdAt"
        FROM attachments a
        JOIN users u ON a.uploader_id = u.id
        WHERE a.ticket_id = ${ticket.id}
        ORDER BY a.created_at ASC
      `;

      return json({ attachments: rows });
    } catch (err) {
      console.error('List attachments error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil lampiran tiket.' } }, 500);
    }
  }

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
          t.updated_at AS "updatedAt",
          CASE WHEN r.id IS NOT NULL THEN
            JSON_BUILD_OBJECT(
              'solution', r.solution,
              'resolverUsername', ru.username,
              'closedAt', r.closed_at
            )
          ELSE NULL END AS resolution
        FROM tickets t
        JOIN users u ON t.creator_id = u.id
        LEFT JOIN users a ON t.assignee_id = a.id
        LEFT JOIN resolutions r ON r.ticket_id = t.id
        LEFT JOIN users ru ON r.resolver_id = ru.id
        WHERE t.id = ${ticketIdOrNumber} OR t.ticket_number = ${ticketIdOrNumber}
        LIMIT 1
      `;

      if (rows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      }

      const ticket = rows[0] as Ticket;

      if (user.role === 'User' && String(ticket.creatorId) !== String(user.id)) {
        return json({ error: { code: 'FORBIDDEN', message: 'Anda tidak memiliki hak akses ke tiket ini.' } }, 403);
      }

      return json({ ticket });
    } catch (err) {
      console.error('Get ticket error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat mengambil detail tiket.' } }, 500);
    }
  }

  // Admin Routes (Super Admin Only)
  if (pathname === '/api/admin/users') {
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya Super Admin yang dapat mengakses manajemen pengguna.' } }, 403);
    }

    if (request.method === 'GET') {
      try {
        const rows = await ctx.sql`
          SELECT 
            id, nik, username, role, is_active AS "isActive", 
            must_change_password AS "mustChangePassword", created_at AS "createdAt"
          FROM users
          ORDER BY role ASC, created_at DESC
        `;
        return json({ users: rows });
      } catch (err) {
        console.error('List users error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengambil daftar pengguna.' } }, 500);
      }
    }

    if (request.method === 'POST') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
      }

      // Validasi input create IT Staff
      const { validateCreateITStaffInput } = await import('./admin');
      const validation = validateCreateITStaffInput(body);
      if (!validation.valid) {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'Data staf IT tidak valid.', details: validation.errors } }, 422);
      }

      const { nik, username, temporaryPassword } = validation.data;

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

        const passwordHash = await hashPassword(temporaryPassword);

        const inserted = await ctx.sql`
          INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
          VALUES (${nik}, ${username}, ${passwordHash}, 'IT Staff', TRUE, TRUE)
          RETURNING id, nik, username, role, is_active AS "isActive", must_change_password AS "mustChangePassword", created_at AS "createdAt"
        `;

        const newStaff = inserted[0];

        return json({
          message: 'Akun staf IT berhasil dibuat.',
          user: newStaff,
          temporaryPassword, // One-time display to Super Admin
        }, 201);
      } catch (err) {
        console.error('Create IT Staff error:', err);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan sistem saat membuat akun IT Staff.' } }, 500);
      }
    }

    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'GET, POST' });
  }

  // Update User: PATCH /api/admin/users/:id
  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (adminUserMatch) {
    const targetUserId = adminUserMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya Super Admin yang berhak mengelola akun.' } }, 403);
    }
    if (request.method !== 'PATCH') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'PATCH' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    if (typeof body !== 'object' || body === null) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid.' } }, 422);
    }

    const { isActive, nik, username } = body as Record<string, unknown>;

    try {
      const targetRows = await ctx.sql`SELECT id, nik, username, role, is_active AS "isActive" FROM users WHERE id = ${targetUserId} LIMIT 1`;
      if (targetRows.length === 0) {
        return json({ error: { code: 'NOT_FOUND', message: 'Pengguna tidak ditemukan.' } }, 404);
      }
      const targetUser = targetRows[0] as { id: number | string; nik: string; username: string; role: string; isActive: boolean };

      // Acceptance: Lindungi Super Admin aktif terakhir
      if (targetUser.role === 'Super Admin' && isActive === false) {
        const activeAdmins = await ctx.sql`
          SELECT COUNT(*)::int AS count FROM users WHERE role = 'Super Admin' AND is_active = TRUE
        `;
        if (activeAdmins[0].count <= 1) {
          return json({ error: { code: 'FORBIDDEN', message: 'Tidak dapat menonaktifkan Super Admin aktif terakhir.' } }, 403);
        }
      }

      // Acceptance: Akun IT dengan tiket aktif tidak boleh dinonaktifkan sebelum tiketnya dialihkan
      if (targetUser.role === 'IT Staff' && isActive === false) {
        const activeAssigned = await ctx.sql`
          SELECT COUNT(*)::int AS count FROM tickets WHERE assignee_id = ${targetUser.id} AND status IN ('Open', 'In Progress')
        `;
        if (activeAssigned[0].count > 0) {
          return json({
            error: {
              code: 'CONFLICT',
              message: `Staf IT masih memiliki ${activeAssigned[0].count} tiket aktif yang sedang ditangani. Alihkan penugasan tiket terlebih dahulu.`,
            },
          }, 409);
        }
      }

      // Jalankan update
      const updatedUserRows = await ctx.sql`
        UPDATE users
        SET 
          is_active = COALESCE(${typeof isActive === 'boolean' ? isActive : null}, is_active),
          nik = COALESCE(${typeof nik === 'string' && nik.trim() ? nik.trim() : null}, nik),
          username = COALESCE(${typeof username === 'string' && username.trim() ? username.trim() : null}, username),
          updated_at = NOW()
        WHERE id = ${targetUser.id}
        RETURNING id, nik, username, role, is_active AS "isActive", must_change_password AS "mustChangePassword"
      `;

      // Jika dinonaktifkan: Acceptance — cabut seluruh sesi aktifnya
      if (isActive === false) {
        await ctx.sql`DELETE FROM sessions WHERE user_id = ${targetUser.id}`;
      }

      return json({
        message: 'Data akun berhasil diperbarui.',
        user: updatedUserRows[0],
      });
    } catch (err) {
      console.error('Admin update user error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal memperbarui akun.' } }, 500);
    }
  }

  // Reassign Ticket: PATCH /api/admin/tickets/:id/assign
  const reassignMatch = pathname.match(/^\/api\/admin\/tickets\/([^/]+)\/assign$/);
  if (reassignMatch) {
    const ticketId = reassignMatch[1];
    const user = await getAuthUser();
    if (!user) {
      return json({ error: { code: 'UNAUTHORIZED', message: 'Silakan masuk terlebih dahulu.' } }, 401);
    }
    if (user.role !== 'Super Admin') {
      return json({ error: { code: 'FORBIDDEN', message: 'Hanya Super Admin yang dapat mengalihkan penugasan tiket.' } }, 403);
    }
    if (request.method !== 'PATCH') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } }, 405, { Allow: 'PATCH' });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: 'BAD_REQUEST', message: 'Format data JSON tidak valid.' } }, 400);
    }

    const { newAssigneeId, reason } = (body || {}) as Record<string, unknown>;
    if (!newAssigneeId) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Target penanggung jawab baru wajib ditentukan.' } }, 422);
    }

    try {
      const targetStaffRows = await ctx.sql`
        SELECT id, username, role, is_active AS "isActive" FROM users WHERE id = ${newAssigneeId} LIMIT 1
      `;
      if (targetStaffRows.length === 0 || !targetStaffRows[0].isActive || (targetStaffRows[0].role !== 'IT Staff' && targetStaffRows[0].role !== 'Super Admin')) {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'Staf IT tujuan tidak valid atau tidak aktif.' } }, 422);
      }

      const ticketRows = await ctx.sql`
        SELECT id, assignee_id AS "assigneeId", status FROM tickets WHERE id = ${ticketId} OR ticket_number = ${ticketId} LIMIT 1
      `;
      if (ticketRows.length === 0) return json({ error: { code: 'NOT_FOUND', message: 'Tiket tidak ditemukan.' } }, 404);
      const ticket = ticketRows[0];

      if (ticket.status === 'Closed') {
        return json({ error: { code: 'FORBIDDEN', message: 'Tiket sudah Closed, tidak dapat dialihkan.' } }, 403);
      }

      const oldAssigneeId = ticket.assigneeId;

      const updated = await ctx.sql`
        UPDATE tickets
        SET assignee_id = ${newAssigneeId}, status = 'In Progress', updated_at = NOW()
        WHERE id = ${ticket.id}
        RETURNING id, ticket_number AS "ticketNumber", assignee_id AS "assigneeId", status
      `;

      // Log audit
      await ctx.sql`
        INSERT INTO audit_logs (ticket_id, actor_id, action, old_value, new_value, reason)
        VALUES (
          ${ticket.id},
          ${user.id},
          'REASSIGN_TICKET',
          ${{ assigneeId: oldAssigneeId }},
          ${{ assigneeId: newAssigneeId }},
          ${typeof reason === 'string' && reason.trim() ? reason.trim() : 'Dialihkan oleh Super Admin.'}
        )
      `;

      return json({ message: 'Penugasan tiket berhasil dialihkan.', ticket: updated[0] });
    } catch (err) {
      console.error('Reassign error:', err);
      return json({ error: { code: 'INTERNAL_ERROR', message: 'Gagal mengalihkan tiket.' } }, 500);
    }
  }

  return json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404);
}
