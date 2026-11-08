// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { expect, test } from 'vitest';
import { createApp } from '../../server/app';
import { answerLocally, LOCAL_SUGGESTIONS, type LocalContext } from '../../server/chat/local';
import type { PlanTask } from '../../shared/api';

const task = (title: string): PlanTask => ({
  id: title, title, group: null, goal: '', files: '', definitionOfDone: '', result: null, column: 'pending',
});
const empty: LocalContext = { pending: [], inProgress: [], runLog: [], commits: [], testFiles: [] };
const context: LocalContext = {
  pending: [task('Build chat'), task('Build client')], inProgress: [task('Read plan')],
  runLog: [
    { id: '1', title: 'old', branch: null, attempts: 1, result: 'done', notes: ['90 tests'] },
    { id: 'D1', title: 'latest', branch: null, attempts: 0, result: 'done', notes: ['12 tests', '1 test', 'Final note'] },
  ],
  commits: [{ hash: 'abcdef123456', subject: 'Add local answers', date: '2026-01-01T00:00:00Z' }],
  testFiles: ['a.test.ts', 'b.test.ts'],
};

test('suggestions have the required order and each resolves to its own intent', () => {
  expect(LOCAL_SUGGESTIONS).toEqual([
    'What is pending?', 'What is in progress?', 'Show the latest commits',
    'What was the latest run?', 'How are the tests?',
  ]);
  const expected = [
    'Pending tasks: 2\n- Build chat\n- Build client', '- Read plan', 'abcdef1 Add local answers',
    'D1. latest\nResult: done\nCodex attempts: 0\nFinal note', 'Tracked test files: 2\nLast recorded run: 1 tests',
  ];
  LOCAL_SUGGESTIONS.forEach((question, i) => expect(answerLocally(question, context)).toBe(expected[i]));
});

test('pending and commits are capped, with an accurate remaining count', () => {
  const reply = answerLocally('next', { ...context, pending: Array.from({ length: 11 }, (_, i) => task(`Task ${i}`)) });
  expect(reply).toContain('Pending tasks: 11');
  expect(reply.match(/^- /gm)).toHaveLength(8);
  expect(reply).toContain('- Task 7\n...and 3 more');
  expect(reply).not.toContain('Task 8');
  expect(answerLocally('commits', { ...context, commits: Array(7).fill(context.commits[0]) }).split('\n')).toHaveLength(5);
});

test('empty replies and unknown help contain plain text', () => {
  const expected = ['No tasks are pending.', 'Nothing is in progress right now.', 'No commits found.',
    'No runs are recorded yet.', 'Tracked test files: 0\nNo run result is recorded.'];
  LOCAL_SUGGESTIONS.forEach((question, i) => {
    const reply = answerLocally(question, empty);
    expect(reply).toBe(expected[i]);
    expect(reply).not.toContain('<');
  });
  const help = answerLocally('Tell me a joke', empty);
  expect(help).toContain('only answer repo questions without an agent yet');
  for (const suggestion of LOCAL_SUGGESTIONS) expect(help).toContain(suggestion);
  expect(help).not.toContain('<');
});

test.each([
  ['  WHAT   IS\n PENDING?!  ', 'Pending tasks: 2'], ['CURRENT...', 'Read plan'],
  ['working on', 'Read plan'], ['now', 'Read plan'], ['git log', 'abcdef1'],
  ['last task', 'D1. latest'], ['latest task', 'D1. latest'], ['last run', 'D1. latest'],
  ['run log', 'D1. latest'], ['todo', 'Build chat'], ['to do', 'Build chat'],
  ['remaining', 'Build chat'], ['left', 'Build chat'],
  ['tests commits latest run current pending', 'Tracked test files: 2'],
  ['commits latest run current pending', 'abcdef1'], ['latest run current pending', 'D1. latest'],
  ['current pending', 'Read plan'],
])('normalizes and prioritizes %s', (question, expected) => {
  expect(answerLocally(question, context)).toContain(expected);
});

test('unrecorded run fields are omitted and earlier matching test notes remain usable', () => {
  const runLog = [...context.runLog, { id: 'D2', title: 'new', branch: null, attempts: null, result: null, notes: [] }];
  expect(answerLocally('latest run', { ...context, runLog })).toBe('D2. new');
  expect(answerLocally('tests', { ...context, runLog })).toContain('Last recorded run: 1 tests');
});

test('chat routes use fixed repo context and enforce contracts and guards', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'harness-chat-local-'));
  try {
    for (const dir of ['dashboard', 'example-app', 'docs']) await mkdir(join(repoRoot, dir));
    await writeFile(join(repoRoot, 'dashboard/PLAN.md'), '# PLAN\n## Pending\n### Dashboard pending\n- **Goal:** chat\n## In progress\n### Dashboard current\n- **Goal:** work\n');
    await writeFile(join(repoRoot, 'example-app/PLAN.md'), '# PLAN\n## Pending\n### Example pending\n- **Goal:** example\n');
    await writeFile(join(repoRoot, 'docs/run-log.md'), '## D1. Dashboard run\n| Result | done |\n- 9 tests\n## 1. Example run\n- 3 tests\n');
    const app = createApp({ data: {
      repoRoot, readCommits: async () => ({ commits: context.commits }), listTestFiles: async () => context.testFiles,
    } });
    const post = (body: object) => request(app).post('/api/chat').set('Host', '127.0.0.1:3001')
      .set('Origin', 'http://127.0.0.1:3001').set('Content-Type', 'application/json').send(body);
    for (const [message, expected] of [
      [LOCAL_SUGGESTIONS[0], 'Pending tasks: 1\n- Dashboard pending'],
      [LOCAL_SUGGESTIONS[1], '- Dashboard current'], [LOCAL_SUGGESTIONS[2], 'abcdef1 Add local answers'],
      [LOCAL_SUGGESTIONS[3], 'D1. Dashboard run\nResult: done\n9 tests'],
      [LOCAL_SUGGESTIONS[4], 'Tracked test files: 2\nLast recorded run: 9 tests'],
    ]) {
      const response = await post({ message });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ reply: expected, source: 'local' });
      expect(response.headers['cache-control']).toBe('no-store');
    }
    for (const body of [{}, { message: '' }, { message: ' \n\t ' }, { message: 'a'.repeat(2001) },
      { message: 'tests', extra: true }, { message: 42 }]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
      expect(response.headers['cache-control']).toBe('no-store');
    }
    const denied = await request(app).post('/api/chat').set('Host', '127.0.0.1:3001')
      .set('Content-Type', 'application/json').send({ message: 'tests' });
    expect(denied.status).toBe(403);
    const suggestions = await request(app).get('/api/chat/suggestions').set('Host', '127.0.0.1:3001');
    expect(suggestions.status).toBe(200);
    expect(suggestions.body).toEqual({ suggestions: LOCAL_SUGGESTIONS });
    expect(suggestions.headers['cache-control']).toBe('no-store');
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('local chat source cannot launch a process', async () => {
  for (const file of ['../../server/chat/local.ts', '../../server/routes/chat.ts']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    expect(source).not.toContain('child_process');
    expect(source).not.toContain('spawn');
  }
});

