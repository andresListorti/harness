import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, SettingsResponse, VoiceChoice, VoiceProviders } from '../../shared/api';
import { api, ApiError } from '../lib/api';
import { notifySettingsChanged } from '../lib/settings-events';
import './SettingsView.css';

const agents = [{ id: 'claude-code', name: 'Claude Code' }, { id: 'codex', name: 'Codex' }] as const;
const voices: { id: VoiceChoice; name: string }[] = [
  { id: 'browser', name: 'Browser voice' }, { id: 'fish-audio', name: 'Fish Audio' },
  { id: 'elevenlabs', name: 'ElevenLabs' }, { id: 'openai', name: 'OpenAI' },
];
type Client = Pick<typeof api, 'getSettings' | 'saveSettings' | 'getVoiceProviders'>;

export function SettingsView({ client = api }: { client?: Client }) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [providers, setProviders] = useState<VoiceProviders['providers']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const request = useRef(0);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const [result, availability] = await Promise.all([
        client.getSettings(), client.getVoiceProviders().catch(() => ({ providers: [] })),
      ]);
      if (current !== request.current) return;
      setSettings(result);
      setProviders(availability.providers);
    } catch (cause) {
      if (current !== request.current) return;
      setError(cause instanceof ApiError ? `Could not load settings: ${cause.message}` : 'Could not load settings.');
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
    return () => { request.current += 1; };
  }, [load]);

  async function save(next: Settings) {
    if (savingRef.current) return;
    savingRef.current = true;
    const current = request.current;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await client.saveSettings(next);
      notifySettingsChanged();
      if (current === request.current) setSettings(result);
    } catch {
      if (current === request.current) setSaveError('Could not save settings. Please try again.');
    } finally {
      savingRef.current = false;
      if (current === request.current) setSaving(false);
    }
  }

  return <section className="settings-view">
    <h1 className="section-title">Settings</h1>
    {loading ? <p aria-busy="true">Loading settings...</p> : error ? <div>
      <p role="alert" className="settings-error">{error}</p>
      <button type="button" onClick={() => void load()}>Retry</button>
    </div> : settings && <>
      {saveError && <p role="alert" className="settings-error">{saveError}</p>}
      {saving && <p role="status">Saving settings...</p>}
      <section>
        <h2 id="orchestrator-title" className="section-title">Orchestrator</h2>
        <fieldset role="radiogroup" aria-labelledby="orchestrator-title" disabled={saving} className="settings-choices">
          {agents.map(agent => <label className="settings-choice" key={agent.id}>
            <input type="radio" name="orchestrator" value={agent.id} checked={settings.orchestrator === agent.id}
              onChange={() => void save({ orchestrator: agent.id, voice: settings.voice })} />
            <span>{agent.name}{' '}<small>{settings.orchestrator === agent.id ? 'Orchestrator' : settings.worker === agent.id ? 'Worker' : ''}</small></span>
          </label>)}
        </fieldset>
      </section>
      <section>
        <h2 id="voice-title" className="section-title">Voice</h2>
        <fieldset role="radiogroup" aria-labelledby="voice-title" disabled={saving} className="settings-choices">
          {voices.map(voice => {
            const available = voice.id === 'browser' || providers.some(provider => provider.id === voice.id && provider.available);
            return <label className="settings-choice" key={voice.id}>
              <input type="radio" name="voice" value={voice.id} checked={settings.voice === voice.id} disabled={!available}
                onChange={() => void save({ orchestrator: settings.orchestrator, voice: voice.id })} />
              <span>{voice.name}{' '}{!available && <small>Not configured <span>Set its keys in .env</span></small>}</span>
            </label>;
          })}
        </fieldset>
      </section>
    </>}
  </section>;
}
