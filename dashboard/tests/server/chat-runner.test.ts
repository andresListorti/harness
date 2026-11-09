// @vitest-environment node
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ChatRunError, resolveClaudeExecutable, runClaudeChat, type ChatRunnerDependencies } from '../../server/chat/runner';
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, isClaudeModel } from '../../server/chat/models';

function fixture(action: (child: ReturnType<typeof fakeChild>) => void = child => child.emit('close', 0)) {
  const child = fakeChild();
  const directories: string[] = [];
  const spawn = vi.fn<ChatRunnerDependencies['spawn']>((_file, _args, options) => {
    directories.push(String(options.cwd));
    expect(dirname(String(options.cwd))).toBe(tmpdir());
    expect(readdirSync(String(options.cwd))).toEqual([]);
    setImmediate(() => action(child));
    return child as unknown as ChildProcessWithoutNullStreams;
  });
  const deps = { spawn, platform: 'linux' as const, env: {} };
  return { child, spawn, directories, deps };
}

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

describe('Claude chat runner', () => {
  it('exports the server allowlist and default', () => {
    expect(CLAUDE_MODELS).toEqual(['sonnet', 'opus', 'haiku']);
    expect(DEFAULT_CLAUDE_MODEL).toBe('sonnet');
    expect(isClaudeModel('sonnet')).toBe(true);
    expect(isClaudeModel({})).toBe(false);
  });
  it.each(CLAUDE_MODELS)('uses fixed isolation arguments and stdin for %s', async model => {
    const f = fixture(child => {
      child.stdout.write('Hello <invoke>hidden</invoke>');
      child.stderr.write('private diagnostics');
      child.emit('close', 0);
    });
    let input = '';
    f.child.stdin.on('data', chunk => { input += chunk; });
    expect(await runClaudeChat('private prompt', model, f.deps)).toBe('Hello Tools are not available in this chat.');
    const [file, args, options] = f.spawn.mock.calls[0];
    expect(file).toBe('claude');
    expect(args).toEqual(['-p', '--tools', '', '--strict-mcp-config', '--safe-mode', '--no-session-persistence', '--model', model]);
    expect(args.join(' ')).not.toContain('private prompt');
    expect(options.shell).toBe(false);
    expect(input).toBe('private prompt');
    expect(existsSync(f.directories[0])).toBe(false);
  });
  it('defaults to sonnet and preserves login environment while removing all voice variables', async () => {
    const f = fixture();
    const names = ['FISH_AUDIO_API_KEY', 'FISH_AUDIO_VOICE_ID', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'OPENAI_TTS_API_KEY', 'OPENAI_TTS_VOICE'];
    const env = Object.fromEntries(names.map(name => [name, 'fixture']));
    env.PATH = 'login-path';
    env.CLAUDE_CONFIG_DIR = 'login-config';
    env.fish_audio_api_key = 'fixture';
    await runClaudeChat('prompt', undefined, { ...f.deps, env });
    expect(f.spawn.mock.calls[0][2].env).toEqual({ PATH: 'login-path', CLAUDE_CONFIG_DIR: 'login-config' });
    expect(f.spawn.mock.calls[0][1].at(-1)).toBe('sonnet');
    expect(env.FISH_AUDIO_API_KEY).toBe('fixture');
  });
  it.each(['codex', 'unknown', '', null])('rejects invalid model %s before any process or temp folder', async model => {
    const f = fixture();
    const makeTemp = vi.fn();
    await expect(runClaudeChat('prompt', model, { ...f.deps, makeTemp })).rejects.toMatchObject({ code: 'INVALID_MODEL' });
    expect(f.spawn).not.toHaveBeenCalled();
    expect(makeTemp).not.toHaveBeenCalled();
  });
  it.each(['nonzero', 'error', 'sync', 'stdin', 'stdin-throw', 'missing'])('cleans up on %s without leaking diagnostics', async mode => {
    const diagnostic = 'private diagnostics';
    const f = fixture(child => {
      child.stderr.write(diagnostic);
      if (mode === 'stdin') child.stdin.emit('error', Object.assign(new Error(diagnostic), { code: 'EPIPE' }));
      else if (mode === 'error' || mode === 'missing') child.emit('error', Object.assign(new Error(diagnostic), { code: mode === 'missing' ? 'ENOENT' : 'EACCES' }));
      else child.emit('close', 1);
    });
    if (mode === 'sync') f.spawn.mockImplementation((_file, _args, options) => {
      f.directories.push(String(options.cwd));
      throw new Error(diagnostic);
    });
    if (mode === 'stdin-throw') vi.spyOn(f.child.stdin, 'end').mockImplementation(() => { throw new Error(diagnostic); });
    const error = await runClaudeChat('prompt', 'sonnet', f.deps).catch(error => error);
    expect(error).toBeInstanceOf(ChatRunError);
    expect(error.code).toBe(mode === 'missing' ? 'CLI_NOT_FOUND' : 'FAILED_RUN');
    expect(error.message).not.toContain(diagnostic);
    expect(existsSync(f.directories[0])).toBe(false);
  });
  it('kills timed out children and removes the directory', async () => {
    const f = fixture(() => {});
    await expect(runClaudeChat('prompt', 'sonnet', { ...f.deps, timeoutMs: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(f.child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(existsSync(f.directories[0])).toBe(false);
    f.child.emit('close', 0);
  });
  it.each(['stdout', 'stderr'] as const)('caps %s by bytes and kills the child', async stream => {
    const f = fixture(child => { child[stream].write('ééé'); });
    await expect(runClaudeChat('prompt', 'sonnet', { ...f.deps, outputCapBytes: 5 })).rejects.toMatchObject({ code: 'OUTPUT_TOO_LARGE' });
    expect(f.child.kill).toHaveBeenCalledOnce();
    expect(existsSync(f.directories[0])).toBe(false);
  });
  it('decodes UTF-8 across chunks and accepts exactly the cap', async () => {
    const f = fixture(child => {
      const bytes = Buffer.from('é');
      child.stdout.write(bytes.subarray(0, 1));
      child.stdout.write(bytes.subarray(1));
      child.emit('close', 0);
    });
    expect(await runClaudeChat('prompt', 'haiku', { ...f.deps, outputCapBytes: 2 })).toBe('é');
  });
  it('maps synchronous ENOENT to CLI not found', async () => {
    const f = fixture();
    f.spawn.mockImplementation(() => { throw Object.assign(new Error('hidden'), { code: 'ENOENT' }); });
    await expect(runClaudeChat('prompt', 'sonnet', f.deps)).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
  });
  it('allows injected executable and folder helpers', async () => {
    const f = fixture();
    const resolveExecutable = vi.fn(() => 'claude');
    const removeTemp = vi.fn<ChatRunnerDependencies['removeTemp']>(async () => {});
    // Use the real temporary-folder default; the injected remover delegates after inspection.
    const { rm } = await import('node:fs/promises');
    removeTemp.mockImplementation(path => rm(path, { recursive: true, force: true }));
    await runClaudeChat('prompt', 'opus', { ...f.deps, resolveExecutable, removeTemp });
    expect(resolveExecutable).toHaveBeenCalledOnce();
    expect(removeTemp).toHaveBeenCalledWith(f.directories[0]);
  });
});

describe('executable resolution', () => {
  const appdata = join(tmpdir(), 'harness-appdata');
  it.each([undefined, win32.join(appdata, 'custom', 'claude.exe')])('starts the Windows native executable (%s)', async setting => {
    const f = fixture();
    const expected = setting ?? win32.join(appdata, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    const exists = vi.fn(() => true);
    await runClaudeChat('prompt', 'sonnet', { ...f.deps, platform: 'win32', env: { APPDATA: appdata, HARNESS_CLAUDE_BIN: setting }, exists });
    expect(exists).toHaveBeenCalledWith(expected);
    expect(f.spawn.mock.calls[0][0]).toBe(expected);
  });
  it.each(['claude.cmd', 'claude.BAT', 'claude', 'codex.cmd', 'codex.exe'])('never starts a Windows shim: %s', async setting => {
    const f = fixture();
    await expect(runClaudeChat('prompt', 'sonnet', { ...f.deps, platform: 'win32', env: { HARNESS_CLAUDE_BIN: setting }, exists: () => true }))
      .rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
    expect(f.spawn).not.toHaveBeenCalled();
  });
  it.each([{}, { APPDATA: appdata }])('rejects absent Windows executables', env => {
    expect(() => resolveClaudeExecutable({ platform: 'win32', env, exists: () => false })).toThrow(ChatRunError);
  });
  it('uses the setting or bare Claude name on other platforms', () => {
    const context = { platform: 'linux' as const, exists: () => false };
    expect(resolveClaudeExecutable({ ...context, env: {} })).toBe('claude');
    const setting = join(tmpdir(), 'bin', 'claude');
    expect(resolveClaudeExecutable({ ...context, env: { HARNESS_CLAUDE_BIN: setting } })).toBe(setting);
  });
  it('rejects shims even from an injected resolver', async () => {
    const f = fixture();
    await expect(runClaudeChat('prompt', 'sonnet', { ...f.deps, resolveExecutable: () => 'claude.cmd' })).rejects.toMatchObject({ code: 'CLI_NOT_FOUND' });
    expect(f.spawn).not.toHaveBeenCalled();
  });
});
