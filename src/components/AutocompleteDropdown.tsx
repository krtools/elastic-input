import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';
import { DropdownPosition } from '../utils/domUtils';

import { ColorConfig, StyleConfig, HistoryEntry, SavedSearch, SuggestionItem } from '../types';
import { CursorContext } from '../parser/Parser';
import { mergeColors, mergeStyles, getDropdownStyle } from '../styles/inlineStyles';
import { renderSuggestionItems, renderSuggestionHeader } from './SuggestionItems';

interface AutocompleteDropdownProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  onSelect: (suggestion: Suggestion, event: React.MouseEvent) => void;
  position: DropdownPosition | null;
  colors?: ColorConfig;
  styles?: StyleConfig;
  visible: boolean;
  /** When set, the dropdown uses this fixed width instead of min/max width constraints. */
  fixedWidth?: number;
  /** Minimum row height in px (finger-sized rows on touch devices). */
  itemMinHeight?: number;
  renderHistoryItem?: (entry: HistoryEntry, isSelected: boolean) => React.ReactNode | null | undefined;
  renderSavedSearchItem?: (search: SavedSearch, isSelected: boolean) => React.ReactNode | null | undefined;
  renderDropdownHeader?: (context: CursorContext) => React.ReactNode | null | undefined;
  cursorContext?: CursorContext | null;
  /** Ref callback to expose the dropdown list element for page-size calculations. */
  listRefCallback?: (el: HTMLDivElement | null) => void;
  /** Controls the type badge in dropdown items. false=hide, true=default, callback=custom. */
  renderType?: boolean | ((type: string, suggestion: SuggestionItem) => React.ReactNode | null | undefined);
  /** Custom class names for dropdown elements. */
  classNames?: {
    dropdown?: string;
    dropdownHeader?: string;
    dropdownItem?: string;
  };
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
  itemMinHeight,
  renderHistoryItem,
  renderSavedSearchItem,
  renderDropdownHeader,
  cursorContext,
  listRefCallback,
  renderType,
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

  // eslint-disable-next-line react-hooks/refs -- portal container gate: the ref is only set by the mount effect; reading it during render is how the portal waits for its container
  if (!portalRef.current || !visible || suggestions.length === 0 || !position) {
    return null;
  }

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);
  const dropdownStyle: React.CSSProperties = {
    ...getDropdownStyle(mergedColors, mergedStyles),
    top: `${position.top}px`,
    left: `${position.left}px`,
    // Flipped: `top` anchors the bottom edge (see DropdownPosition in domUtils)
    ...(position.flipped ? { transform: 'translateY(-100%)' } : {}),
    // Never taller than the space on the chosen side (see DropdownPosition.maxHeight)
    ...(position.maxHeight != null ? { maxHeight: `min(${mergedStyles.dropdownMaxHeight}, ${position.maxHeight}px)` } : {}),
    ...(fixedWidth != null ? { width: `${fixedWidth}px`, minWidth: 'unset', maxWidth: 'unset' } : {}),
  };

  const content = (
    <div className={cx('ei-dropdown', classNames?.dropdown)} style={dropdownStyle} ref={el => { listRef.current = el; listRefCallback?.(el); }} onMouseDown={e => e.preventDefault()}>
      {renderSuggestionHeader(headerContent, mergedColors, mergedStyles, classNames?.dropdownHeader)}
      {renderSuggestionItems({
        suggestions, selectedIndex, onSelect, colors: mergedColors, styles: mergedStyles,
        renderHistoryItem, renderSavedSearchItem, renderType, itemClassName: classNames?.dropdownItem, minHeight: itemMinHeight,
      })}
    </div>
  );

  // eslint-disable-next-line react-hooks/refs -- portal target: guarded non-null above; stable for the life of the component
  return ReactDOM.createPortal(content, portalRef.current);
}
