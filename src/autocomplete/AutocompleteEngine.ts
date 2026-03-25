import { Token } from '../lexer/tokens';
import { Lexer } from '../lexer/Lexer';
import { Parser, CursorContext } from '../parser/Parser';
import { FieldConfig, SavedSearch, HistoryEntry, SuggestionItem } from '../types';
import { Suggestion } from './suggestionTypes';
import { BOOLEAN_OPERATORS, DEFAULT_MAX_SUGGESTIONS } from '../constants';
import { getReplacementRange } from '../utils/textUtils';

export interface AutocompleteResult {
  suggestions: Suggestion[];
  showDatePicker: boolean;
  dateFieldName?: string;
  context: CursorContext;
}

export interface AutocompleteOptions {
  showSavedSearchHint?: boolean;
  showHistoryHint?: boolean;
  /** Set to true when a savedSearches callback is provided (for hints even when no sync data). */
  hasSavedSearchProvider?: boolean;
  /** Set to true when a searchHistory callback is provided (for hints even when no sync data). */
  hasHistoryProvider?: boolean;
}

export class AutocompleteEngine {
  private fields: FieldConfig[];
  private fieldMap: Map<string, FieldConfig>;
  private savedSearches: SavedSearch[];
  private searchHistory: HistoryEntry[];
  private maxSuggestions: number;
  private options: AutocompleteOptions;

  constructor(
    fields: FieldConfig[],
    savedSearches: SavedSearch[] = [],
    searchHistory: HistoryEntry[] = [],
    maxSuggestions: number = DEFAULT_MAX_SUGGESTIONS,
    options: AutocompleteOptions = {},
  ) {
    this.fields = fields;
    this.fieldMap = new Map(fields.map(f => [f.name, f]));
    for (const f of fields) {
      if (f.aliases) {
        for (const alias of f.aliases) {
          this.fieldMap.set(alias, f);
        }
      }
    }
    this.savedSearches = savedSearches;
    this.searchHistory = searchHistory;
    this.maxSuggestions = maxSuggestions;
    this.options = {
      showSavedSearchHint: options.showSavedSearchHint ?? false,
      showHistoryHint: options.showHistoryHint ?? false,
    };
  }

  /** Resolve a field name (or alias) to its FieldConfig. */
  resolveField(fieldName: string): FieldConfig | undefined {
    return this.fieldMap.get(fieldName);
  }

  updateSavedSearches(searches: SavedSearch[]): void {
    this.savedSearches = searches;
  }

  updateSearchHistory(history: HistoryEntry[]): void {
    this.searchHistory = history;
  }

  getSuggestions(tokens: Token[], cursorOffset: number): AutocompleteResult {
    const context = Parser.getCursorContext(tokens, cursorOffset);
    const range = getReplacementRange(context.token, cursorOffset, tokens);

    switch (context.type) {
      case 'FIELD_NAME':
      case 'EMPTY': {
        const fieldSuggs = this.getFieldSuggestions(context.partial, range.start, range.end);
        const hints = !context.partial && fieldSuggs.length > 0 ? this.getSpecialHints(range.start, range.end) : [];
        return {
          suggestions: this.sortByPriority([...fieldSuggs, ...hints]),
          showDatePicker: false,
          context,
        };
      }

      case 'FIELD_VALUE': {
        const field = context.fieldName ? this.resolveField(context.fieldName) : undefined;
        if (field?.type === 'date') {
          return {
            suggestions: [],
            showDatePicker: true,
            dateFieldName: field.name,
            context,
          };
        }
        return {
          suggestions: this.getValueSuggestions(field, context.partial, range.start, range.end),
          showDatePicker: false,
          context,
        };
      }

      case 'OPERATOR': {
        const opSuggs = this.getOperatorSuggestions(context.partial, range.start, range.end);
        const fields = this.getFieldSuggestions('', range.start, range.end);
        const hints = this.getSpecialHints(range.start, range.end);
        return {
          suggestions: this.sortByPriority([...opSuggs, ...fields, ...hints]),
          showDatePicker: false,
          context,
        };
      }

      case 'SAVED_SEARCH':
        return {
          suggestions: this.getSavedSearchSuggestions(context.partial, range.start, range.end),
          showDatePicker: false,
          context,
        };

      case 'HISTORY_REF':
        return {
          suggestions: this.getHistorySuggestions(context.partial, range.start, range.end),
          showDatePicker: false,
          context,
        };

      case 'RANGE': {
        const field = context.fieldName ? this.resolveField(context.fieldName) : undefined;
        if (field?.type === 'date') {
          return { suggestions: [], showDatePicker: true, dateFieldName: field.name, context };
        }
        return { suggestions: [], showDatePicker: false, context };
      }

      default:
        return { suggestions: [], showDatePicker: false, context };
    }
  }

  private getFieldSuggestions(partial: string, start: number, end: number): Suggestion[] {
    const lower = partial.toLowerCase();
    const scored = this.fields
      .map(f => {
        const name = f.name.toLowerCase();
        const label = (f.label || '').toLowerCase();
        const aliasNames = (f.aliases || []).map(a => a.toLowerCase());
        // Prioritize: startsWith name > startsWith label/alias > includes name > includes label/alias
        let score = 0;
        if (name.startsWith(lower)) score = 4;
        else if (label.startsWith(lower)) score = 3;
        else if (aliasNames.some(a => a.startsWith(lower))) score = 3;
        else if (name.includes(lower)) score = 2;
        else if (label.includes(lower)) score = 1;
        else if (aliasNames.some(a => a.includes(lower))) score = 1;
        return { field: f, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxSuggestions);

    return scored.map(s => ({
      text: s.field.name + ':',
      label: s.field.label || s.field.name,
      description: s.field.description,
      type: s.field.type,
      replaceStart: start,
      replaceEnd: end,
      matchPartial: partial,
      priority: 10,
    }));
  }

  private getValueSuggestions(
    field: FieldConfig | undefined,
    partial: string,
    start: number,
    end: number
  ): Suggestion[] {
    if (!field) return [];

    if (field.type === 'boolean') {
      return ['true', 'false']
        .filter(v => v.startsWith(partial.toLowerCase()))
        .map(v => ({
          text: v,
          label: v,
          type: 'boolean',
          replaceStart: start,
          replaceEnd: end,
          matchPartial: partial,
        }));
    }

    // Freeform hint — shown while typing for fields without a fetchSuggestions callback.
    // Suppressed if field.placeholder is explicitly false.
    if (field.placeholder !== false) {
      const defaultHints: Record<string, string> = {
        number: 'Enter a number',
        ip: 'Enter an IP address',
      };
      const hintText = field.placeholder || defaultHints[field.type];
      if (hintText) {
        return [{
          text: '',
          label: hintText,
          type: 'hint',
          replaceStart: start,
          replaceEnd: end,
        }];
      }
    }

    return [];
  }

  private getOperatorSuggestions(partial: string, start: number, end: number): Suggestion[] {
    const lower = partial.toLowerCase();
    return BOOLEAN_OPERATORS
      .filter(op => op.toLowerCase().startsWith(lower))
      .map(op => ({
        text: op + ' ',
        label: op,
        description: op === 'AND' ? 'Both conditions must match' :
          op === 'OR' ? 'Either condition must match' :
            'Negate the following condition',
        type: 'operator',
        replaceStart: start,
        replaceEnd: end,
        matchPartial: partial,
        priority: 30,
      }));
  }

  private sortByPriority(suggestions: Suggestion[]): Suggestion[] {
    return suggestions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  private getSpecialHints(start: number, end: number): Suggestion[] {
    const hints: Suggestion[] = [];
    const hasSavedSearches = this.savedSearches.length > 0 || this.options.hasSavedSearchProvider;
    const hasHistory = this.searchHistory.length > 0 || this.options.hasHistoryProvider;
    if (this.options.showSavedSearchHint && hasSavedSearches) {
      hints.push({
        text: '#',
        label: '#saved-search',
        description: 'Type # to use a saved search',
        type: 'hint',
        replaceStart: start,
        replaceEnd: end,
        priority: 20,
      });
    }
    if (this.options.showHistoryHint && hasHistory) {
      hints.push({
        text: '!',
        label: '!history',
        description: 'Type ! to search history',
        type: 'hint',
        replaceStart: start,
        replaceEnd: end,
        priority: 20,
      });
    }
    return hints;
  }

  private getSavedSearchSuggestions(partial: string, start: number, end: number): Suggestion[] {
    return this.savedSearches
      .slice(0, this.maxSuggestions)
      .map(s => ({
        text: '#' + s.name,
        label: s.name,
        description: s.description || s.query,
        type: 'savedSearch',
        replaceStart: start,
        replaceEnd: end,
        matchPartial: partial,
        sourceData: s,
      }));
  }

  private getHistorySuggestions(partial: string, start: number, end: number): Suggestion[] {
    return this.searchHistory
      .slice(0, this.maxSuggestions)
      .map(h => ({
        text: AutocompleteEngine.wrapHistoryQuery(h.query),
        label: h.label || h.query,
        description: h.description,
        type: 'history',
        replaceStart: start,
        replaceEnd: end,
        matchPartial: partial,
        sourceData: h,
      }));
  }

  /**
   * Wraps a history query in parens if the top-level AST node is a BooleanExpr
   * (explicit AND/OR or implicit adjacency). Already-grouped expressions
   * like -(a AND b) or (a OR b)^2 don't need extra wrapping.
   */
  static wrapHistoryQuery(query: string): string {
    try {
      const tokens = new Lexer(query).tokenize();
      const ast = new Parser(tokens).parse();
      if (ast && ast.type === 'BooleanExpr') {
        return '(' + query + ')';
      }
    } catch {
      // Parse failure — leave as-is
    }
    return query;
  }
}
