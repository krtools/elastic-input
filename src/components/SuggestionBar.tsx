import * as React from 'react';
import { Suggestion, isAcceptableSuggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';

/**
 * What the bar's button says for the current suggestion list: a count of
 * acceptable items, or the state message when there is nothing to accept.
 */
export function barStatusLabel(suggestions: Suggestion[], datePicker: boolean): string {
  if (datePicker) return 'Pick a date';
  const acceptable = suggestions.filter(isAcceptableSuggestion).length;
  if (acceptable > 0) return `${acceptable} suggestion${acceptable === 1 ? '' : 's'}`;
  const first = suggestions[0];
  if (!first) return 'No suggestions';
  if (first.type === 'loading') return first.label || 'Searching...';
  if (first.type === 'error') return first.label || 'Error loading suggestions';
  if (first.type === 'noResults') return 'No matches';
  return first.label || 'No suggestions';
}

interface SuggestionBarProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  /** The date picker, rather than a suggestion list, is what the sheet would show. */
  datePicker: boolean;
  sheetOpen: boolean;
  onSelect: (suggestion: Suggestion, event: React.MouseEvent) => void;
  onToggleSheet: () => void;
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
  className?: string;
}

/**
 * The compact, in-flow alternative to the floating dropdown (sheet
 * presentation): a row under the text, shown while the editor is focused,
 * with a button that opens the sheet and the acceptable suggestions as
 * tappable chips.
 */
export function SuggestionBar({
  suggestions, selectedIndex, datePicker, sheetOpen, onSelect, onToggleSheet, colors, styles, className,
}: SuggestionBarProps) {
  const chips = datePicker ? [] : suggestions.map((s, i) => ({ s, i })).filter(({ s }) => isAcceptableSuggestion(s));
  const label = barStatusLabel(suggestions, datePicker);

  // The strip's scroll position survives a remount of the same list (a
  // re-render leaves the live position alone), and starts over for a new list
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const scrollLeftRef = React.useRef(0);
  const lastElRef = React.useRef<HTMLDivElement | null>(null);
  const lastListRef = React.useRef(suggestions);
  React.useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    if (lastListRef.current !== suggestions) {
      lastListRef.current = suggestions;
      scrollLeftRef.current = 0;
      el.scrollLeft = 0;
    } else if (el === lastElRef.current) {
      scrollLeftRef.current = el.scrollLeft; // the DOM is the truth between renders
    } else {
      el.scrollLeft = scrollLeftRef.current; // remounted: restore
    }
    lastElRef.current = el;
  });

  const buttonBase: React.CSSProperties = {
    fontFamily: styles.fontFamily,
    fontSize: styles.dropdownItemFontSize,
    lineHeight: 1.2,
    border: `1px solid ${styles.dropdownBorderColor}`,
    borderRadius: '999px',
    padding: '0 12px',
    minHeight: '36px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    // A press that lingers before the swipe must not become a long-press
    // drag or text selection (Android showed a ghost chip being dragged)
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitUserDrag: 'none',
    WebkitTouchCallout: 'none',
    touchAction: 'pan-x',
  } as React.CSSProperties;

  return (
    <div
      className={cx('ei-bar', className)}
      // Keep the editor focused (and the keyboard up) while tapping the bar
      onMouseDown={e => e.preventDefault()}
      style={{
        flex: '1 1 100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '44px',
        padding: '4px 8px',
        borderTop: `1px solid ${styles.dropdownBorderColor}`,
        boxSizing: 'border-box',
        minWidth: 0,
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        className="ei-bar-open"
        aria-expanded={sheetOpen}
        onClick={onToggleSheet}
        style={{ ...buttonBase, backgroundColor: 'transparent', color: colors.text, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <span>{label}</span>
        <span aria-hidden style={{ fontSize: '10px' }}>{sheetOpen ? '▾' : '▴'}</span>
      </button>
      {chips.length > 0 && (
        <div
          className="ei-bar-chips"
          ref={stripRef}
          onScroll={e => { scrollLeftRef.current = e.currentTarget.scrollLeft; }}
          onContextMenu={e => e.preventDefault()} // the long-press menu would end the swipe
          // A horizontal swipe here pans the strip, not the page or a text selection
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0, touchAction: 'pan-x', overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {chips.map(({ s, i }) => {
            const selected = i === selectedIndex;
            return (
              <button
                key={i}
                type="button"
                className={cx('ei-chip', selected && 'ei-chip--selected')}
                onClick={e => onSelect(s, e)}
                style={{
                  ...buttonBase,
                  backgroundColor: selected ? colors.dropdownSelected : colors.dropdownHover,
                  color: selected ? '#ffffff' : colors.text,
                  borderColor: selected ? colors.dropdownSelected : styles.dropdownBorderColor,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
