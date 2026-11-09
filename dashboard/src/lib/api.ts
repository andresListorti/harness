import type { z } from 'zod';
import {
  agentsSchema, apiErrorSchema, chatHistorySchema, chatResponseSchema, chatSuggestionsSchema,
  commitsSchema, galaxySchema, healthSchema, planBoardSchema, runLogSchema,
  settingsResponseSchema, voiceProvidersSchema, type Settings, type PlanSource,
} from '../../shared/api';

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number | null) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  async function request<T>(url: string, schema: z.ZodType<T>, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new ApiError('Unable to reach the API.', 'NETWORK_ERROR', null);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(
        response.ok ? 'Invalid API response.' : 'API request failed.',
        response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', response.status,
      );
    }

    if (!response.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new ApiError(
        error.success && (
          (response.status === 429 && error.data.error.code === 'CHAT_BUSY')
          || (response.status === 504 && error.data.error.code === 'TIMEOUT')
          || (response.status === 503 && error.data.error.code === 'CLI_NOT_FOUND')
        )
          ? error.data.error.message : 'API request failed.',
        error.success ? error.data.error.code : 'HTTP_ERROR', response.status,
      );
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('Invalid API response.', 'INVALID_RESPONSE', response.status);
    }
    return parsed.data;
  }

  const get = <T>(url: string, schema: z.ZodType<T>) =>
    request(url, schema, { method: 'GET', headers: { Accept: 'application/json' } });

  return {
    getSettings: () => get('/api/settings', settingsResponseSchema),
    saveSettings: (settings: Settings) => request('/api/settings', settingsResponseSchema, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
    getVoiceProviders: () => get('/api/voice/providers', voiceProvidersSchema),
    getHealth: () => get('/api/health', healthSchema),
    getPlan: (source: PlanSource = 'dashboard') =>
      get(`/api/plan?source=${encodeURIComponent(source)}`, planBoardSchema),
    getRunLog: (source: PlanSource = 'dashboard') =>
      get(`/api/runlog?source=${encodeURIComponent(source)}`, runLogSchema),
    getCommits: (limit?: number) => get(
      `/api/commits${Number.isInteger(limit) && Number.isFinite(limit) ? `?limit=${limit}` : ''}`,
      commitsSchema,
    ),
    getGalaxy: () => get('/api/galaxy', galaxySchema),
    getAgents: () => get('/api/agents', agentsSchema),
    getChatSuggestions: () => get('/api/chat/suggestions', chatSuggestionsSchema),
    getChatHistory: () => get('/api/chat/history', chatHistorySchema),
    clearChatHistory: () => request('/api/chat/history', chatHistorySchema, {
      method: 'DELETE', headers: { Accept: 'application/json' },
    }),
    sendChat: (message: string) => request('/api/chat', chatResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }),
  };
}

export const api = createApiClient();
