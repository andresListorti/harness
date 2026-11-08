import express, { type Express } from 'express';
import { applySecurity, jsonErrorHandler, type SecurityOptions } from './security';
import { createDataRouter, type DataDeps } from './routes/data';

import { createChatRouter } from './routes/chat';
import { DEFAULT_STATIC_DIR, securityHeaders, serveStatic } from './static';

interface AppOptions extends SecurityOptions {
  staticDir?: string | false;
  data?: DataDeps;
  routes?: (app: Express) => void;
}

export function createApp(options: AppOptions = {}) {
  const app = express();
  app.use(securityHeaders());
  app.disable('x-powered-by');
  applySecurity(app, options);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  options.routes?.(app);
  app.use('/api', createDataRouter(options.data));
  app.use('/api', createChatRouter(options.data));

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND', message: 'API route not found.' },
    });
  });

  if (options.staticDir !== false) {
    serveStatic(app, options.staticDir ?? DEFAULT_STATIC_DIR);
  }

  app.use((_req, res) => {
    res.status(404).type('text').send('Not found.');
  });

  app.use(jsonErrorHandler());

  return app;
}
