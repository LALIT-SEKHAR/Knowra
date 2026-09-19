import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { ChatMessage, Conversation, KnowraDocument, SourceRef } from '../types';
import { groupByRecency } from '../utils/format';
import { PdfViewer } from './PdfViewer';

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
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    void api
      .getConversation(selectedChatId)
      .then((res) => {
        setMessages(res.messages);
        if (res.conversation.documentId && res.conversation.documentId !== selectedDocId) {
          setSearchParams({
            doc: res.conversation.documentId,
            conversation: selectedChatId,
          });
        }
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load chat');
      });
  }, [selectedChatId, selectedDocId, setSearchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  function selectDocument(id: string) {
    setSearchParams({ doc: id });
    setDrawerOpen(false);
    setMobilePanel('document');
  }

  function selectConversation(c: Conversation) {
    const params: Record<string, string> = { conversation: c.id };
    if (c.documentId) params.doc = c.documentId;
    setSearchParams(params);
    setDrawerOpen(false);
    setMobilePanel('chat');
  }

  function startNewChat() {
    if (selectedDocId) {
      setSearchParams({ doc: selectedDocId });
    } else {
      setSearchParams({});
    }
    setMessages([]);
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

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    if (!selectedDocId || !question.trim()) return;
    if (selectedDoc?.status !== 'ready') {
      setError('Document must be ready before chatting.');
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
      const res = await api.chat(selectedDocId, q, selectedChatId || undefined);
      setSearchParams({ doc: selectedDocId, conversation: res.conversationId });
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
    if (source.pageNumber) {
      setHighlightPage(source.pageNumber);
      setMobilePanel('document');
    }
  }

  const chatGroups = groupByRecency(conversations);
  const recentFiles = documents.slice(0, 8);

  const sidebar = (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="border-b border-[var(--color-line)] px-4 py-4">
        <p className="font-[family-name:var(--font-display)] text-2xl">Knowra</p>
        <p className="text-xs text-[var(--color-ink-muted)]">Ask. Explore. Understand.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Chats
          </h2>
          <button
            type="button"
            onClick={startNewChat}
            className="text-xs text-[var(--color-accent)]"
          >
            + New Chat
          </button>
        </div>
        {chatGroups.length === 0 && (
          <p className="mb-4 text-xs text-[var(--color-ink-muted)]">No chats yet</p>
        )}
        {chatGroups.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="mb-1 text-[11px] uppercase text-[var(--color-ink-muted)]">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectConversation(c)}
                    className={clsx(
                      'w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]',
                      selectedChatId === c.id && 'bg-[var(--color-accent-soft)]',
                    )}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
              Files
            </h2>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-xs text-[var(--color-accent)]"
            >
              + Upload
            </button>
          </div>
          <ul className="space-y-0.5">
            {recentFiles.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => selectDocument(doc.id)}
                  className={clsx(
                    'w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent-soft)]',
                    selectedDocId === doc.id && 'bg-[var(--color-accent-soft)]',
                  )}
                >
                  {doc.name}
                  {doc.status !== 'ready' && (
                    <span className="ml-1 text-[11px] text-[var(--color-ink-muted)]">
                      ({doc.status})
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <Link
            to="/files"
            className="mt-2 inline-block text-xs text-[var(--color-accent)] underline"
            onClick={() => setDrawerOpen(false)}
          >
            View all files →
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] px-4 py-3 text-sm">
        <p className="truncate text-[var(--color-ink-muted)]">{user?.email}</p>
        <div className="mt-2 flex flex-col gap-1">
          <Link to="/settings" className="text-left hover:underline" onClick={() => setDrawerOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className="text-left hover:underline"
            onClick={() => void logout().then(() => navigate('/auth'))}
          >
            Logout
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
    <section className="flex min-w-0 flex-1 flex-col border-r border-[var(--color-line)] bg-white/40">
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="font-semibold">
          {selectedDoc ? selectedDoc.name : 'Select a document to chat'}
        </h2>
        {selectedDoc && (
          <p className="text-xs capitalize text-[var(--color-ink-muted)]">
            Status: {selectedDoc.status}
            {selectedDoc.status === 'failed' && selectedDoc.errorMessage
              ? ` — ${selectedDoc.errorMessage}`
              : ''}
          </p>
        )}
      </div>

      {!user?.hasOpenAIKey && (
        <div className="m-4 border border-[var(--color-warn)] bg-[#fff7eb] px-3 py-2 text-sm">
          Add your OpenAI API key in{' '}
          <Link className="underline" to="/settings">
            Settings
          </Link>{' '}
          to upload and chat.
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!selectedDoc && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Choose a file from the sidebar or upload a PDF to begin.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={clsx(m.role === 'user' ? 'text-right' : 'text-left')}>
            <div
              className={clsx(
                'inline-block max-w-[90%] whitespace-pre-wrap rounded px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-panel)] border border-[var(--color-line)]',
              )}
            >
              <p className="mb-1 text-[11px] opacity-70">
                {m.role === 'user' ? 'You' : 'Knowra'}
              </p>
              {m.content}
            </div>
            {m.sources && m.sources.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.sources.map((s) => (
                  <button
                    key={`${s.chunkId}-${s.pageNumber ?? 'x'}`}
                    type="button"
                    onClick={() => onSourceClick(s)}
                    className="rounded border border-[var(--color-line)] bg-white px-2 py-1 text-xs"
                  >
                    {s.pageNumber ? `Page ${s.pageNumber}` : 'Source'}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-[var(--color-ink-muted)]">Knowra is thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onAsk} className="border-t border-[var(--color-line)] p-3">
        {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!selectedDoc || selectedDoc.status !== 'ready' || busy}
            placeholder={
              selectedDoc?.status === 'ready'
                ? 'Ask something about this document…'
                : 'Waiting for document to be ready…'
            }
            className="flex-1 border border-[var(--color-line)] bg-white px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!selectedDoc || selectedDoc.status !== 'ready' || busy || !question.trim()}
            className="bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </form>
    </section>
  );

  const documentPanel = (
    <section className="hidden min-w-0 flex-1 flex-col lg:flex">
      {selectedDoc ? (
        <PdfViewer documentId={selectedDoc.id} highlightPage={highlightPage} />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--color-ink-muted)]">
          Document area — open a PDF to read alongside chat
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 lg:hidden">
        <button
          type="button"
          className="border border-[var(--color-line)] px-3 py-1.5 text-sm"
          onClick={() => setDrawerOpen(true)}
        >
          Menu
        </button>
        <p className="font-[family-name:var(--font-display)] text-lg">Knowra</p>
        <div className="flex gap-1">
          <button
            type="button"
            className={clsx(
              'px-2 py-1 text-sm',
              mobilePanel === 'chat' && 'bg-[var(--color-accent-soft)]',
            )}
            onClick={() => setMobilePanel('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={clsx(
              'px-2 py-1 text-sm',
              mobilePanel === 'document' && 'bg-[var(--color-accent-soft)]',
            )}
            onClick={() => setMobilePanel('document')}
          >
            Doc
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex">{sidebar}</div>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="h-full shadow-xl">{sidebar}</div>
            <button
              type="button"
              className="flex-1 bg-black/30"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1">
          <div className={clsx('min-w-0 flex-1', mobilePanel !== 'chat' && 'hidden lg:flex')}>
            {chatPanel}
          </div>
          <div
            className={clsx(
              'min-w-0 flex-1',
              mobilePanel === 'document' ? 'flex lg:flex' : 'hidden lg:flex',
            )}
          >
            {selectedDoc ? (
              <div className="flex h-full w-full flex-col">
                <PdfViewer documentId={selectedDoc.id} highlightPage={highlightPage} />
              </div>
            ) : (
              documentPanel
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
