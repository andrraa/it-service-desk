export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type TicketStatus = 'Open' | 'In Progress' | 'Closed';

export interface Ticket {
  id: string;
  ticketNumber: string;
  creatorId: string;
  creatorUsername?: string;
  creatorNik?: string;
  assigneeId?: string | null;
  assigneeUsername?: string | null;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  priority: TicketPriority;
}

export function validateCreateTicketInput(input: unknown): { valid: true; data: CreateTicketInput } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { title, description, priority } = input as Record<string, unknown>;

  if (typeof title !== 'string' || title.trim() === '') {
    errors.title = 'Judul tiket wajib diisi.';
  } else if (title.trim().length < 5 || title.trim().length > 255) {
    errors.title = 'Judul tiket harus antara 5 dan 255 karakter.';
  }

  if (typeof description !== 'string' || description.trim() === '') {
    errors.description = 'Deskripsi kendala wajib diisi.';
  } else if (description.trim().length < 10) {
    errors.description = 'Deskripsi kendala minimal 10 karakter.';
  }

  const allowedPriorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Critical'];
  if (typeof priority !== 'string' || !allowedPriorities.includes(priority as TicketPriority)) {
    errors.priority = 'Prioritas harus salah satu dari: Low, Medium, High, Critical.';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      title: (title as string).trim(),
      description: (description as string).trim(),
      priority: priority as TicketPriority,
    },
  };
}

export function formatTicketNumber(seq: number): string {
  return `TKT-${String(seq).padStart(6, '0')}`;
}
