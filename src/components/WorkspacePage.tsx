import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type UIEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  Copy,
  FileText,
  Files,
  LogOut,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Search,
  Send,
  Share2,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import type { ChatMessage, Conversation, KnowraDocument } from '../types';
import { isOfficeMime } from '../utils/fileTypes';
import { formatMessageTime, groupByRecency } from '../utils/format';
import { describeProcessing, isActiveDocument, useActivityClock } from '../utils/fileActivity';
import { usePreferences } from '../hooks/usePreferences';
import { BrandMark } from './BrandMark';
import { KnowraMark } from './KnowraMark';
import { ChatMarkdown } from './ChatMarkdown';
import { ConfirmDialog } from './ConfirmDialog';
import { ShareResponseDialog } from './ShareResponseDialog';
import { FileActivity } from './FileActivity';
import { OfficePreview } from './OfficePreview';
import { PdfViewer } from './PdfViewer';
import { ChatMessagesSkeleton, WorkspaceNavSkeleton } from './Skeleton';
import { LiveReply } from './ThinkingIndicator';
import { UserAvatar, displayName } from './UserAvatar';
import { copyRenderedMessage } from '../utils/copyResponse';

const CHAT_PAGE_SIZE = 20;

function useBriefStatus() {
  const [status, setStatus] = useState('');
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    };
  }, []);

  function show(next: string) {
    setStatus(next);
    if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setStatus(''), 1600);
  }

  return [status, show] as const;
}

function CopyResponseButton() {
  const [status, showStatus] = useBriefStatus();

  async function onCopy(event: MouseEvent<HTMLButtonElement>) {
    const node = event.currentTarget.closest('[data-response]')?.querySelector('.chat-md');
    if (!(node instanceof HTMLElement)) return;
    try {
      await copyRenderedMessage(node);
    } catch {
      return;
    }
    showStatus('Copied');
  }

  const label = status || 'copy response';

  return (
    <button
      type="button"
      className="bubble-action"
      data-tooltip={label}
      onClick={(event) => void onCopy(event)}
      aria-label={label}
    >
      {status ? <Check className="icon-sm" aria-hidden /> : <Copy className="icon-sm" aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </button>
  );
}

function EllipsisText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      const node = ref.current;
      if (!node) return;
      setOverflowing(node.scrollWidth > node.clientWidth + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={className} title={overflowing ? text : undefined}>
      {text}
    </span>
  );
}

function ShareResponseButton({ onShare }: { onShare: () => void }) {
  return (
    <button
      type="button"
      className="bubble-action"
      data-tooltip="share response"
      onClick={onShare}
      aria-label="share response"
    >
      <Share2 className="icon-sm" aria-hidden />
    </button>
  );
}

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
  const [shareText, setShareText] = useState<string | null>(null);
  const closeShare = useCallback(() => setShareText(null), []);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [visibleChatCount, setVisibleChatCount] = useState(CHAT_PAGE_SIZE);
  const [chatQuery, setChatQuery] = useState('');
  const [chatSearch, setChatSearch] = useState<{ query: string; conversations: Conversation[] } | null>(
    null,
  );
  const [searchingChats, setSearchingChats] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatSentinelRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const followChatRef = useRef(false);
  const skipConversationLoadRef = useRef<string | null>(null);
  const chatLoadIdRef = useRef(0);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const chatQueryRef = useRef(chatQuery);
  const searchRequestRef = useRef(0);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const refocusQuestionRef = useRef(false);
  chatQueryRef.current = chatQuery;

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === selectedDocId) ?? null,
    [documents, selectedDocId],
  );

  async function refreshLists() {
    const query = chatQueryRef.current.trim();
    const requestId = ++searchRequestRef.current;
    const [docsRes, chatsRes] = await Promise.all([
      api.listDocuments(),
      api.listConversations(),
    ]);
    setDocuments(docsRes.documents);
    setConversations(chatsRes.conversations);
    if (!query || chatQueryRef.current.trim() !== query) return;
    const searchRes = await api.listConversations(query);
    if (requestId !== searchRequestRef.current || chatQueryRef.current.trim() !== query) return;
    setChatSearch({ query: query.toLowerCase(), conversations: searchRes.conversations });
  }

  useEffect(() => {
    void refreshLists()
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load workspace');
      })
      .finally(() => setListsLoading(false));
  }, []);

  useEffect(() => {
    const query = chatQuery.trim();
    const requestId = ++searchRequestRef.current;
    setVisibleChatCount(CHAT_PAGE_SIZE);
    if (!query) {
      setChatSearch(null);
      setSearchingChats(false);
      return;
    }

    setSearchingChats(true);
    const handle = window.setTimeout(() => {
      void api
        .listConversations(query)
        .then((res) => {
          if (requestId !== searchRequestRef.current) return;
          setChatSearch({ query: query.toLowerCase(), conversations: res.conversations });
        })
        .catch(() => {
          if (requestId !== searchRequestRef.current) return;
        })
        .finally(() => {
          if (requestId === searchRequestRef.current) setSearchingChats(false);
        });
    }, 200);

    return () => window.clearTimeout(handle);
  }, [chatQuery]);

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
      skipConversationLoadRef.current = null;
      setMessages([]);
      setMessagesLoading(false);
      setTypingMessageId(null);
      return;
    }

    // The reply was just loaded in onAsk. Keep it so the typewriter can run,
    // including through Strict Mode's extra effect pass.
    if (skipConversationLoadRef.current === selectedChatId) return;

    skipConversationLoadRef.current = null;
    followChatRef.current = true;
    setTypingMessageId(null);
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

  useLayoutEffect(() => {
    if (!followChatRef.current || messagesLoading) return;
    const el = chatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, busy, typingMessageId, messagesLoading]);

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
    setTypingMessageId(null);
    setBusy(false);

    const next = new URLSearchParams();
    if (selectedDocId) next.set('doc', selectedDocId);
    setSearchParams(next, { replace: true });
    setMobilePanel('chat');
    setDrawerOpen(false);
  }

  const readyDocs = useMemo(
    () => documents.filter((d) => d.status === 'ready'),
    [documents],
  );

  function onChatScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    followChatRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
  }

  function stickChatToBottom() {
    const el = chatScrollRef.current;
    if (!el || !followChatRef.current) return;
    el.scrollTop = el.scrollHeight;
  }

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
    setTypingMessageId(null);
    setError('');
    followChatRef.current = true;
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
      const conv = await api.getConversation(res.conversationId);
      const reply = [...conv.messages].reverse().find((message) => message.role === 'assistant');
      if (res.conversationId !== selectedChatId) {
        skipConversationLoadRef.current = res.conversationId;
      }
      const nextParams: Record<string, string> = { conversation: res.conversationId };
      if (selectedDocId) nextParams.doc = selectedDocId;
      setSearchParams(nextParams);
      setMessages(conv.messages);
      setTypingMessageId(reply?.id ?? null);
      await refreshLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chat failed');
    } finally {
      refocusQuestionRef.current = true;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (busy || !refocusQuestionRef.current) return;
    refocusQuestionRef.current = false;
    questionInputRef.current?.focus();
  }, [busy]);

  const trimmedChatQuery = chatQuery.trim();
  const normalizedChatQuery = trimmedChatQuery.toLowerCase();
  const listedConversations = useMemo(() => {
    if (!normalizedChatQuery) return conversations;
    if (chatSearch?.query === normalizedChatQuery) return chatSearch.conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(normalizedChatQuery));
  }, [chatSearch, conversations, normalizedChatQuery]);
  const chatLimit =
    Number.isFinite(visibleChatCount) && visibleChatCount >= CHAT_PAGE_SIZE
      ? visibleChatCount
      : CHAT_PAGE_SIZE;
  const visibleConversations = listedConversations.slice(0, chatLimit);
  const chatGroups = groupByRecency(visibleConversations);
  const hasMoreChats = listedConversations.length > visibleConversations.length;

  useEffect(() => {
    const root = chatListRef.current;
    const sentinel = chatSentinelRef.current;
    if (!root || !sentinel || !hasMoreChats || listsLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleChatCount((count) => {
          const current = Number.isFinite(count) && count >= CHAT_PAGE_SIZE ? count : CHAT_PAGE_SIZE;
          return current + CHAT_PAGE_SIZE;
        });
      },
      { root, rootMargin: '48px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreChats, listsLoading, chatLimit]);

  const activityNow = useActivityClock(documents.some((doc) => isActiveDocument(doc)));
  const selectedActivity =
    selectedDoc && (isActiveDocument(selectedDoc) || selectedDoc.status === 'failed')
      ? describeProcessing(selectedDoc, activityNow)
      : null;

  const sidebar = (
    <aside className="glass flex h-full w-[17.5rem] max-lg:w-full shrink-0 flex-col overflow-hidden">
      <div className="px-3 pt-4">
        <BrandMark size="sm" className="px-1" />
      </div>

      <div className="px-3 pt-2">
        <button type="button" onClick={startNewChat} className="nav-item">
          <MessageSquarePlus className="icon-sm shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
          <span className="truncate">New Chat</span>
        </button>
        <Link to="/files" className="nav-item" onClick={() => setDrawerOpen(false)}>
          <Files className="icon-sm shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
          <span className="truncate">Files</span>
        </Link>
      </div>

      <div className="px-3 pt-3">
        <h2 className="mb-1.5 px-2 text-sm font-semibold text-[var(--color-ink-muted)]">Chats</h2>
        <div className="relative mb-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 icon-sm -translate-y-1/2 text-[var(--color-ink-muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && chatQuery) {
                e.preventDefault();
                setChatQuery('');
              }
            }}
            placeholder="Search chats"
            aria-label="Search chats"
            autoComplete="off"
            className="field chat-search !min-h-9 !py-1.5 !pr-8 !pl-8 text-sm"
          />
          {chatQuery ? (
            <button
              type="button"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              aria-label="Clear chat search"
              onClick={() => setChatQuery('')}
            >
              <X className="icon-sm" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div ref={chatListRef} className="flex-1 overflow-y-auto px-3 pb-3">
        {listsLoading ? (
          <div className="mb-4" aria-busy="true" aria-label="Loading chats">
            <WorkspaceNavSkeleton items={5} />
          </div>
        ) : (
          <>
            {chatGroups.length === 0 && (
              <p className="mb-4 px-2 text-[13px] text-[var(--color-ink-muted)]">
                {trimmedChatQuery
                  ? searchingChats
                    ? 'Searching…'
                    : 'No matching chats'
                  : 'No chats yet'}
              </p>
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
                          className={clsx(
                            'nav-item',
                            c.snippet && 'items-start',
                            active && 'nav-item-active',
                          )}
                        >
                          <MessageSquare
                            className={clsx(
                              'icon-sm shrink-0',
                              c.snippet && 'mt-0.5',
                              active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <EllipsisText text={c.title} className="block truncate" />
                            {c.snippet ? (
                              <span className="block truncate text-[12px] font-normal text-[var(--color-ink-muted)]">
                                {c.snippet}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {hasMoreChats ? <div ref={chatSentinelRef} className="h-px" aria-hidden /> : null}
          </>
        )}
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
    </aside>
  );

  const liveMessage =
    !busy && typingMessageId
      ? (messages.find((m) => m.id === typingMessageId && m.role === 'assistant') ?? null)
      : null;

  const chatPanel = (
    <section className="surface flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="chrome-bar hidden border-b border-[var(--color-line)] px-4 py-3 lg:block">
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

      <div
        ref={chatScrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4"
        aria-busy={messagesLoading}
        onScroll={onChatScroll}
      >
        {messagesLoading ? (
          <ChatMessagesSkeleton />
        ) : (
          <div className="flex min-h-full flex-col">
            <div className="space-y-4">
            {messages.length === 0 && (
              <p className="text-sm text-[var(--color-ink-muted)]">
                Ask anything about your uploaded files. Knowra searches across your whole library.
              </p>
            )}
            {messages.filter((m) => m.id !== liveMessage?.id).map((m) => {
              const timeLabel = formatMessageTime(m.createdAt, timeFormat);
              return (
                <div key={m.id} className="min-w-0" {...(m.role === 'assistant' ? { 'data-response': m.id } : {})}>
                  <div
                    className={clsx(
                      'w-fit max-w-[92%] px-3.5 py-2.5 text-left text-sm leading-relaxed sm:max-w-[70%] sm:px-4 sm:py-3',
                      m.role === 'user'
                        ? 'bubble-user ml-auto whitespace-pre-wrap'
                        : 'bubble-ai min-w-0',
                    )}
                  >
                    <div className="bubble-meta">
                      <span className="inline-flex items-center gap-1.5">
                        {m.role === 'assistant' ? (
                          <KnowraMark className="size-3.5 rounded-[4px]" />
                        ) : null}
                        {m.role === 'user' ? 'You' : 'Knowra'}
                      </span>
                      {timeLabel ? (
                        <time dateTime={m.createdAt} className="shrink-0 tabular-nums">
                          {timeLabel}
                        </time>
                      ) : null}
                    </div>
                    {m.role === 'assistant' ? (
                      <ChatMarkdown
                        content={m.content}
                        animate={m.id === typingMessageId}
                        onTick={stickChatToBottom}
                        onComplete={() =>
                          setTypingMessageId((current) => (current === m.id ? null : current))
                        }
                      />
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === 'assistant' && m.id !== typingMessageId && m.content.trim() ? (
                    <div className="bubble-actions">
                      <CopyResponseButton />
                      <ShareResponseButton onShare={() => setShareText(m.content)} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            {(busy || liveMessage) && (
              <LiveReply
                message={liveMessage}
                timeFormat={timeFormat}
                onTick={stickChatToBottom}
                onTypingComplete={() =>
                  setTypingMessageId((current) => (current === liveMessage?.id ? null : current))
                }
              />
            )}
            </div>
            <p className="mt-auto pt-4 text-center text-[11px] leading-snug text-[var(--color-ink-muted)]">
              Knowra is an AI and can make mistakes. Check important answers.
            </p>
          </div>
        )}
      </div>

      <form
        onSubmit={onAsk}
        className="chrome-bar border-t border-[var(--color-line)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {error && <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex items-center gap-2">
          <input
            ref={questionInputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!user?.canChat || readyDocs.length === 0 || busy}
            placeholder={
              readyDocs.length > 0
                ? 'Ask anything across your documents…'
                : 'Upload a ready file to start chatting…'
            }
            className="field min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={!user?.canChat || readyDocs.length === 0 || busy || !question.trim()}
            className="btn btn-primary shrink-0 !px-3.5 sm:!px-4"
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

      <header className="relative z-10 mx-2 mt-2 glass glass-tight lg:hidden">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            className="btn btn-secondary !size-10 !min-h-10 shrink-0 !px-0"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="icon" aria-hidden />
          </button>
          <BrandMark size="sm" showWordmark className="min-w-0 !gap-2" />
        </div>
        {selectedDoc ? (
          <div className="px-2 pb-2">
            <div className="segmented segmented-fill" role="tablist" aria-label="Workspace panel">
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
                Document
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-2 p-2 lg:gap-4 lg:p-4">
        <div className="hidden lg:flex">{sidebar}</div>

        {drawerOpen && (
          <div className="absolute inset-0 z-40 flex lg:hidden">
            <div className="h-full w-[min(17.5rem,calc(100%-3.25rem))] p-2 pr-0">{sidebar}</div>
            <button
              type="button"
              className="min-w-12 flex-1 bg-black/45"
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

      <ShareResponseDialog open={shareText !== null} text={shareText ?? ''} onClose={closeShare} />

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
