/**
 * onAcceptSuggestion fires just before a suggestion is inserted, whichever
 * way it was accepted. Returning false skips the default insert so the
 * handler can make the edit itself with api.set(); the rest of the accept
 * (Enter's submit, api.submit's search) still runs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { AcceptSuggestionContext, ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { getSelectionCharRange } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'complex', type: 'string' },
  { name: 'status', type: 'string' },
];

const VALUES: Record<string, string[]> = {
  complex: ['alpha', 'beta'],
  status: ['active', 'archived'],
};

const fetchValues = (field: string, partial: string) =>
  Promise.resolve((VALUES[field] ?? []).filter(v => v.startsWith(partial)).map(text => ({ text })));

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const items = () => Array.from(document.querySelectorAll('.ei-dropdown-item')) as HTMLElement[];
const labels = () => items().map(el => el.textContent ?? '');
const selectedLabel = () => document.querySelector('.ei-dropdown-item--selected')?.textContent ?? null;

type Handler = (ctx: AcceptSuggestionContext, api: ElasticInputAPI) => boolean | void;

function setup(handler: Handler, props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  const calls: AcceptSuggestionContext[] = [];
  const changes: string[] = [];
  const searches: string[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    fetchSuggestions: fetchValues,
    dropdown: { suggestDebounceMs: 0 },
    onChange: (q: string) => { changes.push(q); },
    onSearch: (q: string) => { searches.push(q); },
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    onAcceptSuggestion: (ctx: AcceptSuggestionContext) => {
      calls.push(ctx);
      return handler(ctx, handle.api!);
    },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { handle, calls, changes, searches, editorEl, editor: page.elementLocator(editorEl) };
}

/** Wraps the value of the `complex` field in parens, caret between them. */
const encloseComplex: Handler = ({ suggestion, cursorContext, query }, api) => {
  if (cursorContext.type !== 'FIELD_NAME' || suggestion.text !== 'complex:') return;
  const head = query.slice(0, suggestion.replaceStart) + 'complex:(';
  api.set({ value: head + ')' + query.slice(suggestion.replaceEnd), selection: head.length });
  return false;
};

async function typeToHighlighted(editor: ReturnType<typeof page.elementLocator>, text: string, label: string) {
  await editor.click();
  await userEvent.type(editor, text);
  expect(await waitFor(() => selectedLabel()?.includes(label) === true)).toBe(true);
}

describe('onAcceptSuggestion — notification', () => {
  it('receives the suggestion, cursor context, query and replace range; no return keeps the default insert', async () => {
    const { handle, calls, editor } = setup(() => undefined);
    await typeToHighlighted(editor, 'foo sta', 'status');

    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => handle.api!.getValue() === 'foo status:')).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].suggestion.text).toBe('status:');
    expect(calls[0].suggestion.replaceStart).toBe(4);
    expect(calls[0].suggestion.replaceEnd).toBe(7);
    expect(calls[0].cursorContext.type).toBe('FIELD_NAME');
    expect(calls[0].query).toBe('foo sta');
  });

  it('fires for Enter, a click, and api.acceptSuggestion()', async () => {
    const { handle, calls, editor } = setup(() => undefined);

    await typeToHighlighted(editor, 'sta', 'status');
    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:')).toBe(true);
    expect(calls.length).toBe(1);

    // Value suggestions for status: click one
    expect(await waitFor(() => labels().some(l => l.includes('archived')))).toBe(true);
    await page.elementLocator(items().find(el => el.textContent?.includes('archived'))!).click();
    expect(await waitFor(() => handle.api!.getValue() === 'status:archived ')).toBe(true);
    expect(calls.length).toBe(2);
    expect(calls[1].cursorContext.type).toBe('FIELD_VALUE');
    expect(calls[1].cursorContext.fieldName).toBe('status');

    await userEvent.type(editor, 'comp');
    expect(await waitFor(() => selectedLabel()?.includes('complex') === true)).toBe(true);
    expect(handle.api!.acceptSuggestion()).toBe(true);
    expect(calls.length).toBe(3);
    expect(calls[2].suggestion.text).toBe('complex:');
  });

  it('passes the triggering event: key press, click, or none from the API', async () => {
    // Read inside the handler — React 16 pools synthetic events
    const events: (string | null)[] = [];
    const { handle, editor } = setup(({ event }) => {
      events.push(event ? `${event.type}:${'key' in event ? event.key : ''}` : null);
    });

    await typeToHighlighted(editor, 'sta', 'status');
    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:')).toBe(true);

    expect(await waitFor(() => labels().some(l => l.includes('archived')))).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:active ')).toBe(true);

    await userEvent.type(editor, 'comp');
    expect(await waitFor(() => selectedLabel()?.includes('complex') === true)).toBe(true);
    await page.elementLocator(items().find(el => el.textContent?.includes('complex'))!).click();
    expect(await waitFor(() => handle.api!.getValue() === 'status:active complex:')).toBe(true);

    expect(await waitFor(() => labels().some(l => l.includes('beta')))).toBe(true);
    await userEvent.keyboard('{ArrowDown}');
    expect(handle.api!.acceptSuggestion()).toBe(true);

    expect(events).toEqual(['keydown:Tab', 'keydown:Enter', 'click:', null]);
  });

  it('true is the same as no return', async () => {
    const { handle, editor } = setup(() => true);
    await typeToHighlighted(editor, 'sta', 'status');
    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:')).toBe(true);
  });
});

describe('onAcceptSuggestion — returning false with api.set', () => {
  for (const key of ['Tab', 'Enter'] as const) {
    it(`${key}: encloses the field value in parens with the caret between them, as one edit`, async () => {
      const { handle, changes, searches, editorEl, editor } = setup(encloseComplex);
      await typeToHighlighted(editor, 'comple', 'complex');
      await pause(400); // close the typing undo group
      changes.length = 0;

      await userEvent.keyboard(`{${key}}`);
      expect(await waitFor(() => handle.api!.getValue() === 'complex:()')).toBe(true);
      expect(getSelectionCharRange(editorEl)).toEqual({ start: 9, end: 9 });
      expect(changes).toEqual(['complex:()']);

      // Value suggestions for the field appear inside the parens
      expect(await waitFor(() => labels().some(l => l.includes('alpha')))).toBe(true);
      expect(searches).toEqual([]);

      await userEvent.keyboard('{Control>}z{/Control}');
      expect(await waitFor(() => handle.api!.getValue() === 'comple')).toBe(true);
    });
  }

  it('click: same result', async () => {
    const { handle, editorEl, editor } = setup(encloseComplex);
    await typeToHighlighted(editor, 'comple', 'complex');

    await page.elementLocator(items().find(el => el.textContent?.includes('complex'))!).click();
    expect(await waitFor(() => handle.api!.getValue() === 'complex:()')).toBe(true);
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 9, end: 9 });
  });

  it('mid-query: only the partial is replaced', async () => {
    const { handle, editorEl, editor } = setup(encloseComplex);
    await editor.click();
    await userEvent.type(editor, 'a  b');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    await userEvent.keyboard('comple');
    expect(await waitFor(() => selectedLabel()?.includes('complex') === true)).toBe(true);

    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => handle.api!.getValue() === 'a complex:() b')).toBe(true);
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 11, end: 11 });
  });

  it('other suggestions still insert normally', async () => {
    const { handle, editor } = setup(encloseComplex);
    await typeToHighlighted(editor, 'sta', 'status');
    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:')).toBe(true);
  });

  it('Enter on a value still submits, with the value the handler set', async () => {
    const { handle, searches, editor } = setup(({ suggestion, cursorContext, query }, api) => {
      if (cursorContext.type !== 'FIELD_VALUE') return;
      const value = query.slice(0, suggestion.replaceStart) + `"${suggestion.text}"`;
      api.set({ value, selection: value.length });
      return false;
    });
    await typeToHighlighted(editor, 'status:act', 'active');

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('status:"active"');
    expect(handle.api!.getValue()).toBe('status:"active"');
  });

  it('api.submit() still searches, with the value the handler set', async () => {
    const { handle, searches, editor } = setup(encloseComplex);
    await typeToHighlighted(editor, 'comple', 'complex');

    handle.api!.submit();
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0]).toBe('complex:()');
  });

  it('false without an edit inserts nothing', async () => {
    const { handle, changes, editor } = setup(() => false);
    await typeToHighlighted(editor, 'sta', 'status');
    changes.length = 0;

    await userEvent.keyboard('{Tab}');
    await pause(300);
    expect(handle.api!.getValue()).toBe('sta');
    expect(changes).toEqual([]);
  });

  it('an edit without returning false is not followed by the default insert', async () => {
    const { handle, editor } = setup((ctx, api) => {
      encloseComplex(ctx, api); // return value dropped
    });
    await typeToHighlighted(editor, 'comple', 'complex');

    await userEvent.keyboard('{Tab}');
    await pause(300);
    expect(handle.api!.getValue()).toBe('complex:()');
  });
});
