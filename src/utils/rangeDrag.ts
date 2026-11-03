/**
 * The drag that extends a double- or triple-click selection, done by hand: the
 * component prevents the mousedown's default because the browser's word is not
 * the query's word ("status:active" is one word to the browser), and with it
 * the browser's own drag (§5.3). Nothing here is specific to ElasticInput: an
 * element, a span function and an end callback are all it needs.
 */
import { offsetAtPoint, setSelectionCharRange } from './cursorUtils';

export interface CharRange { start: number; end: number }

export interface RangeDragOptions {
  /**
   * The range to select for the anchor offset and the pointer's current offset
   * (equal at the start). Null at the start means nothing to select at the
   * anchor and no drag; null later keeps the previous range.
   */
  spanBetween: (anchor: number, pointer: number) => CharRange | null;
  /**
   * Runs once when the drag ends. `clickFollows` is true when the button was
   * released over the editor, which the browser follows with a click.
   */
  onEnd?: (range: CharRange, clickFollows: boolean) => void;
}

/**
 * Selects spanBetween(anchor, anchor) now and, while the button is held,
 * re-selects spanBetween(anchor, pointer) as the pointer moves, so the anchor's
 * unit stays selected and the selection grows by whole units. The focus end
 * follows the pointer, so a Shift+Arrow afterwards extends the end the user
 * dragged. The pointer is clamped to the editor's box: dragging past an edge
 * selects to that end of the nearest line. Ends on mouseup (its default
 * prevented, or the browser would clear a selection it did not start), on a
 * new mousedown anywhere (a release that never arrived), when the window
 * loses focus, or on a move with the button already up (a release outside the
 * window). Returns a function that cancels the drag without onEnd
 * (for unmount), or null when there is no unit at the anchor.
 */
export function startRangeDrag(editor: HTMLElement, anchor: number, options: RangeDragOptions): (() => void) | null {
  const initial = options.spanBetween(anchor, anchor);
  if (!initial) return null;
  const anchorStart = initial.start;
  let current = initial;
  let backward = false;
  setSelectionCharRange(editor, current.start, current.end);

  function onMove(e: MouseEvent) {
    if (!(e.buttons & 1)) { end(false); return; }
    const box = editor.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX, box.left + 1), box.right - 1);
    const y = Math.min(Math.max(e.clientY, box.top + 1), box.bottom - 1);
    const pointer = offsetAtPoint(editor, x, y);
    if (pointer == null) return;
    const span = options.spanBetween(anchor, pointer);
    if (!span) return;
    const back = pointer < anchorStart;
    if (span.start === current.start && span.end === current.end && back === backward) return;
    current = span;
    backward = back;
    setSelectionCharRange(editor, span.start, span.end, back);
  }
  function onUp(e: MouseEvent) {
    e.preventDefault();
    end(editor.contains(e.target as Node));
  }
  function onDown() { end(false); }
  function onBlur() { end(false); }
  function cancel() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseup', onUp, true);
    document.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('blur', onBlur);
  }
  function end(clickFollows: boolean) {
    cancel();
    options.onEnd?.(current, clickFollows);
  }
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseup', onUp, true);
  // Added during the press's own dispatch, after its capture phase, so it
  // sees only the next press
  document.addEventListener('mousedown', onDown, true);
  window.addEventListener('blur', onBlur);
  return cancel;
}
