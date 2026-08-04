/**
 * Browser tests for prefix/suffix slots, the internal-focus blur guard,
 * and the imperative submit() API.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig, SuggestionItem, InputStatus } from '../../types';
import { ASTNode } from '../../parser/ast';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string' },
  { name: 'level', label: 'Level', type: 'string' },
];

const STATUS_VALUES = ['active', 'inactive', 'lead'];

function mockFetchSuggestions(fieldName: string, partial: string): Promise<SuggestionItem[]> {
  if (fieldName !== 'status') return Promise.resolve([]);
  const lower = partial.toLowerCase();
  return Promise.resolve(
    STATUS_VALUES.filter(v => v.includes(lower)).map(v => ({ text: v }))
  );
}

const DROPDOWN = '.ei-dropdown';
const EDITOR = '.ei-editor';

async function waitFor(
  fn: () => boolean | Promise<boolean>,
  timeout = 3000,
  interval = 50,
): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

function dropdownVisible(): boolean {
  const el = document.querySelector(DROPDOWN);
  return el !== null && (el as HTMLElement).offsetParent !== null;
}

function editorEl(): HTMLElement {
  return document.querySelector(EDITOR) as HTMLElement;
}

describe('prefix/suffix slots', () => {
  it('renders slot content inside the bordered container without overlapping text', () => {
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        placeholder: 'Search…',
        prefix: React.createElement('span', { id: 'pfx' }, '🔎'),
        suffix: React.createElement('button', { id: 'sfx' }, 'Go'),
      }),
    );

    const container = document.querySelector('.ei-container') as HTMLElement;
    const prefix = document.querySelector('.ei-prefix') as HTMLElement;
    const suffix = document.querySelector('.ei-suffix') as HTMLElement;
    const editor = editorEl();
    expect(container).not.toBeNull();
    expect(prefix).not.toBeNull();
    expect(suffix).not.toBeNull();
    expect(container.contains(prefix)).toBe(true);
    expect(container.contains(suffix)).toBe(true);

    // Flex layout reserves space — no overlap in either direction
    const e = editor.getBoundingClientRect();
    const p = prefix.getBoundingClientRect();
    const s = suffix.getBoundingClientRect();
    expect(p.right).toBeLessThanOrEqual(e.left + 0.5);
    expect(e.right).toBeLessThanOrEqual(s.left + 0.5);

    // Placeholder also stays clear of the suffix (it lives inside the editor wrap)
    const ph = document.querySelector('.ei-placeholder') as HTMLElement;
    expect(ph).not.toBeNull();
    expect(ph.getBoundingClientRect().right).toBeLessThanOrEqual(s.left + 0.5);
  });

  it('clicking a suffix button keeps editor focus and the open dropdown', async () => {
    const clicks: string[] = [];
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        fetchSuggestions: mockFetchSuggestions,
        suffix: React.createElement(
          'button',
          { id: 'sfx-btn', onClick: () => clicks.push('click') },
          'Go',
        ),
      }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'stat');
    expect(await waitFor(dropdownVisible)).toBe(true);

    const btn = document.querySelector('#sfx-btn') as HTMLElement;
    await page.elementLocator(btn).click();

    expect(clicks).toEqual(['click']);
    // mousedown was prevented: focus never left the editor
    expect(document.activeElement).toBe(editorEl());
    // and the dropdown never tore down
    expect(dropdownVisible()).toBe(true);
  });

  it('render prop receives live status — validity drives disabled state', async () => {
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        suffix: (status: InputStatus) =>
          React.createElement(
            'button',
            { id: 'status-btn', disabled: !status.value.trim() || !status.isValid },
            'Go',
          ),
      }),
    );

    const btn = () => document.querySelector('#status-btn') as HTMLButtonElement;
    // Empty input → disabled
    expect(btn().disabled).toBe(true);

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:active');
    expect(await waitFor(() => !btn().disabled)).toBe(true);

    // Unknown field → invalid → disabled again
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.type(editor, 'bogus:value');
    expect(await waitFor(() => btn().disabled)).toBe(true);
  });

  it('squiggles align with error text when a prefix shifts the editor', async () => {
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        prefix: React.createElement('span', { style: { width: 24, display: 'inline-block' } }, '🔎'),
      }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'bogus:value');

    // Squiggle measurement is debounced (150ms) — wait for it
    expect(await waitFor(() => document.querySelector('.ei-squiggly') !== null)).toBe(true);

    const wave = (document.querySelector('.ei-squiggly') as HTMLElement).getBoundingClientRect();
    const fieldSpan = Array.from(document.querySelectorAll('.ei-token--field-name'))
      .find(el => el.textContent === 'bogus') as HTMLElement;
    expect(fieldSpan).toBeTruthy();
    const text = fieldSpan.getBoundingClientRect();
    // The unknown-field squiggle must start where the field name starts
    expect(Math.abs(wave.left - text.left)).toBeLessThan(2);
    expect(wave.width).toBeGreaterThan(text.width - 4);
  });
});

describe('internal-focus blur guard', () => {
  it('focus moving editor → suffix button keeps dropdown and focus state; leaving tears down', async () => {
    const focusCalls: string[] = [];
    const blurCalls: string[] = [];
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        onFocus: () => focusCalls.push('focus'),
        onBlur: () => blurCalls.push('blur'),
        suffix: React.createElement('button', { id: 'guard-btn' }, 'Go'),
      }),
    );

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'stat');
    expect(await waitFor(dropdownVisible)).toBe(true);
    expect(focusCalls.length).toBe(1);

    // Move focus to the suffix button (keyboard path — no mousedown guard involved)
    const btn = document.querySelector('#guard-btn') as HTMLElement;
    btn.focus();
    await new Promise(r => setTimeout(r, 100));

    // Internal move: no blur, dropdown intact, no re-entrant focus
    expect(blurCalls.length).toBe(0);
    expect(dropdownVisible()).toBe(true);
    expect(focusCalls.length).toBe(1);

    // Focus leaves the component entirely → full teardown
    btn.blur();
    expect(await waitFor(() => !dropdownVisible())).toBe(true);
    expect(blurCalls.length).toBe(1);
  });
});

describe('api.submit()', () => {
  function setup(props: Record<string, unknown> = {}) {
    const searches: { query: string; ast: ASTNode | null }[] = [];
    let api: ElasticInputAPI | null = null;
    renderInto(
      React.createElement(ElasticInput, {
        fields: FIELDS,
        fetchSuggestions: mockFetchSuggestions,
        onSearch: (query: string, ast: ASTNode | null) => searches.push({ query, ast }),
        inputRef: (a: ElasticInputAPI) => { api = a; },
        ...props,
      }),
    );
    return { searches, getApi: () => api! };
  }

  it('submits the post-accept query when a value suggestion is highlighted (Enter parity)', async () => {
    const { searches, getApi } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'status:');
    expect(await waitFor(() =>
      dropdownVisible() && (document.querySelector(DROPDOWN)?.textContent ?? '').includes('active')
    )).toBe(true);

    await userEvent.keyboard('{ArrowDown}');
    getApi().submit();

    expect(await waitFor(() => searches.length === 1)).toBe(true);
    // Same string Enter produces: accepted value + trailing space
    expect(searches[0].query).toBe('status:active ');
    expect(searches[0].ast).not.toBeNull();
  });

  it('accepts a highlighted field name, then submits the result', async () => {
    const { searches, getApi } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'stat');
    expect(await waitFor(dropdownVisible)).toBe(true);

    // Partial match pre-selects the "status" field suggestion
    getApi().submit();

    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0].query).toBe('status:');
  });

  it('submits the raw query when no dropdown is open', async () => {
    const { searches, getApi } = setup({ dropdown: { open: 'never' as const } });

    const editor = page.elementLocator(editorEl());
    await editor.click();
    await userEvent.type(editor, 'hello world');

    getApi().submit();
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0].query).toBe('hello world');
    expect(searches[0].ast).not.toBeNull();
  });

  it('submits the raw query and closes the dropdown when nothing is highlighted', async () => {
    const { searches, getApi } = setup();

    const editor = page.elementLocator(editorEl());
    await editor.click();
    // No typing partial: dropdown opens with field suggestions but nothing selected
    expect(await waitFor(dropdownVisible)).toBe(true);

    getApi().submit();
    expect(await waitFor(() => searches.length === 1)).toBe(true);
    expect(searches[0].query).toBe('');
    expect(dropdownVisible()).toBe(false);
  });
});
