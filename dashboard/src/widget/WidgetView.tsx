import { Orb } from '../components/Orb';
import { useVoice } from '../voice/VoiceProvider';
import './WidgetView.css';

export function WidgetView() {
  const voice = useVoice();
  const status = voice?.listening ? 'Listening...' : voice?.speaking ? 'Speaking...' : 'Idle';
  return <div className="widget">
    <Orb state={voice?.orbState ?? 'idle'} />
    <p role="status">{status}{voice?.error && ` ${voice.error}`}</p>
    <button type="button" aria-pressed={voice?.listening ?? false} onClick={() => voice?.talk()}>Talk</button>
  </div>;
}
