import { describe, expect, test } from 'bun:test';
import { handleRequest } from '../src/server/app';
import type { SQL } from 'bun';

function createMockSql(impl: (query: string, ...args: any[]) => any): SQL {
  const sqlMock = (async (strings: TemplateStringsArray, ...values: any[]) => {
    return impl(strings.join('?'), ...values);
  }) as unknown as SQL;
  return sqlMock;
}

describe('Ticket Endpoints (/api/tickets)', () => {
  test('POST /api/tickets requires authentication', async () => {
    const mockSql = createMockSql(() => []);
    const req = new Request('http://localhost/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ title: 'Kendala Jaringan', description: 'Koneksi internet lambat di lantai 2', priority: 'High' }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(401);
  });

  test('POST /api/tickets creates ticket with TKT-000001 format and Open status', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM sessions')) {
        return [{ id: '1', nik: '00123', username: 'johndoe', role: 'User', isActive: true, mustChangePassword: false, createdAt: new Date().toISOString() }];
      }
      if (query.includes('ticket_number_seq')) {
        return [{ seq: 1 }];
      }
      if (query.includes('INSERT INTO tickets')) {
        return [{
          id: '1',
          ticketNumber: 'TKT-000001',
          creatorId: '1',
          title: 'Kendala Jaringan Kantor',
          description: 'Koneksi internet putus-putus di ruang rapat utama',
          priority: 'High',
          status: 'Open',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/tickets', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Kendala Jaringan Kantor',
        description: 'Koneksi internet putus-putus di ruang rapat utama',
        priority: 'High',
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'fetch',
        Cookie: 'session_id=valid_token',
      },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket.ticketNumber).toBe('TKT-000001');
    expect(body.ticket.status).toBe('Open');
    expect(body.ticket.priority).toBe('High');
  });

  test('GET /api/tickets lists tickets without querying removed NIK column', async () => {
    const mockSql = createMockSql((query) => {
      expect(query).not.toContain('.nik');
      if (query.includes('FROM sessions')) {
        return [{ id: '1', username: 'user_a', role: 'User', isActive: true, mustChangePassword: false, createdAt: new Date().toISOString() }];
      }
      if (query.includes('COUNT(*)')) return [{ count: 1 }];
      if (query.includes('FROM tickets')) {
        return [{ id: '2', ticketNumber: 'TKT-000002', creatorId: '1', creatorUsername: 'user_a', title: 'Laptop error', description: 'Layar laptop bergaris', priority: 'Medium', status: 'Open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      }
      return [];
    });

    const res = await handleRequest(new Request('http://localhost/api/tickets?mine=true', {
      headers: { Cookie: 'session_id=valid_token' },
    }), { sql: mockSql });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets).toHaveLength(1);
  });

  test('GET /api/tickets/:id forbids User from viewing other user tickets', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM sessions')) {
        return [{ id: '1', nik: '00123', username: 'user_a', role: 'User', isActive: true, mustChangePassword: false, createdAt: new Date().toISOString() }];
      }
      if (query.includes('FROM tickets')) {
        return [{
          id: '2',
          ticketNumber: 'TKT-000002',
          creatorId: '99', // owned by user 99, not user 1
          title: 'Laptop error',
          description: 'Layar laptop bergaris',
          priority: 'Medium',
          status: 'Open',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/tickets/2', {
      method: 'GET',
      headers: { Cookie: 'session_id=valid_token' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/tickets/:id allows IT Staff to view tickets of any user', async () => {
    const mockSql = createMockSql((query) => {
      if (query.includes('FROM sessions')) {
        return [{ id: '10', nik: '00055', username: 'it_staff_1', role: 'IT Staff', isActive: true, mustChangePassword: false, createdAt: new Date().toISOString() }];
      }
      if (query.includes('FROM tickets')) {
        return [{
          id: '2',
          ticketNumber: 'TKT-000002',
          creatorId: '99',
          creatorUsername: 'employee_99',
          title: 'Laptop error',
          description: 'Layar laptop bergaris',
          priority: 'Medium',
          status: 'Open',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }];
      }
      return [];
    });

    const req = new Request('http://localhost/api/tickets/2', {
      method: 'GET',
      headers: { Cookie: 'session_id=valid_token' },
    });

    const res = await handleRequest(req, { sql: mockSql });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.ticketNumber).toBe('TKT-000002');
  });
});
