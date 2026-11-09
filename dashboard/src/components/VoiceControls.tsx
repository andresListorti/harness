import { useId } from 'react';
import { useVoice } from '../voice/VoiceProvider';
import './VoiceControls.css';

export function MicrophoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6" /></svg>;
}

export function VoiceControls({ collapsed }: { collapsed: boolean }) {
  const voice = useVoice();
  const noticeId = useId();
  const selectId = useId();
  if (!voice) return null;
  return <section className={`voice-controls${collapsed ? ' voice-controls--collapsed' : ''}`} aria-label="Voice controls">
    <button type="button" className="sidebar-item" aria-label="Talk" aria-pressed={voice.listening} onClick={voice.talk}
      title={collapsed ? voice.notice : undefined} aria-describedby={noticeId}><MicrophoneIcon />{!collapsed && <span>Talk</span>}</button>
    <button type="button" className="sidebar-item" aria-label={voice.muted ? 'Unmute' : 'Mute'} aria-pressed={voice.muted} onClick={voice.toggleMute}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8" />{voice.muted && <path d="m3 3 18 18" />}</svg>
      {!collapsed && <span>{voice.muted ? 'Unmute' : 'Mute'}</span>}
    </button>
    <label htmlFor={selectId} className={collapsed ? 'voice-visually-hidden' : undefined}>Voice</label>
    <select id={selectId} value={voice.voice} onChange={event => void voice.setVoice(event.target.value as typeof voice.voice)}>
      {voice.voices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
    </select>
    <p id={noticeId} className={collapsed ? 'voice-visually-hidden' : 'voice-notice'}>{voice.notice}</p>
    {!voice.supported && <p className={collapsed ? 'voice-visually-hidden' : 'voice-notice'}>Speech recognition is not supported in this browser.</p>}
    {voice.error && <p role="alert" className={collapsed ? 'voice-visually-hidden' : 'voice-error'}>{voice.error}</p>}
  </section>;
}
