import { SQL } from 'bun';
import { handleRequest, readConfig } from './app';

const config = readConfig(process.env);
// https://bun.com/docs/runtime/sql#connection-pooling
const db = new SQL(config.databaseUrl, { max: 5, connectionTimeout: 2, idleTimeout: 30 });

// Listen on 0.0.0.0 in container or 127.0.0.1 locally
const server = Bun.serve({
  hostname: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '0.0.0.0'),
  port: config.port,
  maxRequestBodySize: 64 * 1024,
  fetch: (request) => handleRequest(request, { sql: db }),
});
console.info(`IT Service Desk API: ${server.url}`);

async function shutdown() {
  await server.stop();
  await db.close({ timeout: 3 });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
