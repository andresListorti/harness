import { Router } from 'express';
import { settingsResponseSchema, settingsSchema, type Settings } from '../../shared/api';
import { defaultSettingsPath, readSettings, workerFor, writeSettings } from '../settings';
import type { DataDeps } from './data';

export function createSettingsRouter(deps: DataDeps = {}): Router {
  const router = Router();
  const filePath = deps.settingsPath ?? defaultSettingsPath();
  const response = (settings: Settings) => settingsResponseSchema.parse({
    ...settings, worker: workerFor(settings.orchestrator),
  });
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/settings', async (_req, res) => {
    res.json(response(await readSettings(filePath)));
  });
  router.put('/settings', async (req, res) => {
    const parsed = settingsSchema.extend({ chatModel: settingsSchema.shape.chatModel.removeDefault().optional() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Valid settings are required, with no extra fields.' } });
      return;
    }
    const settings = { ...parsed.data, chatModel: parsed.data.chatModel ?? (await readSettings(filePath)).chatModel };
    try {
      await writeSettings(filePath, settings);
    } catch {
      res.status(500).json({ error: { code: 'SETTINGS_WRITE_FAILED', message: 'Settings could not be saved.' } });
      return;
    }
    res.json(response(settings));
  });
  return router;
}
