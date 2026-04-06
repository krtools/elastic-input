import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig, SuggestionItem } from '../../types';
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
});
