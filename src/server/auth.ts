import type { SQL } from 'bun';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: 'User' | 'IT Staff' | 'Super Admin';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface RegisterInput {
  fullName: string;
  username: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

/**
 * Converts a string to Title Case / Upper Case Words (e.g. "john doe" -> "John Doe")
 */
export function toTitleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function validateRegisterInput(input: unknown): { valid: true; data: RegisterInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { fullName, username, password } = input as Record<string, unknown>;

  if (typeof fullName !== 'string' || fullName.trim() === '') {
    errors.fullName = 'Nama lengkap wajib diisi.';
  } else if (fullName.trim().length < 2 || fullName.trim().length > 128) {
    errors.fullName = 'Nama lengkap harus antara 2 dan 128 karakter.';
  }

  if (typeof username !== 'string' || username.trim() === '') {
    errors.username = 'Username wajib diisi.';
  } else if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
    errors.username = 'Username harus 3-32 karakter (hanya huruf, angka, titik, underscore, tanda hubung).';
  }

  if (typeof password !== 'string' || password === '') {
    errors.password = 'Password wajib diisi.';
  } else if (password.length > 1024) {
    errors.password = 'Password maksimal 1024 karakter.';
  } else if (password.length < 12) {
    errors.password = 'Password minimal 12 karakter.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      fullName: toTitleCase(fullName as string),
      username: (username as string).trim(),
      password: password as string,
    },
  };
}

export function validateLoginInput(input: unknown): { valid: true; data: LoginInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { username, password } = input as Record<string, unknown>;

  if (typeof username !== 'string' || username.trim() === '') {
    errors.username = 'Username wajib diisi.';
  }

  if (typeof password !== 'string' || password === '') {
    errors.password = 'Password wajib diisi.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      username: (username as string).trim(),
      password: password as string,
    },
  };
}

export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'argon2id',
    memoryCost: 65536,
    timeCost: 2,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

export function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name && rest.length > 0) {
      try {
        cookies[name] = decodeURIComponent(rest.join('='));
      } catch {
        continue;
      }
    }
  }
  return cookies;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number = 7 * 24 * 3600): string {
  const parts = [
    `session_id=${token}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookie(): string {
  return 'session_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
}

export async function getSessionUser(sql: SQL, token: string): Promise<User | null> {
  const rows = await sql`
    SELECT 
      u.id, 
      u.username, 
      COALESCE(u.full_name, u.username) AS "fullName",
      u.role, 
      u.is_active AS "isActive", 
      u.must_change_password AS "mustChangePassword", 
      u.created_at AS "createdAt",
      s.expires_at AS "sessionExpiresAt"
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ${token} AND s.expires_at > NOW() AND u.is_active = TRUE
    LIMIT 1
  `;

  if (rows.length === 0) return null;
  const row = rows[0] as {
    id: number | string;
    username: string;
    fullName: string;
    role: 'User' | 'IT Staff' | 'Super Admin';
    isActive: boolean;
    mustChangePassword: boolean;
    createdAt: string;
  };

  return {
    id: String(row.id),
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
  };
}
