/**
 * createEdgeScroller scrolls an element toward a pointer held past its top or
 * bottom edge, by the overshoot every frame, and stops at the limit or once
 * the pointer is back inside (§5.3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createEdgeScroller, EdgeScroller } from '../../utils/edgeAutoScroll';
import { pause } from './helpers';

let root: HTMLElement | null = null;
let scroller: EdgeScroller | null = null;
afterEach(() => { scroller?.stop(); scroller = null; root?.remove(); root = null; });

function mount(lines: number): HTMLElement {
  root = document.createElement('div');
  root.style.cssText = 'font: 16px/20px monospace; padding: 8px; width: 300px; max-height: 60px; overflow: auto; white-space: pre-wrap;';
  root.textContent = Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n');
  document.body.appendChild(root);
  return root;
}

describe('createEdgeScroller', () => {
  it('scrolls by the overshoot at once, then every frame until the limit, then stops', async () => {
    const el = mount(12);
    let steps = 0;
    scroller = createEdgeScroller(el, () => { steps++; });
    const box = el.getBoundingClientRect();
    scroller.update(box.bottom + 30);
    expect(el.scrollTop).toBe(30); // the first step is immediate
    expect(steps).toBe(1);
    await pause(120);
    expect(el.scrollTop).toBeGreaterThan(30);
    await pause(300);
    expect(el.scrollTop).toBe(el.scrollHeight - el.clientHeight);
    const atLimit = steps;
    await pause(100);
    expect(steps).toBe(atLimit);
  });

  it('scrolls up toward a pointer held above the box', () => {
    const el = mount(12);
    el.scrollTop = 100;
    scroller = createEdgeScroller(el, () => {});
    scroller.update(el.getBoundingClientRect().top - 30);
    expect(el.scrollTop).toBeLessThan(100);
  });

  it('stops once the pointer is back inside the box', async () => {
    const el = mount(12);
    scroller = createEdgeScroller(el, () => {});
    const box = el.getBoundingClientRect();
    scroller.update(box.bottom + 30);
    await pause(120);
    scroller.update(box.top + 20);
    const stopped = el.scrollTop;
    await pause(150);
    expect(el.scrollTop).toBe(stopped);
  });

  it('does nothing for an element that cannot scroll', async () => {
    const el = mount(2);
    let steps = 0;
    scroller = createEdgeScroller(el, () => { steps++; });
    scroller.update(el.getBoundingClientRect().bottom + 30);
    await pause(120);
    expect(el.scrollTop).toBe(0);
    expect(steps).toBe(0);
  });

  it('stop() ends the scrolling', async () => {
    const el = mount(12);
    scroller = createEdgeScroller(el, () => {});
    scroller.update(el.getBoundingClientRect().bottom + 30);
    scroller.stop();
    const stopped = el.scrollTop;
    await pause(150);
    expect(el.scrollTop).toBe(stopped);
  });
});
