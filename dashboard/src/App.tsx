import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { openWidget, type WidgetHandle } from './widget/openWidget';
import { WidgetView } from './widget/WidgetView';
import { Sidebar, type ViewId } from './components/Sidebar';
import { useAgentStatus } from './hooks/useAgentStatus';
import { HomeView } from './views/HomeView';
import { AgentsView } from './views/AgentsView';
import { GalaxyView } from './views/GalaxyView';
import { PlanView } from './views/PlanView';
import { SettingsView } from './views/SettingsView';
import './App.css';
import { VoiceProvider, useVoice } from './voice/VoiceProvider';

export default function App() {
  return <VoiceProvider><AppContent /></VoiceProvider>;
}

function AppContent() {
  const voice = useVoice();
  const setWidgetOpen = voice?.setWidgetOpen;
  const [view, setView] = useState<ViewId>('harness');
  const [collapsed, setCollapsed] = useState(false);
  const agentStatus = useAgentStatus();
  const [widget, setWidget] = useState<WidgetHandle | null>(null);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const release = useRef<(() => void) | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; release.current?.(); };
  }, []);

  async function toggleWidget() {
    if (release.current) { release.current(); return; }
    if (pending.current) return;
    pending.current = true;
    setWidgetError(null);
    const result = await openWidget();
    pending.current = false;
    if (!mounted.current) {
      if (result.ok) { try { result.handle.window.close(); } catch { /* Already closed. */ } }
      return;
    }
    if (!result.ok) { setWidgetError(result.message); return; }
    const handle = result.handle;
    let released = false;
    const cleanup = (close: boolean) => {
      if (released) return;
      released = true;
      handle.window.removeEventListener('pagehide', onHide);
      release.current = null;
      setWidgetOpen?.(false);
      if (mounted.current) setWidget(null);
      if (close) { try { handle.window.close(); } catch { /* Already closed. */ } }
    };
    const onHide = () => cleanup(false);
    release.current = () => cleanup(true);
    handle.window.addEventListener('pagehide', onHide);
    setWidgetOpen?.(true);
    setWidget(handle);
  }

  return <div className="app-shell">
    <Sidebar view={view} onNavigate={setView} collapsed={collapsed} onToggleCollapsed={() => setCollapsed(value => !value)} agentStatus={agentStatus} widgetOpen={Boolean(widget)} onToggleWidget={() => void toggleWidget()} widgetError={widgetError} />
    <main className="app-main">
      {view === 'harness' ? <HomeView orbState={voice?.orbState} /> : view === 'agents' ? <AgentsView /> : view === 'galaxy' ? <GalaxyView /> : view === 'plan' ? <PlanView /> : <SettingsView />}
    </main>
    {widget && createPortal(<WidgetView />, widget.window.document.body)}
  </div>;
}

