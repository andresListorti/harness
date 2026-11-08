// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Galaxy } from '../../shared/api';
import { ApiError } from '../../src/lib/api';
import { GalaxyView } from '../../src/views/GalaxyView';
import { initialCamera, layoutGalaxy, worldToScreen } from '../../src/galaxy/camera';
import { nodes, recordingContext } from './galaxy-fixture';
const viewport = { width: 800, height: 600 };
let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
let recording: ReturnType<typeof recordingContext>;
beforeEach(() => {
  callbacks = new Map(); nextId = 0; recording = recordingContext();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recording.context);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(viewport.width);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(viewport.height);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => callbacks.delete(id)));
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  vi.stubGlobal('PointerEvent', MouseEvent);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const clientFor = (data = nodes) => ({ getGalaxy: vi.fn<() => Promise<Galaxy>>().mockResolvedValue({ nodes: data }) });
function deferred() { let resolve!: (value: Galaxy) => void; const promise = new Promise<Galaxy>(res => { resolve = res; }); return { promise, resolve }; }
async function ready(client = clientFor()) { const view = render(<GalaxyView client={client} />); await screen.findByRole('list', { name: 'Galaxy systems' }); return { ...view, canvas: view.container.querySelector('canvas')! }; }
function pointer(canvas: HTMLCanvasElement, x: number, y: number) { fireEvent.pointerDown(canvas, { clientX: x, clientY: y, button: 0 }); fireEvent.pointerUp(canvas, { clientX: x, clientY: y }); }
test('loads six legend nodes, draws a frame and cancels the latest frame on unmount', async () => {
  const pending = deferred(); const client = { getGalaxy: vi.fn(() => pending.promise) };
  const view = render(<GalaxyView client={client} />);
  expect(screen.getByText('Loading galaxy…')).toHaveAttribute('aria-busy', 'true');
  await act(async () => pending.resolve({ nodes }));
  expect(within(screen.getByRole('list', { name: 'Galaxy systems' })).getAllByRole('button').map(button => button.textContent)).toEqual(nodes.map(node => node.label));
  const callback = callbacks.get(nextId)!;
  act(() => callback(1000));
  expect(recording.methods.fillText).toHaveBeenCalled();
  const last = nextId; const late = callbacks.get(last)!;
  view.unmount(); expect(cancelAnimationFrame).toHaveBeenLastCalledWith(last);
  const calls = vi.mocked(requestAnimationFrame).mock.calls.length;
  act(() => late(2000)); expect(requestAnimationFrame).toHaveBeenCalledTimes(calls);
});
test('legend selection shows plain details and closes', async () => {
  await ready(); await userEvent.click(screen.getByRole('button', { name: 'Claude Code' }));
  const panel = screen.getByRole('complementary', { name: 'Details: Claude Code' });
  for (const text of ['Claude Code', 'Agent · Orchestrator', 'Count: 3', ...nodes[1]!.details]) expect(within(panel).getByText(text)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Claude Code' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Close details' })); expect(screen.queryByRole('complementary')).toBeNull();
});
test('canvas hits current planet positions, clears misses and pans without selecting', async () => {
  const { canvas } = await ready(); act(() => callbacks.get(nextId)!(2000));
  const planet = layoutGalaxy(nodes, 2)[1]!;
  const p = worldToScreen(planet, initialCamera(viewport), viewport);
  pointer(canvas, p.x, p.y); expect(screen.getByRole('complementary', { name: 'Details: Claude Code' })).toBeInTheDocument();
  pointer(canvas, 5, 5); expect(screen.queryByRole('complementary')).toBeNull();
  fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300 });
  fireEvent.pointerMove(canvas, { clientX: 440, clientY: 330 });
  fireEvent.pointerUp(canvas, { clientX: 440, clientY: 330 });
  expect(canvas.dataset.cameraX).not.toBe('0.00'); expect(canvas.dataset.cameraY).not.toBe('0.00'); expect(screen.queryByRole('complementary')).toBeNull();
});
test('native wheel prevents default, zooms in and out and reset restores camera', async () => {
  const { canvas } = await ready(); const zoom = Number(canvas.dataset.zoom);
  const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100, cancelable: true });
  fireEvent(canvas, wheel); expect(wheel.defaultPrevented).toBe(true); expect(Number(canvas.dataset.zoom)).toBeGreaterThan(zoom);
  fireEvent.wheel(canvas, { deltaY: 200, clientX: 100, clientY: 100 }); expect(Number(canvas.dataset.zoom)).toBeLessThan(zoom);
  await userEvent.click(screen.getByRole('button', { name: 'Reset view' }));
  expect(canvas.dataset.zoom).toBe(initialCamera(viewport).zoom.toFixed(3)); expect(canvas.dataset.cameraX).toBe('0.00'); expect(canvas.dataset.cameraY).toBe('0.00');
});
test('reduced motion draws only when needed', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
  await ready(); expect(requestAnimationFrame).not.toHaveBeenCalled();
  const before = recording.methods.clearRect!.mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Harness' }));
  expect(recording.methods.clearRect!.mock.calls.length).toBeGreaterThan(before);
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});
test.each([new ApiError('Unavailable', 'FAILED', 500), new Error('Private')])('shows errors and retries (%s)', async error => {
  const client = clientFor(); client.getGalaxy.mockRejectedValueOnce(error);
  render(<GalaxyView client={client} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(error instanceof ApiError ? 'Could not load galaxy: Unavailable' : 'Could not load galaxy.');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByRole('button', { name: 'Harness' })).toBeInTheDocument();
});
test('shows empty data', async () => { render(<GalaxyView client={clientFor([])} />); expect(await screen.findByText('No galaxy data available.')).toBeInTheDocument(); });
test('ignores superseded and unmounted requests', async () => {
  const old = deferred(); const fresh = deferred();
  const view = render(<GalaxyView client={{ getGalaxy: vi.fn(() => old.promise) }} />);
  view.rerender(<GalaxyView client={{ getGalaxy: vi.fn(() => fresh.promise) }} />);
  await act(async () => fresh.resolve({ nodes })); await act(async () => old.resolve({ nodes: [] }));
  expect(screen.getByRole('button', { name: 'Harness' })).toBeInTheDocument();
  const late = deferred(); view.rerender(<GalaxyView client={{ getGalaxy: vi.fn(() => late.promise) }} />); view.unmount();
  await act(async () => late.resolve({ nodes })); expect(view.container).toBeEmptyDOMElement();
});
test('renders HTML literally', async () => {
  const label = '<' + 'img src=x onerror=alert(1)>'; const detail = '<b>Plain text</b>';
  const { container } = await ready(clientFor([{ ...nodes[0]!, label, details: [detail] }, nodes[1]!]));
  await userEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('heading', { name: label })).toBeInTheDocument(); expect(screen.getByText(detail)).toBeInTheDocument(); expect(container.querySelector('img,b')).toBeNull();
});


