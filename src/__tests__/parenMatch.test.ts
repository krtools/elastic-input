import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { findMatchingParen } from '../highlighting/parenMatch';

function tokensFor(input: string) {
  return new Lexer(input).tokenize();
}

describe('findMatchingParen', () => {
  describe('basic matching', () => {
    it('matches ( when cursor is after it (left of caret)', () => {
      // (a OR b)  cursor at pos 1 (right after '(')
      const tokens = tokensFor('(a OR b)');
      const match = findMatchingParen(tokens, 1);
      expect(match).toEqual({ openStart: 0, closeStart: 7 });
    });

    it('matches ) when cursor is after it', () => {
      // (a OR b)  cursor at pos 8 (right after ')')
      const tokens = tokensFor('(a OR b)');
      const match = findMatchingParen(tokens, 8);
      expect(match).toEqual({ openStart: 0, closeStart: 7 });
    });

    it('matches ( when cursor is before it (right of caret)', () => {
      // (a OR b)  cursor at pos 0 (right before '(')
      const tokens = tokensFor('(a OR b)');
      const match = findMatchingParen(tokens, 0);
      expect(match).toEqual({ openStart: 0, closeStart: 7 });
    });

    it('matches ) when cursor is before it', () => {
      // (a OR b)  cursor at pos 7 (right before ')')
      const tokens = tokensFor('(a OR b)');
      const match = findMatchingParen(tokens, 7);
      expect(match).toEqual({ openStart: 0, closeStart: 7 });
    });
  });

  describe('nested parens', () => {
    it('matches inner parens when cursor is after inner (', () => {
      // ((a))  inner ( is at pos 1, inner ) is at pos 3
      const tokens = tokensFor('((a))');
      const match = findMatchingParen(tokens, 2); // after inner (
      expect(match).toEqual({ openStart: 1, closeStart: 3 });
    });

    it('matches outer parens when cursor is after outer (', () => {
      // ((a))  outer ( is at pos 0, outer ) is at pos 4
      const tokens = tokensFor('((a))');
      const match = findMatchingParen(tokens, 1); // after outer (
      expect(match).toEqual({ openStart: 0, closeStart: 4 });
    });

    it('matches inner ) correctly', () => {
      const tokens = tokensFor('((a))');
      const match = findMatchingParen(tokens, 4); // after inner )
      expect(match).toEqual({ openStart: 1, closeStart: 3 });
    });
  });

  describe('priority: "after" beats "before"', () => {
    it('cursor between )( highlights the ) on the left', () => {
      // (a)(b)  cursor at pos 3 — after ) at pos 2, before ( at pos 3
      const tokens = tokensFor('(a)(b)');
      const match = findMatchingParen(tokens, 3);
      // ) at pos 2 (end=3), so "after" matches first
      expect(match).toEqual({ openStart: 0, closeStart: 2 });
    });
  });

  describe('unmatched parens', () => {
    it('returns null for unmatched (', () => {
      const tokens = tokensFor('(a b');
      const match = findMatchingParen(tokens, 1); // after (
      expect(match).toBeNull();
    });

    it('returns null for unmatched )', () => {
      const tokens = tokensFor('a b)');
      const match = findMatchingParen(tokens, 4); // after )
      expect(match).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null when cursor is not adjacent to any paren', () => {
      const tokens = tokensFor('(a b c)');
      const match = findMatchingParen(tokens, 3); // middle of "b"
      expect(match).toBeNull();
    });

    it('returns null for negative cursor offset (blurred)', () => {
      const tokens = tokensFor('(a)');
      expect(findMatchingParen(tokens, -1)).toBeNull();
    });

    it('returns null for empty token list', () => {
      expect(findMatchingParen([], 0)).toBeNull();
    });

    it('ignores parens in quoted strings', () => {
      // Quoted parens are QUOTED_VALUE tokens, not LPAREN/RPAREN
      const tokens = tokensFor('"(hello)"');
      const match = findMatchingParen(tokens, 1);
      expect(match).toBeNull();
    });

    it('works with field groups', () => {
      // field:(a b)  ( is at pos 6, ) is at pos 10
      const tokens = tokensFor('field:(a b)');
      const match = findMatchingParen(tokens, 7); // after (
      expect(match).toEqual({ openStart: 6, closeStart: 10 });
    });
  });
});
