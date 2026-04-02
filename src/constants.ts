import { ColorConfig, StyleConfig } from './types';

/** Default color palette for light backgrounds (GitHub-inspired). */
export const DEFAULT_COLORS: Required<ColorConfig> = {
  fieldName: '#0550ae',
  fieldValue: '#1a7f37',
  operator: '#cf222e',
  booleanOp: '#8250df',
  quoted: '#0a3069',
  paren: '#656d76',
  savedSearch: '#bf8700',
  historyRef: '#6639ba',
  wildcard: '#953800',
  error: '#cf222e',
  background: '#ffffff',
  text: '#1f2328',
  placeholder: '#656d76',
  cursor: '#1f2328',
  dropdownSelected: '#0969da',
  dropdownHover: '#f6f8fa',
  regexDelimiter: '#cf222e',
  regexCharClass: '#0550ae',
  regexGroup: '#656d76',
  regexEscape: '#953800',
  regexQuantifier: '#8250df',
  regexAnchor: '#cf222e',
  regexAlternation: '#8250df',
  regexText: '#0a3069',
  matchedParenBg: '#fff3cd',
  warning: '#d4a72c',
  valueTypes: {},
};

/** Dark mode color palette (GitHub Dark-inspired). */
export const DARK_COLORS: Required<ColorConfig> = {
  fieldName: '#79c0ff',
  fieldValue: '#7ee787',
  operator: '#ff7b72',
  booleanOp: '#d2a8ff',
  quoted: '#a5d6ff',
  paren: '#8b949e',
  savedSearch: '#e3b341',
  historyRef: '#bc8cff',
  wildcard: '#ffa657',
  error: '#f85149',
  background: '#0d1117',
  text: '#c9d1d9',
  placeholder: '#484f58',
  cursor: '#c9d1d9',
  dropdownSelected: '#1f6feb',
  dropdownHover: '#161b22',
  regexDelimiter: '#ff7b72',
  regexCharClass: '#79c0ff',
  regexGroup: '#8b949e',
  regexEscape: '#ffa657',
  regexQuantifier: '#d2a8ff',
  regexAnchor: '#ff7b72',
  regexAlternation: '#d2a8ff',
  regexText: '#a5d6ff',
  matchedParenBg: '#3d3222',
  warning: '#e3b341',
  valueTypes: {},
};

/** Default layout/structural styles for light mode. */
export const DEFAULT_STYLES: Required<StyleConfig> = {
  fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace",
  fontSize: '14px',
  lineHeight: '1.5',

  inputMinHeight: '40px',
  inputPadding: '8px 12px',
  inputBorderWidth: '2px',
  inputBorderColor: '#d0d7de',
  inputBorderRadius: '8px',
  inputFocusBorderColor: '#0969da',
  inputFocusShadow: '0 0 0 3px rgba(9, 105, 218, 0.3)',

  dropdownBorderColor: '#d0d7de',
  dropdownBorderRadius: '8px',
  dropdownShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
  dropdownMaxHeight: '300px',
  dropdownMinWidth: '200px',
  dropdownMaxWidth: '400px',
  dropdownZIndex: 99999,
  dropdownItemPadding: '6px 12px',
  dropdownItemFontSize: '13px',

  typeBadgeBg: '#eef1f5',
  typeBadgeSelectedBg: 'rgba(255,255,255,0.2)',
  typeBadgeColor: '#656d76',
  typeBadgeSelectedColor: '#ffffff',
};

/** Dark mode style overrides. Extends `DEFAULT_STYLES` with darker borders, shadows, and badges. */
export const DARK_STYLES: Required<StyleConfig> = {
  ...DEFAULT_STYLES,
  inputBorderColor: '#30363d',
  inputFocusBorderColor: '#1f6feb',
  inputFocusShadow: '0 0 0 3px rgba(31, 111, 235, 0.3)',

  dropdownBorderColor: '#30363d',
  dropdownShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',

  typeBadgeBg: '#21262d',
  typeBadgeColor: '#8b949e',
};

/** Recognized boolean operators in query syntax. */
export const BOOLEAN_OPERATORS = ['AND', 'OR', 'NOT'];
/** Recognized comparison operators for numeric and date fields. */
export const COMPARISON_OPERATORS = ['>=', '<=', '>', '<'];

/** Default debounce delay (ms) for async `fetchSuggestions` calls. */
export const DEFAULT_DEBOUNCE_MS = 200;
/** Default maximum number of suggestions shown in the autocomplete dropdown. */
export const DEFAULT_MAX_SUGGESTIONS = 10;
