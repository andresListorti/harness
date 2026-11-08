// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { HomeView } from '../../src/views/HomeView';

afterEach(cleanup);

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

function fakeClient() {
  return {
    getChatSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
    sendChat: vi.fn().mockResolvedValue({ reply: 'Ready.', source: 'local' }),
  };
}

test('renders the orb, exact accessible title, subtitle, and chat', async () => {
  const client = fakeClient();
  render(<HomeView client={client} />);
  expect(screen.getByRole('img', { name: /^Harness orb/ })).toHaveAttribute('data-state', 'idle');
  const headings = screen.getAllByRole('heading', { name: 'Harness' });
  expect(headings).toHaveLength(1);
  expect(headings[0]).toBe(screen.getByRole('heading', { name: 'Harness', level: 1 }));
  expect(headings[0].textContent).toBe('Harness');
  expect(screen.getByText('Local control room for Claude Code and Codex')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello');
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(await screen.findByText('Ready.')).toBeInTheDocument();
  expect(client.getChatSuggestions).toHaveBeenCalledOnce();
  expect(client.sendChat).toHaveBeenCalledWith('Hello');
});

test.each(['listening', 'speaking'] as const)('passes the %s state to the orb', async orbState => {
  render(<HomeView client={fakeClient()} orbState={orbState} />);
  expect(screen.getByRole('img', { name: /^Harness orb/ })).toHaveAttribute('data-state', orbState);
});

test('styles the title with CSS spacing and keeps home assets local', () => {
  const source = read('../../src/views/HomeView.tsx');
  const css = read('../../src/views/HomeView.css');
  const title = css.match(/\.home-title\s*\{([^}]+)\}/)?.[1];
  expect(title).toMatch(/letter-spacing:\s*0\.6em/);
  expect(title).toMatch(/text-transform:\s*uppercase/);
  expect(source).not.toMatch(/<img\b/i);
  for (const file of [source, css]) {
    expect(file).not.toMatch(/https?:\/\/|\/\/cdn|@import\s+url\s*\(|data:/i);
  }
});

test('keeps home conversations readable on short viewports', () => {
  const css = read('../../src/views/HomeView.css');
  const appCss = read('../../src/App.css');
  const messages = css.match(/[^{}]*\.chat-messages\b[^{}]*\{([^}]+)\}/)?.[1];
  const minimum = messages?.match(/min-height:\s*([\d.]+)rem\b/);
  expect(minimum).toBeTruthy();
  expect(Number(minimum?.[1])).toBeGreaterThanOrEqual(12);
  expect(css).not.toMatch(/height:\s*clamp\(18rem,\s*calc\(100dvh\s*-\s*30rem\),\s*34rem\)/);
  const orb = css.match(/\.home-orb\s*\{([^}]+)\}/)?.[1];
  expect(orb).toMatch(/\bwidth:\s*[^;]*\d(?:dvh|vh)\b/);
  const main = appCss.match(/\.app-main\s*\{([^}]+)\}/)?.[1];
  expect(main).toMatch(/overflow-y\s*:\s*auto/);
});
