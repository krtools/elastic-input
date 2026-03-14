import { describe, it, expect } from 'vitest';
import { wrapSelection, WRAP_PAIRS } from '../utils/textUtils';

describe('wrapSelection', () => {
  it('wraps selected text with parentheses', () => {
    const result = wrapSelection('a AND b OR c', 0, 7, '(', ')');
    expect(result.newValue).toBe('(a AND b) OR c');
    expect(result.newCursorPos).toBe(9); // after ')'
  });

  it('wraps selected text with square brackets', () => {
    const result = wrapSelection('hello world', 6, 11, '[', ']');
    expect(result.newValue).toBe('hello [world]');
    expect(result.newCursorPos).toBe(13);
  });

  it('wraps selected text with double quotes', () => {
    const result = wrapSelection('hello world', 0, 11, '"', '"');
    expect(result.newValue).toBe('"hello world"');
    expect(result.newCursorPos).toBe(13);
  });

  it('wraps selected text with single quotes', () => {
    const result = wrapSelection('foo bar', 4, 7, "'", "'");
    expect(result.newValue).toBe("foo 'bar'");
    expect(result.newCursorPos).toBe(9);
  });

  it('wraps middle of text preserving surrounding content', () => {
    const result = wrapSelection('a AND b OR c AND d', 6, 12, '(', ')');
    expect(result.newValue).toBe('a AND (b OR c) AND d');
    expect(result.newCursorPos).toBe(14);
  });

  it('wraps at start of text', () => {
    const result = wrapSelection('foo bar', 0, 3, '(', ')');
    expect(result.newValue).toBe('(foo) bar');
    expect(result.newCursorPos).toBe(5);
  });

  it('wraps at end of text', () => {
    const result = wrapSelection('foo bar', 4, 7, '(', ')');
    expect(result.newValue).toBe('foo (bar)');
    expect(result.newCursorPos).toBe(9);
  });

  it('wraps entire text', () => {
    const result = wrapSelection('a OR b', 0, 6, '(', ')');
    expect(result.newValue).toBe('(a OR b)');
    expect(result.newCursorPos).toBe(8);
  });

  it('wraps single character', () => {
    const result = wrapSelection('abc', 1, 2, '(', ')');
    expect(result.newValue).toBe('a(b)c');
    expect(result.newCursorPos).toBe(4);
  });

  it('handles empty selection range (start === end) gracefully', () => {
    // In practice we don't call this with collapsed selection, but verify it doesn't break
    const result = wrapSelection('abc', 1, 1, '(', ')');
    expect(result.newValue).toBe('a()bc');
    expect(result.newCursorPos).toBe(3);
  });
});

describe('WRAP_PAIRS', () => {
  it('maps ( to )', () => {
    expect(WRAP_PAIRS['(']).toBe(')');
  });

  it('maps [ to ]', () => {
    expect(WRAP_PAIRS['[']).toBe(']');
  });

  it('maps " to "', () => {
    expect(WRAP_PAIRS['"']).toBe('"');
  });

  it("maps ' to '", () => {
    expect(WRAP_PAIRS["'"]).toBe("'");
  });

  it('does not map non-wrapping chars', () => {
    expect(WRAP_PAIRS['a']).toBeUndefined();
    expect(WRAP_PAIRS[')']).toBeUndefined();
  });
});

describe('wrapping resolves ambiguity warnings', () => {
  // Integration-style test: verify that wrapping the right selection
  // in a mixed AND/OR expression produces valid parenthesized output
  it('wrapping "a AND b" in "a AND b OR c" produces "(a AND b) OR c"', () => {
    const result = wrapSelection('a AND b OR c', 0, 7, '(', ')');
    expect(result.newValue).toBe('(a AND b) OR c');
  });

  it('wrapping "b OR c" in "a AND b OR c" produces "a AND (b OR c)"', () => {
    const result = wrapSelection('a AND b OR c', 6, 12, '(', ')');
    expect(result.newValue).toBe('a AND (b OR c)');
  });

  it('wrapping entire mixed expression adds outer parens', () => {
    const result = wrapSelection('a AND b OR c', 0, 12, '(', ')');
    expect(result.newValue).toBe('(a AND b OR c)');
  });
});
