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
  /** Custom React content to render instead of the default label/description. Used by `renderFieldHint`. */
  customContent?: any; // React.ReactNode — typed as any to avoid React import in pure types
}

export type SuggestionSource = 'field' | 'value' | 'operator' | 'savedSearch' | 'history' | 'hint';
