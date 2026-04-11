import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig, SuggestionItem, DropdownOpenContext } from '../../types';
import { findNodeAtOffset } from '../../utils/cursorUtils';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string' },
  { name: 'level', label: 'Level', type: 'string' },
  { name: 'name', label: 'Name', type: 'string' },
  { name: 'created', label: 'Created', type: 'date' },
  { name: 'is_vip', label: 'VIP', type: 'boolean' },
];

const STATUS_VALUES = ['active', 'inactive', 'lead', 'prospect', 'churned'];

function mockFetchSuggestions(fieldName: string, partial: string): Promise<SuggestionItem[]> {
  if (fieldName !== 'status') return Promise.resolve([]);
  const lower = partial.toLowerCase();
  return Promise.resolve(
    STATUS_VALUES
      .filter(v => v.includes(lower))
      .map(v => ({ text: v }))
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

function dropdownText(): string {
  return document.querySelector(DROPDOWN)?.textContent ?? '';
}

function editorText(): string {
  return document.querySelector(EDITOR)?.textContent ?? '';
}

describe('ElasticInput browser tests', () => {
  describe('Tab vs Enter field acceptance', () => {
    for (const key of ['Enter', 'Tab'] as const) {
      it(`${key} accepts field name and shows value suggestions (open="always")`, async () => {
        renderInto(
          React.createElement(ElasticInput, {
            fields: FIELDS,
            fetchSuggestions: mockFetchSuggestions,
            dropdown: { open: 'always' as const },
          }),
        );

        const editor = page.elementLocator(document.querySelector(EDITOR) as HTMLElement);
        await editor.click();
        await userEvent.type(editor, 'stat');

        // Wait for field dropdown
        expect(await waitFor(dropdownVisible)).toBe(true);
        expect(dropdownText().toLowerCase()).toContain('status');

        // Select and accept
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard(key === 'Enter' ? '{Enter}' : '{Tab}');

        // Field should be accepted
        expect(await waitFor(() => editorText().includes(':'))).toBe(true);
        expect(editorText()).toContain('status:');

        // Value suggestions should appear (async, small delay)
        const hasValues = await waitFor(() => {
          const text = dropdownText();
          return text.includes('active') || text.includes('inactive');
        });
        expect(hasValues).toBe(true);
      });

      it(`${key} accepts field name and shows value suggestions (open="input")`, async () => {
        renderInto(
          React.createElement(ElasticInput, {
            fields: FIELDS,
            fetchSuggestions: mockFetchSuggestions,
            dropdown: { open: 'input' as const },
          }),
        );

        const editor = page.elementLocator(document.querySelector(EDITOR) as HTMLElement);
        await editor.click();
        await userEvent.type(editor, 'stat');

        expect(await waitFor(dropdownVisible)).toBe(true);

        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard(key === 'Enter' ? '{Enter}' : '{Tab}');

        expect(await waitFor(() => editorText().includes(':'))).toBe(true);
        expect(editorText()).toContain('status:');

        const hasValues = await waitFor(() => {
          const text = dropdownText();
          return text.includes('active') || text.includes('inactive');
        });
        expect(hasValues).toBe(true);
      });
    }
  });

  describe('Tab with transient blur', () => {
    it('Tab still shows suggestions even if a blur/refocus happens after keyup', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          fetchSuggestions: mockFetchSuggestions,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;

      // Simulate focus management that blurs/refocuses on Tab keyup
      editorEl.addEventListener('keyup', (e) => {
        if (e.key === 'Tab') {
          editorEl.blur();
          setTimeout(() => editorEl.focus(), 10);
        }
      });

      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'stat');

      expect(await waitFor(dropdownVisible)).toBe(true);

      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Tab}');

      expect(await waitFor(() => editorText().includes(':'))).toBe(true);

      // Give extra time for blur/refocus cycle to settle
      await new Promise(r => setTimeout(r, 200));

      const hasValues = await waitFor(() => {
        const text = dropdownText();
        return text.includes('active') || text.includes('inactive');
      });
      expect(hasValues).toBe(true);
    });
  });

  describe('Tab with async fields', () => {
    it('Tab shows value suggestions when fields is an async function', async () => {
      const fieldsAsync = () => Promise.resolve(FIELDS);

      renderInto(
        React.createElement(ElasticInput, {
          fields: fieldsAsync,
          fetchSuggestions: mockFetchSuggestions,
          dropdown: { open: 'always' as const },
        }),
      );

      // Wait for async fields to resolve
      await new Promise(r => setTimeout(r, 200));

      const editor = page.elementLocator(document.querySelector(EDITOR) as HTMLElement);
      await editor.click();
      await userEvent.type(editor, 'stat');

      expect(await waitFor(dropdownVisible)).toBe(true);

      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Tab}');

      expect(await waitFor(() => editorText().includes(':'))).toBe(true);
      expect(editorText()).toContain('status:');

      const hasValues = await waitFor(() => {
        const text = dropdownText();
        return text.includes('active') || text.includes('inactive');
      });
      expect(hasValues).toBe(true);
    });
  });

  describe('blur cancels async suggestions', () => {
    it('blurring before async suggestions resolve prevents dropdown from appearing', async () => {
      // Slow fetch — 500ms delay
      const slowFetch = (fieldName: string, partial: string): Promise<SuggestionItem[]> => {
        if (fieldName !== 'status') return Promise.resolve([]);
        const lower = partial.toLowerCase();
        return new Promise(resolve => setTimeout(() => resolve(
          STATUS_VALUES.filter(v => v.includes(lower)).map(v => ({ text: v }))
        ), 500));
      };

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          fetchSuggestions: slowFetch,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'stat');

      // Wait for field dropdown, accept field
      expect(await waitFor(dropdownVisible)).toBe(true);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Enter}');
      expect(await waitFor(() => editorText().includes(':'))).toBe(true);

      // Blur immediately — before the 500ms async fetch resolves
      editorEl.blur();
      await new Promise(r => setTimeout(r, 50));

      // Wait long enough for the fetch to have resolved if it wasn't cancelled
      await new Promise(r => setTimeout(r, 800));

      // Dropdown should NOT be visible
      expect(dropdownVisible()).toBe(false);
    });

    it('blurring cancels loading spinner from appearing', async () => {
      // Very slow fetch
      const verySlowFetch = (_fieldName: string, _partial: string): Promise<SuggestionItem[]> => {
        return new Promise(resolve => setTimeout(() => resolve([{ text: 'result' }]), 2000));
      };

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          fetchSuggestions: verySlowFetch,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'stat');

      expect(await waitFor(dropdownVisible)).toBe(true);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Tab}');
      expect(await waitFor(() => editorText().includes(':'))).toBe(true);

      // Blur before loading spinner or results appear
      editorEl.blur();
      await new Promise(r => setTimeout(r, 50));

      // Wait and verify dropdown stays closed
      await new Promise(r => setTimeout(r, 500));
      expect(dropdownVisible()).toBe(false);
    });
  });

  describe('double-click word selection', () => {
    /**
     * Simulate a click with a specific detail (click count) at a character offset
     * within the editor. Uses getBoundingClientRect on a Range to find coordinates.
     */
    function clickAtOffset(editor: HTMLElement, charOffset: number, detail: number) {
      const result = findNodeAtOffset(editor, charOffset);
      if (!result) throw new Error(`No node at offset ${charOffset}`);

      const range = document.createRange();
      range.setStart(result.node, result.offset);
      range.setEnd(result.node, result.offset);
      const rect = range.getBoundingClientRect();
      const x = rect.left + 1;
      const y = rect.top + rect.height / 2;

      const opts = { detail, clientX: x, clientY: y, bubbles: true, cancelable: true };
      editor.dispatchEvent(new MouseEvent('mousedown', opts));
      editor.dispatchEvent(new MouseEvent('mouseup', { ...opts }));
      editor.dispatchEvent(new MouseEvent('click', { ...opts }));
    }

    function getSelectedText(): string {
      const sel = window.getSelection();
      return sel?.toString() ?? '';
    }

    it('double-click selects word without trailing whitespace', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'filter:value abc');
      await new Promise(r => setTimeout(r, 100));

      // Double-click on "value" (offset 7 is middle of "value" in "filter:value abc")
      clickAtOffset(editorEl, 9, 2);
      await new Promise(r => setTimeout(r, 50));

      // Should select "value" without trailing space
      expect(getSelectedText()).toBe('value');
    });

    it('double-click + backspace preserves adjacent space', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'filter:value abc');
      await new Promise(r => setTimeout(r, 100));

      // Double-click on "value"
      clickAtOffset(editorEl, 9, 2);
      await new Promise(r => setTimeout(r, 50));

      // Delete the selected word
      await userEvent.keyboard('{Backspace}');
      await new Promise(r => setTimeout(r, 100));

      // Space between "filter:" and "abc" should be preserved
      expect(editorText()).toBe('filter: abc');
    });

    it('double-click works after triple-click (selection not cleared by mouseup)', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'status:active lead');
      await new Promise(r => setTimeout(r, 100));

      // Triple-click to select all
      await editor.tripleClick();
      await new Promise(r => setTimeout(r, 100));
      expect(getSelectedText()).toContain('status:active lead');

      // Now double-click on "active" (offset ~9)
      clickAtOffset(editorEl, 9, 2);
      await new Promise(r => setTimeout(r, 50));

      expect(getSelectedText()).toBe('active');
    });

    it('triple-click selects entire content (browser default)', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'filter:value abc');
      await new Promise(r => setTimeout(r, 100));

      // Triple-click via Playwright API — triggers real browser behavior
      await editor.tripleClick();
      await new Promise(r => setTimeout(r, 50));

      const selected = getSelectedText();
      // Triple-click selects the full line/paragraph
      expect(selected).toContain('filter:value abc');
    });
  });

  describe('mount does not steal focus', () => {
    it('mounting with a pre-existing value does not focus the editor', async () => {
      // Focus something else first
      const button = document.createElement('button');
      button.textContent = 'Other';
      document.body.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          value: 'status:active AND level:error',
        }),
      );

      // Wait for mount + processInput to complete
      await new Promise(r => setTimeout(r, 200));

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      expect(document.activeElement).not.toBe(editorEl);

      button.remove();
    });

    it('mounting with a value containing parentheses does not focus the editor', async () => {
      const button = document.createElement('button');
      button.textContent = 'Other';
      document.body.appendChild(button);
      button.focus();
      expect(document.activeElement).toBe(button);

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          value: '(status:active OR status:inactive)',
        }),
      );

      await new Promise(r => setTimeout(r, 200));

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      expect(document.activeElement).not.toBe(editorEl);

      button.remove();
    });
  });

  describe('controlled value reactivity', () => {
    // Mirrors the demo's exact pattern: useState + value prop + onChange
    function ControlledWrapper({ fields }: { fields: FieldConfig[] }) {
      const [value, setValue] = React.useState('');
      return React.createElement('div', null,
        React.createElement(ElasticInput, {
          fields,
          value,
          onChange: (q: string) => setValue(q),
        }),
        React.createElement('button', {
          id: 'clear-btn',
          onClick: () => setValue(''),
        }, 'Clear'),
        React.createElement('div', { id: 'state-value' }, value),
      );
    }

    it('clicking Clear after typing empties the editor', async () => {
      renderInto(React.createElement(ControlledWrapper, { fields: FIELDS }));

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'status:active');
      await new Promise(r => setTimeout(r, 150));

      // Verify text landed
      expect(editorEl.textContent).toBe('status:active');
      // Verify parent state is in sync
      expect(document.getElementById('state-value')!.textContent).toBe('status:active');

      // Click Clear button (like the demo sidebar)
      const clearBtn = page.elementLocator(document.getElementById('clear-btn')!);
      await clearBtn.click();
      await new Promise(r => setTimeout(r, 150));

      // Parent state should be empty
      expect(document.getElementById('state-value')!.textContent).toBe('');
      // Editor DOM should be empty too
      expect(editorEl.textContent).toBe('');
    });

    it('clicking Clear after typing empties the editor (with fetchSuggestions)', async () => {
      // Closer to the demo: includes fetchSuggestions, multiple onChange state updates
      function DemoLikeWrapper({ fields }: { fields: FieldConfig[] }) {
        const [value, setValue] = React.useState('');
        const [lastQuery, setLastQuery] = React.useState('');
        const [lastAST, setLastAST] = React.useState<any>(null);
        const handleChange = React.useCallback((q: string, ast: any) => {
          setLastQuery(q);
          setLastAST(ast);
          setValue(q);
        }, []);
        return React.createElement('div', null,
          React.createElement(ElasticInput, {
            fields,
            value,
            onChange: handleChange,
            fetchSuggestions: mockFetchSuggestions,
            dropdown: { open: 'input' as const },
          }),
          React.createElement('button', {
            id: 'clear-btn',
            onClick: () => { setValue(''); setLastQuery(''); setLastAST(null); },
          }, 'Clear'),
          React.createElement('div', { id: 'state-value' }, value),
        );
      }

      renderInto(React.createElement(DemoLikeWrapper, { fields: FIELDS }));

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'status:active');
      await new Promise(r => setTimeout(r, 300));

      expect(editorEl.textContent).toBe('status:active');
      expect(document.getElementById('state-value')!.textContent).toBe('status:active');

      // Click Clear
      const clearBtn = page.elementLocator(document.getElementById('clear-btn')!);
      await clearBtn.click();
      await new Promise(r => setTimeout(r, 200));

      expect(document.getElementById('state-value')!.textContent).toBe('');
      expect(editorEl.textContent).toBe('');
    });

    it('typing in sidebar input updates the editor', async () => {
      // Wrapper with an external text input that drives the value
      function SidebarWrapper({ fields }: { fields: FieldConfig[] }) {
        const [value, setValue] = React.useState('');
        return React.createElement('div', null,
          React.createElement(ElasticInput, {
            fields,
            value,
            onChange: (q: string) => setValue(q),
          }),
          React.createElement('input', {
            id: 'sidebar-input',
            type: 'text',
            value,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value),
          }),
        );
      }

      renderInto(React.createElement(SidebarWrapper, { fields: FIELDS }));

      const sidebarInput = page.elementLocator(document.getElementById('sidebar-input')!);
      await sidebarInput.click();
      await userEvent.type(sidebarInput, 'level:error');
      await new Promise(r => setTimeout(r, 150));

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      expect(editorEl.textContent).toBe('level:error');
    });
  });

  describe('blur with parentheses', () => {
    it('typing "a" allows blur when clicking outside', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'a');
      await new Promise(r => setTimeout(r, 100));

      // Click outside the editor to blur
      document.body.click();
      editorEl.blur();
      await new Promise(r => setTimeout(r, 100));

      expect(document.activeElement).not.toBe(editorEl);
    });

    it('typing "(a)" allows blur when clicking outside', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, '(a)');
      await new Promise(r => setTimeout(r, 100));

      // Click outside the editor to blur
      document.body.click();
      editorEl.blur();
      await new Promise(r => setTimeout(r, 100));

      expect(document.activeElement).not.toBe(editorEl);
    });
  });

  describe('dropdown follows caret on Shift+Enter', () => {
    function getDropdownTop(): number | null {
      const el = document.querySelector(DROPDOWN) as HTMLElement | null;
      if (!el) return null;
      const top = el.style.top;
      return top ? parseFloat(top) : null;
    }

    it('repositions dropdown when Shift+Enter is pressed in an empty input', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();

      // Dropdown should be visible with field suggestions
      expect(await waitFor(dropdownVisible)).toBe(true);
      await new Promise(r => setTimeout(r, 100));
      const topBefore = getDropdownTop();
      expect(topBefore).not.toBeNull();

      // Shift+Enter to add a newline
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await new Promise(r => setTimeout(r, 200));

      // Dropdown should still be visible and repositioned lower
      expect(dropdownVisible()).toBe(true);
      const topAfter = getDropdownTop();
      expect(topAfter).not.toBeNull();
      expect(topAfter!).toBeGreaterThan(topBefore!);
    });

    it('repositions dropdown when Shift+Enter is pressed after a value', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          fetchSuggestions: mockFetchSuggestions,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'hello ');
      await new Promise(r => setTimeout(r, 100));

      // After 'hello ' cursor is in whitespace — open='always' shows operator/field suggestions
      expect(await waitFor(dropdownVisible)).toBe(true);
      const topBefore = getDropdownTop();
      expect(topBefore).not.toBeNull();

      // Shift+Enter to add a newline
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await new Promise(r => setTimeout(r, 200));

      expect(dropdownVisible()).toBe(true);
      const topAfter = getDropdownTop();
      expect(topAfter).not.toBeNull();
      expect(topAfter!).toBeGreaterThan(topBefore!);
    });
  });

  describe('wildcard value acceptance preserves colon', () => {
    it('accepting a quoted suggestion for a wildcard partial keeps the colon', async () => {
      // fetchSuggestions returns a quoted value for the special-char match
      const fetch = (fieldName: string, partial: string): Promise<SuggestionItem[]> => {
        if (fieldName !== 'code') return Promise.resolve([]);
        const items = [{ text: '"?N"', label: '?N' }];
        return Promise.resolve(
          items.filter(i => i.label.toLowerCase().includes(partial.toLowerCase()))
        );
      };

      const FIELDS_WITH_CODE: FieldConfig[] = [
        ...FIELDS,
        { name: 'code', label: 'Code', type: 'string' },
      ];

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS_WITH_CODE,
          fetchSuggestions: fetch,
          dropdown: { open: 'always' as const },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'code:?N');
      await new Promise(r => setTimeout(r, 200));

      // Dropdown should show the ?N suggestion
      expect(await waitFor(() => dropdownText().includes('?N'))).toBe(true);

      // Accept the suggestion
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Tab}');
      await new Promise(r => setTimeout(r, 100));

      // Should be code:"?N", NOT code"?N"
      const text = editorText();
      expect(text).toContain('code:');
      expect(text).toBe('code:"?N" ');
    });
  });

  describe('backspace in newline-only content', () => {
    it('removes one newline instead of clearing entire input', async () => {
      let lastValue = '';
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          onChange: (q: string) => { lastValue = q; },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();

      // Insert 3 newlines via Shift+Enter
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await new Promise(r => setTimeout(r, 150));

      expect(lastValue).toBe('\n\n\n');

      // Backspace should remove only one newline
      await userEvent.keyboard('{Backspace}');
      await new Promise(r => setTimeout(r, 150));

      expect(lastValue).toBe('\n\n');
      // Editor should still have <br> elements (not empty)
      const brs = editorEl.querySelectorAll('br:not([data-sentinel])');
      expect(brs.length).toBeGreaterThan(0);
    });

    it('backspace from single newline clears to empty', async () => {
      let lastValue = '';
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          onChange: (q: string) => { lastValue = q; },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();

      // Insert 1 newline
      await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
      await new Promise(r => setTimeout(r, 150));
      expect(lastValue).toBe('\n');

      // Backspace should clear to empty
      await userEvent.keyboard('{Backspace}');
      await new Promise(r => setTimeout(r, 150));

      expect(lastValue).toBe('');
    });
  });

  describe('basic rendering', () => {
    it('renders with placeholder text', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          placeholder: 'Search...',
        }),
      );

      const editor = document.querySelector(EDITOR);
      expect(editor).not.toBeNull();
      expect(editor?.getAttribute('contenteditable')).toBe('true');

      const placeholder = document.querySelector('.ei-placeholder');
      expect(placeholder?.textContent).toBe('Search...');
    });

    it('accepts typed input and shows field suggestions', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: 'always' as const },
        }),
      );

      const editor = page.elementLocator(document.querySelector(EDITOR) as HTMLElement);
      await editor.click();
      await userEvent.type(editor, 'sta');

      expect(await waitFor(dropdownVisible)).toBe(true);
      expect(dropdownText().toLowerCase()).toContain('status');
    });
  });

  describe('scroll dismiss', () => {
    it('closes dropdown when editor is scrolled', async () => {
      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          fetchSuggestions: mockFetchSuggestions,
        }),
      );
      const editor = page.elementLocator(document.querySelector(EDITOR) as HTMLElement);
      await editor.click();
      await userEvent.type(editor, 'sta');

      expect(await waitFor(dropdownVisible)).toBe(true);

      // Trigger scroll on the editor element
      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      editorEl.dispatchEvent(new Event('scroll'));

      expect(await waitFor(() => !dropdownVisible(), 1000)).toBe(true);
    });
  });

  describe('dropdown.open callback selectionStart/selectionEnd', () => {
    it('selectionStart and selectionEnd differ when text is selected', async () => {
      const captured: DropdownOpenContext[] = [];
      const openFn = (ctx: DropdownOpenContext): boolean | null => {
        captured.push({ ...ctx });
        return null;
      };

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: openFn },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'status:active');
      await new Promise(r => setTimeout(r, 150));

      // Select "active" (characters 7-13) via Shift+Home to select from cursor to start
      captured.length = 0;
      await userEvent.keyboard('{Shift>}{Home}{/Shift}');
      await new Promise(r => setTimeout(r, 200));

      // Shift+Home selects from cursor (end of "status:active") to start — 13 chars
      const withSelection = captured.filter(c => c.selectionStart !== c.selectionEnd);
      expect(withSelection.length).toBeGreaterThan(0);
      const last = withSelection[withSelection.length - 1];
      expect(last.selectionStart).toBe(0);
      expect(last.selectionEnd).toBe(13);
    });

    it('selectionStart equals selectionEnd with collapsed caret', async () => {
      const captured: DropdownOpenContext[] = [];
      const openFn = (ctx: DropdownOpenContext): boolean | null => {
        captured.push({ ...ctx });
        return null;
      };

      renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: { open: openFn },
        }),
      );

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      captured.length = 0;
      await userEvent.type(editor, 'hello');
      await new Promise(r => setTimeout(r, 150));

      // All invocations during typing should have collapsed caret
      expect(captured.length).toBeGreaterThan(0);
      for (const ctx of captured) {
        expect(ctx.selectionStart).toBe(ctx.selectionEnd);
      }
    });
  });

  describe('dropdown viewport overflow', () => {
    it('dropdown with wide custom content does not overflow the right edge of the viewport', async () => {
      // Render a custom field hint that is ~350px wide via a minWidth so
      // the dropdown element is forced to be at least 350px regardless of
      // CSS maxWidth.
      const renderFieldHint = (_field: FieldConfig, _partial: string) => {
        return React.createElement('div', {
          style: { minWidth: '350px', padding: '8px' },
          className: 'test-wide-hint',
        }, 'Wide hint content that forces dropdown wider');
      };

      // Position the input near the right edge of the viewport.
      // Don't provide fetchSuggestions so the sync path renders the hint directly.
      const container = renderInto(
        React.createElement(ElasticInput, {
          fields: FIELDS,
          dropdown: {
            open: 'always' as const,
            renderFieldHint,
          },
          styles: { dropdownMaxWidth: '500px' },
        }),
      );
      container.style.cssText = 'position:absolute; right:0; top:50px; width:200px;';

      const editorEl = document.querySelector(EDITOR) as HTMLElement;
      const editor = page.elementLocator(editorEl);
      await editor.click();
      await userEvent.type(editor, 'status:');
      await new Promise(r => setTimeout(r, 300));

      // Dropdown should be visible
      expect(await waitFor(dropdownVisible)).toBe(true);

      const dropdown = document.querySelector(DROPDOWN) as HTMLElement;
      expect(dropdown).not.toBeNull();

      const rect = dropdown.getBoundingClientRect();
      const vw = window.innerWidth;

      // The dropdown's right edge must not exceed the viewport
      expect(rect.right).toBeLessThanOrEqual(vw);
      // And its left must not be negative
      expect(rect.left).toBeGreaterThanOrEqual(0);
    });
  });
});
