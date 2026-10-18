/**
 * Touch and mobile-keyboard support: editor attributes that keep phone
 * keyboards from rewriting queries, tap-to-show error tooltips (there is no
 * hover on touch), and visual-viewport-aware positioning.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
import { getDropdownPosition } from '../../utils/domUtils';
import { getVisibleViewport } from '../../utils/viewport';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'price', type: 'number' }];

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const editorEl = () => document.querySelector('.ei-editor') as HTMLElement;
const tooltip = () => document.querySelector('.ei-tooltip');

function tap(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', clientX, clientY, bubbles: true, cancelable: true }));
}

describe('mobile keyboard attributes', () => {
  it('turns off autocapitalize/autocorrect and labels the return key Search', () => {
    renderInto(React.createElement(ElasticInput, { fields: FIELDS }));
    const el = editorEl();
    expect(el.getAttribute('autocapitalize')).toBe('off');
    expect(el.getAttribute('autocorrect')).toBe('off');
    expect(el.getAttribute('enterkeyhint')).toBe('search');
    expect(el.getAttribute('spellcheck')).toBe('false');
  });
});

describe('tap-to-show error tooltips', () => {
  async function setupWithError() {
    const handle: { api: ElasticInputAPI | null } = { api: null };
    renderInto(React.createElement(ElasticInput, { fields: FIELDS, dropdown: { open: 'never' }, inputRef: (a: ElasticInputAPI) => { handle.api = a; } }));
    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'price:abc ');
    // Squiggle measured after the debounce
    expect(await waitFor(() => document.querySelector('.ei-squiggly') !== null)).toBe(true);
    const sq = document.querySelector('.ei-squiggly') as HTMLElement;
    const r = sq.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top - 4, api: handle.api! }; // on the error text, just above the wave
  }

  it('a touch tap on the error shows the message and keeps it until the next tap', async () => {
    const { x, y, api } = await setupWithError();
    tap(editorEl(), x, y);
    // The tap also lands the caret inside the error, which would normally
    // hide it (deferred display) — a pinned error stays underlined and shown
    api.setSelection(8, 8);
    expect(await waitFor(() => tooltip() !== null)).toBe(true);
    expect(tooltip()!.textContent).toContain('not a valid number');
    await pause(250);
    expect(document.querySelector('.ei-squiggly')).not.toBeNull();

    // Compatibility mouse events that follow a tap must not dismiss it
    editorEl().dispatchEvent(new MouseEvent('mousemove', { clientX: 2, clientY: 2, bubbles: true }));
    await pause(100);
    expect(tooltip()).not.toBeNull();

    tap(document.body, 5, 5);
    expect(await waitFor(() => tooltip() === null)).toBe(true);
    // Unpinned, the caret-inside rule applies again
    expect(await waitFor(() => document.querySelector('.ei-squiggly') === null)).toBe(true);
  });

  it('typing dismisses a tapped-open tooltip', async () => {
    const { x, y } = await setupWithError();
    tap(editorEl(), x, y);
    expect(await waitFor(() => tooltip() !== null)).toBe(true);

    await userEvent.keyboard('x');
    expect(await waitFor(() => tooltip() === null)).toBe(true);
  });

  it('a mouse tap (pointerType mouse) changes nothing — hover still rules', async () => {
    const { x, y } = await setupWithError();
    editorEl().dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', clientX: x, clientY: y, bubbles: true }));
    await pause(100);
    expect(tooltip()).toBeNull();
  });
});

describe('visual-viewport-aware positioning', () => {
  const rect = (top: number, bottom: number, left = 20): DOMRect =>
    ({ top, bottom, left, right: left, width: 0, height: bottom - top, x: left, y: top, toJSON() { return {}; } });

  it('getVisibleViewport reports the visual viewport', () => {
    const vp = getVisibleViewport();
    expect(vp.width).toBe(window.visualViewport!.width);
    expect(vp.height).toBe(window.visualViewport!.height);
  });

  it('flips above the caret when the visible area (not innerHeight) has no room below', () => {
    // Keyboard up: 400px visible of an 800px window
    const below = getDropdownPosition(rect(300, 320), 200, 300, { top: 0, left: 0, width: 375, height: 800 });
    expect(below.flipped).toBe(false);
    const above = getDropdownPosition(rect(300, 320), 200, 300, { top: 0, left: 0, width: 375, height: 400 });
    expect(above.flipped).toBe(true);
  });

  it('reports the space on the chosen side, and picks the roomier side when neither fits', () => {
    // 800px visible, caret at 300: 200px list fits below → space below
    const below = getDropdownPosition(rect(300, 320), 200, 300, { top: 0, left: 0, width: 375, height: 800 });
    expect(below).toMatchObject({ flipped: false, maxHeight: 800 - 320 - 12 });
    // 400px visible with 300px list: neither side fits; above (288px) beats below (68px)
    const roomier = getDropdownPosition(rect(300, 320), 300, 300, { top: 0, left: 0, width: 375, height: 400 });
    expect(roomier).toMatchObject({ flipped: true, maxHeight: 300 - 12 });
    // Below wins when it is the roomier side, floored at 96
    const tight = getDropdownPosition(rect(40, 60), 300, 300, { top: 0, left: 0, width: 375, height: 200 });
    expect(tight).toMatchObject({ flipped: false, maxHeight: 128 });
  });

  it('keeps the dropdown inside a narrow visible width', () => {
    const pos = getDropdownPosition(rect(100, 120, 300), 100, 300, { top: 0, left: 0, width: 375, height: 800 });
    expect(pos.left).toBe(375 - 300 - 8 + window.scrollX);
  });
});
