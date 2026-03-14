import { Token, TokenType } from '../lexer/tokens';

export interface ParenMatch {
  openStart: number;
  closeStart: number;
}

/**
 * Find matching parenthesis pair based on cursor position.
 *
 * Follows standard IDE bracket matching rules (VS Code / JetBrains):
 * 1. Check "after" first: if the character immediately before the cursor is a paren,
 *    that paren and its match are highlighted.
 * 2. Then check "before": if the character at the cursor position (right of caret) is a paren,
 *    that paren and its match are highlighted.
 * 3. "After" (left of caret) takes precedence.
 */
export function findMatchingParen(tokens: Token[], cursorOffset: number): ParenMatch | null {
  if (cursorOffset < 0) return null;

  const parenTokens = tokens.filter(
    t => t.type === TokenType.LPAREN || t.type === TokenType.RPAREN
  );

  if (parenTokens.length === 0) return null;

  // Check "after" (left of cursor): paren whose end === cursorOffset
  const afterToken = parenTokens.find(t => t.end === cursorOffset);
  if (afterToken) {
    const match = findMatch(parenTokens, afterToken);
    if (match) return match;
  }

  // Check "before" (right of cursor): paren whose start === cursorOffset
  const beforeToken = parenTokens.find(t => t.start === cursorOffset);
  if (beforeToken) {
    const match = findMatch(parenTokens, beforeToken);
    if (match) return match;
  }

  return null;
}

function findMatch(parenTokens: Token[], token: Token): ParenMatch | null {
  if (token.type === TokenType.LPAREN) {
    // Scan forward for matching RPAREN
    const idx = parenTokens.indexOf(token);
    let depth = 0;
    for (let i = idx; i < parenTokens.length; i++) {
      if (parenTokens[i].type === TokenType.LPAREN) depth++;
      else if (parenTokens[i].type === TokenType.RPAREN) depth--;
      if (depth === 0) {
        return { openStart: token.start, closeStart: parenTokens[i].start };
      }
    }
  } else {
    // Scan backward for matching LPAREN
    const idx = parenTokens.indexOf(token);
    let depth = 0;
    for (let i = idx; i >= 0; i--) {
      if (parenTokens[i].type === TokenType.RPAREN) depth++;
      else if (parenTokens[i].type === TokenType.LPAREN) depth--;
      if (depth === 0) {
        return { openStart: parenTokens[i].start, closeStart: token.start };
      }
    }
  }
  return null;
}
