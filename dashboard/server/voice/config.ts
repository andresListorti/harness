import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { VoiceProviders } from '../../shared/api';

export type VoiceConfig = {
  fishAudio: { apiKey: string; voiceId: string } | null;
  elevenLabs: { apiKey: string; voiceId: string } | null;
  openai: { apiKey: string; voice: string } | null;
};

export function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'")
      && value.at(-1) === value[0]) {
      value = value.slice(1, -1);
    }
    Object.defineProperty(values, match[1], {
      value, enumerable: true, configurable: true, writable: true,
    });
  }
  return values;
}

export function loadVoiceConfig(options: {
  envPath?: string;
  env?: Record<string, string | undefined>;
} = {}): VoiceConfig {
  let file: Record<string, string>;
  try {
    const path = options.envPath ?? fileURLToPath(new URL('../../../.env', import.meta.url));
    file = parseEnv(readFileSync(path, 'utf8'));
  } catch {
    file = {};
  }
  const env = options.env ?? process.env;
  const get = (name: string) => (env[name] ?? file[name] ?? '').trim();
  const fishKey = get('FISH_AUDIO_API_KEY');
  const fishVoice = get('FISH_AUDIO_VOICE_ID');
  const elevenKey = get('ELEVENLABS_API_KEY');
  const elevenVoice = get('ELEVENLABS_VOICE_ID');
  const openaiKey = get('OPENAI_TTS_API_KEY');
  const openaiVoice = get('OPENAI_TTS_VOICE');
  return {
    fishAudio: fishKey && fishVoice ? { apiKey: fishKey, voiceId: fishVoice } : null,
    elevenLabs: elevenKey && elevenVoice ? { apiKey: elevenKey, voiceId: elevenVoice } : null,
    openai: openaiKey && openaiVoice ? { apiKey: openaiKey, voice: openaiVoice } : null,
  };
}

export function toPublicProviders(config: VoiceConfig): VoiceProviders {
  return { providers: [
    { id: 'fish-audio', available: config.fishAudio !== null },
    { id: 'elevenlabs', available: config.elevenLabs !== null },
    { id: 'openai', available: config.openai !== null },
  ] };
}
