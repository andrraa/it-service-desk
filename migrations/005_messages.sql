-- 005_messages.sql: Create messages table for ticket conversations

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id BIGINT NOT NULL REFERENCES users(id),
    message_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_ticket_id_created_at_idx ON messages (ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx ON messages (sender_id);
