import { describe, it, expect } from 'vitest';
import { getDropdownPosition } from '../utils/domUtils';

// getDropdownPosition reads window.scrollX/Y; give it a still page
const withWindow = <T,>(fn: () => T): T => {
  const g = globalThis as unknown as { window?: unknown };
  const saved = g.window;
  g.window = { scrollX: 0, scrollY: 0 };
  try { return fn(); } finally { g.window = saved; }
};

const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 16, right: 359, width: 343, height }) as DOMRect;
const vp = { top: 0, left: 0, width: 375, height: 812 };

describe('getDropdownPosition gap', () => {
  it('defaults to 4px below the anchor', () => {
    withWindow(() => {
      const p = getDropdownPosition(rect(100, 40), 46, 343, vp);
      expect(p.flipped).toBe(false);
      expect(p.top).toBe(144);
    });
  });

  it('a zero gap puts the box flush against the anchor, on either side', () => {
    withWindow(() => {
      expect(getDropdownPosition(rect(100, 40), 46, 343, vp, 0).top).toBe(140);
      const low = getDropdownPosition(rect(770, 40), 46, 343, vp, 0);
      expect(low.flipped).toBe(true);
      expect(low.top).toBe(770); // anchors the bottom edge at the anchor's top
    });
  });

  it('keeps a full-width box where it is when it already fits the viewport', () => {
    withWindow(() => {
      expect(getDropdownPosition(rect(100, 40), 46, 343, vp, 0).left).toBe(16);
    });
  });
});
