-- 010_remove_nik.sql: Drop NIK column completely from users table

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_nik_unique;
DROP INDEX IF EXISTS users_nik_unique_idx;
ALTER TABLE users DROP COLUMN IF EXISTS nik CASCADE;
