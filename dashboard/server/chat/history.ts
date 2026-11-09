import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatHistorySchema, type ChatHistory, type ChatHistoryMessage } from '../../shared/api';

export function defaultHistoryPath(): string {
  return fileURLToPath(new URL('../../.data/chat-history.json', import.meta.url));
}

export async function readHistory(filePath: string): Promise<ChatHistory> {
  try {
    return chatHistorySchema.parse(JSON.parse(await readFile(filePath, 'utf8')));
  } catch {
    return { messages: [] };
  }
}

const writes = new Map<string, Promise<void>>();

function serialize(filePath: string, operation: () => Promise<void>): Promise<void> {
  const key = resolve(filePath);
  const next = (writes.get(key) ?? Promise.resolve()).then(operation);
  const settled = next.catch(() => {});
  writes.set(key, settled);
  void settled.then(() => { if (writes.get(key) === settled) writes.delete(key); });
  return next;
}

export function appendToHistory(filePath: string, messages: ChatHistoryMessage[]): Promise<void> {
  return serialize(filePath, async () => {
    const history = chatHistorySchema.parse({ messages: [...(await readHistory(filePath)).messages, ...messages] });
    let characters = history.messages.reduce((total, message) => total + message.text.length, 0);
    while (history.messages.length > 200 || characters > 100000) {
      characters -= history.messages.shift()!.text.length;
    }
    const folder = dirname(filePath);
    await mkdir(folder, { recursive: true });
    const temporary = join(folder, `.chat-history-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(history, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  });
}

export function clearHistory(filePath: string): Promise<void> {
  return serialize(filePath, () => rm(filePath, { force: true }));
}
