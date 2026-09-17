import { join } from 'node:path';
import { mkdir, unlink } from 'node:fs/promises';

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per PRD
export const MAX_FILES_PER_UPLOAD = 5; // Max 5 files per PRD

export interface AttachmentMetadata {
  id: string;
  ticketId: string;
  messageId: string | null;
  uploaderId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

// Allowed MIME types and extensions according to PRD: JPG, PNG, WebP, PDF
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/**
 * Validates file signature (magic bytes) to prevent spoofed Content-Type
 */
export function detectMimeFromBytes(buffer: Uint8Array): string | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return 'application/pdf';
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'storage', 'uploads');
}

export async function ensureUploadsDirExists(): Promise<string> {
  const dir = getUploadsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function generateStorageFilename(originalName: string): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  // Sanitize extension: only alphanumeric
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, '').toLowerCase();
  return `${Date.now()}_${randomHex}${cleanExt}`;
}

export async function safeDeleteFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}
