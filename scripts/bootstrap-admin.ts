import { SQL } from 'bun';
import { hashPassword } from '../src/server/auth';

export type AdminBootstrapEnv = Record<string, string | undefined>;

export async function bootstrapAdmin(env: AdminBootstrapEnv, sql: SQL) {
  const nik = env.ADMIN_NIK?.trim();
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;

  if (!nik || !username || !password) {
    throw new Error('ADMIN_NIK, ADMIN_USERNAME, dan ADMIN_PASSWORD wajib disediakan.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD minimal 12 karakter.');
  }

  // Check if an active Super Admin exists with this username or NIK
  const existing = await sql`
    SELECT id, username, nik, role FROM users
    WHERE nik = ${nik} OR LOWER(username) = LOWER(${username})
    LIMIT 1
  `;

  if (existing.length > 0) {
    const user = existing[0] as { id: number | string; username: string; nik: string; role: string };
    return { created: false, message: `Akun Super Admin '${user.username}' (NIK: ${user.nik}) sudah ada. Lewati bootstrap.` };
  }

  const passwordHash = await hashPassword(password);

  const inserted = await sql`
    INSERT INTO users (nik, username, password_hash, role, is_active, must_change_password)
    VALUES (${nik}, ${username}, ${passwordHash}, 'Super Admin', TRUE, FALSE)
    RETURNING id, nik, username, role
  `;

  const createdUser = inserted[0] as { id: number | string; username: string; nik: string; role: string };
  return {
    created: true,
    message: `Super Admin '${createdUser.username}' berhasil dibuat.`,
    user: { id: String(createdUser.id), username: createdUser.username, nik: createdUser.nik, role: createdUser.role },
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
