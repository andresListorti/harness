import type { Commit, PlanTask, RunLogEntry } from '../../shared/api';
import { toPlainText } from '../data/plain-text';

export const CAPABILITY_NOTICE = "This chat can't run agents or change files. "
  + "Known questions are answered from this repo's plan, run log, and git history, with no agent; "
  + 'other questions go to the orchestrator (Claude Code) when it is selected.';

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
  return resolveLocally(message, context).reply;
}

export function resolveLocally(message: string, context: LocalContext): { reply: string; recognized: boolean } {
  const reply = buildReply(message, context);
  return { reply: toPlainText(reply ?? helpReply("I didn't understand that.")), recognized: reply !== undefined };
}

function buildReply(message: string, context: LocalContext): string | undefined {
  const normalized = message.trim().toLowerCase()
    .replace(/\s+/g, ' ').replace(/[\p{P}]+$/u, '').trim();
  if (isAction(normalized)) return helpReply("I can't do that.");
  const matches = (...phrases: string[]) => phrases.some(phrase => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, ' +');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}s?(?![\\p{L}\\p{N}_])`, 'u')
      .test(normalized);
  });
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
  if (matches('commit', 'git log')) {
    return context.commits.slice(0, 5)
      .map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`).join('\n')
      || 'No commits found.';
  }
  if (matches('latest run', 'last run', 'latest task', 'last task', 'run log', 'run the log')) {
    const entry = context.runLog.at(-1);
    if (!entry) return 'No runs are recorded yet.';
    const lines = [`${entry.id}. ${entry.title}`];
    if (entry.result !== null) lines.push(`Result: ${entry.result}`);
    if (entry.attempts !== null) lines.push(`Codex attempts: ${entry.attempts}`);
    if (entry.notes.length) lines.push(entry.notes[entry.notes.length - 1]);
    return lines.join('\n');
  }
  if (matches('in progress', 'current', 'currently', 'working on', 'now')) {
    return context.inProgress.map(task => `- ${task.title}`).join('\n')
      || 'Nothing is in progress right now.';
  }
  const asksToDo = /(?<![\p{L}\p{N}_])(?<!\bhow )to do(?=$| (?:list|items?)(?![\p{L}\p{N}_]))/u
    .test(normalized);
  if (matches('pending', 'next', 'todo', 'remaining', 'left') || asksToDo) {
    const count = context.pending.length;
    if (!count) return 'No tasks are pending.';
    const lines = [
      `Pending tasks: ${count}`, ...context.pending.slice(0, 8).map(task => `- ${task.title}`),
    ];
    if (count > 8) lines.push(`...and ${count - 8} more`);
    return lines.join('\n');
  }
  return undefined;
}

export function codexFreeTextReply(): string {
  const suggestions = LOCAL_SUGGESTIONS.map(question => `- ${question}`).join('\n');
  return 'With Codex as the orchestrator, free-text questions are not sent to a model (see Why?).'
    + `\nI can answer:\n${suggestions}`;
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

