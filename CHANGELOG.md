# Changelog

## Unreleased

### Behavior Changes

- **Tab no longer kicks focus out of the input while completions are loading** — Typing a partial (e.g. `sourc`) and pressing Tab before async `fields` resolved, or while an async suggestion fetch was in flight (the "Searching..." spinner), fell through to the browser default and moved focus out of the input. Tab is now blocked in those windows when the partial at the caret is non-empty; once the data lands, the dropdown opens with the match auto-selected and the next Tab accepts it, matching the loaded-data behavior. Guardrails: Tab from an empty/whitespace position is never blocked, Shift+Tab always moves focus, and a rejected fields loader clears the block. When async fields resolve while the editor is focused mid-partial, suggestions for that partial now surface automatically.

### Fixes

- **Stale suggestions from a finished completion task are no longer accept-able** — During the `loadingDelay` window, previous results stay visible across keystrokes (0.10.0 type-ahead behavior). That preservation is now keyed per completion task (cursor context type + resolved field name): when the task changes — field name → value, value of field A → value of field B — the held suggestions are discarded immediately instead of remaining highlighted, where Enter/Tab would accept them with stale replace ranges and eat typed input (`status:` + fast `act` + Enter produced `status: `). Same-task type-ahead is unchanged: results for partial `a` remain visible and acceptable while the fetch for `ac` is in flight.
- **Pending dropdown-show frames can no longer resurrect a closed dropdown** — The caret-following dropdown position is set in a `requestAnimationFrame`; a frame armed by an earlier keystroke could fire after a synchronous close/clear and flip `showDropdown` back on over an emptied suggestion list — an invisible zombie state whose flag swallowed Enter (no submit, no visible dropdown). Close/clear paths now cancel the pending frame, and the no-dropdown Enter gate checks for visible content rather than the flag alone.
- **Arrow-selecting the spinner (or error/no-results item) no longer wipes the typed partial** — These inert items are arrow-selectable, and the default Tab path (and Enter/`onTab` for `noResults`) accepted them; their `text` is empty, so acceptance replaced the typed token with nothing. Acceptance is now centrally guarded via new exported helpers `isInertSuggestion` / `isAcceptableSuggestion` / `hasPendingSuggestion` (also used internally for the Tab block and `InputStatus.isLoading`), including a defense-in-depth guard inside `acceptSuggestion` itself.
- **No more ghost dropdown after Enter-submitting during a fetch** — `closeDropdown` didn't clear a pending `loadingDelay` spinner timer, and the no-dropdown Enter path didn't cancel pending async work at all, so a superseded fetch (or its delayed spinner) could pop the dropdown open after the search was submitted. Both paths now cancel the debounce timer, in-flight fetch, and spinner delay.
- **Resilience against unstable `fields` identity** — The component now absorbs identity-only churn on the `fields` prop instead of relying on consumer discipline. The resolve effect shallow-compares the incoming array against the current resolved fields (same length, same elements by reference) and keeps the previous state when equal, so a new array per render built from stable element references (`[...FIELDS]`, `FIELDS.filter(...)`) no longer rebuilds the autocomplete engine and validator or reprocesses the whole query per render. The same compare applies to an async loader's resolved result, which also breaks the resolve→rebuild→re-render fetch loop for loaders over a cached array (the redundant loader invocations themselves remain — memoize the loader). A fully-inline literal that re-creates the element *objects* every render still rebuilds; the README's *Prop Stability* guidance stands. Internally: the retained engine/validator refs are now lazy-initialized (`useRef(new …)` constructed a throwaway instance on every render), `setDefaultField` moved from the render body into an effect, and the normalized `defaultField` config is memoized on its primitive members so an inline object form is also identity-safe. Regression tests: `PropStability.browser.test.tsx`, `arrayShallowEqual.test.ts`.
- **Prop identity stability documented** — README gains a *Prop Stability* section (with † markers in the props tables) covering the three props that are compared by identity and do real work when it churns: `fields` (engine/validator rebuild + full reprocess per render; fetch loop for the async loader form), `colors` (editor re-highlight per keystroke), and function values inside `dropdown` such as `open` (re-invoked with `trigger: 'modeChange'` per render; a `false` return force-closes the dropdown). Everything else is documented as safe to write inline. BEHAVIORS.md §10.1 gains the mechanics-level version.

## 0.12.2 — 2026-09-08

No functional changes — version bump only.

## 0.12.1 — 2026-09-08

### Fixes

- **Reverse typing after a focus-state desync** — A blur event processed while DOM focus never actually left the editor (window blur, an extension's capture listener swallowing the refocus event) left the internal `isFocused` state false while keystrokes still landed in the editor. The paren-match re-highlight effect gated its caret restore on that state, so each `innerHTML` rewrite detached the selection without restoring it; Chrome re-seeds a dead caret at the removed token's slot (position 0 for a single-token query), making every subsequent character prepend — `source` typed as `ecruos`. Sustained reversal additionally required an unstable `colors` prop identity (or paren-match churn) to force a rewrite per keystroke. The caret save/restore in the paren-match and collapse-expand effects is now gated on `document.activeElement` (real DOM focus) like the main highlight path, which makes the rewrite safe regardless of focus-state desync while still never setting a range on a genuinely blurred editor.

### Demo

- **Stable `colors` identity** — The demo now memoizes its `ColorConfig` instead of rebuilding it every render. A fresh `colors` object per keystroke forced ElasticInput's paren-match effect to rewrite the editor HTML on every keystroke, which both wasted work and sustained the reverse-typing bug whenever the component's focus state desynced from DOM focus (spurious blur). With a stable identity the effect's dedup early-out holds and the sustained reversal cannot occur; the underlying focus-state gate is a separate library fix.

## 0.12.0 — 2026-08-04

### Features

- **`prefix` / `suffix` slots** — New props render content *inside* the input's bordered box, before/after the editor, as plain flex siblings — text, placeholder, and squiggles automatically keep clear with no padding math. Accepts a static node or a render prop receiving live `InputStatus` (`{ value, ast, errors, isValid, isLoading, isOpen, isFocused }`). Slot content is centered on the first text row and pinned to the top on multiline growth. Clicking slot buttons keeps the editor's focus, caret, and open dropdown intact. New classes `ei-prefix` / `ei-suffix` / `ei-editor-wrap` and matching `classNames` keys.
- **`api.submit()`** — New imperative method that submits through the same path as pressing Enter: a highlighted real suggestion is accepted first, then `onSearch` fires with the resulting query. External search buttons can no longer submit a different string than the Enter key would.
- **`isQueryValid(errors)`** — Exported helper for the canonical validity check (warnings don't block; omitted `severity` counts as `'error'`).

### Behavior Changes

- **Input chrome moved from the editor to the container** — The border, radius, background, min-height, and focus ring now live on `.ei-container` (a flex row); `.ei-editor` is transparent and borderless, keeping only its text padding. The `input*` style keys keep their names and visual meaning. Both elements set `box-sizing: border-box` explicitly, so rendered size no longer depends on the consumer's global CSS reset. Consumers targeting `.ei-editor` in external CSS for border/background should target `.ei-container` instead.
- **Placeholder aligns exactly with typed text** — The placeholder now lives in the editor wrap and mirrors `inputPadding` verbatim (previously it was offset by the border width and mis-parsed padding values containing spaces, e.g. `calc()`).
- **Internal focus moves are no longer blurs** — Focus moving between the editor, slot content, and the dropdown/date-picker portals keeps the dropdown open and async work running; `onFocus`/`onBlur` fire only when focus enters/leaves the component as a whole.

### Demo

- Added an "Embedded search button" toggle (Features group) demonstrating the `suffix` render prop: a magnifier button that disables on invalid/empty queries, shows a spinner while suggestions load, and submits via `api.submit()`.

## 0.11.1 — 2026-07-22

### Fixes

- **Flipped (drop-up) dropdown anchored by its bottom edge** — The drop-up position was previously computed from an estimated dropdown height (suggestion count × 32px), so custom styles with shorter rows left the dropdown floating above the input by the estimation error. The dropdown and date-picker portals now anchor their bottom edge 4px above the caret via `translateY(-100%)`, so the gap is correct regardless of rendered height; the height estimate only influences the flip decision.
- **Flip decision re-checked after render with actual height** — The flip decision itself also relied on the row-count estimate, which undercounts tall custom `renderFieldHint` panels, so a tall panel near the viewport bottom could stay below the caret and overflow off-screen. After render, a layout effect now measures the actual dropdown (or date picker) height and corrects the direction: it flips up if the content overflows below and fits above, and flips back down in the mirror case. The direction only changes when the other side fits, so the correction can't oscillate.

### Demo

- Demo production build (`npm run build:demo`) now emits source maps.

## 0.11.0 — 2026-04-28

### Features

- **`FieldConfig.hide`** — New optional `hide?: boolean` property. Hidden fields are excluded from the autocomplete dropdown (and so are their aliases) but still validate normally — typing `hidden_field:value` produces no `UNKNOWN_FIELD` error and value/type validation still applies. Useful for fields that exist in the schema (legacy/internal/power-user) but should not be advertised to users.

## 0.10.0 — 2026-04-20

### Features

- **Unified loading spinner for slow subsequent fetches** — Previously, once an async fetch cycle was active, subsequent keystrokes kept the last-rendered suggestions visible indefinitely, which made slow backends look frozen. Now every async context update (first entry and subsequent) goes through the same `"Searching…"` spinner path, subject to `dropdown.loadingDelay`. The delay timer restarts on each keystroke, so rapid typing still never flashes the spinner — it only appears when the user pauses and the fetch exceeds the configured delay.

### Behavior Changes

- **Always-mode dropdown suppressed on boolean/suffix operators** — When `dropdown.open` is `'always'`, the dropdown is now hidden whenever the caret is on or inside `AND` / `OR` / `NOT` (including `&&` / `||`) or a fuzzy/boost suffix (`~N` / `^N`). Inserting an autocomplete in the middle of those tokens was never useful. Prefix operators (`+` / `-` / `!`) are intentionally **not** suppressed — typing `-` and getting field autocomplete is a legitimate flow.

### Demo

- Added a "Loading spinner delay" select to the sidebar (options: 0, 100, 150, 300, 500, 1500 ms; default 150 ms) so the new spinner behavior is adjustable at runtime.

## 0.9.0 — 2026-04-20

### Features

- **Triple-click clause selection** — Triple-clicking in the editor selects the whole clause at that offset, including prefix modifiers (`NOT`, `-`, `+`, `!`) and suffix modifiers (`^boost`, `~fuzzy`), plus one adjacent boolean connector so deleting the selection leaves a syntactically valid query. Prefers the trailing connector; falls back to leading when the clause is the last operand. In plain mode (no AST), falls through to browser-default triple-click behavior.

## 0.8.2 — 2026-04-11

### Bug Fixes

- **Dropdown width crunching near viewport edge** — Absolutely positioned dropdowns were shrink-to-fit constrained by the space between `left` and the viewport edge, causing wide content (e.g. `renderFieldHint` grids) to be squeezed. Fixed by setting `width: max-content` so the dropdown sizes to its content first (capped by `maxWidth`), then the post-render nudge shifts it left if needed.

### Demo

- Added `segment` field (CRM tab) with a 3-column grid hint for testing wide dropdown positioning.

## 0.8.1 — 2026-04-11

### Features

- **Validation error precedence** — When multiple errors overlap the same range, higher-precedence errors now suppress lower-precedence ones. Order: `SYNTAX_ERROR` > `INVALID_VALUE` > `UNKNOWN_FIELD` > `AMBIGUOUS_PRECEDENCE` > `CUSTOM`. Exported as `deduplicateErrors()`.
- **Empty-value check before unknown-field** — `blah:` now reports "Missing value" (`SYNTAX_ERROR`) instead of "Unknown field" (`UNKNOWN_FIELD`), since a syntax issue is more actionable than a possible config issue.

### Bug Fixes

- **Dropdown overflow near viewport edge** — Dropdowns with wide custom content (e.g. `renderFieldHint` grids) no longer extend past the right edge of the viewport. A post-render measurement nudges the dropdown left when it overflows.
- **`dropdown.open` callback `selectionEnd` always equaling `selectionStart`** — The selection end was never passed through the navigation path, so the callback always saw a collapsed caret. Now correctly reports the full selection range.
- **Date picker other-month day opacity** — Adjacent month days in the calendar were too faded at 0.3 opacity; increased to 0.45.

## 0.8.0 — 2026-04-10

### Features

- **Ctrl+Alt+Arrow clause navigation** — Navigate between logical clauses (field:value, groups, NOT expressions) with Ctrl+Alt+Left/Right. Selects each clause as the cursor moves. Enable via `features.clauseNavigation`. Groups with multiple clauses support enter/exit traversal; NOT and field groups support enter-only.
- **Error type categories on `ValidationError`** — Each validation error now includes a `type` field: `SYNTAX_ERROR`, `UNKNOWN_FIELD`, `INVALID_VALUE`, `AMBIGUOUS_PRECEDENCE`, or `CUSTOM`. Exported as `ValidationErrorType`.
- **`value`, `selectionStart`, `selectionEnd` on `DropdownOpenContext`** — The `dropdown.open` callback now receives the current input value and text selection range, enabling richer programmatic dropdown control.
- **Triggering event in `onSearch`** — `onSearch` callback now receives an optional third argument: the `KeyboardEvent` (Enter) or `MouseEvent` (button click) that triggered the search.
- **Date picker: year-level navigation (`«`/`»`)** — Jump by year in days view, decade in months view, or century in years view.
- **Date picker: adjacent month days** — Calendar grid shows previous/next month days in gray to fill the grid. Clicking them selects the date without navigating to that month.
- **Date picker: single-date presets** — Date presets now support `type?: 'single' | 'range'` to control which picker mode they appear in. Untyped presets appear in both.
- **Dismiss dropdown on editor scroll** — Scrolling the editor (wheel, scrollbar drag, touch swipe) closes the dropdown.

### Bug Fixes

- **Parser syntax errors missing `type` field** — Errors from the parser (unclosed parens, unexpected tokens) were reported without the `type` field. All parser errors now include `type: 'SYNTAX_ERROR'`.
- **Placeholder text bleeding outside narrow input** — Long placeholder text now clips with ellipsis instead of overflowing the input bounds.
- **Date picker nav button spacing** — `«`/`‹` and `›`/`»` buttons are now grouped with consistent spacing regardless of the center label width. Buttons also have a hover background.
- **Empty date preset trailing space** — Date presets with empty value (e.g. "Clear") no longer inject a trailing space.
- **`formatQuery` whitespace-only trim** — `formatQuery` now returns empty string for whitespace-only input instead of preserving it.

### Demo

- Added date presets (Today, Yesterday, Last 7/30/90 days, This year, Clear)
- Enabled Alt+Shift+F format query shortcut
- Added clause navigation toggle
- Exposed `inputApiRef` on `window.elasticInput` for console inspection

## 0.7.0 — 2026-04-09

### Breaking Changes

- **`formatQuery` preserves source operator form by default** — `&&`, `||`, `-`, and other operator variants are no longer normalized to `AND`/`OR`/`NOT`. The output matches what the user wrote. To force a specific style, use the new `andOperator`, `orOperator`, and `notOperator` options (e.g. `{ andOperator: 'AND', orOperator: 'OR', notOperator: 'NOT' }` restores the old behavior).

### Features

- **`features.formatQuery` accepts `FormatQueryOptions`** — Pass an options object instead of `true` to customize Alt+Shift+F formatting (e.g. `features: { formatQuery: { andOperator: '&&' } }`).
- **`andOperator` / `orOperator` / `notOperator` in `FormatQueryOptions`** — Force all boolean operators to a specific output form. When unset, the original source form is preserved. Prefix-style operators (`-`, `!`) attach directly; keyword-style operators (`NOT`, `AND`) get a space separator.
- **`sourceOperator` on AST nodes** — `BooleanExprNode` and `NotNode` now include a `sourceOperator` field capturing the original token text (`'&&'`, `'AND'`, `'||'`, `'OR'`, `'NOT'`, `'-'`, etc.).

### Bug Fixes

- **Alt+Shift keyboard shortcuts on macOS** — Alt+Shift+F (format query) and Alt+Shift+Arrow (expand selection) now use `e.code` (physical key) instead of `e.key`, fixing macOS where Alt (Option) produces special characters.

## 0.6.4 — 2026-04-09

### Bug Fixes

- **Backspace no longer clears entire input when content is only newlines** — Pressing Backspace after inserting multiple newlines via Shift+Enter cleared the entire input instead of removing one newline. `getPlainText` returned `''` for `<br>`-only DOM because `textContent` is empty (browsers leave an artifact `<br>` in empty contentEditable divs, and real newline `<br>` elements are indistinguishable). Backspace/Delete in newline-only content is now intercepted in the keydown handler and computed directly, matching the Shift+Enter pattern.
- **Dropdown description no longer truncated when `alignToInput=true`** — The description element in dropdown items had a hardcoded `maxWidth: 200px` that prevented it from using available space when the dropdown was wider (e.g. aligned to a wide input container). Replaced with `flexShrink`/`minWidth` so the flex layout determines the constraint naturally.

## 0.6.3 — 2026-04-08

### Bug Fixes

- **Wildcard values no longer eat the colon on suggestion accept** — Typing `code:?N` and accepting a suggestion produced `code"?N"` instead of `code:"?N"`. The cursor context now correctly recognizes WILDCARD tokens as field values after a colon.

## 0.6.2 — 2026-04-08

### Bug Fixes

- **Dropdown follows caret on Shift+Enter** — The dropdown now repositions to the new line after pressing Shift+Enter, including when the input was previously empty. Fixed three underlying issues: `getPlainText` treating `<br>`-only DOM as empty, `getCaretRect` reporting the wrong line after `<br>`, and trailing `<br>` not creating a visible empty line in contentEditable (fixed via sentinel `<br>`).

## 0.6.1 — 2026-04-08

### Enhancements

- **`renderFieldHint` works for any field** — Previously only customized hint suggestions that already existed (number/ip defaults or custom placeholder). Now fires for any field in value position — if no hint exists, one is injected at the top of the suggestion list.

## 0.6.0 — 2026-04-08

### Features

- **`collapseOnBlur` prop** — When `true`, the input collapses to a single line when unfocused and expands on focus. Useful for compact layouts where the full query is only needed during editing. Multiline `<br>` elements are replaced with spaces on blur and restored on focus.
- **Flex-friendly layout** — The container now uses `display: flex; flex-direction: column` instead of `inline-block`, and the editor has `flex: 1`. This lets the input work as a flex child where the parent determines height (editor scrolls when content overflows). Unconstrained layouts (default search bar, spreadsheet cells) are unaffected.
- **Caret scroll tracking** — The editor auto-scrolls to keep the caret visible after every input event (typing, Shift+Enter newlines). Prevents the caret from moving below the visible area in height-constrained scrollable inputs.

## 0.5.0 — 2026-04-08

### Breaking Changes

- **`SavedSearch` simplified** — Removed `id` and `name` fields. The `query` field now includes the `#` prefix (e.g. `#vip-active`) and is inserted as-is on acceptance. Added optional `label` (falls back to `query`) and changed `description` to `React.ReactNode`. The shape now matches `HistoryEntry`: `{ query, label?, description? }`.

### Improvements

- **Unified dropdown layout for history and saved searches** — Both types now use the same two-row layout when `description` is present (label on row 1, description + type badge on row 2) and collapse to a single-row layout when no description is provided. Line-clamp, word-break, and title tooltip behavior is shared.

## 0.4.3 — 2026-04-08

### Features

- **`styles.dropdownItemContentGap`** — Configurable gap between content elements inside dropdown items (label, type badge, description). Defaults to `'8px'`.
- **`SavedSearch.date`** — Optional date string on saved searches. When present, the item renders in a two-row layout (like history) with the date displayed alongside the description.

### Internal

- **Refactor dropdown item rendering** — Extracted shared `itemProps()`, `typeBadge()`, and merged history/saved-search two-row layout into a single code path. Net -58 lines.

## 0.4.2 — 2026-04-08

### Bug Fixes

- **`renderType` not applying to history suggestions** — History items had their own early-return render path that hardcoded the type badge as `"history"`, bypassing the `renderType` prop. Now respects `renderType`: `false` hides it, a function receives `'history'`, default shows `"history"`.

### CI

- **Cache Playwright browsers** — Playwright browser binaries are now cached between CI runs, reducing install time from ~13 minutes to seconds on cache hit.

## 0.4.1 — 2026-04-08

### Bug Fixes

- **Value suggestions not shown after field acceptance in `open="input"` mode** — Accepting a field name (e.g. `status:`) with Enter or Tab set the dropdown trigger to `'navigation'`, which caused the `open="input"` gate to block value suggestions from appearing. The trigger is now only set to `'navigation'` for complete terms (values, saved searches, history), not field names.

- **State update on unmounted component** — Pending `requestAnimationFrame` callbacks (dropdown positioning, post-accept suggestion updates, focus handler) were not cancelled on unmount, causing React warnings. All rAF IDs are now tracked and cancelled in the cleanup effect.

### Build

- **Browser tests in prepack** — `npm run test:browser` (Playwright) now runs as part of `prepack`, ensuring browser integration tests pass before publish.

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
