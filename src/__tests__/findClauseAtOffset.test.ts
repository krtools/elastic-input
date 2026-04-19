import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { Parser } from '../parser/Parser';
import { getClauseRangeAtOffset } from '../parser/findClauseAtOffset';

function parse(input: string) {
  const tokens = new Lexer(input).tokenize();
  return new Parser(tokens).parse();
}

function clauseAt(input: string, offset: number) {
  const ast = parse(input);
  return getClauseRangeAtOffset(ast, input, offset);
}

function selectedText(input: string, offset: number): string | null {
  const range = clauseAt(input, offset);
  if (!range) return null;
  return input.slice(range.start, range.end);
}

describe('getClauseRangeAtOffset', () => {
  describe('single clause', () => {
    it('returns the clause range for a bare field:value', () => {
      expect(clauseAt('status:active', 3)).toEqual({ start: 0, end: 13 });
    });

    it('returns the clause range for a bare term', () => {
      expect(clauseAt('hello', 2)).toEqual({ start: 0, end: 5 });
    });

    it('returns null when AST is empty', () => {
      expect(clauseAt('', 0)).toBeNull();
      expect(clauseAt('   ', 1)).toBeNull();
    });
  });

  describe('modifiers', () => {
    it('includes NOT prefix', () => {
      expect(selectedText('NOT status:active', 6)).toBe('NOT status:active');
    });

    it('includes - prefix', () => {
      expect(selectedText('-status:active', 2)).toBe('-status:active');
    });

    it('includes + prefix', () => {
      expect(selectedText('+status:active', 2)).toBe('+status:active');
    });

    it('includes ! prefix', () => {
      expect(selectedText('!status:active', 2)).toBe('!status:active');
    });

    it('includes ^boost suffix', () => {
      expect(selectedText('status:active^2', 3)).toBe('status:active^2');
    });

    it('includes ~fuzzy suffix on field value', () => {
      expect(selectedText('name:jon~1', 3)).toBe('name:jon~1');
    });

    it('includes ~fuzzy on bare term', () => {
      expect(selectedText('jon~1', 1)).toBe('jon~1');
    });

    it('includes combined prefix + suffix', () => {
      expect(selectedText('-status:active^2', 4)).toBe('-status:active^2');
    });
  });

  describe('boolean — consume trailing connector', () => {
    it('consumes trailing AND', () => {
      const input = 'status:active AND type:user';
      expect(selectedText(input, 3)).toBe('status:active AND ');
    });

    it('consumes trailing OR', () => {
      const input = 'status:active OR type:user';
      expect(selectedText(input, 3)).toBe('status:active OR ');
    });

    it('consumes trailing && symbolic AND', () => {
      const input = 'status:active && type:user';
      expect(selectedText(input, 3)).toBe('status:active && ');
    });

    it('consumes trailing || symbolic OR', () => {
      const input = 'status:active || type:user';
      expect(selectedText(input, 3)).toBe('status:active || ');
    });

    it('consumes trailing whitespace as implicit AND', () => {
      const input = 'status:active type:user';
      expect(selectedText(input, 3)).toBe('status:active ');
    });

    it('three-clause AND chain — first clause consumes trailing', () => {
      const input = 'a:1 AND b:2 AND c:3';
      expect(selectedText(input, 1)).toBe('a:1 AND ');
    });

    it('three-clause AND chain — middle clause consumes trailing', () => {
      const input = 'a:1 AND b:2 AND c:3';
      const range = clauseAt(input, 9); // on 'b'
      expect(range).not.toBeNull();
      // deleting leaves 'a:1 AND c:3' — valid
      const remaining = input.slice(0, range!.start) + input.slice(range!.end);
      expect(remaining).toBe('a:1 AND c:3');
    });
  });

  describe('boolean — consume leading connector when clause is last', () => {
    it('consumes leading AND for last clause', () => {
      const input = 'status:active AND type:user';
      const range = clauseAt(input, 20); // inside 'type:user'
      expect(range).not.toBeNull();
      expect(input.slice(range!.start, range!.end)).toBe(' AND type:user');
      const remaining = input.slice(0, range!.start) + input.slice(range!.end);
      expect(remaining).toBe('status:active');
    });

    it('consumes leading OR for last clause', () => {
      const input = 'a:1 OR b:2';
      const range = clauseAt(input, 8);
      expect(range).not.toBeNull();
      const remaining = input.slice(0, range!.start) + input.slice(range!.end);
      expect(remaining).toBe('a:1');
    });

    it('consumes leading implicit AND (whitespace) for last clause', () => {
      const input = 'a:1 b:2';
      const range = clauseAt(input, 5);
      expect(range).not.toBeNull();
      const remaining = input.slice(0, range!.start) + input.slice(range!.end);
      expect(remaining).toBe('a:1');
    });
  });

  describe('groups and nesting', () => {
    it('selects the whole Group node when clicked inside parens', () => {
      const input = 'status:active AND (a:1 OR b:2)';
      const range = clauseAt(input, 20); // inside 'a:1'
      expect(range).not.toBeNull();
      // Should select '(a:1 OR b:2)' plus leading ' AND '
      expect(input.slice(range!.start, range!.end)).toBe(' AND (a:1 OR b:2)');
    });

    it('group with NOT prefix includes the NOT', () => {
      const input = 'NOT (a:1 OR b:2) AND c:3';
      const range = clauseAt(input, 7); // inside 'a:1'
      expect(range).not.toBeNull();
      expect(input.slice(range!.start, range!.end)).toBe('NOT (a:1 OR b:2) AND ');
    });
  });

  describe('field groups', () => {
    it('selects the whole field group', () => {
      const input = 'status:(active OR pending)';
      const range = clauseAt(input, 10);
      expect(range).not.toBeNull();
      expect(input.slice(range!.start, range!.end)).toBe('status:(active OR pending)');
    });
  });

  describe('ranges', () => {
    it('selects the whole range clause', () => {
      const input = 'age:[18 TO 65]';
      expect(selectedText(input, 5)).toBe('age:[18 TO 65]');
    });

    it('range with trailing AND', () => {
      const input = 'age:[18 TO 65] AND name:jon';
      expect(selectedText(input, 5)).toBe('age:[18 TO 65] AND ');
    });
  });

  describe('deletion produces a valid query', () => {
    const cases: Array<[string, number, string]> = [
      ['status:active AND type:user', 3, 'type:user'],
      ['status:active AND type:user', 20, 'status:active'],
      ['a:1 AND b:2 AND c:3', 1, 'b:2 AND c:3'],
      ['a:1 AND b:2 AND c:3', 17, 'a:1 AND b:2'],
      ['NOT a:1 AND b:2', 2, 'b:2'],
      ['-a:1 OR b:2', 1, 'b:2'],
      ['a:1 b:2', 5, 'a:1'],
      ['a:1 b:2', 1, 'b:2'],
    ];

    for (const [input, offset, expected] of cases) {
      it(`"${input}" @${offset} → "${expected}"`, () => {
        const range = clauseAt(input, offset);
        expect(range).not.toBeNull();
        const remaining = input.slice(0, range!.start) + input.slice(range!.end);
        expect(remaining).toBe(expected);
      });
    }
  });

  describe('edge cases', () => {
    it('returns null for offset past end of text', () => {
      expect(clauseAt('a:1', 100)).toBeNull();
    });

    it('offset at start of clause selects it', () => {
      expect(selectedText('status:active', 0)).toBe('status:active');
    });

    it('offset at end of clause selects it', () => {
      expect(selectedText('status:active', 13)).toBe('status:active');
    });

    it('saved search clause', () => {
      const input = '#my-search AND status:active';
      expect(selectedText(input, 5)).toBe('#my-search AND ');
    });

    it('history reference clause', () => {
      const input = '!1 AND status:active';
      expect(selectedText(input, 1)).toBe('!1 AND ');
    });
  });
});
