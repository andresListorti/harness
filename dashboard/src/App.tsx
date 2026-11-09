import { useState } from 'react';
import { Sidebar, type ViewId } from './components/Sidebar';
import { useAgentStatus } from './hooks/useAgentStatus';
import { HomeView } from './views/HomeView';
import { AgentsView } from './views/AgentsView';
import { GalaxyView } from './views/GalaxyView';
import { PlanView } from './views/PlanView';
import { SettingsView } from './views/SettingsView';
import './App.css';

export default function App() {
  const [view, setView] = useState<ViewId>('harness');
  const [collapsed, setCollapsed] = useState(false);
  const agentStatus = useAgentStatus();

  return <div className="app-shell">
    <Sidebar view={view} onNavigate={setView} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(value => !value)} agentStatus={agentStatus} />
    <main className="app-main">
      {view === 'harness' ? <HomeView /> : view === 'agents' ? <AgentsView /> : view === 'galaxy' ? <GalaxyView /> : view === 'plan' ? <PlanView /> : <SettingsView />}
    </main>
  </div>;
}

