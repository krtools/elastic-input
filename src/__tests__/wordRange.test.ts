import { describe, it, expect } from 'vitest';
import { getWordRangeAt, getWordSpanBetween } from '../utils/wordRange';

const TEXT = 'status:active lead  now';
const slice = (r: { start: number; end: number }) => TEXT.slice(r.start, r.end);

describe('getWordRangeAt', () => {
  it('returns the word around the offset', () => {
    expect(getWordRangeAt(TEXT, 9)).toEqual({ start: 7, end: 13 });
  });

  it('stops at query syntax', () => {
    expect(slice(getWordRangeAt(TEXT, 3))).toBe('status');
    expect(getWordRangeAt('price:>100 x', 8)).toEqual({ start: 7, end: 10 });
  });

  it('takes the word at either boundary offset', () => {
    expect(slice(getWordRangeAt(TEXT, 14))).toBe('lead');
    expect(slice(getWordRangeAt(TEXT, 18))).toBe('lead');
  });

  it('gives a delimiter position to the word ending there', () => {
    expect(slice(getWordRangeAt(TEXT, 6))).toBe('status'); // before the colon
    expect(slice(getWordRangeAt(TEXT, 13))).toBe('active'); // before the space
  });

  it('is collapsed between two delimiters', () => {
    expect(getWordRangeAt(TEXT, 19)).toEqual({ start: 19, end: 19 });
    expect(getWordRangeAt('a:(b)', 2)).toEqual({ start: 2, end: 2 });
  });
});

describe('getWordSpanBetween', () => {
  it('spans from the anchor word through the pointer word', () => {
    expect(slice(getWordSpanBetween(TEXT, 9, 15))).toBe('active lead');
  });

  it('spans backwards too', () => {
    expect(slice(getWordSpanBetween(TEXT, 15, 2))).toBe('status:active lead');
  });

  it('takes the word at the edge the pointer sits on', () => {
    expect(slice(getWordSpanBetween(TEXT, 9, 13))).toBe('active');
    expect(slice(getWordSpanBetween(TEXT, 9, 6))).toBe('status:active');
  });

  it('extends to a pointer between delimiters, not past it', () => {
    expect(slice(getWordSpanBetween(TEXT, 9, 19))).toBe('active lead ');
  });

  it('is the anchor word with the pointer inside it', () => {
    expect(slice(getWordSpanBetween(TEXT, 9, 11))).toBe('active');
  });
});
