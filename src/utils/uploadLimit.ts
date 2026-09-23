import { formatBytes } from './format';

/** Largest file Knowra accepts. */
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

/**
 * Each Cloudinary object on the free plan must stay at or below 10 MiB.
 * Larger files are uploaded as ordered parts of this size and joined again later.
 */
export const CLOUDINARY_PART_BYTES = 9 * 1024 * 1024;

export function pdfPartRanges(size: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < size; start += CLOUDINARY_PART_BYTES) {
    ranges.push({ start, end: Math.min(size, start + CLOUDINARY_PART_BYTES) });
  }
  return ranges;
}

export function uploadTooLargeMessage(bytes: number): string {
  return `This file is ${formatBytes(bytes)}. The maximum upload size is 1 GB.`;
}

export function humanizeStorageError(message: string): string {
  const match = /File size too large\.\s*Got\s+(\d+)\.\s*Maximum is\s+(\d+)\.?/i.exec(message);
  if (!match?.[1]) return message;
  const got = Number(match[1]);
  if (got > MAX_UPLOAD_BYTES) return uploadTooLargeMessage(got);
  return 'This file could not be stored. Try the upload again.';
}
