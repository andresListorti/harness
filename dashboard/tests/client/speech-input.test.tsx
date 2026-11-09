// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { SPEECH_PRIVACY_NOTICE, useSpeechInput } from '../../src/voice/useSpeechInput';

class MockRecognition {
  static instances: MockRecognition[] = [];
  static throws = false;
  interimResults = false;
  continuous = true;
  lang = '';
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn(() => { if (MockRecognition.throws) throw new DOMException('Failed', 'InvalidStateError'); });
  stop = vi.fn();
  abort = vi.fn();
  constructor() { MockRecognition.instances.push(this); }
  result(text: string, isFinal: boolean) {
    this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] });
  }
}

function install(name: string, value: typeof MockRecognition | undefined) {
  Object.defineProperty(window, name, { configurable: true, writable: true, value });
}
function instance() { return MockRecognition.instances[MockRecognition.instances.length - 1]; }
function down(target: Document | Element = document, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...extra });
  fireEvent(target, event);
  return event;
}
function setup(options: { enableSpace?: boolean; lang?: string } = {}) {
  const callback = vi.fn();
  return { callback, ...renderHook(() => useSpeechInput({ onTranscript: callback, ...options })) };
}

beforeEach(() => {
  MockRecognition.instances = [];
  MockRecognition.throws = false;
  install('SpeechRecognition', MockRecognition);
  install('webkitSpeechRecognition', undefined);
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'SpeechRecognition');
  Reflect.deleteProperty(window, 'webkitSpeechRecognition');
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test('holding Space starts once and prevents default only for the starting keydown', async () => {
  const { result } = setup();
  expect(result.current.supported).toBe(true);
  expect(down().defaultPrevented).toBe(true);
  expect(down(document, { repeat: true }).defaultPrevented).toBe(false);
  expect(down().defaultPrevented).toBe(false);
  await waitFor(() => expect(result.current.listening).toBe(true));
  expect(MockRecognition.instances).toHaveLength(1);
  expect(instance().start).toHaveBeenCalledTimes(1);
  fireEvent.keyUp(document, { key: ' ', code: 'Space' });
  expect(instance().stop).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(result.current.listening).toBe(false));
});

test.each(['input', 'textarea', 'select', 'button', 'editable', 'link', 'role-button', 'role-textbox'])('ignores Space inside %s including descendants', kind => {
  setup();
  const element = document.createElement(kind === 'editable' || kind.startsWith('role-') ? 'div' : kind === 'link' ? 'a' : kind);
  if (kind === 'editable') element.setAttribute('contenteditable', 'true');
  if (kind === 'link') element.setAttribute('href', '#');
  if (kind.startsWith('role-')) element.setAttribute('role', kind.slice(5));
  document.body.append(element);
  const child = document.createElement('span');
  element.append(child);
  expect(down(element).defaultPrevented).toBe(false);
  expect(down(child).defaultPrevented).toBe(false);
  expect(MockRecognition.instances).toHaveLength(0);
});

test.each(['ctrlKey', 'altKey', 'metaKey', 'shiftKey'])('ignores modified Space with %s', modifier => {
  setup();
  expect(down(document, { [modifier]: true }).defaultPrevented).toBe(false);
  expect(MockRecognition.instances).toHaveLength(0);
});

test('delivers interim and final transcripts using the latest callback and latest result finality', () => {
  const first = vi.fn();
  const latest = vi.fn();
  const { result, rerender } = renderHook(({ callback }) => useSpeechInput({ onTranscript: callback, lang: 'en' }), { initialProps: { callback: first } });
  act(() => result.current.start());
  expect(instance().interimResults).toBe(true);
  expect(instance().continuous).toBe(false);
  expect(instance().lang).toBe('en');
  act(() => instance().result('hello', false));
  expect(first).toHaveBeenCalledWith('hello', false);
  rerender({ callback: latest });
  act(() => instance().onresult?.({ results: [
    { 0: { transcript: 'hello ' }, isFinal: false },
    { 0: { transcript: 'world' }, isFinal: true },
  ] }));
  expect(latest).toHaveBeenCalledWith('hello world', true);
  expect(MockRecognition.instances).toHaveLength(1);
  act(() => { instance().result('', true); instance().result('   ', false); });
  expect(latest).toHaveBeenCalledTimes(1);
});

test('unsupported browsers report an error without throwing and ignore Space', () => {
  install('SpeechRecognition', undefined);
  const { result } = setup();
  expect(result.current.supported).toBe(false);
  expect(down().defaultPrevented).toBe(false);
  expect(result.current.error).toBeNull();
  act(() => expect(() => result.current.start()).not.toThrow());
  expect(result.current.error).toBe('Speech recognition is not supported in this browser.');
  expect(result.current.listening).toBe(false);
});

test('supports the prefixed constructor and default language', () => {
  install('SpeechRecognition', undefined);
  install('webkitSpeechRecognition', MockRecognition);
  const { result } = setup();
  expect(result.current.supported).toBe(true);
  act(() => result.current.start());
  expect(instance().start).toHaveBeenCalledTimes(1);
  expect(instance().lang).toBe(navigator.language);
});

test('handles a throwing start and clears the error on the next successful start', () => {
  MockRecognition.throws = true;
  const { result } = setup();
  expect(down().defaultPrevented).toBe(false);
  expect(result.current.error).toBe('Speech recognition failed.');
  expect(result.current.listening).toBe(false);
  MockRecognition.throws = false;
  act(() => result.current.start());
  expect(result.current.error).toBeNull();
  expect(result.current.listening).toBe(true);
});

test.each([
  ['not-allowed', 'Microphone access was denied.'],
  ['service-not-allowed', 'Microphone access was denied.'],
  ['no-speech', 'No speech was detected.'],
  ['network', 'Speech recognition failed.'],
])('maps %s to a generic error', (code, message) => {
  const { result } = setup();
  act(() => result.current.start());
  act(() => instance().onerror?.({ error: code }));
  expect(result.current.error).toBe(message);
  expect(result.current.listening).toBe(false);
});

test('stop is idempotent and never throws, including when the browser stop throws', () => {
  const { result } = setup();
  act(() => result.current.stop());
  act(() => { result.current.start(); result.current.start(); });
  instance().stop.mockImplementation(() => { throw new Error('Failed'); });
  act(() => { expect(() => result.current.stop()).not.toThrow(); result.current.stop(); });
  expect(instance().stop).toHaveBeenCalledTimes(1);
  expect(instance().start).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
});

test('blur and hidden documents stop listening and end resets listening', () => {
  const { result } = setup();
  down();
  fireEvent.blur(window);
  expect(instance().stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
  act(() => result.current.start());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  expect(instance().stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
  act(() => result.current.start());
  act(() => instance().onend?.());
  expect(result.current.listening).toBe(false);
});

test('unmount aborts and removes listeners and ignores late callbacks', () => {
  const errors = vi.spyOn(console, 'error');
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  const { callback, unmount } = setup();
  down();
  const speech = instance();
  const lateResult = speech.onresult;
  const lateError = speech.onerror;
  const lateEnd = speech.onend;
  unmount();
  expect(speech.abort).toHaveBeenCalledTimes(1);
  for (const event of ['keydown', 'keyup', 'visibilitychange']) {
    expect(removeDocument).toHaveBeenCalledWith(event, expect.any(Function));
  }
  expect(removeWindow).toHaveBeenCalledWith('blur', expect.any(Function));
  act(() => {
    lateResult?.({ results: [{ 0: { transcript: 'late' }, isFinal: true }] });
    lateError?.({ error: 'network' });
    lateEnd?.();
  });
  down();
  fireEvent.keyUp(document, { key: ' ' });
  fireEvent.blur(window);
  expect(MockRecognition.instances).toHaveLength(1);
  expect(speech.stop).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

test('enableSpace=false disables shortcuts while explicit start and stop still work', () => {
  const { result } = setup({ enableSpace: false });
  expect(down().defaultPrevented).toBe(false);
  expect(MockRecognition.instances).toHaveLength(0);
  act(() => result.current.start());
  fireEvent.keyUp(document, { key: ' ' });
  expect(result.current.listening).toBe(true);
  act(() => result.current.stop());
  expect(instance().stop).toHaveBeenCalledTimes(1);
  expect(result.current.listening).toBe(false);
});

test('privacy notice explains browser audio transcription by a service', () => {
  expect(SPEECH_PRIVACY_NOTICE).toMatch(/browser/);
  expect(SPEECH_PRIVACY_NOTICE).toMatch(/audio/);
  expect(SPEECH_PRIVACY_NOTICE).toMatch(/service/);
});
