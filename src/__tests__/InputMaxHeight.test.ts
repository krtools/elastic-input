import { describe, it, expect } from 'vitest';
import { getEditableStyle, mergeColors, mergeStyles } from '../styles/inlineStyles';
import { DEFAULT_STYLES } from '../constants';

describe('inputMaxHeight', () => {
  it('defaults to none', () => {
    expect(DEFAULT_STYLES.inputMaxHeight).toBe('none');
    expect(getEditableStyle(mergeColors(), mergeStyles()).maxHeight).toBe('none');
  });

  it('caps the editor, which is the element that scrolls', () => {
    const s = getEditableStyle(mergeColors(), mergeStyles({ inputMaxHeight: '120px' }));
    expect(s.maxHeight).toBe('120px');
    expect(s.overflow).toBe('auto');
  });
});
