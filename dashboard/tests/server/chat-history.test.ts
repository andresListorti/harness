// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, expect, test } from 'vitest';
import { useTestApp } from '../test-app';
import { appendToHistory, readHistory } from '../../server/chat/history';

const createApp = useTestApp();

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });
async function setup() {
  const folder = await mkdtemp(join(tmpdir(), 'chat-history-'));
  folders.push(folder);
  const historyPath = join(folder, 'history.json');
  const build = () => createApp({ data: { historyPath, repoRoot: folder,
    readCommits: async () => ({ commits: [] }), listTestFiles: async () => [] } });
  const app = build();
  const get = () => request(app).get('/api/chat/history').set('Host', '127.0.0.1:3001');
  const post = (body: object) => request(app).post('/api/chat').set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:3001').send(body);
  const clear = (origin = 'http://127.0.0.1:3001') => request(app).delete('/api/chat/history')
    .set('Host', '127.0.0.1:3001').set('Origin', origin);
  return { folder, historyPath, build, get, post, clear };
}

test('missing, corrupt, invalid and unreadable history are empty', async () => {
  const s = await setup();
  expect((await s.get()).body).toEqual({ messages: [] });
  for (const content of ['{', '{"messages":[{"role":"system","text":"bad"}]}', '{"messages":[],"extra":true}']) {
    await writeFile(s.historyPath, content);
    expect((await s.get()).body).toEqual({ messages: [] });
  }
  expect(await readHistory(s.folder)).toEqual({ messages: [] });
});

test('POST saves literal text and replies in order across app instances; DELETE removes history', async () => {
  const s = await setup();
  const message = '<b>hello</b>';
  const response = await s.post({ message });
  expect(response.status).toBe(200);
  const expected = { messages: [{ role: 'user', text: message },
    { role: 'assistant', text: response.body.reply, source: 'local' }] };
  const history = await s.get();
  expect(history.status).toBe(200);
  expect(history.headers['cache-control']).toBe('no-store');
  expect(history.body).toEqual(expected);
  expect((await request(s.build()).get('/api/chat/history').set('Host', '127.0.0.1:3001')).body).toEqual(expected);
  const bytes = await readFile(s.historyPath);
  expect(bytes[0]).toBe(123);
  expect(bytes.toString()).not.toContain('\r');
  expect(JSON.parse(bytes.toString())).toEqual(expected);
  expect(await readdir(s.folder)).toEqual(['history.json']);
  const cleared = await s.clear();
  expect(cleared.status).toBe(200);
  expect(cleared.headers['cache-control']).toBe('no-store');
  expect(cleared.body).toEqual({ messages: [] });
  expect(await readdir(s.folder)).toEqual([]);
  expect((await s.get()).body).toEqual({ messages: [] });
  expect((await s.clear()).status).toBe(200);
});

test('invalid requests write nothing and foreign DELETE is forbidden', async () => {
  const s = await setup();
  expect((await s.post({ message: '', extra: true })).status).toBe(400);
  expect(await readdir(s.folder)).toEqual([]);
  await s.post({ message: 'tests' });
  expect((await s.clear('http://foreign.invalid')).status).toBe(403);
  expect((await s.get()).body.messages).toHaveLength(2);
});

test('caps count and characters by dropping oldest messages', async () => {
  const s = await setup();
  await appendToHistory(s.historyPath, Array.from({ length: 205 }, (_, i) => ({ role: 'user', text: String(i) })));
  let history = await readHistory(s.historyPath);
  expect(history.messages).toHaveLength(200);
  expect(history.messages[0].text).toBe('5');
  await s.clear();
  await appendToHistory(s.historyPath, Array.from({ length: 11 }, (_, i) => ({ role: 'user', text: String(i).padEnd(10000, 'x') })));
  history = await readHistory(s.historyPath);
  expect(history.messages).toHaveLength(10);
  expect(history.messages[0].text.startsWith('1')).toBe(true);
  expect(history.messages.reduce((n, message) => n + message.text.length, 0)).toBe(100000);
});

test('concurrent POSTs lose no messages and leave no temporary files', async () => {
  const s = await setup();
  const responses = await Promise.all(Array.from({ length: 12 }, (_, i) => s.post({ message: `question ${i}` })));
  responses.forEach(response => expect(response.status).toBe(200));
  const history = JSON.parse(await readFile(s.historyPath, 'utf8'));
  expect(history.messages).toHaveLength(24);
  expect(new Set(history.messages.filter((message: { role: string }) => message.role === 'user')
    .map((message: { text: string }) => message.text)).size).toBe(12);
  for (let i = 0; i < 24; i += 2) {
    expect(history.messages[i].role).toBe('user');
    expect(history.messages[i + 1].role).toBe('assistant');
  }
  expect(await readdir(s.folder)).toEqual(['history.json']);
});

test('write failure preserves the reply and clear failure is generic', async () => {
  const s = await setup();
  await writeFile(s.historyPath, 'blocked');
  const app = createApp({ data: { historyPath: join(s.historyPath, 'history.json'), repoRoot: s.folder,
    readCommits: async () => ({ commits: [] }), listTestFiles: async () => [] } });
  const reply = await request(app).post('/api/chat').set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:3001').send({ message: 'tests' });
  expect(reply.status).toBe(200);
  expect(reply.body.source).toBe('local');
  const clearApp = createApp({ data: { historyPath: s.folder } });
  const cleared = await request(clearApp).delete('/api/chat/history').set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:3001');
  expect(cleared.status).toBe(500);
  expect(cleared.body).toEqual({ error: { code: 'HISTORY_CLEAR_FAILED', message: 'Saved history could not be cleared.' } });
  expect(cleared.headers['cache-control']).toBe('no-store');
});
