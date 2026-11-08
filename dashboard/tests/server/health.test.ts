// @vitest-environment node
import { Server } from 'node:http';
import request from 'supertest';
import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../../server/app';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('returns a healthy status without the powered-by header', async () => {
  const response = await request(createApp()).get('/api/health');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['x-powered-by']).toBeUndefined();
});

test('imports the app and entry point without opening a port', async () => {
  const listen = vi.spyOn(Server.prototype, 'listen');
  vi.resetModules();
  vi.stubEnv('PORT', undefined);

  const { createApp: factory } = await import('../../server/app');
  const { HOST, PORT } = await import('../../server/index');
  factory();

  expect(listen).not.toHaveBeenCalled();
  expect(HOST).toBe('127.0.0.1');
  expect(PORT).toBe(3001);
});

test('returns a JSON error for unknown API routes', async () => {
  const response = await request(createApp()).get('/api/missing/nested');

  expect(response.status).toBe(404);
  expect(response.body).toEqual({
    error: { code: 'ROUTE_NOT_FOUND', message: expect.any(String) },
  });
});

test.each(['0', '65536', '1.5', 'abc', ''])('rejects invalid PORT %j', async (port) => {
  vi.stubEnv('PORT', port);
  await expect(import('../../server/index')).rejects.toThrow('PORT must be an integer');
});

test('starts the server on the configured loopback address', async () => {
  vi.stubEnv('PORT', '4321');
  const listen = vi.spyOn(Server.prototype, 'listen').mockImplementation(function (this: Server) {
    return this;
  });
  const { startServer } = await import('../../server/index');

  startServer();

  expect(listen).toHaveBeenCalledWith(4321, '127.0.0.1');
});
