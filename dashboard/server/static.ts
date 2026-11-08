import { existsSync } from 'node:fs';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type RequestHandler } from 'express';

export const DEFAULT_STATIC_DIR = fileURLToPath(new URL('../dist/', import.meta.url));

export const CONTENT_SECURITY_POLICY: string = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    next();
  };
}

export function hasBuiltFrontend(staticDir = DEFAULT_STATIC_DIR): boolean {
  return existsSync(resolve(staticDir, 'index.html'));
}

export function serveStatic(app: Express, staticDir: string): boolean {
  if (!hasBuiltFrontend(staticDir)) return false;

  const root = resolve(staticDir);
  const files = express.static(root, {
    index: false,
    dotfiles: 'ignore',
    fallthrough: true,
    setHeaders(res, file) {
      const path = relative(root, file).split(sep).join('/');
      const hashedAsset = /^assets\/.*-[a-zA-Z0-9_-]+\.[^/]+$/.test(path);
      res.setHeader('Cache-Control', hashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'no-cache');
    },
  });
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    files(req, res, next);
  });
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD')
      || req.path.startsWith('/api') || req.path.split('/').some((part) => part.startsWith('.'))
      || extname(req.path.split('/').pop() ?? '')) {
      return next();
    }
    res.set('Cache-Control', 'no-cache');
    res.type('html').sendFile(resolve(root, 'index.html'));
  });
  return true;
}
