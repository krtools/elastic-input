import { describe, it, expect, vi } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { Validator, ValidateValueFn } from '../validation/Validator';
import { FieldConfig, ValidateValueContext } from '../types';

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'price', type: 'number' },
  { name: 'created', type: 'date' },
  { name: 'is_vip', type: 'boolean' },
  { name: 'ip', type: 'ip' },
  { name: 'name', type: 'string' },
  { name: 'rating', type: 'number' },
];

/** Rating validator used as top-level validateValue in tests that need custom validation. */
const ratingValidator: ValidateValueFn = (ctx) => {
  if (ctx.fieldName === 'rating') {
    const n = Number(ctx.value);
    return (n >= 1 && n <= 5) ? null : 'Rating must be between 1 and 5';
  }
  return null;
};

function validate(input: string, validateValueFn?: ValidateValueFn) {
  const tokens = new Lexer(input).tokenize();
  const ast = new Parser(tokens).parse();
  return new Validator(FIELDS).validate(ast, validateValueFn);
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

  it('does not validate enum values (autocomplete only)', () => {
    expect(validate('status:bogus')).toHaveLength(0);
    expect(validate('status:active')).toHaveLength(0);
    expect(validate('status:act*')).toHaveLength(0);
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

  it('accepts field:-value as valid (negated value shorthand)', () => {
    expect(validate('status:-inactive')).toHaveLength(0);
    expect(validate('price:-5')).toHaveLength(0);
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

  it('accepts dates via custom parseDate function', () => {
    const customParseDate = (value: string) => {
      if (value === 'last tuesday') return new Date(2026, 2, 17);
      if (value === 'yesterday') return new Date(2026, 2, 24);
      return null;
    };
    const tokens = new Lexer('created:yesterday').tokenize();
    const ast = new Parser(tokens).parse();
    // Without custom parser: invalid
    expect(new Validator(FIELDS).validate(ast)).toHaveLength(1);
    // With custom parser: valid
    expect(new Validator(FIELDS).validate(ast, undefined, customParseDate)).toHaveLength(0);
  });

  it('custom parseDate applies to range bounds', () => {
    const customParseDate = (value: string) => {
      if (value === 'yesterday') return new Date(2026, 2, 24);
      return null;
    };
    const tokens = new Lexer('created:[yesterday TO now]').tokenize();
    const ast = new Parser(tokens).parse();
    // Without custom parser: "yesterday" is invalid
    const errorsWithout = new Validator(FIELDS).validate(ast);
    expect(errorsWithout.some(e => e.message.includes('not a valid date'))).toBe(true);
    // With custom parser: "yesterday" is valid, "now" is always valid
    expect(new Validator(FIELDS).validate(ast, undefined, customParseDate)).toHaveLength(0);
  });

  it('custom parseDate applies inside field groups', () => {
    const customParseDate = (value: string) => {
      if (value === 'yesterday') return new Date(2026, 2, 24);
      return null;
    };
    const tokens = new Lexer('created:(yesterday)').tokenize();
    const ast = new Parser(tokens).parse();
    expect(new Validator(FIELDS).validate(ast)).toHaveLength(1);
    expect(new Validator(FIELDS).validate(ast, undefined, customParseDate)).toHaveLength(0);
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

  it('runs custom validateValue callback', () => {
    const errors = validate('rating:10', ratingValidator);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('between 1 and 5');
  });

  it('passes custom validateValue for valid value', () => {
    expect(validate('rating:3', ratingValidator)).toHaveLength(0);
  });

  it('validates nested boolean expressions', () => {
    const errors = validate('status:active AND unknown:x');
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('unknown');
  });

  it('validates inside groups', () => {
    const errors = validate('(price:abc)');
    expect(errors).toHaveLength(1);
  });

  it('validates inside NOT', () => {
    const errors = validate('NOT price:abc');
    expect(errors).toHaveLength(1);
  });

  it('flags missing value after field colon', () => {
    const errors = validate('status:');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "status:"');
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

describe('Star (*) as field name', () => {
  it('produces no errors for *:value', () => {
    expect(validate('*:value')).toHaveLength(0);
  });

  it('produces no errors for *:*', () => {
    expect(validate('*:*')).toHaveLength(0);
  });

  it('produces no errors for *:(a OR b)', () => {
    expect(validate('*:(a OR b)')).toHaveLength(0);
  });
});

describe('Group boost validation', () => {
  it('accepts positive boost on group', () => {
    expect(validate('(status:active OR status:inactive)^2')).toHaveLength(0);
  });

  it('flags boost <= 0 on group', () => {
    const errors = validate('(status:active)^0');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Boost value must be positive');
  });

  it('accepts positive boost on field group', () => {
    expect(validate('status:(active OR inactive)^3')).toHaveLength(0);
  });

  it('flags boost <= 0 on field group', () => {
    const errors = validate('status:(active)^0');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Boost value must be positive');
  });
});

describe('Range validation', () => {
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

  it('accepts number range with valid bounds', () => {
    expect(validate('price:[10 TO 100]')).toHaveLength(0);
  });

  it('flags non-numeric bounds on number field', () => {
    const errors = validate('price:[abc TO def]');
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('Range start');
    expect(errors[1].message).toContain('Range end');
  });

  it('accepts string field range (lexicographic)', () => {
    expect(validate('name:[abc TO def]')).toHaveLength(0);
  });

  it('flags unknown field in range', () => {
    const errors = validate('unknown:[1 TO 10]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown field');
  });

  it('accepts wildcard bounds', () => {
    expect(validate('price:[* TO 100]')).toHaveLength(0);
    expect(validate('price:[100 TO *]')).toHaveLength(0);
  });

  it('flags boolean field range', () => {
    const errors = validate('is_vip:[true TO false]');
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('not supported for boolean');
  });
});

describe('Modifier validation', () => {
  it('accepts valid fuzzy value (0-2)', () => {
    expect(validate('name:john~1')).toHaveLength(0);
    expect(validate('name:john~0')).toHaveLength(0);
    expect(validate('name:john~2')).toHaveLength(0);
  });

  it('flags fuzzy value > 2', () => {
    const errors = validate('name:john~5');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Fuzzy edit distance');
    expect(errors[0].message).toContain('0, 1, or 2');
  });

  it('accepts valid boost value', () => {
    expect(validate('name:john^2')).toHaveLength(0);
    expect(validate('name:john^1.5')).toHaveLength(0);
  });

  it('flags boost value <= 0', () => {
    const errors = validate('name:john^0');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Boost value must be positive');
  });

  it('flags fuzzy > 2 on bare term', () => {
    const errors = validate('hello~3');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Fuzzy edit distance');
  });

  it('accepts valid proximity on bare quoted phrase', () => {
    expect(validate('"hello world"~5')).toHaveLength(0);
  });

  it('accepts combined fuzzy + boost', () => {
    expect(validate('name:john~1^2')).toHaveLength(0);
  });
});

describe('Field-scoped group validation', () => {
  it('validates each value in field:(a b c) against the field type', () => {
    const errors = validate('created:(a b c)');
    expect(errors).toHaveLength(3);
    expect(errors[0].message).toContain('not a valid date');
    expect(errors[1].message).toContain('not a valid date');
    expect(errors[2].message).toContain('not a valid date');
  });

  it('accepts valid values in field group', () => {
    expect(validate('created:(2024-01-01 2024-06-15)')).toHaveLength(0);
  });

  it('accepts valid values with OR', () => {
    expect(validate('status:(active OR inactive)')).toHaveLength(0);
  });

  it('does not validate enum values in group (autocomplete only)', () => {
    expect(validate('status:(active OR bogus)')).toHaveLength(0);
  });

  it('flags unknown field in group', () => {
    const errors = validate('unknown:(a b)');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Unknown field');
  });

  it('validates nested groups recursively', () => {
    const errors = validate('created:((a OR b) AND c)');
    expect(errors).toHaveLength(3);
    for (const e of errors) {
      expect(e.message).toContain('not a valid date');
    }
  });

  it('validates NOT inside group', () => {
    const errors = validate('created:(NOT invalid)');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid date');
  });

  it('validates number field group', () => {
    const errors = validate('price:(abc 100 xyz)');
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('not a valid number');
    expect(errors[1].message).toContain('not a valid number');
  });

  it('accepts empty field group without errors', () => {
    expect(validate('created:()')).toHaveLength(0);
  });

  it('accepts relative dates in group', () => {
    expect(validate('created:(now now-7d now-1d/d)')).toHaveLength(0);
  });

  it('accepts range value inside field group', () => {
    expect(validate('created:([now-1d TO now])')).toHaveLength(0);
  });

  it('accepts {range} inside field group', () => {
    expect(validate('created:({now-30d TO now})')).toHaveLength(0);
  });

  it('flags invalid range inside field group', () => {
    const errors = validate('created:([invalid TO now])');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Range start');
  });

  it('accepts multiple ranges in field group', () => {
    expect(validate('created:([now-7d TO now] OR [now-30d TO now-7d])')).toHaveLength(0);
  });
});

describe('Ambiguous precedence warnings', () => {
  it('warns on mixed AND/OR without parens', () => {
    const errors = validate('a AND b OR c');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('Ambiguous precedence');
  });

  it('does not warn on same operator (AND only)', () => {
    const errors = validate('a AND b AND c');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('does not warn on same operator (OR only)', () => {
    const errors = validate('a OR b OR c');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('does not warn when parens clarify precedence', () => {
    const errors = validate('(a AND b) OR c');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('warns on longer mixed chain', () => {
    const errors = validate('a AND b OR c AND d');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(1);
  });

  it('ambiguity warning coexists with field errors', () => {
    const errors = validate('unknown:x AND b OR c');
    const fieldErrors = errors.filter(e => !e.severity || e.severity === 'error');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(fieldErrors.length).toBeGreaterThanOrEqual(1);
    expect(warnings).toHaveLength(1);
  });

  it('does not warn for single boolean op', () => {
    const errors = validate('a AND b');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(0);
  });

  it('warns on nested ambiguity inside group', () => {
    const errors = validate('(a AND b OR c)');
    const warnings = errors.filter(e => e.severity === 'warning');
    expect(warnings).toHaveLength(1);
  });

  describe('field aliases', () => {
    const ALIASED_FIELDS: FieldConfig[] = [
      { name: 'name', type: 'string', aliases: ['contact_name', 'full_name'] },
      { name: 'price', type: 'number', aliases: ['cost'] },
      { name: 'status', type: 'string' },
    ];

    function validateAliased(input: string) {
      const tokens = new Lexer(input).tokenize();
      const ast = new Parser(tokens).parse();
      return new Validator(ALIASED_FIELDS).validate(ast);
    }

    it('allows field alias without unknown field error', () => {
      expect(validateAliased('contact_name:John')).toHaveLength(0);
    });

    it('allows multiple aliases for the same field', () => {
      expect(validateAliased('full_name:Jane')).toHaveLength(0);
    });

    it('validates alias values using canonical field type', () => {
      expect(validateAliased('cost:abc')).toHaveLength(1);
      expect(validateAliased('cost:abc')[0].message).toContain('not a valid number');
    });

    it('still reports unknown for fields with no alias match', () => {
      const errors = validateAliased('unknown:value');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Unknown field');
    });

    it('validates alias in field group', () => {
      expect(validateAliased('contact_name:(a b)')).toHaveLength(0);
    });

    it('reports unknown field group for non-aliased name', () => {
      const errors = validateAliased('unknown:(a b)');
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Per-bound range validation offsets', () => {
  it('positions error on invalid range start, not entire range', () => {
    //                   0123456789012345678901234567
    const input =      'created:[invalid TO now]';
    const errors = validate(input);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Range start');
    // "invalid" is at positions 9-16
    expect(errors[0].start).toBe(9);
    expect(errors[0].end).toBe(16);
  });

  it('positions error on invalid range end, not entire range', () => {
    //                   01234567890123456789012345
    const input =      'created:[now TO invalid]';
    const errors = validate(input);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Range end');
    // "invalid" is at positions 16-23
    expect(errors[0].start).toBe(16);
    expect(errors[0].end).toBe(23);
  });

  it('positions errors on both invalid bounds independently', () => {
    //                   0123456789012345678901234567890123
    const input =      'price:[abc TO def]';
    const errors = validate(input);
    expect(errors).toHaveLength(2);
    // "abc" at 7-10
    expect(errors[0].start).toBe(7);
    expect(errors[0].end).toBe(10);
    // "def" at 14-17
    expect(errors[1].start).toBe(14);
    expect(errors[1].end).toBe(17);
  });

  it('handles quoted bounds offsets correctly', () => {
    //                   0123456789012345678901234567890123456789
    const input =      'created:["invalid" TO now]';
    const errors = validate(input);
    expect(errors).toHaveLength(1);
    // Quoted "invalid" spans 9-18 including quotes (9 chars)
    expect(errors[0].start).toBe(9);
    expect(errors[0].end).toBe(18);
  });

  it('positions error on range bounds with extra whitespace', () => {
    //                   0123456789012345678901234567890
    const input =      'created:[  invalid  TO  now  ]';
    const errors = validate(input);
    expect(errors).toHaveLength(1);
    // "invalid" with trimming: starts at 11, ends at 18
    expect(errors[0].start).toBe(11);
    expect(errors[0].end).toBe(18);
  });
});

describe('ValidateValueContext in validateValue callback', () => {
  it('passes field_value context for field:value', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const fields: FieldConfig[] = [{ name: 'rating', type: 'number' }];
    const tokens = new Lexer('rating:5').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(fields).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '5',
      position: 'field_value',
      fieldName: 'rating',
      quoted: false,
    }));
  });

  it('passes range_start and range_end context for range bounds', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const fields: FieldConfig[] = [{ name: 'price', type: 'number' }];
    const tokens = new Lexer('price:[10 TO 100]').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(fields).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '10', position: 'range_start', fieldName: 'price', inclusive: true,
    }));
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '100', position: 'range_end', fieldName: 'price', inclusive: true,
    }));
  });

  it('skips wildcard bounds but validates non-wildcard bound', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const fields: FieldConfig[] = [{ name: 'price', type: 'number' }];
    const tokens = new Lexer('price:[* TO 100]').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(fields).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledTimes(1);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '100', position: 'range_end',
    }));
  });

  it('custom validator can return error on specific range bound', () => {
    const fields: FieldConfig[] = [{ name: 'score', type: 'number' }];
    const validateFn: ValidateValueFn = (ctx) => {
      const n = Number(ctx.value);
      if (ctx.position === 'range_start' && n < 0) return 'Range start must be >= 0';
      if (ctx.position === 'range_end' && n > 100) return 'Range end must be <= 100';
      return null;
    };
    const tokens = new Lexer('score:[-5 TO 200]').tokenize();
    const ast = new Parser(tokens).parse();
    const errors = new Validator(fields).validate(ast, validateFn);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('Range start must be >= 0');
    expect(errors[0].start).toBe(7); // "-5"
    expect(errors[0].end).toBe(9);
    expect(errors[1].message).toBe('Range end must be <= 100');
    expect(errors[1].start).toBe(13); // "200"
    expect(errors[1].end).toBe(16);
  });

  it('passes bare_term context for unfielded terms', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const tokens = new Lexer('hello').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(FIELDS).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: 'hello', position: 'bare_term', quoted: false,
    }));
    expect(validateFn.mock.calls[0][0].fieldName).toBeUndefined();
  });

  it('passes field_group_term context for terms inside field group', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const tokens = new Lexer('status:(active inactive)').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(FIELDS).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledTimes(2);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: 'active', position: 'field_group_term', fieldName: 'status',
    }));
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: 'inactive', position: 'field_group_term', fieldName: 'status',
    }));
  });

  it('passes inclusive=false for exclusive range brackets', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const fields: FieldConfig[] = [{ name: 'price', type: 'number' }];
    const tokens = new Lexer('price:{10 TO 100}').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(fields).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '10', position: 'range_start', inclusive: false,
    }));
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '100', position: 'range_end', inclusive: false,
    }));
  });

  it('passes operator for comparison field values', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const tokens = new Lexer('price:>100').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(FIELDS).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: '100', position: 'field_value', fieldName: 'price', operator: '>',
    }));
  });

  it('does not pass operator for colon-only field values', () => {
    const validateFn = vi.fn((_ctx: ValidateValueContext) => null);
    const tokens = new Lexer('name:hello').tokenize();
    const ast = new Parser(tokens).parse();
    new Validator(FIELDS).validate(ast, validateFn);
    expect(validateFn).toHaveBeenCalledWith(expect.objectContaining({
      value: 'hello', position: 'field_value', fieldName: 'name',
    }));
    expect(validateFn.mock.calls[0][0].operator).toBeUndefined();
  });
});

describe('Validation warnings (ValidationResult return type)', () => {
  const warningFields: FieldConfig[] = [
    { name: 'email', type: 'string' },
    { name: 'score', type: 'number' },
  ];

  const warningValidator: ValidateValueFn = (ctx) => {
    if (ctx.fieldName === 'email') {
      if (ctx.value.includes('*') || ctx.value.includes('?')) return null;
      if (!ctx.value.includes('@')) return { message: 'Not a valid email', severity: 'warning' };
    }
    if (ctx.fieldName === 'score') {
      const n = Number(ctx.value);
      if (n > 1000) return { message: 'Unusually high score', severity: 'warning' };
      if (n < 0) return 'Score cannot be negative'; // plain string = error
    }
    return null;
  };

  function validateW(input: string) {
    const tokens = new Lexer(input).tokenize();
    const ast = new Parser(tokens).parse();
    return new Validator(warningFields).validate(ast, warningValidator);
  }

  it('returns warning severity from validateValue callback', () => {
    const errors = validateW('email:blah');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Not a valid email');
    expect(errors[0].severity).toBe('warning');
  });

  it('returns no warning when value passes validation', () => {
    expect(validateW('email:user@example.com')).toHaveLength(0);
  });

  it('returns no warning when wildcard is present', () => {
    expect(validateW('email:*blah*')).toHaveLength(0);
  });

  it('plain string return is still treated as error', () => {
    const errors = validateW('score:-5');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Score cannot be negative');
    expect(errors[0].severity).toBe('error');
  });

  it('warning from number field validateValue', () => {
    const errors = validateW('score:9999');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Unusually high score');
    expect(errors[0].severity).toBe('warning');
  });

  it('warning on range bounds', () => {
    const rangeFields: FieldConfig[] = [{ name: 'score', type: 'number' }];
    const rangeValidator: ValidateValueFn = (ctx) => {
      const n = Number(ctx.value);
      if (ctx.position === 'range_end' && n > 1000) {
        return { message: 'Upper bound is very high', severity: 'warning' };
      }
      return null;
    };
    const tokens = new Lexer('score:[0 TO 5000]').tokenize();
    const ast = new Parser(tokens).parse();
    const errors = new Validator(rangeFields).validate(ast, rangeValidator);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Upper bound is very high');
    expect(errors[0].severity).toBe('warning');
  });

  it('warning in field group context', () => {
    const tokens = new Lexer('email:(blah)').tokenize();
    const ast = new Parser(tokens).parse();
    const errors = new Validator(warningFields).validate(ast, warningValidator);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Not a valid email');
    expect(errors[0].severity).toBe('warning');
  });
});

describe('Incomplete expression errors', () => {
  it('flags field with missing value: name:', () => {
    const errors = validate('name:');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "name:"');
    expect(errors[0].field).toBe('name');
  });

  it('flags field with whitespace-only value: name:  ', () => {
    const errors = validate('name:  ');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "name:"');
  });

  it('flags comparison op with no value: price:>', () => {
    const errors = validate('price:>');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "price>"');
    expect(errors[0].field).toBe('price');
  });

  it('flags comparison op >=  with no value', () => {
    const errors = validate('price:>=');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "price>="');
  });

  it('flags [TO] — no whitespace so parser treats "TO" as lower, upper is empty', () => {
    const errors = validate('price:[TO]');
    // Parser treats "TO" as the lower bound (no whitespace around TO keyword),
    // so the validator sees: lower="TO" (invalid number) + upper="" (empty bound)
    const messages = errors.map(e => e.message);
    expect(messages).toContain('Missing upper bound in range');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('flags empty range bounds with spaces: [ TO ]', () => {
    const errors = validate('price:[ TO ]');
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('Missing lower bound in range');
    expect(errors[1].message).toBe('Missing upper bound in range');
  });

  it('flags only missing lower bound when upper is present', () => {
    const errors = validate('price:[ TO 100]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing lower bound in range');
  });

  it('flags only missing upper bound when lower is present', () => {
    const errors = validate('price:[0 TO ]');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing upper bound in range');
  });

  it('does not flag wildcard range bounds', () => {
    expect(validate('price:[* TO 100]')).toHaveLength(0);
    expect(validate('price:[0 TO *]')).toHaveLength(0);
    expect(validate('price:[* TO *]')).toHaveLength(0);
  });

  it('does not flag complete field values', () => {
    expect(validate('name:hello')).toHaveLength(0);
    expect(validate('price:>100')).toHaveLength(0);
  });

  it('allows empty groups: field:()', () => {
    expect(validate('name:()')).toHaveLength(0);
  });

  it('flags empty value among valid terms', () => {
    const errors = validate('name:hello AND status:');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('Missing value after "status:"');
  });
});
