import express, { type Express } from 'express';
import { applySecurity, jsonErrorHandler, type SecurityOptions } from './security';
import { createDataRouter, type DataDeps } from './routes/data';

interface AppOptions extends SecurityOptions {
  data?: DataDeps;
  routes?: (app: Express) => void;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  applySecurity(app, options);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  options.routes?.(app);
  app.use('/api', createDataRouter(options.data));

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND', message: 'API route not found.' },
    });
  });

  app.use(jsonErrorHandler());

  return app;
}
