import { ASTNode } from '../parser/ast';
import { Token, TokenType } from '../lexer/tokens';

export interface SelectionRange {
  start: number;
  end: number;
}

/**
 * Token types that serve as the innermost expansion level.
 * Expand this set to include additional token types as needed.
 */
const EXPANDABLE_TOKEN_TYPES = new Set<TokenType>([
  TokenType.VALUE,
  TokenType.QUOTED_VALUE,
  TokenType.WILDCARD,
  TokenType.FIELD_NAME,
  TokenType.RANGE,
  TokenType.SAVED_SEARCH,
  TokenType.HISTORY_REF,
  TokenType.REGEX,
]);

/**
 * Build the expansion hierarchy for a given cursor offset.
 *
 * Returns an array of ranges sorted smallest-to-largest, each
 * representing one "expand selection" level:
 *   [0] = token under cursor
 *   [1] = innermost AST node
 *   ...
 *   [N] = root (entire query)
 *
 * Duplicate ranges are collapsed so each step widens the selection.
 */
export function getExpansionRanges(
  ast: ASTNode | null,
  tokens: Token[],
  offset: number,
): SelectionRange[] {
  const ranges: SelectionRange[] = [];

  // Level 0: token under cursor
  for (const token of tokens) {
    if (offset >= token.start && offset <= token.end && EXPANDABLE_TOKEN_TYPES.has(token.type)) {
      ranges.push({ start: token.start, end: token.end });
      break;
    }
  }

  // Walk the AST collecting all ancestor nodes that contain the offset
  if (ast) {
    collectAncestors(ast, offset, ranges);
  }

  // Deduplicate and sort by span size (smallest first)
  return dedup(ranges);
}

/** Recursively collect nodes whose [start, end] range contains the offset. */
function collectAncestors(node: ASTNode, offset: number, out: SelectionRange[]): boolean {
  if (offset < node.start || offset > node.end) return false;

  // Recurse into children first so we collect innermost nodes
  let childContains = false;

  switch (node.type) {
    case 'BooleanExpr':
      childContains = collectAncestors(node.left, offset, out) || childContains;
      childContains = collectAncestors(node.right, offset, out) || childContains;
      break;
    case 'Group':
    case 'Not':
    case 'FieldGroup':
      childContains = collectAncestors(node.expression, offset, out) || childContains;
      break;
    // Leaf nodes: FieldValue, BareTerm, SavedSearch, HistoryRef, Range, Regex, Error
  }

  // Add this node's range (will be deduped later if identical to a child)
  out.push({ start: node.start, end: node.end });
  return true;
}

/** Remove duplicate ranges and sort by span size ascending. */
function dedup(ranges: SelectionRange[]): SelectionRange[] {
  // Sort by span size, then by start position
  ranges.sort((a, b) => {
    const sizeA = a.end - a.start;
    const sizeB = b.end - b.start;
    return sizeA - sizeB || a.start - b.start;
  });

  const result: SelectionRange[] = [];
  for (const r of ranges) {
    const prev = result[result.length - 1];
    if (prev && prev.start === r.start && prev.end === r.end) continue;
    result.push(r);
  }
  return result;
}
