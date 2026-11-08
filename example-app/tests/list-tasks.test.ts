import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

describe('GET /tasks', () => {
  it('returns an empty array when there are no tasks', async () => {
    const response = await request(createApp()).get('/tasks');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('returns all tasks in insertion order', async () => {
    const store = createTaskStore();
    const first = store.create({ title: 'First task', description: 'Details' });
    const second = store.create({ title: 'Second task' });
    const response = await request(createApp({ store })).get('/tasks');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([first, second]);
  });

  it.each(['true', 'false'])('filters by completed=%s', async (completed) => {
    const store = createTaskStore();
    const first = store.create({ title: 'First task' });
    const second = store.create({ title: 'Second task' });
    const third = store.create({ title: 'Third task' });
    const completedFirst = store.complete(first.id);
    const completedThird = store.complete(third.id);
    const response = await request(createApp({ store })).get(`/tasks?completed=${completed}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(completed === 'true'
      ? [completedFirst, completedThird]
      : [second]);
  });

  it.each([
    'completed=yes',
    'completed=1',
    'completed=',
    'completed',
    'completed=True',
    'completed=FALSE',
    'completed=%20true',
    'completed=null',
    'completed=true&completed=false',
    'completed=true&completed=true',
    'completed=false&completed=false',
  ])('rejects invalid filter %s', async (query) => {
    const response = await request(createApp()).get(`/tasks?${query}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /tasks/:id', () => {
  it('returns a known task', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Read a book', description: 'Chapter one' });
    const response = await request(createApp({ store })).get(`/tasks/${task.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(task);
  });

  it('returns TASK_NOT_FOUND for an unknown id', async () => {
    const response = await request(createApp()).get('/tasks/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));
  });
});
