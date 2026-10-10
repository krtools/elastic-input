/**
 * dropdown.filterFields replaces the built-in field-name matching end to
 * end: what it returns is what the dropdown offers, and an inline function
 * is read per keystroke without rebuilding anything.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { defaultFilterFields } from '../../autocomplete/AutocompleteEngine';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'firstName', type: 'string' },
  { name: 'lastName', type: 'string' },
];

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const labels = () => Array.from(document.querySelectorAll('.ei-dropdown-item')).map(el => el.textContent ?? '');

const isSubsequence = (needle: string, hay: string) => {
  let i = 0;
  for (const ch of hay.toLowerCase()) if (ch === needle[i]) i++;
  return i === needle.length;
};

describe('dropdown.filterFields', () => {
  it('a subsequence fallback offers firstName for "fn"; without it nothing is offered', async () => {
    renderInto(React.createElement(ElasticInput, {
      fields: FIELDS,
      dropdown: {
        showOperators: false,
        // Inline on purpose: a fresh identity per render must be fine
        filterFields: (fields: FieldConfig[], partial: string) => {
          const base = defaultFilterFields(fields, partial);
          return [...base, ...fields.filter(f => !base.includes(f) && isSubsequence(partial.toLowerCase(), f.name))];
        },
      },
    }));
    const editor = page.elementLocator(document.querySelector('.ei-editor') as HTMLElement);
    await editor.click();
    await userEvent.type(editor, 'fn');
    expect(await waitFor(() => labels().some(l => l.includes('firstName')))).toBe(true);
    expect(labels().some(l => l.includes('lastName'))).toBe(false);

    await userEvent.keyboard('{Tab}');
    expect(await waitFor(() => (document.querySelector('.ei-editor') as HTMLElement).textContent === 'firstName:')).toBe(true);
    cleanup();

    renderInto(React.createElement(ElasticInput, { fields: FIELDS, dropdown: { showOperators: false } }));
    const plain = page.elementLocator(document.querySelector('.ei-editor') as HTMLElement);
    await plain.click();
    await userEvent.type(plain, 'fn');
    await pause(300);
    expect(labels()).toEqual([]);
  });
});
