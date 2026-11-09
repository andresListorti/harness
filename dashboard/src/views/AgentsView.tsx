import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AgentCard } from '../../shared/api';
import { api, ApiError } from '../lib/api';
import { EMPTY_VALUE, formatElapsed } from '../lib/format';
import { usePolling } from '../hooks/usePolling';
import './AgentsView.css';

const statuses = { working: 'Working', done: 'Done', error: 'Error' };
const agentNames = { 'claude-code': 'Claude Code', codex: 'Codex' };
const layouts = [
  { columns: 1, text: '1', label: '1 per page' },
  { columns: 2, text: '2×2', label: '2 by 2' },
  { columns: 3, text: '3×3', label: '3 by 3' },
];

export function AgentsView({ client = api }: { client?: Pick<typeof api, 'getAgents'> }) {
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState(2);
  const [page, setPage] = useState(1);
  const request = useRef(0);
  const pageSize = columns * columns;
  const pages = Math.max(1, Math.ceil(agents.length / pageSize));
  const currentPage = Math.min(page, pages);

  const fetchData = useCallback(async (silent = false) => {
    const current = ++request.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await client.getAgents();
      if (current !== request.current) return;
      setAgents(result.agents);
      setError(null);
    } catch (cause) {
      if (current !== request.current) return;
      if (!silent) setError(cause instanceof ApiError ? `Could not load agents: ${cause.message}` : 'Could not load agents.');
    } finally {
      if (!silent && current === request.current) setLoading(false);
    }
  }, [client]);

  const load = useCallback(() => fetchData(), [fetchData]);
  const refresh = useCallback(() => fetchData(true), [fetchData]);
  usePolling(refresh, 5000, !loading && error === null);

  useEffect(() => { setPage(previous => Math.min(previous, pages)); }, [pages]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  return <section className="agents-view">
    <header className="agents-header">
      <div><h1 className="section-title">Agents</h1><p className="eyebrow">History from the plan and run log</p></div>
      <div className="agents-controls">
        <button type="button" onClick={() => void load()}>Refresh</button>
        <div className="agents-layout" role="group" aria-label="Grid layout">
          {layouts.map(layout => <button type="button" key={layout.columns} aria-label={layout.label} aria-pressed={columns === layout.columns} onClick={() => { setColumns(layout.columns); setPage(1); }}>{layout.text}</button>)}
        </div>
      </div>
    </header>
    {loading ? <p aria-busy="true">Loading agents…</p> : error ? <div>
      <p className="agents-error" role="alert">{error}</p>
      <button type="button" onClick={() => void load()}>Try again</button>
    </div> : !agents.length ? <p>No agent activity recorded yet.</p> : <>
      <div className="agents-grid" data-columns={columns} style={{ '--agents-columns': columns } as CSSProperties}>
        {agents.slice((currentPage - 1) * pageSize, currentPage * pageSize).map(agent => <article className="agent-card" key={agent.id} aria-label={agent.task}>
          <p className="eyebrow">{agent.id.split('/')[0]}</p>
          <h3>{agent.task}</h3>
          <span className={`agent-status agent-status--${agent.status}`}>{statuses[agent.status]}</span>
          <dl>
            <div><dt>Agent</dt><dd>{agent.agent === null ? EMPTY_VALUE : agentNames[agent.agent]}</dd></div>
            {agent.model !== null && <div><dt>Model</dt><dd>{agent.model}</dd></div>}
            {agent.elapsedSeconds !== null && <div>
              <dt>Time</dt><dd>{formatElapsed(agent.elapsedSeconds)}</dd>
            </div>}
          </dl>
          <pre
            className="mono agent-output"
            title={agent.output.length ? agent.output.join('\n') : undefined}
          >{agent.output.length ? agent.output.join('\n') : EMPTY_VALUE}</pre>
        </article>)}
      </div>
      {pages > 1 && <nav className="agents-pagination" aria-label="Agent pages">
        <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {pages}</span>
        <button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </>}
  </section>;
}
