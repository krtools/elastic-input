import * as React from 'react';
import { Suggestion, isAcceptableSuggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';

/**
 * What the bar's button says for the current suggestion list: a count of
 * acceptable items, the state message when there is nothing to accept, or
 * "Suggestions" while nothing is open (nothing requested yet, or dismissed).
 */
export function barStatusLabel(suggestions: Suggestion[], datePicker: boolean, idle = false): string {
  if (datePicker) return 'Pick a date';
  if (idle) return 'Suggestions';
  const acceptable = suggestions.filter(isAcceptableSuggestion).length;
  if (acceptable > 0) return `${acceptable} suggestion${acceptable === 1 ? '' : 's'}`;
  const first = suggestions[0];
  if (!first) return 'No suggestions';
  if (first.type === 'loading') return first.label || 'Searching...';
  if (first.type === 'error') return first.label || 'Error loading suggestions';
  if (first.type === 'noResults') return 'No matches';
  return first.label || 'No suggestions';
}

/** Movement (px) beyond which a touch is a pan, not a tap. */
export const TAP_SLOP = 6;

interface SuggestionBarProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  /** The date picker, rather than a suggestion list, is what the sheet would show. */
  datePicker: boolean;
  /** Nothing is open: the button offers to request suggestions. */
  idle: boolean;
  sheetOpen: boolean;
  menuOpen: boolean;
  onSelect: (suggestion: Suggestion, event: React.MouseEvent) => void;
  onToggleSheet: () => void;
  onToggleMenu: () => void;
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
  className?: string;
}

interface TouchGesture {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  moved: boolean;
  /** The chip strip, when the touch started inside it (a pan scrolls it). */
  strip: HTMLElement | null;
  /** The button under the finger at touch start (a tap activates it). */
  button: HTMLButtonElement | null;
}

// Cancelling touchstart keeps the browser's gesture recognizer out of the bar.
// Android Chrome attributes a long press on a chip to the editable text just
// above it (touch adjustment) and starts a caret drag with the magnifier; with
// the touch consumed there is no long press, no text selection, no native
// scroll and no synthetic mouse/click. Pan and tap are rebuilt from pointer
// events below. React's own touch listeners are passive, hence the native one.
const cancelTouchStart = (e: TouchEvent) => { e.preventDefault(); };

/**
 * The compact, in-flow alternative to the floating dropdown (sheet
 * presentation): a row under the text, shown while the editor is focused,
 * with a button that opens the sheet and the acceptable suggestions as
 * tappable chips.
 */
export function SuggestionBar({
  suggestions, selectedIndex, datePicker, idle, sheetOpen, menuOpen, onSelect, onToggleSheet, onToggleMenu, colors, styles, className,
}: SuggestionBarProps) {
  const chips = datePicker ? [] : suggestions.map((s, i) => ({ s, i })).filter(({ s }) => isAcceptableSuggestion(s));
  const label = barStatusLabel(suggestions, datePicker, idle);
  // Android's caret handle reaches ~13px below the text line; on coarse
  // pointers the row keeps 12px of top padding so the chips sit under it
  const [coarsePointer] = React.useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches);

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

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const setBarRef = React.useCallback((el: HTMLDivElement | null) => {
    barRef.current?.removeEventListener('touchstart', cancelTouchStart);
    barRef.current = el;
    el?.addEventListener('touchstart', cancelTouchStart, { passive: false });
  }, []);

  // Touch and pen gestures (mouse keeps the native click): a pan that starts
  // in the strip scrolls it; a tap activates the button it landed on
  const gestureRef = React.useRef<TouchGesture | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    const target = e.target as Element;
    const strip = target.closest<HTMLElement>('.ei-bar-chips');
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: strip?.scrollLeft ?? 0,
      moved: false,
      strip,
      button: target.closest('button'),
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic event) */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    if (!g.moved && Math.abs(dx) > TAP_SLOP) g.moved = true;
    if (g.moved && g.strip) g.strip.scrollLeft = g.startScrollLeft - dx;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (g.moved || !g.button?.isConnected) return;
    if (g.button.classList.contains('ei-bar-open')) {
      onToggleSheet();
      return;
    }
    if (g.button.classList.contains('ei-bar-more')) {
      onToggleMenu();
      return;
    }
    const chip = chips[Number(g.button.getAttribute('data-chip'))];
    if (chip) onSelect(chip.s, e);
  };
  const onPointerCancel = () => { gestureRef.current = null; };

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
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitUserDrag: 'none',
    WebkitTouchCallout: 'none',
  } as React.CSSProperties;

  return (
    <div
      className={cx('ei-bar', className)}
      ref={setBarRef}
      // Keep the editor focused (and the keyboard up) while clicking the bar
      onMouseDown={e => e.preventDefault()}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        flex: '1 1 100%',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '44px',
        padding: coarsePointer ? '12px 8px 4px' : '4px 8px',
        borderTop: `1px solid ${styles.dropdownBorderColor}`,
        boxSizing: 'border-box',
        minWidth: 0,
        userSelect: 'none',
        touchAction: 'none', // pointer events keep coming (no pointercancel for a pan)
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
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0, overscrollBehaviorX: 'contain' }}
        >
          {chips.map(({ s, i }, chipIdx) => {
            const selected = i === selectedIndex;
            return (
              <button
                key={i}
                type="button"
                data-chip={chipIdx}
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
      <button
        type="button"
        className="ei-bar-more"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
        style={{ ...buttonBase, padding: 0, width: '36px', marginLeft: 'auto', backgroundColor: 'transparent', color: colors.text, fontSize: '20px', lineHeight: 1 }}
      >
        ⋯
      </button>
    </div>
  );
}
