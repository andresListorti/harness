import { EMPTY_VALUE, formatElapsed } from '../../src/lib/format';

test.each([
  [0, '0s'], [42, '42s'], [59, '59s'], [60, '1m 00s'], [65, '1m 05s'],
  [3599, '59m 59s'], [3600, '1h 00m'], [3720, '1h 02m'], [7200, '2h 00m'],
  [null, '—'], [-1, '—'], [NaN, '—'], [Infinity, '—'], [-Infinity, '—'], [65.9, '1m 05s'],
])('formats %s as %s', (seconds, expected) => {
  expect(formatElapsed(seconds as number | null)).toBe(expected);
});

test('exports the empty value', () => { expect(EMPTY_VALUE).toBe('—'); });
