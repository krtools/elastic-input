import { describe, it, expect } from 'vitest';
import { Lexer } from '../lexer/Lexer';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { FieldConfig, SavedSearch, HistoryEntry } from '../types';

const FIELDS: FieldConfig[] = [
  { name: 'status', label: 'Status', type: 'enum', suggestions: ['active', 'inactive', 'pending'] },
  { name: 'level', label: 'Log Level', type: 'enum', suggestions: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] },
  { name: 'name', label: 'Contact Name', type: 'string' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'created', label: 'Created Date', type: 'date' },
  { name: 'last_contact', label: 'Last Contact', type: 'date' },
  { name: 'is_vip', label: 'VIP', type: 'boolean' },
  { name: 'ip', label: 'Client IP', type: 'ip' },
  { name: 'added_date', label: 'Added Date', type: 'date' },
];

const SAVED_SEARCHES: SavedSearch[] = [
  { id: '1', name: 'vip-active', query: 'status:active AND is_vip:true', description: 'Active VIPs' },
  { id: '2', name: 'high-value', query: 'price:>10000', description: 'Expensive items' },
  { id: '3', name: 'recent-errors', query: 'level:ERROR', description: 'Recent errors' },
];

const HISTORY: HistoryEntry[] = [
  { query: 'status:active AND price:>5000', label: 'Active expensive', timestamp: Date.now() },
  { query: 'level:ERROR AND service:api', label: 'API errors', timestamp: Date.now() },
];

function getSuggestions(input: string, cursorOffset?: number) {
  const engine = new AutocompleteEngine(FIELDS, SAVED_SEARCHES, HISTORY, 10);
  const tokens = new Lexer(input).tokenize();
  return engine.getSuggestions(tokens, cursorOffset ?? input.length);
}

function suggestionLabels(input: string, cursorOffset?: number): string[] {
  return getSuggestions(input, cursorOffset).suggestions.map(s => s.label);
}

function suggestionTexts(input: string, cursorOffset?: number): string[] {
  return getSuggestions(input, cursorOffset).suggestions.map(s => s.text);
}

describe('AutocompleteEngine', () => {
  describe('field name suggestions', () => {
    it('suggests all fields on empty input', () => {
      const result = getSuggestions('');
      const fieldSuggs = result.suggestions.filter(s => s.type !== 'hint');
      const labels = fieldSuggs.map(s => s.label);
      expect(labels).toContain('Status');
      expect(labels).toContain('Log Level');
      expect(labels).toContain('Contact Name');
      expect(labels.length).toBe(FIELDS.length);
    });

    it('filters fields by prefix (startsWith name)', () => {
      const labels = suggestionLabels('st');
      expect(labels).toContain('Status');
      expect(labels).not.toContain('Log Level');
    });

    it('filters fields by prefix (startsWith label)', () => {
      const labels = suggestionLabels('Con');
      expect(labels).toContain('Contact Name');
    });

    it('matches fields by includes (name contains)', () => {
      const labels = suggestionLabels('tat');
      expect(labels).toContain('Status'); // "status" contains "tat"
    });

    it('matches fields by includes (label contains)', () => {
      const labels = suggestionLabels('Dat');
      expect(labels).toContain('Created Date');  // label contains "Dat"
      expect(labels).toContain('Added Date');    // label contains "Dat"
      expect(labels).not.toContain('Last Contact'); // "Last Contact" does not contain "Dat"
    });

    it('ranks startsWith higher than includes', () => {
      // "is" starts with "is_vip" name, but also is included in other labels
      const result = getSuggestions('is');
      const fieldSuggs = result.suggestions.filter(s => s.type !== 'hint');
      expect(fieldSuggs[0].label).toBe('VIP'); // is_vip starts with "is"
    });

    it('appends colon to field suggestion text', () => {
      const texts = suggestionTexts('st');
      expect(texts).toContain('status:');
    });

    it('suggests fields after AND', () => {
      const result = getSuggestions('status:active AND ');
      const fieldSuggs = result.suggestions.filter(s => s.type !== 'hint');
      expect(fieldSuggs.length).toBe(FIELDS.length);
    });

    it('suggests fields while typing after AND', () => {
      const labels = suggestionLabels('status:active AND lev');
      expect(labels).toContain('Log Level');
    });

    it('suggests fields inside parens', () => {
      const labels = suggestionLabels('(st');
      expect(labels).toContain('Status');
    });

    it('suggests fields after prefix operator -', () => {
      const labels = suggestionLabels('-st');
      expect(labels).toContain('Status');
    });

    it('suggests fields after prefix operator +', () => {
      const labels = suggestionLabels('+st');
      expect(labels).toContain('Status');
    });

    it('includes matchPartial in suggestions', () => {
      const result = getSuggestions('sta');
      const fieldSuggs = result.suggestions.filter(s => s.type !== 'hint');
      expect(fieldSuggs[0].matchPartial).toBe('sta');
    });
  });

  describe('field value suggestions (enum)', () => {
    it('suggests all enum values after colon', () => {
      const labels = suggestionLabels('status:');
      expect(labels).toEqual(['active', 'inactive', 'pending']);
    });

    it('filters enum values by prefix', () => {
      const labels = suggestionLabels('status:act');
      expect(labels).toContain('active');
      expect(labels).toContain('inactive'); // "inactive" includes "act"
      expect(labels).not.toContain('pending');
    });

    it('filters enum values by includes', () => {
      const labels = suggestionLabels('status:tiv');
      expect(labels).toContain('active'); // contains "tiv"
      expect(labels).toContain('inactive'); // contains "tiv"
      expect(labels).not.toContain('pending');
    });

    it('suggests enum values inside parens', () => {
      const labels = suggestionLabels('(status:act');
      expect(labels).toContain('active');
    });

    it('suggests values for -field:partial', () => {
      const labels = suggestionLabels('-status:act');
      expect(labels).toContain('active');
    });

    it('suggests values for second field in query', () => {
      const labels = suggestionLabels('status:active AND level:ER');
      expect(labels).toContain('ERROR');
    });
  });

  describe('field value suggestions (boolean)', () => {
    it('suggests true/false for boolean fields', () => {
      const labels = suggestionLabels('is_vip:');
      expect(labels).toContain('true');
      expect(labels).toContain('false');
    });

    it('filters boolean values by prefix', () => {
      const labels = suggestionLabels('is_vip:tr');
      expect(labels).toContain('true');
      expect(labels).not.toContain('false');
    });
  });

  describe('field value suggestions (freeform)', () => {
    it('shows hint for string field with no suggestions', () => {
      const result = getSuggestions('name:');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('hint');
      expect(result.suggestions[0].label).toBe('Type to search...');
    });

    it('shows hint for number field', () => {
      const result = getSuggestions('price:');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('hint');
      expect(result.suggestions[0].label).toBe('Enter a number');
    });

    it('shows hint for IP field', () => {
      const result = getSuggestions('ip:');
      expect(result.suggestions[0].label).toBe('Enter an IP address');
    });

    it('keeps hint visible while typing in string field', () => {
      const result = getSuggestions('name:john');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('hint');
      expect(result.suggestions[0].label).toBe('Type to search...');
    });

    it('keeps hint visible while typing in number field', () => {
      const result = getSuggestions('price:1');
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].type).toBe('hint');
      expect(result.suggestions[0].label).toBe('Enter a number');
    });

    it('uses custom placeholder from field config', () => {
      const fields: FieldConfig[] = [
        { name: 'company', type: 'string', placeholder: 'Search companies...' },
      ];
      const engine = new AutocompleteEngine(fields, [], [], 10);
      const tokens = new Lexer('company:').tokenize();
      const result = engine.getSuggestions(tokens, 8);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].label).toBe('Search companies...');
    });

    it('custom placeholder stays visible while typing', () => {
      const fields: FieldConfig[] = [
        { name: 'company', type: 'string', placeholder: 'Search companies...' },
      ];
      const engine = new AutocompleteEngine(fields, [], [], 10);
      const tokens = new Lexer('company:ac').tokenize();
      const result = engine.getSuggestions(tokens, 10);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0].label).toBe('Search companies...');
    });

    it('suppresses hint when placeholder is false', () => {
      const fields: FieldConfig[] = [
        { name: 'code', type: 'string', placeholder: false },
      ];
      const engine = new AutocompleteEngine(fields, [], [], 10);
      const tokens = new Lexer('code:').tokenize();
      const result = engine.getSuggestions(tokens, 5);
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('date field handling', () => {
    it('shows date picker for date field', () => {
      const result = getSuggestions('created:');
      expect(result.showDatePicker).toBe(true);
      expect(result.suggestions).toHaveLength(0);
    });

    it('shows date picker for another date field', () => {
      const result = getSuggestions('last_contact:');
      expect(result.showDatePicker).toBe(true);
    });

    it('shows date picker for date field with comparison', () => {
      const result = getSuggestions('created:>');
      expect(result.showDatePicker).toBe(true);
    });
  });

  describe('operator suggestions', () => {
    it('suggests operators after a complete value', () => {
      const labels = suggestionLabels('status:active ');
      expect(labels).toContain('AND');
      expect(labels).toContain('OR');
      expect(labels).toContain('NOT');
    });

    it('suggests operators after closing paren', () => {
      const labels = suggestionLabels('(a OR b) ');
      expect(labels).toContain('AND');
      expect(labels).toContain('OR');
    });

    it('also suggests fields in operator context (implicit AND)', () => {
      const result = getSuggestions('status:active ');
      const fieldSuggs = result.suggestions.filter(s => s.text.endsWith(':'));
      expect(fieldSuggs.length).toBe(FIELDS.length);
      expect(fieldSuggs.map(s => s.label)).toContain('Status');
      expect(fieldSuggs.map(s => s.label)).toContain('Log Level');
    });

    it('suggests fields after closing paren with space', () => {
      const result = getSuggestions('(a OR b) ');
      const fieldSuggs = result.suggestions.filter(s => s.text.endsWith(':'));
      expect(fieldSuggs.length).toBe(FIELDS.length);
    });
  });

  describe('saved search suggestions', () => {
    it('suggests saved searches for #', () => {
      const labels = suggestionLabels('#');
      expect(labels).toContain('vip-active');
      expect(labels).toContain('high-value');
      expect(labels).toContain('recent-errors');
    });

    it('filters saved searches by prefix', () => {
      const labels = suggestionLabels('#vip');
      expect(labels).toContain('vip-active');
      expect(labels).not.toContain('high-value');
    });

    it('includes # in suggestion text', () => {
      const texts = suggestionTexts('#vip');
      expect(texts).toContain('#vip-active');
    });

    it('includes description', () => {
      const result = getSuggestions('#vip');
      expect(result.suggestions[0].description).toBe('Active VIPs');
    });
  });

  describe('history suggestions', () => {
    it('suggests history for !', () => {
      const labels = suggestionLabels('!');
      expect(labels).toContain('Active expensive');
      expect(labels).toContain('API errors');
    });

    it('filters history by partial (includes)', () => {
      const labels = suggestionLabels('!API');
      expect(labels).toContain('API errors');
      expect(labels).not.toContain('Active expensive');
    });

    it('wraps history with boolean ops in parens', () => {
      const texts = suggestionTexts('!');
      const activeExpensive = texts.find(t => t.includes('status:active'));
      expect(activeExpensive).toBe('(status:active AND price:>5000)');
    });

    it('does not wrap simple history in parens', () => {
      const engine = new AutocompleteEngine(FIELDS, [], [
        { query: 'simple-query', label: 'simple' },
      ]);
      const tokens = new Lexer('!').tokenize();
      const result = engine.getSuggestions(tokens, 1);
      expect(result.suggestions[0].text).toBe('simple-query');
    });
  });

  describe('replacement ranges', () => {
    it('sets correct replacement range for field name', () => {
      const result = getSuggestions('sta');
      const suggestion = result.suggestions[0];
      expect(suggestion.replaceStart).toBe(0);
      expect(suggestion.replaceEnd).toBe(3);
    });

    it('sets correct replacement range for value', () => {
      const result = getSuggestions('status:act');
      const suggestion = result.suggestions[0];
      expect(suggestion.replaceStart).toBe(7);
      expect(suggestion.replaceEnd).toBe(10);
    });

    it('sets correct replacement range for saved search', () => {
      const result = getSuggestions('#vip');
      const suggestion = result.suggestions[0];
      expect(suggestion.replaceStart).toBe(0);
      expect(suggestion.replaceEnd).toBe(4);
    });

    it('sets correct replacement range for history ref', () => {
      const result = getSuggestions('!API');
      const suggestion = result.suggestions[0];
      expect(suggestion.replaceStart).toBe(0);
      expect(suggestion.replaceEnd).toBe(4);
    });
  });

  describe('bare quoted phrases (no field suggestions)', () => {
    it('typing a bare double-quote shows no suggestions', () => {
      const result = getSuggestions('"');
      expect(result.suggestions).toHaveLength(0);
    });

    it('typing an unclosed quoted phrase shows no suggestions', () => {
      const result = getSuggestions('"hello');
      expect(result.suggestions).toHaveLength(0);
    });

    it('typing a closed quoted phrase shows no suggestions', () => {
      const result = getSuggestions('"hello world"');
      expect(result.suggestions).toHaveLength(0);
    });

    it('quote after a field:value pair shows no field suggestions', () => {
      const result = getSuggestions('status:active "');
      expect(result.suggestions).toHaveLength(0);
    });

    it('unclosed quote after field:value shows no suggestions', () => {
      const result = getSuggestions('status:active "foo');
      expect(result.suggestions).toHaveLength(0);
    });

    it('quoted value AFTER colon still shows field value suggestions', () => {
      const result = getSuggestions('status:"act');
      expect(result.context.type).toBe('FIELD_VALUE');
      expect(result.context.fieldName).toBe('status');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.map(s => s.text)).toContain('active');
    });

    it('bare single-quote is treated as regular text (no field match)', () => {
      const result = getSuggestions("'");
      // Single quote is not a quote delimiter — it's a regular character
      // No field name matches "'" so no suggestions
      expect(result.suggestions).toHaveLength(0);
    });

    it('single-quoted phrase is treated as regular text', () => {
      // Without quote-delimiter behavior, "'hello" and "world'" are just bare terms
      const result = getSuggestions("'hello world'");
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('special hints (#saved-search, !history)', () => {
    it('shows #saved-search hint on empty input when saved searches exist', () => {
      const result = getSuggestions('');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).toContain('#');
      expect(hints.find(s => s.text === '#')!.label).toBe('#saved-search');
    });

    it('shows !history hint on empty input when history exists', () => {
      const result = getSuggestions('');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).toContain('!');
      expect(hints.find(s => s.text === '!')!.label).toBe('!history');
    });

    it('shows hints in operator context', () => {
      const result = getSuggestions('status:active ');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).toContain('#');
      expect(hints.map(s => s.text)).toContain('!');
    });

    it('shows hints in field name context after AND', () => {
      const result = getSuggestions('status:active AND ');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).toContain('#');
      expect(hints.map(s => s.text)).toContain('!');
    });

    it('does not show hints when no saved searches or history exist', () => {
      const engine = new AutocompleteEngine(FIELDS, [], [], 10);
      const tokens = new Lexer('').tokenize();
      const result = engine.getSuggestions(tokens, 0);
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints).toHaveLength(0);
    });

    it('does not show #hint when showSavedSearchHint is false', () => {
      const engine = new AutocompleteEngine(FIELDS, SAVED_SEARCHES, HISTORY, 10, {
        showSavedSearchHint: false,
      });
      const tokens = new Lexer('').tokenize();
      const result = engine.getSuggestions(tokens, 0);
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).not.toContain('#');
      expect(hints.map(s => s.text)).toContain('!');
    });

    it('does not show !hint when showHistoryHint is false', () => {
      const engine = new AutocompleteEngine(FIELDS, SAVED_SEARCHES, HISTORY, 10, {
        showHistoryHint: false,
      });
      const tokens = new Lexer('').tokenize();
      const result = engine.getSuggestions(tokens, 0);
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.map(s => s.text)).toContain('#');
      expect(hints.map(s => s.text)).not.toContain('!');
    });

    it('does not show hints when both are disabled', () => {
      const engine = new AutocompleteEngine(FIELDS, SAVED_SEARCHES, HISTORY, 10, {
        showSavedSearchHint: false,
        showHistoryHint: false,
      });
      const tokens = new Lexer('').tokenize();
      const result = engine.getSuggestions(tokens, 0);
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints).toHaveLength(0);
    });

    it('does not show hints in field value context', () => {
      const result = getSuggestions('status:');
      const hints = result.suggestions.filter(s => s.type === 'hint' && (s.text === '#' || s.text === '!'));
      expect(hints).toHaveLength(0);
    });
  });

  describe('suggestion ordering by priority', () => {
    it('hints appear before fields on empty input', () => {
      const result = getSuggestions('');
      const types = result.suggestions.map(s => s.type);
      const firstHintIdx = types.indexOf('hint');
      const firstFieldIdx = types.findIndex(t => t !== 'hint');
      expect(firstHintIdx).toBeLessThan(firstFieldIdx);
    });

    it('no hints when user has started typing a partial', () => {
      // "is" matches is_vip and some labels; but hints should NOT appear
      // because the user has started typing (partial is non-empty)
      const result = getSuggestions('is');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      const fields = result.suggestions.filter(s => s.type !== 'hint');
      expect(hints.length).toBe(0);
      expect(fields.length).toBeGreaterThan(0);
    });

    it('no hints when typing partial after AND', () => {
      const result = getSuggestions('status:active AND st');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.length).toBe(0);
    });

    it('hints appear after AND with no partial', () => {
      const result = getSuggestions('status:active AND ');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.length).toBeGreaterThan(0);
    });

    it('in operator context: operators first, then hints, then fields', () => {
      const result = getSuggestions('status:active ');
      const suggs = result.suggestions;

      // Find index ranges for each category
      const operatorIdxs = suggs.map((s, i) => s.type === 'operator' ? i : -1).filter(i => i >= 0);
      const hintIdxs = suggs.map((s, i) => s.type === 'hint' ? i : -1).filter(i => i >= 0);
      const fieldIdxs = suggs.map((s, i) => s.type !== 'operator' && s.type !== 'hint' ? i : -1).filter(i => i >= 0);

      expect(operatorIdxs.length).toBeGreaterThan(0);
      expect(hintIdxs.length).toBeGreaterThan(0);
      expect(fieldIdxs.length).toBeGreaterThan(0);

      // All operators before all hints
      expect(Math.max(...operatorIdxs)).toBeLessThan(Math.min(...hintIdxs));
      // All hints before all fields
      expect(Math.max(...hintIdxs)).toBeLessThan(Math.min(...fieldIdxs));
    });

    it('suggestions have correct priority values', () => {
      const result = getSuggestions('status:active ');
      const opSugg = result.suggestions.find(s => s.type === 'operator');
      const hintSugg = result.suggestions.find(s => s.type === 'hint');
      const fieldSugg = result.suggestions.find(s => s.text.endsWith(':'));

      expect(opSugg!.priority).toBe(30);
      expect(hintSugg!.priority).toBe(20);
      expect(fieldSugg!.priority).toBe(10);
    });
  });

  describe('asyncSearch flag', () => {
    const mixedFields: FieldConfig[] = [
      { name: 'status', type: 'enum', suggestions: ['active', 'inactive', 'pending'] },
      { name: 'company', type: 'string', asyncSearch: true, placeholder: 'Search companies...' },
      { name: 'email', type: 'string' },
      { name: 'brand', type: 'string', asyncSearch: true },
    ];

    function getAsyncSuggs(input: string, cursorOffset?: number) {
      const tokens = new Lexer(input).tokenize();
      const engine = new AutocompleteEngine(mixedFields);
      return engine.getSuggestions(tokens, cursorOffset ?? input.length);
    }

    it('enum field without asyncSearch shows static suggestions', () => {
      const result = getAsyncSuggs('status:');
      const values = result.suggestions.filter(s => s.type !== 'hint');
      expect(values.map(s => s.text)).toEqual(expect.arrayContaining(['active', 'inactive', 'pending']));
    });

    it('enum field without asyncSearch shows filtered suggestions', () => {
      const result = getAsyncSuggs('status:act');
      const values = result.suggestions.filter(s => s.type !== 'hint');
      expect(values.some(s => s.text === 'active')).toBe(true);
      expect(values.some(s => s.text === 'pending')).toBe(false);
    });

    it('asyncSearch field does not show static suggestions', () => {
      const result = getAsyncSuggs('company:');
      // Should only have the hint, no static value suggestions
      const values = result.suggestions.filter(s => s.type !== 'hint');
      expect(values).toHaveLength(0);
    });

    it('non-async string field shows freeform hint', () => {
      const result = getAsyncSuggs('email:');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].label).toBe('Type to search...');
    });

    it('asyncSearch string field shows placeholder hint', () => {
      const result = getAsyncSuggs('company:');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].label).toBe('Search companies...');
    });

    it('asyncSearch field without placeholder shows default hint', () => {
      const result = getAsyncSuggs('brand:');
      const hints = result.suggestions.filter(s => s.type === 'hint');
      expect(hints.length).toBeGreaterThan(0);
      expect(hints[0].label).toBe('Type to search...');
    });
  });

  describe('field aliases', () => {
    const aliasedFields: FieldConfig[] = [
      { name: 'name', type: 'string', label: 'Contact Name', aliases: ['contact_name', 'full_name'] },
      { name: 'status', type: 'enum', suggestions: ['active', 'inactive'], aliases: ['state'] },
      { name: 'price', type: 'number' },
    ];

    function getSuggs(input: string, cursorOffset?: number) {
      const tokens = new Lexer(input).tokenize();
      const engine = new AutocompleteEngine(aliasedFields);
      return engine.getSuggestions(tokens, cursorOffset ?? input.length);
    }

    it('matches field by alias in autocomplete', () => {
      const result = getSuggs('contact_');
      const fieldSuggs = result.suggestions.filter(s => s.text.endsWith(':'));
      expect(fieldSuggs.some(s => s.text === 'name:')).toBe(true);
    });

    it('matches partial alias with startsWith scoring', () => {
      const result = getSuggs('full_');
      const fieldSuggs = result.suggestions.filter(s => s.text.endsWith(':'));
      expect(fieldSuggs.some(s => s.text === 'name:')).toBe(true);
    });

    it('resolves alias for value suggestions', () => {
      const result = getSuggs('state:');
      // Should resolve to status field and show enum values
      expect(result.suggestions.some(s => s.text === 'active')).toBe(true);
      expect(result.suggestions.some(s => s.text === 'inactive')).toBe(true);
    });

    it('resolveField returns canonical config for alias', () => {
      const engine = new AutocompleteEngine(aliasedFields);
      const resolved = engine.resolveField('contact_name');
      expect(resolved).toBeDefined();
      expect(resolved!.name).toBe('name');
    });

    it('resolveField returns undefined for unknown name', () => {
      const engine = new AutocompleteEngine(aliasedFields);
      expect(engine.resolveField('unknown')).toBeUndefined();
    });
  });
});
