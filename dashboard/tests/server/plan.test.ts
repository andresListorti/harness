// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parsePlan } from '../../server/data/plan';
import { planBoardSchema } from '../../shared/api';

test('extracts trimmed fields and validates the board', () => {
  const board = parsePlan(`## Pending
###  task-one  
- **Goal:**  Build it  
- **Files:**  plan.ts  
- **Definition of done:**  Tests pass  
- **Result:**  Complete  
`, 'dashboard');
  expect(board).toEqual({ source: 'dashboard', tasks: [{
    id: 'task-one', title: 'task-one', group: null, column: 'pending',
    goal: 'Build it', files: 'plan.ts', definitionOfDone: 'Tests pass', result: 'Complete',
  }] });
  expect(planBoardSchema.safeParse(board).success).toBe(true);
});

test('defaults missing fields and result', () => {
  expect(parsePlan(`## Pending
### minimal
- **Files:** one.ts
`, 'dashboard').tasks[0]).toMatchObject({
    goal: '', files: 'one.ts', definitionOfDone: '', result: null,
  });
});

test('maps all three columns with trimmed, case-insensitive names in document order', () => {
  const board = parsePlan(`##  pEnDiNg  
### first
- **Goal:** one
## IN PROGRESS
### second
- **Goal:** two
## done
### third
- **Goal:** three
`, 'dashboard');
  expect(board.tasks.map(({ id, column }) => [id, column])).toEqual([
    ['first', 'pending'], ['second', 'in_progress'], ['third', 'done'],
  ]);
});

test('empty and _None._ columns yield no tasks', () => {
  expect(parsePlan(`## Pending
_None._
## In progress
## Done
_None._
`, 'dashboard').tasks).toEqual([]);
});

test('applies and replaces groups, leaving earlier tasks ungrouped and resetting at columns', () => {
  const board = parsePlan(`## Pending
### before
- **Goal:** first
### Milestone 1
Some group description.
### grouped
- **Goal:** second
### also-grouped
- **Result:** third
### Milestone 2
### next-group
- **Files:** four.ts
## Done
### finished
- **Goal:** last
`, 'dashboard');
  expect(board.tasks.map(({ id, group }) => [id, group])).toEqual([
    ['before', null], ['grouped', 'Milestone 1'], ['also-grouped', 'Milestone 1'],
    ['next-group', 'Milestone 2'], ['finished', null],
  ]);
});

test('excludes Phase 2 and other level-2 sections', () => {
  const board = parsePlan(`## Done
### included
- **Goal:** yes
## Phase 2: real agent execution
### run-audit-log
- **Goal:** excluded
## Pending
### pending-task
- **Goal:** yes
## Closing a milestone
### instructions
- **Goal:** excluded
`, 'dashboard');
  expect(board.tasks.map(task => task.id)).toEqual(['included', 'pending-task']);
});

test('normalizes CRLF', () => {
  const markdown = `## Done
### task
- **Goal:** works
`;
  expect(parsePlan(markdown.replace(/\n/g, '\r\n'), 'dashboard'))
    .toEqual(parsePlan(markdown, 'dashboard'));
});

test.each(['', 'garbage\n- **Goal:** no task', '## Unknown\n### task\n- **Goal:** ignored'])
  ('returns an empty board without throwing for %j', markdown => {
    expect(() => parsePlan(markdown, 'dashboard')).not.toThrow();
    expect(parsePlan(markdown, 'dashboard')).toEqual({ source: 'dashboard', tasks: [] });
  });

test('skips empty task headings', () => {
  expect(parsePlan(`## Pending
###   
- **Goal:** ignored
`, 'dashboard').tasks).toEqual([]);
});

test('joins indented and plain field continuations and stops at other bullets or headings', () => {
  const board = parsePlan(`## Pending
### multiline
- **Goal:** first
  second
third
- **Files:**
  one.ts
two.ts
- unrelated bullet
ignored text
- **Definition of done:** passes
#### Details
not a continuation
- **Result:** done
  verified
`, 'dashboard');
  expect(board.tasks[0]).toMatchObject({
    goal: 'first second third', files: 'one.ts two.ts',
    definitionOfDone: 'passes', result: 'done verified',
  });
});

test('parses the real dashboard plan', () => {
  const markdown = readFileSync(new URL('../../PLAN.md', import.meta.url), 'utf8');
  expect(() => parsePlan(markdown, 'dashboard')).not.toThrow();
  const board = parsePlan(markdown, 'dashboard');
  expect(planBoardSchema.safeParse(board).success).toBe(true);
  expect(board.tasks).toContainEqual(expect.objectContaining({ id: 'scaffold', column: 'done' }));
  expect(board.tasks.some(task => task.id === 'run-audit-log')).toBe(false);
});

test('parses the real example-app plan with all tasks done', () => {
  const markdown = readFileSync(new URL('../../../example-app/PLAN.md', import.meta.url), 'utf8');
  const board = parsePlan(markdown, 'example-app');
  expect(planBoardSchema.safeParse(board).success).toBe(true);
  expect(board.tasks.length).toBeGreaterThan(0);
  expect(board.tasks.every(task => task.column === 'done')).toBe(true);
  expect(board.tasks.some(task => task.column === 'pending')).toBe(false);
});
