/**
 * Enter while the date picker is open. Typing a complete range leaves the
 * caret at `]|`, which is still RANGE context (the picker stays open); Enter
 * must submit like it does with the suggestion dropdown open and nothing
 * selected — not fall through to the browser's newline insertion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI } from '../../types';
import { getCaretCharOffset } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const QUERY = 'created:[2026-09-01 TO 2026-09-16]';

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

async function typeRangeWithPickerOpen() {
  const searches: string[] = [];
  let api: ElasticInputAPI | null = null;
  renderInto(React.createElement(ElasticInput, {
    fields: [{ name: 'created', type: 'date' }],
    onSearch: (q: string) => searches.push(q),
    inputRef: (a: ElasticInputAPI) => { api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  await page.elementLocator(editorEl).click();
  await userEvent.type(page.elementLocator(editorEl), QUERY.replace('[', '[['));
  expect(await waitFor(() => document.querySelector('.ei-datepicker') !== null)).toBe(true);
  expect(getCaretCharOffset(editorEl)).toBe(QUERY.length); // caret at `]|`
  return { editorEl, searches, getValue: () => api!.getValue() };
}

describe('Enter with the date picker open', () => {
  it('submits the query instead of inserting a newline', async () => {
    const { searches, getValue } = await typeRangeWithPickerOpen();
    await userEvent.keyboard('{Enter}');
    await new Promise(r => setTimeout(r, 100));
    expect(getValue()).toBe(QUERY); // no inserted newline
    expect(searches).toEqual([QUERY]);
  });

  it('closes the picker and leaves the caret where it was', async () => {
    const { editorEl, getValue } = await typeRangeWithPickerOpen();
    await userEvent.keyboard('{Enter}');
    await new Promise(r => setTimeout(r, 100));
    expect(document.querySelector('.ei-datepicker')).toBeNull();
    expect(getValue()).toBe(QUERY);
    expect((editorEl.textContent ?? '').includes('\n')).toBe(false);
  });
});
