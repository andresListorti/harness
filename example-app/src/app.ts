import express from 'express';
import { errorHandler, notFoundHandler } from './errors.js';
import { createTasksRouter } from './routes/tasks.js';
import { createTaskStore, type TaskStore } from './store.js';

export function createApp(options: { store?: TaskStore } = {}) {
  const app = express();
  const store = options.store ?? createTaskStore();

  app.use(express.json());
  app.use('/tasks', createTasksRouter(store));
  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
