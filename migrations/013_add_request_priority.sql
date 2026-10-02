-- 013_add_request_priority.sql: izinkan "Request" sebagai tingkat prioritas.
-- Request = permintaan layanan (bukan gangguan), paling tidak mendesak: muncul di bawah Low.

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_priority_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_priority_check
    CHECK (priority IN ('Request', 'Low', 'Medium', 'High', 'Critical'));