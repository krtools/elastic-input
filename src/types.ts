import * as React from 'react';
import { ASTNode } from './parser/ast';
import { CursorContext } from './parser/Parser';
import { Suggestion } from './autocomplete/suggestionTypes';
import { ValidationError } from './validation/Validator';

/** Supported field types for search fields. Determines validation rules and autocomplete behavior. */
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'ip';

/** Structured result from a custom validation callback, allowing explicit severity control. */
export interface ValidationResult {
  /** Human-readable message. */
  message: string;
  /** `'error'` (default) renders red squiggles; `'warning'` renders amber squiggles. */
  severity: 'error' | 'warning';
}

/** Return type for the `validateValue` callback. A plain string is treated as an error. */
export type ValidateReturn = string | ValidationResult | null;

/**
 * Context passed to the top-level `validateValue` callback describing the value being validated.
 */
export interface ValidateValueContext {
  /** The raw value string being validated. */
  value: string;
  /** Where this value appears in the query. */
  position: 'field_value' | 'range_start' | 'range_end' | 'bare_term' | 'field_group_term';
  /** Field name, if this value is associated with a field (absent for bare terms). */
  fieldName?: string;
  /** Resolved FieldConfig, if this value is associated with a known field. */
  fieldConfig?: FieldConfig;
  /** Whether the value is double-quoted (phrase). */
  quoted: boolean;
  /** Comparison operator if present (e.g. `>`, `>=`, `<`, `<=`). Only for field_value position. */
  operator?: string;
  /** For range bounds: whether the bound is inclusive (`[`/`]`) or exclusive (`{`/`}`). */
  inclusive?: boolean;
}

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
  /** Allowed comparison operators. Defaults to `>`, `>=`, `<`, `<=` for number/date fields. */
  operators?: string[];
  /** Description shown alongside the field in autocomplete suggestions. */
  description?: string;
  /** Custom placeholder hint shown in the dropdown while typing a value for this field (e.g. "Search by company name..."). Overrides the default type-based hint. Set to `false` to suppress the hint entirely. */
  placeholder?: string | false;
  /** Whether `fetchSuggestions` should be called for this field. Defaults to `true`. Set to `false` to skip the async fetch entirely (no "Searching..." spinner, no dropdown). */
  suggestions?: boolean;
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
  /** Optional label for display in the autocomplete dropdown. Falls back to `query`. */
  label?: string;
  /** Optional description shown below the label (e.g. date, category). Rendered as-is. */
  description?: React.ReactNode;
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
 * Configuration for the autocomplete dropdown: when it appears, what it shows, and
 * how suggestion items are rendered. All properties are optional with sensible defaults.
 */
/** Context passed to a `dropdown.open` callback. */
export interface DropdownOpenContext {
  /** What caused this evaluation. */
  trigger: 'input' | 'navigation' | 'ctrlSpace' | 'modeChange';
  /** Current cursor context from the parser. */
  context: CursorContext;
  /** Suggestions the engine has computed (may be empty). */
  suggestions: Suggestion[];
  /** Whether the dropdown is currently visible. */
  isOpen: boolean;
}

/**
 * Value for `dropdown.open`. A string constant for common presets,
 * or a callback for custom logic.
 *
 * Callback return values:
 * - `true` — force the dropdown open (the engine still decides *what* to show)
 * - `false` — force the dropdown closed
 * - `null` — no opinion; let the engine decide
 */
export type DropdownOpenProp =
  | 'always' | 'never' | 'manual' | 'input'
  | ((ctx: DropdownOpenContext) => boolean | null);

export interface DropdownConfig {
  /** Controls when the dropdown appears. Accepts a preset string or a callback.
   *  @default 'always' */
  open?: DropdownOpenProp;
  /** @deprecated Use `open` instead. */
  mode?: 'always' | 'never' | 'manual' | 'input';
  /** When true, the dropdown spans the full input width instead of following the caret. @default false */
  alignToInput?: boolean;
  /** Maximum number of suggestions shown. @default 10 */
  maxSuggestions?: number;
  /** Debounce delay in ms for async `fetchSuggestions` calls. @default 200 */
  suggestDebounceMs?: number;
  /** Show the `#saved-search` hint in the dropdown. @default true */
  showSavedSearchHint?: boolean;
  /** Show the `!history` hint in the dropdown. @default true */
  showHistoryHint?: boolean;
  /** Show boolean operator suggestions (AND, OR, NOT). @default true */
  showOperators?: boolean;
  /** Show dropdown on navigation events (click, arrow keys, focus). When false,
   *  the dropdown only appears in response to typing. @default true */
  onNavigation?: boolean;
  /** Delay in ms before the dropdown appears on navigation events. Typing is always
   *  immediate. If the user types before the delay elapses, the timer is cancelled.
   *  Ignored when `onNavigation` is false. @default 0 */
  navigationDelay?: number;
  /** Delay in ms before showing the "Searching..." spinner on first entry into an
   *  async field. If the fetch resolves before the delay, the spinner never appears.
   *  Subsequent keystrokes preserve previous results regardless of this setting. @default 0 */
  loadingDelay?: number;
  /** Custom renderer for field value hints. Return a React element for rich content,
   *  or null/undefined for the default hint. */
  renderFieldHint?: (field: FieldConfig, partial: string) => React.ReactNode | null | undefined;
  /** Custom renderer for history suggestion items. Return a React element to replace
   *  the default layout, or null/undefined for the default. */
  renderHistoryItem?: (entry: HistoryEntry, isSelected: boolean) => React.ReactNode | null | undefined;
  /** Custom renderer for saved search suggestion items. Return a React element to replace
   *  the default layout, or null/undefined for the default. */
  renderSavedSearchItem?: (search: SavedSearch, isSelected: boolean) => React.ReactNode | null | undefined;
  /** Custom renderer for a header above the suggestion list. Return a React element,
   *  or null/undefined for no header. */
  renderHeader?: (context: CursorContext) => React.ReactNode | null | undefined;
}

/**
 * Feature toggles for optional editing behaviors. All default to false except `multiline`.
 */
export interface FeaturesConfig {
  /** Enable multiline input with Shift+Enter for line breaks. @default true */
  multiline?: boolean;
  /** First Ctrl+A selects current token, second selects all. @default false */
  smartSelectAll?: boolean;
  /** Alt+Shift+Arrow expands/shrinks selection through the AST. @default false */
  expandSelection?: boolean;
  /** Pressing `*` with a single value token selected wraps it in wildcards. @default false */
  wildcardWrap?: boolean;
  /** Enable `#name` saved-search syntax and autocomplete. When false, `#` is a regular character. @default false */
  savedSearches?: boolean;
  /** Enable `!query` history-search syntax and autocomplete. When false, `!` is a regular character. @default false */
  historySearch?: boolean;
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
  /** Selects a character range in the input. Focuses the input if not already focused. */
  setSelection: (start: number, end: number) => void;
}

/** Context passed to the `onTab` callback. */
export interface TabContext {
  /** The currently selected suggestion, or `null` if nothing is highlighted. */
  suggestion: Suggestion | null;
  /** Current cursor context (what the user is typing). */
  cursorContext: CursorContext;
  /** The current raw query string. */
  query: string;
}

/** Return type for the `onTab` callback. Each action defaults to `false` when omitted. */
export interface TabActionResult {
  /** Accept the currently selected suggestion (if any). */
  accept?: boolean;
  /** Move focus out of the input. */
  blur?: boolean;
  /** Trigger `onSearch` with the current (post-accept) query. */
  submit?: boolean;
}

/**
 * Custom CSS class names for key DOM elements.
 * Applied alongside the static `ei-*` classes (not replacing them).
 */
export interface ClassNamesConfig {
  /** Outer container div. */
  container?: string;
  /** The contentEditable editor div. */
  editor?: string;
  /** The placeholder text div. */
  placeholder?: string;
  /** The autocomplete dropdown container. */
  dropdown?: string;
  /** The dropdown header div. */
  dropdownHeader?: string;
  /** Each dropdown suggestion item div. */
  dropdownItem?: string;
  /** Each syntax-highlighted token span (in the HTML output). */
  token?: string;
  /** Validation squiggly underline divs. */
  squiggly?: string;
  /** Error/warning tooltip div. */
  tooltip?: string;
  /** The date picker container. */
  datePicker?: string;
}

/** Field definitions — either a static array or an async loader function. */
export type FieldsSource = FieldConfig[] | (() => Promise<FieldConfig[]>);

/**
 * Props for the ElasticInput component.
 *
 * @example
 * ```tsx
 * <ElasticInput
 *   fields={[
 *     { name: 'status', type: 'string', suggestions: ['active', 'inactive'] },
 *     { name: 'price', type: 'number' },
 *   ]}
 *   onSearch={(query, ast) => console.log('Search:', query)}
 *   placeholder="Search..."
 * />
 * ```
 */
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
  /** Saved searches available via `#name` syntax. Array is passed through as-is; callback is called per-keystroke (debounced) with the partial. */
  savedSearches?: SavedSearch[] | ((partial: string) => Promise<SavedSearch[]>);
  /** Search history available via `!` syntax. Array is passed through as-is; callback is called per-keystroke (debounced) with the partial. */
  searchHistory?: HistoryEntry[] | ((partial: string) => Promise<HistoryEntry[]>);
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
  /** Custom CSS classes for key DOM elements (container, editor, dropdown, etc.). */
  classNames?: ClassNamesConfig;
  /** Inline styles applied to the outer container `<div>`. */
  style?: React.CSSProperties;
  /** Dropdown behavior, rendering, and appearance configuration. */
  dropdown?: DropdownConfig;
  /** Feature toggles for optional editing behaviors. */
  features?: FeaturesConfig;
  /** Callback that receives the imperative API handle for programmatic control. */
  inputRef?: (api: ElasticInputAPI) => void;
  /** Custom presets for the date range picker. When provided, completely replaces the built-in presets (Today, Last 7 days, etc.). Pass `[]` to hide presets entirely. Only shown in range mode. */
  datePresets?: { label: string; value: string }[];
  /** Called on keydown events before internal handling. If `e.preventDefault()` is called, internal keyboard handling is skipped. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  /** Called when the input gains focus. */
  onFocus?: () => void;
  /** Called when the input loses focus. */
  onBlur?: () => void;
  /**
   * Override Tab key behavior. Called when Tab is pressed, with the current suggestion (if any),
   * cursor context, and query string. Return an object specifying which actions to perform.
   * Each action defaults to `false` when omitted.
   *
   * - `accept`: Accept the currently selected suggestion (if any).
   * - `blur`: Move focus out of the input.
   * - `submit`: Trigger `onSearch` with the current query.
   *
   * If this prop is not provided, default behavior applies (accept suggestion if selected,
   * otherwise browser-default tab-out).
   *
   * @example
   * ```tsx
   * onTab={({ suggestion }) => ({
   *   accept: !!suggestion,
   *   blur: true,
   * })}
   * ```
   */
  onTab?: (context: TabContext) => TabActionResult;
  /**
   * Top-level custom validation callback. Called for every value in the query (field values,
   * range bounds, bare terms, field group terms). Return an error string (treated as error
   * severity), a `{ message, severity }` object, or `null` if valid.
   */
  validateValue?: (context: ValidateValueContext) => ValidateReturn;
  /**
   * Custom date parser for date-typed fields. Called during validation and date picker
   * initialization. Return a `Date` if the string is a valid date, or `null` if not.
   * When provided, values accepted by this parser bypass the built-in date format checks.
   * The built-in parser handles YYYY-MM-DD, ISO 8601, and `now±Xd` syntax.
   */
  parseDate?: (value: string) => Date | null;
}
