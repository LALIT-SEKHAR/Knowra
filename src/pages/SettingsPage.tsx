import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Files,
  ImageUp,
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
import { AvatarCropDialog } from '../components/AvatarCropDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MemberPicker } from '../components/MemberPicker';
import { DeleteAccountDialog } from '../components/DeleteAccountDialog';
import { DeleteAllFilesDialog } from '../components/DeleteAllFilesDialog';
import type { AiSettings, ChatProviderId, ChatProviderOption } from '../types';
import clsx from 'clsx';

type ConfirmKind = 'remove-key' | 'clear-chats' | 'remove-provider-key' | null;
type SettingsSection = 'preferences' | 'organization' | 'api-key' | 'data' | 'account';
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
  { id: 'organization', label: 'Organization', icon: Building2 },
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

function OrganizationSettings({
  activeOrg,
  onChanged,
  onError,
}: {
  activeOrg: {
    id: string;
    name: string;
    slug: string;
    role: 'admin' | 'member';
    imageUrl?: string | null;
    joinsEnabled?: boolean;
  } | null;
  onChanged: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [members, setMembers] = useState<
    {
      id: string;
      name: string | null;
      email: string;
      avatarUrl: string | null;
      role: 'admin' | 'member';
      blocked: boolean;
    }[]
  >([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberPage, setMemberPage] = useState(1);
  const [leaving, setLeaving] = useState<{ id: string; name: string } | null>(null);
  const [leaveNeedsSuccessor, setLeaveNeedsSuccessor] = useState(false);
  const [leaveCandidates, setLeaveCandidates] = useState<
    { id: string; name: string | null; email: string; avatarUrl: string | null }[]
  >([]);
  const [successorId, setSuccessorId] = useState('');
  const [leavePreviewLoading, setLeavePreviewLoading] = useState(false);
  const { user } = useAuth();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const link = activeOrg ? `${window.location.origin}/join/${activeOrg.slug}` : '';
  const isAdmin = activeOrg?.role === 'admin';
  const memberPageCount = Math.max(1, Math.ceil(members.length / 10));

  useEffect(() => {
    if (memberPage > memberPageCount) setMemberPage(memberPageCount);
  }, [memberPage, memberPageCount]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setMembersLoading(true);
      void api
        .listOrgMembers(memberQuery.trim())
        .then((result) => {
          if (!cancelled) setMembers(result.members);
        })
        .catch((err) => {
          if (!cancelled) onError(err instanceof ApiError ? err.message : 'Could not load members');
        })
        .finally(() => {
          if (!cancelled) setMembersLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [isAdmin, memberQuery]);

  async function updateMember(userId: string, action: 'admin' | 'member' | 'block' | 'unblock') {
    setBusy(true);
    try {
      if (action === 'admin') await api.makeOrgAdmin(userId);
      else if (action === 'member') await api.removeOrgAdmin(userId);
      else if (action === 'block') await api.blockOrgMember(userId);
      else await api.unblockOrgMember(userId);
      const result = await api.listOrgMembers(memberQuery.trim());
      setMembers(result.members);
      await onChanged(
        action === 'admin'
          ? 'They are now an admin.'
          : action === 'member'
            ? 'They are a member again.'
            : action === 'block'
              ? 'They are blocked from this organization.'
              : 'They can access this organization again.',
      );
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not update that person');
    } finally {
      setBusy(false);
    }
  }

  async function openLeave(org: { id: string; name: string }) {
    setLeaving(org);
    setSuccessorId('');
    setLeaveNeedsSuccessor(false);
    setLeaveCandidates([]);
    setLeavePreviewLoading(true);
    try {
      const preview = await api.leavePreview(org.id);
      setLeaveNeedsSuccessor(preview.needsSuccessor);
      setLeaveCandidates(preview.members);
    } catch (err) {
      setLeaving(null);
      onError(err instanceof ApiError ? err.message : 'Could not prepare leaving');
    } finally {
      setLeavePreviewLoading(false);
    }
  }

  async function onLeave() {
    if (!leaving) return;
    const { id, name } = leaving;
    setBusy(true);
    try {
      const result = await api.leaveOrg(id, successorId || undefined);
      setLeaving(null);
      await onChanged(`You left ${name}.`);
      if (result.leftActive) window.location.assign('/');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not leave that organization');
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    const slug = invite.trim().split('/').filter(Boolean).pop() ?? '';
    if (!slug) {
      onError('Paste an organization invite link');
      return;
    }
    setBusy(true);
    try {
      await api.joinOrg(slug);
      await onChanged('You joined the organization.');
      window.location.assign('/');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not join that organization');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="settings-section-title">Organization</h2>
      <p className="settings-section-desc">
        {activeOrg?.role === 'admin'
          ? 'Share this link so people join as members. They can ask questions, and only admins manage files and AI.'
          : 'Join an organization with an invite link. You can switch workspaces from the sidebar.'}
      </p>

      {activeOrg?.role === 'admin' && (
        <div className="mt-6">
          <p className="text-sm font-medium">{activeOrg.name}</p>
          <div className="mt-3 flex items-center gap-3">
            {activeOrg.imageUrl ? (
              <img
                src={activeOrg.imageUrl}
                alt=""
                className="size-12 rounded-md object-cover ring-1 ring-[var(--color-line)]"
              />
            ) : (
              <span className="flex size-12 items-center justify-center rounded-md bg-white/[0.06] text-sm font-semibold ring-1 ring-[var(--color-line)]">
                {activeOrg.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  if (!file.type.startsWith('image/')) {
                    onError('Please choose an image file.');
                    return;
                  }
                  if (cropSrc) URL.revokeObjectURL(cropSrc);
                  setCropSrc(URL.createObjectURL(file));
                }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => logoInputRef.current?.click()}>
                <ImageUp className="icon-sm" aria-hidden />
                {activeOrg.imageUrl ? 'Replace logo' : 'Upload logo'}
              </button>
              {activeOrg.imageUrl ? (
                <button
                  type="button"
                  className="btn btn-ghost ml-2"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void api
                      .deleteOrgLogo()
                      .then(() => onChanged('Organization logo removed.'))
                      .catch((err) => onError(err instanceof ApiError ? err.message : 'Could not remove the logo'))
                      .finally(() => setBusy(false));
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              {activeOrg.joinsEnabled === false
                ? 'New people cannot join with this link.'
                : 'Anyone with this link can join as a member.'}
            </p>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              disabled={busy}
              onClick={() => {
                const enabled = activeOrg.joinsEnabled === false;
                setBusy(true);
                void api
                  .setOrgJoins(enabled)
                  .then(() =>
                    onChanged(enabled ? 'People can join with the link again.' : 'New joins are blocked.'),
                  )
                  .catch((err) => onError(err instanceof ApiError ? err.message : 'Could not update joining'))
                  .finally(() => setBusy(false));
              }}
            >
              {activeOrg.joinsEnabled === false ? 'Allow joining' : 'Block joining'}
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={link} className="field" aria-label="Organization invite link" />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              {copied ? <Check className="icon" aria-hidden /> : null}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-medium">Your organizations</h3>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          You can leave any organization. If you are the only admin and other people are still in it, choose the next admin in the confirmation. If another admin is already there, you can leave right away.
        </p>
        {(user?.memberships ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-ink-muted)]">You are not in an organization yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
            {(user?.memberships ?? []).map((org) => (
              <li key={org.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                {org.imageUrl ? (
                  <img
                    src={org.imageUrl}
                    alt=""
                    className="size-8 rounded-md object-cover ring-1 ring-[var(--color-line)]"
                  />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-md bg-white/[0.06] text-xs font-semibold ring-1 ring-[var(--color-line)]">
                    {org.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{org.name}</p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {org.role === 'admin' ? 'Admin' : 'Member'}
                    {activeOrg?.id === org.id ? ' · Current' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  disabled={busy}
                  onClick={() => void openLeave(org)}
                >
                  Leave
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="mt-6 space-y-3" onSubmit={onJoin}>
        <label className="block text-sm font-medium">
          Join with an invite
          <input
            required
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            className="field mt-1.5"
            placeholder="Paste the organization link"
          />
        </label>
        <button type="submit" disabled={busy} className="btn btn-secondary">
          Join organization
        </button>
      </form>

      {isAdmin && (
        <div className="mt-8">
          <h3 className="text-sm font-medium">People</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Search by name or email. Admins can manage files and AI keys. Blocked people lose access and cannot rejoin.
          </p>
          <input
            value={memberQuery}
            onChange={(e) => {
              setMemberQuery(e.target.value);
              setMemberPage(1);
            }}
            className="field mt-3"
            placeholder="Search by name or email"
            aria-label="Search members"
          />
          {membersLoading && members.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-muted)]">Loading people…</p>
          ) : members.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
              {memberQuery.trim() ? 'No one matches that search.' : 'No one is in this organization yet.'}
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)]">
                {members.slice((memberPage - 1) * 10, memberPage * 10).map((person) => {
                const isSelf = person.id === user?.id;
                return (
                  <li key={person.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <UserAvatar user={person} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {person.name || person.email}
                        {isSelf ? <span className="font-normal text-[var(--color-ink-muted)]"> · You</span> : null}
                      </p>
                      {person.name ? (
                        <p className="truncate text-xs text-[var(--color-ink-muted)]">{person.email}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                      {person.blocked ? 'Blocked' : person.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                    {!isSelf && !person.blocked && person.role === 'admin' ? (
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0"
                        disabled={busy}
                        onClick={() => void updateMember(person.id, 'member')}
                      >
                        Remove admin
                      </button>
                    ) : null}
                    {!isSelf && !person.blocked && person.role !== 'admin' ? (
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0"
                        disabled={busy}
                        onClick={() => void updateMember(person.id, 'admin')}
                      >
                        Make admin
                      </button>
                    ) : null}
                    {!isSelf ? (
                      <button
                        type="button"
                        className="btn btn-ghost shrink-0"
                        disabled={busy}
                        onClick={() => void updateMember(person.id, person.blocked ? 'unblock' : 'block')}
                      >
                        {person.blocked ? 'Unblock' : 'Block'}
                      </button>
                    ) : null}
                  </li>
                );
              })}
              </ul>
              {members.length > 10 ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {(memberPage - 1) * 10 + 1}–{Math.min(memberPage * 10, members.length)} of {members.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={memberPage <= 1}
                      onClick={() => setMemberPage((page) => page - 1)}
                    >
                      <ChevronLeft className="icon-sm" aria-hidden />
                      Previous
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={memberPage * 10 >= members.length}
                      onClick={() => setMemberPage((page) => page + 1)}
                    >
                      Next
                      <ChevronRight className="icon-sm" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(leaving)}
        title={leaving ? `Leave ${leaving.name}?` : 'Leave organization?'}
        description={
          leaveNeedsSuccessor
            ? 'You are the only admin. Choose who becomes admin, then you can leave. They will get an email.'
            : 'You will lose access to its files and chats. The organization keeps its files for everyone else.'
        }
        confirmLabel="Leave"
        danger
        busy={busy || leavePreviewLoading}
        confirmDisabled={leaveNeedsSuccessor && !successorId}
        onCancel={() => {
          if (!busy) setLeaving(null);
        }}
        onConfirm={() => void onLeave()}
      >
        {leaveNeedsSuccessor ? (
          <label className="mt-4 block text-sm font-medium">
            Next admin
            <MemberPicker
              people={leaveCandidates}
              value={successorId}
              disabled={busy}
              onChange={setSuccessorId}
            />
          </label>
        ) : null}
      </ConfirmDialog>
      <AvatarCropDialog
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        busy={busy}
        onCancel={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
        }}
        onApply={(file) => {
          if (cropSrc) URL.revokeObjectURL(cropSrc);
          setCropSrc(null);
          setBusy(true);
          void api
            .uploadOrgLogo(file)
            .then(() => onChanged('Organization logo updated.'))
            .catch((err) => onError(err instanceof ApiError ? err.message : 'Could not upload the logo'))
            .finally(() => setBusy(false));
        }}
      />
    </section>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const canManage = user?.canManage !== false;
  const showAiSettings = canManage;
  const sections = SECTIONS.filter((item) => {
    if (item.id === 'api-key' && !showAiSettings) return false;
    return true;
  });
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
    if (section === 'api-key' && !showAiSettings) {
      setSection('preferences');
      window.history.replaceState(null, '', '#preferences');
    }
  }, [section, showAiSettings]);

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
            {sections.map(({ id, label, icon: Icon }) => (
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
                  {canManage
                    ? 'Clear chats or remove uploaded files from your Knowra account.'
                    : 'Clear your chat history. Files stay with the organization admin.'}
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

                  {canManage ? (
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
                  ) : null}
                </div>
              </section>
            )}

            {section === 'organization' && (
              <OrganizationSettings
                activeOrg={user?.activeOrg ?? null}
                onChanged={async (text) => {
                  await refreshUser();
                  setMessage(text);
                  setError('');
                }}
                onError={(text) => {
                  setError(text);
                  setMessage('');
                }}
              />
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
                          : 'Requires email OTP. If you are the only admin of an organization that still has other people, make someone else an admin first. After confirmation you have 7 days to cancel by signing in again.'}
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
