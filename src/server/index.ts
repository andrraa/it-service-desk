import { SQL } from 'bun';
import { join } from 'node:path';
import { handleRequest, readConfig, MAX_REQUEST_BODY_SIZE } from './app';

const config = readConfig(process.env);
// https://bun.com/docs/runtime/sql#connection-pooling
const db = new SQL(config.databaseUrl, { max: 5, connectionTimeout: 2, idleTimeout: 30 });

// Bind locally until deployment/network policy is explicitly configured.
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: config.port,
  maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
  fetch: async (request, server) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
      return handleRequest(request, { sql: db, clientAddress: server.requestIP(request)?.address ?? 'unknown' });
    }

    const distWeb = join(import.meta.dir, '../../dist/web');
    const requestedPath = join(distWeb, url.pathname);
    const file = Bun.file(requestedPath);
    if (await file.exists() && (await file.stat())?.isFile()) {
      return new Response(file);
    }

    const indexHtml = Bun.file(join(distWeb, 'index.html'));
    if (await indexHtml.exists()) {
      return new Response(indexHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return handleRequest(request, { sql: db, clientAddress: server.requestIP(request)?.address ?? 'unknown' });
  },
});
console.info(`IT Service Desk API: ${server.url}`);

async function shutdown() {
  await server.stop();
  await db.close({ timeout: 3 });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
