// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const parts = workflow.split(/^  (test|dashboard):\n/m);
const jobs = new Map<string, string>();
for (let index = 1; index < parts.length; index += 2) {
  jobs.set(parts[index]!, parts[index + 1]!);
}

describe('CI workflow', () => {
  it('keeps read-only permissions and excludes unsafe workflow features', () => {
    const permissions = workflow.match(/^permissions:\n((?:[ \t]+[^\n]*\n)*)/m);
    expect(permissions?.[1]).toBe('  contents: read\n');
    expect(workflow.match(/^permissions:/gm)).toHaveLength(1);
    for (const forbidden of ['\t', 'secrets.', 'pull_request_target', '${{']) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it('runs each job in its own directory with the expected commands', () => {
    expect(parts[0]).toMatch(/^jobs:\n$/m);
    expect([...jobs.keys()]).toEqual(['test', 'dashboard']);
    for (const [name, directory, commands] of [
      ['test', 'example-app', ['npm ci', 'npm test', 'npm run typecheck']],
      ['dashboard', 'dashboard', ['npm ci', 'npm test', 'npm run typecheck', 'npm run build']],
    ] as const) {
      const job = jobs.get(name)!;
      expect(job).toContain('    runs-on: ubuntu-latest\n');
      expect(job).toContain(`    defaults:\n      run:\n        working-directory: ${directory}\n`);
      expect(job).toContain(`          cache-dependency-path: ${directory}/package-lock.json\n`);
      expect(job).toContain('          node-version: 24\n          cache: npm\n');
      expect([...job.matchAll(/^      - run: (.+)$/gm)].map((match) => match[1])).toEqual(commands);
    }
  });

  it('pins the same actions and versions in both jobs', () => {
    const pins = new Map<string, string>();
    const uses = [...workflow.matchAll(/^.*\buses:\s*(.+)$/gm)];
    expect(uses).toHaveLength(4);
    for (const match of uses) {
      const pin = match[1]!.match(/^(actions\/(?:checkout|setup-node))@([a-fA-F0-9]{40}) # (v\S+)$/);
      expect(pin).not.toBeNull();
      const [, action, sha, version] = pin!;
      const value = `${sha} # ${version}`;
      if (pins.has(action!)) expect(value).toBe(pins.get(action!));
      else pins.set(action!, value);
    }
    for (const job of jobs.values()) {
      expect([...job.matchAll(/^      - uses: (actions\/[^@]+)@/gm)].map((match) => match[1]))
        .toEqual(['actions/checkout', 'actions/setup-node']);
    }
  });

  it('has the dashboard scripts and lockfile required by CI', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    for (const script of ['test', 'typecheck', 'build']) {
      expect(manifest.scripts[script]).toEqual(expect.any(String));
      expect(manifest.scripts[script].trim()).not.toBe('');
    }
    expect(existsSync(new URL('../package-lock.json', import.meta.url))).toBe(true);
  });
});
