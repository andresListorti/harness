import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { VoiceChoice } from '../../shared/api';
import type { OrbState } from '../components/Orb';
import { api } from '../lib/api';
import { notifySettingsChanged, SETTINGS_CHANGED_EVENT } from '../lib/settings-events';
import { speaker as defaultSpeaker } from './speak';
import { SPEECH_PRIVACY_NOTICE, useSpeechInput } from './useSpeechInput';

type TranscriptListener = (text: string, isFinal: boolean) => void;
const choices: { id: VoiceChoice; label: string }[] = [
  { id: 'browser', label: 'Browser voice' }, { id: 'fish-audio', label: 'Fish Audio' },
  { id: 'elevenlabs', label: 'ElevenLabs' }, { id: 'openai', label: 'OpenAI' },
];

function useVoiceState(client: Pick<typeof api, 'getSettings' | 'saveSettings' | 'getVoiceProviders'>, speaker: typeof defaultSpeaker) {
  const listeners = useRef(new Set<TranscriptListener>());
  const input = useSpeechInput({ enableSpace: true, onTranscript: (text, final) => {
    for (const listener of listeners.current) listener(text, final);
  } });
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(() => speaker.isMuted());
  const [voice, updateVoice] = useState<VoiceChoice>('browser');
  const [voices, setVoices] = useState(choices.slice(0, 1));
  const [error, setError] = useState<string | null>(null);
  const [replyWithVoice, setReplyWithVoice] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const saving = useRef(false);
  const version = useRef(0);

  useEffect(() => {
    let active = true;
    const refreshVoice = () => {
      const current = version.current;
      void Promise.resolve().then(() => client.getSettings()).then(settings => {
        if (active && current === version.current) updateVoice(settings.voice);
      }).catch(() => {});
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, refreshVoice);
    refreshVoice();
    void Promise.resolve().then(() => client.getVoiceProviders()).then(result => {
      if (active) setVoices(choices.filter(choice => choice.id === 'browser' || result.providers.some(provider => provider.id === choice.id && provider.available)));
    }).catch(() => { if (active) setVoices(choices.slice(0, 1)); });
    const unsubscribe = speaker.subscribe(state => setSpeaking(state === 'speaking'));
    return () => {
      active = false;
      version.current++;
      window.removeEventListener(SETTINGS_CHANGED_EVENT, refreshVoice);
      unsubscribe();
    };
  }, [client, speaker]);

  const onTranscript = useCallback((listener: TranscriptListener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  async function setVoice(choice: VoiceChoice) {
    if (saving.current) return;
    saving.current = true;
    const current = ++version.current;
    setError(null);
    try {
      const settings = await client.getSettings();
      await client.saveSettings({ orchestrator: settings.orchestrator, voice: choice });
      if (current === version.current) updateVoice(choice);
      notifySettingsChanged();
    } catch {
      if (current === version.current) setError('Could not save voice. Please try again.');
    } finally { saving.current = false; }
  }

  return {
    supported: input.supported, listening: input.listening, speaking,
    orbState: (input.listening ? 'listening' : speaking ? 'speaking' : 'idle') as OrbState,
    error: error ?? input.error, notice: SPEECH_PRIVACY_NOTICE,
    talk() { if (input.listening) input.stop(); else { speaker.cancel(); input.start(); } },
    muted, toggleMute() {
      if (speaker.isMuted()) speaker.unmute(); else speaker.mute();
      setMuted(speaker.isMuted());
    },
    voice, voices, setVoice, replyWithVoice, setReplyWithVoice, handsFree, setHandsFree,
    speakReply(text: string) { if (replyWithVoice) void speaker.speak(text, voice); },
    onTranscript,
  };
}

const VoiceContext = createContext<ReturnType<typeof useVoiceState> | null>(null);

export function VoiceProvider({ children, client = api, speaker = defaultSpeaker }: {
  children: ReactNode;
  client?: Pick<typeof api, 'getSettings' | 'saveSettings' | 'getVoiceProviders'>;
  speaker?: typeof defaultSpeaker;
}) {
  const value = useVoiceState(client, speaker);
  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() { return useContext(VoiceContext); }
