/**
 * A long suggestion list has to keep up with key repeat: the highlighted row
 * is scrolled into view in the same commit that highlights it, and a selection
 * change re-renders only the two rows whose highlight changed (§7.10).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { DropdownConfig, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pause, q, qa } from './helpers';

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 800);
});

const FIELDS: FieldConfig[] = [{ name: 'sku', type: 'string' }];
const SKUS = Array.from({ length: 500 }, (_, i) => ({ text: `SKU-${String(i + 1).padStart(5, '0')}`, type: 'value' }));
const fetchSkus = () => Promise.resolve(SKUS);
let badgeRenders = 0;
const countingBadge = (type: string) => { badgeRenders++; return type; };

const rows = (scope = '') => qa(`${scope} .ei-dropdown-item`.trim());
const selectedIndex = (scope = '') => rows(scope).findIndex(el => el.classList.contains('ei-dropdown-item--selected'));
/** True when the highlighted row sits inside the visible area of the element that scrolls it. */
function selectedInView(scope = ''): boolean {
  const sel = rows(scope).find(el => el.classList.contains('ei-dropdown-item--selected'));
  if (!sel) return false;
  const c = sel.parentElement!.getBoundingClientRect();
  const r = sel.getBoundingClientRect();
  return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
}

async function mount(dropdown: DropdownConfig = {}) {
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions: fetchSkus,
    dropdown: { maxSuggestions: 500, suggestDebounceMs: 0, ...dropdown },
  }));
  const editorEl = q('.ei-editor')!;
  await page.elementLocator(editorEl).click();
  await userEvent.type(editorEl, 'sku:');
  // Synchronous, like the events a held key queues up: the check right after
  // sees the DOM as a frame painted between two repeats would
  const press = (key: string) => editorEl.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
  return { editorEl, press };
}

describe('a 500-row list under key repeat', () => {
  it('the highlighted row is in view right after each synchronous Page Up or Page Down', async () => {
    const { press } = await mount();
    expect(await waitFor(() => rows().length === 500)).toBe(true);
    press('ArrowUp'); // wraps to the last row
    expect(selectedIndex()).toBe(499);
    expect(selectedInView()).toBe(true);

    let stale = 0; let last = 499;
    for (let i = 0; i < 40; i++) {
      press('PageUp');
      const idx = selectedIndex();
      expect(idx).toBeLessThan(last); last = idx;
      if (!selectedInView()) stale++;
    }
    expect(stale).toBe(0);
    expect(last).toBeLessThan(200);

    for (let i = 0; i < 40; i++) {
      press('PageDown');
      const idx = selectedIndex();
      expect(idx).toBeGreaterThan(last); last = idx;
      if (!selectedInView()) stale++;
    }
    expect(stale).toBe(0);
    expect(last).toBe(499);
  });

  it('the sheet keeps the highlighted row in view right after a synchronous key press', async () => {
    await page.viewport(375, 812);
    const { press } = await mount({ presentation: 'sheet', showOperators: false });
    expect(await waitFor(() => qa('.ei-chip').length > 0)).toBe(true);
    await page.elementLocator(q('.ei-bar-open')!).click();
    expect(await waitFor(() => rows('.ei-sheet').length === 500)).toBe(true);

    press('ArrowUp');
    expect(selectedIndex('.ei-sheet')).toBe(499);
    expect(selectedInView('.ei-sheet')).toBe(true);
    let stale = 0;
    for (let i = 0; i < 20; i++) {
      press('PageUp');
      if (!selectedInView('.ei-sheet')) stale++;
    }
    expect(stale).toBe(0);
    expect(selectedIndex('.ei-sheet')).toBeLessThan(499);
  });

  it('a selection change re-renders only the rows whose highlight changed', async () => {
    const { press } = await mount({ renderType: countingBadge });
    expect(await waitFor(() => qa('.ei-dropdown-item-type').length === 500)).toBe(true);
    await pause(100);

    badgeRenders = 0;
    press('ArrowUp'); // nothing highlighted → the last row
    await pause(50);
    expect(badgeRenders).toBe(1);

    badgeRenders = 0;
    press('ArrowUp'); // one row loses the highlight, one gains it
    await pause(50);
    expect(badgeRenders).toBe(2);

    badgeRenders = 0;
    press('PageUp');
    await pause(50);
    expect(badgeRenders).toBe(2);
  });
});
