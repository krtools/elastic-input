import { Token, TokenType } from '../lexer/tokens';

/**
 * Token types eligible for "smart select" on first Ctrl+A.
 * Expand this set to include additional token types as needed.
 */
const SMART_SELECT_TYPES = new Set<TokenType>([
  TokenType.VALUE,
  TokenType.QUOTED_VALUE,
  TokenType.WILDCARD,
]);

/**
 * Determine the selection range for a smart Ctrl+A press.
 *
 * Returns the token range if the cursor is inside an eligible token
 * and the selection doesn't already cover it. Returns null when the
 * caller should fall through to normal select-all behavior.
 */
export function getSmartSelectRange(
  tokens: Token[],
  selStart: number,
  selEnd: number,
): { start: number; end: number } | null {
  for (const token of tokens) {
    if (selStart >= token.start && selStart <= token.end && SMART_SELECT_TYPES.has(token.type)) {
      // Selection already covers this token — fall through to select all
      if (selStart === token.start && selEnd === token.end) {
        return null;
      }
      return { start: token.start, end: token.end };
    }
  }
  return null;
}
