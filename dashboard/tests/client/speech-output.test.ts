// @vitest-environment jsdom
import { createSpeaker } from '../../src/voice/speak';

class Utterance {
  lang = '';
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const utterances: Utterance[] = [];
  const synthesis = { cancel: vi.fn(), speak: vi.fn((value: Utterance) => utterances.push(value)) };
  const audio = {
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    play: vi.fn(() => Promise.resolve()), pause: vi.fn(),
  };
  const blob = new Blob(['audio'], { type: 'audio/mpeg' });
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({ ok: true, blob: async () => blob } as Response);
  const createObjectUrl = vi.fn(() => 'blob:voice');
  const revokeObjectUrl = vi.fn();
  const createAudio = vi.fn(() => audio);
  const speaker = createSpeaker({ synthesis, Utterance, fetchImpl, createAudio, createObjectUrl, revokeObjectUrl });
  return { speaker, synthesis, utterances, audio, blob, fetchImpl, createObjectUrl, revokeObjectUrl, createAudio };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('browser speaks trimmed exact text with browser language and never fetches', async () => {
  const s = setup();
  const done = s.speaker.speak('  Reply text  ', 'browser');
  expect(s.fetchImpl).not.toHaveBeenCalled();
  expect(s.utterances[0].text).toBe('Reply text');
  expect(s.utterances[0].lang).toBe(navigator.language);
  s.utterances[0].onend?.();
  await expect(done).resolves.toBeUndefined();
});

test.each(['fish-audio', 'elevenlabs', 'openai'] as const)('plays and releases %s audio', async provider => {
  const s = setup();
  const done = s.speaker.speak(' Reply ', provider);
  await flush();
  expect(s.fetchImpl).toHaveBeenCalledExactlyOnceWith('/api/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, text: 'Reply' }), signal: expect.any(AbortSignal),
  });
  expect(s.createObjectUrl).toHaveBeenCalledWith(s.blob);
  expect(s.createAudio).toHaveBeenCalledWith('blob:voice');
  expect(s.audio.play).toHaveBeenCalledTimes(1);
  expect(s.revokeObjectUrl).not.toHaveBeenCalled();
  s.audio.onended?.();
  await done;
  expect(s.revokeObjectUrl).toHaveBeenCalledExactlyOnceWith('blob:voice');
});

test('limits provider request text to 1000 characters', async () => {
  const s = setup();
  const done = s.speaker.speak('x'.repeat(1001), 'openai');
  expect(JSON.parse(String(s.fetchImpl.mock.calls[0][1]?.body)).text).toBe('x'.repeat(1000));
  s.speaker.cancel();
  await done;
});

test('replacement cancels synthesis, pauses audio, revokes URLs and settles previous promises', async () => {
  const s = setup();
  const first = s.speaker.speak('First', 'browser');
  const oldEnd = s.utterances[0].onend;
  const second = s.speaker.speak('Second', 'openai');
  await first;
  expect(s.synthesis.cancel).toHaveBeenCalledTimes(2);
  await flush();
  const third = s.speaker.speak('Third', 'browser');
  await second;
  expect(s.audio.pause).toHaveBeenCalledTimes(1);
  expect(s.revokeObjectUrl).toHaveBeenCalledTimes(1);
  oldEnd?.();
  s.utterances[1].onend?.();
  await third;
});

test('aborts pending fetch and discards a stale response', async () => {
  const s = setup();
  const pending = deferred<Response>();
  s.fetchImpl.mockReturnValueOnce(pending.promise);
  const first = s.speaker.speak('Old', 'openai');
  const signal = s.fetchImpl.mock.calls[0][1]?.signal;
  const second = s.speaker.speak('New', 'browser');
  await first;
  expect(signal?.aborted).toBe(true);
  pending.resolve({ ok: true, blob: async () => s.blob } as Response);
  await flush();
  expect(s.createAudio).not.toHaveBeenCalled();
  expect(s.utterances.map(value => value.text)).toEqual(['New']);
  s.speaker.cancel();
  await second;
});

test('mute stops sound immediately, stays silent and unmute permits a new reply', async () => {
  const s = setup();
  const first = s.speaker.speak('First', 'openai');
  await flush();
  s.speaker.mute();
  await first;
  expect(s.audio.pause).toHaveBeenCalledTimes(1);
  expect(s.revokeObjectUrl).toHaveBeenCalledTimes(1);
  expect(s.speaker.isMuted()).toBe(true);
  await s.speaker.speak('Silent', 'browser');
  await s.speaker.speak('Silent', 'openai');
  expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  expect(s.utterances).toHaveLength(0);
  s.speaker.unmute();
  expect(s.speaker.isMuted()).toBe(false);
  expect(s.utterances).toHaveLength(0);
  const last = s.speaker.speak('Last', 'browser');
  s.utterances[0].onend?.();
  await last;
});

test.each(['409', '502', 'network', 'empty', 'play', 'audio', 'blob'])(
  'falls back with the same text on %s failure without rejecting', async failure => {
    const s = setup();
    if (failure === '409' || failure === '502') s.fetchImpl.mockResolvedValue({ ok: false, status: Number(failure) } as Response);
    if (failure === 'network') s.fetchImpl.mockRejectedValue(new Error('Failed'));
    if (failure === 'empty') s.fetchImpl.mockResolvedValue({ ok: true, blob: async () => new Blob([]) } as Response);
    if (failure === 'blob') s.fetchImpl.mockResolvedValue({ ok: true, blob: async () => { throw new Error('Failed'); } } as unknown as Response);
    if (failure === 'play') s.audio.play.mockRejectedValue(new Error('Failed'));
    const done = s.speaker.speak('Same text', 'openai');
    await flush();
    if (failure === 'audio') s.audio.onerror?.();
    expect(s.utterances[0].text).toBe('Same text');
    if (failure === 'play' || failure === 'audio') expect(s.revokeObjectUrl).toHaveBeenCalledTimes(1);
    s.utterances[0].onend?.();
    await expect(done).resolves.toBeUndefined();
  },
);

test.each(['mute', 'replace', 'cancel'] as const)('late failures cannot fall back after %s', async action => {
  const s = setup();
  const pending = deferred<void>();
  s.audio.play.mockReturnValueOnce(pending.promise);
  const done = s.speaker.speak('Old', 'openai');
  await flush();
  if (action === 'mute') s.speaker.mute();
  else if (action === 'cancel') s.speaker.cancel();
  else await s.speaker.speak('', 'browser');
  await done;
  pending.reject(new Error('Failed'));
  await flush();
  expect(s.utterances).toHaveLength(0);
});

test.each(['fetch', 'blob'] as const)('ignores stale %s completion when muted', async phase => {
  const s = setup();
  const pending = deferred<Blob>();
  const response = deferred<Response>();
  s.fetchImpl.mockReturnValueOnce(phase === 'fetch' ? response.promise
    : Promise.resolve({ ok: true, blob: () => pending.promise } as Response));
  const done = s.speaker.speak('Old', 'openai');
  await flush();
  s.speaker.mute();
  await done;
  response.resolve({ ok: false } as Response);
  pending.resolve(s.blob);
  await flush();
  expect(s.createAudio).not.toHaveBeenCalled();
  expect(s.utterances).toHaveLength(0);
});

test('emits only state changes and supports unsubscribe', async () => {
  const s = setup();
  const listener = vi.fn();
  const unsubscribe = s.speaker.subscribe(listener);
  const first = s.speaker.speak('Reply', 'browser');
  const end = s.utterances[0].onend;
  end?.();
  end?.();
  s.speaker.cancel();
  await first;
  expect(listener.mock.calls).toEqual([['speaking'], ['idle']]);
  unsubscribe();
  const second = s.speaker.speak('Reply', 'browser');
  s.speaker.cancel();
  await second;
  expect(listener).toHaveBeenCalledTimes(2);
});

test('empty input and unsupported synthesis resolve silently', async () => {
  const s = setup();
  await expect(s.speaker.speak('  ', 'openai')).resolves.toBeUndefined();
  expect(s.fetchImpl).not.toHaveBeenCalled();
  expect(s.synthesis.speak).not.toHaveBeenCalled();
  vi.stubGlobal('speechSynthesis', undefined);
  vi.stubGlobal('SpeechSynthesisUtterance', undefined);
  try { await expect(createSpeaker().speak('Reply', 'browser')).resolves.toBeUndefined(); }
  finally { vi.unstubAllGlobals(); }
});

test('throwing browser synthesis resolves without rejecting', async () => {
  const s = setup();
  s.synthesis.speak.mockImplementation(() => { throw new Error('Failed'); });
  await expect(s.speaker.speak('Reply', 'browser')).resolves.toBeUndefined();
});
