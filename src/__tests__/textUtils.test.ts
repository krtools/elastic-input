import { describe, it, expect } from 'vitest';
import { atTermBoundary, isOnOperatorToken } from '../utils/textUtils';
import { Lexer } from '../lexer/Lexer';

describe('atTermBoundary (dropdown.open: "input" momentum rule)', () => {
  it('is a boundary at the start and after whitespace', () => {
    expect(atTermBoundary('', 0)).toBe(true);
    expect(atTermBoundary('sta', 0)).toBe(true);
    expect(atTermBoundary('(a) ', 4)).toBe(true);
    expect(atTermBoundary('a\nb', 2)).toBe(true);
  });

  it('is a boundary right after a closing paren, bracket, or brace', () => {
    expect(atTermBoundary('(a)', 3)).toBe(true);
    expect(atTermBoundary('[1 TO 2]', 8)).toBe(true);
    expect(atTermBoundary('{1 TO 2}', 8)).toBe(true);
  });

  it('is not a boundary mid-word or after an opening delimiter', () => {
    expect(atTermBoundary('sta', 3)).toBe(false);
    expect(atTermBoundary('status:', 7)).toBe(false);
    expect(atTermBoundary('(', 1)).toBe(false);
    expect(atTermBoundary('status:"', 8)).toBe(false);
  });
});

describe('isOnOperatorToken (dropdown.open: "always" suppression)', () => {
  const tokens = (q: string) => new Lexer(q).tokenize();

  it('is true on and at both edges of a boolean operator', () => {
    const t = tokens('a AND b');
    expect(isOnOperatorToken(t, 2)).toBe(true); // |AND
    expect(isOnOperatorToken(t, 3)).toBe(true); // A|ND
    expect(isOnOperatorToken(t, 5)).toBe(true); // AND|
    expect(isOnOperatorToken(tokens('a || b'), 3)).toBe(true);
  });

  it('is true on a fuzzy or boost suffix', () => {
    expect(isOnOperatorToken(tokens('term~2'), 5)).toBe(true);
    expect(isOnOperatorToken(tokens('term^3'), 6)).toBe(true);
  });

  it('is false in terms, whitespace, and after a prefix operator', () => {
    const t = tokens('a AND b');
    expect(isOnOperatorToken(t, 1)).toBe(false); // a|
    expect(isOnOperatorToken(t, 6)).toBe(false); // ' |b'
    expect(isOnOperatorToken(tokens('-'), 1)).toBe(false);
    expect(isOnOperatorToken([], 0)).toBe(false);
  });
});
