/** `dropdown.homeEndKeys` values. */
export type HomeEndKeysMode = boolean | 'once';

/**
 * Decide what a Home/End press does while the dropdown is open.
 *
 * Returns the suggestion index to highlight when the dropdown consumes the
 * key, or `null` when the key should pass through to the text caret.
 *
 * - `false`: never consumed.
 * - `true`: consumed whenever an item is highlighted.
 * - `'once'`: consumed only if the highlight can still move — when it is
 *   already on the first (Home) or last (End) item, the key passes through.
 */
export function resolveHomeEndKey(
  mode: HomeEndKeysMode,
  key: 'Home' | 'End',
  selectedIndex: number,
  suggestionCount: number,
): number | null {
  if (!mode || selectedIndex < 0 || suggestionCount <= 0) return null;
  const target = key === 'Home' ? 0 : suggestionCount - 1;
  if (mode === 'once' && selectedIndex === target) return null;
  return target;
}
