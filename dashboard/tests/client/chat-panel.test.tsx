// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatResponse } from '../../shared/api';
import { ChatPanel } from '../../src/components/ChatPanel';
import { ApiError } from '../../src/lib/api';

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup() {
  const client = {
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
  expect(screen.getByText('Thinking…')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  for (const button of within(screen.getByRole('group')).getAllByRole('button')) expect(button).toBeDisabled();
  await user.type(screen.getByRole('textbox'), 'another{Enter}');
  fireEvent.submit(screen.getByRole('button', { name: 'Send' }).closest('form')!);
  await user.click(chip);
  expect(client.sendChat).toHaveBeenCalledTimes(1);
  await act(async () => answer.resolve({ reply: 'Done', source: 'local' }));
  expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
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
  expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  await user.click(chip);
  await act(async () => { if (success) old.resolve({ reply: 'Stale', source: 'local' }); else old.reject(new Error()); });
  expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Thinking…')).toBeInTheDocument();
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
