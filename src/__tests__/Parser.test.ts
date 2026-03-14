import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { ASTNode, ErrorNode } from '../parser/ast';

function parse(input: string): ASTNode | null {
  const tokens = new Lexer(input).tokenize();
  return new Parser(tokens).parse();
}

function parseWithErrors(input: string): { ast: ASTNode | null; errors: ErrorNode[] } {
  const tokens = new Lexer(input).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, errors: parser.getErrors() };
}

describe('Parser', () => {
  describe('basic expressions', () => {
    it('parses a field:value pair', () => {
      const ast = parse('status:active');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'status',
        operator: ':',
        value: 'active',
        quoted: false,
      });
    });

    it('parses a quoted field value', () => {
      const ast = parse('name:"John Doe"');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'name',
        value: 'John Doe',
        quoted: true,
      });
    });

    it('parses a bare term', () => {
      const ast = parse('hello');
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'hello',
        quoted: false,
      });
    });

    it('parses a quoted bare term', () => {
      const ast = parse('"hello world"');
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'hello world',
        quoted: true,
      });
    });

    it('returns null for empty input', () => {
      expect(parse('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      expect(parse('   ')).toBeNull();
    });
  });

  describe('comparison operators', () => {
    it('parses field:>value', () => {
      const ast = parse('price:>100');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'price',
        operator: '>',
        value: '100',
      });
    });

    it('parses field:>=value', () => {
      const ast = parse('price:>=50');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'price',
        operator: '>=',
        value: '50',
      });
    });

    it('parses field:<value', () => {
      const ast = parse('price:<200');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'price',
        operator: '<',
        value: '200',
      });
    });

    it('parses field:<=value', () => {
      const ast = parse('price:<=99');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'price',
        operator: '<=',
        value: '99',
      });
    });

    it('parses field: with no value as empty FieldValue', () => {
      const ast = parse('status:');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'status',
        value: '',
      });
    });
  });

  describe('boolean expressions', () => {
    it('parses AND', () => {
      const ast = parse('a AND b');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'BareTerm', value: 'a' },
        right: { type: 'BareTerm', value: 'b' },
      });
    });

    it('parses OR', () => {
      const ast = parse('a OR b');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'OR',
        left: { type: 'BareTerm', value: 'a' },
        right: { type: 'BareTerm', value: 'b' },
      });
    });

    it('parses NOT', () => {
      const ast = parse('NOT a');
      expect(ast).toMatchObject({
        type: 'Not',
        expression: { type: 'BareTerm', value: 'a' },
      });
    });

    it('parses implicit AND between adjacent terms', () => {
      const ast = parse('status:active level:ERROR');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'FieldValue', field: 'status', value: 'active' },
        right: { type: 'FieldValue', field: 'level', value: 'ERROR' },
      });
    });

    it('OR has lower precedence than AND', () => {
      // a AND b OR c  =>  (a AND b) OR c
      const ast = parse('a AND b OR c');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'OR',
        left: {
          type: 'BooleanExpr',
          operator: 'AND',
          left: { type: 'BareTerm', value: 'a' },
          right: { type: 'BareTerm', value: 'b' },
        },
        right: { type: 'BareTerm', value: 'c' },
      });
    });

    it('NOT has higher precedence than AND', () => {
      // NOT a AND b  =>  (NOT a) AND b
      const ast = parse('NOT a AND b');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: {
          type: 'Not',
          expression: { type: 'BareTerm', value: 'a' },
        },
        right: { type: 'BareTerm', value: 'b' },
      });
    });
  });

  describe('grouping with parentheses', () => {
    it('parses a grouped expression', () => {
      const ast = parse('(a OR b)');
      expect(ast).toMatchObject({
        type: 'Group',
        expression: {
          type: 'BooleanExpr',
          operator: 'OR',
          left: { type: 'BareTerm', value: 'a' },
          right: { type: 'BareTerm', value: 'b' },
        },
      });
    });

    it('parses group overriding precedence', () => {
      // a AND (b OR c)  =>  AND(a, Group(OR(b, c)))
      const ast = parse('a AND (b OR c)');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'BareTerm', value: 'a' },
        right: {
          type: 'Group',
          expression: {
            type: 'BooleanExpr',
            operator: 'OR',
          },
        },
      });
    });

    it('parses nested groups', () => {
      const ast = parse('((a))');
      expect(ast).toMatchObject({
        type: 'Group',
        expression: {
          type: 'Group',
          expression: { type: 'BareTerm', value: 'a' },
        },
      });
    });

    it('parses field:value inside parens', () => {
      const ast = parse('(status:active)');
      expect(ast).toMatchObject({
        type: 'Group',
        expression: {
          type: 'FieldValue',
          field: 'status',
          value: 'active',
        },
      });
    });

    it('parses complex expression with parens and field:value', () => {
      const ast = parse('(status:active AND level:ERROR) OR service:auth');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'OR',
        left: {
          type: 'Group',
          expression: {
            type: 'BooleanExpr',
            operator: 'AND',
            left: { type: 'FieldValue', field: 'status', value: 'active' },
            right: { type: 'FieldValue', field: 'level', value: 'ERROR' },
          },
        },
        right: { type: 'FieldValue', field: 'service', value: 'auth' },
      });
    });

    it('handles empty parens gracefully', () => {
      const ast = parse('()');
      expect(ast).toMatchObject({ type: 'Group' });
    });

    it('handles unclosed parens gracefully', () => {
      const ast = parse('(a OR b');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('Group');
    });
  });

  describe('special tokens', () => {
    it('parses saved search', () => {
      const ast = parse('#mySearch');
      expect(ast).toMatchObject({
        type: 'SavedSearch',
        name: 'mySearch',
      });
    });

    it('parses history ref', () => {
      const ast = parse('!recent');
      expect(ast).toMatchObject({
        type: 'HistoryRef',
        ref: 'recent',
      });
    });

    it('parses saved search combined with other terms', () => {
      const ast = parse('#mySearch AND status:active');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'SavedSearch', name: 'mySearch' },
        right: { type: 'FieldValue', field: 'status', value: 'active' },
      });
    });
  });

  describe('prefix operators', () => {
    it('parses -field:value as NOT', () => {
      const ast = parse('-status:active');
      expect(ast).toMatchObject({
        type: 'Not',
        expression: {
          type: 'FieldValue',
          field: 'status',
          value: 'active',
        },
      });
    });

    it('parses +field:value (required)', () => {
      const ast = parse('+status:active');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'status',
        value: 'active',
      });
    });

    it('parses - before a group', () => {
      const ast = parse('-(a OR b)');
      expect(ast).toMatchObject({
        type: 'Not',
        expression: {
          type: 'Group',
          expression: {
            type: 'BooleanExpr',
            operator: 'OR',
          },
        },
      });
    });

    it('parses - before quoted string', () => {
      const ast = parse('-"error message"');
      expect(ast).toMatchObject({
        type: 'Not',
        expression: {
          type: 'BareTerm',
          value: 'error message',
          quoted: true,
        },
      });
    });

    it('parses prefix op combined with boolean', () => {
      const ast = parse('a AND -b');
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'BareTerm', value: 'a' },
        right: {
          type: 'Not',
          expression: { type: 'BareTerm', value: 'b' },
        },
      });
    });

    it('preserves hyphenated field names', () => {
      const ast = parse('last-contact:2024');
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'last-contact',
        value: '2024',
      });
    });
  });

  describe('offset tracking', () => {
    it('tracks start and end offsets for field:value', () => {
      const ast = parse('status:active')!;
      expect(ast.start).toBe(0);
      expect(ast.end).toBe(13);
    });

    it('tracks offsets in boolean expression', () => {
      const ast = parse('a AND b')!;
      expect(ast.start).toBe(0);
      expect(ast.end).toBe(7);
    });

    it('tracks offsets with prefix operator', () => {
      const ast = parse('-status:active')!;
      expect(ast.start).toBe(0);
      expect(ast.end).toBe(14);
    });
  });

  describe('&& and || aliases', () => {
    it('parses a && b same as a AND b', () => {
      const ast = parse('a && b')!;
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
      });
    });

    it('parses a || b same as a OR b', () => {
      const ast = parse('a || b')!;
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'OR',
      });
    });

    it('respects precedence: a && b || c', () => {
      const ast = parse('a && b || c')!;
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'OR',
        left: {
          type: 'BooleanExpr',
          operator: 'AND',
        },
      });
    });

    it('works with field:value pairs', () => {
      const ast = parse('status:active && level:ERROR')!;
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'FieldValue', field: 'status' },
        right: { type: 'FieldValue', field: 'level' },
      });
    });
  });

  describe('fuzzy operator (~N)', () => {
    it('parses bare term with fuzzy', () => {
      const ast = parse('abc~1')!;
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'abc',
        fuzzy: 1,
      });
    });

    it('parses fuzzy 0', () => {
      const ast = parse('abc~0')!;
      expect(ast).toMatchObject({ type: 'BareTerm', fuzzy: 0 });
    });

    it('parses fuzzy without number as 0', () => {
      const ast = parse('abc~')!;
      expect(ast).toMatchObject({ type: 'BareTerm', fuzzy: 0 });
    });

    it('tracks end offset including tilde', () => {
      const ast = parse('abc~2')!;
      expect(ast.end).toBe(5);
    });

    it('parses field:value~N', () => {
      const ast = parse('name:john~1')!;
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'name',
        value: 'john',
        fuzzy: 1,
      });
    });
  });

  describe('proximity operator (~N on quoted)', () => {
    it('parses quoted phrase with proximity', () => {
      const ast = parse('"hello world"~5')!;
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'hello world',
        quoted: true,
        proximity: 5,
      });
    });

    it('proximity on quoted field value', () => {
      const ast = parse('title:"quick fox"~3')!;
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'title',
        quoted: true,
        proximity: 3,
      });
    });
  });

  describe('boost operator (^N)', () => {
    it('parses bare term with boost', () => {
      const ast = parse('abc^2')!;
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'abc',
        boost: 2,
      });
    });

    it('parses decimal boost', () => {
      const ast = parse('abc^1.5')!;
      expect(ast).toMatchObject({ type: 'BareTerm', boost: 1.5 });
    });

    it('parses field:value^N', () => {
      const ast = parse('status:active^3')!;
      expect(ast).toMatchObject({
        type: 'FieldValue',
        field: 'status',
        value: 'active',
        boost: 3,
      });
    });

    it('tracks end offset including caret', () => {
      const ast = parse('abc^2')!;
      expect(ast.end).toBe(5);
    });
  });

  describe('combined modifiers', () => {
    it('parses fuzzy + boost: abc~1^2', () => {
      const ast = parse('abc~1^2')!;
      expect(ast).toMatchObject({
        type: 'BareTerm',
        value: 'abc',
        fuzzy: 1,
        boost: 2,
      });
    });

    it('parses proximity + boost: "phrase"~5^2', () => {
      const ast = parse('"hello world"~5^2')!;
      expect(ast).toMatchObject({
        type: 'BareTerm',
        quoted: true,
        proximity: 5,
        boost: 2,
      });
    });
  });

  describe('regex literals', () => {
    it('parses /pattern/ as RegexNode', () => {
      const ast = parse('/pattern/')!;
      expect(ast).toMatchObject({
        type: 'Regex',
        pattern: 'pattern',
      });
    });

    it('parses field:/joh?n/ as RegexNode with field start', () => {
      const ast = parse('field:/joh?n/')!;
      expect(ast).toMatchObject({
        type: 'Regex',
        pattern: 'joh?n',
        start: 0,
      });
    });

    it('tracks offsets for regex node', () => {
      const ast = parse('/abc/')!;
      expect(ast.start).toBe(0);
      expect(ast.end).toBe(5);
    });
  });

  describe('group boost', () => {
    it('parses (a OR b)^2 as Group with boost', () => {
      const ast = parse('(a OR b)^2')!;
      expect(ast).toMatchObject({
        type: 'Group',
        boost: 2,
        expression: {
          type: 'BooleanExpr',
          operator: 'OR',
        },
      });
    });

    it('tracks end offset including boost on group', () => {
      const ast = parse('(a OR b)^2')!;
      expect(ast.end).toBe(10);
    });

    it('parses field:(a b)^3 as FieldGroup with boost', () => {
      const ast = parse('field:(a b)^3')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'field',
        boost: 3,
      });
      expect(ast.end).toBe(13);
    });

    it('parses decimal boost on group', () => {
      const ast = parse('(a)^1.5')!;
      expect(ast).toMatchObject({
        type: 'Group',
        boost: 1.5,
      });
    });
  });

  describe('syntax errors', () => {
    it('reports missing closing parenthesis for groups', () => {
      const { ast, errors } = parseWithErrors('(a b c');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('Group');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing parenthesis',
        start: 0,
        end: 1,
      });
    });

    it('reports missing closing parenthesis for field groups', () => {
      const { ast, errors } = parseWithErrors('field:(a b');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('FieldGroup');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing parenthesis',
      });
    });

    it('reports unexpected closing parenthesis', () => {
      const { ast, errors } = parseWithErrors('a ) b');
      expect(ast).not.toBeNull();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Unexpected closing parenthesis',
      });
    });

    it('reports missing search term after AND', () => {
      const { ast, errors } = parseWithErrors('a AND');
      expect(ast).not.toBeNull();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing search term after AND',
      });
    });

    it('reports missing search term after OR', () => {
      const { ast, errors } = parseWithErrors('a OR');
      expect(ast).not.toBeNull();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing search term after OR',
      });
    });

    it('reports missing search term after NOT (alone)', () => {
      const { errors } = parseWithErrors('NOT');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing search term after NOT',
      });
    });

    it('reports unexpected AND at start', () => {
      const { ast, errors } = parseWithErrors('AND a');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('BareTerm');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Unexpected AND',
      });
    });

    it('reports unexpected AND after OR', () => {
      const { ast, errors } = parseWithErrors('a OR AND b');
      expect(ast).not.toBeNull();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Unexpected AND',
      });
    });

    it('produces no errors for valid queries', () => {
      const validQueries = [
        'a AND b',
        'a OR b',
        'NOT a',
        '(a OR b)',
        'field:(a b)',
        'status:active AND level:ERROR',
        'a b c',
        '"hello world"',
      ];
      for (const q of validQueries) {
        const { errors } = parseWithErrors(q);
        expect(errors).toHaveLength(0);
      }
    });

    it('does not flag empty groups', () => {
      const { errors } = parseWithErrors('()');
      expect(errors).toHaveLength(0);
    });

    it('reports unclosed double quote on bare term', () => {
      const { ast, errors } = parseWithErrors('"hello world');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('BareTerm');
      expect((ast as any).value).toBe('hello world');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing quote',
        start: 0,
        end: 1,
      });
    });

    it('reports unclosed single quote on bare term', () => {
      const { ast, errors } = parseWithErrors("'hello world");
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('BareTerm');
      expect((ast as any).value).toBe('hello world');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing quote',
        start: 0,
        end: 1,
      });
    });

    it('reports unclosed quote on field value', () => {
      const { ast, errors } = parseWithErrors('status:"hello world');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('FieldValue');
      expect((ast as any).value).toBe('hello world');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing quote',
      });
    });

    it('does not report error for closed quotes', () => {
      const { errors } = parseWithErrors('"hello world"');
      expect(errors).toHaveLength(0);
    });

    it('does not report error for closed single quotes', () => {
      const { errors } = parseWithErrors("'hello world'");
      expect(errors).toHaveLength(0);
    });

    it('reports unclosed quote in compound query', () => {
      const { errors } = parseWithErrors('a AND "hello');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        message: 'Missing closing quote',
      });
    });
  });

  describe('field-scoped groups', () => {
    it('parses field:(a b c) as FieldGroup', () => {
      const ast = parse('created:(a b c)')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'created',
        expression: {
          type: 'BooleanExpr',
          operator: 'AND',
        },
      });
    });

    it('parses field:(a OR b) as FieldGroup with OR', () => {
      const ast = parse('status:(active OR inactive)')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'status',
        expression: {
          type: 'BooleanExpr',
          operator: 'OR',
          left: { type: 'BareTerm', value: 'active' },
          right: { type: 'BareTerm', value: 'inactive' },
        },
      });
    });

    it('parses field:(single) as FieldGroup with one term', () => {
      const ast = parse('status:(active)')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'status',
        expression: { type: 'BareTerm', value: 'active' },
      });
    });

    it('parses empty field group field:()', () => {
      const ast = parse('status:()')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'status',
        expression: { type: 'BareTerm', value: '' },
      });
    });

    it('parses field group with NOT inside', () => {
      const ast = parse('status:(NOT active)')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'status',
        expression: {
          type: 'Not',
          expression: { type: 'BareTerm', value: 'active' },
        },
      });
    });

    it('parses nested groups: field:((a OR b) AND c)', () => {
      const ast = parse('status:((a OR b) AND c)')!;
      expect(ast).toMatchObject({
        type: 'FieldGroup',
        field: 'status',
        expression: {
          type: 'BooleanExpr',
          operator: 'AND',
          left: {
            type: 'Group',
            expression: {
              type: 'BooleanExpr',
              operator: 'OR',
            },
          },
          right: { type: 'BareTerm', value: 'c' },
        },
      });
    });

    it('tracks offsets for field group', () => {
      const ast = parse('created:(a b)')!;
      expect(ast.start).toBe(0);
      expect(ast.end).toBe(13);
    });

    it('parses field group combined with other terms', () => {
      const ast = parse('status:(a OR b) AND price:>100')!;
      expect(ast).toMatchObject({
        type: 'BooleanExpr',
        operator: 'AND',
        left: { type: 'FieldGroup', field: 'status' },
        right: { type: 'FieldValue', field: 'price' },
      });
    });
  });
});
