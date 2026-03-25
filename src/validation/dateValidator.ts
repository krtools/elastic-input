import { isValidDateString } from '../utils/dateUtils';

export type ParseDateFn = (value: string) => Date | null;

export function validateDate(value: string, parseDateFn?: ParseDateFn): string | null {
  if (value === '') return null;

  // Range syntax: [date TO date], {date TO date}, [date TO date}, {date TO date]
  const rangeMatch = value.match(/^[\[{](.+)\s+TO\s+(.+)[\]}]$/i);
  if (rangeMatch) {
    const startErr = validateSingleDate(rangeMatch[1].trim(), parseDateFn);
    if (startErr) return `Range start: ${startErr}`;
    const endErr = validateSingleDate(rangeMatch[2].trim(), parseDateFn);
    if (endErr) return `Range end: ${endErr}`;
    return null;
  }

  return validateSingleDate(value, parseDateFn);
}

function validateSingleDate(value: string, parseDateFn?: ParseDateFn): string | null {
  // Handle rounding syntax like now/d
  if (/^now(\/[dhms])?$/i.test(value)) return null;
  if (/^now[+-]\d+[dhms](\/[dhms])?$/i.test(value)) return null;
  if (parseDateFn && parseDateFn(value) !== null) return null;
  if (isValidDateString(value)) return null;
  return `"${value}" is not a valid date. Use YYYY-MM-DD, relative (now-7d), or ISO 8601.`;
}
