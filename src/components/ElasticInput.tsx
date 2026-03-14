import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Lexer } from '../lexer/Lexer';
import { Token } from '../lexer/tokens';
import { Parser } from '../parser/Parser';
import { ASTNode, ErrorNode } from '../parser/ast';
import { AutocompleteEngine } from '../autocomplete/AutocompleteEngine';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { Validator, ValidationError } from '../validation/Validator';
import { ElasticInputProps, ElasticInputAPI, ColorConfig, StyleConfig } from '../types';
import { buildHighlightedHTML } from './HighlightedContent';
import { findMatchingParen } from '../highlighting/parenMatch';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { DateRangePicker } from './DateRangePicker';
import { ValidationSquiggles } from './ValidationSquiggles';
import { getCaretCharOffset, setCaretCharOffset, getSelectionCharRange } from '../utils/cursorUtils';
import { getCaretRect, getDropdownPosition } from '../utils/domUtils';
import { getPlainText } from '../utils/textUtils';
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

interface DatePickerPortalProps {
  position: { top: number; left: number };
  colors: Required<ColorConfig>;
  onSelect: (dateStr: string) => void;
  colorConfig?: ColorConfig;
  styleConfig?: StyleConfig;
}

function DatePickerPortal({ position, colors, onSelect, colorConfig, styleConfig }: DatePickerPortalProps) {
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
  };

  return ReactDOM.createPortal(
    <div style={style} onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>
      <DateRangePicker onSelect={onSelect} colors={colorConfig} styles={styleConfig} />
    </div>,
    portalRef.current
  );
}

// ---------------------------------------------------------------------------
// ElasticInput — main component
// ---------------------------------------------------------------------------

export function ElasticInput(props: ElasticInputProps) {
  const {
    fields, onSearch, onChange, onValidationChange, value, defaultValue,
    savedSearches, searchHistory, fetchSuggestions: fetchSuggestionsProp,
    colors, styles: stylesProp, placeholder, className, style,
    suggestDebounceMs, maxSuggestions, showSavedSearchHint, showHistoryHint,
    inputRef,
  } = props;

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

  // Mutable refs for engine/validator so they stay current without re-renders
  const engineRef = React.useRef<AutocompleteEngine>(
    new AutocompleteEngine(
      fields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint }
    )
  );
  const validatorRef = React.useRef(new Validator(fields));

  // --- State ---
  const [tokens, setTokens] = React.useState<Token[]>([]);
  const [ast, setAst] = React.useState<ASTNode | null>(null);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = React.useState(0);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number } | null>(null);
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);
  const [isFocused, setIsFocused] = React.useState(false);
  const [isEmpty, setIsEmpty] = React.useState(!currentValueRef.current);
  const [cursorOffset, setCursorOffset] = React.useState(0);
  const [selectionEnd, setSelectionEnd] = React.useState(0);
  const [autocompleteContext, setAutocompleteContext] = React.useState('');

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

  const processInput = React.useCallback((text: string, updateDropdown: boolean) => {
    const lexer = new Lexer(text);
    const newTokens = lexer.tokenize();
    const parser = new Parser(newTokens);
    const newAst = parser.parse();
    const syntaxErrors = parser.getErrors().map((e: ErrorNode) => ({ message: e.message, start: e.start, end: e.end }));
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst)];

    if (editorRef.current) {
      const offset = getCaretCharOffset(editorRef.current);
      const html = buildHighlightedHTML(newTokens, colors, { cursorOffset: offset });
      editorRef.current.innerHTML = html;
      setCaretCharOffset(editorRef.current, offset);

      setTokens(newTokens);
      setAst(newAst);
      setValidationErrors(newErrors);
      setIsEmpty(text.length === 0);
      setCursorOffset(offset);

      if (updateDropdown) {
        updateSuggestionsFromTokens(newTokens, offset);
      }
    } else {
      setTokens(newTokens);
      setAst(newAst);
      setValidationErrors(newErrors);
      setIsEmpty(text.length === 0);
    }

    if (onChange) onChange(text, newAst);
    if (onValidationChange) onValidationChange(newErrors);
  }, [colors, onChange, onValidationChange]);

  const updateSuggestionsFromTokens = React.useCallback((toks: Token[], offset: number) => {
    const result = engineRef.current.getSuggestions(toks, offset);
    const contextType = result.context.type;

    if (result.showDatePicker) {
      setSuggestions([]);
      setShowDropdown(false);
      setAutocompleteContext(contextType);
      requestAnimationFrame(() => {
        const rect = getCaretRect();
        setShowDatePicker(true);
        setDropdownPosition(rect ? getDropdownPosition(rect, 350, 300) : null);
      });
      return;
    }

    const newSuggestions = result.suggestions;

    if (newSuggestions.length > 0) {
      setSuggestions(newSuggestions);
      setShowDropdown(false);
      setShowDatePicker(false);
      setSelectedSuggestionIndex(0);
      setAutocompleteContext(contextType);
      requestAnimationFrame(() => {
        const rect = getCaretRect();
        setShowDropdown(true);
        setDropdownPosition(rect ? getDropdownPosition(rect, newSuggestions.length * 32, 300) : null);
      });
    } else {
      setShowDropdown(false);
      setShowDatePicker(false);
      setSuggestions([]);
      setAutocompleteContext(contextType);
    }

    // Handle async fetchSuggestions
    if (fetchSuggestionsProp && result.context.type === 'FIELD_VALUE' && result.context.fieldName) {
      const fieldName = result.context.fieldName;
      const partial = result.context.partial;
      const debounceMs = suggestDebounceMs || DEFAULT_DEBOUNCE_MS;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const fetchedSuggestions = await fetchSuggestionsProp!(fieldName, partial);
          const token = result.context.token;
          const start = token ? token.start : offset;
          const end = token ? token.end : offset;
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
            setSelectedSuggestionIndex(0);
            requestAnimationFrame(() => {
              const rect = getCaretRect();
              setShowDropdown(true);
              setDropdownPosition(rect ? getDropdownPosition(rect, mapped.length * 32, 300) : null);
            });
          }
        } catch (e) {
          // Silently ignore fetch errors
        }
      }, debounceMs);
    }
  }, [fetchSuggestionsProp, suggestDebounceMs]);

  const closeDropdown = React.useCallback(() => {
    setShowDropdown(false);
    setShowDatePicker(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(0);
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
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst)];

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
    const trailingSpace = (isCompleteTerm && after.length === 0) ? ' ' : '';
    const newValue = before + suggestion.text + trailingSpace + after;
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

  // Rebuild engine/validator when fields change
  React.useEffect(() => {
    engineRef.current = new AutocompleteEngine(
      fields, [], [],
      maxSuggestions || DEFAULT_MAX_SUGGESTIONS,
      { showSavedSearchHint, showHistoryHint }
    );
    validatorRef.current = new Validator(fields);
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
  }, [fields, maxSuggestions, showSavedSearchHint, showHistoryHint]);

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

  // Cleanup debounce timer
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Re-render highlighted HTML when cursor moves (for paren matching)
  const prevParenMatchRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!editorRef.current || !isFocused) return;
    const currentTokens = stateRef.current.tokens;
    if (currentTokens.length === 0) return;

    // Compute new match and compare to previous to avoid unnecessary DOM updates
    const match = findMatchingParen(currentTokens, cursorOffset);
    const matchKey = match ? `${match.openStart},${match.closeStart}` : null;
    if (matchKey === prevParenMatchRef.current) return;
    prevParenMatchRef.current = matchKey;

    const savedOffset = getCaretCharOffset(editorRef.current);
    const html = buildHighlightedHTML(currentTokens, colors, { cursorOffset });
    editorRef.current.innerHTML = html;
    setCaretCharOffset(editorRef.current, savedOffset);
  }, [cursorOffset, isFocused, colors]);

  // --- Event handlers ---

  const handleInput = React.useCallback(() => {
    if (isComposingRef.current) return;
    if (!editorRef.current) return;
    // Skip undo recording if this input was triggered by undo/redo
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    const text = getPlainText(editorRef.current);
    const cursorPos = getCaretCharOffset(editorRef.current);
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
    const newErrors = [...syntaxErrors, ...validatorRef.current.validate(newAst)];

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
    const s = stateRef.current;

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

    // Ctrl+Enter always submits
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      closeDropdown();
      if (onSearch) onSearch(currentValueRef.current, s.ast);
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
          setSelectedSuggestionIndex(i => Math.max(i - 1, 0));
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          acceptSuggestion(s.suggestions[s.selectedSuggestionIndex], e.key);
          return;
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
  }, [onSearch, closeDropdown, acceptSuggestion, restoreUndoEntry]);

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
  }, [updateSuggestionsFromTokens]);

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
    const pastedText = e.clipboardData.getData('text/plain');

    // Break typing group so paste is its own undo entry
    if (typingGroupTimerRef.current) {
      clearTimeout(typingGroupTimerRef.current);
      typingGroupTimerRef.current = null;
    }

    // Insert text via execCommand so it respects cursor/selection
    document.execCommand('insertText', false, pastedText);

    // handleInput will fire and record this as a new undo group
  }, []);

  const handleDateSelect = React.useCallback((dateStr: string) => {
    const s = stateRef.current;
    const result = engineRef.current.getSuggestions(s.tokens, s.cursorOffset);
    const token = result.context.token;
    const start = token ? token.start : s.cursorOffset;
    const end = token ? token.end : s.cursorOffset;

    const before = currentValueRef.current.slice(0, start);
    const after = currentValueRef.current.slice(end);
    const newValue = before + dateStr + after;
    const newCursorPos = before.length + dateStr.length;

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
      />

      {showDatePicker && dropdownPosition ? (
        <DatePickerPortal
          position={dropdownPosition}
          colors={mergedColors}
          onSelect={handleDateSelect}
          colorConfig={colors}
          styleConfig={stylesProp}
        />
      ) : null}
    </div>
  );
}
