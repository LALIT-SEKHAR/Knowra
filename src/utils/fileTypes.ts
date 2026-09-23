const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const DOCUMENT_ACCEPT =
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif';

export function mimeFromFilename(filename: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (!match?.[1]) return null;
  return EXTENSION_MIME[match[1].toLowerCase()] ?? null;
}

export function mimeFromFile(file: { name: string; type: string }): string | null {
  const fromName = mimeFromFilename(file.name);
  if (fromName) return fromName;
  const type = file.type === 'image/jpg' || file.type === 'image/pjpeg' ? 'image/jpeg' : file.type;
  return DOCUMENT_MIME_TYPES.has(type) ? type : null;
}

export function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime?.startsWith('image/'));
}

export function isWordMime(mime: string | null | undefined): boolean {
  return (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

export function isExcelMime(mime: string | null | undefined): boolean {
  return (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

export function isOfficeMime(mime: string | null | undefined): boolean {
  return isWordMime(mime) || isExcelMime(mime);
}

export function fileKindLabel(nameOrMime: string): string {
  const mime = nameOrMime.includes('/') ? nameOrMime : mimeFromFilename(nameOrMime);
  if (isWordMime(mime)) return 'Word';
  if (isExcelMime(mime)) return 'Excel';
  if (mime === 'image/jpeg') return 'JPEG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/webp') return 'WebP';
  if (mime === 'image/gif') return 'GIF';
  if (mime?.startsWith('image/')) return 'Image';
  return 'PDF';
}
