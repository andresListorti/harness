import { vi } from 'vitest';
import { api, ApiError, createApiClient } from '../../src/lib/api';
import type { PlanSource } from '../../shared/api';

const health = { status: 'ok' };
const plan = { source: 'dashboard', tasks: [{
  id: 'client', title: 'API client', group: null, goal: 'Validate responses',
  files: '', definitionOfDone: '', result: null, column: 'pending',
}] };
const runLog = { source: 'dashboard', entries: [{
  model: null, durationSeconds: null,
  id: 'D1', title: 'Client', branch: null, attempts: 1, result: null, notes: ['Done'],
}] };
const commits = { commits: [{ hash: 'abcdef0', subject: 'Add client', date: '2026-01-01T00:00:00Z' }] };
const galaxy = { nodes: [{ id: 'core', label: 'Harness', kind: 'core', role: null, count: null, details: [] }] };
const agents = { agents: [{ id: 'client', task: 'Client', agent: 'codex', model: null, status: 'done', elapsedSeconds: null, output: [] }] };
const suggestions = { suggestions: ['What is pending?'] };
const chat = { reply: 'API client', source: 'local' };

function setup(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body, { status }));
  return { fetchMock, client: createApiClient(fetchMock) };
}

test.each([
  ['getHealth', '/api/health', health],
  ['getPlan', '/api/plan?source=dashboard', plan],
  ['getRunLog', '/api/runlog?source=dashboard', runLog],
  ['getCommits', '/api/commits', commits],
  ['getGalaxy', '/api/galaxy', galaxy],
  ['getAgents', '/api/agents', agents],
  ['getChatSuggestions', '/api/chat/suggestions', suggestions],
] as const)('%s requests and validates its response', async (method, url, body) => {
  const { fetchMock, client } = setup(body);
  expect(await client[method]()).toEqual(body);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url, {
    method: 'GET', headers: { Accept: 'application/json' },
  });
});

test('sendChat posts the exact message as JSON and validates the reply', async () => {
  const { fetchMock, client } = setup(chat);
  const message = 'What is "pending"?\nNext';
  expect(await client.sendChat(message)).toEqual(chat);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
});

test.each(['getPlan', 'getRunLog'] as const)('%s encodes the selected source', async method => {
  const { fetchMock, client } = setup(method === 'getPlan' ? plan : runLog);
  const route = method === 'getPlan' ? 'plan' : 'runlog';
  await client[method]('example-app');
  expect(fetchMock.mock.calls[0][0]).toBe(`/api/${route}?source=example-app`);
  const source = 'a &/?#=+' as PlanSource;
  await client[method](source);
  expect(fetchMock.mock.calls[1][0]).toBe(`/api/${route}?source=a%20%26%2F%3F%23%3D%2B`);
});

test.each([5, 0, -1, undefined, NaN, Infinity, -Infinity, 1.5])('handles commit limit %s', async limit => {
  const { fetchMock, client } = setup(commits);
  await client.getCommits(limit);
  const suffix = Number.isInteger(limit) && Number.isFinite(limit) ? `?limit=${limit}` : '';
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/commits${suffix}`, {
    method: 'GET', headers: { Accept: 'application/json' },
  });
});

test.each([
  [{ error: { code: 'INVALID_SOURCE', message: 'private raw body text' } }, 400, 'INVALID_SOURCE'],
  [{ error: 'private raw body text' }, 500, 'HTTP_ERROR'],
  [{ error: { code: 'BAD', message: 'private raw body text', extra: true } }, 403, 'HTTP_ERROR'],
  [{}, 200, 'INVALID_RESPONSE'],
  [{ status: 'ok', extra: 'private raw body text' }, 200, 'INVALID_RESPONSE'],
  [{ status: 'unknown' }, 200, 'INVALID_RESPONSE'],
] as const)('classifies invalid responses %#', async (body, status, code) => {
  const { client } = setup(body, status);
  const error = await client.getHealth().catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ name: 'ApiError', code, status });
  expect((error as Error).message).not.toContain('private raw body text');
  expect((error as Error).message).not.toContain(JSON.stringify(body));
});

test.each([200, 502])('classifies non-JSON responses with status %s', async status => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('private raw body text', { status }));
  const error = await createApiClient(fetchMock).getHealth().catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ code: status === 200 ? 'INVALID_RESPONSE' : 'HTTP_ERROR', status });
  expect((error as Error).message).not.toContain('private raw body text');
});

test('fetch rejection becomes a network error without leaking its message', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error('private raw body text'));
  await expect(createApiClient(fetchMock).getHealth()).rejects.toMatchObject({
    name: 'ApiError', code: 'NETWORK_ERROR', status: null, message: 'Unable to reach the API.',
  });
});

test('the default client resolves global fetch when called', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(health));
  vi.stubGlobal('fetch', fetchMock);
  try {
    expect(await api.getHealth()).toEqual(health);
    expect(fetchMock).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});
