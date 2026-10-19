import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderSuggestionItems } from '../components/SuggestionItems';
import { mergeColors, mergeStyles } from '../styles/inlineStyles';

const field = { text: 'status', label: 'status', type: 'field', replaceStart: 0, replaceEnd: 0 };

describe('renderSuggestionItems', () => {
  it('applies minHeight to every row (finger-sized rows on touch devices)', () => {
    const items = renderSuggestionItems({
      suggestions: [field, { ...field, text: 'segment', label: 'segment' }],
      selectedIndex: -1,
      onSelect: () => {},
      colors: mergeColors(),
      styles: mergeStyles(),
      minHeight: 44,
    }) as React.ReactElement<{ style: React.CSSProperties }>[];
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.props.style.minHeight).toBe('44px');
  });

  it('leaves the row height alone without minHeight (the pointer dropdown)', () => {
    const items = renderSuggestionItems({
      suggestions: [field], selectedIndex: -1, onSelect: () => {}, colors: mergeColors(), styles: mergeStyles(),
    }) as React.ReactElement<{ style: React.CSSProperties }>[];
    expect(items[0].props.style.minHeight).toBeUndefined();
  });
});
