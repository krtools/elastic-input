import { describe, it, expect } from 'vitest';
import { capDropdownHeight } from '../utils/domUtils';

describe('capDropdownHeight', () => {
  it('returns content height when below max', () => {
    expect(capDropdownHeight(160, 300)).toBe(160);
  });

  it('returns max height when content exceeds it', () => {
    expect(capDropdownHeight(16000, 300)).toBe(300);
  });

  it('returns max height when content equals it', () => {
    expect(capDropdownHeight(300, 300)).toBe(300);
  });

  it('handles zero content height', () => {
    expect(capDropdownHeight(0, 300)).toBe(0);
  });

  it('caps large async result sets (500 items × 32px)', () => {
    // 500 suggestions × 32px per item = 16000px content height
    // With default 300px maxHeight, should cap to 300
    const contentHeight = 500 * 32;
    expect(capDropdownHeight(contentHeight, 300)).toBe(300);
  });

  it('does not cap small result sets (5 items × 32px)', () => {
    const contentHeight = 5 * 32; // 160px
    expect(capDropdownHeight(contentHeight, 300)).toBe(160);
  });
});
