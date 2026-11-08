import { useState } from 'react';
import { Sidebar, VIEWS, type ViewId } from './components/Sidebar';
import { useAgentStatus } from './hooks/useAgentStatus';
import { HomeView } from './views/HomeView';
import './App.css';

export default function App() {
  const [view, setView] = useState<ViewId>('harness');
  const [collapsed, setCollapsed] = useState(false);
  const agentStatus = useAgentStatus();

  return <div className="app-shell">
    <Sidebar view={view} onNavigate={setView} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(value => !value)} agentStatus={agentStatus} />
    <main className="app-main">
      {view === 'harness' ? <HomeView /> : <>
        <h1 className="section-title">{VIEWS.find(item => item.id === view)?.label}</h1>
        <p className="eyebrow">Coming up in this milestone</p>
      </>}
    </main>
  </div>;
}
