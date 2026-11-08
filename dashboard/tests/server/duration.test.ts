// @vitest-environment node
import { expect, test } from 'vitest';
import { parseDuration } from '../../server/data/duration';
import { formatElapsed } from '../../src/lib/format';

test.each([
  ['45s', 45], ['114s', 114], ['1m 54s', 114], ['3m 53s', 233], ['1m', 60],
  ['1h 02m', 3720], ['1h 02m 05s', 3725], ['1h', 3600], ['0s', 0],
  ['  1H  02M  05S  ', 3725], [' 1 m 54 S ', 114],
])('parses %j into %s seconds', (text, seconds) => {
  expect(parseDuration(String(text))).toBe(seconds);
});

test.each([
  '', '   ', '114', '-1s', '1m -2s', 'about 2m', '2 minutes', '1.5s', '1s extra',
  '1s 2m', '1m 2m', '9'.repeat(400) + 's',
])('rejects invalid duration %j', text => {
  expect(parseDuration(text)).toBeNull();
});

test.each([0, 45, 114, 233, 3600, 3725])('round trips formatted duration %s', seconds => {
  expect(parseDuration(formatElapsed(seconds))).toBe(seconds === 3725 ? 3720 : seconds);
});
