/**
 * dropdown.renderNoResults fires only when a suggestion source was actually
 * searched and came back empty: an async fetch that returned nothing, or one
 * of the engine's own lists (field names, boolean values, …). It must not
 * fire where nothing was searched — a field with `suggestions: false`, any
 * field value when no `fetchSuggestions` is provided, or inside a range.
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

/** Long enough for every sync and async path to have settled. */
const settle = () => new Promise(r => setTimeout(r, 400));

function setup(opts: { fetch: boolean }) {
  const calls: CursorContext[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    ...(opts.fetch ? { fetchSuggestions: () => Promise.resolve([]) } : {}),
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

describe('renderNoResults — shown when a source was searched and came back empty', () => {
  it('an async fetch that returns nothing', async () => {
    const { editor } = setup({ fetch: true });
    await editor.click();
    await userEvent.type(editor, 'status:zzz');
    expect(await waitFor(() => document.querySelector(NO_RESULTS) !== null)).toBe(true);
  });

  it('a boolean value miss (built-in true/false list)', async () => {
    const { editor } = setup({ fetch: true });
    await editor.click();
    await userEvent.type(editor, 'is_vip:x');
    expect(await waitFor(() => document.querySelector(NO_RESULTS) !== null)).toBe(true);
  });

  it('a field-name miss, even with no fetchSuggestions at all', async () => {
    const { editor } = setup({ fetch: false });
    await editor.click();
    await userEvent.type(editor, 'zzz');
    expect(await waitFor(() => document.querySelector(NO_RESULTS) !== null)).toBe(true);
  });
});

describe('renderNoResults — not shown where nothing was searched', () => {
  it('the value of a field with suggestions: false', async () => {
    const { editor, calls } = setup({ fetch: true });
    await editor.click();
    await userEvent.type(editor, 'notes:abc');
    await settle();
    expect(document.querySelector(NO_RESULTS)).toBeNull();
    expect(calls.some(c => c.type === 'FIELD_VALUE' && c.fieldName === 'notes')).toBe(false);
  });

  it('any non-boolean field value when no fetchSuggestions is provided', async () => {
    const { editor, calls } = setup({ fetch: false });
    await editor.click();
    await userEvent.type(editor, 'status:zzz');
    await settle();
    expect(document.querySelector(NO_RESULTS)).toBeNull();
    expect(calls.some(c => c.type === 'FIELD_VALUE')).toBe(false);
  });

  it('inside a range on a non-date field', async () => {
    const { editor, calls } = setup({ fetch: true });
    await editor.click();
    // `[[` types a literal `[` (userEvent key-descriptor syntax)
    await userEvent.type(editor, 'status:[[a TO b]');
    await settle();
    expect(document.querySelector(NO_RESULTS)).toBeNull();
    expect(calls.some(c => c.type === 'RANGE')).toBe(false);
  });
});
