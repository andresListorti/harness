import { Router } from 'express';
import { errorBody } from '../errors.js';
import type { TaskStore } from '../store.js';
import { createTaskSchema } from '../validation.js';

export function createTasksRouter(store: TaskStore) {
  const router = Router();

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
