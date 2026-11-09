import type { VoiceChoice } from '../../shared/api';

export type VoiceState = 'idle' | 'speaking';

interface UtteranceLike {
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface SynthesisLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
}

interface AudioLike {
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void> | void;
  pause(): void;
}

export function createSpeaker(deps: {
  fetchImpl?: typeof fetch;
  synthesis?: SynthesisLike;
  Utterance?: new (text: string) => UtteranceLike;
  createAudio?: (url: string) => AudioLike;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
} = {}) {
  let muted = false;
  let state: VoiceState = 'idle';
  let request = 0;
  let stop: (() => void) | undefined;
  let settle: (() => void) | undefined;
  const listeners = new Set<(state: VoiceState) => void>();
  const safely = (action: () => void) => { try { action(); } catch { /* Best effort cleanup. */ } };
  const emit = (next: VoiceState) => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) safely(() => listener(next));
  };
  const synthesis = () => deps.synthesis ?? (typeof window === 'undefined'
    ? undefined : window.speechSynthesis as unknown as SynthesisLike | undefined);

  function cancel() {
    request++;
    const cleanup = stop;
    stop = undefined;
    safely(() => synthesis()?.cancel());
    if (cleanup) safely(cleanup);
    const resolve = settle;
    settle = undefined;
    emit('idle');
    resolve?.();
  }

  function speak(text: string, provider: VoiceChoice): Promise<void> {
    cancel();
    text = text.trim();
    if (!text || muted) return Promise.resolve();
    const id = request;
    const current = () => id === request && !muted;
    return new Promise<void>(resolve => {
      settle = resolve;
      const finish = () => {
        if (!current()) return;
        const cleanup = stop;
        stop = undefined;
        if (cleanup) safely(cleanup);
        settle = undefined;
        emit('idle');
        resolve();
      };
      const browser = () => {
        if (!current()) return;
        try {
          const synth = synthesis();
          const Utterance = deps.Utterance ?? (typeof window === 'undefined'
            ? undefined : window.SpeechSynthesisUtterance as unknown as
              (new (text: string) => UtteranceLike) | undefined);
          if (!synth || !Utterance) { finish(); return; }
          const utterance = new Utterance(text);
          utterance.lang = typeof navigator === 'undefined' ? '' : navigator.language;
          utterance.onend = finish;
          utterance.onerror = finish;
          stop = () => { utterance.onend = null; utterance.onerror = null; };
          emit('speaking');
          if (current()) synth.speak(utterance);
        } catch { finish(); }
      };
      if (provider === 'browser') { browser(); return; }
      void (async () => {
        let release: (() => void) | undefined;
        try {
          const controller = new AbortController();
          stop = () => controller.abort();
          const response = await (deps.fetchImpl ?? globalThis.fetch)('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, text: text.slice(0, 1000) }),
            signal: controller.signal,
          });
          if (!current()) return;
          if (!response.ok) throw new Error('Voice request failed');
          const blob = await response.blob();
          if (!current()) return;
          if (!blob.size) throw new Error('Empty audio');
          const url = (deps.createObjectUrl ?? (value => URL.createObjectURL(value)))(blob);
          let audio: AudioLike | undefined;
          let released = false;
          release = () => {
            if (released) return;
            released = true;
            if (audio) {
              audio.onended = null;
              audio.onerror = null;
              safely(() => audio?.pause());
            }
            safely(() => (deps.revokeObjectUrl ?? (value => URL.revokeObjectURL(value)))(url));
          };
          stop = release;
          audio = (deps.createAudio ?? (value => new Audio(value) as unknown as AudioLike))(url);
          const fallback = () => {
            if (!current() || released) return;
            release?.();
            stop = undefined;
            browser();
          };
          audio.onended = finish;
          audio.onerror = fallback;
          emit('speaking');
          if (!current()) return;
          try { await audio.play(); } catch { fallback(); }
        } catch {
          release?.();
          if (current()) { stop = undefined; browser(); }
        }
      })();
    });
  }

  return {
    speak,
    cancel,
    mute() { muted = true; cancel(); },
    unmute() { muted = false; },
    isMuted: () => muted,
    subscribe(listener: (state: VoiceState) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export const speaker = createSpeaker();
