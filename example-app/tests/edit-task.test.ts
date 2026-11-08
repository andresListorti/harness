import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('PATCH /tasks/:id', () => {
  it.each([
    { title: 'Updated title' },
    { description: 'Updated description' },
  ])('partially updates a task with %j and refreshes updatedAt', async (data) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const store = createTaskStore();
    const task = store.create({ title: 'Original title', description: 'Original description' });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    const response = await request(createApp({ store }))
      .patch(`/tasks/${task.id}`)
      .send(data);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...task,
      ...data,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(store.get(task.id)).toEqual(response.body);
  });

  it('updates both fields together', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Original title' });
    const response = await request(createApp({ store }))
      .patch(`/tasks/${task.id}`)
      .send({ title: '  Updated title  ', description: 'Updated description' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...task,
      title: 'Updated title',
      description: 'Updated description',
      updatedAt: expect.any(String),
    });
    expect(store.get(task.id)).toEqual(response.body);
  });

  it.each([
    ['empty object', {}],
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['unknown field', { title: 'Updated', extra: true }],
    ['id', { title: 'Updated', id: 'replacement' }],
    ['completed', { title: 'Updated', completed: true }],
    ['createdAt', { title: 'Updated', createdAt: '2026-01-01T00:00:00.000Z' }],
    ['updatedAt', { title: 'Updated', updatedAt: '2026-01-01T00:00:00.000Z' }],
    ['missing body', undefined],
  ])('rejects %s without changing the task', async (_name, body) => {
    const store = createTaskStore();
    const task = store.create({ title: 'Original title', description: 'Original description' });
    const pending = request(createApp({ store })).patch(`/tasks/${task.id}`);
    const response = await (body === undefined ? pending : pending.send(body));

    expect(response.status).toBe(400);
    expect(response.body).toEqual(errorBody(
      'VALIDATION_ERROR',
      'Invalid task data.',
      expect.any(Array),
    ));
    expect(response.body.error.details.length).toBeGreaterThan(0);
    expect(store.get(task.id)).toEqual(task);
  });

  it('returns 404 for an unknown id with valid data', async () => {
    const response = await request(createApp())
      .patch('/tasks/unknown')
      .send({ title: 'Updated title' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));
  });

  it('validates the body before looking up an unknown id', async () => {
    const response = await request(createApp())
      .patch('/tasks/unknown')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.message).toBe('Invalid task data.');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });
});
