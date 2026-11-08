import { useState } from 'react';
import { Sidebar, VIEWS, type ViewId } from './components/Sidebar';
import { useAgentStatus } from './hooks/useAgentStatus';
import { HomeView } from './views/HomeView';
import { AgentsView } from './views/AgentsView';
import { GalaxyView } from './views/GalaxyView';
import './App.css';

export default function App() {
  const [view, setView] = useState<ViewId>('harness');
  const [collapsed, setCollapsed] = useState(false);
  const agentStatus = useAgentStatus();

  return <div className="app-shell">
    <Sidebar view={view} onNavigate={setView} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(value => !value)} agentStatus={agentStatus} />
    <main className="app-main">
      {view === 'harness' ? <HomeView /> : view === 'agents' ? <AgentsView /> : view === 'galaxy' ? <GalaxyView /> : <>
        <h1 className="section-title">{VIEWS.find(item => item.id === view)?.label}</h1>
        <p className="eyebrow">Coming up in this milestone</p>
      </>}
    </main>
  </div>;
}

