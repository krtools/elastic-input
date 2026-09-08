import { describe, it, expect } from 'vitest';
import { arrayShallowEqual } from '../utils/arrayShallowEqual';
import { FieldConfig } from '../types';

describe('arrayShallowEqual', () => {
  const a = { name: 'status', type: 'string' } as FieldConfig;
  const b = { name: 'source', type: 'string' } as FieldConfig;

  it('same reference is equal', () => {
    const arr = [a, b];
    expect(arrayShallowEqual(arr, arr)).toBe(true);
  });

  it('different arrays with the same elements by reference are equal', () => {
    expect(arrayShallowEqual([a, b], [a, b])).toBe(true);
    expect(arrayShallowEqual([a, b], [...[a, b]])).toBe(true);
  });

  it('empty arrays are equal', () => {
    expect(arrayShallowEqual([], [])).toBe(true);
  });

  it('different lengths are not equal', () => {
    expect(arrayShallowEqual([a], [a, b])).toBe(false);
    expect(arrayShallowEqual([a, b], [a])).toBe(false);
    expect(arrayShallowEqual([a], [])).toBe(false);
  });

  it('same length with a differing element is not equal', () => {
    expect(arrayShallowEqual([a, b], [b, a])).toBe(false);
    expect(arrayShallowEqual([a], [b])).toBe(false);
  });

  it('compares elements by reference, not structure', () => {
    // A fully-inline literal re-creates element objects — those do NOT count
    // as equal. Only stable element references (spread/filter of a stable
    // source) are absorbed.
    expect(arrayShallowEqual([a], [{ ...a }])).toBe(false);
  });

  it('works with primitive elements', () => {
    expect(arrayShallowEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(arrayShallowEqual(['x'], ['y'])).toBe(false);
  });
});
