import express from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'ROUTE_NOT_FOUND', message: 'API route not found.' },
    });
  });

  return app;
}
