export interface Suggestion {
  text: string;
  label: string;
  description?: string;
  type?: string;
  replaceStart: number;
  replaceEnd: number;
  matchPartial?: string;
  /** Higher priority items appear first. Operators=30, hints=20, fields=10. */
  priority?: number;
}

export type SuggestionSource = 'field' | 'value' | 'operator' | 'savedSearch' | 'history' | 'hint';
