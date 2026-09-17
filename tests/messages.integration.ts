import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { SQL } from 'bun';
import { handleRequest, readConfig } from '../src/server/app';
import { hashPassword } from '../src/server/auth';

describe('Messages & Conversation Integration Tests (Live PostgreSQL)', () => {
  let sql: SQL;
  const config = readConfig(process.env);
  const authHeaders = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'fetch',
  };

  let userAId: string;
  let userASession: string;
  let userBSession: string;
  let itStaffSession: string;

  beforeAll(async () => {
    sql = new SQL(config.databaseUrl);

    // Cleanup
    await sql`DELETE FROM messages WHERE message_text LIKE 'TEST_MSG_%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'MSG_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'msg_test_%'`;

    const passHash = await hashPassword('password_aman_msg_123');

    // Create User A
    const uA = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('MSG_NIK_A', 'msg_test_user_a', ${passHash}, 'User')
      RETURNING id
    `;
    userAId = String(uA[0].id);
    userASession = 'msg_session_user_a';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userASession}, ${uA[0].id}, NOW() + INTERVAL '1 day')`;

    // Create User B
    const uB = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('MSG_NIK_B', 'msg_test_user_b', ${passHash}, 'User')
      RETURNING id
    `;
    userBSession = 'msg_session_user_b';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${userBSession}, ${uB[0].id}, NOW() + INTERVAL '1 day')`;

    // Create IT Staff
    const uIT = await sql`
      INSERT INTO users (nik, username, password_hash, role)
      VALUES ('MSG_NIK_IT', 'msg_test_it', ${passHash}, 'IT Staff')
      RETURNING id
    `;
    itStaffSession = 'msg_session_it';
    await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${itStaffSession}, ${uIT[0].id}, NOW() + INTERVAL '1 day')`;
  });

  afterAll(async () => {
    await sql`DELETE FROM messages WHERE message_text LIKE 'TEST_MSG_%'`;
    await sql`DELETE FROM tickets WHERE title LIKE 'MSG_TKT_%'`;
    await sql`DELETE FROM users WHERE username LIKE 'msg_test_%'`;
    await sql.close();
  });

  test('acceptance: sending and retrieving messages in chronological order', async () => {
    // 1. User A creates a ticket
    const ticketRes = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('MSG-TKT-01', ${userAId}, 'MSG_TKT_Active', 'Deskripsi masalah', 'Medium', 'Open')
      RETURNING id
    `;
    const ticketId = ticketRes[0].id;

    // 2. User A sends first message
    const msg1Res = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({ messageText: 'TEST_MSG_1: Halo tim IT, kendala ini terjadi sejak kemarin.' }),
    }), { sql });
    expect(msg1Res.status).toBe(201);

    // 3. IT Staff responds
    const msg2Res = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${itStaffSession}` },
      body: JSON.stringify({ messageText: 'TEST_MSG_2: Halo, sudah kami terima. Sedang diperiksa kabel LAN Anda.' }),
    }), { sql });
    expect(msg2Res.status).toBe(201);

    // 4. Fetch messages: must be in chronological order
    const listRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userASession}` },
    }), { sql });
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.messages.length).toBe(2);
    expect(body.messages[0].messageText).toContain('TEST_MSG_1');
    expect(body.messages[1].messageText).toContain('TEST_MSG_2');
    expect(body.messages[0].senderUsername).toBe('msg_test_user_a');
    expect(body.messages[1].senderUsername).toBe('msg_test_it');
  });

  test('acceptance: empty or whitespace-only messages are strictly rejected with 422', async () => {
    const ticketRes = await sql`SELECT id FROM tickets WHERE ticket_number = 'MSG-TKT-01'`;
    const ticketId = ticketRes[0].id;

    const res = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({ messageText: '    ' }),
    }), { sql });

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.details.messageText).toBe('Pesan tidak boleh kosong.');
  });

  test('acceptance: other User cannot access or send messages in User A ticket', async () => {
    const ticketRes = await sql`SELECT id FROM tickets WHERE ticket_number = 'MSG-TKT-01'`;
    const ticketId = ticketRes[0].id;

    // Read attempt by User B
    const readRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'GET',
      headers: { Cookie: `session_id=${userBSession}` },
    }), { sql });
    expect(readRes.status).toBe(403);

    // Send attempt by User B
    const sendRes = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userBSession}` },
      body: JSON.stringify({ messageText: 'TEST_MSG_HACK: Pesan penyusup' }),
    }), { sql });
    expect(sendRes.status).toBe(403);
  });

  test('acceptance: Closed ticket strictly rejects new messages in backend', async () => {
    // Create a Closed ticket
    const ticketRes = await sql`
      INSERT INTO tickets (ticket_number, creator_id, title, description, priority, status)
      VALUES ('MSG-TKT-CLOSED', ${userAId}, 'MSG_TKT_Closed', 'Sudah beres', 'Low', 'Closed')
      RETURNING id
    `;
    const ticketId = ticketRes[0].id;

    // Send message to Closed ticket
    const res = await handleRequest(new Request(`http://localhost/api/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: { ...authHeaders, Cookie: `session_id=${userASession}` },
      body: JSON.stringify({ messageText: 'TEST_MSG_LATE: Halo apakah bisa dibuka kembali?' }),
    }), { sql });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('read-only');
  });
});
