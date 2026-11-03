/**
 * In an editor with `inputMaxHeight`, squiggles move with the text as it
 * scrolls, are never drawn beyond the editor's box, and a hovered error's
 * tooltip goes with its line (§9.1).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { commands } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pause, mouseAt, q, qa } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'ok', type: 'string' }];

// Unknown fields on line 1 and line 9; about two and a half lines are visible
const LINES = Array.from({ length: 12 }, (_, i) => `ok:${i + 1}`);
LINES[0] = 'ok:1 bad:x';
LINES[8] = 'worse:y ok:9';
const TEXT = LINES.join('\n');

async function setup() {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    features: { multiline: true },
    styles: { inputMaxHeight: '60px', lineHeight: '20px' },
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  const editorEl = q('.ei-editor')!;
  handle.api!.set({ value: TEXT, selection: TEXT.length });
  expect(await waitFor(() => handle.api?.getValue() === TEXT)).toBe(true);
  expect(editorEl.scrollHeight).toBeGreaterThan(editorEl.clientHeight);
  // Squiggle measurement is debounced (150ms)
  expect(await waitFor(() => qa('.ei-squiggly').length > 0)).toBe(true);
  await pause(200);
  return editorEl;
}

const within = (r: DOMRect, box: DOMRect) => r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
const fieldSpan = (name: string) =>
  qa('.ei-token--field-name').find(el => el.textContent === name)!;
const alignedWith = (wave: DOMRect, text: DOMRect) =>
  Math.abs(wave.left - text.left) < 2 && Math.abs(wave.top - (text.bottom - 2)) < 2;

describe('squiggles in a scrolling editor', () => {
  it('draws only the squiggles whose lines are in view, inside the box', async () => {
    const editorEl = await setup();
    const box = editorEl.getBoundingClientRect();
    const waves = qa('.ei-squiggly');
    expect(waves).toHaveLength(1);
    const wave = waves[0].getBoundingClientRect();
    expect(within(wave, box)).toBe(true);
    expect(alignedWith(wave, fieldSpan('bad').getBoundingClientRect())).toBe(true);
  });

  it('moves the squiggles with the text as the editor scrolls', async () => {
    const editorEl = await setup();
    const box = editorEl.getBoundingClientRect();
    editorEl.scrollTop = 160; // line 9 at the top of the box, line 1 long gone
    expect(await waitFor(() => {
      const waves = qa('.ei-squiggly');
      return waves.length === 1 && alignedWith(waves[0].getBoundingClientRect(), fieldSpan('worse').getBoundingClientRect());
    })).toBe(true);
    expect(within(qa('.ei-squiggly')[0].getBoundingClientRect(), box)).toBe(true);

    editorEl.scrollTop = 0;
    expect(await waitFor(() => {
      const waves = qa('.ei-squiggly');
      return waves.length === 1 && alignedWith(waves[0].getBoundingClientRect(), fieldSpan('bad').getBoundingClientRect());
    })).toBe(true);
  });

  it('hovering a scrolled-in error shows its tooltip, which goes once the line scrolls out', async () => {
    const editorEl = await setup();
    // Park the real pointer away from the component: the browser replays a
    // mousemove at it after a scroll, which would otherwise redo the hit test
    await commands.mouseGesture([{ type: 'move', x: 600, y: 700 }]);
    editorEl.scrollTop = 160;
    expect(await waitFor(() => alignedWith(qa('.ei-squiggly')[0]?.getBoundingClientRect(), fieldSpan('worse').getBoundingClientRect()))).toBe(true);

    const text = fieldSpan('worse').getBoundingClientRect();
    mouseAt(q('.ei-editor-wrap')!, 'mousemove', { x: text.left + text.width / 2, y: text.top + text.height / 2 });
    expect(await waitFor(() => q('.ei-tooltip')?.textContent?.includes('"worse"') === true)).toBe(true);
    const tip = q('.ei-tooltip')!.getBoundingClientRect();
    expect(Math.abs(tip.top - (text.bottom + 2 + 4)) < 3 || tip.bottom <= text.top).toBe(true); // just below the wave, or flipped above

    editorEl.scrollTop = 0;
    expect(await waitFor(() => q('.ei-tooltip') === null)).toBe(true);
  });
});
