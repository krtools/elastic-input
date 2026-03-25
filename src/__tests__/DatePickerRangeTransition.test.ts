import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { AutocompleteEngine, AutocompleteResult } from '../autocomplete/AutocompleteEngine';
import { FieldConfig } from '../types';
import { computeDatePickerInit, shouldRemountDatePicker } from '../components/ElasticInput';
import { parseDate } from '../utils/dateUtils';

const FIELDS: FieldConfig[] = [
  { name: 'created', label: 'Created Date', type: 'date' },
  { name: 'status', label: 'Status', type: 'string' },
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

  describe('range view should navigate to end date month (bug #1)', () => {
    it('range init with distant start and recent end uses end date for view', () => {
      // [now-365d TO now] → start ≈ March 2025, end ≈ March 2026
      // The picker should navigate to the end date's month so the user sees "now"
      const result = getResult('created:[2025-03-15 TO 2026-03-15]', 15);
      const init = computeDatePickerInit(result.context);
      expect(init).not.toBeNull();
      expect(init!.mode).toBe('range');
      expect(init!.end).toBeInstanceOf(Date);
      expect(init!.end!.getFullYear()).toBe(2026);
      expect(init!.end!.getMonth()).toBe(2); // March
      // DateRangePicker uses initialEnd for view when in range mode
      // → viewYear=2026, viewMonth=2 (March) — user sees today's month
    });

    it('range init with close dates uses end date for view', () => {
      const result = getResult('created:[2026-03-01 TO 2026-03-15]', 15);
      const init = computeDatePickerInit(result.context);
      expect(init!.mode).toBe('range');
      expect(init!.start!.getMonth()).toBe(2);
      expect(init!.end!.getMonth()).toBe(2);
      // Both in same month — no issue either way
    });
  });

  describe('replacement range for date picker (bug #2)', () => {
    it('FIELD_VALUE with value token gives value token bounds', () => {
      const result = getResult('created:2024-01-15');
      expect(result.context.type).toBe('FIELD_VALUE');
      const token = result.context.token;
      expect(token).toBeDefined();
      // Token should be the VALUE, not the COLON
      expect(token!.type).toBe('VALUE');
      expect(token!.value).toBe('2024-01-15');
    });

    it('FIELD_VALUE with no value gives undefined token (insert at cursor)', () => {
      const result = getResult('created:');
      expect(result.context.type).toBe('FIELD_VALUE');
      // When cursor is right after the colon with no value, token is undefined.
      // handleDateSelect should insert at the cursor position (after the colon).
      expect(result.context.token).toBeUndefined();
    });

    it('cursor on colon with following value gives VALUE token, not COLON', () => {
      // Cursor at end of colon (offset 8), but value follows
      const result = getResult('created:2024-01-15', 8);
      expect(result.context.type).toBe('FIELD_VALUE');
      const token = result.context.token;
      expect(token).toBeDefined();
      expect(token!.type).toBe('VALUE');
      expect(token!.value).toBe('2024-01-15');
    });

    it('RANGE context gives RANGE token covering entire bracket expression', () => {
      const input = 'created:[2024-01-01 TO 2024-12-31]';
      const result = getResult(input, 15);
      expect(result.context.type).toBe('RANGE');
      const token = result.context.token;
      expect(token).toBeDefined();
      expect(token!.type).toBe('RANGE');
      expect(token!.start).toBe(8); // starts at '['
      expect(token!.end).toBe(input.length); // ends after ']'
    });
  });
});
