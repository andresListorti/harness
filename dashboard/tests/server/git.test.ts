// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRepoRoot, listTestFiles, readCommits } from '../../server/data/git';
import { commitsSchema } from '../../shared/api';

const execFileAsync = promisify(execFile);
const author = 'Fixture Author';
const email = ['fixture', 'example.invalid'].join('@');
let tempDir: string;
let repoDir: string;
let emptyRepo: string;
let plainDir: string;

async function git(directory: string, args: string[]) {
  return execFileAsync('git', ['-C', directory, ...args], {
    timeout: 5000,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: author,
      GIT_COMMITTER_EMAIL: email,
    },
  });
}

beforeAll(async () => {
  await execFileAsync('git', ['--version']); // Fail setup clearly if git is unavailable.
  tempDir = await mkdtemp(join(tmpdir(), 'harness-git-'));
  repoDir = join(tempDir, 'repo');
  emptyRepo = join(tempDir, 'empty');
  plainDir = join(tempDir, 'plain');
  for (const directory of [repoDir, emptyRepo, plainDir]) await mkdir(directory);
  await git(repoDir, ['init']);
  await git(emptyRepo, ['init']);
  await mkdir(join(repoDir, 'tests'));
  for (const path of ['tests/z.test.ts', 'tests/a.test.tsx', 'notes.txt']) {
    await writeFile(join(repoDir, path), 'fixture');
  }
  await git(repoDir, ['add', '.']);
  await git(repoDir, ['commit', '-m', 'First commit']);
  await git(repoDir, ['commit', '--allow-empty', '-m', 'Second commit']);
  await git(repoDir, ['commit', '--allow-empty', '-m', 'Third commit']);
  await writeFile(join(repoDir, 'untracked.test.ts'), 'fixture');
});

afterAll(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

describe('readCommits', () => {
  it('returns validated commits newest first with only public fields', async () => {
    const result = await readCommits(repoDir);
    expect(commitsSchema.safeParse(result).success).toBe(true);
    expect(result.commits.map(({ subject }) => subject)).toEqual([
      'Third commit', 'Second commit', 'First commit',
    ]);
    for (const commit of result.commits) {
      expect(commit.hash).toMatch(/^[0-9a-f]{40}$/);
      expect(Number.isNaN(Date.parse(commit.date))).toBe(false);
      expect(Object.keys(commit).sort()).toEqual(['date', 'hash', 'subject']);
    }
    expect(JSON.stringify(result)).not.toContain(author);
    expect(JSON.stringify(result)).not.toContain(email);
  });

  it('enforces the requested limit', async () => {
    expect((await readCommits(repoDir, 2)).commits).toHaveLength(2);
  });

  it.each([0, -5, NaN, 1.5, Infinity])('handles invalid limit %s', async (limit) => {
    const result = await readCommits(repoDir, limit);
    expect(result.commits).toHaveLength(Number.isInteger(limit) ? 1 : 3);
    expect(commitsSchema.safeParse(result).success).toBe(true);
  });

  it('returns empty results for non-repositories, missing directories and empty repositories', async () => {
    for (const directory of [plainDir, join(tempDir, 'missing'), emptyRepo]) {
      await expect(readCommits(directory)).resolves.toEqual({ commits: [] });
    }
  });
});

it('lists only tracked test files with sorted repository-relative paths', async () => {
  await expect(listTestFiles(repoDir)).resolves.toEqual(['tests/a.test.tsx', 'tests/z.test.ts']);
  for (const directory of [plainDir, join(tempDir, 'missing'), emptyRepo]) {
    await expect(listTestFiles(directory)).resolves.toEqual([]);
  }
});

it('resolves the repository root relative to the module', async () => {
  expect(await readFile(join(getRepoRoot(), 'dashboard', 'PLAN.md'), 'utf8')).toContain('git-reader');
});
