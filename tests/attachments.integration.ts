import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';
import { safeDeleteFile } from '../src/server/attachments';

describe('Private Attachments Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const authHeaders = {
    'X-Requested-With': 'fetch',
  };

  let userAId: string;
  let userASession: string;
  let userBSession: string;
  let itStaffSession: string;
  let ticketAId: string;

  // Helpers to create valid mock files with magic bytes
  function createMockPng(name = 'test.png'): File {
    // 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    return new File([bytes], name, { type: 'image/png' });
  }

  function createMockPdf(name = 'doc.pdf'): File {
    // %PDF-
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    return new File([bytes], name, { type: 'application/pdf' });
  }

  function createMockSpoofedExe(): File {
    // MZ signature disguised as image/png
    const bytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    return new File([bytes], 'malware.png', { type: 'image/png' });
  }

  beforeAll(async () => {
    sql = await openTestDatabase();

    // Clean previous test data
    await sql`DELETE FROM attachments WHERE original_name LIKE 'test_%' OR original_name LIKE 'doc_%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'ATT_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'att_test_%'`;

    const passHash = await hashPassword('password_aman_att_123');

    // Create User A
    const uA = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('ATT_NIK_A', 'att_test_user_a', ${passHash}, 'User')
      RETURNING id
    `;
    userAId = String(uA[0].id);
    userASession = 'att_session_user_a';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userASession}, ${uA[0].id}, NOW() + INTERVAL '1 day')`;

    // Create User B
    const uB = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('ATT_NIK_B', 'att_test_user_b', ${passHash}, 'User')
      RETURNING id
    `;
    userBSession = 'att_session_user_b';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userBSession}, ${uB[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff
    const uIT = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('ATT_NIK_IT', 'att_test_it', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    itStaffSession = 'att_session_it';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaffSession}, ${uIT[0].id}, NOW() + INTERVAL '1 day')`;

    // Create ticket for User A
    const tA = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('ATT-TKT-01', ${userAId}, 'ATT_TKT_01', 'Ticket with attachments', 'High', 'Open')
      RETURNING id
    `;
    ticketAId = String(tA[0].id);
  });

  afterAll(async () => {
    // Delete files from storage
    const files = await sql`SELECT storage_path FROM attachments WHERE ticket_id = ${ticketAId}`;
    for (const f of files) {
      await safeDeleteFile(f.storage_path);
    }
    await sql`DELETE FROM attachments WHERE ticket_id = ${ticketAId}`;
    await sql`DELETE FROM tickets WHERE title LIKE 'ATT_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'att_test_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: uploads valid PNG and PDF attachments with randomized storage names', async () => {
    const formData = new FormData();
    formData.append('files', createMockPng('test_photo.png'));
    formData.append('files', createMockPdf('doc_report.pdf'));

    const req = new Request(`http://localhost/api/tickets/${ticketAId}/attachments`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        Cookie: `session_id=${userASession}`,
      },
      body: formData,
    });

    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.attachments.length).toBe(2);

    const [att1, att2] = body.attachments;
    expect(att1.originalName).toBe('test_photo.png');
    expect(att1.mimeType).toBe('image/png');
    expect(att2.originalName).toBe('doc_report.pdf');
    expect(att2.mimeType).toBe('application/pdf');
  });

  test('acceptance: rejects spoofed MIME type (fake image containing EXE bytes)', async () => {
    const formData = new FormData();
    formData.append('files', createMockSpoofedExe());

    const req = new Request(`http://localhost/api/tickets/${ticketAId}/attachments`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        Cookie: `session_id=${userASession}`,
      },
      body: formData,
    });

    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('signature berkas tidak valid');
  });

  test('acceptance: rejects upload with more than 5 files', async () => {
    const formData = new FormData();
    for (let i = 0; i < 6; i++) {
      formData.append('files', createMockPng(`test_${i}.png`));
    }

    const req = new Request(`http://localhost/api/tickets/${ticketAId}/attachments`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        Cookie: `session_id=${userASession}`,
      },
      body: formData,
    });

    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toContain('Maksimal 5 berkas');
  });

  test('acceptance: User B cannot download User A attachment, IT Staff can', async () => {
    // Get attachment id from User A's ticket
    const rows = await sql`SELECT id FROM attachments WHERE ticket_id = ${ticketAId} LIMIT 1`;
    const attachmentId = rows[0].id;

    // 1. User B download attempt
    const reqB = new Request(`http://localhost/api/attachments/${attachmentId}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userBSession}` },
    });
    const resB = await handleRequest(reqB, { sql });
    expect(resB.status).toBe(403);

    // 2. User A download (Authorized)
    const reqA = new Request(`http://localhost/api/attachments/${attachmentId}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userASession}` },
    });
    const resA = await handleRequest(reqA, { sql });
    expect(resA.status).toBe(200);
    expect(resA.headers.get('Content-Disposition')).toContain('attachment');
    expect(resA.headers.get('X-Content-Type-Options')).toBe('nosniff');

    // 3. IT Staff download (Authorized)
    const reqIT = new Request(`http://localhost/api/attachments/${attachmentId}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${itStaffSession}` },
    });
    const resIT = await handleRequest(reqIT, { sql });
    expect(resIT.status).toBe(200);
  });
});
