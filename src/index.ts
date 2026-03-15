// ---------------------------------------------------------------------------
// ElasticInput — Elasticsearch query_string syntax input component
// ---------------------------------------------------------------------------

// Core component
export { ElasticInput } from './components/ElasticInput';

// Internal building blocks (for advanced usage / custom integrations)
export { Lexer } from './lexer/Lexer';
export { Parser } from './parser/Parser';
export { Validator } from './validation/Validator';
export { AutocompleteEngine } from './autocomplete/AutocompleteEngine';
export type { AutocompleteOptions } from './autocomplete/AutocompleteEngine';

// Color and style presets
export { DEFAULT_COLORS, DARK_COLORS, DEFAULT_STYLES, DARK_STYLES } from './constants';

// Public types — props, config, and data structures
export type {
  ElasticInputProps,
  ElasticInputAPI,
  FieldConfig,
  FieldsSource,
  FieldType,
  SavedSearch,
  HistoryEntry,
  SuggestionItem,
  ColorConfig,
  StyleConfig,
  ValidateValueContext,
  ValidationResult,
  ValidateReturn,
} from './types';

// Low-level types — tokens, AST, and internal structures
export type { Token, TokenType } from './lexer/tokens';
export type { ASTNode } from './parser/ast';
export type { CursorContext, CursorContextType } from './parser/Parser';
export type { ValidationError, ValidateValueFn } from './validation/Validator';
export type { Suggestion } from './autocomplete/suggestionTypes';
