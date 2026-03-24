# Changelog

All notable changes to elastic-input will be documented in this file.

## 0.1.0 — 2026-03-24

Initial release.

### Features

- Syntax-aware input for Elasticsearch `query_string` syntax
- Inline syntax highlighting with customizable colors (light/dark presets)
- Autocomplete for field names, enum values, boolean operators, date ranges
- Async field loading and async suggestion fetching (`fetchSuggestions`)
- Custom validation via `validateValue` callback with error/warning severity
- Validation squiggles with character-offset precision
- Date range picker for date-typed fields (Ctrl+Space)
- Saved search (`#name`) and history (`!query`) features (opt-in via `features.savedSearches` / `features.historySearch`)
- `contentEditable`-based with full keyboard navigation
- Multiline support (Shift+Enter)
- Smart select-all (Ctrl+A), expand selection (Alt+Shift+Arrow), wildcard wrap (`*`)
- Dropdown modes: `always`, `never`, `manual`, `input`
- All styling inline — no CSS files required
- Standalone `Lexer`, `Parser`, `Validator`, `AutocompleteEngine` classes for headless use
- `buildHighlightedHTML` for server-side / non-React syntax highlighting
- `extractValues` utility for pulling structured values from parsed ASTs
