// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { usePolling } from '../../src/hooks/usePolling';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
function visibility(value: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(value);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

test('waits five seconds and repeats using the latest callback without resetting cadence', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const { rerender } = renderHook(({ callback }) => usePolling(callback), { initialProps: { callback: first } });
  await advance(4999);
  expect(first).not.toHaveBeenCalled();
  rerender({ callback: latest });
  await advance(1);
  expect(latest).toHaveBeenCalledTimes(1);
  await advance(5000);
  expect(latest).toHaveBeenCalledTimes(2);
});

test('skips ticks while a promise is pending', async () => {
  let settle!: () => void;
  const callback = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { settle = resolve; }));
  renderHook(() => usePolling(callback));
  await advance(15000);
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => settle());
  await advance(5000);
  expect(callback).toHaveBeenCalledTimes(2);
});

test('pauses while hidden and immediately refreshes on return before resuming cadence', async () => {
  visibility('hidden');
  const callback = vi.fn();
  renderHook(() => usePolling(callback));
  await advance(10000);
  expect(callback).not.toHaveBeenCalled();
  visibility('visible');
  expect(callback).toHaveBeenCalledTimes(1);
  await advance(4999);
  expect(callback).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(callback).toHaveBeenCalledTimes(2);
  visibility('hidden');
  await advance(10000);
  expect(callback).toHaveBeenCalledTimes(2);
});

test('cleans up timers and listeners on disable and unmount', async () => {
  const remove = vi.spyOn(document, 'removeEventListener');
  const callback = vi.fn();
  const { rerender, unmount } = renderHook(({ enabled }) => usePolling(callback, 5000, enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  visibility('visible');
  await advance(5000);
  expect(callback).not.toHaveBeenCalled();
  rerender({ enabled: true });
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(2);
  visibility('visible');
  await advance(5000);
  expect(callback).not.toHaveBeenCalled();
});

test('swallows rejections and keeps polling', async () => {
  const callback = vi.fn().mockRejectedValue(new Error('Unavailable'));
  renderHook(() => usePolling(callback));
  await advance(10000);
  expect(callback).toHaveBeenCalledTimes(2);
});
