export interface CreateITStaffInput {
  nik: string;
  username: string;
  temporaryPassword?: string;
}

export interface UpdateUserInput {
  nik?: string;
  username?: string;
  isActive?: boolean;
}

export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function validateCreateITStaffInput(input: unknown): { valid: true; data: { nik: string; username: string; temporaryPassword: string } } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { nik, username, temporaryPassword } = input as Record<string, unknown>;

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

  const pass = typeof temporaryPassword === 'string' && temporaryPassword.trim().length >= 12
    ? temporaryPassword.trim()
    : generateTemporaryPassword();

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      nik: (nik as string).trim(),
      username: (username as string).trim(),
      temporaryPassword: pass,
    },
  };
}
