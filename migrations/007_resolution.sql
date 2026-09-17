-- 007_resolution.sql: Create resolutions table for closed ticket documentation

CREATE TABLE IF NOT EXISTS resolutions (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    resolver_id BIGINT NOT NULL REFERENCES users(id),
    solution TEXT NOT NULL,
    closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resolutions_ticket_id_idx ON resolutions (ticket_id);
CREATE INDEX IF NOT EXISTS resolutions_resolver_id_idx ON resolutions (resolver_id);
