/**
 * api.set({ value, selection }) updates the value and the selection as one
 * edit: one onChange, one undo entry, the caret placed where asked. It closes
 * the dropdown and never steals focus.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { getSelectionCharRange } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }];

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const isOpen = () => document.querySelectorAll('.ei-dropdown-item').length > 0;

function setup(props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  const changes: string[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    onChange: (q: string) => { changes.push(q); },
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { handle, changes, editorEl, editor: page.elementLocator(editorEl) };
}

/** Focus the editor and type `text`, letting the typing undo group close. */
async function typeAndSettle(editor: ReturnType<typeof page.elementLocator>, text: string) {
  await editor.click();
  await userEvent.type(editor, text);
  await pause(400); // > typing-group debounce (300ms)
}

describe('api.set', () => {
  it('sets value and caret as one edit: one onChange, one undo step', async () => {
    const { handle, changes, editorEl, editor } = setup();
    await typeAndSettle(editor, 'foo');
    changes.length = 0;

    handle.api!.set({ value: 'status:()', selection: 8 });
    expect(handle.api!.getValue()).toBe('status:()');
    expect(editorEl.textContent).toBe('status:()');
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 8, end: 8 });
    expect(changes).toEqual(['status:()']);

    // Typing lands at the caret that was set
    await userEvent.keyboard('x');
    expect(await waitFor(() => handle.api!.getValue() === 'status:(x)')).toBe(true);
    await pause(400);

    await userEvent.keyboard('{Control>}z{/Control}');
    expect(await waitFor(() => handle.api!.getValue() === 'status:()')).toBe(true);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(await waitFor(() => handle.api!.getValue() === 'foo')).toBe(true);
  });

  it('accepts a selection range and clamps it to the value', async () => {
    const { handle, editorEl, editor } = setup();
    await typeAndSettle(editor, 'foo');

    handle.api!.set({ value: 'status:active', selection: { start: 7, end: 13 } });
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 7, end: 13 });

    handle.api!.set({ selection: { start: -5, end: 99 } });
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 0, end: 13 });
  });

  it('selection only: moves the caret without an onChange or an undo entry', async () => {
    const { handle, changes, editorEl, editor } = setup();
    await typeAndSettle(editor, 'one');
    await userEvent.type(editor, ' two');
    await pause(400);
    changes.length = 0;

    handle.api!.set({ selection: 1 });
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 1, end: 1 });
    expect(changes).toEqual([]);

    await userEvent.keyboard('{Control>}z{/Control}');
    expect(await waitFor(() => handle.api!.getValue() === 'one')).toBe(true);
  });

  it('setting the current value again does nothing', async () => {
    const { handle, changes, editor } = setup();
    await typeAndSettle(editor, 'foo');
    changes.length = 0;

    handle.api!.set({ value: 'foo' });
    handle.api!.set({});
    expect(changes).toEqual([]);
  });

  it('value only: leaves the caret where it was', async () => {
    const { handle, editorEl, editor } = setup();
    await typeAndSettle(editor, 'foo bar');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 3, end: 3 });

    handle.api!.set({ value: 'foo baz qux' });
    expect(getSelectionCharRange(editorEl)).toEqual({ start: 3, end: 3 });
  });

  it('closes the dropdown', async () => {
    const { handle, editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'st');
    expect(await waitFor(isOpen)).toBe(true);

    handle.api!.set({ value: 'status:x', selection: 8 });
    expect(await waitFor(() => !isOpen())).toBe(true);
    await pause(300);
    expect(isOpen()).toBe(false);
  });

  it('does not steal focus when the input is unfocused', async () => {
    const { handle, editorEl } = setup({ defaultValue: 'foo' });
    expect(document.activeElement).not.toBe(editorEl);

    handle.api!.set({ value: 'status:active', selection: 3 });
    expect(handle.api!.getValue()).toBe('status:active');
    expect(editorEl.textContent).toBe('status:active');
    expect(document.activeElement).not.toBe(editorEl);
  });

  it('API reads are current immediately, even inside a React event handler', async () => {
    const seen: { value: string; ast: string; errors: number }[] = [];
    const { handle, editor } = setup({
      onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'F2') return;
        const api = handle.api!;
        api.set({ value: 'status:(', selection: 8 });
        seen.push({
          value: api.getValue(),
          ast: JSON.stringify(api.getAST()),
          errors: api.getValidationErrors().length,
        });
      },
    });
    await typeAndSettle(editor, 'foo');

    await userEvent.keyboard('{F2}');
    expect(seen.length).toBe(1);
    expect(seen[0].value).toBe('status:(');
    expect(seen[0].ast).toContain('"status"');
    expect(seen[0].errors).toBeGreaterThan(0); // unclosed paren
  });
});
