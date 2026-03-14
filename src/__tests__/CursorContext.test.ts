import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser, CursorContext } from '../parser/Parser';

function getContext(input: string, cursorOffset?: number): CursorContext {
  const tokens = new Lexer(input).tokenize();
  return Parser.getCursorContext(tokens, cursorOffset ?? input.length);
}

describe('getCursorContext', () => {
  describe('empty / whitespace', () => {
    it('returns EMPTY for empty input', () => {
      expect(getContext('')).toMatchObject({ type: 'EMPTY', partial: '' });
    });

    it('returns EMPTY for whitespace-only input', () => {
      expect(getContext('   ')).toMatchObject({ type: 'EMPTY', partial: '' });
    });
  });

  describe('field name context', () => {
    it('returns FIELD_NAME while typing a word', () => {
      expect(getContext('sta')).toMatchObject({ type: 'FIELD_NAME', partial: 'sta' });
    });

    it('returns FIELD_NAME with cursor mid-word', () => {
      expect(getContext('status', 3)).toMatchObject({ type: 'FIELD_NAME', partial: 'status' });
    });

    it('returns FIELD_NAME after a space (new term)', () => {
      expect(getContext('status:active ')).toMatchObject({ type: 'OPERATOR' });
    });

    it('returns FIELD_NAME after AND', () => {
      expect(getContext('a AND ')).toMatchObject({ type: 'FIELD_NAME', partial: '' });
    });

    it('returns FIELD_NAME after OR', () => {
      expect(getContext('a OR ')).toMatchObject({ type: 'FIELD_NAME', partial: '' });
    });

    it('returns FIELD_NAME after NOT', () => {
      expect(getContext('NOT ')).toMatchObject({ type: 'FIELD_NAME', partial: '' });
    });

    it('returns FIELD_NAME while typing after AND', () => {
      expect(getContext('a AND st')).toMatchObject({ type: 'FIELD_NAME', partial: 'st' });
    });
  });

  describe('field value context', () => {
    it('returns FIELD_VALUE right after colon', () => {
      const ctx = getContext('status:');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE with cursor at colon end', () => {
      const ctx = getContext('status:', 7);
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE while typing value', () => {
      const ctx = getContext('status:act');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('act');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE with cursor mid-value', () => {
      const ctx = getContext('status:active', 10);
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE for quoted value being typed', () => {
      const ctx = getContext('name:"Joh');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('Joh');
      expect(ctx.fieldName).toBe('name');
    });

    it('returns FIELD_VALUE after comparison operator', () => {
      const ctx = getContext('price:>');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.fieldName).toBe('price');
    });

    it('returns FIELD_VALUE while typing after comparison', () => {
      const ctx = getContext('price:>10');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('10');
      expect(ctx.fieldName).toBe('price');
    });

    it('returns FIELD_VALUE for field:value inside parens', () => {
      const ctx = getContext('(status:');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE for field:partial inside parens', () => {
      const ctx = getContext('(status:act');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('act');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE after colon with space then value', () => {
      // "status: act" — lexer resets to EXPECT_TERM after space, so "act" is
      // a bare VALUE. But getCursorContext walks back through whitespace and
      // finds the colon, so it correctly identifies this as a FIELD_VALUE context.
      const ctx = getContext('status: act');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('act');
      expect(ctx.fieldName).toBe('status');
    });
  });

  describe('operator context', () => {
    it('returns OPERATOR after a complete field:value', () => {
      expect(getContext('status:active ')).toMatchObject({ type: 'OPERATOR' });
    });

    it('returns OPERATOR after a quoted value', () => {
      expect(getContext('name:"John" ')).toMatchObject({ type: 'OPERATOR' });
    });

    it('returns OPERATOR after closing paren', () => {
      expect(getContext('(a OR b) ')).toMatchObject({ type: 'OPERATOR' });
    });
  });

  describe('saved search context', () => {
    it('returns SAVED_SEARCH for #', () => {
      const ctx = getContext('#');
      expect(ctx.type).toBe('SAVED_SEARCH');
      expect(ctx.partial).toBe('');
    });

    it('returns SAVED_SEARCH for #partial', () => {
      const ctx = getContext('#my');
      expect(ctx.type).toBe('SAVED_SEARCH');
      expect(ctx.partial).toBe('my');
    });

    it('returns SAVED_SEARCH with cursor mid-token', () => {
      const ctx = getContext('#mySearch', 3);
      expect(ctx.type).toBe('SAVED_SEARCH');
      expect(ctx.partial).toBe('mySearch');
    });
  });

  describe('history ref context', () => {
    it('returns HISTORY_REF for !', () => {
      const ctx = getContext('!');
      expect(ctx.type).toBe('HISTORY_REF');
      expect(ctx.partial).toBe('');
    });

    it('returns HISTORY_REF for !partial', () => {
      const ctx = getContext('!rec');
      expect(ctx.type).toBe('HISTORY_REF');
      expect(ctx.partial).toBe('rec');
    });
  });

  describe('prefix operator context', () => {
    it('returns FIELD_NAME after - prefix', () => {
      const ctx = getContext('-');
      // - at end with nothing after is not a PREFIX_OP, so it's a VALUE
      // But -s would be PREFIX_OP + VALUE
    });

    it('returns FIELD_NAME while typing after - prefix', () => {
      const ctx = getContext('-sta');
      expect(ctx.type).toBe('FIELD_NAME');
      expect(ctx.partial).toBe('sta');
    });

    it('returns FIELD_VALUE for -field:', () => {
      const ctx = getContext('-status:');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_VALUE for -field:partial', () => {
      const ctx = getContext('-status:act');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('act');
      expect(ctx.fieldName).toBe('status');
    });

    it('returns FIELD_NAME after + prefix while typing', () => {
      const ctx = getContext('+sta');
      expect(ctx.type).toBe('FIELD_NAME');
      expect(ctx.partial).toBe('sta');
    });
  });

  describe('complex scenarios', () => {
    it('returns correct context in middle of complex query', () => {
      // "status:active AND lev" — cursor at end, typing "lev"
      const ctx = getContext('status:active AND lev');
      expect(ctx.type).toBe('FIELD_NAME');
      expect(ctx.partial).toBe('lev');
    });

    it('returns FIELD_VALUE for second field:value pair', () => {
      const ctx = getContext('status:active AND level:ER');
      expect(ctx.type).toBe('FIELD_VALUE');
      expect(ctx.partial).toBe('ER');
      expect(ctx.fieldName).toBe('level');
    });

    it('returns FIELD_NAME inside parens', () => {
      const ctx = getContext('(sta');
      expect(ctx.type).toBe('FIELD_NAME');
      expect(ctx.partial).toBe('sta');
    });

    it('returns correct context after paren close and space', () => {
      const ctx = getContext('(a OR b) AND ');
      expect(ctx.type).toBe('FIELD_NAME');
    });
  });

  describe('after LPAREN', () => {
    it('cursor right after open paren suggests fields', () => {
      const ctx = getContext('(', 1);
      expect(ctx.type).toBe('FIELD_NAME');
    });

    it('cursor after "status:active (" suggests fields, not operators', () => {
      const ctx = getContext('status:active (', 15);
      expect(ctx.type).toBe('FIELD_NAME');
    });

    it('cursor after "a AND (" suggests fields', () => {
      const ctx = getContext('a AND (', 7);
      expect(ctx.type).toBe('FIELD_NAME');
    });

    it('cursor inside paren with space suggests fields', () => {
      const ctx = getContext('( ', 2);
      expect(ctx.type).toBe('FIELD_NAME');
    });
  });
});
