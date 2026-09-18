import { SQL } from 'bun';
import { runMigrations } from '../src/server/migrate';

export function testDatabaseUrl(env: Record<string, string | undefined>): URL {
  if (!env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL wajib diisi; database aplikasi tidak boleh dipakai untuk test.');
  let url: URL;
  try { url = new URL(env.TEST_DATABASE_URL); } catch { throw new Error('TEST_DATABASE_URL tidak valid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^\/[a-z0-9_]+_test$/.test(url.pathname)) {
    throw new Error('Database test wajib memakai nama berakhiran _test.');
  }
  if (env.DATABASE_URL && new URL(env.DATABASE_URL).pathname === url.pathname) {
    throw new Error('Database test tidak boleh sama dengan database aplikasi, termasuk melalui host alias.');
  }
  return url;
}

const cleanup = new WeakMap<SQL, () => Promise<void>>();

export async function openTestDatabase(): Promise<SQL> {
  const url = testDatabaseUrl(process.env);
  const admin = new SQL(url.toString());
  const schema = `test_${crypto.randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE SCHEMA ${schema}`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const sql = new SQL(url.toString());
  const close = async () => {
    await sql.close();
    try { await admin.unsafe(`DROP SCHEMA ${schema} CASCADE`); } finally { await admin.close(); }
  };
  cleanup.set(sql, close);
  try { await runMigrations(sql); } catch (error) { await close(); throw error; }
  return sql;
}

export async function closeTestDatabase(sql: SQL | undefined) {
  if (sql) await cleanup.get(sql)?.();
}
