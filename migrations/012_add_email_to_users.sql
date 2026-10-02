-- 012_add_email_to_users.sql: alamat email per pengguna, dipakai untuk notifikasi tiket.
-- Nullable: akun lama (dibuat sebelum email wajib) tetap valid sampai alamatnya diisi.
-- Sengaja tanpa UNIQUE agar satu mailbox bersama boleh dipakai beberapa akun.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
