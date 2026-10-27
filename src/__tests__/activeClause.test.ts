import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { getActiveClauseRangeAtOffset } from '../parser/findClauseAtOffset';
import { buildHighlightedHTML } from '../components/HighlightedContent';

const parse = (text: string) => {
  const tokens = new Lexer(text).tokenize();
  return { tokens, ast: new Parser(tokens).parse() };
};
const at = (text: string, offset: number) => {
  const r = getActiveClauseRangeAtOffset(parse(text).ast, offset);
  return r ? text.slice(r.start, r.end) : null;
};

describe('getActiveClauseRangeAtOffset', () => {
  it('finds the filter the caret is in, end inclusive', () => {
    expect(at('name:john smith', 13)).toBe('smith'); // smi|th: not part of name
    expect(at('name:john smith', 2)).toBe('name:john');
    expect(at('name:john smith', 9)).toBe('name:john'); // right after the value
    expect(at('name:(john smith springfield illinois)', 22)).toBe('name:(john smith springfield illinois)');
    expect(at('name:(john smith)', 10)).toBe('name:(john smith)'); // on the space inside the group
    expect(at('age:[18 TO 65] AND x', 6)).toBe('age:[18 TO 65]');
    expect(at('NOT status:active', 6)).toBe('status:active');
  });

  it('descends into groups and NOT, stops at the filter', () => {
    const q = '(a:b AND c:(d OR e)) OR f:g';
    expect(at(q, 3)).toBe('a:b');
    expect(at(q, 17)).toBe('c:(d OR e)'); // in e: the field group, not the outer group
    expect(at(q, 15)).toBe('c:(d OR e)'); // on the OR inside the field group
    expect(at(q, 26)).toBe('f:g');
    expect(at('NOT (a:b OR c:d)', 13)).toBe('c:d');
  });

  it('a nested field:value inside a field group is its own filter', () => {
    const q = 'status:(status:inactive || active)';
    expect(at(q, 18)).toBe('status:inactive');
    expect(at(q, 30)).toBe(q); // a bare term belongs to the group's field
    expect(at('age:(x:[1 TO 2] OR 5)', 9)).toBe('x:[1 TO 2]');
  });

  it("nothing on a group's parens, NOT, between clauses, outside the text, or without an AST", () => {
    expect(at('(a:b AND c:(d OR e)) OR f:g', 0)).toBeNull(); // on (
    expect(at('(a:b AND c:(d OR e)) OR f:g', 20)).toBeNull(); // after )
    expect(at('NOT status:active', 1)).toBeNull();
    expect(at('name:john   smith', 11)).toBeNull();
    expect(at('a:1 AND b:2', 5)).toBeNull();
    expect(getActiveClauseRangeAtOffset(null, 0)).toBeNull();
    expect(getActiveClauseRangeAtOffset(parse('a:1').ast, -1)).toBeNull();
    expect(at('a:1', 10)).toBeNull();
  });
});

describe('buildHighlightedHTML activeClause', () => {
  const classes = (html: string) => Array.from(html.matchAll(/<span class="([^"]*)"([^>]*)>([^<]*)<\/span>/g)).map(m => ({ cls: m[1], attrs: m[2], text: m[3] }));

  it('marks every span of the clause, whitespace included, with the class', () => {
    const text = 'name:(john smith) x';
    const { tokens, ast } = parse(text);
    const html = buildHighlightedHTML(tokens, undefined, {
      activeClause: getActiveClauseRangeAtOffset(ast, 12),
      activeClauseClassName: 'mine',
    });
    const marked = classes(html).filter(s => s.cls.includes('ei-clause--active'));
    expect(marked.map(s => s.text).join('')).toBe('name:(john smith)');
    expect(marked.every(s => s.cls.includes('mine'))).toBe(true);
    expect(marked.some(s => s.text === ' ' && s.attrs === '')).toBe(true); // the space inside the group is wrapped, class only
    expect(classes(html).find(s => s.text === 'x')!.cls).not.toContain('ei-clause--active');
  });

  it('leaves spans outside the clause alone', () => {
    const text = 'name:john smith';
    const { tokens, ast } = parse(text);
    const html = buildHighlightedHTML(tokens, undefined, { activeClause: getActiveClauseRangeAtOffset(ast, 13) });
    const marked = classes(html).filter(s => s.cls.includes('ei-clause--active'));
    expect(marked.map(s => s.text)).toEqual(['smith']);
    expect(buildHighlightedHTML(tokens, undefined, { activeClause: null })).not.toContain('ei-clause--active');
  });

  it('marks the matched parens with a class', () => {
    const { tokens } = parse('name:(john) x');
    const marked = classes(buildHighlightedHTML(tokens, undefined, { cursorOffset: 6 })).filter(s => s.cls.includes('ei-paren--matched'));
    expect(marked.map(s => s.text)).toEqual(['(', ')']);
    expect(buildHighlightedHTML(tokens, undefined, { cursorOffset: 8 })).not.toContain('ei-paren--matched');
  });
});
