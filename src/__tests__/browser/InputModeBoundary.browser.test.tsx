/**
 * dropdown.open: 'input' shows the dropdown while a term is being typed.
 * A caret touching a closing delimiter is a boundary, like one after a
 * space. Regression: `(a)|` counted as typing momentum (non-whitespace
 * before the caret) and offered every field, glued to the paren.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pause } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'brand', type: 'string' },
];

const isOpen = () => document.querySelectorAll('.ei-dropdown-item').length > 0;

async function setup() {
  renderInto(React.createElement(ElasticInput, { fields: FIELDS, dropdown: { open: 'input' } }));
  const editor = page.elementLocator(document.querySelector('.ei-editor') as HTMLElement);
  await editor.click();
  return editor;
}

describe("dropdown.open: 'input' at closing delimiters", () => {
  it('stays closed at `(a)|` and `(a) |`, and opens again on the next word', async () => {
    const editor = await setup();
    await userEvent.type(editor, '(a)');
    await pause(300);
    expect(isOpen()).toBe(false);

    await userEvent.type(editor, ' ');
    await pause(300);
    expect(isOpen()).toBe(false);

    await userEvent.type(editor, 'br');
    expect(await waitFor(isOpen)).toBe(true);
  });

  it('stays closed after a range bracket', async () => {
    const editor = await setup();
    await userEvent.type(editor, 'status:[[1 TO 2]');
    await pause(300);
    expect(isOpen()).toBe(false);
  });

  it('still opens while typing a word (unchanged)', async () => {
    const editor = await setup();
    await userEvent.type(editor, 'sta');
    expect(await waitFor(isOpen)).toBe(true);
  });
});
