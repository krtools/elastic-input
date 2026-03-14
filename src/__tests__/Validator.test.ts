import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { Validator } from '../validation/Validator';
import { FieldConfig } from '../types';

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'enum', suggestions: ['active', 'inactive'] },
  { name: 'price', type: 'number' },
  { name: 'created', type: 'date' },
  { name: 'is_vip', type: 'boolean' },
  { name: 'ip', type: 'ip' },
  { name: 'name', type: 'string' },
  { name: 'rating', type: 'number', validate: (v) => {
    const n = Number(v);
    return (n >= 1 && n <= 5) ? null : 'Rating must be between 1 and 5';
  }},
];

function validate(input: string) {
  const tokens = new Lexer(input).tokenize();
  const ast = new Parser(tokens).parse();
  return new Validator(FIELDS).validate(ast);
}

describe('Validator', () => {
  it('returns no errors for valid query', () => {
    expect(validate('status:active')).toHaveLength(0);
  });

  it('returns no errors for valid boolean query', () => {
    expect(validate('status:active AND price:>100')).toHaveLength(0);
  });

  it('flags unknown fields', () => {
    const errors = validate('unknown:value');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown field');
    expect(errors[0].message).toContain('unknown');
  });

  it('flags invalid enum values', () => {
    const errors = validate('status:bogus');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid value');
  });

  it('accepts valid enum values', () => {
    expect(validate('status:active')).toHaveLength(0);
    expect(validate('status:inactive')).toHaveLength(0);
  });

  it('flags invalid numbers', () => {
    const errors = validate('price:abc');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid number');
  });

  it('accepts valid numbers', () => {
    expect(validate('price:100')).toHaveLength(0);
    expect(validate('price:99.5')).toHaveLength(0);
  });

  it('flags invalid booleans', () => {
    const errors = validate('is_vip:yes');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('true');
    expect(errors[0].message).toContain('false');
  });

  it('accepts valid booleans', () => {
    expect(validate('is_vip:true')).toHaveLength(0);
    expect(validate('is_vip:false')).toHaveLength(0);
  });

  it('flags invalid IP addresses', () => {
    const errors = validate('ip:not-an-ip');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid IP');
  });

  it('accepts valid IP addresses', () => {
    expect(validate('ip:192.168.1.1')).toHaveLength(0);
  });

  it('accepts wildcard IP', () => {
    expect(validate('ip:192.168.*')).toHaveLength(0);
  });

  it('flags invalid dates', () => {
    const errors = validate('created:not-a-date');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid date');
  });

  it('accepts valid date formats', () => {
    expect(validate('created:2024-01-15')).toHaveLength(0);
    expect(validate('created:now')).toHaveLength(0);
    expect(validate('created:now-7d')).toHaveLength(0);
  });

  it('flags comparison operator on non-numeric/date field', () => {
    const errors = validate('status:>active');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Comparison operator');
  });

  it('allows comparison operator on number field', () => {
    expect(validate('price:>100')).toHaveLength(0);
  });

  it('allows comparison operator on date field', () => {
    expect(validate('created:>2024-01-01')).toHaveLength(0);
  });

  it('runs custom validator', () => {
    const errors = validate('rating:10');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('between 1 and 5');
  });

  it('passes custom validator for valid value', () => {
    expect(validate('rating:3')).toHaveLength(0);
  });

  it('validates nested boolean expressions', () => {
    const errors = validate('status:active AND unknown:x');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('unknown');
  });

  it('validates inside groups', () => {
    const errors = validate('(status:bogus)');
    expect(errors).toHaveLength(1);
  });

  it('validates inside NOT', () => {
    const errors = validate('NOT status:bogus');
    expect(errors).toHaveLength(1);
  });

  it('returns no errors for empty value', () => {
    expect(validate('status:')).toHaveLength(0);
  });

  it('returns no errors for null AST', () => {
    expect(validate('')).toHaveLength(0);
  });

  it('does not validate bare terms', () => {
    // Bare terms like "hello" are not field:value pairs, so no validation
    expect(validate('hello')).toHaveLength(0);
  });

  it('collects multiple errors', () => {
    const errors = validate('unknown1:x AND unknown2:y');
    expect(errors).toHaveLength(2);
  });
});

describe('Date range validation', () => {
  it('accepts [date TO date] range', () => {
    expect(validate('created:[now-7d TO now]')).toHaveLength(0);
  });

  it('accepts [date TO date] with absolute dates', () => {
    expect(validate('created:[2024-01-01 TO 2024-12-31]')).toHaveLength(0);
  });

  it('accepts {date TO date} exclusive range', () => {
    expect(validate('created:{now-30d TO now}')).toHaveLength(0);
  });

  it('accepts mixed bracket range [date TO date}', () => {
    expect(validate('created:[now-7d TO now}')).toHaveLength(0);
  });

  it('accepts mixed bracket range {date TO date]', () => {
    expect(validate('created:{now-7d TO now]')).toHaveLength(0);
  });

  it('accepts range with rounding syntax now/d', () => {
    expect(validate('created:[now/d TO now]')).toHaveLength(0);
  });

  it('accepts range with relative+rounding syntax now-1d/d', () => {
    expect(validate('created:[now-1d/d TO now/d]')).toHaveLength(0);
  });

  it('flags invalid range start', () => {
    const errors = validate('created:[invalid TO now]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Range start');
  });

  it('flags invalid range end', () => {
    const errors = validate('created:[now TO invalid]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Range end');
  });
});
