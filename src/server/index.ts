import { SQL } from 'bun';
import { handleRequest, readConfig, MAX_REQUEST_BODY_SIZE } from './app';

const config = readConfig(process.env);
// https://bun.com/docs/runtime/sql#connection-pooling
const db = new SQL(config.databaseUrl, { max: 5, connectionTimeout: 2, idleTimeout: 30 });

// Bind locally until deployment/network policy is explicitly configured.
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: config.port,
  maxRequestBodySize: MAX_REQUEST_BODY_SIZE,
  fetch: (request, server) => handleRequest(request, { sql: db, clientAddress: server.requestIP(request)?.address ?? 'unknown' }),
});
console.info(`IT Service Desk API: ${server.url}`);

async function shutdown() {
  await server.stop();
  await db.close({ timeout: 3 });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
