import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { TokenType } from '../lexer/tokens';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { FieldConfig } from '../types';
import { getReplacementRange } from '../utils/textUtils';

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string', suggestions: ['active', 'inactive', 'pending'] },
  { name: 'level', label: 'Log Level', type: 'string', suggestions: ['DEBUG', 'INFO', 'WARN', 'ERROR'] },
  { name: 'name', label: 'Name', type: 'string' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'created', label: 'Created Date', type: 'date' },
];

function getSuggestions(input: string, cursorOffset?: number) {
  const engine = new AutocompleteEngine(FIELDS, [], [], 10);
  const tokens = new Lexer(input).tokenize();
  return engine.getSuggestions(tokens, cursorOffset ?? input.length);
}

/**
 * Simulate accepting a suggestion: splice the suggestion text into the input
 * using the suggestion's replacement range.
 */
function acceptSuggestion(
  input: string,
  suggestionText: string,
  replaceStart: number,
  replaceEnd: number
): string {
  return input.slice(0, replaceStart) + suggestionText + input.slice(replaceEnd);
}

/**
 * Simulate accepting a suggestion with a browser selection range.
 * Uses the broader of the token-based range and the selection range,
 * mirroring ElasticInput.acceptSuggestion behavior.
 */
function acceptSuggestionWithSelection(
  input: string,
  suggestionText: string,
  replaceStart: number,
  replaceEnd: number,
  selectionStart: number,
  selectionEnd: number
): string {
  const effectiveStart = Math.min(replaceStart, selectionStart);
  const effectiveEnd = Math.max(replaceEnd, selectionEnd);
  return input.slice(0, effectiveStart) + suggestionText + input.slice(effectiveEnd);
}

describe('getReplacementRange', () => {
  it('extends past colon for FIELD_NAME tokens', () => {
    // "status:active" -> FIELD_NAME(0,6), COLON(6,7), VALUE(7,13)
    const tokens = new Lexer('status:active').tokenize();
    const fieldNameToken = tokens.find(t => t.type === TokenType.FIELD_NAME)!;
    const range = getReplacementRange(fieldNameToken, 3, tokens);
    expect(range.start).toBe(0);
    expect(range.end).toBe(7); // includes the colon
  });

  it('does NOT extend past colon for VALUE tokens', () => {
    const tokens = new Lexer('status:active').tokenize();
    const valueToken = tokens.find(t => t.type === TokenType.VALUE)!;
    const range = getReplacementRange(valueToken, 10, tokens);
    expect(range.start).toBe(7);
    expect(range.end).toBe(13);
  });

  it('works for bare word (no colon to extend to)', () => {
    const tokens = new Lexer('stat').tokenize();
    const range = getReplacementRange(tokens[0], 4, tokens);
    expect(range.start).toBe(0);
    expect(range.end).toBe(4);
  });

  it('extends past colon for FIELD_NAME inside parens', () => {
    // "(status:active)" -> LPAREN, FIELD_NAME(1,7), COLON(7,8), VALUE(8,14), RPAREN
    const tokens = new Lexer('(status:active)').tokenize();
    const fieldNameToken = tokens.find(t => t.type === TokenType.FIELD_NAME)!;
    const range = getReplacementRange(fieldNameToken, 4, tokens);
    expect(range.start).toBe(1);
    expect(range.end).toBe(8); // includes colon
  });

  it('extends past colon for FIELD_NAME after PREFIX_OP', () => {
    // "-status:active" -> PREFIX_OP(0,1), FIELD_NAME(1,7), COLON(7,8), VALUE(8,14)
    const tokens = new Lexer('-status:active').tokenize();
    const fieldNameToken = tokens.find(t => t.type === TokenType.FIELD_NAME)!;
    const range = getReplacementRange(fieldNameToken, 4, tokens);
    expect(range.start).toBe(1);
    expect(range.end).toBe(8); // includes colon
  });

  it('returns cursor position when token is undefined', () => {
    const range = getReplacementRange(undefined, 5);
    expect(range.start).toBe(5);
    expect(range.end).toBe(5);
  });
});

describe('Double Colon Prevention', () => {
  it('clicking field in "status:x" and re-selecting same field does not double colon', () => {
    // cursor in the middle of "status" → FIELD_NAME context, partial="status"
    const result = getSuggestions('status:x', 3);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceStart).toBe(0);
    expect(statusSugg!.replaceEnd).toBe(7); // includes colon

    const newValue = acceptSuggestion('status:x', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('status:x');
  });

  it('field name without existing colon gets colon appended correctly', () => {
    // typing "stat" (no colon yet)
    const result = getSuggestions('stat', 4);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceStart).toBe(0);
    expect(statusSugg!.replaceEnd).toBe(4); // no colon to extend to

    const newValue = acceptSuggestion('stat', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('status:');
  });

  it('selecting a different field in "status:active" via field name click', () => {
    // cursor at offset 3 in "status:active" → partial is "status"
    // only fields matching "status" are shown, so let's use the status suggestion
    const result = getSuggestions('status:active', 3);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceEnd).toBe(7); // includes colon

    const newValue = acceptSuggestion('status:active', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('status:active');
  });

  it('replacement range in compound query does not double colon', () => {
    // "a AND status:y" — cursor on "status" at offset 10
    // Tokens: VALUE(0,1), WS, AND(2,5), WS, FIELD_NAME(6,12), COLON(12,13), VALUE(13,14)
    const result = getSuggestions('a AND status:y', 10);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceStart).toBe(6);
    expect(statusSugg!.replaceEnd).toBe(13); // includes colon

    const newValue = acceptSuggestion('a AND status:y', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('a AND status:y');
  });

  it('replacement range in parens does not double colon', () => {
    // "(status:active)" — cursor at 4
    const result = getSuggestions('(status:active)', 4);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceStart).toBe(1);
    expect(statusSugg!.replaceEnd).toBe(8); // includes colon

    const newValue = acceptSuggestion('(status:active)', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('(status:active)');
  });

  it('replacement range after PREFIX_OP does not double colon', () => {
    // "-status:active" — cursor at 4
    const result = getSuggestions('-status:active', 4);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();
    expect(statusSugg!.replaceStart).toBe(1);
    expect(statusSugg!.replaceEnd).toBe(8); // includes colon

    const newValue = acceptSuggestion('-status:active', 'status:', statusSugg!.replaceStart, statusSugg!.replaceEnd);
    expect(newValue).toBe('-status:active');
  });
});

describe('Selection Replacement', () => {
  it('double-clicking a value and accepting replaces it correctly', () => {
    // "status:active" — double-click "active" selects chars 7-13
    // cursor start = 7, suggestions at offset 7
    const result = getSuggestions('status:active', 7);
    expect(result.context.type).toBe('FIELD_VALUE');
    const inactiveSugg = result.suggestions.find(s => s.text === 'inactive');
    expect(inactiveSugg).toBeDefined();
    expect(inactiveSugg!.replaceStart).toBe(7);
    expect(inactiveSugg!.replaceEnd).toBe(13);

    const newValue = acceptSuggestionWithSelection(
      'status:active', 'inactive',
      inactiveSugg!.replaceStart, inactiveSugg!.replaceEnd,
      7, 13 // browser selection
    );
    expect(newValue).toBe('status:inactive');
  });

  it('collapsed cursor (no selection) uses token range only', () => {
    const result = getSuggestions('status:active', 10);
    const inactiveSugg = result.suggestions.find(s => s.text === 'inactive');
    expect(inactiveSugg).toBeDefined();

    const newValue = acceptSuggestionWithSelection(
      'status:active', 'inactive',
      inactiveSugg!.replaceStart, inactiveSugg!.replaceEnd,
      10, 10 // collapsed cursor
    );
    expect(newValue).toBe('status:inactive');
  });

  it('double-clicking value in multi-field query replaces only that value', () => {
    // "status:active AND level:ERROR" — double-click "ERROR" selects 24-29
    // Cursor at 24 is at COLON(23,24) boundary. The COLON handler detects
    // the following VALUE(24,29), so partial="ERROR" and token covers (24,29).
    const result = getSuggestions('status:active AND level:ERROR', 24);
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.fieldName).toBe('level');
    expect(result.context.partial).toBe('ERROR');
    expect(result.context.token).toBeDefined();
    expect(result.context.token!.start).toBe(24);
    expect(result.context.token!.end).toBe(29);

    // "ERROR" matches "ERROR" (the existing value)
    const errorSugg = result.suggestions.find(s => s.text === 'ERROR');
    expect(errorSugg).toBeDefined();
    expect(errorSugg!.replaceStart).toBe(24);
    expect(errorSugg!.replaceEnd).toBe(29);

    // Simulate accepting "WARN" with the same replacement range
    const newValue = acceptSuggestionWithSelection(
      'status:active AND level:ERROR', 'WARN',
      24, 29, // token range
      24, 29  // selection range
    );
    expect(newValue).toBe('status:active AND level:WARN');
  });

  it('selection extending beyond token uses broader range', () => {
    // User drag-selects "active " (7-14, including trailing space)
    // Token range for VALUE is (7, 13), selection is (7, 14)
    // Effective range should use max(13, 14) = 14
    // Cursor at 7 (colon boundary) picks up VALUE "active" as partial
    const result = getSuggestions('status:active AND x', 7);
    expect(result.context.type).toBe('FIELD_VALUE');
    // "active" partial matches "active" and "inactive"
    const activeSugg = result.suggestions.find(s => s.text === 'active');
    expect(activeSugg).toBeDefined();

    // Simulate with broader selection range
    const newValue = acceptSuggestionWithSelection(
      'status:active AND x', 'pending',
      activeSugg!.replaceStart, activeSugg!.replaceEnd, // token: 7-13
      7, 14 // selection includes trailing space
    );
    expect(newValue).toBe('status:pendingAND x');
  });

  it('selecting entire field:value pair and replacing field works', () => {
    // User selects "status:active" (0-13), cursor at 0 → FIELD_NAME context
    const result = getSuggestions('status:active', 0);
    const statusSugg = result.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();

    // Token range (0, 7). Selection (0, 13). Effective: (0, 13).
    const newValue = acceptSuggestionWithSelection(
      'status:active', 'status:',
      statusSugg!.replaceStart, statusSugg!.replaceEnd,
      0, 13
    );
    expect(newValue).toBe('status:');
  });
});

describe('Stale selectionEnd must not expand replacement range', () => {
  it('re-typing field name after delete does not consume value characters', () => {
    // Scenario: user had "created:2026-03-02 ", deleted "created",
    // typed "dat" before the colon → "dat:2026-03-02 " with cursor at 3.
    // If selectionEnd is stale from the previous select-and-delete (e.g. 7),
    // Math.max(replaceEnd, selectionEnd) would over-consume into the value.
    // Fix: selectionEnd must equal cursorOffset when there is no active selection.
    const input = 'dat:2026-03-02 ';
    const result = getSuggestions(input, 3);
    const createdSugg = result.suggestions.find(s => s.text === 'created:');
    expect(createdSugg).toBeDefined();
    // Replacement range should cover "dat:" (0-4)
    expect(createdSugg!.replaceStart).toBe(0);
    expect(createdSugg!.replaceEnd).toBe(4);

    // With correct (synchronized) selectionEnd = cursorOffset = 3
    const correct = acceptSuggestionWithSelection(
      input, 'created:',
      createdSugg!.replaceStart, createdSugg!.replaceEnd,
      3, 3 // collapsed cursor — selectionEnd matches cursorOffset
    );
    expect(correct).toBe('created:2026-03-02 ');

    // Demonstrate the bug: stale selectionEnd = 7 from prior select-and-delete
    const buggy = acceptSuggestionWithSelection(
      input, 'created:',
      createdSugg!.replaceStart, createdSugg!.replaceEnd,
      3, 7 // stale selectionEnd — this was the bug
    );
    expect(buggy).toBe('created:6-03-02 '); // wrong! ate "202"
  });

  it('typing partial field in middle of query does not bleed with stale selection', () => {
    // "x AND dat:2026-03-02" with cursor at 9 (after "dat"), selectionEnd = 9
    const input = 'x AND dat:2026-03-02';
    const result = getSuggestions(input, 9);
    const createdSugg = result.suggestions.find(s => s.text === 'created:');
    expect(createdSugg).toBeDefined();

    const newValue = acceptSuggestionWithSelection(
      input, 'created:',
      createdSugg!.replaceStart, createdSugg!.replaceEnd,
      9, 9 // collapsed cursor
    );
    expect(newValue).toBe('x AND created:2026-03-02');
  });
});

describe('Cursor at colon-value boundary', () => {
  it('cursor at colon end with following value returns FIELD_VALUE with token', () => {
    // "status:active" — offset 7 is at COLON(6,7).end = VALUE(7,13).start
    const result = getSuggestions('status:active', 7);
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.fieldName).toBe('status');
    expect(result.context.partial).toBe('active');
    expect(result.context.token).toBeDefined();
    expect(result.context.token!.start).toBe(7);
    expect(result.context.token!.end).toBe(13);
  });

  it('cursor at colon end with no following value returns empty partial', () => {
    // "status:" — offset 7, no value follows
    const result = getSuggestions('status:', 7);
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.fieldName).toBe('status');
    expect(result.context.partial).toBe('');
  });

  it('cursor at colon end in compound query picks up following value', () => {
    // "level:ERROR AND x" — offset at level's colon end
    const tokens = new Lexer('level:ERROR AND x').tokenize();
    const colonToken = tokens.find(t => t.type === TokenType.COLON)!;
    const result = getSuggestions('level:ERROR AND x', colonToken.end);
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.partial).toBe('ERROR');
    expect(result.context.token).toBeDefined();
  });
});

describe('Value replacement does not bleed into adjacent tokens', () => {
  it('replacing partial value does not affect rest of query', () => {
    const result = getSuggestions('status:act AND x', 10);
    const activeSugg = result.suggestions.find(s => s.text === 'active');
    expect(activeSugg).toBeDefined();
    expect(activeSugg!.replaceStart).toBe(7);
    expect(activeSugg!.replaceEnd).toBe(10);

    const newValue = acceptSuggestion('status:act AND x', 'active', activeSugg!.replaceStart, activeSugg!.replaceEnd);
    expect(newValue).toBe('status:active AND x');
  });

  it('replacing value at end of input works', () => {
    const result = getSuggestions('status:pen', 10);
    const pendingSugg = result.suggestions.find(s => s.text === 'pending');
    expect(pendingSugg).toBeDefined();

    const newValue = acceptSuggestion('status:pen', 'pending', pendingSugg!.replaceStart, pendingSugg!.replaceEnd);
    expect(newValue).toBe('status:pending');
  });
});
