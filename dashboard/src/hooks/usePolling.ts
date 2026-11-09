import { useEffect, useRef } from 'react';

export function usePolling(callback: () => Promise<unknown> | void, intervalMs = 5000, enabled = true) {
  const latest = useRef(callback);
  const pending = useRef(false);
  latest.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function tick() {
      if (!active || document.visibilityState === 'hidden' || pending.current) return;
      pending.current = true;
      try {
        await latest.current();
      } catch {
        // The callback owns error reporting; polling continues after failures.
      } finally {
        pending.current = false;
      }
    }

    function resume() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === 'hidden') return;
      void tick();
      timer = setInterval(() => void tick(), intervalMs);
    }

    if (document.visibilityState !== 'hidden') timer = setInterval(() => void tick(), intervalMs);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false;
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [intervalMs, enabled]);
}
