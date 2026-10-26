import { Token, TokenType } from '../lexer/tokens';
import { ColorConfig, FieldType } from '../types';

// ColorConfig keys that hold a plain color string (excludes the valueTypes map)
type ColorKey = Exclude<keyof ColorConfig, 'valueTypes'>;
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

const TOKEN_COLOR_MAP: Record<TokenType, ColorKey> = {
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

/** On every span of the clause the caret is in (§9.5.7). */
export const ACTIVE_CLAUSE_CLASS = 'ei-clause--active';
/** On the two parens the caret's paren match highlights. */
export const MATCHED_PAREN_CLASS = 'ei-paren--matched';

export interface HighlightOptions {
  cursorOffset?: number;
  /** Custom class name appended to every token span. */
  tokenClassName?: string;
  /** Field lookup map for per-type value coloring (keyed by field name and aliases). */
  fieldTypeMap?: Map<string, FieldType>;
  /**
   * The clause the caret is in. Every span inside it (whitespace included,
   * so a background reads as one block) gets `ei-clause--active` plus
   * `activeClauseClassName`, for a stylesheet to style.
   */
  activeClause?: { start: number; end: number } | null;
  activeClauseClassName?: string;
}

export function buildHighlightedHTML(tokens: Token[], colorConfig?: ColorConfig, options?: HighlightOptions): string {
  const colors = mergeColors(colorConfig);

  if (tokens.length === 0) return '';

  // Compute paren match if cursor position is provided
  const parenMatch: ParenMatch | null =
    options?.cursorOffset !== undefined
      ? findMatchingParen(tokens, options.cursorOffset)
      : null;

  // Build a map of token index → field type for value tokens.
  // Handles both simple field:value and field groups field:(a OR b).
  const valueTypes = colorConfig?.valueTypes;
  const fieldTypeMap = options?.fieldTypeMap;
  let tokenFieldTypes: (FieldType | undefined)[] | undefined;
  if (valueTypes && fieldTypeMap) {
    tokenFieldTypes = new Array(tokens.length);
    let pendingFieldName: string | undefined;
    let sawColon = false;
    // Stack of field types for nested field groups: field:(a OR (b AND c))
    const groupStack: (FieldType | undefined)[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === TokenType.FIELD_NAME) {
        pendingFieldName = t.value;
        sawColon = false;
      } else if (t.type === TokenType.COLON && pendingFieldName) {
        sawColon = true;
      } else if (t.type === TokenType.WHITESPACE) {
        // whitespace between colon and value is allowed
      } else if (t.type === TokenType.LPAREN) {
        if (sawColon && pendingFieldName) {
          // field:( — push field type onto group stack
          groupStack.push(fieldTypeMap.get(pendingFieldName.toLowerCase()));
        } else {
          // plain grouping paren — push undefined
          groupStack.push(undefined);
        }
        pendingFieldName = undefined;
        sawColon = false;
      } else if (t.type === TokenType.RPAREN) {
        groupStack.pop();
        pendingFieldName = undefined;
        sawColon = false;
      } else if (
        t.type === TokenType.VALUE || t.type === TokenType.QUOTED_VALUE ||
        t.type === TokenType.RANGE || t.type === TokenType.REGEX ||
        t.type === TokenType.WILDCARD
      ) {
        if (sawColon && pendingFieldName) {
          // Direct field:value
          tokenFieldTypes[i] = fieldTypeMap.get(pendingFieldName.toLowerCase());
        } else if (groupStack.length > 0) {
          // Inside a field group — use innermost group's type
          tokenFieldTypes[i] = groupStack[groupStack.length - 1];
        }
        pendingFieldName = undefined;
        sawColon = false;
      } else if (t.type === TokenType.AND || t.type === TokenType.OR || t.type === TokenType.NOT) {
        // Boolean operators inside groups don't reset context
        pendingFieldName = undefined;
        sawColon = false;
      } else {
        pendingFieldName = undefined;
        sawColon = false;
      }
    }
  }

  const active = options?.activeClause ?? null;
  const activeClass = active ? `${ACTIVE_CLAUSE_CLASS}${options?.activeClauseClassName ? ' ' + options.activeClauseClassName : ''}` : '';

  let html = tokens.map((token, tokenIndex) => {
    const inActive = !!active && token.start >= active.start && token.end <= active.end;
    const colorKey = TOKEN_COLOR_MAP[token.type] || 'text';
    let color = colors[colorKey] || colors.text;

    // Per-field-type value color override
    if (valueTypes && tokenFieldTypes) {
      const ft = tokenFieldTypes[tokenIndex];
      if (ft && valueTypes[ft]) {
        color = valueTypes[ft]!;
      }
    }

    const escapedValue = escapeHTML(token.value);

    if (token.type === TokenType.WHITESPACE) {
      // Convert newlines to <br> for contentEditable rendering
      const ws = escapedValue.replace(/\n/g, '<br>');
      return inActive ? `<span class="${activeClass}">${ws}</span>` : ws;
    }

    // Regex tokens get sub-highlighted
    if (token.type === TokenType.REGEX) {
      return buildRegexHTML(token, colors, options?.tokenClassName, inActive ? activeClass : '');
    }

    // Range tokens get sub-highlighted
    if (token.type === TokenType.RANGE) {
      return buildRangeHTML(token, colors, options?.tokenClassName, inActive ? activeClass : '');
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
    let matchedParen = false;
    if (parenMatch && (token.type === TokenType.LPAREN || token.type === TokenType.RPAREN)) {
      if (token.start === parenMatch.openStart || token.start === parenMatch.closeStart) {
        matchedParen = true;
        fontWeight = '700';
        extraStyle = `background-color:${colors.matchedParenBg};border-radius:2px;`;
      }
    }

    const tokenClass = `ei-token ei-token--${TOKEN_CLASS_MAP[token.type]}${options?.tokenClassName ? ' ' + options.tokenClassName : ''}${matchedParen ? ' ' + MATCHED_PAREN_CLASS : ''}${inActive ? ' ' + activeClass : ''}`;
    return `<span class="${tokenClass}" style="color:${color};font-weight:${fontWeight};${extraStyle}" data-token-start="${token.start}" data-token-end="${token.end}">${escapedValue}</span>`;
  }).join('');

  // A trailing <br> in contentEditable doesn't create a visible empty line —
  // the browser treats it as a "line terminator" only. Append a sentinel <br>
  // so the caret can be placed on the new line and the editor grows in height.
  // The data-sentinel attribute tells getPlainText to skip it.
  if (html.endsWith('<br>')) {
    html += '<br data-sentinel>';
  }

  return html;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Removes the caret-dependent marks (matched parens, active clause) from the
 * rendered spans in place. Used when the editor blurs: rebuilding the HTML
 * would wipe the selection a blurred editor keeps — the caret a refocus (Tab
 * away and back) returns to, and what `api.getSelection` reports once focus
 * has moved to a button.
 */
export function clearCaretMarks(editor: HTMLElement, activeClassName?: string): void {
  const extra = (activeClassName || '').split(/\s+/).filter(Boolean);
  editor.querySelectorAll<HTMLElement>('.' + ACTIVE_CLAUSE_CLASS).forEach(el => {
    el.classList.remove(ACTIVE_CLAUSE_CLASS, ...extra);
  });
  editor.querySelectorAll<HTMLElement>('.' + MATCHED_PAREN_CLASS).forEach(el => {
    el.classList.remove(MATCHED_PAREN_CLASS);
    el.style.backgroundColor = '';
    el.style.borderRadius = '';
    el.style.fontWeight = 'normal'; // what an unmatched paren is built with
  });
}
