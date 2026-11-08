import type { AgentId, Commit, Galaxy, GalaxyNode, PlanTask, RunLogEntry } from '../../shared/api';

export interface GalaxyInput {
  orchestrator?: AgentId;
  tasks: PlanTask[];
  runLog: RunLogEntry[];
  commits: Commit[];
  testFiles: string[];
}

export function buildGalaxy({ orchestrator = 'claude-code', tasks, runLog, commits, testFiles }: GalaxyInput): Galaxy {
  const labels: Record<AgentId, string> = { 'claude-code': 'Claude Code', codex: 'Codex' };
  const worker = orchestrator === 'claude-code' ? 'codex' : 'claude-code';
  const attempts = runLog.reduce((total, entry) => total + (entry.attempts ?? 0), 0);
  const agentNode = (id: AgentId): GalaxyNode => {
    const role = id === orchestrator ? 'orchestrator' : 'worker';
    const count = role === 'orchestrator' ? runLog.length : attempts;
    return {
      id, label: labels[id], kind: 'agent', role, count,
      details: [`Role: ${role}`, `${role === 'orchestrator' ? 'Tasks orchestrated' : 'Attempts recorded'}: ${count}`],
    };
  };

  const columns = { pending: 0, in_progress: 0, done: 0 };
  for (const task of tasks) columns[task.column]++;

  const testDetails = [`Test files: ${testFiles.length}`];
  let lastRecorded: string | undefined;
  for (const entry of runLog) {
    for (const note of entry.notes) {
      const match = /(\d+)\s+tests?\b/i.exec(note);
      if (match) lastRecorded = match[1];
    }
  }
  if (lastRecorded !== undefined) testDetails.push(`Last recorded run: ${lastRecorded} tests`);

  return { nodes: [
    {
      id: 'harness', label: 'Harness', kind: 'core', role: null, count: null,
      details: [`Orchestrator: ${labels[orchestrator]}`, `Worker: ${labels[worker]}`],
    },
    agentNode('claude-code'),
    agentNode('codex'),
    {
      id: 'tasks', label: 'Tasks', kind: 'system', role: null, count: tasks.length,
      details: [`Pending: ${columns.pending}`, `In progress: ${columns.in_progress}`, `Done: ${columns.done}`],
    },
    {
      id: 'commits', label: 'Commits', kind: 'system', role: null, count: commits.length,
      details: commits.slice(0, 5).map(commit => `${commit.hash.slice(0, 7)} ${commit.subject}`),
    },
    { id: 'tests', label: 'Tests', kind: 'system', role: null, count: testFiles.length, details: testDetails },
  ] };
}
