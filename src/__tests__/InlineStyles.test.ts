import { describe, it, expect } from 'vitest';
import {
  mergeColors,
  mergeStyles,
  getInputContainerStyle,
  getEditorWrapStyle,
  getEditableStyle,
  getContainerFocusStyle,
  getSlotStyle,
  getPlaceholderStyle,
} from '../styles/inlineStyles';
import { DEFAULT_COLORS, DEFAULT_STYLES } from '../constants';

const colors = mergeColors();
const styles = mergeStyles();

describe('getInputContainerStyle — container owns the chrome', () => {
  it('carries border, radius, background, and min-height', () => {
    const s = getInputContainerStyle(colors, styles, false);
    expect(s.borderWidth).toBe(DEFAULT_STYLES.inputBorderWidth);
    expect(s.borderStyle).toBe('solid');
    expect(s.borderColor).toBe(DEFAULT_STYLES.inputBorderColor);
    expect(s.borderRadius).toBe(DEFAULT_STYLES.inputBorderRadius);
    expect(s.backgroundColor).toBe(DEFAULT_COLORS.background);
    expect(s.minHeight).toBe(DEFAULT_STYLES.inputMinHeight);
  });

  it('is a flex row so slots sit inside the bordered box', () => {
    const s = getInputContainerStyle(colors, styles, false);
    expect(s.display).toBe('flex');
    expect(s.flexDirection).toBe('row');
    expect(s.position).toBe('relative');
  });

  it('uses border-box sizing for deterministic height regardless of CSS resets', () => {
    const s = getInputContainerStyle(colors, styles, false);
    expect(s.boxSizing).toBe('border-box');
  });

  it('merges the focus ring when focused', () => {
    const s = getInputContainerStyle(colors, styles, true);
    expect(s.borderColor).toBe(DEFAULT_STYLES.inputFocusBorderColor);
    expect(s.boxShadow).toBe(DEFAULT_STYLES.inputFocusShadow);
  });

  it('does not apply the focus ring when unfocused', () => {
    const s = getInputContainerStyle(colors, styles, false);
    expect(s.borderColor).toBe(DEFAULT_STYLES.inputBorderColor);
    expect(s.boxShadow).toBeUndefined();
  });

  it('custom style overrides win over focus styles', () => {
    const s = getInputContainerStyle(colors, styles, true, { borderColor: 'red' });
    expect(s.borderColor).toBe('red');
  });
});

describe('getEditableStyle — editor is chrome-less', () => {
  it('has no border, radius, background, or min-height of its own', () => {
    const s = getEditableStyle(colors, styles);
    expect(s.border).toBe('none');
    expect(s.borderWidth).toBeUndefined();
    expect(s.borderRadius).toBeUndefined();
    expect(s.minHeight).toBeUndefined();
    expect(s.backgroundColor).toBe('transparent');
  });

  it('keeps its own text padding and typography', () => {
    const s = getEditableStyle(colors, styles);
    expect(s.padding).toBe(DEFAULT_STYLES.inputPadding);
    expect(s.fontSize).toBe(DEFAULT_STYLES.fontSize);
    expect(s.fontFamily).toBe(DEFAULT_STYLES.fontFamily);
    expect(s.lineHeight).toBe(DEFAULT_STYLES.lineHeight);
  });
});

describe('getContainerFocusStyle', () => {
  it('returns the focus border color and shadow', () => {
    const s = getContainerFocusStyle(styles);
    expect(s.borderColor).toBe(DEFAULT_STYLES.inputFocusBorderColor);
    expect(s.boxShadow).toBe(DEFAULT_STYLES.inputFocusShadow);
  });
});

describe('getEditorWrapStyle — squiggle/placeholder coordinate space', () => {
  it('is positioned, flexible, and shrinkable', () => {
    const s = getEditorWrapStyle();
    expect(s.position).toBe('relative');
    expect(s.flex).toBe('1 1 auto');
    expect(s.minWidth).toBe(0);
  });
});

describe('getSlotStyle — prefix/suffix layout', () => {
  it('centers content on the first row via calc of min-height minus borders', () => {
    const s = getSlotStyle('suffix', styles);
    expect(s.display).toBe('flex');
    expect(s.alignItems).toBe('center');
    expect(s.minHeight).toBe(
      `calc(${DEFAULT_STYLES.inputMinHeight} - 2 * ${DEFAULT_STYLES.inputBorderWidth})`
    );
  });

  it('pins to the top so it does not drift on multiline growth', () => {
    const s = getSlotStyle('suffix', styles);
    expect(s.alignSelf).toBe('flex-start');
  });

  it('pads the outer edge only', () => {
    expect(getSlotStyle('prefix', styles).paddingLeft).toBe('8px');
    expect(getSlotStyle('prefix', styles).paddingRight).toBeUndefined();
    expect(getSlotStyle('suffix', styles).paddingRight).toBe('8px');
    expect(getSlotStyle('suffix', styles).paddingLeft).toBeUndefined();
  });

  it('respects custom min-height and border width', () => {
    const custom = mergeStyles({ inputMinHeight: '60px', inputBorderWidth: '1px' });
    expect(getSlotStyle('suffix', custom).minHeight).toBe('calc(60px - 2 * 1px)');
  });
});

describe('getPlaceholderStyle — mirrors editor padding, no parsing', () => {
  it('overlays the editor and inherits the editor padding verbatim', () => {
    const s = getPlaceholderStyle(colors, styles);
    expect(s.position).toBe('absolute');
    expect(s.top).toBe(0);
    expect(s.left).toBe(0);
    expect(s.right).toBe(0);
    expect(s.padding).toBe(DEFAULT_STYLES.inputPadding);
    expect(s.boxSizing).toBe('border-box');
  });

  it('passes through padding values the old parser would have mangled', () => {
    // The previous implementation split on whitespace, so a calc() with
    // internal spaces produced garbage offsets. Now it's a verbatim copy.
    const custom = mergeStyles({ inputPadding: 'calc(4px + 4px) 12px' });
    const s = getPlaceholderStyle(colors, custom);
    expect(s.padding).toBe('calc(4px + 4px) 12px');
    expect(s.top).toBe(0);
  });

  it('stays non-interactive and single-line', () => {
    const s = getPlaceholderStyle(colors, styles);
    expect(s.pointerEvents).toBe('none');
    expect(s.whiteSpace).toBe('nowrap');
    expect(s.textOverflow).toBe('ellipsis');
  });
});
