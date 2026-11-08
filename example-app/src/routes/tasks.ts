import { Router } from 'express';
import { errorBody } from '../errors.js';
import type { TaskStore } from '../store.js';
import { createTaskSchema } from '../validation.js';

export function createTasksRouter(store: TaskStore) {
  const router = Router();

  router.get('/', (request, response) => {
    const { completed } = request.query;
    if (completed !== undefined && completed !== 'true' && completed !== 'false') {
      response.status(400).json(
        errorBody('VALIDATION_ERROR', 'Invalid completed filter.'),
      );
      return;
    }

    const tasks = store.list();
    response.status(200).json(
      completed === undefined
        ? tasks
        : tasks.filter((task) => task.completed === (completed === 'true')),
    );
  });

  router.get('/:id', (request, response) => {
    const task = store.get(request.params.id);
    if (!task) {
      response.status(404).json(errorBody('TASK_NOT_FOUND', 'Task not found.'));
      return;
    }

    response.status(200).json(task);
  });

  router.post('/', (request, response) => {
    const result = createTaskSchema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json(
        errorBody('VALIDATION_ERROR', 'Invalid task data.', result.error.issues),
      );
      return;
    }

    response.status(201).json(store.create(result.data));
  });

  return router;
}
