import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response } from 'express';
import {
  agentsSchema, commitsSchema, galaxySchema, planBoardSchema, planSourceSchema,
  runLogSchema, type PlanSource,
} from '../../shared/api';
import { buildAgents } from '../data/agents';
import { buildGalaxy } from '../data/galaxy';
import { getRepoRoot, listTestFiles, readCommits } from '../data/git';
import { parsePlan } from '../data/plan';
import { parseRunLog } from '../data/runlog';

export interface DataDeps {
  repoRoot?: string;
  readCommits?: typeof readCommits;
  listTestFiles?: typeof listTestFiles;
}

export function createDataRouter(deps: DataDeps = {}): Router {
  const router = Router();
  const repoRoot = deps.repoRoot ?? getRepoRoot();
  const commits = deps.readCommits ?? readCommits;
  const tests = deps.listTestFiles ?? listTestFiles;
  const planFiles = { dashboard: 'dashboard/PLAN.md', 'example-app': 'example-app/PLAN.md' };
  const read = (file: string) => readFile(join(repoRoot, file), 'utf8').catch(() => '');
  const plan = async (source: PlanSource) => parsePlan(await read(planFiles[source]), source);
  const runlog = async (source: PlanSource) => parseRunLog(await read('docs/run-log.md'), source);
  const source = (req: Request, res: Response): PlanSource | undefined => {
    const parsed = planSourceSchema.safeParse(req.query.source === undefined ? 'dashboard' : req.query.source);
    if (parsed.success) return parsed.data;
    res.status(400).json({ error: { code: 'INVALID_SOURCE', message: 'Source must be dashboard or example-app.' } });
  };
  const sources = async () => Promise.all((['example-app', 'dashboard'] as const).map(async source => ({
    source, tasks: (await plan(source)).tasks, runLog: (await runlog(source)).entries,
  })));

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/plan', async (req, res) => {
    const selected = source(req, res);
    if (selected) res.json(planBoardSchema.parse(await plan(selected)));
  });
  router.get('/runlog', async (req, res) => {
    const selected = source(req, res);
    if (selected) res.json(runLogSchema.parse(await runlog(selected)));
  });
  router.get('/commits', async (req, res) => {
    const limit = typeof req.query.limit === 'string' && req.query.limit.trim() !== ''
      ? Number(req.query.limit) : NaN;
    res.json(commitsSchema.parse(await commits(repoRoot, Number.isFinite(limit) ? limit : 20)));
  });
  router.get('/galaxy', async (_req, res) => {
    const [[example, dashboard], history, testFiles] = await Promise.all([
      sources(), commits(repoRoot, 20), tests(repoRoot),
    ]);
    res.json(galaxySchema.parse(buildGalaxy({
      tasks: [...dashboard.tasks, ...example.tasks],
      runLog: [...example.runLog, ...dashboard.runLog], commits: history.commits, testFiles,
    })));
  });
  router.get('/agents', async (_req, res) => {
    res.json(agentsSchema.parse(buildAgents(await sources())));
  });
  return router;
}
