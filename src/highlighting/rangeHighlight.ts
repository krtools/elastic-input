import { Token } from '../lexer/tokens';
import { ColorConfig } from '../types';

export type RangePartType = 'bracket' | 'toKeyword' | 'bareValue' | 'quotedValue' | 'wildcard' | 'whitespace';

export interface RangePart {
  type: RangePartType;
  text: string;
}

const RANGE_COLOR_MAP: Record<RangePartType, keyof ColorConfig> = {
  bracket: 'paren',
  toKeyword: 'booleanOp',
  bareValue: 'fieldValue',
  quotedValue: 'quoted',
  wildcard: 'wildcard',
  whitespace: 'text',
};

export function tokenizeRangeContent(value: string): RangePart[] {
  const parts: RangePart[] = [];
  let i = 0;

  // Leading bracket
  if (i < value.length && (value[i] === '[' || value[i] === '{')) {
    parts.push({ type: 'bracket', text: value[i] });
    i++;
  }

  // Find closing bracket position
  const lastIdx = value.length - 1;
  const hasClosed = lastIdx >= 0 && (value[lastIdx] === ']' || value[lastIdx] === '}');
  const end = hasClosed ? lastIdx : value.length;

  while (i < end) {
    const ch = value[i];

    // Whitespace
    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < end && (value[j] === ' ' || value[j] === '\t')) j++;
      parts.push({ type: 'whitespace', text: value.slice(i, j) });
      i = j;
      continue;
    }

    // TO keyword (case-insensitive, must be whitespace-bounded)
    if ((ch === 'T' || ch === 't') && i + 1 < end && (value[i + 1] === 'O' || value[i + 1] === 'o')) {
      // Check it's bounded by whitespace or brackets
      const before = i === 0 || value[i - 1] === ' ' || value[i - 1] === '\t' || value[i - 1] === '[' || value[i - 1] === '{';
      const after = i + 2 >= end || value[i + 2] === ' ' || value[i + 2] === '\t';
      if (before && after) {
        parts.push({ type: 'toKeyword', text: value.slice(i, i + 2) });
        i += 2;
        continue;
      }
    }

    // Quoted string
    if (ch === '"') {
      let j = i + 1;
      while (j < end && value[j] !== '"') {
        if (value[j] === '\\' && j + 1 < end) j++;
        j++;
      }
      if (j < end) j++; // include closing quote
      parts.push({ type: 'quotedValue', text: value.slice(i, j) });
      i = j;
      continue;
    }

    // Wildcard *
    if (ch === '*') {
      parts.push({ type: 'wildcard', text: '*' });
      i++;
      continue;
    }

    // Bare value word
    let j = i;
    while (j < end && value[j] !== ' ' && value[j] !== '\t' && value[j] !== '"') {
      j++;
    }
    if (j > i) {
      const word = value.slice(i, j);
      parts.push({ type: 'bareValue', text: word });
      i = j;
    } else {
      // Shouldn't happen, but avoid infinite loop
      parts.push({ type: 'bareValue', text: ch });
      i++;
    }
  }

  // Closing bracket
  if (hasClosed) {
    parts.push({ type: 'bracket', text: value[lastIdx] });
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

export function buildRangeHTML(token: Token, colors: Required<ColorConfig>, tokenClassName?: string): string {
  const parts = tokenizeRangeContent(token.value);
  const innerSpans = parts.map(part => {
    if (part.type === 'whitespace') {
      return escapeHTML(part.text);
    }
    const colorKey = RANGE_COLOR_MAP[part.type];
    const color = colors[colorKey] || colors.fieldValue;
    const fontWeight = part.type === 'toKeyword' ? '600' : part.type === 'bracket' ? '600' : 'normal';
    return `<span class="ei-range-part ei-range-part--${part.type}" style="color:${color};font-weight:${fontWeight}">${escapeHTML(part.text)}</span>`;
  }).join('');

  const cls = `ei-token ei-token--range${tokenClassName ? ' ' + tokenClassName : ''}`;
  return `<span class="${cls}" data-token-start="${token.start}" data-token-end="${token.end}">${innerSpans}</span>`;
}
