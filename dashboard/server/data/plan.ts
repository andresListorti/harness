import type { PlanBoard, PlanColumn, PlanSource, PlanTask } from '../../shared/api';

type Field = 'goal' | 'files' | 'definitionOfDone' | 'result';

const fields: Record<string, Field> = {
  goal: 'goal',
  files: 'files',
  'definition of done': 'definitionOfDone',
  result: 'result',
};

export function parsePlan(markdown: string, source: PlanSource): PlanBoard {
  const board: PlanBoard = { source, tasks: [] };
  let column: PlanColumn | null = null;
  let group: string | null = null;
  let title: string | null = null;
  let values: Partial<Record<Field, string>> = {};
  let activeField: Field | null = null;

  function finishHeading() {
    if (column && title) {
      if (Object.keys(values).length === 0) {
        group = title;
      } else {
        const task: PlanTask = {
          id: title, title, group, column,
          goal: values.goal ?? '',
          files: values.files ?? '',
          definitionOfDone: values.definitionOfDone ?? '',
          result: values.result ?? null,
        };
        board.tasks.push(task);
      }
    }
    title = null;
    values = {};
    activeField = null;
  }

  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const heading = /^(#{1,6})(?:\s+(.*)|\s*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = (heading[2] ?? '').trim();
      if (level <= 3) finishHeading();
      if (level <= 2) {
        const name = text.toLowerCase();
        column = level !== 2 ? null
          : name === 'pending' ? 'pending'
          : name === 'in progress' ? 'in_progress'
          : name === 'done' ? 'done' : null;
        group = null;
      } else if (level === 3 && column) {
        title = text;
      }
      activeField = null;
      continue;
    }
    if (!column || !title) continue;

    const field = /^\s*-\s+\*\*(Goal|Files|Definition of done|Result):\*\*\s*(.*)$/i.exec(line);
    if (field) {
      activeField = fields[field[1].toLowerCase()];
      values[activeField] = field[2].trim();
    } else if (/^\s*(?:[-+*]\s|\d+[.)]\s)/.test(line)) {
      activeField = null;
    } else if (activeField && line.trim()) {
      values[activeField] = [values[activeField], line.trim()].filter(Boolean).join(' ');
    }
  }
  finishHeading();
  return board;
}
