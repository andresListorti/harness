import type { GalaxyNode } from '../../shared/api';
export const nodes: GalaxyNode[] = [
  { id: 'core', label: 'Harness', kind: 'core', role: null, count: null, details: ['Repository overview'] },
  { id: 'claude', label: 'Claude Code', kind: 'agent', role: 'orchestrator', count: 3, details: ['Coordinates tasks', 'Reviews results'] },
  { id: 'codex', label: 'Codex', kind: 'agent', role: 'worker', count: 2, details: ['Implements tasks'] },
  ...['Tasks', 'Commits', 'Tests'].map((label, index): GalaxyNode => ({ id: label.toLowerCase(), label, kind: 'system', role: null, count: index + 10, details: ['Recorded activity'] })),
];
export function recordingContext() {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get: (_, key: string) => methods[key] ??= vi.fn(key.startsWith('create') ? () => ({ addColorStop: vi.fn() }) : () => undefined),
    set: () => true,
  });
  return { context, methods };
}

