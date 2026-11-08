import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';

export interface SecurityOptions {
  ports?: readonly number[];
}

const defaultPorts = [3001, 5173];
const changingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function hostGuard({ ports = defaultPorts }: SecurityOptions = {}): RequestHandler {
  const hosts = new Set(ports.flatMap((port) => [`127.0.0.1:${port}`, `localhost:${port}`]));
  return (req, res, next) => {
    if (!hosts.has(req.headers.host ?? '')) {
      res.status(403).json({ error: { code: 'FORBIDDEN_HOST', message: 'Host is not allowed.' } });
      return;
    }
    next();
  };
}

export function originGuard({ ports = defaultPorts }: SecurityOptions = {}): RequestHandler {
  const origins = new Set(ports.flatMap((port) => [
    `http://127.0.0.1:${port}`, `http://localhost:${port}`,
  ]));
  return (req, res, next) => {
    if (changingMethods.has(req.method) && !origins.has(req.headers.origin ?? '')) {
      res.status(403).json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin is not allowed.' } });
      return;
    }
    next();
  };
}

export function contentTypeGuard(): RequestHandler {
  return (req, res, next) => {
    const hasBody = req.headers['transfer-encoding'] !== undefined
      || Number(req.headers['content-length'] ?? 0) > 0;
    if (changingMethods.has(req.method) && hasBody && !req.is('application/json')) {
      res.status(415).json({
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request body must be application/json.' },
      });
      return;
    }
    next();
  };
}

export function applySecurity(app: Express, options: SecurityOptions = {}) {
  app.use(hostGuard(options), originGuard(options), contentTypeGuard());
  app.use(express.json({ limit: '16kb' }));
}

export function jsonErrorHandler(): ErrorRequestHandler {
  return (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' } });
    } else if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON.' } });
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } });
    }
  };
}
