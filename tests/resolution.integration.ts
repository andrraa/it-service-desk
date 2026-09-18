import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';

describe('Ticket Resolution & Closed History Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let userAId: string;
  let userASession: string;
  let itStaff1Id: string;
  let itStaff1Session: string;
  let itStaff2Session: string;
  let adminSession: string;

  beforeAll(async () => {
    sql = await openTestDatabase();

    // Clean previous test data
    await sql`DELETE FROM resolutions WHERE solution LIKE 'TEST_SOL_%'`;
    await sql`DELETE FROM audit_logs WHERE reason LIKE 'TEST_SOL_%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'RES_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'res_test_%'`;

    const passHash = await hashPassword('password_aman_res_123');

    // Create User A
    const uA = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('RES_U_A', 'res_test_user_a', ${passHash}, 'User')
      RETURNING id
    `;
    userAId = String(uA[0].id);
    userASession = 'res_session_user_a';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userASession}, ${uA[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff 1 (Assignee)
    const it1 = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('RES_IT_1', 'res_test_it_1', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    itStaff1Id = String(it1[0].id);
    itStaff1Session = 'res_session_it_1';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaff1Session}, ${it1[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff 2 (Non-Assignee)
    const it2 = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('RES_IT_2', 'res_test_it_2', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    itStaff2Session = 'res_session_it_2';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaff2Session}, ${it2[0].id}, NOW() + INTERVAL '1 day')`;

    // Create Super Admin
    const adm = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('RES_ADM', 'res_test_admin', ${passHash}, 'Super Admin')
      RETURNING id
    `;
    adminSession = 'res_session_admin';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${adminSession}, ${adm[0].id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM resolutions WHERE solution LIKE 'TEST_SOL_%'`;
    await sql`DELETE FROM audit_logs WHERE reason LIKE 'TEST_SOL_%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'RES_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'res_test_%'`;
    await closeTestDatabase(sql);
  });

  test('acceptance: closing ticket requires mandatory solution (min 10 chars)', async () => {
    const t = await sql`
      INSERT INTO tickets (ticket_number, creator_id, assignee_id, title, description, priority, status)
      VALUES ('RES-TKT-01', ${userAId}, ${itStaff1Id}, 'RES_TKT_01', 'Printer tidak mendeteksi tinta', 'Medium', 'In Progress')
      RETURNING id
    `;
    const ticketId = t[0].id;

    // 1. Empty solution is rejected
    const emptyRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaff1Session}` },
      body: JSON.stringify({ solution: '' }),
    }), { sql });
    expect(emptyRes.status).toBe(422);

    // 2. Too short solution is rejected (< 10 chars)
    const shortRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaff1Session}` },
      body: JSON.stringify({ solution: 'Beres' }),
    }), { sql });
    expect(shortRes.status).toBe(422);
  });

  test('acceptance: non-assignee IT staff and regular user cannot close ticket (only assignee or Admin)', async () => {
    const t = await sql`SELECT id FROM tickets WHERE ticket_number = 'RES-TKT-01'`;
    const ticketId = t[0].id;

    // Regular user attempt
    const userRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({ solution: 'TEST_SOL_HACK: Mencoba menutup sendiri' }),
    }), { sql });
    expect(userRes.status).toBe(403);

    // Other IT staff attempt (not the assignee)
    const otherItRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaff2Session}` },
      body: JSON.stringify({ solution: 'TEST_SOL_OTHER_IT: Mengambil alih penutupan' }),
    }), { sql });
    expect(otherItRes.status).toBe(403);
  });

  test('acceptance: valid close updates status to Closed, stores resolution, logs audit atomically, and enforces read-only', async () => {
    const t = await sql`SELECT id FROM tickets WHERE ticket_number = 'RES-TKT-01'`;
    const ticketId = t[0].id;

    // 1. Assignee closes the ticket with detailed solution
    const closeRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaff1Session}` },
      body: JSON.stringify({
        solution: 'TEST_SOL_OK: Cartridge tinta diganti baru dan head printer telah dikalibrasi.',
      }),
    }), { sql });
    expect(closeRes.status).toBe(200);

    // 2. Verify in database: status is Closed and resolution exists
    const dbTicket = await sql`SELECT status FROM tickets WHERE id = ${ticketId}`;
    expect(dbTicket[0].status).toBe('Closed');

    const dbRes = await sql`SELECT * FROM resolutions WHERE ticket_id = ${ticketId}`;
    expect(dbRes.length).toBe(1);
    expect(dbRes[0].solution).toContain('Cartridge tinta diganti baru');

    // 3. Verify audit log has CLOSE_TICKET
    const auditLogs = await sql`SELECT * FROM audit_logs WHERE ticket_id = ${ticketId} AND action = 'CLOSE_TICKET'`;
    expect(auditLogs.length).toBe(1);

    // 4. Read-only enforcement: sending message to this Closed ticket must be rejected
    const msgRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({ messageText: 'Bisa minta tolong lagi?' }),
    }), { sql });
    expect(msgRes.status).toBe(403);

    // 5. Read-only enforcement: changing priority of Closed ticket must be rejected
    const prioRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/priority`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${itStaff1Session}` },
      body: JSON.stringify({ priority: 'Critical', reason: 'Emergency' }),
    }), { sql });
    expect(prioRes.status).toBe(403);

    // 6. User A views ticket detail: resolution data is present in response
    const detailRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userASession}` },
    }), { sql });
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.ticket.status).toBe('Closed');
    expect(detailBody.ticket.resolution).toBeDefined();
    expect(detailBody.ticket.resolution.solution).toContain('Cartridge tinta diganti baru');
    expect(detailBody.ticket.resolution.resolverUsername).toBe('res_test_it_1');
  });

  test('acceptance: Super Admin can close tickets assigned to any staff', async () => {
    // Ticket in progress assigned to IT 2
    const t = await sql`
      INSERT INTO tickets (ticket_number, creator_id, assignee_id, title, description, priority, status)
      VALUES ('RES-TKT-ADM', ${userAId}, (SELECT id FROM users WHERE username = 'res_test_it_2'), 'RES_TKT_Admin_Close', 'Perlu bantuan eskalasi admin', 'High', 'In Progress')
      RETURNING id
    `;
    const ticketId = t[0].id;

    // Super Admin executes close
    const res = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/close`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${adminSession}` },
      body: JSON.stringify({
        solution: 'TEST_SOL_ADM: Diselesaikan langsung melalui eskalasi hak akses Super Admin.',
      }),
    }), { sql });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.status).toBe('Closed');
  });
});
