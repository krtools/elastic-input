import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Suggestion } from '../autocomplete/suggestionTypes';
import { ColorConfig, StyleConfig } from '../types';
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

  return React.createElement(React.Fragment, null,
    before,
    React.createElement('span', { style: matchStyle }, match),
    after,
  );
}

export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  position,
  colors,
  styles,
  visible,
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

  // Scroll selected item into view
  React.useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!portalRef.current || !visible || suggestions.length === 0 || !position) {
    return null;
  }

  const mergedColors = mergeColors(colors);
  const mergedStyles = mergeStyles(styles);
  const dropdownStyle = {
    ...getDropdownStyle(mergedColors, mergedStyles),
    top: `${position.top}px`,
    left: `${position.left}px`,
  };

  const content = (
    <div style={dropdownStyle} ref={listRef} onMouseDown={e => e.preventDefault()}>
      {suggestions.map((suggestion, i) => {
        const isSelected = i === selectedIndex;
        const itemStyle = getDropdownItemStyle(isSelected, mergedColors, mergedStyles);

        // Special hint items (#saved-search, !history) — clickable to insert the trigger char
        if (suggestion.type === 'hint' && (suggestion.text === '#' || suggestion.text === '!')) {
          return (
            <div
              key={i}
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
              <span style={getDropdownItemLabelStyle(isSelected)}>{suggestion.label}</span>
              {suggestion.description && (
                <span style={getDropdownItemDescStyle(isSelected)}>{suggestion.description}</span>
              )}
            </div>
          );
        }

        // Non-interactive hints (freeform type hints like "Enter a number")
        if (suggestion.type === 'hint') {
          return (
            <div key={i} style={{ ...itemStyle, cursor: 'default', opacity: 0.6 }}>
              <span style={getDropdownItemLabelStyle(isSelected)}>{suggestion.label}</span>
            </div>
          );
        }

        return (
          <div
            key={i}
            style={itemStyle}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : mergedColors.dropdownHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? mergedColors.dropdownSelected : 'transparent';
            }}
          >
            <span style={getDropdownItemLabelStyle(isSelected)}>
              {highlightMatch(suggestion.label, suggestion.matchPartial, isSelected)}
            </span>
            {suggestion.description && (
              <span style={getDropdownItemDescStyle(isSelected)}>{suggestion.description}</span>
            )}
            {suggestion.type && suggestion.type !== 'hint' && (
              <span style={getDropdownItemTypeStyle(isSelected, mergedStyles)}>{suggestion.type}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(content, portalRef.current);
}
