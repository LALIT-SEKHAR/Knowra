import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  LayoutList,
  LoaderCircle,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { FolderPathSegment, KnowraDocument, KnowraFolder } from '../types';
import { DOCUMENT_ACCEPT, fileKindLabel, mimeFromFile } from '../utils/fileTypes';
import { formatBytes, formatRelativeDate } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { UserAvatar, displayName } from '../components/UserAvatar';
import { BrandMark } from '../components/BrandMark';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FilePreviewModal } from '../components/FilePreviewModal';
import { MoveItemDialog, NameDialog, type MoveSubject } from '../components/FileFolderDialogs';
import { FileActivity } from '../components/FileActivity';
import { FilesGridSkeleton, FilesListSkeleton, FilesTableSkeleton } from '../components/Skeleton';
import { describeProcessing, describeUpload, isActiveDocument, useActivityClock } from '../utils/fileActivity';
import { readViewCache, writeViewCache } from '../utils/viewCache';

type FilesView = 'list' | 'grid';
type SortKey = 'name' | 'modified' | 'size' | 'type';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;
const FILES_VIEW_KEY = 'knowra_files_view';
const FILES_SORT_KEY = 'knowra_files_sort';

function readFilesSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(FILES_SORT_KEY);
    const [key, dir] = raw?.split(':') ?? [];
    if (
      (key === 'name' || key === 'modified' || key === 'size' || key === 'type') &&
      (dir === 'asc' || dir === 'desc')
    ) {
      return { key, dir };
    }
  } catch {
    // ignore
  }
  return { key: 'modified', dir: 'desc' };
}

function defaultSortDir(key: SortKey): SortDir {
  return key === 'name' || key === 'type' ? 'asc' : 'desc';
}

function byName(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function sortEntries<T>(
  items: T[],
  dir: SortDir,
  valueOf: (item: T) => string | number,
  nameOf: (item: T) => string,
) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : byName(String(av), String(bv));
    if (cmp === 0) return byName(nameOf(a), nameOf(b));
    return cmp * sign;
  });
}

function readFilesView(): FilesView {
  try {
    const raw = localStorage.getItem(FILES_VIEW_KEY);
    if (raw === 'list' || raw === 'grid') return raw;
  } catch {
    // ignore
  }
  return 'list';
}

type DeleteTarget =
  | { kind: 'file'; doc: KnowraDocument }
  | { kind: 'folder'; folder: KnowraFolder };

type NameRequest = {
  title: string;
  description?: string;
  initial: string;
  confirmLabel: string;
  submit: (name: string) => Promise<void>;
};

type PendingUpload = {
  localId: string;
  name: string;
  size: number;
  progress: number;
  status: 'queued' | 'uploading' | 'failed';
  startedAt?: number;
  errorMessage?: string;
};

function locationLabel(path: FolderPathSegment[] | undefined) {
  if (!path?.length) return '';
  return path.map((segment) => segment.name).join(' / ');
}

function resultLocation(path: FolderPathSegment[] | undefined, searching: boolean) {
  if (!searching) return '';
  return locationLabel(path) || 'Files';
}

function directorySegments(file: File) {
  const relative = file.webkitRelativePath.split('/').filter(Boolean);
  if (relative.length <= 1) return [];
  return relative.slice(0, -1);
}

type FilesSnapshot = {
  documents: KnowraDocument[];
  folders: KnowraFolder[];
  breadcrumb: FolderPathSegment[];
};

function filesCacheKey(folderId: string | null, query: string) {
  return `files:${folderId ?? 'root'}:${query.trim().toLowerCase()}`;
}

export function FilesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder');
  const initialFiles = readViewCache<FilesSnapshot>(filesCacheKey(folderId, ''));
  const [documents, setDocuments] = useState<KnowraDocument[]>(() => initialFiles?.documents ?? []);
  const [folders, setFolders] = useState<KnowraFolder[]>(() => initialFiles?.folders ?? []);
  const [breadcrumb, setBreadcrumb] = useState<FolderPathSegment[]>(() => initialFiles?.breadcrumb ?? []);
  const [filesView, setFilesView] = useState<FilesView>(() => readFilesView());
  const [sortKey, setSortKey] = useState<SortKey>(() => readFilesSort().key);
  const [sortDir, setSortDir] = useState<SortDir>(() => readFilesSort().dir);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const moreRef = useRef<HTMLParagraphElement>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(() => initialFiles === null);
  const [preparingFolders, setPreparingFolders] = useState(false);
  const [error, setError] = useState('');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<KnowraDocument | null>(null);
  const closePreview = useCallback(() => setPreviewDoc(null), []);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState('');
  const [moveSubject, setMoveSubject] = useState<MoveSubject | null>(null);
  const [moveFolders, setMoveFolders] = useState<KnowraFolder[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const loadSeq = useRef(0);
  const seenFolder = useRef(folderId);

  const uploading =
    preparingFolders || pendingUploads.some((u) => u.status === 'uploading' || u.status === 'queued');
  const activityNow = useActivityClock(
    uploading || documents.some((doc) => isActiveDocument(doc)),
  );

  const load = useCallback(async (q?: string) => {
    const request = ++loadSeq.current;
    setError('');
    try {
      const res = await api.listDocuments(q, folderId ?? 'root');
      if (request !== loadSeq.current) return;
      const nextFolders = res.folders ?? [];
      const nextBreadcrumb = res.breadcrumb ?? [];
      setDocuments(res.documents);
      setFolders(nextFolders);
      setBreadcrumb(nextBreadcrumb);
      writeViewCache(filesCacheKey(folderId, q ?? ''), {
        documents: res.documents,
        folders: nextFolders,
        breadcrumb: nextBreadcrumb,
      });
    } catch (err) {
      if (request !== loadSeq.current) return;
      const message = err instanceof ApiError ? err.message : 'Failed to load files';
      setError(message);
      if (message === 'Folder not found') {
        setDocuments([]);
        setFolders([]);
        setBreadcrumb([]);
      }
    } finally {
      if (request === loadSeq.current) setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [folderId, query, sortKey, sortDir]);

  useEffect(() => {
    const trimmed = query.trim();
    if (seenFolder.current !== folderId) {
      seenFolder.current = folderId;
      const cached = readViewCache<FilesSnapshot>(filesCacheKey(folderId, trimmed));
      if (cached) {
        setDocuments(cached.documents);
        setFolders(cached.folders);
        setBreadcrumb(cached.breadcrumb);
        setLoading(false);
      } else {
        setDocuments([]);
        setFolders([]);
        setBreadcrumb([]);
        setLoading(true);
      }
    } else {
      const cached = readViewCache<FilesSnapshot>(filesCacheKey(folderId, trimmed));
      if (cached) {
        setDocuments(cached.documents);
        setFolders(cached.folders);
        setBreadcrumb(cached.breadcrumb);
      }
    }
    const handle = window.setTimeout(() => {
      void load(trimmed || undefined);
    }, trimmed ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [query, folderId, load]);

  useEffect(() => {
    const node = folderInputRef.current;
    if (!node) return;
    node.setAttribute('webkitdirectory', '');
    node.setAttribute('directory', '');
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === 'processing' || d.status === 'uploading',
    );
    if (!hasProcessing) return;
    const id = setInterval(() => {
      void load(query || undefined);
    }, 1500);
    return () => clearInterval(id);
  }, [documents, load, query]);

  useEffect(() => {
    if (!openMenuId) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-file-menu="${openMenuId}"]`)) return;
      setOpenMenuId(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }

    function onRepositionClose() {
      setOpenMenuId(null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onRepositionClose);
    window.addEventListener('scroll', onRepositionClose, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onRepositionClose);
      window.removeEventListener('scroll', onRepositionClose, true);
    };
  }, [openMenuId]);

  function goToFolder(id: string | null) {
    setQuery('');
    setOpenMenuId(null);
    if ((id ?? null) === (folderId ?? null)) {
      void load();
      return;
    }
    if (id) setSearchParams({ folder: id });
    else setSearchParams({});
  }

  const parentFolderId =
    breadcrumb.length > 1 && breadcrumb[breadcrumb.length - 1]?.id === folderId
      ? breadcrumb[breadcrumb.length - 2].id
      : null;
  const canGoBack = Boolean(folderId) && breadcrumb[breadcrumb.length - 1]?.id === folderId;

  function goBack() {
    if (!canGoBack) return;
    goToFolder(parentFolderId);
  }

  async function startUploads(
    accepted: File[],
    skipped: number,
    folderIds?: Array<string | null>,
  ) {
    const batch = accepted.map((file, index) => ({
      localId: `upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'queued' as const,
      file,
    }));

    setPendingUploads((prev) => [
      ...batch.map(({ file: _f, ...rest }) => rest),
      ...prev.filter((u) => u.status === 'uploading' || u.status === 'queued'),
    ]);

    try {
      const results = await api.uploadDocuments(
        batch.map((item) => item.file),
        {
          folderId,
          folderIds,
          onFileStart: (_file, index) => {
            const localId = batch[index]?.localId;
            if (!localId) return;
            setPendingUploads((prev) =>
              prev.map((u) =>
                u.localId === localId
                  ? { ...u, status: 'uploading', startedAt: u.startedAt ?? Date.now() }
                  : u,
              ),
            );
          },
          onFileProgress: (_file, index, percent) => {
            const localId = batch[index]?.localId;
            if (!localId) return;
            setPendingUploads((prev) =>
              prev.map((u) => (u.localId === localId ? { ...u, progress: percent } : u)),
            );
          },
          onFileComplete: (_file, index) => {
            const localId = batch[index]?.localId;
            if (!localId) return;
            setPendingUploads((prev) => prev.filter((u) => u.localId !== localId));
          },
          onFileError: (_file, index, err) => {
            const localId = batch[index]?.localId;
            if (!localId) return;
            const message = err instanceof ApiError ? err.message : 'Upload failed';
            setPendingUploads((prev) =>
              prev.map((u) =>
                u.localId === localId
                  ? { ...u, status: 'failed', progress: 0, errorMessage: message }
                  : u,
              ),
            );
          },
        },
      );

      await load(query || undefined);

      const failedCount = results.filter((r) => r.error).length;
      const okCount = results.length - failedCount;
      const notes: string[] = [];
      if (skipped > 0) {
        notes.push(
          `${skipped} unsupported file${skipped === 1 ? '' : 's'} skipped`,
        );
      }
      if (failedCount > 0 && okCount > 0) {
        notes.push(`${okCount} uploaded, ${failedCount} failed`);
      } else if (failedCount > 0 && okCount === 0) {
        notes.push(failedCount === 1 ? 'Upload failed' : `${failedCount} uploads failed`);
      }
      setError(notes.join('. '));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }

  async function onUpload(fileList: FileList | File[]) {
    if (!user?.hasOpenAIKey) {
      setError('Add your OpenAI API key in Settings → AI before uploading.');
      return;
    }

    const selected = Array.from(fileList);
    const accepted = selected.filter((file) => mimeFromFile(file));
    const skipped = selected.length - accepted.length;

    if (accepted.length === 0) {
      setError('Only PDF, Word, Excel, and image files are supported');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    await startUploads(accepted, skipped);
  }

  async function onUploadDirectory(fileList: FileList | File[]) {
    if (!user?.hasOpenAIKey) {
      setError('Add your OpenAI API key in Settings → AI before uploading.');
      return;
    }

    const selected = Array.from(fileList);
    const accepted = selected.filter((file) => mimeFromFile(file));
    const skipped = selected.length - accepted.length;

    if (accepted.length === 0) {
      setError('Only PDF, Word, Excel, and image files are supported');
      if (folderInputRef.current) folderInputRef.current.value = '';
      return;
    }

    const cache = new Map<string, string>();
    const folderIds: string[] = [];
    setPreparingFolders(true);
    setError('');
    try {
      for (const file of accepted) {
        const segments = directorySegments(file);
        if (segments.length === 0) {
          folderIds.push(folderId ?? '');
          continue;
        }
        const key = segments.join('/');
        let dest = cache.get(key);
        if (!dest) {
          const res = await api.ensureFolderPath(segments, folderId);
          dest = res.folder.id;
          cache.set(key, dest);
        }
        folderIds.push(dest);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create folders');
      if (folderInputRef.current) folderInputRef.current.value = '';
      await load(query || undefined);
      return;
    } finally {
      setPreparingFolders(false);
    }

    await startUploads(
      accepted,
      skipped,
      folderIds.map((id) => id || null),
    );
  }

  function dismissFailedUpload(localId: string) {
    setPendingUploads((prev) => prev.filter((u) => u.localId !== localId));
  }

  function requestDeleteFolder(folder: KnowraFolder) {
    setOpenMenuId(null);
    setDeleteTarget({ kind: 'folder', folder });
  }

  function requestDeleteFile(doc: KnowraDocument) {
    setOpenMenuId(null);
    setDeleteTarget({ kind: 'file', doc });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      if (deleteTarget.kind === 'file') await api.deleteDocument(deleteTarget.doc.id);
      else await api.deleteFolder(deleteTarget.folder.id);
      setDeleteTarget(null);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  function requestFolderName(request: NameRequest) {
    setOpenMenuId(null);
    setNameError('');
    setNameRequest(request);
  }

  async function confirmName(name: string) {
    if (!nameRequest) return;
    setNameBusy(true);
    setNameError('');
    try {
      await nameRequest.submit(name);
      setNameRequest(null);
      await load(query || undefined);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setNameBusy(false);
    }
  }

  async function openMove(subject: MoveSubject) {
    setOpenMenuId(null);
    setMoveError('');
    setMoveSubject(subject);
    setMoveLoading(true);
    try {
      const res = await api.listFolders();
      setMoveFolders(res.folders);
    } catch (err) {
      setMoveSubject(null);
      setError(err instanceof ApiError ? err.message : 'Could not load folders');
    } finally {
      setMoveLoading(false);
    }
  }

  async function confirmMove(dest: string | null) {
    if (!moveSubject) return;
    setMoveBusy(true);
    setMoveError('');
    try {
      if (moveSubject.kind === 'file') await api.moveDocument(moveSubject.id, dest);
      else await api.updateFolder(moveSubject.id, { parentId: dest });
      setMoveSubject(null);
      await load(query || undefined);
    } catch (err) {
      setMoveError(err instanceof ApiError ? err.message : 'Move failed');
    } finally {
      setMoveBusy(false);
    }
  }

  function openFile(doc: KnowraDocument) {
    setPreviewDoc(doc);
  }

  const sortedFolders = useMemo(
    () =>
      sortEntries(
        folders,
        sortDir,
        (folder) => {
          if (sortKey === 'modified') return new Date(folder.updatedAt).getTime();
          if (sortKey === 'size') return 0;
          if (sortKey === 'type') return 'Folder';
          return folder.name;
        },
        (folder) => folder.name,
      ),
    [folders, sortKey, sortDir],
  );

  const rows = useMemo(
    () =>
      sortEntries(
        documents,
        sortDir,
        (doc) => {
          if (sortKey === 'modified') return new Date(doc.updatedAt).getTime();
          if (sortKey === 'size') return doc.size;
          if (sortKey === 'type') return fileKindLabel(doc.mimeType);
          return doc.name;
        },
        (doc) => doc.name,
      ),
    [documents, sortKey, sortDir],
  );

  const visibleFolders = sortedFolders.slice(0, visibleCount);
  const visibleFiles = rows.slice(0, Math.max(0, visibleCount - sortedFolders.length));
  const libraryCount = sortedFolders.length + rows.length;
  const hasMore = visibleCount < libraryCount;

  useEffect(() => {
    const node = moreRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + PAGE_SIZE);
        }
      },
      { rootMargin: '240px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, visibleCount, filesView]);

  const uploadButtonLabel = useMemo(() => {
    const active = pendingUploads.filter((u) => u.status === 'uploading' || u.status === 'queued');
    if (preparingFolders) return 'Preparing folders…';
    if (active.length === 0) return 'Upload';
    const current = active.find((u) => u.status === 'uploading');
    if (active.length === 1 && current) return `Uploading ${Math.round(current.progress)}%`;
    if (current) return `Uploading ${active.length} · ${Math.round(current.progress)}%`;
    return `Uploading ${active.length}`;
  }, [pendingUploads, preparingFolders]);

  function statusLabel(doc: KnowraDocument) {
    if (doc.status === 'ready') return 'Ready';
    if (doc.status === 'failed') {
      return doc.errorMessage ? `Failed: ${doc.errorMessage}` : 'Failed';
    }
    return doc.status;
  }

  function StatusIcon({ doc }: { doc: KnowraDocument }) {
    if (doc.status !== 'ready') return null;
    return <CheckCircle2 className="icon-sm text-[var(--color-accent)]" aria-hidden />;
  }

  function FolderActions({ folder }: { folder: KnowraFolder }) {
    const menuId = `folder:${folder.id}`;
    const open = openMenuId === menuId;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
      if (!open || !buttonRef.current) {
        setMenuPos(null);
        return;
      }
      const rect = buttonRef.current.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setMenuPos(null);
        return;
      }
      const menuWidth = 168;
      const gap = 6;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      const top = Math.min(rect.bottom + gap, window.innerHeight - 8);
      setMenuPos({ top, left });
    }, [open]);

    const menu = open && menuPos
      ? createPortal(
          <div
            className="file-action-menu"
            role="menu"
            aria-label={`Actions for ${folder.name}`}
            data-file-menu={menuId}
            style={{ top: menuPos.top, left: menuPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() => goToFolder(folder.id)}
            >
              <ExternalLink className="icon-sm" aria-hidden />
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() =>
                requestFolderName({
                  title: 'Rename folder',
                  initial: folder.name,
                  confirmLabel: 'Rename',
                  submit: async (name) => {
                    await api.updateFolder(folder.id, { name });
                  },
                })
              }
            >
              <Pencil className="icon-sm" aria-hidden />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() =>
                void openMove({
                  kind: 'folder',
                  id: folder.id,
                  name: folder.name,
                  currentFolderId: folder.parentId,
                })
              }
            >
              <Folder className="icon-sm" aria-hidden />
              Move
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item file-action-item-danger"
              onClick={() => requestDeleteFolder(folder)}
            >
              <Trash2 className="icon-sm" aria-hidden />
              Delete
            </button>
          </div>,
          document.body,
        )
      : null;

    return (
      <div className="inline-flex" data-file-menu={menuId}>
        <button
          ref={buttonRef}
          type="button"
          className="chip chip-icon"
          aria-label={`Actions for ${folder.name}`}
          aria-haspopup="menu"
          aria-expanded={open && Boolean(menuPos)}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(open ? null : menuId);
          }}
        >
          <MoreVertical className="icon-sm" aria-hidden />
        </button>
        {menu}
      </div>
    );
  }

  function FileActions({ doc }: { doc: KnowraDocument }) {
    const menuId = `file:${doc.id}`;
    const open = openMenuId === menuId;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
      if (!open || !buttonRef.current) {
        setMenuPos(null);
        return;
      }
      const rect = buttonRef.current.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        setMenuPos(null);
        return;
      }
      const menuWidth = 168;
      const gap = 6;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      const top = Math.min(rect.bottom + gap, window.innerHeight - 8);
      setMenuPos({ top, left });
    }, [open]);

    const menu = open && menuPos
      ? createPortal(
          <div
            className="file-action-menu"
            role="menu"
            aria-label={`Actions for ${doc.name}`}
            data-file-menu={menuId}
            style={{ top: menuPos.top, left: menuPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() => {
                setOpenMenuId(null);
                openFile(doc);
              }}
            >
              <ExternalLink className="icon-sm" aria-hidden />
              Open
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() =>
                requestFolderName({
                  title: 'Rename file',
                  initial: doc.name,
                  confirmLabel: 'Rename',
                  submit: async (name) => {
                    await api.renameDocument(doc.id, name);
                  },
                })
              }
            >
              <Pencil className="icon-sm" aria-hidden />
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() =>
                void openMove({
                  kind: 'file',
                  id: doc.id,
                  name: doc.name,
                  currentFolderId: doc.folderId ?? null,
                })
              }
            >
              <Folder className="icon-sm" aria-hidden />
              Move
            </button>
            <button
              type="button"
              role="menuitem"
              className="file-action-item file-action-item-danger"
              onClick={() => requestDeleteFile(doc)}
            >
              <Trash2 className="icon-sm" aria-hidden />
              Delete
            </button>
          </div>,
          document.body,
        )
      : null;

    return (
      <div className="inline-flex" data-file-menu={menuId}>
        <button
          ref={buttonRef}
          type="button"
          className="chip chip-icon"
          aria-label={`Actions for ${doc.name}`}
          aria-haspopup="menu"
          aria-expanded={open && Boolean(menuPos)}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(open ? null : menuId);
          }}
        >
          <MoreVertical className="icon-sm" aria-hidden />
        </button>
        {menu}
      </div>
    );
  }

  const searching = Boolean(query.trim());
  const showFilesSkeleton =
    loading && documents.length === 0 && folders.length === 0 && pendingUploads.length === 0;
  const empty =
    !loading && !searching && rows.length === 0 && folders.length === 0 && pendingUploads.length === 0;
  const noMatches =
    !loading && searching && rows.length === 0 && folders.length === 0 && pendingUploads.length === 0;

  function onFilesView(next: FilesView) {
    setFilesView(next);
    try {
      localStorage.setItem(FILES_VIEW_KEY, next);
    } catch {
      // ignore
    }
  }

  function saveSort(key: SortKey, dir: SortDir) {
    setSortKey(key);
    setSortDir(dir);
    try {
      localStorage.setItem(FILES_SORT_KEY, `${key}:${dir}`);
    } catch {
      // ignore
    }
  }

  function onSortKey(next: SortKey) {
    saveSort(next, next === sortKey ? sortDir : defaultSortDir(next));
  }

  function toggleSort(next: SortKey) {
    if (next === sortKey) saveSort(next, sortDir === 'asc' ? 'desc' : 'asc');
    else saveSort(next, defaultSortDir(next));
  }

  const emptyMessage = folderId
    ? 'This folder is empty. Create a folder or upload files to add them here.'
    : 'No files yet. Create a folder or upload a PDF, Word, Excel, or image file.';

  if (user && user.canManage === false) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="page-shell relative mx-auto max-w-5xl">
      <div className="ambient-orb left-[-10%] top-0 bg-white/10" aria-hidden />

      <div className="relative z-10">
        <Link to="/" className="btn btn-ghost !px-0 text-sm text-[var(--color-ink-muted)]">
          <ArrowLeft className="icon" aria-hidden />
          Back to workspace
        </Link>

        <div className="glass mt-4 p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
                  <BrandMark size="sm" showWordmark={false} />
                  Files
                </h1>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  Folders for PDFs, Word, Excel, and images.
                </p>
              </div>
              <Link
                to="/profile"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-ink)]"
                title="Edit profile"
              >
                <UserAvatar user={user} size="sm" />
                <span className="hidden sm:inline">{displayName(user)}</span>
              </Link>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && query) {
                      e.preventDefault();
                      setQuery('');
                    }
                  }}
                  placeholder="Search files and folders"
                  aria-label="Search files and folders"
                  className={clsx(
                    'field chat-search !min-h-11 w-full !pl-10',
                    query && '!pr-10',
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute top-1/2 right-1.5 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-white/[0.08] hover:text-[var(--color-ink)]"
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <X className="icon-sm" aria-hidden />
                  </button>
                ) : null}
              </div>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0">
              <button
                type="button"
                className="btn btn-secondary !px-3"
                disabled={uploading}
                onClick={() =>
                  requestFolderName({
                    title: 'New folder',
                    description: folderId
                      ? 'This folder is created inside the one you have open.'
                      : 'This folder is created in Files.',
                    initial: '',
                    confirmLabel: 'Create',
                    submit: async (name) => {
                      await api.createFolder(name, folderId);
                    },
                  })
                }
              >
                <FolderPlus className="icon" aria-hidden />
                New folder
              </button>
              <button
                type="button"
                className="btn btn-secondary !px-3"
                disabled={uploading}
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderUp className="icon" aria-hidden />
                Upload folder
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn btn-primary col-span-2 sm:col-span-1"
              >
                {uploading ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <Upload className="icon" aria-hidden />
                )}
                {uploadButtonLabel}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) void onUpload(files);
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) void onUploadDirectory(files);
                }}
              />
            </div>
          </div>
          </div>

          {searching ? (
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              Matches across all files and folders.
            </p>
          ) : null}

          {error && (
            <p className="mt-4 text-sm text-[var(--color-danger)]">
              {error}
              {error === 'Folder not found' ? (
                <button type="button" className="ml-2 underline" onClick={() => goToFolder(null)}>
                  Back to all files
                </button>
              ) : null}
            </p>
          )}
        </div>

        <div className="surface mt-4">
          {folderId ? (
            <nav
              aria-label="Folder"
              className="flex flex-wrap items-center gap-1 border-b border-[var(--color-line)] px-3 py-2 text-sm sm:px-4"
            >
              <button
                type="button"
                className="btn btn-ghost !px-2"
                onClick={goBack}
                disabled={!canGoBack}
              >
                <ArrowLeft className="icon" aria-hidden />
                Back
              </button>
              <button type="button" className="btn btn-ghost !px-2" onClick={() => goToFolder(null)}>
                Files
              </button>
              {breadcrumb.map((crumb, index) => (
                <span key={crumb.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="icon-sm text-[var(--color-ink-muted)]" aria-hidden />
                  <button
                    type="button"
                    className="btn btn-ghost !px-2"
                    aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
                    onClick={() => goToFolder(crumb.id)}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-1.5">
              <label className="sr-only" htmlFor="files-sort">
                Sort by
              </label>
              <div className="relative">
                <select
                  id="files-sort"
                  value={sortKey}
                  onChange={(e) => onSortKey(e.target.value as SortKey)}
                  className="files-sort h-8 rounded-full border border-[var(--color-line)] bg-transparent text-sm text-[var(--color-ink)]"
                >
                  <option value="modified">Modified</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="type">Type</option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute top-1/2 right-3 icon-sm -translate-y-1/2 text-[var(--color-ink-muted)]"
                  aria-hidden
                />
              </div>
              <button
                type="button"
                className="chip chip-icon"
                aria-label={sortDir === 'asc' ? 'Ascending. Switch to descending.' : 'Descending. Switch to ascending.'}
                onClick={() => saveSort(sortKey, sortDir === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? (
                  <ArrowUp className="icon-sm" aria-hidden />
                ) : (
                  <ArrowDown className="icon-sm" aria-hidden />
                )}
              </button>
            </div>
            <div className="segmented" role="group" aria-label="File view">
              <button
                type="button"
                className={clsx('segmented-btn', filesView === 'list' && 'segmented-btn-active')}
                aria-pressed={filesView === 'list'}
                onClick={() => onFilesView('list')}
              >
                <LayoutList className="icon-sm" aria-hidden />
                List
              </button>
              <button
                type="button"
                className={clsx('segmented-btn', filesView === 'grid' && 'segmented-btn-active')}
                aria-pressed={filesView === 'grid'}
                onClick={() => onFilesView('grid')}
              >
                <LayoutGrid className="icon-sm" aria-hidden />
                Grid
              </button>
            </div>
          </div>
          {filesView === 'grid' ? (
            <div aria-busy={showFilesSkeleton}>
              {showFilesSkeleton ? (
                <FilesGridSkeleton />
              ) : empty ? (
                <p className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">{emptyMessage}</p>
              ) : noMatches ? (
                <p className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">
                  No files or folders match that search.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4">
                  {pendingUploads.map((upload) => (
                    <li
                      key={upload.localId}
                      className="flex min-h-36 min-w-0 flex-col rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/[0.03] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <FileText className="size-7 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                        {upload.status === 'failed' ? (
                          <button
                            type="button"
                            className="chip chip-icon"
                            aria-label="Dismiss"
                            onClick={() => dismissFailedUpload(upload.localId)}
                          >
                            <XCircle className="icon-sm" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm font-medium">{upload.name}</p>
                      <div className="mt-auto pt-3">
                        <p className="text-xs text-[var(--color-ink-muted)]">{formatBytes(upload.size)}</p>
                        <FileActivity {...describeUpload(upload, activityNow)} />
                      </div>
                    </li>
                  ))}
                  {visibleFolders.map((folder) => {
                    const place = resultLocation(folder.path, searching);
                    return (
                      <li
                        key={`folder-${folder.id}`}
                        className="library-hit flex min-h-36 min-w-0 cursor-pointer flex-col rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
                        onClick={() => goToFolder(folder.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="text-[var(--color-ink-muted)]"
                            aria-label={`Open folder ${folder.name}`}
                            onClick={() => goToFolder(folder.id)}
                          >
                            <Folder className="size-7" aria-hidden />
                          </button>
                          <FolderActions folder={folder} />
                        </div>
                        <button
                          type="button"
                          className="mt-3 line-clamp-2 text-left text-sm font-medium"
                          onClick={() => goToFolder(folder.id)}
                        >
                          {folder.name}
                        </button>
                        {place ? (
                          <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">{place}</p>
                        ) : null}
                        <p className="mt-auto pt-3 text-xs text-[var(--color-ink-muted)]">
                          Folder · {formatRelativeDate(folder.updatedAt)}
                        </p>
                      </li>
                    );
                  })}
                  {visibleFiles.map((doc) => {
                    const place = resultLocation(doc.path, searching);
                    return (
                      <li
                        key={doc.id}
                        className="library-hit relative flex min-h-36 min-w-0 cursor-pointer flex-col rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/[0.03] transition-colors hover:bg-white/[0.05]"
                      >
                        <button
                          type="button"
                          className="absolute inset-0 cursor-pointer rounded-[var(--radius-control)]"
                          aria-label={`Open ${doc.name}`}
                          onClick={() => openFile(doc)}
                        />
                        <div className="pointer-events-none relative flex min-h-36 flex-1 flex-col p-3">
                          <div className="flex items-start justify-between gap-2">
                            <FileText className="size-7 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                            <div className="pointer-events-auto relative z-10">
                              <FileActions doc={doc} />
                            </div>
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm font-medium">{doc.name}</p>
                          {place ? (
                            <p className="mt-1 truncate text-xs text-[var(--color-ink-muted)]">{place}</p>
                          ) : null}
                          <div className="mt-auto pt-3 text-xs text-[var(--color-ink-muted)]">
                            {isActiveDocument(doc) || doc.status === 'failed' ? (
                              <FileActivity
                                {...(describeProcessing(doc, activityNow) ?? {
                                  title: statusLabel(doc),
                                  detail: null,
                                  progress: null,
                                  failed: doc.status === 'failed',
                                })}
                              />
                            ) : (
                              <p className="flex items-center gap-1.5">
                                <StatusIcon doc={doc} />
                                <span className="truncate">
                                  {fileKindLabel(doc.mimeType)} · {formatBytes(doc.size)} ·{' '}
                                  {formatRelativeDate(doc.updatedAt)}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
          <>
          <ul
            className="divide-y divide-[var(--color-line)] md:hidden"
            aria-busy={showFilesSkeleton}
          >
            {showFilesSkeleton ? (
              <FilesListSkeleton />
            ) : empty ? (
              <li className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">
                {emptyMessage}
              </li>
            ) : noMatches ? (
              <li className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">
                No files or folders match that search.
              </li>
            ) : (
              <>
                {pendingUploads.map((upload) => (
                  <li key={upload.localId} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                          <span className="truncate">{upload.name}</span>
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{formatBytes(upload.size)}</p>
                        <FileActivity {...describeUpload(upload, activityNow)} />
                      </div>
                      {upload.status === 'failed' ? (
                        <button
                          type="button"
                          className="chip chip-icon"
                          aria-label="Dismiss"
                          onClick={() => dismissFailedUpload(upload.localId)}
                        >
                          <XCircle className="icon-sm" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
                {visibleFolders.map((folder) => {
                  const place = resultLocation(folder.path, searching);
                  return (
                    <li
                      key={`folder-${folder.id}`}
                      className="library-hit cursor-pointer px-4 py-4"
                      onClick={() => goToFolder(folder.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2 text-left font-medium"
                            onClick={() => goToFolder(folder.id)}
                          >
                            <Folder className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                            <span className="truncate">{folder.name}</span>
                          </button>
                          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                            Folder · {formatRelativeDate(folder.updatedAt)}
                            {place ? ` · ${place}` : ''}
                          </p>
                        </div>
                        <FolderActions folder={folder} />
                      </div>
                    </li>
                  );
                })}
                {visibleFiles.map((doc) => {
                  const place = resultLocation(doc.path, searching);
                  return (
                  <li key={doc.id} className="library-hit relative cursor-pointer transition-colors hover:bg-white/[0.04]">
                    <button
                      type="button"
                      className="absolute inset-0 cursor-pointer"
                      aria-label={`Open ${doc.name}`}
                      onClick={() => openFile(doc)}
                    />
                    <div className="pointer-events-none relative flex items-start justify-between gap-3 px-4 py-4">
                      <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                        <span className="truncate">{doc.name}</span>
                      </p>
                      {place ? (
                        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{place}</p>
                      ) : null}
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
                        {doc.status === 'ready' ? <StatusIcon doc={doc} /> : null}
                        <span>
                          {formatBytes(doc.size)}
                          {doc.status === 'ready' ? ' · Ready' : ''} · {formatRelativeDate(doc.updatedAt)}
                        </span>
                      </p>
                      {isActiveDocument(doc) || doc.status === 'failed' ? (
                        <FileActivity
                          {...(describeProcessing(doc, activityNow) ?? {
                            title: statusLabel(doc),
                            detail: null,
                            progress: null,
                            failed: doc.status === 'failed',
                          })}
                        />
                      ) : null}
                      </div>
                      <div className="pointer-events-auto relative z-10">
                        <FileActions doc={doc} />
                      </div>
                    </div>
                  </li>
                  );
                })}
              </>
            )}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
                <tr>
                  {(
                    [
                      ['name', 'Name'],
                      ['type', 'Type'],
                      ['size', 'Size'],
                    ] as const
                  ).map(([key, label]) => (
                    <th
                      key={key}
                      className="px-4 py-3.5 font-medium"
                      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium"
                        onClick={() => toggleSort(key)}
                      >
                        {label}
                        {sortKey === key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="icon-sm" aria-hidden />
                          ) : (
                            <ArrowDown className="icon-sm" aria-hidden />
                          )
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th className="px-4 py-3.5 font-medium">Status</th>
                  <th
                    className="px-4 py-3.5 font-medium"
                    aria-sort={sortKey === 'modified' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium"
                      onClick={() => toggleSort('modified')}
                    >
                      Modified
                      {sortKey === 'modified' ? (
                        sortDir === 'asc' ? (
                          <ArrowUp className="icon-sm" aria-hidden />
                        ) : (
                          <ArrowDown className="icon-sm" aria-hidden />
                        )
                      ) : null}
                    </button>
                  </th>
                  <th className="px-4 py-3.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody aria-busy={showFilesSkeleton}>
                {showFilesSkeleton ? (
                  <FilesTableSkeleton />
                ) : empty ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : noMatches ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                      No files or folders match that search.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pendingUploads.map((upload) => (
                      <tr key={upload.localId} className="border-t border-[var(--color-line)]">
                        <td className="px-4 py-3.5">
                          <span className="inline-flex max-w-xs items-center gap-2 font-medium">
                            <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                            <span className="truncate">{upload.name}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5">{fileKindLabel(upload.name)}</td>
                        <td className="px-4 py-3.5">{formatBytes(upload.size)}</td>
                        <td className="px-4 py-3.5">
                          <FileActivity {...describeUpload(upload, activityNow)} />
                        </td>
                        <td className="px-4 py-3.5 text-[var(--color-ink-muted)]">Just now</td>
                        <td className="px-4 py-3.5">
                          {upload.status === 'failed' ? (
                            <button
                              type="button"
                              className="chip"
                              onClick={() => dismissFailedUpload(upload.localId)}
                            >
                              Dismiss
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {visibleFolders.map((folder) => {
                      const place = resultLocation(folder.path, searching);
                      return (
                        <tr
                          key={`folder-${folder.id}`}
                          className="library-hit cursor-pointer border-t border-[var(--color-line)] transition-colors hover:bg-white/[0.04]"
                          onClick={() => goToFolder(folder.id)}
                        >
                          <td className="px-4 py-3.5">
                            <button
                              type="button"
                              className="inline-flex max-w-xs items-center gap-2 text-left font-medium"
                              onClick={() => goToFolder(folder.id)}
                            >
                              <Folder className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                              <span className="truncate">{folder.name}</span>
                            </button>
                            {place ? (
                              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{place}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5">Folder</td>
                          <td className="px-4 py-3.5 text-[var(--color-ink-muted)]">—</td>
                          <td className="px-4 py-3.5 text-[var(--color-ink-muted)]">—</td>
                          <td className="px-4 py-3.5">{formatRelativeDate(folder.updatedAt)}</td>
                          <td className="px-4 py-3.5">
                            <FolderActions folder={folder} />
                          </td>
                        </tr>
                      );
                    })}
                    {visibleFiles.map((doc) => {
                      const place = resultLocation(doc.path, searching);
                      return (
                      <tr
                        key={doc.id}
                        className="library-hit cursor-pointer border-t border-[var(--color-line)] transition-colors hover:bg-white/[0.04]"
                        onClick={() => openFile(doc)}
                      >
                        <td className="px-4 py-3.5">
                          <button
                            type="button"
                            className="inline-flex max-w-xs items-center gap-2 text-left font-medium"
                            aria-label={`Open ${doc.name}`}
                            onClick={() => openFile(doc)}
                          >
                            <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                            <span className="truncate">{doc.name}</span>
                          </button>
                          {place ? (
                            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{place}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5">{fileKindLabel(doc.mimeType)}</td>
                        <td className="px-4 py-3.5">{formatBytes(doc.size)}</td>
                        <td className="px-4 py-3.5">
                          {isActiveDocument(doc) || doc.status === 'failed' ? (
                            <FileActivity
                              {...(describeProcessing(doc, activityNow) ?? {
                                title: statusLabel(doc),
                                detail: null,
                                progress: null,
                                failed: doc.status === 'failed',
                              })}
                            />
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <StatusIcon doc={doc} />
                              {statusLabel(doc)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">{formatRelativeDate(doc.updatedAt)}</td>
                        <td className="px-4 py-3.5">
                          <FileActions doc={doc} />
                        </td>
                      </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>
          </>
          )}
          {!loading && libraryCount > PAGE_SIZE ? (
            <p
              ref={hasMore ? moreRef : undefined}
              className="border-t border-[var(--color-line)] px-4 py-3 text-center text-xs text-[var(--color-ink-muted)]"
            >
              Showing {Math.min(visibleCount, libraryCount)} of {libraryCount}
            </p>
          ) : null}
        </div>
      </div>

      <FilePreviewModal doc={previewDoc} onClose={closePreview} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
        description={
          deleteTarget?.kind === 'folder'
            ? `Delete “${deleteTarget.folder.name}” and everything inside it? Nested folders and files are removed permanently.`
            : deleteTarget?.kind === 'file'
              ? `Delete “${deleteTarget.doc.name}”? This removes the file, chats, and embeddings permanently.`
              : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
      <NameDialog
        open={Boolean(nameRequest)}
        title={nameRequest?.title ?? 'Folder'}
        description={nameRequest?.description}
        initial={nameRequest?.initial ?? ''}
        confirmLabel={nameRequest?.confirmLabel}
        busy={nameBusy}
        error={nameError}
        onCancel={() => {
          if (!nameBusy) {
            setNameRequest(null);
            setNameError('');
          }
        }}
        onConfirm={(name) => {
          void confirmName(name);
        }}
      />
      <MoveItemDialog
        open={Boolean(moveSubject)}
        subject={moveSubject}
        folders={moveFolders}
        loading={moveLoading}
        busy={moveBusy}
        error={moveError}
        onCancel={() => {
          if (!moveBusy) {
            setMoveSubject(null);
            setMoveError('');
          }
        }}
        onConfirm={(dest) => {
          void confirmMove(dest);
        }}
      />
    </div>
  );
}
