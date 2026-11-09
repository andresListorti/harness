// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { useTestApp } from '../test-app';
import { DEFAULT_SETTINGS, defaultSettingsPath, readSettings, writeSettings } from '../../server/settings';
import { galaxySchema, settingsResponseSchema } from '../../shared/api';

const createApp = useTestApp();

let root: string;
let settingsPath: string;
const app = () => createApp({ staticDir: false, data: {
  repoRoot: root, settingsPath,
  readCommits: async () => ({ commits: [] }), listTestFiles: async () => [],
} });
const get = (route = 'settings', server = app()) => request(server).get(`/api/${route}`)
  .set('Host', '127.0.0.1:3001');
const put = (body: object | string, server = app()) => request(server).put('/api/settings')
  .set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:3001').send(body);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-settings-'));
  settingsPath = join(root, '.data/settings.json');
  await mkdir(join(root, 'dashboard'));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'dashboard/PLAN.md'), '# PLAN\n## Done\n### fixture-task\n- **Goal:** Fixture goal\n');
  await writeFile(join(root, 'docs/run-log.md'), '## D1. fixture-task\n| Codex attempts | 2 |\n- Fixture note\n');
});

afterEach(async () => {
  // root is the absolute directory returned by mkdtemp under os.tmpdir().
  await rm(root, { recursive: true, force: true });
});

test('missing settings use defaults and the default path is source-relative', async () => {
  expect(defaultSettingsPath()).toBe(fileURLToPath(new URL('../../.data/settings.json', import.meta.url)));
  const response = await get();
  expect(response.status).toBe(200);
  expect(settingsResponseSchema.parse(response.body)).toEqual({ ...DEFAULT_SETTINGS, worker: 'codex' });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(await readdir(root)).not.toContain('.data');
});

test.each(['{', '{"orchestrator":"unknown","voice":"browser"}', '{"orchestrator":"codex","voice":"unknown"}', '{}'])(
  'invalid stored settings fall back to defaults: %s', async contents => {
    await mkdir(join(root, '.data'));
    await writeFile(settingsPath, contents);
    expect((await get()).body).toEqual({ ...DEFAULT_SETTINGS, worker: 'codex' });
  },
);

test('unreadable settings fall back to defaults', async () => {
  expect(await readSettings(root)).toEqual(DEFAULT_SETTINGS);
});

test.each(['browser', 'fish-audio', 'elevenlabs', 'openai'] as const)('persists %s across reloads as atomic JSON', async voice => {
  for (const orchestrator of ['codex', 'claude-code'] as const) {
    const settings = { orchestrator, voice };
    const expected = { ...settings, worker: orchestrator === 'codex' ? 'claude-code' : 'codex' };
    const saved = await put(settings);
    expect(saved.status).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(settingsResponseSchema.parse(saved.body)).toEqual(expected);
    expect((await get('settings', app())).body).toEqual(expected);
    const bytes = await readFile(settingsPath);
    expect(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))).toBe(false);
    expect(bytes.toString('utf8')).not.toContain('\r');
    expect(bytes.toString('utf8').endsWith('\n')).toBe(true);
    expect(JSON.parse(bytes.toString('utf8'))).toEqual(settings);
    expect(await readdir(join(root, '.data'))).toEqual(['settings.json']);
  }
});

test.each([
  { orchestrator: 'unknown', voice: 'browser' },
  { orchestrator: 'codex', voice: 'unknown' },
  { orchestrator: 'codex' }, { voice: 'browser' },
  { orchestrator: 'codex', voice: 'browser', extra: true },
])('invalid requests preserve existing settings: %j', async body => {
  await writeSettings(settingsPath, { ...DEFAULT_SETTINGS });
  const before = await readFile(settingsPath);
  const response = await put(body);
  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('INVALID_REQUEST');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(await readFile(settingsPath)).toEqual(before);
});

test('galaxy reloads roles while historical agent cards stay unchanged', async () => {
  const server = app();
  const before = (await get('agents', server)).body;
  expect(before.agents).toHaveLength(1);
  expect(before.agents[0].agent).toBe('codex');
  for (const orchestrator of ['codex', 'claude-code'] as const) {
    expect((await put({ orchestrator, voice: 'browser' }, server)).status).toBe(200);
    const galaxy = galaxySchema.parse((await get('galaxy', server)).body);
    const worker = orchestrator === 'codex' ? 'claude-code' : 'codex';
    const labels = { codex: 'Codex', 'claude-code': 'Claude Code' };
    expect(galaxy.nodes.find(node => node.id === 'harness')?.details)
      .toEqual([`Orchestrator: ${labels[orchestrator]}`, `Worker: ${labels[worker]}`]);
    for (const [id, role] of [[orchestrator, 'orchestrator'], [worker, 'worker']]) {
      expect(galaxy.nodes.find(node => node.id === id)).toEqual(expect.objectContaining({
        role, details: expect.arrayContaining([`Role: ${role}`]),
      }));
    }
    expect((await get('agents', server)).body).toEqual(before);
  }
});

test('write failures return generic errors and clean up temporary files', async () => {
  await mkdir(settingsPath, { recursive: true });
  const response = await put(DEFAULT_SETTINGS);
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: { code: 'SETTINGS_WRITE_FAILED', message: 'Settings could not be saved.' } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(await readdir(join(root, '.data'))).toEqual(['settings.json']);
});

test('global Origin and JSON guards reject settings writes', async () => {
  expect((await put(DEFAULT_SETTINGS).set('Origin', 'http://foreign.example')).status).toBe(403);
  expect((await put('plain text').type('text')).status).toBe(415);
  expect(await readdir(root)).not.toContain('.data');
});
