export interface Suggestion {
  text: string;
  label: string;
  description?: any; // string or React.ReactNode — typed as any to avoid React import in pure types
  type?: string;
  replaceStart: number;
  replaceEnd: number;
  matchPartial?: string;
  /** Higher priority items appear first. Operators=30, hints=20, fields=10. */
  priority?: number;
  /** Custom React content to render instead of the default label/description. Used by `renderFieldHint`. */
  customContent?: any; // React.ReactNode — typed as any to avoid React import in pure types
  /** Original source data (HistoryEntry or SavedSearch) for custom renderers. */
  sourceData?: any;
}

export type SuggestionSource = 'field' | 'value' | 'operator' | 'savedSearch' | 'history' | 'hint';

/**
 * Inert dropdown items: the "Searching..." spinner, fetch errors, and
 * "no results" messages. They render in the list and can be highlighted via
 * arrow keys, but must never be accepted — their `text` is empty, so accepting
 * one would replace the user's typed partial with nothing.
 */
export function isInertSuggestion(s: Suggestion): boolean {
  return s.type === 'loading' || s.type === 'error' || s.type === 'noResults';
}

/** True when the list contains the async "Searching..." spinner item. */
export function hasPendingSuggestion(suggestions: Suggestion[]): boolean {
  return suggestions.some(s => s.type === 'loading');
}

/**
 * Key identifying a completion task: what the user is currently completing.
 * Same key across keystrokes = same task (type-ahead may keep previous
 * results visible while a fresh fetch runs); different key = the held
 * results belong to a finished task and must be discarded — a leftover
 * suggestion shown as selected could not be sensibly accepted (e.g. a
 * field-name completion while the user is already typing that field's value).
 */
export function completionTaskKey(contextType: string, fieldName?: string | null): string {
  return fieldName ? `${contextType}:${fieldName}` : contextType;
}

/**
 * Whether a suggestion can be accepted (Enter/Tab/click). Inert items are
 * never acceptable; hints only when they insert a trigger char (`#` or `!`).
 */
export function isAcceptableSuggestion(s: Suggestion): boolean {
  if (isInertSuggestion(s)) return false;
  if (s.type === 'hint' && s.text !== '#' && s.text !== '!') return false;
  return true;
}
