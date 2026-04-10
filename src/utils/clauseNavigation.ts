import { ASTNode } from '../parser/ast';

/** A navigable clause stop: a character range in the query to select. */
export interface ClauseStop {
  start: number;
  end: number;
}

/**
 * Collect an ordered list of clause stops for Ctrl+Shift+Arrow navigation.
 *
 * Rules:
 * - Leaf nodes (FieldValue, BareTerm, SavedSearch, HistoryRef, Regex, Range, Error) → single stop
 * - Group with multiple clauses → stop on group, enter, recurse contents, exit back to group
 * - Group with single clause → stop on group only (no enter)
 * - FieldGroup → stop on whole thing, enter and recurse contents, NO exit back
 * - Not → stop on whole thing, enter inner expression, NO exit back
 * - BooleanExpr → flatten left/right and recurse each side
 */
export function collectClauseStops(ast: ASTNode | null): ClauseStop[] {
  if (!ast) return [];
  return walkNode(ast);
}

function isMultiClause(node: ASTNode): boolean {
  return node.type === 'BooleanExpr';
}

function walkNode(node: ASTNode): ClauseStop[] {
  switch (node.type) {
    case 'BooleanExpr':
      return walkBooleanExpr(node);

    case 'Group': {
      const stops: ClauseStop[] = [];
      const inner = node.expression;
      if (isMultiClause(inner)) {
        // Multi-clause group: enter → contents → exit
        stops.push({ start: node.start, end: node.end });
        stops.push(...walkNode(inner));
        stops.push({ start: node.start, end: node.end });
      } else {
        // Single-clause group: just the group itself
        stops.push({ start: node.start, end: node.end });
      }
      return stops;
    }

    case 'FieldGroup': {
      const stops: ClauseStop[] = [];
      stops.push({ start: node.start, end: node.end });
      const inner = node.expression;
      if (isMultiClause(inner)) {
        // Multi-clause: enter contents, no exit back
        stops.push(...walkNode(inner));
      }
      return stops;
    }

    case 'Not': {
      const stops: ClauseStop[] = [];
      stops.push({ start: node.start, end: node.end });
      // Enter into the inner expression (no exit back)
      stops.push(...walkNode(node.expression));
      return stops;
    }

    // Leaf nodes
    case 'FieldValue':
    case 'BareTerm':
    case 'SavedSearch':
    case 'HistoryRef':
    case 'Regex':
    case 'Range':
    case 'Error':
      return [{ start: node.start, end: node.end }];
  }
}

function walkBooleanExpr(node: ASTNode): ClauseStop[] {
  if (node.type === 'BooleanExpr') {
    return [...walkBooleanExpr(node.left), ...walkBooleanExpr(node.right)];
  }
  return walkNode(node);
}

/**
 * Given the current stop index and direction, find the next clause stop.
 * When `currentIndex` is -1 (no active stop), finds the nearest stop
 * in the given direction from the cursor position.
 *
 * Returns `{ stop, index }` or null if there's nowhere to go.
 */
export function findNextClauseStop(
  stops: ClauseStop[],
  currentIndex: number,
  cursorOffset: number,
  direction: 'forward' | 'backward',
): { stop: ClauseStop; index: number } | null {
  if (stops.length === 0) return null;

  if (currentIndex >= 0 && currentIndex < stops.length) {
    const nextIdx = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    if (nextIdx >= 0 && nextIdx < stops.length) {
      return { stop: stops[nextIdx], index: nextIdx };
    }
    return null;
  }

  // No active stop — find the nearest one from the cursor position
  if (direction === 'forward') {
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].start >= cursorOffset) {
        return { stop: stops[i], index: i };
      }
    }
    // Cursor is past all stops — return the last one
    return { stop: stops[stops.length - 1], index: stops.length - 1 };
  } else {
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i].end <= cursorOffset) {
        return { stop: stops[i], index: i };
      }
    }
    // Cursor is before all stops — return the first one
    return { stop: stops[0], index: 0 };
  }
}
