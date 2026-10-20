/**
 * styles.inputMaxHeight: the editor (the scrolling element) is capped, so a
 * long multiline query scrolls inside the box instead of painting past it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(() => cleanup());

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }];
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe('styles.inputMaxHeight', () => {
  it('caps the editor and scrolls its text; the container never overflows', async () => {
    const handle: { api: ElasticInputAPI | null } = { api: null };
    renderInto(React.createElement(ElasticInput, {
      fields: FIELDS,
      multiline: true,
      styles: { inputMaxHeight: '72px' },
      inputRef: (a: ElasticInputAPI) => { handle.api = a; },
      dropdown: { open: 'never' },
    }));
    const editorEl = q('.ei-editor')!;
    const editor = page.elementLocator(editorEl);
    await editor.click();
    for (let i = 0; i < 8; i++) {
      await userEvent.type(editor, `line${i}`);
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    }
    expect(handle.api!.getValue().split('\n').length).toBeGreaterThanOrEqual(8);
    const e = editorEl.getBoundingClientRect();
    const c = q('.ei-container')!.getBoundingClientRect();
    expect(Math.round(e.height)).toBe(72);
    expect(editorEl.scrollHeight).toBeGreaterThan(editorEl.clientHeight);
    expect(c.height).toBeLessThan(80); // the box is the capped editor plus borders
    expect(editorEl.scrollTop).toBeGreaterThan(0); // the caret stayed in view
  });
});
