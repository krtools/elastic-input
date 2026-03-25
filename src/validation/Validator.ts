import { ASTNode, RangeNode } from '../parser/ast';
import { FieldConfig, ValidateReturn, ValidateValueContext } from '../types';
import { validateNumber } from './numberValidator';
import { validateDate, ParseDateFn } from './dateValidator';

/** Callback type for external value validation. */
export type ValidateValueFn = (context: ValidateValueContext) => ValidateReturn;

/** Normalize a ValidateReturn into message + severity, or null if valid. */
function normalizeValidateResult(result: ValidateReturn): { message: string; severity: 'error' | 'warning' } | null {
  if (result == null) return null;
  if (typeof result === 'string') return { message: result, severity: 'error' };
  return result;
}

/** A validation or syntax error with character offsets for squiggly underline display. */
export interface ValidationError {
  /** Human-readable error description. */
  message: string;
  /** Start character offset (inclusive) in the input string. */
  start: number;
  /** End character offset (exclusive) in the input string. */
  end: number;
  /** The field name this error relates to, if applicable. */
  field?: string;
  /** Severity level. `'warning'` renders amber squiggles; `'error'` (default) renders red. */
  severity?: 'error' | 'warning';
}

export class Validator {
  private fields: Map<string, FieldConfig>;

  constructor(fields: FieldConfig[]) {
    this.fields = new Map(fields.map(f => [f.name, f]));
    for (const f of fields) {
      if (f.aliases) {
        for (const alias of f.aliases) {
          this.fields.set(alias, f);
        }
      }
    }
  }

  validate(ast: ASTNode | null, validateValueFn?: ValidateValueFn, parseDateFn?: ParseDateFn): ValidationError[] {
    if (!ast) return [];
    const errors: ValidationError[] = [];
    this.walkNode(ast, errors, validateValueFn, parseDateFn);
    this.checkAmbiguousPrecedence(ast, errors);
    return errors;
  }

  private walkNode(node: ASTNode, errors: ValidationError[], validateValueFn?: ValidateValueFn, parseDateFn?: ParseDateFn): void {
    switch (node.type) {
      case 'BareTerm': {
        // Validate modifiers on bare terms
        if (node.fuzzy !== undefined && node.fuzzy > 2) {
          errors.push({
            message: `Fuzzy edit distance must be 0, 1, or 2 (got ${node.fuzzy})`,
            start: node.start,
            end: node.end,
          });
        }
        if (node.proximity !== undefined && node.proximity < 0) {
          errors.push({
            message: `Proximity value must be non-negative (got ${node.proximity})`,
            start: node.start,
            end: node.end,
          });
        }
        if (node.boost !== undefined && node.boost <= 0) {
          errors.push({
            message: `Boost value must be positive (got ${node.boost})`,
            start: node.start,
            end: node.end,
          });
        }
        // Custom validator for bare terms
        if (validateValueFn && node.value !== '') {
          const result = normalizeValidateResult(validateValueFn({
            value: node.value,
            position: 'bare_term',
            quoted: node.quoted,
          }));
          if (result) {
            errors.push({
              message: result.message,
              start: node.start,
              end: node.end,
              severity: result.severity,
            });
          }
        }
        break;
      }

      case 'Regex':
        break;

      case 'Range': {
        // Check for empty range bounds regardless of field
        this.validateEmptyRangeBounds(node, errors);

        if (node.field && node.field !== '*') {
          const rangeField = this.fields.get(node.field);
          if (!rangeField) {
            errors.push({
              message: `Unknown field: "${node.field}"`,
              start: node.start,
              end: node.start + node.field.length,
              field: node.field,
            });
          } else {
            this.validateRangeBounds(rangeField, node, errors, validateValueFn, parseDateFn);
          }
        }
        break;
      }

      case 'FieldValue': {
        // * as field name means all fields — skip field-specific validation
        if (node.field === '*') return;

        const field = this.fields.get(node.field);
        if (!field) {
          errors.push({
            message: `Unknown field: "${node.field}"`,
            start: node.start,
            end: node.start + node.field.length,
            field: node.field,
          });
          return;
        }

        if (node.value === '') {
          const opLabel = node.operator === ':' ? ':' : node.operator;
          errors.push({
            message: `Missing value after "${node.field}${opLabel}"`,
            start: node.start,
            end: node.end,
            field: node.field,
          });
          return;
        }

        // Validate modifiers
        if (node.fuzzy !== undefined && node.fuzzy > 2) {
          errors.push({
            message: `Fuzzy edit distance must be 0, 1, or 2 (got ${node.fuzzy})`,
            start: node.start,
            end: node.end,
            field: node.field,
          });
        }
        if (node.boost !== undefined && node.boost <= 0) {
          errors.push({
            message: `Boost value must be positive (got ${node.boost})`,
            start: node.start,
            end: node.end,
            field: node.field,
          });
        }

        // Type-specific validation
        let error: string | null = null;
        switch (field.type) {
          case 'number':
            error = validateNumber(node.value);
            break;
          case 'date':
            error = validateDate(node.value, parseDateFn);
            break;
          case 'boolean':
            if (node.value !== 'true' && node.value !== 'false') {
              error = `Expected "true" or "false", got "${node.value}"`;
            }
            break;
          case 'ip':
            if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(node.value) && !node.value.includes('*')) {
              error = `"${node.value}" is not a valid IP address`;
            }
            break;
        }

        // Check comparison operators
        if (node.operator !== ':' && field.type !== 'number' && field.type !== 'date') {
          error = `Comparison operator "${node.operator}" is not valid for ${field.type} fields`;
        }

        // Custom validator
        if (!error && validateValueFn) {
          const result = normalizeValidateResult(validateValueFn({
            value: node.value,
            position: 'field_value',
            fieldName: field.name,
            fieldConfig: field,
            quoted: node.quoted,
            operator: node.operator !== ':' ? node.operator : undefined,
          }));
          if (result) {
            const valueStart = node.end - node.value.length;
            errors.push({
              message: result.message,
              start: valueStart,
              end: node.end,
              field: node.field,
              severity: result.severity,
            });
          }
        }

        if (error) {
          // Position error on the value portion
          const valueStart = node.end - node.value.length;
          errors.push({
            message: error,
            start: valueStart,
            end: node.end,
            field: node.field,
          });
        }
        break;
      }

      case 'FieldGroup': {
        // * as field name means all fields — skip field-specific validation
        if (node.field === '*') {
          this.walkNode(node.expression, errors, validateValueFn, parseDateFn);
        } else {
          const groupField = this.fields.get(node.field);
          if (!groupField) {
            errors.push({
              message: `Unknown field: "${node.field}"`,
              start: node.start,
              end: node.start + node.field.length,
              field: node.field,
            });
          } else {
            this.walkFieldGroup(node.expression, groupField, errors, validateValueFn, parseDateFn);
          }
        }
        if (node.boost !== undefined && node.boost <= 0) {
          errors.push({
            message: `Boost value must be positive (got ${node.boost})`,
            start: node.start,
            end: node.end,
          });
        }
        break;
      }

      case 'BooleanExpr':
        this.walkNode(node.left, errors, validateValueFn, parseDateFn);
        this.walkNode(node.right, errors, validateValueFn, parseDateFn);
        break;

      case 'Group':
        this.walkNode(node.expression, errors, validateValueFn, parseDateFn);
        if (node.boost !== undefined && node.boost <= 0) {
          errors.push({
            message: `Boost value must be positive (got ${node.boost})`,
            start: node.start,
            end: node.end,
          });
        }
        break;

      case 'Not':
        this.walkNode(node.expression, errors, validateValueFn, parseDateFn);
        break;

      case 'Error':
        errors.push({
          message: node.message,
          start: node.start,
          end: node.end,
        });
        break;
    }
  }

  /** Walk inside a FieldGroup, validating bare terms / field values against the group's field config. */
  private walkFieldGroup(node: ASTNode, field: FieldConfig, errors: ValidationError[], validateValueFn?: ValidateValueFn, parseDateFn?: ParseDateFn): void {
    switch (node.type) {
      case 'BareTerm': {
        if (node.value === '') return;
        this.validateFieldValue(field, node.value, node.quoted, ':', node.start, node.end, errors, validateValueFn, parseDateFn);
        break;
      }
      case 'FieldValue': {
        // Nested field:value inside a group — validate normally
        this.walkNode(node, errors, validateValueFn, parseDateFn);
        break;
      }
      case 'Range': {
        this.validateRangeBounds(field, node, errors, validateValueFn, parseDateFn);
        break;
      }
      case 'BooleanExpr':
        this.walkFieldGroup(node.left, field, errors, validateValueFn, parseDateFn);
        this.walkFieldGroup(node.right, field, errors, validateValueFn, parseDateFn);
        break;
      case 'Group':
        this.walkFieldGroup(node.expression, field, errors, validateValueFn, parseDateFn);
        break;
      case 'Not':
        this.walkFieldGroup(node.expression, field, errors, validateValueFn, parseDateFn);
        break;
      default:
        this.walkNode(node, errors, validateValueFn, parseDateFn);
        break;
    }
  }

  /** Validate a value against a field config (shared between FieldValue and FieldGroup terms). */
  private validateFieldValue(
    field: FieldConfig, value: string, quoted: boolean, operator: string,
    start: number, end: number, errors: ValidationError[], validateValueFn?: ValidateValueFn, parseDateFn?: ParseDateFn,
  ): void {
    let error: string | null = null;
    switch (field.type) {
      case 'number':
        error = validateNumber(value);
        break;
      case 'date':
        error = validateDate(value, parseDateFn);
        break;
      case 'boolean':
        if (value !== 'true' && value !== 'false') {
          error = `Expected "true" or "false", got "${value}"`;
        }
        break;
      case 'ip':
        if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value) && !value.includes('*')) {
          error = `"${value}" is not a valid IP address`;
        }
        break;
    }

    if (operator !== ':' && field.type !== 'number' && field.type !== 'date') {
      error = `Comparison operator "${operator}" is not valid for ${field.type} fields`;
    }

    if (!error && validateValueFn) {
      const result = normalizeValidateResult(validateValueFn({
        value,
        position: 'field_group_term',
        fieldName: field.name,
        fieldConfig: field,
        quoted,
        operator: operator !== ':' ? operator : undefined,
      }));
      if (result) {
        errors.push({
          message: result.message,
          start,
          end,
          field: field.name,
          severity: result.severity,
        });
      }
    }

    if (error) {
      errors.push({
        message: error,
        start,
        end,
        field: field.name,
      });
    }
  }

  /** Flag empty range bounds (e.g. `[TO]`, `[ TO ]`). */
  private validateEmptyRangeBounds(node: RangeNode, errors: ValidationError[]): void {
    if (node.lower !== '*' && node.lower.trim() === '') {
      errors.push({
        message: 'Missing lower bound in range',
        start: node.start,
        end: node.start + 1, // highlight the opening bracket
        field: node.field,
      });
    }
    if (node.upper !== '*' && node.upper.trim() === '') {
      errors.push({
        message: 'Missing upper bound in range',
        start: node.end - 1, // highlight the closing bracket
        end: node.end,
        field: node.field,
      });
    }
  }

  /** Validate range bounds against a field config. */
  private validateRangeBounds(field: FieldConfig, node: RangeNode, errors: ValidationError[], validateValueFn?: ValidateValueFn, parseDateFn?: ParseDateFn): void {
    const bounds: Array<{ value: string; label: string; start: number; end: number; position: 'range_start' | 'range_end'; inclusive: boolean }> = [];
    if (node.lower !== '*' && node.lower.trim() !== '') bounds.push({ value: node.lower, label: 'Range start', start: node.lowerStart, end: node.lowerEnd, position: 'range_start', inclusive: node.lowerInclusive });
    if (node.upper !== '*' && node.upper.trim() !== '') bounds.push({ value: node.upper, label: 'Range end', start: node.upperStart, end: node.upperEnd, position: 'range_end', inclusive: node.upperInclusive });

    for (const bound of bounds) {
      let error: string | null = null;
      switch (field.type) {
        case 'number':
          error = validateNumber(bound.value);
          if (error) error = `${bound.label}: ${error}`;
          break;
        case 'date':
          error = validateDate(bound.value, parseDateFn);
          if (error) error = `${bound.label}: ${error}`;
          break;
        case 'boolean':
          error = `Range queries are not supported for boolean fields`;
          break;
      }

      // Custom validator with range context
      if (!error && validateValueFn) {
        const result = normalizeValidateResult(validateValueFn({
          value: bound.value,
          position: bound.position,
          fieldName: field.name,
          fieldConfig: field,
          quoted: false,
          inclusive: bound.inclusive,
        }));
        if (result) {
          errors.push({
            message: result.message,
            start: bound.start,
            end: bound.end,
            field: field.name,
            severity: result.severity,
          });
        }
      }

      if (error) {
        errors.push({
          message: error,
          start: bound.start,
          end: bound.end,
          field: field.name,
        });
      }
    }
  }

  /** Post-validation pass: detect mixed AND/OR without parentheses. */
  private checkAmbiguousPrecedence(node: ASTNode, errors: ValidationError[]): void {
    const flagged = new Set<ASTNode>();
    this.findAndFlagAmbiguity(node, errors, flagged);
  }

  private findAndFlagAmbiguity(node: ASTNode, errors: ValidationError[], flagged: Set<ASTNode>): void {
    if (node.type === 'BooleanExpr' && !flagged.has(node)) {
      // Collect all chained operators at this level (stopping at Group boundaries)
      const ops = new Set<string>();
      const allNodes: ASTNode[] = [];
      this.collectBoolOps(node, ops, allNodes);

      if (ops.size > 1) {
        errors.push({
          message: 'Ambiguous precedence: mix of AND and OR without parentheses. Add parentheses to clarify.',
          start: node.start,
          end: node.end,
          severity: 'warning',
        });
        // Mark all collected nodes to prevent duplicate warnings
        allNodes.forEach(n => flagged.add(n));
      }

      // Recurse into leaf nodes (non-BooleanExpr children) for nested ambiguity
      this.collectLeaves(node).forEach(leaf => this.findAndFlagAmbiguity(leaf, errors, flagged));
    } else if (node.type === 'Group' || node.type === 'FieldGroup') {
      this.findAndFlagAmbiguity(node.expression, errors, flagged);
    } else if (node.type === 'Not') {
      this.findAndFlagAmbiguity(node.expression, errors, flagged);
    } else if (node.type === 'BooleanExpr') {
      // Already flagged — still recurse leaves
      this.collectLeaves(node).forEach(leaf => this.findAndFlagAmbiguity(leaf, errors, flagged));
    }
  }

  /** Collect all BooleanExpr operators at the same group level (stop at Group boundaries). */
  private collectBoolOps(node: ASTNode, ops: Set<string>, allNodes: ASTNode[]): void {
    if (node.type === 'BooleanExpr') {
      ops.add(node.operator);
      allNodes.push(node);
      this.collectBoolOps(node.left, ops, allNodes);
      this.collectBoolOps(node.right, ops, allNodes);
    }
    // Stop at Group, FieldGroup, Not, etc. — they establish explicit scope
  }

  /** Collect non-BooleanExpr children from a BooleanExpr chain. */
  private collectLeaves(node: ASTNode): ASTNode[] {
    if (node.type !== 'BooleanExpr') return [node];
    return [...this.collectLeaves(node.left), ...this.collectLeaves(node.right)];
  }
}
