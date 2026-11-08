import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { commitSchema, type Commits } from '../../shared/api';

const execFileAsync = promisify(execFile);

export function getRepoRoot(): string {
  return fileURLToPath(new URL('../../../', import.meta.url));
}

async function runGit(repoDir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', repoDir, ...args], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
    encoding: 'utf8',
  });
  return stdout;
}

export async function readCommits(repoDir: string, limit = 20): Promise<Commits> {
  try {
    const count = Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 20;
    const output = await runGit(repoDir, ['log', '-n', String(count), '--format=%H%x1f%s%x1f%cI']);
    const commits: Commits['commits'] = [];
    for (const line of output.split(/\r?\n/)) {
      const parts = line.split('\x1f');
      if (parts.length !== 3) continue;
      const parsed = commitSchema.safeParse({ hash: parts[0], subject: parts[1], date: parts[2] });
      if (parsed.success) commits.push(parsed.data);
    }
    return { commits };
  } catch {
    return { commits: [] };
  }
}

export async function listTestFiles(repoDir: string): Promise<string[]> {
  try {
    const output = await runGit(repoDir, ['ls-files', '-z']);
    return output.split('\0').filter((path) => /\.test\.(ts|tsx)$/.test(path)).sort();
  } catch {
    return [];
  }
}
