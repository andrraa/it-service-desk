import { SQL } from 'bun';
import { handleRequest, readConfig } from './app';

const config = readConfig(process.env);
// https://bun.com/docs/runtime/sql#connection-pooling
const db = new SQL(config.databaseUrl, { max: 5, connectionTimeout: 2, idleTimeout: 30 });

async function checkDatabase() {
  const query = db`SELECT 1`.execute();
  const timeout = setTimeout(() => query.cancel(), 2000);
  try {
    await query;
  } finally {
    clearTimeout(timeout);
  }
}

// Bind locally until deployment/network policy is explicitly configured.
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: config.port,
  maxRequestBodySize: 64 * 1024,
  fetch: (request) => handleRequest(request, checkDatabase),
});
console.info(`IT Service Desk API: ${server.url}`);

async function shutdown() {
  await server.stop();
  await db.close({ timeout: 3 });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
