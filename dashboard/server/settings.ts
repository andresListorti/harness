import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsSchema, type AgentId, type Settings } from '../shared/api';

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  orchestrator: 'claude-code', voice: 'browser',
});

export function workerFor(orchestrator: AgentId): AgentId {
  return orchestrator === 'claude-code' ? 'codex' : 'claude-code';
}

export function defaultSettingsPath(): string {
  return fileURLToPath(new URL('../.data/settings.json', import.meta.url));
}

export async function readSettings(filePath: string): Promise<Settings> {
  try {
    return settingsSchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(filePath: string, settings: Settings): Promise<void> {
  const validated = settingsSchema.parse(settings);
  const folder = dirname(filePath);
  await mkdir(folder, { recursive: true });
  const temporary = join(folder, `.settings-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}
