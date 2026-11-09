// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceProvider, useVoice } from '../../src/voice/VoiceProvider';
import { speaker as defaultSpeaker, type VoiceState } from '../../src/voice/speak';
import { SPEECH_PRIVACY_NOTICE } from '../../src/voice/useSpeechInput';
import { VoiceControls } from '../../src/components/VoiceControls';
import { Sidebar } from '../../src/components/Sidebar';
import { ChatPanel } from '../../src/components/ChatPanel';
import App from '../../src/App';
import { WidgetView } from '../../src/widget/WidgetView';
import { api } from '../../src/lib/api';
import { SettingsView } from '../../src/views/SettingsView';
import { notifySettingsChanged, SETTINGS_CHANGED_EVENT } from '../../src/lib/settings-events';

vi.mock('../../src/lib/api', async importOriginal => {
  const original = await importOriginal<typeof import('../../src/lib/api')>();
  return { ...original, api: {
    getAgents: vi.fn().mockResolvedValue({ agents: [] }),
    getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    getSettings: vi.fn().mockResolvedValue({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser' }),
    getVoiceProviders: vi.fn().mockResolvedValue({ providers: [] }),
    getChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
    clearChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    sendChat: vi.fn().mockResolvedValue({ reply: 'New reply', source: 'local' }),
  } };
});

class Recognition {
  static latest: Recognition;
  interimResults = false;
  continuous = false;
  lang = '';
  onresult: ((event: { results: { 0: { transcript: string }; isFinal: boolean }[] }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() { Recognition.latest = this; }
  result(text: string, isFinal: boolean) { this.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] }); }
}

beforeEach(() => {
  Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: Recognition });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(window, 'SpeechRecognition'); vi.restoreAllMocks(); });

function setup(collapsed = false) {
  const client = {
    getSettings: vi.fn().mockResolvedValue({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser' }),
    saveSettings: vi.fn().mockResolvedValue({ orchestrator: 'codex', worker: 'claude-code', voice: 'openai' }),
    getVoiceProviders: vi.fn().mockResolvedValue({ providers: [{ id: 'openai', available: true }, { id: 'fish-audio', available: false }] }),
    getChatHistory: vi.fn().mockResolvedValue({ messages: [{ role: 'assistant', text: 'Saved reply' }] }),
    getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
    clearChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    sendChat: vi.fn().mockResolvedValue({ reply: 'New reply', source: 'local' }),
  };
  client.saveSettings.mockImplementation(async next => {
    const saved = { ...next, worker: 'claude-code' };
    client.getSettings.mockResolvedValue(saved);
    return saved;
  });
  let muted = false;
  let listener: (state: VoiceState) => void = () => {};
  const unsubscribe = vi.fn();
  const speaker = {
    speak: vi.fn().mockResolvedValue(undefined), cancel: vi.fn(),
    mute: vi.fn(() => { muted = true; }), unmute: vi.fn(() => { muted = false; }), isMuted: () => muted,
    subscribe: vi.fn((next: (state: VoiceState) => void) => { listener = next; return unsubscribe; }),
  };
  const tree = (hidden: boolean) => <VoiceProvider client={client} speaker={speaker}><VoiceControls collapsed={hidden} /><ChatPanel client={client} /></VoiceProvider>;
  return { client, speaker, unsubscribe, emit: (state: VoiceState) => listener(state), tree, ...render(tree(collapsed)) };
}

async function ready() {
  await waitFor(() => expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument());
}

test('Talk cancels speech before starting, toggles listening, and Mute toggles speaker and name', async () => {
  const s = setup();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  expect(Recognition.latest.start).toHaveBeenCalledOnce();
  expect(s.speaker.cancel.mock.invocationCallOrder[0]).toBeLessThan(Recognition.latest.start.mock.invocationCallOrder[0]);
  expect(screen.getByRole('button', { name: 'Talk' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  expect(Recognition.latest.stop).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Talk' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
  expect(s.speaker.mute).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
  expect(s.speaker.unmute).toHaveBeenCalledOnce();
  s.unmount();
  expect(s.unsubscribe).toHaveBeenCalledOnce();
});

test('lists only configured providers, preserves orchestrator on save, and keeps voice on failure', async () => {
  const s = setup();
  await ready();
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Browser voice', 'OpenAI']);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Voice' }), 'openai');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai'));
  expect(s.client.saveSettings).toHaveBeenCalledWith({ orchestrator: 'codex', voice: 'openai' });
  s.client.saveSettings.mockRejectedValueOnce(new Error('Unavailable'));
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Voice' }), 'browser');
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai'));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save voice.');
});

test('privacy notice remains described and titled when collapsed', async () => {
  const s = setup();
  await ready();
  expect(screen.getByText(SPEECH_PRIVACY_NOTICE)).toBeVisible();
  s.rerender(s.tree(true));
  const talk = screen.getByRole('button', { name: 'Talk' });
  expect(talk).toHaveAttribute('title', SPEECH_PRIVACY_NOTICE);
  expect(talk).toHaveAccessibleDescription(SPEECH_PRIVACY_NOTICE);
  expect(talk).not.toHaveTextContent('Talk');
});

test('reply playback defaults off, never reads history, and follows current switch', async () => {
  const s = setup();
  await screen.findByText('Saved reply');
  await waitFor(() => expect(s.client.getChatHistory).toHaveBeenCalledOnce());
  expect(screen.getByRole('switch', { name: 'Reply with voice' })).not.toBeChecked();
  expect(s.speaker.speak).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole('textbox'), 'first{Enter}');
  await waitFor(() => expect(s.client.sendChat).toHaveBeenCalledOnce());
  expect(s.speaker.speak).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('switch', { name: 'Reply with voice' }));
  expect(s.speaker.speak).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole('textbox'), 'second{Enter}');
  await waitFor(() => expect(s.speaker.speak).toHaveBeenCalledExactlyOnceWith('New reply', 'browser'));
  fireEvent.click(screen.getByRole('switch', { name: 'Reply with voice' }));
  await userEvent.type(screen.getByRole('textbox'), 'third{Enter}');
  await waitFor(() => expect(s.client.sendChat).toHaveBeenCalledTimes(3));
  expect(s.speaker.speak).toHaveBeenCalledOnce();
});

test('microphone fills interim and final text; Hands-free sends final once and respects busy', async () => {
  const s = setup();
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Microphone' }));
  expect(Recognition.latest.start).toHaveBeenCalledOnce();
  act(() => Recognition.latest.result('interim', false));
  expect(screen.getByRole('textbox')).toHaveValue('interim');
  act(() => Recognition.latest.result('review', true));
  expect(screen.getByRole('textbox')).toHaveValue('review');
  expect(s.client.sendChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('switch', { name: 'Hands-free' }));
  act(() => Recognition.latest.result('draft', false));
  expect(s.client.sendChat).not.toHaveBeenCalled();
  s.client.sendChat.mockReturnValueOnce(new Promise(() => {}));
  act(() => { Recognition.latest.result('  send this  ', true); Recognition.latest.result('send this', true); });
  expect(s.client.sendChat).toHaveBeenCalledExactlyOnceWith('send this');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

test('App orb follows speaker and recognition, with listening taking priority', async () => {
  let emit: (state: VoiceState) => void = () => {};
  vi.spyOn(defaultSpeaker, 'subscribe').mockImplementation(listener => { emit = listener; return () => {}; });
  vi.spyOn(defaultSpeaker, 'cancel').mockImplementation(() => {});
  render(<App />);
  await waitFor(() => expect(api.getSettings).toHaveBeenCalled());
  expect(screen.getByRole('img', { name: 'Harness orb, idle' })).toHaveAttribute('data-state', 'idle');
  act(() => emit('speaking'));
  expect(screen.getByRole('img', { name: 'Harness orb, speaking' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  expect(screen.getByRole('img', { name: 'Harness orb, listening' })).toBeInTheDocument();
  act(() => Recognition.latest.onend?.());
  expect(screen.getByRole('img', { name: 'Harness orb, speaking' })).toBeInTheDocument();
  act(() => emit('idle'));
  expect(screen.getByRole('img', { name: 'Harness orb, idle' })).toBeInTheDocument();
});

test('unsupported browser explains support and provider failures fall back to Browser voice', async () => {
  Reflect.deleteProperty(window, 'SpeechRecognition');
  const client = { getSettings: vi.fn().mockRejectedValue(new Error()), getVoiceProviders: vi.fn().mockRejectedValue(new Error()), saveSettings: vi.fn() };
  render(<VoiceProvider client={client}><VoiceControls collapsed={false} /></VoiceProvider>);
  await waitFor(() => expect(client.getVoiceProviders).toHaveBeenCalledOnce());
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('browser');
  expect(screen.getByText('Speech recognition is not supported in this browser.')).toBeVisible();
});

test('Sidebar and ChatPanel without provider expose no voice controls', async () => {
  render(<><Sidebar view="harness" collapsed={false} agentStatus="ready" onNavigate={vi.fn()} onToggleCollapsed={vi.fn()} /><ChatPanel /></>);
  await waitFor(() => expect(api.getChatHistory).toHaveBeenCalled());
  expect(screen.queryByRole('region', { name: 'Voice controls' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Talk' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Microphone' })).not.toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
});

test('Settings saves refresh the sidebar voice and the next spoken reply', async () => {
  const s = setup();
  await ready();
  render(<SettingsView client={s.client} />);
  await userEvent.click(await screen.findByRole('radio', { name: 'OpenAI' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai'));
  fireEvent.click(screen.getByRole('switch', { name: 'Reply with voice' }));
  await userEvent.type(screen.getByRole('textbox'), 'hello{Enter}');
  await waitFor(() => expect(s.speaker.speak).toHaveBeenCalledExactlyOnceWith('New reply', 'openai'));
});

test('failed settings refresh preserves voice and unmount removes the listener', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const s = setup();
  await ready();
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Voice' }), 'openai');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai'));
  s.client.getSettings.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => notifySettingsChanged());
  expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai');
  const listener = add.mock.calls.find(([name]) => name === SETTINGS_CHANGED_EVENT)![1];
  s.unmount();
  expect(remove).toHaveBeenCalledWith(SETTINGS_CHANGED_EVENT, listener);
  const calls = s.client.getSettings.mock.calls.length;
  await act(async () => notifySettingsChanged());
  expect(s.client.getSettings).toHaveBeenCalledTimes(calls);
});

test('a settings refresh cannot overwrite a newer voice selection', async () => {
  const s = setup();
  await ready();
  let resolve!: (settings: { orchestrator: string; worker: string; voice: string }) => void;
  s.client.getSettings.mockReturnValueOnce(new Promise(res => { resolve = res; }));
  await act(async () => notifySettingsChanged());
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Voice' }), 'openai');
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai'));
  await act(async () => resolve({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser' }));
  expect(screen.getByRole('combobox', { name: 'Voice' })).toHaveValue('openai');
});


test('Hands-free from Agents submits after Home chat unmounts', async () => {
  vi.mocked(api.sendChat).mockClear();
  render(<App />);
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Hands-free' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('switch', { name: 'Hands-free' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agents' }));
  expect(screen.queryByRole('region', { name: 'Chat' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  act(() => Recognition.latest.result('Review the tasks', true));
  await waitFor(() => expect(api.sendChat).toHaveBeenCalledExactlyOnceWith('Review the tasks'));
  vi.mocked(api.getChatHistory).mockResolvedValueOnce({ messages: [
    { role: 'user', text: 'Review the tasks' }, { role: 'assistant', text: 'New reply', source: 'local' },
  ] });
  fireEvent.click(screen.getByRole('button', { name: 'Harness' }));
  await screen.findByText('New reply');
  await waitFor(() => expect(screen.getByRole('log').querySelectorAll('.chat-message')).toHaveLength(2));
});


function detached(s: ReturnType<typeof setup>, widget = false) {
  s.rerender(<VoiceProvider client={s.client} speaker={s.speaker}>
    {widget ? <WidgetView /> : <VoiceControls collapsed={false} />}
  </VoiceProvider>);
}

function enableHandsFree() {
  fireEvent.click(screen.getByRole('switch', { name: 'Hands-free' }));
}

test.each([false, true])('direct Talk submits once without a chat (widget: %s)', async widget => {
  const s = setup();
  await ready();
  enableHandsFree();
  detached(s, widget);
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  await act(async () => Recognition.latest.result('  Direct question  ', true));
  await waitFor(() => expect(s.client.sendChat).toHaveBeenCalledExactlyOnceWith('Direct question'));
  expect(s.speaker.speak).not.toHaveBeenCalled();
});

test.each([false, true])('Hands-free off never submits without a chat (widget: %s)', async widget => {
  const s = setup();
  await ready();
  detached(s, widget);
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  await act(async () => Recognition.latest.result('Do not send', true));
  expect(s.client.sendChat).not.toHaveBeenCalled();
});

test('direct sends ignore interim, empty and concurrent finals and use latest playback switch', async () => {
  const s = setup();
  await ready();
  enableHandsFree();
  detached(s);
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  await act(async () => {
    Recognition.latest.result('draft', false);
    Recognition.latest.result('', true);
    Recognition.latest.result('   ', true);
  });
  expect(s.client.sendChat).not.toHaveBeenCalled();
  let resolve!: (value: { reply: string; source: string }) => void;
  s.client.sendChat.mockReturnValueOnce(new Promise(res => { resolve = res; }));
  act(() => {
    Recognition.latest.result('First', true);
    Recognition.latest.result('Second', true);
  });
  expect(s.client.sendChat).toHaveBeenCalledExactlyOnceWith('First');
  s.rerender(s.tree(false));
  fireEvent.click(screen.getByRole('switch', { name: 'Reply with voice' }));
  await act(async () => resolve({ reply: 'Direct reply', source: 'local' }));
  await waitFor(() => expect(s.speaker.speak).toHaveBeenCalledExactlyOnceWith('Direct reply', 'browser'));
  fireEvent.click(screen.getByRole('switch', { name: 'Reply with voice' }));
  detached(s);
  await act(async () => Recognition.latest.result('Third', true));
  expect(s.client.sendChat).toHaveBeenCalledTimes(2);
  expect(s.speaker.speak).toHaveBeenCalledOnce();
});

test('direct failure exposes a short error, settles once and permits another send', async () => {
  const s = setup();
  await ready();
  enableHandsFree();
  detached(s, true);
  s.client.sendChat.mockRejectedValueOnce(new Error('Unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  await act(async () => Recognition.latest.result('Question', true));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Could not get an answer.'));
  await act(async () => Recognition.latest.result('Retry', true));
  await waitFor(() => expect(s.client.sendChat).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('status')).not.toHaveTextContent('Could not get an answer.');
});

test.each([false, true])('direct exchange appears once when chat mounts (settles after mount: %s)', async afterMount => {
  const s = setup();
  await ready();
  enableHandsFree();
  detached(s);
  let resolve!: (value: { reply: string; source: string }) => void;
  s.client.sendChat.mockReturnValueOnce(new Promise(res => { resolve = res; }));
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  act(() => Recognition.latest.result('Away question', true));
  if (afterMount) {
    s.rerender(s.tree(false));
    await waitFor(() => expect(s.client.getChatHistory).toHaveBeenCalledTimes(2));
  }
  s.client.getChatHistory.mockResolvedValue({ messages: [
    { role: 'user', text: 'Away question' }, { role: 'assistant', text: 'Away reply', source: 'local' },
  ] });
  await act(async () => resolve({ reply: 'Away reply', source: 'local' }));
  if (!afterMount) s.rerender(s.tree(false));
  await screen.findByText('Away reply');
  await waitFor(() => {
    expect(screen.getByRole('log').querySelectorAll('.chat-message')).toHaveLength(2);
    expect(s.client.getChatHistory).toHaveBeenCalledTimes(afterMount ? 3 : 2);
  });
  expect(s.client.sendChat).toHaveBeenCalledOnce();
});


function DirectObserver({ settled }: { settled: () => void }) {
  const voice = useVoice();
  const subscribe = voice?.onChatSettled;
  React.useEffect(() => subscribe?.(settled), [subscribe, settled]);
  return <button onClick={() => voice?.setHandsFree(true)}>Enable automatic sending</button>;
}

test('direct success and failure each notify once; missing sendChat stays safe', async () => {
  const s = setup();
  await ready();
  const settled = vi.fn();
  const tree = (client: Parameters<typeof VoiceProvider>[0]['client']) => <VoiceProvider client={client} speaker={s.speaker}>
    <DirectObserver settled={settled} /><WidgetView />
  </VoiceProvider>;
  s.rerender(tree(s.client));
  fireEvent.click(screen.getByRole('button', { name: 'Enable automatic sending' }));
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  await act(async () => Recognition.latest.result('Success', true));
  await waitFor(() => expect(settled).toHaveBeenCalledOnce());
  s.client.sendChat.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => Recognition.latest.result('Failure', true));
  await waitFor(() => expect(settled).toHaveBeenCalledTimes(2));
  const { sendChat: _sendChat, ...client } = s.client;
  s.rerender(tree(client));
  await act(async () => Recognition.latest.result('No method', true));
  expect(settled).toHaveBeenCalledTimes(2);
  expect(s.client.sendChat).toHaveBeenCalledTimes(2);
});
