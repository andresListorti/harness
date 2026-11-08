export function parseDuration(text: string): number | null {
  const match = /^\s*(?:(\d+)\s*h\s*)?(?:(\d+)\s*m\s*)?(?:(\d+)\s*s\s*)?$/i.exec(text);
  if (!match || match.slice(1).every(value => value === undefined)) return null;
  const seconds = Number(match[1] ?? 0) * 3600
    + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) ? seconds : null;
}
