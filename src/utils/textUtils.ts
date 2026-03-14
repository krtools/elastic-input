import { Token, TokenType } from '../lexer/tokens';

/**
 * Normalize typographic/smart characters to their ASCII equivalents.
 * Handles smart quotes (from Outlook, Word, macOS auto-correct, etc.),
 * em/en dashes, ellipsis, non-breaking spaces, and other common substitutions.
 */
export function normalizeTypographicChars(text: string): string {
  return text
    // CRLF → LF (normalize Windows line endings)
    .replace(/\r\n/g, '\n')
    // Stray carriage returns → LF
    .replace(/\r/g, '\n')
    // Smart double quotes → standard double quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    // Smart single quotes / apostrophes → standard single quote
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Em dash, en dash → hyphen-minus
    .replace(/[\u2013\u2014]/g, '-')
    // Horizontal ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Non-breaking space, narrow no-break space, figure space → regular space
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    // Fullwidth variants of ASCII chars (common in CJK input)
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

/** Bracket/quote pairs for selection wrapping. */
export const WRAP_PAIRS: Record<string, string> = { '(': ')', '[': ']', '"': '"', "'": "'" };

/**
 * Wrap a selection range with an open/close pair.
 * Returns the new text and cursor position (placed after the closing bracket).
 */
export function wrapSelection(
  text: string,
  selStart: number,
  selEnd: number,
  openChar: string,
  closeChar: string,
): { newValue: string; newCursorPos: number } {
  const before = text.slice(0, selStart);
  const selected = text.slice(selStart, selEnd);
  const after = text.slice(selEnd);
  return {
    newValue: before + openChar + selected + closeChar + after,
    newCursorPos: selEnd + 2,
  };
}

/**
 * Get the plaintext content from a contenteditable element,
 * converting `<br>` elements to newline characters.
 *
 * When the element has no text content (only `<br>` elements), returns `''`.
 * Browsers leave a `<br>` artifact in empty contentEditable divs; this
 * check prevents that phantom newline from persisting through the
 * lex → highlight → innerHTML cycle.
 */
export function getPlainText(element: HTMLElement): string {
  // Browsers leave a <br> in empty contentEditable divs as an artifact.
  // textContent ignores <br> and returns '' when there's no real text.
  if (!element.textContent) {
    return '';
  }
  const parts: string[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
    } else if (node.nodeName === 'BR') {
      parts.push('\n');
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
  }
  walk(element);
  return parts.join('');
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
