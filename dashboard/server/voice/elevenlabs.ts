import { TtsProviderError } from './errors';

export async function synthesizeElevenLabs(
  config: { apiKey: string; voiceId: string },
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ audio: Uint8Array; contentType: 'audio/mpeg' }> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new TtsProviderError('elevenlabs', null);
  }

  if (!response.ok) throw new TtsProviderError('elevenlabs', response.status);

  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await response.arrayBuffer());
  } catch {
    throw new TtsProviderError('elevenlabs', response.status);
  }
  if (audio.byteLength === 0) throw new TtsProviderError('elevenlabs', response.status);
  return { audio, contentType: 'audio/mpeg' };
}
