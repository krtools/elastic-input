/**
 * Programmatic value changes (api.setValue, controlled `value`) are undoable:
 * they push their own undo entry, so Ctrl+Z returns to what was there before
 * the change, not to the state before the last typed keystrokes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }];

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const undo = () => userEvent.keyboard('{Control>}z{/Control}');
const redo = () => userEvent.keyboard('{Control>}y{/Control}');

/** Type in two bursts separated by a pause, so they form two undo groups. */
async function typeTwoGroups(editorEl: HTMLElement) {
  const editor = page.elementLocator(editorEl);
  await editor.click();
  await userEvent.type(editor, 'one two');
  await pause(400); // > typing-group debounce (300ms)
  await userEvent.type(editor, ' three');
}

describe('undo after programmatic value changes', () => {
  it('onSearch translating the query via api.setValue: Ctrl+Z restores the typed query', async () => {
    let api: ElasticInputAPI | null = null;
    const searches: string[] = [];
    renderInto(React.createElement(ElasticInput, {
      fields: FIELDS,
      inputRef: (a: ElasticInputAPI) => { api = a; },
      onSearch: (q: string) => {
        const translated = q.replace('one', '1').replace('two', '2').replace('three', '3');
        api!.setValue(translated);
        searches.push(translated);
      },
    }));
    const editorEl = document.querySelector('.ei-editor') as HTMLElement;
    await typeTwoGroups(editorEl);
    expect(api!.getValue()).toBe('one two three');

    await userEvent.keyboard('{Enter}');
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(api!.getValue()).toBe('1 2 3');

    await undo();
    expect(await waitFor(() => api!.getValue() === 'one two three')).toBe(true);

    // The next undo steps back through the typing groups as before
    await undo();
    expect(await waitFor(() => api!.getValue() === 'one two')).toBe(true);

    await redo();
    expect(await waitFor(() => api!.getValue() === 'one two three')).toBe(true);
    await redo();
    expect(await waitFor(() => api!.getValue() === '1 2 3')).toBe(true);
  });

  it('api.setValue with the same value adds no undo entry', async () => {
    let api: ElasticInputAPI | null = null;
    renderInto(React.createElement(ElasticInput, {
      fields: FIELDS,
      inputRef: (a: ElasticInputAPI) => { api = a; },
    }));
    const editorEl = document.querySelector('.ei-editor') as HTMLElement;
    await typeTwoGroups(editorEl);

    api!.setValue('one two three');
    await undo();
    expect(await waitFor(() => api!.getValue() === 'one two')).toBe(true);
  });

  it('a controlled value change from the parent is undoable', async () => {
    let api: ElasticInputAPI | null = null;
    function Harness() {
      const [value, setValue] = React.useState('');
      return React.createElement('div', null,
        React.createElement('button', { id: 'translate', onClick: () => setValue('1 2 3') }, 'translate'),
        React.createElement(ElasticInput, {
          fields: FIELDS,
          value,
          onChange: (q: string) => setValue(q),
          inputRef: (a: ElasticInputAPI) => { api = a; },
        }),
      );
    }
    renderInto(React.createElement(Harness));
    const editorEl = document.querySelector('.ei-editor') as HTMLElement;
    await typeTwoGroups(editorEl);

    await page.elementLocator(document.querySelector('#translate') as HTMLElement).click();
    expect(await waitFor(() => api!.getValue() === '1 2 3')).toBe(true);

    await page.elementLocator(editorEl).click();
    await undo();
    expect(await waitFor(() => api!.getValue() === 'one two three')).toBe(true);
  });
});
