import type { AgentCard, Agents, PlanSource, PlanTask, RunLogEntry } from '../../shared/api';

export interface AgentsSource {
  source: PlanSource;
  tasks: PlanTask[];
  runLog: RunLogEntry[];
}

export function buildAgents(sources: AgentsSource[]): Agents {
  const working: AgentCard[] = [];
  const remaining: AgentCard[] = [];

  for (const { source, tasks, runLog } of sources) {
    const history: AgentCard[] = [];
    for (const task of tasks) {
      if (task.column === 'pending') continue;
      const entry = runLog.find(entry => entry.title === task.id);
      const failed = entry?.result != null && entry.result.trim().toLowerCase() !== 'done';
      const card: AgentCard = {
        id: `${source}/${task.id}`,
        task: task.title,
        status: failed ? 'error' : task.column === 'in_progress' ? 'working' : 'done',
        agent: entry?.attempts != null ? 'codex' : null,
        model: entry?.model ?? null,
        elapsedSeconds: entry?.durationSeconds ?? null,
        output: (entry?.notes ?? []).slice(-3).map(note => note.length > 240 ? `${note.slice(0, 239)}…` : note),
      };
      if (card.status === 'working') working.push(card);
      else history.push(card);
    }
    remaining.push(...history.reverse());
  }

  return { agents: [...working, ...remaining] };
}
