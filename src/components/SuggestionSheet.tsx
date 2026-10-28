import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';
import { getVisibleViewport, VisibleViewport } from '../utils/viewport';
import { useBodyPortal } from '../utils/useBodyPortal';
import { useReposition } from '../utils/useReposition';
import { useMatchMedia } from '../utils/useMatchMedia';
import { ensureStyle } from '../utils/domUtils';

/** Visible area left above the sheet, so the page is still recognizable behind the backdrop. */
const TOP_GAP = 48;
/** A downward drag of the header past this (px) closes the sheet. */
const DISMISS_DRAG = 80;

ensureStyle('elastic-input-sheet-keyframes', '@keyframes elastic-input-sheet-up { from { transform: translateY(32px); opacity: 0; } } @keyframes elastic-input-fade-in { from { opacity: 0; } }');

const sameViewport = (a: VisibleViewport, b: VisibleViewport) =>
  a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;

interface SuggestionSheetProps {
  title: string;
  /** Shown under the title — the query being completed, since the sheet covers the input. */
  detail?: string;
  onClose: () => void;
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
  className?: string;
  children: React.ReactNode;
  /** The sheet element (for focus-within checks). */
  elRef?: (el: HTMLDivElement | null) => void;
  /** The scrolling body (the suggestion list, for keyboard paging). */
  bodyRef?: (el: HTMLDivElement | null) => void;
  /** Child of the body to keep scrolled into view (the highlighted row). */
  selectedChildIndex?: number;
  /** Size to the content, bottom-anchored, instead of nearly the whole viewport (short lists such as the actions menu). */
  fit?: boolean;
}

/**
 * Bottom sheet for the sheet presentation. The user opted in by tapping the
 * bar, so it takes nearly the whole visible viewport (above the on-screen
 * keyboard; it follows visual-viewport changes), over a backdrop that closes
 * it on tap. Header with a drag handle, title, the current query and a close
 * button; a scrolling body. A downward swipe on the header closes it too.
 */
export function SuggestionSheet({
  title, detail, onClose, colors, styles, className, children, elRef, bodyRef, selectedChildIndex, fit,
}: SuggestionSheetProps) {
  const portal = useBodyPortal();
  const sheetElRef = React.useRef<HTMLDivElement | null>(null);
  const bodyElRef = React.useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = React.useState<VisibleViewport>(getVisibleViewport);
  const reducedMotion = useMatchMedia('(prefers-reduced-motion: reduce)');

  // Follow the visual viewport: the keyboard opening/closing and pinch zoom
  useReposition(() => {
    const next = getVisibleViewport();
    setViewport(v => (sameViewport(v, next) ? v : next));
  });

  // Layout effect: the scroll lands in the same commit as the highlight (§7.10)
  React.useLayoutEffect(() => {
    if (selectedChildIndex == null || !bodyElRef.current) return;
    const item = bodyElRef.current.children[selectedChildIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedChildIndex]);

  // Swipe down on the header to dismiss (touch and pen; the sheet follows the
  // finger, then snaps back or closes)
  const dragRef = React.useRef<{ pointerId: number; startY: number } | null>(null);
  const setDragOffset = (dy: number) => { if (sheetElRef.current) sheetElRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : ''; };
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic event) */ }
  };
  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setDragOffset(e.clientY - d.startY);
  };
  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragOffset(0);
    if (e.clientY - d.startY > DISMISS_DRAG) onClose();
  };
  const onHeaderPointerCancel = () => { dragRef.current = null; setDragOffset(0); };

  if (!portal) return null;

  const bottomInset = Math.max(0, window.innerHeight - (viewport.top + viewport.height));
  // Keep the editor focused (and the keyboard up) while interacting with either layer
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${viewport.left}px`,
    width: `${viewport.width}px`,
    top: `${viewport.top}px`,
    bottom: `${bottomInset}px`,
    zIndex: styles.dropdownZIndex,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    animation: reducedMotion ? undefined : 'elastic-input-fade-in 180ms ease-out',
  };
  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${viewport.left}px`,
    width: `${viewport.width}px`,
    top: fit ? 'auto' : `${viewport.top + TOP_GAP}px`,
    maxHeight: fit ? `${viewport.height - TOP_GAP}px` : undefined,
    bottom: `${bottomInset}px`,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    zIndex: styles.dropdownZIndex + 1,
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: '12px 12px 0 0',
    boxShadow: styles.dropdownShadow,
    fontFamily: styles.fontFamily,
    animation: reducedMotion ? undefined : 'elastic-input-sheet-up 180ms ease-out',
  };

  const content = (
    <>
      <div className="ei-sheet-backdrop" style={backdropStyle} onMouseDown={keepFocus} onClick={onClose} />
      <div
        className={cx('ei-sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={sheetStyle}
        ref={el => { sheetElRef.current = el; elRef?.(el); }}
        onMouseDown={keepFocus}
      >
        <div
          className="ei-sheet-header"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerCancel}
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            padding: '10px 4px 4px 16px', borderBottom: `1px solid ${styles.dropdownBorderColor}`, flexShrink: 0,
            touchAction: 'none',
          }}
        >
          <div className="ei-sheet-handle" aria-hidden style={{
            position: 'absolute', top: '4px', left: '50%', width: '36px', height: '4px', marginLeft: '-18px',
            borderRadius: '2px', backgroundColor: styles.dropdownBorderColor,
          }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: styles.dropdownItemFontSize, fontWeight: 600 }}>{title}</div>
            {detail ? (
              <div className="ei-sheet-detail" style={{
                fontSize: styles.dropdownItemFontSize, color: colors.placeholder,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {detail}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="ei-sheet-close"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: '44px', height: '44px', flexShrink: 0, border: 'none', background: 'transparent', color: colors.text,
              fontSize: '26px', lineHeight: 1, cursor: 'pointer', borderRadius: '8px',
            }}
          >
            ×
          </button>
        </div>
        <div
          className="ei-sheet-body"
          ref={el => { bodyElRef.current = el; bodyRef?.(el); }}
          style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', flex: 1, paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {children}
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(content, portal);
}
