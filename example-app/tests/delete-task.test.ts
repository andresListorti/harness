import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { errorBody } from '../src/errors.js';
import { createTaskStore } from '../src/store.js';

describe('DELETE /tasks/:id', () => {
  it('deletes a task with an empty response and leaves other tasks unchanged', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Task to delete' });
    const other = store.create({ title: 'Other task', description: 'Details' });
    const app = createApp({ store });

    const response = await request(app).delete(`/tasks/${task.id}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');

    const deleted = await request(app).get(`/tasks/${task.id}`);
    expect(deleted.status).toBe(404);
    expect(deleted.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));

    const listed = await request(app).get('/tasks');
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([other]);

    const retained = await request(app).get(`/tasks/${other.id}`);
    expect(retained.status).toBe(200);
    expect(retained.body).toEqual(other);
  });

  it('returns TASK_NOT_FOUND for an unknown id', async () => {
    const store = createTaskStore();
    const response = await request(createApp({ store })).delete('/tasks/unknown');

    expect(response.status).toBe(404);
    expect(response.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));
  });

  it('returns 204 then 404 when deleting the same task twice', async () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Task' });
    const app = createApp({ store });

    const first = await request(app).delete(`/tasks/${task.id}`);
    const second = await request(app).delete(`/tasks/${task.id}`);

    expect(first.status).toBe(204);
    expect(first.text).toBe('');
    expect(second.status).toBe(404);
    expect(second.body).toEqual(errorBody('TASK_NOT_FOUND', 'Task not found.'));
  });
});
