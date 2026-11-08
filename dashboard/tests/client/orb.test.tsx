import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen, within } from '@testing-library/react';
import { Orb, type OrbState } from '../../src/components/Orb';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const css = read('../../src/components/Orb.css');
const source = read('../../src/components/Orb.tsx');

afterEach(cleanup);

test.each<OrbState>(['idle', 'listening', 'speaking'])('renders the %s state with its accessible name', (state) => {
  render(<Orb state={state} />);
  expect(screen.getByRole('img', { name: `Harness orb, ${state}` })).toHaveAttribute('data-state', state);
});

test('defaults to idle and allows a custom accessible label', () => {
  const { rerender } = render(<Orb />);
  expect(screen.getByRole('img', { name: 'Harness orb, idle' })).toHaveAttribute('data-state', 'idle');
  rerender(<Orb state="listening" label="Listening for your request" />);
  expect(screen.getByRole('img', { name: 'Listening for your request' })).toHaveAttribute('data-state', 'listening');
});

test('contains five rings, one core, and a hidden SVG without embedded images', () => {
  render(<Orb />);
  const orb = screen.getByRole('img');
  expect(orb.querySelectorAll('.orb-ring')).toHaveLength(5);
  expect(orb.querySelectorAll('.orb-core')).toHaveLength(1);
  expect(within(orb).queryByRole('img', { hidden: true })).not.toBeInTheDocument();
  expect(orb.querySelector('img, image, foreignObject')).toBeNull();
  expect(orb.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(orb.querySelector('svg')).toHaveAttribute('viewBox', '0 0 200 200');
});

test('provides CSS animation and a local reduced-motion override', () => {
  expect(css).toContain('@keyframes');
  expect(css).toContain('prefers-reduced-motion: reduce');
  expect(css).toMatch(/@media\s*\(prefers-reduced-motion: reduce\)\s*\{\s*\.orb,\s*\.orb \*\s*\{\s*animation: none !important;\s*transition: none !important;/);
});

test('keeps markup and styles free of asset references', () => {
  for (const content of [source, css]) {
    expect(content).not.toMatch(/https?:\/\/|data:|url\s*\(/i);
  }
});
