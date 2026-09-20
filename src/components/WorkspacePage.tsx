import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  ArrowRight,
  FileText,
  Files,
  Info,
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
import type { ChatMessage, Conversation, KnowraDocument, SourceRef } from '../types';
import { formatMessageTime, groupByRecency } from '../utils/format';
import { BrandMark } from './BrandMark';
import { ConfirmDialog } from './ConfirmDialog';
import { PdfViewer } from './PdfViewer';
import { UserAvatar, displayName } from './UserAvatar';

export function WorkspacePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDocId = searchParams.get('doc');
  const selectedChatId = searchParams.get('conversation');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'document'>('chat');
  const [documents, setDocuments] = useState<KnowraDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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
    void refreshLists().catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Failed to load workspace');
    });
  }, []);

  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === 'processing');
    if (!hasProcessing) return;
    const id = setInterval(() => {
      void api.listDocuments().then((res) => setDocuments(res.documents));
    }, 2500);
    return () => clearInterval(id);
  }, [documents]);

  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    const loadId = ++chatLoadIdRef.current;
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

  function selectDocument(id: string) {
    const params: Record<string, string> = { doc: id };
    if (selectedChatId) params.conversation = selectedChatId;
    setSearchParams(params);
    setDrawerOpen(false);
    setMobilePanel('document');
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
    setHighlightPage(null);
    setBusy(false);

    const next = new URLSearchParams();
    if (selectedDocId) next.set('doc', selectedDocId);
    setSearchParams(next, { replace: true });
    setMobilePanel('chat');
    setDrawerOpen(false);
  }

  async function onUpload(file: File) {
    if (!user?.hasOpenAIKey) {
      setError('Add your OpenAI API key in Settings before uploading.');
      return;
    }
    setError('');
    try {
      const res = await api.uploadDocument(file);
      await refreshLists();
      setSearchParams({ doc: res.document.id });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    }
  }

  const readyDocs = useMemo(
    () => documents.filter((d) => d.status === 'ready'),
    [documents],
  );

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    if (!user?.hasOpenAIKey) {
      setError('Add your OpenAI API key in Settings before chatting.');
      return;
    }
    if (readyDocs.length === 0) {
      setError('Upload and process at least one PDF before chatting.');
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

  function onSourceClick(source: SourceRef) {
    const params: Record<string, string> = { doc: source.documentId };
    if (selectedChatId) params.conversation = selectedChatId;
    setSearchParams(params);
    if (source.pageNumber) {
      setHighlightPage(source.pageNumber);
    }
    setMobilePanel('document');
  }

  const chatGroups = groupByRecency(conversations);
  const recentFiles = documents.slice(0, 8);

  const sidebar = (
    <aside className="glass flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden">
      <div className="border-b border-[var(--color-line)] px-4 py-4">
        <BrandMark size="md" tagline />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-[var(--color-ink-muted)]">Chats</h2>
          <button
            type="button"
            onClick={startNewChat}
            className="btn-ghost inline-flex items-center gap-1 text-xs text-[var(--color-accent)]"
          >
            <MessageSquarePlus className="icon-sm" aria-hidden />
            New Chat
          </button>
        </div>
        {chatGroups.length === 0 && (
          <p className="mb-4 px-2 text-xs text-[var(--color-ink-muted)]">No chats yet</p>
        )}
        {chatGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="mb-1 px-2 text-[11px] font-medium text-[var(--color-ink-muted)]">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(c)}
                    className={clsx('nav-item', selectedChatId === c.id && 'nav-item-active')}
                  >
                    <MessageSquare className="icon-sm shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                    <span className="truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-[var(--color-ink-muted)]">Files</h2>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-ghost inline-flex items-center gap-1 text-xs text-[var(--color-accent)]"
            >
              <Upload className="icon-sm" aria-hidden />
              Upload
            </button>
          </div>
          <ul className="space-y-0.5">
            {recentFiles.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => selectDocument(doc.id)}
                  className={clsx('nav-item', selectedDocId === doc.id && 'nav-item-active')}
                >
                  <FileText className="icon-sm shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {doc.name}
                    {doc.status !== 'ready' && (
                      <span className="ml-1 text-[11px] text-[var(--color-ink-muted)]">({doc.status})</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/files"
            className="mt-2 inline-flex items-center gap-1 px-2 text-xs font-medium text-[var(--color-accent)]"
            onClick={() => setDrawerOpen(false)}
          >
            <Files className="icon-sm" aria-hidden />
            View all files
            <ArrowRight className="icon-sm" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] px-4 py-3 text-sm">
        <Link
          to="/profile"
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]"
          onClick={() => setDrawerOpen(false)}
        >
          <UserAvatar user={user} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[var(--color-ink)]">{displayName(user)}</p>
            {user?.name?.trim() ? (
              <p className="truncate text-xs text-[var(--color-ink-muted)]">{user.email}</p>
            ) : null}
          </div>
        </Link>
        <div className="mt-2 flex flex-col gap-0.5">
          <Link to="/profile" className="nav-item" onClick={() => setDrawerOpen(false)}>
            <UserRound className="icon-sm text-[var(--color-ink-muted)]" aria-hidden />
            Profile
          </Link>
          <Link to="/settings" className="nav-item" onClick={() => setDrawerOpen(false)}>
            <Settings className="icon-sm text-[var(--color-ink-muted)]" aria-hidden />
            Settings
          </Link>
          <button
            type="button"
            className="nav-item btn-danger-text"
            onClick={() => setLogoutConfirmOpen(true)}
          >
            <LogOut className="icon-sm" aria-hidden />
            Log out
          </button>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onUpload(file);
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
            : 'Upload a PDF to start asking questions'}
          {selectedDoc ? ` · Viewing ${selectedDoc.name}` : ''}
        </p>
      </div>

      {!user?.hasOpenAIKey && (
        <div className="notice-warn m-4 rounded-[var(--radius-control)] px-3 py-2.5 text-sm backdrop-blur-sm">
          Add your OpenAI API key in{' '}
          <Link className="font-medium text-[var(--color-accent)] underline" to="/settings">
            Settings
          </Link>{' '}
          to upload and chat.
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Ask anything about your uploaded PDFs. Knowra searches across your whole library.
          </p>
        )}
        {messages.map((m) => {
          const timeLabel = formatMessageTime(m.createdAt);
          return (
            <div key={m.id} className={clsx(m.role === 'user' ? 'text-right' : 'text-left')}>
              <div
                className={clsx(
                  'inline-block max-w-[90%] whitespace-pre-wrap px-3.5 py-2.5 text-sm',
                  m.role === 'user' ? 'bubble-user' : 'bubble-ai',
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[11px] opacity-70">
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
                {m.content}
              </div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.sources.map((s) => {
                    const detail = [
                      s.documentName || 'Document',
                      s.pageNumber ? `page ${s.pageNumber}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <button
                        key={`${s.chunkId}-${s.pageNumber ?? 'x'}`}
                        type="button"
                        onClick={() => onSourceClick(s)}
                        className="chip chip-icon"
                        title={detail}
                        aria-label={`Open source: ${detail}`}
                      >
                        <Info className="icon-sm" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {busy && (
          <p className="inline-flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <LoaderCircle className="icon animate-spin" aria-hidden />
            Knowra is thinking…
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onAsk} className="chrome-bar border-t border-[var(--color-line)] p-3">
        {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!user?.hasOpenAIKey || readyDocs.length === 0 || busy}
            placeholder={
              readyDocs.length > 0
                ? 'Ask anything across your documents…'
                : 'Upload a ready PDF to start chatting…'
            }
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={!user?.hasOpenAIKey || readyDocs.length === 0 || busy || !question.trim()}
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
                <div className="flex h-full min-h-0 w-full flex-1 flex-col">
                  <PdfViewer documentId={selectedDoc.id} highlightPage={highlightPage} />
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
