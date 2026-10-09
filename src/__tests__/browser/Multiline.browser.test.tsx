/**
 * features.multiline: false means a single-line input — a newline never
 * survives in the value, each becoming one space. Regression: the flag only
 * gated Shift+Enter, so existing, pasted, and programmatic newlines stayed.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { getCaretCharOffset } from '../../utils/cursorUtils';
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
const editorEl = () => document.querySelector('.ei-editor') as HTMLElement;
const lineBreaks = () => editorEl().querySelectorAll('br:not([data-sentinel])').length;

/** userEvent.paste delivers no clipboardData here; dispatch the event the handler reads. */
function pasteText(text: string) {
  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  editorEl().dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}

/** Harness whose `multiline` can be flipped from the test. */
function setup(initialMultiline: boolean, props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null; setMultiline: (v: boolean) => void } = {
    api: null,
    setMultiline: () => {},
  };
  const changes: string[] = [];
  function Harness() {
    const [multiline, setMultiline] = React.useState(initialMultiline);
    handle.setMultiline = setMultiline;
    return React.createElement(ElasticInput, {
      fields: FIELDS,
      features: { multiline },
      dropdown: { open: 'never' },
      onChange: (q: string) => { changes.push(q); },
      ...props,
      inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    });
  }
  renderInto(React.createElement(Harness));
  return { handle, changes, editor: page.elementLocator(editorEl()) };
}

/** Type `status:a`, Shift+Enter, `status:b` — a two-line query. */
async function typeTwoLines(editor: ReturnType<typeof page.elementLocator>) {
  await editor.click();
  await userEvent.type(editor, 'status:a');
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
  await userEvent.type(editor, 'status:b');
}

describe('multiline turned off at runtime', () => {
  it('collapses existing newlines to spaces as one edit, keeping the caret', async () => {
    const { handle, changes, editor } = setup(true);
    await typeTwoLines(editor);
    expect(await waitFor(() => handle.api!.getValue() === 'status:a\nstatus:b')).toBe(true);
    expect(lineBreaks()).toBe(1);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}'); // caret before "b"... inside second term
    const caretBefore = getCaretCharOffset(editorEl());
    await pause(400);
    changes.length = 0;

    handle.setMultiline(false);
    expect(await waitFor(() => handle.api!.getValue() === 'status:a status:b')).toBe(true);
    expect(lineBreaks()).toBe(0);
    expect(changes).toEqual(['status:a status:b']);
    expect(getCaretCharOffset(editorEl())).toBe(caretBefore);
  });

  it('is one undo step, and undo cannot bring the newlines back', async () => {
    const { handle, editor } = setup(true);
    await typeTwoLines(editor);
    await pause(400);
    handle.setMultiline(false);
    expect(await waitFor(() => handle.api!.getValue() === 'status:a status:b')).toBe(true);

    await userEvent.keyboard('{Control>}z{/Control}');
    await pause(200);
    expect(handle.api!.getValue()).toBe('status:a status:b');
    expect(lineBreaks()).toBe(0);
  });

  it('does nothing when the value has no newline, and nothing when turned back on', async () => {
    const { handle, changes, editor } = setup(true);
    await editor.click();
    await userEvent.type(editor, 'status:a');
    await pause(400);
    changes.length = 0;

    handle.setMultiline(false);
    await pause(200);
    handle.setMultiline(true);
    await pause(200);
    expect(changes).toEqual([]);
    expect(handle.api!.getValue()).toBe('status:a');
  });

  it('does not focus a blurred editor', async () => {
    const { handle, editor } = setup(true);
    await typeTwoLines(editor);
    handle.api!.blur();
    expect(document.activeElement).not.toBe(editorEl());

    handle.setMultiline(false);
    expect(await waitFor(() => handle.api!.getValue() === 'status:a status:b')).toBe(true);
    expect(document.activeElement).not.toBe(editorEl());
  });
});

describe('multiline: false keeps newlines out', () => {
  it('Shift+Enter inserts nothing', async () => {
    const { handle, editor } = setup(false);
    await editor.click();
    await userEvent.type(editor, 'status:a');
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await pause(200);
    expect(handle.api!.getValue()).toBe('status:a');
  });

  it('pasted newlines become spaces', async () => {
    const { handle, editor } = setup(false);
    await editor.click();
    pasteText('status:a\nstatus:b\r\nstatus:c');
    expect(await waitFor(() => handle.api!.getValue() === 'status:a status:b status:c')).toBe(true);
    expect(lineBreaks()).toBe(0);
    expect(getCaretCharOffset(editorEl())).toBe('status:a status:b status:c'.length);
  });

  it('defaultValue, api.setValue, api.set, and a controlled value', async () => {
    const { handle } = setup(false, { defaultValue: 'a\nb' });
    await pause(100);
    expect(handle.api!.getValue()).toBe('a b');
    expect(editorEl().textContent).toBe('a b');

    handle.api!.setValue('c\nd');
    expect(handle.api!.getValue()).toBe('c d');

    handle.api!.set({ value: 'e\r\nf', selection: 1 });
    expect(handle.api!.getValue()).toBe('e f');
    cleanup();

    let setValue: (v: string) => void = () => {};
    let api: ElasticInputAPI | null = null;
    const changes: string[] = [];
    function Controlled() {
      const [value, set] = React.useState('');
      setValue = set;
      return React.createElement(ElasticInput, {
        fields: FIELDS, value, features: { multiline: false },
        onChange: (q: string) => { changes.push(q); set(q); },
        inputRef: (a: ElasticInputAPI) => { api = a; },
      });
    }
    renderInto(React.createElement(Controlled));
    setValue('g\nh');
    expect(await waitFor(() => api!.getValue() === 'g h')).toBe(true);
    await pause(200);
    expect(changes).toEqual(['g h']);
  });

  it('multiline: true is unchanged — Shift+Enter still inserts a line break', async () => {
    const { handle, editor } = setup(true);
    await typeTwoLines(editor);
    expect(await waitFor(() => handle.api!.getValue() === 'status:a\nstatus:b')).toBe(true);
    expect(lineBreaks()).toBe(1);
  });
});
