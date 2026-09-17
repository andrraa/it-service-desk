export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderUsername: string;
  senderRole: string;
  messageText: string;
  createdAt: string;
  attachments?: {
    id: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }[];
}

export function validateMessageInput(input: unknown, hasAttachments = false): { valid: true; data: { messageText: string } } | { valid: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: { _form: 'Payload tidak valid.' } };
  }

  const { messageText } = input as Record<string, unknown>;

  // PRD: Pesan dapat berisi teks, lampiran, atau keduanya; pesan kosong tanpa lampiran ditolak
  if ((typeof messageText !== 'string' || messageText.trim() === '') && !hasAttachments) {
    errors.messageText = 'Pesan tidak boleh kosong.';
  } else if (typeof messageText === 'string' && messageText.trim().length > 4000) {
    errors.messageText = 'Pesan terlalu panjang (maksimal 4000 karakter).';
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      messageText: typeof messageText === 'string' ? messageText.trim() : '',
    },
  };
}
