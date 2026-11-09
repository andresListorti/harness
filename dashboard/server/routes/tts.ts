import { Router } from 'express';
import { ttsRequestSchema, voiceProvidersSchema, type VoiceProviderId } from '../../shared/api';
import { loadVoiceConfig, toPublicProviders, type VoiceConfig } from '../voice/config';
import { synthesizeFishAudio } from '../voice/fish-audio';
import { synthesizeElevenLabs } from '../voice/elevenlabs';
import { synthesizeOpenAi } from '../voice/openai-tts';

type ProviderConfigs = {
  'fish-audio': NonNullable<VoiceConfig['fishAudio']>;
  elevenlabs: NonNullable<VoiceConfig['elevenLabs']>;
  openai: NonNullable<VoiceConfig['openai']>;
};

export type TtsDeps = {
  loadConfig?: () => VoiceConfig;
  synthesizers?: Partial<{
    [P in VoiceProviderId]: (
      config: ProviderConfigs[P], text: string, fetchImpl?: typeof fetch,
    ) => Promise<{ audio: Uint8Array; contentType: 'audio/mpeg' }>;
  }>;
};

export function createTtsRouter(deps: TtsDeps = {}): Router {
  const router = Router();
  const loadConfig = deps.loadConfig ?? (() => loadVoiceConfig());
  const synthesizers = {
    'fish-audio': deps.synthesizers?.['fish-audio'] ?? synthesizeFishAudio,
    elevenlabs: deps.synthesizers?.elevenlabs ?? synthesizeElevenLabs,
    openai: deps.synthesizers?.openai ?? synthesizeOpenAi,
  };
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/voice/providers', (_req, res) => {
    res.json(voiceProvidersSchema.parse(toPublicProviders(loadConfig())));
  });
  router.post('/tts', async (req, res) => {
    const parsed = ttsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'A valid provider and non-empty text of at most 1000 characters are required, with no extra fields.' } });
      return;
    }
    const config = loadConfig();
    const { provider, text } = parsed.data;
    const available = toPublicProviders(config).providers.find(item => item.id === provider)?.available;
    if (!available) {
      res.status(409).json({ error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'Voice provider is not configured.' } });
      return;
    }
    try {
      const result = await (() => {
        switch (provider) {
          case 'fish-audio': return synthesizers[provider](config.fishAudio!, text);
          case 'elevenlabs': return synthesizers[provider](config.elevenLabs!, text);
          case 'openai': return synthesizers[provider](config.openai!, text);
        }
      })();
      res.type(result.contentType).send(Buffer.from(result.audio));
    } catch {
      res.status(502).json({ error: { code: 'TTS_PROVIDER_FAILED', message: 'Voice synthesis failed.' } });
    }
  });
  return router;
}
