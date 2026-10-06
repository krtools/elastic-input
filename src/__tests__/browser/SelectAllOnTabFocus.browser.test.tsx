/**
 * features.selectAllOnTabFocus — keyboard focus (Tab/Shift+Tab) selects the
 * pre-existing query, matching native inputs; mouse focus places the caret.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, FieldConfig } from '../../types';
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

/**
 * What a browser dispatches when its window is deactivated and re-activated
 * (alt-tab), captured from a headed Chromium run: focusout → window blur →
 * window focus → focusin, none with a relatedTarget. Headless Chromium
 * emulates permanent window focus, so the sequence is replayed by hand.
 */
async function alternateWindowFocus(focused: HTMLElement | null) {
  focused?.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
  window.dispatchEvent(new Event('blur'));
  await settle(50);
  window.dispatchEvent(new Event('focus'));
  focused?.dispatchEvent(new FocusEvent('focus', { relatedTarget: null }));
  await settle();
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

  it('Shift+Tab into a pre-filled input selects too', async () => {
    renderInto(React.createElement('div', null,
      input({ defaultValue: 'status:active' }),
      React.createElement('button', { id: 'after' }, 'after'),
    ));

    (document.querySelector('#after') as HTMLElement).focus();
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    await settle();
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('status:active');
  });

  // Regression: focus without a recent pointerdown counted as a Tab, so the
  // window regaining focus (alt-tab back) selected everything.
  it('the window regaining focus restores the caret instead of selecting', async () => {
    let api: ElasticInputAPI | null = null;
    renderInto(harness(input({ defaultValue: 'status:active', inputRef: (a: ElasticInputAPI) => { api = a; } })));
    api!.setSelection(3, 3);
    await settle(400); // well past any pointer/Tab activity

    await alternateWindowFocus(editors()[0]);
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('');
    expect(api!.getSelection()).toEqual({ start: 3, end: 3 });
  });

  it('Tab after returning to the window still selects', async () => {
    renderInto(harness(input({ defaultValue: 'status:active' })));
    (document.querySelector('#before') as HTMLElement).focus();
    await alternateWindowFocus(document.querySelector('#before'));

    await userEvent.keyboard('{Tab}');
    await settle();
    expect(selectedText()).toBe('status:active');
  });

  it('api.focus() places the caret without selecting, like input.focus()', async () => {
    let api: ElasticInputAPI | null = null;
    renderInto(harness(input({ defaultValue: 'status:active', inputRef: (a: ElasticInputAPI) => { api = a; } })));

    api!.focus();
    await settle();
    expect(document.activeElement).toBe(editors()[0]);
    expect(selectedText()).toBe('');
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
