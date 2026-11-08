import { Router } from 'express';
import { chatRequestSchema, chatResponseSchema, chatSuggestionsSchema } from '../../shared/api';
import { answerLocally, LOCAL_SUGGESTIONS } from '../chat/local';
import { createRepoReader, type DataDeps } from './data';

export function createChatRouter(deps: DataDeps = {}): Router {
  const router = Router();
  const reader = createRepoReader(deps);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/chat/suggestions', (_req, res) => {
    res.json(chatSuggestionsSchema.parse({ suggestions: [...LOCAL_SUGGESTIONS] }));
  });
  router.post('/chat', async (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Message must be a non-empty string of at most 2000 characters, with no extra fields.' } });
      return;
    }
    const [[example, dashboard], history, testFiles] = await Promise.all([
      reader.sources(), reader.commits(reader.repoRoot, 5), reader.tests(reader.repoRoot),
    ]);
    const reply = answerLocally(parsed.data.message, {
      pending: dashboard.tasks.filter(task => task.column === 'pending'),
      inProgress: dashboard.tasks.filter(task => task.column === 'in_progress'),
      runLog: [...example.runLog, ...dashboard.runLog], commits: history.commits, testFiles,
    });
    res.json(chatResponseSchema.parse({ reply, source: 'local' }));
  });
  return router;
}
