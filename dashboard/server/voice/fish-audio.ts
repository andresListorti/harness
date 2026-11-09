import { TtsProviderError } from './errors';

export async function synthesizeFishAudio(
  config: { apiKey: string; voiceId: string },
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ audio: Uint8Array; contentType: 'audio/mpeg' }> {
  let response: Response;
  try {
    response = await fetchImpl('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, reference_id: config.voiceId, format: 'mp3' }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new TtsProviderError('fish-audio', null);
  }

  if (!response.ok) throw new TtsProviderError('fish-audio', response.status);

  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new TtsProviderError('fish-audio', response.status);
  }
  if (audio.byteLength === 0) throw new TtsProviderError('fish-audio', response.status);
  return { audio, contentType: 'audio/mpeg' };
}
