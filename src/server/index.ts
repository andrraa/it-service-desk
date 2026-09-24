import { SQL } from 'bun';
import { join } from 'node:path';
import { handleRequest, readConfig, MAX_REQUEST_BODY_SIZE } from './app';
import { createTelegramNotifier } from './telegram';
import { createMailer } from './mailer';

const config = readConfig(process.env);
const notifier = config.telegram ? createTelegramNotifier(config.telegram, { appUrl: config.appUrl }) : undefined;
const mailer = config.mailer ? createMailer(config.mailer) : undefined;
// https://bun.com/docs/runtime/sql#connection-pooling
const db = new SQL(config.databaseUrl, { max: 5, connectionTimeout: 2, idleTimeout: 30 });

// Listen on 0.0.0.0 in container or 127.0.0.1 locally
const server = Bun.serve({
  hostname: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '0.0.0.0'),
  port: config.port,
  maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
  fetch: async (request, server) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api')) {
      return handleRequest(request, { sql: db, clientAddress: server.requestIP(request)?.address ?? 'unknown' }, { notifier, mailer });
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

    return handleRequest(request, { sql: db, clientAddress: server.requestIP(request)?.address ?? 'unknown' }, { notifier, mailer });
  },
});
console.info(`IT Service Desk API: ${server.url}`);

async function shutdown() {
  await server.stop();
  await notifier?.close();
  await mailer?.close();
  await db.close({ timeout: 3 });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
