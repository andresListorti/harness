import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { DEFAULT_CLAUDE_MODEL, isClaudeModel } from './models';
import { cleanChatReply } from './reply';

export type ChatRunErrorCode = 'CLI_NOT_FOUND' | 'INVALID_MODEL' | 'TIMEOUT' | 'OUTPUT_TOO_LARGE' | 'FAILED_RUN';
const messages: Record<ChatRunErrorCode, string> = {
  CLI_NOT_FOUND: 'Claude Code CLI was not found.',
  INVALID_MODEL: 'Invalid Claude Code model.',
  TIMEOUT: 'Claude Code timed out.',
  OUTPUT_TOO_LARGE: 'Claude Code output exceeded the limit.',
  FAILED_RUN: 'Claude Code could not complete the chat.',
};
export class ChatRunError extends Error {
  constructor(public readonly code: ChatRunErrorCode) {
    super(messages[code]);
    this.name = 'ChatRunError';
  }
}

export interface ExecutableContext {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
}

export function resolveClaudeExecutable({ env, platform, exists }: ExecutableContext): string {
  const executable = env.HARNESS_CLAUDE_BIN || (platform === 'win32'
    ? env.APPDATA && win32.join(env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    : 'claude');
  if (!executable || !isClaudeExecutable(executable) ||
    (platform === 'win32' && (!/\.exe$/i.test(executable) || !exists(executable)))) {
    throw new ChatRunError('CLI_NOT_FOUND');
  }
  return executable;
}

function isClaudeExecutable(executable: string): boolean {
  return /^claude(?:\.exe)?$/i.test(win32.basename(executable));
}

export interface ChatRunnerDependencies {
  spawn: (file: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  resolveExecutable: (context: ExecutableContext) => string;
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  makeTemp: () => Promise<string>;
  removeTemp: (path: string) => Promise<void>;
  timeoutMs: number;
  outputCapBytes: number;
}

const voiceVariables = new Set([
  'FISH_AUDIO_API_KEY', 'FISH_AUDIO_VOICE_ID', 'ELEVENLABS_API_KEY',
  'ELEVENLABS_VOICE_ID', 'OPENAI_TTS_API_KEY', 'OPENAI_TTS_VOICE',
]);

export async function runClaudeChat(
  prompt: string, model: unknown = DEFAULT_CLAUDE_MODEL, overrides: Partial<ChatRunnerDependencies> = {},
): Promise<string> {
  if (!isClaudeModel(model)) throw new ChatRunError('INVALID_MODEL');
  const deps: ChatRunnerDependencies = {
    spawn, resolveExecutable: resolveClaudeExecutable, env: process.env, platform: process.platform,
    exists: existsSync, makeTemp: () => mkdtemp(join(tmpdir(), 'harness-chat-')),
    removeTemp: path => rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }),
    timeoutMs: 60_000, outputCapBytes: 256_000, ...overrides,
  };
  const executable = deps.resolveExecutable(deps);
  // Keep the no-shell rule even when an injected resolver is used.
  if (!isClaudeExecutable(executable)) throw new ChatRunError('CLI_NOT_FOUND');
  const cwd = await deps.makeTemp();
  try {
    return await new Promise<string>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: ChatRunError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(cleanChatReply(output + decoder.end()));
      };
      const fail = (error: unknown) => finish(new ChatRunError(
        (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'CLI_NOT_FOUND' : 'FAILED_RUN',
      ));
      let output = '';
      let bytes = 0;
      const decoder = new StringDecoder('utf8');
      try {
        child = deps.spawn(executable, [
          '-p', '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--model', model,
        ], {
          cwd, shell: false, stdio: 'pipe',
          env: Object.fromEntries(Object.entries(deps.env).filter(([key]) => !voiceVariables.has(key.toUpperCase()))),
        });
      } catch (error) { fail(error); return; }
      const stop = (code: ChatRunErrorCode) => {
        if (settled) return;
        finish(new ChatRunError(code));
        try { child.kill('SIGKILL'); } catch { /* The child may already have exited. */ }
      };
      const count = (chunk: Buffer | string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > deps.outputCapBytes) stop('OUTPUT_TOO_LARGE');
      };
      child.on('error', fail);
      child.on('close', code => finish(code === 0 ? undefined : new ChatRunError('FAILED_RUN')));
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return;
        count(chunk);
        if (!settled) output += decoder.write(Buffer.from(chunk));
      });
      child.stderr.on('data', (chunk: Buffer) => { if (!settled) count(chunk); });
      child.stdin.on('error', () => stop('FAILED_RUN'));
      timer = setTimeout(() => stop('TIMEOUT'), deps.timeoutMs);
      try { child.stdin.end(prompt); } catch { stop('FAILED_RUN'); }
    });
  } finally {
    await deps.removeTemp(cwd);
  }
}
