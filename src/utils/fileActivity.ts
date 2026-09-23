import { useEffect, useState } from 'react';
import type { KnowraDocument } from '../types';

export type FileActivityModel = {
  title: string;
  detail: string | null;
  progress: number | null;
  failed: boolean;
};

const STAGE_LABEL: Record<string, string> = {
  queued: 'Waiting to start',
  downloading: 'Downloading',
  reading: 'Reading file',
  extracting: 'Extracting text',
  indexing: 'Building search index',
  finishing: 'Finishing up',
};

const smoothedEta = new Map<string, { value: number; at: number }>();
const seenAt = new Map<string, number>();

export function useActivityClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function formatEta(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const rounded = Math.max(1, Math.round(seconds));
  if (rounded < 8) return 'A few seconds left';
  if (rounded < 55) return `About ${Math.max(10, Math.round(rounded / 5) * 5)}s left`;
  const minutes = Math.round(rounded / 60);
  if (minutes <= 1) return 'About 1 min left';
  return `About ${minutes} min left`;
}

function smoothEta(key: string, next: number | null, now: number): number | null {
  if (next == null || !Number.isFinite(next)) {
    smoothedEta.delete(key);
    return null;
  }
  const clamped = Math.max(2, Math.min(20 * 60, next));
  const prev = smoothedEta.get(key);
  if (prev && prev.at === now) return prev.value;
  const value =
    prev == null
      ? clamped
      : prev.value + (clamped - prev.value) * (clamped < prev.value ? 0.55 : 0.28);
  smoothedEta.set(key, { value, at: now });
  return value;
}

function priorDurationSec(size: number, mimeType: string): number {
  const mb = Math.max(0.05, size / (1024 * 1024));
  if (mimeType.startsWith('image/')) return 24 + mb * 12;
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return 12 + mb * 3;
  }
  if (mimeType.includes('word') || mimeType.includes('document')) return 16 + mb * 4;
  return 22 + mb * 8;
}

function stageTitle(doc: Pick<KnowraDocument, 'status' | 'stage' | 'progress'>): string {
  if (doc.status === 'uploading') return 'Uploading';
  if (doc.stage && STAGE_LABEL[doc.stage]) return STAGE_LABEL[doc.stage];
  const progress = doc.progress ?? 0;
  if (progress < 12) return 'Downloading';
  if (progress < 20) return 'Reading file';
  if (progress < 65) return 'Extracting text';
  if (progress < 96) return 'Building search index';
  return 'Finishing up';
}

export function describeUpload(
  upload: {
    localId: string;
    size: number;
    progress: number;
    status: 'queued' | 'uploading' | 'failed';
    startedAt?: number;
    errorMessage?: string;
  },
  now: number,
): FileActivityModel {
  if (upload.status === 'failed') {
    return {
      title: 'Upload failed',
      detail: upload.errorMessage ?? null,
      progress: null,
      failed: true,
    };
  }
  if (upload.status === 'queued' || upload.progress <= 0) {
    return {
      title: 'Waiting to upload',
      detail: null,
      progress: null,
      failed: false,
    };
  }

  const startedAt = upload.startedAt ?? now;
  const elapsed = Math.max(0.001, (now - startedAt) / 1000);
  const pct = Math.max(0, Math.min(100, upload.progress));
  let remaining: number | null = null;
  if (pct > 0 && pct < 100 && elapsed >= 0.6) {
    const loaded = upload.size * (pct / 100);
    const rate = loaded / elapsed;
    if (rate > 0) remaining = (upload.size - loaded) / rate;
  }

  return {
    title: 'Uploading',
    detail: formatEta(smoothEta(`upload:${upload.localId}`, remaining, now)),
    progress: pct,
    failed: false,
  };
}

export function describeProcessing(doc: KnowraDocument, now: number): FileActivityModel | null {
  if (doc.status === 'failed') {
    return {
      title: 'Processing failed',
      detail: doc.errorMessage ?? null,
      progress: null,
      failed: true,
    };
  }
  if (doc.status !== 'processing' && doc.status !== 'uploading') return null;

  const pct =
    typeof doc.progress === 'number' ? Math.max(0, Math.min(100, Math.round(doc.progress))) : 0;
  const waiting = pct <= 0 || doc.stage === 'queued';

  let anchor = seenAt.get(doc.id);
  if (doc.processingStartedAt) {
    const parsed = new Date(doc.processingStartedAt).getTime();
    if (!Number.isNaN(parsed)) anchor = parsed;
  }
  if (anchor == null) {
    anchor = now;
    seenAt.set(doc.id, now);
  }

  const priorRemaining = priorDurationSec(doc.size, doc.mimeType) * (1 - pct / 100);
  const elapsed = Math.max(0, (now - anchor) / 1000);
  let remaining = priorRemaining;
  if (!waiting && pct < 100 && elapsed >= 2) {
    const observed = elapsed * ((100 - pct) / Math.max(pct, 1));
    const trust = Math.min(0.75, (elapsed - 2) / 10);
    remaining = observed * trust + priorRemaining * (1 - trust);
  }

  return {
    title: stageTitle(doc),
    detail: formatEta(smoothEta(`doc:${doc.id}`, remaining, now)),
    progress: waiting ? null : pct,
    failed: false,
  };
}

export function isActiveDocument(doc: KnowraDocument) {
  return doc.status === 'processing' || doc.status === 'uploading';
}
