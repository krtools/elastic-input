import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { TokenType } from '../lexer/tokens';

function lex(input: string) {
  return new Lexer(input).tokenize();
}

function lexTypes(input: string) {
  return lex(input)
    .filter(t => t.type !== TokenType.WHITESPACE)
    .map(t => t.type);
}

function lexValues(input: string) {
  return lex(input)
    .filter(t => t.type !== TokenType.WHITESPACE)
    .map(t => t.value);
}

describe('Lexer', () => {
  describe('basic tokens', () => {
    it('tokenizes a simple field:value pair', () => {
      const tokens = lex('status:active');
      expect(lexTypes('status:active')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('status:active')).toEqual(['status', ':', 'active']);
    });

    it('preserves character offsets', () => {
      const tokens = lex('status:active');
      const field = tokens.find(t => t.type === TokenType.FIELD_NAME)!;
      expect(field.start).toBe(0);
      expect(field.end).toBe(6);
      const colon = tokens.find(t => t.type === TokenType.COLON)!;
      expect(colon.start).toBe(6);
      expect(colon.end).toBe(7);
      const value = tokens.find(t => t.type === TokenType.VALUE)!;
      expect(value.start).toBe(7);
      expect(value.end).toBe(13);
    });

    it('tokenizes quoted values', () => {
      expect(lexTypes('name:"John Doe"')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.QUOTED_VALUE,
      ]);
      expect(lexValues('name:"John Doe"')).toEqual(['name', ':', '"John Doe"']);
    });

    it('handles single-quoted values', () => {
      expect(lexTypes("name:'Jane'")).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.QUOTED_VALUE,
      ]);
    });

    it('handles unclosed quotes gracefully', () => {
      const tokens = lex('name:"John');
      expect(lexTypes('name:"John')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.QUOTED_VALUE,
      ]);
      expect(lexValues('name:"John')).toEqual(['name', ':', '"John']);
    });

    it('handles escaped characters in quotes', () => {
      const tokens = lex('name:"John \\"Doe\\""');
      const quoted = tokens.find(t => t.type === TokenType.QUOTED_VALUE)!;
      expect(quoted.value).toBe('"John \\"Doe\\""');
    });
  });

  describe('boolean operators', () => {
    it('tokenizes AND operator', () => {
      expect(lexTypes('a AND b')).toEqual([
        TokenType.VALUE, TokenType.AND, TokenType.VALUE,
      ]);
    });

    it('tokenizes OR operator', () => {
      expect(lexTypes('a OR b')).toEqual([
        TokenType.VALUE, TokenType.OR, TokenType.VALUE,
      ]);
    });

    it('tokenizes NOT operator', () => {
      expect(lexTypes('NOT a')).toEqual([
        TokenType.NOT, TokenType.VALUE,
      ]);
    });

    it('is case-insensitive for boolean operators', () => {
      expect(lexTypes('a and b')).toEqual([TokenType.VALUE, TokenType.AND, TokenType.VALUE]);
      expect(lexTypes('a or b')).toEqual([TokenType.VALUE, TokenType.OR, TokenType.VALUE]);
      expect(lexTypes('not a')).toEqual([TokenType.NOT, TokenType.VALUE]);
    });
  });

  describe('comparison operators', () => {
    it('tokenizes > after colon', () => {
      expect(lexTypes('price:>100')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.COMPARISON_OP, TokenType.VALUE,
      ]);
    });

    it('tokenizes >= after colon', () => {
      expect(lexTypes('price:>=100')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.COMPARISON_OP, TokenType.VALUE,
      ]);
      expect(lexValues('price:>=100')).toEqual(['price', ':', '>=', '100']);
    });

    it('tokenizes < and <=', () => {
      expect(lexTypes('price:<50')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.COMPARISON_OP, TokenType.VALUE,
      ]);
      expect(lexTypes('price:<=50')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.COMPARISON_OP, TokenType.VALUE,
      ]);
    });
  });

  describe('parentheses', () => {
    it('tokenizes parentheses', () => {
      expect(lexTypes('(a OR b)')).toEqual([
        TokenType.LPAREN, TokenType.VALUE, TokenType.OR, TokenType.VALUE, TokenType.RPAREN,
      ]);
    });

    it('tokenizes nested parentheses', () => {
      expect(lexTypes('((a))')).toEqual([
        TokenType.LPAREN, TokenType.LPAREN, TokenType.VALUE, TokenType.RPAREN, TokenType.RPAREN,
      ]);
    });

    it('tokenizes field:value inside parens', () => {
      expect(lexTypes('(status:active)')).toEqual([
        TokenType.LPAREN, TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE, TokenType.RPAREN,
      ]);
    });

    it('tokenizes complex expression in parens', () => {
      expect(lexTypes('(status:active AND level:ERROR)')).toEqual([
        TokenType.LPAREN,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.AND,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.RPAREN,
      ]);
    });
  });

  describe('special tokens', () => {
    it('tokenizes saved search (#)', () => {
      expect(lexTypes('#mySearch')).toEqual([TokenType.SAVED_SEARCH]);
      expect(lexValues('#mySearch')).toEqual(['#mySearch']);
    });

    it('tokenizes bare # as saved search', () => {
      expect(lexTypes('#')).toEqual([TokenType.SAVED_SEARCH]);
      expect(lexValues('#')).toEqual(['#']);
    });

    it('tokenizes history ref (!)', () => {
      expect(lexTypes('!recent')).toEqual([TokenType.HISTORY_REF]);
      expect(lexValues('!recent')).toEqual(['!recent']);
    });

    it('tokenizes bare ! as history ref', () => {
      expect(lexTypes('!')).toEqual([TokenType.HISTORY_REF]);
    });

    it('tokenizes wildcards', () => {
      expect(lexTypes('name:John*')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.WILDCARD,
      ]);
    });

    it('tokenizes bare wildcard term', () => {
      expect(lexTypes('test*')).toEqual([TokenType.WILDCARD]);
    });
  });

  describe('prefix operators', () => {
    it('tokenizes - as prefix operator before a field', () => {
      expect(lexTypes('-status:active')).toEqual([
        TokenType.PREFIX_OP, TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('-status:active')).toEqual(['-', 'status', ':', 'active']);
    });

    it('tokenizes + as prefix operator before a field', () => {
      expect(lexTypes('+status:active')).toEqual([
        TokenType.PREFIX_OP, TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('+status:active')).toEqual(['+', 'status', ':', 'active']);
    });

    it('tokenizes - before a bare term', () => {
      expect(lexTypes('-error')).toEqual([TokenType.PREFIX_OP, TokenType.VALUE]);
    });

    it('tokenizes - before parenthesized group', () => {
      expect(lexTypes('-(a OR b)')).toEqual([
        TokenType.PREFIX_OP, TokenType.LPAREN, TokenType.VALUE, TokenType.OR, TokenType.VALUE, TokenType.RPAREN,
      ]);
    });

    it('tokenizes - before quoted string', () => {
      expect(lexTypes('-"test phrase"')).toEqual([
        TokenType.PREFIX_OP, TokenType.QUOTED_VALUE,
      ]);
    });

    it('tokenizes - before saved search', () => {
      expect(lexTypes('-#mySearch')).toEqual([
        TokenType.PREFIX_OP, TokenType.SAVED_SEARCH,
      ]);
    });

    it('preserves hyphen in mid-word field names', () => {
      expect(lexTypes('last-contact:2024')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('last-contact:2024')).toEqual(['last-contact', ':', '2024']);
    });

    it('does not treat standalone - as prefix op', () => {
      // - at end of input with nothing after it
      const tokens = lex('a -');
      const nonWs = tokens.filter(t => t.type !== TokenType.WHITESPACE);
      // The - at the end has nothing alphanumeric after it
      expect(nonWs[0].type).toBe(TokenType.VALUE);
    });
  });

  describe('whitespace handling', () => {
    it('preserves whitespace tokens', () => {
      const tokens = lex('a  b');
      expect(tokens.length).toBe(3);
      expect(tokens[1].type).toBe(TokenType.WHITESPACE);
      expect(tokens[1].value).toBe('  ');
    });

    it('handles leading whitespace', () => {
      const tokens = lex('  status:active');
      expect(tokens[0].type).toBe(TokenType.WHITESPACE);
    });

    it('handles trailing whitespace', () => {
      const tokens = lex('status:active  ');
      expect(tokens[tokens.length - 1].type).toBe(TokenType.WHITESPACE);
    });
  });

  describe('complex expressions', () => {
    it('tokenizes a complex query', () => {
      expect(lexTypes('status:active AND (level:ERROR OR level:WARN) NOT service:auth')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.AND,
        TokenType.LPAREN,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.OR,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.RPAREN,
        TokenType.NOT,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
    });

    it('handles empty input', () => {
      expect(lex('')).toEqual([]);
    });

    it('handles field with comparison and quoted value', () => {
      expect(lexTypes('name:>="A"')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.COMPARISON_OP, TokenType.QUOTED_VALUE,
      ]);
    });
  });
});
