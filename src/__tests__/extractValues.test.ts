import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { extractValues, ExtractedValue } from '../utils/extractValues';

function extract(input: string): ExtractedValue[] {
  const tokens = new Lexer(input).tokenize();
  const ast = new Parser(tokens).parse();
  return extractValues(ast);
}

describe('extractValues', () => {
  it('returns empty for null AST', () => {
    expect(extractValues(null)).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(extract('')).toEqual([]);
  });

  it('extracts a bare term', () => {
    const vals = extract('urgent');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'term', value: 'urgent', quoted: false });
  });

  it('extracts a quoted bare term', () => {
    const vals = extract('"hello world"');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'term', value: 'hello world', quoted: true });
  });

  it('extracts a field value', () => {
    const vals = extract('status:active');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'active', fieldName: 'status', quoted: false });
  });

  it('extracts a quoted field value', () => {
    const vals = extract('name:"John Doe"');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'John Doe', fieldName: 'name', quoted: true });
  });

  it('extracts comparison operator values', () => {
    const vals = extract('price:>100');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: '100', fieldName: 'price' });
  });

  it('extracts range bounds', () => {
    const vals = extract('age:[18 TO 65]');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'range_lower', value: '18', fieldName: 'age', quoted: false });
    expect(vals[1]).toMatchObject({ kind: 'range_upper', value: '65', fieldName: 'age', quoted: false });
  });

  it('skips wildcard range bounds', () => {
    const vals = extract('price:[* TO 100]');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'range_upper', value: '100', fieldName: 'price' });
  });

  it('extracts field group terms', () => {
    const vals = extract('status:(active OR pending)');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'group_term', value: 'active', fieldName: 'status' });
    expect(vals[1]).toMatchObject({ kind: 'group_term', value: 'pending', fieldName: 'status' });
  });

  it('extracts regex patterns', () => {
    const vals = extract('/foo.*/');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'regex', value: 'foo.*', quoted: false });
  });

  it('extracts values from boolean expressions', () => {
    const vals = extract('status:active AND name:john');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'active', fieldName: 'status' });
    expect(vals[1]).toMatchObject({ kind: 'field_value', value: 'john', fieldName: 'name' });
  });

  it('extracts values from implicit AND', () => {
    const vals = extract('status:active name:john');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'active', fieldName: 'status' });
    expect(vals[1]).toMatchObject({ kind: 'field_value', value: 'john', fieldName: 'name' });
  });

  it('extracts values from parenthesized groups', () => {
    const vals = extract('(status:active OR status:pending)');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'active', fieldName: 'status' });
    expect(vals[1]).toMatchObject({ kind: 'field_value', value: 'pending', fieldName: 'status' });
  });

  it('extracts values through NOT', () => {
    const vals = extract('NOT status:closed');
    expect(vals).toHaveLength(1);
    expect(vals[0]).toMatchObject({ kind: 'field_value', value: 'closed', fieldName: 'status' });
  });

  it('ignores saved searches and history refs', () => {
    const vals = extract('#saved !3');
    expect(vals).toHaveLength(0);
  });

  it('excludes boost and fuzzy markers from values', () => {
    const vals = extract('urgent^2 fuzzy~1');
    expect(vals).toHaveLength(2);
    expect(vals[0]).toMatchObject({ kind: 'term', value: 'urgent' });
    expect(vals[1]).toMatchObject({ kind: 'term', value: 'fuzzy' });
  });

  it('complex query extracts all content values in document order', () => {
    const vals = extract('status:active AND (name:"Jane Doe" OR age:[25 TO 35]) urgent');
    expect(vals.map(v => v.value)).toEqual(['active', 'Jane Doe', '25', '35', 'urgent']);
    expect(vals.map(v => v.kind)).toEqual(['field_value', 'field_value', 'range_lower', 'range_upper', 'term']);
  });

  it('provides correct offsets', () => {
    const vals = extract('status:active');
    expect(vals).toHaveLength(1);
    expect(vals[0].start).toBe(0);
    expect(vals[0].end).toBe(13);
  });

  it('provides correct offsets for range bounds', () => {
    const vals = extract('age:[18 TO 65]');
    expect(vals).toHaveLength(2);
    // lower bound "18"
    expect(vals[0].start).toBe(5);
    expect(vals[0].end).toBe(7);
    // upper bound "65"
    expect(vals[1].start).toBe(11);
    expect(vals[1].end).toBe(13);
  });
});
