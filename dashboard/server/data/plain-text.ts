/** Remove supported markdown markers without rendering or interpreting HTML. */
export function toPlainText(text: string): string {
  let previous: string;
  do {
    previous = text;
    text = text
      .replace(/^`{3,}[^`\n]*\n([\s\S]*?)^`{3,}[ \t]*(?:\n|$)/gm, '$1')
      .replace(/(?<!`)``([^`]*(?:`(?!`)[^`]*)*)``(?!`)/g, '$1')
      .replace(/(?<!`)`([^`\n]+)`(?!`)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/(?<![\p{L}\p{N}_])__([^\n]+?)__(?![\p{L}\p{N}_])/gu, '$1')
      .replace(/!?\[([^\]\n]*)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, '$1')
      .replace(/^#{1,} /gm, '')
      .replace(/^> /gm, '');
  } while (text !== previous);
  return text;
}
