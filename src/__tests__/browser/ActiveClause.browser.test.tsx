/**
 * The filter the caret is in is marked in the editor so a user can see which
 * filter a value belongs to. The mark is a class for a stylesheet to style.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pause, qa } from './helpers';

afterEach(cleanup);

// What a consumer's stylesheet would do with the marks
const sheet = document.createElement('style');
sheet.textContent = '.ei-clause--active { font-weight: 700 !important } .mine { text-decoration: underline }';
document.head.appendChild(sheet);

const FIELDS: FieldConfig[] = [{ name: 'name', type: 'string' }, { name: 'status', type: 'string' }];
const active = () => qa('.ei-editor .ei-clause--active').map(el => el.textContent ?? '').join('');
const matchedParens = () => qa('.ei-editor .ei-paren--matched');

async function mount(props: Partial<ElasticInputProps> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    dropdown: { open: 'never' },
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  await page.elementLocator(document.querySelector('.ei-editor') as HTMLElement).click();
  return handle.api!;
}

describe('active clause', () => {
  it('a bare term after a field value is its own clause', async () => {
    const api = await mount();
    api.setValue('name:john smith');
    api.setSelection(13, 13); // smi|th
    expect(await waitFor(() => active() === 'smith')).toBe(true);
    api.setSelection(2, 2); // na|me
    expect(await waitFor(() => active() === 'name:john')).toBe(true);
  });

  it('the caret inside a field group marks the whole group', async () => {
    const api = await mount();
    api.setValue('name:(john smith springfield illinois) x');
    api.setSelection(22, 22); // spring|field
    expect(await waitFor(() => active() === 'name:(john smith springfield illinois)')).toBe(true);
  });

  it('inside nested parens the mark is the innermost filter, not the outer group', async () => {
    const api = await mount();
    api.setValue('(name:bob AND status:(active OR pending)) OR name:ann');
    api.setSelection(35, 35); // pen|ding
    expect(await waitFor(() => active() === 'status:(active OR pending)')).toBe(true);
    api.setSelection(6, 6); // name|:bob
    expect(await waitFor(() => active() === 'name:bob')).toBe(true);
    api.setSelection(0, 0); // on the outer (
    expect(await waitFor(() => active() === '')).toBe(true);
  });

  it('nothing is active between clauses or when blurred', async () => {
    const api = await mount();
    api.setValue('name:john   smith');
    api.setSelection(11, 11); // in the gap
    await pause(100);
    expect(active()).toBe('');
    api.setSelection(13, 13);
    expect(await waitFor(() => active() === 'smith')).toBe(true);
    api.blur();
    expect(await waitFor(() => active() === '')).toBe(true);
  });

  it('classNames.activeClause reaches the spans for a stylesheet', async () => {
    const api = await mount({ classNames: { activeClause: 'mine' } });
    api.setValue('name:john smith');
    api.setSelection(13, 13);
    expect(await waitFor(() => active() === 'smith')).toBe(true);
    const span = qa('.ei-editor .ei-clause--active')[0];
    expect(span.classList.contains('mine')).toBe(true);
    expect(getComputedStyle(span).fontWeight).toBe('700');
    expect(getComputedStyle(span).textDecorationLine).toBe('underline');
    expect(getComputedStyle(qa('.ei-editor .ei-token')[0]).fontWeight).not.toBe('700'); // name: untouched
  });

  it('blur strips the marks in place and keeps the selection', async () => {
    const api = await mount({ classNames: { activeClause: 'mine' } });
    api.setValue('name:(john) x');
    api.setSelection(6, 6); // name:(|john)
    expect(await waitFor(() => active() === 'name:(john)' && matchedParens().length === 2)).toBe(true);
    const open = matchedParens()[0];
    const john = qa('.ei-editor .ei-clause--active').find(el => el.textContent === 'john')!;
    expect(getComputedStyle(open).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(john).fontWeight).toBe('700');

    api.blur();
    expect(await waitFor(() => active() === '' && matchedParens().length === 0)).toBe(true);
    // The same spans, unmarked — not a rebuild
    expect(open.isConnected && john.isConnected).toBe(true);
    expect(open.classList.contains('mine') || john.classList.contains('mine')).toBe(false);
    expect(getComputedStyle(open).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(open).fontWeight).toBe('400');
    expect(getComputedStyle(john).fontWeight).toBe('400');
    // The caret a refocus returns to is still where it was
    expect(api.getSelection()).toEqual({ start: 6, end: 6 });
  });
});
