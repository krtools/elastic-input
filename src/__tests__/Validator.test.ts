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

  it('flags invalid enum values in group', () => {
    const errors = validate('status:(active OR bogus)');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('not a valid value');
    expect(errors[0].message).toContain('bogus');
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
      { name: 'status', type: 'enum', suggestions: ['active', 'inactive'] },
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
