import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { ChatRunError } from '../server/chat/runner';
import { createApp } from '../server/app';

// Each test owns its storage, independently of repoRoot and parallel workers.
export function useTestApp() {
  let folder: string;
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'harness-test-storage-'));
  });
  afterEach(async () => {
    if (folder) await rm(folder, { recursive: true, force: true });
  });
  return (options: Parameters<typeof createApp>[0] = {}) => createApp({
    ...options,
    data: {
      runClaudeChat: async () => { throw new ChatRunError('CLI_NOT_FOUND'); },
      historyPath: join(folder, 'chat-history.json'),
      settingsPath: join(folder, 'settings.json'),
      ...options.data,
    },
  });
}
