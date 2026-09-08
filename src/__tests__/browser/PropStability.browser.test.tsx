/**
 * Regression tests for prop identity resilience (BEHAVIORS.md §10.1).
 *
 * The library hardens itself against unstable `fields` identities: the resolve
 * effect shallow-compares the incoming array against the current resolved
 * fields (same length, same elements by reference) and keeps the previous
 * state when equal, so a `fields={[...FIELDS]}` array re-created every render
 * no longer fires the engine/validator rebuild effect — which runs a full
 * processInput (re-lex, re-parse, re-validate, editor innerHTML rewrite).
 *
 * Reprocessing is observed through two proxies:
 *  - `validateValue` call count (validation runs once per processInput)
 *  - editor child node identity (an innerHTML rewrite replaces the nodes)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput, useLazyRef } from '../../components/ElasticInput';
import { FieldConfig, ValidationError } from '../../types';
import { renderInto, cleanup } from './renderHelper';

afterEach(cleanup);

const STATUS_FIELD: FieldConfig = { name: 'status', label: 'Status', type: 'string' };
const SOURCE_FIELD: FieldConfig = { name: 'source', label: 'Source', type: 'string' };

const EDITOR = '.ei-editor';

async function settle(ms = 60) {
  await new Promise(r => setTimeout(r, ms));
}

let forceRender: () => void = () => {};
let setHarnessFields: (fields: FieldConfig[]) => void = () => {};
let validateCalls = 0;
let lastErrors: ValidationError[] = [];

/**
 * Deliberately unstable `fields` identity: a fresh array on every render,
 * built from the same element references (the hardened case).
 */
function ChurningFieldsHarness({ initialFields }: { initialFields: FieldConfig[] }) {
  const [fieldElements, setFieldElements] = React.useState(initialFields);
  const [, setTick] = React.useState(0);
  forceRender = () => setTick(t => t + 1);
  setHarnessFields = setFieldElements;
  return React.createElement(ElasticInput, {
    fields: [...fieldElements],
    validateValue: () => { validateCalls++; return null; },
    onValidationChange: (errs: ValidationError[]) => { lastErrors = errs; },
  });
}

/**
 * Unstable async loader identity (fresh function every render) resolving to a
 * fresh array of the same element references — e.g. a loader over a
 * module-level cache. Pre-hardening, every resolution triggered a rebuild.
 */
function ChurningLoaderHarness() {
  const [, setTick] = React.useState(0);
  forceRender = () => setTick(t => t + 1);
  return React.createElement(ElasticInput, {
    fields: () => Promise.resolve([...[STATUS_FIELD, SOURCE_FIELD]]),
    validateValue: () => { validateCalls++; return null; },
  });
}

describe('fields prop identity resilience', () => {
  it('an identity-changed but content-equal fields array does not rebuild or reprocess', async () => {
    validateCalls = 0;
    renderInto(React.createElement(ChurningFieldsHarness, { initialFields: [STATUS_FIELD, SOURCE_FIELD] }));
    const editorEl = document.querySelector(EDITOR) as HTMLElement;
    const editor = page.elementLocator(editorEl);

    await editor.click();
    await userEvent.type(editor, 'status:x');
    await settle();

    const baseline = validateCalls;
    expect(baseline).toBeGreaterThan(0); // sanity: typing did validate
    const firstNode = editorEl.firstChild;
    expect(firstNode).not.toBeNull();

    // Each forced parent render passes a NEW array identity with the same
    // element references. Pre-hardening: resolve effect → rebuild effect →
    // full processInput per render.
    forceRender();
    await settle();
    forceRender();
    await settle();
    forceRender();
    await settle();

    // No re-validation ran…
    expect(validateCalls).toBe(baseline);
    // …and the highlighted DOM was not rewritten (same node objects).
    expect(editorEl.firstChild).toBe(firstNode);
    expect(editorEl.textContent).toBe('status:x');
  });

  it('a content-changed fields array still rebuilds and re-validates', async () => {
    validateCalls = 0;
    lastErrors = [];
    renderInto(React.createElement(ChurningFieldsHarness, { initialFields: [STATUS_FIELD] }));
    const editorEl = document.querySelector(EDITOR) as HTMLElement;
    const editor = page.elementLocator(editorEl);

    await editor.click();
    await userEvent.type(editor, 'source:x');
    await settle();

    // `source` is unknown with only the status field configured.
    expect(lastErrors.length).toBeGreaterThan(0);

    // Real content change: a second field element appears.
    setHarnessFields([STATUS_FIELD, SOURCE_FIELD]);
    await settle();

    // The rebuild effect re-validated the current input with the new fields.
    expect(lastErrors.length).toBe(0);
    expect(editorEl.textContent).toBe('source:x');
  });

  it('an unstable async loader resolving to content-equal fields does not reprocess', async () => {
    validateCalls = 0;
    renderInto(React.createElement(ChurningLoaderHarness));
    const editorEl = document.querySelector(EDITOR) as HTMLElement;
    const editor = page.elementLocator(editorEl);

    // Let the initial load resolve, then type.
    await settle();
    await editor.click();
    await userEvent.type(editor, 'status:x');
    await settle();

    const baseline = validateCalls;
    expect(baseline).toBeGreaterThan(0);
    const firstNode = editorEl.firstChild;

    // Each forced render re-creates the loader (unstable identity), which
    // re-runs the resolve effect and re-invokes the loader. Its result is a
    // fresh array of the same elements — absorbed by the shallow compare, so
    // no rebuild/reprocess follows the resolution.
    forceRender();
    await settle();
    forceRender();
    await settle();

    expect(validateCalls).toBe(baseline);
    expect(editorEl.firstChild).toBe(firstNode);
    expect(editorEl.textContent).toBe('status:x');
  });
});

describe('useLazyRef', () => {
  it('runs the initializer exactly once across re-renders', async () => {
    let inits = 0;
    let seenValues: object[] = [];
    function Probe() {
      const [, setTick] = React.useState(0);
      forceRender = () => setTick(t => t + 1);
      const ref = useLazyRef(() => { inits++; return { tag: 'probe' }; });
      seenValues.push(ref.current);
      return null;
    }
    renderInto(React.createElement(Probe));
    forceRender();
    forceRender();
    await settle(20);

    expect(inits).toBe(1);
    // Every render saw the same retained instance.
    expect(new Set(seenValues).size).toBe(1);
    expect(seenValues.length).toBeGreaterThanOrEqual(3);
  });
});
