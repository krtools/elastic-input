/**
 * dropdown.homeEndKeys: true always keeps Home/End in the dropdown; 'once'
 * lets the key through to the text caret when the highlight is already on
 * the first/last item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { getCaretCharOffset } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'state', type: 'string' },
  { name: 'street', type: 'string' },
];

const TEXT = 'st foo';

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const settle = () => new Promise(r => setTimeout(r, 100));

function selectedIndex(): number {
  const items = Array.from(document.querySelectorAll('.ei-dropdown-item'));
  return items.findIndex(el => el.classList.contains('ei-dropdown-item--selected'));
}

/** Caret at `st| foo` with the three `st…` fields showing and the first highlighted. */
async function setup(homeEndKeys: boolean | 'once') {
  renderInto(React.createElement(ElasticInput, { fields: FIELDS, dropdown: { homeEndKeys } }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  const editor = page.elementLocator(editorEl);
  await editor.click();
  await userEvent.type(editor, TEXT);
  await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
  expect(await waitFor(() => document.querySelectorAll('.ei-dropdown-item').length === 3 && selectedIndex() === 0)).toBe(true);
  expect(getCaretCharOffset(editorEl)).toBe(2);
  return editorEl;
}

describe("homeEndKeys: 'once'", () => {
  it('End jumps to the last item first, then moves the text caret to the end', async () => {
    const editorEl = await setup('once');

    await userEvent.keyboard('{End}');
    await settle();
    expect(selectedIndex()).toBe(2);
    expect(getCaretCharOffset(editorEl)).toBe(2); // caret untouched

    await userEvent.keyboard('{End}');
    await settle();
    expect(getCaretCharOffset(editorEl)).toBe(TEXT.length);
  });

  it('Home moves the text caret immediately when the first item is already highlighted', async () => {
    const editorEl = await setup('once');
    await userEvent.keyboard('{Home}');
    await settle();
    expect(getCaretCharOffset(editorEl)).toBe(0);
  });

  it('Home jumps to the first item when the highlight is elsewhere', async () => {
    const editorEl = await setup('once');
    await userEvent.keyboard('{ArrowDown}');
    await settle();
    expect(selectedIndex()).toBe(1);

    await userEvent.keyboard('{Home}');
    await settle();
    expect(selectedIndex()).toBe(0);
    expect(getCaretCharOffset(editorEl)).toBe(2);
  });
});

describe('homeEndKeys: true (unchanged)', () => {
  it('End stays in the dropdown no matter how many times it is pressed', async () => {
    const editorEl = await setup(true);
    await userEvent.keyboard('{End}');
    await userEvent.keyboard('{End}');
    await settle();
    expect(selectedIndex()).toBe(2);
    expect(getCaretCharOffset(editorEl)).toBe(2);
  });
});

describe('homeEndKeys: false (unchanged)', () => {
  it('End always moves the text caret', async () => {
    const editorEl = await setup(false);
    await userEvent.keyboard('{End}');
    await settle();
    expect(getCaretCharOffset(editorEl)).toBe(TEXT.length);
  });
});
