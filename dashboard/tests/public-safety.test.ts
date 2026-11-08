// @vitest-environment node
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, type Dirent } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isImageFile, scanContent, type FindingKind } from './helpers/safety-scan';

const dashboard = fileURLToPath(new URL('../', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (base: string, file: string) => readFileSync(join(base, file), 'utf8');
const https = ['https:', '', 'example.invalid'].join('/');
const secret = 'sk' + '-' + 'a'.repeat(30);
const imageTag = '<' + 'img src="local">';

describe('safety scanner', () => {
  const cases: [string, string, FindingKind][] = [
    ['note.txt', ['user', 'example.invalid'].join('@'), 'email'],
    ['note.txt', 'C' + ':\\Users\\someone', 'absolute-path'],
    ['note.txt', 'D' + ':/work', 'absolute-path'],
    ['note.txt', '/' + 'home/someone', 'absolute-path'],
    ['note.txt', '/' + 'Users/someone', 'absolute-path'],
    ['note.txt', '\\\\' + 'Users\\someone', 'absolute-path'],
    ['note.txt', secret, 'secret'],
    ['note.txt', 'FISH_AUDIO_API_KEY=' + 'abcd1234'.repeat(2), 'secret'],
    ['page.html', '<link href="' + ['https:', '', 'fonts.googleapis' + '.com/css'].join('/') + '">', 'remote-font'],
    ['style.css', '@import ' + 'url(' + https + ');', 'remote-font'],
    ['note.md', ['Jar', 'vis'].join(''), 'forbidden-term'],
    ['note.md', ['Open', 'Code'].join(''), 'forbidden-term'],
    ['view.tsx', imageTag, 'image-reference'],
  ];

  it.each(cases)('detects fixture %#: %s', (file, text, kind) => {
    expect(scanContent(file, text).map((finding) => finding.kind)).toContain(kind);
  });

  it.each([
    'gh' + 'p_' + 'a'.repeat(30),
    'gh' + 'o_' + 'a'.repeat(30),
    'github' + '_pat_' + 'a'.repeat(30),
    'AK' + 'IA' + 'A'.repeat(16),
    'xox' + 'b-' + '1234567890',
    '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    'TOKEN=' + 'a'.repeat(16),
    'const serviceSecret = "' + 'a'.repeat(16) + '";',
  ])('detects token fixture %#', (text) => {
    expect(scanContent('note.txt', text).some(({ kind }) => kind === 'secret')).toBe(true);
  });

  it.each([
    ['module.ts', "import { render } from '@testing-library/react';"],
    ['note.txt', 'FISH_AUDIO_API_KEY='],
    ['module.ts', 'process.env.ELEVENLABS_API_KEY'],
    ['module.ts', 'const API_KEY = process.env.ELEVENLABS_API_KEY;'],
    ['note.txt', 'API_KEY=<insert-value-here>'],
    ['module.ts', 'http' + '://localhost:3000'],
    ['note.md', 'An image is described in this sentence.'],
    ['note.txt', 'a:b'],
    ['module.ts', '@decorator'],
  ])('accepts clean fixture %#: %s', (file, text) => {
    expect(scanContent(file, text)).toEqual([]);
  });

  it('reports one-based lines and masked previews', () => {
    const findings = scanContent('note.txt', `clean\n${secret}\nclean`);
    expect(findings).toEqual([{ kind: 'secret', line: 2, excerpt: secret.slice(0, 4) + '...' }]);
    expect(findings[0]!.excerpt).not.toContain(secret);
  });

  it('limits absence assertion exceptions to test files and image checks', () => {
    expect(scanContent('tests/view.tsx', `expect(node).not.toContain('${imageTag}')`)).toEqual([]);
    expect(scanContent('src/view.tsx', `queryBy ${imageTag}`)[0]?.kind).toBe('image-reference');
    expect(scanContent('tests/view.ts', `queryBy ${secret}`)[0]?.kind).toBe('secret');
  });

  it('detects remote sources and image references in supported files', () => {
    for (const text of ['src: url(' + https + ')', 'a { color: red } /* ' + https + ' */']) {
      expect(scanContent('style.css', text).some(({ kind }) => kind === 'remote-font')).toBe(true);
    }
    for (const text of ['<' + 'picture>', '<' + 'image>', 'background-' + 'image: url(local)',
      'ava' + 'tar', 'profile' + '-photo', 'head' + 'shot', 'asset.' + 'png']) {
      expect(scanContent('view.tsx', text).some(({ kind }) => kind === 'image-reference')).toBe(true);
    }
  });

  it('recognizes image extensions regardless of case', () => {
    for (const extension of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'heic', 'tiff', 'ico']) {
      expect(isImageFile('asset.' + extension)).toBe(true);
      expect(isImageFile('asset.' + extension.toUpperCase())).toBe(true);
    }
    expect(isImageFile('font.woff2')).toBe(false);
  });
});

function ignoreMissing<T>(operation: () => T): T | undefined {
  try {
    return operation();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

const listEntries = (directory: string) => readdirSync(directory, { withFileTypes: true });

function walk(directory: string, skipped: Set<string>, prefix = '', list: (directory: string) => Dirent[] = listEntries): string[] {
  const entries = ignoreMissing(() => list(directory)) ?? [];
  return entries.flatMap((entry) => {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      return skipped.has(entry.name) ? [] : walk(join(directory, entry.name), skipped, relative + '/', list);
    }
    return [relative];
  });
}

describe('tolerant safety walk', () => {
  it('keeps scanning when a listed child directory disappears', () => {
    const directory = mkdtempSync(join(tmpdir(), 'harness-safety-'));
    const child = join(directory, 'child');
    mkdirSync(child);
    writeFileSync(join(directory, 'keep.txt'), 'clean');
    try {
      const list = (path: string) => {
        const entries = listEntries(path);
        if (path === directory) rmSync(child, { recursive: true });
        return entries;
      };
      expect(walk(directory, new Set(), '', list)).toEqual(['keep.txt']);
      expect(ignoreMissing(() => readFileSync(join(child, 'gone.txt'), 'utf8'))).toBeUndefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('propagates errors other than missing entries', () => {
    const error = Object.assign(new Error('Access denied'), { code: 'EACCES' });
    expect(() => ignoreMissing(() => { throw error; })).toThrow(error);
  });
});

describe('public repository safety', () => {
  it('scans dashboard text and root reference files without violations', () => {
    const files = walk(dashboard, new Set(['node_modules', 'dist', '.data', 'coverage']));
    expect(files.length).toBeGreaterThanOrEqual(50);
    expect(files).toEqual(expect.arrayContaining(['PLAN.md', 'package.json', 'src/main.tsx']));
    const excluded = new Set(['package-lock.json', 'tests/helpers/safety-scan.ts', 'tests/public-safety.test.ts']);
    const textExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html', '.md', '.txt', '.yml', '.yaml', '.svg', '']);
    const contents = files.filter((file) => !excluded.has(file) && textExtensions.has(extname(file)))
      .flatMap((file) => {
        const text = ignoreMissing(() => read(dashboard, file));
        return text === undefined ? [] : [{ file, text }];
      });
    for (const file of ['docs/run-log.md', '.env.example']) {
      contents.push({ file, text: read(root, file) });
    }
    const findings = contents.flatMap(({ file, text }) => scanContent(file, text)
      .map(({ line, kind, excerpt }) => `${file}:${line} ${kind} ${excerpt}`));
    expect(findings, findings.join('\n')).toEqual([]);
  });

  it('contains no image files, including in ignored data and coverage directories', () => {
    expect(walk(dashboard, new Set(['node_modules', 'dist'])).filter(isImageFile)).toEqual([]);
  });

  it('keeps environment examples empty and required paths ignored', () => {
    const assignments = read(root, '.env.example').split(/\r?\n/)
      .filter((line) => /^\s*[A-Z_][A-Z0-9_]*\s*=\s*\S/i.test(line));
    expect(assignments).toEqual([]);
    const ignoreLines = (base: string) => read(base, '.gitignore').split(/\r?\n/)
      .map((line) => line.trim().replace(/^\//, '').replace(/\/$/, ''));
    expect(ignoreLines(root)).toContain('.env');
    expect(ignoreLines(dashboard)).toEqual(expect.arrayContaining(['node_modules', 'dist', '.data']));
  });
});
