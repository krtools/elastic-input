import { describe, it, expect } from 'vitest';
import { getDatePickerStyle, mergeColors, mergeStyles } from '../styles/inlineStyles';

describe('getDatePickerStyle touch sizing', () => {
  const colors = mergeColors();
  const styles = mergeStyles();

  it('keeps the pointer sizes by default', () => {
    const s = getDatePickerStyle(colors, styles);
    expect(s.day.minHeight).toBeUndefined();
    expect(s.day.padding).toBe('6px');
    expect(s.navButton.minHeight).toBeUndefined();
    expect(s.quickOption.fontSize).toBe('12px');
  });

  it('grows the controls to finger size for coarse pointers', () => {
    const s = getDatePickerStyle(colors, styles, true);
    expect(s.day.minHeight).toBe('42px');
    expect(s.day.fontSize).toBe('16px');
    expect(s.navButton.minWidth).toBe('44px');
    expect(s.navButton.minHeight).toBe('44px');
    expect(s.rangeToggleButton.minHeight).toBe('40px');
    expect(s.quickOption.minHeight).toBe('44px');
    expect(s.quickOption.fontSize).toBe('14px');
    expect(s.monthLabel.fontSize).toBe('16px');
  });
});
