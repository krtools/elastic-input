import * as React from 'react';
import { ASTNode } from './parser/ast';
import { ValidationError } from './validation/Validator';

/** Supported field types for search fields. Determines validation rules and autocomplete behavior. */
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'ip';

/** Configuration for a searchable field. Defines the field's name, type, and validation behavior. */
export interface FieldConfig {
  /** Field name used in queries (e.g. `status` in `status:active`). */
  name: string;
  /** Alternative names that resolve to this field. Typing an alias (e.g. `contact_name:value`) behaves identically to using `name`. */
  aliases?: string[];
  /** Human-readable label shown in autocomplete suggestions. Falls back to `name` if omitted. */
  label?: string;
  /** Data type that determines validation and autocomplete behavior. */
  type: FieldType;
  /** Allowed values for `enum` fields, or value hints for other types. Shown in autocomplete. */
  suggestions?: string[];
  /** Allowed comparison operators. Defaults to `>`, `>=`, `<`, `<=` for number/date fields. */
  operators?: string[];
  /** Custom validation function. Return an error message string, or `null` if valid. */
  validate?: (value: string) => string | null;
  /** Description shown alongside the field in autocomplete suggestions. */
  description?: string;
  /** Custom placeholder hint shown in the dropdown while typing a value for this field (e.g. "Search by company name..."). Overrides the default type-based hint. Set to `false` to suppress the hint entirely. */
  placeholder?: string | false;
  /** When `true`, the dropdown shows a "Searching..." spinner immediately when entering this field's value (instead of the sync hint). Use for fields whose values are provided by `fetchSuggestions`. @default false */
  asyncSearch?: boolean;
  /** Label shown next to the loading spinner for async fields. Accepts a static string or a callback receiving the current partial text. @default "Searching..." */
  asyncSearchLabel?: string | ((partial: string) => string);
}

/** A saved/named search that users can reference with `#name` syntax. */
export interface SavedSearch {
  /** Unique identifier for the saved search. */
  id: string;
  /** Display name, also used as the `#` trigger (e.g. `#vip-active`). */
  name: string;
  /** The query string this saved search expands to. */
  query: string;
  /** Optional description shown in the autocomplete dropdown. */
  description?: string;
}

/** A previous search query that users can reference with `!` syntax. */
export interface HistoryEntry {
  /** The query string from the history entry. */
  query: string;
  /** Unix timestamp (ms) of when the query was executed. Used for ordering. */
  timestamp?: number;
  /** Optional label for display in the autocomplete dropdown. Falls back to `query`. */
  label?: string;
}

/** An item returned by the async `fetchSuggestions` callback for field value autocomplete. */
export interface SuggestionItem {
  /** The value to insert when this suggestion is accepted. */
  text: string;
  /** Display label in the dropdown. Falls back to `text` if omitted. */
  label?: string;
  /** Additional description shown alongside the suggestion. */
  description?: string;
  /** Category label (e.g. "string", "recent") shown as a badge in the dropdown. */
  type?: string;
}

/**
 * Color overrides for syntax highlighting and UI elements.
 * All values are CSS color strings (hex, rgb, etc.). Omitted keys fall back to `DEFAULT_COLORS`.
 */
export interface ColorConfig {
  /** Field name in `field:value` pairs (e.g. `status` in `status:active`). */
  fieldName?: string;
  /** Field value in `field:value` pairs (e.g. `active` in `status:active`). */
  fieldValue?: string;
  /** Comparison operators (`>`, `>=`, `<`, `<=`). */
  operator?: string;
  /** Boolean operators (`AND`, `OR`, `NOT`). */
  booleanOp?: string;
  /** Double-quoted phrase values (`"hello world"`). Single quotes are not quote delimiters. */
  quoted?: string;
  /** Parentheses (`(`, `)`). */
  paren?: string;
  /** Saved search references (`#name`). */
  savedSearch?: string;
  /** History references (`!query`). */
  historyRef?: string;
  /** Wildcard characters (`*`, `?`). */
  wildcard?: string;
  /** Validation error underlines and tooltips. */
  error?: string;
  /** Background color for input, dropdown, and tooltips. */
  background?: string;
  /** Default text color. */
  text?: string;
  /** Placeholder text color. */
  placeholder?: string;
  /** Cursor (caret) color. */
  cursor?: string;
  /** Background of the selected dropdown item. */
  dropdownSelected?: string;
  /** Background of hovered dropdown items. */
  dropdownHover?: string;
  /** Regex delimiter slashes (`/`). */
  regexDelimiter?: string;
  /** Regex character classes (`[abc]`, `[^0-9]`). */
  regexCharClass?: string;
  /** Regex group parentheses and non-capturing groups (`(?:`, `(?=`). */
  regexGroup?: string;
  /** Regex escape sequences (`\d`, `\w`, `\.`). */
  regexEscape?: string;
  /** Regex quantifiers (`+`, `*`, `?`, `{n,m}`). */
  regexQuantifier?: string;
  /** Regex anchors (`^`, `$`). */
  regexAnchor?: string;
  /** Regex alternation operator (`|`). */
  regexAlternation?: string;
  /** Regex literal text. */
  regexText?: string;
  /** Background highlight for matched parenthesis pairs. */
  matchedParenBg?: string;
  /** Warning-severity squiggly underlines (e.g. ambiguous precedence). */
  warning?: string;
}

/**
 * Structural and layout style overrides for the input and dropdown.
 * All string values are CSS values. Omitted keys fall back to `DEFAULT_STYLES`.
 */
export interface StyleConfig {
  /** Shared font family across input, dropdown, and placeholders. */
  fontFamily?: string;
  /** Base font size for the input. */
  fontSize?: string;
  /** Minimum height of the input element. */
  inputMinHeight?: string;
  /** Padding inside the input element. */
  inputPadding?: string;
  /** Border width of the input element. */
  inputBorderWidth?: string;
  /** Border color of the input element (unfocused). */
  inputBorderColor?: string;
  /** Border radius of the input element. */
  inputBorderRadius?: string;
  /** Border color when the input is focused. */
  inputFocusBorderColor?: string;
  /** Box shadow when the input is focused (e.g. focus ring). */
  inputFocusShadow?: string;
  /** Border color of the autocomplete dropdown. */
  dropdownBorderColor?: string;
  /** Border radius of the autocomplete dropdown. */
  dropdownBorderRadius?: string;
  /** Box shadow of the autocomplete dropdown. */
  dropdownShadow?: string;
  /** Maximum height of the dropdown before scrolling. */
  dropdownMaxHeight?: string;
  /** Minimum width of the dropdown. */
  dropdownMinWidth?: string;
  /** Maximum width of the dropdown. */
  dropdownMaxWidth?: string;
  /** CSS z-index for the dropdown and date picker portals. */
  dropdownZIndex?: number;
  /** Padding for each dropdown item. */
  dropdownItemPadding?: string;
  /** Font size for dropdown item text. */
  dropdownItemFontSize?: string;
  /** Background color for type badges (unselected). */
  typeBadgeBg?: string;
  /** Background color for type badges (selected row). */
  typeBadgeSelectedBg?: string;
  /** Text color for type badges (unselected). */
  typeBadgeColor?: string;
  /** Text color for type badges (selected row). */
  typeBadgeSelectedColor?: string;
}

/**
 * Imperative API handle for the ElasticInput component.
 * Obtained via the `inputRef` callback prop.
 */
export interface ElasticInputAPI {
  /** Returns the current raw query string. */
  getValue: () => string;
  /** Programmatically sets the input value. Triggers re-lex, re-parse, and re-validate. */
  setValue: (value: string) => void;
  /** Focuses the input element. */
  focus: () => void;
  /** Blurs the input element. */
  blur: () => void;
  /** Returns the current parsed AST, or `null` if the input is empty. */
  getAST: () => ASTNode | null;
  /** Returns the current validation errors (including syntax errors). */
  getValidationErrors: () => ValidationError[];
}

/**
 * Props for the ElasticInput component.
 *
 * @example
 * ```tsx
 * <ElasticInput
 *   fields={[
 *     { name: 'status', type: 'enum', suggestions: ['active', 'inactive'] },
 *     { name: 'price', type: 'number' },
 *   ]}
 *   onSearch={(query, ast) => console.log('Search:', query)}
 *   placeholder="Search..."
 * />
 * ```
 */
/** Field definitions — either a static array or an async loader function. */
export type FieldsSource = FieldConfig[] | (() => Promise<FieldConfig[]>);

export interface ElasticInputProps {
  /** Field definitions that determine autocomplete, validation, and syntax highlighting. Accepts a static array or an async loader function. */
  fields: FieldsSource;
  /** Called when the user submits a search (Enter on a value, or Ctrl+Enter). */
  onSearch?: (query: string, ast: ASTNode | null) => void;
  /** Called on every input change with the current query and AST. */
  onChange?: (query: string, ast: ASTNode | null) => void;
  /** Called when validation errors change. Useful for external error display. */
  onValidationChange?: (errors: ValidationError[]) => void;
  /** Controlled value. When provided, the component reflects this value. */
  value?: string;
  /** Initial value for uncontrolled usage. Ignored if `value` is provided. */
  defaultValue?: string;
  /** Saved searches available via `#name` syntax. Can be an array or async loader. */
  savedSearches?: SavedSearch[] | (() => Promise<SavedSearch[]>);
  /** Search history available via `!` syntax. Can be an array or async loader. */
  searchHistory?: HistoryEntry[] | (() => Promise<HistoryEntry[]>);
  /** Async callback for fetching field value suggestions. Called with field name and partial text. */
  fetchSuggestions?: (fieldName: string, partial: string) => Promise<SuggestionItem[]>;
  /** Color overrides for syntax highlighting and UI elements. Merged with `DEFAULT_COLORS`. */
  colors?: ColorConfig;
  /** Style overrides for input and dropdown layout. Merged with `DEFAULT_STYLES`. */
  styles?: StyleConfig;
  /** Placeholder text shown when the input is empty and unfocused. */
  placeholder?: string;
  /** CSS class name applied to the outer container `<div>`. */
  className?: string;
  /** Inline styles applied to the outer container `<div>`. */
  style?: React.CSSProperties;
  /** Debounce delay in ms for async `fetchSuggestions` calls. @default 200 */
  suggestDebounceMs?: number;
  /** Maximum number of suggestions shown in the dropdown. @default 10 */
  maxSuggestions?: number;
  /** Whether to show the `#saved-search` hint in the dropdown. @default true */
  showSavedSearchHint?: boolean;
  /** Whether to show the `!history` hint in the dropdown. @default true */
  showHistoryHint?: boolean;
  /** Callback that receives the imperative API handle for programmatic control. */
  inputRef?: (api: ElasticInputAPI) => void;
  /** Enable multiline input with Shift+Enter for line breaks. @default true */
  multiline?: boolean;
  /**
   * Custom renderer for field value hints in the dropdown. Called when the cursor is in a
   * field value position. Return a React element for rich content, or `null`/`undefined` to
   * use the default hint (e.g. "Enter a number"). Receives the resolved `FieldConfig` and
   * the current partial value text.
   */
  renderFieldHint?: (field: FieldConfig, partial: string) => React.ReactNode | null | undefined;
  /**
   * Custom renderer for history suggestion items in the dropdown. Return a React element
   * to replace the default two-line layout, or `null`/`undefined` to keep the default.
   * Receives the original `HistoryEntry` and whether the item is currently selected.
   */
  renderHistoryItem?: (entry: HistoryEntry, isSelected: boolean) => React.ReactNode | null | undefined;
  /**
   * Custom renderer for saved search suggestion items in the dropdown. Return a React element
   * to replace the default layout, or `null`/`undefined` to keep the default.
   * Receives the original `SavedSearch` and whether the item is currently selected.
   */
  renderSavedSearchItem?: (search: SavedSearch, isSelected: boolean) => React.ReactNode | null | undefined;
}
