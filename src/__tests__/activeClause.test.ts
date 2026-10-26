import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { getClauseNodeRangeAtOffset } from '../parser/findClauseAtOffset';
import { buildHighlightedHTML } from '../components/HighlightedContent';

const parse = (text: string) => {
  const tokens = new Lexer(text).tokenize();
  return { tokens, ast: new Parser(tokens).parse() };
};
const clauseText = (text: string, offset: number) => {
  const r = getClauseNodeRangeAtOffset(parse(text).ast, offset);
  return r ? text.slice(r.start, r.end) : null;
};

describe('getClauseNodeRangeAtOffset', () => {
  it('finds the operand the caret is in, end inclusive', () => {
    expect(clauseText('name:john smith', 13)).toBe('smith'); // smi|th: not part of name
    expect(clauseText('name:john smith', 2)).toBe('name:john');
    expect(clauseText('name:john smith', 9)).toBe('name:john'); // right after the value
    expect(clauseText('name:(john smith springfield illinois)', 22)).toBe('name:(john smith springfield illinois)');
    expect(clauseText('age:[18 TO 65] AND x', 6)).toBe('age:[18 TO 65]');
    expect(clauseText('NOT status:active', 1)).toBe('NOT status:active');
  });

  it('nothing between clauses, outside the text, or without an AST', () => {
    expect(clauseText('name:john   smith', 11)).toBeNull();
    expect(clauseText('a:1 AND b:2', 5)).toBeNull();
    expect(getClauseNodeRangeAtOffset(null, 0)).toBeNull();
    expect(getClauseNodeRangeAtOffset(parse('a:1').ast, -1)).toBeNull();
    expect(clauseText('a:1', 10)).toBeNull();
  });
});

describe('buildHighlightedHTML activeClause', () => {
  const classes = (html: string) => Array.from(html.matchAll(/<span class="([^"]*)"([^>]*)>([^<]*)<\/span>/g)).map(m => ({ cls: m[1], attrs: m[2], text: m[3] }));

  it('marks every span of the clause, whitespace included, with the class', () => {
    const text = 'name:(john smith) x';
    const { tokens, ast } = parse(text);
    const html = buildHighlightedHTML(tokens, undefined, {
      activeClause: getClauseNodeRangeAtOffset(ast, 12),
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
    const html = buildHighlightedHTML(tokens, undefined, { activeClause: getClauseNodeRangeAtOffset(ast, 13) });
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
