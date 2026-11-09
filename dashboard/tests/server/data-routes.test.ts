// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useTestApp } from '../test-app';
import { agentsSchema, commitsSchema, galaxySchema, planBoardSchema, runLogSchema } from '../../shared/api';

const createApp = useTestApp();

let repoRoot: string;
const history = { commits: [{ hash: 'abcdef1', subject: 'Fixture commit', date: '2026-01-01T00:00:00Z' }] };
const readCommits = vi.fn(async (_root: string, _limit = 20) => history);
const listTestFiles = vi.fn(async (_root: string) => ['dashboard/tests/fixture.test.ts']);
const schemas = { plan: planBoardSchema, runlog: runLogSchema, commits: commitsSchema, galaxy: galaxySchema, agents: agentsSchema };
const app = () => createApp({ data: { repoRoot, readCommits, listTestFiles } });
const get = (path: string, server = app()) => request(server).get(`/api/${path}`).set('Host', '127.0.0.1:3001');

beforeEach(async () => {
  vi.clearAllMocks();
  repoRoot = await mkdtemp(join(tmpdir(), 'harness-data-routes-'));
  for (const dir of ['dashboard', 'example-app', 'docs']) await mkdir(join(repoRoot, dir));
  for (const source of ['dashboard', 'example-app']) {
    await writeFile(join(repoRoot, source, 'PLAN.md'), `# PLAN\n## Done\n### ${source}-task\n- **Goal:** Fixture goal\n`);
  }
  await writeFile(join(repoRoot, 'docs/run-log.md'),
    '## 1. example-app-task\n| Codex attempts | 1 |\n- Example note: 3 tests\n\n## D1. dashboard-task\n| Codex attempts | 2 |\n- Dashboard note: 7 tests\n');
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

test('all routes validate and include fixture data with no-store caching', async () => {
  for (const [route, schema] of Object.entries(schemas)) {
    const response = await get(route);
    expect(response.status).toBe(200);
    expect(schema.safeParse(response.body).success).toBe(true);
    expect(response.headers['cache-control']).toBe('no-store');
    if (route === 'plan') expect(response.body.tasks[0].id).toBe('dashboard-task');
    if (route === 'runlog') expect(response.body.entries[0].title).toBe('dashboard-task');
    if (route === 'commits') expect(response.body).toEqual(history);
    if (route === 'agents') {
      expect(response.body.agents.map((card: { id: string }) => card.id))
        .toEqual(['example-app/example-app-task', 'dashboard/dashboard-task']);
      expect(response.body.agents[1].output).toEqual(['Dashboard note: 7 tests']);
    }
    if (route === 'galaxy') {
      expect(response.body.nodes).toHaveLength(6);
      expect(response.body.nodes).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'tasks', count: 2 }),
        expect.objectContaining({ id: 'commits', count: 1 }),
        expect.objectContaining({ id: 'tests', count: 1, details: ['Test files: 1', 'Last recorded run: 7 tests'] }),
      ]));
      expect(listTestFiles).toHaveBeenCalledWith(repoRoot);
      expect(readCommits).toHaveBeenCalledWith(repoRoot, 20);
    }
  }
});

test.each(['plan', 'runlog'])('%s defaults to dashboard and selects example-app', async route => {
  expect((await get(route)).body.source).toBe('dashboard');
  const response = await get(`${route}?source=example-app`);
  expect(response.status).toBe(200);
  expect(response.body.source).toBe('example-app');
  expect(route === 'plan' ? response.body.tasks[0].id : response.body.entries[0].title).toBe('example-app-task');
});

test.each(['foo', '../x', '..%2F..%2Fetc%2Fpasswd', '', 'a&source=b'])(
  'rejects invalid source %j', async source => {
    for (const route of ['plan', 'runlog']) {
      const response = await get(`${route}?source=${source}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_SOURCE');
      expect(response.headers['cache-control']).toBe('no-store');
    }
  },
);

test('missing files yield empty valid data and retain galaxy nodes', async () => {
  // Remove only the known fixture files.
  for (const file of ['dashboard/PLAN.md', 'example-app/PLAN.md', 'docs/run-log.md']) {
    await rm(join(repoRoot, file));
  }
  const server = createApp({ data: { repoRoot, readCommits: async () => ({ commits: [] }), listTestFiles: async () => [] } });
  for (const [route, schema] of Object.entries(schemas)) {
    const response = await get(route, server);
    expect(response.status).toBe(200);
    expect(schema.safeParse(response.body).success).toBe(true);
    if (route === 'galaxy') {
      expect(response.body.nodes).toHaveLength(6);
      expect(response.body.nodes.find((node: { id: string }) => node.id === 'tasks').count).toBe(0);
    } else {
      expect(response.body[route === 'plan' ? 'tasks' : route === 'runlog' ? 'entries' : route]).toEqual([]);
    }
  }
});

test.each([['', 20], ['?limit=5', 5], ['?limit=abc', 20], ['?limit=-10', -10], ['?limit=999', 999]])(
  'passes commits limit %s through to git', async (query, limit) => {
    expect((await get(`commits${query}`)).status).toBe(200);
    expect(readCommits).toHaveBeenCalledWith(repoRoot, limit);
  },
);

test('POST is rejected and unknown API routes retain the JSON 404', async () => {
  const response = await request(app()).post('/api/plan').set('Host', '127.0.0.1:3001');
  expect(response.status).not.toBe(200);
  const missing = await get('nope');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) } });
});

test('Express forwards rejected async handlers and invalid response schemas without details', async () => {
  for (const readCommits of [
    async () => { throw new Error('private fixture detail'); },
    async () => ({ commits: [{ ...history.commits[0], hash: 'invalid' }] }),
  ]) {
    const response = await get('commits', createApp({ data: { repoRoot, readCommits } }));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    expect(response.headers['cache-control']).toBe('no-store');
  }
});

test('real repo defaults serve schema-valid data', async () => {
  const server = createApp();
  for (const [route, schema] of Object.entries(schemas)) {
    const response = await get(route, server);
    expect(response.status).toBe(200);
    expect(schema.safeParse(response.body).success).toBe(true);
    if (route === 'plan') expect(response.body.tasks).toContainEqual(expect.objectContaining({ id: 'scaffold', column: 'done' }));
    if (route === 'galaxy') expect(response.body.nodes).toHaveLength(6);
  }
});
