import { mimeFromFile } from '../utils/fileTypes';
import {
  humanizeStorageError,
  MAX_UPLOAD_BYTES,
  pdfPartRanges,
  uploadTooLargeMessage,
} from '../utils/uploadLimit';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'knowra_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  }).catch(() => {
    throw new ApiError('Could not reach the API. Check your connection and try again.', 0);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; [key: string]: unknown };
    const { error, ...details } = payload;
    throw new ApiError(error || 'Request failed', res.status, details);
  }
  return data as T;
}

function uploadWithProgress<T>(
  url: string,
  body: FormData,
  onProgress?: (loaded: number, total: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      let data: T & { error?: { message?: string } };
      try {
        data = JSON.parse(xhr.responseText || '{}') as T & { error?: { message?: string } };
      } catch {
        data = {} as T & { error?: { message?: string } };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }

      reject(
        new ApiError(
          humanizeStorageError(data.error?.message || 'Cloud storage upload failed'),
          xhr.status || 502,
        ),
      );
    };

    xhr.onerror = () => {
      reject(
        new ApiError('Could not upload to storage. Check your connection and try again.', 0),
      );
    };

    xhr.send(body);
  });
}

export const api = {
  requestOtp: (email: string) =>
    request<{ ok: boolean; expiresAt: string; resendAvailableAt: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyOtp: (email: string, code: string) =>
    request<{
      token: string;
      deletionCancelled?: boolean;
      user: { id: string; email: string; name?: string; deletionScheduledFor?: string | null };
    }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),

  me: () => request<import('../types').User>('/auth/me'),

  updateProfile: (data: { name: string }) =>
    request<import('../types').User>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return request<import('../types').User>('/auth/me/avatar', {
      method: 'POST',
      body: form,
    });
  },

  deleteAvatar: () =>
    request<import('../types').User>('/auth/me/avatar', { method: 'DELETE' }),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  getSettings: () => request<import('../types').AiSettings>('/settings'),

  putOpenAIKey: (apiKey: string) =>
    request<import('../types').AiSettings>('/settings/openai-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),

  deleteOpenAIKey: () =>
    request<import('../types').AiSettings>('/settings/openai-key', {
      method: 'DELETE',
    }),

  putChatPrefs: (prefs: {
    chatProvider: string;
    chatModel: string;
    customBaseUrl?: string;
  }) =>
    request<import('../types').AiSettings>('/settings/chat-prefs', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),

  putProviderKey: (params: {
    provider: string;
    apiKey?: string;
    baseUrl?: string;
    activate?: boolean;
    chatModel?: string;
  }) =>
    request<import('../types').AiSettings>('/settings/provider-key', {
      method: 'PUT',
      body: JSON.stringify(params),
    }),

  deleteProviderKey: (provider: string) =>
    request<import('../types').AiSettings>(`/settings/provider-key/${provider}`, {
      method: 'DELETE',
    }),

  clearChatHistory: () =>
    request<{ ok: boolean; deletedConversations: number }>('/settings/chats', {
      method: 'DELETE',
    }),

  requestDeleteFilesOtp: () =>
    request<{
      ok: boolean;
      message: string;
      email: string;
      expiresAt: string;
      resendAvailableAt: string;
    }>('/settings/files/request-otp', { method: 'POST' }),

  deleteAllFiles: (code: string, deleteFolders = false) =>
    request<{ ok: boolean; deletedDocuments: number; deletedFolders: number }>('/settings/files', {
      method: 'DELETE',
      body: JSON.stringify({ code, deleteFolders }),
    }),

  requestDeleteAccountOtp: () =>
    request<{
      ok: boolean;
      message: string;
      email: string;
      graceDays: number;
      expiresAt: string;
      resendAvailableAt: string;
    }>('/settings/account/request-otp', { method: 'POST' }),

  deleteAccount: (code: string) =>
    request<{
      ok: boolean;
      graceDays: number;
      deletionScheduledFor: string;
      alreadyScheduled: boolean;
      user: import('../types').User;
    }>('/settings/account', {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    }),

  cancelAccountDeletion: () =>
    request<{ ok: boolean; cancelled: boolean; user: import('../types').User }>(
      '/settings/account/cancel',
      { method: 'POST' },
    ),

  listDocuments: (q?: string, folder?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (folder) params.set('folder', folder);
    const qs = params.toString();
    return request<{
      documents: import('../types').KnowraDocument[];
      folders?: import('../types').KnowraFolder[];
      breadcrumb?: import('../types').FolderPathSegment[];
    }>(`/documents${qs ? `?${qs}` : ''}`);
  },

  listFolders: () =>
    request<{ folders: import('../types').KnowraFolder[] }>('/documents/folders'),

  createFolder: (name: string, parentId?: string | null) =>
    request<{ folder: import('../types').KnowraFolder }>('/documents/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId: parentId ?? null }),
    }),

  ensureFolderPath: (segments: string[], parentId?: string | null) =>
    request<{ folder: import('../types').KnowraFolder }>('/documents/folders/ensure', {
      method: 'POST',
      body: JSON.stringify({ segments, parentId: parentId ?? null }),
    }),

  updateFolder: (id: string, body: { name?: string; parentId?: string | null }) =>
    request<{ folder: import('../types').KnowraFolder }>(`/documents/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteFolder: (id: string) =>
    request<{ ok: boolean; deletedFolders: number; deletedDocuments: number }>(
      `/documents/folders/${id}`,
      { method: 'DELETE' },
    ),

  getDocument: (id: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}`),

  uploadDocument: async (
    file: File,
    options?: { onProgress?: (percent: number) => void; folderId?: string | null },
  ) => {
    const mimeType = mimeFromFile(file);
    if (!mimeType) {
      throw new ApiError('Only PDF, Word, Excel, and image files are supported', 400);
    }
    if (file.size <= 0) {
      throw new ApiError('This file is empty.', 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiError(uploadTooLargeMessage(file.size), 400);
    }

    const onProgress = options?.onProgress;
    onProgress?.(0);

    const ranges = pdfPartRanges(file.size);
    const uploaded: Array<{ publicId: string; url: string; bytes: number }> = [];

    try {
      for (let part = 0; part < ranges.length; part += 1) {
        const range = ranges[part]!;
        const { upload } = await request<{
          upload: {
            cloudName: string;
            apiKey: string;
            timestamp: number;
            folder: string;
            publicId: string;
            signature: string;
            resourceType: 'raw';
          };
        }>(
          `/documents/upload-signature?filename=${encodeURIComponent(file.name)}&part=${part}`,
        );

        const form = new FormData();
        form.append('file', file.slice(range.start, range.end), file.name);
        form.append('api_key', upload.apiKey);
        form.append('timestamp', String(upload.timestamp));
        form.append('signature', upload.signature);
        form.append('folder', upload.folder);
        form.append('public_id', upload.publicId);

        const cloudData = await uploadWithProgress<{
          error?: { message?: string };
          public_id?: string;
          secure_url?: string;
          bytes?: number;
        }>(
          `https://api.cloudinary.com/v1_1/${upload.cloudName}/${upload.resourceType}/upload`,
          form,
          (loaded) => {
            const sent = Math.min(file.size, range.start + loaded);
            onProgress?.(Math.round((sent / file.size) * 95));
          },
        );

        if (!cloudData.public_id || !cloudData.secure_url) {
          throw new ApiError(
            humanizeStorageError(cloudData.error?.message || 'Cloud storage upload failed'),
            502,
          );
        }

        uploaded.push({
          publicId: cloudData.public_id,
          url: cloudData.secure_url,
          bytes: range.end - range.start,
        });
      }

      onProgress?.(97);

      const result = await request<{ document: import('../types').KnowraDocument }>('/documents', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          mimeType,
          ...(options?.folderId ? { folderId: options.folderId } : {}),
          parts: uploaded.map((part) => ({
            cloudinaryPublicId: part.publicId,
            cloudinaryUrl: part.url,
            bytes: part.bytes,
          })),
        }),
      });

      onProgress?.(100);
      return result;
    } catch (error) {
      if (uploaded.length > 0) {
        await request('/documents/upload-abort', {
          method: 'POST',
          body: JSON.stringify({ publicIds: uploaded.map((part) => part.publicId) }),
        }).catch(() => undefined);
      }
      throw error;
    }
  },

  fetchDocumentFile: async (id: string) => {
    const headers = new Headers();
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_URL}/documents/${id}/file`, { headers }).catch(() => {
      throw new ApiError('Could not download this file. Check your connection and try again.', 0);
    });
    if (!res.ok) throw new ApiError('Could not download this file', res.status);
    return res.blob();
  },

  /** Upload multiple PDFs, Word, Excel, or image files sequentially with per-file progress. */
  uploadDocuments: async (
    files: File[],
    options?: {
      folderId?: string | null;
      /** Per-file destination. Falls back to folderId when an entry is missing. */
      folderIds?: Array<string | null | undefined>;
      onFileStart?: (file: File, index: number) => void;
      onFileProgress?: (file: File, index: number, percent: number) => void;
      onFileComplete?: (
        file: File,
        index: number,
        result: { document: import('../types').KnowraDocument },
      ) => void;
      onFileError?: (file: File, index: number, error: unknown) => void;
    },
  ) => {
    const results: Array<{
      file: File;
      document?: import('../types').KnowraDocument;
      error?: unknown;
    }> = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]!;
      options?.onFileStart?.(file, i);
      try {
        const res = await api.uploadDocument(file, {
          folderId: options?.folderIds?.[i] ?? options?.folderId,
          onProgress: (percent) => options?.onFileProgress?.(file, i, percent),
        });
        options?.onFileComplete?.(file, i, res);
        results.push({ file, document: res.document });
      } catch (error) {
        options?.onFileError?.(file, i, error);
        results.push({ file, error });
      }
    }

    return results;
  },

  renameDocument: (id: string, name: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  moveDocument: (id: string, folderId: string | null) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
    }),

  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),

  retryDocument: (id: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}/retry`, {
      method: 'POST',
    }),

  chat: (question: string, conversationId?: string, documentId?: string) =>
    request<{
      answer: string;
      sources: import('../types').SourceRef[];
      conversationId: string;
    }>('/conversations/chat', {
      method: 'POST',
      body: JSON.stringify({ question, conversationId, documentId }),
    }),

  /** @deprecated Prefer api.chat() for library-wide or optional scoped chat */
  chatDocument: (documentId: string, question: string, conversationId?: string) =>
    request<{
      answer: string;
      sources: import('../types').SourceRef[];
      conversationId: string;
    }>(`/documents/${documentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ question, conversationId }),
    }),

  listConversations: (q?: string) => {
    const query = q?.trim();
    const path = query ? `/conversations?q=${encodeURIComponent(query)}` : '/conversations';
    return request<{ conversations: import('../types').Conversation[] }>(path);
  },

  getConversation: (id: string) =>
    request<{
      conversation: import('../types').Conversation;
      messages: import('../types').ChatMessage[];
    }>(`/conversations/${id}`),

  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  getUsage: () => request<import('../types').UsageSummary>('/usage'),
};
