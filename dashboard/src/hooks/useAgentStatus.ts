import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export type AgentStatus = 'checking' | 'ready' | 'offline';

export function useAgentStatus(client: Pick<typeof api, 'getHealth'> = api, intervalMs = 15000): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>('checking');

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        await client.getHealth();
        if (active) setStatus('ready');
      } catch {
        if (active) setStatus('offline');
      }
    }
    void check();
    const timer = setInterval(() => void check(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, intervalMs]);

  return status;
}
