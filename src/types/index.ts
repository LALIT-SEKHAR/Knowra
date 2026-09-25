export type ChatModelOption = {
  id: string;
  label: string;
  description: string;
};

export type ChatProviderOption = {
  id: string;
  label: string;
  description: string;
  needsSeparateKey: boolean;
  models: ChatModelOption[];
};

export type ChatProviderId = 'openai' | 'anthropic' | 'google' | 'xai' | 'custom';

export type User = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  hasOpenAIKey: boolean;
  openaiKeyLast4?: string | null;
  chatProvider?: ChatProviderId | string;
  chatModel?: string;
  hasAnthropicKey?: boolean;
  hasGoogleKey?: boolean;
  hasXaiKey?: boolean;
  hasCustomKey?: boolean;
  customBaseUrl?: string | null;
  /** OpenAI key present and selected chat provider is configured */
  canChat?: boolean;
  /** ISO date when account purge is scheduled; null if not pending */
  deletionScheduledFor?: string | null;
  canManage?: boolean;
  /** Ready documents in the active workspace, including ones a member cannot open. */
  readyDocumentCount?: number;
  activeOrg?: {
    id: string;
    name: string;
    slug: string;
    imageUrl?: string | null;
    role: 'admin' | 'member';
    joinsEnabled?: boolean;
  } | null;
  memberships?: {
    id: string;
    name: string;
    slug: string;
    imageUrl?: string | null;
    role: 'admin' | 'member';
  }[];
};

export type AiSettings = {
  hasOpenAIKey: boolean;
  openaiKeyLast4: string | null;
  chatProvider: ChatProviderId | string;
  chatModel: string;
  chatProviders: ChatProviderOption[];
  hasAnthropicKey: boolean;
  anthropicKeyLast4: string | null;
  hasGoogleKey: boolean;
  googleKeyLast4: string | null;
  hasXaiKey: boolean;
  xaiKeyLast4: string | null;
  hasCustomKey: boolean;
  customKeyLast4: string | null;
  customBaseUrl: string | null;
  canChat: boolean;
  deletionScheduledFor?: string | null;
};

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type DocumentStage =
  | 'queued'
  | 'downloading'
  | 'reading'
  | 'extracting'
  | 'indexing'
  | 'finishing';

export type FolderPathSegment = {
  id: string;
  name: string;
};

export type KnowraFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ancestor folders, set on search results. */
  path?: FolderPathSegment[];
};

export type KnowraDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  cloudinaryUrl: string;
  folderId?: string | null;
  /** Folder that contains this file, set on search results. */
  path?: FolderPathSegment[];
  status: DocumentStatus;
  errorMessage?: string | null;
  pageCount?: number | null;
  /** 0–100 while processing */
  progress?: number | null;
  stage?: DocumentStage | null;
  processingStartedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SourceRef = {
  documentId: string;
  documentName?: string;
  chunkId: string;
  pageNumber?: number;
};

export type Conversation = {
  id: string;
  documentId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Excerpt from a matching message, set on search results. */
  snippet?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SourceRef[];
  createdAt: string;
};

export type UsageTotals = {
  uploads: number;
  ocrPages: number;
  ocrTokens: number;
  embeddings: number;
  embeddingTokens: number;
  chunks: number;
  chats: number;
  chatTokens: number;
  aiCalls: number;
};

export type UsageDay = UsageTotals & {
  date: string;
  level: 0 | 1 | 2 | 3 | 4;
  score: number;
};

export type StorageUsage = {
  files: number;
  fileBytes: number;
  chunks: number;
  chunkBytes: number;
  totalBytes: number;
};

export type UsageSummary = {
  storage: StorageUsage;
  totals: UsageTotals;
  periods: {
    day: UsageTotals;
    week: UsageTotals;
    month: UsageTotals;
    year: UsageTotals;
  };
  daily: UsageDay[];
  range: { start: string; end: string };
};
