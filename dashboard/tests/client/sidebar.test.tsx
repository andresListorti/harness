import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, VIEWS } from '../../src/components/Sidebar';
import { useAgentStatus } from '../../src/hooks/useAgentStatus';
import { api } from '../../src/lib/api';
import App from '../../src/App';

vi.mock('../../src/lib/api', () => ({ api: {
  getHealth: vi.fn(),
  getGalaxy: vi.fn().mockResolvedValue({ nodes: [] }),
  getAgents: vi.fn().mockResolvedValue({ agents: [] }),
  getPlan: vi.fn().mockResolvedValue({ source: 'dashboard', tasks: [] }),
  getRunLog: vi.fn().mockResolvedValue({ source: 'dashboard', entries: [] }),
  getChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  clearChatHistory: vi.fn().mockResolvedValue({ messages: [] }),
  getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
  sendChat: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({ orchestrator: 'claude-code', worker: 'codex', voice: 'browser' }),
  getVoiceProviders: vi.fn().mockResolvedValue({ providers: [] }),
  saveSettings: vi.fn(),
} }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function sidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props = { view: 'harness' as const, collapsed: false, agentStatus: 'ready' as const, onNavigate: vi.fn(), onToggleCollapsed: vi.fn(), ...overrides };
  return { ...render(<Sidebar {...props} />), props };
}

test('lists views in order, marks the active page, and navigates', async () => {
  const user = userEvent.setup();
  const { props } = sidebar();
  const buttons = within(screen.getByRole('navigation')).getAllByRole('button');
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(VIEWS.map(view => view.label));
  expect(buttons.at(-1)).toHaveAccessibleName('Settings');
  expect(buttons).toHaveLength(5);
  expect(buttons[0]).toHaveAttribute('aria-current', 'page');
  for (const [index, view] of VIEWS.entries()) {
    if (index > 0) expect(buttons[index]).not.toHaveAttribute('aria-current');
    await user.click(buttons[index]);
    expect(props.onNavigate).toHaveBeenLastCalledWith(view.id);
  }
});

test('toggles the menu and removes collapsed labels while retaining names', async () => {
  const user = userEvent.setup();
  const { props, rerender } = sidebar();
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(props.onToggleCollapsed).toHaveBeenCalledOnce();
  rerender(<Sidebar {...props} collapsed />);
  expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
  for (const { label } of VIEWS) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  }
  expect(screen.getByRole('status')).toHaveAccessibleName('Agents ready');
  expect(screen.queryByText('Agents ready')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Full screen' })).toBeInTheDocument();
});

test.each([
  ['checking', 'Checking agents'], ['ready', 'Agents ready'], ['offline', 'Agents offline'],
] as const)('shows %s agent status', (agentStatus, text) => {
  sidebar({ agentStatus });
  expect(screen.getByRole('status')).toHaveTextContent(text);
});

test('requests fullscreen and follows fullscreenchange to exit', async () => {
  const request = vi.fn().mockResolvedValue(undefined);
  const exit = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
  const exitOriginal = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  try {
    sidebar();
    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(request).toHaveBeenCalledOnce();
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    fireEvent(document, new Event('fullscreenchange'));
    await userEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(exit).toHaveBeenCalledOnce();
  } finally {
    if (original) Object.defineProperty(document, 'fullscreenElement', original);
    else Reflect.deleteProperty(document, 'fullscreenElement');
    if (exitOriginal) Object.defineProperty(document, 'exitFullscreen', exitOriginal);
    else Reflect.deleteProperty(document, 'exitFullscreen');
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  }
});

test('handles missing and rejected fullscreen APIs', async () => {
  sidebar();
  await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: vi.fn().mockRejectedValue(new Error('Denied')) });
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
  } finally {
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  }
});

test('checks health, goes offline, polls and recovers, and clears its timer', async () => {
  vi.useFakeTimers();
  const client = { getHealth: vi.fn().mockResolvedValueOnce({ status: 'ok' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ status: 'ok' }) };
  const { result, unmount } = renderHook(() => useAgentStatus(client, 100));
  expect(result.current).toBe('checking');
  await act(async () => {});
  expect(result.current).toBe('ready');
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(result.current).toBe('offline');
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(result.current).toBe('ready');
  unmount();
  await vi.advanceTimersByTimeAsync(500);
  expect(client.getHealth).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

test.each([true, false])('ignores a pending health result after unmount (success: %s)', async success => {
  let resolve!: (value: { status: 'ok' }) => void;
  let reject!: (reason: Error) => void;
  const client = { getHealth: vi.fn(() => new Promise<{ status: 'ok' }>((res, rej) => { resolve = res; reject = rej; })) };
  const { result, unmount } = renderHook(() => useAgentStatus(client));
  unmount();
  await act(async () => {
    if (success) resolve({ status: 'ok' });
    else reject(new Error('Offline'));
  });
  expect(result.current).toBe('checking');
});

test.each([true, false])('App shows health status and switches views (healthy: %s)', async healthy => {
  const health = vi.mocked(api.getHealth);
  if (healthy) health.mockResolvedValue({ status: 'ok' });
  else health.mockRejectedValue(new Error('Offline'));
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText(healthy ? 'Agents ready' : 'Agents offline')).toBeInTheDocument();
  await waitFor(() => expect(api.getHealth).toHaveBeenCalled());
  for (const name of ['Agents', 'Galaxy', 'Plan', 'Settings']) {
    await user.click(screen.getByRole('button', { name }));
    expect(within(screen.getByRole('main')).getByRole('heading', { name })).toBeInTheDocument();
  }
  await waitFor(() => expect(screen.getByRole('radiogroup', { name: 'Orchestrator' })).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: 'Close menu' }));
  expect(screen.queryByText('Galaxy')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open menu' }));
  expect(screen.getByText('Galaxy')).toBeInTheDocument();
});

