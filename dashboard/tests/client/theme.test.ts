// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dashboard = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(join(dashboard, path), 'utf8');
const tokens = read('src/styles/tokens.css');
const global = read('src/styles/global.css');
const spaces = Array.from({ length: 8 }, (_, index) => `--space-${index + 1}`);
const requiredTokens = [
  '--color-bg', '--color-bg-raised', '--color-surface', '--color-surface-hover',
  '--color-border', '--color-border-strong', '--color-text', '--color-text-muted',
  '--color-text-faint', '--color-teal', '--color-teal-dim', '--color-teal-glow',
  '--color-amber', '--color-amber-dim', '--color-success', '--color-danger',
  '--font-sans', '--font-mono', '--radius-sm', '--radius-md', '--radius-lg',
  ...spaces, '--text-sm', '--text-base', '--text-lg', '--text-xl', '--text-title',
  '--shadow-glow', '--transition-fast', '--sidebar-width', '--sidebar-width-collapsed',
];

test('declares the complete theme token palette and scale', () => {
  for (const token of requiredTokens) {
    expect(tokens).toMatch(new RegExp(`${token}\\s*:\\s*[^;]+;`));
  }
  expect(tokens).toMatch(/--color-teal\s*:\s*#2dd4bf\s*;/);
  expect(tokens).toMatch(/--font-sans\s*:[^;]*Inter Variable/);
});

test('provides the base background, typography, focus and motion hooks', () => {
  expect(global).toMatch(/body\s*\{[^}]*background-color\s*:\s*var\(--color-bg\)/);
  expect(global).toContain('prefers-reduced-motion');
  expect(global).toContain(':focus-visible');
  expect(global).toContain('.section-title');
});

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : [];
  });
}

test('keeps all source styles and the document free of remote assets', () => {
  const stylesheets = cssFiles(join(dashboard, 'src'));
  expect(stylesheets.length).toBeGreaterThan(0);
  for (const path of stylesheets) {
    expect(readFileSync(path, 'utf8')).not.toMatch(/https?:\/\/|\/\/cdn|@import\s+url\s*\(|data:/i);
  }
  expect(read('index.html')).not.toMatch(/https?:\/\//i);
});

test('loads the bundled font before tokens and global styles', () => {
  const main = read('src/main.tsx');
  const imports = [
    '@fontsource-variable/inter', './styles/tokens.css', './styles/global.css',
  ].map((source) => main.indexOf(`import '${source}';`));
  expect(imports[0]).toBeGreaterThanOrEqual(0);
  expect(imports[1]).toBeGreaterThan(imports[0]!);
  expect(imports[2]).toBeGreaterThan(imports[1]!);
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.dependencies['@fontsource-variable/inter']).toBeTruthy();
});
