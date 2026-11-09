// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { openWidget } from '../../src/widget/openWidget';
import { WidgetView } from '../../src/widget/WidgetView';
import { Sidebar } from '../../src/components/Sidebar';
import { useVoice } from '../../src/voice/VoiceProvider';
import App from '../../src/App';

vi.mock('../../src/voice/VoiceProvider', () => ({
  VoiceProvider: ({ children }: { children: ReactNode }) => children,
  useVoice: vi.fn(() => null),
}));
vi.mock('../../src/hooks/useAgentStatus', () => ({ useAgentStatus: () => 'ready' }));
vi.mock('../../src/components/VoiceControls', () => ({ VoiceControls: () => null }));
vi.mock('../../src/views/HomeView', () => ({ HomeView: () => <div>Home</div> }));

const blocked = 'The widget window was blocked. Allow pop-ups for this page and try again.';

function fakeWindow() {
  const events = new EventTarget();
  const target = {
    document: document.implementation.createHTMLDocument(''),
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    close: vi.fn(), focus: vi.fn(),
  };
  Object.defineProperty(target.document, 'defaultView', { value: window });
  return { target, window: target as unknown as Window, hide: () => events.dispatchEvent(new Event('pagehide')) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(useVoice).mockReturnValue(null);
});

test('uses Picture-in-Picture with the compact dimensions and clones local styles', async () => {
  const fake = fakeWindow();
  const source = document.implementation.createHTMLDocument('Source');
  const link = source.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/widget.css';
  const style = source.createElement('style');
  style.textContent = '.widget { color: teal; }';
  source.head.append(link, style);
  const requestWindow = vi.fn().mockResolvedValue(fake.window);
  const open = vi.fn();
  const result = await openWidget({ pictureInPicture: { requestWindow }, open, source });
  expect(result).toEqual({ ok: true, handle: { window: fake.window, kind: 'picture-in-picture' } });
  expect(requestWindow).toHaveBeenCalledExactlyOnceWith({ width: 280, height: 340 });
  expect(open).not.toHaveBeenCalled();
  expect(fake.target.document.title).toBe('Harness');
  expect(fake.target.document.body).toHaveClass('widget-document');
  const clones = fake.target.document.head.querySelectorAll('link, style');
  expect(clones).toHaveLength(2);
  expect(clones[0]).not.toBe(link);
  expect(clones[0].isEqualNode(link)).toBe(true);
  expect(clones[1]).not.toBe(style);
  expect(clones[1].isEqualNode(style)).toBe(true);
  expect(source.head.contains(link)).toBe(true);
  expect(source.head.contains(style)).toBe(true);
});

test.each([false, true])('falls back to popup (Picture-in-Picture rejection: %s)', async rejected => {
  const fake = fakeWindow();
  const open = vi.fn().mockReturnValue(fake.window);
  const result = await openWidget({ pictureInPicture: rejected ? { requestWindow: vi.fn().mockRejectedValue(new Error('Denied')) } : undefined, open });
  expect(result).toEqual({ ok: true, handle: { window: fake.window, kind: 'popup' } });
  expect(open).toHaveBeenCalledExactlyOnceWith('', 'harness-widget', 'popup=yes,width=280,height=340');
});

test.each([false, true])('returns a helpful message for a blocked popup (throws: %s)', async throws => {
  const open = vi.fn(() => { if (throws) throw new Error('Denied'); return null; });
  await expect(openWidget({ pictureInPicture: undefined, open })).resolves.toEqual({ ok: false, message: blocked });
});

test('WidgetView without a provider contains only the orb, status, and Talk', () => {
  const { container } = render(<WidgetView />);
  expect(container.querySelector('.widget')?.children).toHaveLength(3);
  expect(screen.getByRole('img')).toHaveAttribute('data-state', 'idle');
  expect(screen.getByRole('status')).toHaveTextContent('Idle');
  expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'Talk' })]);
  expect(container.querySelector('input, a, select')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
});

test('WidgetView follows voice state, reports errors, and toggles Talk', () => {
  const talk = vi.fn();
  const voice = { orbState: 'idle', listening: false, speaking: false, talk, error: null } as unknown as NonNullable<ReturnType<typeof useVoice>>;
  vi.mocked(useVoice).mockReturnValue(voice);
  const { rerender } = render(<WidgetView />);
  expect(screen.getByRole('status')).toHaveTextContent('Idle');
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  vi.mocked(useVoice).mockReturnValue({ ...voice, orbState: 'listening', listening: true });
  rerender(<WidgetView />);
  expect(screen.getByRole('status')).toHaveTextContent('Listening...');
  expect(screen.getByRole('img')).toHaveAttribute('data-state', 'listening');
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
  expect(talk).toHaveBeenCalledOnce();
  vi.mocked(useVoice).mockReturnValue({ ...voice, orbState: 'speaking', speaking: true, error: 'Voice unavailable.' });
  rerender(<WidgetView />);
  expect(screen.getByRole('status')).toHaveTextContent('Speaking... Voice unavailable.');
  expect(screen.getByRole('img')).toHaveAttribute('data-state', 'speaking');
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
});

test('Sidebar exposes optional Widget mode and keeps collapsed errors in the title', () => {
  const props = { view: 'harness' as const, onNavigate: vi.fn(), collapsed: false, onToggleCollapsed: vi.fn(), agentStatus: 'ready' as const };
  const { rerender } = render(<Sidebar {...props} />);
  expect(screen.queryByRole('button', { name: 'Widget mode' })).not.toBeInTheDocument();
  const onToggleWidget = vi.fn();
  rerender(<Sidebar {...props} onToggleWidget={onToggleWidget} />);
  expect(screen.getByRole('button', { name: 'Widget mode' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Widget mode' }));
  expect(onToggleWidget).toHaveBeenCalledOnce();
  rerender(<Sidebar {...props} onToggleWidget={onToggleWidget} widgetOpen widgetError={blocked} />);
  expect(screen.getByRole('button', { name: 'Widget mode' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('alert')).toHaveTextContent(blocked);
  rerender(<Sidebar {...props} collapsed onToggleWidget={onToggleWidget} widgetError={blocked} />);
  expect(screen.getByRole('button', { name: 'Widget mode' })).toHaveAttribute('title', blocked);
  expect(screen.queryByText('Widget mode')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('App opens a portal, toggles closed, follows pagehide, and cleans up on unmount', async () => {
  const fake = fakeWindow();
  const open = vi.spyOn(window, 'open').mockReturnValue(fake.window);
  vi.stubGlobal('documentPictureInPicture', undefined);
  const { unmount } = render(<App />);
  const button = screen.getByRole('button', { name: 'Widget mode' });
  fireEvent.click(button);
  await waitFor(() => expect(within(fake.target.document.body).getByRole('button', { name: 'Talk' })).toBeInTheDocument());
  expect(button).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(button);
  expect(fake.target.close).toHaveBeenCalledOnce();
  expect(fake.target.document.body).toBeEmptyDOMElement();
  act(() => { fake.hide(); fake.hide(); });
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  act(() => fake.hide());
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(fake.target.document.body).toBeEmptyDOMElement();
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  expect(open).toHaveBeenCalledTimes(3);
  const listener = fake.target.addEventListener.mock.calls.at(-1)![1];
  unmount();
  expect(fake.target.close).toHaveBeenCalledTimes(2);
  expect(fake.target.removeEventListener).toHaveBeenCalledWith('pagehide', listener);
  act(() => fake.hide());
});

test('App shows blocked errors and clears them on the next attempt', async () => {
  const fake = fakeWindow();
  vi.stubGlobal('documentPictureInPicture', undefined);
  vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValue(fake.window);
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Widget mode' }));
  await screen.findByRole('alert');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(blocked));
  fireEvent.click(screen.getByRole('button', { name: 'Widget mode' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  await waitFor(() => expect(within(fake.target.document.body).getByRole('button', { name: 'Talk' })).toBeInTheDocument());
});

test('App closes a pending widget when it resolves after unmount', async () => {
  const fake = fakeWindow();
  let resolve!: (target: Window) => void;
  const requestWindow = vi.fn(() => new Promise<Window>(done => { resolve = done; }));
  vi.stubGlobal('documentPictureInPicture', { requestWindow });
  const { unmount } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Widget mode' }));
  fireEvent.click(screen.getByRole('button', { name: 'Widget mode' }));
  expect(requestWindow).toHaveBeenCalledOnce();
  unmount();
  await act(async () => resolve(fake.window));
  expect(fake.target.close).toHaveBeenCalledOnce();
  expect(fake.target.addEventListener).not.toHaveBeenCalled();
});
