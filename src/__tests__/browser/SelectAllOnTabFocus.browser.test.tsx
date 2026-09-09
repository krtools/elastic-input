/**
 * features.selectAllOnTabFocus — keyboard focus (Tab/Shift+Tab) selects the
 * pre-existing query, matching native inputs; mouse focus places the caret.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string' },
  { name: 'level', label: 'Level', type: 'string' },
];

function editors(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.ei-editor'));
}

function selectedText(): string {
  return window.getSelection()?.toString() ?? '';
}

async function settle(ms = 100) {
  await new Promise(r => setTimeout(r, ms));
}

/** A tabbable element before the input(s), as a Tab launch point. */
function harness(...inputs: React.ReactElement[]) {
  return React.createElement(
    'div',
    null,
    React.createElement('button', { id: 'before' }, 'before'),
    ...inputs,
  );
}

function input(props: Record<string, unknown> = {}) {
  return React.createElement(ElasticInput, {
    fields: FIELDS,
    features: { selectAllOnTabFocus: true },
    ...props,
  });
}

describe('selectAllOnTabFocus', () => {
  it('Tab into a pre-filled input selects the whole query; typing replaces it', async () => {
    renderInto(harness(input({ defaultValue: 'status:active' })));

    (document.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await settle();

    const [editor] = editors();
    expect(document.activeElement).toBe(editor);
    expect(selectedText()).toBe('status:active');

    await userEvent.keyboard('x');
    await settle();
    expect(editor.textContent).toBe('x');
  });

  it('tabbing between two instances selects each one in turn', async () => {
    renderInto(harness(
      input({ defaultValue: 'status:active' }),
      input({ defaultValue: 'level:high' }),
    ));

    (document.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await settle();
    const [a, b] = editors();
    expect(document.activeElement).toBe(a);
    expect(selectedText()).toBe('status:active');

    await userEvent.keyboard('{Tab}');
    await settle();
    expect(document.activeElement).toBe(b);
    expect(selectedText()).toBe('level:high');
    // First input untouched by passing through
    expect(a.textContent).toBe('status:active');
  });

  it('mouse click places the caret without selecting', async () => {
    renderInto(harness(input({ defaultValue: 'status:active' })));

    await page.elementLocator(editors()[0]).click();
    await settle();
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('');
  });

  it('Tab into an empty input is a no-op selection-wise', async () => {
    renderInto(harness(input()));

    (document.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('');
  });

  it('survives the collapseOnBlur expand rebuild', async () => {
    renderInto(harness(input({ defaultValue: 'status:active', collapseOnBlur: true })));

    (document.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await settle(200);
    expect(selectedText()).toBe('status:active');
  });

  it('is off by default', async () => {
    renderInto(harness(React.createElement(ElasticInput, {
      fields: FIELDS,
      defaultValue: 'status:active',
    })));

    (document.querySelector('#before') as HTMLElement).focus();
    await userEvent.keyboard('{Tab}');
    await settle();
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('');
  });
});
