// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Settings, SettingsResponse } from '../../shared/api';
import { notifySettingsChanged, SETTINGS_CHANGED_EVENT } from '../../src/lib/settings-events';
import { SettingsView } from '../../src/views/SettingsView';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const initial: SettingsResponse = { orchestrator: 'claude-code', worker: 'codex', voice: 'openai', chatModel: 'sonnet' };
function clientFor() {
  const client = {
    getSettings: vi.fn().mockResolvedValue(initial),
    getVoiceProviders: vi.fn().mockResolvedValue({ providers: [
      { id: 'fish-audio', available: false }, { id: 'elevenlabs', available: true }, { id: 'openai', available: true },
    ] }),
    saveSettings: vi.fn(async (settings: Settings): Promise<SettingsResponse> => ({
      ...settings, chatModel: settings.chatModel ?? 'sonnet', worker: settings.orchestrator === 'codex' ? 'claude-code' : 'codex',
    })),
  };
  client.saveSettings.mockImplementation(async settings => {
    const result: SettingsResponse = { ...settings, chatModel: settings.chatModel ?? 'sonnet', worker: settings.orchestrator === 'codex' ? 'claude-code' : 'codex' };
    client.getSettings.mockResolvedValue(result);
    return result;
  });
  return client;
}
async function ready() {
  await screen.findByRole('radiogroup', { name: 'Orchestrator' });
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeEnabled());
}

test('loads settings and exposes only radio choices, without credential fields', async () => {
  let resolve!: (settings: SettingsResponse) => void;
  const client = clientFor();
  client.getSettings.mockReturnValue(new Promise<SettingsResponse>(res => { resolve = res; }));
  const { container } = render(<SettingsView client={client} />);
  expect(screen.getByText('Loading settings...')).toHaveAttribute('aria-busy', 'true');
  await act(async () => resolve(initial));
  await ready();
  expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Codex Worker' })).not.toBeChecked();
  expect(client.getVoiceProviders).toHaveBeenCalledOnce();
  expect(container.querySelector('input[type="text"], input[type="password"], input[type="search"], input:not([type]), textarea')).toBeNull();
});

test('shows a loading error and retries', async () => {
  const client = clientFor();
  client.getSettings.mockRejectedValueOnce(new Error('Unavailable'));
  render(<SettingsView client={client} />);
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not load settings.'));
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await ready();
  expect(client.getSettings).toHaveBeenCalledTimes(2);
});

test('saves the orchestrator with the current voice and uses server roles', async () => {
  const client = clientFor();
  let resolve!: (settings: SettingsResponse) => void;
  client.saveSettings.mockReturnValueOnce(new Promise<SettingsResponse>(res => { resolve = res; }));
  render(<SettingsView client={client} />);
  await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  expect(client.saveSettings).toHaveBeenCalledExactlyOnceWith({ orchestrator: 'codex', voice: 'openai' });
  for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeChecked();
  await act(async () => resolve({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser', chatModel: 'sonnet' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Codex Orchestrator' })).toBeChecked());
  expect(screen.getByRole('radio', { name: 'Claude Code Worker' })).not.toBeChecked();
  expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked();
});

test('keeps the previous selection after a save failure and allows retry', async () => {
  const client = clientFor();
  client.saveSettings.mockRejectedValueOnce(new Error('Unavailable'));
  render(<SettingsView client={client} />);
  await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeEnabled());
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save settings.');
  expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeChecked();
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Codex Orchestrator' })).toBeChecked());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('disables unconfigured voices, enables configured voices, and saves voice choices', async () => {
  const client = clientFor();
  render(<SettingsView client={client} />);
  await ready();
  const unavailable = screen.getByRole('radio', { name: 'Fish Audio Not configured Set its keys in .env' });
  expect(unavailable).toBeDisabled();
  await userEvent.click(unavailable);
  expect(client.saveSettings).not.toHaveBeenCalled();
  expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeEnabled();
  expect(screen.getByRole('radio', { name: 'ElevenLabs' })).toBeEnabled();
  await userEvent.click(screen.getByRole('radio', { name: 'ElevenLabs' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'ElevenLabs' })).toBeChecked());
  expect(client.saveSettings).toHaveBeenLastCalledWith({ orchestrator: 'claude-code', voice: 'elevenlabs' });
  expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeEnabled();
  await userEvent.click(screen.getByRole('radio', { name: 'Browser voice' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked());
  expect(client.saveSettings).toHaveBeenLastCalledWith({ orchestrator: 'claude-code', voice: 'browser' });
});

test('keeps Browser voice usable if provider availability fails', async () => {
  const client = clientFor();
  client.getVoiceProviders.mockRejectedValue(new Error('Unavailable'));
  render(<SettingsView client={client} />);
  await ready();
  for (const name of ['Fish Audio', 'ElevenLabs', 'OpenAI']) {
    expect(screen.getByRole('radio', { name: `${name} Not configured Set its keys in .env` })).toBeDisabled();
  }
  expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeEnabled();
  await userEvent.click(screen.getByRole('radio', { name: 'Browser voice' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});


test('saves the sidebar voice when changing the orchestrator', async () => {
  const client = clientFor();
  client.getSettings.mockResolvedValue({ ...initial, voice: 'browser' });
  render(<SettingsView client={client} />);
  await ready();
  client.getSettings.mockResolvedValue({ ...initial, voice: 'fish-audio' });
  await act(async () => notifySettingsChanged());
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  await waitFor(() => expect(client.saveSettings).toHaveBeenCalledWith({ orchestrator: 'codex', voice: 'fish-audio' }));
});


function deferredSettings() {
  let resolve!: (settings: SettingsResponse) => void;
  const promise = new Promise<SettingsResponse>(res => { resolve = res; });
  return { promise, resolve };
}

test('shows sidebar voice changes and preserves the saved orchestrator on the next save', async () => {
  const client = clientFor();
  render(<SettingsView client={client} />);
  await ready();
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Codex Orchestrator' })).toBeChecked());
  client.getSettings.mockResolvedValue({ orchestrator: 'codex', worker: 'claude-code', voice: 'fish-audio' });
  await act(async () => notifySettingsChanged());
  await waitFor(() => expect(screen.getByRole('radio', { name: /Fish Audio/ })).toBeChecked());
  expect(screen.queryByText('Loading settings...')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'ElevenLabs' }));
  await waitFor(() => expect(client.saveSettings).toHaveBeenLastCalledWith({ orchestrator: 'codex', voice: 'elevenlabs' }));
});

test('failed silent reads preserve selections without an alert', async () => {
  const client = clientFor();
  render(<SettingsView client={client} />);
  await ready();
  client.getSettings.mockRejectedValueOnce(new Error('Unavailable'));
  await act(async () => notifySettingsChanged());
  await waitFor(() => expect(client.getSettings).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('radio', { name: 'OpenAI' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Claude Code Orchestrator' })).toBeChecked();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('ignores older reads when a newer event has completed', async () => {
  const client = clientFor();
  const older = deferredSettings();
  render(<SettingsView client={client} />);
  await ready();
  client.getSettings.mockReturnValueOnce(older.promise);
  await act(async () => notifySettingsChanged());
  client.getSettings.mockResolvedValue({ ...initial, voice: 'browser' });
  await act(async () => notifySettingsChanged());
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked());
  await act(async () => older.resolve(initial));
  expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked();
});

test('ignores pending reads after a save and skips events during the save without looping', async () => {
  const client = clientFor();
  const older = deferredSettings();
  const saved = deferredSettings();
  render(<SettingsView client={client} />);
  await ready();
  client.getSettings.mockReturnValueOnce(older.promise);
  await act(async () => notifySettingsChanged());
  client.saveSettings.mockReturnValueOnce(saved.promise);
  await userEvent.click(screen.getByRole('radio', { name: 'Codex Worker' }));
  await act(async () => notifySettingsChanged());
  expect(client.getSettings).toHaveBeenCalledTimes(2);
  await act(async () => saved.resolve({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser', chatModel: 'sonnet' }));
  await waitFor(() => expect(screen.getByRole('radio', { name: 'Codex Orchestrator' })).toBeChecked());
  await act(async () => older.resolve(initial));
  expect(screen.getByRole('radio', { name: 'Browser voice' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Codex Orchestrator' })).toBeChecked();
  expect(client.getSettings).toHaveBeenCalledTimes(2);
});

test('removes the listener and ignores pending reads on unmount', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
  const client = clientFor();
  const pending = deferredSettings();
  const view = render(<SettingsView client={client} />);
  await ready();
  client.getSettings.mockReturnValueOnce(pending.promise);
  await act(async () => notifySettingsChanged());
  const listener = add.mock.calls.find(([name]) => name === SETTINGS_CHANGED_EVENT)![1];
  view.unmount();
  expect(remove).toHaveBeenCalledWith(SETTINGS_CHANGED_EVENT, listener);
  await act(async () => {
    pending.resolve({ ...initial, voice: 'browser' });
    notifySettingsChanged();
  });
  expect(client.getSettings).toHaveBeenCalledTimes(2);
  expect(warning).not.toHaveBeenCalled();
});
