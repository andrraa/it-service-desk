export interface ChangePasswordInput {
  currentPassword?: string;
  newPassword: string;
}

export function validateChangePasswordInput(
  input: unknown,
  isMustChange = false
): { valid: true; data: { currentPassword?: string; newPassword: string } } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { currentPassword, newPassword } = input as Record<string, unknown>;

  // If normal password change (not must_change_password), current password is required
  if (!isMustChange) {
    if (typeof currentPassword !== 'string' || currentPassword === '') {
      errors.currentPassword = 'Password saat ini wajib diisi.';
    }
  }

  if (typeof newPassword !== 'string' || newPassword === '') {
    errors.newPassword = 'Password baru wajib diisi.';
  } else if (newPassword.length < 12) {
    errors.newPassword = 'Password baru minimal 12 karakter.';
  }

  if (currentPassword && newPassword && currentPassword === newPassword) {
    errors.newPassword = 'Password baru tidak boleh sama dengan password saat ini.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      currentPassword: typeof currentPassword === 'string' ? currentPassword : undefined,
      newPassword: newPassword as string,
    },
  };
}
