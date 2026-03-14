import * as React from 'react';
import { ColorConfig } from '../types';
import { mergeColors, mergeStyles, getDatePickerStyle } from '../styles/inlineStyles';
import {
  formatDate,
  getDaysInMonth,
  getFirstDayOfMonth,
  isSameDay,
  getMonthName,
} from '../utils/dateUtils';

interface DatePickerProps {
  onSelect: (dateStr: string) => void;
  colors?: ColorConfig;
  selectedDate?: string;
}

export function DatePicker({ onSelect, colors, selectedDate }: DatePickerProps) {
  const now = new Date();
  const [viewYear, setViewYear] = React.useState(now.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(now.getMonth());

  const mergedColors = mergeColors(colors);
  const styles = getDatePickerStyle(mergedColors, mergeStyles());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const today = new Date();
  const selected = selectedDate ? new Date(selectedDate) : null;
  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const dayCells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) {
    dayCells.push(<div key={`e${i}`} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const isToday = isSameDay(date, today);
    const isSelected = selected && isSameDay(date, selected);
    const dayStyle = {
      ...styles.day,
      ...(isToday ? styles.dayToday : {}),
      ...(isSelected ? styles.daySelected : {}),
    };
    dayCells.push(
      <button
        key={d}
        style={dayStyle}
        onClick={() => onSelect(formatDate(date))}
        onMouseEnter={e => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#eef1f5';
        }}
        onMouseLeave={e => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
      >
        {d}
      </button>
    );
  }

  return (
    <div style={styles.container} onMouseDown={e => e.preventDefault()}>
      <div style={styles.header}>
        <button style={styles.navButton} onClick={prevMonth}>&lsaquo;</button>
        <span style={styles.monthLabel}>{getMonthName(viewMonth)} {viewYear}</span>
        <button style={styles.navButton} onClick={nextMonth}>&rsaquo;</button>
      </div>
      <div style={styles.weekDays}>
        {weekDays.map(wd => <div key={wd} style={styles.weekDay}>{wd}</div>)}
      </div>
      <div style={styles.days}>
        {dayCells}
      </div>
      <div style={styles.quickOptions}>
        <button style={styles.quickOption} onClick={() => onSelect('now')}>Now</button>
        <button style={styles.quickOption} onClick={() => onSelect('now-1d')}>Yesterday</button>
        <button style={styles.quickOption} onClick={() => onSelect('now-7d')}>Last 7 days</button>
        <button style={styles.quickOption} onClick={() => onSelect('now-30d')}>Last 30 days</button>
      </div>
    </div>
  );
}
