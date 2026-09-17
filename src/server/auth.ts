export interface User {
  id: string;
  nik: string;
  username: string;
  role: 'User' | 'IT Staff' | 'Super Admin';
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface RegisterInput {
  nik: string;
  username: string;
  password: string;
}

export function validateRegisterInput(input: unknown): { valid: true; data: RegisterInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { nik, username, password } = input as Record<string, unknown>;

  if (typeof nik !== 'string' || nik.trim() === '') {
    errors.nik = 'NIK wajib diisi.';
  } else if (!/^[0-9A-Za-z_-]{3,64}$/.test(nik.trim())) {
    errors.nik = 'Format NIK tidak valid (3-64 karakter alfanumerik/tanda hubung).';
  }

  if (typeof username !== 'string' || username.trim() === '') {
    errors.username = 'Username wajib diisi.';
  } else if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())) {
    errors.username = 'Username harus 3-32 karakter (hanya huruf, angka, titik, underscore, tanda hubung).';
  }

  if (typeof password !== 'string' || password === '') {
    errors.password = 'Password wajib diisi.';
  } else if (password.length < 12) {
    errors.password = 'Password minimal 12 karakter.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      nik: (nik as string).trim(),
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
