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

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as { error?: string }).error || 'Request failed',
      res.status,
    );
  }
  return data as T;
}

export const api = {
  requestOtp: (email: string) =>
    request<{ ok: boolean }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyOtp: (email: string, code: string) =>
    request<{ token: string; user: { id: string; email: string; name?: string } }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      },
    ),

  me: () => request<import('../types').User>('/auth/me'),

  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),

  getSettings: () =>
    request<{ hasOpenAIKey: boolean; openaiKeyLast4: string | null }>('/settings'),

  putOpenAIKey: (apiKey: string) =>
    request<{ hasOpenAIKey: boolean; openaiKeyLast4: string | null }>('/settings/openai-key', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),

  deleteOpenAIKey: () =>
    request<{ hasOpenAIKey: boolean; openaiKeyLast4: null }>('/settings/openai-key', {
      method: 'DELETE',
    }),

  listDocuments: (q?: string) =>
    request<{ documents: import('../types').KnowraDocument[] }>(
      `/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    ),

  getDocument: (id: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}`),

  uploadDocument: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ document: import('../types').KnowraDocument }>('/documents', {
      method: 'POST',
      body: form,
    });
  },

  renameDocument: (id: string, name: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteDocument: (id: string) =>
    request<{ ok: boolean }>(`/documents/${id}`, { method: 'DELETE' }),

  retryDocument: (id: string) =>
    request<{ document: import('../types').KnowraDocument }>(`/documents/${id}/retry`, {
      method: 'POST',
    }),

  chat: (documentId: string, question: string, conversationId?: string) =>
    request<{
      answer: string;
      sources: import('../types').SourceRef[];
      conversationId: string;
    }>(`/documents/${documentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ question, conversationId }),
    }),

  listConversations: () =>
    request<{ conversations: import('../types').Conversation[] }>('/conversations'),

  getConversation: (id: string) =>
    request<{
      conversation: import('../types').Conversation;
      messages: import('../types').ChatMessage[];
    }>(`/conversations/${id}`),

  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
};
