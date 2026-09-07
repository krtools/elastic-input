/**
 * Regression test for the reverse-typing bug.
 *
 * Entry condition: a blur event React processes while DOM focus never actually
 * leaves the editor (window blur, an extension's capture listener eating the
 * refocus event, etc.). The component's isFocused state goes false while
 * keystrokes keep landing in the editor.
 *
 * Old failure mode: the paren-match re-highlight effect gated its caret
 * restore on the isFocused STATE, so each innerHTML rewrite detached the DOM
 * selection without restoring it. Chrome re-seeds a dead selection at the
 * removed node's slot in the parent — offset 0 for a single-token query — so
 * every subsequent character prepended: typing `source` produced `ecruos`.
 *
 * The sustaining amplifier is an unstable `colors` prop identity (a fresh
 * object every render forces the effect past its dedup on every keystroke),
 * which this harness reproduces deliberately.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { DEFAULT_COLORS } from '../../constants';
import { FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string' },
  { name: 'source', label: 'Source', type: 'string' },
];

const EDITOR = '.ei-editor';

/**
 * Mirrors the pre-fix demo setup: controlled value (parent re-renders on every
 * keystroke) plus a colors object rebuilt on every render (unstable identity).
 */
function ChurningColorsHarness() {
  const [value, setValue] = React.useState('');
  const colors = { ...DEFAULT_COLORS };
  return React.createElement(ElasticInput, {
    fields: FIELDS,
    value,
    onChange: (q: string) => setValue(q),
    colors,
  });
}

async function settle(ms = 60) {
  await new Promise(r => setTimeout(r, ms));
}

describe('reverse-typing regression (spurious blur + unstable colors)', () => {
  it('typing continues forward after a blur event that never moved DOM focus', async () => {
    renderInto(React.createElement(ChurningColorsHarness));
    const editorEl = document.querySelector(EDITOR) as HTMLElement;
    const editor = page.elementLocator(editorEl);

    await editor.click();
    await userEvent.type(editor, 'sour');
    await settle();
    expect(editorEl.textContent).toBe('sour');

    // Simulate the desync entry: React sees a blur, DOM focus stays put.
    editorEl.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
    await settle();
    expect(document.activeElement).toBe(editorEl);

    // Type one character at a time with effect flushes in between — the old
    // bug needed the re-highlight effect to run between keystrokes.
    await userEvent.keyboard('c');
    await settle();
    await userEvent.keyboard('e');
    await settle();

    // Pre-fix this produced 'esourc' (then 'YXesourc' and so on).
    expect(editorEl.textContent).toBe('source');
  });

  it('caret stays live across multiple keystrokes in the desynced state', async () => {
    renderInto(React.createElement(ChurningColorsHarness));
    const editorEl = document.querySelector(EDITOR) as HTMLElement;
    const editor = page.elementLocator(editorEl);

    await editor.click();
    await userEvent.type(editor, 'a');
    await settle();
    editorEl.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
    await settle();

    for (const ch of ['b', 'c', 'd']) {
      await userEvent.keyboard(ch);
      await settle();
    }

    expect(editorEl.textContent).toBe('abcd');
    // The selection must still be attached to the editor (not dead/re-seeded)
    const sel = window.getSelection();
    expect(sel && sel.rangeCount).toBe(1);
    expect(editorEl.contains(sel!.getRangeAt(0).startContainer)).toBe(true);
  });
});
