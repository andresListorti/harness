import { Server } from 'node:net';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

describe('application setup', () => {
  it('returns the health status', async () => {
    const { createApp } = await import('../src/app.js');

    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('imports and creates independent apps without opening a port', async () => {
    vi.resetModules();
    const listen = vi.spyOn(Server.prototype, 'listen');

    try {
      const { createApp } = await import('../src/app.js');
      const first = createApp();
      const second = createApp();

      expect(first).not.toBe(second);
      first.locals.instance = 'first';
      expect(second.locals.instance).toBeUndefined();
      expect(listen).not.toHaveBeenCalled();
    } finally {
      listen.mockRestore();
    }
  });
});
