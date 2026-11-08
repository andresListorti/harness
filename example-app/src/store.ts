import { randomUUID } from 'node:crypto';
import type { Task, CreateTaskInput, UpdateTaskInput } from './validation.js';

export type TaskStore = ReturnType<typeof createTaskStore>;

export function createTaskStore() {
  const tasks = new Map<string, Task>();

  return {
    create(input: CreateTaskInput): Task {
      const now = new Date().toISOString();
      const task: Task = {
        id: randomUUID(),
        title: input.title,
        ...(input.description !== undefined ? { description: input.description } : {}),
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      tasks.set(task.id, task);
      return { ...task };
    },

    list(): Task[] {
      return Array.from(tasks.values(), (task) => ({ ...task }));
    },

    get(id: string): Task | undefined {
      const task = tasks.get(id);
      return task ? { ...task } : undefined;
    },

    update(id: string, input: UpdateTaskInput): Task | undefined {
      const task = tasks.get(id);
      if (!task) return undefined;
      if (input.title !== undefined) task.title = input.title;
      if (input.description !== undefined) task.description = input.description;
      task.updatedAt = new Date().toISOString();
      return { ...task };
    },

    delete(id: string): boolean {
      return tasks.delete(id);
    },
  };
}
