import { describe, it, expect } from 'vitest';
import { atTermBoundary } from '../utils/textUtils';

describe('atTermBoundary (dropdown.open: "input" momentum rule)', () => {
  it('is a boundary at the start and after whitespace', () => {
    expect(atTermBoundary('', 0)).toBe(true);
    expect(atTermBoundary('sta', 0)).toBe(true);
    expect(atTermBoundary('(a) ', 4)).toBe(true);
    expect(atTermBoundary('a\nb', 2)).toBe(true);
  });

  it('is a boundary right after a closing paren, bracket, or brace', () => {
    expect(atTermBoundary('(a)', 3)).toBe(true);
    expect(atTermBoundary('[1 TO 2]', 8)).toBe(true);
    expect(atTermBoundary('{1 TO 2}', 8)).toBe(true);
  });

  it('is not a boundary mid-word or after an opening delimiter', () => {
    expect(atTermBoundary('sta', 3)).toBe(false);
    expect(atTermBoundary('status:', 7)).toBe(false);
    expect(atTermBoundary('(', 1)).toBe(false);
    expect(atTermBoundary('status:"', 8)).toBe(false);
  });
});
