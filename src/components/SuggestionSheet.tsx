import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig } from '../types';
import { getVisibleViewport, VisibleViewport } from '../utils/viewport';

interface SuggestionSheetProps {
  title: string;
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
 * Bottom sheet for the sheet presentation: pinned to the bottom of the
 * visible viewport (so it sits above the on-screen keyboard), capped to a
 * little over half of it, with a header and a scrolling body.
 */
export function SuggestionSheet({
  title, onClose, colors, styles, className, children, elRef, bodyRef, selectedChildIndex,
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
  const sheetStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${viewport.left}px`,
    width: `${viewport.width}px`,
    bottom: `${bottomInset}px`,
    maxHeight: `${Math.round(viewport.height * 0.55)}px`,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    zIndex: styles.dropdownZIndex,
    backgroundColor: colors.background,
    color: colors.text,
    borderTop: `1px solid ${styles.dropdownBorderColor}`,
    borderRadius: '12px 12px 0 0',
    boxShadow: styles.dropdownShadow,
    fontFamily: styles.fontFamily,
  };

  const content = (
    <div
      className={cx('ei-sheet', className)}
      style={sheetStyle}
      ref={el => elRef?.(el)}
      // Keep the editor focused while interacting with the sheet
      onMouseDown={e => e.preventDefault()}
    >
      <div className="ei-sheet-header" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 4px 4px 16px', borderBottom: `1px solid ${styles.dropdownBorderColor}`, flexShrink: 0,
      }}>
        <span style={{ fontSize: styles.dropdownItemFontSize, fontWeight: 600 }}>{title}</span>
        <button
          type="button"
          className="ei-sheet-close"
          aria-label="Close"
          onClick={onClose}
          style={{
            width: '44px', height: '44px', border: 'none', background: 'transparent', color: colors.text,
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
  );

  // eslint-disable-next-line react-hooks/refs -- portal target: guarded non-null above
  return ReactDOM.createPortal(content, portalRef.current);
}
