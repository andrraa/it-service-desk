import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';
import { hashPassword } from '../src/server/auth';

describe('Tickets Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let userASession: string;
  let userBSession: string;
  let itStaffSession: string;

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);

    // Clean previous test data
    await sql`DELETE FROM tickets WHERE title LIKE 'TEST_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'tkt_test_%'`;

    const passHash = await hashPassword('password_aman_tkt_123');

    // Create User A
    const uA = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('TKT_A', 'tkt_test_user_a', ${passHash}, 'User')
      RETURNING id
    `;
    const sAId = 'tkt_session_user_a';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sAId}, ${uA[0].id}, NOW() + INTERVAL '1 day')`;
    userASession = sAId;

    // Create User B
    const uB = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('TKT_B', 'tkt_test_user_b', ${passHash}, 'User')
      RETURNING id
    `;
    const sBId = 'tkt_session_user_b';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sBId}, ${uB[0].id}, NOW() + INTERVAL '1 day')`;
    userBSession = sBId;

    // Create IT Staff
    const uIT = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('TKT_IT', 'tkt_test_staff', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    const sITId = 'tkt_session_staff';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sITId}, ${uIT[0].id}, NOW() + INTERVAL '1 day')`;
    itStaffSession = sITId;
  });

  afterAll(async () => {
    await sql`DELETE FROM tickets WHERE title LIKE 'TEST_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'tkt_test_%'`;
    await sql.close();
  });

  test('acceptance: creates tickets with sequential unique numbers and status Open', async () => {
    const req = new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({
        title: 'TEST_TKT_01: Jaringan WiFi Rusak',
        description: 'Tidak bisa connect ke SSID kantor sejak pagi.',
        priority: 'High',
      }),
    });
    const res = await handleRequest(req, { sql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.ticketNumber).toMatch(/^TKT-\d{6}$/);
    expect(body.ticket.status).toBe('Open');
    expect(body.ticket.priority).toBe('High');
  });

  test('acceptance: User B cannot access User A ticket via GET /api/tickets/:id', async () => {
    // 1. User A creates a ticket
    const createReq = new Request('http://localhost/api/tickets', {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({
        title: 'TEST_TKT_PRIVACY: Private Ticket A',
        description: 'Data rahasia User A jangan sampai terbaca orang lain.',
        priority: 'Medium',
      }),
    });
    const createRes = await handleRequest(createReq, { sql });
    expect(createRes.status).toBe(201);
    const { ticket } = await createRes.json();

    // 2. User B tries to access ticket of User A
    const getReqB = new Request(`http://localhost/api/tickets/${ticket.id}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userBSession}` },
    });
    const getResB = await handleRequest(getReqB, { sql });
    expect(getResB.status).toBe(403);
    const bodyB = await getResB.json();
    expect(bodyB.error.code).toBe('FORBIDDEN');

    // 3. IT Staff CAN access ticket of User A
    const getReqIT = new Request(`http://localhost/api/tickets/${ticket.id}`, {
      method: 'GET',
      headers: { Cookie: `session_id=${itStaffSession}` },
    });
    const getResIT = await handleRequest(getReqIT, { sql });
    expect(getResIT.status).toBe(200);
  });

  test('acceptance: search and pagination in GET /api/tickets', async () => {
    // Search by keyword
    const searchReq = new Request('http://localhost/api/tickets?q=WiFi', {
      method: 'GET',
      headers: { Cookie: `session_id=${userASession}` },
    });
    const searchRes = await handleRequest(searchReq, { sql });
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    expect(searchBody.tickets.length).toBeGreaterThan(0);
    expect(searchBody.tickets[0].title).toContain('WiFi');

    // Pagination test (limit=1, page=1)
    const pageReq = new Request('http://localhost/api/tickets?limit=1&page=1', {
      method: 'GET',
      headers: { Cookie: `session_id=${userASession}` },
    });
    const pageRes = await handleRequest(pageReq, { sql });
    expect(pageRes.status).toBe(200);
    const pageBody = await pageRes.json();
    expect(pageBody.tickets.length).toBe(1);
    expect(pageBody.pagination.page).toBe(1);
    expect(pageBody.pagination.limit).toBe(1);
    expect(pageBody.pagination.total).toBeGreaterThan(1);
  });

  test('verification: concurrent ticket creation guarantees unique ticket numbers without conflict', async () => {
    const promises = Array.from({ length: 5 }).map((_, i) => {
      const req = new Request('http://localhost/api/tickets', {
        method: 'POST',
        headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
        body: JSON.stringify({
          title: `TEST_TKT_CONCURRENT_${i}: Mass ticket creation`,
          description: `Deskripsi tiket paralel ke-${i} untuk stress test sequence.`,
          priority: 'Low',
        }),
      });
      return handleRequest(req, { sql });
    });

    const responses = await Promise.all(promises);
    for (const r of responses) {
      expect(r.status).toBe(201);
    }
    const bodies = await Promise.all(responses.map(r => r.json()));
    const numbers = bodies.map(b => b.ticket.ticketNumber);

    // Verify all 5 numbers are distinct
    const uniqueNumbers = new Set(numbers);
    expect(uniqueNumbers.size).toBe(5);
  });
});
