import { describe, it, expect } from 'vitest';
import { cx } from '../utils/cx';

describe('cx utility', () => {
  it('joins multiple strings', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out undefined and null', () => {
    expect(cx('a', undefined, 'b', null)).toBe('a b');
  });

  it('filters out false', () => {
    expect(cx('a', false, 'b', false && 'c')).toBe('a b');
  });

  it('returns empty string for no truthy values', () => {
    expect(cx(undefined, null, false)).toBe('');
  });

  it('returns single class', () => {
    expect(cx('only')).toBe('only');
  });

  it('works with conditional expressions', () => {
    const isActive = true;
    const isDisabled = false;
    expect(cx('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active');
  });
});
