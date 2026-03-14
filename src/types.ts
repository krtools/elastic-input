import { ASTNode } from './parser/ast';
import { ValidationError } from './validation/Validator';

export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'ip';

export interface FieldConfig {
  name: string;
  label?: string;
  type: FieldType;
  suggestions?: string[];
  operators?: string[];
  validate?: (value: string) => string | null;
  description?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
}

export interface HistoryEntry {
  query: string;
  timestamp?: number;
  label?: string;
}

export interface SuggestionItem {
  text: string;
  label?: string;
  description?: string;
  type?: string;
}

export interface ColorConfig {
  fieldName?: string;
  fieldValue?: string;
  operator?: string;
  booleanOp?: string;
  quoted?: string;
  paren?: string;
  savedSearch?: string;
  historyRef?: string;
  wildcard?: string;
  error?: string;
  background?: string;
  text?: string;
  placeholder?: string;
  cursor?: string;
  dropdownSelected?: string;
  dropdownHover?: string;
  // Regex sub-highlighting
  regexDelimiter?: string;
  regexCharClass?: string;
  regexGroup?: string;
  regexEscape?: string;
  regexQuantifier?: string;
  regexAnchor?: string;
  regexAlternation?: string;
  regexText?: string;
  // Matched paren highlighting
  matchedParenBg?: string;
}

export interface StyleConfig {
  /** Shared font family across input, dropdown, and placeholders */
  fontFamily?: string;
  /** Base font size for the input */
  fontSize?: string;

  // Input
  inputMinHeight?: string;
  inputPadding?: string;
  inputBorderWidth?: string;
  inputBorderColor?: string;
  inputBorderRadius?: string;
  inputFocusBorderColor?: string;
  inputFocusShadow?: string;

  // Dropdown
  dropdownBorderColor?: string;
  dropdownBorderRadius?: string;
  dropdownShadow?: string;
  dropdownMaxHeight?: string;
  dropdownMinWidth?: string;
  dropdownMaxWidth?: string;
  dropdownZIndex?: number;
  dropdownItemPadding?: string;
  dropdownItemFontSize?: string;

  // Type badge (shown next to suggestions)
  typeBadgeBg?: string;
  typeBadgeSelectedBg?: string;
  typeBadgeColor?: string;
  typeBadgeSelectedColor?: string;
}

export interface ElasticInputAPI {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  blur: () => void;
  getAST: () => ASTNode | null;
  getValidationErrors: () => ValidationError[];
}

export interface ElasticInputProps {
  fields: FieldConfig[];
  onSearch?: (query: string, ast: ASTNode | null) => void;
  onChange?: (query: string, ast: ASTNode | null) => void;
  onValidationChange?: (errors: ValidationError[]) => void;
  value?: string;
  defaultValue?: string;
  savedSearches?: SavedSearch[] | (() => Promise<SavedSearch[]>);
  searchHistory?: HistoryEntry[] | (() => Promise<HistoryEntry[]>);
  fetchSuggestions?: (fieldName: string, partial: string) => Promise<SuggestionItem[]>;
  colors?: ColorConfig;
  styles?: StyleConfig;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  suggestDebounceMs?: number;
  maxSuggestions?: number;
  showSavedSearchHint?: boolean;
  showHistoryHint?: boolean;
  inputRef?: (api: ElasticInputAPI) => void;
}
