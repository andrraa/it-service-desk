-- Request keys make retries safe after a response is lost. Existing rows remain valid.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_request_idx ON tickets (creator_id, request_id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS messages_request_idx ON messages (sender_id, request_id);
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS upload_id UUID;
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS upload_index INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS attachments_upload_idx ON attachments (uploader_id, upload_id, upload_index);
CREATE UNIQUE INDEX IF NOT EXISTS messages_ticket_relation_idx ON messages (id, ticket_id);
-- Enforce new writes without deleting or silently rewriting any legacy inconsistent rows.
ALTER TABLE attachments ADD CONSTRAINT attachments_message_ticket_fk
  FOREIGN KEY (message_id, ticket_id) REFERENCES messages (id, ticket_id) NOT VALID;
