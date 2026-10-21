import * as React from 'react';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { cx } from '../utils/cx';
import { ColorConfig, StyleConfig, HistoryEntry, SavedSearch, SuggestionItem } from '../types';
import {
  getDropdownItemStyle,
  getDropdownItemLabelStyle,
  getDropdownItemDescStyle,
  getDropdownItemTypeStyle,
} from '../styles/inlineStyles';
import { ensureStyle } from '../utils/domUtils';

ensureStyle('elastic-input-keyframes', '@keyframes elastic-input-spin { to { transform: rotate(360deg); } }');

export function highlightMatch(text: string, partial: string | undefined, isSelected: boolean): React.ReactNode {
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

/** The optional context header above a suggestion list (`dropdown.renderHeader`). */
export function renderSuggestionHeader(
  content: React.ReactNode,
  colors: Required<ColorConfig>,
  styles: Required<StyleConfig>,
  className?: string,
): React.ReactNode {
  if (content == null) return null;
  return (
    <div className={cx('ei-dropdown-header', className)} style={{
      padding: styles.dropdownItemPadding || '4px 10px',
      fontSize: '11px',
      color: colors.placeholder,
      borderBottom: `1px solid ${colors.dropdownHover}`,
      userSelect: 'none',
    }}>
      {content}
    </div>
  );
}

export interface SuggestionItemsOptions {
  suggestions: Suggestion[];
  selectedIndex: number;
  onSelect: (suggestion: Suggestion, event: React.MouseEvent) => void;
  colors: Required<ColorConfig>;
  styles: Required<StyleConfig>;
  renderHistoryItem?: (entry: HistoryEntry, isSelected: boolean) => React.ReactNode | null | undefined;
  renderSavedSearchItem?: (search: SavedSearch, isSelected: boolean) => React.ReactNode | null | undefined;
  /** Controls the type badge in items. false=hide, true=default, callback=custom. */
  renderType?: boolean | ((type: string, suggestion: SuggestionItem) => React.ReactNode | null | undefined);
  itemClassName?: string;
  /** Minimum row height — touch presentations use taller rows than the pointer dropdown. */
  minHeight?: number;
}

/**
 * The suggestion rows, shared by the floating dropdown and the sheet. Pure
 * rendering: positioning, scrolling and focus handling belong to the caller.
 */
export function renderSuggestionItems({
  suggestions, selectedIndex, onSelect, colors: mergedColors, styles: mergedStyles,
  renderHistoryItem, renderSavedSearchItem, renderType, itemClassName, minHeight,
}: SuggestionItemsOptions): React.ReactNode[] {
  const sizing: React.CSSProperties = minHeight ? { minHeight: `${minHeight}px`, boxSizing: 'border-box' } : {};

  return suggestions.map((suggestion, i) => {
    const isSelected = i === selectedIndex;
    const itemStyle = { ...getDropdownItemStyle(isSelected, mergedColors, mergedStyles), ...sizing };

    // --- Helpers shared across item types ---

    const itemProps = (typeModifier?: string, extraStyle?: React.CSSProperties, title?: string) => ({
      className: cx('ei-dropdown-item', typeModifier, isSelected && 'ei-dropdown-item--selected', itemClassName),
      style: { ...itemStyle, ...extraStyle },
      title,
      onClick: (e: React.MouseEvent) => onSelect(suggestion, e),
      onMouseEnter: (e: React.MouseEvent) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
      },
      onMouseLeave: (e: React.MouseEvent) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
      },
    });

    const typeBadge = (extraStyle?: React.CSSProperties) => {
      if (renderType === false || !suggestion.type || suggestion.type === 'hint') return null;
      const content = typeof renderType === 'function'
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Suggestion.description is a documented `any` (may hold a ReactNode)
        ? renderType(suggestion.type, { text: suggestion.text, label: suggestion.label, description: suggestion.description, type: suggestion.type })
        : suggestion.type;
      return content != null ? (
        <span className="ei-dropdown-item-type" style={{ ...getDropdownItemTypeStyle(isSelected, mergedStyles), ...extraStyle }}>{content}</span>
      ) : null;
    };

    const twoRowStyle = { flexDirection: 'column' as const, alignItems: 'flex-start' as const };
    const secondRowStyle = { display: 'flex' as const, alignItems: 'center' as const, gap: mergedStyles.dropdownItemContentGap, width: '100%' };

    // --- Item type branches ---

    // Special hint items (#saved-search, !history) — clickable to insert the trigger char
    if (suggestion.type === 'hint' && (suggestion.text === '#' || suggestion.text === '!')) {
      return (
        <div
          key={i}
          {...itemProps('ei-dropdown-item--hint', { opacity: isSelected ? 1 : 0.7 })}
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
        <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--error', itemClassName)} style={{ ...itemStyle, cursor: 'default', opacity: 0.8 }}>
          <span className="ei-dropdown-item-label" style={{ ...getDropdownItemLabelStyle(false), color: mergedColors.error }}>
            {suggestion.label || 'Error loading suggestions'}
          </span>
        </div>
      );
    }

    // No-results indicator (custom content from renderNoResults)
    if (suggestion.type === 'noResults') {
      return (
        <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--no-results', itemClassName)} style={{ ...itemStyle, cursor: 'default', opacity: 0.7 }}>
          {suggestion.customContent}
        </div>
      );
    }

    // Loading indicator
    if (suggestion.type === 'loading') {
      return (
        <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--loading', itemClassName)} style={{ ...itemStyle, cursor: 'default', opacity: 0.6, justifyContent: 'center' }}>
          <span className="ei-dropdown-item-label" style={{ ...getDropdownItemLabelStyle(false), fontStyle: 'italic' }}>
            {suggestion.label || 'Searching...'}
          </span>
          <span className="ei-dropdown-spinner" style={{ marginLeft: '6px', display: 'inline-block', animation: 'elastic-input-spin 1s linear infinite', width: '14px', height: '14px', border: '2px solid', borderColor: `${mergedColors.placeholder} transparent ${mergedColors.placeholder} transparent`, borderRadius: '50%' }} />
        </div>
      );
    }

    // Non-interactive hints (freeform type hints like "Enter a number")
    if (suggestion.type === 'hint') {
      const hintStyle = { ...getDropdownItemStyle(false, mergedColors, mergedStyles), ...sizing };
      return (
        <div key={i} className={cx('ei-dropdown-item', 'ei-dropdown-item--hint', itemClassName)} style={{ ...hintStyle, cursor: 'default', opacity: suggestion.customContent ? 1 : 0.6 }}>
          {suggestion.customContent
            ? suggestion.customContent
            : <span className="ei-dropdown-item-label" style={getDropdownItemLabelStyle(isSelected)}>{suggestion.label}</span>
          }
        </div>
      );
    }

    // Custom renderers for history / saved search (bypass default layout)
    if (suggestion.type === 'history' && renderHistoryItem && suggestion.sourceData) {
      const customContent = renderHistoryItem(suggestion.sourceData as HistoryEntry, isSelected);
      if (customContent != null) {
        return <div key={i} {...itemProps('ei-dropdown-item--history', twoRowStyle)}>{customContent}</div>;
      }
    }
    if (suggestion.type === 'savedSearch' && renderSavedSearchItem && suggestion.sourceData) {
      const customContent = renderSavedSearchItem(suggestion.sourceData as SavedSearch, isSelected);
      if (customContent != null) {
        return <div key={i} {...itemProps('ei-dropdown-item--saved-search')}>{customContent}</div>;
      }
    }

    // Two-row layout — history and saved searches with a description
    const isTwoRow = (suggestion.type === 'history' || suggestion.type === 'savedSearch') && suggestion.description != null;
    if (isTwoRow) {
      const typeModifier = suggestion.type === 'history' ? 'ei-dropdown-item--history' : 'ei-dropdown-item--saved-search';
      // Show tooltip when label differs from the inserted text
      let title: string | undefined;
      const rawText = suggestion.text.startsWith('(') && suggestion.text.endsWith(')')
        ? suggestion.text.slice(1, -1) : suggestion.text;
      if (suggestion.label !== rawText) title = suggestion.text;

      return (
        <div key={i} {...itemProps(typeModifier, twoRowStyle, title)}>
          <span className="ei-dropdown-item-label" style={{
            ...getDropdownItemLabelStyle(isSelected),
            width: '100%',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-all' as const,
          }}>
            {highlightMatch(suggestion.label, suggestion.matchPartial, isSelected)}
          </span>
          <span style={secondRowStyle}>
            <span className="ei-dropdown-item-desc" style={{ ...getDropdownItemDescStyle(isSelected), flex: 1 }}>{suggestion.description}</span>
            {typeBadge({ marginLeft: 'auto' })}
          </span>
        </div>
      );
    }

    // Default single-row layout (fields, values, operators, saved searches without date)
    const itemTypeModifier = suggestion.type === 'savedSearch' ? 'ei-dropdown-item--saved-search' : undefined;
    return (
      <div key={i} {...itemProps(itemTypeModifier)}>
        <span className="ei-dropdown-item-label" style={getDropdownItemLabelStyle(isSelected)}>
          {highlightMatch(suggestion.label, suggestion.matchPartial, isSelected)}
        </span>
        {suggestion.description && (
          <span className="ei-dropdown-item-desc" style={getDropdownItemDescStyle(isSelected)}>{suggestion.description}</span>
        )}
        {typeBadge()}
      </div>
    );
  });
}

/** Header + rows as a component, for callers that render them as JSX. */
export function SuggestionList({ header, headerClassName, ...items }: SuggestionItemsOptions & { header?: React.ReactNode; headerClassName?: string }) {
  return (
    <>
      {renderSuggestionHeader(header, items.colors, items.styles, headerClassName)}
      {renderSuggestionItems(items)}
    </>
  );
}
