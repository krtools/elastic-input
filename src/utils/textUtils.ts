import { Token, TokenType } from '../lexer/tokens';

/**
 * Get the plaintext content from a contenteditable element,
 * handling <br> and block elements as newlines.
 */
export function getPlainText(element: HTMLElement): string {
  return element.textContent || '';
}

/**
 * Find which token index the cursor (character offset) falls within.
 */
export function findTokenAtOffset(tokens: Token[], offset: number): number {
  for (let i = 0; i < tokens.length; i++) {
    if (offset >= tokens[i].start && offset <= tokens[i].end) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the previous non-whitespace token index.
 */
export function findPrevNonWsToken(tokens: Token[], fromIndex: number): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (tokens[i].type !== TokenType.WHITESPACE) return i;
  }
  return -1;
}

/**
 * Get the text range for a given token to be replaced by autocomplete.
 * For FIELD_NAME tokens followed by a COLON, extends the range to include the colon
 * so that inserting "field:" doesn't produce "field::".
 */
export function getReplacementRange(
  token: Token | undefined,
  cursorOffset: number,
  tokens?: Token[]
): { start: number; end: number } {
  if (token) {
    let end = token.end;

    // If the token is a FIELD_NAME and is followed by a COLON, extend to include it
    if (token.type === TokenType.FIELD_NAME && tokens) {
      const idx = tokens.indexOf(token);
      if (idx >= 0) {
        for (let i = idx + 1; i < tokens.length; i++) {
          if (tokens[i].type === TokenType.WHITESPACE) continue;
          if (tokens[i].type === TokenType.COLON) {
            end = tokens[i].end;
          }
          break;
        }
      }
    }

    return { start: token.start, end };
  }
  return { start: cursorOffset, end: cursorOffset };
}
