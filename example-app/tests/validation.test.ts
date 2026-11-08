import { describe, expect, it } from 'vitest';
import { createTaskSchema, updateTaskSchema } from '../src/validation.js';

describe('createTaskSchema', () => {
  it('accepts valid input and trims the title', () => {
    expect(createTaskSchema.parse({ title: '  Read a book  ', description: 'Chapter one' }))
      .toEqual({ title: 'Read a book', description: 'Chapter one' });
    expect(createTaskSchema.parse({ title: 'Read' })).toEqual({ title: 'Read' });
  });

  it('requires a title', () => {
    expect(createTaskSchema.safeParse({}).success).toBe(false);
  });
});

describe('updateTaskSchema', () => {
  it('accepts either field or both and trims the title', () => {
    expect(updateTaskSchema.parse({ title: '  Read  ' })).toEqual({ title: 'Read' });
    expect(updateTaskSchema.parse({ description: '' })).toEqual({ description: '' });
    expect(updateTaskSchema.parse({ title: ' Read ', description: 'Chapter two' }))
      .toEqual({ title: 'Read', description: 'Chapter two' });
  });

  it('rejects an empty update', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });
});

describe.each([
  ['createTaskSchema', createTaskSchema],
  ['updateTaskSchema', updateTaskSchema],
] as const)('%s shared rules', (_name, schema) => {
  it.each(['', ' \t\n ', 'a'.repeat(201), 42, null, true, {}, []])(
    'rejects invalid title %j', (title) => {
      expect(schema.safeParse({ title }).success).toBe(false);
    },
  );

  it('checks title length after trimming and accepts boundary lengths', () => {
    const title = 'a'.repeat(200);
    const description = 'b'.repeat(2000);
    expect(schema.parse({ title: `  ${title}  `, description }))
      .toEqual({ title, description });
    expect(schema.safeParse({ title: ' a ' }).success).toBe(true);
  });

  it('preserves description whitespace', () => {
    expect(schema.parse({ title: 'Read', description: '  Notes  ' }).description)
      .toBe('  Notes  ');
  });

  it.each(['a'.repeat(2001), 42, null, true, {}, []])(
    'rejects invalid description %j', (description) => {
      expect(schema.safeParse({ title: 'Read', description }).success).toBe(false);
    },
  );

  it.each(['extra', 'completed', 'id', 'createdAt', 'updatedAt'])(
    'rejects unknown field %s', (field) => {
      expect(schema.safeParse({ title: 'Read', [field]: 'value' }).success).toBe(false);
    },
  );
});
