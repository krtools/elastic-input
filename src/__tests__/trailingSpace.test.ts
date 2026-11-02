import { describe, it, expect } from 'vitest';
import { exitSpace } from '../utils/trailingSpace';

describe('exitSpace', () => {
  it('adds one space when nothing follows', () => {
    expect(exitSpace('', true)).toEqual({ space: ' ', after: '' });
  });

  it('collapses trailing whitespace to one space', () => {
    expect(exitSpace('  \n', true)).toEqual({ space: ' ', after: '' });
  });

  it('adds nothing when other text follows', () => {
    expect(exitSpace(') AND x', true)).toEqual({ space: '', after: ') AND x' });
    expect(exitSpace(' foo', true)).toEqual({ space: '', after: ' foo' });
  });

  it('adds nothing when disabled', () => {
    expect(exitSpace('', false)).toEqual({ space: '', after: '' });
    expect(exitSpace('  ', false)).toEqual({ space: '', after: '  ' });
  });
});
