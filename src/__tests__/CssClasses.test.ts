import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { TokenType } from '../lexer/tokens';
import { buildHighlightedHTML } from '../components/HighlightedContent';
import { FieldType } from '../types';

describe('CSS classes on highlighted tokens', () => {
  it('adds ei-token and type class to each token span', () => {
    const tokens = new Lexer('status:active').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('class="ei-token ei-token--field-name"');
    expect(html).toContain('class="ei-token ei-token--colon"');
    expect(html).toContain('class="ei-token ei-token--value"');
  });

  it('adds boolean operator classes', () => {
    const tokens = new Lexer('a AND b OR NOT c').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('ei-token--and');
    expect(html).toContain('ei-token--or');
    expect(html).toContain('ei-token--not');
  });

  it('adds paren classes', () => {
    const tokens = new Lexer('(a)').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('ei-token--lparen');
    expect(html).toContain('ei-token--rparen');
  });

  it('adds quoted-value class', () => {
    const tokens = new Lexer('"hello world"').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('ei-token--quoted-value');
  });

  it('appends custom tokenClassName', () => {
    const tokens = new Lexer('status:active').tokenize();
    const html = buildHighlightedHTML(tokens, undefined, { tokenClassName: 'my-token' });

    expect(html).toContain('class="ei-token ei-token--field-name my-token"');
    expect(html).toContain('class="ei-token ei-token--value my-token"');
  });

  it('omits tokenClassName when not provided', () => {
    const tokens = new Lexer('status').tokenize();
    const html = buildHighlightedHTML(tokens);

    // Should end with the type class, no trailing space
    expect(html).toContain('class="ei-token ei-token--value"');
    expect(html).not.toContain('class="ei-token ei-token--value "');
  });

  it('adds regex token and part classes', () => {
    const tokens = new Lexer('/abc[0-9]+/').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('class="ei-token ei-token--regex"');
    expect(html).toContain('ei-regex-part ei-regex-part--delimiter');
    expect(html).toContain('ei-regex-part ei-regex-part--text');
    expect(html).toContain('ei-regex-part ei-regex-part--charClass');
    expect(html).toContain('ei-regex-part ei-regex-part--quantifier');
  });

  it('adds range token and part classes', () => {
    const tokens = new Lexer('price:[10 TO 20]').tokenize();
    const html = buildHighlightedHTML(tokens);

    expect(html).toContain('class="ei-token ei-token--range"');
    expect(html).toContain('ei-range-part ei-range-part--bracket');
    expect(html).toContain('ei-range-part ei-range-part--bareValue');
    expect(html).toContain('ei-range-part ei-range-part--toKeyword');
  });

  it('passes tokenClassName through to regex spans', () => {
    const tokens = new Lexer('/abc/').tokenize();
    const html = buildHighlightedHTML(tokens, undefined, { tokenClassName: 'custom' });

    expect(html).toContain('class="ei-token ei-token--regex custom"');
  });

  it('passes tokenClassName through to range spans', () => {
    const tokens = new Lexer('price:[1 TO 2]').tokenize();
    const html = buildHighlightedHTML(tokens, undefined, { tokenClassName: 'custom' });

    expect(html).toContain('class="ei-token ei-token--range custom"');
  });

  it('whitespace tokens do not get spans', () => {
    const tokens = new Lexer('a b').tokenize();
    const html = buildHighlightedHTML(tokens);

    // Whitespace should be a bare space, not wrapped in a span
    expect(html).not.toContain('ei-token--whitespace');
  });
});

describe('TOKEN_CLASS_MAP coverage', () => {
  it('every TokenType except WHITESPACE produces a class', () => {
    // Use a query that exercises many token types
    const queries = [
      'status:active',           // FIELD_NAME, COLON, VALUE
      '"phrase"',                 // QUOTED_VALUE
      'a AND b OR NOT c',        // AND, OR, NOT
      '(x)',                     // LPAREN, RPAREN
      'price:>10',               // COMPARISON_OP
      '#saved',                  // SAVED_SEARCH
      '!history',                // HISTORY_REF
      '+required',               // PREFIX_OP
      'wild*',                   // WILDCARD
      '/regex/',                 // REGEX
      'price:[1 TO 2]',         // RANGE
      'word~2',                  // TILDE
      'term^3',                  // BOOST
    ];

    const allTypes = new Set<string>();
    for (const q of queries) {
      const tokens = new Lexer(q, { savedSearches: true, historySearch: true }).tokenize();
      for (const t of tokens) {
        allTypes.add(t.type);
      }
    }

    // All types except WHITESPACE and UNKNOWN should have appeared
    const skip = new Set(['WHITESPACE', 'UNKNOWN']);
    const expectedTypes = Object.values(TokenType).filter(t => !skip.has(t));
    for (const t of expectedTypes) {
      expect(allTypes.has(t), `Expected token type ${t} to appear in test queries`).toBe(true);
    }
  });
});

describe('valueTypes per-field-type coloring', () => {
  const fieldTypeMap = new Map<string, FieldType>([
    ['status', 'string'],
    ['price', 'number'],
    ['created', 'date'],
    ['is_vip', 'boolean'],
    ['ip', 'ip'],
  ]);
  const valueTypes = { string: '#aaa', number: '#bbb', date: '#ccc', boolean: '#ddd', ip: '#eee' };

  it('colors simple field:value by field type', () => {
    const tokens = new Lexer('status:active').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    expect(html).toContain('color:#aaa');
  });

  it('colors number field value', () => {
    const tokens = new Lexer('price:100').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    expect(html).toContain('color:#bbb');
  });

  it('colors boolean field value', () => {
    const tokens = new Lexer('is_vip:true').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    expect(html).toContain('color:#ddd');
  });

  it('colors values inside field groups', () => {
    const tokens = new Lexer('status:(active OR inactive)').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    // Both values inside the group should get the string color
    const matches = html.match(/color:#aaa/g);
    expect(matches?.length).toBe(2);
  });

  it('does not color bare terms (no field)', () => {
    const tokens = new Lexer('hello world').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    expect(html).not.toContain('color:#aaa');
    expect(html).not.toContain('color:#bbb');
  });

  it('does not color values for unknown fields', () => {
    const tokens = new Lexer('unknown:value').tokenize();
    const html = buildHighlightedHTML(tokens, { valueTypes }, { fieldTypeMap });
    // Should use default fieldValue color, not any valueTypes color
    expect(html).not.toContain('color:#aaa');
    expect(html).not.toContain('color:#bbb');
  });

  it('falls back to fieldValue when valueTypes is not set', () => {
    const tokens = new Lexer('status:active').tokenize();
    const html = buildHighlightedHTML(tokens, undefined, { fieldTypeMap });
    // Should not contain any valueTypes colors
    expect(html).not.toContain('color:#aaa');
  });
});
