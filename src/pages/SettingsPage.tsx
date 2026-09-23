import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  Files,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageSquare,
  MessageSquareOff,
  RotateCcw,
  Save,
  Shield,
  Trash2,
  UserRound,
  UserX,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePreferences, type ThemePreference, type TimeFormat } from '../hooks/usePreferences';
import { UserAvatar, displayName } from '../components/UserAvatar';
import { BrandMark } from '../components/BrandMark';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { DeleteAllFilesDialog } from '../components/DeleteAllFilesDialog';
import type { AiSettings, ChatProviderId, ChatProviderOption } from '../types';
import clsx from 'clsx';

type ConfirmKind = 'remove-key' | 'clear-chats' | 'remove-provider-key' | null;
type SettingsSection = 'preferences' | 'api-key' | 'data' | 'account';
type ProviderKeyId = 'anthropic' | 'google' | 'xai' | 'custom';

const FALLBACK_PROVIDERS: ChatProviderOption[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Uses your OpenAI key (same as PDF processing).',
    needsSeparateKey: false,
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Fast and affordable — good default.' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', description: 'Stronger answers, still cost-friendly.' },
      { id: 'gpt-4.1', label: 'GPT-4.1', description: 'Best OpenAI quality for hard documents.' },
      { id: 'gpt-5-mini', label: 'GPT-5 mini', description: 'Stronger reasoning; slower and costlier.' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Claude',
    description: 'Anthropic Claude — add your Anthropic API key.',
    needsSeparateKey: true,
    models: [
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5', description: 'Fastest Claude — great everyday chat.' },
      { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', description: 'Balanced quality and speed.' },
      { id: 'claude-opus-4-5', label: 'Opus 4.5', description: 'Highest Claude quality for hard questions.' },
    ],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    description: 'Google Gemini — add your Google AI Studio key.',
    needsSeparateKey: true,
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast and affordable.' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Stronger reasoning and longer context.' },
    ],
  },
  {
    id: 'xai',
    label: 'Grok',
    description: 'xAI Grok — add your xAI API key.',
    needsSeparateKey: true,
    models: [
      { id: 'grok-3-mini', label: 'Grok 3 mini', description: 'Faster, lower-cost Grok.' },
      { id: 'grok-3', label: 'Grok 3', description: 'Full Grok quality for chat.' },
    ],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Any OpenAI-compatible API. Key optional.',
    needsSeparateKey: true,
    models: [],
  },
];

type ProviderGuide = {
  title: string;
  summary: string;
  steps: Array<{ text: string; href?: string; hrefLabel?: string }>;
  note?: string;
};

const PROVIDER_GUIDES: Record<string, ProviderGuide> = {
  openai: {
    title: 'How to use OpenAI for chat',
    summary: 'Uses the same OpenAI key from step 1 for document search and chat answers.',
    steps: [
      {
        text: 'Create or open an API key at',
        href: 'https://platform.openai.com/api-keys',
        hrefLabel: 'platform.openai.com/api-keys',
      },
      { text: 'Paste it in step 1 (Documents) and save.' },
      { text: 'Pick an OpenAI model above, then click Use for chat.' },
      { text: 'Enable billing on your OpenAI project or requests will fail.' },
    ],
    note: 'OpenAI is always required for PDF reading and search, even if chat uses another provider.',
  },
  anthropic: {
    title: 'How to get a Claude (Anthropic) key',
    summary: 'Claude answers your questions. OpenAI is still used only for searching your PDFs.',
    steps: [
      {
        text: 'Sign in or create an account at',
        href: 'https://console.anthropic.com/',
        hrefLabel: 'console.anthropic.com',
      },
      {
        text: 'Open API keys and create a key at',
        href: 'https://console.anthropic.com/settings/keys',
        hrefLabel: 'console.anthropic.com/settings/keys',
      },
      { text: 'Copy the key and paste it in the Claude API key field below.' },
      { text: 'Choose Haiku, Sonnet, or Opus, then save — Knowra applies Claude for chat.' },
      { text: 'Add credits / billing in Anthropic Console if prompted.' },
    ],
    note: 'Your Claude key is stored separately and kept if you switch to another provider later.',
  },
  google: {
    title: 'How to get a Gemini (Google AI) key',
    summary: 'Gemini answers your questions. OpenAI is still used only for searching your PDFs.',
    steps: [
      {
        text: 'Open Google AI Studio at',
        href: 'https://aistudio.google.com/apikey',
        hrefLabel: 'aistudio.google.com/apikey',
      },
      { text: 'Sign in with your Google account and create an API key.' },
      { text: 'Copy the key and paste it in the Gemini API key field below.' },
      { text: 'Choose Flash or Pro, then save to apply Gemini for chat.' },
      {
        text: 'If keys are restricted, allow Generative Language API in',
        href: 'https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
        hrefLabel: 'Google Cloud Console',
      },
    ],
    note: 'Your Gemini key is stored separately and kept if you switch to another provider later.',
  },
  xai: {
    title: 'How to get a Grok (xAI) key',
    summary: 'Grok answers your questions. OpenAI is still used only for searching your PDFs.',
    steps: [
      {
        text: 'Sign in at',
        href: 'https://console.x.ai/',
        hrefLabel: 'console.x.ai',
      },
      {
        text: 'Create an API key from the xAI console (API keys section).',
        href: 'https://console.x.ai/team/default/api-keys',
        hrefLabel: 'console.x.ai → API keys',
      },
      { text: 'Copy the key and paste it in the Grok API key field below.' },
      { text: 'Choose a Grok model, then save to apply it for chat.' },
      { text: 'Ensure your xAI account has available credits.' },
    ],
    note: 'Your Grok key is stored separately and kept if you switch to another provider later.',
  },
  custom: {
    title: 'How to set up a custom endpoint',
    summary:
      'Use any OpenAI-compatible chat API (Ollama, Groq, OpenRouter, Together, Azure OpenAI, etc.).',
    steps: [
      {
        text: 'Find your provider’s OpenAI-compatible base URL (usually ends with /v1).',
      },
      {
        text: 'Examples: Ollama http://127.0.0.1:11434/v1 · Groq https://api.groq.com/openai/v1 · OpenRouter https://openrouter.ai/api/v1',
      },
      { text: 'Enter the exact model name your provider expects (e.g. llama3.2 or openai/gpt-4o-mini).' },
      { text: 'API key is optional — leave blank for local Ollama; required for Groq/OpenRouter.' },
      { text: 'Click Use for chat. Knowra still needs your OpenAI key for PDF search.' },
    ],
    note: 'The endpoint must support OpenAI-style chat completions.',
  },
};

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: typeof Clock3;
}[] = [
  { id: 'preferences', label: 'Preferences', icon: Clock3 },
  { id: 'api-key', label: 'AI', icon: KeyRound },
  { id: 'data', label: 'Data', icon: Files },
  { id: 'account', label: 'Account', icon: Shield },
];

function sectionFromHash(): SettingsSection {
  const hash = window.location.hash.replace(/^#/, '');
  if (SECTIONS.some((s) => s.id === hash)) return hash as SettingsSection;
  return 'preferences';
}

function providerHasKey(settings: AiSettings | null, provider: string): boolean {
  if (!settings) return false;
  if (provider === 'openai') return settings.hasOpenAIKey;
  if (provider === 'anthropic') return settings.hasAnthropicKey;
  if (provider === 'google') return settings.hasGoogleKey;
  if (provider === 'xai') return settings.hasXaiKey;
  if (provider === 'custom') return settings.hasCustomKey;
  return false;
}

function providerChatReady(settings: AiSettings | null, provider: string): boolean {
  if (!settings?.hasOpenAIKey) return false;
  const resolved = provider || 'openai';
  if (resolved === 'openai') return true;
  if (resolved === 'custom') {
    return Boolean(settings.customBaseUrl?.trim());
  }
  return providerHasKey(settings, resolved);
}

function draftProviderReady(
  settings: AiSettings | null,
  provider: string,
  customBaseUrl: string,
): boolean {
  if (!settings?.hasOpenAIKey) return false;
  if (provider === 'openai') return true;
  if (provider === 'custom') return Boolean(customBaseUrl.trim());
  return providerHasKey(settings, provider);
}

function providerLast4(settings: AiSettings | null, provider: string): string | null {
  if (!settings) return null;
  if (provider === 'openai') return settings.openaiKeyLast4;
  if (provider === 'anthropic') return settings.anthropicKeyLast4;
  if (provider === 'google') return settings.googleKeyLast4;
  if (provider === 'xai') return settings.xaiKeyLast4;
  if (provider === 'custom') return settings.customKeyLast4;
  return null;
}

function chatReadiness(
  settings: AiSettings | null,
  draftProvider: string,
  providerLabel: string,
  modelLabel: string,
  draftReady: boolean,
  isDirty: boolean,
): { ready: boolean; title: string; detail: string } {
  if (!settings?.hasOpenAIKey) {
    return {
      ready: false,
      title: 'OpenAI key required',
      detail: 'Add it below to upload PDFs, Word, Excel, and images and make them searchable.',
    };
  }

  if (isDirty) {
    if (!draftReady) {
      if (draftProvider === 'custom') {
        return {
          ready: false,
          title: 'Custom setup incomplete',
          detail: 'Add a base URL (API key optional), then apply. Home still uses your current chat provider.',
        };
      }
      return {
        ready: false,
        title: `${providerLabel} not applied yet`,
        detail: `Add the ${providerLabel} key below to apply. Home still uses your current chat provider.`,
      };
    }
    return {
      ready: false,
      title: 'Ready to apply',
      detail: `Click “Use for chat” to switch answers to ${providerLabel} · ${modelLabel}.`,
    };
  }

  if (!providerChatReady(settings, settings.chatProvider)) {
    return {
      ready: false,
      title: 'Chat setup incomplete',
      detail: 'Finish the active chat provider setup below.',
    };
  }

  const activeLabel =
    settings.chatProvider === 'anthropic'
      ? 'Claude'
      : settings.chatProvider === 'google'
        ? 'Gemini'
        : settings.chatProvider === 'xai'
          ? 'Grok'
          : settings.chatProvider === 'custom'
            ? 'Custom'
            : 'OpenAI';

  return {
    ready: true,
    title: 'Ready to chat',
    detail: `Answers use ${activeLabel}. Keys for other providers are kept when you switch.`,
  };
}

function filesDeletedMessage(
  deletedDocuments: number,
  deletedFolders: number,
  deleteFolders: boolean,
): string {
  if (deletedDocuments === 0 && (!deleteFolders || deletedFolders === 0)) {
    return deleteFolders ? 'No files or folders to delete.' : 'No files to delete.';
  }
  const fileLabel = `${deletedDocuments} file${deletedDocuments === 1 ? '' : 's'}`;
  if (!deleteFolders) return `Deleted ${fileLabel}. Folders were kept.`;
  if (deletedFolders === 0) return `Deleted ${fileLabel}.`;
  const folderLabel = `${deletedFolders} folder${deletedFolders === 1 ? '' : 's'}`;
  if (deletedDocuments === 0) return `Deleted ${folderLabel}.`;
  return `Deleted ${fileLabel} and ${folderLabel}.`;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const { timeFormat, setTimeFormat, theme, resolvedTheme, setTheme } = usePreferences();
  const [section, setSection] = useState<SettingsSection>(sectionFromHash);
  const [apiKey, setApiKey] = useState('');
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [chatProviders, setChatProviders] = useState<ChatProviderOption[]>(FALLBACK_PROVIDERS);
  const [chatProvider, setChatProvider] = useState<ChatProviderId | string>(
    user?.chatProvider ?? 'openai',
  );
  const [chatModel, setChatModel] = useState(user?.chatModel ?? 'gpt-4o-mini');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customModelInput, setCustomModelInput] = useState('gpt-4o-mini');
  const [providerKey, setProviderKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [pendingProviderDelete, setPendingProviderDelete] = useState<ProviderKeyId | null>(null);
  const [deleteFilesOpen, setDeleteFilesOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [preferenceSaved, setPreferenceSaved] = useState('');

  const activeProvider = useMemo(
    () => chatProviders.find((p) => p.id === chatProvider) ?? chatProviders[0],
    [chatProviders, chatProvider],
  );

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await api.getSettings();
        if (cancelled) return;
        applySettings(next);
      } catch {
        /* keep fallbacks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySettings(next: AiSettings) {
    setSettings(next);
    setChatProviders(next.chatProviders?.length ? next.chatProviders : FALLBACK_PROVIDERS);
    setChatProvider(next.chatProvider || 'openai');
    setChatModel(next.chatModel || 'gpt-4o-mini');
    setCustomBaseUrl(next.customBaseUrl || '');
    if ((next.chatProvider || 'openai') === 'custom') {
      setCustomModelInput(next.chatModel || 'gpt-4o-mini');
    }
  }

  function goToSection(id: SettingsSection) {
    setSection(id);
    window.history.replaceState(null, '', `#${id}`);
    setMessage('');
    setError('');
    setPreferenceSaved('');
  }

  function onTimeFormatChange(format: TimeFormat) {
    setTimeFormat(format);
    setPreferenceSaved(
      format === '12h' ? 'Using 12-hour time with AM/PM.' : 'Using 24-hour time.',
    );
  }

  function onThemeChange(next: ThemePreference) {
    setTheme(next);
    const label = next === 'system' ? 'system' : next;
    setPreferenceSaved(
      next === 'system'
        ? `Appearance follows this device.`
        : `Using ${label} appearance.`,
    );
  }

  function resetPreferences() {
    setTimeFormat('12h');
    setTheme('system');
    setPreferenceSaved('Preferences reset to defaults.');
    setMessage('');
    setError('');
  }

  async function onSaveOpenAI(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api.putOpenAIKey(apiKey.trim());
      setApiKey('');
      applySettings(next);
      setMessage('OpenAI API key saved securely.');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  }

  async function saveChatPrefs(
    nextProvider: string,
    nextModel: string,
    nextBaseUrl?: string,
    opts?: { announce?: boolean },
  ) {
    setChatBusy(true);
    setError('');
    if (opts?.announce) setMessage('');
    try {
      const next = await api.putChatPrefs({
        chatProvider: nextProvider,
        chatModel: nextModel,
        ...(nextProvider === 'custom' && (nextBaseUrl ?? customBaseUrl).trim()
          ? { customBaseUrl: (nextBaseUrl ?? customBaseUrl).trim() }
          : {}),
      });
      applySettings(next);
      await refreshUser();
      if (opts?.announce) setMessage('Chat provider applied.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update chat settings');
      throw err;
    } finally {
      setChatBusy(false);
    }
  }

  function onProviderChange(providerId: string) {
    if (providerId === chatProvider || chatBusy) return;
    const catalog = chatProviders.find((p) => p.id === providerId);
    const nextModel =
      providerId === 'custom'
        ? customModelInput.trim() || 'gpt-4o-mini'
        : catalog?.models.find((m) => m.id === chatModel)?.id ||
          catalog?.models[0]?.id ||
          'gpt-4o-mini';
    setChatProvider(providerId);
    setChatModel(nextModel);
    setProviderKey('');
    setError('');
    setMessage('');
  }

  function onModelChange(modelId: string) {
    if (modelId === chatModel || chatBusy) return;
    setChatModel(modelId);
    setError('');
    setMessage('');
  }

  async function onApplyChatSettings() {
    const model = chatProvider === 'custom' ? customModelInput.trim() : chatModel;
    if (!model) {
      setError('Choose a chat model first.');
      return;
    }
    if (!draftProviderReady(settings, chatProvider, customBaseUrl)) {
      setError(
        chatProvider === 'custom'
          ? 'Add a custom base URL before applying.'
          : `Add your ${activeProvider?.label ?? 'provider'} API key below before applying.`,
      );
      return;
    }
    try {
      await saveChatPrefs(chatProvider, model, customBaseUrl, { announce: true });
    } catch {
      /* error already set */
    }
  }

  async function onSaveCustomSetup(e: FormEvent) {
    e.preventDefault();
    const model = customModelInput.trim();
    const baseUrl = customBaseUrl.trim();
    const key = providerKey.trim();
    if (!baseUrl || !model) {
      setError('Enter a base URL and model name for custom chat.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setChatModel(model);
      const next = await api.putProviderKey({
        provider: 'custom',
        apiKey: key,
        baseUrl,
        activate: true,
        chatModel: model,
      });
      setProviderKey('');
      applySettings(next);
      await refreshUser();
      setMessage('Custom chat endpoint applied.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save custom setup');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveProviderKey(e: FormEvent) {
    e.preventDefault();
    if (chatProvider === 'openai' || chatProvider === 'custom') return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api.putProviderKey({
        provider: chatProvider,
        apiKey: providerKey.trim(),
        activate: true,
        chatModel,
      });
      setProviderKey('');
      applySettings(next);
      await refreshUser();
      setMessage(`${activeProvider?.label ?? 'Provider'} key saved and applied for chat.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save provider key');
    } finally {
      setBusy(false);
    }
  }

  async function onCancelDeletion() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await api.cancelAccountDeletion();
      await refreshUser();
      setMessage(
        res.cancelled
          ? 'Account deletion cancelled. Your account and data are safe.'
          : 'No pending deletion to cancel.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel deletion');
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/auth', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign out');
      setBusy(false);
    }
  }

  async function runConfirmedAction() {
    if (!confirmKind) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (confirmKind === 'remove-key') {
        const next = await api.deleteOpenAIKey();
        applySettings(next);
        setMessage('OpenAI API key removed.');
        await refreshUser();
      } else if (confirmKind === 'remove-provider-key' && pendingProviderDelete) {
        const next = await api.deleteProviderKey(pendingProviderDelete);
        applySettings(next);
        setMessage('Chat provider key removed.');
        await refreshUser();
      } else if (confirmKind === 'clear-chats') {
        const res = await api.clearChatHistory();
        setMessage(
          res.deletedConversations === 0
            ? 'No chats to clear.'
            : `Cleared ${res.deletedConversations} chat${res.deletedConversations === 1 ? '' : 's'}.`,
        );
      }
      setConfirmKind(null);
      setPendingProviderDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
      setConfirmKind(null);
      setPendingProviderDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const confirmCopy: Record<
    Exclude<ConfirmKind, null>,
    { title: string; description: string; confirmLabel: string }
  > = {
    'remove-key': {
      title: 'Remove OpenAI API key?',
      description:
        'Knowra won’t be able to read or search your PDFs until you add an OpenAI key again.',
      confirmLabel: 'Remove key',
    },
    'remove-provider-key': {
      title: 'Remove chat provider key?',
      description: 'You’ll need to add this provider’s key again before using it for chat.',
      confirmLabel: 'Remove key',
    },
    'clear-chats': {
      title: 'Clear all chat history?',
      description:
        'This permanently deletes every conversation and message in your account. Your uploaded files stay.',
      confirmLabel: 'Clear chats',
    },
  };

  const activeMeta = SECTIONS.find((s) => s.id === section)!;
  const needsProviderKey = Boolean(activeProvider?.needsSeparateKey && chatProvider !== 'custom');
  const modelLabel =
    chatProvider === 'custom'
      ? customModelInput || chatModel
      : activeProvider?.models.find((m) => m.id === chatModel)?.label || chatModel;
  const savedProvider = settings?.chatProvider || 'openai';
  const savedModel = settings?.chatModel || 'gpt-4o-mini';
  const draftModel = chatProvider === 'custom' ? customModelInput.trim() || chatModel : chatModel;
  const isDirty =
    chatProvider !== savedProvider ||
    draftModel !== savedModel ||
    (chatProvider === 'custom' &&
      customBaseUrl.trim().replace(/\/$/, '') !== (settings?.customBaseUrl || '').replace(/\/$/, ''));
  const draftReady = draftProviderReady(settings, chatProvider, customBaseUrl);
  const readiness = chatReadiness(
    settings,
    chatProvider,
    activeProvider?.label ?? 'Chat',
    modelLabel,
    draftReady,
    isDirty,
  );

  return (
    <div className="page-shell relative mx-auto max-w-4xl">
      <div className="ambient-orb right-[-8%] top-[10%] bg-white/10" aria-hidden />

      <div className="relative z-10 pb-10">
        <Link
          to="/"
          className="btn btn-ghost !px-0 text-sm text-[var(--color-ink-muted)]"
        >
          <ArrowLeft className="icon" aria-hidden />
          Back to workspace
        </Link>

        <header className="mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl tracking-tight sm:text-3xl">
              <BrandMark size="sm" showWordmark={false} />
              Settings
            </h1>
            <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
              Preferences, AI setup, and account data.
            </p>
          </div>

          <Link
            to="/profile"
            className="group inline-flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/[0.04] py-2.5 pr-2.5 pl-2 transition-colors hover:bg-white/[0.07] sm:w-auto"
          >
            <UserAvatar user={user} size="sm" />
            <div className="min-w-0 flex-1 sm:max-w-[10.5rem] sm:flex-none">
              <p className="truncate text-sm leading-tight text-[var(--color-ink)]">
                {displayName(user)}
              </p>
              <p className="truncate text-[11px] text-[var(--color-ink-muted)]">Edit profile</p>
            </div>
            <ChevronRight
              className="size-4 shrink-0 text-[var(--color-ink-muted)] transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>
        </header>

        {(message || error) && (
          <div
            className={clsx('settings-flash mt-5', error && 'settings-flash-error')}
            role="status"
          >
            {error || message}
          </div>
        )}

        <div className="glass settings-layout mt-6 overflow-hidden">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={clsx(
                  'settings-nav-btn',
                  section === id && 'settings-nav-btn-active',
                )}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => goToSection(id)}
              >
                <Icon className="icon-sm shrink-0" strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-panel" role="tabpanel" aria-label={activeMeta.label}>
            {section === 'preferences' && (
              <section>
                <h2 className="settings-section-title">Preferences</h2>
                <p className="settings-section-desc">
                  Choose appearance and how chat timestamps appear across Knowra.
                </p>

                <div className="mt-6">
                  <div className="settings-row !border-t-0 !pt-0">
                    <div className="settings-row-label">
                      <p>Appearance</p>
                      <p>
                        {theme === 'system'
                          ? `Follows this device (${resolvedTheme} right now).`
                          : theme === 'light'
                            ? 'Light appearance across Knowra.'
                            : 'Dark appearance across Knowra.'}
                      </p>
                    </div>
                    <div className="settings-row-action">
                      <div className="segmented" role="group" aria-label="Appearance">
                        {(
                          [
                            ['system', 'System'],
                            ['light', 'Light'],
                            ['dark', 'Dark'],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={clsx('segmented-btn', theme === id && 'segmented-btn-active')}
                            aria-pressed={theme === id}
                            onClick={() => onThemeChange(id)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-label">
                      <p>Time format</p>
                      <p>
                        Preview:{' '}
                        <span className="tabular-nums text-[var(--color-ink)]">
                          {new Date().toLocaleTimeString(undefined, {
                            hour: timeFormat === '24h' ? '2-digit' : 'numeric',
                            minute: '2-digit',
                            hour12: timeFormat === '12h',
                          })}
                        </span>
                      </p>
                    </div>
                    <div className="settings-row-action">
                      <div className="segmented" role="group" aria-label="Time format">
                        <button
                          type="button"
                          className={clsx(
                            'segmented-btn',
                            timeFormat === '12h' && 'segmented-btn-active',
                          )}
                          aria-pressed={timeFormat === '12h'}
                          onClick={() => onTimeFormatChange('12h')}
                        >
                          12-hour
                        </button>
                        <button
                          type="button"
                          className={clsx(
                            'segmented-btn',
                            timeFormat === '24h' && 'segmented-btn-active',
                          )}
                          aria-pressed={timeFormat === '24h'}
                          onClick={() => onTimeFormatChange('24h')}
                        >
                          24-hour
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-label">
                      <p>Reset preferences</p>
                      <p>Restore appearance to system and time format to 12-hour.</p>
                    </div>
                    <div className="settings-row-action">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={resetPreferences}
                      >
                        <RotateCcw className="icon-sm" aria-hidden />
                        Reset
                      </button>
                    </div>
                  </div>
                </div>

                {preferenceSaved ? (
                  <p className="mt-4 text-sm text-[var(--color-accent)]">{preferenceSaved}</p>
                ) : null}
              </section>
            )}

            {section === 'api-key' && (
              <section>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="settings-section-title">AI</h2>
                    <p className="settings-section-desc max-w-lg">
                      OpenAI powers PDF reading and search. Chat answers can use a different
                      provider.
                    </p>
                  </div>
                </div>

                <div
                  className={clsx(
                    'settings-ready mt-5',
                    readiness.ready ? 'settings-ready-ok' : 'settings-ready-warn',
                  )}
                  role="status"
                >
                  <span className="settings-ready-icon" aria-hidden>
                    {readiness.ready ? (
                      <Check className="size-3.5" strokeWidth={2.5} />
                    ) : (
                      <KeyRound className="size-3.5" strokeWidth={2} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="settings-ready-title">{readiness.title}</p>
                    <p className="settings-ready-detail">{readiness.detail}</p>
                  </div>
                </div>

                <div className="settings-ai-step mt-8">
                  <div className="settings-ai-step-head">
                    <span className="settings-ai-step-num" aria-hidden>
                      1
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="settings-ai-step-title">Documents</h3>
                        {user?.hasOpenAIKey ? (
                          <span className="settings-status settings-status-ok">
                            <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
                            OpenAI ·•••{user.openaiKeyLast4}
                          </span>
                        ) : (
                          <span className="settings-status settings-status-warn">
                            Key needed
                          </span>
                        )}
                      </div>
                      <p className="settings-section-desc !mt-1">
                        Required. Reads scanned PDFs and creates search embeddings.
                      </p>
                    </div>
                  </div>

                  <form className="mt-4 space-y-3" onSubmit={onSaveOpenAI}>
                    <label className="block text-sm font-medium">
                      OpenAI secret key
                      <div className="relative mt-1.5 max-w-lg">
                        <KeyRound
                          className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-[var(--color-ink-muted)]"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="sk-..."
                          autoComplete="off"
                          spellCheck={false}
                          className="field !pl-10"
                          required
                        />
                      </div>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={busy} className="btn btn-primary">
                        {busy ? (
                          <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                        ) : (
                          <Save className="icon-sm" aria-hidden />
                        )}
                        {busy ? 'Saving…' : user?.hasOpenAIKey ? 'Replace key' : 'Save key'}
                      </button>
                      {user?.hasOpenAIKey && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmKind('remove-key')}
                          className="btn btn-danger-soft"
                        >
                          <Trash2 className="icon-sm" aria-hidden />
                          Remove
                        </button>
                      )}
                    </div>
                  </form>

                  <details className="group mt-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronRight
                          className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                          strokeWidth={2}
                          aria-hidden
                        />
                        How to get an OpenAI key
                      </span>
                    </summary>
                    <ol className="mt-3 max-w-lg list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                      <li>
                        Sign in at{' '}
                        <a
                          href="https://platform.openai.com/api-keys"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--color-accent)] underline"
                        >
                          platform.openai.com/api-keys
                        </a>
                        .
                      </li>
                      <li>Create a secret key and paste it above.</li>
                      <li>Enable billing on your OpenAI project or calls will fail.</li>
                    </ol>
                  </details>
                </div>

                <div className="settings-ai-step mt-8">
                  <div className="settings-ai-step-head">
                    <span className="settings-ai-step-num" aria-hidden>
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="settings-ai-step-title inline-flex items-center gap-2">
                          <MessageSquare className="size-4" strokeWidth={1.75} aria-hidden />
                          Chat answers
                        </h3>
                        {chatBusy ? (
                          <LoaderCircle
                            className="size-4 animate-spin text-[var(--color-ink-muted)]"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <p className="settings-section-desc !mt-1">
                        Pick a provider and model, then apply. Keys are kept when you switch —
                        you won’t need to re-enter Gemini after using Grok.
                      </p>
                    </div>
                  </div>

                  <p className="mt-5 text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
                    Provider
                  </p>
                  <div
                    className="settings-provider-grid mt-2"
                    role="radiogroup"
                    aria-label="Chat provider"
                  >
                    {chatProviders.map((provider) => {
                      const selected = chatProvider === provider.id;
                      const isLive = provider.id === savedProvider;
                      const saved =
                        provider.id === 'openai'
                          ? Boolean(settings?.hasOpenAIKey)
                          : provider.id === 'custom'
                            ? Boolean(settings?.customBaseUrl?.trim())
                            : providerHasKey(settings, provider.id);
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={chatBusy}
                          className={clsx(
                            'settings-provider-chip',
                            selected && 'settings-provider-chip-active',
                          )}
                          onClick={() => onProviderChange(provider.id)}
                        >
                          <span className="settings-provider-chip-label">{provider.label}</span>
                          {isLive ? (
                            <span className="settings-provider-chip-badge">In use</span>
                          ) : saved ? (
                            <span className="settings-provider-chip-badge">Saved</span>
                          ) : provider.id === 'custom' ? (
                            <span className="settings-provider-chip-badge settings-provider-chip-badge-muted">
                              Needs URL
                            </span>
                          ) : provider.needsSeparateKey ? (
                            <span className="settings-provider-chip-badge settings-provider-chip-badge-muted">
                              Needs key
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {PROVIDER_GUIDES[chatProvider] ? (
                    <details className="group settings-provider-guide mt-4" open>
                      <summary className="cursor-pointer list-none text-sm font-medium text-[var(--color-ink)] transition-colors hover:text-[var(--color-accent)] [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight
                            className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
                            strokeWidth={2}
                            aria-hidden
                          />
                          {PROVIDER_GUIDES[chatProvider].title}
                        </span>
                      </summary>
                      <div className="mt-3 space-y-3">
                        <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
                          {PROVIDER_GUIDES[chatProvider].summary}
                        </p>
                        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                          {PROVIDER_GUIDES[chatProvider].steps.map((step, index) => (
                            <li key={`${chatProvider}-step-${index}`}>
                              {step.text}
                              {step.href ? (
                                <>
                                  {' '}
                                  <a
                                    href={step.href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[var(--color-accent)] underline"
                                  >
                                    {step.hrefLabel || step.href}
                                  </a>
                                  .
                                </>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                        {PROVIDER_GUIDES[chatProvider].note ? (
                          <p className="text-xs leading-relaxed text-[var(--color-ink-muted)]">
                            {PROVIDER_GUIDES[chatProvider].note}
                          </p>
                        ) : null}
                      </div>
                    </details>
                  ) : null}

                  {activeProvider && activeProvider.models.length > 0 ? (
                    <>
                      <p className="mt-5 text-xs font-medium tracking-wide text-[var(--color-ink-muted)] uppercase">
                        Model
                      </p>
                      <div
                        className="settings-model-list settings-model-list-compact mt-2"
                        role="radiogroup"
                        aria-label="Chat model"
                      >
                        {activeProvider.models.map((model) => {
                          const active = chatModel === model.id;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              disabled={chatBusy}
                              className={clsx(
                                'settings-model-option',
                                active && 'settings-model-option-active',
                              )}
                              onClick={() => void onModelChange(model.id)}
                            >
                              <span className="settings-model-radio" aria-hidden>
                                {active ? <Check className="size-3" strokeWidth={2.5} /> : null}
                              </span>
                              <span className="min-w-0 text-left">
                                <span className="block text-sm font-medium text-[var(--color-ink)]">
                                  {model.label}
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--color-ink-muted)]">
                                  {model.description}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}

                  {chatProvider !== 'custom' && isDirty ? (
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={chatBusy || !draftReady}
                        onClick={() => void onApplyChatSettings()}
                      >
                        {chatBusy ? (
                          <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                        ) : (
                          <Check className="icon-sm" aria-hidden />
                        )}
                        {chatBusy ? 'Applying…' : 'Use for chat'}
                      </button>
                      {!draftReady ? (
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          Add the provider key below first. Home keeps your current chat provider
                          until then.
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          Not applied yet — home still uses your current chat provider.
                        </p>
                      )}
                    </div>
                  ) : null}

                  {chatProvider === 'custom' ? (
                    <form className="mt-5 max-w-lg space-y-3" onSubmit={onSaveCustomSetup}>
                      <p className="text-sm text-[var(--color-ink-muted)]">
                        OpenAI-compatible endpoint. API key is optional (e.g. local Ollama).
                      </p>
                      <label className="block text-sm font-medium">
                        Base URL
                        <input
                          className="field mt-1.5"
                          value={customBaseUrl}
                          onChange={(e) => setCustomBaseUrl(e.target.value)}
                          placeholder="http://127.0.0.1:11434/v1"
                          spellCheck={false}
                          required
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        Model name
                        <input
                          className="field mt-1.5"
                          value={customModelInput}
                          onChange={(e) => setCustomModelInput(e.target.value)}
                          placeholder="llama3.2"
                          spellCheck={false}
                          required
                        />
                      </label>
                      <label className="block text-sm font-medium">
                        API key <span className="font-normal text-[var(--color-ink-muted)]">(optional)</span>
                        <input
                          type="password"
                          className="field mt-1.5"
                          value={providerKey}
                          onChange={(e) => setProviderKey(e.target.value)}
                          placeholder={
                            settings?.hasCustomKey
                              ? `Configured ·•••${settings.customKeyLast4} — paste to replace`
                              : 'Leave blank if not required'
                          }
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy || chatBusy} className="btn btn-primary">
                          {busy ? 'Saving…' : 'Use for chat'}
                        </button>
                        {settings?.customBaseUrl ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="btn btn-danger-soft"
                            onClick={() => {
                              setPendingProviderDelete('custom');
                              setConfirmKind('remove-provider-key');
                            }}
                          >
                            <Trash2 className="icon-sm" aria-hidden />
                            Remove custom
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}

                  {needsProviderKey ? (
                    <form
                      className="settings-provider-key mt-5 max-w-lg space-y-3"
                      onSubmit={onSaveProviderKey}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--color-ink)]">
                            {activeProvider?.label} API key
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">
                            Saving this key also applies {activeProvider?.label} for chat. Other
                            providers’ keys stay saved.
                          </p>
                        </div>
                        {providerHasKey(settings, chatProvider) ? (
                          <span className="settings-status settings-status-ok">
                            <Check className="size-3.5" strokeWidth={2.25} aria-hidden />
                            ·•••{providerLast4(settings, chatProvider)}
                          </span>
                        ) : (
                          <span className="settings-status settings-status-warn">Needed</span>
                        )}
                      </div>
                      <label className="block text-sm font-medium">
                        Secret key
                        <input
                          type="password"
                          className="field mt-1.5"
                          value={providerKey}
                          onChange={(e) => setProviderKey(e.target.value)}
                          placeholder="Paste API key"
                          autoComplete="off"
                          spellCheck={false}
                          required
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={busy} className="btn btn-primary">
                          {busy ? 'Saving…' : `Save ${activeProvider?.label} key`}
                        </button>
                        {providerHasKey(settings, chatProvider) ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="btn btn-danger-soft"
                            onClick={() => {
                              setPendingProviderDelete(chatProvider as ProviderKeyId);
                              setConfirmKind('remove-provider-key');
                            }}
                          >
                            <Trash2 className="icon-sm" aria-hidden />
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </form>
                  ) : null}
                </div>
              </section>
            )}

            {section === 'data' && (
              <section>
                <h2 className="settings-section-title">Data</h2>
                <p className="settings-section-desc">
                  Clear chats or remove uploaded files from your Knowra account.
                </p>

                <div className="mt-6">
                  <div className="settings-row !border-t-0 !pt-0">
                    <div className="settings-row-label">
                      <p>Clear chat history</p>
                      <p>Delete all conversations and messages. Uploaded files are kept.</p>
                    </div>
                    <div className="settings-row-action">
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-secondary"
                        onClick={() => setConfirmKind('clear-chats')}
                      >
                        <MessageSquareOff className="icon-sm" aria-hidden />
                        Clear chats
                      </button>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-label">
                      <p>Delete all files</p>
                      <p>
                        Remove every file, including files in nested folders, plus search data and
                        file-linked chats.
                      </p>
                    </div>
                    <div className="settings-row-action">
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-danger-soft"
                        onClick={() => {
                          setError('');
                          setMessage('');
                          setDeleteFilesOpen(true);
                        }}
                      >
                        <Trash2 className="icon-sm" aria-hidden />
                        Delete files
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === 'account' && (
              <section>
                <h2 className="settings-section-title">Account</h2>
                <p className="settings-section-desc">
                  Profile, session, and permanent account deletion.
                </p>

                <div className="mt-6">
                  <div className="settings-row !border-t-0 !pt-0">
                    <div className="settings-row-label">
                      <div className="flex items-center gap-3">
                        <UserAvatar user={user} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                            {displayName(user)}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--color-ink-muted)]">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="settings-row-action">
                      <Link to="/profile" className="btn btn-secondary">
                        <UserRound className="icon-sm" aria-hidden />
                        Edit profile
                      </Link>
                    </div>
                  </div>

                  <div className="settings-row">
                    <div className="settings-row-label">
                      <p>Sign out</p>
                      <p>End your session on this browser. You can sign back in anytime.</p>
                    </div>
                    <div className="settings-row-action">
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-secondary"
                        onClick={() => void onSignOut()}
                      >
                        <LogOut className="icon-sm" aria-hidden />
                        Sign out
                      </button>
                    </div>
                  </div>
                </div>

                <div className="settings-danger">
                  <div className="settings-row">
                    <div className="settings-row-label">
                      <p className="!text-[var(--color-danger)]">Delete account</p>
                      <p>
                        {user?.deletionScheduledFor
                          ? `Deletion scheduled for ${new Date(user.deletionScheduledFor).toLocaleString()}. Cancel below to keep your account.`
                          : 'Requires email OTP. After confirmation you have 7 days to cancel by signing in again.'}
                      </p>
                    </div>
                    <div className="settings-row-action">
                      {user?.deletionScheduledFor ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="btn btn-secondary"
                          onClick={() => void onCancelDeletion()}
                        >
                          Keep my account
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          className="btn btn-danger"
                          onClick={() => setDeleteAccountOpen(true)}
                        >
                          <UserX className="icon-sm" aria-hidden />
                          Delete account
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {confirmKind ? (
        <ConfirmDialog
          open
          title={confirmCopy[confirmKind].title}
          description={confirmCopy[confirmKind].description}
          confirmLabel={confirmCopy[confirmKind].confirmLabel}
          danger
          busy={busy}
          onCancel={() => {
            if (!busy) {
              setConfirmKind(null);
              setPendingProviderDelete(null);
            }
          }}
          onConfirm={() => {
            void runConfirmedAction();
          }}
        />
      ) : null}

      <DeleteAllFilesDialog
        open={deleteFilesOpen}
        email={user?.email ?? ''}
        busy={busy}
        onCancel={() => {
          if (!busy) setDeleteFilesOpen(false);
        }}
        onRequestCode={async () => {
          const result = await api.requestDeleteFilesOtp();
          return {
            expiresAt: result.expiresAt,
            resendAvailableAt: result.resendAvailableAt,
          };
        }}
        onConfirmDelete={async (code, deleteFolders) => {
          setBusy(true);
          setError('');
          try {
            const res = await api.deleteAllFiles(code, deleteFolders);
            setDeleteFilesOpen(false);
            setMessage(filesDeletedMessage(res.deletedDocuments, res.deletedFolders, deleteFolders));
          } finally {
            setBusy(false);
          }
        }}
      />

      <DeleteAccountDialog
        open={deleteAccountOpen}
        email={user?.email ?? ''}
        busy={busy}
        graceDays={7}
        onCancel={() => {
          if (!busy) setDeleteAccountOpen(false);
        }}
        onRequestCode={async () => {
          const result = await api.requestDeleteAccountOtp();
          return {
            expiresAt: result.expiresAt,
            resendAvailableAt: result.resendAvailableAt,
          };
        }}
        onConfirmDelete={async (code) => {
          setBusy(true);
          setError('');
          try {
            const res = await api.deleteAccount(code);
            setDeleteAccountOpen(false);
            await refreshUser();
            const when = new Date(res.deletionScheduledFor).toLocaleString();
            setMessage(
              res.alreadyScheduled
                ? `Deletion was already scheduled for ${when}. Sign in again before then to cancel.`
                : `Account deletion scheduled for ${when}. You have ${res.graceDays} days to sign in again and cancel.`,
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
