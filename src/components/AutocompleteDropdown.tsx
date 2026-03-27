import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';

// Inject spinner keyframes once
if (typeof document !== 'undefined') {
  const styleId = 'elastic-input-keyframes';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '@keyframes elastic-input-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
}
import { ColorConfig, StyleConfig, HistoryEntry, SavedSearch } from '../types';
import { CursorContext } from '../parser/Parser';
import {
  mergeColors,
  mergeStyles,
  getDropdownStyle,
  getDropdownItemStyle,
  getDropdownItemLabelStyle,
  getDropdownItemDescStyle,
  getDropdownItemTypeStyle,
} from '../styles/inlineStyles';

interface AutocompleteDropdownProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  onSelect: (suggestion: Suggestion) => void;
  position: { top: number; left: number } | null;
  colors?: ColorConfig;
  styles?: StyleConfig;
  visible: boolean;
  /** When set, the dropdown uses this fixed width instead of min/max width constraints. */
  fixedWidth?: number;
  renderHistoryItem?: (entry: HistoryEntry, isSelected: boolean) => React.ReactNode | null | undefined;
  renderSavedSearchItem?: (search: SavedSearch, isSelected: boolean) => React.ReactNode | null | undefined;
  renderDropdownHeader?: (context: CursorContext) => React.ReactNode | null | undefined;
  cursorContext?: CursorContext | null;
  /** Ref callback to expose the dropdown list element for page-size calculations. */
  listRefCallback?: (el: HTMLDivElement | null) => void;
  /** Custom class names for dropdown elements. */
  classNames?: {
    dropdown?: string;
    dropdownHeader?: string;
    dropdownItem?: string;
  };
}

function highlightMatch(text: string, partial: string | undefined, isSelected: boolean): React.ReactNode {
  if (!partial || partial.length === 0) return text;

  const lower = text.toLowerCase();
  const partialLower = partial.toLowerCase();
  const idx = lower.indexOf(partialLower);

  if (idx === -1) return text;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + partial.length);
  const after = text.slice(idx + partial.length);

  const matchStyle: React.CSSProperties = {
    fontWeight: 700,
    textDecoration: 'underline',
    textDecorationColor: isSelected ? 'rgba(255,255,255,0.6)' : '#0969da',
    textUnderlineOffset: '2px',
  };

  return <>{before}<span className="ei-highlight-match" style={matchStyle}>{match}</span>{after}</>;
}

export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  colors,
  styles,
  visible,
  fixedWidth,
  renderHistoryItem,
  renderSavedSearchItem,
  renderDropdownHeader,
  cursorContext,
  listRefCallback,
  classNames,
}: AutocompleteDropdownProps) {
  const portalRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Create/destroy portal container
  React.useEffect(() => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    portalRef.current = container;
    return () => {
      document.body.removeChild(container);
      portalRef.current = null;
    };
  }, []);

  // Compute header content (must be stable across render + effect)
  const headerContent = renderDropdownHeader && cursorContext
    ? renderDropdownHeader(cursorContext)
    : null;
  const hasHeader = headerContent != null;

  // Scroll selected item into view (offset by 1 if header is present)
  React.useEffect(() => {
    if (listRef.current) {
      const childIdx = hasHeader ? selectedIndex + 1 : selectedIndex;
      const item = listRef.current.children[childIdx] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, hasHeader]);

  if (!portalRef.current || !visible || suggestions.length === 0 || !position) {
    return null;
  }

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);
  const dropdownStyle: React.CSSProperties = {
    ...getDropdownStyle(mergedColors, mergedStyles),
    top: `${position.top}px`,
    left: `${position.left}px`,
    ...(fixedWidth != null ? { width: `${fixedWidth}px`, minWidth: 'unset', maxWidth: 'unset' } : {}),
  };

  const content = (
    <div className={cx('ei-dropdown', classNames?.dropdown)} style={dropdownStyle} ref={el => { listRef.current = el; listRefCallback?.(el); }} onMouseDown={e => e.preventDefault()}>
      {hasHeader && (
        <div className={cx('ei-dropdown-header', classNames?.dropdownHeader)} style={{
          padding: mergedStyles.dropdownItemPadding || '4px 10px',
          fontSize: '11px',
          color: mergedColors.placeholder,
          borderBottom: `1px solid ${mergedColors.dropdownHover}`,
          userSelect: 'none',
        }}>
          {headerContent}
        </div>
      )}
      {suggestions.map((suggestion, i) => {
        const isSelected = i === selectedIndex;
        const itemStyle = getDropdownItemStyle(isSelected, mergedColors, mergedStyles);

        // Special hint items (#saved-search, !history) — clickable to insert the trigger char
        if (suggestion.type === 'hint' && (suggestion.text === '#' || suggestion.text === '!')) {
          return (
            <div
              key={i}
              className={cx('ei-dropdown-item', 'ei-dropdown-item--hint', isSelected && 'ei-dropdown-item--selected', classNames?.dropdownItem)}
              style={{ ...itemStyle, opacity: isSelected ? 1 : 0.7 }}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
                (e.currentTarget as HTMLElement).style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
                (e.currentTarget as HTMLElement).style.opacity = isSelected ? '1' : '0.7';
              }}
            >
              <span className="ei-dropdown-item-label" style={getDropdownItemLabelStyle(isSelected)}>{suggestion.label}</span>
              {suggestion.description && (
                <span className="ei-dropdown-item-desc" style={getDropdownItemDescStyle(isSelected)}>{suggestion.description}</span>
              )}
            </div>
          );
        }

        // Error indicator
        if (suggestion.type === 'error') {
          return (
            <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--error', classNames?.dropdownItem)} style={{ ...itemStyle, cursor: 'default', opacity: 0.8 }}>
              <span className="ei-dropdown-item-label" style={{ ...getDropdownItemLabelStyle(false), color: mergedColors.error }}>
                {suggestion.label || 'Error loading suggestions'}
              </span>
            </div>
          );
        }

        // No-results indicator (custom content from renderNoResults)
        if (suggestion.type === 'noResults') {
          return (
            <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--no-results', classNames?.dropdownItem)} style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>
              {suggestion.customContent}
            </div>
          );
        }

        // Loading indicator
        if (suggestion.type === 'loading') {
          return (
            <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--loading', classNames?.dropdownItem)} style={{ ...itemStyle, cursor: 'default', opacity: 0.6, justifyContent: 'center' }}>
              <span className="ei-dropdown-item-label" style={{ ...getDropdownItemLabelStyle(false), fontStyle: 'italic' }}>
                {suggestion.label || 'Searching...'}
              </span>
              <span className="ei-dropdown-spinner" style={{ marginLeft: '6px', display: 'inline-block', animation: 'elastic-input-spin 1s linear infinite', width: '14px', height: '14px', border: '2px solid', borderColor: `${mergedColors.placeholder} transparent ${mergedColors.placeholder} transparent`, borderRadius: '50%' }} />
            </div>
          );
        }

        // Non-interactive hints (freeform type hints like "Enter a number")
        if (suggestion.type === 'hint') {
          const hintStyle = getDropdownItemStyle(false, mergedColors, mergedStyles);
          return (
            <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--hint', classNames?.dropdownItem)} style={{ ...hintStyle, cursor: 'default', opacity: suggestion.customContent ? 1 : 0.6 }}>
              {suggestion.customContent
                ? suggestion.customContent
                : <span className="ei-dropdown-item-label" style={getDropdownItemLabelStyle(isSelected)}>{suggestion.label}</span>
              }
            </div>
          );
        }

        // History items — custom renderer or default vertical 2-line layout
        if (suggestion.type === 'history') {
          const customContent = renderHistoryItem && suggestion.sourceData
            ? renderHistoryItem(suggestion.sourceData as HistoryEntry, isSelected)
            : null;

          const rawQuery = suggestion.text.startsWith('(') && suggestion.text.endsWith(')')
            ? suggestion.text.slice(1, -1)
            : suggestion.text;
          const hasExplicitLabel = suggestion.label !== rawQuery;

          return (
            <div
              key={i}
              className={cx('ei-dropdown-item', 'ei-dropdown-item--history', isSelected && 'ei-dropdown-item--selected', classNames?.dropdownItem)}
              style={{ ...itemStyle, flexDirection: 'column', alignItems: 'flex-start' }}
              title={hasExplicitLabel ? suggestion.text : undefined}
              onClick={() => onSelect(suggestion)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
              }}
            >
              {customContent != null ? customContent : (
                <>
                  <span className="ei-dropdown-item-label" style={{
                    ...getDropdownItemLabelStyle(isSelected),
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    whiteSpace: 'normal',
                    wordBreak: 'break-all',
                    width: '100%',
                  }}>
                    {highlightMatch(suggestion.label, suggestion.matchPartial, isSelected)}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    {suggestion.description != null && (
                      <span className="ei-dropdown-item-desc" style={{ ...getDropdownItemDescStyle(isSelected), flex: 1 }}>{suggestion.description}</span>
                    )}
                    <span className="ei-dropdown-item-type" style={{ ...getDropdownItemTypeStyle(isSelected, mergedStyles), marginLeft: 'auto' }}>history</span>
                  </span>
                </>
              )}
            </div>
          );
        }

        // Saved search items — custom renderer or default layout
        if (suggestion.type === 'savedSearch' && renderSavedSearchItem && suggestion.sourceData) {
          const customContent = renderSavedSearchItem(suggestion.sourceData as SavedSearch, isSelected);
          if (customContent != null) {
            return (
              <div
                key={i}
                className={cx('ei-dropdown-item', 'ei-dropdown-item--saved-search', isSelected && 'ei-dropdown-item--selected', classNames?.dropdownItem)}
                style={itemStyle}
                onClick={() => onSelect(suggestion)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
                }}
              >
                {customContent}
              </div>
            );
          }
        }

        const itemTypeModifier = suggestion.type === 'savedSearch' ? 'ei-dropdown-item--saved-search' : undefined;
        return (
          <div
            key={i}
            className={cx('ei-dropdown-item', itemTypeModifier, isSelected && 'ei-dropdown-item--selected', classNames?.dropdownItem)}
            style={itemStyle}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
            }}
          >
            <span className="ei-dropdown-item-label" style={getDropdownItemLabelStyle(isSelected)}>
              {highlightMatch(suggestion.label, suggestion.matchPartial, isSelected)}
            </span>
            {suggestion.description && (
              <span className="ei-dropdown-item-desc" style={getDropdownItemDescStyle(isSelected)}>{suggestion.description}</span>
            )}
            {suggestion.type && suggestion.type !== 'hint' && (
              <span className="ei-dropdown-item-type" style={getDropdownItemTypeStyle(isSelected, mergedStyles)}>{suggestion.type}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(content, portalRef.current);
}
