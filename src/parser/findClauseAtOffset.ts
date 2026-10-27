import { ASTNode } from './ast';

/**
 * Finds the innermost non-Boolean clause node whose range contains the given offset.
 * A "clause" is any operand of a boolean expression — i.e., a FieldValue, FieldGroup,
 * Group, Not, Range, Regex, BareTerm, SavedSearch, HistoryRef, or Error node.
 * Returns null if offset falls in a boolean operator (between operands) or outside the AST.
 */
function findClauseNode(node: ASTNode, offset: number): ASTNode | null {
  if (offset < node.start || offset > node.end) return null;

  if (node.type === 'BooleanExpr') {
    const leftHit = findClauseNode(node.left, offset);
    if (leftHit) return leftHit;
    const rightHit = findClauseNode(node.right, offset);
    if (rightHit) return rightHit;
    return null;
  }

  return node;
}

/**
 * Computes the character range for a "clause" selection at the given offset — the
 * range of a single operand (including prefix modifiers like NOT/-/+ and suffix
 * modifiers like ^boost/~fuzzy), plus one adjacent boolean connector if present so
 * that deleting the selection leaves a syntactically valid query.
 *
 * Prefers consuming the trailing connector when there is content after the clause,
 * otherwise consumes a leading connector. If the clause is the only operand at its
 * level, returns just the clause range.
 *
 * Returns null when no clause is found (e.g., offset is in whitespace between
 * operators, or the AST is empty).
 */
export function getClauseRangeAtOffset(
  ast: ASTNode | null,
  text: string,
  offset: number,
): { start: number; end: number } | null {
  if (!ast) return null;
  const clause = findClauseNode(ast, offset);
  if (!clause) return null;

  let start = clause.start;
  let end = clause.end;

  // Match trailing: whitespace + explicit binary op + whitespace, OR just whitespace
  // (implicit AND). Require real content after so we don't consume trailing-edge
  // whitespace when the clause is last.
  const trailingRe = /^(\s+(?:AND|OR|&&|\|\|)\s+|\s+)(?=\S)/i;
  const trailingMatch = text.slice(end).match(trailingRe);
  if (trailingMatch) {
    end += trailingMatch[0].length;
    return { start, end };
  }

  // No trailing connector — try leading.
  const before = text.slice(0, start);
  const leadingRe = /(\s+(?:AND|OR|&&|\|\|)\s+|\s+)$/i;
  const leadingMatch = before.match(leadingRe);
  if (leadingMatch && leadingMatch.index !== undefined && leadingMatch.index > 0) {
    // Only consume leading if there's non-whitespace content before it — otherwise
    // we'd be stripping leading whitespace that belongs to nothing.
    start -= leadingMatch[0].length;
  }

  return { start, end };
}

/**
 * The innermost *filter* containing the offset, for active-clause highlighting
 * (§9.5.7) — not the operand `findClauseNode` stops at. Descends through
 * boolean operators, `(…)` groups and NOT to the node that owns a field: a
 * field:value, a field group, a range, or (at the top level) a bare term,
 * reference or error. Inside a field group everything belongs to the group's
 * field, so the group is the filter — except a nested field:value or
 * field:[range] with its own field, which overrides the group's in
 * query_string and is its own filter. Null on a group's parens, on the NOT
 * keyword, or between clauses.
 */
function findFilterNode(node: ASTNode, offset: number, inFieldGroup: boolean): ASTNode | null {
  if (offset < node.start || offset > node.end) return null;
  switch (node.type) {
    case 'BooleanExpr':
      return findFilterNode(node.left, offset, inFieldGroup) ?? findFilterNode(node.right, offset, inFieldGroup);
    case 'Group':
    case 'Not':
      return findFilterNode(node.expression, offset, inFieldGroup);
    case 'FieldGroup':
      return findFilterNode(node.expression, offset, true) ?? node;
    case 'FieldValue':
      return node;
    case 'Range':
      return node.field || !inFieldGroup ? node : null;
    default:
      return inFieldGroup ? null : node;
  }
}

/**
 * Range of the filter the caret is in (see `findFilterNode`). The end is
 * inclusive, so a caret right after a filter still counts as inside it.
 */
export function getActiveClauseRangeAtOffset(ast: ASTNode | null, offset: number): { start: number; end: number } | null {
  if (!ast || offset < 0) return null;
  const node = findFilterNode(ast, offset, false);
  return node ? { start: node.start, end: node.end } : null;
}
