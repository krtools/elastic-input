import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { buildHighlightedHTML } from '../components/HighlightedContent';
import { Parser } from '../parser/Parser';
import { Validator } from '../validation/Validator';

function parse(input: string) {
  const tokens = new Lexer(input).tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, errors: parser.getErrors(), tokens };
}

const FIELDS = [
  { name: 'status', type: 'enum' as const, suggestions: ['active', 'inactive'] },
  { name: 'name', type: 'string' as const },
  { name: 'price', type: 'number' as const },
];

describe('multiline queries', () => {
  describe('highlighted HTML', () => {
    it('converts newlines to <br> in whitespace tokens', () => {
      const tokens = new Lexer('a\nb').tokenize();
      const html = buildHighlightedHTML(tokens);
      expect(html).toContain('<br>');
      expect(html).not.toContain('\n');
    });

    it('converts multiple newlines to multiple <br>', () => {
      const tokens = new Lexer('a\n\nb').tokenize();
      const html = buildHighlightedHTML(tokens);
      expect(html.match(/<br>/g)?.length).toBe(2);
    });

    it('handles newline after field:value', () => {
      const tokens = new Lexer('status:active\nname:John').tokenize();
      const html = buildHighlightedHTML(tokens);
      expect(html).toContain('<br>');
    });
  });

  describe('parsing', () => {
    it('parses multiline queries correctly', () => {
      const { ast } = parse('status:active\nAND name:John');
      expect(ast).not.toBeNull();
      expect(ast!.type).toBe('BooleanExpr');
    });

    it('parses implicit AND across lines', () => {
      const { ast } = parse('status:active\nname:John');
      expect(ast).not.toBeNull();
    });
  });

  describe('validation', () => {
    it('validates multiline queries same as single-line', () => {
      const { ast, errors: parseErrors } = parse('status:active\nAND name:John');
      const validator = new Validator(FIELDS);
      const errors = validator.validate(ast);
      expect(errors).toHaveLength(0);
    });

    it('reports errors on correct line positions', () => {
      const { ast, errors: parseErrors } = parse('status:active\nunknown:value');
      const validator = new Validator(FIELDS);
      const errors = validator.validate(ast);
      expect(errors.length).toBeGreaterThan(0);
      // The unknown field starts at offset 14 (after "status:active\n")
      expect(errors[0].start).toBe(14);
    });
  });
});
