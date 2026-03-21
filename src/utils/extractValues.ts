import { ASTNode } from '../parser/ast';

/**
 * Describes a content value extracted from the AST.
 *
 * Kinds: term, field_value, range_lower, range_upper, group_term, regex.
 */
export type ExtractedValueKind =
  | 'term'
  | 'field_value'
  | 'range_lower'
  | 'range_upper'
  | 'group_term'
  | 'regex';

export interface ExtractedValue {
  kind: ExtractedValueKind;
  value: string;
  quoted: boolean;
  fieldName?: string;
  start: number;
  end: number;
}

/**
 * Walk an AST and extract all content values, returning them as an array
 * of ExtractedValue descriptors in document order.
 *
 * Excludes structural elements (operators, parens, field names, colons,
 * boost/fuzzy markers, saved searches, history refs, and error nodes).
 *
 * Pure function -- no DOM or React dependency. Tree-shakeable if unused.
 */
export function extractValues(ast: ASTNode | null): ExtractedValue[] {
  if (!ast) return [];
  const out: ExtractedValue[] = [];
  walk(ast, undefined, out);
  return out;
}

function walk(node: ASTNode, groupField: string | undefined, out: ExtractedValue[]): void {
  switch (node.type) {
    case 'BareTerm':
      out.push({
        kind: groupField ? 'group_term' : 'term',
        value: node.value,
        quoted: node.quoted,
        fieldName: groupField,
        start: node.start,
        end: node.end,
      });
      break;

    case 'FieldValue':
      out.push({
        kind: 'field_value',
        value: node.value,
        quoted: node.quoted,
        fieldName: node.field,
        start: node.start,
        end: node.end,
      });
      break;

    case 'Range': {
      const field = node.field || groupField;
      if (node.lower !== '*') {
        out.push({
          kind: 'range_lower',
          value: node.lower,
          quoted: node.lowerQuoted,
          fieldName: field,
          start: node.lowerStart,
          end: node.lowerEnd,
        });
      }
      if (node.upper !== '*') {
        out.push({
          kind: 'range_upper',
          value: node.upper,
          quoted: node.upperQuoted,
          fieldName: field,
          start: node.upperStart,
          end: node.upperEnd,
        });
      }
      break;
    }

    case 'Regex':
      out.push({
        kind: 'regex',
        value: node.pattern,
        quoted: false,
        start: node.start,
        end: node.end,
      });
      break;

    case 'FieldGroup':
      walk(node.expression, node.field, out);
      break;

    case 'BooleanExpr':
      walk(node.left, groupField, out);
      walk(node.right, groupField, out);
      break;

    case 'Group':
    case 'Not':
      walk(node.expression, groupField, out);
      break;

    // SavedSearch, HistoryRef, Error — no content values
  }
}
