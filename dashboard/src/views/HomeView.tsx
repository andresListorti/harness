import type { ComponentProps } from 'react';
import { ChatPanel } from '../components/ChatPanel';
import { Orb, type OrbState } from '../components/Orb';
import './HomeView.css';

export function HomeView({ client, orbState = 'idle' }: {
  client?: ComponentProps<typeof ChatPanel>['client'];
  orbState?: OrbState;
}) {
  return <div className="home-view">
    <div className="home-orb"><Orb state={orbState} /></div>
    <h1 className="home-title">Harness</h1>
    <p className="home-subtitle">Local control room for Claude Code and Codex</p>
    <div className="home-chat"><ChatPanel client={client} /></div>
  </div>;
}
