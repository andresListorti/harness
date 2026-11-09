import { useEffect, useState } from 'react';
import type { AgentStatus } from '../hooks/useAgentStatus';
import './Sidebar.css';
import { VoiceControls } from './VoiceControls';

export type ViewId = 'harness' | 'agents' | 'galaxy' | 'plan' | 'settings';
export const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'harness', label: 'Harness' },
  { id: 'agents', label: 'Agents' },
  { id: 'galaxy', label: 'Galaxy' },
  { id: 'plan', label: 'Plan' },
  { id: 'settings', label: 'Settings' },
];

const paths = {
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  harness: 'M4 10 12 3l8 7v10h-6v-6h-4v6H4Z',
  agents: 'M8 4h8v7H8ZM4 20v-3a5 5 0 0 1 5-3h6a5 5 0 0 1 5 3v3M3 6h2m14 0h2',
  galaxy: 'M12 3v3m0 12v3M3 12h3m12 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  plan: 'M8 5h12M8 12h12M8 19h12M3 5h1m-1 7h1m-1 7h1',
  menu: 'm14 6-6 6 6 6',
  fullscreen: 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6',
};

function Icon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

type Props = {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  agentStatus: AgentStatus;
};

export function Sidebar({ view, onNavigate, collapsed, onToggleCollapsed, agentStatus }: Props) {
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    } catch {
      // Fullscreen can be unavailable or denied by the browser.
    }
  }

  const statusText = { checking: 'Checking agents', ready: 'Agents ready', offline: 'Agents offline' }[agentStatus];
  const fullscreenText = fullscreen ? 'Exit full screen' : 'Full screen';

  return <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`} aria-label="Dashboard sidebar">
    <div className="sidebar-header">
      <div className="sidebar-brand">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 1v6m0 10v6" /></svg>
        {!collapsed && <span>Harness</span>}
      </div>
      <button type="button" className="sidebar-toggle" aria-label={collapsed ? 'Open menu' : 'Close menu'} aria-expanded={!collapsed} onClick={onToggleCollapsed}><Icon name="menu" /></button>
    </div>
    <nav aria-label="Main navigation">
      {VIEWS.map(({ id, label }) => <button type="button" key={id} className="sidebar-item" aria-label={label} aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
        <Icon name={id} />{!collapsed && <span>{label}</span>}
      </button>)}
    </nav>
    <VoiceControls collapsed={collapsed} />
    <div className="sidebar-footer">
      <div role="status" aria-label={statusText} className="sidebar-status"><span aria-hidden="true" className={`status-dot status-dot--${agentStatus}`} />{!collapsed && <span>{statusText}</span>}</div>
      <button type="button" className="sidebar-item" aria-label={fullscreenText} onClick={() => void toggleFullscreen()}><Icon name="fullscreen" />{!collapsed && <span>{fullscreenText}</span>}</button>
    </div>
  </aside>;
}
