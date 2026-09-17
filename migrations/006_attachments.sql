-- 006_attachments.sql: Create attachments table for storing private file metadata

CREATE TABLE IF NOT EXISTS attachments (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
    uploader_id BIGINT NOT NULL REFERENCES users(id),
    original_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(255) NOT NULL UNIQUE,
    mime_type VARCHAR(128) NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attachments_ticket_id_idx ON attachments (ticket_id);
CREATE INDEX IF NOT EXISTS attachments_message_id_idx ON attachments (message_id);
CREATE INDEX IF NOT EXISTS attachments_uploader_id_idx ON attachments (uploader_id);
