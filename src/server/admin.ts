export interface CreateITStaffInput {
  username: string;
  fullName: string;
  temporaryPassword?: string;
}

export interface UpdateUserInput {
  username?: string;
  fullName?: string;
  isActive?: boolean;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function validateCreateITStaffInput(input: unknown): { valid: true; data: { username: string; fullName: string; temporaryPassword: string } } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { username, fullName, temporaryPassword } = input as Record<string, unknown>;

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

  const pass = typeof temporaryPassword === 'string' && temporaryPassword.trim().length >= 12
    ? temporaryPassword.trim()
    : generateTemporaryPassword();

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      username: (username as string).trim(),
      fullName: (fullName as string).trim(),
      temporaryPassword: pass,
    },
  };
}
