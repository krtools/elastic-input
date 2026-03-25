import { Token, TokenType } from '../lexer/tokens';
import { ColorConfig } from '../types';
import { mergeColors } from '../styles/inlineStyles';
import { buildRegexHTML } from '../highlighting/regexHighlight';
import { buildRangeHTML } from '../highlighting/rangeHighlight';
import { findMatchingParen, ParenMatch } from '../highlighting/parenMatch';

const TOKEN_CLASS_MAP: Record<TokenType, string> = {
  [TokenType.FIELD_NAME]: 'field-name',
  [TokenType.COLON]: 'colon',
  [TokenType.VALUE]: 'value',
  [TokenType.QUOTED_VALUE]: 'quoted-value',
  [TokenType.AND]: 'and',
  [TokenType.OR]: 'or',
  [TokenType.NOT]: 'not',
  [TokenType.COMPARISON_OP]: 'comparison-op',
  [TokenType.LPAREN]: 'lparen',
  [TokenType.RPAREN]: 'rparen',
  [TokenType.SAVED_SEARCH]: 'saved-search',
  [TokenType.HISTORY_REF]: 'history-ref',
  [TokenType.PREFIX_OP]: 'prefix-op',
  [TokenType.WILDCARD]: 'wildcard',
  [TokenType.REGEX]: 'regex',
  [TokenType.RANGE]: 'range',
  [TokenType.TILDE]: 'tilde',
  [TokenType.BOOST]: 'boost',
  [TokenType.WHITESPACE]: 'whitespace',
  [TokenType.UNKNOWN]: 'unknown',
};

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
  [TokenType.RANGE]: 'fieldValue',
  [TokenType.TILDE]: 'operator',
  [TokenType.BOOST]: 'operator',
  [TokenType.WHITESPACE]: 'text',
  [TokenType.UNKNOWN]: 'error',
};

export interface HighlightOptions {
  cursorOffset?: number;
  /** Custom class name appended to every token span. */
  tokenClassName?: string;
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
      return buildRegexHTML(token, colors, options?.tokenClassName);
    }

    // Range tokens get sub-highlighted
    if (token.type === TokenType.RANGE) {
      return buildRangeHTML(token, colors, options?.tokenClassName);
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

    const tokenClass = `ei-token ei-token--${TOKEN_CLASS_MAP[token.type]}${options?.tokenClassName ? ' ' + options.tokenClassName : ''}`;
    return `<span class="${tokenClass}" style="color:${color};font-weight:${fontWeight};${extraStyle}" data-token-start="${token.start}" data-token-end="${token.end}">${escapedValue}</span>`;
  }).join('');
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
