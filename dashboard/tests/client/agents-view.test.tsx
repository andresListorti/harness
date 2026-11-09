// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentCard, Agents } from '../../shared/api';
import { ApiError } from '../../src/lib/api';
import { AgentsView } from '../../src/views/AgentsView';

afterEach(cleanup);

function card(index = 1, overrides: Partial<AgentCard> = {}): AgentCard {
  return { id: `example-app/task-${index}`, task: `Task ${index}`, agent: 'claude-code', model: 'Example model', status: 'done', elapsedSeconds: 65, output: ['First line', 'Second line'], ...overrides };
}

function clientFor(agents: AgentCard[] = []) {
  return { getAgents: vi.fn<() => Promise<Agents>>().mockResolvedValue({ agents }) };
}

function deferred() {
  let resolve!: (value: Agents) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Agents>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('loads and renders every field as historical data', async () => {
  const pending = deferred();
  const client = { getAgents: vi.fn().mockReturnValue(pending.promise) };
  render(<AgentsView client={client} />);
  expect(screen.getByText('Loading agents…')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('History from the plan and run log')).toHaveClass('eyebrow');
  await act(async () => pending.resolve({ agents: [card()] }));
  const article = screen.getByRole('article', { name: 'Task 1' });
  for (const value of ['example-app', 'Done', 'Claude Code', 'Example model', '1m 05s', 'Agent', 'Model', 'Time']) {
    expect(within(article).getByText(value)).toBeInTheDocument();
  }
  expect(within(article).getByRole('heading', { level: 3 })).toHaveTextContent('Task 1');
  const output = article.querySelector('pre');
  expect(output).toHaveClass('mono', 'agent-output');
  expect(output?.textContent).toBe('First line\nSecond line');
  expect(output).toHaveAttribute('title', 'First line\nSecond line');
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
});

test('shows empty values and all statuses and agent names', async () => {
  render(<AgentsView client={clientFor([
    card(1, { agent: null, model: null, elapsedSeconds: null, output: [], status: 'working' }),
    card(2, { agent: 'codex', status: 'error' }), card(3),
  ])} />);
  const article = await screen.findByRole('article', { name: 'Task 1' });
  const details = within(article.querySelector('dl')!);
  expect(details.getAllByRole('term').map(term => term.textContent)).toEqual(['Agent']);
  expect(details.getByRole('definition')).toHaveTextContent('—');
  const output = article.querySelector('pre');
  expect(output?.textContent).toBe('—');
  expect(output).not.toHaveAttribute('title');
  for (const value of ['Working', 'Done', 'Error', 'Codex', 'Claude Code']) expect(screen.getByText(value)).toBeInTheDocument();
});

test.each([
  { model: 'Recorded model', elapsedSeconds: 65 },
  { model: 'Recorded model', elapsedSeconds: null },
  { model: null, elapsedSeconds: 65 },
])('shows only recorded detail rows: %o', async values => {
  render(<AgentsView client={clientFor([card(1, values)])} />);
  const article = await screen.findByRole('article', { name: 'Task 1' });
  const details = within(article.querySelector('dl')!);
  const terms = details.getAllByRole('term').map(term => term.textContent);
  expect(terms).toEqual([
    'Agent',
    ...(values.model === null ? [] : ['Model']),
    ...(values.elapsedSeconds === null ? [] : ['Time']),
  ]);
  if (values.model !== null) {
    expect(details.getByText(values.model)).toBeInTheDocument();
  }
  if (values.elapsedSeconds !== null) {
    expect(details.getByText('1m 05s')).toBeInTheDocument();
  }
});

test.each([
  ['x'.repeat(2000)],
  Array.from({ length: 12 }, (_, index) => `Line ${index}: ${'text '.repeat(100)}`),
])('preserves full long output in text and tooltip: %#', async (...lines) => {
  render(<AgentsView client={clientFor([card(1, { output: lines })])} />);
  const article = await screen.findByRole('article', { name: 'Task 1' });
  const output = article.querySelector('pre');
  expect(output?.textContent).toBe(lines.join('\n'));
  expect(output).toHaveAttribute('title', lines.join('\n'));
});

test('wraps and clamps output without horizontal scrolling', () => {
  const directory = dirname(fileURLToPath(import.meta.url));
  const path = resolve(directory, '../../src/views/AgentsView.css');
  const css = readFileSync(path, 'utf8');
  const rule = css.match(/\.agent-output\s*\{([^}]*)\}/)?.[1];
  expect(rule).toBeDefined();
  for (const declaration of [
    'white-space: pre-wrap', 'overflow-wrap: anywhere', '-webkit-line-clamp: 4',
    'line-clamp: 4', 'display: -webkit-box', '-webkit-box-orient: vertical',
    'overflow: hidden', 'min-width: 0', 'font-family: var(--font-mono)',
  ]) {
    expect(rule).toContain(declaration);
  }
  expect(rule).not.toMatch(/overflow(?:-x)?\s*:\s*auto\b/);
});

test('changes layout, paginates, and resets the page when layout changes', async () => {
  const user = userEvent.setup();
  const client = clientFor(Array.from({ length: 9 }, (_, index) => card(index + 1)));
  const { container } = render(<AgentsView client={client} />);
  await screen.findByRole('article', { name: 'Task 1' });
  const grid = () => container.querySelector('.agents-grid');
  expect(screen.getByRole('group', { name: 'Grid layout' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '2 by 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(grid()).toHaveAttribute('data-columns', '2');
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Task 5' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(screen.getAllByRole('article')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Previous' }));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '1 per page' }));
  expect(grid()).toHaveAttribute('data-columns', '1');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Page 1 of 9')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '3 by 3' }));
  expect(grid()).toHaveAttribute('data-columns', '3');
  expect(screen.getAllByRole('article')).toHaveLength(9);
  expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  expect(client.getAgents).toHaveBeenCalledOnce();
});

test('keeps the page in range when a refresh shrinks the data', async () => {
  const client = clientFor(Array.from({ length: 9 }, (_, index) => card(index + 1)));
  render(<AgentsView client={client} />);
  await screen.findByRole('article', { name: 'Task 1' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  client.getAgents.mockResolvedValue({ agents: Array.from({ length: 5 }, (_, index) => card(index + 1)) });
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
  expect(screen.getByRole('article', { name: 'Task 5' })).toBeInTheDocument();
  expect(client.getAgents).toHaveBeenCalledTimes(2);
});

test('shows the empty state', async () => {
  render(<AgentsView client={clientFor()} />);
  expect(await screen.findByText('No agent activity recorded yet.')).toBeInTheDocument();
});

test.each([new ApiError('Unavailable', 'FAILED', 500), new Error('Private detail')])('shows an error and retries successfully (%s)', async error => {
  const client = clientFor([card()]);
  client.getAgents.mockRejectedValueOnce(error);
  render(<AgentsView client={client} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(error instanceof ApiError ? 'Could not load agents: Unavailable' : 'Could not load agents.');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('article')).toBeInTheDocument();
  expect(client.getAgents).toHaveBeenCalledTimes(2);
});

test.each([true, false])('ignores a stale response (success: %s)', async success => {
  const old = deferred();
  const fresh = deferred();
  const client = clientFor();
  client.getAgents.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  render(<AgentsView client={client} />);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await act(async () => fresh.resolve({ agents: [card(2)] }));
  await act(async () => { if (success) old.resolve({ agents: [card(1)] }); else old.reject(new Error('Old error')); });
  expect(screen.getByRole('article', { name: 'Task 2' })).toBeInTheDocument();
  expect(screen.queryByRole('article', { name: 'Task 1' })).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test.each([true, false])('ignores results after unmount (success: %s)', async success => {
  const pending = deferred();
  const client = { getAgents: vi.fn().mockReturnValue(pending.promise) };
  const { unmount, container } = render(<AgentsView client={client} />);
  unmount();
  await act(async () => { if (success) pending.resolve({ agents: [card()] }); else pending.reject(new Error('Late error')); });
  expect(container).toBeEmptyDOMElement();
});

test('renders HTML in task and output literally', async () => {
  const task = '<' + 'img src=x onerror=alert(1)>';
  const output = '<b>Plain text</b>';
  const { container } = render(<AgentsView client={clientFor([card(1, { task, output: [output] })])} />);
  expect(await screen.findByRole('heading', { name: task })).toBeInTheDocument();
  expect(screen.getByText(output).tagName).toBe('PRE');
  expect(screen.getByText(output)).toHaveAttribute('title', output);
  expect(container.querySelector('img, b')).toBeNull();
});


test('polls silently, preserves selection, survives failure, and supports manual refresh', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  try {
    const client = clientFor([card(1), card(2)]);
    const { container } = render(<AgentsView client={client} />);
    await act(async () => {});
    await waitFor(() => expect(screen.getByRole('article', { name: 'Task 1' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '1 per page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const pending = deferred();
    client.getAgents.mockReturnValueOnce(pending.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Task 2' })).toBeInTheDocument();
    await act(async () => pending.resolve({ agents: [card(1), card(2, { task: 'Updated task' })] }));
    await waitFor(() => expect(screen.getByRole('article', { name: 'Updated task' })).toBeInTheDocument());
    expect(container.querySelector('.agents-grid')).toHaveAttribute('data-columns', '1');
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    client.getAgents.mockRejectedValueOnce(new Error('Unavailable'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole('article', { name: 'Updated task' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })));
    await waitFor(() => expect(screen.getByRole('article', { name: 'Task 2' })).toBeInTheDocument());
    expect(client.getAgents).toHaveBeenCalledTimes(4);
  } finally {
    cleanup();
    visibility.mockRestore();
    vi.useRealTimers();
  }
});
