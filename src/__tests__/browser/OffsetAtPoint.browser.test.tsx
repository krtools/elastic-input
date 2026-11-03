/**
 * offsetAtPoint maps a viewport point to a character offset in an element,
 * through caretPositionFromPoint (the standard; Firefox has only this) or
 * caretRangeFromPoint (older; Safari has only this).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { offsetAtPoint } from '../../utils/cursorUtils';
import { pointAt } from './helpers';

let root: HTMLElement | null = null;
afterEach(() => { root?.remove(); root = null; });

function mount(html: string): HTMLElement {
  root = document.createElement('div');
  root.style.cssText = 'font: 16px monospace; padding: 8px; width: 400px;';
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** Runs `fn` with a Document method stubbed out, as a browser lacking it would. */
function without(method: 'caretPositionFromPoint' | 'caretRangeFromPoint', fn: () => void) {
  const desc = Object.getOwnPropertyDescriptor(Document.prototype, method);
  if (!desc) throw new Error(`${method} is not on Document.prototype`);
  Object.defineProperty(Document.prototype, method, { value: undefined, configurable: true });
  try { fn(); } finally { Object.defineProperty(Document.prototype, method, desc); }
}

const SPANS = '<span>status</span><span>:</span><span>active</span><span> </span><span>lead</span>';

describe('offsetAtPoint', () => {
  it('maps a point over a character to its offset', () => {
    const el = mount(SPANS);
    const p9 = pointAt(el, 9);
    expect(offsetAtPoint(el, p9.x, p9.y)).toBe(9);
    const p0 = pointAt(el, 0);
    expect(offsetAtPoint(el, p0.x, p0.y)).toBe(0);
  });

  it('counts a line break as one character', () => {
    const el = mount('<span>ab</span><br><span>cd</span>');
    const p = pointAt(el, 4); // the d
    expect(offsetAtPoint(el, p.x, p.y)).toBe(4);
  });

  it('returns null for a point outside the element', () => {
    const el = mount(SPANS);
    const r = el.getBoundingClientRect();
    expect(offsetAtPoint(el, r.right + 40, r.top + r.height / 2)).toBeNull();
  });

  it('works through caretRangeFromPoint when caretPositionFromPoint is missing', () => {
    const el = mount(SPANS);
    const p = pointAt(el, 9);
    without('caretPositionFromPoint', () => {
      expect(offsetAtPoint(el, p.x, p.y)).toBe(9);
    });
  });

  it('works through caretPositionFromPoint when caretRangeFromPoint is missing', () => {
    const el = mount(SPANS);
    const p = pointAt(el, 9);
    without('caretRangeFromPoint', () => {
      expect(offsetAtPoint(el, p.x, p.y)).toBe(9);
    });
  });
});
