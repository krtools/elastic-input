/**
 * A dropdown.open callback may return a preset name to hand that evaluation
 * to the built-in behavior, so it only handles its own cases and inherits
 * preset fixes. It also receives the query's tokens.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import * as React from 'react';
import { ElasticInput } from '../../components/ElasticInput';
import { DropdownOpenContext, DropdownOpenProp, FieldConfig } from '../../types';
import { renderInto, cleanup } from './renderHelper';
import { waitFor, pause } from './helpers';

afterEach(cleanup);

const FIELDS: FieldConfig[] = [
  { name: 'status', type: 'string' },
  { name: 'brand', type: 'string' },
];

const isOpen = () => document.querySelectorAll('.ei-dropdown-item').length > 0;

async function setup(open: DropdownOpenProp) {
  renderInto(React.createElement(ElasticInput, { fields: FIELDS, dropdown: { open } }));
  const editor = page.elementLocator(document.querySelector('.ei-editor') as HTMLElement);
  await editor.click();
  return editor;
}

describe('dropdown.open callback returning a preset', () => {
  it("'input': opens while typing a word, closes at a boundary and on caret movement", async () => {
    const editor = await setup(() => 'input');
    await userEvent.type(editor, 'sta');
    expect(await waitFor(isOpen)).toBe(true);

    await userEvent.type(editor, ' ');
    expect(await waitFor(() => !isOpen())).toBe(true);

    await userEvent.type(editor, '(a)');
    await pause(300);
    expect(isOpen()).toBe(false);

    await userEvent.type(editor, ' br');
    expect(await waitFor(isOpen)).toBe(true);
    await userEvent.keyboard('{ArrowLeft}');
    expect(await waitFor(() => !isOpen())).toBe(true);
  });

  it("'always': open after a term, closed on an operator; the callback's own rule still applies", async () => {
    // Own rule: never for field values; everything else as 'always'
    const editor = await setup(ctx => (ctx.context.type === 'FIELD_VALUE' ? false : 'always'));
    await userEvent.type(editor, 'a ');
    expect(await waitFor(isOpen)).toBe(true);

    await userEvent.type(editor, 'AND'); // caret touches the operator
    expect(await waitFor(() => !isOpen())).toBe(true);

    await userEvent.type(editor, ' ');
    expect(await waitFor(isOpen)).toBe(true);

    await userEvent.type(editor, 'status:');
    expect(await waitFor(() => !isOpen())).toBe(true); // the callback's own false
  });

  it("'never' closes; 'manual' opens only on Ctrl+Space and closes when the context changes", async () => {
    let editor = await setup(() => 'never');
    await userEvent.type(editor, 'sta');
    await pause(300);
    expect(isOpen()).toBe(false);
    cleanup();

    editor = await setup(() => 'manual');
    await userEvent.type(editor, 'sta');
    await pause(300);
    expect(isOpen()).toBe(false);

    await userEvent.keyboard('{Control>} {/Control}');
    expect(await waitFor(isOpen)).toBe(true);

    await userEvent.type(editor, 't');
    await pause(200);
    expect(isOpen()).toBe(true); // same context type

    await userEvent.keyboard('{Tab}'); // accept → value context
    expect(await waitFor(() => !isOpen())).toBe(true);
  });

  it('receives the tokens the engine saw', async () => {
    const seen: string[][] = [];
    const editor = await setup((ctx: DropdownOpenContext) => { seen.push(ctx.tokens.map(t => t.value)); return null; });
    await userEvent.type(editor, 'a AND');
    await pause(300);
    expect(seen[seen.length - 1]).toEqual(['a', ' ', 'AND']);
  });
});

describe("preset 'input' (unchanged after moving the rule)", () => {
  it('closes at a closing paren and after a space, opens on the next word', async () => {
    const editor = await setup('input');
    await userEvent.type(editor, '(a)');
    await pause(300);
    expect(isOpen()).toBe(false);
    await userEvent.type(editor, ' br');
    expect(await waitFor(isOpen)).toBe(true);
  });
});
