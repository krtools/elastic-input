import { Token } from '../lexer/tokens';
import { ColorConfig } from '../types';

export type RegexPartType =
  | 'delimiter'
  | 'charClass'
  | 'groupOpen'
  | 'groupClose'
  | 'escape'
  | 'quantifier'
  | 'anchor'
  | 'alternation'
  | 'text';

export interface RegexPart {
  type: RegexPartType;
  text: string;
}

const REGEX_COLOR_MAP: Record<RegexPartType, keyof ColorConfig> = {
  delimiter: 'regexDelimiter',
  charClass: 'regexCharClass',
  groupOpen: 'regexGroup',
  groupClose: 'regexGroup',
  escape: 'regexEscape',
  quantifier: 'regexQuantifier',
  anchor: 'regexAnchor',
  alternation: 'regexAlternation',
  text: 'regexText',
};

export function tokenizeRegexContent(value: string): RegexPart[] {
  const parts: RegexPart[] = [];
  let i = 0;
  let textBuf = '';

  function flushText() {
    if (textBuf) {
      parts.push({ type: 'text', text: textBuf });
      textBuf = '';
    }
  }

  // Leading delimiter
  if (value.startsWith('/')) {
    parts.push({ type: 'delimiter', text: '/' });
    i = 1;
  }

  // Find trailing delimiter position
  const lastSlash = value.lastIndexOf('/');
  const end = lastSlash > 0 ? lastSlash : value.length;

  while (i < end) {
    const ch = value[i];

    // Escape sequence
    if (ch === '\\' && i + 1 < end) {
      flushText();
      parts.push({ type: 'escape', text: value.slice(i, i + 2) });
      i += 2;
      continue;
    }

    // Character class [...]
    if (ch === '[') {
      flushText();
      let j = i + 1;
      // Handle negation and ] as first char
      if (j < end && value[j] === '^') j++;
      if (j < end && value[j] === ']') j++;
      while (j < end && value[j] !== ']') {
        if (value[j] === '\\' && j + 1 < end) j++; // skip escape
        j++;
      }
      if (j < end) j++; // include closing ]
      parts.push({ type: 'charClass', text: value.slice(i, j) });
      i = j;
      continue;
    }

    // Group parens
    if (ch === '(') {
      flushText();
      // Include non-capturing (?:, lookahead (?=, (?!, (?<=, (?<!
      let groupText = '(';
      if (i + 1 < end && value[i + 1] === '?') {
        let k = i + 2;
        // Consume modifier chars: :, =, !, <, <=, <!
        while (k < end && k < i + 4 && /[:<>=!]/.test(value[k])) k++;
        groupText = value.slice(i, k);
      }
      parts.push({ type: 'groupOpen', text: groupText });
      i += groupText.length;
      continue;
    }

    if (ch === ')') {
      flushText();
      parts.push({ type: 'groupClose', text: ')' });
      i++;
      continue;
    }

    // Quantifiers
    if (ch === '+' || ch === '*' || ch === '?') {
      flushText();
      let q = ch;
      // Lazy modifier
      if (i + 1 < end && value[i + 1] === '?') {
        q += '?';
      }
      parts.push({ type: 'quantifier', text: q });
      i += q.length;
      continue;
    }

    if (ch === '{') {
      flushText();
      let j = i + 1;
      while (j < end && value[j] !== '}') j++;
      if (j < end) j++; // include }
      parts.push({ type: 'quantifier', text: value.slice(i, j) });
      i = j;
      continue;
    }

    // Anchors
    if (ch === '^' || ch === '$') {
      flushText();
      parts.push({ type: 'anchor', text: ch });
      i++;
      continue;
    }

    // Alternation
    if (ch === '|') {
      flushText();
      parts.push({ type: 'alternation', text: '|' });
      i++;
      continue;
    }

    // Regular text
    textBuf += ch;
    i++;
  }

  flushText();

  // Trailing delimiter
  if (lastSlash > 0 && lastSlash < value.length) {
    parts.push({ type: 'delimiter', text: '/' });
  }

  return parts;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildRegexHTML(token: Token, colors: Required<ColorConfig>, tokenClassName?: string): string {
  const parts = tokenizeRegexContent(token.value);
  const innerSpans = parts.map(part => {
    const colorKey = REGEX_COLOR_MAP[part.type];
    const color = colors[colorKey] || colors.regexText;
    const fontWeight = part.type === 'delimiter' ? '600' : 'normal';
    return `<span class="ei-regex-part ei-regex-part--${part.type}" style="color:${color};font-weight:${fontWeight}">${escapeHTML(part.text)}</span>`;
  }).join('');

  const cls = `ei-token ei-token--regex${tokenClassName ? ' ' + tokenClassName : ''}`;
  return `<span class="${cls}" data-token-start="${token.start}" data-token-end="${token.end}">${innerSpans}</span>`;
}
