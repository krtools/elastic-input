/**
 * Suggestion requests made while an async fields loader is in flight go
 * through the same path as async values: a spinner row, then the list once
 * the engine has the fields; an error row if the loader rejects.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, q, qa } from './helpers';

afterEach(async () => {
  cleanup();
  await page.viewport(1280, 800);
});

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'segment', type: 'string' },
];
const slowFields = (ms: number) => () => new Promise<FieldConfig[]>(r => setTimeout(() => r(FIELDS), ms));
const items = () => qa('.ei-dropdown-item').map(el => el.textContent ?? '');

function mount(props: Partial<ElasticInputProps> = {}, dropdown: Record<string, unknown> = {}) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  renderInto(React.createElement(ElasticInput, {
    fields: slowFields(300),
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    dropdown: { open: 'input', loadingDelay: 0, suggestDebounceMs: 0, showOperators: false, ...dropdown },
  }));
  return { api: handle.api!, editorEl: q('.ei-editor')! };
}

describe('suggestions requested while async fields load', () => {
  it('focus + openDropdown right after mount shows the spinner, then the fields', async () => {
    const { api } = mount();
    api.focus();
    api.openDropdown();
    expect(await waitFor(() => items().join('|').includes('Loading fields...'))).toBe(true);
    expect(await waitFor(() => items().length === 2 && items()[0].includes('status'), 2000)).toBe(true);
  });

  it('a partial typed during the load completes once the fields arrive', async () => {
    const { editorEl } = mount();
    await page.elementLocator(editorEl).click();
    await userEvent.type(page.elementLocator(editorEl), 'seg');
    expect(await waitFor(() => items().join('|').includes('Loading fields...'))).toBe(true);
    expect(await waitFor(() => items().length === 1 && items()[0].includes('segment'), 2000)).toBe(true);
  });

  it('a rejected loader shows the error row and unblocks', async () => {
    const { api } = mount({ fields: () => new Promise<FieldConfig[]>((_, reject) => setTimeout(() => reject(new Error('fields down')), 200)) });
    api.focus();
    api.openDropdown();
    expect(await waitFor(() => items().join('|').includes('fields down'), 2000)).toBe(true);
  });

  it('the sheet bar reads the loading row too', async () => {
    const { api } = mount({}, { presentation: 'sheet' });
    api.focus();
    api.openDropdown();
    expect(await waitFor(() => q('.ei-bar-open span')?.textContent === 'Loading fields...')).toBe(true);
    expect(await waitFor(() => q('.ei-bar-open span')?.textContent === '2 suggestions', 2000)).toBe(true);
  });

  it('a request after the load is immediate, as before', async () => {
    const { api } = mount();
    expect(await waitFor(() => (api.getValue(), true))).toBe(true);
    await new Promise(r => setTimeout(r, 450));
    api.focus();
    api.openDropdown();
    expect(await waitFor(() => items().length === 2)).toBe(true);
    expect(items().join('|')).not.toContain('Loading fields');
  });
});
