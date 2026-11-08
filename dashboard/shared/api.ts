import { z } from 'zod';

export const agentIdSchema = z.enum(['claude-code', 'codex']);
export type AgentId = z.infer<typeof agentIdSchema>;

export const planColumnSchema = z.enum(['pending', 'in_progress', 'done']);
export type PlanColumn = z.infer<typeof planColumnSchema>;

export const planSourceSchema = z.enum(['dashboard', 'example-app']);
export type PlanSource = z.infer<typeof planSourceSchema>;

export const planTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  group: z.string().nullable(),
  goal: z.string(),
  files: z.string(),
  definitionOfDone: z.string(),
  result: z.string().nullable(),
  column: planColumnSchema,
}).strict();
export type PlanTask = z.infer<typeof planTaskSchema>;

export const planBoardSchema = z.object({
  source: planSourceSchema,
  tasks: z.array(planTaskSchema),
}).strict();
export type PlanBoard = z.infer<typeof planBoardSchema>;

export const runLogEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  branch: z.string().nullable(),
  attempts: z.number().int().min(0).nullable(),
  result: z.string().nullable(),
  notes: z.array(z.string()),
}).strict();
export type RunLogEntry = z.infer<typeof runLogEntrySchema>;

export const runLogSchema = z.object({
  source: planSourceSchema,
  entries: z.array(runLogEntrySchema),
}).strict();
export type RunLog = z.infer<typeof runLogSchema>;

export const commitSchema = z.object({
  hash: z.string().regex(/^[0-9a-fA-F]{7,40}$/),
  subject: z.string(),
  date: z.iso.datetime({ offset: true }),
}).strict();
export type Commit = z.infer<typeof commitSchema>;

export const commitsSchema = z.object({ commits: z.array(commitSchema) }).strict();
export type Commits = z.infer<typeof commitsSchema>;

export const galaxyNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['core', 'agent', 'system']),
  role: z.enum(['orchestrator', 'worker']).nullable(),
  count: z.number().int().min(0).nullable(),
  details: z.array(z.string()),
}).strict();
export type GalaxyNode = z.infer<typeof galaxyNodeSchema>;

export const galaxySchema = z.object({ nodes: z.array(galaxyNodeSchema) }).strict();
export type Galaxy = z.infer<typeof galaxySchema>;

export const agentStatusSchema = z.enum(['working', 'done', 'error']);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentCardSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1),
  agent: agentIdSchema.nullable(),
  model: z.string().nullable(),
  status: agentStatusSchema,
  elapsedSeconds: z.number().min(0).nullable(),
  output: z.array(z.string()),
}).strict();
export type AgentCard = z.infer<typeof agentCardSchema>;

export const agentsSchema = z.object({ agents: z.array(agentCardSchema) }).strict();
export type Agents = z.infer<typeof agentsSchema>;

export const healthSchema = z.object({ status: z.literal('ok') }).strict();
export type Health = z.infer<typeof healthSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
}).strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatResponseSchema = z.object({
  reply: z.string(),
  source: z.literal('local'),
}).strict();
export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }).strict(),
}).strict();
export type ApiError = z.infer<typeof apiErrorSchema>;

export const chatSuggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1)),
}).strict();
export type ChatSuggestions = z.infer<typeof chatSuggestionsSchema>;
