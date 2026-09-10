import { describe, it, expect } from 'vitest';
import { capDropdownHeight, adjustFlippedPosition } from '../utils/domUtils';

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

describe('adjustFlippedPosition', () => {
  const VIEWPORT_HEIGHT = 800;

  // Minimal caret rect — adjustFlippedPosition only reads top/bottom
  function caretRect(top: number, bottom: number): DOMRect {
    return { top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON() { return {}; } };
  }

  it('returns null when an unflipped dropdown fits below', () => {
    const result = adjustFlippedPosition(
      { top: 604, left: 10, flipped: false }, 100, caretRect(580, 600), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toBeNull();
  });

  it('flips up when actual height overflows below and fits above', () => {
    // caret bottom 750 + 4 + 300 = 1054 > 800; caret top 730 - 4 - 300 = 426 >= 0
    const result = adjustFlippedPosition(
      { top: 754, left: 10, flipped: false }, 300, caretRect(730, 750), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toEqual({ top: 726, left: 10, flipped: true });
  });

  it('does not flip up when the content would not fit above either', () => {
    const result = adjustFlippedPosition(
      { top: 754, left: 10, flipped: false }, 900, caretRect(730, 750), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toBeNull();
  });

  it('unflips when a flipped dropdown overflows the top and fits below', () => {
    // caret top 100 - 4 - 200 = -104 < 0; caret bottom 120 + 4 + 200 = 324 <= 800
    const result = adjustFlippedPosition(
      { top: 96, left: 10, flipped: true }, 200, caretRect(100, 120), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toEqual({ top: 124, left: 10, flipped: false });
  });

  it('keeps a flipped dropdown in place when it fits above', () => {
    const result = adjustFlippedPosition(
      { top: 696, left: 10, flipped: true }, 300, caretRect(700, 720), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toBeNull();
  });

  it('keeps a flipped dropdown flipped even when it would also fit below', () => {
    // Overflowing above is the only reason to unflip — flipping back and
    // forth on borderline heights would cause visible jumping.
    const result = adjustFlippedPosition(
      { top: 396, left: 10, flipped: true }, 100, caretRect(400, 420), VIEWPORT_HEIGHT, 0,
    );
    expect(result).toBeNull();
  });

  it('includes scrollY in the corrected document-space top', () => {
    const result = adjustFlippedPosition(
      { top: 1254, left: 10, flipped: false }, 300, caretRect(730, 750), VIEWPORT_HEIGHT, 500,
    );
    expect(result).toEqual({ top: 1226, left: 10, flipped: true });
  });
});
