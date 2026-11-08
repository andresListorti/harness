// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { parseRunLog } from '../../server/data/runlog';
import { runLogSchema } from '../../shared/api';

test('extracts trimmed table values and notes and validates the output', () => {
  const log = parseRunLog(`## 1. project-setup  
| | |
|---|---|
| bRaNcH | \`task/setup\` |
| CODEX ATTEMPTS | 2 attempts |
| result | \`Done\` |
Ignored prose.
- First note  
- Second note
`, 'example-app');
  expect(log).toEqual({ source: 'example-app', entries: [{
    id: '1', title: 'project-setup', branch: 'task/setup', attempts: 2,
    result: 'Done', notes: ['First note', 'Second note'],
  }] });
  expect(runLogSchema.safeParse(log).success).toBe(true);
});

test('preserves results other than Done', () => {
  expect(parseRunLog('## D1. failed\n| Result | Failed |', 'dashboard').entries[0].result)
    .toBe('Failed');
});

test('defaults missing rows to null', () => {
  expect(parseRunLog('## 1. minimal', 'example-app').entries[0]).toEqual({
    id: '1', title: 'minimal', branch: null, attempts: null, result: null, notes: [],
  });
});

test.each(['unknown', '', '-2', '9'.repeat(400)])('handles empty values and invalid attempts %j', attempts => {
  const log = parseRunLog(`## 1. invalid
| Branch | \`\` |
| Codex attempts | ${attempts} |
| Result | |
`, 'example-app');
  expect(log.entries[0]).toMatchObject({ branch: null, attempts: null, result: null });
  expect(runLogSchema.safeParse(log).success).toBe(true);
});

test('splits numeric and dashboard entries in document order', () => {
  const markdown = '## 1. first\n## D1. dashboard-first\n## 2. second\n## D2. dashboard-second';
  for (const source of ['example-app', 'dashboard'] as const) {
    const log = parseRunLog(markdown, source);
    expect(log.entries.map(entry => entry.id)).toEqual(source === 'dashboard' ? ['D1', 'D2'] : ['1', '2']);
    expect(runLogSchema.safeParse(log).success).toBe(true);
  }
});

test('non-entry level-2 sections end entries and do not leak notes or rows', () => {
  const log = parseRunLog(`## Environment note: setup
- ignored before
## 1. first
- included
## Environment steps summary
- ignored after
| Branch | task/ignored |
## 2. second
- next
`, 'example-app');
  expect(log.entries.map(entry => entry.notes)).toEqual([['included'], ['next']]);
  expect(log.entries.every(entry => entry.branch === null)).toBe(true);
});

test('normalizes CRLF', () => {
  const markdown = '## D1. setup\n| Branch | `task/setup` |\n- note\n  continued\n';
  expect(parseRunLog(markdown.replace(/\n/g, '\r\n'), 'dashboard'))
    .toEqual(parseRunLog(markdown, 'dashboard'));
});

test.each(['', 'garbage\n- ignored', '## Unknown\n- ignored', '## 1.   \n- ignored'])
  ('returns no entries without throwing for %j', markdown => {
    expect(() => parseRunLog(markdown, 'dashboard')).not.toThrow();
    expect(parseRunLog(markdown, 'dashboard')).toEqual({ source: 'dashboard', entries: [] });
  });

test('joins indented continuations and stops at prose, tables, and other bullets', () => {
  const log = parseRunLog(`## 1. multiline
- first
  second
    third
- next
plain ignored
  also ignored
- last
| Other | ignored |
  ignored after table
`, 'example-app');
  expect(log.entries[0].notes).toEqual(['first second third', 'next', 'last']);
});

test('parses and validates both sources from the real run log', () => {
  const markdown = readFileSync(new URL('../../../docs/run-log.md', import.meta.url), 'utf8');
  const example = parseRunLog(markdown, 'example-app');
  expect(example.entries).toHaveLength(10);
  expect(example.entries[0]).toMatchObject({ id: '1', title: 'project-setup' });
  expect(example.entries.at(-1)?.id).toBe('10');
  expect(example.entries.every(entry => entry.branch !== null)).toBe(true);
  const dashboard = parseRunLog(markdown, 'dashboard');
  expect(dashboard.entries.some(entry => entry.id.startsWith('D'))).toBe(true);
  expect(dashboard.entries.some(entry => entry.id === 'D1')).toBe(true);
  for (const log of [example, dashboard]) {
    expect(runLogSchema.safeParse(log).success).toBe(true);
  }
});
