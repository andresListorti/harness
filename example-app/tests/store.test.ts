import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaskStore } from '../src/store.js';

describe('task store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates tasks with unique UUIDs, defaults, and timestamps', () => {
    const store = createTaskStore();
    const first = store.create({ title: 'First', description: 'Details' });
    const second = store.create({ title: 'Second' });

    expect(first).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      title: 'First',
      description: 'Details',
      completed: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(second.id).not.toBe(first.id);
    expect(second).not.toHaveProperty('description');
  });

  it('lists tasks in insertion order, including after updates', () => {
    const store = createTaskStore();
    expect(store.list()).toEqual([]);
    const first = store.create({ title: 'First' });
    const second = store.create({ title: 'Second' });
    const updated = store.update(first.id, { title: 'Updated' });
    expect(store.list()).toEqual([updated, second]);
    expect(store.get(second.id)).toEqual(second);
  });

  it('returns undefined or false for unknown ids', () => {
    const store = createTaskStore();
    expect(store.get('unknown')).toBeUndefined();
    expect(store.update('unknown', { title: 'Updated' })).toBeUndefined();
    expect(store.complete('unknown')).toBeUndefined();
    expect(store.delete('unknown')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('updates only supplied fields and preserves identity and creation time', () => {
    const store = createTaskStore();
    const original = store.create({ title: 'Original', description: 'Details' });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const updated = store.update(original.id, { title: 'Updated' });
    expect(updated).toEqual({
      ...original,
      title: 'Updated',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(store.update(original.id, { description: '' })).toEqual({
      ...updated,
      description: '',
    });
    expect(store.get(original.id)?.title).toBe('Updated');
  });

  it('completes a task once and returns defensive copies on every call', () => {
    const store = createTaskStore();
    const original = store.create({ title: 'Task', description: 'Details' });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const expected = {
      ...original,
      completed: true,
      updatedAt: '2026-01-02T00:00:00.000Z',
    };
    const completed = store.complete(original.id)!;
    expect(completed).toEqual(expected);
    expect(store.get(original.id)).toEqual(expected);
    completed.completed = false;
    completed.updatedAt = 'mutated';

    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    const repeated = store.complete(original.id)!;
    expect(repeated).toEqual(expected);
    expect(repeated).not.toBe(completed);
    repeated.completed = false;
    repeated.updatedAt = 'mutated again';
    expect(store.get(original.id)).toEqual(expected);
    expect(original.completed).toBe(false);
  });

  it('deletes existing tasks', () => {
    const store = createTaskStore();
    const task = store.create({ title: 'Task' });
    expect(store.delete(task.id)).toBe(true);
    expect(store.get(task.id)).toBeUndefined();
    expect(store.list()).toEqual([]);
    expect(store.delete(task.id)).toBe(false);
  });

  it('isolates store instances', () => {
    const first = createTaskStore();
    const second = createTaskStore();
    const task = first.create({ title: 'Task' });
    expect(second.list()).toEqual([]);
    expect(second.get(task.id)).toBeUndefined();
    second.create({ title: 'Other' });
    expect(first.list()).toEqual([task]);
  });

  it('returns defensive copies from create, get, update, and list', () => {
    const store = createTaskStore();
    const created = store.create({ title: 'Original' });
    const id = created.id;
    created.title = 'Mutated create';
    expect(store.get(id)?.title).toBe('Original');

    const fetched = store.get(id)!;
    fetched.title = 'Mutated get';
    expect(store.get(id)?.title).toBe('Original');

    const updated = store.update(id, { title: 'Updated' })!;
    updated.title = 'Mutated update';
    expect(store.get(id)?.title).toBe('Updated');

    const listed = store.list();
    listed[0]!.title = 'Mutated list';
    listed.pop();
    expect(store.list()).toEqual([{ ...created, id, title: 'Updated' }]);
  });
});
