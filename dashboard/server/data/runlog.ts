import type { PlanSource, RunLog, RunLogEntry } from '../../shared/api';

function tableText(value: string): string | null {
  return value.trim().replace(/^`+|`+$/g, '').trim() || null;
}

export function parseRunLog(markdown: string, source: PlanSource): RunLog {
  const log: RunLog = { source, entries: [] };
  if (typeof markdown !== 'string') return log;
  let entry: RunLogEntry | null = null;
  let activeNote = false;

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^##(?:\s|$)/.test(line)) {
      entry = null;
      activeNote = false;
      const heading = /^##\s+(D?\d+)\.\s+(.+)$/.exec(line);
      if (!heading || !heading[2].trim()) continue;
      const [, id, title] = heading;
      if ((id.startsWith('D') ? 'dashboard' : 'example-app') !== source) continue;
      entry = { id, title: title.trim(), branch: null, attempts: null, result: null, notes: [] };
      log.entries.push(entry);
      continue;
    }
    if (!entry) continue;

    const row = /^\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*$/.exec(line);
    if (row) {
      activeNote = false;
      const label = row[1].trim().toLowerCase();
      const value = tableText(row[2]);
      if (label === 'branch') entry.branch = value;
      if (label === 'result') entry.result = value;
      if (label === 'codex attempts') {
        const integer = value?.match(/^\d+/);
        const attempts = integer ? Number(integer[0]) : NaN;
        entry.attempts = Number.isSafeInteger(attempts) ? attempts : null;
      }
      continue;
    }

    const bullet = /^\s*-\s+(.*)$/.exec(line);
    if (bullet) {
      entry.notes.push(bullet[1].trim());
      activeNote = true;
    } else if (activeNote && /^\s+\S/.test(line) && !/^\s*(?:[-+*]\s|\d+[.)]\s|\|)/.test(line)) {
      const index = entry.notes.length - 1;
      entry.notes[index] = [entry.notes[index], line.trim()].filter(Boolean).join(' ');
    } else {
      activeNote = false;
    }
  }
  return log;
}
