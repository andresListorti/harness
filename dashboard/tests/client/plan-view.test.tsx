// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlanBoard, PlanSource, PlanTask, RunLog, RunLogEntry } from '../../shared/api';
import { ApiError } from '../../src/lib/api';
import { EMPTY_VALUE } from '../../src/lib/format';
import { PlanView } from '../../src/views/PlanView';

afterEach(cleanup);

function task(id = 'task', overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id, title: id, column: 'pending', group: null, goal: 'A goal',
    files: 'src/example.ts', definitionOfDone: 'Checks pass', result: null, ...overrides,
  };
}

function entry(id = 'D1', overrides: Partial<RunLogEntry> = {}): RunLogEntry {
  return { id, title: `Run ${id}`, branch: 'task/example', attempts: 1, result: 'Passed', notes: ['A note'], ...overrides };
}

function clientFor(tasks: PlanTask[] = [], entries: RunLogEntry[] = []) {
  return {
    getPlan: vi.fn<(source?: PlanSource) => Promise<PlanBoard>>().mockResolvedValue({ source: 'dashboard', tasks }),
    getRunLog: vi.fn<(source?: PlanSource) => Promise<RunLog>>().mockResolvedValue({ source: 'dashboard', entries }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function column(name: string) {
  return within(screen.getByRole('heading', { name, level: 2 }).closest('section')!);
}

test('loads both resources and groups tasks in the correct columns with counts and details', async () => {
  const pending = deferred<PlanBoard>();
  const client = clientFor();
  client.getPlan.mockReturnValue(pending.promise);
  render(<PlanView client={client} />);
  expect(screen.getByText('Loading plan…')).toHaveAttribute('aria-busy', 'true');
  expect(client.getRunLog).toHaveBeenCalledWith('dashboard');
  await act(async () => pending.resolve({ source: 'dashboard', tasks: [
    task('Grouped first', { group: 'Milestone 1' }), task('Ungrouped'),
    task('Grouped second', { group: 'Milestone 1' }),
    task('Working', { column: 'in_progress' }),
    task('Finished', { column: 'done', result: 'Complete' }),
  ] }));
  expect(column('Pending').getByText('3')).toBeInTheDocument();
  expect(column('Pending').getAllByRole('article').map(card => card.getAttribute('aria-label')))
    .toEqual(['Ungrouped', 'Grouped first', 'Grouped second']);
  expect(column('Pending').getByRole('heading', { name: 'Milestone 1' })).toHaveClass('eyebrow');
  expect(column('In progress').getByRole('article', { name: 'Working' })).toBeInTheDocument();
  expect(column('In progress').getByText('1')).toBeInTheDocument();
  expect(column('Done').getByText('1')).toBeInTheDocument();
  const finished = within(column('Done').getByRole('article'));
  expect(finished.getByText('Done')).toBeInTheDocument();
  await userEvent.click(finished.getByText('Details'));
  for (const text of ['Files', 'src/example.ts', 'Definition of done', 'Checks pass', 'Result', 'Complete']) {
    expect(finished.getByText(text)).toBeVisible();
  }
  const ungrouped = within(column('Pending').getByRole('article', { name: 'Ungrouped' }));
  await userEvent.click(ungrouped.getByText('Details'));
  expect(ungrouped.queryByText('Result')).not.toBeInTheDocument();
});

test('shows empty columns and run log', async () => {
  render(<PlanView client={clientFor()} />);
  expect(await screen.findByText('No runs recorded yet.')).toBeInTheDocument();
  for (const name of ['Pending', 'In progress', 'Done']) {
    expect(column(name).getByText('None')).toBeInTheDocument();
    expect(column(name).getByText('0')).toBeInTheDocument();
  }
});

test('defaults to Dashboard and switches both resources to Example app', async () => {
  const client = clientFor([task('Dashboard task')]);
  render(<PlanView client={client} />);
  await screen.findByText('Dashboard task');
  expect(screen.getByRole('group', { name: 'Plan source' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-pressed', 'true');
  client.getPlan.mockResolvedValue({ source: 'example-app', tasks: [task('Example task')] });
  client.getRunLog.mockResolvedValue({ source: 'example-app', entries: [entry('1')] });
  await userEvent.click(screen.getByRole('button', { name: 'Example app' }));
  expect(await screen.findByText('Example task')).toBeInTheDocument();
  expect(screen.getByText('1. Run 1')).toBeInTheDocument();
  expect(client.getPlan).toHaveBeenLastCalledWith('example-app');
  expect(client.getRunLog).toHaveBeenLastCalledWith('example-app');
  expect(screen.queryByText('Dashboard task')).not.toBeInTheDocument();
});

test.each([true, false])('ignores superseded source results (success: %s)', async success => {
  const oldPlan = deferred<PlanBoard>();
  const oldLog = deferred<RunLog>();
  const client = clientFor([task('New task')], [entry('New')]);
  client.getPlan.mockReturnValueOnce(oldPlan.promise);
  client.getRunLog.mockReturnValueOnce(oldLog.promise);
  render(<PlanView client={client} />);
  await userEvent.click(screen.getByRole('button', { name: 'Example app' }));
  await screen.findByText('New task');
  await act(async () => {
    if (success) oldPlan.resolve({ source: 'dashboard', tasks: [task('Old task')] });
    else oldPlan.reject(new Error('Old error'));
    oldLog.resolve({ source: 'dashboard', entries: [entry('Old')] });
  });
  expect(screen.getByText('New task')).toBeInTheDocument();
  expect(screen.getByText('New. Run New')).toBeInTheDocument();
  expect(screen.queryByText('Old task')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('renders newest runs first, attempts, null values, branch and notes', async () => {
  render(<PlanView client={clientFor([], [entry(), entry('D2', { attempts: 2 }), entry('D3', { attempts: null, branch: null, result: null })])} />);
  const log = await screen.findByRole('region', { name: 'Run log' });
  const runs = Array.from(log.querySelectorAll('details'));
  expect(runs.map(run => run.querySelector('summary')?.textContent)).toEqual([
    `D3. Run D3 ${EMPTY_VALUE} `, 'D2. Run D2 Passed 2 attempts', 'D1. Run D1 Passed 1 attempt',
  ]);
  await userEvent.click(runs[0].querySelector('summary')!);
  expect(within(runs[0]).getAllByText(EMPTY_VALUE)).toHaveLength(2);
  expect(runs[0].querySelector('.mono')).toHaveTextContent(EMPTY_VALUE);
  await userEvent.click(runs[2].querySelector('summary')!);
  expect(within(runs[2]).getByText('task/example')).toHaveClass('mono');
  expect(within(runs[2]).getByRole('listitem')).toHaveTextContent('A note');
});

test.each(['plan', 'log', 'unknown'])('handles %s failure and retries both requests', async failure => {
  const client = clientFor([task('Recovered')]);
  const error = failure === 'unknown' ? new Error('Private') : new ApiError('Unavailable', 'FAILED', 500);
  if (failure === 'log') client.getRunLog.mockRejectedValueOnce(error);
  else client.getPlan.mockRejectedValueOnce(error);
  render(<PlanView client={client} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(failure === 'unknown' ? 'Could not load plan.' : 'Could not load plan: Unavailable');
  expect(screen.queryByText('Recovered')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Recovered')).toBeInTheDocument();
  expect(client.getPlan).toHaveBeenCalledTimes(2);
  expect(client.getRunLog).toHaveBeenCalledTimes(2);
});

test('refresh reloads both resources', async () => {
  const client = clientFor();
  render(<PlanView client={client} />);
  await screen.findByText('No runs recorded yet.');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(client.getPlan).toHaveBeenCalledTimes(2);
  expect(client.getRunLog).toHaveBeenCalledTimes(2);
});

test.each([true, false])('ignores results after unmount (success: %s)', async success => {
  const pending = deferred<PlanBoard>();
  const client = clientFor();
  client.getPlan.mockReturnValue(pending.promise);
  const { unmount, container } = render(<PlanView client={client} />);
  unmount();
  await act(async () => {
    if (success) pending.resolve({ source: 'dashboard', tasks: [] });
    else pending.reject(new Error('Late error'));
  });
  expect(container).toBeEmptyDOMElement();
});

test('renders API HTML literally', async () => {
  const title = '<img src=x onerror=alert(1)>';
  const goal = '<b>Goal</b>';
  const note = '<b>Note</b>';
  const { container } = render(<PlanView client={clientFor([task(title, { goal })], [entry('D1', { notes: [note] })])} />);
  expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  expect(screen.getByText(goal)).toBeInTheDocument();
  await userEvent.click(screen.getByText('D1. Run D1'));
  expect(screen.getByText(note)).toBeVisible();
  expect(container.querySelector('img, b')).toBeNull();
});
