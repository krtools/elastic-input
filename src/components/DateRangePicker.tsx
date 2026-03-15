import * as React from 'react';
import { ColorConfig, StyleConfig } from '../types';
import { mergeColors, mergeStyles, getDatePickerStyle } from '../styles/inlineStyles';
import {
  formatDate,
  getDaysInMonth,
  getFirstDayOfMonth,
  isSameDay,
  isDateInRange,
  getMonthName,
} from '../utils/dateUtils';

interface DateRangePickerProps {
  onSelect: (dateStr: string) => void;
  colors?: ColorConfig;
  styles?: StyleConfig;
}

type ViewLevel = 'days' | 'months' | 'years';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDecadeStart(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function DateRangePicker({ onSelect, colors, styles: styleConfig }: DateRangePickerProps) {
  const now = new Date();
  const [mode, setMode] = React.useState<'single' | 'range'>('single');
  const [viewLevel, setViewLevel] = React.useState<ViewLevel>('days');
  const [viewYear, setViewYear] = React.useState(now.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(now.getMonth());
  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = React.useState<Date | null>(null);
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  const mergedColors = mergeColors(colors);
  const mergedStyleConfig = mergeStyles(styleConfig);
  const styles = getDatePickerStyle(mergedColors, mergedStyleConfig);

  // --- Navigation ---
  const navigatePrev = () => {
    if (viewLevel === 'days') {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
      else { setViewMonth(m => m - 1); }
    } else if (viewLevel === 'months') {
      setViewYear(y => y - 1);
    } else {
      setViewYear(y => y - 10);
    }
  };

  const navigateNext = () => {
    if (viewLevel === 'days') {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
      else { setViewMonth(m => m + 1); }
    } else if (viewLevel === 'months') {
      setViewYear(y => y + 1);
    } else {
      setViewYear(y => y + 10);
    }
  };

  const zoomOut = () => {
    if (viewLevel === 'days') setViewLevel('months');
    else if (viewLevel === 'months') setViewLevel('years');
  };

  const selectMonth = (month: number) => {
    setViewMonth(month);
    setViewLevel('days');
  };

  const selectYear = (year: number) => {
    setViewYear(year);
    setViewLevel('months');
  };

  const selectDay = (day: number) => {
    const date = new Date(viewYear, viewMonth, day);

    if (mode === 'single') {
      onSelect(formatDate(date));
      return;
    }

    // Range mode
    if (!rangeStart || rangeEnd) {
      setRangeStart(date);
      setRangeEnd(null);
      setHoverDate(null);
    } else {
      const [s, e] = rangeStart <= date ? [rangeStart, date] : [date, rangeStart];
      setRangeStart(s);
      setRangeEnd(e);
      setHoverDate(null);
      onSelect(`[${formatDate(s)} TO ${formatDate(e)}]`);
    }
  };

  // When start is picked but end isn't, use hoverDate as the preview end
  const previewEnd = (rangeStart && !rangeEnd) ? hoverDate : rangeEnd;

  const switchMode = (newMode: 'single' | 'range') => {
    setMode(newMode);
    setRangeStart(null);
    setRangeEnd(null);
    setHoverDate(null);
  };

  // --- Header label ---
  const headerLabel = viewLevel === 'days'
    ? `${getMonthName(viewMonth)} ${viewYear}`
    : viewLevel === 'months'
    ? `${viewYear}`
    : `${getDecadeStart(viewYear)}\u2013${getDecadeStart(viewYear) + 9}`;

  const canZoomOut = viewLevel !== 'years';

  // --- Day cells ---
  const today = new Date();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const dayCells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    dayCells.push(<div key={`e${i}`} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const isToday = isSameDay(date, today);
    const isStart = rangeStart && isSameDay(date, rangeStart);
    const isEnd = previewEnd && isSameDay(date, previewEnd);
    const inRange = isDateInRange(date, rangeStart, previewEnd);
    const isSelected = isStart || isEnd;

    const dayStyle = {
      ...styles.day,
      ...(isToday ? styles.dayToday : {}),
      ...(inRange ? styles.dayInRange : {}),
      ...(isSelected ? styles.daySelected : {}),
    };

    const isRangePreviewing = mode === 'range' && rangeStart && !rangeEnd;

    dayCells.push(
      <button
        key={d}
        style={dayStyle}
        onClick={() => selectDay(d)}
        onMouseEnter={(e) => {
          if (isRangePreviewing) {
            setHoverDate(date);
          } else if (!isSelected) {
            (e.currentTarget as HTMLElement).style.backgroundColor = mergedColors.dropdownHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!isRangePreviewing && !isSelected) {
            (e.currentTarget as HTMLElement).style.backgroundColor = inRange
              ? 'rgba(9, 105, 218, 0.1)' : 'transparent';
          }
        }}
      >
        {d}
      </button>
    );
  }

  // --- Grid cell style for months/years ---
  const gridCellStyle: React.CSSProperties = {
    ...styles.day,
    padding: '10px 4px',
    fontSize: '13px',
  };

  const gridCellCurrentStyle: React.CSSProperties = {
    ...gridCellStyle,
    ...styles.dayToday,
  };

  // --- Range presets ---
  const presets: { label: string; value: string }[] = [
    { label: 'Today', value: '[now/d TO now]' },
    { label: 'Yesterday', value: '[now-1d/d TO now/d]' },
    { label: 'Last 7 days', value: '[now-7d TO now]' },
    { label: 'Last 30 days', value: '[now-30d TO now]' },
    { label: 'Last 90 days', value: '[now-90d TO now]' },
    { label: 'Last 1 year', value: '[now-365d TO now]' },
  ];

  const presetGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px',
  };

  return (
    <div style={styles.container} onMouseDown={e => e.preventDefault()} onMouseLeave={() => setHoverDate(null)}>
      <div style={styles.rangeToggle}>
        {(['single', 'range'] as const).map(m => (
          <button
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

      <div style={styles.header}>
        <button style={styles.navButton} onClick={navigatePrev}>&lsaquo;</button>
        <button
          style={{
            ...styles.monthLabel,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: canZoomOut ? 'pointer' : 'default',
            padding: '2px 8px',
            borderRadius: '4px',
          }}
          onClick={canZoomOut ? zoomOut : undefined}
          onMouseEnter={e => {
            if (canZoomOut) (e.currentTarget as HTMLElement).style.backgroundColor = '#eef1f5';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
          }}
        >
          {headerLabel}
        </button>
        <button style={styles.navButton} onClick={navigateNext}>&rsaquo;</button>
      </div>

      {viewLevel === 'days' && (
        <>
          <div style={styles.weekDays}>
            {weekDays.map(wd => <div key={wd} style={styles.weekDay}>{wd}</div>)}
          </div>
          <div style={styles.days}>
            {dayCells}
          </div>
        </>
      )}

      {viewLevel === 'months' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
          {SHORT_MONTHS.map((name, i) => {
            const monthDate = new Date(viewYear, i, 1);
            const monthInRange = isDateInRange(monthDate, rangeStart, previewEnd);
            const monthIsEndpoint = rangeStart && isSameDay(
              new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1), monthDate
            ) || previewEnd && isSameDay(
              new Date(previewEnd.getFullYear(), previewEnd.getMonth(), 1), monthDate
            );
            const isCurrent = i === today.getMonth() && viewYear === today.getFullYear();

            const isRangePreviewing = mode === 'range' && rangeStart && !rangeEnd;

            return (
              <button
                key={name}
                style={{
                  ...(isCurrent ? gridCellCurrentStyle : gridCellStyle),
                  ...(monthInRange ? styles.dayInRange : {}),
                  ...(monthIsEndpoint ? styles.daySelected : {}),
                }}
                onClick={() => selectMonth(i)}
                onMouseEnter={(e) => {
                  if (isRangePreviewing) {
                    setHoverDate(monthDate);
                  } else if (!monthIsEndpoint) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = mergedColors.dropdownHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRangePreviewing && !monthIsEndpoint) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = monthInRange
                      ? 'rgba(9, 105, 218, 0.1)' : 'transparent';
                  }
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {viewLevel === 'years' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
          {Array.from({ length: 12 }, (_, i) => {
            const year = getDecadeStart(viewYear) - 1 + i;
            const isOutOfRange = i === 0 || i === 11;
            const isCurrent = year === today.getFullYear();
            const yearDate = new Date(year, 0, 1);
            const yearInRange = rangeStart && previewEnd &&
              year >= Math.min(rangeStart.getFullYear(), previewEnd.getFullYear()) &&
              year <= Math.max(rangeStart.getFullYear(), previewEnd.getFullYear());
            const yearIsEndpoint = (rangeStart && rangeStart.getFullYear() === year) ||
              (previewEnd && previewEnd.getFullYear() === year);

            const isRangePreviewing = mode === 'range' && rangeStart && !rangeEnd;

            return (
              <button
                key={year}
                style={{
                  ...(isCurrent ? gridCellCurrentStyle : gridCellStyle),
                  ...(isOutOfRange ? styles.dayOtherMonth : {}),
                  ...(yearInRange ? styles.dayInRange : {}),
                  ...(yearIsEndpoint ? styles.daySelected : {}),
                }}
                onClick={() => selectYear(year)}
                onMouseEnter={(e) => {
                  if (isRangePreviewing) {
                    setHoverDate(yearDate);
                  } else if (!yearIsEndpoint) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = mergedColors.dropdownHover;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isRangePreviewing && !yearIsEndpoint) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = yearInRange
                      ? 'rgba(9, 105, 218, 0.1)' : 'transparent';
                  }
                }}
              >
                {year}
              </button>
            );
          })}
        </div>
      )}

      {mode === 'range' && (
        <div style={{
          ...styles.quickOptions,
          ...presetGridStyle,
        }}>
          {presets.map(p => (
            <button key={p.value} style={styles.quickOption} onClick={() => onSelect(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
