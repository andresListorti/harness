export const CLAUDE_MODELS = ['sonnet', 'opus', 'haiku'] as const;
export type ClaudeModel = typeof CLAUDE_MODELS[number];
export const DEFAULT_CLAUDE_MODEL: ClaudeModel = 'sonnet';

export function isClaudeModel(value: unknown): value is ClaudeModel {
  return typeof value === 'string' && CLAUDE_MODELS.some(model => model === value);
}
