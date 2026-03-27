import { describe, it, expect } from 'vitest';
import { formatQuery } from '../utils/formatQuery';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';

describe('formatQuery', () => {
  it('returns simple query unchanged', () => {
    expect(formatQuery('status:active')).toBe('status:active');
  });

  it('keeps short AND chain inline', () => {
    expect(formatQuery('status:active AND name:John')).toBe('status:active AND name:John');
  });

  it('breaks top-level AND chain with parens', () => {
    const input = '(status:active OR status:lead) AND deal_value:>5000 AND NOT company:"Umbrella Corp"';
    const expected = [
      '(status:active OR status:lead)',
      'AND deal_value:>5000',
      'AND NOT company:"Umbrella Corp"',
    ].join('\n');
    expect(formatQuery(input)).toBe(expected);
  });

  it('breaks nested groups across lines', () => {
    const input = '((status:active AND deal_value:>10000) OR (status:lead AND tags:enterprise)) AND created:[2024-01-01 TO 2024-12-31]';
    const expected = [
      '(',
      '  (status:active AND deal_value:>10000)',
      '  OR (status:lead AND tags:enterprise)',
      ')',
      'AND created:[2024-01-01 TO 2024-12-31]',
    ].join('\n');
    expect(formatQuery(input)).toBe(expected);
  });

  it('keeps field groups inline', () => {
    expect(formatQuery('status:(active OR lead) AND tags:enterprise'))
      .toBe('status:(active OR lead) AND tags:enterprise');
  });

  it('preserves quoted values', () => {
    expect(formatQuery('name:"John Doe"')).toBe('name:"John Doe"');
  });

  it('preserves boost', () => {
    expect(formatQuery('(status:active)^2 AND name:test')).toBe('(status:active)^2 AND name:test');
  });

  it('preserves fuzzy', () => {
    expect(formatQuery('name:Jhon~2')).toBe('name:Jhon~2');
  });

  it('preserves range', () => {
    expect(formatQuery('price:[10 TO 100]')).toBe('price:[10 TO 100]');
  });

  it('preserves regex', () => {
    expect(formatQuery('/abc[0-9]+/')).toBe('/abc[0-9]+/');
  });

  it('preserves saved search', () => {
    expect(formatQuery('#vip-active AND status:active')).toBe('#vip-active AND status:active');
  });

  it('preserves NOT', () => {
    expect(formatQuery('NOT status:inactive')).toBe('NOT status:inactive');
  });

  it('preserves implicit AND as whitespace by default', () => {
    expect(formatQuery('hello world')).toBe('hello world');
  });

  it('replaces implicit AND with whitespaceOperator when set', () => {
    expect(formatQuery('hello world', { whitespaceOperator: 'AND' })).toBe('hello AND world');
    expect(formatQuery('hello world', { whitespaceOperator: '&&' })).toBe('hello && world');
  });

  it('does not replace explicit AND with whitespaceOperator', () => {
    expect(formatQuery('hello AND world')).toBe('hello AND world');
  });

  it('handles comparison operators', () => {
    expect(formatQuery('price:>100 AND price:<500')).toBe('price:>100 AND price:<500');
  });

  it('handles empty string', () => {
    expect(formatQuery('')).toBe('');
  });

  it('accepts an AST node directly', () => {
    const tokens = new Lexer('status:active AND name:test').tokenize();
    const ast = new Parser(tokens).parse();
    expect(formatQuery(ast!)).toBe('status:active AND name:test');
  });

  it('formats complex multiline query', () => {
    const input = '((level:ERROR OR level:FATAL) AND status_code:>=500 AND duration_ms:>1000) OR (message:"connection refused" AND service:payment-service)';
    const result = formatQuery(input);
    // Should break the outer OR and the inner groups
    expect(result).toContain('OR (');
    expect(result).toContain('\n');
  });

  it('preserves exclusive range brackets', () => {
    expect(formatQuery('price:{10 TO 100}')).toBe('price:{10 TO 100}');
  });

  it('preserves field group boost', () => {
    expect(formatQuery('status:(active OR lead)^3')).toBe('status:(active OR lead)^3');
  });
});
