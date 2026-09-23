import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Files,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Send,
  Settings,
  Upload,
  UserRound,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { ChatMessage, Conversation, KnowraDocument } from '../types';
import { DOCUMENT_ACCEPT, isOfficeMime, mimeFromFile } from '../utils/fileTypes';
import { formatMessageTime, groupByRecency } from '../utils/format';
import { describeProcessing, describeUpload, isActiveDocument, useActivityClock } from '../utils/fileActivity';
import { usePreferences } from '../hooks/usePreferences';
import { BrandMark } from './BrandMark';
import { ChatMarkdown } from './ChatMarkdown';
import { ConfirmDialog } from './ConfirmDialog';
import { FileActivity } from './FileActivity';
import { OfficePreview } from './OfficePreview';
import { PdfViewer } from './PdfViewer';
import { ChatMessagesSkeleton, WorkspaceNavSkeleton } from './Skeleton';
import { UserAvatar, displayName } from './UserAvatar';

export function WorkspacePage() {
  const { user, logout } = useAuth();
  const { timeFormat } = usePreferences();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDocId = searchParams.get('doc');
  const selectedChatId = searchParams.get('conversation');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'document'>('chat');
  const [documents, setDocuments] = useState<KnowraDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listsLoading, setListsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<
    Array<{
      localId: string;
      name: string;
      size: number;
      progress: number;
      status: 'queued' | 'uploading' | 'failed';
      startedAt?: number;
      errorMessage?: string;
    }>
  >([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatLoadIdRef = useRef(0);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) ?? null,
    [documents, selectedDocId],
  );

  async function refreshLists() {
    const [docsRes, chatsRes] = await Promise.all([
      api.listDocuments(),
      api.listConversations(),
    ]);
    setDocuments(docsRes.documents);
    setConversations(chatsRes.conversations);
  }

  useEffect(() => {
    void refreshLists()
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load workspace');
      })
      .finally(() => setListsLoading(false));
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('knowra_notice');
      if (stored) {
        setNotice(stored);
        sessionStorage.removeItem('knowra_notice');
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === 'processing' || d.status === 'uploading',
    );
    if (!hasProcessing) return;
    const id = setInterval(() => {
      void api.listDocuments().then((res) => setDocuments(res.documents));
    }, 2500);
    return () => clearInterval(id);
  }, [documents]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    const loadId = ++chatLoadIdRef.current;
    setMessagesLoading(true);
    void api
      .getConversation(selectedChatId)
      .then((res) => {
        if (loadId !== chatLoadIdRef.current) return;
        setMessages(res.messages);
        if (res.conversation.documentId && res.conversation.documentId !== selectedDocId) {
          setSearchParams({
            doc: res.conversation.documentId,
            conversation: selectedChatId,
          });
        }
      })
      .catch((err) => {
        if (loadId !== chatLoadIdRef.current) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load chat');
      })
      .finally(() => {
        if (loadId === chatLoadIdRef.current) setMessagesLoading(false);
      });
  }, [selectedChatId, selectedDocId, setSearchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    if (!selectedDoc && mobilePanel === 'document') {
      setMobilePanel('chat');
    }
  }, [selectedDoc, mobilePanel]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }

    function onPointer(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [accountMenuOpen]);

  function selectDocument(id: string) {
    const params: Record<string, string> = { doc: id };
    if (selectedChatId) params.conversation = selectedChatId;
    setSearchParams(params);
    setDrawerOpen(false);
    setMobilePanel('document');
  }

  function closeDocumentView() {
    const next = new URLSearchParams();
    if (selectedChatId) next.set('conversation', selectedChatId);
    setSearchParams(next, { replace: true });
    setHighlightPage(null);
    setMobilePanel('chat');
  }

  function selectConversation(c: Conversation) {
    const params: Record<string, string> = { conversation: c.id };
    if (c.documentId) params.doc = c.documentId;
    else if (selectedDocId) params.doc = selectedDocId;
    setSearchParams(params);
    setDrawerOpen(false);
    setMobilePanel('chat');
  }

  function startNewChat() {
    // Invalidate any in-flight conversation load so it can't repopulate messages
    chatLoadIdRef.current += 1;
    setError('');
    setQuestion('');
    setMessages([]);
    setMessagesLoading(false);
    setHighlightPage(null);
    setBusy(false);

    const next = new URLSearchParams();
    if (selectedDocId) next.set('doc', selectedDocId);
    setSearchParams(next, { replace: true });
    setMobilePanel('chat');
    setDrawerOpen(false);
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
      return;
    }

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

    let lastDocumentId: string | null = null;

    const results = await api.uploadDocuments(
      batch.map((b) => b.file),
      {
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
        onFileComplete: (_file, index, res) => {
          const localId = batch[index]?.localId;
          lastDocumentId = res.document.id;
          if (localId) {
            setPendingUploads((prev) => prev.filter((u) => u.localId !== localId));
          }
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

    await refreshLists();

    const failedCount = results.filter((r) => r.error).length;
    const okCount = results.length - failedCount;
    const notes: string[] = [];
    if (skipped > 0) {
      notes.push(`${skipped} unsupported file${skipped === 1 ? '' : 's'} skipped`);
    }
    if (failedCount > 0 && okCount > 0) {
      notes.push(`${okCount} uploaded, ${failedCount} failed`);
    } else if (failedCount > 0 && okCount === 0) {
      notes.push(failedCount === 1 ? 'Upload failed' : `${failedCount} uploads failed`);
    }
    setError(notes.join('. '));

    if (lastDocumentId) {
      setSearchParams({ doc: lastDocumentId });
    }
  }

  const readyDocs = useMemo(
    () => documents.filter((d) => d.status === 'ready'),
    [documents],
  );

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    if (!user?.canChat) {
      setError(
        user?.hasOpenAIKey
          ? 'Finish chat setup in Settings → AI (provider key) before chatting.'
          : 'Add your OpenAI API key in Settings → AI before chatting.',
      );      return;
    }
    if (readyDocs.length === 0) {
      setError('Upload and process at least one file before chatting.');
      return;
    }
    setBusy(true);
    setError('');
    const q = question.trim();
    setQuestion('');
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: q,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      // Search across all ready documents in the library
      const res = await api.chat(q, selectedChatId || undefined);
      const nextParams: Record<string, string> = { conversation: res.conversationId };
      if (selectedDocId) nextParams.doc = selectedDocId;
      setSearchParams(nextParams);
      const conv = await api.getConversation(res.conversationId);
      setMessages(conv.messages);
      await refreshLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chat failed');
    } finally {
      setBusy(false);
    }
  }

  const chatGroups = groupByRecency(conversations);
  const recentFiles = documents.slice(0, 8);
  const uploading = pendingUploads.some((u) => u.status === 'uploading' || u.status === 'queued');
  const activityNow = useActivityClock(
    uploading || documents.some((doc) => isActiveDocument(doc)),
  );
  const selectedActivity =
    selectedDoc && (isActiveDocument(selectedDoc) || selectedDoc.status === 'failed')
      ? describeProcessing(selectedDoc, activityNow)
      : null;
  const uploadLabel = (() => {
    const active = pendingUploads.filter((u) => u.status === 'uploading');
    if (active.length === 0) return 'Upload';
    if (active.length === 1) return `${active[0]!.progress}%`;
    const avg = Math.round(active.reduce((sum, u) => sum + u.progress, 0) / active.length);
    return `${active.length} · ${avg}%`;
  })();

  const sidebar = (
    <aside className="glass flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden">
      <div className="px-3 pt-4">
        <BrandMark size="sm" className="px-1" />
      </div>

      <div className="px-3 pt-3 pb-2">
        <button type="button" onClick={startNewChat} className="btn btn-secondary w-full">
          <MessageSquarePlus className="icon-sm" aria-hidden />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <h2 className="mb-1.5 px-2 text-sm font-semibold text-[var(--color-ink-muted)]">Chats</h2>
        {listsLoading ? (
          <div className="mb-4" aria-busy="true" aria-label="Loading chats">
            <WorkspaceNavSkeleton items={5} />
          </div>
        ) : (
          <>
            {chatGroups.length === 0 && (
              <p className="mb-4 px-2 text-[13px] text-[var(--color-ink-muted)]">No chats yet</p>
            )}
            {chatGroups.map((group) => (
              <div key={group.label} className="mb-3">
                <p className="mb-1 px-2 text-[13px] text-[var(--color-ink-muted)]">{group.label}</p>
                <ul className="space-y-0.5">
                  {group.items.map((c) => {
                    const active = selectedChatId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectConversation(c)}
                          className={clsx('nav-item', active && 'nav-item-active')}
                        >
                          <MessageSquare
                            className={clsx(
                              'icon-sm shrink-0',
                              active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{c.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </>
        )}

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between gap-2 px-2">
            <h2 className="text-sm font-semibold text-[var(--color-ink-muted)]">Files</h2>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-ghost inline-flex items-center gap-1 !px-2 text-[13px] disabled:opacity-60"
            >
              {uploading ? (
                <LoaderCircle className="icon-sm animate-spin" aria-hidden />
              ) : (
                <Upload className="icon-sm" aria-hidden />
              )}
              {uploadLabel}
            </button>
          </div>
          {listsLoading && pendingUploads.length === 0 ? (
            <div aria-busy="true" aria-label="Loading files">
              <WorkspaceNavSkeleton items={3} />
            </div>
          ) : (
            <ul className="space-y-0.5">
              {pendingUploads.map((upload) => (
                <li key={upload.localId}>
                  <div className="nav-item pointer-events-none items-start">
                    <FileText className="icon-sm mt-0.5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{upload.name}</span>
                      <FileActivity compact {...describeUpload(upload, activityNow)} />
                    </span>
                  </div>
                </li>
              ))}
              {recentFiles.map((doc) => {
                const activity =
                  isActiveDocument(doc) || doc.status === 'failed'
                    ? describeProcessing(doc, activityNow)
                    : null;
                const active = selectedDocId === doc.id;
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => selectDocument(doc.id)}
                      className={clsx('nav-item', activity && 'items-start', active && 'nav-item-active')}
                    >
                      <FileText
                        className={clsx(
                          'icon-sm mt-0.5 shrink-0',
                          active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{doc.name}</span>
                        {activity ? <FileActivity compact {...activity} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            to="/files"
            className="nav-item mt-0.5"
            onClick={() => setDrawerOpen(false)}
          >
            <Files className="icon-sm shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">View all files</span>
            <ArrowRight className="icon-sm shrink-0" aria-hidden />
          </Link>
        </div>
      </div>

      <div ref={accountMenuRef} className="relative z-10 border-t border-[var(--color-line)] p-2">
        {accountMenuOpen ? (
          <div
            role="menu"
            aria-label="Account"
            className="absolute inset-x-2 bottom-full z-20 mb-1 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-panel)] p-1 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.85)]"
          >
            <Link
              to="/profile"
              role="menuitem"
              className="nav-item"
              onClick={() => {
                setAccountMenuOpen(false);
                setDrawerOpen(false);
              }}
            >
              <UserRound className="icon-sm text-[var(--color-ink-muted)]" aria-hidden />
              Profile
            </Link>
            <Link
              to="/settings"
              role="menuitem"
              className="nav-item"
              onClick={() => {
                setAccountMenuOpen(false);
                setDrawerOpen(false);
              }}
            >
              <Settings className="icon-sm text-[var(--color-ink-muted)]" aria-hidden />
              Settings
            </Link>
            <div className="my-1 border-t border-[var(--color-line)]" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="nav-item btn-danger-text"
              onClick={() => {
                setAccountMenuOpen(false);
                setLogoutConfirmOpen(true);
              }}
            >
              <LogOut className="icon-sm" aria-hidden />
              Log out
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          onClick={() => setAccountMenuOpen((open) => !open)}
        >
          <UserAvatar user={user} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[var(--color-ink)]">
              {displayName(user)}
            </span>
            {user?.name?.trim() ? (
              <span className="block truncate text-[13px] text-[var(--color-ink-muted)]">{user.email}</span>
            ) : null}
          </span>
          <ChevronDown
            className={clsx(
              'icon-sm shrink-0 text-[var(--color-ink-muted)] motion-safe:transition-transform',
              accountMenuOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) void onUpload(files);
          e.target.value = '';
        }}
      />
    </aside>
  );

  const chatPanel = (
    <section className="surface flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="chrome-bar border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold tracking-tight">
          <MessageSquare className="icon text-[var(--color-ink-muted)]" aria-hidden />
          <span className="truncate">Library chat</span>
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
          {readyDocs.length > 0
            ? `Answers from all ${readyDocs.length} ready document${readyDocs.length === 1 ? '' : 's'}`
            : 'Upload a PDF, Word, Excel, or image file to start asking questions'}
          {selectedDoc ? ` · Viewing ${selectedDoc.name}` : ''}
        </p>
      </div>

      {!user?.canChat && (
        <div className="notice-warn m-4 rounded-[var(--radius-control)] px-3 py-2.5 text-sm backdrop-blur-sm">
          {!user?.hasOpenAIKey ? (
            <>
              Add your OpenAI key in{' '}
              <Link
                className="font-medium text-[var(--color-accent)] underline"
                to="/settings#api-key"
              >
                Settings → AI
              </Link>{' '}
              to upload files and chat.
            </>
          ) : (
            <>
              Your documents are ready. Finish chat setup in{' '}
              <Link
                className="font-medium text-[var(--color-accent)] underline"
                to="/settings#api-key"
              >
                Settings → AI
              </Link>
              {user.chatProvider && user.chatProvider !== 'openai'
                ? ` (add your ${
                    user.chatProvider === 'anthropic'
                      ? 'Claude'
                      : user.chatProvider === 'google'
                        ? 'Gemini'
                        : user.chatProvider === 'xai'
                          ? 'Grok'
                          : 'custom'
                  } key)`
                : ''}
              .
            </>
          )}
        </div>
      )}

      {notice ? (
        <div className="m-4 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/5 px-3 py-2.5 text-sm text-[var(--color-accent)]">
          {notice}
        </div>
      ) : null}

      {user?.deletionScheduledFor ? (
        <div className="m-4 rounded-[var(--radius-control)] border border-[var(--color-danger)]/40 bg-[color-mix(in_oklab,var(--color-danger)_12%,transparent)] px-3 py-2.5 text-sm">
          Account deletion is scheduled for{' '}
          <strong>{new Date(user.deletionScheduledFor).toLocaleString()}</strong>.{' '}
          <Link className="underline" to="/settings">
            Cancel in Settings
          </Link>{' '}
          or sign in again before then to keep your account.
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-busy={messagesLoading}>
        {messagesLoading ? (
          <ChatMessagesSkeleton />
        ) : (
          <>
            {messages.length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Ask anything about your uploaded files. Knowra searches across your whole library.
              </p>
            )}
            {messages.map((m) => {
              const timeLabel = formatMessageTime(m.createdAt, timeFormat);
              return (
                <div key={m.id} className="min-w-0">
                  <div
                    className={clsx(
                      'w-fit max-w-[70%] px-4 py-3 text-left text-sm leading-relaxed',
                      m.role === 'user'
                        ? 'bubble-user ml-auto whitespace-pre-wrap'
                        : 'bubble-ai min-w-0',
                    )}
                  >
                    <div className="bubble-meta">
                      <span className="inline-flex items-center gap-1.5">
                        {m.role === 'assistant' ? (
                          <img
                            src="/logo.png"
                            alt=""
                            className="size-3.5 rounded-[4px]"
                            aria-hidden
                          />
                        ) : null}
                        {m.role === 'user' ? 'You' : 'Knowra'}
                      </span>
                      {timeLabel ? (
                        <time dateTime={m.createdAt} className="shrink-0 tabular-nums">
                          {timeLabel}
                        </time>
                      ) : null}
                    </div>
                    {m.role === 'assistant' ? <ChatMarkdown content={m.content} /> : m.content}
                  </div>
                </div>
              );
            })}
            {busy && (
              <p className="inline-flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                <LoaderCircle className="icon animate-spin" aria-hidden />
                Knowra is thinking…
              </p>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onAsk} className="chrome-bar border-t border-[var(--color-line)] p-3">
        {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!user?.canChat || readyDocs.length === 0 || busy}
            placeholder={
              readyDocs.length > 0
                ? 'Ask anything across your documents…'
                : 'Upload a ready file to start chatting…'
            }
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={!user?.canChat || readyDocs.length === 0 || busy || !question.trim()}
            className="btn btn-primary"
          >
            <Send className="icon" aria-hidden />
            Ask
          </button>
        </div>
      </form>
    </section>
  );

  return (
    <div className="relative flex h-full flex-col">
      <div
        className="ambient-orb left-[-8%] top-[-10%] bg-white/15"
        aria-hidden
      />
      <div
        className="ambient-orb bottom-[-15%] right-[-5%] bg-white/8"
        style={{ animationDelay: '-6s' }}
        aria-hidden
      />

      <header className="relative z-10 mx-3 mt-3 flex items-center justify-between px-3 py-2 glass glass-tight lg:hidden">
        <button
          type="button"
          className="btn btn-secondary !min-h-9 !px-3 text-sm"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="icon" aria-hidden />
          Menu
        </button>
        <BrandMark size="sm" showWordmark className="!gap-2" />
        {selectedDoc ? (
          <div className="segmented" role="tablist" aria-label="Workspace panel">
            <button
              type="button"
              role="tab"
              aria-selected={mobilePanel === 'chat'}
              className={clsx('segmented-btn', mobilePanel === 'chat' && 'segmented-btn-active')}
              onClick={() => setMobilePanel('chat')}
            >
              <MessageSquare className="icon-sm" aria-hidden />
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobilePanel === 'document'}
              className={clsx('segmented-btn', mobilePanel === 'document' && 'segmented-btn-active')}
              onClick={() => setMobilePanel('document')}
            >
              <FileText className="icon-sm" aria-hidden />
              Doc
            </button>
          </div>
        ) : (
          <span className="w-[4.5rem]" aria-hidden />
        )}
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3 pt-3 lg:gap-4 lg:p-4">
        <div className="hidden lg:flex">{sidebar}</div>

        {drawerOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="m-3 h-[calc(100%-1.5rem)] shadow-none">{sidebar}</div>
            <button
              type="button"
              className="flex-1 bg-black/25 backdrop-blur-[2px]"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 gap-3 lg:gap-4">
          <div
            className={clsx(
              'flex min-h-0 min-w-0 flex-1',
              selectedDoc && mobilePanel !== 'chat' && 'hidden lg:flex',
            )}
          >
            {chatPanel}
          </div>
          {selectedDoc && (
            <div
              className={clsx(
                'min-h-0 min-w-0 flex-1',
                mobilePanel === 'document' ? 'flex lg:flex' : 'hidden lg:flex',
              )}
            >
              <section className="surface flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
                {selectedActivity ? (
                  <div className="border-b border-[var(--color-line)] px-4 py-3">
                    <p className="mb-2 truncate text-sm font-medium">{selectedDoc.name}</p>
                    <FileActivity {...selectedActivity} />
                  </div>
                ) : null}
                <div className="flex h-full min-h-0 w-full flex-1 flex-col">
                  {isOfficeMime(selectedDoc.mimeType) ? (
                    <OfficePreview
                      documentId={selectedDoc.id}
                      mimeType={selectedDoc.mimeType}
                      highlightPage={highlightPage}
                      onClose={closeDocumentView}
                    />
                  ) : (
                    <PdfViewer
                      documentId={selectedDoc.id}
                      mimeType={selectedDoc.mimeType}
                      highlightPage={highlightPage}
                      onClose={closeDocumentView}
                    />
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        title="Log out?"
        description="You’ll need to sign in again with an email code to continue using Knowra."
        confirmLabel="Log out"
        danger
        busy={logoutBusy}
        onCancel={() => {
          if (!logoutBusy) setLogoutConfirmOpen(false);
        }}
        onConfirm={() => {
          setLogoutBusy(true);
          void logout()
            .then(() => {
              setLogoutConfirmOpen(false);
              navigate('/auth');
            })
            .finally(() => setLogoutBusy(false));
        }}
      />
    </div>
  );
}
