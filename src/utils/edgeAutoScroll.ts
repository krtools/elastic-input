/**
 * Scrolls an element toward a pointer held past its top or bottom edge, as a
 * browser does for its own drag selection: a timer keeps scrolling while the
 * pointer stays out, faster the further out it is, and stops at the scroll
 * limit or once the pointer is back inside. Vertical only: the editor wraps,
 * so it never scrolls sideways.
 */

export interface EdgeScroller {
  /** Feeds the pointer's viewport y; starts, continues or stops the scrolling. */
  update(clientY: number): void;
  stop(): void;
}

const INTERVAL_MS = 50;
const MIN_STEP = 2;
const MAX_STEP = 40;

/** `onStep` runs after each scroll step, for the caller to re-read what is under the pointer. */
export function createEdgeScroller(el: HTMLElement, onStep: () => void): EdgeScroller {
  let timer: ReturnType<typeof setInterval> | null = null;
  let overshoot = 0;

  function stop() {
    if (timer != null) { clearInterval(timer); timer = null; }
  }
  function step() {
    const before = el.scrollTop;
    const size = Math.min(MAX_STEP, Math.max(MIN_STEP, Math.abs(overshoot) / 3));
    el.scrollTop = before + (overshoot < 0 ? -size : size);
    if (el.scrollTop === before) { stop(); return; } // at the limit, or not scrollable
    onStep();
  }
  function update(clientY: number) {
    const box = el.getBoundingClientRect();
    overshoot = clientY < box.top ? clientY - box.top : clientY > box.bottom ? clientY - box.bottom : 0;
    if (overshoot === 0) { stop(); return; }
    if (timer == null) {
      timer = setInterval(step, INTERVAL_MS);
      step(); // the first step at once, not an interval later
    }
  }
  return { update, stop };
}
