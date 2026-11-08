import type { Commit, PlanTask, RunLogEntry } from '../../shared/api';
import { toPlainText } from '../data/plain-text';

export const LOCAL_SUGGESTIONS: readonly string[] = [
  'What is pending?',
  'What is in progress?',
  'Show the latest commits',
  'What was the latest run?',
  'How are the tests?',
];

export interface LocalContext {
  pending: PlanTask[];
  inProgress: PlanTask[];
  runLog: RunLogEntry[];
  commits: Commit[];
  testFiles: string[];
}

export function answerLocally(message: string, context: LocalContext): string {
  return toPlainText(buildReply(message, context));
}

function buildReply(message: string, context: LocalContext): string {
  const normalized = message.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[\p{P}]+$/u, '').trim();
  const includes = (...phrases: string[]) => phrases.some(phrase => normalized.includes(phrase));
  if (/\btests?\b/.test(normalized)) {
    let recorded: string | undefined;
    for (const entry of context.runLog) {
      for (const note of entry.notes) {
        const match = /(\d+)\s+tests?\b/i.exec(note);
        if (match) recorded = match[1];
      }
    }
    return `Tracked test files: ${context.testFiles.length}\n${recorded === undefined
      ? 'No run result is recorded.' : `Last recorded run: ${recorded} tests`}`;
  }
  if (includes('commit', 'git log')) {
    return context.commits.slice(0, 5).map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`).join('\n')
      || 'No commits found.';
  }
  if (includes('latest run', 'last run', 'latest task', 'last task', 'run log')) {
    const entry = context.runLog.at(-1);
    if (!entry) return 'No runs are recorded yet.';
    const lines = [`${entry.id}. ${entry.title}`];
    if (entry.result !== null) lines.push(`Result: ${entry.result}`);
    if (entry.attempts !== null) lines.push(`Codex attempts: ${entry.attempts}`);
    if (entry.notes.length) lines.push(entry.notes[entry.notes.length - 1]);
    return lines.join('\n');
  }
  if (includes('in progress', 'current', 'working on', 'now')) {
    return context.inProgress.map(task => `- ${task.title}`).join('\n') || 'Nothing is in progress right now.';
  }
  if (includes('pending', 'next', 'todo', 'to do', 'remaining', 'left')) {
    const count = context.pending.length;
    if (!count) return 'No tasks are pending.';
    const lines = [`Pending tasks: ${count}`, ...context.pending.slice(0, 8).map(task => `- ${task.title}`)];
    if (count > 8) lines.push(`...and ${count - 8} more`);
    return lines.join('\n');
  }
  return `I can only answer repo questions without an agent yet. Try:\n${LOCAL_SUGGESTIONS.join('\n')}`;
}

