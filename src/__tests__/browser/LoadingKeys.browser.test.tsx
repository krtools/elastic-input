/**
 * Tab/Enter behavior while dropdown content is still loading:
 * - async `fields` not yet resolved (engine knows nothing)
 * - async value suggestions in flight (spinner / debounce window)
 *
 * Tab must not kick focus out of the input while a completion for the
 * partial being typed may still arrive; Enter keeps meaning "search what I
 * typed" but must not leave ghost dropdowns or wipe the partial via an
 * arrow-selected inert item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig, SuggestionItem } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'source', label: 'Source', type: 'string' },
  { name: 'status', label: 'Status', type: 'string' },
];

const EDITOR = '.ei-editor';
const DROPDOWN = '.ei-dropdown';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  timeout = 3000,
  interval = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function dropdownVisible(): boolean {
  const el = document.querySelector(DROPDOWN);
  return el !== null && (el as HTMLElement).offsetParent !== null;
}

function dropdownText(): string {
  return document.querySelector(DROPDOWN)?.textContent ?? '';
}

function editorEl(): HTMLElement {
  return document.querySelector(EDITOR) as HTMLElement;
}

describe('Tab while async fields are loading', () => {
  it('blocks Tab mid-partial, then completes once fields arrive', async () => {
    const d = deferred<FieldConfig[]>();
    renderInto(
      React.createElement(ElasticInput, { fields: () => d.promise }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'sourc');
    expect(editorEl().textContent).toBe('sourc');

    // Fields still loading: Tab must not steal focus or change the text
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(editorEl());
    expect(editorEl().textContent).toBe('sourc');

    // Fields arrive: the suggestion for the pending partial surfaces on its own
    d.resolve(FIELDS);
    expect(await waitFor(() => dropdownVisible() && dropdownText().toLowerCase().includes('source'))).toBe(true);

    // Now Tab behaves exactly as if the fields had been loaded all along
    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => editorEl().textContent === 'source:')).toBe(true);
    expect(document.activeElement).toBe(editorEl());
  });

  it('does not block Tab from an empty input (no keyboard trap)', async () => {
    const d = deferred<FieldConfig[]>();
    renderInto(
      React.createElement(ElasticInput, { fields: () => d.promise }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(editorEl());
  });

  it('does not block Tab after the fields loader rejects', async () => {
    const d = deferred<FieldConfig[]>();
    renderInto(
      React.createElement(ElasticInput, { fields: () => d.promise }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'sourc');

    d.reject(new Error('fields backend down'));
    await new Promise(r => setTimeout(r, 100));

    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).not.toBe(editorEl());
  });

  it('Enter still submits the raw partial while fields load', async () => {
    const d = deferred<FieldConfig[]>();
    const searches: string[] = [];
    renderInto(
      React.createElement(ElasticInput, {
        fields: () => d.promise,
        onSearch: (q: string) => searches.push(q),
      }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'sourc');
    await userEvent.keyboard('{Enter}');

    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('sourc');
  });
});

describe('Tab/Enter while async value suggestions are in flight', () => {
  function setup(opts: { loadingDelay?: number } = {}) {
    const d = deferred<SuggestionItem[]>();
    const searches: string[] = [];
    let api: ElasticInputAPI | null = null;
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        fetchSuggestions: () => d.promise,
        onSearch: (q: string) => searches.push(q),
        inputRef: (a: ElasticInputAPI) => { api = a; },
        dropdown: { suggestDebounceMs: 0, loadingDelay: opts.loadingDelay ?? 0 },
      }),
    );
    return { d, searches, getApi: () => api! };
  }

  it('blocks Tab while the spinner shows, then accepts once results land', async () => {
    const { d } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:act');
    expect(await waitFor(() => dropdownText().includes('Searching'))).toBe(true);

    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(editorEl());
    expect(editorEl().textContent).toBe('status:act');

    d.resolve([{ text: 'active' }, { text: 'inactive' }]);
    expect(await waitFor(() => dropdownText().includes('active') && !dropdownText().includes('Searching'))).toBe(true);

    // Partial match auto-selects the first result — Tab accepts it
    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => editorEl().textContent === 'status:active ')).toBe(true);
  });

  it('ArrowDown onto the spinner + Tab does not wipe the partial', async () => {
    const { d } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:act');
    expect(await waitFor(() => dropdownText().includes('Searching'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Tab}');
    expect(editorEl().textContent).toBe('status:act');
    expect(document.activeElement).toBe(editorEl());
    d.resolve([]);
  });

  it('ArrowDown onto the spinner + Enter submits the raw query intact', async () => {
    const { d, searches } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:act');
    expect(await waitFor(() => dropdownText().includes('Searching'))).toBe(true);

    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');

    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('status:act');
    expect(editorEl().textContent).toBe('status:act');
  });

  it('Enter during the silent debounce window leaves no ghost dropdown behind', async () => {
    // Large loadingDelay: fetch is in flight but no spinner yet — dropdown closed
    const { d, searches } = setup({ loadingDelay: 5000 });

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:');
    // Escape clears the stale field-name suggestion so the silent window
    // genuinely has a closed dropdown (nothing selected to type-ahead accept)
    await userEvent.keyboard('{Escape}');
    await userEvent.type(editor, 'act');
    // Give the 0ms debounce a beat to start the fetch; spinner is 5s away
    await new Promise(r => setTimeout(r, 50));
    expect(dropdownVisible()).toBe(false);

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('status:act');

    // The fetch resolving afterwards must not pop the dropdown open,
    // and the pending spinner timer must not fire either
    d.resolve([{ text: 'active' }]);
    await new Promise(r => setTimeout(r, 200));
    expect(dropdownVisible()).toBe(false);
  });
});
