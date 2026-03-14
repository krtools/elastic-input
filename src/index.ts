export { ElasticInput } from './components/ElasticInput';
export { Lexer } from './lexer/Lexer';
export { Parser } from './parser/Parser';
export { Validator } from './validation/Validator';
export { AutocompleteEngine } from './autocomplete/AutocompleteEngine';
export type { AutocompleteOptions } from './autocomplete/AutocompleteEngine';
export { DEFAULT_COLORS, DARK_COLORS, DEFAULT_STYLES, DARK_STYLES } from './constants';

export type {
  ElasticInputProps,
  ElasticInputAPI,
  FieldConfig,
  FieldType,
  SavedSearch,
  HistoryEntry,
  SuggestionItem,
  ColorConfig,
  StyleConfig,
} from './types';

export type { Token, TokenType } from './lexer/tokens';
export type { ASTNode } from './parser/ast';
export type { CursorContext, CursorContextType } from './parser/Parser';
export type { ValidationError } from './validation/Validator';
export type { Suggestion } from './autocomplete/suggestionTypes';
