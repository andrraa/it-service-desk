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

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
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

export async function handleRequest(request: Request, checkDatabase: () => Promise<unknown>) {
  if (new URL(request.url).pathname !== '/api/health') {
    return json({ error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }, 404);
  }
  if (request.method !== 'GET') {
    return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Metode tidak diizinkan.' } },
      405, { Allow: 'GET' });
  }
  try {
    await checkDatabase();
    return json({ status: 'ok', database: 'connected' });
  } catch {
    return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Layanan sementara tidak tersedia.' } }, 503);
  }
}
