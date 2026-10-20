import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Suggestion, isAcceptableSuggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';
import { getVisibleViewport } from '../utils/viewport';

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
/** Space between the input box and the bar (px). */
const BAR_GAP = 4;
/** Height assumed for the flip decision before the bar has been measured. */
const BAR_HEIGHT_ESTIMATE = 46;

export interface BarPosition {
  /** Document y of the bar's top edge (below) or bottom edge (above). */
  top: number;
  left: number;
  width: number;
  /** Flipped above the input: `top` anchors the bottom edge. */
  above: boolean;
}

/**
 * Where the bar goes for an anchor (the input container): its full width,
 * `BAR_GAP` below its bottom edge, or above its top edge when the visible
 * viewport has no room below and more room above.
 */
export function getBarPosition(anchorRect: DOMRect, barHeight: number, viewport = getVisibleViewport(), scrollX = window.scrollX, scrollY = window.scrollY): BarPosition {
  const roomBelow = viewport.top + viewport.height - anchorRect.bottom - BAR_GAP;
  const roomAbove = anchorRect.top - viewport.top - BAR_GAP;
  const above = roomBelow < barHeight && roomAbove > roomBelow;
  return {
    top: above ? anchorRect.top + scrollY - BAR_GAP : anchorRect.bottom + scrollY + BAR_GAP,
    left: anchorRect.left + scrollX,
    width: anchorRect.width,
    above,
  };
}

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
  /** The input container the bar is anchored to. */
  anchorRef: React.RefObject<HTMLElement>;
  /** The bar element (for focus-within checks). */
  elRef?: (el: HTMLDivElement | null) => void;
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
 * The compact alternative to the floating dropdown (sheet presentation): a
 * row floating under the input while the editor is focused, with a button
 * that opens the sheet and the acceptable suggestions as tappable chips. A
 * body portal positioned like the dropdown, so the input box never changes
 * size and shrink-to-fit parents (table cells) never widen to the chips.
 */
export function SuggestionBar({
  suggestions, selectedIndex, datePicker, idle, sheetOpen, menuOpen, onSelect, onToggleSheet, onToggleMenu, colors, styles, className, anchorRef, elRef,
}: SuggestionBarProps) {
  const chips = datePicker ? [] : suggestions.map((s, i) => ({ s, i })).filter(({ s }) => isAcceptableSuggestion(s));
  const label = barStatusLabel(suggestions, datePicker, idle);

  // Portal container
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    portalRef.current = container;
    forceRender();
    return () => {
      document.body.removeChild(container);
      portalRef.current = null;
    };
  }, []);

  // Position: under (or above) the anchor, re-read after every render — the
  // editor grows with its text — and on scroll, resize, the visual viewport
  // (keyboard) and the anchor's own size
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<BarPosition | null>(null);
  const updatePosition = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const next = getBarPosition(anchor.getBoundingClientRect(), barRef.current?.offsetHeight || BAR_HEIGHT_ESTIMATE);
    setPos(p => (p && p.top === next.top && p.left === next.left && p.width === next.width && p.above === next.above) ? p : next);
  }, [anchorRef]);
  React.useLayoutEffect(() => { updatePosition(); });
  React.useEffect(() => {
    const vv = window.visualViewport;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    vv?.addEventListener('resize', updatePosition);
    vv?.addEventListener('scroll', updatePosition);
    const anchor = anchorRef.current;
    const ro = typeof ResizeObserver !== 'undefined' && anchor ? new ResizeObserver(updatePosition) : null;
    if (anchor) ro?.observe(anchor);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      vv?.removeEventListener('resize', updatePosition);
      vv?.removeEventListener('scroll', updatePosition);
      ro?.disconnect();
    };
  }, [anchorRef, updatePosition]);

  // The strip's scroll position survives a remount of the same list (a
  // re-render leaves the live position alone), and starts over for a new list
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const scrollLeftRef = React.useRef(0);
  const lastElRef = React.useRef<HTMLDivElement | null>(null);
  const lastListRef = React.useRef(suggestions);
  // The strip fades out at an edge that hides more chips
  const [fade, setFade] = React.useState({ left: false, right: false });
  const updateFade = (el: HTMLElement) => {
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade(f => (f.left === left && f.right === right ? f : { left, right }));
  };
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
    updateFade(el);
  });
  const fadeMask = fade.left || fade.right
    ? `linear-gradient(to right, ${fade.left ? 'transparent, #000 24px' : '#000'}, ${fade.right ? '#000 calc(100% - 24px), transparent' : '#000'})`
    : undefined;

  const setBarRef = React.useCallback((el: HTMLDivElement | null) => {
    barRef.current?.removeEventListener('touchstart', cancelTouchStart);
    barRef.current = el;
    el?.addEventListener('touchstart', cancelTouchStart, { passive: false });
    elRef?.(el);
  }, [elRef]);

  // The control a pointer is down on shows a pressed state (the cancelled
  // touchstart suppresses :active and the tap highlight); cleared on release,
  // on cancel, and as soon as a pan starts
  const [pressed, setPressed] = React.useState<string | null>(null);
  const keyOf = (button: HTMLButtonElement | null): string | null => {
    if (!button) return null;
    if (button.classList.contains('ei-bar-open')) return 'open';
    if (button.classList.contains('ei-bar-more')) return 'more';
    return `chip-${button.getAttribute('data-chip')}`;
  };

  // Touch and pen gestures (mouse keeps the native click): a pan that starts
  // in the strip scrolls it; a tap activates the button it landed on
  const gestureRef = React.useRef<TouchGesture | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    if (e.pointerType === 'mouse') {
      setPressed(keyOf(target.closest('button')));
      return;
    }
    // The whole row is the hit zone: a touch on the padding above or below a
    // control counts for the control at that x (the row is 44px+, the controls 36px)
    const bar = e.currentTarget.getBoundingClientRect();
    const under = target.closest('button') ? target : (document.elementFromPoint(e.clientX, bar.top + bar.height / 2) ?? target);
    const strip = under.closest<HTMLElement>('.ei-bar-chips');
    const button = under.closest('button');
    gestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScrollLeft: strip?.scrollLeft ?? 0,
      moved: false,
      strip,
      button,
    };
    setPressed(keyOf(button));
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic event) */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    if (!g.moved && Math.abs(dx) > TAP_SLOP) {
      g.moved = true;
      setPressed(null);
    }
    if (g.moved && g.strip) g.strip.scrollLeft = g.startScrollLeft - dx;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setPressed(null);
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
  const onPointerCancel = () => { gestureRef.current = null; setPressed(null); };

  const pressedStyle = (key: string, fill: boolean): React.CSSProperties =>
    pressed === key ? { transform: 'scale(0.97)', ...(fill ? { backgroundColor: colors.dropdownHover } : { filter: 'brightness(0.9)' }) } : {};

  const buttonBase: React.CSSProperties = {
    transition: 'transform 80ms ease-out, filter 80ms ease-out, background-color 80ms ease-out',
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

  // eslint-disable-next-line react-hooks/refs -- portal container gate (see AutocompleteDropdown)
  if (!portalRef.current) return null;

  const content = (
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
      onPointerLeave={() => setPressed(null)}
      style={{
        position: 'absolute',
        top: pos ? `${pos.top}px` : 0,
        left: pos ? `${pos.left}px` : 0,
        width: pos ? `${pos.width}px` : undefined,
        transform: pos?.above ? 'translateY(-100%)' : undefined,
        visibility: pos ? 'visible' : 'hidden', // measured before it is shown
        zIndex: styles.dropdownZIndex,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '44px',
        // The 4px gap plus the input's own bottom padding keep the chips
        // clear of Android's caret handle (~13px below the text line)
        padding: '4px 8px',
        boxSizing: 'border-box',
        minWidth: 0,
        backgroundColor: colors.background,
        color: colors.text,
        border: `1px solid ${styles.dropdownBorderColor}`,
        borderRadius: styles.dropdownBorderRadius,
        boxShadow: styles.dropdownShadow,
        fontFamily: styles.fontFamily,
        userSelect: 'none',
        touchAction: 'none', // pointer events keep coming (no pointercancel for a pan)
      }}
    >
      <button
        type="button"
        className="ei-bar-open"
        aria-expanded={sheetOpen}
        data-pressed={pressed === 'open' || undefined}
        onClick={onToggleSheet}
        style={{ ...buttonBase, backgroundColor: 'transparent', color: colors.text, display: 'inline-flex', alignItems: 'center', gap: '6px', ...pressedStyle('open', true) }}
      >
        <span>{label}</span>
        <span aria-hidden style={{ fontSize: '10px' }}>{sheetOpen ? '▾' : '▴'}</span>
      </button>
      {chips.length > 0 && (
        <div
          className="ei-bar-chips"
          ref={stripRef}
          onScroll={e => { scrollLeftRef.current = e.currentTarget.scrollLeft; updateFade(e.currentTarget); }}
          style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', flex: 1, minWidth: 0, overscrollBehaviorX: 'contain', maskImage: fadeMask, WebkitMaskImage: fadeMask }}
        >
          {chips.map(({ s, i }, chipIdx) => {
            const selected = i === selectedIndex;
            return (
              <button
                key={i}
                type="button"
                data-chip={chipIdx}
                className={cx('ei-chip', selected && 'ei-chip--selected')}
                data-pressed={pressed === `chip-${chipIdx}` || undefined}
                onClick={e => onSelect(s, e)}
                style={{
                  ...buttonBase,
                  backgroundColor: selected ? colors.dropdownSelected : colors.dropdownHover,
                  color: selected ? '#ffffff' : colors.text,
                  borderColor: selected ? colors.dropdownSelected : styles.dropdownBorderColor,
                  ...pressedStyle(`chip-${chipIdx}`, false),
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
        data-pressed={pressed === 'more' || undefined}
        onClick={onToggleMenu}
        style={{ ...buttonBase, padding: 0, width: '36px', marginLeft: 'auto', backgroundColor: 'transparent', color: colors.text, fontSize: '20px', lineHeight: 1, ...pressedStyle('more', true) }}
      >
        ⋯
      </button>
    </div>
  );

  // eslint-disable-next-line react-hooks/refs -- portal target: guarded non-null above
  return ReactDOM.createPortal(content, portalRef.current);
}
