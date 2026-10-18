import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';
import { getVisibleViewport, VisibleViewport } from '../utils/viewport';

/** Visible area left above the sheet, so the page is still recognizable behind the backdrop. */
const TOP_GAP = 48;

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
}

/**
 * Bottom sheet for the sheet presentation. The user opted in by tapping the
 * bar, so it takes nearly the whole visible viewport (above the on-screen
 * keyboard; it follows visual-viewport changes), over a backdrop that closes
 * it on tap. Header with title, the current query and a close button; a
 * scrolling body.
 */
export function SuggestionSheet({
  title, detail, onClose, colors, styles, className, children, elRef, bodyRef, selectedChildIndex,
}: SuggestionSheetProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const bodyElRef = React.useRef<HTMLDivElement | null>(null);
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  const [viewport, setViewport] = React.useState<VisibleViewport>(getVisibleViewport);

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

  // Follow the visual viewport: the keyboard opening/closing and pinch zoom
  React.useEffect(() => {
    const update = () => setViewport(getVisibleViewport());
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);

  React.useEffect(() => {
    if (selectedChildIndex == null || !bodyElRef.current) return;
    const item = bodyElRef.current.children[selectedChildIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedChildIndex]);

  // eslint-disable-next-line react-hooks/refs -- portal container gate (see AutocompleteDropdown)
  if (!portalRef.current) return null;

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
  };
  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${viewport.left}px`,
    width: `${viewport.width}px`,
    top: `${viewport.top + TOP_GAP}px`,
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
  };

  const content = (
    <>
      <div className="ei-sheet-backdrop" style={backdropStyle} onMouseDown={keepFocus} onClick={onClose} />
      <div className={cx('ei-sheet', className)} style={sheetStyle} ref={el => elRef?.(el)} onMouseDown={keepFocus}>
        <div className="ei-sheet-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          padding: '4px 4px 4px 16px', borderBottom: `1px solid ${styles.dropdownBorderColor}`, flexShrink: 0,
        }}>
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

  // eslint-disable-next-line react-hooks/refs -- portal target: guarded non-null above
  return ReactDOM.createPortal(content, portalRef.current);
}
