import { SQL } from 'bun';
import { hashPassword } from '../src/server/auth';

export type AdminBootstrapEnv = Record<string, string | undefined>;

export async function bootstrapAdmin(env: AdminBootstrapEnv, sql: SQL) {
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;
  const fullName = env.ADMIN_FULL_NAME?.trim() || 'Super Administrator';

  if (!username || !password) {
    throw new Error('ADMIN_USERNAME dan ADMIN_PASSWORD wajib disediakan.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD minimal 12 karakter.');
  }

  const existing = await sql`
    SELECT id, username, role FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `;

  if (existing.length > 0) {
    const user = existing[0] as { id: number | string; username: string; role: string };
    return { created: false, message: `Akun Super Admin '${user.username}' sudah ada. Lewati bootstrap.` };
  }

  const passwordHash = await hashPassword(password);

  const inserted = await sql`
    INSERT INTO users (username, full_name, password_hash, role, is_active, must_change_password)
    VALUES (${username}, ${fullName}, ${passwordHash}, 'Super Admin', TRUE, FALSE)
    RETURNING id, username, full_name AS "fullName", role
  `;

  const createdUser = inserted[0] as { id: number | string; username: string; fullName: string; role: string };
  return {
    created: true,
    message: `Super Admin '${createdUser.username}' berhasil dibuat.`,
    user: { id: String(createdUser.id), username: createdUser.username, fullName: createdUser.fullName, role: createdUser.role },
  };
}

if (import.meta.main) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = new SQL(dbUrl);
  try {
    const result = await bootstrapAdmin(process.env, sql);
    console.info(result.message);
  } catch (err: any) {
    console.error('Bootstrap failed:', err.message || err);
    process.exit(1);
  } finally {
    await sql.close();
  }
}
