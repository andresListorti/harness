// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Settings, SettingsResponse } from '../../shared/api';
import { SettingsView } from '../../src/views/SettingsView';

afterEach(cleanup);

const initial: SettingsResponse = { orchestrator: 'claude-code', worker: 'codex', voice: 'openai' };
function clientFor() {
  return {
    getSettings: vi.fn().mockResolvedValue(initial),
    getVoiceProviders: vi.fn().mockResolvedValue({ providers: [
      { id: 'fish-audio', available: false }, { id: 'elevenlabs', available: true }, { id: 'openai', available: true },
    ] }),
    saveSettings: vi.fn(async (settings: Settings): Promise<SettingsResponse> => ({
      ...settings, worker: settings.orchestrator === 'codex' ? 'claude-code' : 'codex',
    })),
  };
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
  await act(async () => resolve({ orchestrator: 'codex', worker: 'claude-code', voice: 'browser' }));
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
