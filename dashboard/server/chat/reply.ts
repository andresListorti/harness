export const TOOLS_UNAVAILABLE_NOTICE = 'Tools are not available in this chat.';

/** Remove tool-call text, including incomplete blocks, without interpreting HTML. */
export function cleanChatReply(reply: string): string {
  const tags = /<\/?(?:[\w.-]+:)?(invoke|parameter|function_calls)\b[^>]*>/gi;
  const ranges: [number, number][] = [];
  let start = -1;
  const stack: string[] = [];
  for (const match of reply.matchAll(tags)) {
    const closing = match[0].startsWith('</');
    const name = match[1].toLowerCase();
    if (!closing) {
      if (start < 0) start = match.index;
      if (!/\/\s*>$/.test(match[0])) stack.push(name);
    } else {
      const index = stack.lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      else if (start < 0) start = match.index;
    }
    if (stack.length === 0 && start >= 0) {
      ranges.push([start, match.index + match[0].length]);
      start = -1;
    }
  }
  if (start >= 0) ranges.push([start, reply.length]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && /^\s*$/.test(reply.slice(previous[1], range[0]))) previous[1] = range[1];
    else merged.push(range);
  }
  let result = '';
  let cursor = 0;
  for (const [from, to] of merged) {
    result += reply.slice(cursor, from) + TOOLS_UNAVAILABLE_NOTICE;
    cursor = to;
  }
  return result + reply.slice(cursor);
}
