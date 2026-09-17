-- 001_users.sql: Create users table with NIK, username, password_hash, role, is_active, must_change_password

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    nik VARCHAR(64) NOT NULL,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'User',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_nik_unique UNIQUE (nik),
    CONSTRAINT users_username_unique_ci UNIQUE (username),
    CONSTRAINT users_role_check CHECK (role IN ('User', 'IT Staff', 'Super Admin'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));
