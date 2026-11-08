// @vitest-environment node
import { expect, test } from 'vitest';
import { buildGalaxy, type GalaxyInput } from '../../server/data/galaxy';
import { galaxySchema, type Commit, type PlanTask, type RunLogEntry } from '../../shared/api';

const task = (column: PlanTask['column']): PlanTask => ({
  id: 'task', title: 'Task', group: null, goal: '', files: '', definitionOfDone: '', result: null, column,
});
const entry = (attempts: number | null = null, notes: string[] = []): RunLogEntry => ({
  model: null, durationSeconds: null,
  id: '1', title: 'Task', branch: null, attempts, result: null, notes,
});
const commit = (index: number): Commit => ({
  hash: `abcdef123456${index}`, subject: `Commit ${index}`, date: '2026-01-01T00:00:00Z',
});
function galaxy(input: Partial<GalaxyInput> = {}) {
  const result = buildGalaxy({ tasks: [], runLog: [], commits: [], testFiles: [], ...input });
  expect(galaxySchema.safeParse(result).success).toBe(true);
  return result.nodes;
}

test('returns exactly six nodes in order with their labels and kinds', () => {
  expect(galaxy().map(({ id, label, kind }) => ({ id, label, kind }))).toEqual([
    { id: 'harness', label: 'Harness', kind: 'core' },
    { id: 'claude-code', label: 'Claude Code', kind: 'agent' },
    { id: 'codex', label: 'Codex', kind: 'agent' },
    { id: 'tasks', label: 'Tasks', kind: 'system' },
    { id: 'commits', label: 'Commits', kind: 'system' },
    { id: 'tests', label: 'Tests', kind: 'system' },
  ]);
});

test.each([undefined, 'codex'] as const)('assigns counts and details by role for orchestrator %s', orchestrator => {
  const nodes = galaxy({ orchestrator, runLog: [entry(2), entry(null), entry(4), entry(0)] });
  const swapped = orchestrator === 'codex';
  expect(nodes[0]).toMatchObject({ role: null, count: null, details: [
    `Orchestrator: ${swapped ? 'Codex' : 'Claude Code'}`,
    `Worker: ${swapped ? 'Claude Code' : 'Codex'}`,
  ] });
  expect(nodes[swapped ? 2 : 1]).toMatchObject({
    role: 'orchestrator', count: 4, details: ['Role: orchestrator', 'Tasks orchestrated: 4'],
  });
  expect(nodes[swapped ? 1 : 2]).toMatchObject({
    role: 'worker', count: 6, details: ['Role: worker', 'Attempts recorded: 6'],
  });
});

test('counts tasks by column', () => {
  expect(galaxy({ tasks: [task('pending'), task('pending'), task('in_progress'), task('done')] })[3])
    .toMatchObject({ role: null, count: 4, details: ['Pending: 2', 'In progress: 1', 'Done: 1'] });
});

test('limits commit details to five subjects in given order with seven-character hashes', () => {
  expect(galaxy({ commits: Array.from({ length: 7 }, (_, index) => commit(index)) })[4])
    .toMatchObject({ role: null, count: 7, details: [
      'abcdef1 Commit 0', 'abcdef1 Commit 1', 'abcdef1 Commit 2', 'abcdef1 Commit 3', 'abcdef1 Commit 4',
    ] });
});

test('counts test files and uses the last matching note across entries', () => {
  expect(galaxy({ testFiles: ['first.test.ts', 'second.test.ts'], runLog: [
    entry(null, ['npm test passed (2 files, 55 tests)', '60 tests passed']),
    entry(null, ['Passed 71 TESTS', 'Later: 1 test passed', 'No recorded result']),
    entry(null, ['Still no result']),
  ] })[5]).toMatchObject({ role: null, count: 2, details: ['Test files: 2', 'Last recorded run: 1 tests'] });
});

test('omits the recorded run when no note matches', () => {
  expect(galaxy({ testFiles: ['suite.test.ts'], runLog: [entry(null, ['npm test passed', '2 files'])] })[5])
    .toMatchObject({ count: 1, details: ['Test files: 1'] });
});

test('handles empty input with zero counts and empty commit details', () => {
  const nodes = galaxy();
  expect(nodes.map(node => node.count)).toEqual([null, 0, 0, 0, 0, 0]);
  expect(nodes.map(node => node.details)).toEqual([
    ['Orchestrator: Claude Code', 'Worker: Codex'],
    ['Role: orchestrator', 'Tasks orchestrated: 0'],
    ['Role: worker', 'Attempts recorded: 0'],
    ['Pending: 0', 'In progress: 0', 'Done: 0'],
    [],
    ['Test files: 0'],
  ]);
});
