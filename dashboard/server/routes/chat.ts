import { Router } from 'express';
import { chatHistorySchema, chatRequestSchema, chatResponseSchema, chatSuggestionsSchema } from '../../shared/api';
import { appendToHistory, clearHistory, currentGeneration, defaultHistoryPath, readHistory } from '../chat/history';
import { answerLocally, LOCAL_SUGGESTIONS } from '../chat/local';
import { createRepoReader, type DataDeps } from './data';

export function createChatRouter(deps: DataDeps = {}): Router {
  const router = Router();
  const reader = createRepoReader(deps);
  const filePath = deps.historyPath ?? defaultHistoryPath();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
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
    const reply = answerLocally(parsed.data.message, {
      pending: dashboard.tasks.filter(task => task.column === 'pending'),
      inProgress: dashboard.tasks.filter(task => task.column === 'in_progress'),
      runLog: [...example.runLog, ...dashboard.runLog], commits: history.commits, testFiles,
    });
    try {
      await appendToHistory(filePath, [
        { role: 'user', text: parsed.data.message },
        { role: 'assistant', text: reply, source: 'local' },
      ], generation);
    } catch { /* A history failure must not prevent an answer. */ }
    res.json(chatResponseSchema.parse({ reply, source: 'local' }));
  });
  return router;
}
