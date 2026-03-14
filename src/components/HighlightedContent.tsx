import { Token, TokenType } from '../lexer/tokens';
import { ColorConfig } from '../types';
import { mergeColors } from '../styles/inlineStyles';
import { buildRegexHTML } from '../highlighting/regexHighlight';
import { findMatchingParen, ParenMatch } from '../highlighting/parenMatch';

const TOKEN_COLOR_MAP: Record<TokenType, keyof ColorConfig> = {
  [TokenType.FIELD_NAME]: 'fieldName',
  [TokenType.COLON]: 'operator',
  [TokenType.VALUE]: 'fieldValue',
  [TokenType.QUOTED_VALUE]: 'quoted',
  [TokenType.AND]: 'booleanOp',
  [TokenType.OR]: 'booleanOp',
  [TokenType.NOT]: 'booleanOp',
  [TokenType.COMPARISON_OP]: 'operator',
  [TokenType.LPAREN]: 'paren',
  [TokenType.RPAREN]: 'paren',
  [TokenType.SAVED_SEARCH]: 'savedSearch',
  [TokenType.HISTORY_REF]: 'historyRef',
  [TokenType.PREFIX_OP]: 'operator',
  [TokenType.WILDCARD]: 'wildcard',
  [TokenType.REGEX]: 'quoted',
  [TokenType.TILDE]: 'operator',
  [TokenType.BOOST]: 'operator',
  [TokenType.WHITESPACE]: 'text',
  [TokenType.UNKNOWN]: 'error',
};

export interface HighlightOptions {
  cursorOffset?: number;
}

export function buildHighlightedHTML(tokens: Token[], colorConfig?: ColorConfig, options?: HighlightOptions): string {
  const colors = mergeColors(colorConfig);

  if (tokens.length === 0) return '';

  // Compute paren match if cursor position is provided
  const parenMatch: ParenMatch | null =
    options?.cursorOffset !== undefined
      ? findMatchingParen(tokens, options.cursorOffset)
      : null;

  return tokens.map(token => {
    const colorKey = TOKEN_COLOR_MAP[token.type] || 'text';
    const color = colors[colorKey] || colors.text;
    const escapedValue = escapeHTML(token.value);

    if (token.type === TokenType.WHITESPACE) {
      // Convert newlines to <br> for contentEditable rendering
      return escapedValue.replace(/\n/g, '<br>');
    }

    // Regex tokens get sub-highlighted
    if (token.type === TokenType.REGEX) {
      return buildRegexHTML(token, colors);
    }

    let fontWeight = 'normal';
    if (
      token.type === TokenType.AND ||
      token.type === TokenType.OR ||
      token.type === TokenType.NOT
    ) {
      fontWeight = '600';
    }
    if (token.type === TokenType.FIELD_NAME) {
      fontWeight = '500';
    }

    // Matched paren highlighting
    let extraStyle = '';
    if (parenMatch && (token.type === TokenType.LPAREN || token.type === TokenType.RPAREN)) {
      if (token.start === parenMatch.openStart || token.start === parenMatch.closeStart) {
        fontWeight = '700';
        extraStyle = `background-color:${colors.matchedParenBg};border-radius:2px;`;
      }
    }

    return `<span style="color:${color};font-weight:${fontWeight};${extraStyle}" data-token-start="${token.start}" data-token-end="${token.end}">${escapedValue}</span>`;
  }).join('');
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
