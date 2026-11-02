/**
 * The space an accept adds after inserted text so typing continues as a new
 * term: one when nothing follows, one in place of trailing whitespace, none
 * when other text follows (the insert then sits inside existing text).
 */
export function exitSpace(after: string, enabled: boolean): { space: string; after: string } {
  if (!enabled) return { space: '', after };
  if (after.length === 0) return { space: ' ', after };
  if (/^[ \t\r\n]+$/.test(after)) return { space: ' ', after: '' };
  return { space: '', after };
}
