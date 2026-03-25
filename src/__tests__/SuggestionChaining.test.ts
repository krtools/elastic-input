import { describe, it, expect } from 'vitest';
import { Lexer, LexerOptions } from '../lexer/Lexer';
import { Parser, CursorContext } from '../parser/Parser';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { FieldConfig } from '../types';
import { Suggestion } from '../autocomplete/suggestionTypes';

const ALL_FEATURES: LexerOptions = { savedSearches: true, historySearch: true };

/**
 * Tests that verify suggestions chain correctly — after accepting one suggestion,
 * the cursor position and context should yield appropriate next suggestions.
 *
 * This simulates what ElasticInput.acceptSuggestion does:
 *   1. Build new value from replacement
 *   2. Set cursor at end of inserted text
 *   3. Call updateSuggestions(newTokens, newCursorPos)
 */

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'string', placeholder: 'Search statuses...' },
  { name: 'level', label: 'Log Level', type: 'string' },
  { name: 'name', label: 'Name', type: 'string' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'created', label: 'Created Date', type: 'date' },
  { name: 'is_vip', label: 'VIP', type: 'boolean' },
];

function getEngine() {
  return new AutocompleteEngine(FIELDS, [], [], 10);
}

function getSuggestions(engine: AutocompleteEngine, input: string, cursorOffset?: number, lexerOpts?: LexerOptions) {
  const tokens = new Lexer(input, lexerOpts).tokenize();
  return engine.getSuggestions(tokens, cursorOffset ?? input.length);
}

function getContext(input: string, cursorOffset?: number): CursorContext {
  const tokens = new Lexer(input).tokenize();
  return Parser.getCursorContext(tokens, cursorOffset ?? input.length);
}

/** Simulate accepting a suggestion and return the new state */
function acceptAndGetNext(
  engine: AutocompleteEngine,
  currentInput: string,
  suggestion: Suggestion
) {
  const before = currentInput.slice(0, suggestion.replaceStart);
  const after = currentInput.slice(suggestion.replaceEnd);
  const newValue = before + suggestion.text + after;
  const newCursorPos = before.length + suggestion.text.length;
  const newTokens = new Lexer(newValue).tokenize();
  const nextResult = engine.getSuggestions(newTokens, newCursorPos);
  return { newValue, newCursorPos, nextResult };
}

/**
 * Simulate accepting a suggestion with a specific key (Tab or Enter),
 * mirroring ElasticInput.acceptSuggestion behavior:
 * - Complete term (field value, saved search, history) at end → append trailing space
 * - Enter + field value → would trigger submit (returns shouldSubmit flag)
 */
function acceptWithKey(
  engine: AutocompleteEngine,
  currentInput: string,
  suggestion: Suggestion,
  contextType: string,
  key: 'Tab' | 'Enter',
  lexerOpts?: LexerOptions
) {
  const before = currentInput.slice(0, suggestion.replaceStart);
  const after = currentInput.slice(suggestion.replaceEnd);
  const isCompleteTerm = contextType === 'FIELD_VALUE' || contextType === 'SAVED_SEARCH' || contextType === 'HISTORY_REF';
  const trailingSpace = (isCompleteTerm && after.length === 0) ? ' ' : '';
  const newValue = before + suggestion.text + trailingSpace + after;
  const newCursorPos = before.length + suggestion.text.length + trailingSpace.length;
  const shouldSubmit = key === 'Enter' && contextType === 'FIELD_VALUE';
  const newTokens = new Lexer(newValue, lexerOpts).tokenize();
  const nextResult = engine.getSuggestions(newTokens, newCursorPos);
  return { newValue, newCursorPos, nextResult, shouldSubmit };
}

describe('Suggestion chaining — field selection → value suggestions', () => {
  it('selecting "status:" enters FIELD_VALUE context with placeholder hint', () => {
    const engine = getEngine();

    // Step 1: type "sta", get field suggestions
    const step1 = getSuggestions(engine, 'sta');
    const statusSugg = step1.suggestions.find(s => s.text === 'status:');
    expect(statusSugg).toBeDefined();

    // Step 2: accept "status:", cursor moves to end
    const { newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, 'sta', statusSugg!);
    expect(newValue).toBe('status:');
    expect(newCursorPos).toBe(7);

    // Step 3: enters FIELD_VALUE context, shows placeholder hint
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.context.fieldName).toBe('status');
    expect(nextResult.suggestions.length).toBe(1);
    expect(nextResult.suggestions[0].type).toBe('hint');
    expect(nextResult.suggestions[0].label).toBe('Search statuses...');
  });

  it('selecting "level:" enters FIELD_VALUE context with no suggestions', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'lev');
    const levelSugg = step1.suggestions.find(s => s.text === 'level:');
    expect(levelSugg).toBeDefined();

    const { newValue, nextResult } = acceptAndGetNext(engine, 'lev', levelSugg!);
    expect(newValue).toBe('level:');
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.suggestions).toHaveLength(0);
  });

  it('selecting "is_vip:" shows boolean suggestions', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'is');
    const vipSugg = step1.suggestions.find(s => s.text === 'is_vip:');
    expect(vipSugg).toBeDefined();

    const { nextResult } = acceptAndGetNext(engine, 'is', vipSugg!);
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.suggestions.map(s => s.text)).toEqual(['true', 'false']);
  });

  it('selecting "price:" shows number hint', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'pri');
    const priceSugg = step1.suggestions.find(s => s.text === 'price:');
    expect(priceSugg).toBeDefined();

    const { nextResult } = acceptAndGetNext(engine, 'pri', priceSugg!);
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.suggestions.length).toBe(1);
    expect(nextResult.suggestions[0].type).toBe('hint');
    expect(nextResult.suggestions[0].label).toBe('Enter a number');
  });

  it('selecting "created:" shows date picker', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'cre');
    const createdSugg = step1.suggestions.find(s => s.text === 'created:');
    expect(createdSugg).toBeDefined();

    const { nextResult } = acceptAndGetNext(engine, 'cre', createdSugg!);
    expect(nextResult.showDatePicker).toBe(true);
    expect(nextResult.context.type).toBe('FIELD_VALUE');
  });

  it('selecting "name:" shows no suggestions (string field, no default hint)', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'nam');
    const nameSugg = step1.suggestions.find(s => s.text === 'name:');
    expect(nameSugg).toBeDefined();

    const { nextResult } = acceptAndGetNext(engine, 'nam', nameSugg!);
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.suggestions).toHaveLength(0);
  });
});

describe('Suggestion chaining — value selection → operator suggestions', () => {
  it('selecting "true" after "is_vip:" suggests operators after space', () => {
    const engine = getEngine();

    // Start with "is_vip:" and get boolean suggestions
    const step1 = getSuggestions(engine, 'is_vip:');
    const trueSugg = step1.suggestions.find(s => s.text === 'true');
    expect(trueSugg).toBeDefined();

    // Accept "true" → "is_vip:true", cursor at 11
    const { newValue, newCursorPos } = acceptAndGetNext(engine, 'is_vip:', trueSugg!);
    expect(newValue).toBe('is_vip:true');
    expect(newCursorPos).toBe(11);

    // After a complete field:value, context at end is still FIELD_VALUE
    const ctx = getContext('is_vip:true', 11);
    expect(ctx.type).toBe('FIELD_VALUE');
  });

  it('after accepting value and pressing space, operator suggestions appear', () => {
    const engine = getEngine();

    // Simulate: "is_vip:true " — user accepted value, then pressed space
    const result = getSuggestions(engine, 'is_vip:true ');
    expect(result.context.type).toBe('OPERATOR');
    expect(result.suggestions.map(s => s.label)).toContain('AND');
    expect(result.suggestions.map(s => s.label)).toContain('OR');
    expect(result.suggestions.map(s => s.label)).toContain('NOT');
  });
});

describe('Suggestion chaining — operator selection → field suggestions', () => {
  it('selecting "AND " after value suggests fields', () => {
    const engine = getEngine();

    // Start with "status:active " — operator context
    const step1 = getSuggestions(engine, 'status:active ');
    const andSugg = step1.suggestions.find(s => s.text === 'AND ');
    expect(andSugg).toBeDefined();

    // Accept "AND " → "status:active AND ", cursor at 18
    const { newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, 'status:active ', andSugg!);
    expect(newValue).toBe('status:active AND ');
    expect(newCursorPos).toBe(18);

    // Should suggest field names
    expect(nextResult.context.type).toBe('FIELD_NAME');
    expect(nextResult.suggestions.length).toBe(FIELDS.length);
  });
});

describe('Suggestion chaining — full query building flow', () => {
  it('builds "is_vip:true AND price:" step by step', () => {
    const engine = getEngine();

    // Step 1: type "is" → select "is_vip:"
    let result = getSuggestions(engine, 'is');
    let sugg = result.suggestions.find(s => s.text === 'is_vip:')!;
    let { newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, 'is', sugg);
    expect(newValue).toBe('is_vip:');

    // Step 2: boolean suggestions appear → select "true"
    sugg = nextResult.suggestions.find(s => s.text === 'true')!;
    expect(sugg).toBeDefined();
    ({ newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, newValue, sugg));
    expect(newValue).toBe('is_vip:true');

    // Step 3: type space, get operator suggestions → select "AND "
    result = getSuggestions(engine, newValue + ' ');
    sugg = result.suggestions.find(s => s.text === 'AND ')!;
    expect(sugg).toBeDefined();
    ({ newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, newValue + ' ', sugg));
    expect(newValue).toBe('is_vip:true AND ');

    // Step 4: field suggestions appear → select "price:"
    sugg = nextResult.suggestions.find(s => s.text === 'price:')!;
    expect(sugg).toBeDefined();
    ({ newValue, newCursorPos, nextResult } = acceptAndGetNext(engine, newValue, sugg));
    expect(newValue).toBe('is_vip:true AND price:');

    // Step 5: number hint appears
    expect(nextResult.context.type).toBe('FIELD_VALUE');
    expect(nextResult.suggestions[0].type).toBe('hint');
    expect(nextResult.suggestions[0].label).toBe('Enter a number');
  });
});

describe('Cursor movement triggers correct context', () => {
  it('moving cursor from value to field shows field context', () => {
    // "status:active" — cursor at 3 (inside "status")
    const ctx = getContext('status:active', 3);
    expect(ctx.type).toBe('FIELD_NAME');
    expect(ctx.partial).toBe('status');
  });

  it('moving cursor to after colon shows value context', () => {
    const ctx = getContext('status:active', 7);
    expect(ctx.type).toBe('FIELD_VALUE');
    expect(ctx.fieldName).toBe('status');
  });

  it('moving cursor to middle of value shows value context', () => {
    const ctx = getContext('status:active', 10);
    expect(ctx.type).toBe('FIELD_VALUE');
    expect(ctx.partial).toBe('active');
  });

  it('moving cursor to space after value shows operator context', () => {
    const ctx = getContext('status:active ', 14);
    expect(ctx.type).toBe('OPERATOR');
  });

  it('moving cursor into second field shows field context', () => {
    const ctx = getContext('status:active AND level:ERROR', 20);
    expect(ctx.type).toBe('FIELD_NAME');
    expect(ctx.partial).toBe('level');
  });

  it('moving cursor into second value shows value context', () => {
    const ctx = getContext('status:active AND level:ERROR', 26);
    expect(ctx.type).toBe('FIELD_VALUE');
    expect(ctx.fieldName).toBe('level');
  });

  it('empty input shows empty context → all field suggestions', () => {
    const engine = getEngine();
    const result = getSuggestions(engine, '');
    expect(result.context.type).toBe('EMPTY');
    expect(result.suggestions.length).toBe(FIELDS.length);
  });

  it('focusing with existing content at position 0 shows field context', () => {
    const ctx = getContext('status:active', 0);
    expect(ctx.type).toBe('FIELD_NAME');
    expect(ctx.partial).toBe('status');
  });
});

describe('Tab vs Enter behavior for field value selection', () => {
  it('Tab on field value at end of input appends trailing space', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'is_vip:');
    const trueSugg = step1.suggestions.find(s => s.text === 'true')!;
    expect(trueSugg).toBeDefined();

    const { newValue, newCursorPos } = acceptWithKey(
      engine, 'is_vip:', trueSugg, 'FIELD_VALUE', 'Tab'
    );
    expect(newValue).toBe('is_vip:true ');
    expect(newCursorPos).toBe(12); // after the space
  });

  it('Tab on field value NOT at end of input does NOT append space', () => {
    const engine = getEngine();
    // "is_vip:tr AND x" — cursor at offset 9 (inside "tr"), FIELD_VALUE context
    const step1 = getSuggestions(engine, 'is_vip:tr AND x', 9);
    const trueSugg = step1.suggestions.find(s => s.text === 'true')!;
    expect(trueSugg).toBeDefined();

    const { newValue } = acceptWithKey(
      engine, 'is_vip:tr AND x', trueSugg, 'FIELD_VALUE', 'Tab'
    );
    expect(newValue).toBe('is_vip:true AND x');
  });

  it('Enter on field value sets shouldSubmit flag', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'is_vip:');
    const trueSugg = step1.suggestions.find(s => s.text === 'true')!;

    const { newValue, shouldSubmit } = acceptWithKey(
      engine, 'is_vip:', trueSugg, 'FIELD_VALUE', 'Enter'
    );
    expect(newValue).toBe('is_vip:true ');
    expect(shouldSubmit).toBe(true);
  });

  it('Enter on field value at end appends trailing space', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'is_vip:');
    const falseSugg = step1.suggestions.find(s => s.text === 'false')!;

    const { newValue } = acceptWithKey(
      engine, 'is_vip:', falseSugg, 'FIELD_VALUE', 'Enter'
    );
    expect(newValue).toBe('is_vip:false ');
  });

  it('Tab on field name does NOT append space', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'sta');
    const statusSugg = step1.suggestions.find(s => s.text === 'status:')!;

    const { newValue, shouldSubmit } = acceptWithKey(
      engine, 'sta', statusSugg, 'FIELD_NAME', 'Tab'
    );
    expect(newValue).toBe('status:');
    expect(shouldSubmit).toBe(false);
  });

  it('Enter on field name does NOT submit', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'sta');
    const statusSugg = step1.suggestions.find(s => s.text === 'status:')!;

    const { shouldSubmit } = acceptWithKey(
      engine, 'sta', statusSugg, 'FIELD_NAME', 'Enter'
    );
    expect(shouldSubmit).toBe(false);
  });

  it('Tab on operator does NOT append space', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'status:active ');
    const andSugg = step1.suggestions.find(s => s.text === 'AND ')!;

    const { newValue, shouldSubmit } = acceptWithKey(
      engine, 'status:active ', andSugg, 'OPERATOR', 'Tab'
    );
    expect(newValue).toBe('status:active AND ');
    expect(shouldSubmit).toBe(false);
  });

  it('Enter on operator does NOT submit', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'status:active ');
    const andSugg = step1.suggestions.find(s => s.text === 'AND ')!;

    const { shouldSubmit } = acceptWithKey(
      engine, 'status:active ', andSugg, 'OPERATOR', 'Enter'
    );
    expect(shouldSubmit).toBe(false);
  });

  it('Tab on boolean value at end appends space', () => {
    const engine = getEngine();
    const step1 = getSuggestions(engine, 'is_vip:');
    const trueSugg = step1.suggestions.find(s => s.text === 'true')!;
    expect(trueSugg).toBeDefined();

    const { newValue } = acceptWithKey(
      engine, 'is_vip:', trueSugg, 'FIELD_VALUE', 'Tab'
    );
    expect(newValue).toBe('is_vip:true ');
  });

  it('Tab on saved search at end appends space', () => {
    const engine = new AutocompleteEngine(
      FIELDS,
      [{ id: '1', name: 'vip-active', query: 'status:active AND is_vip:true' }],
      [], 10
    );
    const result = getSuggestions(engine, '#vip', undefined, ALL_FEATURES);
    expect(result.context.type).toBe('SAVED_SEARCH');
    const sugg = result.suggestions.find(s => s.text === '#vip-active')!;
    expect(sugg).toBeDefined();

    const { newValue } = acceptWithKey(engine, '#vip', sugg, result.context.type, 'Tab', ALL_FEATURES);
    expect(newValue).toBe('#vip-active ');
  });

  it('Tab on history ref at end appends space', () => {
    const engine = new AutocompleteEngine(
      FIELDS, [],
      [{ query: 'level:ERROR', label: 'Errors', timestamp: Date.now() }],
      10
    );
    const result = getSuggestions(engine, '!Err', undefined, ALL_FEATURES);
    expect(result.context.type).toBe('HISTORY_REF');
    const sugg = result.suggestions.find(s => s.text === 'level:ERROR')!;
    expect(sugg).toBeDefined();

    const { newValue } = acceptWithKey(engine, '!Err', sugg, result.context.type, 'Tab', ALL_FEATURES);
    expect(newValue).toBe('level:ERROR ');
  });

  it('Enter on saved search does NOT submit', () => {
    const engine = new AutocompleteEngine(
      FIELDS,
      [{ id: '1', name: 'vip-active', query: 'status:active AND is_vip:true' }],
      [], 10
    );
    const result = getSuggestions(engine, '#vip', undefined, ALL_FEATURES);
    const sugg = result.suggestions.find(s => s.text === '#vip-active')!;

    const { shouldSubmit } = acceptWithKey(engine, '#vip', sugg, result.context.type, 'Enter', ALL_FEATURES);
    expect(shouldSubmit).toBe(false);
  });

  it('full flow: Tab-accept values appends spaces for easy chaining', () => {
    const engine = getEngine();

    // Step 1: select "is_vip:" via Tab (field name — no trailing space)
    let result = getSuggestions(engine, 'is');
    let sugg = result.suggestions.find(s => s.text === 'is_vip:')!;
    let { newValue } = acceptWithKey(engine, 'is', sugg, result.context.type, 'Tab');
    expect(newValue).toBe('is_vip:');

    // Step 2: select "true" via Tab (field value at end — trailing space)
    result = getSuggestions(engine, newValue);
    sugg = result.suggestions.find(s => s.text === 'true')!;
    ({ newValue } = acceptWithKey(engine, newValue, sugg, result.context.type, 'Tab'));
    expect(newValue).toBe('is_vip:true ');

    // Step 3: select "AND " via Tab (operator — no extra space, already has one)
    result = getSuggestions(engine, newValue);
    sugg = result.suggestions.find(s => s.text === 'AND ')!;
    ({ newValue } = acceptWithKey(engine, newValue, sugg, result.context.type, 'Tab'));
    expect(newValue).toBe('is_vip:true AND ');

    // Step 4: select "price:" via Tab (field name — no trailing space)
    result = getSuggestions(engine, newValue);
    sugg = result.suggestions.find(s => s.text === 'price:')!;
    ({ newValue } = acceptWithKey(engine, newValue, sugg, result.context.type, 'Tab'));
    expect(newValue).toBe('is_vip:true AND price:');

    // Step 5: number hint appears — verify context
    result = getSuggestions(engine, newValue);
    expect(result.suggestions[0].type).toBe('hint');
    expect(result.suggestions[0].label).toBe('Enter a number');
  });
});

describe('Hint suggestions in freeform fields', () => {
  it('number field returns a hint suggestion with empty text', () => {
    const engine = getEngine();
    const result = getSuggestions(engine, 'price:42');
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.fieldName).toBe('price');
    // Freeform fields with a default hint produce a non-selectable hint
    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].type).toBe('hint');
    expect(result.suggestions[0].text).toBe('');
  });

  it('string field returns no suggestions (no default hint)', () => {
    const engine = getEngine();
    const result = getSuggestions(engine, 'name:something');
    expect(result.context.type).toBe('FIELD_VALUE');
    expect(result.context.fieldName).toBe('name');
    expect(result.suggestions).toHaveLength(0);
  });

  it('Tab on a hint should "exit" the field — trailing space confirms the value', () => {
    // Simulates the ElasticInput keydown handler behavior:
    // When Tab/Enter hits a non-interactive hint, close dropdown and add trailing space.
    const engine = getEngine();
    const input = 'price:42';
    const result = getSuggestions(engine, input);
    expect(result.suggestions[0].type).toBe('hint');

    // The hint has empty text — accepting it via the normal path would delete
    // the value. Instead, the component adds a trailing space at cursor offset.
    const cursorOffset = input.length;
    const newValue = input.slice(0, cursorOffset) + ' ' + input.slice(cursorOffset);
    const newCursorPos = cursorOffset + 1;

    expect(newValue).toBe('price:42 ');
    expect(newCursorPos).toBe(9);

    // After exiting, cursor is past the space — context should change
    const next = getSuggestions(engine, newValue, newCursorPos);
    expect(next.context.type).not.toBe('FIELD_VALUE');
  });

  it('Enter on a hint should also add trailing space before submitting', () => {
    // Both Tab and Enter on a non-interactive hint add a trailing space.
    // Enter additionally triggers onSearch. The value passed to onSearch
    // must include the trailing space so the submitted query is well-formed.
    const engine = getEngine();
    const input = 'price:99';
    const result = getSuggestions(engine, input);
    expect(result.suggestions[0].type).toBe('hint');

    const cursorOffset = input.length;
    const newValue = input.slice(0, cursorOffset) + ' ' + input.slice(cursorOffset);

    expect(newValue).toBe('price:99 ');

    // After adding the space, context moves out of FIELD_VALUE
    const next = getSuggestions(engine, newValue, cursorOffset + 1);
    expect(next.context.type).not.toBe('FIELD_VALUE');
  });
});
