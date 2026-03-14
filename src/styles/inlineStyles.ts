import { ColorConfig, StyleConfig } from '../types';
import { DEFAULT_COLORS, DEFAULT_STYLES } from '../constants';

type Styles = { [key: string]: React.CSSProperties };

export function mergeColors(custom?: ColorConfig): Required<ColorConfig> {
  return { ...DEFAULT_COLORS, ...custom };
}

export function mergeStyles(custom?: StyleConfig): Required<StyleConfig> {
  return { ...DEFAULT_STYLES, ...custom };
}

export function getInputContainerStyle(colors: Required<ColorConfig>, customStyle?: React.CSSProperties): React.CSSProperties {
  return {
    position: 'relative',
    display: 'inline-block',
    width: '100%',
    ...customStyle,
  };
}

export function getEditableStyle(colors: Required<ColorConfig>, styles: Required<StyleConfig>): React.CSSProperties {
  return {
    minHeight: styles.inputMinHeight,
    padding: styles.inputPadding,
    border: `${styles.inputBorderWidth} solid ${styles.inputBorderColor}`,
    borderRadius: styles.inputBorderRadius,
    outline: 'none',
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    lineHeight: '1.5',
    backgroundColor: colors.background,
    color: colors.text,
    caretColor: colors.cursor,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    cursor: 'text',
  };
}

export function getEditableFocusStyle(styles: Required<StyleConfig>): React.CSSProperties {
  return {
    borderColor: styles.inputFocusBorderColor,
    boxShadow: styles.inputFocusShadow,
  };
}

export function getPlaceholderStyle(colors: Required<ColorConfig>, styles: Required<StyleConfig>): React.CSSProperties {
  // Parse padding to position placeholder correctly
  const paddingParts = styles.inputPadding.split(/\s+/);
  const topPad = paddingParts[0] || '8px';
  const leftPad = paddingParts.length >= 4 ? paddingParts[3] : paddingParts.length >= 2 ? paddingParts[1] : topPad;

  return {
    position: 'absolute',
    top: topPad,
    left: leftPad,
    color: colors.placeholder,
    pointerEvents: 'none',
    fontSize: styles.fontSize,
    fontFamily: styles.fontFamily,
    lineHeight: '1.5',
    userSelect: 'none',
  };
}

export function getDropdownStyle(colors: Required<ColorConfig>, styles: Required<StyleConfig>): React.CSSProperties {
  return {
    position: 'absolute',
    zIndex: styles.dropdownZIndex,
    backgroundColor: colors.background,
    border: `1px solid ${styles.dropdownBorderColor}`,
    borderRadius: styles.dropdownBorderRadius,
    boxShadow: styles.dropdownShadow,
    maxHeight: styles.dropdownMaxHeight,
    overflowY: 'auto',
    minWidth: styles.dropdownMinWidth,
    maxWidth: styles.dropdownMaxWidth,
    padding: '4px 0',
  };
}

export function getDropdownItemStyle(
  isSelected: boolean,
  colors: Required<ColorConfig>,
  styles: Required<StyleConfig>
): React.CSSProperties {
  return {
    padding: styles.dropdownItemPadding,
    cursor: 'pointer',
    fontSize: styles.dropdownItemFontSize,
    fontFamily: styles.fontFamily,
    backgroundColor: isSelected ? colors.dropdownSelected : 'transparent',
    color: isSelected ? '#ffffff' : colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    lineHeight: '1.4',
  };
}

export function getDropdownItemLabelStyle(isSelected: boolean): React.CSSProperties {
  return {
    flex: 1,
    fontWeight: 500,
  };
}

export function getDropdownItemDescStyle(isSelected: boolean): React.CSSProperties {
  return {
    fontSize: '11px',
    opacity: 0.7,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '200px',
  };
}

export function getDropdownItemTypeStyle(isSelected: boolean, styles: Required<StyleConfig>): React.CSSProperties {
  return {
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: isSelected ? styles.typeBadgeSelectedBg : styles.typeBadgeBg,
    color: isSelected ? styles.typeBadgeSelectedColor : styles.typeBadgeColor,
    flexShrink: 0,
  };
}

export function getSquigglyStyle(left: number, width: number): React.CSSProperties {
  return {
    position: 'absolute',
    zIndex: 1,
    left: `${left}px`,
    bottom: '2px',
    width: `${width}px`,
    height: '4px',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath d='M0 2 Q2 0 4 2 Q6 4 8 2' stroke='%23cf222e' fill='none' stroke-width='0.8'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'bottom',
    pointerEvents: 'none',
  };
}

export function getDatePickerStyle(colors: Required<ColorConfig>, styles: Required<StyleConfig>): Styles {
  return {
    container: {
      padding: '12px',
      backgroundColor: colors.background,
      minWidth: '280px',
      fontFamily: styles.fontFamily,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
    },
    navButton: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      fontSize: '16px',
      padding: '4px 8px',
      color: colors.text,
      borderRadius: '4px',
    },
    monthLabel: {
      fontWeight: 600,
      fontSize: styles.fontSize,
      color: colors.text,
    },
    weekDays: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '2px',
      marginBottom: '4px',
    },
    weekDay: {
      textAlign: 'center' as const,
      fontSize: '11px',
      color: colors.placeholder,
      padding: '4px',
      fontWeight: 600,
    },
    days: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7, 1fr)',
      gap: '2px',
    },
    day: {
      textAlign: 'center' as const,
      padding: '6px',
      cursor: 'pointer',
      fontSize: styles.dropdownItemFontSize,
      borderRadius: '4px',
      color: colors.text,
      border: 'none',
      background: 'none',
    },
    dayHover: {
      backgroundColor: colors.dropdownHover,
    },
    daySelected: {
      backgroundColor: colors.dropdownSelected,
      color: '#ffffff',
    },
    dayInRange: {
      backgroundColor: 'rgba(9, 105, 218, 0.1)',
    },
    dayOtherMonth: {
      opacity: 0.3,
    },
    dayToday: {
      fontWeight: 700,
      textDecoration: 'underline',
    },
    rangeToggle: {
      display: 'flex',
      gap: '4px',
      marginBottom: '8px',
      padding: '2px',
      backgroundColor: styles.typeBadgeBg,
      borderRadius: '6px',
    },
    rangeToggleButton: {
      flex: 1,
      padding: '4px 8px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 500,
      background: 'none',
      color: colors.text,
    },
    rangeToggleButtonActive: {
      backgroundColor: colors.background,
      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
    },
    quickOptions: {
      borderTop: `1px solid ${styles.dropdownBorderColor}`,
      marginTop: '8px',
      paddingTop: '8px',
    },
    quickOption: {
      display: 'block',
      width: '100%',
      textAlign: 'left' as const,
      padding: '4px 8px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      fontSize: '12px',
      color: colors.dropdownSelected,
      borderRadius: '4px',
    },
  };
}
