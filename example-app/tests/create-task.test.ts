import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

describe('POST /tasks', () => {
  it('creates and stores a task with a trimmed title and timestamps', async () => {
    const store = createTaskStore();
    const response = await request(createApp({ store }))
      .post('/tasks')
      .send({ title: '  Read a book  ', description: 'Chapter one' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      title: 'Read a book',
      description: 'Chapter one',
      completed: false,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(new Date(response.body.createdAt).toISOString()).toBe(response.body.createdAt);
    expect(response.body.updatedAt).toBe(response.body.createdAt);
    expect(store.get(response.body.id)).toEqual(response.body);
    expect(store.list()).toEqual([response.body]);
  });

  it.each([
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['missing title', {}],
    ['unknown field', { title: 'Read', extra: true }],
    ['missing body', undefined],
  ])('rejects %s without storing a task', async (_name, body) => {
    const store = createTaskStore();
    const pending = request(createApp({ store })).post('/tasks');
    const response = await (body === undefined ? pending : pending.send(body));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid task data.');
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(response.body.error.details.length).toBeGreaterThan(0);
    expect(store.list()).toEqual([]);
  });
});

describe('errorBody', () => {
  it('omits undefined details', () => {
    expect(errorBody('TEST', 'Test message.', undefined)).toEqual({
      error: { code: 'TEST', message: 'Test message.' },
    });
  });
});
