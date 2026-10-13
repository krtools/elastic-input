import { describe, it, expect } from 'vitest';
import * as lib from '../index';

/** Pins the public surface so a refactor can't silently drop an export. */
describe('public exports', () => {
  it('exposes the standalone utilities', () => {
    expect(typeof lib.normalizeTypographicChars).toBe('function');
    expect(typeof lib.validateDate).toBe('function');
    expect(typeof lib.findMatchingParen).toBe('function');
    expect(typeof lib.formatQuery).toBe('function');
    expect(typeof lib.extractValues).toBe('function');
    expect(typeof lib.isQueryValid).toBe('function');
    expect(typeof lib.atTermBoundary).toBe('function');
    expect(typeof lib.defaultFilterFields).toBe('function');
  });

  it('utilities work through the package entry', () => {
    expect(lib.normalizeTypographicChars('“hi” — x')).toBe('"hi" - x');
    expect(lib.validateDate('now-1d/d')).toBeNull();
    expect(lib.validateDate('nope')).toMatch(/not a valid date/);
    expect(lib.validateDate('nope', () => new Date())).toBeNull();
    const tokens = new lib.Lexer('(a OR b)').tokenize();
    expect(lib.findMatchingParen(tokens, 1)).toEqual({ openStart: 0, closeStart: 7 });
    expect(lib.atTermBoundary('(a)', 3)).toBe(true);
    expect(lib.atTermBoundary('sta', 3)).toBe(false);
  });
});
