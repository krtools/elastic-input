import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { getExpansionRanges } from '../utils/expandSelection';

function expand(input: string, offset: number) {
  const tokens = new Lexer(input).tokenize();
  const ast = new Parser(tokens).parse();
  return getExpansionRanges(ast, tokens, offset);
}

describe('getExpansionRanges', () => {
  describe('simple expressions', () => {
    it('bare term returns token then root', () => {
      const ranges = expand('hello', 2);
      expect(ranges).toEqual([
        { start: 0, end: 5 }, // BareTerm token + AST node (same range, deduped)
      ]);
    });

    it('field value returns value token then field:value node', () => {
      const ranges = expand('status:active', 9);
      expect(ranges).toEqual([
        { start: 7, end: 13 }, // VALUE token "active"
        { start: 0, end: 13 }, // FieldValue node "status:active"
      ]);
    });

    it('quoted value returns token then node', () => {
      const ranges = expand('name:"John Doe"', 10);
      expect(ranges).toEqual([
        { start: 5, end: 15 }, // QUOTED_VALUE token
        { start: 0, end: 15 }, // FieldValue node
      ]);
    });
  });

  describe('boolean expressions', () => {
    it('value in AND expression returns value, field:value, then full expr', () => {
      const ranges = expand('status:active AND name:john', 9);
      expect(ranges).toEqual([
        { start: 7, end: 13 },  // VALUE "active"
        { start: 0, end: 13 },  // FieldValue "status:active"
        { start: 0, end: 27 },  // BooleanExpr (root)
      ]);
    });

    it('right side of AND returns its own hierarchy', () => {
      // "name" FIELD_NAME [18,22), ":" COLON [22,23), "john" VALUE [23,27)
      const ranges = expand('status:active AND name:john', 24);
      expect(ranges).toEqual([
        { start: 23, end: 27 }, // VALUE "john"
        { start: 18, end: 27 }, // FieldValue "name:john"
        { start: 0, end: 27 },  // BooleanExpr (root)
      ]);
    });
  });

  describe('grouped expressions', () => {
    it('value inside group returns value, field:value, boolean, group, root', () => {
      // (status:lead OR status:prospect) AND name:john
      const input = '(status:lead OR status:prospect) AND name:john';
      const ranges = expand(input, 9);
      expect(ranges[0]).toEqual({ start: 8, end: 12 }); // VALUE "lead"
      expect(ranges[1]).toEqual({ start: 1, end: 12 }); // FieldValue "status:lead"
      // BooleanExpr(OR) inside group
      expect(ranges[2].start).toBe(1);
      // Group node (includes parens)
      const groupRange = ranges.find(r => r.start === 0 && r.end < input.length);
      expect(groupRange).toBeDefined();
      // Root (entire expression)
      expect(ranges[ranges.length - 1]).toEqual({ start: 0, end: input.length });
    });

    it('standalone group: value, inner expr, group', () => {
      const ranges = expand('(a OR b)', 1);
      expect(ranges[0]).toEqual({ start: 1, end: 2 }); // VALUE "a"
      // BooleanExpr(OR)
      expect(ranges[1]).toEqual({ start: 1, end: 7 });
      // Group
      expect(ranges[2]).toEqual({ start: 0, end: 8 });
    });
  });

  describe('negation', () => {
    it('value inside NOT returns value, field:value, not node', () => {
      const ranges = expand('-status:active', 10);
      expect(ranges).toEqual([
        { start: 8, end: 14 }, // VALUE "active"
        { start: 1, end: 14 }, // FieldValue "status:active"
        { start: 0, end: 14 }, // Not node
      ]);
    });
  });

  describe('field groups', () => {
    it('value in field group returns value, inner expr, field group', () => {
      const ranges = expand('status:(active OR inactive)', 9);
      expect(ranges[0]).toEqual({ start: 8, end: 14 }); // VALUE "active"
      // BooleanExpr inside
      const boolRange = ranges.find(r => r.start === 8 && r.end > 14);
      expect(boolRange).toBeDefined();
      // FieldGroup (entire)
      expect(ranges[ranges.length - 1]).toEqual({ start: 0, end: 27 });
    });
  });

  describe('non-expandable positions', () => {
    it('cursor in whitespace has no token level, only AST level', () => {
      // offset 2 in "a  AND  b" is whitespace — no expandable token,
      // but the BooleanExpr AST node still covers it
      const ranges = expand('a  AND  b', 2);
      expect(ranges.length).toBe(1);
      expect(ranges[0]).toEqual({ start: 0, end: 9 }); // BooleanExpr (root)
    });

    it('cursor on operator returns only boolean expr if it covers offset', () => {
      // AND at [2,5] in "a AND b"
      const ranges = expand('a AND b', 3);
      // offset 3 is inside AND token (not expandable), but inside BooleanExpr node
      expect(ranges.length).toBeGreaterThanOrEqual(1);
      expect(ranges[0]).toEqual({ start: 0, end: 7 });
    });
  });

  describe('deduplication', () => {
    it('single bare term deduplicates token and AST node ranges', () => {
      const ranges = expand('hello', 2);
      // Both token [0,5] and BareTerm [0,5] → deduped to one entry
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, end: 5 });
    });
  });

  describe('ranges and special tokens', () => {
    it('field name is expandable and leads to FieldValue', () => {
      const ranges = expand('status:active', 3);
      expect(ranges[0]).toEqual({ start: 0, end: 6 }); // FIELD_NAME token
      expect(ranges[1]).toEqual({ start: 0, end: 13 }); // FieldValue node
    });

    it('range token is expandable', () => {
      const ranges = expand('price:[10 TO 100]', 12);
      expect(ranges[0]).toEqual({ start: 6, end: 17 }); // RANGE token
    });
  });
});
