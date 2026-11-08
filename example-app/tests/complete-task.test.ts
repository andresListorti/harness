import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

describe('POST /tasks/:id/complete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes a task and includes it in the completed filter', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Task', description: 'Details' });
    store.create({ title: 'Incomplete task' });
    const app = createApp({ store });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));

    const response = await request(app).post(`/tasks/${task.id}/complete`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ...task,
      completed: true,
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    const listed = await request(app).get('/tasks?completed=true');
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([response.body]);
  });

  it('preserves updatedAt when completion is repeated', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Task' });
    const app = createApp({ store });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const first = await request(app).post(`/tasks/${task.id}/complete`);
    expect(first.status).toBe(200);
    expect(first.body.completed).toBe(true);
    expect(first.body.updatedAt).toBe('2026-01-02T00:00:00.000Z');

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    const repeated = await request(app).post(`/tasks/${task.id}/complete`);

    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual(first.body);
  });

  it('returns TASK_NOT_FOUND for an unknown id', async () => {
    const response = await request(createApp()).post('/tasks/unknown/complete');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));
  });
});
