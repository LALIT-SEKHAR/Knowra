export type User = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  hasOpenAIKey: boolean;
  openaiKeyLast4?: string | null;
};

export type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed';

export type KnowraDocument = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  cloudinaryUrl: string;
  status: DocumentStatus;
  errorMessage?: string | null;
  pageCount?: number | null;
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
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SourceRef[];
  createdAt: string;
};
