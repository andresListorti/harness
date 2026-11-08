import { z } from 'zod';

export interface Task {
  /** UUID. */
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. */
  updatedAt: string;
}

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(2000);

export const createTaskSchema = z.strictObject({
  title: titleSchema,
  description: descriptionSchema.optional(),
});

export const updateTaskSchema = z.strictObject({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
}).refine((input) => Object.keys(input).length > 0, {
  message: 'At least one field is required.',
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
