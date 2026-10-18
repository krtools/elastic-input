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
  it('is there while focused, says "No suggestions" when empty, and never shows the floating dropdown', async () => {
    const { api } = await setup();
    expect(await waitFor(() => q('.ei-bar') !== null)).toBe(true);
    expect(barLabel()).toBe('No suggestions');
    expect(chips()).toEqual([]);
    expect(q('.ei-dropdown')).toBeNull();

    api.blur();
    expect(await waitFor(() => q('.ei-bar') === null)).toBe(true);
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
    expect(getComputedStyle(strip).touchAction).toBe('pan-x');
  });

  it("in 'manual' mode the button requests suggestions, like Ctrl+Space", async () => {
    const { editor } = await setup({}, { open: 'manual' });
    await userEvent.type(editor, 'sta');
    await pause(200);
    expect(barLabel()).toBe('No suggestions');

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
    const r = q('.ei-sheet')!.getBoundingClientRect();
    expect(r.top).toBeLessThanOrEqual(60);
    expect(r.bottom).toBeGreaterThanOrEqual(window.innerHeight - 1);
    expect(r.width).toBeGreaterThanOrEqual(window.innerWidth - 1);
    expect(q('.ei-sheet-detail')!.textContent).toBe('sta');
    expect(q('.ei-sheet-backdrop')).not.toBeNull();
    expect(sheetItems()).toEqual(['statusstring']);
    expect(q('.ei-sheet .ei-dropdown-item')!.getBoundingClientRect().height).toBeGreaterThanOrEqual(48);
    expect(document.activeElement).toBe(q('.ei-editor'));
  });

  it('accepts on tap and stays mounted for the next step (no remount flicker)', async () => {
    const { api, editor } = await setup();
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
    expect(document.activeElement).toBe(q('.ei-editor'));
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
    expect(barLabel()).toBe('No suggestions');
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
