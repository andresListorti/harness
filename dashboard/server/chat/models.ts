import { claudeModelSchema, type ClaudeModel } from '../../shared/api';
export { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL, type ClaudeModel } from '../../shared/api';

export function isClaudeModel(value: unknown): value is ClaudeModel {
  return claudeModelSchema.safeParse(value).success;
}
