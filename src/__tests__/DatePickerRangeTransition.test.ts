import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { AutocompleteEngine, AutocompleteResult } from '../autocomplete/AutocompleteEngine';
import { FieldConfig } from '../types';
import { computeDatePickerInit, shouldRemountDatePicker } from '../components/ElasticInput';

const FIELDS: FieldConfig[] = [
  { name: 'created', label: 'Created Date', type: 'date' },
  { name: 'status', label: 'Status', type: 'enum', suggestions: ['active'] },
  { name: 'price', label: 'Price', type: 'number' },
];

function getResult(input: string, cursorOffset?: number): AutocompleteResult {
  const engine = new AutocompleteEngine(FIELDS, [], [], 10);
  const tokens = new Lexer(input).tokenize();
  return engine.getSuggestions(tokens, cursorOffset ?? input.length);
}

describe('Date picker range → single transition', () => {
  describe('computeDatePickerInit', () => {
    it('returns range init for RANGE context with date bounds', () => {
      const result = getResult('created:[2024-01-01 TO 2024-12-31]', 15);
      const init = computeDatePickerInit(result.context);
      expect(init).not.toBeNull();
      expect(init!.mode).toBe('range');
      expect(init!.start).toBeInstanceOf(Date);
      expect(init!.end).toBeInstanceOf(Date);
      expect(init!.start!.getUTCFullYear()).toBe(2024);
      expect(init!.start!.getUTCMonth()).toBe(0);
      expect(init!.end!.getUTCFullYear()).toBe(2024);
      expect(init!.end!.getUTCMonth()).toBe(11);
    });

    it('returns null for FIELD_VALUE context (single date mode)', () => {
      const result = getResult('created:2024-01-01');
      expect(computeDatePickerInit(result.context)).toBeNull();
    });

    it('returns null for FIELD_VALUE context after colon (no value yet)', () => {
      const result = getResult('created:');
      expect(computeDatePickerInit(result.context)).toBeNull();
    });

    it('returns null for RANGE context without TO keyword', () => {
      expect(computeDatePickerInit({ type: 'RANGE', token: { value: '[abc]' } })).toBeNull();
    });
  });

  describe('shouldRemountDatePicker', () => {
    // When the picker is already showing and a new date-picker result arrives,
    // the picker must remount (unmount + mount) if the init changes, so that
    // DateRangePicker picks up fresh initialMode/initialStart/initialEnd via
    // useState. Without remounting, useState ignores changed initial values.

    it('returns true when transitioning from range init to null (range → single)', () => {
      const prevInit = { mode: 'range' as const, start: new Date(), end: new Date() };
      const newInit = null;
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(true);
    });

    it('returns true when transitioning from null to range init (single → range)', () => {
      const prevInit = null;
      const newInit = { mode: 'range' as const, start: new Date(), end: new Date() };
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(true);
    });

    it('returns false when both are null (single → single)', () => {
      expect(shouldRemountDatePicker(null, null)).toBe(false);
    });

    it('returns false when both are range with same mode (range → range)', () => {
      const prevInit = { mode: 'range' as const, start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) };
      const newInit = { mode: 'range' as const, start: new Date(2024, 0, 1), end: new Date(2024, 5, 15) };
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(false);
    });
  });

  describe('full paste-over-range scenario', () => {
    // Simulates: cursor inside created:[2024-01-01 TO 2024-12-31]
    //          → user pastes single date → created:2024-01-01
    // The picker must transition from range mode to single mode.

    it('step 1: cursor inside range → RANGE context, range init', () => {
      const result = getResult('created:[2024-01-01 TO 2024-12-31]', 15);
      expect(result.context.type).toBe('RANGE');
      expect(result.showDatePicker).toBe(true);
      const init = computeDatePickerInit(result.context);
      expect(init?.mode).toBe('range');
    });

    it('step 2: after paste → FIELD_VALUE context, null init', () => {
      const result = getResult('created:2024-01-01');
      expect(result.context.type).toBe('FIELD_VALUE');
      expect(result.showDatePicker).toBe(true);
      const init = computeDatePickerInit(result.context);
      expect(init).toBeNull();
    });

    it('step 1→2 transition requires picker remount', () => {
      const rangeResult = getResult('created:[2024-01-01 TO 2024-12-31]', 15);
      const singleResult = getResult('created:2024-01-01');

      const prevInit = computeDatePickerInit(rangeResult.context);
      const newInit = computeDatePickerInit(singleResult.context);

      // Both trigger the date picker...
      expect(rangeResult.showDatePicker).toBe(true);
      expect(singleResult.showDatePicker).toBe(true);

      // ...but the transition requires remount so useState picks up new init
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(true);
    });
  });
});
