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

const FIELDS: FieldConfig[] = [{ name: 'is_vip', type: 'boolean' }];

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
  // Known bug (pre-existing, unfixed): after `field: ` the context token is the
  // colon itself, the suggestion's replace range covers it, and accepting eats
  // the colon (`is_viptrue `). it.fails until fixed.
  it.fails('accepting a value after `field: ` keeps the colon', async () => {
    const { editor, getValue } = setup();
    await editor.click();
    await userEvent.type(editor, 'is_vip: ');
    expect(await waitFor(() => dropdownText().includes('true'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await waitFor(() => getValue().includes('true'))).toBe(true);
    expect(getValue()).toBe('is_vip:true ');
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
