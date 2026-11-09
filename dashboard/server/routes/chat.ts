import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildChatPrompt } from '../chat/prompt';
import { ChatRunError, runClaudeChat } from '../chat/runner';
import { defaultSettingsPath, readSettings } from '../settings';
import { Router } from 'express';
import { CHAT_HISTORY_MESSAGE_LIMIT, CODEX_CHAT_NOTICE, chatHistorySchema, chatRequestSchema, chatResponseSchema, chatSuggestionsSchema } from '../../shared/api';
import { appendToHistory, clearHistory, currentGeneration, defaultHistoryPath, readHistory } from '../chat/history';
import { resolveLocally, LOCAL_SUGGESTIONS } from '../chat/local';
import { createRepoReader, type DataDeps } from './data';

export function createChatRouter(deps: DataDeps = {}): Router {
  const router = Router();
  let running = false;
  const run = deps.runClaudeChat ?? runClaudeChat;
  const reader = createRepoReader(deps);
  const filePath = deps.historyPath ?? defaultHistoryPath();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/docs/chat-isolation', async (_req, res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    try {
      const text = await readFile(join(reader.repoRoot, 'docs/chat-isolation.md'), 'utf8');
      res.set('Content-Type', 'text/plain; charset=utf-8').send(text);
    } catch {
      res.status(404).type('text').send('Chat isolation document not found.');
    }
  });
  router.get('/chat/suggestions', (_req, res) => {
    res.json(chatSuggestionsSchema.parse({ suggestions: [...LOCAL_SUGGESTIONS] }));
  });
  router.get('/chat/history', async (_req, res) => {
    res.json(chatHistorySchema.parse(await readHistory(filePath)));
  });
  router.delete('/chat/history', async (_req, res) => {
    try {
      await clearHistory(filePath);
      res.json(chatHistorySchema.parse({ messages: [] }));
    } catch {
      res.status(500).json({ error: { code: 'HISTORY_CLEAR_FAILED', message: 'Saved history could not be cleared.' } });
    }
  });
  router.post('/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Message must be a non-empty string of at most 2000 characters, with no extra fields.' } });
      return;
    }
    const generation = currentGeneration(filePath);
    const [[example, dashboard], history, testFiles] = await Promise.all([
      reader.sources(), reader.commits(reader.repoRoot, 5), reader.tests(reader.repoRoot),
    ]);
    const context = {
      pending: dashboard.tasks.filter(task => task.column === 'pending'),
      inProgress: dashboard.tasks.filter(task => task.column === 'in_progress'),
      runLog: [...example.runLog, ...dashboard.runLog], commits: history.commits, testFiles,
    };
    const local = resolveLocally(parsed.data.message, context);
    let reply = local.reply;
    let source: 'local' | 'orchestrator' = 'local';
    let notice: string | undefined;
    if (!local.recognized) {
      const settings = await readSettings(deps.settingsPath ?? defaultSettingsPath());
      if (settings.orchestrator === 'codex') {
        notice = CODEX_CHAT_NOTICE;
      } else {
        if (running) {
          res.status(429).json({ error: { code: 'CHAT_BUSY', message: 'A chat answer is already running. Please try again when it finishes.' } });
          return;
        }
        running = true;
        try {
          const saved = await readHistory(filePath);
          const prompt = buildChatPrompt(parsed.data.message, saved.messages, { sections: [
            { name: 'Pending tasks', text: JSON.stringify(context.pending) },
            { name: 'In-progress tasks', text: JSON.stringify(context.inProgress) },
            { name: 'Latest run-log notes', text: JSON.stringify(context.runLog.slice(-5)) },
            { name: 'Commits', text: JSON.stringify(context.commits) },
            { name: 'Test files', text: JSON.stringify(testFiles) },
          ] });
          reply = await run(prompt, settings.chatModel);
          source = 'orchestrator';
        } catch (error) {
          const code = error instanceof ChatRunError ? error.code : 'FAILED_RUN';
          const status = code === 'CLI_NOT_FOUND' ? 503 : code === 'TIMEOUT' ? 504 : 502;
          const message = code === 'CLI_NOT_FOUND'
            ? 'Claude Code CLI was not found. Local questions still work.'
            : code === 'TIMEOUT' ? 'Claude Code timed out. Please try again.'
              : 'Claude Code could not complete the chat. Please try again.';
          res.status(status).json({ error: { code, message } });
          return;
        } finally {
          running = false;
        }
      }
    }
    const historyMarker = '[reply shortened in history]';
    const historyReply = reply.length > CHAT_HISTORY_MESSAGE_LIMIT
      ? reply.slice(0, CHAT_HISTORY_MESSAGE_LIMIT - historyMarker.length) + historyMarker
      : reply;
    try {
      await appendToHistory(filePath, [
        { role: 'user', text: parsed.data.message },
        { role: 'assistant', text: historyReply, source },
      ], generation);
    } catch { /* A history failure must not prevent an answer. */ }
    res.json(chatResponseSchema.parse({ reply, source, ...(notice ? { notice } : {}) }));
  });
  return router;
}
