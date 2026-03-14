const DATE_FORMATS = [
  /^\d{4}-\d{2}-\d{2}$/,                    // 2024-01-15
  /^\d{4}\/\d{2}\/\d{2}$/,                  // 2024/01/15
  /^\d{2}\/\d{2}\/\d{4}$/,                  // 01/15/2024
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO 8601
  /^now$/i,                                   // Relative
  /^now[+-]\d+[dhms]$/i,                     // now-7d, now+1h
];

export function isValidDateString(value: string): boolean {
  for (const fmt of DATE_FORMATS) {
    if (fmt.test(value)) return true;
  }
  const parsed = Date.parse(value);
  return !isNaN(parsed);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(value: string): Date | null {
  if (/^now$/i.test(value)) return new Date();

  const relMatch = value.match(/^now([+-])(\d+)([dhms])$/i);
  if (relMatch) {
    const date = new Date();
    const sign = relMatch[1] === '+' ? 1 : -1;
    const amount = parseInt(relMatch[2], 10);
    const unit = relMatch[3].toLowerCase();
    switch (unit) {
      case 'd': date.setDate(date.getDate() + sign * amount); break;
      case 'h': date.setHours(date.getHours() + sign * amount); break;
      case 'm': date.setMinutes(date.getMinutes() + sign * amount); break;
      case 's': date.setSeconds(date.getSeconds() + sign * amount); break;
    }
    return date;
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isDateInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const t = date.getTime();
  const s = start.getTime();
  const e = end.getTime();
  return t >= Math.min(s, e) && t <= Math.max(s, e);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function getMonthName(month: number): string {
  return MONTH_NAMES[month];
}
