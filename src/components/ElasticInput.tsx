import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Lexer } from '../lexer/Lexer';
import { Token } from '../lexer/tokens';
import { Parser } from '../parser/Parser';
import { ASTNode, ErrorNode } from '../parser/ast';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { Validator, ValidationError } from '../validation/Validator';
import { ElasticInputProps, ElasticInputAPI, ColorConfig, StyleConfig, FieldConfig } from '../types';
import { buildHighlightedHTML } from './HighlightedContent';
import { findMatchingParen } from '../highlighting/parenMatch';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { DateRangePicker } from './DateRangePicker';
import { ValidationSquiggles } from './ValidationSquiggles';
import { parseDate } from '../utils/dateUtils';
import { getCaretCharOffset, setCaretCharOffset, getSelectionCharRange, setSelectionCharRange } from '../utils/cursorUtils';
import { getCaretRect, getDropdownPosition, insertTextAtCursor, insertLineBreakAtCursor } from '../utils/domUtils';
import { getPlainText, WRAP_PAIRS, wrapSelection, normalizeTypographicChars } from '../utils/textUtils';
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
export function computeDatePickerInit(context: { type: string; partial?: string; token?: { value: string } }): DatePickerInit | null {
  if (context.type === 'RANGE' && context.token) {
    const raw = context.token.value;
    const hasClosed = raw.endsWith(']') || raw.endsWith('}');
    const inner = hasClosed ? raw.slice(1, -1) : raw.slice(1);
    const toMatch = inner.match(/^(.*?)\s+[Tt][Oo]\s+(.*)$/);
    if (toMatch) {
      const lower = parseDate(toMatch[1].trim());
      const upper = parseDate(toMatch[2].trim());
      return { mode: 'range', start: lower, end: upper };
    }
  }
  if (context.type === 'FIELD_VALUE' && context.partial) {
    const date = parseDate(context.partial);
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
}

function DatePickerPortal({ position, colors, onSelect, colorConfig, styleConfig, datePickerInit, fixedWidth }: DatePickerPortalProps) {
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
    <div style={style} onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>
      <DateRangePicker
        onSelect={onSelect}
        colors={colorConfig}
        styles={styleConfig}
        initialMode={datePickerInit?.mode}
        initialStart={datePickerInit?.start}
        initialEnd={datePickerInit?.end}
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
    colors, styles: stylesProp, placeholder, className, style,
    suggestDebounceMs, maxSuggestions, showSavedSearchHint, showHistoryHint,
    multiline: multilineProp, dropdownAlignToInput, dropdownMode: dropdownModeProp,
    inputRef, renderFieldHint, renderHistoryItem, renderSavedSearchItem,
    onKeyDown: onKeyDownProp, validateValue,
  } = props;

  const dropdownMode = dropdownModeProp ?? 'always';

  const multiline = multilineProp !== false; // default true

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
  const isUndoRedoRef = React.useRef(false);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const highlightTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const asyncActiveRef = React.useRef(false); // true while an async fetch cycle is in progress
  const datePickerInitRef = React.useRef<DatePickerInit | null>(null);
  const datePickerReplaceRef = React.useRef<{ start: number; end: number } | null>(null);
  // For 'manual' dropdown mode: tracks the context type for which the dropdown
  // was activated via Ctrl+Space. Reset when context changes.
  const manualActivationContextRef = React.useRef<string | null>(null);
  // Stable ref to the latest updateSuggestionsFromTokens so processInput (defined
  // earlier) always calls the current version without a stale closure.
  const updateSuggestionsRef = React.useRef<(toks: Token[], offset: number) => void>(() => {});

  // Mutable refs for engine/validator so they stay current without re-renders
  const engineRef = React.useRef<AutocompleteEngine>(
    new AutocompleteEngine(
      initialFields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint },
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
  const [datePickerInit, setDatePickerInit] = React.useState<DatePickerInit | null>(null);

  // Keep refs to latest state values needed in callbacks
  const stateRef = React.useRef({
    tokens, ast, suggestions, selectedSuggestionIndex, showDropdown, showDatePicker,
    cursorOffset, selectionEnd, autocompleteContext, validationErrors,
  });
  stateRef.current = {
    tokens, ast, suggestions, selectedSuggestionIndex, showDropdown, showDatePicker,
    cursorOffset, selectionEnd, autocompleteContext, validationErrors,
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
    // Full-width mode only applies to the suggestion dropdown, not custom
    // dropdowns like date pickers — those stay compact and caret-relative.
    const useContainerAlign = dropdownAlignToInput && kind !== 'datePicker';

    if (useContainerAlign) {
      // Container-relative: position is stable, set synchronously
      setShowDropdown(true);
      setDropdownPosition(computeDropdownPosition(height, width));
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
      const pos = rect ? getDropdownPosition(rect, height, width) : null;
      setDropdownPosition(pos);
    });
  }, [dropdownAlignToInput, computeDropdownPosition]);

  // Threshold: above this token count, debounce the expensive innerHTML replacement
  const HIGHLIGHT_DEBOUNCE_THRESHOLD = 80;
  const HIGHLIGHT_DEBOUNCE_MS = 60;

  const applyHighlight = React.useCallback((tokens: Token[], offset: number) => {
    if (!editorRef.current) return;
    const html = buildHighlightedHTML(tokens, colors, { cursorOffset: offset });
    editorRef.current.innerHTML = html;
    setCaretCharOffset(editorRef.current, offset);
  }, [colors]);

  const processInput = React.useCallback((text: string, updateDropdown: boolean) => {
    const lexer = new Lexer(text);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current)];

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
    const contextType = result.context.type;

    // Dropdown mode gating
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

    // Determine if this context will trigger an async fetch
    // Only fields with asyncSearch: true get the immediate "Searching..." treatment
    const resolvedField = result.context.fieldName
      ? engineRef.current.resolveField(result.context.fieldName)
      : undefined;
    const willFetchAsync = !!(
      fetchSuggestionsProp &&
      result.context.type === 'FIELD_VALUE' &&
      result.context.fieldName &&
      resolvedField?.asyncSearch
    );

    if (result.showDatePicker) {
      // Context changed to date picker — cancel any async cycle
      asyncActiveRef.current = false;
      abortControllerRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      // Parse range bounds for pre-populating the date picker
      const init = computeDatePickerInit(result.context);
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
      // First entry into an async field — show "Searching..." immediately
      // instead of flashing the sync hint (e.g. "Search companies...").
      const token = result.context.token;
      const start = token ? token.start : offset;
      const end = token ? token.end : offset;
      const asyncLabel = resolvedField?.asyncSearchLabel;
      const loadingLabel = typeof asyncLabel === 'function'
        ? asyncLabel(result.context.partial)
        : asyncLabel || 'Searching...';
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

    // Handle async fetchSuggestions
    if (willFetchAsync) {
      // Resolve alias to canonical field name for the fetch callback
      const rawFieldName = result.context.fieldName!;
      const resolved = engineRef.current.resolveField(rawFieldName);
      const fieldName = resolved ? resolved.name : rawFieldName;
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
          const fetchedSuggestions = await fetchSuggestionsProp!(fieldName, partial);

          // Discard stale results — this fetch was aborted
          if (controller.signal.aborted) return;

          const mapped: Suggestion[] = fetchedSuggestions.map(s => ({
            text: s.text,
            label: s.label || s.text,
            description: s.description,
            type: s.type,
            replaceStart: start,
            replaceEnd: end,
            matchPartial: partial,
          }));
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
          // Only close dropdown if this is still the latest request
          if (!controller.signal.aborted) {
            setShowDropdown(false);
            setSuggestions([]);
            asyncActiveRef.current = false;
          }
        }
      }, debounceMs);
    }
  }, [fetchSuggestionsProp, suggestDebounceMs, applyFieldHint, computeDropdownPosition, showDropdownAtPosition, dropdownAlignToInput, dropdownMode]);

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
    // Reset manual activation so next Ctrl+Space re-activates
    manualActivationContextRef.current = null;
  }, []);

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

    const lexer = new Lexer(newValue);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current)];

    if (editorRef.current) {
      const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: newCursorPos });
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

  const acceptSuggestion = React.useCallback((suggestion: Suggestion, key: 'Enter' | 'Tab' = 'Enter') => {
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

      applyNewValue(newValue, newCursorPos, (newTokens) => {
        updateSuggestionsFromTokens(newTokens, newCursorPos);
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
      if (shouldSubmit) {
        if (onSearch) onSearch(newValue, newAst);
      } else {
        updateSuggestionsFromTokens(newTokens, newCursorPos);
      }
    });
  }, [applyNewValue, updateSuggestionsFromTokens, onSearch]);

  // --- Lifecycle ---

  // Load async data
  React.useEffect(() => {
    const loadAsync = async () => {
      if (savedSearches) {
        const data = typeof savedSearches === 'function' ? await savedSearches() : savedSearches;
        engineRef.current.updateSavedSearches(data);
      }
      if (searchHistory) {
        const data = typeof searchHistory === 'function' ? await searchHistory() : searchHistory;
        engineRef.current.updateSearchHistory(data);
      }
    };
    loadAsync();
  }, [savedSearches, searchHistory]);

  // Rebuild engine/validator when resolved fields change
  React.useEffect(() => {
    engineRef.current = new AutocompleteEngine(
      resolvedFields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint },
    );
    validatorRef.current = new Validator(resolvedFields);
    // Re-load async data for new engine
    const loadAsync = async () => {
      if (savedSearches) {
        const data = typeof savedSearches === 'function' ? await savedSearches() : savedSearches;
        engineRef.current.updateSavedSearches(data);
      }
      if (searchHistory) {
        const data = typeof searchHistory === 'function' ? await searchHistory() : searchHistory;
        engineRef.current.updateSearchHistory(data);
      }
    };
    loadAsync();
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
      abortControllerRef.current?.abort();
    };
  }, []);

  // Proactively close dropdown when dropdownMode changes
  React.useEffect(() => {
    if (dropdownMode === 'never') {
      setShowDropdown(false);
      setShowDatePicker(false);
      setSuggestions([]);
    }
    // Reset manual activation when mode changes
    manualActivationContextRef.current = null;
  }, [dropdownMode]);

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
          const height = s.showDatePicker ? 350 : s.suggestions.length * 32;
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
  }, [dropdownAlignToInput]);

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
    const html = buildHighlightedHTML(currentTokens, colors, { cursorOffset: effectiveCursor });
    editorRef.current.innerHTML = html;
    setCaretCharOffset(editorRef.current, savedOffset);
  }, [cursorOffset, selectionEnd, isFocused, colors]);

  // --- Event handlers ---

  const handleInput = React.useCallback(() => {
    if (isComposingRef.current) return;
    if (!editorRef.current) return;
    // Skip undo recording if this input was triggered by undo/redo
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    let text = getPlainText(editorRef.current);
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

    processInput(text, true);
  }, [processInput]);

  const handleCompositionStart = React.useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = React.useCallback(() => {
    isComposingRef.current = false;
    handleInput();
  }, [handleInput]);

  const restoreUndoEntry = React.useCallback((entry: { value: string; cursorPos: number } | null) => {
    if (!entry) return;
    isUndoRedoRef.current = true;
    currentValueRef.current = entry.value;

    const lexer = new Lexer(entry.value);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current)];

    if (editorRef.current) {
      const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: entry.cursorPos });
      editorRef.current.innerHTML = html;
      setCaretCharOffset(editorRef.current, entry.cursorPos);
    }

    setTokens(newTokens);
    setAst(newAst);
    setValidationErrors(newErrors);
    setIsEmpty(entry.value.length === 0);
    setCursorOffset(entry.cursorPos);
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

    // Bracket/quote wrapping: when text is selected and user types an opening
    // bracket or quote, wrap the selection instead of replacing it (VS Code style).
    // Preserves the original selection around the wrapped text.
    if (WRAP_PAIRS[e.key] && editorRef.current) {
      const selRange = getSelectionCharRange(editorRef.current);
      if (selRange.start !== selRange.end) {
        e.preventDefault();
        const { newValue, newSelStart, newSelEnd } = wrapSelection(
          currentValueRef.current, selRange.start, selRange.end,
          e.key, WRAP_PAIRS[e.key],
        );
        currentValueRef.current = newValue;

        // Record as undo entry
        if (typingGroupTimerRef.current) {
          clearTimeout(typingGroupTimerRef.current);
          typingGroupTimerRef.current = null;
        }
        undoStackRef.current.push({ value: newValue, cursorPos: newSelEnd });

        const lexer = new Lexer(newValue);
        const newTokens = lexer.tokenize();
        const parser = new Parser(newTokens);
        const newAst = parser.parse();
        const syntaxErrors = parser.getErrors().map((err: ErrorNode) => ({ message: err.message, start: err.start, end: err.end }));
        const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst, validateValueRef.current)];

        const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: newSelEnd });
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

    // Ctrl+Space: activate dropdown in manual mode
    if (e.key === ' ' && (e.ctrlKey || e.metaKey) && dropdownMode === 'manual') {
      e.preventDefault();
      // Get current context and activate for it
      const result = engineRef.current.getSuggestions(s.tokens, s.cursorOffset);
      manualActivationContextRef.current = result.context.type;
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
        case 'Tab':
          if (s.selectedSuggestionIndex >= 0) {
            const selected = s.suggestions[s.selectedSuggestionIndex];
            // Non-interactive hints can't be accepted — close dropdown and
            // let Tab add a trailing space / Enter submit, matching the
            // behavior of fields with real suggestions.
            if (selected.type === 'hint' && selected.text !== '#' && selected.text !== '!') {
              e.preventDefault();
              closeDropdown();
              // "Exit" the field value: append a trailing space so the
              // cursor lands ready for the next term.
              const text = currentValueRef.current;
              const offset = s.cursorOffset;
              if (offset <= text.length && text[offset] !== ' ') {
                const before = text.slice(0, offset);
                const after = text.slice(offset);
                const newValue = before + ' ' + after;
                applyNewValue(newValue, offset + 1);
                if (e.key === 'Enter' && onSearch) onSearch(newValue, s.ast);
              } else {
                if (e.key === 'Enter' && onSearch) onSearch(text, s.ast);
              }
              return;
            }
            e.preventDefault();
            acceptSuggestion(selected, e.key);
            return;
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeDropdown();
          return;
      }
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
  }, [onSearch, closeDropdown, acceptSuggestion, applyNewValue, restoreUndoEntry, multiline, dropdownMode, updateSuggestionsFromTokens, onKeyDownProp]);

  const handleKeyUp = React.useCallback((e: React.KeyboardEvent) => {
    const navKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
    if (navKeys.includes(e.key)) {
      if (!editorRef.current) return;
      const selRange = getSelectionCharRange(editorRef.current);
      setCursorOffset(selRange.start);
      setSelectionEnd(selRange.end);
      updateSuggestionsFromTokens(stateRef.current.tokens, selRange.start);
    }
  }, [updateSuggestionsFromTokens]);

  const handleFocus = React.useCallback(() => {
    setIsFocused(true);
    // Defer suggestion update so isFocused state is committed
    requestAnimationFrame(() => {
      if (editorRef.current) {
        const toks = stateRef.current.tokens;
        if (toks.length > 0) {
          const offset = getCaretCharOffset(editorRef.current);
          updateSuggestionsFromTokens(toks, offset);
        } else {
          updateSuggestionsFromTokens([], 0);
        }
      }
    });
  }, [handleInput, updateSuggestionsFromTokens]);

  const handleBlur = React.useCallback(() => {
    setIsFocused(false);
    setShowDropdown(false);
    setShowDatePicker(false);
    // Set cursor to -1 so deferred display shows all errors when blurred
    setCursorOffset(-1);
  }, []);

  const handleClick = React.useCallback(() => {
    if (!editorRef.current) return;
    const selRange = getSelectionCharRange(editorRef.current);
    setCursorOffset(selRange.start);
    setSelectionEnd(selRange.end);
    updateSuggestionsFromTokens(stateRef.current.tokens, selRange.start);
  }, [updateSuggestionsFromTokens]);

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
    <div ref={containerRef} style={containerStyle} className={className}>
      <div
        ref={editorRefCallback}
        contentEditable
        suppressContentEditableWarning
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
        <div style={placeholderStyle}>{placeholder || 'Search...'}</div>
      ) : null}

      <ValidationSquiggles
        errors={validationErrors}
        editorRef={editorEl}
        cursorOffset={cursorOffset}
        colors={colors}
        styles={stylesProp}
        containerRef={containerRef.current}
      />

      <AutocompleteDropdown
        suggestions={suggestions}
        selectedIndex={selectedSuggestionIndex}
        onSelect={(s: Suggestion) => acceptSuggestion(s)}
        position={dropdownPosition}
        colors={colors}
        styles={stylesProp}
        visible={showDropdown}
        fixedWidth={getDropdownFixedWidth()}
        renderHistoryItem={renderHistoryItem}
        renderSavedSearchItem={renderSavedSearchItem}
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
        />
      ) : null}
    </div>
  );
}
