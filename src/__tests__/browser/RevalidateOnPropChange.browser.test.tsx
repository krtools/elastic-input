/**
 * Props that affect validation re-validate the current text when they
 * change, without an edit: validateValue, parseDate, defaultField, and
 * plainModeLength. Regression: they were read only on the next edit, so
 * the shown errors (or plain/highlighted mode) lagged behind the props.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { ElasticInputAPI, ElasticInputProps, FieldConfig, ValidateValueContext } from '../../types';
import { ValidationError } from '../../validation/Validator';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'rating', type: 'number' },
  { name: 'created', type: 'date' },
];

async function waitFor(fn: () => boolean, timeout = 3000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const editorEl = () => document.querySelector('.ei-editor') as HTMLElement;
const squiggles = () => document.querySelectorAll('.ei-squiggly').length;

/** Harness whose props can be updated from the test. */
function setup(initial: Partial<ElasticInputProps>) {
  const handle = {
    api: null as ElasticInputAPI | null,
    update: (_p: Partial<ElasticInputProps>) => {},
    changes: [] as string[],
    validations: [] as ValidationError[][],
  };
  function Harness() {
    const [props, setProps] = React.useState(initial);
    handle.update = p => setProps(prev => ({ ...prev, ...p }));
    return React.createElement(ElasticInput, {
      fields: FIELDS,
      dropdown: { open: 'never' },
      onChange: (q: string) => { handle.changes.push(q); },
      onValidationChange: (errors: ValidationError[]) => { handle.validations.push(errors); },
      ...props,
      inputRef: (a: ElasticInputAPI) => { handle.api = a; },
    });
  }
  renderInto(React.createElement(Harness));
  return handle;
}

const ratingMax5 = (ctx: ValidateValueContext) =>
  ctx.fieldName === 'rating' && Number(ctx.value) > 5 ? 'Rating must be 1-5' : null;

describe('re-validation when a prop changes', () => {
  it('validateValue: errors appear and disappear without an edit; onChange does not fire', async () => {
    const h = setup({ defaultValue: 'rating:9' });
    await pause(100);
    expect(h.api!.getValidationErrors()).toEqual([]);
    h.changes.length = 0;
    h.validations.length = 0;

    h.update({ validateValue: ratingMax5 });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 1)).toBe(true);
    expect(h.api!.getValidationErrors()[0].message).toBe('Rating must be 1-5');
    expect(await waitFor(() => squiggles() === 1)).toBe(true);
    expect(h.validations).toHaveLength(1);
    expect(h.changes).toEqual([]);

    h.update({ validateValue: () => null });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 0)).toBe(true);
    expect(await waitFor(() => squiggles() === 0)).toBe(true);
    expect(h.validations).toHaveLength(2);
    expect(h.changes).toEqual([]);
  });

  it('an inline validateValue (new identity every render) does not loop or re-report', async () => {
    let renders = 0;
    let api: ElasticInputAPI | null = null;
    const validations: ValidationError[][] = [];
    function Parent() {
      const [, setErrors] = React.useState<ValidationError[]>([]);
      renders++;
      return React.createElement(ElasticInput, {
        fields: FIELDS,
        defaultValue: 'rating:9',
        validateValue: (ctx: ValidateValueContext) => ratingMax5(ctx), // fresh identity per render
        onValidationChange: (errors: ValidationError[]) => { validations.push(errors); setErrors(errors); },
        inputRef: (a: ElasticInputAPI) => { api = a; },
      });
    }
    renderInto(React.createElement(Parent));
    await pause(400);
    expect(api!.getValidationErrors()).toHaveLength(1);
    expect(renders).toBeLessThan(6);
    expect(validations.length).toBeLessThan(4);
  });

  it('parseDate: a custom parser accepts a value the built-in one rejects', async () => {
    const h = setup({ defaultValue: 'created:Q1' });
    await pause(100);
    expect(h.api!.getValidationErrors()).toHaveLength(1);

    h.update({ parseDate: (v: string) => (v === 'Q1' ? new Date(2026, 0, 1) : null) });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 0)).toBe(true);

    h.update({ parseDate: undefined });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 1)).toBe(true);
  });

  it('defaultField: bare terms are re-checked against the new default field', async () => {
    const h = setup({ defaultValue: 'abc' });
    await pause(100);
    expect(h.api!.getValidationErrors()).toEqual([]);

    h.update({ defaultField: 'rating' });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 1)).toBe(true);
    expect(h.api!.getValidationErrors()[0].type).toBe('INVALID_VALUE');

    h.update({ defaultField: undefined });
    expect(await waitFor(() => h.api!.getValidationErrors().length === 0)).toBe(true);
  });

  it('plainModeLength: the text moves in and out of plain mode', async () => {
    const text = 'status:active AND x';
    const h = setup({ defaultValue: text, plainModeLength: 10 });
    await pause(100);
    expect(h.api!.getAST()).toBeNull();
    expect(editorEl().querySelector('span')).toBeNull();

    h.update({ plainModeLength: 100 });
    expect(await waitFor(() => h.api!.getAST() !== null)).toBe(true);
    expect(editorEl().querySelector('span')).not.toBeNull();
    expect(editorEl().textContent).toBe(text);

    h.update({ plainModeLength: 10 });
    expect(await waitFor(() => h.api!.getAST() === null)).toBe(true);
    expect(editorEl().querySelector('span')).toBeNull();
    expect(editorEl().textContent).toBe(text);
    expect(h.api!.getValue()).toBe(text);
  });

  it('an unrelated re-render with the same props re-validates nothing', async () => {
    const h = setup({ defaultValue: 'rating:9', validateValue: ratingMax5 });
    await pause(100);
    h.validations.length = 0;
    h.changes.length = 0;

    h.update({ placeholder: 'changed' });
    await pause(200);
    expect(h.validations).toEqual([]);
    expect(h.changes).toEqual([]);
  });
});
