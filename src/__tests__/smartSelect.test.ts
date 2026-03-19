import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { getSmartSelectRange } from '../utils/smartSelect';

function smartSelect(input: string, selStart: number, selEnd?: number) {
  const tokens = new Lexer(input).tokenize();
  return getSmartSelectRange(tokens, selStart, selEnd ?? selStart);
}

describe('getSmartSelectRange', () => {
  describe('selects bare terms', () => {
    it('collapsed caret inside bare term selects the term', () => {
      const range = smartSelect('hello world', 2, 2);
      expect(range).toEqual({ start: 0, end: 5 });
    });

    it('collapsed caret at start of bare term selects it', () => {
      const range = smartSelect('hello world', 0, 0);
      expect(range).toEqual({ start: 0, end: 5 });
    });

    it('collapsed caret at end of bare term selects it', () => {
      const range = smartSelect('hello world', 5, 5);
      expect(range).toEqual({ start: 0, end: 5 });
    });

    it('selects second bare term when cursor is there', () => {
      const range = smartSelect('hello world', 8, 8);
      expect(range).toEqual({ start: 6, end: 11 });
    });
  });

  describe('selects field values', () => {
    it('collapsed caret inside field value selects the value', () => {
      const range = smartSelect('status:active', 9, 9);
      expect(range).toEqual({ start: 7, end: 13 });
    });

    it('collapsed caret at start of field value selects it', () => {
      const range = smartSelect('status:active', 7, 7);
      expect(range).toEqual({ start: 7, end: 13 });
    });

    it('works in compound queries', () => {
      // "john" is VALUE token at [23, 27)
      const range = smartSelect('status:active AND name:john', 24, 24);
      expect(range).toEqual({ start: 23, end: 27 });
    });
  });

  describe('selects quoted values', () => {
    it('collapsed caret inside quoted value selects the full quoted token', () => {
      const range = smartSelect('"hello world"', 5, 5);
      expect(range).toEqual({ start: 0, end: 13 });
    });

    it('selects quoted field value', () => {
      const range = smartSelect('name:"John Doe"', 10, 10);
      expect(range).toEqual({ start: 5, end: 15 });
    });
  });

  describe('selects wildcard values', () => {
    it('collapsed caret inside wildcard selects it', () => {
      const range = smartSelect('name:jo*', 6, 6);
      expect(range).toEqual({ start: 5, end: 8 });
    });
  });

  describe('falls through to select-all', () => {
    it('returns null when caret is in whitespace', () => {
      const range = smartSelect('hello world', 5, 5);
      // offset 5 is end of 'hello' which is a VALUE — but let's test actual whitespace
      const range2 = smartSelect('hello  world', 6, 6);
      expect(range2).toBeNull();
    });

    it('returns null when caret is on a field name', () => {
      const range = smartSelect('status:active', 3, 3);
      expect(range).toBeNull();
    });

    it('returns null when caret is on an operator', () => {
      const range = smartSelect('a AND b', 3, 3);
      expect(range).toBeNull();
    });

    it('returns null when caret is on a colon', () => {
      const range = smartSelect('status:active', 6, 6);
      // offset 6 is end of FIELD_NAME token — FIELD_NAME is not eligible
      expect(range).toBeNull();
    });

    it('returns null for empty input', () => {
      const range = smartSelect('', 0, 0);
      expect(range).toBeNull();
    });

    it('returns null when caret is in a range', () => {
      const range = smartSelect('price:[10 TO 100]', 12, 12);
      expect(range).toBeNull();
    });
  });

  describe('second press (selection matches token)', () => {
    it('returns null when selection already covers the bare term', () => {
      const range = smartSelect('hello world', 0, 5);
      expect(range).toBeNull();
    });

    it('returns null when selection already covers the field value', () => {
      const range = smartSelect('status:active', 7, 13);
      expect(range).toBeNull();
    });

    it('returns null when selection already covers quoted value', () => {
      const range = smartSelect('"hello world"', 0, 13);
      expect(range).toBeNull();
    });
  });

  describe('partial selection expands to full token', () => {
    it('partial selection within token expands to full token', () => {
      const range = smartSelect('status:active', 8, 11);
      expect(range).toEqual({ start: 7, end: 13 });
    });
  });
});
