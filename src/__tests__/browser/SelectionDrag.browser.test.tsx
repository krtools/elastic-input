/**
 * Dragging after a double- or triple-click extends the selection by words or
 * clauses, and the drag's end syncs the component as a click does (§5.3,
 * §5.3.1). The gesture itself is covered in RangeDrag.browser.test.tsx.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig, SuggestionItem } from '../../types';
import { countOffsetTo } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pointAt, mouseAt, q } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'a', type: 'number' },
  { name: 'b', type: 'number' },
  { name: 'c', type: 'number' },
];
const fetchSuggestions = (field: string): Promise<SuggestionItem[]> =>
  Promise.resolve(field === 'status' ? [{ text: 'active' }, { text: 'lead' }] : []);

async function setup(text: string) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions,
    dropdown: { open: 'always' },
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  await page.elementLocator(editorEl).click();
  await userEvent.type(page.elementLocator(editorEl), text);
  expect(await waitFor(() => handle.api?.getValue() === text)).toBe(true);
  return { editorEl, api: () => handle.api! };
}

const selected = () => window.getSelection()?.toString() ?? '';
const isOpen = () => q('.ei-dropdown') != null;
/** Character offset of the selection's focus (the end a Shift+Arrow moves). */
function focusOffset(el: HTMLElement): number {
  const sel = window.getSelection()!;
  return countOffsetTo(el, sel.focusNode!, sel.focusOffset);
}

/** One click of a multi-click sequence at `offset`: mousedown with `detail`, mouseup, click. */
function click(editorEl: HTMLElement, offset: number, detail: number): boolean {
  const p = pointAt(editorEl, offset);
  const allowed = mouseAt(editorEl, 'mousedown', p, { detail });
  mouseAt(editorEl, 'mouseup', p, { detail });
  mouseAt(editorEl, 'click', p, { detail });
  return allowed;
}
/** The mousedown of a drag's start; false when the component took it over. */
const press = (editorEl: HTMLElement, offset: number, detail: number) =>
  mouseAt(editorEl, 'mousedown', pointAt(editorEl, offset), { detail });
const drag = (editorEl: HTMLElement, offset: number) =>
  mouseAt(document, 'mousemove', pointAt(editorEl, offset), { buttons: 1 });
/** A release over the editor, which the browser follows with a click. */
function release(editorEl: HTMLElement, offset: number, detail: number) {
  const p = pointAt(editorEl, offset);
  mouseAt(editorEl, 'mouseup', p, { detail });
  mouseAt(editorEl, 'click', p, { detail });
}

describe('double-click drag', () => {
  it('extends the selection by whole words', async () => {
    const { editorEl } = await setup('status:active lead now');
    click(editorEl, 9, 1);
    expect(press(editorEl, 9, 2)).toBe(false);
    expect(selected()).toBe('active');
    drag(editorEl, 15);
    expect(selected()).toBe('active lead');
    drag(editorEl, 20);
    expect(selected()).toBe('active lead now');
    drag(editorEl, 15);
    expect(selected()).toBe('active lead');
    release(editorEl, 15, 2);
    expect(selected()).toBe('active lead');
  });

  it('closes the dropdown once the selection spans several tokens', async () => {
    const { editorEl } = await setup('status:active lead now');
    click(editorEl, 9, 1);
    click(editorEl, 9, 2); // value suggestions for the one selected token
    expect(await waitFor(isOpen)).toBe(true);

    press(editorEl, 9, 2);
    drag(editorEl, 15);
    release(editorEl, 15, 2);
    expect(await waitFor(() => !isOpen())).toBe(true);
  });

  it('puts the selection focus at the left end when dragging leftwards', async () => {
    const { editorEl } = await setup('status:active lead now');
    click(editorEl, 15, 1);
    press(editorEl, 15, 2);
    drag(editorEl, 9);
    release(editorEl, 9, 2);
    expect(selected()).toBe('active lead');
    expect(focusOffset(editorEl)).toBe(7);

    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
    expect(selected()).toBe(':active lead');
  });

  it('selects to the end of the text when dragged past the editor edge', async () => {
    const { editorEl } = await setup('status:active lead now');
    click(editorEl, 9, 1);
    click(editorEl, 9, 2);
    expect(await waitFor(isOpen)).toBe(true);

    press(editorEl, 9, 2);
    const box = editorEl.getBoundingClientRect();
    const outside = { x: box.right + 60, y: box.top + box.height / 2 };
    mouseAt(document, 'mousemove', outside, { buttons: 1 });
    expect(selected()).toBe('active lead now');
    // Released beside the editor: no click follows, the drag's end syncs
    mouseAt(document.body, 'mouseup', outside);
    expect(await waitFor(() => !isOpen())).toBe(true);
    expect(selected()).toBe('active lead now');
  });

  it('leaves a single-click drag to the browser', async () => {
    const { editorEl } = await setup('status:active lead now');
    expect(press(editorEl, 9, 1)).toBe(true);
    mouseAt(editorEl, 'mouseup', pointAt(editorEl, 9));
  });
});

describe('triple-click drag', () => {
  it('extends the selection by clauses and keeps one connector', async () => {
    const { editorEl, api } = await setup('a:1 AND b:2 AND c:3');
    click(editorEl, 10, 1);
    click(editorEl, 10, 2);
    expect(press(editorEl, 10, 3)).toBe(false);
    expect(selected()).toBe('b:2 AND ');
    drag(editorEl, 17);
    expect(selected()).toBe(' AND b:2 AND c:3');
    release(editorEl, 17, 3);

    await userEvent.keyboard('{Backspace}');
    expect(await waitFor(() => api().getValue() === 'a:1')).toBe(true);
  });

  it('extends nothing while the pointer is between clauses', async () => {
    const { editorEl } = await setup('a:1 AND b:2 AND c:3');
    click(editorEl, 10, 1);
    click(editorEl, 10, 2);
    press(editorEl, 10, 3);
    drag(editorEl, 13); // on the second AND
    expect(selected()).toBe('b:2 AND ');
    release(editorEl, 13, 3);
  });
});
