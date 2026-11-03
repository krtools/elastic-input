/**
 * startRangeDrag extends a selection by units (words here) while the mouse
 * button is held, independent of ElasticInput: a bare contentEditable div and
 * a span function are all it needs (§5.3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { startRangeDrag } from '../../utils/rangeDrag';
import { getWordSpanBetween } from '../../utils/wordRange';
import { countOffsetTo } from '../../utils/cursorUtils';
import { pointAt, mouseAt } from './helpers';

const TEXT = 'status:active lead now';
let root: HTMLElement | null = null;
afterEach(() => { root?.remove(); root = null; window.getSelection()?.removeAllRanges(); });

function mount(): HTMLElement {
  root = document.createElement('div');
  root.contentEditable = 'true';
  root.style.cssText = 'font: 16px monospace; padding: 8px; width: 400px;';
  root.innerHTML = '<span>status</span><span>:</span><span>active</span><span> lead now</span>';
  document.body.appendChild(root);
  return root;
}

const selected = () => window.getSelection()?.toString() ?? '';
/** Character offset of the selection's focus (the end a Shift+Arrow moves). */
function focusOffset(el: HTMLElement): number {
  const sel = window.getSelection()!;
  return countOffsetTo(el, sel.focusNode!, sel.focusOffset);
}
const move = (el: HTMLElement, offset: number) => mouseAt(document, 'mousemove', pointAt(el, offset), { buttons: 1 });
const words = (a: number, b: number) => getWordSpanBetween(TEXT, a, b);

describe('startRangeDrag', () => {
  it('selects the anchor unit at once and extends it by units as the pointer moves', () => {
    const el = mount();
    expect(startRangeDrag(el, 9, { spanBetween: words })).not.toBeNull();
    expect(selected()).toBe('active');
    move(el, 15);
    expect(selected()).toBe('active lead');
    move(el, 20);
    expect(selected()).toBe('active lead now');
    move(el, 15);
    expect(selected()).toBe('active lead');
    mouseAt(el, 'mouseup', pointAt(el, 15));
  });

  it('puts the focus at the left end when dragging backwards', () => {
    const el = mount();
    startRangeDrag(el, 15, { spanBetween: words });
    move(el, 9);
    expect(selected()).toBe('active lead');
    expect(focusOffset(el)).toBe(7);
    move(el, 20);
    expect(selected()).toBe('lead now');
    expect(focusOffset(el)).toBe(22);
    mouseAt(el, 'mouseup', pointAt(el, 20));
  });

  it('clamps the pointer to the editor box', () => {
    const el = mount();
    startRangeDrag(el, 9, { spanBetween: words });
    const box = el.getBoundingClientRect();
    mouseAt(document, 'mousemove', { x: box.right + 80, y: box.bottom + 40 }, { buttons: 1 });
    expect(selected()).toBe('active lead now');
    mouseAt(document, 'mousemove', { x: box.left - 80, y: box.top - 40 }, { buttons: 1 });
    expect(selected()).toBe('status:active');
    mouseAt(el, 'mouseup', pointAt(el, 0));
  });

  it('ends on mouseup, prevents its default, and stops tracking', () => {
    const el = mount();
    const ends: Array<[string, boolean]> = [];
    startRangeDrag(el, 9, {
      spanBetween: words,
      onEnd: (r, clickFollows) => { ends.push([TEXT.slice(r.start, r.end), clickFollows]); },
    });
    move(el, 15);
    expect(mouseAt(el, 'mouseup', pointAt(el, 15))).toBe(false);
    expect(ends).toEqual([['active lead', true]]);
    move(el, 20);
    expect(selected()).toBe('active lead');
    expect(ends).toHaveLength(1);
  });

  it('reports that no click follows a release outside the editor', () => {
    const el = mount();
    const ends: boolean[] = [];
    startRangeDrag(el, 9, { spanBetween: words, onEnd: (_r, clickFollows) => { ends.push(clickFollows); } });
    mouseAt(document.body, 'mouseup', { x: 0, y: 0 });
    expect(ends).toEqual([false]);
  });

  it('ends on a move with the button up, and on window blur', () => {
    const el = mount();
    let ends = 0;
    startRangeDrag(el, 9, { spanBetween: words, onEnd: () => { ends++; } });
    mouseAt(document, 'mousemove', pointAt(el, 15), { buttons: 0 });
    expect(ends).toBe(1);
    expect(selected()).toBe('active');

    startRangeDrag(el, 9, { spanBetween: words, onEnd: () => { ends++; } });
    window.dispatchEvent(new Event('blur'));
    expect(ends).toBe(2);
  });

  it('returns null and selects nothing when there is no unit at the anchor', () => {
    const el = mount();
    expect(startRangeDrag(el, 6, { spanBetween: () => null })).toBeNull();
    expect(selected()).toBe('');
  });

  it('cancel removes the listeners without calling onEnd', () => {
    const el = mount();
    let ends = 0;
    const cancel = startRangeDrag(el, 9, { spanBetween: words, onEnd: () => { ends++; } })!;
    cancel();
    move(el, 15);
    expect(selected()).toBe('active');
    mouseAt(el, 'mouseup', pointAt(el, 15));
    expect(ends).toBe(0);
  });
});
