// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { TtsProviderError } from '../../server/voice/errors';
import { synthesizeOpenAi } from '../../server/voice/openai-tts';

const config = { apiKey: 'test-distinct-openai-key', voice: 'test-distinct-openai-voice' };
const text = 'test-distinct-request-text';
const responseText = 'test-distinct-upstream-body';

afterEach(() => vi.restoreAllMocks());

async function expectSafeError(fetchImpl: typeof fetch, status: number | null) {
  const error: unknown = await synthesizeOpenAi(config, text, fetchImpl).catch(value => value);
  expect(error).toBeInstanceOf(TtsProviderError);
  expect(error).toMatchObject({ provider: 'openai', status });
  expect((error as Error).message).toBe(
    `OpenAI request failed${status === null ? '.' : ` (status ${status}).`}`,
  );
  for (const value of [(error as Error).message, JSON.stringify(error), String(error)]) {
    for (const secret of [config.apiKey, config.voice, responseText, text]) {
      expect(value).not.toContain(secret);
    }
  }
}

test('sends the exact request with a 30 second timeout and returns unchanged MP3 bytes', async () => {
  const bytes = new Uint8Array([0, 255, 73, 68, 51]);
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
  const timeout = vi.spyOn(AbortSignal, 'timeout');

  expect(await synthesizeOpenAi(config, text, fetchImpl)).toEqual({
    audio: bytes, contentType: 'audio/mpeg',
  });
  expect(timeout).toHaveBeenCalledExactlyOnceWith(30000);
  expect(fetchImpl).toHaveBeenCalledExactlyOnceWith('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: text, voice: config.voice, response_format: 'mp3' }),
    signal: timeout.mock.results[0].value,
  });
  expect(fetchImpl.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});

test.each([401, 429, 500])('sanitizes upstream HTTP status %s', async status => {
  await expectSafeError(vi.fn<typeof fetch>().mockResolvedValue(
    new Response(responseText, { status }),
  ), status);
});

test('sanitizes a thrown fetch error', async () => {
  await expectSafeError(vi.fn<typeof fetch>().mockRejectedValue(
    new Error(`${config.apiKey} ${config.voice} ${responseText} ${text}`),
  ), null);
});

test('rejects an empty audio body', async () => {
  await expectSafeError(vi.fn<typeof fetch>().mockResolvedValue(new Response(null)), 200);
});

test('sanitizes body read failures', async () => {
  const response = new Response(responseText);
  vi.spyOn(response, 'arrayBuffer').mockRejectedValue(
    new Error(`${config.apiKey} ${config.voice} ${responseText} ${text}`),
  );
  await expectSafeError(vi.fn<typeof fetch>().mockResolvedValue(response), 200);
});
