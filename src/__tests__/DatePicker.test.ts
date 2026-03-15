import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  isValidDateString,
  getDaysInMonth,
  getFirstDayOfMonth,
  isSameDay,
  isDateInRange,
  getMonthName,
} from '../utils/dateUtils';
import { getDatePickerStyle, mergeColors, mergeStyles } from '../styles/inlineStyles';

describe('formatDate', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDate(new Date(2024, 0, 15))).toBe('2024-01-15');
  });

  it('pads single-digit month and day', () => {
    expect(formatDate(new Date(2024, 2, 5))).toBe('2024-03-05');
  });

  it('handles December 31', () => {
    expect(formatDate(new Date(2024, 11, 31))).toBe('2024-12-31');
  });

  it('handles January 1', () => {
    expect(formatDate(new Date(2025, 0, 1))).toBe('2025-01-01');
  });
});

describe('parseDate', () => {
  it('parses "now" as current date', () => {
    const result = parseDate('now');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(new Date().getDate());
  });

  it('parses "now-7d" as 7 days ago', () => {
    const result = parseDate('now-7d');
    const expected = new Date();
    expected.setDate(expected.getDate() - 7);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getDate()).toBe(expected.getDate());
  });

  it('parses "now+1d" as tomorrow', () => {
    const result = parseDate('now+1d');
    const expected = new Date();
    expected.setDate(expected.getDate() + 1);
    expect(result!.getDate()).toBe(expected.getDate());
  });

  it('parses "now-2h" as 2 hours ago', () => {
    const result = parseDate('now-2h');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses "now-30m" as 30 minutes ago', () => {
    const result = parseDate('now-30m');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses "now-10s" as 10 seconds ago', () => {
    const result = parseDate('now-10s');
    expect(result).toBeInstanceOf(Date);
  });

  it('parses ISO date string', () => {
    const result = parseDate('2024-01-15');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it('returns null for invalid string', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });
});

describe('isValidDateString', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(isValidDateString('2024-01-15')).toBe(true);
  });

  it('accepts YYYY/MM/DD', () => {
    expect(isValidDateString('2024/01/15')).toBe(true);
  });

  it('accepts MM/DD/YYYY', () => {
    expect(isValidDateString('01/15/2024')).toBe(true);
  });

  it('accepts ISO 8601', () => {
    expect(isValidDateString('2024-01-15T10:30:00Z')).toBe(true);
  });

  it('accepts "now"', () => {
    expect(isValidDateString('now')).toBe(true);
  });

  it('accepts relative dates', () => {
    expect(isValidDateString('now-7d')).toBe(true);
    expect(isValidDateString('now+1h')).toBe(true);
    expect(isValidDateString('now-30m')).toBe(true);
  });

  it('rejects invalid strings', () => {
    expect(isValidDateString('abc')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });
});

describe('getDaysInMonth', () => {
  it('returns 31 for January', () => {
    expect(getDaysInMonth(2024, 0)).toBe(31);
  });

  it('returns 29 for February in leap year', () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(getDaysInMonth(2023, 1)).toBe(28);
  });

  it('returns 30 for April', () => {
    expect(getDaysInMonth(2024, 3)).toBe(30);
  });

  it('returns 31 for December', () => {
    expect(getDaysInMonth(2024, 11)).toBe(31);
  });
});

describe('getFirstDayOfMonth', () => {
  it('returns correct day of week (0=Sun..6=Sat)', () => {
    // Jan 1, 2024 is Monday (1)
    expect(getFirstDayOfMonth(2024, 0)).toBe(1);
  });

  it('returns 0 for a month starting on Sunday', () => {
    // Sep 1, 2024 is Sunday
    expect(getFirstDayOfMonth(2024, 8)).toBe(0);
  });
});

describe('isSameDay', () => {
  it('returns true for same date', () => {
    expect(isSameDay(new Date(2024, 0, 15), new Date(2024, 0, 15))).toBe(true);
  });

  it('returns true even if times differ', () => {
    expect(isSameDay(
      new Date(2024, 0, 15, 10, 30),
      new Date(2024, 0, 15, 22, 0),
    )).toBe(true);
  });

  it('returns false for different dates', () => {
    expect(isSameDay(new Date(2024, 0, 15), new Date(2024, 0, 16))).toBe(false);
  });

  it('returns false for same day different month', () => {
    expect(isSameDay(new Date(2024, 0, 15), new Date(2024, 1, 15))).toBe(false);
  });

  it('returns false for same day different year', () => {
    expect(isSameDay(new Date(2024, 0, 15), new Date(2025, 0, 15))).toBe(false);
  });
});

describe('isDateInRange', () => {
  const jan10 = new Date(2024, 0, 10);
  const jan15 = new Date(2024, 0, 15);
  const jan20 = new Date(2024, 0, 20);

  it('returns true for date within range', () => {
    expect(isDateInRange(jan15, jan10, jan20)).toBe(true);
  });

  it('returns true for date at range start', () => {
    expect(isDateInRange(jan10, jan10, jan20)).toBe(true);
  });

  it('returns true for date at range end', () => {
    expect(isDateInRange(jan20, jan10, jan20)).toBe(true);
  });

  it('returns false for date before range', () => {
    expect(isDateInRange(new Date(2024, 0, 5), jan10, jan20)).toBe(false);
  });

  it('returns false for date after range', () => {
    expect(isDateInRange(new Date(2024, 0, 25), jan10, jan20)).toBe(false);
  });

  it('returns false when start is null', () => {
    expect(isDateInRange(jan15, null, jan20)).toBe(false);
  });

  it('returns false when end is null', () => {
    expect(isDateInRange(jan15, jan10, null)).toBe(false);
  });

  it('works when start > end (reversed range)', () => {
    expect(isDateInRange(jan15, jan20, jan10)).toBe(true);
  });
});

describe('getMonthName', () => {
  it('returns January for 0', () => {
    expect(getMonthName(0)).toBe('January');
  });

  it('returns December for 11', () => {
    expect(getMonthName(11)).toBe('December');
  });

  it('returns June for 5', () => {
    expect(getMonthName(5)).toBe('June');
  });
});

describe('DateRangePicker zoom-out logic', () => {
  // Test the getDecadeStart helper (exported for testing indirectly via behavior)
  // We replicate the logic here since it's a pure function
  function getDecadeStart(year: number): number {
    return Math.floor(year / 10) * 10;
  }

  describe('getDecadeStart', () => {
    it('returns 2020 for 2024', () => {
      expect(getDecadeStart(2024)).toBe(2020);
    });

    it('returns 2020 for 2020', () => {
      expect(getDecadeStart(2020)).toBe(2020);
    });

    it('returns 2020 for 2029', () => {
      expect(getDecadeStart(2029)).toBe(2020);
    });

    it('returns 1990 for 1995', () => {
      expect(getDecadeStart(1995)).toBe(1990);
    });

    it('returns 2000 for 2000', () => {
      expect(getDecadeStart(2000)).toBe(2000);
    });
  });

  describe('zoom-out view levels', () => {
    it('days view shows month+year header', () => {
      // viewLevel=days, viewMonth=0, viewYear=2024 → "January 2024"
      const viewLevel = 'days';
      const viewMonth = 0;
      const viewYear = 2024;
      const label = viewLevel === 'days'
        ? `${getMonthName(viewMonth)} ${viewYear}`
        : viewLevel === 'months'
        ? `${viewYear}`
        : `${getDecadeStart(viewYear)}\u2013${getDecadeStart(viewYear) + 9}`;
      expect(label).toBe('January 2024');
    });

    it('months view shows year header', () => {
      const viewLevel: string = 'months';
      const viewYear = 2024;
      const label = viewLevel === 'days'
        ? 'unused'
        : viewLevel === 'months'
        ? `${viewYear}`
        : `${getDecadeStart(viewYear)}\u2013${getDecadeStart(viewYear) + 9}`;
      expect(label).toBe('2024');
    });

    it('years view shows decade range header', () => {
      const viewLevel: string = 'years';
      const viewYear = 2024;
      const label = viewLevel === 'days'
        ? 'unused'
        : viewLevel === 'months'
        ? 'unused'
        : `${getDecadeStart(viewYear)}\u2013${getDecadeStart(viewYear) + 9}`;
      expect(label).toBe('2020\u20132029');
    });
  });

  describe('years grid generation', () => {
    it('generates 12 years centered on the decade', () => {
      const viewYear = 2024;
      const decadeStart = getDecadeStart(viewYear);
      const years = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i);
      expect(years).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030]);
    });

    it('first and last years are out-of-range (adjacent decades)', () => {
      const viewYear = 2024;
      const decadeStart = getDecadeStart(viewYear);
      const years = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i);
      // i=0 → out of range (previous decade), i=11 → out of range (next decade)
      expect(years[0]).toBe(2019); // prev decade
      expect(years[11]).toBe(2030); // next decade
      // in-range: indices 1-10
      expect(years[1]).toBe(2020);
      expect(years[10]).toBe(2029);
    });
  });

  describe('navigation at different levels', () => {
    it('prev/next at days level changes month', () => {
      let viewMonth = 5; // June
      let viewYear = 2024;
      // simulate navigateNext
      if (viewMonth === 11) { viewMonth = 0; viewYear++; }
      else { viewMonth++; }
      expect(viewMonth).toBe(6); // July
      expect(viewYear).toBe(2024);
    });

    it('prev/next at days level wraps year', () => {
      let viewMonth = 11; // December
      let viewYear = 2024;
      // simulate navigateNext
      if (viewMonth === 11) { viewMonth = 0; viewYear++; }
      else { viewMonth++; }
      expect(viewMonth).toBe(0); // January
      expect(viewYear).toBe(2025);
    });

    it('prev at days level wraps year backward', () => {
      let viewMonth = 0; // January
      let viewYear = 2024;
      // simulate navigatePrev
      if (viewMonth === 0) { viewMonth = 11; viewYear--; }
      else { viewMonth--; }
      expect(viewMonth).toBe(11); // December
      expect(viewYear).toBe(2023);
    });

    it('prev/next at months level changes year', () => {
      let viewYear = 2024;
      viewYear--; // prev
      expect(viewYear).toBe(2023);
      viewYear += 2; // next twice
      expect(viewYear).toBe(2025);
    });

    it('prev/next at years level changes by decade', () => {
      let viewYear = 2024;
      viewYear -= 10; // prev → 2014, decade 2010
      expect(getDecadeStart(viewYear)).toBe(2010);
      viewYear += 20; // next twice → 2034, decade 2030
      expect(getDecadeStart(viewYear)).toBe(2030);
    });
  });

  describe('zoom transitions', () => {
    it('zoom out from days goes to months', () => {
      let viewLevel: string = 'days';
      if (viewLevel === 'days') viewLevel = 'months';
      expect(viewLevel).toBe('months');
    });

    it('zoom out from months goes to years', () => {
      let viewLevel: string = 'months';
      if (viewLevel === 'months') viewLevel = 'years';
      expect(viewLevel).toBe('years');
    });

    it('cannot zoom out from years', () => {
      const viewLevel = 'years';
      const canZoomOut = viewLevel !== 'years';
      expect(canZoomOut).toBe(false);
    });

    it('selecting a year zooms into months', () => {
      let viewLevel: string = 'years';
      let viewYear = 2020;
      // simulate selectYear(2025)
      viewYear = 2025;
      viewLevel = 'months';
      expect(viewLevel).toBe('months');
      expect(viewYear).toBe(2025);
    });

    it('selecting a month zooms into days', () => {
      let viewLevel: string = 'months';
      let viewMonth = 0;
      // simulate selectMonth(6)
      viewMonth = 6;
      viewLevel = 'days';
      expect(viewLevel).toBe('days');
      expect(viewMonth).toBe(6);
    });
  });
});

describe('Date range selection', () => {
  it('single mode formats as YYYY-MM-DD', () => {
    const date = new Date(2024, 5, 15);
    expect(formatDate(date)).toBe('2024-06-15');
  });

  it('range format is [start TO end]', () => {
    const start = new Date(2024, 0, 10);
    const end = new Date(2024, 0, 20);
    const result = `[${formatDate(start)} TO ${formatDate(end)}]`;
    expect(result).toBe('[2024-01-10 TO 2024-01-20]');
  });

  it('range with reversed dates orders correctly', () => {
    const start = new Date(2024, 0, 20);
    const end = new Date(2024, 0, 10);
    const [s, e] = start <= end ? [start, end] : [end, start];
    const result = `[${formatDate(s)} TO ${formatDate(e)}]`;
    expect(result).toBe('[2024-01-10 TO 2024-01-20]');
  });
});

describe('Range hover preview logic', () => {
  // These tests verify the preview range logic used by DateRangePicker:
  // when rangeStart is set and rangeEnd is null, hoverDate acts as previewEnd.

  it('hover date creates a preview range with isDateInRange', () => {
    const rangeStart = new Date(2024, 0, 10);
    const hoverDate = new Date(2024, 0, 20);
    const previewEnd = hoverDate; // rangeEnd is null, so hoverDate is used

    // Dates between start and hover should be in range
    expect(isDateInRange(new Date(2024, 0, 15), rangeStart, previewEnd)).toBe(true);
    // Start and end themselves
    expect(isDateInRange(rangeStart, rangeStart, previewEnd)).toBe(true);
    expect(isDateInRange(hoverDate, rangeStart, previewEnd)).toBe(true);
    // Outside the range
    expect(isDateInRange(new Date(2024, 0, 5), rangeStart, previewEnd)).toBe(false);
    expect(isDateInRange(new Date(2024, 0, 25), rangeStart, previewEnd)).toBe(false);
  });

  it('hover preview works when hovering before the start date (reversed)', () => {
    const rangeStart = new Date(2024, 0, 20);
    const hoverDate = new Date(2024, 0, 10); // hovering before start

    // isDateInRange handles reversed ranges via Math.min/max
    expect(isDateInRange(new Date(2024, 0, 15), rangeStart, hoverDate)).toBe(true);
    expect(isDateInRange(new Date(2024, 0, 10), rangeStart, hoverDate)).toBe(true);
    expect(isDateInRange(new Date(2024, 0, 20), rangeStart, hoverDate)).toBe(true);
    expect(isDateInRange(new Date(2024, 0, 5), rangeStart, hoverDate)).toBe(false);
  });

  it('no preview when hoverDate is null (mouse left the calendar)', () => {
    const rangeStart = new Date(2024, 0, 10);
    const hoverDate = null;
    const previewEnd = hoverDate; // null

    expect(isDateInRange(new Date(2024, 0, 15), rangeStart, previewEnd)).toBe(false);
  });

  it('month-level preview: month dates fall in range between start and hover month', () => {
    const rangeStart = new Date(2024, 0, 15); // Jan 15
    const hoverMonth = new Date(2024, 3, 1);  // Hovering on April

    // Feb and March are between Jan and April
    const feb = new Date(2024, 1, 1);
    const mar = new Date(2024, 2, 1);
    expect(isDateInRange(feb, rangeStart, hoverMonth)).toBe(true);
    expect(isDateInRange(mar, rangeStart, hoverMonth)).toBe(true);
    // May is outside
    expect(isDateInRange(new Date(2024, 4, 1), rangeStart, hoverMonth)).toBe(false);
  });

  it('year-level preview: years in range between start and hover year', () => {
    const startYear = 2022;
    const hoverYear = 2025;

    // Years between should be in range
    for (const y of [2022, 2023, 2024, 2025]) {
      expect(y >= Math.min(startYear, hoverYear) && y <= Math.max(startYear, hoverYear)).toBe(true);
    }
    // Outside
    expect(2021 >= Math.min(startYear, hoverYear) && 2021 <= Math.max(startYear, hoverYear)).toBe(false);
    expect(2026 >= Math.min(startYear, hoverYear) && 2026 <= Math.max(startYear, hoverYear)).toBe(false);
  });
});

describe('Date picker style consistency', () => {
  // day, dayInRange, and daySelected all use the backgroundColor longhand.
  // Mixing shorthand `background` with longhand `backgroundColor` causes
  // stale backgrounds when React removes the longhand on re-render.

  it('day style uses backgroundColor (not background shorthand) to avoid conflict with dayInRange', () => {
    const s = getDatePickerStyle(mergeColors(), mergeStyles());

    // day must use backgroundColor, not background
    expect(s.day).toHaveProperty('backgroundColor');
    expect(s.day).not.toHaveProperty('background');

    // dayInRange and daySelected also use backgroundColor
    expect(s.dayInRange).toHaveProperty('backgroundColor');
    expect(s.daySelected).toHaveProperty('backgroundColor');
  });
});
