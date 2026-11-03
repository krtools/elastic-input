/**
 * Scrolls an element toward a pointer held past its top or bottom edge, as a
 * browser does for its own drag selection: every animation frame the pointer's
 * point is brought to the edge of the box, so the speed is the pointer's
 * distance past the edge per frame (Blink's autoscroll does the same), and it
 * stops at the scroll limit or once the pointer is back inside. Vertical only:
 * the editor wraps, so it never scrolls sideways.
 */

export interface EdgeScroller {
  /** Feeds the pointer's viewport y; starts, continues or stops the scrolling. */
  update(clientY: number): void;
  stop(): void;
}

/** `onStep` runs after each scroll step, for the caller to re-read what is under the pointer. */
export function createEdgeScroller(el: HTMLElement, onStep: () => void): EdgeScroller {
  let frame: number | null = null;
  let overshoot = 0;

  function stop() {
    if (frame != null) { cancelAnimationFrame(frame); frame = null; }
  }
  function step() {
    frame = null;
    const before = el.scrollTop;
    el.scrollTop = before + overshoot;
    if (el.scrollTop === before) return; // at the limit, or not scrollable
    onStep();
    frame = requestAnimationFrame(step);
  }
  function update(clientY: number) {
    const box = el.getBoundingClientRect();
    overshoot = clientY < box.top ? clientY - box.top : clientY > box.bottom ? clientY - box.bottom : 0;
    if (overshoot === 0) { stop(); return; }
    if (frame == null) step(); // at once, then every frame
  }
  return { update, stop };
}
