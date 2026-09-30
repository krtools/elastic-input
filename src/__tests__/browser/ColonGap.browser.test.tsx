/**
 * Autocomplete when the caret is separated from the colon / next value by
 * whitespace (`field: |`, `field:| value`).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'is_vip', type: 'boolean' },
  { name: 'created', type: 'date' },
];

/** The 15th of the month currently shown in the open date picker. */
function day15(): HTMLElement {
  const el = Array.from(document.querySelectorAll('.ei-datepicker-day:not(.ei-datepicker-day--other-month)'))
    .find(b => b.textContent === '15');
  if (!el) throw new Error('day 15 not found');
  return el as HTMLElement;
}

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const dropdownText = () => document.querySelector('.ei-dropdown')?.textContent ?? '';

function setup() {
  let api: ElasticInputAPI | null = null;
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    inputRef: (a: ElasticInputAPI) => { api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { editor: page.elementLocator(editorEl), getValue: () => api!.getValue() };
}

describe('caret separated from the colon by whitespace', () => {
  // Regression: the context token used to be the colon itself, so the
  // suggestion replaced it (`is_viptrue `).
  it('accepting a value after `field: ` inserts at the caret and keeps the colon and the gap', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'is_vip: ');
    expect(await waitFor(() => dropdownText().includes('true'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await waitFor(() => getValue().includes('true'))).toBe(true);
    expect(getValue()).toBe('is_vip: true ');
  });

  it('caret in the middle of a gap inserts there, leaving the rest untouched', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'is_vip:  asdf');
    // `is_vip: | asdf` — between the two spaces
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(await waitFor(() => dropdownText().includes('true'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await waitFor(() => getValue().includes('true'))).toBe(true);
    expect(getValue()).toBe('is_vip: true asdf');
  });

  it('date picker after `field: ` inserts the date at the caret', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'created: ');
    expect(await waitFor(() => document.querySelector('.ei-datepicker') !== null)).toBe(true);

    await page.elementLocator(day15()).click();
    expect(await waitFor(() => /15/.test(getValue()))).toBe(true);
    expect(getValue()).toMatch(/^created: \d{4}-\d{2}-15 $/);
  });

  // Regression: the token reported after `field:>` was the colon, so the date
  // was inserted before the operator (`created:2026-09-15>`).
  it('date picker after a comparison operator inserts the date after it', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'created:>');
    expect(await waitFor(() => document.querySelector('.ei-datepicker') !== null)).toBe(true);

    await page.elementLocator(day15()).click();
    expect(await waitFor(() => /15/.test(getValue()))).toBe(true);
    expect(getValue()).toMatch(/^created:>\d{4}-\d{2}-15 $/);
  });

  it('`field:| value` offers the unfiltered list and inserts at the caret', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'is_vip: asdf');
    // Caret back to right after the colon: `is_vip:| asdf`
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(await waitFor(() => dropdownText().includes('true') && dropdownText().includes('false'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await waitFor(() => getValue().includes('true'))).toBe(true);
    expect(getValue()).toBe('is_vip:true asdf');
  });
});
