// @vitest-environment node
import request from 'supertest';
import { beforeEach, expect, test } from 'vitest';
import { useTestApp } from '../test-app';

const createApp = useTestApp();

let app: ReturnType<typeof createApp>;
beforeEach(() => {
  app = createApp({
  routes: (app) => {
    app.all('/api/echo', (req, res) => res.json({ body: req.body ?? null }));
    app.get('/api/throw', () => { throw new Error('Private exception details'); });
  },
  });
});

function post() {
  return request(app).post('/api/echo')
    .set('Host', '127.0.0.1:3001').set('Origin', 'http://localhost:5173');
}

function expectError(response: { status: number; body: unknown }, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({ error: { code, message: expect.any(String) } });
}

test.each(['foreign.example:3001', 'localhost:9999', 'localhost', '127.0.0.1:3001.evil']) (
  'rejects unknown Host %s before checking Origin', async (host) => {
    expectError(await request(app).post('/api/echo').set('Host', host), 403, 'FORBIDDEN_HOST');
  },
);

test('rejects missing Host', async () => {
  expectError(await request(app).get('/api/health').unset('Host'), 403, 'FORBIDDEN_HOST');
});

test('rejects foreign Origin before checking content type', async () => {
  expectError(await post().set('Origin', 'http://foreign.example').send('text'), 403, 'FORBIDDEN_ORIGIN');
});

test.each(['post', 'put', 'patch', 'delete'] as const)('rejects missing Origin for %s', async (method) => {
  expectError(await request(app)[method]('/api/echo').set('Host', 'localhost:3001'), 403, 'FORBIDDEN_ORIGIN');
});

test('rejects non-JSON bodies', async () => {
  expectError(await post().type('text').send('hello'), 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('rejects a body without a content type', async () => {
  expectError(await post().send('hello').unset('Content-Type'), 415, 'UNSUPPORTED_MEDIA_TYPE');
});

test('rejects oversized JSON', async () => {
  expectError(await post().send({ text: 'x'.repeat(17 * 1024) }), 413, 'PAYLOAD_TOO_LARGE');
});

test('rejects malformed JSON', async () => {
  expectError(await post().type('json').send('{'), 400, 'INVALID_JSON');
});

test('accepts JSON with a charset and parses the body', async () => {
  const response = await post().set('Content-Type', 'application/json; charset=utf-8').send({ ok: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ body: { ok: true } });
});

test('accepts a state-changing request without a body or content type', async () => {
  expect((await post()).status).toBe(200);
});

test.each(['get', 'head', 'options'] as const)('accepts %s without Origin', async (method) => {
  expect((await request(app)[method]('/api/echo').set('Host', 'localhost:5173')).status).toBe(200);
});

test('uses a configurable port allowlist', async () => {
  const custom = createApp({ ports: [4321] });
  expect((await request(custom).get('/api/health').set('Host', 'localhost:4321')).status).toBe(200);
  expectError(await request(custom).get('/api/health').set('Host', 'localhost:3001'), 403, 'FORBIDDEN_HOST');
});

test('hides exception details behind a generic JSON error', async () => {
  const response = await request(app).get('/api/throw').set('Host', 'localhost:3001');
  expectError(response, 500, 'INTERNAL_ERROR');
  expect(JSON.stringify(response.body)).not.toContain('Private exception details');
  expect(response.body.error).not.toHaveProperty('stack');
});
