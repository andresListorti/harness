import { useCallback, useEffect, useRef, useState } from 'react';

export const SPEECH_PRIVACY_NOTICE = 'Your browser may send microphone audio to its vendor\'s speech service for transcription.';

interface SpeechResult {
  readonly isFinal: boolean;
  readonly [index: number]: { readonly transcript: string };
}

interface SpeechRecognition {
  interimResults: boolean;
  continuous: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

function constructor() {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export function useSpeechInput(options: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onBeforeStart?: () => void;
  lang?: string;
  enableSpace?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const mounted = useRef(true);
  const recognition = useRef<SpeechRecognition | null>(null);
  const active = useRef(false);
  const space = useRef(false);

  const stop = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    space.current = false;
    if (mounted.current) setListening(false);
    try { recognition.current?.stop(); } catch { /* Stopping is best effort. */ }
  }, []);

  const start = useCallback(() => {
    if (!mounted.current || active.current) return;
    const Recognition = constructor();
    if (!Recognition) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }
    active.current = true;
    try {
      const instance = new Recognition();
      recognition.current = instance;
      const current = () => mounted.current && recognition.current === instance;
      instance.interimResults = true;
      instance.continuous = false;
      instance.lang = latest.current.lang ?? navigator.language;
      instance.onresult = event => {
        if (!current()) return;
        const results = Array.from(event.results);
        const text = results.map(result => result[0]?.transcript ?? '').join('').trim();
        if (text) latest.current.onTranscript(text, results.at(-1)?.isFinal === true);
      };
      instance.onerror = event => {
        if (!current()) return;
        setError(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone access was denied.'
          : event.error === 'no-speech' ? 'No speech was detected.' : 'Speech recognition failed.');
        active.current = false;
        space.current = false;
        setListening(false);
      };
      instance.onend = () => {
        if (!current()) return;
        active.current = false;
        space.current = false;
        setListening(false);
      };
      setError(null);
      setListening(true);
      try { latest.current.onBeforeStart?.(); } catch { /* Preparation is best effort. */ }
      instance.start();
    } catch {
      active.current = false;
      space.current = false;
      setError('Speech recognition failed.');
      setListening(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current = false;
      space.current = false;
      const instance = recognition.current;
      recognition.current = null;
      if (instance) {
        instance.onresult = null;
        instance.onerror = null;
        instance.onend = null;
        try { instance.abort(); } catch { /* Aborting is best effort. */ }
      }
    };
  }, []);

  useEffect(() => {
    const isSpace = (event: KeyboardEvent) => event.key === ' ' || event.code === 'Space';
    function keydown(event: KeyboardEvent) {
      if (!isSpace(event) || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), button, a[href], [role="button"], [role="textbox"]')) return;
      if (!constructor() || active.current) return;
      start();
      if (active.current) {
        space.current = true;
        event.preventDefault();
      }
    }
    function keyup(event: KeyboardEvent) {
      if (isSpace(event) && space.current) stop();
    }
    function visibility() {
      if (document.visibilityState === 'hidden') stop();
    }
    if (options.enableSpace !== false) {
      document.addEventListener('keydown', keydown);
      document.addEventListener('keyup', keyup);
    }
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', visibility);
      if (space.current) stop();
    };
  }, [options.enableSpace, start, stop]);

  return { supported: Boolean(constructor()), listening, error, start, stop };
}
