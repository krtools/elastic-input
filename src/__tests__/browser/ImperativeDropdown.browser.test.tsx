/**
 * Imperative dropdown control: api.openDropdown() is the Ctrl+Space action,
 * api.closeDropdown() dismisses the dropdown or date picker, and
 * api.acceptSuggestion() accepts the highlighted suggestion without
 * submitting (the default Tab action).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { DropdownConfig, DropdownOpenContext, ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'created', type: 'date' },
];

const fetchStatus = (_field: string, partial: string) =>
  Promise.resolve(['active', 'archived'].filter(v => v.startsWith(partial)).map(text => ({ text })));

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** Long enough for every sync and async dropdown path to have settled. */
const settle = () => new Promise(r => setTimeout(r, 400));

const items = () => Array.from(document.querySelectorAll('.ei-dropdown-item'));
const labels = () => items().map(el => el.textContent ?? '');
const selectedLabel = () => document.querySelector('.ei-dropdown-item--selected')?.textContent ?? null;
const isOpen = () => items().length > 0;

function setup(props: Partial<ElasticInputProps> = {}, dropdown: DropdownConfig = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  const searches: string[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions: fetchStatus,
    onSearch: (q: string) => { searches.push(q); },
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    dropdown: { suggestDebounceMs: 0, ...dropdown },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { handle, searches, editorEl, editor: page.elementLocator(editorEl) };
}

/** Type `status:act` and wait for the fetched `active` value to be highlighted. */
async function typeToHighlightedValue(editor: ReturnType<typeof page.elementLocator>) {
  await editor.click();
  await userEvent.type(editor, 'status:act');
  expect(await waitFor(() => selectedLabel()?.includes('active') === true)).toBe(true);
}

describe('api.openDropdown', () => {
  it("opens in 'manual' mode, where typing alone does not", async () => {
    const { handle, editor } = setup({}, { open: 'manual' });
    await editor.click();
    await userEvent.type(editor, 'st');
    await settle();
    expect(isOpen()).toBe(false);

    handle.api!.openDropdown();
    expect(await waitFor(() => labels().some(l => l.includes('status')))).toBe(true);
  });

  it('called from onSearch, brings the dropdown back after Enter accepts and submits', async () => {
    const { handle, searches, editor } = setup({
      onSearch: (q: string) => { searches.push(q); handle.api!.openDropdown(); },
    });
    await typeToHighlightedValue(editor);

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('status:active ');
    // Suggestions for the new caret position (after the trailing space)
    expect(await waitFor(() => labels().some(l => l.includes('created')))).toBe(true);
    expect(selectedLabel()).toBeNull();

    // Nothing highlighted, so the next Enter submits again rather than accepting
    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 2)).toBe(true);
    expect(searches[1]).toBe('status:active ');
  });

  it('without it, the dropdown stays closed after Enter accepts and submits', async () => {
    const { searches, editor } = setup();
    await typeToHighlightedValue(editor);

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    await settle();
    expect(isOpen()).toBe(false);
  });

  it('uses the live caret after api.setValue in the same tick', async () => {
    const { handle, searches, editor } = setup({
      onSearch: (q: string) => {
        searches.push(q);
        handle.api!.setValue('status:');
        handle.api!.openDropdown();
      },
    });
    await editor.click();
    await userEvent.type(editor, 'foo bar');
    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    // Caret is clamped to the end of the new, shorter value: status values
    expect(await waitFor(() => labels().some(l => l.includes('archived')))).toBe(true);
  });

  it("reports trigger 'ctrlSpace' to a dropdown.open callback", async () => {
    const triggers: string[] = [];
    const open = (ctx: DropdownOpenContext) => {
      triggers.push(ctx.trigger);
      return ctx.trigger === 'ctrlSpace' ? null : false;
    };
    const { handle, editor } = setup({}, { open });
    await editor.click();
    await userEvent.type(editor, 'st');
    await settle();
    expect(isOpen()).toBe(false);

    handle.api!.openDropdown();
    expect(await waitFor(() => labels().some(l => l.includes('status')))).toBe(true);
    expect(triggers[triggers.length - 1]).toBe('ctrlSpace');
  });

  it("does nothing when dropdown.open is 'never'", async () => {
    const { handle, editor } = setup({}, { open: 'never' });
    await editor.click();
    await userEvent.type(editor, 'st');
    handle.api!.openDropdown();
    await settle();
    expect(isOpen()).toBe(false);
  });

  it('does nothing when the input is not focused', async () => {
    const { handle, editorEl } = setup({ defaultValue: 'st' });
    expect(document.activeElement).not.toBe(editorEl);
    handle.api!.openDropdown();
    await settle();
    expect(isOpen()).toBe(false);
  });
});

describe('api.closeDropdown', () => {
  it('closes the suggestion dropdown', async () => {
    const { handle, editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'st');
    expect(await waitFor(isOpen)).toBe(true);

    handle.api!.closeDropdown();
    expect(await waitFor(() => !isOpen())).toBe(true);
  });

  it('closes the date picker', async () => {
    const { handle, editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'created:');
    expect(await waitFor(() => document.querySelector('.ei-datepicker') !== null)).toBe(true);

    handle.api!.closeDropdown();
    expect(await waitFor(() => document.querySelector('.ei-datepicker') === null)).toBe(true);
  });
});

describe('api.acceptSuggestion', () => {
  it('accepts a highlighted field name', async () => {
    const { handle, searches, editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'st');
    expect(await waitFor(() => selectedLabel()?.includes('status') === true)).toBe(true);

    expect(handle.api!.acceptSuggestion()).toBe(true);
    expect(handle.api!.getValue()).toBe('status:');
    await settle();
    expect(searches).toEqual([]);
  });

  it('accepts a highlighted value with a trailing space and does not submit', async () => {
    const { handle, searches, editor } = setup();
    await typeToHighlightedValue(editor);

    expect(handle.api!.acceptSuggestion()).toBe(true);
    expect(handle.api!.getValue()).toBe('status:active ');
    await settle();
    expect(searches).toEqual([]);
    // Like Tab: suggestions continue at the new caret position
    expect(labels().some(l => l.includes('created'))).toBe(true);
  });

  it('returns false and changes nothing when no suggestion is highlighted', async () => {
    const { handle, editor } = setup();
    expect(handle.api!.acceptSuggestion()).toBe(false); // dropdown closed

    await editor.click();
    await userEvent.type(editor, 'status:active ');
    expect(await waitFor(isOpen)).toBe(true);
    expect(selectedLabel()).toBeNull();
    expect(handle.api!.acceptSuggestion()).toBe(false); // open, nothing highlighted
    expect(handle.api!.getValue()).toBe('status:active ');
  });

  it('returns false for a highlighted inert item', async () => {
    const { handle, editor } = setup({}, {
      renderNoResults: () => React.createElement('span', null, 'No matches'),
    });
    await editor.click();
    await userEvent.type(editor, 'status:zzz');
    expect(await waitFor(() => document.querySelector('.ei-dropdown-item--no-results') !== null)).toBe(true);
    await userEvent.keyboard('{ArrowDown}');

    expect(handle.api!.acceptSuggestion()).toBe(false);
    expect(handle.api!.getValue()).toBe('status:zzz');
  });

  it('from onKeyDown: Enter accepts without submitting, and the API reads are already current', async () => {
    const seen: { value: string; ast: string; errors: number }[] = [];
    const { handle, searches, editor } = setup({
      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
        const api = handle.api!;
        if (e.key === 'Enter' && api.acceptSuggestion()) {
          e.preventDefault();
          seen.push({
            value: api.getValue(),
            ast: JSON.stringify(api.getAST()),
            errors: api.getValidationErrors().length,
          });
        }
      },
    });
    await typeToHighlightedValue(editor);

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => seen.length === 1)).toBe(true);
    expect(seen[0].value).toBe('status:active ');
    expect(seen[0].ast).toContain('"active"');
    expect(seen[0].errors).toBe(0);
    await settle();
    expect(searches).toEqual([]);

    // Nothing highlighted now, so Enter falls through to the normal submit
    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('status:active ');
  });
});
