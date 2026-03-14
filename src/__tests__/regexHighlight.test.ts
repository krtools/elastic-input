import { describe, it, expect } from 'vitest';
import { tokenizeRegexContent, RegexPart } from '../highlighting/regexHighlight';

function types(value: string): string[] {
  return tokenizeRegexContent(value).map(p => p.type);
}

function texts(value: string): string[] {
  return tokenizeRegexContent(value).map(p => p.text);
}

describe('tokenizeRegexContent', () => {
  it('tokenizes delimiters', () => {
    const parts = tokenizeRegexContent('/abc/');
    expect(parts[0]).toEqual({ type: 'delimiter', text: '/' });
    expect(parts[parts.length - 1]).toEqual({ type: 'delimiter', text: '/' });
  });

  it('tokenizes plain text between delimiters', () => {
    expect(types('/hello/')).toEqual(['delimiter', 'text', 'delimiter']);
    expect(texts('/hello/')).toEqual(['/', 'hello', '/']);
  });

  it('tokenizes escape sequences', () => {
    expect(types('/\\d+/')).toEqual(['delimiter', 'escape', 'quantifier', 'delimiter']);
    expect(texts('/\\d+/')).toEqual(['/', '\\d', '+', '/']);
  });

  it('tokenizes character classes', () => {
    expect(types('/[abc]/')).toEqual(['delimiter', 'charClass', 'delimiter']);
    expect(texts('/[abc]/')).toEqual(['/', '[abc]', '/']);
  });

  it('tokenizes negated character class', () => {
    expect(texts('/[^0-9]/')).toEqual(['/', '[^0-9]', '/']);
    expect(types('/[^0-9]/')).toEqual(['delimiter', 'charClass', 'delimiter']);
  });

  it('handles ] as first char in character class', () => {
    expect(texts('/[]a]/')).toEqual(['/', '[]a]', '/']);
  });

  it('handles escaped chars in character class', () => {
    expect(texts('/[\\]]/')).toEqual(['/', '[\\]]', '/']);
  });

  it('tokenizes groups', () => {
    expect(types('/(abc)/')).toEqual(['delimiter', 'groupOpen', 'text', 'groupClose', 'delimiter']);
    expect(texts('/(abc)/')).toEqual(['/', '(', 'abc', ')', '/']);
  });

  it('tokenizes non-capturing groups', () => {
    const parts = tokenizeRegexContent('/(?:abc)/');
    expect(parts[1]).toEqual({ type: 'groupOpen', text: '(?:' });
  });

  it('tokenizes lookahead groups', () => {
    expect(tokenizeRegexContent('/(?=abc)/')[1]).toEqual({ type: 'groupOpen', text: '(?=' });
    expect(tokenizeRegexContent('/(?!abc)/')[1]).toEqual({ type: 'groupOpen', text: '(?!' });
  });

  it('tokenizes lookbehind groups', () => {
    expect(tokenizeRegexContent('/(?<=abc)/')[1]).toEqual({ type: 'groupOpen', text: '(?<=' });
    expect(tokenizeRegexContent('/(?<!abc)/')[1]).toEqual({ type: 'groupOpen', text: '(?<!' });
  });

  it('tokenizes quantifiers', () => {
    expect(types('/a+b*c?/')).toEqual([
      'delimiter', 'text', 'quantifier', 'text', 'quantifier', 'text', 'quantifier', 'delimiter',
    ]);
  });

  it('tokenizes lazy quantifiers', () => {
    expect(texts('/a+?/')).toEqual(['/', 'a', '+?', '/']);
    expect(texts('/a*?/')).toEqual(['/', 'a', '*?', '/']);
  });

  it('tokenizes range quantifiers', () => {
    expect(types('/a{1,3}/')).toEqual(['delimiter', 'text', 'quantifier', 'delimiter']);
    expect(texts('/a{1,3}/')).toEqual(['/', 'a', '{1,3}', '/']);
  });

  it('tokenizes anchors', () => {
    expect(types('/^abc$/')).toEqual(['delimiter', 'anchor', 'text', 'anchor', 'delimiter']);
  });

  it('tokenizes alternation', () => {
    expect(types('/a|b/')).toEqual(['delimiter', 'text', 'alternation', 'text', 'delimiter']);
  });

  it('tokenizes complex pattern', () => {
    const parts = tokenizeRegexContent('/^(\\d{1,3}\\.){3}\\d{1,3}$/');
    const typeList = parts.map(p => p.type);
    expect(typeList[0]).toBe('delimiter');
    expect(typeList[1]).toBe('anchor'); // ^
    expect(typeList[typeList.length - 1]).toBe('delimiter');
    expect(typeList[typeList.length - 2]).toBe('anchor'); // $
  });

  it('handles empty regex', () => {
    expect(types('//')).toEqual(['delimiter', 'delimiter']);
  });

  it('handles dot as text', () => {
    expect(types('/a.b/')).toEqual(['delimiter', 'text', 'delimiter']);
    expect(texts('/a.b/')).toEqual(['/', 'a.b', '/']);
  });
});
