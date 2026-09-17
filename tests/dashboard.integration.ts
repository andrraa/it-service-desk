import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest } from '../src/server/app';
import { openTestDatabase, closeTestDatabase } from './database';
import { hashPassword } from '../src/server/auth';

describe('Dashboard & Claim Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let userSession: string;
  let it1Session: string;
  let it2Session: string;

  beforeAll(async () => {
    sql = await openTestDatabase();


    const passHash = await hashPassword('password_aman_dash_123');

    // Create User
    const u = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('DASH_U1', 'dash_test_user', ${passHash}, 'User')
      RETURNING id
    `;
    userSession = 'dash_session_user';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userSession}, ${u[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff 1
    const it1 = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('DASH_IT1', 'dash_test_it1', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    it1Session = 'dash_session_it1';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${it1Session}, ${it1[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff 2
    const it2 = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('DASH_IT2', 'dash_test_it2', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    it2Session = 'dash_session_it2';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${it2Session}, ${it2[0].id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await closeTestDatabase(sql);
  });

  test('acceptance: regular User is forbidden from accessing dashboard summary or queue', async () => {
    const summaryRes = await handleRequest(new Request('http://localhost/api/dashboard/summary', {
      method: 'GET',
      headers: { Cookie: `session_id=${userSession}` },
    }), { sql });
    expect(summaryRes.status).toBe(403);

    const queueRes = await handleRequest(new Request('http://localhost/api/dashboard/queue', {
      method: 'GET',
      headers: { Cookie: `session_id=${userSession}` },
    }), { sql });
    expect(queueRes.status).toBe(403);
  });

  test('acceptance: FIFO queue strictly orders Critical -> High -> Medium -> Low, then created_at, then ID', async () => {
    // Insert tickets in reverse priority order
    await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status, created_at)
      VALUES 
        ('DASH-LOW-1', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_Low_1', 'Desc', 'Low', 'Open', NOW() - INTERVAL '10 minutes'),
        ('DASH-MED-1', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_Med_1', 'Desc', 'Medium', 'Open', NOW() - INTERVAL '5 minutes'),
        ('DASH-HIGH-1', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_High_1', 'Desc', 'High', 'Open', NOW() - INTERVAL '3 minutes'),
        ('DASH-CRIT-1', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_Crit_1', 'Desc', 'Critical', 'Open', NOW() - INTERVAL '1 minute')
    `;

    const res = await handleRequest(new Request('http://localhost/api/dashboard/queue', {
      method: 'GET',
      headers: { Cookie: `session_id=${it1Session}` },
    }), { sql });

    expect(res.status).toBe(200);
    const body = await res.json();
    const priorities = body.queue.filter((t: any) => t.title.startsWith('DASH_')).map((t: any) => t.priority);

    // Must be Critical, High, Medium, Low
    expect(priorities).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });

  test('acceptance: race condition claim — when two IT staff claim the same Open ticket, exactly one succeeds', async () => {
    // Create an unassigned Open ticket
    const inserted = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('DASH-RACE-01', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_Race_Ticket', 'Deskripsi race test', 'High', 'Open')
      RETURNING id
    `;
    const ticketId = inserted[0].id;

    // Both IT 1 and IT 2 claim at the same time
    const claim1 = handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/claim`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${it1Session}` },
    }), { sql });

    const claim2 = handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/claim`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${it2Session}` },
    }), { sql });

    const [res1, res2] = await Promise.all([claim1, claim2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one 200 (Success) and one 409 (Conflict)
    expect(statuses).toEqual([200, 409]);

    // Verify audit log recorded the claim
    const auditLogs = await sql`SELECT * FROM audit_logs WHERE ticket_id = ${ticketId} AND action = 'CLAIM_TICKET'`;
    expect(auditLogs.length).toBe(1);
  });

  test('acceptance: changing priority requires reason, updates priority, and writes audit log', async () => {
    const inserted = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('DASH-PRIO-01', (SELECT id FROM users WHERE username = 'dash_test_user'), 'DASH_Prio_Test', 'Deskripsi', 'Medium', 'Open')
      RETURNING id
    `;
    const ticketId = inserted[0].id;

    // 1. Missing or short reason is rejected
    const invalidReq = new Request(`http://localhost/api/tickets/${ticketId}/priority`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${it1Session}` },
      body: JSON.stringify({ priority: 'Critical', reason: '' }),
    });
    const invalidRes = await handleRequest(invalidReq, { sql });
    expect(invalidRes.status).toBe(422);

    // 2. Valid priority update with reason
    const validReq = new Request(`http://localhost/api/tickets/${ticketId}/priority`, {
      method: 'PATCH',
      headers: { ...authHeaders, Cookie: `session_id=${it1Session}` },
      body: JSON.stringify({
        priority: 'Critical',
        reason: 'TEST_AUDIT_REASON: Server database mati total memblokir operasional kantor',
      }),
    });
    const validRes = await handleRequest(validReq, { sql });
    expect(validRes.status).toBe(200);
    const body = await validRes.json();
    expect(body.ticket.priority).toBe('Critical');

    // 3. Verify in audit logs
    const logs = await sql`
      SELECT * FROM audit_logs 
      WHERE ticket_id = ${ticketId} AND action = 'CHANGE_PRIORITY'
    `;
    expect(logs.length).toBe(1);
    expect(logs[0].old_value.priority).toBe('Medium');
    expect(logs[0].new_value.priority).toBe('Critical');
    expect(logs[0].reason).toContain('Server database mati total');
  });
});
