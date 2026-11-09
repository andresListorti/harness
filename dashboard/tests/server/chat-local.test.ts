// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { expect, test } from 'vitest';
import { useTestApp } from '../test-app';
import {
  answerLocally, CAPABILITY_NOTICE, LOCAL_SUGGESTIONS, type LocalContext,
} from '../../server/chat/local';
import type { PlanTask } from '../../shared/api';

const createApp = useTestApp();

const task = (title: string): PlanTask => ({
  id: title, title, group: null, goal: '', files: '', definitionOfDone: '', result: null,
  column: 'pending',
});
const empty: LocalContext = { pending: [], inProgress: [], runLog: [], commits: [], testFiles: [] };
const context: LocalContext = {
  pending: [task('Build chat'), task('Build client')], inProgress: [task('Read plan')],
  runLog: [
    {
      id: '1', title: 'old', branch: null, model: null, durationSeconds: null,
      attempts: 1, result: 'done', notes: ['90 tests'],
    },
    {
      id: 'D1', title: 'latest', branch: null, model: null, durationSeconds: null,
      attempts: 0, result: 'done', notes: ['12 tests', '1 test', 'Final note'],
    },
  ],
  commits: [{ hash: 'abcdef123456', subject: 'Add local answers', date: '2026-01-01T00:00:00Z' }],
  testFiles: ['a.test.ts', 'b.test.ts'],
};

test('cleans markup from the latest run reply while keeping the words', () => {
  const reply = answerLocally('latest run', {
    ...context,
    runLog: [{ ...context.runLog[1], notes: ['**Attempt 1:** Wrote `server/data/git.ts`.'] }],
  });
  expect(reply).toContain('Attempt 1: Wrote server/data/git.ts.');
  expect(reply).not.toContain('**');
  expect(reply).not.toContain('`');
});

test('suggestions have the required order and each resolves to its own intent', () => {
  expect(LOCAL_SUGGESTIONS).toEqual([
    'What is pending?', 'What is in progress?', 'Show the latest commits',
    'What was the latest run?', 'How are the tests?',
  ]);
  const expected = [
    'Pending tasks: 2\n- Build chat\n- Build client', '- Read plan', 'abcdef1 Add local answers',
    'D1. latest\nResult: done\nCodex attempts: 0\nFinal note',
    'Tracked test files: 2\nLast recorded run: 1 tests',
  ];
  LOCAL_SUGGESTIONS.forEach((question, i) => {
    expect(answerLocally(question, context)).toBe(expected[i]);
  });
});

test('pending and commits are capped, with an accurate remaining count', () => {
  const reply = answerLocally('next', {
    ...context, pending: Array.from({ length: 11 }, (_, i) => task(`Task ${i}`)),
  });
  expect(reply).toContain('Pending tasks: 11');
  expect(reply.match(/^- /gm)).toHaveLength(8);
  expect(reply).toContain('- Task 7\n...and 3 more');
  expect(reply).not.toContain('Task 8');
  const commits = answerLocally('commits', {
    ...context, commits: Array(7).fill(context.commits[0]),
  });
  expect(commits.split('\n')).toHaveLength(5);
});

test('empty replies and unknown help contain plain text', () => {
  const expected = [
    'No tasks are pending.', 'Nothing is in progress right now.', 'No commits found.',
    'No runs are recorded yet.', 'Tracked test files: 0\nNo run result is recorded.'];
  LOCAL_SUGGESTIONS.forEach((question, i) => {
    const reply = answerLocally(question, empty);
    expect(reply).toBe(expected[i]);
    expect(reply).not.toContain('<');
  });
  const help = answerLocally('hello', empty);
  expect(help).toContain(CAPABILITY_NOTICE);
  for (const suggestion of LOCAL_SUGGESTIONS) expect(help).toContain(suggestion);
  expect(help).not.toContain('<');
});

test.each([
  ['  WHAT   IS\n PENDING?!  ', 'Pending tasks: 2'], ['CURRENT...', 'Read plan'],
  ['working on', 'Read plan'], ['now', 'Read plan'], ['git log', 'abcdef1'],
  ['last task', 'D1. latest'], ['latest task', 'D1. latest'], ['last run', 'D1. latest'],
  ['show the run log', 'D1. latest'], ['todo', 'Build chat'], ['to do', 'Build chat'],
  ['remaining', 'Build chat'], ['left', 'Build chat'],
  ['tests commits latest run current pending', 'Tracked test files: 2'],
  ['commits latest run current pending', 'abcdef1'], ['latest run current pending', 'D1. latest'],
  ['current pending', 'Read plan'],
])('normalizes and prioritizes %s', (question, expected) => {
  expect(answerLocally(question, context)).toContain(expected);
});

test('unrecorded run fields are omitted and earlier matching test notes remain usable', () => {
  const runLog = [...context.runLog, {
    id: 'D2', title: 'new', branch: null, model: null, durationSeconds: null,
    attempts: null, result: null, notes: [],
  }];
  expect(answerLocally('latest run', { ...context, runLog })).toBe('D2. new');
  expect(answerLocally('tests', { ...context, runLog })).toContain('Last recorded run: 1 tests');
});


const suggestionList = LOCAL_SUGGESTIONS.map(question => '- ' + question).join('\n');
const unsupported = "I can't do that. " + CAPABILITY_NOTICE
  + '\nI can answer:\n' + suggestionList;

test('knowing about pending tasks does not select the in-progress intent', () => {
  const reply = answerLocally('Do you know what is pending?', context);
  expect(reply).toMatch(/^Pending tasks:/);
  expect(reply).not.toContain('Read plan');
});

test.each([
  'What is unknown here?', 'unknown', 'Is the unknown clear?', 'Anything unknown?',
  'I know', 'knowledge base', 'nowhere', 'Is there any leftover?', 'nextdoor',
  'commitment', 'a pendingness', 'currency', 'currentlyness', 'currentness',
  'épending', 'pendingé', '2pending', 'pending2', '_pending', 'pending_item',
  'in progressness', 'what is run logger?',
])('requires whole words and phrases: %s', message => {
  const reply = answerLocally(message, context);
  expect(reply).toBe("I didn't understand that. " + CAPABILITY_NOTICE
    + '\nI can answer:\n' + suggestionList);
  for (const suggestion of LOCAL_SUGGESTIONS) expect(reply).toContain(suggestion);
});

test.each([
  ['What is pending?', 'Pending tasks: 2'], ['pending', 'Pending tasks: 2'],
  ['PENDING!', 'Pending tasks: 2'], ['Which commits are the latest?', 'abcdef1'],
  ['commit', unsupported], ['show the latest commits', 'abcdef1'],
  ['What is in progress?', '- Read plan'], ['what is currently happening', '- Read plan'],
  ['what is happening now', '- Read plan'], ['now', '- Read plan'],
  ["what's current?", '- Read plan'], ['what is next', 'Pending tasks: 2'],
  ['what is left', 'Pending tasks: 2'], ['to do', 'Pending tasks: 2'],
  ['todo', 'Pending tasks: 2'], ['todos', 'Pending tasks: 2'],
  ['Do you know what is in progress?', '- Read plan'], ['run logs', 'D1. latest'],
  ['last run', 'D1. latest'], ['How are the tests?', 'Tracked test files: 2'],
  ['test status', 'Tracked test files: 2'], ['in   progress', '- Read plan'],
  ['(pending)', 'Pending tasks: 2'], ['is commit recorded?', 'abcdef1'],
])('preserves real keyword uses and action priority: %s', (message, expected) => {
  expect(answerLocally(message, context)).toContain(expected);
});

function expectPlainText(reply: string): void {
  expect(reply).not.toContain('**');
  expect(reply).not.toContain('`');
  expect(reply).not.toContain('<');
}

test.each([
  'launch codex', 'Launch an agent to fix the build', 'please run the tests',
  'can you start the next task?', 'could you merge this branch', 'push to main',
  'create a new task called demo', 'ask claude to review the code',
  'have codex implement the settings view', 'use the orchestrator to run the plan',
  'delete the run log', 'fix the failing test', "let's start milestone 2",
  'Please just go ahead and now run tests?!', 'spawn a worker',
  'would you write a file', 'will you execute tests', 'i want you to deploy this',
  'i need you to update the plan', 'lets kick off the next task',
  'could we ask the worker to review this', 'let the agent handle tests',
  'get claude code to fix this', 'make the orchestrator act', 'run the tests',
  'start the next task', 'run log for codex', 'have codex report status',
])('rejects unsupported action: %s', message => {
  const reply = answerLocally(message, context);
  expect(reply).toBe(unsupported);
  expectPlainText(reply);
});

test.each([
  ['run log', 'D1. latest'],
  ['run the log', 'D1. latest'],
  ['test status', 'Tracked test files: 2'],
  ['test results', 'Tracked test files: 2'],
  ['commit history', 'abcdef1 Add local answers'],
  ['change log', "I didn't understand that."],
  ['open tasks', "I didn't understand that."],
  ['build status', "I didn't understand that."],
  ['update status', "I didn't understand that."],
])('keeps read-only phrases out of action replies: %s', (message, expected) => {
  const reply = answerLocally(message, context);
  expect(reply).toContain(expected);
  expect(reply).not.toContain("I can't do that.");
  expectPlainText(reply);
});

test.each([
  [LOCAL_SUGGESTIONS[0], 'Pending tasks: 2'],
  [LOCAL_SUGGESTIONS[1], '- Read plan'],
  [LOCAL_SUGGESTIONS[2], 'abcdef1 Add local answers'],
  [LOCAL_SUGGESTIONS[3], 'D1. latest'],
  [LOCAL_SUGGESTIONS[4], 'Tracked test files: 2'],
  ['how many tests run', 'Tracked test files: 2'],
  ['which commits are the latest', 'abcdef1 Add local answers'],
  ['is anything pending', 'Pending tasks: 2'],
  ['show the latest run', 'D1. latest'],
  ['what is codex working on now', '- Read plan'],
  ['status of the tests', 'Tracked test files: 2'],
])('answers the question: %s', (message, expected) => {
  const reply = answerLocally(message, context);
  expect(reply).toContain(expected);
  expect(reply).not.toContain("I can't do that");
  expectPlainText(reply);
});

test.each(['what is the weather', 'hello', 'open the browser'])(
  'explains limits for unknown text: %s', message => {
    const reply = answerLocally(message, context);
    expect(reply).toBe("I didn't understand that. " + CAPABILITY_NOTICE
      + '\nI can answer:\n' + suggestionList);
    expectPlainText(reply);
  },
);

test('chat routes use fixed repo context and enforce contracts and guards', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'harness-chat-local-'));
  try {
    for (const dir of ['dashboard', 'example-app', 'docs']) await mkdir(join(repoRoot, dir));
    await writeFile(join(repoRoot, 'dashboard/PLAN.md'),
      '# PLAN\n'
      + '## Pending\n'
      + '### Dashboard pending\n'
      + '- **Goal:** chat\n'
      + '## In progress\n'
      + '### Dashboard current\n'
      + '- **Goal:** work\n'
      + '');
    await writeFile(join(repoRoot, 'example-app/PLAN.md'),
      '# PLAN\n'
      + '## Pending\n'
      + '### Example pending\n'
      + '- **Goal:** example\n'
      + '');
    await writeFile(join(repoRoot, 'docs/run-log.md'),
      '## D1. Dashboard run\n'
      + '| Result | done |\n'
      + '- 9 tests\n'
      + '## 1. Example run\n'
      + '- 3 tests\n'
      + '');
    const app = createApp({ data: {
      repoRoot, readCommits: async () => ({ commits: context.commits }),
      listTestFiles: async () => context.testFiles,
    } });
    const post = (body: object) => request(app).post('/api/chat').set('Host', '127.0.0.1:3001')
      .set('Origin', 'http://127.0.0.1:3001').set('Content-Type', 'application/json').send(body);
    for (const [message, expected] of [
      ['please run the tests', unsupported],
      [LOCAL_SUGGESTIONS[0], 'Pending tasks: 1\n- Dashboard pending'],
      [LOCAL_SUGGESTIONS[1], '- Dashboard current'],
      [LOCAL_SUGGESTIONS[2], 'abcdef1 Add local answers'],
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
    const suggestions = await request(app).get('/api/chat/suggestions')
      .set('Host', '127.0.0.1:3001');
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

