/**
 * Plain mode (plainModeLength reached): the editor must show the value even
 * when it did not come from typing — on mount, via api.setValue / api.set, or
 * a controlled value change. Regression: the text was only written when
 * highlight spans were there to strip, so an empty or already-plain editor
 * stayed blank or kept the old text.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }];
const LONG = 'this is a long plain value';
const LONG_2 = 'another long plain value here';

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const settle = () => new Promise(r => setTimeout(r, 150));

function setup(props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    plainModeLength: 10,
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  return { handle, editorEl, editor: page.elementLocator(editorEl) };
}

/** Plain text shown, with no highlight spans. */
function expectPlain(editorEl: HTMLElement, text: string) {
  expect(editorEl.textContent).toBe(text);
  expect(editorEl.querySelector('span')).toBeNull();
}

describe('plain mode shows values that were not typed', () => {
  it('mount with a long value', async () => {
    const { editorEl } = setup({ value: LONG });
    await settle();
    expectPlain(editorEl, LONG);
  });

  it('mount with a long defaultValue', async () => {
    const { editorEl } = setup({ defaultValue: LONG });
    await settle();
    expectPlain(editorEl, LONG);
  });

  it('api.setValue on an empty editor', async () => {
    const { handle, editorEl } = setup();
    handle.api!.setValue(LONG);
    await settle();
    expectPlain(editorEl, LONG);
  });

  it('a controlled value change from empty', async () => {
    let setValue: (v: string) => void = () => {};
    function Harness() {
      const [value, set] = React.useState('');
      setValue = set;
      return React.createElement(ElasticInput, {
        fields: FIELDS, plainModeLength: 10, value, onChange: (q: string) => set(q),
      });
    }
    renderInto(React.createElement(Harness));
    const editorEl = document.querySelector('.ei-editor') as HTMLElement;

    setValue(LONG);
    await settle();
    expectPlain(editorEl, LONG);
  });

  it('one long value replaced by another', async () => {
    const { handle, editorEl } = setup({ defaultValue: LONG });
    await settle();

    handle.api!.setValue(LONG_2);
    await settle();
    expect(handle.api!.getValue()).toBe(LONG_2);
    expectPlain(editorEl, LONG_2);
  });

  it('api.set places the caret in the plain text', async () => {
    const { handle, editorEl, editor } = setup();
    await editor.click();

    handle.api!.set({ value: LONG, selection: 4 });
    await settle();
    expectPlain(editorEl, LONG);

    await userEvent.keyboard('X');
    expect(await waitFor(() => handle.api!.getValue() === 'thisX is a long plain value')).toBe(true);
  });

  it('does not focus a blurred editor', async () => {
    const { handle, editorEl } = setup({ defaultValue: 'short' });
    await settle();
    expect(editorEl.querySelector('span')).not.toBeNull();

    handle.api!.setValue(LONG);
    await settle();
    expectPlain(editorEl, LONG);
    expect(document.activeElement).not.toBe(editorEl);
  });
});

describe('plain mode transitions (unchanged)', () => {
  it('typing past the threshold keeps the text and the caret', async () => {
    const { handle, editorEl, editor } = setup();
    await editor.click();
    await userEvent.type(editor, 'status:active more');
    expect(await waitFor(() => handle.api!.getValue() === 'status:active more')).toBe(true);
    expectPlain(editorEl, 'status:active more');
  });

  it('a short value after a long one is highlighted again', async () => {
    const { handle, editorEl } = setup({ defaultValue: LONG });
    await settle();

    handle.api!.setValue('status:x');
    await settle();
    expect(editorEl.textContent).toBe('status:x');
    expect(editorEl.querySelector('span')).not.toBeNull();
    expect(handle.api!.getAST()).not.toBeNull();
  });
});
