/**
 * dropdown.presentation: 'sheet' — a bar under the text (count button +
 * suggestion chips) instead of the floating dropdown, and a near-full-screen
 * bottom sheet with the full list or the date picker. 'auto' picks it below
 * 640px.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 800);
});

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'created', type: 'date' },
];
const FOLLOW_UP_FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string', followUp: true },
  { name: 'created', type: 'date', followUp: true },
  { name: 'notes', type: 'string' },
];
const fetchValues = (_f: string, partial: string) =>
  Promise.resolve(['active', 'archived'].filter(v => v.startsWith(partial)).map(text => ({ text })));

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];
const barLabel = () => q('.ei-bar-open span')?.textContent ?? null;
const chips = () => qa('.ei-chip').map(el => el.textContent);
const sheetItems = () => qa('.ei-sheet .ei-dropdown-item').map(el => el.textContent ?? '');
const click = (el: HTMLElement | null) => page.elementLocator(el!).click();

async function setup(props: Partial<ElasticInputProps> = {}, dropdown: Record<string, unknown> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions: fetchValues,
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    dropdown: { presentation: 'sheet', suggestDebounceMs: 0, showOperators: false, ...dropdown },
  }));
  const editorEl = q('.ei-editor')!;
  const editor = page.elementLocator(editorEl);
  await editor.click();
  return { api: handle.api!, editor, editorEl };
}

describe("presentation: 'sheet' — the bar", () => {
  it('is there while focused, says "Suggestions" while nothing is open, and never shows the floating dropdown', async () => {
    // 'input' mode: focusing an empty editor offers nothing (in 'always' it lists every field)
    const { api } = await setup({}, { open: 'input' });
    expect(await waitFor(() => q('.ei-bar') !== null)).toBe(true);
    expect(barLabel()).toBe('Suggestions');
    expect(chips()).toEqual([]);
    expect(q('.ei-dropdown')).toBeNull();

    api.blur();
    expect(await waitFor(() => q('.ei-bar') === null)).toBe(true);
  });

  it('floats under the input: the box keeps its size, the bar spans its width just below, outside the container', async () => {
    const { editor } = await setup();
    const container = q('.ei-container')!;
    const before = container.getBoundingClientRect();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => chips().length === 1)).toBe(true);
    const bar = q('.ei-bar')!;
    expect(container.contains(bar)).toBe(false);
    const c = container.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    expect(c.height).toBe(before.height); // no second row
    expect(Math.round(b.top - c.bottom)).toBe(4);
    expect(Math.abs(b.left - c.left)).toBeLessThan(1);
    expect(Math.abs(b.width - c.width)).toBeLessThan(1);
    expect(getComputedStyle(bar).position).toBe('absolute');
  });

  it('flips above the input when the viewport has no room below', async () => {
    await page.viewport(375, 812);
    document.body.style.paddingTop = '740px';
    try {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      const c = q('.ei-container')!.getBoundingClientRect();
      const b = q('.ei-bar')!.getBoundingClientRect();
      expect(b.bottom).toBeLessThanOrEqual(c.top);
      expect(Math.round(c.top - b.bottom)).toBe(4);
    } finally {
      document.body.style.paddingTop = '';
    }
  });

  it('follows the input as the editor grows', async () => {
    const { editor } = await setup({ multiline: true });
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => chips().length === 1)).toBe(true);
    const top1 = q('.ei-bar')!.getBoundingClientRect().top;
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(editor, 'seg');
    expect(await waitFor(() => q('.ei-bar')!.getBoundingClientRect().top > top1 + 10)).toBe(true);
    const c = q('.ei-container')!.getBoundingClientRect();
    expect(Math.round(q('.ei-bar')!.getBoundingClientRect().top - c.bottom)).toBe(4);
  });

  it('prefix and suffix stay on the first text line beside a long wrapped query', async () => {
    await page.viewport(375, 812);
    const { editor } = await setup({ prefix: 'P', suffix: 'GO', multiline: true });
    await userEvent.type(editor, 'adsfkjah sdfkla hsdfjla hsdfjla shdfklajd fhakjsd akjlds hakdsjl h');
    const ed = q('.ei-editor')!.getBoundingClientRect();
    expect(ed.height).toBeGreaterThan(50); // wrapped onto several lines
    const c = q('.ei-container')!.getBoundingClientRect();
    const p = q('.ei-prefix')!.getBoundingClientRect();
    const sfx = q('.ei-suffix')!.getBoundingClientRect();
    expect(p.top - c.top).toBeLessThan(4);
    expect(sfx.top - c.top).toBeLessThan(4);
    expect(p.right).toBeLessThanOrEqual(ed.left + 1);
    expect(sfx.left).toBeGreaterThanOrEqual(ed.right - 1);
  });

  it('shows a count button and chips; a chip accepts and the next step takes over', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    expect(chips()).toEqual(['status']);
    expect(q('.ei-chip')!.classList.contains('ei-chip--selected')).toBe(true); // highlighted = Enter target

    await click(q('.ei-chip'));
    expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);
    expect(await waitFor(() => chips().length === 2)).toBe(true);
    expect(barLabel()).toBe('2 suggestions');
    expect(document.activeElement).toBe(q('.ei-editor'));
  });

  it('describes inert states instead of a count', async () => {
    const { editor } = await setup({ fetchSuggestions: () => Promise.resolve([]) }, {
      renderNoResults: () => React.createElement('span', null, 'Nothing here'),
    });
    await userEvent.type(editor, 'status:zzz');
    expect(await waitFor(() => barLabel() === 'No matches')).toBe(true);
    expect(chips()).toEqual([]);
  });

  it("the chip strip scrolls horizontally when the chips don't fit", async () => {
    await page.viewport(375, 812);
    const many: FieldConfig[] = Array.from({ length: 8 }, (_, i) => ({ name: `attribute_${i}`, type: 'string' as const }));
    const { editor } = await setup({ fields: many });
    await userEvent.type(editor, 'attr');
    expect(await waitFor(() => chips().length === 8)).toBe(true);
    const strip = q('.ei-bar-chips')!;
    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
    expect(getComputedStyle(strip).overflowX).toBe('auto');
  });

  describe('touch gestures belong to the bar', () => {
    const touch = (type: string, el: Element, x: number, y: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: 7, isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const MANY: FieldConfig[] = Array.from({ length: 8 }, (_, i) => ({ name: `attribute_${i}`, type: 'string' as const }));

    it('cancels touchstart (no native long press, scroll or click) and declares touch-action: none', async () => {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      const chip = q('.ei-chip')!;
      const ev = new TouchEvent('touchstart', { cancelable: true, bubbles: true, touches: [new Touch({ identifier: 1, target: chip, clientX: 10, clientY: 10 })] });
      chip.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(getComputedStyle(q('.ei-bar')!).touchAction).toBe('none');
    });

    it('a touch pan scrolls the strip and accepts nothing', async () => {
      await page.viewport(375, 812);
      const { api, editor } = await setup({ fields: MANY });
      await userEvent.type(editor, 'attr');
      expect(await waitFor(() => chips().length === 8)).toBe(true);
      const strip = q('.ei-bar-chips')!;
      const chip = qa('.ei-chip')[1];
      const r = chip.getBoundingClientRect();
      touch('pointerdown', chip, r.left + 10, r.top + 10);
      touch('pointermove', chip, r.left - 40, r.top + 10);
      touch('pointermove', chip, r.left - 110, r.top + 10);
      expect(strip.scrollLeft).toBe(120);
      touch('pointerup', chip, r.left - 110, r.top + 10);
      await pause(100);
      expect(api.getValue()).toBe('attr');
      expect(q('.ei-sheet')).toBeNull();
    });

    it('a touch tap on a chip accepts it; on the button it opens the sheet', async () => {
      const { api, editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      const chip = q('.ei-chip')!;
      const r = chip.getBoundingClientRect();
      touch('pointerdown', chip, r.left + 10, r.top + 10);
      touch('pointermove', chip, r.left + 13, r.top + 11); // within the tap slop
      touch('pointerup', chip, r.left + 13, r.top + 11);
      expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);

      const open = q('.ei-bar-open')!;
      const o = open.getBoundingClientRect();
      touch('pointerdown', open, o.left + 10, o.top + 10);
      touch('pointerup', open, o.left + 10, o.top + 10);
      expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    });

    it('a mouse click still accepts through the native click path', async () => {
      const { api, editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      await click(q('.ei-chip'));
      expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);
    });

    it('a touch tap on ⋯ opens the actions menu', async () => {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      const more = q('.ei-bar-more')!;
      const m = more.getBoundingClientRect();
      touch('pointerdown', more, m.left + 10, m.top + 10);
      touch('pointerup', more, m.left + 10, m.top + 10);
      expect(await waitFor(() => q('.ei-sheet .ei-action') !== null)).toBe(true);
    });

    it('the whole row is the hit zone: a touch on the padding above a chip accepts it', async () => {
      const { api, editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      const bar = q('.ei-bar')!;
      const b = bar.getBoundingClientRect();
      const c = q('.ei-chip')!.getBoundingClientRect();
      expect(c.top - b.top).toBeGreaterThan(2);
      touch('pointerdown', bar, c.left + 10, b.top + 2);
      touch('pointerup', bar, c.left + 10, b.top + 2);
      expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);
    });

    it('shows a pressed state while a touch or mouse is down on a control, not during a pan', async () => {
      await page.viewport(375, 812);
      const { editor } = await setup({ fields: MANY });
      await userEvent.type(editor, 'attr');
      expect(await waitFor(() => chips().length === 8)).toBe(true);
      const chip = qa('.ei-chip')[0];
      const r = chip.getBoundingClientRect();
      touch('pointerdown', chip, r.left + 10, r.top + 10);
      expect(await waitFor(() => chip.getAttribute('data-pressed') === 'true')).toBe(true);
      expect(getComputedStyle(chip).transform).not.toBe('none');
      touch('pointermove', chip, r.left - 30, r.top + 10); // past the slop: a pan, not a press
      expect(await waitFor(() => chip.getAttribute('data-pressed') === null)).toBe(true);
      touch('pointerup', chip, r.left - 30, r.top + 10);

      const more = q('.ei-bar-more')!;
      const mouse = (type: string) => more.dispatchEvent(new PointerEvent(type, { pointerType: 'mouse', pointerId: 1, isPrimary: true, bubbles: true, cancelable: true }));
      mouse('pointerdown');
      expect(await waitFor(() => more.getAttribute('data-pressed') === 'true')).toBe(true);
      mouse('pointerup');
      expect(await waitFor(() => more.getAttribute('data-pressed') === null)).toBe(true);
      expect(q('.ei-sheet')).toBeNull(); // the mouse path still waits for the click
    });

    it('fades the strip edge that hides more chips', async () => {
      await page.viewport(375, 812);
      const { editor } = await setup({ fields: MANY });
      await userEvent.type(editor, 'attr');
      expect(await waitFor(() => chips().length === 8)).toBe(true);
      const strip = q('.ei-bar-chips')!;
      const mask = () => getComputedStyle(strip).maskImage;
      expect(await waitFor(() => mask().includes('linear-gradient'))).toBe(true);
      expect(mask().startsWith('linear-gradient(to right, rgb(0, 0, 0)')).toBe(true); // solid left edge
      expect(mask().endsWith('rgba(0, 0, 0, 0))')).toBe(true); // faded right edge
      strip.scrollLeft = strip.scrollWidth;
      strip.dispatchEvent(new Event('scroll'));
      expect(await waitFor(() => mask().startsWith('linear-gradient(to right, rgba(0, 0, 0, 0)'))).toBe(true);
      expect(mask().endsWith('rgb(0, 0, 0))')).toBe(true);
    });

    it('a strip that fits has no fade', async () => {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      expect(await waitFor(() => chips().length === 1)).toBe(true);
      expect(getComputedStyle(q('.ei-bar-chips')!).maskImage).toBe('none');
    });

    it('the sheet is a labelled modal dialog with a drag handle and an entrance animation', async () => {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      await click(q('.ei-bar-open'));
      expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
      const sheet = q('.ei-sheet')!;
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(sheet.getAttribute('aria-modal')).toBe('true');
      expect(sheet.getAttribute('aria-label')).toBe('Suggestions');
      expect(q('.ei-sheet-handle')).not.toBeNull();
      expect(getComputedStyle(sheet).animationName).toBe('elastic-input-sheet-up');
    });

    it('a downward swipe on the header closes the sheet; a short one snaps back', async () => {
      const { editor } = await setup();
      await userEvent.type(editor, 'sta');
      await click(q('.ei-bar-open'));
      expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
      const header = q('.ei-sheet-header')!;
      const h = header.getBoundingClientRect();
      touch('pointerdown', header, h.left + 100, h.top + 20);
      touch('pointermove', header, h.left + 100, h.top + 50);
      expect(q('.ei-sheet')!.style.transform).toBe('translateY(30px)');
      touch('pointerup', header, h.left + 100, h.top + 50);
      await pause(50);
      expect(q('.ei-sheet')).not.toBeNull();
      expect(q('.ei-sheet')!.style.transform).toBe('');
      touch('pointerdown', header, h.left + 100, h.top + 20);
      touch('pointermove', header, h.left + 100, h.top + 150);
      touch('pointerup', header, h.left + 100, h.top + 150);
      expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
      expect(q('.ei-bar')).not.toBeNull();
    });
  });

  it("in 'manual' mode the button requests suggestions, like Ctrl+Space", async () => {
    const { editor } = await setup({}, { open: 'manual' });
    await userEvent.type(editor, 'sta');
    await pause(200);
    expect(barLabel()).toBe('Suggestions');

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null && sheetItems().length === 1)).toBe(true);
    expect(barLabel()).toBe('1 suggestion');
  });
});

describe("presentation: 'sheet' — the sheet", () => {
  it('takes nearly the whole viewport, echoes the query, and shows tall rows', async () => {
    await page.viewport(375, 812);
    const { editor } = await setup();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    expect(q('.ei-sheet')).toBeNull();

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    // the slide-up transform lifts the rect for its first 180ms
    expect(await waitFor(() => q('.ei-sheet')!.getBoundingClientRect().top <= 60)).toBe(true);
    const r = q('.ei-sheet')!.getBoundingClientRect();
    expect(r.bottom).toBeGreaterThanOrEqual(window.innerHeight - 1);
    expect(r.width).toBeGreaterThanOrEqual(window.innerWidth - 1);
    expect(q('.ei-sheet-detail')!.textContent).toBe('sta');
    expect(q('.ei-sheet-backdrop')).not.toBeNull();
    expect(sheetItems()).toEqual(['statusstring']);
    expect(Math.round(q('.ei-sheet .ei-dropdown-item')!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48); // sub-pixel rect while the sheet slides in
    expect(document.activeElement).toBe(q('.ei-editor'));
  });

  it('a pick closes the sheet by default; the bar shows the next step', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);

    await click(q('.ei-sheet .ei-dropdown-item'));
    expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(await waitFor(() => chips().length === 2)).toBe(true);
    expect(document.activeElement).toBe(q('.ei-editor'));
  });

  it('a followUp field keeps the sheet open for its value, in place (no remount), then closes', async () => {
    const { api, editor } = await setup({ fields: FOLLOW_UP_FIELDS });
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    const sheetEl = q('.ei-sheet');

    await click(q('.ei-sheet .ei-dropdown-item'));
    expect(await waitFor(() => api.getValue() === 'status:')).toBe(true);
    expect(await waitFor(() => sheetItems().some(t => t.includes('archived')))).toBe(true);
    expect(q('.ei-sheet')).toBe(sheetEl);
    expect(q('.ei-sheet-detail')!.textContent).toBe('status:');

    await click(qa('.ei-sheet .ei-dropdown-item').find(el => el.textContent?.includes('archived'))!);
    expect(await waitFor(() => api.getValue() === 'status:archived ')).toBe(true);
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
  });

  it('a followUp date field goes straight to the picker; picking a day closes the sheet', async () => {
    const { api, editor } = await setup({ fields: FOLLOW_UP_FIELDS });
    await userEvent.type(editor, 'cre');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);

    await click(q('.ei-sheet .ei-dropdown-item'));
    expect(await waitFor(() => q('.ei-sheet .ei-datepicker') !== null)).toBe(true);
    await click(q('.ei-sheet .ei-datepicker-day--today'));
    expect(await waitFor(() => /^created:\d{4}-\d{2}-\d{2} $/.test(api.getValue()))).toBe(true);
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
  });

  it('a field without followUp closes the sheet even when others have it', async () => {
    const { api, editor } = await setup({ fields: FOLLOW_UP_FIELDS });
    await userEvent.type(editor, 'note'); // ('not' would lex as the NOT operator)
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);
    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    await click(q('.ei-sheet .ei-dropdown-item'));
    expect(await waitFor(() => api.getValue() === 'notes:')).toBe(true);
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
  });

  it('the chip strip keeps its scroll position across re-renders of the same list', async () => {
    await page.viewport(375, 812);
    const many: FieldConfig[] = Array.from({ length: 8 }, (_, i) => ({ name: `attribute_${i}`, type: 'string' as const }));
    const { editor } = await setup({ fields: many });
    await userEvent.type(editor, 'attr');
    expect(await waitFor(() => chips().length === 8)).toBe(true);
    const strip = q('.ei-bar-chips')!;
    strip.scrollLeft = 120;
    strip.dispatchEvent(new Event('scroll'));
    await userEvent.keyboard('{ArrowDown}'); // re-renders the bar (highlight moves), same list
    await pause(100);
    expect(q('.ei-bar-chips')!.scrollLeft).toBe(120);
  });

  it('closes on ×, on the backdrop, and on Escape — the bar stays while focused', async () => {
    const { editor } = await setup();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => barLabel() === '1 suggestion')).toBe(true);

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    await click(q('.ei-sheet-close'));
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(barLabel()).toBe('1 suggestion');
    expect(document.activeElement).toBe(q('.ei-editor'));

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    q('.ei-sheet-backdrop')!.click(); // its centre is under the sheet; a real tap lands in the top gap
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(document.activeElement).toBe(q('.ei-editor'));

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(q('.ei-bar')).not.toBeNull();
    expect(barLabel()).toBe('Suggestions');
  });

  it('closes on blur, and after Enter submits', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'status:a'); // partial → first value highlighted
    expect(await waitFor(() => chips().length === 2)).toBe(true);
    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);

    await userEvent.keyboard('{Enter}'); // accepts the highlighted value and submits
    expect(await waitFor(() => api.getValue() === 'status:active ')).toBe(true);
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    api.blur();
    expect(await waitFor(() => q('.ei-sheet') === null && q('.ei-bar') === null)).toBe(true);
  });

  it('keyboard still works: ArrowDown moves the highlight, Enter accepts it', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'status:');
    expect(await waitFor(() => chips().length === 2)).toBe(true);

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(await waitFor(() => qa('.ei-chip')[1].classList.contains('ei-chip--selected'))).toBe(true);
    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => api.getValue() === 'status:archived ')).toBe(true);
  });

  it('shows the date picker in the sheet for a date field', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'created:');
    expect(await waitFor(() => barLabel() === 'Pick a date')).toBe(true);
    expect(q('.ei-datepicker')).toBeNull();

    await click(q('.ei-bar-open'));
    expect(await waitFor(() => q('.ei-sheet .ei-datepicker') !== null)).toBe(true);
    await click(q('.ei-sheet .ei-datepicker-day--today'));
    expect(await waitFor(() => /^created:\d{4}-\d{2}-\d{2} $/.test(api.getValue()))).toBe(true);
  });
});

describe("presentation: 'auto'", () => {
  it('floats at desktop width and uses the sheet below 640px', async () => {
    const { editor } = await setup({}, { presentation: 'auto' });
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => q('.ei-dropdown') !== null)).toBe(true);
    expect(q('.ei-bar')).toBeNull();
    await userEvent.keyboard('{Escape}');

    await page.viewport(375, 812);
    await pause(100);
    await userEvent.type(editor, 't');
    expect(await waitFor(() => q('.ei-bar') !== null)).toBe(true);
    expect(q('.ei-dropdown')).toBeNull();
  });

  it("'floating' stays floating at phone width", async () => {
    await page.viewport(375, 812);
    const { editor } = await setup({}, { presentation: 'floating' });
    await userEvent.type(editor, 'sta');
    expect(await waitFor(() => q('.ei-dropdown') !== null)).toBe(true);
    expect(q('.ei-bar')).toBeNull();
  });
});

describe("presentation: 'sheet' — the ⋯ menu", () => {
  const rows = () => qa('.ei-sheet .ei-action:not(.ei-action-segment)');
  const actions = () => rows().map(el => el.firstElementChild?.textContent ?? '');
  const SAVED = [{ query: '#vip' }, { query: '#new' }];
  const HISTORY = [{ query: 'status:active' }];

  it('opens a content-sized sheet; Clear empties the input and closes it', async () => {
    await page.viewport(375, 812);
    const { api, editor } = await setup();
    await userEvent.type(editor, 'sta');
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    expect(actions()).toEqual(['Clear']); // no saved searches or history configured
    expect(q('.ei-sheet')!.getBoundingClientRect().height).toBeLessThan(200);
    await click(rows()[0]);
    expect(await waitFor(() => api.getValue() === '' && q('.ei-sheet') === null)).toBe(true);
    expect(document.activeElement).toBe(q('.ei-editor'));
  });

  it('lists Saved searches and History when enabled; Saved searches inserts # after a space and opens the list', async () => {
    const { api, editor } = await setup({ savedSearches: SAVED, searchHistory: HISTORY });
    await userEvent.type(editor, 'sta');
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => actions().length === 3)).toBe(true);
    expect(actions()).toEqual(['Saved searches', 'History', 'Clear']);
    await click(rows()[0]);
    expect(await waitFor(() => api.getValue() === 'sta #')).toBe(true);
    expect(api.getSelection()).toEqual({ start: 5, end: 5 });
    expect(await waitFor(() => sheetItems().length === 2)).toBe(true);
    expect(sheetItems()[0]).toContain('#vip');
    expect(chips().length).toBe(2);
  });

  it('History inserts ! as-is at the start; Clear is disabled while empty', async () => {
    const { api } = await setup({ searchHistory: HISTORY });
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => actions().length === 2)).toBe(true);
    expect(actions()).toEqual(['History', 'Clear']);
    expect((rows()[1] as HTMLButtonElement).disabled).toBe(true);
    await click(rows()[0]);
    expect(await waitFor(() => api.getValue() === '!')).toBe(true);
    expect(await waitFor(() => sheetItems().length === 1)).toBe(true);
    expect(sheetItems()[0]).toContain('status:active');
  });

  it('a trigger inserted between terms gets a space on each side it needs, replacing a selection', async () => {
    const { api } = await setup({ savedSearches: SAVED });
    api.setValue('a bcd e');
    api.setSelection(2, 5); // "bcd"
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => actions().length === 2)).toBe(true);
    await click(rows()[0]);
    expect(await waitFor(() => api.getValue() === 'a # e')).toBe(true);
    expect(api.getSelection()).toEqual({ start: 3, end: 3 });
  });

  it('barActions follow the built-ins and receive the query and the api', async () => {
    const seen: string[] = [];
    const { api, editor } = await setup({
      barActions: [{ id: 'up', label: 'Uppercase', hint: 'Aa', onSelect: ({ query, api: a }) => { seen.push(query); a.setValue(query.toUpperCase()); } }],
    });
    await userEvent.type(editor, 'sta');
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => actions().length === 2)).toBe(true);
    expect(actions()).toEqual(['Clear', 'Uppercase']);
    expect(q('.ei-sheet .ei-action-hint')!.textContent).toBe('Aa');
    await click(rows()[1]);
    expect(await waitFor(() => api.getValue() === 'STA')).toBe(true);
    expect(seen).toEqual(['sta']);
    expect(q('.ei-sheet')).toBeNull();
  });

  it('the editing row: Cut copies and clears (one undo step), Copy writes the query, Select all selects it', async () => {
    const clip = { text: '', writeText: (t: string) => { clip.text = t; return Promise.resolve(); } };
    Object.defineProperty(navigator, 'clipboard', { value: clip, configurable: true });
    try {
      const { api, editor } = await setup();
      await click(q('.ei-bar-more'));
      expect(await waitFor(() => qa('.ei-action-segment').length === 3)).toBe(true);
      expect(qa('.ei-action-segment').map(el => el.textContent)).toEqual(['Cut', 'Copy', 'Select all']);
      expect(qa('.ei-action-segment').map(el => (el as HTMLButtonElement).disabled)).toEqual([true, true, true]); // empty input
      await userEvent.keyboard('{Escape}');
      expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
      await userEvent.type(editor, 'status:active');
      await click(q('.ei-bar-more'));
      expect(await waitFor(() => qa('.ei-action-segment').length === 3)).toBe(true);
      await click(qa('.ei-action-segment')[1]);
      expect(await waitFor(() => clip.text === 'status:active')).toBe(true);
      expect(q('.ei-sheet')).toBeNull();
      expect(api.getValue()).toBe('status:active');
      await click(q('.ei-bar-more'));
      expect(await waitFor(() => qa('.ei-action-segment').length === 3)).toBe(true);
      await click(qa('.ei-action-segment')[2]);
      expect(await waitFor(() => { const sel = api.getSelection(); return !!sel && sel.start === 0 && sel.end === 13; })).toBe(true);
      clip.text = '';
      await click(q('.ei-bar-more'));
      expect(await waitFor(() => qa('.ei-action-segment').length === 3)).toBe(true);
      await click(qa('.ei-action-segment')[0]);
      expect(await waitFor(() => api.getValue() === '' && clip.text === 'status:active')).toBe(true);
      expect(document.activeElement).toBe(q('.ei-editor'));
      await userEvent.keyboard('{Control>}z{/Control}');
      expect(await waitFor(() => api.getValue() === 'status:active')).toBe(true);
    } finally {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
  });

  it('closes on Escape (the list stays), on its ×, and on blur', async () => {
    const { api, editor } = await setup();
    await userEvent.type(editor, 'sta');
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(chips()).toEqual(['status']);
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    await click(q('.ei-sheet-close'));
    expect(await waitFor(() => q('.ei-sheet') === null)).toBe(true);
    expect(q('.ei-bar')).not.toBeNull();
    await click(q('.ei-bar-more'));
    expect(await waitFor(() => q('.ei-sheet') !== null)).toBe(true);
    api.blur();
    expect(await waitFor(() => q('.ei-sheet') === null && q('.ei-bar') === null)).toBe(true);
  });
});
