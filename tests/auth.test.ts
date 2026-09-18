import { describe, expect, test } from 'bun:test';
import { validateRegisterInput, hashPassword, verifyPassword, toTitleCase } from '../src/server/auth';

describe('Auth validation and hashing', () => {
  test('rejects missing or blank NIK, username, or password', () => {
    const res = validateRegisterInput({});
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.errors.nik).toBeDefined();
      expect(res.errors.username).toBeDefined();
      expect(res.errors.fullName).toBeDefined();
      expect(res.errors.password).toBeDefined();
    }
  });

  test('preserves leading zeros and dots in NIK string', () => {
    const res = validateRegisterInput({
      nik: '00.123.456',
      fullName: 'john doe',
      username: 'john_doe',
      password: 'password_super_aman_123',
    });
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.data.nik).toBe('00.123.456');
      expect(res.data.fullName).toBe('John Doe');
    }
  });

  test('formats full name to Title Case / UC Words', () => {
    expect(toTitleCase('budi santoso pratama')).toBe('Budi Santoso Pratama');
    expect(toTitleCase('ANDRA WIJAYA')).toBe('Andra Wijaya');
    expect(toTitleCase('   siti   nurhaliza   ')).toBe('Siti Nurhaliza');
  });

  test('rejects password shorter than 12 characters', () => {
    const res = validateRegisterInput({
      nik: '0012345',
      fullName: 'John Doe',
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
