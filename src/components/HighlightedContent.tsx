import { Token, TokenType } from '../lexer/tokens';
import { ColorConfig } from '../types';
import { mergeColors } from '../styles/inlineStyles';

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
  [TokenType.TILDE]: 'operator',
  [TokenType.BOOST]: 'operator',
  [TokenType.WHITESPACE]: 'text',
  [TokenType.UNKNOWN]: 'error',
};

export function buildHighlightedHTML(tokens: Token[], colorConfig?: ColorConfig): string {
  const colors = mergeColors(colorConfig);

  if (tokens.length === 0) return '';

  return tokens.map(token => {
    const colorKey = TOKEN_COLOR_MAP[token.type] || 'text';
    const color = colors[colorKey] || colors.text;
    const escapedValue = escapeHTML(token.value);

    if (token.type === TokenType.WHITESPACE) {
      return escapedValue;
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

    return `<span style="color:${color};font-weight:${fontWeight}" data-token-start="${token.start}" data-token-end="${token.end}">${escapedValue}</span>`;
  }).join('');
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
