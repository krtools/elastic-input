import * as React from 'react';
import { ColorConfig, StyleConfig } from '../types';
import { mergeColors, mergeStyles, getDatePickerStyle } from '../styles/inlineStyles';
import { cx } from '../utils/cx';
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  isSameDay,
  isDateInRange,
  getMonthName,
} from '../utils/dateUtils';

/** Props for the standalone Calendar — a pure, fully-controlled date grid. */
export interface CalendarProps {
  /** Selection shape: one date or a start/end range. Fixed configuration —
   *  there is no built-in mode toggle (render your own if you need one). */
  mode: 'single' | 'range';
  /** Selected date (single) or range start. `null` = empty. */
  start: Date | null;
  /** Range end. Ignored in single mode. */
  end?: Date | null;
  /** Fires on completed selections only: `(date, null)` in single mode,
   *  `(start, end)` sorted ascending once a range's second click lands.
   *  In-progress range clicks render internally but are not reported. */
  onChange: (start: Date, end: Date | null) => void;
  /** Rendered below the grid — preset buttons, a clear action, whatever. */
  children?: React.ReactNode;
  /** Color overrides. Merged with `DEFAULT_COLORS`. */
  colors?: ColorConfig;
  /** Structural style overrides. Merged with `DEFAULT_STYLES`. */
  styles?: StyleConfig;
  /** Appended to the `ei-calendar` container class. */
  className?: string;
}

type ViewLevel = 'days' | 'months' | 'years';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDecadeStart(year: number): number {
  return Math.floor(year / 10) * 10;
}

// Never submit an enclosing form; not tab stops (the grid is mouse-driven)
const BUTTON_PROPS = { type: 'button' as const, tabIndex: -1 };

/**
 * Pure date-selection calendar: day grid with month/year drill-down,
 * controlled selection, no chrome, no mode toggle, no serialization.
 * Used internally by ElasticInput's date picker; exported for standalone use.
 */
export function Calendar({ mode, start, end: endProp, onChange, children, colors, styles: styleConfig, className }: CalendarProps) {
  const end = mode === 'range' ? (endProp ?? null) : null;

  // View month: in range mode prefer the end date so "now" is visible
  const initDate = (mode === 'range' && end) ? end : start ?? new Date();
  const [viewLevel, setViewLevel] = React.useState<ViewLevel>('days');
  const [viewYear, setViewYear] = React.useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(initDate.getMonth());
  // First click of an in-progress range (not yet reported via onChange)
  const [pendingStart, setPendingStart] = React.useState<Date | null>(null);
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null);

  // Follow controlled selection changes: navigate the view to show them
  const navTarget = (mode === 'range' && end) ? end : start;
  const navKey = navTarget ? navTarget.getTime() : -1;
  const prevNavKeyRef = React.useRef(navKey);
  React.useEffect(() => {
    if (navKey === prevNavKeyRef.current) return;
    prevNavKeyRef.current = navKey;
    if (navTarget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate sync: navigate the view when the controlled selection changes; guarded by the navKey compare above
      setViewYear(navTarget.getFullYear());
      setViewMonth(navTarget.getMonth());
    }
  }, [navKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mode change invalidates an in-progress range
  const prevModeRef = React.useRef(mode);
  React.useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    setPendingStart(null);
    setHoverDate(null);
  }, [mode]);

  const mergedColors = mergeColors(colors);
  const mergedStyleConfig = mergeStyles(styleConfig);
  const styles = getDatePickerStyle(mergedColors, mergedStyleConfig);

  // Displayed selection: an in-progress range (with hover preview) wins over
  // the controlled value
  const displayStart = pendingStart ?? start;
  const previewEnd = pendingStart ? hoverDate : end;
  const isRangePreviewing = mode === 'range' && !!pendingStart;

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

  // Big navigation: one level up (year in days, decade in months, century in years)
  const navigatePrevBig = () => {
    if (viewLevel === 'days') setViewYear(y => y - 1);
    else if (viewLevel === 'months') setViewYear(y => y - 10);
    else setViewYear(y => y - 100);
  };

  const navigateNextBig = () => {
    if (viewLevel === 'days') setViewYear(y => y + 1);
    else if (viewLevel === 'months') setViewYear(y => y + 10);
    else setViewYear(y => y + 100);
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

  const selectDate = (date: Date) => {
    if (mode === 'single') {
      onChange(date, null);
      return;
    }
    if (!pendingStart) {
      setPendingStart(date);
      setHoverDate(null);
    } else {
      const [s, e] = pendingStart <= date ? [pendingStart, date] : [date, pendingStart];
      setPendingStart(null);
      setHoverDate(null);
      onChange(s, e);
    }
  };

  // --- Header label ---
  const headerLabel = viewLevel === 'days'
    ? `${getMonthName(viewMonth)} ${viewYear}`
    : viewLevel === 'months'
    ? `${viewYear}`
    : `${getDecadeStart(viewYear)}–${getDecadeStart(viewYear) + 9}`;

  const canZoomOut = viewLevel !== 'years';

  // --- Day cells ---
  const today = new Date();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

  const dayCells: React.ReactNode[] = [];

  const renderDayCell = (date: Date, key: string, isOtherMonth: boolean) => {
    const isToday = isSameDay(date, today);
    const isStart = displayStart && isSameDay(date, displayStart);
    const isEnd = previewEnd && isSameDay(date, previewEnd);
    const inRange = isDateInRange(date, displayStart, previewEnd);
    const isSelected = isStart || isEnd;

    const dayStyle = {
      ...styles.day,
      ...(isOtherMonth ? styles.dayOtherMonth : {}),
      ...(isToday ? styles.dayToday : {}),
      ...(inRange ? styles.dayInRange : {}),
      ...(isSelected ? styles.daySelected : {}),
    };

    return (
      <button
        {...BUTTON_PROPS}
        key={key}
        className={cx(
          'ei-datepicker-day',
          isToday && 'ei-datepicker-day--today',
          isSelected && 'ei-datepicker-day--selected',
          inRange && 'ei-datepicker-day--in-range',
          isOtherMonth && 'ei-datepicker-day--other-month',
        )}
        style={dayStyle}
        onClick={() => selectDate(date)}
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
        {date.getDate()}
      </button>
    );
  };

  // Previous month trailing days
  if (firstDay > 0) {
    const prevMonthDays = getDaysInMonth(viewYear, viewMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const date = new Date(viewYear, viewMonth - 1, d);
      dayCells.push(renderDayCell(date, `prev${d}`, true));
    }
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    dayCells.push(renderDayCell(date, String(d), false));
  }

  // Next month leading days to fill the last week
  const remainder = dayCells.length % 7;
  if (remainder > 0) {
    const nextDays = 7 - remainder;
    for (let d = 1; d <= nextDays; d++) {
      const date = new Date(viewYear, viewMonth + 1, d);
      dayCells.push(renderDayCell(date, `next${d}`, true));
    }
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

  const navBtnEnter = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#eef1f5'; };
  const navBtnLeave = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; };

  return (
    <div className={cx('ei-calendar', className)} style={styles.container} onMouseLeave={() => setHoverDate(null)}>
      <div className="ei-datepicker-header" style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button {...BUTTON_PROPS} style={styles.navButton} onClick={navigatePrevBig} onMouseEnter={navBtnEnter} onMouseLeave={navBtnLeave}>&laquo;</button>
          <button {...BUTTON_PROPS} style={styles.navButton} onClick={navigatePrev} onMouseEnter={navBtnEnter} onMouseLeave={navBtnLeave}>&lsaquo;</button>
        </div>
        <button
          {...BUTTON_PROPS}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button {...BUTTON_PROPS} style={styles.navButton} onClick={navigateNext} onMouseEnter={navBtnEnter} onMouseLeave={navBtnLeave}>&rsaquo;</button>
          <button {...BUTTON_PROPS} style={styles.navButton} onClick={navigateNextBig} onMouseEnter={navBtnEnter} onMouseLeave={navBtnLeave}>&raquo;</button>
        </div>
      </div>

      {viewLevel === 'days' && (
        <>
          <div style={styles.weekDays}>
            {WEEK_DAYS.map(wd => <div key={wd} style={styles.weekDay}>{wd}</div>)}
          </div>
          <div className="ei-datepicker-days" style={styles.days}>
            {dayCells}
          </div>
        </>
      )}

      {viewLevel === 'months' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px' }}>
          {SHORT_MONTHS.map((name, i) => {
            const monthDate = new Date(viewYear, i, 1);
            const monthInRange = isDateInRange(monthDate, displayStart, previewEnd);
            const monthIsEndpoint = displayStart && isSameDay(
              new Date(displayStart.getFullYear(), displayStart.getMonth(), 1), monthDate
            ) || previewEnd && isSameDay(
              new Date(previewEnd.getFullYear(), previewEnd.getMonth(), 1), monthDate
            );
            const isCurrent = i === today.getMonth() && viewYear === today.getFullYear();

            return (
              <button
                {...BUTTON_PROPS}
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
            const yearInRange = displayStart && previewEnd &&
              year >= Math.min(displayStart.getFullYear(), previewEnd.getFullYear()) &&
              year <= Math.max(displayStart.getFullYear(), previewEnd.getFullYear());
            const yearIsEndpoint = (displayStart && displayStart.getFullYear() === year) ||
              (previewEnd && previewEnd.getFullYear() === year);

            return (
              <button
                {...BUTTON_PROPS}
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

      {children}
    </div>
  );
}
