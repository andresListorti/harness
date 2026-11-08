export const EMPTY_VALUE = '—';

export function formatElapsed(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return EMPTY_VALUE;
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole}s`;
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
  return `${Math.floor(whole / 3600)}h ${String(Math.floor(whole % 3600 / 60)).padStart(2, '0')}m`;
}
