// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { buildAgents, type AgentsSource } from '../../server/data/agents';
import { parsePlan } from '../../server/data/plan';
import { parseRunLog } from '../../server/data/runlog';
import { agentCardSchema, agentsSchema, type PlanTask, type RunLogEntry } from '../../shared/api';

const task = (overrides: Partial<PlanTask> = {}): PlanTask => ({
  id: 'task', title: 'Task title', column: 'done', group: null,
  goal: '', files: '', definitionOfDone: '', result: null, ...overrides,
});
const entry = (overrides: Partial<RunLogEntry> = {}): RunLogEntry => ({
  id: '1', title: 'task', branch: null, attempts: null, result: null, notes: [], ...overrides,
});
const source = (overrides: Partial<AgentsSource> = {}): AgentsSource => ({
  source: 'dashboard', tasks: [task()], runLog: [], ...overrides,
});
function agents(sources: AgentsSource[] = []) {
  const result = buildAgents(sources);
  expect(agentsSchema.safeParse(result).success).toBe(true);
  return result.agents;
}

test('empty input and pending tasks produce no cards', () => {
  expect(agents()).toEqual([]);
  expect(agents([source({ tasks: [task({ column: 'pending' })], runLog: [entry({ result: 'Failed' })] })])).toEqual([]);
});

test.each(['in_progress', 'done'] as const)('maps %s without inventing recorded data', column => {
  expect(agents([source({ tasks: [task({ column })] })])).toEqual([{
    id: 'dashboard/task', task: 'Task title', status: column === 'in_progress' ? 'working' : 'done',
    agent: null, model: null, elapsedSeconds: null, output: [],
  }]);
});

test.each(['in_progress', 'done'] as const)('a recorded failure overrides %s', column => {
  expect(agents([source({ tasks: [task({ column })], runLog: [entry({ result: 'Failed' })] })])[0].status).toBe('error');
});

test.each([null, 'Done', ' dOnE '])('result %s preserves the plan status', result => {
  for (const column of ['in_progress', 'done'] as const) {
    expect(agents([source({ tasks: [task({ column })], runLog: [entry({ result })] })])[0].status)
      .toBe(column === 'in_progress' ? 'working' : 'done');
  }
});

test.each([null, 0, 2])('identifies Codex only from non-null attempts: %s', attempts => {
  const [card] = agents([source({ runLog: [entry({ attempts })] })]);
  expect(card.agent).toBe(attempts === null ? null : 'codex');
  expect(card.model).toBeNull();
  expect(card.elapsedSeconds).toBeNull();
});

test('matches task id exactly, never the display title or a partial id', () => {
  expect(agents([source({ runLog: [
    entry({ title: 'Task title', attempts: 1, result: 'Failed', notes: ['wrong'] }),
    entry({ title: 'task-extra', attempts: 1, result: 'Failed' }),
    entry({ title: 'TASK', attempts: 1, result: 'Failed' }),
  ] })])[0]).toMatchObject({ status: 'done', agent: null, output: [] });
});

test('keeps the last three notes in order and truncates only notes longer than 240 characters', () => {
  const notes = ['discarded', 'recent', 'a'.repeat(240), 'b'.repeat(241)];
  const input = [source({ runLog: [entry({ notes })] })];
  const before = structuredClone(input);
  expect(agents(input)[0].output).toEqual(['recent', 'a'.repeat(240), `${'b'.repeat(239)}…`]);
  expect(input).toEqual(before);
});

test('orders working cards first, preserving source order and reversing each source history', () => {
  const tasks = [
    task({ id: 'old' }), task({ id: 'active-1', column: 'in_progress' }),
    task({ id: 'failed', column: 'in_progress' }), task({ id: 'new' }),
    task({ id: 'active-2', column: 'in_progress' }),
  ];
  const runLog = [entry({ title: 'failed', result: 'Failed' })];
  expect(agents([
    source({ tasks, runLog }), source({ source: 'example-app', tasks, runLog }),
  ]).map(card => card.id)).toEqual([
    'dashboard/active-1', 'dashboard/active-2', 'example-app/active-1', 'example-app/active-2',
    'dashboard/new', 'dashboard/failed', 'dashboard/old',
    'example-app/new', 'example-app/failed', 'example-app/old',
  ]);
});

test('keeps equal task ids distinct and run-log matches scoped to their source', () => {
  expect(agents([source({ runLog: [entry({ attempts: 1 })] }), source({ source: 'example-app' })])
    .map(({ id, agent }) => ({ id, agent }))).toEqual([
    { id: 'dashboard/task', agent: 'codex' }, { id: 'example-app/task', agent: null },
  ]);
});

test('builds validated historical cards from the real plans and run log', async () => {
  const [dashboardPlan, examplePlan, log] = await Promise.all([
    readFile(new URL('../../PLAN.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../example-app/PLAN.md', import.meta.url), 'utf8'),
    readFile(new URL('../../../docs/run-log.md', import.meta.url), 'utf8'),
  ]);
  const cards = agents([
    source({ tasks: parsePlan(dashboardPlan, 'dashboard').tasks, runLog: parseRunLog(log, 'dashboard').entries }),
    source({ source: 'example-app', tasks: parsePlan(examplePlan, 'example-app').tasks,
      runLog: parseRunLog(log, 'example-app').entries }),
  ]);
  for (const card of cards) {
    expect(agentCardSchema.safeParse(card).success).toBe(true);
    expect(card.model).toBeNull();
    expect(card.elapsedSeconds).toBeNull();
  }
  const setup = cards.find(card => card.id === 'example-app/project-setup');
  expect(setup).toMatchObject({ status: 'done', agent: 'codex' });
  expect(setup?.output.length).toBeGreaterThan(0);
});
