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

    it('treats single quotes as regular characters (not quote delimiters)', () => {
      expect(lexTypes("name:'Jane'")).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues("name:'Jane'")).toEqual(['name', ':', "'Jane'"]);
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

  describe('single-char wildcard (?)', () => {
    it('tokenizes qu?ck as WILDCARD', () => {
      expect(lexTypes('qu?ck')).toEqual([TokenType.WILDCARD]);
      expect(lexValues('qu?ck')).toEqual(['qu?ck']);
    });

    it('tokenizes field:qu?ck as FIELD_NAME + COLON + WILDCARD', () => {
      expect(lexTypes('field:qu?ck')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.WILDCARD,
      ]);
    });

    it('tokenizes ?ello as WILDCARD', () => {
      expect(lexTypes('?ello')).toEqual([TokenType.WILDCARD]);
    });

    it('tokenizes combined * and ? as WILDCARD', () => {
      expect(lexTypes('te?t*')).toEqual([TokenType.WILDCARD]);
    });
  });

  describe('regex literals (/pattern/)', () => {
    it('tokenizes /pattern/ as REGEX', () => {
      expect(lexTypes('/pattern/')).toEqual([TokenType.REGEX]);
      expect(lexValues('/pattern/')).toEqual(['/pattern/']);
    });

    it('tokenizes field:/joh?n/ as FIELD_NAME + COLON + REGEX', () => {
      expect(lexTypes('field:/joh?n/')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.REGEX,
      ]);
      expect(lexValues('field:/joh?n/')).toEqual(['field', ':', '/joh?n/']);
    });

    it('tokenizes unclosed /pattern as VALUE fallback', () => {
      expect(lexTypes('/pattern')).toEqual([TokenType.VALUE]);
      expect(lexValues('/pattern')).toEqual(['/pattern']);
    });

    it('handles escaped slash inside regex', () => {
      expect(lexTypes('/foo\\/bar/')).toEqual([TokenType.REGEX]);
      expect(lexValues('/foo\\/bar/')).toEqual(['/foo\\/bar/']);
    });

    it('preserves offsets for regex', () => {
      const tokens = lex('/abc/');
      const regex = tokens.find(t => t.type === TokenType.REGEX)!;
      expect(regex.start).toBe(0);
      expect(regex.end).toBe(5);
    });
  });

  describe('backslash escaping', () => {
    it('tokenizes hello\\!world as single VALUE', () => {
      expect(lexTypes('hello\\!world')).toEqual([TokenType.VALUE]);
      expect(lexValues('hello\\!world')).toEqual(['hello\\!world']);
    });

    it('tokenizes first\\ name:value as FIELD_NAME + COLON + VALUE', () => {
      expect(lexTypes('first\\ name:value')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('first\\ name:value')).toEqual(['first\\ name', ':', 'value']);
    });

    it('tokenizes a\\(b as single VALUE', () => {
      expect(lexTypes('a\\(b')).toEqual([TokenType.VALUE]);
      expect(lexValues('a\\(b')).toEqual(['a\\(b']);
    });

    it('tokenizes escaped colon as part of value', () => {
      expect(lexTypes('not\\:afield')).toEqual([TokenType.VALUE]);
      expect(lexValues('not\\:afield')).toEqual(['not\\:afield']);
    });

    it('handles backslash escape in field value position', () => {
      expect(lexTypes('field:hello\\!world')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
      expect(lexValues('field:hello\\!world')).toEqual(['field', ':', 'hello\\!world']);
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

  describe('&& and || operators', () => {
    it('tokenizes && as AND', () => {
      expect(lexTypes('a && b')).toEqual([TokenType.VALUE, TokenType.AND, TokenType.VALUE]);
      expect(lexValues('a && b')).toEqual(['a', '&&', 'b']);
    });

    it('tokenizes || as OR', () => {
      expect(lexTypes('a || b')).toEqual([TokenType.VALUE, TokenType.OR, TokenType.VALUE]);
      expect(lexValues('a || b')).toEqual(['a', '||', 'b']);
    });

    it('tokenizes && without spaces', () => {
      expect(lexTypes('a&&b')).toEqual([TokenType.VALUE, TokenType.AND, TokenType.VALUE]);
    });

    it('tokenizes || without spaces', () => {
      expect(lexTypes('a||b')).toEqual([TokenType.VALUE, TokenType.OR, TokenType.VALUE]);
    });

    it('mixes && and || in same query', () => {
      expect(lexTypes('a && b || c')).toEqual([
        TokenType.VALUE, TokenType.AND, TokenType.VALUE, TokenType.OR, TokenType.VALUE,
      ]);
    });

    it('single & is not treated as operator', () => {
      // Single & is consumed as part of a word
      const tokens = lex('a&b');
      const nonWs = tokens.filter(t => t.type !== TokenType.WHITESPACE);
      expect(nonWs).toHaveLength(1);
      expect(nonWs[0].value).toBe('a&b');
    });
  });

  describe('tilde (fuzzy/proximity)', () => {
    it('tokenizes term~N as VALUE + TILDE', () => {
      expect(lexTypes('abc~1')).toEqual([TokenType.VALUE, TokenType.TILDE]);
      expect(lexValues('abc~1')).toEqual(['abc', '~1']);
    });

    it('tokenizes quoted phrase~N as QUOTED_VALUE + TILDE', () => {
      expect(lexTypes('"hello world"~5')).toEqual([TokenType.QUOTED_VALUE, TokenType.TILDE]);
      expect(lexValues('"hello world"~5')).toEqual(['"hello world"', '~5']);
    });

    it('tokenizes ~ without number', () => {
      expect(lexTypes('abc~')).toEqual([TokenType.VALUE, TokenType.TILDE]);
      expect(lexValues('abc~')).toEqual(['abc', '~']);
    });

    it('tokenizes field:value~N', () => {
      expect(lexTypes('name:john~1')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE, TokenType.TILDE,
      ]);
      expect(lexValues('name:john~1')).toEqual(['name', ':', 'john', '~1']);
    });

    it('preserves offsets for tilde', () => {
      const tokens = lex('abc~2');
      const tilde = tokens.find(t => t.type === TokenType.TILDE)!;
      expect(tilde.start).toBe(3);
      expect(tilde.end).toBe(5);
    });
  });

  describe('boost (caret)', () => {
    it('tokenizes term^N as VALUE + BOOST', () => {
      expect(lexTypes('abc^2')).toEqual([TokenType.VALUE, TokenType.BOOST]);
      expect(lexValues('abc^2')).toEqual(['abc', '^2']);
    });

    it('tokenizes field:value^N', () => {
      expect(lexTypes('name:john^3')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE, TokenType.BOOST,
      ]);
    });

    it('tokenizes ^ with decimal', () => {
      expect(lexValues('abc^1.5')).toEqual(['abc', '^1.5']);
    });

    it('tokenizes ^ without number', () => {
      expect(lexTypes('abc^')).toEqual([TokenType.VALUE, TokenType.BOOST]);
      expect(lexValues('abc^')).toEqual(['abc', '^']);
    });

    it('combined ~N^N produces VALUE + TILDE + BOOST', () => {
      expect(lexTypes('abc~1^2')).toEqual([TokenType.VALUE, TokenType.TILDE, TokenType.BOOST]);
      expect(lexValues('abc~1^2')).toEqual(['abc', '~1', '^2']);
    });
  });

  describe('range values', () => {
    it('tokenizes [value TO value] as RANGE token', () => {
      const types = lexTypes('created:[now-7d TO now]');
      expect(types).toEqual([TokenType.FIELD_NAME, TokenType.COLON, TokenType.RANGE]);
      const values = lexValues('created:[now-7d TO now]');
      expect(values).toEqual(['created', ':', '[now-7d TO now]']);
    });

    it('tokenizes {value TO value} as RANGE token', () => {
      const types = lexTypes('created:{now-30d TO now}');
      expect(types).toEqual([TokenType.FIELD_NAME, TokenType.COLON, TokenType.RANGE]);
      const values = lexValues('created:{now-30d TO now}');
      expect(values).toEqual(['created', ':', '{now-30d TO now}']);
    });

    it('tokenizes mixed brackets [value TO value}', () => {
      const tokens = lex('created:[now-7d TO now}');
      const rangeToken = tokens.find(t => t.type === TokenType.RANGE);
      expect(rangeToken).toBeDefined();
      expect(rangeToken!.value).toBe('[now-7d TO now}');
    });

    it('tokenizes range with absolute dates', () => {
      const values = lexValues('created:[2024-01-01 TO 2024-12-31]');
      expect(values).toEqual(['created', ':', '[2024-01-01 TO 2024-12-31]']);
    });

    it('preserves offsets for range value', () => {
      const tokens = lex('created:[now-7d TO now]');
      const rangeToken = tokens.find(t => t.type === TokenType.RANGE)!;
      expect(rangeToken.start).toBe(8);
      expect(rangeToken.end).toBe(23);
    });

    it('range in compound query', () => {
      const types = lexTypes('status:active AND created:[now-7d TO now]');
      expect(types).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.AND,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.RANGE,
      ]);
    });

    it('handles unclosed range bracket', () => {
      const values = lexValues('created:[now-7d TO now');
      expect(values).toEqual(['created', ':', '[now-7d TO now']);
    });

    it('tokenizes range inside field group', () => {
      const types = lexTypes('created:([now-1d TO now])');
      expect(types).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON,
        TokenType.LPAREN, TokenType.RANGE, TokenType.RPAREN,
      ]);
      const values = lexValues('created:([now-1d TO now])');
      expect(values).toEqual(['created', ':', '(', '[now-1d TO now]', ')']);
    });

    it('tokenizes {range} inside field group', () => {
      const types = lexTypes('price:({10 TO 100})');
      expect(types).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON,
        TokenType.LPAREN, TokenType.RANGE, TokenType.RPAREN,
      ]);
      const values = lexValues('price:({10 TO 100})');
      expect(values).toEqual(['price', ':', '(', '{10 TO 100}', ')']);
    });

    it('tokenizes standalone range in EXPECT_TERM', () => {
      const types = lexTypes('[now-7d TO now]');
      expect(types).toEqual([TokenType.RANGE]);
      const values = lexValues('[now-7d TO now]');
      expect(values).toEqual(['[now-7d TO now]']);
    });

    it('tokenizes -[range] as PREFIX_OP + RANGE', () => {
      expect(lexTypes('-[abc TO def]')).toEqual([TokenType.PREFIX_OP, TokenType.RANGE]);
    });

    it('tokenizes name:(-[abc TO "abd"]) correctly', () => {
      expect(lexTypes('name:(-[abc TO "abd"])')).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON,
        TokenType.LPAREN, TokenType.PREFIX_OP, TokenType.RANGE, TokenType.RPAREN,
      ]);
    });

    it('tokenizes [* TO 100] as RANGE', () => {
      expect(lexTypes('[* TO 100]')).toEqual([TokenType.RANGE]);
      expect(lexValues('[* TO 100]')).toEqual(['[* TO 100]']);
    });

    it('tokenizes +[range] as PREFIX_OP + RANGE', () => {
      expect(lexTypes('+[abc TO def]')).toEqual([TokenType.PREFIX_OP, TokenType.RANGE]);
    });

    it('tokenizes +{range} as PREFIX_OP + RANGE', () => {
      expect(lexTypes('+{abc TO def}')).toEqual([TokenType.PREFIX_OP, TokenType.RANGE]);
    });

    it('tokenizes -{range} as PREFIX_OP + RANGE', () => {
      expect(lexTypes('-{abc TO def}')).toEqual([TokenType.PREFIX_OP, TokenType.RANGE]);
    });

    it('range followed by boost is RANGE + BOOST', () => {
      expect(lexTypes('[abc TO def]^2')).toEqual([TokenType.RANGE, TokenType.BOOST]);
    });

    it('range followed by tilde is RANGE + TILDE', () => {
      expect(lexTypes('[abc TO def]~')).toEqual([TokenType.RANGE, TokenType.TILDE]);
    });

    it('range containing quoted value with spaces', () => {
      const values = lexValues('name:["abc def" TO "xyz"]');
      expect(values).toEqual(['name', ':', '["abc def" TO "xyz"]']);
    });
  });

  describe('multiline / newlines', () => {
    it('treats newlines as whitespace between terms', () => {
      const tokens = lex('status:active\nAND name:John');
      const types = tokens.filter(t => t.type !== TokenType.WHITESPACE).map(t => t.type);
      expect(types).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.AND,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
    });

    it('handles multiple consecutive newlines', () => {
      const tokens = lex('foo\n\nbar');
      const nonWs = tokens.filter(t => t.type !== TokenType.WHITESPACE);
      expect(nonWs.map(t => t.value)).toEqual(['foo', 'bar']);
    });

    it('handles \\r\\n (Windows line endings)', () => {
      const tokens = lex('a:1\r\nb:2');
      const nonWs = tokens.filter(t => t.type !== TokenType.WHITESPACE);
      expect(nonWs.map(t => t.type)).toEqual([
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
        TokenType.FIELD_NAME, TokenType.COLON, TokenType.VALUE,
      ]);
    });

    it('preserves newlines in whitespace token values', () => {
      const tokens = lex('a\nb');
      const ws = tokens.filter(t => t.type === TokenType.WHITESPACE);
      expect(ws.length).toBe(1);
      expect(ws[0].value).toBe('\n');
    });
  });
});
