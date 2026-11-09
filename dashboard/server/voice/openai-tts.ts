import { TtsProviderError } from './errors';

export async function synthesizeOpenAi(
  config: { apiKey: string; voice: string },
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ audio: Uint8Array; contentType: 'audio/mpeg' }> {
  let response: Response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: text, voice: config.voice, response_format: 'mp3' }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new TtsProviderError('openai', null);
  }

  if (!response.ok) throw new TtsProviderError('openai', response.status);

  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new TtsProviderError('openai', response.status);
  }
  if (audio.byteLength === 0) throw new TtsProviderError('openai', response.status);
  return { audio, contentType: 'audio/mpeg' };
}
