/**
 * dropdown.renderNoResults must not fire for a field that opted out of
 * suggestions (`suggestions: false`) — nothing was searched, so there are no
 * "results" to report as missing.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { CursorContext } from '../../parser/Parser';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'notes', type: 'string', suggestions: false },
  { name: 'is_vip', type: 'boolean', suggestions: false },
];

const NO_RESULTS = '.ei-dropdown-item--no-results';

async function waitFor(fn: () => boolean, timeout = 2000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

function setup() {
  const calls: CursorContext[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions: () => Promise.resolve([]),
    dropdown: {
      suggestDebounceMs: 0,
      renderNoResults: ({ cursorContext }: { cursorContext: CursorContext }) => {
        calls.push(cursorContext);
        return React.createElement('span', null, 'No matches');
      },
    },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { editor: page.elementLocator(editorEl), calls };
}

describe('renderNoResults', () => {
  it('is not shown for the value of a field with suggestions: false', async () => {
    const { editor, calls } = setup();
    await editor.click();
    await userEvent.type(editor, 'notes:abc');
    // Give every sync and async path time to settle
    await new Promise(r => setTimeout(r, 400));

    expect(document.querySelector(NO_RESULTS)).toBeNull();
    expect(calls.some(c => c.type === 'FIELD_VALUE' && c.fieldName === 'notes')).toBe(false);
  });

  it('is still shown when a fetched field returns nothing', async () => {
    const { editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'status:zzz');
    expect(await waitFor(() => document.querySelector(NO_RESULTS) !== null)).toBe(true);
  });

  it('is still shown for a boolean miss, since booleans have a built-in list', async () => {
    const { editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'is_vip:x');
    expect(await waitFor(() => document.querySelector(NO_RESULTS) !== null)).toBe(true);
  });
});
