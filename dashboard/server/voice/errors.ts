import type { VoiceProviderId } from '../../shared/api';

const providerNames: Record<VoiceProviderId, string> = {
  'fish-audio': 'Fish Audio',
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI',
};

export class TtsProviderError extends Error {
  constructor(
    readonly provider: VoiceProviderId,
    readonly status: number | null,
  ) {
    super(`${providerNames[provider]} request failed${status === null ? '.' : ` (status ${status}).`}`);
    this.name = 'TtsProviderError';
  }
}
