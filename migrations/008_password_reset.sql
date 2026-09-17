-- 008_password_reset.sql: Create password_resets table for tracking temporary passwords

CREATE TABLE IF NOT EXISTS password_resets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id BIGINT NOT NULL REFERENCES users(id),
    temp_password_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_resets_user_id_idx ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS password_resets_expires_at_idx ON password_resets (expires_at);
