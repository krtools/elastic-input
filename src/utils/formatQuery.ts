import { ASTNode, BooleanExprNode } from '../parser/ast';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';

const DEFAULT_MAX_LINE_LENGTH = 60;
const DEFAULT_INDENT = '  ';

/** Options for `formatQuery` pretty-printing. */
export interface FormatQueryOptions {
  /** Max length before a line is broken into multiple lines. @default 60 */
  maxLineLength?: number;
  /** Indent string for each nesting level. @default '  ' (2 spaces) */
  indent?: string;
}

/**
 * Pretty-print an Elasticsearch query string.
 * Accepts a raw query string or a pre-parsed AST node.
 */
export function formatQuery(input: string | ASTNode, options?: FormatQueryOptions): string {
  const maxLineLength = options?.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const indent = options?.indent ?? DEFAULT_INDENT;
  let ast: ASTNode | null;
  if (typeof input === 'string') {
    const tokens = new Lexer(input, { savedSearches: true, historySearch: true }).tokenize();
    const parser = new Parser(tokens);
    ast = parser.parse();
  } else {
    ast = input;
  }
  if (!ast) return typeof input === 'string' ? input : '';
  return printNode(ast, 0, maxLineLength, indent);
}

/** Render a node to a single-line string (no newlines). */
function inline(node: ASTNode): string {
  switch (node.type) {
    case 'FieldValue': {
      const val = node.quoted ? `"${node.value}"` : node.value;
      const op = node.operator === ':' ? ':' : `:${node.operator}`;
      let s = `${node.field}${op}${val}`;
      if (node.fuzzy != null) s += `~${node.fuzzy}`;
      if (node.proximity != null) s += `~${node.proximity}`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'BareTerm': {
      let s = node.quoted ? `"${node.value}"` : node.value;
      if (node.fuzzy != null) s += `~${node.fuzzy}`;
      if (node.proximity != null) s += `~${node.proximity}`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'Range': {
      const lb = node.lowerInclusive ? '[' : '{';
      const rb = node.upperInclusive ? ']' : '}';
      const lower = node.lowerQuoted ? `"${node.lower}"` : node.lower;
      const upper = node.upperQuoted ? `"${node.upper}"` : node.upper;
      const range = `${lb}${lower} TO ${upper}${rb}`;
      return node.field ? `${node.field}:${range}` : range;
    }
    case 'Regex':
      return `/${node.pattern}/`;
    case 'SavedSearch':
      return `#${node.name}`;
    case 'HistoryRef':
      return `!${node.ref}`;
    case 'Not':
      return `NOT ${inline(node.expression)}`;
    case 'Group': {
      let s = `(${inline(node.expression)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'FieldGroup': {
      let s = `${node.field}:(${inline(node.expression)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'BooleanExpr':
      return `${inline(node.left)} ${node.operator} ${inline(node.right)}`;
    case 'Error':
      return node.value;
  }
}

/** Flatten a chain of same-operator BooleanExpr into an array of operands. */
function flattenChain(node: BooleanExprNode): { operator: 'AND' | 'OR'; operands: ASTNode[] } {
  const op = node.operator;
  const operands: ASTNode[] = [];
  const collect = (n: ASTNode) => {
    if (n.type === 'BooleanExpr' && n.operator === op) {
      collect(n.left);
      collect(n.right);
    } else {
      operands.push(n);
    }
  };
  collect(node);
  return { operator: op, operands };
}

/** Check if a node contains any Group/FieldGroup nodes (nested parens). */
function containsGroups(node: ASTNode): boolean {
  if (node.type === 'Group' || node.type === 'FieldGroup') return true;
  if (node.type === 'BooleanExpr') return containsGroups(node.left) || containsGroups(node.right);
  if (node.type === 'Not') return containsGroups(node.expression);
  return false;
}

/** Decide whether a Group's content should be broken into multiple lines. */
function shouldBreakGroup(expr: ASTNode, maxLineLength: number): boolean {
  const inlined = inline(expr);
  if (inlined.length > maxLineLength) return true;
  // Break if the group's content contains nested groups (parens inside parens)
  if (containsGroups(expr)) return true;
  return false;
}

/** Print a node at the given indentation depth. */
function printNode(node: ASTNode, depth: number, maxLineLength: number, indent: string): string {
  const pad = indent.repeat(depth);

  switch (node.type) {
    case 'BooleanExpr': {
      const { operator, operands } = flattenChain(node);
      // Try inline first
      const inlined = operands.map(o => inline(o)).join(` ${operator} `);
      if (inlined.length <= maxLineLength) {
        return inlined;
      }
      // Multi-line: first operand, then each subsequent prefixed with the operator
      const lines = operands.map((operand, i) => {
        const printed = printNode(operand, depth, maxLineLength, indent);
        return i === 0 ? printed : `${pad}${operator} ${printed}`;
      });
      return lines.join('\n');
    }

    case 'Group': {
      if (!shouldBreakGroup(node.expression, maxLineLength)) {
        let s = `(${inline(node.expression)})`;
        if (node.boost != null) s += `^${node.boost}`;
        return s;
      }
      const inner = printNode(node.expression, depth + 1, maxLineLength, indent);
      let s = `(\n${indentLines(inner, depth + 1, indent)}\n${pad})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }

    case 'FieldGroup': {
      // Field groups are always inline — they're inherently short
      let s = `${node.field}:(${inline(node.expression)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }

    case 'Not':
      return `NOT ${printNode(node.expression, depth, maxLineLength, indent)}`;

    default:
      return inline(node);
  }
}

/** Ensure every line of a multi-line string has the given indentation. */
function indentLines(text: string, depth: number, indent: string): string {
  const pad = indent.repeat(depth);
  return text.split('\n').map(line => {
    // Don't double-indent lines that are already indented from a recursive call
    return line.startsWith(pad) ? line : pad + line;
  }).join('\n');
}
