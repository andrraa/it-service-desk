-- 009_add_full_name_to_users.sql: Add full_name column to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(128);

-- Backfill existing users using capitalized username
UPDATE users SET full_name = INITCAP(REPLACE(username, '.', ' ')) WHERE full_name IS NULL;
