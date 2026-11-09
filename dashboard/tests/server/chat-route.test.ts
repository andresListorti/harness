// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useTestApp } from '../test-app';
import { ChatRunError, type runClaudeChat } from '../../server/chat/runner';
import { CHAT_HISTORY_MESSAGE_LIMIT, CODEX_CHAT_NOTICE } from '../../shared/api';
import { appendToHistory, readHistory } from '../../server/chat/history';
import { readSettings } from '../../server/settings';

const createApp = useTestApp();
let root: string;
let settingsPath: string;
let historyPath: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-chat-route-'));
  settingsPath = join(root, 'settings.json');
  historyPath = join(root, 'history.json');
  await mkdir(join(root, 'dashboard'));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'dashboard/PLAN.md'), '# PLAN\n## Pending\n### Pending fixture\n- **Goal:** Pending goal\n## In progress\n### Active fixture\n- **Goal:** Active goal\n');
  await writeFile(join(root, 'docs/run-log.md'), '## D1. Recent fixture\n- Latest fixture note\n');
  await writeFile(join(root, 'docs/chat-isolation.md'), '# Isolation fixture\nFixed document.\n');
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function setup(runner = vi.fn<typeof runClaudeChat>().mockResolvedValue('Orchestrator reply')) {
  const app = createApp({ staticDir: false, data: {
    repoRoot: root, settingsPath, historyPath, runClaudeChat: runner,
    readCommits: async () => ({ commits: [{ hash: 'abcdef1', subject: 'Fixture commit', date: '2026-01-01T00:00:00Z' }] }),
    listTestFiles: async () => ['fixture.test.ts'],
  } });
  const get = (path: string) => request(app).get(`/api/${path}`).set('Host', '127.0.0.1:3001');
  const mutate = (method: 'post' | 'put' | 'delete', path: string) => request(app)[method](`/api/${path}`)
    .set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:3001');
  return { runner, get, post: (message = 'Explain the architecture') => mutate('post', 'chat').send({ message }),
    body: (body: object) => mutate('post', 'chat').send(body),
    clear: () => mutate('delete', 'chat/history'),
    save: (body: object) => mutate('put', 'settings').send(body) };
}
async function settings(orchestrator = 'claude-code', chatModel = 'opus') {
  await writeFile(settingsPath, JSON.stringify({ orchestrator, voice: 'openai', chatModel }));
}
function deferred() {
  let resolve!: (reply: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test.each(['What is pending?', 'please run the tests', 'write a file', 'launch codex'])(
  'recognized message stays local without a runner: %s', async message => {
    const s = setup();
    const response = await s.post(message);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: expect.any(String), source: 'local' });
    expect(s.runner).not.toHaveBeenCalled();
    expect((await readHistory(historyPath)).messages[1].source).toBe('local');
  },
);
test('Claude uses saved model, supplied snapshot and history, and saves the exchange', async () => {
  await settings();
  await appendToHistory(historyPath, [{ role: 'user', text: 'Earlier fixture question' },
    { role: 'assistant', text: 'Earlier fixture answer', source: 'orchestrator' }]);
  const s = setup();
  const response = await s.post();
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ reply: 'Orchestrator reply', source: 'orchestrator' });
  expect(s.runner).toHaveBeenCalledOnce();
  const [prompt, model] = s.runner.mock.calls[0];
  expect(model).toBe('opus');
  for (const text of ['Pending fixture', 'Active fixture', 'Latest fixture note', 'Fixture commit',
    'fixture.test.ts', 'Earlier fixture question', 'Earlier fixture answer', 'Explain the architecture']) {
    expect(prompt).toContain(text);
  }
  expect((await readHistory(historyPath)).messages.slice(-2)).toEqual([
    { role: 'user', text: 'Explain the architecture' },
    { role: 'assistant', text: 'Orchestrator reply', source: 'orchestrator' },
  ]);
});
test('long orchestrator replies stay complete in the response and are shortened in history', async () => {
  await settings();
  const reply = 'a'.repeat(15000);
  const s = setup(vi.fn<typeof runClaudeChat>().mockResolvedValue(reply));
  const response = await s.post();
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ reply, source: 'orchestrator' });
  const messages = (await readHistory(historyPath)).messages;
  expect(messages).toHaveLength(2);
  expect(messages[0]).toEqual({ role: 'user', text: 'Explain the architecture' });
  expect(messages[1]).toEqual({
    role: 'assistant',
    text: reply.slice(0, CHAT_HISTORY_MESSAGE_LIMIT - '[reply shortened in history]'.length) + '[reply shortened in history]',
    source: 'orchestrator',
  });
  expect(messages[1].text).toHaveLength(CHAT_HISTORY_MESSAGE_LIMIT);
});

test('Codex free text stays local with the exact notice and never calls the runner', async () => {
  await settings('codex');
  const s = setup();
  const response = await s.post();
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ reply: expect.stringContaining("I didn't understand that."), source: 'local', notice: CODEX_CHAT_NOTICE });
  expect(s.runner).not.toHaveBeenCalled();
  expect((await readHistory(historyPath)).messages[1].source).toBe('local');
});
test.each([false, true])('concurrent free text is rejected; local questions work; slot releases (failure=%s)', async failure => {
  const held = deferred();
  const entered = deferred();
  const runner = vi.fn<typeof runClaudeChat>().mockImplementationOnce(() => {
    entered.resolve('entered');
    return held.promise;
  }).mockResolvedValue('Later reply');
  const s = setup(runner);
  const first = s.post().then(response => response);
  await entered.promise;
  try {
    const busy = await s.post('Why is the architecture arranged this way?');
    expect(busy.status).toBe(429);
    expect(busy.body.error).toEqual({ code: 'CHAT_BUSY', message: expect.stringContaining('already running') });
    expect((await s.post('What is pending?')).status).toBe(200);
    expect(runner).toHaveBeenCalledOnce();
  } finally {
    if (failure) held.reject(new Error('Private diagnostic'));
    else held.resolve('First reply');
  }
  expect((await first).status).toBe(failure ? 502 : 200);
  expect((await s.post()).status).toBe(200);
  expect(runner).toHaveBeenCalledTimes(2);
  expect((await readHistory(historyPath)).messages).toHaveLength(failure ? 4 : 6);
});
test.each([
  ['CLI_NOT_FOUND', 503], ['TIMEOUT', 504], ['FAILED_RUN', 502], ['OUTPUT_TOO_LARGE', 502], ['INVALID_MODEL', 502],
] as const)('runner error %s is safe, not saved, and leaves local questions working', async (code, status) => {
  const s = setup(vi.fn<typeof runClaudeChat>().mockRejectedValue(new ChatRunError(code)));
  const response = await s.post();
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
  if (code === 'CLI_NOT_FOUND') expect(response.body.error.message).toContain('Local questions still work');
  expect((await readHistory(historyPath)).messages).toEqual([]);
  expect((await s.post('How are the tests?')).status).toBe(200);
  expect(s.runner).toHaveBeenCalledOnce();
});
test('unknown errors never expose runner diagnostics', async () => {
  const s = setup(vi.fn<typeof runClaudeChat>().mockRejectedValue(new Error('stderr: private prompt diagnostic')));
  const response = await s.post();
  expect(response.status).toBe(502);
  expect(response.body).toEqual({ error: { code: 'FAILED_RUN', message: 'Claude Code could not complete the chat. Please try again.' } });
  expect((await readHistory(historyPath)).messages).toEqual([]);
});
test.each([{}, { message: '' }, { message: '   ' }, { message: 2 }, { message: 'a'.repeat(2001) },
  { message: 'hello', extra: true }])('invalid chat body is rejected: %j', async body => {
  const s = setup();
  expect((await s.body(body)).status).toBe(400);
  expect(s.runner).not.toHaveBeenCalled();
  expect((await readHistory(historyPath)).messages).toEqual([]);
});
test('legacy settings preserve orchestrator and voice, and omitted model preserves the saved model', async () => {
  await writeFile(settingsPath, JSON.stringify({ orchestrator: 'codex', voice: 'openai' }));
  expect(await readSettings(settingsPath)).toEqual({ orchestrator: 'codex', voice: 'openai', chatModel: 'sonnet' });
  const s = setup();
  expect((await s.get('settings')).body).toEqual({ orchestrator: 'codex', worker: 'claude-code', voice: 'openai', chatModel: 'sonnet' });
  expect((await s.post()).body.notice).toBe(CODEX_CHAT_NOTICE);
  expect(s.runner).not.toHaveBeenCalled();
  await settings('claude-code', 'haiku');
  const saved = await s.save({ orchestrator: 'codex', voice: 'browser' });
  expect(saved.status).toBe(200);
  expect(saved.body.chatModel).toBe('haiku');
  expect((await readSettings(settingsPath)).chatModel).toBe('haiku');
  const before = await readFile(settingsPath, 'utf8');
  expect((await s.save({ orchestrator: 'codex', voice: 'browser', chatModel: 'invalid' })).status).toBe(400);
  expect(await readFile(settingsPath, 'utf8')).toBe(before);
});
test('clearing history during an orchestrator run prevents the finished exchange being saved', async () => {
  const held = deferred();
  const entered = deferred();
  const s = setup(vi.fn<typeof runClaudeChat>().mockImplementation(() => {
    entered.resolve('entered'); return held.promise;
  }));
  const pending = s.post().then(response => response);
  await entered.promise;
  try { expect((await s.clear()).status).toBe(200); }
  finally { held.resolve('Late reply'); }
  expect((await pending).body).toEqual({ reply: 'Late reply', source: 'orchestrator' });
  expect((await s.get('chat/history')).body).toEqual({ messages: [] });
});
test('isolation endpoint serves only the fixed document as plain text with nosniff', async () => {
  const s = setup();
  const response = await s.get('docs/chat-isolation?path=other.md');
  expect(response.status).toBe(200);
  expect(response.text).toBe('# Isolation fixture\nFixed document.\n');
  expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  await rm(join(root, 'docs/chat-isolation.md'));
  expect((await s.get('docs/chat-isolation')).status).toBe(404);
});
