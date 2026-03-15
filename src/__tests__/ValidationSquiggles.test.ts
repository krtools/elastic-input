import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { Validator, ValidationError, ValidateValueFn } from '../validation/Validator';
import { FieldConfig } from '../types';

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string', suggestions: ['active', 'inactive'] },
  { name: 'price', type: 'number' },
  { name: 'created', type: 'date' },
  { name: 'is_vip', type: 'boolean' },
  { name: 'ip', type: 'ip' },
  { name: 'name', type: 'string' },
  { name: 'rating', type: 'number' },
];

const ratingValidator: ValidateValueFn = (ctx) => {
  if (ctx.fieldName === 'rating') {
    const n = Number(ctx.value);
    return (n >= 1 && n <= 5) ? null : 'Rating must be between 1 and 5';
  }
  return null;
};

function validate(input: string) {
  const tokens = new Lexer(input).tokenize();
  const ast = new Parser(tokens).parse();
  return new Validator(FIELDS).validate(ast, ratingValidator);
}

// Simulate the deferred display logic from ValidationSquiggles
function getVisibleErrors(errors: ValidationError[], cursorOffset: number): ValidationError[] {
  return errors.filter(e => !(cursorOffset >= e.start && cursorOffset <= e.end));
}

describe('Validation Error Positions', () => {
  it('unknown field error covers the field name', () => {
    const errors = validate('unknown:value');
    expect(errors).toHaveLength(1);
    expect(errors[0].start).toBe(0);
    expect(errors[0].end).toBe(7); // "unknown" length
  });

  it('enum values are not validated (autocomplete only)', () => {
    const errors = validate('status:bad');
    expect(errors).toHaveLength(0);
  });

  it('invalid number error covers the value', () => {
    const errors = validate('price:abc');
    expect(errors).toHaveLength(1);
    expect(errors[0].start).toBe(6); // after "price:"
    expect(errors[0].end).toBe(9);   // end of "abc"
  });

  it('invalid boolean error covers the value', () => {
    const errors = validate('is_vip:maybe');
    expect(errors).toHaveLength(1);
    expect(errors[0].start).toBe(7); // after "is_vip:"
    expect(errors[0].end).toBe(12);  // end of "maybe"
  });

  it('invalid IP error covers the value', () => {
    const errors = validate('ip:notanip');
    expect(errors).toHaveLength(1);
    expect(errors[0].start).toBe(3); // after "ip:"
    expect(errors[0].end).toBe(10);  // end of "notanip"
  });

  it('custom validator error covers the value', () => {
    const errors = validate('rating:10');
    expect(errors).toHaveLength(1);
    expect(errors[0].start).toBe(7); // after "rating:"
    expect(errors[0].end).toBe(9);   // end of "10"
    expect(errors[0].message).toContain('between 1 and 5');
  });

  it('multiple errors have correct non-overlapping positions', () => {
    const errors = validate('unknown:x AND price:abc');
    expect(errors).toHaveLength(2);
    // First: unknown field
    expect(errors[0].start).toBe(0);
    expect(errors[0].end).toBe(7);
    // Second: invalid number value
    expect(errors[1].start).toBe(20); // after "unknown:x AND price:"
    expect(errors[1].end).toBe(23);   // end of "abc"
    // No overlap
    expect(errors[0].end).toBeLessThanOrEqual(errors[1].start);
  });

  it('comparison op on non-numeric/date field produces error on value', () => {
    const errors = validate('status:>active');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Comparison operator');
  });
});

describe('Deferred Display Logic', () => {
  it('hides error when cursor is within error range', () => {
    const errors = validate('unknown:value');
    // Cursor at position 3 — inside "unknown" (0-7)
    const visible = getVisibleErrors(errors, 3);
    expect(visible).toHaveLength(0);
  });

  it('hides error when cursor is at error start', () => {
    const errors = validate('unknown:value');
    const visible = getVisibleErrors(errors, 0);
    expect(visible).toHaveLength(0);
  });

  it('hides error when cursor is at error end', () => {
    const errors = validate('unknown:value');
    const visible = getVisibleErrors(errors, 7);
    expect(visible).toHaveLength(0);
  });

  it('shows error when cursor is past error range', () => {
    const errors = validate('unknown:value');
    // Cursor at position 13 — past the error range (0-7)
    const visible = getVisibleErrors(errors, 13);
    expect(visible).toHaveLength(1);
    expect(visible[0].message).toContain('Unknown field');
  });

  it('shows error when cursor is before error range', () => {
    // "status:active AND price:abc" — error is on "abc" at (24-27)
    const errors = validate('status:active AND price:abc');
    const numError = errors.find(e => e.message.includes('not a valid number'));
    expect(numError).toBeDefined();
    // Cursor at position 5 — before the error
    const visible = getVisibleErrors(errors, 5);
    expect(visible.some(e => e.message.includes('not a valid number'))).toBe(true);
  });

  it('shows one error and hides another based on cursor position', () => {
    const errors = validate('unknown:x AND price:abc');
    expect(errors).toHaveLength(2);

    // Cursor at position 3 — inside first error (0-7), outside second (20-23)
    const visible = getVisibleErrors(errors, 3);
    expect(visible).toHaveLength(1);
    expect(visible[0].message).toContain('not a valid number');
  });

  it('shows all errors when cursor is outside all error ranges', () => {
    const errors = validate('unknown:x AND price:abc');
    expect(errors).toHaveLength(2);

    // Cursor at position 12 — between the two errors
    const visible = getVisibleErrors(errors, 12);
    expect(visible).toHaveLength(2);
  });

  it('hides value error when cursor is on the value being typed', () => {
    const errors = validate('price:ab');
    expect(errors).toHaveLength(1);
    // Cursor at 8 — at end of "ab", within error range (6-8)
    const visible = getVisibleErrors(errors, 8);
    expect(visible).toHaveLength(0);
  });

  it('shows value error once cursor moves to next term', () => {
    const errors = validate('price:ab ');
    const valueErrors = errors.filter(e => e.message.includes('not a valid number'));
    expect(valueErrors).toHaveLength(1);
    // Error is at (6-8), cursor at 9 (after space)
    const visible = getVisibleErrors(valueErrors, 9);
    expect(visible).toHaveLength(1);
  });
});

describe('onValidationChange callback', () => {
  it('errors include field name for field-specific errors', () => {
    const errors = validate('price:abc');
    expect(errors[0].field).toBe('price');
  });

  it('errors include field name for unknown fields', () => {
    const errors = validate('foo:bar');
    expect(errors[0].field).toBe('foo');
  });

  it('returns empty array for valid input', () => {
    const errors = validate('status:active');
    expect(errors).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const errors = validate('');
    expect(errors).toHaveLength(0);
  });
});
