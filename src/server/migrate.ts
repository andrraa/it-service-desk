import { SQL } from 'bun';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function runMigrations(sql: SQL) {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const migrationsDir = join(import.meta.dir, '../../migrations');
  const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const existing = await sql`SELECT 1 FROM schema_migrations WHERE name = ${file}`;
    if (existing.length === 0) {
      const content = await readFile(join(migrationsDir, file), 'utf-8');
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      console.log(`Applied migration: ${file}`);
    }
  }
}

if (import.meta.main) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const sql = new SQL(dbUrl);
  try {
    await runMigrations(sql);
    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.close();
  }
}
