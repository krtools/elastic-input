import * as React from 'react';
import { ColorConfig, StyleConfig } from '../types';
import { mergeColors, mergeStyles, getDatePickerStyle } from '../styles/inlineStyles';
import { cx } from '../utils/cx';
import { formatDate } from '../utils/dateUtils';
import { Calendar } from './Calendar';

interface DateRangePickerProps {
  onSelect: (dateStr: string) => void;
  colors?: ColorConfig;
  styles?: StyleConfig;
  initialMode?: 'single' | 'range';
  initialStart?: Date | null;
  initialEnd?: Date | null;
  presets?: { label: string; value: string; type?: 'single' | 'range' }[];
  /** Custom class name for the date picker container. */
  className?: string;
}

const DEFAULT_PRESETS: { label: string; value: string; type?: 'single' | 'range' }[] = [
  { label: 'Today', value: '[now/d TO now]', type: 'range' },
  { label: 'Yesterday', value: '[now-1d/d TO now/d]', type: 'range' },
  { label: 'Last 7 days', value: '[now-7d TO now]', type: 'range' },
  { label: 'Last 30 days', value: '[now-30d TO now]', type: 'range' },
  { label: 'Last 90 days', value: '[now-90d TO now]', type: 'range' },
  { label: 'Last 1 year', value: '[now-365d TO now]', type: 'range' },
];

/**
 * ElasticInput's date picker: composes the pure Calendar with the concerns
 * the input owns — the single/range mode toggle, query-syntax presets, and
 * serialization to query-string dates (`YYYY-MM-DD`, `[a TO b]`).
 */
export function DateRangePicker({ onSelect, colors, styles: styleConfig, initialMode, initialStart, initialEnd, presets: presetsProp, className }: DateRangePickerProps) {
  const [mode, setMode] = React.useState<'single' | 'range'>(initialMode ?? 'single');
  const [start, setStart] = React.useState<Date | null>(initialStart ?? null);
  const [end, setEnd] = React.useState<Date | null>(initialEnd ?? null);

  const mergedColors = mergeColors(colors);
  const mergedStyleConfig = mergeStyles(styleConfig);
  const styles = getDatePickerStyle(mergedColors, mergedStyleConfig);

  const switchMode = (newMode: 'single' | 'range') => {
    setMode(newMode);
    setStart(null);
    setEnd(null);
  };

  const handleChange = (s: Date, e: Date | null) => {
    setStart(s);
    setEnd(e);
    onSelect(mode === 'single' ? formatDate(s) : `[${formatDate(s)} TO ${formatDate(e!)}]`);
  };

  const presets = presetsProp ?? DEFAULT_PRESETS;
  const filteredPresets = presets.filter(p => !p.type || p.type === mode);

  return (
    <div className={cx('ei-datepicker', className)} onMouseDown={e => e.preventDefault()}>
      <div className="ei-datepicker-toggle" style={{ ...styles.rangeToggle, margin: '12px 12px 0' }}>
        {(['single', 'range'] as const).map(m => (
          <button
            type="button"
            tabIndex={-1}
            key={m}
            style={{
              ...styles.rangeToggleButton,
              ...(mode === m ? styles.rangeToggleButtonActive : {}),
            }}
            onClick={() => switchMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <Calendar
        mode={mode}
        start={start}
        end={end}
        onChange={handleChange}
        colors={colors}
        styles={styleConfig}
      >
        {filteredPresets.length > 0 && (
          <div
            className="ei-datepicker-presets"
            style={{
              ...styles.quickOptions,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2px',
            }}
          >
            {filteredPresets.map(p => (
              <button type="button" tabIndex={-1} key={`${p.type ?? 'both'}-${p.value}`} style={styles.quickOption} onClick={() => onSelect(p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </Calendar>
    </div>
  );
}
