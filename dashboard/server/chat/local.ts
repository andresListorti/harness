import type { Commit, PlanTask, RunLogEntry } from '../../shared/api';
import { toPlainText } from '../data/plain-text';

export const CAPABILITY_NOTICE = "In this version I can't run agents or change files. "
  + "I only read this repo's plan, run log, and git history, and answer without an agent.";

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
  const normalized = message.trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/[\p{P}]+$/u, '').trim();
  if (isAction(normalized)) return helpReply("I can't do that.");
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
    return context.commits.slice(0, 5)
      .map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`).join('\n')
      || 'No commits found.';
  }
  if (includes('latest run', 'last run', 'latest task', 'last task', 'run log', 'run the log')) {
    const entry = context.runLog.at(-1);
    if (!entry) return 'No runs are recorded yet.';
    const lines = [`${entry.id}. ${entry.title}`];
    if (entry.result !== null) lines.push(`Result: ${entry.result}`);
    if (entry.attempts !== null) lines.push(`Codex attempts: ${entry.attempts}`);
    if (entry.notes.length) lines.push(entry.notes[entry.notes.length - 1]);
    return lines.join('\n');
  }
  if (includes('in progress', 'current', 'working on', 'now')) {
    return context.inProgress.map(task => `- ${task.title}`).join('\n')
      || 'Nothing is in progress right now.';
  }
  if (includes('pending', 'next', 'todo', 'to do', 'remaining', 'left')) {
    const count = context.pending.length;
    if (!count) return 'No tasks are pending.';
    const lines = [
      `Pending tasks: ${count}`, ...context.pending.slice(0, 8).map(task => `- ${task.title}`),
    ];
    if (count > 8) lines.push(`...and ${count - 8} more`);
    return lines.join('\n');
  }
  return helpReply("I didn't understand that.");
}

function helpReply(introduction: string): string {
  const suggestions = LOCAL_SUGGESTIONS.map(question => `- ${question}`).join('\n');
  return `${introduction} ${CAPABILITY_NOTICE}\nI can answer:\n${suggestions}`;
}

function isAction(message: string): boolean {
  const prefixes = new RegExp('^(?:' + [
    'please', 'pls', 'can you', 'could you', 'would you', 'will you', 'go ahead and',
    'now', 'just', 'i want you to', 'i need you to', "let's", 'lets',
  ].join('|') + ')\\b\\s*');
  let request = message;
  while (prefixes.test(request)) request = request.replace(prefixes, '');
  const verbs = [
    'launch', 'start', 'run', 'execute', 'sp[a]wn', 'kick off', 'deploy', 'merge',
    'push', 'commit', 'delete', 'remove', 'create', 'write', 'edit', 'fix', 'implement',
    'build', 'stop', 'cancel', 'retry', 'restart', 'update', 'change', 'add',
    'install', 'send', 'ask', 'tell', 'make', 'generate', 'test',
  ];
  const verb = new RegExp(`^(?:${verbs.join('|')})\\b\\s*`).exec(request);
  const readOnlyNoun = new RegExp(
    '^(?:(?:the|a|an|my|our)\\s+)?'
    + '(?:log|logs|status|history|result|results|summary|report|count|list|time|duration|'
    + 'errors|error)'
    + '\\b',
  );
  if (verb && !readOnlyNoun.test(request.slice(verb[0].length))) return true;
  const actors = '(?:agents?|codex|claude(?: code)?|orchestrator|worker)';
  const delegation = new RegExp(
    `\\b(?:launch|start|run|sp[a]wn|execute|kick off|ask|tell|use)\\b.*\\b${actors}\\b`,
  );
  const direction = new RegExp(
    '\\b(?:have|let|get|make)\\s+'
    + '(?:codex|claude(?: code)?|the agent|the worker|the orchestrator)\\b',
  );
  return delegation.test(message) || direction.test(message);
}

