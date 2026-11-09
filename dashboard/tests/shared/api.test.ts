// @vitest-environment node
import request from 'supertest';
import { expect, test } from 'vitest';
import { z } from 'zod';
import * as api from '../../shared/api';
import { useTestApp } from '../test-app';

const createApp = useTestApp();

const task = {
  id: 'api-contract', title: 'Define API', group: 'Milestone 1', goal: '',
  files: 'shared/api.ts', definitionOfDone: 'Tests pass', result: null, column: 'pending',
};
const entry = {
  id: 'D1', title: 'Define API', branch: 'task/api-contract', attempts: 0,
  model: null, durationSeconds: null, result: null, notes: ['Tests pass'],
};
const commit = { hash: 'abcdef1', subject: 'Define API', date: '2026-11-08T12:00:00-03:00' };
const node = {
  id: 'codex', label: 'Codex', kind: 'agent', role: 'worker', count: 0, details: [],
};
const card = {
  id: 'D1', task: 'Define API', agent: 'codex', model: null,
  status: 'working', elapsedSeconds: 0, output: [],
};
const error = { error: { code: 'ROUTE_NOT_FOUND', message: 'API route not found.' } };

const objects: [string, z.ZodType, Record<string, unknown>][] = [
  ['planTask', api.planTaskSchema, task],
  ['planBoard', api.planBoardSchema, { source: 'dashboard', tasks: [task] }],
  ['runLogEntry', api.runLogEntrySchema, entry],
  ['runLog', api.runLogSchema, { source: 'example-app', entries: [entry] }],
  ['commit', api.commitSchema, commit],
  ['commits', api.commitsSchema, { commits: [commit] }],
  ['galaxyNode', api.galaxyNodeSchema, node],
  ['galaxy', api.galaxySchema, { nodes: [node] }],
  ['agentCard', api.agentCardSchema, card],
  ['agents', api.agentsSchema, { agents: [card] }],
  ['health', api.healthSchema, { status: 'ok' }],
  ['chatRequest', api.chatRequestSchema, { message: 'Current task?' }],
  ['chatSuggestions', api.chatSuggestionsSchema, { suggestions: ['What is pending?'] }],
  ['chatResponse', api.chatResponseSchema, { reply: 'Define API', source: 'local' }],
  ['apiError', api.apiErrorSchema, error],
  ['apiError.error', api.apiErrorSchema.shape.error, error.error],
];

test.each(objects)('%s accepts a valid payload', (_name, schema, payload) => {
  expect(schema.parse(payload)).toEqual(payload);
});

test.each(objects)('%s rejects unknown fields', (_name, schema, payload) => {
  expect(schema.safeParse({ ...payload, extra: true }).success).toBe(false);
});

const enums: [string, z.ZodType, string[]][] = [
  ['agentId', api.agentIdSchema, ['claude-code', 'codex']],
  ['planColumn', api.planColumnSchema, ['pending', 'in_progress', 'done']],
  ['planSource', api.planSourceSchema, ['dashboard', 'example-app']],
  ['agentStatus', api.agentStatusSchema, ['working', 'done', 'error']],
  ['node kind', api.galaxyNodeSchema.shape.kind, ['core', 'agent', 'system']],
  ['node role', api.galaxyNodeSchema.shape.role, ['orchestrator', 'worker']],
];

test.each(enums)('%s accepts its values and rejects unknown values', (_name, schema, values) => {
  for (const value of values) expect(schema.parse(value)).toBe(value);
  expect(schema.safeParse('unknown').success).toBe(false);
});

test('chat trims before checking length', () => {
  expect(api.chatRequestSchema.parse({ message: '  hello  ' })).toEqual({ message: 'hello' });
  expect(api.chatRequestSchema.safeParse({ message: ' \n\t ' }).success).toBe(false);
  expect(api.chatRequestSchema.safeParse({ message: 'a'.repeat(2001) }).success).toBe(false);
  expect(api.chatRequestSchema.parse({ message: ` ${'a'.repeat(2000)} ` }).message).toHaveLength(2000);
});

test.each(['abcdef', 'a'.repeat(41), 'ggggggg'])('rejects invalid commit hash %s', (hash) => {
  expect(api.commitSchema.safeParse({ ...commit, hash }).success).toBe(false);
});

test('accepts full hashes and UTC dates', () => {
  expect(api.commitSchema.safeParse({
    ...commit, hash: 'A'.repeat(40), date: '2026-11-08T15:00:00Z',
  }).success).toBe(true);
});

test.each(['yesterday', '2026-11-08', '2026-11-08T15:00:00'])('rejects non-ISO datetime %s', (date) => {
  expect(api.commitSchema.safeParse({ ...commit, date }).success).toBe(false);
});

test.each([-1, 1.5])('rejects invalid attempts %s', (attempts) => {
  expect(api.runLogEntrySchema.safeParse({ ...entry, attempts }).success).toBe(false);
});

test('accepts recorded model and duration values', () => {
  const recorded = { ...entry, model: 'test-model', durationSeconds: 114 };
  expect(api.runLogEntrySchema.parse(recorded)).toEqual(recorded);
});

test.each([-1, Infinity, NaN])('rejects invalid duration %s', durationSeconds => {
  expect(api.runLogEntrySchema.safeParse({ ...entry, durationSeconds }).success).toBe(false);
});

test('rejects a non-string model', () => {
  expect(api.runLogEntrySchema.safeParse({ ...entry, model: 42 }).success).toBe(false);
});

test('accepts nullable fields', () => {
  expect(api.planTaskSchema.safeParse({ ...task, group: null }).success).toBe(true);
  expect(api.runLogEntrySchema.safeParse({ ...entry, branch: null, attempts: null }).success).toBe(true);
  expect(api.galaxyNodeSchema.safeParse({ ...node, role: null, count: null }).success).toBe(true);
  expect(api.agentCardSchema.safeParse({ ...card, agent: null, elapsedSeconds: null }).success).toBe(true);
});

test.each([
  [api.chatSuggestionsSchema, { suggestions: [''] }],
  [api.chatSuggestionsSchema, { suggestions: [1] }],
  [api.planTaskSchema, { ...task, id: '' }],
  [api.planTaskSchema, { ...task, title: '' }],
  [api.runLogEntrySchema, { ...entry, id: '' }],
  [api.runLogEntrySchema, { ...entry, title: '' }],
  [api.galaxyNodeSchema, { ...node, id: '' }],
  [api.galaxyNodeSchema, { ...node, label: '' }],
  [api.galaxyNodeSchema, { ...node, count: -1 }],
  [api.galaxyNodeSchema, { ...node, count: 0.5 }],
  [api.agentCardSchema, { ...card, id: '' }],
  [api.agentCardSchema, { ...card, task: '' }],
  [api.agentCardSchema, { ...card, elapsedSeconds: -1 }],
] as [z.ZodType, unknown][])('rejects invalid required fields %#', (schema, payload) => {
  expect(schema.safeParse(payload).success).toBe(false);
});

test('accepts the existing server error response', async () => {
  const response = await request(createApp()).get('/api/missing').set('Host', '127.0.0.1:3001');
  expect(response.status).toBe(404);
  expect(api.apiErrorSchema.parse(response.body)).toEqual(error);
});


test('Claude models have one allowlist and settings default to sonnet', () => {
  expect(api.CLAUDE_MODELS).toEqual(['sonnet', 'opus', 'haiku']);
  for (const model of api.CLAUDE_MODELS) expect(api.claudeModelSchema.parse(model)).toBe(model);
  expect(api.claudeModelSchema.safeParse('unknown').success).toBe(false);
  expect(api.settingsSchema.parse({ orchestrator: 'codex', voice: 'openai' }))
    .toEqual({ orchestrator: 'codex', voice: 'openai', chatModel: 'sonnet' });
  expect(api.settingsSchema.safeParse({ orchestrator: 'codex', voice: 'browser', chatModel: 'unknown' }).success).toBe(false);
});
test('chat responses and history accept orchestrator sources and optional response notices', () => {
  for (const source of ['local', 'orchestrator']) {
    expect(api.chatResponseSchema.parse({ reply: 'Reply', source, notice: api.CODEX_CHAT_NOTICE }))
      .toEqual({ reply: 'Reply', source, notice: api.CODEX_CHAT_NOTICE });
    expect(api.chatHistoryMessageSchema.parse({ role: 'assistant', text: 'Reply', source }))
      .toEqual({ role: 'assistant', text: 'Reply', source });
  }
  expect(api.chatResponseSchema.safeParse({ reply: 'Reply', source: 'unknown' }).success).toBe(false);
  expect(api.chatHistoryMessageSchema.safeParse({ role: 'assistant', text: 'Reply', source: 'unknown' }).success).toBe(false);
  expect(api.chatResponseSchema.safeParse({ reply: 'Reply', source: 'local', notice: 1 }).success).toBe(false);
});
