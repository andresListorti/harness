import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlanSource, PlanTask, RunLogEntry } from '../../shared/api';
import { api, ApiError } from '../lib/api';
import { EMPTY_VALUE } from '../lib/format';
import './PlanView.css';

const columns = [
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
] as const;

function TaskCard({ task }: { task: PlanTask }) {
  return <article className={`plan-card plan-card--${task.column}`} aria-label={task.title}>
    <h3>{task.title}</h3>
    {task.column === 'done' && <span className="plan-done">Done</span>}
    <p>{task.goal}</p>
    <details>
      <summary>Details</summary>
      <dl>
        <div><dt>Files</dt><dd>{task.files}</dd></div>
        <div><dt>Definition of done</dt><dd>{task.definitionOfDone}</dd></div>
        {task.result !== null && <div><dt>Result</dt><dd>{task.result}</dd></div>}
      </dl>
    </details>
  </article>;
}

export function PlanView({ client = api }: { client?: Pick<typeof api, 'getPlan' | 'getRunLog'> }) {
  const [source, setSource] = useState<PlanSource>('dashboard');
  const [tasks, setTasks] = useState<PlanTask[]>([]);
  const [entries, setEntries] = useState<RunLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [plan, log] = await Promise.all([client.getPlan(source), client.getRunLog(source)]);
      if (current !== request.current) return;
      setTasks(plan.tasks);
      setEntries(log.entries);
    } catch (cause) {
      if (current !== request.current) return;
      setError(cause instanceof ApiError ? `Could not load plan: ${cause.message}` : 'Could not load plan.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [client, source]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  return <section className="plan-view">
    <header className="plan-header">
      <div><h1 className="section-title">Plan</h1><p className="eyebrow">Tasks and run history</p></div>
      <div className="plan-controls">
        <button type="button" onClick={() => void load()}>Refresh</button>
        <div role="group" aria-label="Plan source" className="plan-controls">
          {(['dashboard', 'example-app'] as const).map(value => <button
            type="button" key={value} aria-pressed={source === value}
            onClick={() => setSource(value)}
          >{value === 'dashboard' ? 'Dashboard' : 'Example app'}</button>)}
        </div>
      </div>
    </header>
    {loading ? <p aria-busy="true">Loading plan…</p> : error ? <div>
      <p className="plan-error" role="alert">{error}</p>
      <button type="button" onClick={() => void load()}>Try again</button>
    </div> : <>
      <div className="plan-board">
        {columns.map(column => {
          const columnTasks = tasks.filter(task => task.column === column.id);
          const groups = [...new Set(columnTasks.map(task => task.group).filter(group => group !== null))];
          return <section className="plan-column" key={column.id} aria-label={column.label}>
            <header className="plan-column-header"><h2>{column.label}</h2><span>{columnTasks.length}</span></header>
            {!columnTasks.length ? <p>None</p> : <>
              {columnTasks.filter(task => task.group === null).map(task => <TaskCard key={task.id} task={task} />)}
              {groups.map(group => <div className="plan-task-group" key={group}>
                <h3 className="eyebrow">{group}</h3>
                {columnTasks.filter(task => task.group === group).map(task => <TaskCard key={task.id} task={task} />)}
              </div>)}
            </>}
          </section>;
        })}
      </div>
      <section aria-label="Run log" className="plan-run-log">
        <h2>Run log</h2>
        {!entries.length ? <p>No runs recorded yet.</p> : [...entries].reverse().map(entry => <details className="plan-run" key={entry.id}>
          <summary>
            <span>{entry.id}. {entry.title}</span>{' '}
            <span>{entry.result ?? EMPTY_VALUE}</span>{' '}
            {entry.attempts !== null && <span>{entry.attempts} {entry.attempts === 1 ? 'attempt' : 'attempts'}</span>}
          </summary>
          <p className="mono">{entry.branch ?? EMPTY_VALUE}</p>
          <ul>{entry.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </details>)}
      </section>
    </>}
  </section>;
}
