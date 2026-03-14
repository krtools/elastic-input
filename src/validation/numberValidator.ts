export function validateNumber(value: string): string | null {
  if (value === '') return null;
  const num = Number(value);
  if (isNaN(num)) {
    return `"${value}" is not a valid number`;
  }
  return null;
}
