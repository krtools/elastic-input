/**
 * A field without suggestions shows only an informational hint (a type
 * placeholder or a `renderFieldHint` hint), and a typed partial highlights
 * it. Enter submits the query as typed; Tab exits the value at the end of
 * its token with the usual trailing space. Neither puts a space at a caret
 * inside the token (§7.10).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { getCaretCharOffset } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';
import { waitFor } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'age', type: 'number' }];

const settle = () => new Promise(r => setTimeout(r, 150));
const hintShowing = () => document.querySelector('.ei-dropdown-item--hint') != null;
const isOpen = () => document.querySelectorAll('.ei-dropdown-item').length > 0;

/** Types `text`, moves the caret `left` places back, and waits for the hint. */
async function setup(text: string, left: number, props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  const searches: string[] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    onSearch: (q: string) => { searches.push(q); },
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    ...props,
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  const editor = page.elementLocator(editorEl);
  await editor.click();
  await userEvent.type(editor, text);
  if (left > 0) await userEvent.keyboard('{ArrowLeft}'.repeat(left));
  expect(await waitFor(hintShowing)).toBe(true);
  expect(getCaretCharOffset(editorEl)).toBe(text.length - left);
  return { handle, searches, editorEl, value: () => handle.api!.getValue() };
}

describe('Enter on a hint', () => {
  it('submits the query as typed with the caret inside the value', async () => {
    const { searches, value } = await setup('age:*abc', 3); // age:*|abc
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(searches).toEqual(['age:*abc']);
    expect(value()).toBe('age:*abc');
    expect(isOpen()).toBe(false);
  });

  it('submits the query as typed with the caret right after the colon', async () => {
    const { searches, value } = await setup('age:42', 2); // age:|42
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(searches).toEqual(['age:42']);
    expect(value()).toBe('age:42');
  });

  it('adds no trailing space with the caret at the end', async () => {
    const { searches, value } = await setup('age:42', 0);
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(searches).toEqual(['age:42']);
    expect(value()).toBe('age:42');
  });

  it('matches api.submit()', async () => {
    const { handle, searches, value } = await setup('age:*abc', 3);
    handle.api!.submit();
    await settle();
    expect(searches).toEqual(['age:*abc']);
    expect(value()).toBe('age:*abc');
  });

  it('leaves a renderFieldHint hint alone too', async () => {
    const { searches, value } = await setup('age:*abc', 3, {
      fields: [{ name: 'age', type: 'string', placeholder: false }],
      dropdown: { renderFieldHint: (f: FieldConfig) => (f.name === 'age' ? 'Enter an age' : null) },
    });
    await userEvent.keyboard('{Enter}');
    await settle();
    expect(searches).toEqual(['age:*abc']);
    expect(value()).toBe('age:*abc');
  });
});

describe('Tab on a hint', () => {
  it('exits with a trailing space when the caret is at the end of the value', async () => {
    const { editorEl, value } = await setup('age:42', 0);
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(value()).toBe('age:42 ');
    expect(getCaretCharOffset(editorEl)).toBe(7);
  });

  it('moves the caret past the whole value when pressed inside it', async () => {
    const { editorEl, value } = await setup('age:42', 1); // age:4|2
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(value()).toBe('age:42 ');
    expect(getCaretCharOffset(editorEl)).toBe(7);
  });

  it('adds no space when other text follows the value', async () => {
    const { editorEl, value } = await setup('(age:42)', 2); // (age:4|2)
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(value()).toBe('(age:42)');
    expect(getCaretCharOffset(editorEl)).toBe(7);
  });

  it('adds no space with trailingSpaceOnAccept off', async () => {
    const { editorEl, value } = await setup('age:42', 1, { trailingSpaceOnAccept: false });
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(value()).toBe('age:42');
    expect(getCaretCharOffset(editorEl)).toBe(6);
  });
});
