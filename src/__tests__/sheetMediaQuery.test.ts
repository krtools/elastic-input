import { describe, it, expect } from 'vitest';
import { SHEET_MEDIA_QUERY } from '../utils/viewport';

describe('SHEET_MEDIA_QUERY', () => {
  it('selects the sheet for portrait phones by width and landscape phones by height on a coarse pointer', () => {
    const clauses = SHEET_MEDIA_QUERY.split(', ');
    expect(clauses).toEqual(['(max-width: 640px)', '((pointer: coarse) and (max-height: 500px))']);
  });
});
