// @vitest-environment node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';
import { useTestApp } from '../test-app';
import { CONTENT_SECURITY_POLICY, DEFAULT_STATIC_DIR } from '../../server/static';

const createApp = useTestApp();

const fixture = mkdtempSync(join(tmpdir(), 'dashboard-static-'));
const index = '<!doctype html><html><body>Fixture dashboard</body></html>';
mkdirSync(join(fixture, 'assets'));
writeFileSync(join(fixture, 'index.html'), index);
writeFileSync(join(fixture, 'assets/app-abc123.js'), 'console.log("fixture");');
writeFileSync(join(fixture, 'assets/app-abc123.css'), 'body { color: teal; }');
writeFileSync(join(fixture, 'robots.txt'), 'User-agent: *');
writeFileSync(join(fixture, '.secret'), 'private fixture secret');
const empty = join(fixture, 'empty');
mkdirSync(empty);
let app: ReturnType<typeof createApp>;
beforeEach(() => { app = createApp({ staticDir: fixture }); });
const get = (path: string) => request(app).get(path).set('Host', '127.0.0.1:3001');

afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function expectHeaders(headers: Record<string, string>) {
  expect(headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['x-frame-options']).toBe('DENY');
}

it('serves the index with strict security headers and no caching', async () => {
  const response = await get('/');
  expect(response.status).toBe(200);
  expect(response.text).toBe(index);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.headers['cache-control']).toBe('no-cache');
  expectHeaders(response.headers);
});

it('defines exactly the eleven local-only CSP directives', () => {
  const directives = CONTENT_SECURITY_POLICY.split('; ').map((value) => value.split(' '));
  expect(directives).toEqual([
    ['default-src', "'self'"], ['script-src', "'self'"], ['style-src', "'self'"],
    ['img-src', "'self'"], ['font-src', "'self'"], ['media-src', "'self'", 'blob:'], ['connect-src', "'self'"],
    ['object-src', "'none'"], ['base-uri', "'self'"], ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ]);
  for (const [directive, ...sources] of directives) {
    expect(sources.every((source) => source === "'self'" || source === "'none'" || (directive === 'media-src' && source === 'blob:'))).toBe(true);
  }
  expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|data:|https?:|\*/);
});

it.each([['js', /javascript/], ['css', /text\/css/]] as const)(
  'serves hashed %s assets with immutable caching', async (extension, type) => {
    const response = await get(`/assets/app-abc123.${extension}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(type);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expectHeaders(response.headers);
  },
);

it('does not cache ordinary files', async () => {
  const response = await get('/robots.txt');
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-cache');
});

it('preserves API JSON responses and headers', async () => {
  const health = await get('/api/health');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ status: 'ok' });
  expectHeaders(health.headers);
  const missing = await get('/api/nope');
  expect(missing.status).toBe(404);
  expect(missing.headers['content-type']).toContain('application/json');
  expect(missing.body.error.code).toBe('ROUTE_NOT_FOUND');
  expectHeaders(missing.headers);
});

it('includes security headers on rejected requests and errors', async () => {
  const rejected = await get('/').set('Host', 'foreign.example:3001');
  expect(rejected.status).toBe(403);
  expectHeaders(rejected.headers);
  const malformed = await request(app).post('/anything').set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:3001').type('json').send('{');
  expect(malformed.status).toBe(400);
  expectHeaders(malformed.headers);
});

it.each(['/agents', '/some/deep/path'])('serves the SPA at %s', async (path) => {
  const response = await get(path);
  expect(response.status).toBe(200);
  expect(response.text).toBe(index);
  expect(response.headers['cache-control']).toBe('no-cache');
});

it.each(['/assets/missing.js', '/favicon.ico', '/.secret'])(
  'returns 404 for %s', async (path) => {
    const response = await get(path);
    expect(response.status).toBe(404);
    expect(response.text).not.toBe(index);
    expect(response.text).not.toContain('private fixture secret');
  },
);

it.each([
  '/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json',
  '/assets/..%2f..%2fserver%2Fapp.ts',
])('does not expose outside files via %s', async (path) => {
  const response = await get(path);
  expect((response.status >= 400 && response.status < 500) || response.text === index).toBe(true);
  expect(response.text).not.toMatch(/harness-dashboard|createApp/);
});

it('does not serve the index for POST', async () => {
  const response = await request(app).post('/anything').set('Host', '127.0.0.1:3001')
    .set('Origin', 'http://127.0.0.1:3001').type('json').send({});
  expect(response.status).toBe(404);
  expect(response.text).not.toBe(index);
});

it('supports HEAD for the index', async () => {
  const response = await request(app).head('/').set('Host', '127.0.0.1:3001');
  expect(response.status).toBe(200);
  expect(response.text).toBeUndefined();
  expect(response.headers['content-type']).toContain('text/html');
  expectHeaders(response.headers);
});

it.each([false, empty] as const)('works without static serving (%s)', async (staticDir) => {
  const unbuilt = createApp({ staticDir });
  const root = await request(unbuilt).get('/').set('Host', '127.0.0.1:3001');
  expect(root.status).toBe(404);
  expectHeaders(root.headers);
  const health = await request(unbuilt).get('/api/health').set('Host', '127.0.0.1:3001');
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ status: 'ok' });
  expectHeaders(health.headers);
});

const builtIndex = join(DEFAULT_STATIC_DIR, 'index.html');
it.skipIf(!existsSync(builtIndex))('keeps built HTML compatible with the CSP', async () => {
  const html = readFileSync(builtIndex, 'utf8');
  const response = await request(createApp()).get('/').set('Host', '127.0.0.1:3001');
  expectHeaders(response.headers);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    expect(script[1].trim()).toBe('');
  }
  expect(html).not.toMatch(/\bstyle\s*=|https?:\/\//i);
});
