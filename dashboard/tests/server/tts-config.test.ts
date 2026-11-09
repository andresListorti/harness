// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { loadVoiceConfig, parseEnv, toPublicProviders } from '../../server/voice/config';
import { voiceProviderIdSchema, voiceProvidersSchema } from '../../shared/api';

const directories: string[] = [];
const variables = [
  ['FISH_AUDIO_API_KEY', 'FISH_AUDIO_VOICE_ID', 'fishAudio', 'voiceId'],
  ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'elevenLabs', 'voiceId'],
  ['OPENAI_TTS_API_KEY', 'OPENAI_TTS_VOICE', 'openai', 'voice'],
] as const;
const unavailable = { fishAudio: null, elevenLabs: null, openai: null };

function fixture(text: string) {
  const directory = mkdtempSync(join(tmpdir(), 'tts-config-'));
  directories.push(directory);
  const envPath = join(directory, '.env');
  writeFileSync(envPath, text, 'utf8');
  return envPath;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('parses comments, matching quotes, CRLF, a leading BOM, and empty values', () => {
  const text = '\uFEFF# comment\r\n\r\n  # indented comment\r\n'
    + ' KEY = test-key \r\nSINGLE=\'test-voice\'\r\nDOUBLE="test voice"\r\n'
    + 'EMPTY=\r\nQUOTED_EMPTY=""\r\nSPACES=   \r\n'
    + 'EQUALS="a=b"\r\nHASH=test#value\r\nMISMATCH="test\'\r\n'
    + 'NESTED=\'"test"\'\r\ninvalid line\r\n=ignored\r\n';
  expect(parseEnv(text)).toEqual({
    KEY: 'test-key', SINGLE: 'test-voice', DOUBLE: 'test voice',
    EMPTY: '', QUOTED_EMPTY: '', SPACES: '', EQUALS: 'a=b', HASH: 'test#value',
    MISMATCH: '"test\'', NESTED: '"test"',
  });
  expect(parseEnv('')).toEqual({});
  expect(parseEnv('KEY=first\nKEY=second')).toEqual({ KEY: 'second' });
});

test.each(variables)('%s requires both values and works independently',
  (key, voice, provider, voiceField) => {
    for (const text of ['', `${key}=test-key`, `${voice}=test-voice`,
      `${key}=test-key\n${voice}="   "`, `${key}=\n${voice}=test-voice`]) {
      expect(loadVoiceConfig({ envPath: fixture(text), env: {} })).toEqual(unavailable);
    }
    const config = loadVoiceConfig({
      envPath: fixture(`${key}=test-key\n${voice}=test-voice`), env: {},
    });
    expect(config).toEqual({
      ...unavailable,
      [provider]: { apiKey: 'test-key', [voiceField]: 'test-voice' },
    });
  });

test.each(variables)('%s remains available with missing or unreadable files',
  (key, voice, provider, voiceField) => {
    const envPath = fixture('');
    const env = { [key]: 'test-key', [voice]: 'test-voice' };
    for (const path of [envPath + '-missing', directories[0]]) {
      expect(loadVoiceConfig({ envPath: path, env })).toEqual({
        ...unavailable,
        [provider]: { apiKey: 'test-key', [voiceField]: 'test-voice' },
      });
      expect(toPublicProviders(loadVoiceConfig({ envPath: path, env })).providers)
        .toEqual(variables.map(([, , name], index) => ({
          id: ['fish-audio', 'elevenlabs', 'openai'][index],
          available: name === provider,
        })));
    }
  });

test('missing and unreadable files without environment values give all unavailable', () => {
  const envPath = fixture('');
  for (const path of [envPath + '-missing', directories[0]]) {
    expect(loadVoiceConfig({ envPath: path, env: {} })).toEqual(unavailable);
  }
});

test('missing files still default to process.env', () => {
  const envPath = fixture('') + '-missing';
  vi.stubEnv('OPENAI_TTS_API_KEY', 'test-key');
  vi.stubEnv('OPENAI_TTS_VOICE', 'test-voice');
  expect(loadVoiceConfig({ envPath }).openai).toEqual({
    apiKey: 'test-key', voice: 'test-voice',
  });
});

test('explicit environment overrides file values and undefined falls back to the file', () => {
  const envPath = fixture([
    'FISH_AUDIO_API_KEY=test-key', 'FISH_AUDIO_VOICE_ID=test-voice',
  ].join('\n'));
  expect(loadVoiceConfig({ envPath, env: {
    FISH_AUDIO_API_KEY: 'test-override', FISH_AUDIO_VOICE_ID: undefined,
  } }).fishAudio).toEqual({ apiKey: 'test-override', voiceId: 'test-voice' });
  expect(loadVoiceConfig({ envPath, env: { FISH_AUDIO_API_KEY: '' } })).toEqual(unavailable);
});

test('defaults to process.env for overrides', () => {
  const envPath = fixture([
    'OPENAI_TTS_API_KEY=test-key', 'OPENAI_TTS_VOICE=test-voice',
  ].join('\n'));
  vi.stubEnv('OPENAI_TTS_API_KEY', 'test-override');
  vi.stubEnv('OPENAI_TTS_VOICE', 'test-override-voice');
  expect(loadVoiceConfig({ envPath }).openai).toEqual({
    apiKey: 'test-override', voice: 'test-override-voice',
  });
});

test('public view contains exactly three ordered providers and no private values', () => {
  const secrets = ['test-fish-key', 'test-fish-voice', 'test-eleven-key',
    'test-eleven-voice', 'test-openai-key', 'test-openai-voice'];
  const text = variables.flatMap(([key, voice], index) => [
    `${key}=${secrets[index * 2]}`, `${voice}=${secrets[index * 2 + 1]}`,
  ]).join('\n');
  const view = toPublicProviders(loadVoiceConfig({ envPath: fixture(text), env: {} }));
  expect(view).toEqual({ providers: [
    { id: 'fish-audio', available: true },
    { id: 'elevenlabs', available: true },
    { id: 'openai', available: true },
  ] });
  expect(voiceProvidersSchema.parse(view)).toEqual(view);
  for (const secret of secrets) expect(JSON.stringify(view)).not.toContain(secret);
  expect(voiceProviderIdSchema.safeParse('unknown').success).toBe(false);
  expect(voiceProvidersSchema.safeParse({ ...view, extra: true }).success).toBe(false);
  expect(voiceProvidersSchema.safeParse({ providers: [
    { id: 'openai', available: true, apiKey: 'test-key' },
  ] }).success).toBe(false);
});

test('environment example lists all six empty commented variables', () => {
  const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
  for (const name of variables.flatMap(([key, voice]) => [key, voice])) {
    expect(example.split('\n')).toContain(`# ${name}=`);
  }
  expect(example).not.toContain('intentionally');
  expect(example).toContain('Never commit a real .env file.');
});
