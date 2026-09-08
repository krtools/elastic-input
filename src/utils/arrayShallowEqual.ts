/**
 * Shallow array equality: same length and same elements by reference (`===`).
 *
 * Used to absorb identity-only churn on array props — e.g. a `fields` array
 * re-created every render from the same element objects (`[...FIELDS]`,
 * `FIELDS.filter(...)`). Element contents are NOT compared: two structurally
 * identical objects at the same index are unequal unless they are the same
 * reference.
 */
export function arrayShallowEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
