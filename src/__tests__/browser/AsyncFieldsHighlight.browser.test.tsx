/**
 * Regression: per-field-type value coloring must pick up fields that resolve
 * asynchronously (or change identity) AFTER the first render.
 *
 * applyHighlight/processInput are useCallbacks that close over fieldTypeMap.
 * Before the fix their dependency arrays omitted it, so once created (with the
 * initial empty map for async fields) they kept highlighting every subsequent
 * keystroke with the stale map — typed values never received their
 * colors.valueTypes color until an unrelated `colors` identity change forced
 * the callbacks to rebuild.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const NUMBER_COLOR = '#ff00ff'; // rendered as rgb(255, 0, 255) in inline styles
const FIELDS: FieldConfig[] = [
  { name: 'deal', label: 'Deal', type: 'number' },
];
// Stable identity across renders — an inline colors object would rebuild the
// highlight callbacks every render and mask the stale-closure bug.
const COLORS = { valueTypes: { number: NUMBER_COLOR } };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

async function waitFor(
  fn: () => boolean,
  timeout = 3000,
  interval = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function editorEl(): HTMLElement {
  return document.querySelector('.ei-editor') as HTMLElement;
}

function valueSpanColor(): string | null {
  const span = document.querySelector('.ei-token--value') as HTMLElement | null;
  return span ? span.style.color : null;
}

describe('per-type value colors with async fields', () => {
  it('applies valueTypes color to keystrokes typed after the fields resolve', async () => {
    const d = deferred<FieldConfig[]>();
    renderInto(
      React.createElement(ElasticInput, {
        fields: () => d.promise,
        colors: COLORS,
      }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'deal:5');
    expect(editorEl().textContent).toBe('deal:5');

    // Fields arrive; the rebuild effect re-validates and re-highlights.
    d.resolve(FIELDS);
    expect(await waitFor(() => valueSpanColor() === 'rgb(255, 0, 255)')).toBe(true);

    // The critical part: a keystroke AFTER the fields resolved re-highlights
    // via applyHighlight — its closure must see the loaded field types.
    await userEvent.type(editor, '0');
    expect(editorEl().textContent).toBe('deal:50');
    expect(valueSpanColor()).toBe('rgb(255, 0, 255)');
  });
});
