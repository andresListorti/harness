// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLAUDE_MODELS, CODEX_CHAT_NOTICE, type SettingsResponse, type ChatResponse } from '../../shared/api';
import { ChatPanel } from '../../src/components/ChatPanel';
import { notifySettingsChanged, SETTINGS_CHANGED_EVENT } from '../../src/lib/settings-events';
import { ApiError, createApiClient } from '../../src/lib/api';
import * as voiceContext from '../../src/voice/VoiceProvider';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const client = {
    getSettings: vi.fn<() => Promise<SettingsResponse>>().mockResolvedValue({ orchestrator: 'codex', voice: 'openai', worker: 'claude-code', chatModel: 'opus' }),
    saveSettings: vi.fn().mockResolvedValue({ orchestrator: 'claude-code', voice: 'openai', worker: 'codex', chatModel: 'haiku' }),
    getChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    clearChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
    getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: ['What is next?', 'Latest commits?'] }),
    sendChat: vi.fn<(text: string) => Promise<ChatResponse>>().mockResolvedValue({ reply: 'The next task.', source: 'local' }),
  };
  return { client, user: userEvent.setup() };
}

test('suggestions send exact text and show ordered local answers in the live conversation', async () => {
  const { client, user } = setup();
  render(<ChatPanel client={client} />);
  expect(client.getChatSuggestions).toHaveBeenCalledOnce();
  expect(screen.getByText(/Ask about tasks, commits, runs, or tests/)).toBeInTheDocument();
  const group = await screen.findByRole('group', { name: 'Suggested questions' });
  await user.click(within(group).getByRole('button', { name: 'What is next?' }));
  expect(client.sendChat).toHaveBeenCalledWith('What is next?');
  const log = screen.getByRole('log', { name: 'Conversation' });
  expect(log).toHaveAttribute('aria-live', 'polite');
  await waitFor(() => expect(Array.from(log.querySelectorAll('.chat-message p')).map(node => node.textContent)).toEqual(['What is next?', 'The next task.']));
  expect(within(log).getByText('Local answer')).toBeInTheDocument();
});

test('Send and Enter trim input, clear the field, and ignore empty input', async () => {
  const { client, user } = setup();
  render(<ChatPanel client={client} />);
  const field = screen.getByRole('textbox', { name: 'Message' });
  expect(field).toHaveAttribute('maxlength', '2000');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  await user.type(field, '   {Enter}');
  expect(client.sendChat).not.toHaveBeenCalled();
  await user.type(field, ' first  ');
  await user.click(screen.getByRole('button', { name: 'Send' }));
  expect(client.sendChat).toHaveBeenLastCalledWith('first');
  expect(field).toHaveValue('');
  await user.type(field, 'second{Enter}');
  expect(client.sendChat).toHaveBeenLastCalledWith('second');
  expect(field).toHaveValue('');
});

test('pending disables Send, Enter and chips, shows Thinking, and recovers', async () => {
  const { client, user } = setup();
  const answer = deferred<ChatResponse>();
  client.sendChat.mockReturnValueOnce(answer.promise);
  render(<ChatPanel client={client} />);
  const chip = await screen.findByRole('button', { name: 'What is next?' });
  await user.click(chip);
  expect(screen.getByRole('status')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  for (const button of within(screen.getByRole('group')).getAllByRole('button')) expect(button).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'another{Enter}');
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);
  await user.click(chip);
  expect(client.sendChat).toHaveBeenCalledTimes(1);
  await act(async () => answer.resolve({ reply: 'Done', source: 'local' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  expect(chip).toBeEnabled();
  await user.type(screen.getByRole('textbox'), '{Enter}');
  expect(client.sendChat).toHaveBeenCalledTimes(2);
});

test('renders HTML literally and preserves multiline text with CSS', async () => {
  const { client, user } = setup();
  const reply = '<' + 'img src=x onerror=alert(1)>\n<b>bold</b>';
  client.sendChat.mockResolvedValue({ reply, source: 'local' });
  render(<ChatPanel client={client} />);
  await user.click(await screen.findByRole('button', { name: 'What is next?' }));
  const log = screen.getByRole('log');
  await waitFor(() => expect(log.querySelector('.chat-message--assistant p')?.textContent).toBe(reply));
  expect(log.querySelector('img, b')).toBeNull();
  const css = readFileSync('src/components/ChatPanel.css', 'utf8');
  expect(css).toMatch(/\.chat-message p\s*\{\s*white-space:\s*pre-wrap;/);
  const source = readFileSync('src/components/ChatPanel.tsx', 'utf8');
  expect(source).not.toContain('dangerouslySetInnerHTML');
});

test.each([true, false])('shows safe errors and clears them on next send (ApiError: %s)', async typed => {
  const { client, user } = setup();
  const failure = typed ? new ApiError('Unavailable', 'FAILED', 500) : new Error('private body');
  Object.assign(failure, { body: 'private body' });
  client.sendChat.mockRejectedValueOnce(failure);
  render(<ChatPanel client={client} />);
  await user.click(await screen.findByRole('button', { name: 'What is next?' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(typed ? 'Could not get an answer: Unavailable' : 'Could not get an answer.');
  expect(screen.queryByText(/private body/)).not.toBeInTheDocument();
  const answer = deferred<ChatResponse>();
  client.sendChat.mockReturnValueOnce(answer.promise);
  await user.click(screen.getByRole('button', { name: 'Latest commits?' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await act(async () => answer.resolve({ reply: 'Recovered', source: 'local' }));
});

test('New chat clears messages, error and field and is disabled when empty', async () => {
  const { client, user } = setup();
  client.sendChat.mockRejectedValueOnce(new Error());
  render(<ChatPanel client={client} />);
  const reset = screen.getByRole('button', { name: 'New chat' });
  expect(reset).toBeDisabled();
  await user.click(await screen.findByRole('button', { name: 'What is next?' }));
  await screen.findByRole('alert');
  await user.type(screen.getByRole('textbox'), 'draft');
  await user.click(reset);
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('log').querySelector('.chat-message')).toBeNull();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(reset).toBeDisabled();
});

test.each([true, false])('ignores old results after reset while a new request is pending (success: %s)', async success => {
  const { client, user } = setup();
  const old = deferred<ChatResponse>();
  const fresh = deferred<ChatResponse>();
  client.sendChat.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  render(<ChatPanel client={client} />);
  const chip = await screen.findByRole('button', { name: 'What is next?' });
  await user.click(chip);
  await user.click(screen.getByRole('button', { name: 'New chat' }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await user.click(chip);
  await act(async () => { if (success) old.resolve({ reply: 'Stale', source: 'local' }); else old.reject(new Error()); });
  expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
  await act(async () => fresh.resolve({ reply: 'Fresh', source: 'local' }));
  expect(screen.getByText('Fresh')).toBeInTheDocument();
});

test('suggestion failure is silent and future milestone controls are absent', async () => {
  const { client } = setup();
  client.getChatSuggestions.mockRejectedValue(new Error('Unavailable'));
  render(<ChatPanel client={client} />);
  await act(async () => {});
  expect(screen.queryByRole('group', { name: 'Suggested questions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  for (const role of ['button', 'checkbox', 'switch', 'combobox']) {
    expect(screen.queryByRole(role, { name: /microphone|voice|hands.free|model/i })).not.toBeInTheDocument();
  }
});

test.each([true, false])('ignores suggestions arriving after unmount (success: %s)', async success => {
  const { client } = setup();
  const suggestions = deferred<{ suggestions: string[] }>();
  client.getChatSuggestions.mockReturnValue(suggestions.promise);
  const { unmount } = render(<ChatPanel client={client} />);
  unmount();
  await act(async () => { if (success) suggestions.resolve({ suggestions: ['Late'] }); else suggestions.reject(new Error()); });
  expect(screen.queryByRole('button', { name: 'Late' })).not.toBeInTheDocument();
});


test('loads saved history literally and restores it after remount', async () => {
  const { client, user } = setup();
  const messages = [{ role: 'user', text: '<b>saved</b>' }, { role: 'assistant', text: 'Saved reply', source: 'local' }];
  client.getChatHistory.mockResolvedValue({ messages });
  const first = render(<ChatPanel client={client} />);
  await screen.findByText('Saved reply');
  await waitFor(() => expect(screen.getByRole('log').querySelectorAll('.chat-message')).toHaveLength(2));
  expect(screen.getByText('<b>saved</b>')).toBeInTheDocument();
  expect(screen.getByRole('log').querySelector('b')).toBeNull();
  first.unmount();
  render(<ChatPanel client={client} />);
  await screen.findByText('Saved reply');
  await waitFor(() => expect(client.getChatHistory).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole('button', { name: 'New chat' }));
  await waitFor(() => expect(screen.getByRole('log').querySelector('.chat-message')).toBeNull());
  expect(client.clearChatHistory).toHaveBeenCalledOnce();
});

test('failed clear keeps the conversation and shows a safe alert', async () => {
  const { client, user } = setup();
  client.getChatHistory.mockResolvedValue({ messages: [{ role: 'user', text: 'Saved question' }] });
  client.clearChatHistory.mockRejectedValue(new Error('private detail'));
  render(<ChatPanel client={client} />);
  await screen.findByText('Saved question');
  await waitFor(() => expect(screen.getByRole('button', { name: 'New chat' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'New chat' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not clear the saved history.'));
  expect(screen.getByText('Saved question')).toBeInTheDocument();
});

test('failed history load leaves an empty usable conversation', async () => {
  const { client, user } = setup();
  client.getChatHistory.mockRejectedValue(new Error());
  render(<ChatPanel client={client} />);
  await screen.findByRole('group');
  await waitFor(() => expect(client.getChatHistory).toHaveBeenCalledOnce());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('log').querySelector('.chat-message')).toBeNull();
  await user.type(screen.getByRole('textbox'), 'tests{Enter}');
  await waitFor(() => expect(screen.getByText('The next task.')).toBeInTheDocument());
});

test('late history cannot replace messages sent by the user', async () => {
  const { client, user } = setup();
  const history = deferred<{ messages: [] }>();
  client.getChatHistory.mockReturnValue(history.promise);
  render(<ChatPanel client={client} />);
  await user.type(screen.getByRole('textbox'), 'tests{Enter}');
  await waitFor(() => expect(screen.getByText('The next task.')).toBeInTheDocument());
  await act(async () => history.resolve({ messages: [] }));
  expect(screen.getByText('tests')).toBeInTheDocument();
  expect(screen.getByText('The next task.')).toBeInTheDocument();
});


test('voice sink uses latest send, transcripts only fill input, and unmount unsubscribes', async () => {
  const first = setup();
  const second = setup();
  let sink!: (text: string) => void | Promise<void>;
  let transcript!: (text: string, final: boolean) => void;
  const removeSink = vi.fn();
  const removeTranscript = vi.fn();
  const removeSettled = vi.fn();
  const voice = {
    registerChatSink: vi.fn(handler => { sink = handler; return removeSink; }),
    onTranscript: vi.fn(handler => { transcript = handler; return removeTranscript; }),
    onChatSettled: vi.fn(() => removeSettled),
    speakReply: vi.fn(), handsFree: true,
  };
  vi.spyOn(voiceContext, 'useVoice').mockReturnValue(voice as unknown as NonNullable<ReturnType<typeof voiceContext.useVoice>>);
  const view = render(<ChatPanel client={first.client} />);
  await waitFor(() => expect(first.client.getChatHistory).toHaveBeenCalledOnce());
  act(() => transcript('Final draft', true));
  expect(screen.getByRole('textbox')).toHaveValue('Final draft');
  expect(first.client.sendChat).not.toHaveBeenCalled();
  view.rerender(<ChatPanel client={second.client} />);
  await act(async () => sink('Latest question'));
  await waitFor(() => expect(second.client.sendChat).toHaveBeenCalledExactlyOnceWith('Latest question'));
  expect(first.client.sendChat).not.toHaveBeenCalled();
  expect(voice.registerChatSink).toHaveBeenCalledOnce();
  view.unmount();
  expect(removeSink).toHaveBeenCalledOnce();
  expect(removeTranscript).toHaveBeenCalledOnce();
  expect(removeSettled).toHaveBeenCalledTimes(2);
});

test('settled history replaces messages, ignores older mount history and skips while busy', async () => {
  const { client, user } = setup();
  const oldHistory = deferred<{ messages: [] }>();
  client.getChatHistory.mockReturnValueOnce(oldHistory.promise);
  let settled!: () => void;
  vi.spyOn(voiceContext, 'useVoice').mockReturnValue({
    onChatSettled: (listener: () => void) => { settled = listener; return () => {}; },
    speakReply: vi.fn(),
  } as unknown as NonNullable<ReturnType<typeof voiceContext.useVoice>>);
  render(<ChatPanel client={client} />);
  client.getChatHistory.mockResolvedValue({ messages: [
    { role: 'user', text: 'Away question' }, { role: 'assistant', text: 'Away answer', source: 'local' },
  ] });
  await act(async () => settled());
  await screen.findByText('Away answer');
  await waitFor(() => expect(screen.getByRole('log').querySelectorAll('.chat-message')).toHaveLength(2));
  await act(async () => oldHistory.resolve({ messages: [] }));
  expect(screen.getByText('Away answer')).toBeInTheDocument();
  const answer = deferred<ChatResponse>();
  client.sendChat.mockReturnValueOnce(answer.promise);
  await user.type(screen.getByRole('textbox'), 'Live question{Enter}');
  act(() => settled());
  expect(client.getChatHistory).toHaveBeenCalledTimes(2);
  await act(async () => answer.resolve({ reply: 'Live answer', source: 'local' }));
});


const claudeSettings: SettingsResponse = { orchestrator: 'claude-code', worker: 'codex', voice: 'openai', chatModel: 'opus' };

test('Claude selector lists allowlisted models, saves all choices and notifies settings listeners', async () => {
  const { client, user } = setup();
  client.getSettings.mockResolvedValue(claudeSettings);
  const listener = vi.fn();
  window.addEventListener(SETTINGS_CHANGED_EVENT, listener);
  try {
    render(<ChatPanel client={client} />);
    const selector = await screen.findByRole('combobox', { name: 'Claude Code model' });
    await waitFor(() => expect(selector).toHaveValue('opus'));
    expect(within(selector).getAllByRole('option').map(option => option.getAttribute('value'))).toEqual([...CLAUDE_MODELS]);
    client.getSettings.mockResolvedValue({ ...claudeSettings, chatModel: 'haiku' });
    await user.selectOptions(selector, 'haiku');
    await waitFor(() => expect(selector).toHaveValue('haiku'));
    expect(client.saveSettings).toHaveBeenCalledExactlyOnceWith({ orchestrator: 'claude-code', voice: 'openai', chatModel: 'haiku' });
    expect(listener).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener(SETTINGS_CHANGED_EVENT, listener);
  }
});

test('failed model save restores the previous selection and shows an error', async () => {
  const { client, user } = setup();
  client.getSettings.mockResolvedValue(claudeSettings);
  const save = deferred<SettingsResponse>();
  client.saveSettings.mockReturnValueOnce(save.promise);
  render(<ChatPanel client={client} />);
  const selector = await screen.findByRole('combobox');
  await waitFor(() => expect(selector).toHaveValue('opus'));
  await user.selectOptions(selector, 'sonnet');
  expect(selector).toHaveValue('sonnet');
  expect(selector).toBeDisabled();
  await act(async () => save.reject(new Error('private detail')));
  await screen.findByRole('alert');
  await waitFor(() => expect(selector).toHaveValue('opus'));
  expect(selector).toBeEnabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save the chat model.');
});

test('Codex notice persists with safe documentation link and switches on settings events', async () => {
  const { client } = setup();
  render(<ChatPanel client={client} />);
  await screen.findByText(CODEX_CHAT_NOTICE);
  await waitFor(() => expect(client.getSettings).toHaveBeenCalledOnce());
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'Why?' });
  expect(link).toHaveAttribute('href', '/api/docs/chat-isolation');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  client.getSettings.mockResolvedValue(claudeSettings);
  act(() => notifySettingsChanged());
  await screen.findByRole('combobox');
  await waitFor(() => expect(screen.queryByText(CODEX_CHAT_NOTICE)).not.toBeInTheDocument());
  client.getSettings.mockResolvedValue({ ...claudeSettings, orchestrator: 'codex', worker: 'claude-code' });
  act(() => notifySettingsChanged());
  await screen.findByText(CODEX_CHAT_NOTICE);
  await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
});

test('failed settings reads hide controls and notice while chat keeps working', async () => {
  const { client, user } = setup();
  client.getSettings.mockRejectedValue(new Error('private detail'));
  render(<ChatPanel client={client} />);
  await screen.findByRole('group');
  await waitFor(() => expect(client.getSettings).toHaveBeenCalledOnce());
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText(CODEX_CHAT_NOTICE)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'What is next?' }));
  await screen.findByText('The next task.');
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test.each([true, false])('ignores stale settings reads and removes listener on unmount (success: %s)', async success => {
  const { client } = setup();
  const old = deferred<SettingsResponse>();
  client.getSettings.mockReturnValueOnce(old.promise).mockResolvedValue(claudeSettings);
  const remove = vi.spyOn(window, 'removeEventListener');
  const view = render(<ChatPanel client={client} />);
  act(() => notifySettingsChanged());
  await screen.findByRole('combobox');
  await waitFor(() => expect(client.getSettings).toHaveBeenCalledTimes(2));
  await act(async () => {
    if (success) old.resolve({ ...claudeSettings, orchestrator: 'codex' });
    else old.reject(new Error());
  });
  expect(screen.getByRole('combobox')).toHaveValue('opus');
  expect(screen.queryByText(CODEX_CHAT_NOTICE)).not.toBeInTheDocument();
  view.unmount();
  expect(remove).toHaveBeenCalledWith(SETTINGS_CHANGED_EVENT, expect.any(Function));
  act(() => notifySettingsChanged());
  expect(client.getSettings).toHaveBeenCalledTimes(2);
});

test('latest failed refresh hides previously loaded settings and late unmounted reads are ignored', async () => {
  const { client } = setup();
  const view = render(<ChatPanel client={client} />);
  await screen.findByText(CODEX_CHAT_NOTICE);
  await waitFor(() => expect(client.getSettings).toHaveBeenCalledOnce());
  client.getSettings.mockRejectedValueOnce(new Error());
  act(() => notifySettingsChanged());
  await waitFor(() => expect(screen.queryByText(CODEX_CHAT_NOTICE)).not.toBeInTheDocument());
  const late = deferred<SettingsResponse>();
  client.getSettings.mockReturnValueOnce(late.promise);
  act(() => notifySettingsChanged());
  view.unmount();
  await act(async () => late.resolve(claudeSettings));
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

test('assistant sources survive history and response notices are excluded from replies and voice input', async () => {
  const { client, user } = setup();
  client.getChatHistory.mockResolvedValue({ messages: [
    { role: 'assistant', text: 'Saved local', source: 'local' },
    { role: 'assistant', text: 'Saved orchestrator', source: 'orchestrator' },
    { role: 'assistant', text: 'Legacy reply' },
    { role: 'user', text: 'User message', source: 'local' },
  ] });
  client.sendChat.mockResolvedValue({ reply: '<b>New reply</b>', source: 'orchestrator', notice: 'Response notice' });
  const tracked = vi.fn();
  vi.spyOn(voiceContext, 'useVoice').mockReturnValue({ trackChatReply: tracked } as unknown as NonNullable<ReturnType<typeof voiceContext.useVoice>>);
  render(<ChatPanel client={client} />);
  await screen.findByText('Saved orchestrator');
  await waitFor(() => expect(screen.getAllByText('Orchestrator answer')).toHaveLength(1));
  expect(screen.getAllByText('Local answer')).toHaveLength(1);
  expect(screen.getByText('Legacy reply').parentElement?.querySelector('small')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'What is next?' }));
  await screen.findByText('<b>New reply</b>');
  await waitFor(() => expect(screen.getAllByText('Orchestrator answer')).toHaveLength(2));
  expect(screen.queryByText('Response notice')).not.toBeInTheDocument();
  expect(screen.getByRole('log').querySelector('b')).toBeNull();
  expect(tracked).toHaveBeenCalledOnce();
});

test('missing CLI server message reaches the existing error display as plain text', async () => {
  const { client, user } = setup();
  const message = 'Claude Code CLI is not installed. <b>Install it</b>';
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { code: 'CLI_NOT_FOUND', message } }, { status: 503 }));
  client.sendChat.mockImplementation(createApiClient(fetchMock).sendChat);
  render(<ChatPanel client={client} />);
  await user.click(await screen.findByRole('button', { name: 'What is next?' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
  expect(screen.getByRole('alert').querySelector('b')).toBeNull();
});
