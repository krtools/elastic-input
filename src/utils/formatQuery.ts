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
  /** When set, replaces implicit AND (whitespace between terms) with this operator
   *  string in the output. By default, implicit AND is preserved as whitespace.
   *  @example 'AND' — turns `status:active name:john` into `status:active AND name:john` */
  whitespaceOperator?: string;
  /** Force all explicit AND operators to this string. By default, the original
   *  source form is preserved (e.g. `&&` stays `&&`, `AND` stays `AND`).
   *  @example '&&' — normalizes all AND operators to `&&` */
  andOperator?: string;
  /** Force all explicit OR operators to this string. By default, the original
   *  source form is preserved (e.g. `||` stays `||`, `OR` stays `OR`).
   *  @example '||' — normalizes all OR operators to `||` */
  orOperator?: string;
  /** Force all NOT prefixes to this string. By default, the original
   *  source form is preserved (e.g. `NOT` stays `NOT`, `-` stays `-`).
   *  @example '!' — normalizes all NOT operators to `!` */
  notOperator?: string;
}

/**
 * Pretty-print an Elasticsearch query string.
 * Accepts a raw query string or a pre-parsed AST node.
 */
export function formatQuery(input: string | ASTNode, options?: FormatQueryOptions): string {
  const maxLineLength = options?.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const indent = options?.indent ?? DEFAULT_INDENT;
  const opMap: OpMap = {
    whitespace: options?.whitespaceOperator,
    and: options?.andOperator,
    or: options?.orOperator,
    not: options?.notOperator,
  };
  let ast: ASTNode | null;
  if (typeof input === 'string') {
    const tokens = new Lexer(input, { savedSearches: true, historySearch: true }).tokenize();
    const parser = new Parser(tokens);
    ast = parser.parse();
  } else {
    ast = input;
  }
  if (!ast) return '';
  return printNode(ast, 0, maxLineLength, indent, opMap);
}

/** Internal operator map resolved from FormatQueryOptions. undefined = preserve source. */
interface OpMap {
  whitespace?: string;
  and?: string;
  or?: string;
  not?: string;
}

/** Resolve the display operator for a BooleanExpr node. */
function resolveOperator(node: BooleanExprNode, ops: OpMap): string {
  if (node.implicit) return ops.whitespace ?? '';
  if (node.operator === 'AND') return ops.and ?? node.sourceOperator ?? 'AND';
  return ops.or ?? node.sourceOperator ?? 'OR';
}

/** Resolve the display NOT operator and separator for a Not node.
 *  Prefix operators like `-` attach directly; keyword operators like `NOT` need a space. */
function resolveNot(node: { sourceOperator?: string }, ops: OpMap): { op: string; sep: string } {
  const op = ops.not ?? node.sourceOperator ?? 'NOT';
  // Prefix-style operators (-, !) attach directly; keyword-style (NOT, not) need a space
  const sep = /^[a-zA-Z]/.test(op) ? ' ' : '';
  return { op, sep };
}

/** Render a node to a single-line string (no newlines). */
function inline(node: ASTNode, ops: OpMap): string {
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
    case 'Not': {
      const { op: notOp, sep: notSep } = resolveNot(node, ops);
      return `${notOp}${notSep}${inline(node.expression, ops)}`;
    }
    case 'Group': {
      let s = `(${inline(node.expression, ops)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'FieldGroup': {
      let s = `${node.field}:(${inline(node.expression, ops)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }
    case 'BooleanExpr': {
      const op = resolveOperator(node, ops);
      const sep = op ? ` ${op} ` : ' ';
      return `${inline(node.left, ops)}${sep}${inline(node.right, ops)}`;
    }
    case 'Error':
      return node.value;
  }
}

/** Flatten a chain of same-operator BooleanExpr into an array of operands. */
function flattenChain(node: BooleanExprNode): { operator: 'AND' | 'OR'; implicit: boolean; sourceOperator?: string; operands: ASTNode[] } {
  const op = node.operator;
  const implicit = !!node.implicit;
  const operands: ASTNode[] = [];
  const collect = (n: ASTNode) => {
    if (n.type === 'BooleanExpr' && n.operator === op && !!n.implicit === implicit) {
      collect(n.left);
      collect(n.right);
    } else {
      operands.push(n);
    }
  };
  collect(node);
  return { operator: op, implicit, sourceOperator: node.sourceOperator, operands };
}

/** Check if a node contains any Group/FieldGroup nodes (nested parens). */
function containsGroups(node: ASTNode): boolean {
  if (node.type === 'Group' || node.type === 'FieldGroup') return true;
  if (node.type === 'BooleanExpr') return containsGroups(node.left) || containsGroups(node.right);
  if (node.type === 'Not') return containsGroups(node.expression);
  return false;
}

const DEFAULT_OPS: OpMap = { and: 'AND', or: 'OR', not: 'NOT' };

/** Decide whether a Group's content should be broken into multiple lines. */
function shouldBreakGroup(expr: ASTNode, maxLineLength: number): boolean {
  const inlined = inline(expr, DEFAULT_OPS);
  if (inlined.length > maxLineLength) return true;
  // Break if the group's content contains nested groups (parens inside parens)
  if (containsGroups(expr)) return true;
  return false;
}

/** Print a node at the given indentation depth. */
function printNode(node: ASTNode, depth: number, maxLineLength: number, indent: string, ops: OpMap): string {
  const pad = indent.repeat(depth);

  switch (node.type) {
    case 'BooleanExpr': {
      const { operator, implicit, sourceOperator, operands } = flattenChain(node);
      const displayOp = implicit
        ? (ops.whitespace ?? '')
        : operator === 'AND'
          ? (ops.and ?? sourceOperator ?? 'AND')
          : (ops.or ?? sourceOperator ?? 'OR');
      const sep = displayOp ? ` ${displayOp} ` : ' ';
      // Try inline first
      const inlined = operands.map(o => inline(o, ops)).join(sep);
      if (inlined.length <= maxLineLength) {
        return inlined;
      }
      // Multi-line: first operand, then each subsequent prefixed with the operator
      const lines = operands.map((operand, i) => {
        const printed = printNode(operand, depth, maxLineLength, indent, ops);
        if (i === 0) return printed;
        return displayOp ? `${pad}${displayOp} ${printed}` : `${pad}${printed}`;
      });
      return lines.join('\n');
    }

    case 'Group': {
      if (!shouldBreakGroup(node.expression, maxLineLength)) {
        let s = `(${inline(node.expression, ops)})`;
        if (node.boost != null) s += `^${node.boost}`;
        return s;
      }
      const inner = printNode(node.expression, depth + 1, maxLineLength, indent, ops);
      let s = `(\n${indentLines(inner, depth + 1, indent)}\n${pad})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }

    case 'FieldGroup': {
      // Field groups are always inline — they're inherently short
      let s = `${node.field}:(${inline(node.expression, ops)})`;
      if (node.boost != null) s += `^${node.boost}`;
      return s;
    }

    case 'Not': {
      const { op: notOp, sep: notSep } = resolveNot(node, ops);
      return `${notOp}${notSep}${printNode(node.expression, depth, maxLineLength, indent, ops)}`;
    }

    default:
      return inline(node, ops);
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
