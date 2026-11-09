// @vitest-environment node
import request from 'supertest';
import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../../server/app';
import { apiErrorSchema, voiceProvidersSchema, type VoiceProviderId } from '../../shared/api';
import type { VoiceConfig } from '../../server/voice/config';
import { TtsProviderError } from '../../server/voice/errors';

const config: VoiceConfig = {
  fishAudio: { apiKey: 'test-fish-key', voiceId: 'test-fish-voice' },
  elevenLabs: { apiKey: 'test-eleven-key', voiceId: 'test-eleven-voice' },
  openai: { apiKey: 'test-openai-key', voice: 'test-openai-voice' },
};
const audio = new Uint8Array([0, 255, 1, 128, 42]);
const text = 'Test speech content';
const privateValues = Object.values(config).flatMap(value => Object.values(value!));

function setup(currentConfig = config) {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network call'); }));
  const result = { audio, contentType: 'audio/mpeg' as const };
  const synthesizers = {
    'fish-audio': vi.fn(async () => result),
    elevenlabs: vi.fn(async () => result),
    openai: vi.fn(async () => result),
  };
  const loadConfig = vi.fn(() => currentConfig);
  const app = createApp({ staticDir: false, voice: { loadConfig, synthesizers } });
  const post = (body: string | object) => request(app).post('/api/tts')
    .set('Host', '127.0.0.1:3001').set('Origin', 'http://127.0.0.1:3001').send(body);
  const providers = () => request(app).get('/api/voice/providers').set('Host', '127.0.0.1:3001');
  return { synthesizers, loadConfig, post, providers };
}

afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function expectError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(apiErrorSchema.parse(response.body)).toEqual({ error: { code, message: expect.any(String) } });
  expect(response.headers['cache-control']).toBe('no-store');
}

test('lists only provider availability and reloads config on each request', async () => {
  const { providers, loadConfig } = setup();
  const response = await providers();
  expect(response.status).toBe(200);
  expect(voiceProvidersSchema.parse(response.body)).toEqual({ providers: [
    { id: 'fish-audio', available: true },
    { id: 'elevenlabs', available: true },
    { id: 'openai', available: true },
  ] });
  expect(response.headers['cache-control']).toBe('no-store');
  for (const value of privateValues) expect(response.text).not.toContain(value);
  loadConfig.mockReturnValue({ fishAudio: null, elevenLabs: null, openai: null });
  expect((await providers()).body.providers.every((item: { available: boolean }) => !item.available)).toBe(true);
  expect(loadConfig).toHaveBeenCalledTimes(2);
});

test.each([
  ['fish-audio', config.fishAudio], ['elevenlabs', config.elevenLabs], ['openai', config.openai],
] as const)('dispatches only to %s and returns exact audio bytes', async (provider, providerConfig) => {
  const { post, synthesizers } = setup();
  const response = await post({ provider, text: `  ${text}  ` });
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toBe('audio/mpeg');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toEqual(Buffer.from(audio));
  for (const id of Object.keys(synthesizers) as VoiceProviderId[]) {
    if (id === provider) {
      expect(synthesizers[id]).toHaveBeenCalledExactlyOnceWith(providerConfig, text);
    } else expect(synthesizers[id]).not.toHaveBeenCalled();
  }
});

test.each(['fish-audio', 'elevenlabs', 'openai'] as const)('rejects unconfigured %s', async provider => {
  const { post, synthesizers } = setup({ fishAudio: null, elevenLabs: null, openai: null });
  expectError(await post({ provider, text }), 409, 'PROVIDER_NOT_CONFIGURED');
  for (const adapter of Object.values(synthesizers)) expect(adapter).not.toHaveBeenCalled();
});

test.each([
  { provider: 'openai', text: 'a'.repeat(1001) },
  { provider: 'openai', text: '' },
  { provider: 'openai', text: '   ' },
  { provider: 'unknown', text },
  { provider: 'openai', text, extra: true },
])('rejects invalid request %#', async body => {
  const { post, synthesizers } = setup();
  expectError(await post(body), 400, 'INVALID_REQUEST');
  for (const adapter of Object.values(synthesizers)) expect(adapter).not.toHaveBeenCalled();
});

test.each([
  new TtsProviderError('openai', 401),
  new Error(`test-openai-key test-openai-voice ${text}`),
])('hides all adapter error details %#', async error => {
  const { post, synthesizers } = setup();
  synthesizers.openai.mockRejectedValue(error);
  const response = await post({ provider: 'openai', text });
  expectError(response, 502, 'TTS_PROVIDER_FAILED');
  expect(response.body.error.message).toBe('Voice synthesis failed.');
  for (const value of [...privateValues, text, '401']) expect(response.text).not.toContain(value);
});

test('global Origin and JSON guards cover TTS before dispatch', async () => {
  const { post, synthesizers, loadConfig } = setup();
  const foreign = await post({ provider: 'openai', text }).set('Origin', 'http://foreign.example');
  expect(foreign.status).toBe(403);
  expect(foreign.body.error.code).toBe('FORBIDDEN_ORIGIN');
  const nonJson = await post('plain text').type('text');
  expect(nonJson.status).toBe(415);
  expect(nonJson.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  expect(loadConfig).not.toHaveBeenCalled();
  for (const adapter of Object.values(synthesizers)) expect(adapter).not.toHaveBeenCalled();
});
