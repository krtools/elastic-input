/**
 * api.setValidationErrors layers errors from outside the component (e.g. a
 * backend's response) on top of the built-in ones. They show immediately,
 * are reported like any other error, and are dropped at the next text change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig, InputStatus } from '../../types';
import { ValidationError } from '../../validation/Validator';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [{ name: 'status', type: 'string' }];
const QUERY = 'status:active';
const BACKEND: ValidationError = { message: 'Rejected by the backend', start: 7, end: 13 };

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const squiggles = () => document.querySelectorAll('.ei-squiggly').length;

/** Editor focused holding QUERY (no built-in errors), caret at the end. */
async function setup(props: Partial<ElasticInputProps> = {}, text = QUERY) {
  const handle: { api: ElasticInputAPI | null } = { api: null };
  const reported: ValidationError[][] = [];
  renderInto(React.createElement(ElasticInput, {
    fields: FIELDS,
    dropdown: { open: 'never' },
    onValidationChange: (errors: ValidationError[]) => { reported.push(errors); },
    ...props,
    inputRef: (a: ElasticInputAPI) => { handle.api = a; },
  }));
  const editorEl = document.querySelector('.ei-editor') as HTMLElement;
  const editor = page.elementLocator(editorEl);
  await editor.click();
  await userEvent.type(editor, text);
  return { api: handle.api!, reported, editorEl, editor };
}

describe('api.setValidationErrors', () => {
  it('underlines immediately, even with the caret inside the error range', async () => {
    const { api } = await setup();
    expect(api.getValidationErrors()).toEqual([]);

    // Caret sits at offset 13 — a built-in error ending there would be deferred
    api.setValidationErrors([BACKEND]);
    expect(await waitFor(() => squiggles() === 1)).toBe(true);
  });

  it("is reported with type 'EXTERNAL' through getValidationErrors and onValidationChange", async () => {
    const { api, reported } = await setup();
    api.setValidationErrors([BACKEND]);

    const expected = [{ ...BACKEND, type: 'EXTERNAL' }];
    expect(api.getValidationErrors()).toEqual(expected);
    expect(reported[reported.length - 1]).toEqual(expected);
  });

  it('makes the slot status invalid; a warning does not', async () => {
    let status: InputStatus | null = null;
    const { api } = await setup({
      suffix: (s: InputStatus) => { status = s; return null; },
    });
    expect(status!.isValid).toBe(true);

    api.setValidationErrors([BACKEND]);
    expect(await waitFor(() => status!.isValid === false)).toBe(true);
    expect(status!.errors.length).toBe(1);

    api.setValidationErrors([{ ...BACKEND, severity: 'warning' }]);
    expect(await waitFor(() => status!.isValid === true)).toBe(true);
    expect(status!.errors.length).toBe(1);
  });

  it('is dropped at the next edit and does not come back when the text returns', async () => {
    const { api, reported } = await setup();
    api.setValidationErrors([BACKEND]);
    expect(await waitFor(() => squiggles() === 1)).toBe(true);

    await userEvent.keyboard('x');
    expect(await waitFor(() => api.getValue() === `${QUERY}x`)).toBe(true);
    expect(api.getValidationErrors()).toEqual([]);
    expect(reported[reported.length - 1]).toEqual([]);

    await userEvent.keyboard('{Backspace}');
    expect(await waitFor(() => api.getValue() === QUERY)).toBe(true);
    await pause(300);
    expect(api.getValidationErrors()).toEqual([]);
    expect(squiggles()).toBe(0);
  });

  it('is dropped by undo', async () => {
    const { api, editor } = await setup();
    await pause(400); // close the typing undo group
    await userEvent.type(editor, ' more');
    await pause(400);
    api.setValidationErrors([{ message: 'no', start: 0, end: 6 }]);

    await userEvent.keyboard('{Control>}z{/Control}');
    expect(await waitFor(() => api.getValue() === QUERY)).toBe(true);
    expect(api.getValidationErrors()).toEqual([]);
  });

  it('survives caret movement and blur', async () => {
    const { api } = await setup();
    api.setValidationErrors([BACKEND]);

    await userEvent.keyboard('{Home}');
    await pause(300);
    expect(api.getValidationErrors().length).toBe(1);

    api.blur();
    await pause(300);
    expect(api.getValidationErrors().length).toBe(1);
    expect(squiggles()).toBe(1);
  });

  it('forQuery: ignored when the input holds different text, applied when it matches', async () => {
    const { api } = await setup();

    api.setValidationErrors([BACKEND], 'status:activ');
    expect(api.getValidationErrors()).toEqual([]);

    api.setValidationErrors([BACKEND], QUERY);
    expect(api.getValidationErrors().length).toBe(1);
  });

  it('each call replaces the previous external errors; [] clears them', async () => {
    const { api } = await setup();
    api.setValidationErrors([BACKEND]);
    api.setValidationErrors([{ message: 'other', start: 0, end: 6 }]);
    expect(api.getValidationErrors().map(e => e.message)).toEqual(['other']);

    api.setValidationErrors([]);
    expect(api.getValidationErrors()).toEqual([]);
    expect(await waitFor(() => squiggles() === 0)).toBe(true);
  });

  it('sits alongside built-in errors, which outlive it', async () => {
    const { api } = await setup({}, 'bogus:x');
    expect(api.getValidationErrors().map(e => e.type)).toEqual(['UNKNOWN_FIELD']);

    api.setValidationErrors([{ message: 'no', start: 6, end: 7 }]);
    expect(api.getValidationErrors().map(e => e.type)).toEqual(['UNKNOWN_FIELD', 'EXTERNAL']);

    await userEvent.keyboard('y');
    expect(await waitFor(() => api.getValue() === 'bogus:xy')).toBe(true);
    expect(api.getValidationErrors().map(e => e.type)).toEqual(['UNKNOWN_FIELD']);
  });

  it('clamps offsets to the text', async () => {
    const { api } = await setup();
    api.setValidationErrors([{ message: 'whole query', start: -3, end: 999 }]);
    expect(api.getValidationErrors()[0]).toMatchObject({ start: 0, end: QUERY.length });
    // A range across several tokens is drawn as one segment per token
    expect(await waitFor(() => squiggles() >= 1)).toBe(true);
  });

  it('works in plain mode', async () => {
    const { api, editor } = await setup({ plainModeLength: 10 });
    expect(api.getAST()).toBeNull();

    api.setValidationErrors([BACKEND]);
    expect(await waitFor(() => squiggles() === 1)).toBe(true);

    await userEvent.type(editor, 'x');
    expect(await waitFor(() => api.getValidationErrors().length === 0)).toBe(true);
  });
});
