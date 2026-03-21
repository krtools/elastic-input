// ---------------------------------------------------------------------------
// ElasticInput — Elasticsearch query_string syntax input component
// ---------------------------------------------------------------------------

// Core component
export { ElasticInput } from './components/ElasticInput';

// Standalone syntax highlighting (pure function — no React/DOM required)
export { buildHighlightedHTML } from './components/HighlightedContent';
export type { HighlightOptions } from './components/HighlightedContent';

// Internal building blocks (for advanced usage / custom integrations)
export { Lexer } from './lexer/Lexer';
export { Parser } from './parser/Parser';
export { Validator } from './validation/Validator';
export { AutocompleteEngine } from './autocomplete/AutocompleteEngine';
export type { AutocompleteOptions } from './autocomplete/AutocompleteEngine';

// Standalone utilities (pure functions — no React/DOM required, tree-shakeable)
export { extractValues } from './utils/extractValues';
export type { ExtractedValue, ExtractedValueKind } from './utils/extractValues';

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
  TabContext,
  TabActionResult,
  DropdownConfig,
  FeaturesConfig,
} from './types';

// Low-level types — tokens, AST, and internal structures
export type { Token, TokenType } from './lexer/tokens';
export type { ASTNode } from './parser/ast';
export type { CursorContext, CursorContextType } from './parser/Parser';
export type { ValidationError, ValidateValueFn } from './validation/Validator';
export type { Suggestion } from './autocomplete/suggestionTypes';
