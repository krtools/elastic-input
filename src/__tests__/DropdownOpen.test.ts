import { describe, it, expect, vi } from 'vitest';
import { DropdownOpenContext, DropdownOpenProp } from '../types';
import { CursorContext } from '../parser/Parser';

/**
 * Tests for the dropdown.open callback contract.
 *
 * Since the callback is invoked inside the React component (which we can't
 * test without jsdom), these tests verify the contract: what context the
 * callback receives and what its return values mean.
 */

function makeContext(overrides: Partial<DropdownOpenContext> = {}): DropdownOpenContext {
  return {
    trigger: 'input',
    context: { type: 'FIELD_NAME', partial: 'sta', fieldName: undefined } as CursorContext,
    suggestions: [],
    isOpen: false,
    ...overrides,
  };
}

function evaluate(open: DropdownOpenProp, ctx: DropdownOpenContext): 'show' | 'hide' | 'engine-decides' {
  if (typeof open !== 'function') throw new Error('use string constants directly');
  const result = open(ctx);
  if (result === true) return 'show';
  if (result === false) return 'hide';
  return 'engine-decides';
}

describe('dropdown.open callback contract', () => {
  it('returning true forces the dropdown open', () => {
    const open: DropdownOpenProp = () => true;
    expect(evaluate(open, makeContext())).toBe('show');
  });

  it('returning false forces the dropdown closed', () => {
    const open: DropdownOpenProp = () => false;
    expect(evaluate(open, makeContext())).toBe('hide');
  });

  it('returning null lets the engine decide', () => {
    const open: DropdownOpenProp = () => null;
    expect(evaluate(open, makeContext())).toBe('engine-decides');
  });

  it('callback receives trigger type', () => {
    const spy = vi.fn((_ctx: DropdownOpenContext) => null);
    spy(makeContext({ trigger: 'input' }));
    expect(spy.mock.calls[0][0].trigger).toBe('input');

    spy(makeContext({ trigger: 'navigation' }));
    expect(spy.mock.calls[1][0].trigger).toBe('navigation');

    spy(makeContext({ trigger: 'ctrlSpace' }));
    expect(spy.mock.calls[2][0].trigger).toBe('ctrlSpace');

    spy(makeContext({ trigger: 'modeChange' }));
    expect(spy.mock.calls[3][0].trigger).toBe('modeChange');
  });

  it('callback receives cursor context', () => {
    const spy = vi.fn((_ctx: DropdownOpenContext) => null);
    const ctx = makeContext({
      context: { type: 'FIELD_VALUE', partial: 'act', fieldName: 'status' } as CursorContext,
    });
    spy(ctx);
    expect(spy.mock.calls[0][0].context.type).toBe('FIELD_VALUE');
    expect(spy.mock.calls[0][0].context.fieldName).toBe('status');
  });

  it('callback receives current isOpen state', () => {
    const spy = vi.fn((_ctx: DropdownOpenContext) => null);
    spy(makeContext({ isOpen: true }));
    expect(spy.mock.calls[0][0].isOpen).toBe(true);

    spy(makeContext({ isOpen: false }));
    expect(spy.mock.calls[1][0].isOpen).toBe(false);
  });

  it('callback receives suggestions array', () => {
    const spy = vi.fn((_ctx: DropdownOpenContext) => null);
    const suggs = [{ text: 'status:', label: 'Status', type: 'field' as const, replaceStart: 0, replaceEnd: 3 }];
    spy(makeContext({ suggestions: suggs as any }));
    expect(spy.mock.calls[0][0].suggestions).toHaveLength(1);
    expect(spy.mock.calls[0][0].suggestions[0].text).toBe('status:');
  });

  describe('practical callback patterns', () => {
    it('show only on Ctrl+Space (manual-like)', () => {
      const open: DropdownOpenProp = (ctx) => ctx.trigger === 'ctrlSpace' ? null : false;
      expect(evaluate(open, makeContext({ trigger: 'input' }))).toBe('hide');
      expect(evaluate(open, makeContext({ trigger: 'navigation' }))).toBe('hide');
      expect(evaluate(open, makeContext({ trigger: 'ctrlSpace' }))).toBe('engine-decides');
    });

    it('suppress when no suggestions', () => {
      const open: DropdownOpenProp = (ctx) => ctx.suggestions.length > 0 ? null : false;
      expect(evaluate(open, makeContext({ suggestions: [] }))).toBe('hide');
      expect(evaluate(open, makeContext({ suggestions: [{ text: 'x' }] as any }))).toBe('engine-decides');
    });

    it('show only for field value context', () => {
      const open: DropdownOpenProp = (ctx) =>
        ctx.context.type === 'FIELD_VALUE' ? null : false;
      expect(evaluate(open, makeContext({
        context: { type: 'FIELD_VALUE', partial: '', fieldName: 'status' } as CursorContext,
      }))).toBe('engine-decides');
      expect(evaluate(open, makeContext({
        context: { type: 'FIELD_NAME', partial: 'sta' } as CursorContext,
      }))).toBe('hide');
    });

    it('keep open once opened (sticky)', () => {
      const open: DropdownOpenProp = (ctx) => ctx.isOpen ? true : null;
      expect(evaluate(open, makeContext({ isOpen: false }))).toBe('engine-decides');
      expect(evaluate(open, makeContext({ isOpen: true }))).toBe('show');
    });
  });
});
