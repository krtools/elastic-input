import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { collectClauseStops, findNextClauseStop, ClauseStop } from '../utils/clauseNavigation';

function getStops(query: string): ClauseStop[] {
  const tokens = new Lexer(query).tokenize();
  const ast = new Parser(tokens).parse();
  return collectClauseStops(ast);
}

function labels(query: string, stops: ClauseStop[]): string[] {
  return stops.map(s => query.slice(s.start, s.end));
}

describe('collectClauseStops', () => {
  it('returns empty for empty input', () => {
    expect(getStops('')).toEqual([]);
  });

  it('returns single stop for a single bare term', () => {
    const q = 'hello';
    expect(labels(q, getStops(q))).toEqual(['hello']);
  });

  it('returns single stop for a single field:value', () => {
    const q = 'status:active';
    expect(labels(q, getStops(q))).toEqual(['status:active']);
  });

  it('returns stops for implicit AND (two terms)', () => {
    const q = 'a b';
    expect(labels(q, getStops(q))).toEqual(['a', 'b']);
  });

  it('returns stops for explicit AND', () => {
    const q = 'a AND b';
    expect(labels(q, getStops(q))).toEqual(['a', 'b']);
  });

  it('returns stops for three terms', () => {
    const q = 'a AND b AND c';
    expect(labels(q, getStops(q))).toEqual(['a', 'b', 'c']);
  });

  it('multi-clause group: enter and exit', () => {
    const q = '(a b) c';
    expect(labels(q, getStops(q))).toEqual(['(a b)', 'a', 'b', '(a b)', 'c']);
  });

  it('single-clause group: no enter', () => {
    const q = '(a) b';
    expect(labels(q, getStops(q))).toEqual(['(a)', 'b']);
  });

  it('NOT wraps: enter but no exit back', () => {
    const q = 'NOT x y';
    expect(labels(q, getStops(q))).toEqual(['NOT x', 'x', 'y']);
  });

  it('FieldGroup: enter but no exit back', () => {
    const q = 'status:(a OR b) c';
    expect(labels(q, getStops(q))).toEqual(['status:(a OR b)', 'a', 'b', 'c']);
  });

  it('single-clause FieldGroup: no enter', () => {
    const q = 'status:(a) c';
    // status:(a) has a single clause inside, so no enter
    expect(labels(q, getStops(q))).toEqual(['status:(a)', 'c']);
  });

  it('nested groups with enter/exit', () => {
    const q = '(a (b c)) d';
    // Outer group is multi-clause (a, (b c)): enter, see a, then inner group
    // Inner group (b c) is multi-clause: enter, b, c, exit
    expect(labels(q, getStops(q))).toEqual([
      '(a (b c))', 'a', '(b c)', 'b', 'c', '(b c)', '(a (b c))', 'd',
    ]);
  });

  it('NOT field:value is a single clause to enter', () => {
    const q = 'NOT status:active y';
    expect(labels(q, getStops(q))).toEqual(['NOT status:active', 'status:active', 'y']);
  });

  it('field group with three terms', () => {
    const q = 'status:(a OR b OR c)';
    expect(labels(q, getStops(q))).toEqual(['status:(a OR b OR c)', 'a', 'b', 'c']);
  });
});

describe('findNextClauseStop', () => {
  it('navigates forward through stops by index', () => {
    const q = 'a AND b AND c';
    const stops = getStops(q);
    // At index 0 ('a'), forward → index 1 ('b')
    const next = findNextClauseStop(stops, 0, 0, 'forward');
    expect(next!.index).toBe(1);
    expect(q.slice(next!.stop.start, next!.stop.end)).toBe('b');
  });

  it('navigates backward through stops by index', () => {
    const q = 'a AND b AND c';
    const stops = getStops(q);
    // At index 2 ('c'), backward → index 1 ('b')
    const prev = findNextClauseStop(stops, 2, 0, 'backward');
    expect(prev!.index).toBe(1);
    expect(q.slice(prev!.stop.start, prev!.stop.end)).toBe('b');
  });

  it('returns null at the end', () => {
    const q = 'a AND b';
    const stops = getStops(q);
    expect(findNextClauseStop(stops, 1, 0, 'forward')).toBeNull();
  });

  it('returns null at the beginning', () => {
    const q = 'a AND b';
    const stops = getStops(q);
    expect(findNextClauseStop(stops, 0, 0, 'backward')).toBeNull();
  });

  it('enters a group on forward from enter stop', () => {
    const q = '(a b) c';
    const stops = getStops(q);
    // index 0 is '(a b)' enter, forward → index 1 ('a')
    const next = findNextClauseStop(stops, 0, 0, 'forward');
    expect(q.slice(next!.stop.start, next!.stop.end)).toBe('a');
  });

  it('exits a group on forward from last inner clause', () => {
    const q = '(a b) c';
    const stops = getStops(q);
    // index 2 is 'b', forward → index 3 '(a b)' exit
    const next = findNextClauseStop(stops, 2, 0, 'forward');
    expect(q.slice(next!.stop.start, next!.stop.end)).toBe('(a b)');
    expect(next!.index).toBe(3);
  });

  it('from group exit, moves to next sibling', () => {
    const q = '(a b) c';
    const stops = getStops(q);
    // index 3 is '(a b)' exit, forward → index 4 'c'
    const next = findNextClauseStop(stops, 3, 0, 'forward');
    expect(q.slice(next!.stop.start, next!.stop.end)).toBe('c');
  });

  it('finds nearest stop when no active index (forward)', () => {
    const q = '  a AND b';
    const stops = getStops(q);
    // No active stop (index -1), cursor at 0
    const next = findNextClauseStop(stops, -1, 0, 'forward');
    expect(next!.index).toBe(0);
  });

  it('finds nearest stop when no active index (backward)', () => {
    const q = 'a AND b';
    const stops = getStops(q);
    // No active stop (index -1), cursor at end
    const prev = findNextClauseStop(stops, -1, 7, 'backward');
    expect(prev!.index).toBe(1);
    expect(q.slice(prev!.stop.start, prev!.stop.end)).toBe('b');
  });

  it('full forward traversal of (a b) c', () => {
    const q = '(a b) c';
    const stops = getStops(q);
    const sequence: string[] = [];
    let idx = -1;
    let cursor = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = findNextClauseStop(stops, idx, cursor, 'forward');
      if (!r) break;
      idx = r.index;
      cursor = r.stop.start;
      sequence.push(q.slice(r.stop.start, r.stop.end));
    }
    expect(sequence).toEqual(['(a b)', 'a', 'b', '(a b)', 'c']);
  });

  it('full forward traversal of NOT x y', () => {
    const q = 'NOT x y';
    const stops = getStops(q);
    const sequence: string[] = [];
    let idx = -1;
    let cursor = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = findNextClauseStop(stops, idx, cursor, 'forward');
      if (!r) break;
      idx = r.index;
      cursor = r.stop.start;
      sequence.push(q.slice(r.stop.start, r.stop.end));
    }
    expect(sequence).toEqual(['NOT x', 'x', 'y']);
  });
});
