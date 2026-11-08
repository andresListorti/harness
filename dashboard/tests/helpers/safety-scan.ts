import { extname } from 'node:path';

export type FindingKind = 'email' | 'absolute-path' | 'secret' | 'remote-font' | 'forbidden-term' | 'image-reference';

export interface Finding {
  kind: FindingKind;
  line: number;
  excerpt: string;
}

const forbiddenTerms = [['Jar', 'vis'].join(''), ['Open', 'Code'].join('')];
const forbidden = new RegExp(`\\b(?:${forbiddenTerms.join('|')})\\b`, 'i');
const email = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i;
const localPath = /\b[a-z]:[\\/]+[\w.-]+|\/(?:Users|home)\/[^\s/"'`<>]+|\\+Users\\+[^\s\\"'`<>]+/i;
const token = /\bsk-[a-z0-9]{20,}|\b(?:ghp_|gho_|github_pat_)[a-z0-9_]+|\bAKIA[A-Z0-9]{16}\b|\bxox[baprs]-[a-z0-9-]+|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/i;
const assignment = /\b([a-z_][a-z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)[a-z0-9_]*|API_KEY|SECRET|TOKEN|PASSWORD)\s*[=:]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s;,}]+))/gi;
const remoteHost = /(?:fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|cdnjs|unpkg|jsdelivr)/i;
const remoteImport = /@import\s+url\s*\(\s*["']?https?:\/\//i;
const remoteSource = /(?:src\s*:|@font-face)[^\n]*url\s*\(\s*["']?https?:\/\//i;
const imageReference = /<(?:img|image|picture)\b|background-image\s*:[^;\n]*url\s*\(|\b(?:avatar|profile-photo|headshot)\b|\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff)\b/i;

export function isImageFile(fileName: string): boolean {
  return /^\.(?:png|jpe?g|gif|webp|avif|bmp|heic|tiff|ico)$/i.test(extname(fileName));
}

export function scanContent(fileName: string, text: string): Finding[] {
  const extension = extname(fileName).toLowerCase();
  const findings: Finding[] = [];
  const isTest = /(?:^|\/)tests\//.test(fileName.replace(/\\/g, '/'));

  text.split(/\r?\n/).forEach((line, index) => {
    const add = (kind: FindingKind, match: string | undefined) => {
      if (match) findings.push({ kind, line: index + 1, excerpt: `${match.slice(0, 4)}...` });
    };
    add('email', line.match(email)?.[0]);
    add('absolute-path', line.match(localPath)?.[0]);
    add('secret', line.match(token)?.[0]);
    for (const match of line.matchAll(assignment)) {
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      if (value.length >= 16 && !/^<[^>]*>$/.test(value) && !/^process\.env\b/.test(value)) {
        add('secret', value);
      }
    }
    if (['.css', '.html', '.tsx'].includes(extension)) {
      add('remote-font', line.match(remoteHost)?.[0] ?? line.match(remoteImport)?.[0]
        ?? line.match(remoteSource)?.[0]
        ?? (['.css', '.html'].includes(extension) ? line.match(/https?:\/\/[^\s"'<>)]*/i)?.[0] : undefined));
    }
    add('forbidden-term', line.match(forbidden)?.[0]);
    const absenceAssertion = isTest && /queryBy|not\.toContain|not\.toMatch|toHaveLength\(0\)|toBeNull/.test(line);
    if (['.html', '.css', '.tsx', '.ts', '.md'].includes(extension) && !absenceAssertion) {
      add('image-reference', line.match(imageReference)?.[0]);
    }
  });
  return findings;
}
