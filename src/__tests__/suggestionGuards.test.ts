import { describe, it, expect } from 'vitest';
import {
  Suggestion,
  isInertSuggestion,
  isAcceptableSuggestion,
  hasPendingSuggestion,
  completionTaskKey,
} from '../autocomplete/suggestionTypes';

function sugg(type: string | undefined, text = 'x'): Suggestion {
  return { text, label: text || type || '', type, replaceStart: 0, replaceEnd: 1 };
}

describe('isInertSuggestion', () => {
  it('flags the spinner, error, and no-results items', () => {
    expect(isInertSuggestion(sugg('loading', ''))).toBe(true);
    expect(isInertSuggestion(sugg('error', ''))).toBe(true);
    expect(isInertSuggestion(sugg('noResults', ''))).toBe(true);
  });

  it('does not flag real suggestions or hints', () => {
    expect(isInertSuggestion(sugg('field'))).toBe(false);
    expect(isInertSuggestion(sugg('value'))).toBe(false);
    expect(isInertSuggestion(sugg('operator'))).toBe(false);
    expect(isInertSuggestion(sugg('savedSearch'))).toBe(false);
    expect(isInertSuggestion(sugg('history'))).toBe(false);
    expect(isInertSuggestion(sugg('hint')))
      .toBe(false);
    expect(isInertSuggestion(sugg(undefined))).toBe(false);
  });
});

describe('isAcceptableSuggestion', () => {
  it('rejects every inert type — accepting one would wipe the typed partial', () => {
    expect(isAcceptableSuggestion(sugg('loading', ''))).toBe(false);
    expect(isAcceptableSuggestion(sugg('error', ''))).toBe(false);
    expect(isAcceptableSuggestion(sugg('noResults', ''))).toBe(false);
  });

  it('rejects plain hints but accepts the # and ! trigger hints', () => {
    expect(isAcceptableSuggestion(sugg('hint', 'Enter a number'))).toBe(false);
    expect(isAcceptableSuggestion(sugg('hint', '#'))).toBe(true);
    expect(isAcceptableSuggestion(sugg('hint', '!'))).toBe(true);
  });

  it('accepts real suggestion types', () => {
    expect(isAcceptableSuggestion(sugg('field'))).toBe(true);
    expect(isAcceptableSuggestion(sugg('value'))).toBe(true);
    expect(isAcceptableSuggestion(sugg('operator'))).toBe(true);
    expect(isAcceptableSuggestion(sugg('savedSearch'))).toBe(true);
    expect(isAcceptableSuggestion(sugg('history'))).toBe(true);
    expect(isAcceptableSuggestion(sugg(undefined))).toBe(true);
  });
});

describe('completionTaskKey', () => {
  it('keys value tasks by field — different fields are different tasks', () => {
    expect(completionTaskKey('FIELD_VALUE', 'status')).toBe('FIELD_VALUE:status');
    expect(completionTaskKey('FIELD_VALUE', 'status'))
      .not.toBe(completionTaskKey('FIELD_VALUE', 'level'));
  });

  it('different context types are different tasks even for the same field', () => {
    expect(completionTaskKey('FIELD_NAME', 'status'))
      .not.toBe(completionTaskKey('FIELD_VALUE', 'status'));
  });

  it('fieldless contexts key on type alone', () => {
    expect(completionTaskKey('SAVED_SEARCH')).toBe('SAVED_SEARCH');
    expect(completionTaskKey('HISTORY_REF', null)).toBe('HISTORY_REF');
    expect(completionTaskKey('FIELD_NAME', undefined)).toBe('FIELD_NAME');
  });

  it('same type + same field = same task (type-ahead preservation key)', () => {
    expect(completionTaskKey('FIELD_VALUE', 'status')).toBe(completionTaskKey('FIELD_VALUE', 'status'));
  });
});

describe('hasPendingSuggestion', () => {
  it('detects the spinner anywhere in the list', () => {
    expect(hasPendingSuggestion([sugg('loading', '')])).toBe(true);
    expect(hasPendingSuggestion([sugg('field'), sugg('loading', '')])).toBe(true);
  });

  it('is false for empty lists and settled content', () => {
    expect(hasPendingSuggestion([])).toBe(false);
    expect(hasPendingSuggestion([sugg('field'), sugg('value')])).toBe(false);
    expect(hasPendingSuggestion([sugg('error', '')])).toBe(false);
    expect(hasPendingSuggestion([sugg('noResults', '')])).toBe(false);
  });
});
