/**
 * Word boundaries for double-click selection (§5.3): a word is a run of
 * characters that are neither whitespace nor query syntax, so "status:active"
 * is two words and a selection never takes the space after a word along.
 */

const DELIMITER = /[\s:()[\]{}"<>!,;|&=~^+\-*/\\]/;

/**
 * The word at `offset`: the one the offset is inside or at the end of, else
 * the one starting there, else collapsed at `offset` (between delimiters).
 */
export function getWordRangeAt(text: string, offset: number): { start: number; end: number } {
  let start = offset;
  while (start > 0 && !DELIMITER.test(text[start - 1])) start--;
  let end = offset;
  while (end < text.length && !DELIMITER.test(text[end])) end++;
  return { start, end };
}

/**
 * The range a word drag selects: from the word at `anchor` through the word at
 * `pointer`. A pointer between delimiters extends the selection to the pointer
 * and not past it, so a space is taken along with the word beyond it.
 */
export function getWordSpanBetween(text: string, anchor: number, pointer: number): { start: number; end: number } {
  const a = getWordRangeAt(text, anchor);
  const b = getWordRangeAt(text, pointer);
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}
