import { describe, expect, test } from 'bun:test';
import { validateRegisterInput, hashPassword, verifyPassword } from '../src/server/auth';

describe('Auth validation and hashing', () => {
  test('rejects missing or blank NIK, username, or password', () => {
    const res = validateRegisterInput({});
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.nik).toBeDefined();
      expect(res.errors.username).toBeDefined();
      expect(res.errors.password).toBeDefined();
    }
  });

  test('preserves leading zeros in NIK string', () => {
    const res = validateRegisterInput({
      nik: '0012345',
      username: 'john_doe',
      password: 'password_super_aman_123',
    });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.data.nik).toBe('0012345');
    }
  });

  test('rejects password shorter than 12 characters', () => {
    const res = validateRegisterInput({
      nik: '0012345',
      username: 'john_doe',
      password: 'short',
    });
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.password).toBe('Password minimal 12 karakter.');
    }
  });

  test('hashes password with Argon2id and verifies correctly', async () => {
    const pass = 'superSecretPassword123!';
    const hash = await hashPassword(pass);
    expect(hash.startsWith('$argon2id$')).toBe(true);

    const isMatch = await verifyPassword(pass, hash);
    expect(isMatch).toBe(true);

    const isWrong = await verifyPassword('wrongpassword', hash);
    expect(isWrong).toBe(false);
  });
});
