/**
 * Copy and cut put only the selected query text on the clipboard, as
 * text/plain. The browser's own copy adds a text/html flavour with the
 * spans' styles inlined, which Outlook or Word would keep (§7.16).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }, { name: 'age', type: 'number' }];
const TEXT = 'status:active AND age:42';

const undo = () => userEvent.keyboard('{Control>}z{/Control}');

async function setup(props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    ...props,
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  const editor = page.elementLocator(editorEl);
  await editor.click();
  return { api: () => handle.api!, editorEl, editor };
}

/** Fires a copy or cut the way the browser would, with a DataTransfer the handler can write to. */
function clipboardEvent(editorEl: HTMLElement, type: 'copy' | 'cut') {
  const clipboardData = new DataTransfer();
  const event = new ClipboardEvent(type, { clipboardData, bubbles: true, cancelable: true });
  editorEl.dispatchEvent(event);
  return { clipboardData, defaultPrevented: event.defaultPrevented };
}

describe('copy', () => {
  it('puts only the selected query text on the clipboard', async () => {
    const { api, editorEl, editor } = await setup();
    await userEvent.type(editor, TEXT);
    expect(await waitFor(() => api().getValue() === TEXT)).toBe(true);
    api().setSelection(7, 13); // active

    const { clipboardData, defaultPrevented } = clipboardEvent(editorEl, 'copy');
    expect(defaultPrevented).toBe(true);
    expect(clipboardData.getData('text/plain')).toBe('active');
    expect(Array.from(clipboardData.types)).toEqual(['text/plain']);
    expect(api().getValue()).toBe(TEXT);
  });

  it('keeps the line breaks of a multiline value', async () => {
    const { api, editorEl, editor } = await setup({ features: { multiline: true } });
    await userEvent.type(editor, 'status:active');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.type(editor, 'age:42');
    expect(await waitFor(() => api().getValue() === 'status:active\nage:42')).toBe(true);
    api().setSelection(0, api().getValue().length);

    const { clipboardData } = clipboardEvent(editorEl, 'copy');
    expect(clipboardData.getData('text/plain')).toBe('status:active\nage:42');
  });

  it('leaves the event to the browser with nothing selected', async () => {
    const { api, editorEl, editor } = await setup();
    await userEvent.type(editor, TEXT);
    expect(await waitFor(() => api().getValue() === TEXT)).toBe(true);
    api().setSelection(3, 3);

    const { clipboardData, defaultPrevented } = clipboardEvent(editorEl, 'copy');
    expect(defaultPrevented).toBe(false);
    expect(Array.from(clipboardData.types)).toEqual([]);
  });
});

describe('cut', () => {
  it('copies the selection and removes it as one undo step', async () => {
    const { api, editorEl, editor } = await setup();
    await userEvent.type(editor, TEXT);
    expect(await waitFor(() => api().getValue() === TEXT)).toBe(true);
    api().setSelection(7, 13);

    const { clipboardData, defaultPrevented } = clipboardEvent(editorEl, 'cut');
    expect(defaultPrevented).toBe(true);
    expect(clipboardData.getData('text/plain')).toBe('active');
    expect(await waitFor(() => api().getValue() === 'status: AND age:42')).toBe(true);
    expect(api().getSelection()).toMatchObject({ start: 7, end: 7 });

    await undo();
    expect(await waitFor(() => api().getValue() === TEXT)).toBe(true);
  });
});
