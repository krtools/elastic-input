# Changelog

## 0.4.0 — 2026-04-08

### Features

- **`defaultField` prop** — Sets an implicit field for bare (unfielded) terms, mirroring Elasticsearch's `default_field` parameter. When set, bare terms autocomplete as values of that field (showing date picker, boolean list, or value suggestions as appropriate) instead of field-name suggestions. Explicit `field:value` syntax still overrides. Pass a string for the common case, or `{ name, showFieldSuggestions }` to also show field names below value suggestions for discovery. Includes type-specific validation for bare terms (date format, number, boolean, IP) and passes field context to `validateValue`.
- **`trailingSpaceOnAccept` prop** — Controls whether accepting a suggestion or date inserts a trailing space after the value. Defaults to `true`. Set to `false` for spreadsheet/cell-style inputs where compact values are preferred.
- **No default placeholder** — The component no longer renders a default "Search..." placeholder. A placeholder only appears when the `placeholder` prop is explicitly provided.

### Demo

- Added **Spreadsheet** demo tab showing `defaultField` in a 3×3 table grid where each column targets a different field (Status, Deal Value, Created).

## 0.3.13 — 2026-04-07

### Bug Fixes

- **Controlled value prop not clearing editor DOM** — When a parent component cleared the `value` prop (e.g. `setValue('')`), the placeholder appeared but the old text remained in the editor. The paren-match effect was reading stale tokens from `stateRef` after `processInput` had already cleared the editor, then rebuilding the old highlighted HTML. `processInput` now syncs `stateRef.current.tokens` synchronously so effects in the same flush see the correct value.

### Demo

- Added **props.value** control to the demo sidebar — a text input and Clear button for testing controlled value reactivity.

## 0.3.12 — 2026-04-07

### Bug Fixes

- **Parentheses in input prevent blur** — Typing text with parentheses (e.g. `(a)`) and then clicking outside the input would trap focus. The paren-matching highlight effect and `applyHighlight` were restoring the caret position via `Selection.addRange()` after the editor was blurred, which re-focused the contentEditable. Caret restoration is now skipped when the editor is not focused.

## 0.3.11 — 2026-04-06

### Features

- **Double-click selects word without trailing whitespace** — Double-clicking a word in the editor now selects only the word, not the word plus trailing space (browser default). This makes double-click + Delete/Backspace preserve adjacent spacing. Triple-click (select all) is unaffected.

## 0.3.10 — 2026-04-06

### Bug Fixes

- **Blur cancels in-flight async suggestions** — Blurring the input now aborts pending async fetches (field values, saved searches, history) and clears debounce/loading timers. Previously, async results arriving after blur would re-open the dropdown with incorrect positioning.

### Testing

- **Vitest Browser Mode** — Added real-browser integration tests using Playwright. Covers field acceptance (Tab/Enter), async suggestion chaining, transient blur scenarios, and the blur-cancels-async fix. Run with `npm run test:browser` (headless) or `--browser.headless=false` for headed mode.

## 0.3.9 — 2026-04-02

### Build

- **Upgrade Vite to v8** — Aligns vite and vitest on a single `vite@8.0.3`, replacing the dual vite@5/vite@8 resolution that caused cross-platform lock file issues. Also upgrades `vite-plugin-dts` to v4.
- **Switch demo deployment to GitHub Actions** — Replaces `gh-pages` branch deployment with an `actions/deploy-pages` workflow.
- **Remove `@changesets/cli`** — Unused dependency and `.changeset/` directory removed.
- **Include README.md in npm package** — The `files` array was missing README.md, so it was excluded from the published tarball.

## 0.3.8 — 2026-04-02

### Bug Fixes

- **Validation tooltip clipped by overflow containers** — The error/warning tooltip now renders via a portal to `document.body` with `position: fixed`, preventing clipping by ancestor elements with `overflow: scroll/hidden/auto`.

## 0.3.7 — 2026-04-02

### Features

- **`dropdown.renderType` option** — Controls the type badge in dropdown items. `false` hides it entirely, `true` (default) shows the raw type string, or pass a `(type, suggestion) => ReactNode` callback for per-item customization.
- **`styles.lineHeight` option** — Configurable line height for the editor text and placeholder. Defaults to `'1.5'`.

## 0.3.6 — 2026-03-26

### Features

- **`dropdown.renderNoResults` callback** — Called when the autocomplete engine returns zero suggestions for a non-empty partial. Return a `ReactNode` to display a custom empty-state message in the dropdown, or `null` to fall back to the default hint. Receives `{ cursorContext, partial }`.
- **Alt+Shift+F format query (`features.formatQuery`)** — Opt-in keyboard shortcut that pretty-prints the current query in-place using `formatQuery`. Gated behind `features.formatQuery: true`.
- **`whitespaceOperator` option for `formatQuery`** — Controls how implicit AND (bare whitespace between terms) is rendered. By default implicit AND is preserved as whitespace; set `whitespaceOperator: 'AND'` or `'&&'` to make it explicit.
- **Implicit AND preservation in `formatQuery`** — `formatQuery` now distinguishes implicit AND (term juxtaposition) from explicit `AND` keywords and preserves whitespace by default, preventing unwanted operator injection.

## 0.3.5 — 2026-03-26

### Features

- **`dropdown.homeEndKeys` option** — Home/End navigate to the first/last dropdown item when enabled and an item is already selected. Keys pass through for normal cursor movement when no item is selected.
- **Dynamic PageUp/PageDown page size** — Page size is now calculated from the dropdown's visible height and item height instead of a fixed jump of 10.
- **`FormatQueryOptions`** — `formatQuery` now accepts an optional second argument with `maxLineLength` (default 60) and `indent` (default 2 spaces) options.

## 0.3.4 — 2026-03-26

### Features

- **`interceptPaste` prop** — Intercept paste events before text is inserted. The callback receives the plain-text clipboard content and can return a transformed string, `null` to cancel, or a Promise for async workflows (e.g. prompting the user). The component stays fully interactive while a promise is pending.
- **`dropdown.autoSelect` option** — When `true`, the first dropdown suggestion is pre-selected even with an empty partial (e.g. right after typing a colon). Off by default.
- **`formatQuery` utility** — Pretty-prints queries with line breaks at boolean operators, indented nested groups, and inline short expressions. Exported from the package.
- **`valueTypes` color config** — Per-field-type value colors (`string`, `number`, `date`, `boolean`, `ip`) on `ColorConfig`. Overrides the default `fieldValue` color based on the field's declared type.
- **`plainModeLength` prop** — Character count threshold that degrades the input to plain text mode (no highlighting, autocomplete, or validation). Set to `0` for always-plain.
- **PageUp/PageDown dropdown navigation** — Jumps by one visible page; PageDown clamps to last, PageUp clamps to first.
- **Arrow key wrap-around** — ArrowDown on the last dropdown item wraps to the first; ArrowUp on the first wraps to the last.

### Bug Fixes

- **Focus/blur cursor context** — Alt-tabbing away and back, then pressing Ctrl+Space, now correctly restores the cursor context instead of showing field-name suggestions.
- **JSDoc placement** — Moved the `ElasticInputProps` JSDoc comment to sit directly above the interface declaration.

## 0.3.3 — 2026-03-25

### Bug Fixes

- **Enter key blocked during async loading** — Pressing Enter while the "Searching..." spinner or an error item was displayed did nothing. Enter now closes the dropdown and submits the search, same as when no item is selected.
- **History description color on selection** — History item descriptions stayed gray when the row was highlighted. They now inherit the parent color and use standard 0.7 opacity, matching all other dropdown descriptions.

## 0.3.2 — 2026-03-25

### Features

- **`dropdown.loadingDelay`** — Configurable delay (ms) before showing the "Searching..." spinner on async fetches. Fast-responding endpoints skip the loading indicator entirely. Default `0` (immediate, preserving existing behavior).
- **`HistoryEntry.description`** — Replaced `HistoryEntry.timestamp` (number) with `description` (ReactNode). The consumer now controls what appears in the history item's secondary text. Styled consistently with other dropdown descriptions (inherited color, 0.7 opacity).
- **Auto-enable `savedSearches` / `historySearch`** — When `savedSearches` or `searchHistory` callback props are provided, their respective feature flags now default to `true` (no need to set `features.savedSearches` / `features.historySearch` explicitly).

### Breaking Changes

- `HistoryEntry.timestamp` removed — use `HistoryEntry.description` instead (accepts `ReactNode`).

## 0.3.1 — 2026-03-25

### Features

- **`suggestions` field config option** — Set `suggestions: false` on a `FieldConfig` to skip the `fetchSuggestions` async cycle entirely for that field. No "Searching..." spinner, no debounce timer, no dropdown. Defaults to `true`.

### Bug Fixes

- **Dropdown vanishing when dragging scrollbar** — The scroll/resize reposition handler used uncapped content height for the flip logic (same class of bug as the 0.3.0 fetchSuggestions fix, but in a different code path). With many suggestions the dropdown was repositioned off-screen during scrollbar drag.

## 0.3.0 — 2026-03-25

### Features

- **`dropdown.open` callback** — Rename `dropdown.mode` to `dropdown.open` (string values still work; `mode` accepted as deprecated fallback). `dropdown.open` also accepts a callback `(ctx: DropdownOpenContext) => boolean | null` for programmatic control: `true` forces open, `false` forces closed, `null` defers to the engine.
- **CSS classes (`classNames` prop)** — All key DOM elements now have static `ei-*` class names (e.g. `ei-container`, `ei-editor`, `ei-token`, `ei-dropdown`). A new `classNames` prop (`ClassNamesConfig`) lets consumers inject custom classes for Tailwind or external CSS styling.
- **Custom date parser (`parseDate` prop)** — `parseDate?: (value: string) => Date | null` lets consumers provide a custom date parser that supplements the built-in parser. Used in both validation (accepted before built-in checks) and date picker initialization.

### Bug Fixes

- **Dropdown invisible with large async result sets** — When `fetchSuggestions` returned many results (e.g. 500), the dropdown was positioned off-screen because the flip logic used the raw content height (16000px) instead of the CSS-capped rendered height (300px). Async results are now also truncated to `maxSuggestions`.

### Build

- Library dist is now shipped as unminified ESM — consumer bundlers handle minification.

### Deprecations

- `dropdown.mode` → use `dropdown.open` instead (string values are identical; `mode` still works).

## 0.2.0 — 2026-03-25

### Minor Changes

- Move field value, saved search, and history filtering to callbacks

  **Breaking changes:**

  - Removed `FieldConfig.suggestions`, `FieldConfig.asyncSearch`, and `FieldConfig.asyncSearchLabel` — all field value suggestions now come exclusively through the `fetchSuggestions` callback
  - `savedSearches` callback signature changed from `() => Promise<SavedSearch[]>` to `(partial: string) => Promise<SavedSearch[]>` — called per-keystroke (debounced) instead of once on mount
  - `searchHistory` callback signature changed from `() => Promise<HistoryEntry[]>` to `(partial: string) => Promise<HistoryEntry[]>` — called per-keystroke (debounced) instead of once on mount
  - `AutocompleteEngine` no longer filters saved search or history results (passes through as-is); filtering is the caller's responsibility

  **Migration:**

  - Move static `suggestions` arrays into your `fetchSuggestions` callback
  - Remove `asyncSearch` and `asyncSearchLabel` from field configs — `fetchSuggestions` is now called for all non-boolean field value contexts
  - Update `savedSearches`/`searchHistory` callbacks to accept a `partial` parameter and filter server-side

  Boolean `true`/`false` suggestions and freeform placeholder hints are still generated by the engine.

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
