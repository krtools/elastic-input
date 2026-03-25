import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Lexer } from '../lexer/Lexer';
import { Token, TokenType } from '../lexer/tokens';
import { Parser, CursorContext } from '../parser/Parser';
import { ASTNode, ErrorNode } from '../parser/ast';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { Validator, ValidationError } from '../validation/Validator';
import { ElasticInputProps, ElasticInputAPI, ColorConfig, StyleConfig, FieldConfig, SavedSearch, HistoryEntry, DropdownOpenProp, DropdownOpenContext, ClassNamesConfig } from '../types';
import { cx } from '../utils/cx';
import { buildHighlightedHTML } from './HighlightedContent';
import { findMatchingParen } from '../highlighting/parenMatch';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { DateRangePicker } from './DateRangePicker';
import { ValidationSquiggles } from './ValidationSquiggles';
import { parseDate } from '../utils/dateUtils';
import { getCaretCharOffset, setCaretCharOffset, getSelectionCharRange, setSelectionCharRange } from '../utils/cursorUtils';
import { getCaretRect, getDropdownPosition, capDropdownHeight, insertTextAtCursor, insertLineBreakAtCursor } from '../utils/domUtils';
import { getPlainText, WRAP_PAIRS, wrapSelection, normalizeTypographicChars, getTokenIndexRange } from '../utils/textUtils';
import { getSmartSelectRange } from '../utils/smartSelect';
import { getExpansionRanges, SelectionRange } from '../utils/expandSelection';
import {
  mergeColors,
  mergeStyles,
  getInputContainerStyle,
  getEditableStyle,
  getEditableFocusStyle,
  getPlaceholderStyle,
  getDropdownStyle,
} from '../styles/inlineStyles';
import { DEFAULT_DEBOUNCE_MS, DEFAULT_MAX_SUGGESTIONS } from '../constants';
import { UndoStack } from '../utils/undoStack';

// ---------------------------------------------------------------------------
// DatePickerPortal — small portal wrapper for the date picker
// ---------------------------------------------------------------------------

export interface DatePickerInit {
  mode: 'single' | 'range';
  start: Date | null;
  end: Date | null;
}

/**
 * Compute the date picker initialization state from an autocomplete result.
 * Returns { mode: 'range', start, end } when cursor is inside a range
 * expression on a date field, or null for single-date (FIELD_VALUE) contexts.
 */
export function computeDatePickerInit(
  context: { type: string; partial?: string; token?: { value: string } },
  parseDateFn?: (value: string) => Date | null,
): DatePickerInit | null {
  const parse = (v: string) => (parseDateFn?.(v) ?? parseDate(v));
  if (context.type === 'RANGE' && context.token) {
    const raw = context.token.value;
    const hasClosed = raw.endsWith(']') || raw.endsWith('}');
    const inner = hasClosed ? raw.slice(1, -1) : raw.slice(1);
    const toMatch = inner.match(/^(.*?)\s+[Tt][Oo]\s+(.*)$/);
    if (toMatch) {
      const lower = parse(toMatch[1].trim());
      const upper = parse(toMatch[2].trim());
      return { mode: 'range', start: lower, end: upper };
    }
  }
  if (context.type === 'FIELD_VALUE' && context.partial) {
    const date = parse(context.partial);
    if (date) {
      return { mode: 'single', start: date, end: null };
    }
  }
  return null;
}

/**
 * Determine whether the date picker needs to be unmounted and remounted.
 * This is necessary when initial state changes because DateRangePicker
 * uses useState which only reads the initial value on first mount.
 * Returns true when mode or selected dates differ.
 */
export function shouldRemountDatePicker(
  prevInit: DatePickerInit | null,
  newInit: DatePickerInit | null,
): boolean {
  const prevMode = prevInit?.mode ?? 'single';
  const newMode = newInit?.mode ?? 'single';
  if (prevMode !== newMode) return true;
  const prevStart = prevInit?.start?.getTime() ?? 0;
  const newStart = newInit?.start?.getTime() ?? 0;
  if (prevStart !== newStart) return true;
  const prevEnd = prevInit?.end?.getTime() ?? 0;
  const newEnd = newInit?.end?.getTime() ?? 0;
  return prevEnd !== newEnd;
}

interface DatePickerPortalProps {
  position: { top: number; left: number };
  colors: Required<ColorConfig>;
  onSelect: (dateStr: string) => void;
  colorConfig?: ColorConfig;
  styleConfig?: StyleConfig;
  datePickerInit?: DatePickerInit | null;
  fixedWidth?: number;
  datePresets?: { label: string; value: string }[];
  datePickerClassName?: string;
}

function DatePickerPortal({ position, colors, onSelect, colorConfig, styleConfig, datePickerInit, fixedWidth, datePresets, datePickerClassName }: DatePickerPortalProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    portalRef.current = container;
    setReady(true);
    return () => {
      document.body.removeChild(container);
      portalRef.current = null;
    };
  }, []);

  if (!ready || !portalRef.current) return null;

  const mergedStyleConfig = mergeStyles(styleConfig);
  const style: React.CSSProperties = {
    position: 'absolute',
    zIndex: mergedStyleConfig.dropdownZIndex,
    ...getDropdownStyle(colors, mergedStyleConfig),
    top: `${position.top}px`,
    left: `${position.left}px`,
    maxHeight: 'none',
    overflowY: 'visible',
    ...(fixedWidth != null ? { width: `${fixedWidth}px`, minWidth: 'unset', maxWidth: 'unset' } : {}),
  };

  return ReactDOM.createPortal(
    <div className="ei-datepicker-portal" style={style} onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>
      <DateRangePicker
        onSelect={onSelect}
        colors={colorConfig}
        styles={styleConfig}
        initialMode={datePickerInit?.mode}
        initialStart={datePickerInit?.start}
        initialEnd={datePickerInit?.end}
        presets={datePresets}
        className={datePickerClassName}
      />
    </div>,
    portalRef.current
  );
}

// ---------------------------------------------------------------------------
// ElasticInput — main component
// ---------------------------------------------------------------------------

/**
 * A rich search input component with Elasticsearch query_string syntax support.
 *
 * Features syntax highlighting, autocomplete, field validation, date picking,
 * saved search/history references, and real-time error squiggles.
 *
 * Pasted text is automatically normalized (smart quotes → ASCII, em dashes → hyphens, etc.).
 * Selected text can be wrapped with brackets/quotes by typing the opening character (VS Code style).
 *
 * @see {@link ElasticInputProps} for available props
 * @see {@link ElasticInputAPI} for the imperative API (via `inputRef`)
 */
export function ElasticInput(props: ElasticInputProps) {
  const {
    fields: fieldsProp, onSearch, onChange, onValidationChange, value, defaultValue,
    savedSearches, searchHistory, fetchSuggestions: fetchSuggestionsProp,
    colors, styles: stylesProp, placeholder, className, classNames, style,
    dropdown: dropdownConfig, features: featuresConfig,
    inputRef, datePresets: datePresetsProp,
    onKeyDown: onKeyDownProp, onFocus: onFocusProp, onBlur: onBlurProp, onTab: onTabProp,
    validateValue,
    parseDate: parseDateProp,
  } = props;

  // Dropdown config
  const dropdownOpen: DropdownOpenProp = dropdownConfig?.open ?? dropdownConfig?.mode ?? 'always';
  const dropdownOpenIsCallback = typeof dropdownOpen === 'function';
  const dropdownMode = dropdownOpenIsCallback ? null : dropdownOpen;
  const dropdownAlignToInput = dropdownConfig?.alignToInput ?? false;
  const maxSuggestions = dropdownConfig?.maxSuggestions;
  const effectiveMaxSuggestions = maxSuggestions || DEFAULT_MAX_SUGGESTIONS;
  const suggestDebounceMs = dropdownConfig?.suggestDebounceMs;
  // Parse dropdown max height for positioning calculations — the CSS maxHeight
  // caps the rendered size, but we also need to cap the height passed to the
  // flip logic in getDropdownPosition to avoid positioning off-screen.
  const dropdownMaxHeightPx = parseInt(stylesProp?.dropdownMaxHeight || '300', 10) || 300;

  const enableSavedSearches = featuresConfig?.savedSearches ?? !!savedSearches;
  const enableHistorySearch = featuresConfig?.historySearch ?? !!searchHistory;
  const showSavedSearchHint = dropdownConfig?.showSavedSearchHint ?? enableSavedSearches;
  const showHistoryHint = dropdownConfig?.showHistoryHint ?? enableHistorySearch;
  const showOperators = dropdownConfig?.showOperators !== false;
  const triggerOnNavigation = (dropdownOpenIsCallback || dropdownMode !== 'input') && dropdownConfig?.onNavigation !== false;
  const navigationDelay = dropdownConfig?.navigationDelay ?? 0;
  const renderFieldHint = dropdownConfig?.renderFieldHint;
  const renderHistoryItem = dropdownConfig?.renderHistoryItem;
  const renderSavedSearchItem = dropdownConfig?.renderSavedSearchItem;
  const renderDropdownHeader = dropdownConfig?.renderHeader;

  // Features config
  const multiline = featuresConfig?.multiline !== false; // default true
  const smartSelectAll = featuresConfig?.smartSelectAll ?? false;
  const expandSelection = featuresConfig?.expandSelection ?? false;
  const wildcardWrap = featuresConfig?.wildcardWrap ?? false;
  const lexerOptions = React.useMemo(() => ({
    savedSearches: enableSavedSearches,
    historySearch: enableHistorySearch,
  }), [enableSavedSearches, enableHistorySearch]);

  // Resolve async fields into state — start with [] while loading
  const initialFields = Array.isArray(fieldsProp) ? fieldsProp : [];
  const [resolvedFields, setResolvedFields] = React.useState<FieldConfig[]>(initialFields);

  React.useEffect(() => {
    if (Array.isArray(fieldsProp)) {
      setResolvedFields(fieldsProp);
      return;
    }
    let cancelled = false;
    fieldsProp().then(result => {
      if (!cancelled) {
        setResolvedFields(result);
      }
    });
    return () => { cancelled = true; };
  }, [fieldsProp]);

  // --- Refs ---
  // Track editor element in both a ref (for sync access in handlers) and state
  // (so that ValidationSquiggles re-renders once the DOM node is available).
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const [editorEl, setEditorEl] = React.useState<HTMLDivElement | null>(null);
  const editorRefCallback = React.useCallback((el: HTMLDivElement | null) => {
    editorRef.current = el;
    setEditorEl(el);
  }, []);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const currentValueRef = React.useRef(value || defaultValue || '');
  const debounceTimerRef = React.useRef<any>(null);
  const isComposingRef = React.useRef(false);
  const undoStackRef = React.useRef(new UndoStack());
  const typingGroupTimerRef = React.useRef<any>(null);


  const abortControllerRef = React.useRef<AbortController | null>(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const navDelayTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const asyncActiveRef = React.useRef(false); // true while an async fetch cycle is in progress
  const datePickerInitRef = React.useRef<DatePickerInit | null>(null);
  const datePickerReplaceRef = React.useRef<{ start: number; end: number } | null>(null);
  // For 'manual' dropdown mode: tracks the context type for which the dropdown
  // was activated via Ctrl+Space. Reset when context changes.
  const manualActivationContextRef = React.useRef<string | null>(null);
  // Tracks what caused the current dropdown evaluation (for callback context)
  const dropdownTriggerRef = React.useRef<DropdownOpenContext['trigger']>('input');
  // Expand/shrink selection state: the cached hierarchy and current level index
  const expandSelRef = React.useRef<{ ranges: SelectionRange[]; level: number } | null>(null);
  // Stable ref to the latest updateSuggestionsFromTokens so processInput (defined
  // earlier) always calls the current version without a stale closure.
  const updateSuggestionsRef = React.useRef<(toks: Token[], offset: number) => void>(() => {});

  // Mutable refs for engine/validator so they stay current without re-renders
  const engineRef = React.useRef<AutocompleteEngine>(
    new AutocompleteEngine(
      initialFields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint, hasSavedSearchProvider: typeof savedSearches === 'function', hasHistoryProvider: typeof searchHistory === 'function' },
    )
  );
  const validatorRef = React.useRef(new Validator(initialFields));
  const validateValueRef = React.useRef(validateValue);
  validateValueRef.current = validateValue;

  // --- State ---
  const [tokens, setTokens] = React.useState<Token[]>([]);
  const [ast, setAst] = React.useState<ASTNode | null>(null);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = React.useState(-1);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);
  const [isFocused, setIsFocused] = React.useState(false);
  const [isEmpty, setIsEmpty] = React.useState(!currentValueRef.current);
  const [cursorOffset, setCursorOffset] = React.useState(0);
  const [selectionEnd, setSelectionEnd] = React.useState(0);
  const [autocompleteContext, setAutocompleteContext] = React.useState('');
  const [cursorContext, setCursorContext] = React.useState<CursorContext | null>(null);
  const [datePickerInit, setDatePickerInit] = React.useState<DatePickerInit | null>(null);

  // Keep refs to latest state values needed in callbacks
  const stateRef = React.useRef({
    tokens, ast, suggestions, selectedSuggestionIndex, showDropdown, showDatePicker,
    cursorOffset, selectionEnd, autocompleteContext, validationErrors, cursorContext,
  });
  stateRef.current = {
    tokens, ast, suggestions, selectedSuggestionIndex, showDropdown, showDatePicker,
    cursorOffset, selectionEnd, autocompleteContext, validationErrors, cursorContext,
  };

  // --- Helpers ---

  // Helper: compute dropdown position. When dropdownAlignToInput is true,
  // position relative to the container instead of the caret.
  const computeDropdownPosition = React.useCallback((dropdownHeight: number, dropdownWidth: number): { top: number; left: number } | null => {
    if (dropdownAlignToInput && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      return {
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
      };
    }
    const rect = getCaretRect();
    return rect ? getDropdownPosition(rect, dropdownHeight, dropdownWidth) : null;
  }, [dropdownAlignToInput]);

  // Lazily read container width for full-width dropdown mode
  const getDropdownFixedWidth = React.useCallback((): number | undefined => {
    if (!dropdownAlignToInput || !containerRef.current) return undefined;
    return containerRef.current.getBoundingClientRect().width;
  }, [dropdownAlignToInput]);

  // Show dropdown, updating position. In full-width mode the position is always
  // the container bottom-left, so we set it synchronously (no rAF) to avoid
  // stale-position flash and jitter. In caret-following mode we use rAF so the
  // caret rect is measured after the DOM has updated.
  const showDropdownAtPosition = React.useCallback((height: number, width: number, kind: 'dropdown' | 'datePicker' = 'dropdown') => {
    // Cap height to the rendered max — the CSS maxHeight clips the dropdown,
    // but positioning (flip logic) must use the actual rendered size to avoid
    // placing the dropdown off-screen when there are many suggestions.
    const cappedHeight = kind === 'datePicker' ? height : capDropdownHeight(height, dropdownMaxHeightPx);

    // Full-width mode only applies to the suggestion dropdown, not custom
    // dropdowns like date pickers — those stay compact and caret-relative.
    const useContainerAlign = dropdownAlignToInput && kind !== 'datePicker';

    if (useContainerAlign) {
      // Container-relative: position is stable, set synchronously
      setShowDropdown(true);
      setDropdownPosition(computeDropdownPosition(cappedHeight, width));
      return;
    }
    // Caret-following: defer to rAF so caret rect is fresh
    requestAnimationFrame(() => {
      if (kind === 'datePicker') {
        setShowDatePicker(true);
      } else {
        setShowDropdown(true);
      }
      const rect = getCaretRect();
      const pos = rect ? getDropdownPosition(rect, cappedHeight, width) : null;
      setDropdownPosition(pos);
    });
  }, [dropdownAlignToInput, computeDropdownPosition, dropdownMaxHeightPx]);

  // Threshold: above this token count, debounce the expensive innerHTML replacement
  const HIGHLIGHT_DEBOUNCE_THRESHOLD = 80;
  const HIGHLIGHT_DEBOUNCE_MS = 60;

  const applyHighlight = React.useCallback((tokens: Token[], offset: number) => {
    if (!editorRef.current) return;
    const html = buildHighlightedHTML(tokens, colors, { cursorOffset: offset, tokenClassName: classNames?.token });
    editorRef.current.innerHTML = html;
    setCaretCharOffset(editorRef.current, offset);
  }, [colors]);

  const processInput = React.useCallback((text: string, updateDropdown: boolean) => {
    const lexer = new Lexer(text, lexerOptions);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current, parseDateProp)];

    if (editorRef.current) {
      const offset = getCaretCharOffset(editorRef.current);

      // For large inputs during user typing, debounce the expensive DOM rebuild
      if (updateDropdown && newTokens.length > HIGHLIGHT_DEBOUNCE_THRESHOLD) {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => {
          highlightTimerRef.current = null;
          if (editorRef.current) {
            const freshOffset = getCaretCharOffset(editorRef.current);
            applyHighlight(newTokens, freshOffset);
          }
        }, HIGHLIGHT_DEBOUNCE_MS);
      } else {
        if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; }
        applyHighlight(newTokens, offset);
      }

      setTokens(newTokens);
      setAst(newAst);
      setValidationErrors(newErrors);
      setIsEmpty(text.length === 0);
      setCursorOffset(offset);
      setSelectionEnd(offset);

      if (updateDropdown) {
        updateSuggestionsRef.current(newTokens, offset);
      }
    } else {
      setTokens(newTokens);
      setAst(newAst);
      setValidationErrors(newErrors);
      setIsEmpty(text.length === 0);
    }

    if (onChange) onChange(text, newAst);
    if (onValidationChange) onValidationChange(newErrors);
  }, [colors, onChange, onValidationChange, applyHighlight]);

  // Apply renderFieldHint to hint suggestions when in a field value context
  const applyFieldHint = React.useCallback((suggestions: Suggestion[], context: { type: string; fieldName?: string; partial: string }) => {
    if (!renderFieldHint || context.type !== 'FIELD_VALUE' || !context.fieldName) return suggestions;
    const resolved = engineRef.current.resolveField(context.fieldName);
    if (!resolved) return suggestions;
    return suggestions.map(s => {
      if (s.type !== 'hint') return s;
      const custom = renderFieldHint(resolved, context.partial);
      if (custom == null) return s;
      return { ...s, customContent: custom };
    });
  }, [renderFieldHint]);

  const updateSuggestionsFromTokens = React.useCallback((toks: Token[], offset: number) => {
    const result = engineRef.current.getSuggestions(toks, offset);
    if (!showOperators) {
      result.suggestions = result.suggestions.filter(s => s.type !== 'operator');
    }
    const contextType = result.context.type;
    setCursorContext(result.context);

    // Dropdown open gating
    if (dropdownOpenIsCallback) {
      const decision = (dropdownOpen as (ctx: DropdownOpenContext) => boolean | null)({
        trigger: dropdownTriggerRef.current,
        context: result.context,
        suggestions: result.suggestions,
        isOpen: stateRef.current.showDropdown || stateRef.current.showDatePicker,
      });
      if (decision === false) {
        setShowDropdown(false);
        setShowDatePicker(false);
        setSuggestions([]);
        return;
      }
      // true or null: proceed (engine decides what to show)
    } else {
      if (dropdownMode === 'never') {
        setShowDropdown(false);
        setShowDatePicker(false);
        setSuggestions([]);
        return;
      }
      if (dropdownMode === 'manual') {
        // If manual activation is set but context changed, dismiss
        if (manualActivationContextRef.current && manualActivationContextRef.current !== contextType) {
          manualActivationContextRef.current = null;
          setShowDropdown(false);
          setShowDatePicker(false);
          setSuggestions([]);
          return;
        }
        // If not activated, don't show anything
        if (!manualActivationContextRef.current) {
          setShowDropdown(false);
          setShowDatePicker(false);
          setSuggestions([]);
          return;
        }
      }
    }

    // Determine if this context will trigger an async fetch
    const resolvedField = result.context.fieldName
      ? engineRef.current.resolveField(result.context.fieldName)
      : undefined;
    const willFetchAsync = !!(
      fetchSuggestionsProp &&
      result.context.type === 'FIELD_VALUE' &&
      result.context.fieldName &&
      resolvedField?.type !== 'boolean' &&
      resolvedField?.suggestions !== false
    ) || !!(
      typeof savedSearches === 'function' &&
      result.context.type === 'SAVED_SEARCH'
    ) || !!(
      typeof searchHistory === 'function' &&
      result.context.type === 'HISTORY_REF'
    );

    if (result.showDatePicker) {
      // Context changed to date picker — cancel any async cycle
      asyncActiveRef.current = false;
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      // Parse range bounds for pre-populating the date picker
      const init = computeDatePickerInit(result.context, parseDateProp);
      const prevInit = datePickerInitRef.current;
      datePickerInitRef.current = init;
      setDatePickerInit(init);

      // Save the replacement range for handleDateSelect.
      // For RANGE context the token covers `[... TO ...]`.
      // For FIELD_VALUE the token is the value being edited, but when no value
      // exists yet the parser returns the preceding COLON / COMPARISON_OP token
      // — in that case we insert *after* the operator rather than replacing it.
      const ctxToken = result.context.token;
      if (ctxToken && (ctxToken.type === 'COLON' || ctxToken.type === 'COMPARISON_OP')) {
        datePickerReplaceRef.current = { start: ctxToken.end, end: ctxToken.end };
      } else if (ctxToken) {
        datePickerReplaceRef.current = { start: ctxToken.start, end: ctxToken.end };
      } else {
        datePickerReplaceRef.current = { start: offset, end: offset };
      }

      // Force remount when mode changes (e.g. range → single after pasting a
      // single date over a range expression). Without this, DateRangePicker
      // stays mounted and useState ignores the new initialMode prop.
      if (stateRef.current.showDatePicker && shouldRemountDatePicker(prevInit, init)) {
        setShowDatePicker(false);
      }

      setSuggestions([]);
      if (!dropdownAlignToInput) setShowDropdown(false);
      setAutocompleteContext(contextType);
      showDropdownAtPosition(350, 300, 'datePicker');
      return;
    }

    // If we're in an async field and a fetch is already active/pending,
    // don't flash sync suggestions — keep the current dropdown content.
    if (willFetchAsync && asyncActiveRef.current) {
      // Just update context and kick off a new debounced fetch below;
      // don't touch suggestions/dropdown state (preserves last-good results or spinner).
      setAutocompleteContext(contextType);
    } else if (!willFetchAsync) {
      // Context changed away from async field — cancel any in-flight async work
      asyncActiveRef.current = false;
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);


      const newSuggestions = applyFieldHint(result.suggestions, result.context);
      if (newSuggestions.length > 0) {
        setSuggestions(newSuggestions);
        if (!dropdownAlignToInput) setShowDropdown(false);
        setShowDatePicker(false);
        setSelectedSuggestionIndex(result.context.partial ? 0 : -1);
        setAutocompleteContext(contextType);
        showDropdownAtPosition(newSuggestions.length * 32, 300);
      } else {
        setShowDropdown(false);
        setShowDatePicker(false);
        setSuggestions([]);
        setAutocompleteContext(contextType);
      }
    } else {
      // First entry into an async context — show "Searching..." immediately
      const token = result.context.token;
      const start = token ? token.start : offset;
      const end = token ? token.end : offset;
      const loadingLabel = 'Searching...';
      const loadingSuggestion: Suggestion = {
        text: '',
        label: loadingLabel,
        type: 'loading',
        replaceStart: start,
        replaceEnd: end,
      };
      setSuggestions([loadingSuggestion]);
      if (!dropdownAlignToInput) setShowDropdown(false);
      setShowDatePicker(false);
      setSelectedSuggestionIndex(-1);
      setAutocompleteContext(contextType);
      showDropdownAtPosition(32, 300);
    }

    // Handle async fetch (field values, saved searches, or history)
    if (willFetchAsync) {
      const partial = result.context.partial;
      const debounceMs = suggestDebounceMs || DEFAULT_DEBOUNCE_MS;

      asyncActiveRef.current = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      // Abort previous fetch and create new controller
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      debounceTimerRef.current = setTimeout(async () => {
        const token = result.context.token;
        const start = token ? token.start : offset;
        const end = token ? token.end : offset;

        try {
          let mapped: Suggestion[];

          if (result.context.type === 'SAVED_SEARCH' && typeof savedSearches === 'function') {
            const fetched: SavedSearch[] = await savedSearches(partial);
            if (controller.signal.aborted) return;
            mapped = fetched.map(s => ({
              text: '#' + s.name,
              label: s.name,
              description: s.description || s.query,
              type: 'savedSearch',
              replaceStart: start,
              replaceEnd: end,
              matchPartial: partial,
              sourceData: s,
            }));
          } else if (result.context.type === 'HISTORY_REF' && typeof searchHistory === 'function') {
            const fetched: HistoryEntry[] = await searchHistory(partial);
            if (controller.signal.aborted) return;
            mapped = fetched.map(h => ({
              text: AutocompleteEngine.wrapHistoryQuery(h.query),
              label: h.label || h.query,
              description: h.description,
              type: 'history',
              replaceStart: start,
              replaceEnd: end,
              matchPartial: partial,
              sourceData: h,
            }));
          } else {
            // FIELD_VALUE — resolve alias to canonical field name
            const rawFieldName = result.context.fieldName!;
            const resolved = engineRef.current.resolveField(rawFieldName);
            const fieldName = resolved ? resolved.name : rawFieldName;
            const fetched = await fetchSuggestionsProp!(fieldName, partial);
            if (controller.signal.aborted) return;
            mapped = fetched.map(s => ({
              text: s.text,
              label: s.label || s.text,
              description: s.description,
              type: s.type,
              replaceStart: start,
              replaceEnd: end,
              matchPartial: partial,
            }));
          }

          // Truncate to maxSuggestions — async providers may return unbounded results
          mapped = mapped.slice(0, effectiveMaxSuggestions);

          if (mapped.length > 0) {
            setSuggestions(mapped);
            setSelectedSuggestionIndex(partial ? 0 : -1);
            showDropdownAtPosition(mapped.length * 32, 300);
          } else {
            // No async results — fall back to the sync hint (e.g. "Search companies...")
            const syncResult = engineRef.current.getSuggestions(stateRef.current.tokens, stateRef.current.cursorOffset);
            const hintSuggestions = applyFieldHint(
              syncResult.suggestions.filter(s => s.type === 'hint'),
              syncResult.context,
            );
            if (hintSuggestions.length > 0) {
              setSuggestions(hintSuggestions);
              setSelectedSuggestionIndex(syncResult.context.partial ? 0 : -1);
              showDropdownAtPosition(hintSuggestions.length * 32, 300);
            } else {
              setShowDropdown(false);
              setSuggestions([]);
            }
          }
        } catch (e) {
          // Only update if this is still the latest request
          if (!controller.signal.aborted) {
            const errorMsg = e instanceof Error ? e.message : 'Error loading suggestions';
            const errorSuggestion: Suggestion = {
              text: '',
              label: errorMsg,
              type: 'error',
              replaceStart: start,
              replaceEnd: end,
            };
            setSuggestions([errorSuggestion]);
            setSelectedSuggestionIndex(-1);
            showDropdownAtPosition(32, 300);
            asyncActiveRef.current = false;
          }
        }
      }, debounceMs);
    }
  }, [fetchSuggestionsProp, savedSearches, searchHistory, suggestDebounceMs, applyFieldHint, computeDropdownPosition, showDropdownAtPosition, dropdownAlignToInput, dropdownOpen, dropdownOpenIsCallback, dropdownMode, showOperators, effectiveMaxSuggestions]);

  // Keep the ref current so processInput always calls the latest version
  updateSuggestionsRef.current = updateSuggestionsFromTokens;

  const closeDropdown = React.useCallback(() => {
    setShowDropdown(false);
    setShowDatePicker(false);
    setDatePickerInit(null);
    datePickerInitRef.current = null;
    datePickerReplaceRef.current = null;
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    // Cancel any in-flight async work
    asyncActiveRef.current = false;
    abortControllerRef.current?.abort();
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    if (navDelayTimerRef.current) { clearTimeout(navDelayTimerRef.current); navDelayTimerRef.current = null; }
    // Reset manual activation so next Ctrl+Space re-activates
    manualActivationContextRef.current = null;
  }, []);

  // Navigation trigger wrapper: respects onNavigation and navigationDelay settings.
  // Typing-triggered updates (via processInput/updateSuggestionsRef) bypass this entirely.
  const triggerSuggestionsFromNavigation = React.useCallback((toks: Token[], offset: number) => {
    if (navDelayTimerRef.current) { clearTimeout(navDelayTimerRef.current); navDelayTimerRef.current = null; }
    if (!triggerOnNavigation) {
      // Navigation won't open the dropdown, but should close it if open
      if (stateRef.current.showDropdown || stateRef.current.showDatePicker) {
        closeDropdown();
      }
      return;
    }
    dropdownTriggerRef.current = 'navigation';
    if (navigationDelay > 0) {
      navDelayTimerRef.current = setTimeout(() => {
        navDelayTimerRef.current = null;
        updateSuggestionsFromTokens(toks, offset);
      }, navigationDelay);
    } else {
      updateSuggestionsFromTokens(toks, offset);
    }
  }, [triggerOnNavigation, navigationDelay, updateSuggestionsFromTokens, closeDropdown]);

  const applyNewValue = React.useCallback((
    newValue: string,
    newCursorPos: number,
    thenDo?: (newTokens: Token[], newAst: ASTNode | null) => void,
  ) => {
    currentValueRef.current = newValue;

    // Record transactional operation in undo stack
    // Clear typing group so this is its own entry
    if (typingGroupTimerRef.current) {
      clearTimeout(typingGroupTimerRef.current);
      typingGroupTimerRef.current = null;
    }
    undoStackRef.current.push({ value: newValue, cursorPos: newCursorPos });

    const lexer = new Lexer(newValue, lexerOptions);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current, parseDateProp)];

    if (editorRef.current) {
      const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: newCursorPos, tokenClassName: classNames?.token });
      editorRef.current.innerHTML = html;
      setCaretCharOffset(editorRef.current, newCursorPos);
    }

    setTokens(newTokens);
    setAst(newAst);
    setValidationErrors(newErrors);
    setIsEmpty(newValue.length === 0);
    setCursorOffset(newCursorPos);
    setSelectionEnd(newCursorPos);
    setShowDropdown(false);
    setShowDatePicker(false);

    if (onChange) onChange(newValue, newAst);
    if (onValidationChange) onValidationChange(newErrors);

    // Deferred callback — runs after state batch
    if (thenDo) {
      // Use rAF to let React flush the state updates first
      requestAnimationFrame(() => thenDo(newTokens, newAst));
    }
  }, [colors, onChange, onValidationChange]);

  const acceptSuggestion = React.useCallback((
    suggestion: Suggestion,
    key: 'Enter' | 'Tab' = 'Enter',
    afterAccept?: (newValue: string, newAst: ASTNode | null) => void,
  ) => {
    if (!suggestion) return;
    const s = stateRef.current;

    // Special hint items (#, !) — insert the trigger char and show suggestions
    if (suggestion.type === 'hint' && (suggestion.text === '#' || suggestion.text === '!')) {
      const char = suggestion.text;
      const replaceStart = suggestion.replaceStart;
      const replaceEnd = Math.max(suggestion.replaceEnd, s.selectionEnd);

      const before = currentValueRef.current.slice(0, replaceStart);
      const after = currentValueRef.current.slice(replaceEnd);
      const newValue = before + char + after;
      const newCursorPos = before.length + char.length;

      applyNewValue(newValue, newCursorPos, (newTokens, newAst) => {
        if (afterAccept) {
          afterAccept(newValue, newAst);
        } else {
          updateSuggestionsFromTokens(newTokens, newCursorPos);
        }
      });
      return;
    }

    if (suggestion.type === 'hint') return;

    const isFieldValue = s.autocompleteContext === 'FIELD_VALUE';

    const replaceStart = Math.min(suggestion.replaceStart, s.cursorOffset);
    const replaceEnd = Math.max(suggestion.replaceEnd, s.selectionEnd);

    const before = currentValueRef.current.slice(0, replaceStart);
    const after = currentValueRef.current.slice(replaceEnd);

    const ctx = s.autocompleteContext;
    const isCompleteTerm = ctx === 'FIELD_VALUE' || ctx === 'SAVED_SEARCH' || ctx === 'HISTORY_REF';
    let trailingSpace = '';
    let finalAfter = after;
    if (isCompleteTerm) {
      if (after.length === 0) {
        trailingSpace = ' ';
      } else if (/^[ \t\r\n]+$/.test(after) && !after.startsWith('\\ ')) {
        trailingSpace = ' ';
        finalAfter = '';
      }
    }
    const newValue = before + suggestion.text + trailingSpace + finalAfter;
    const newCursorPos = before.length + suggestion.text.length + trailingSpace.length;

    const shouldSubmit = key === 'Enter' && isFieldValue;

    applyNewValue(newValue, newCursorPos, (newTokens, newAst) => {
      if (afterAccept) {
        afterAccept(newValue, newAst);
      } else if (shouldSubmit) {
        if (onSearch) onSearch(newValue, newAst);
      } else {
        updateSuggestionsFromTokens(newTokens, newCursorPos);
      }
    });
  }, [applyNewValue, updateSuggestionsFromTokens, onSearch]);

  // --- Lifecycle ---

  // Load sync data arrays into engine (callback forms are handled per-keystroke)
  React.useEffect(() => {
    if (Array.isArray(savedSearches)) {
      engineRef.current.updateSavedSearches(savedSearches);
    }
    if (Array.isArray(searchHistory)) {
      engineRef.current.updateSearchHistory(searchHistory);
    }
  }, [savedSearches, searchHistory]);

  // Rebuild engine/validator when resolved fields change
  React.useEffect(() => {
    engineRef.current = new AutocompleteEngine(
      resolvedFields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint, hasSavedSearchProvider: typeof savedSearches === 'function', hasHistoryProvider: typeof searchHistory === 'function' },
    );
    validatorRef.current = new Validator(resolvedFields);
    // Re-load sync data arrays for new engine
    if (Array.isArray(savedSearches)) {
      engineRef.current.updateSavedSearches(savedSearches);
    }
    if (Array.isArray(searchHistory)) {
      engineRef.current.updateSearchHistory(searchHistory);
    }
    // Re-validate current input with new fields (e.g. after async fields load)
    if (currentValueRef.current) {
      processInput(currentValueRef.current, false);
    }
  }, [resolvedFields, maxSuggestions, showSavedSearchHint, showHistoryHint]);

  // Expose imperative API
  React.useEffect(() => {
    if (inputRef) {
      inputRef({
        getValue: () => currentValueRef.current,
        setValue: (v: string) => {
          currentValueRef.current = v;
          processInput(v, false);
        },
        focus: () => editorRef.current?.focus(),
        blur: () => editorRef.current?.blur(),
        getAST: () => stateRef.current.ast,
        getValidationErrors: () => stateRef.current.validationErrors,
        setSelection: (start: number, end: number) => {
          if (!editorRef.current) return;
          editorRef.current.focus();
          setSelectionCharRange(editorRef.current, start, end);
          setCursorOffset(start);
          setSelectionEnd(end);
        },
      });
    }
  }, [inputRef, processInput]);

  // Process initial value
  React.useEffect(() => {
    const initial = currentValueRef.current;
    undoStackRef.current.push({ value: initial, cursorPos: initial.length });
    if (initial) {
      processInput(initial, false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle controlled value changes
  React.useEffect(() => {
    if (value !== undefined && value !== currentValueRef.current) {
      currentValueRef.current = value;
      processInput(value, false);
    }
  }, [value, processInput]);

  // Cleanup debounce timer and abort in-flight fetches
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (navDelayTimerRef.current) clearTimeout(navDelayTimerRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  // Proactively close dropdown when dropdown.open changes
  React.useEffect(() => {
    if (dropdownOpenIsCallback) {
      // Evaluate callback to decide if the dropdown should close
      const s = stateRef.current;
      if (s.cursorContext) {
        const decision = (dropdownOpen as (ctx: DropdownOpenContext) => boolean | null)({
          trigger: 'modeChange',
          context: s.cursorContext,
          suggestions: s.suggestions,
          isOpen: s.showDropdown || s.showDatePicker,
        });
        if (decision === false) {
          setShowDropdown(false);
          setShowDatePicker(false);
          setSuggestions([]);
        }
      }
    } else if (dropdownMode === 'never') {
      setShowDropdown(false);
      setShowDatePicker(false);
      setSuggestions([]);
    }
    // Reset manual activation when open changes
    manualActivationContextRef.current = null;
  }, [dropdownOpen]);

  // Reposition dropdown on window resize / scroll so it stays anchored
  React.useEffect(() => {
    const reposition = () => {
      const s = stateRef.current;
      if (!s.showDropdown && !s.showDatePicker) return;

      if (s.showDropdown && dropdownAlignToInput && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
        });
      } else {
        // Caret-relative (date picker, or non-full-width dropdown)
        const rect = getCaretRect();
        if (rect) {
          const height = s.showDatePicker ? 350 : capDropdownHeight(s.suggestions.length * 32, dropdownMaxHeightPx);
          setDropdownPosition(getDropdownPosition(rect, height, 300));
        }
      }
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [dropdownAlignToInput, dropdownMaxHeightPx]);

  // Re-render highlighted HTML when cursor moves (for paren matching) or colors change
  const prevParenMatchRef = React.useRef<string | null>(null);
  const prevColorsRef = React.useRef(colors);
  React.useEffect(() => {
    if (!editorRef.current) return;
    const currentTokens = stateRef.current.tokens;
    if (currentTokens.length === 0) return;

    // Skip re-render when text is selected — innerHTML replacement would
    // collapse the selection. Paren matching is irrelevant while selecting.
    if (isFocused && selectionEnd !== cursorOffset) return;

    // When blurred, clear paren highlighting
    const effectiveCursor = isFocused ? cursorOffset : -1;

    // Force re-highlight when colors change (e.g. theme switch)
    const colorsChanged = colors !== prevColorsRef.current;
    prevColorsRef.current = colors;

    // Compute new match and compare to previous to avoid unnecessary DOM updates
    const match = findMatchingParen(currentTokens, effectiveCursor);
    const matchKey = match ? `${match.openStart},${match.closeStart}` : null;
    if (matchKey === prevParenMatchRef.current && !colorsChanged) return;
    prevParenMatchRef.current = matchKey;

    const savedOffset = getCaretCharOffset(editorRef.current);
    const html = buildHighlightedHTML(currentTokens, colors, { cursorOffset: effectiveCursor, tokenClassName: classNames?.token });
    editorRef.current.innerHTML = html;
    setCaretCharOffset(editorRef.current, savedOffset);
  }, [cursorOffset, selectionEnd, isFocused, colors]);

  // --- Event handlers ---

  const handleInput = React.useCallback(() => {
    if (isComposingRef.current) return;
    if (!editorRef.current) return;
    expandSelRef.current = null; // typing resets expand selection
    // Cancel any pending navigation delay — typing shows dropdown immediately
    if (navDelayTimerRef.current) { clearTimeout(navDelayTimerRef.current); navDelayTimerRef.current = null; }

    let text = getPlainText(editorRef.current);

    // Skip if the DOM text hasn't changed from what we last processed.
    // This handles spurious input events from programmatic DOM updates
    // (e.g. innerHTML changes during undo/redo or suggestion acceptance).
    if (text === currentValueRef.current) return;
    let cursorPos = getCaretCharOffset(editorRef.current);

    // Normalize typographic characters (smart quotes, em dashes, etc.)
    const normalized = normalizeTypographicChars(text);
    if (normalized !== text) {
      text = normalized;
      // Length might change (e.g. ellipsis → 3 dots), adjust cursor
      cursorPos = Math.min(cursorPos, text.length);
    }
    currentValueRef.current = text;

    // Group consecutive typing: replace current entry, then after a pause push a new one
    const undo = undoStackRef.current;
    const prev = undo.current();
    const isSmallChange = prev && Math.abs(text.length - prev.value.length) <= 2;

    if (isSmallChange && typingGroupTimerRef.current) {
      // Still in a typing group — replace the current entry
      undo.replaceCurrent({ value: text, cursorPos });
    } else {
      // Start of a new typing group
      undo.push({ value: text, cursorPos });
    }

    // Reset the grouping timer — if user pauses for 300ms, next keystroke starts a new group
    if (typingGroupTimerRef.current) clearTimeout(typingGroupTimerRef.current);
    typingGroupTimerRef.current = setTimeout(() => {
      typingGroupTimerRef.current = null;
    }, 300);

    dropdownTriggerRef.current = 'input';

    // In 'input' mode, show the dropdown only when the cursor is at a non-whitespace
    // position (i.e. the character before the cursor is non-whitespace). This handles
    // typing, deletion, and paste uniformly — the dropdown tracks typing momentum.
    if (!dropdownOpenIsCallback && dropdownMode === 'input') {
      const charBefore = cursorPos > 0 ? text[cursorPos - 1] : '';
      if (!charBefore || charBefore.trim() === '') {
        processInput(text, false);
        closeDropdown();
        return;
      }
    }

    processInput(text, true);
  }, [processInput, dropdownOpenIsCallback, dropdownMode, closeDropdown]);

  const handleCompositionStart = React.useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = React.useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  const restoreUndoEntry = React.useCallback((entry: { value: string; cursorPos: number; selStart?: number } | null) => {
    if (!entry) return;
    currentValueRef.current = entry.value;

    const lexer = new Lexer(entry.value, lexerOptions);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current, parseDateProp)];

    const hasSelection = entry.selStart != null && entry.selStart !== entry.cursorPos;
    if (editorRef.current) {
      const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: entry.cursorPos, tokenClassName: classNames?.token });
      editorRef.current.innerHTML = html;
      if (hasSelection) {
        setSelectionCharRange(editorRef.current, entry.selStart!, entry.cursorPos);
      } else {
        setCaretCharOffset(editorRef.current, entry.cursorPos);
      }
    }

    setTokens(newTokens);
    setAst(newAst);
    setValidationErrors(newErrors);
    setIsEmpty(entry.value.length === 0);
    setCursorOffset(hasSelection ? entry.selStart! : entry.cursorPos);
    setSelectionEnd(entry.cursorPos);
    closeDropdown();

    if (onChange) onChange(entry.value, newAst);
    if (onValidationChange) onValidationChange(newErrors);
  }, [colors, onChange, onValidationChange, closeDropdown]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    // External handler gets first shot; if it preventDefault()s, skip internal handling
    if (onKeyDownProp) onKeyDownProp(e as React.KeyboardEvent<HTMLDivElement>);
    if (e.defaultPrevented) return;

    const s = stateRef.current;

    // Performance: before bulk selection operations on large highlighted DOM,
    // strip spans to plain text so the browser doesn't have to split/merge
    // hundreds of elements. Only triggers for large selections — single-char
    // backspace/delete at a cursor position only touches 1-2 spans and is fast.
    if (editorRef.current && editorRef.current.childNodes.length > 40) {
      const sel = window.getSelection();
      const hasSelection = sel != null && !sel.isCollapsed;

      if (hasSelection) {
        const selRange = getSelectionCharRange(editorRef.current);
        const selectionSize = selRange.end - selRange.start;

        if (selectionSize > 20) {
          const isDestructive = e.key === 'Backspace' || e.key === 'Delete'
            || (e.key === 'x' && (e.ctrlKey || e.metaKey)); // cut
          const willReplace = !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1;

          if (isDestructive || willReplace) {
            editorRef.current.textContent = currentValueRef.current;
            setSelectionCharRange(editorRef.current, selRange.start, selRange.end);
          }
        }
      }
    }

    // Bracket/quote/wildcard wrapping: when text is selected and user types an opening
    // bracket, quote, or * wrap the selection instead of replacing it (VS Code style).
    // Wildcard wrapping (*) only applies to single VALUE/WILDCARD tokens.
    {
      let openChar: string | null = null;
      let closeChar: string | null = null;
      if (WRAP_PAIRS[e.key]) {
        openChar = e.key;
        closeChar = WRAP_PAIRS[e.key];
      } else if (wildcardWrap && e.key === '*' && editorRef.current) {
        const selRange = getSelectionCharRange(editorRef.current);
        if (selRange.start !== selRange.end) {
          const [si, ei] = getTokenIndexRange(s.tokens, selRange.start, selRange.end);
          if (si >= 0 && si === ei) {
            const tok = s.tokens[si];
            if (tok.type === TokenType.VALUE || tok.type === TokenType.WILDCARD) {
              openChar = '*';
              closeChar = '*';
            }
          }
        }
      }
    if (openChar && closeChar && editorRef.current) {
      const selRange = getSelectionCharRange(editorRef.current);
      if (selRange.start !== selRange.end) {
        e.preventDefault();
        const { newValue, newSelStart, newSelEnd } = wrapSelection(
          currentValueRef.current, selRange.start, selRange.end,
          openChar, closeChar,
        );
        // Snapshot pre-surround selection on the current undo entry so undo restores it
        const undo = undoStackRef.current;
        const cur = undo.current();
        if (cur && cur.value === currentValueRef.current) {
          cur.selStart = selRange.start;
          cur.cursorPos = selRange.end;
        }

        currentValueRef.current = newValue;

        // Record post-surround entry with the inner selection
        if (typingGroupTimerRef.current) {
          clearTimeout(typingGroupTimerRef.current);
          typingGroupTimerRef.current = null;
        }
        undo.push({ value: newValue, cursorPos: newSelEnd, selStart: newSelStart });

        const lexer = new Lexer(newValue, lexerOptions);
        const newTokens = lexer.tokenize();
        const parser = new Parser(newTokens);
        const newAst = parser.parse();
        const syntaxErrors = parser.getErrors().map((err: ErrorNode) => ({ message: err.message, start: err.start, end: err.end }));
        const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current, parseDateProp)];

        const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: newSelEnd, tokenClassName: classNames?.token });
        editorRef.current.innerHTML = html;
        setSelectionCharRange(editorRef.current, newSelStart, newSelEnd);

        setTokens(newTokens);
        setAst(newAst);
        setValidationErrors(newErrors);
        setIsEmpty(false);
        setCursorOffset(newSelStart);
        setSelectionEnd(newSelEnd);
        closeDropdown();

        if (onChange) onChange(newValue, newAst);
        if (onValidationChange) onValidationChange(newErrors);
        return;
      }
    }
    }

    // Undo: Ctrl+Z
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      restoreUndoEntry(undoStackRef.current.undo());
      return;
    }

    // Redo: Ctrl+Y or Ctrl+Shift+Z
    if (
      (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
      (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
    ) {
      e.preventDefault();
      restoreUndoEntry(undoStackRef.current.redo());
      return;
    }

    // Ctrl+A: smart select — first press selects token, second selects all
    if (e.key === 'a' && (e.ctrlKey || e.metaKey) && smartSelectAll && editorRef.current) {
      const selRange = getSelectionCharRange(editorRef.current);
      const tokenRange = getSmartSelectRange(s.tokens, selRange.start, selRange.end);
      if (tokenRange) {
        e.preventDefault();
        setSelectionCharRange(editorRef.current, tokenRange.start, tokenRange.end);
        setCursorOffset(tokenRange.start);
        setSelectionEnd(tokenRange.end);
        return;
      }
      // Otherwise fall through to browser default select-all
    }

    // Alt+Shift+Right/Left: expand/shrink selection through AST hierarchy
    if (expandSelection && e.altKey && e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && editorRef.current) {
      const isExpand = e.key === 'ArrowRight';
      let state = expandSelRef.current;

      if (!state) {
        // Build expansion hierarchy from current cursor position
        const selRange = getSelectionCharRange(editorRef.current);
        const ranges = getExpansionRanges(s.ast, s.tokens, selRange.start);
        if (ranges.length === 0) return; // nothing to expand to
        state = { ranges, level: -1 };
        expandSelRef.current = state;
      }

      const newLevel = isExpand
        ? Math.min(state.level + 1, state.ranges.length - 1)
        : Math.max(state.level - 1, -1);

      if (newLevel === state.level) return; // already at boundary
      state.level = newLevel;

      if (newLevel < 0) {
        // Shrunk past first level — collapse to caret
        const selRange = getSelectionCharRange(editorRef.current);
        setCaretCharOffset(editorRef.current, selRange.start);
        expandSelRef.current = null;
      } else {
        e.preventDefault();
        const range = state.ranges[newLevel];
        setSelectionCharRange(editorRef.current, range.start, range.end);
        setCursorOffset(range.start);
        setSelectionEnd(range.end);
      }
      return;
    }

    // Any other key resets the expand/shrink selection state
    expandSelRef.current = null;

    // Ctrl+Space: activate/restore dropdown
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      dropdownTriggerRef.current = 'ctrlSpace';
      if (!dropdownOpenIsCallback && dropdownMode === 'manual') {
        const result = engineRef.current.getSuggestions(s.tokens, s.cursorOffset);
        manualActivationContextRef.current = result.context.type;
      }
      updateSuggestionsFromTokens(s.tokens, s.cursorOffset);
      return;
    }

    // Ctrl+Enter always submits
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      closeDropdown();
      if (onSearch) onSearch(currentValueRef.current, s.ast);
      return;
    }

    // Shift+Enter inserts a newline when multiline is enabled
    if (e.key === 'Enter' && e.shiftKey && multiline) {
      e.preventDefault();
      insertLineBreakAtCursor();
      handleInput();
      return;
    }

    if (s.showDropdown && s.suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(i => Math.min(i + 1, s.suggestions.length - 1));
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(i => Math.max(i - 1, -1));
          return;
        case 'Enter':
          if (s.selectedSuggestionIndex >= 0) {
            const selected = s.suggestions[s.selectedSuggestionIndex];
            if (selected.type === 'hint' && selected.text !== '#' && selected.text !== '!') {
              e.preventDefault();
              closeDropdown();
              const text = currentValueRef.current;
              const offset = s.cursorOffset;
              if (offset <= text.length && text[offset] !== ' ') {
                const before = text.slice(0, offset);
                const after = text.slice(offset);
                const newValue = before + ' ' + after;
                const newPos = offset + 1;
                applyNewValue(newValue, newPos, () => {
                  if (onSearch) onSearch(newValue, s.ast);
                });
              } else {
                if (onSearch) onSearch(text, s.ast);
              }
              return;
            }
            e.preventDefault();
            acceptSuggestion(selected, 'Enter');
            return;
          }
          break;
        case 'Tab': {
          if (onTabProp) {
            e.preventDefault();
            const selectedSugg = s.selectedSuggestionIndex >= 0 ? s.suggestions[s.selectedSuggestionIndex] : null;
            // Filter out non-acceptable suggestion types
            const acceptableSugg = selectedSugg
              && selectedSugg.type !== 'loading'
              && selectedSugg.type !== 'error'
              && !(selectedSugg.type === 'hint' && selectedSugg.text !== '#' && selectedSugg.text !== '!')
              ? selectedSugg : null;
            const ctx = s.cursorContext || { type: 'EMPTY' as const, partial: '' };
            const result = onTabProp({ suggestion: acceptableSugg, cursorContext: ctx, query: currentValueRef.current });
            if (result.accept && acceptableSugg) {
              acceptSuggestion(acceptableSugg, 'Tab', (newValue, newAst) => {
                if (result.submit && onSearch) onSearch(newValue, newAst);
                if (result.blur) editorRef.current?.blur();
              });
            } else {
              closeDropdown();
              if (result.submit && onSearch) onSearch(currentValueRef.current, s.ast);
              if (result.blur) editorRef.current?.blur();
            }
            return;
          }
          // Default Tab behavior: accept suggestion if selected
          if (s.selectedSuggestionIndex >= 0) {
            const selected = s.suggestions[s.selectedSuggestionIndex];
            if (selected.type === 'hint' && selected.text !== '#' && selected.text !== '!') {
              e.preventDefault();
              closeDropdown();
              const text = currentValueRef.current;
              const offset = s.cursorOffset;
              if (offset <= text.length && text[offset] !== ' ') {
                const before = text.slice(0, offset);
                const after = text.slice(offset);
                const newValue = before + ' ' + after;
                const newPos = offset + 1;
                applyNewValue(newValue, newPos, (newTokens) => {
                  updateSuggestionsFromTokens(newTokens, newPos);
                });
              }
              return;
            }
            e.preventDefault();
            acceptSuggestion(selected, 'Tab');
            return;
          }
          break; // Tab with no selection falls through to browser default
        }
        case 'Escape':
          e.preventDefault();
          closeDropdown();
          return;
      }
    }

    // Tab with no dropdown — onTab intercepts if provided
    if (e.key === 'Tab' && onTabProp) {
      e.preventDefault();
      const ctx = s.cursorContext || { type: 'EMPTY' as const, partial: '' };
      const result = onTabProp({ suggestion: null, cursorContext: ctx, query: currentValueRef.current });
      if (result.submit && onSearch) onSearch(currentValueRef.current, s.ast);
      if (result.blur) editorRef.current?.blur();
      return;
    }

    if (s.showDatePicker && e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      return;
    }

    if (e.key === 'Enter' && !s.showDropdown && !s.showDatePicker) {
      e.preventDefault();
      if (onSearch) onSearch(currentValueRef.current, s.ast);
      return;
    }
  }, [onSearch, closeDropdown, acceptSuggestion, applyNewValue, restoreUndoEntry, multiline, dropdownOpenIsCallback, dropdownMode, updateSuggestionsFromTokens, onKeyDownProp, onTabProp, smartSelectAll, expandSelection]);

  const handleKeyUp = React.useCallback((e: React.KeyboardEvent) => {
    const navKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (navKeys.includes(e.key)) {
      if (!editorRef.current) return;
      const selRange = getSelectionCharRange(editorRef.current);
      setCursorOffset(selRange.start);
      setSelectionEnd(selRange.end);
      triggerSuggestionsFromNavigation(stateRef.current.tokens, selRange.start);
    }
  }, [triggerSuggestionsFromNavigation]);

  const handleFocus = React.useCallback(() => {
    setIsFocused(true);
    onFocusProp?.();
    // Defer suggestion update so isFocused state is committed
    requestAnimationFrame(() => {
      if (editorRef.current) {
        const toks = stateRef.current.tokens;
        if (toks.length > 0) {
          const offset = getCaretCharOffset(editorRef.current);
          triggerSuggestionsFromNavigation(toks, offset);
        } else {
          triggerSuggestionsFromNavigation([], 0);
        }
      }
    });
  }, [handleInput, triggerSuggestionsFromNavigation, onFocusProp]);

  const handleBlur = React.useCallback(() => {
    setIsFocused(false);
    setShowDropdown(false);
    setShowDatePicker(false);
    // Set cursor to -1 so deferred display shows all errors when blurred
    setCursorOffset(-1);
    onBlurProp?.();
  }, [onBlurProp]);

  const handleClick = React.useCallback(() => {
    if (!editorRef.current) return;
    const selRange = getSelectionCharRange(editorRef.current);
    setCursorOffset(selRange.start);
    setSelectionEnd(selRange.end);

    // If selection spans multiple tokens (e.g. triple-click selecting "field:value"),
    // suppress the dropdown — context is ambiguous.
    // Single-token selections (e.g. double-click on field name) proceed normally.
    if (selRange.start !== selRange.end) {
      const [si, ei] = getTokenIndexRange(stateRef.current.tokens, selRange.start, selRange.end);
      if (si !== ei) {
        closeDropdown();
        return;
      }
    }

    triggerSuggestionsFromNavigation(stateRef.current.tokens, selRange.start);
  }, [triggerSuggestionsFromNavigation, closeDropdown]);

  const handlePaste = React.useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = normalizeTypographicChars(e.clipboardData.getData('text/plain'));

    // Break typing group so paste is its own undo entry
    if (typingGroupTimerRef.current) {
      clearTimeout(typingGroupTimerRef.current);
      typingGroupTimerRef.current = null;
    }

    // Insert text at cursor, replacing any selection
    insertTextAtCursor(pastedText);
    handleInput();
  }, [handleInput]);

  const handleDateSelect = React.useCallback((dateStr: string) => {
    const s = stateRef.current;
    // Use the replacement range captured when the date picker was opened,
    // so we always replace the right token regardless of where the cursor
    // has drifted since then (e.g. after clicking inside the picker).
    const saved = datePickerReplaceRef.current;
    const start = saved ? saved.start : s.cursorOffset;
    const end = saved ? saved.end : s.cursorOffset;

    const before = currentValueRef.current.slice(0, start);
    const after = currentValueRef.current.slice(end);

    // Add trailing space when cursor would end up at or near the end of input
    let trailingSpace = '';
    let finalAfter = after;
    if (after.length === 0) {
      // Nothing after — add space
      trailingSpace = ' ';
    } else if (/^[ \t\r\n]+$/.test(after) && !after.startsWith('\\ ')) {
      // Only unescaped whitespace after — trim and add single space
      trailingSpace = ' ';
      finalAfter = '';
    }

    const newValue = before + dateStr + trailingSpace + finalAfter;
    const newCursorPos = before.length + dateStr.length + trailingSpace.length;

    applyNewValue(newValue, newCursorPos, (newTokens) => {
      if (editorRef.current) editorRef.current.focus();
      updateSuggestionsFromTokens(newTokens, newCursorPos);
    });
  }, [applyNewValue, updateSuggestionsFromTokens]);

  // --- Render ---

  const mergedColors = mergeColors(colors);
  const mergedStyleConfig = mergeStyles(stylesProp);
  const containerStyle = getInputContainerStyle(mergedColors, style);
  const editableStyle = {
    ...getEditableStyle(mergedColors, mergedStyleConfig),
    ...(isFocused ? getEditableFocusStyle(mergedStyleConfig) : {}),
  };
  const placeholderStyle = getPlaceholderStyle(mergedColors, mergedStyleConfig);

  return (
    <div ref={containerRef} style={containerStyle} className={cx('ei-container', className, classNames?.container)}>
      <div
        ref={editorRefCallback}
        contentEditable
        suppressContentEditableWarning
        className={cx('ei-editor', classNames?.editor)}
        style={editableStyle}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onClick={handleClick}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck={false}
      />

      {isEmpty && !isFocused ? (
        <div className={cx('ei-placeholder', classNames?.placeholder)} style={placeholderStyle}>{placeholder || 'Search...'}</div>
      ) : null}

      <ValidationSquiggles
        errors={validationErrors}
        editorRef={editorEl}
        cursorOffset={cursorOffset}
        colors={colors}
        styles={stylesProp}
        containerRef={containerRef.current}
        classNames={classNames ? { squiggly: classNames.squiggly, tooltip: classNames.tooltip } : undefined}
      />

      <AutocompleteDropdown
        suggestions={suggestions}
        selectedIndex={selectedSuggestionIndex}
        onSelect={(s: Suggestion) => acceptSuggestion(s, 'Tab')}
        position={dropdownPosition}
        colors={colors}
        styles={stylesProp}
        visible={showDropdown}
        fixedWidth={getDropdownFixedWidth()}
        renderHistoryItem={renderHistoryItem}
        renderSavedSearchItem={renderSavedSearchItem}
        renderDropdownHeader={renderDropdownHeader}
        cursorContext={cursorContext}
        classNames={classNames ? { dropdown: classNames.dropdown, dropdownHeader: classNames.dropdownHeader, dropdownItem: classNames.dropdownItem } : undefined}
      />

      {showDatePicker && dropdownPosition ? (
        <DatePickerPortal
          position={dropdownPosition}
          colors={mergedColors}
          onSelect={handleDateSelect}
          colorConfig={colors}
          styleConfig={stylesProp}
          datePickerInit={datePickerInit}
          fixedWidth={undefined}
          datePresets={datePresetsProp}
          datePickerClassName={classNames?.datePicker}
        />
      ) : null}
    </div>
  );
}
