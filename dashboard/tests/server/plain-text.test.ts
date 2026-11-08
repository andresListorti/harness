// @vitest-environment node
import { expect, test } from 'vitest';
import { toPlainText } from '../../server/data/plain-text';

const cases = [
  ['**bold** and __strong__', 'bold and strong'],
  ['task_name_x and task__name__x', 'task_name_x and task__name__x'],
  ['Read `file.ts` then ``call()`` now.', 'Read file.ts then call() now.'],
  ['``a ` b``', 'a ` b'],
  ['```ts\nconst x = 1;\n```\nNext', 'const x = 1;\nNext'],
  ['````\ncode\n````', 'code\n'],
  ['[label](url) and ![alt](url)', 'label and alt'],
  ['# Heading\n## Second\n> Quote\n- item', 'Heading\nSecond\nQuote\n- item'],
  ['*.test.ts and *.test.tsx with *one* and _one_', '*.test.ts and *.test.tsx with *one* and _one_'],
  ['<b>bold</b>', '<b>bold</b>'],
  ['**open and __open and `open', '**open and __open and `open'],
  ['```ts\ncode', '```ts\ncode'],
  ['[label](unfinished', '[label](unfinished'],
  ['  plain  text\n\nnext\tline ', '  plain  text\n\nnext\tline '],
  ['', ''],
  ['**Attempt 1:** Codex wrote `server/data/git.ts`: `getRepoRoot()` and `readCommits(repoDir, limit)`.',
    'Attempt 1: Codex wrote server/data/git.ts: getRepoRoot() and readCommits(repoDir, limit).'],
  ['# # Nested\n> > quote\n**__both__**', 'Nested\nquote\nboth'],
];

test.each(cases)('converts supported markers in %j', (input, expected) => {
  expect(toPlainText(input)).toBe(expected);
});

test('keeps HTML-looking text literal, including angle brackets', () => {
  const text = '<' + 'img src=x onerror=alert(1)>';
  expect(toPlainText(text)).toBe(text);
  expect(toPlainText(text)).toContain('<');
  expect(toPlainText(text)).toContain('>');
});

test.each(cases)('is idempotent for %j', input => {
  const plain = toPlainText(input);
  expect(toPlainText(plain)).toBe(plain);
});
