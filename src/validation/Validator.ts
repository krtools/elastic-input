import { ASTNode } from '../parser/ast';
import { FieldConfig } from '../types';
import { validateNumber } from './numberValidator';
import { validateDate } from './dateValidator';

export interface ValidationError {
  message: string;
  start: number;
  end: number;
  field?: string;
}

export class Validator {
  private fields: Map<string, FieldConfig>;

  constructor(fields: FieldConfig[]) {
    this.fields = new Map(fields.map(f => [f.name, f]));
  }

  validate(ast: ASTNode | null): ValidationError[] {
    if (!ast) return [];
    const errors: ValidationError[] = [];
    this.walkNode(ast, errors);
    return errors;
  }

  private walkNode(node: ASTNode, errors: ValidationError[]): void {
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
        break;
      }

      case 'FieldValue': {
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

        if (node.value === '') return;

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
            error = validateDate(node.value);
            break;
          case 'boolean':
            if (node.value !== 'true' && node.value !== 'false') {
              error = `Expected "true" or "false", got "${node.value}"`;
            }
            break;
          case 'enum':
            if (field.suggestions && !field.suggestions.includes(node.value)) {
              error = `"${node.value}" is not a valid value for ${node.field}. Options: ${field.suggestions.join(', ')}`;
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
        if (!error && field.validate) {
          error = field.validate(node.value);
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

      case 'BooleanExpr':
        this.walkNode(node.left, errors);
        this.walkNode(node.right, errors);
        break;

      case 'Group':
        this.walkNode(node.expression, errors);
        break;

      case 'Not':
        this.walkNode(node.expression, errors);
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
}
