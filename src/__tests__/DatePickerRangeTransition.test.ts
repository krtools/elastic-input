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
      expect(init!.start!.getFullYear()).toBe(2024);
      expect(init!.start!.getMonth()).toBe(0);
      expect(init!.end!.getFullYear()).toBe(2024);
      expect(init!.end!.getMonth()).toBe(11);
    });

    it('returns single init with parsed date for FIELD_VALUE with date value', () => {
      const result = getResult('created:2024-01-15');
      const init = computeDatePickerInit(result.context);
      expect(init).not.toBeNull();
      expect(init!.mode).toBe('single');
      expect(init!.start).toBeInstanceOf(Date);
      expect(init!.end).toBeNull();
    });

    it('returns null for FIELD_VALUE after colon (no value yet)', () => {
      const result = getResult('created:');
      expect(computeDatePickerInit(result.context)).toBeNull();
    });

    it('returns null for FIELD_VALUE with non-date partial', () => {
      expect(computeDatePickerInit({ type: 'FIELD_VALUE', partial: 'abc' })).toBeNull();
    });

    it('returns null for RANGE context without TO keyword', () => {
      expect(computeDatePickerInit({ type: 'RANGE', token: { value: '[abc]' } })).toBeNull();
    });
  });

  describe('shouldRemountDatePicker', () => {
    it('returns true when transitioning from range to null (range → empty single)', () => {
      const prevInit = { mode: 'range' as const, start: new Date(), end: new Date() };
      expect(shouldRemountDatePicker(prevInit, null)).toBe(true);
    });

    it('returns true when transitioning from null to range (empty single → range)', () => {
      const newInit = { mode: 'range' as const, start: new Date(), end: new Date() };
      expect(shouldRemountDatePicker(null, newInit)).toBe(true);
    });

    it('returns true when transitioning from null to single with date', () => {
      const newInit = { mode: 'single' as const, start: new Date(2024, 0, 15), end: null };
      expect(shouldRemountDatePicker(null, newInit)).toBe(true);
    });

    it('returns true when single date changes', () => {
      const prevInit = { mode: 'single' as const, start: new Date(2024, 0, 1), end: null };
      const newInit = { mode: 'single' as const, start: new Date(2024, 5, 15), end: null };
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(true);
    });

    it('returns false when both are null (empty single → empty single)', () => {
      expect(shouldRemountDatePicker(null, null)).toBe(false);
    });

    it('returns false when single date is unchanged', () => {
      const date = new Date(2024, 0, 15);
      const prevInit = { mode: 'single' as const, start: date, end: null };
      const newInit = { mode: 'single' as const, start: new Date(date.getTime()), end: null };
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(false);
    });
  });

  describe('full paste-over-range scenario', () => {
    it('step 1: cursor inside range → RANGE context, range init', () => {
      const result = getResult('created:[2024-01-01 TO 2024-12-31]', 15);
      expect(result.context.type).toBe('RANGE');
      expect(result.showDatePicker).toBe(true);
      const init = computeDatePickerInit(result.context);
      expect(init?.mode).toBe('range');
    });

    it('step 2: after paste → FIELD_VALUE context, single init with date', () => {
      const result = getResult('created:2024-01-01');
      expect(result.context.type).toBe('FIELD_VALUE');
      expect(result.showDatePicker).toBe(true);
      const init = computeDatePickerInit(result.context);
      expect(init?.mode).toBe('single');
      expect(init?.start).toBeInstanceOf(Date);
    });

    it('step 1→2 transition requires picker remount', () => {
      const rangeResult = getResult('created:[2024-01-01 TO 2024-12-31]', 15);
      const singleResult = getResult('created:2024-01-01');

      const prevInit = computeDatePickerInit(rangeResult.context);
      const newInit = computeDatePickerInit(singleResult.context);

      expect(rangeResult.showDatePicker).toBe(true);
      expect(singleResult.showDatePicker).toBe(true);
      expect(shouldRemountDatePicker(prevInit, newInit)).toBe(true);
    });
  });

  describe('single date highlight on reopen', () => {
    it('clicking existing date value produces single init with that date', () => {
      const result = getResult('created:2024-06-15');
      const init = computeDatePickerInit(result.context);
      expect(init).not.toBeNull();
      expect(init!.mode).toBe('single');
      expect(init!.start).toBeInstanceOf(Date);
      // Picker will mount with initialStart set, so rangeStart useState
      // picks it up → isSelected is true for that day → daySelected style applies
    });

    it('opening picker after colon with no value gives null init (no highlight)', () => {
      const result = getResult('created:');
      const init = computeDatePickerInit(result.context);
      expect(init).toBeNull();
    });

    it('reopening picker on same date does not require remount', () => {
      const result = getResult('created:2024-06-15');
      const init = computeDatePickerInit(result.context);
      // Simulating: picker was already open with same date, user clicks again
      expect(shouldRemountDatePicker(init, init)).toBe(false);
    });
  });
});
