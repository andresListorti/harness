import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody, errorHandler } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

describe('error handling', () => {
  it('returns INVALID_JSON for malformed JSON', async () => {
    const response = await request(createApp())
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual(errorBody('INVALID_JSON', 'Request body is not valid JSON.'));
  });

  it('returns ROUTE_NOT_FOUND for an unknown route', async () => {
    const response = await request(createApp()).get('/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('ROUTE_NOT_FOUND', 'Route not found.'));
  });

  it('returns ROUTE_NOT_FOUND for an unsupported method', async () => {
    const response = await request(createApp()).put('/tasks');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('ROUTE_NOT_FOUND', 'Route not found.'));
  });

  it('returns BAD_REQUEST for a payload exceeding the parser limit', async () => {
    const response = await request(createApp())
      .post('/tasks')
      .send({ title: 'x'.repeat(110 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual(errorBody('BAD_REQUEST', 'Invalid request.'));
  });

  it.each(['status', 'statusCode'])('handles a numeric 4xx %s', async (property) => {
    const store = {
      ...createTaskStore(),
      list() { throw { [property]: 415 }; },
    };
    const response = await request(createApp({ store })).get('/tasks');

    expect(response.status).toBe(415);
    expect(response.body).toEqual(errorBody('BAD_REQUEST', 'Invalid request.'));
  });

  it('logs unexpected errors without exposing their message or stack', async () => {
    const error = new Error('Distinctive internal failure');
    const store = {
      ...createTaskStore(),
      list() { throw error; },
    };
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(createApp({ store })).get('/tasks');

      expect(response.status).toBe(500);
      expect(response.body).toEqual(errorBody('INTERNAL_ERROR', 'Internal server error.'));
      expect(response.text).not.toContain(error.message);
      expect(response.text.toLowerCase()).not.toContain('stack');
      expect(log).toHaveBeenCalledWith(error);
    } finally {
      log.mockRestore();
    }
  });

  it('delegates errors when headers have already been sent', async () => {
    const error = new Error('Failure after headers');
    const nextHandler = vi.fn();
    const app = express();
    app.get('/', (_request, response, next) => {
      response.write('started');
      next(error);
    });
    app.use(errorHandler);
    app.use(((caught, _request, response, _next) => {
      nextHandler(caught);
      response.end();
    }) satisfies express.ErrorRequestHandler);

    const response = await request(app).get('/');

    expect(response.text).toBe('started');
    expect(nextHandler).toHaveBeenCalledWith(error);
  });

  it('keeps the health route available', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
