# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Demo dev server (port 3000, auto-opens)
npm run build        # Library build → dist/elastic-input.es.js + .d.ts
npm run build:demo   # Static demo build
npm test             # Run all tests (vitest run)
npm run test:watch   # Watch mode
npx vitest run src/__tests__/Lexer.test.ts          # Single test file
npx vitest run -t "flags unknown fields"            # Single test by name
npx tsc --noEmit     # Type check without emitting
```

**After every change**, run all three: `npx tsc --noEmit`, `npx vitest run`, `npx vite build`. TypeScript errors and build failures are not caught by vitest alone.

## Architecture

The core is a **pipeline**: raw text → Lexer → Parser → Validator → AutocompleteEngine → React UI.

Each stage is a **pure function** (no DOM, no React) and independently testable:

- **Lexer** (`src/lexer/Lexer.ts`) — State-machine tokenizer. Produces `Token[]` with `type`, `value`, `start`, `end`. Token types defined in `src/lexer/tokens.ts`.
- **Parser** (`src/parser/Parser.ts`) — Recursive descent. Produces AST (`src/parser/ast.ts`) and cursor context (what the user is typing at a given offset). Cursor context drives autocomplete.
- **Validator** (`src/validation/Validator.ts`) — Walks the AST to produce `ValidationError[]` with character offsets. Built-in type validation + optional `validateValue` callback passed at call time (not constructor).
- **AutocompleteEngine** (`src/autocomplete/AutocompleteEngine.ts`) — Takes cursor context → suggestion list. Handles fields, enum values, saved searches (`#`), history (`!`), async fetch.

The **React layer** (`src/components/ElasticInput.tsx`) orchestrates the pipeline on every input event and renders:
- Syntax-highlighted spans in a `contentEditable` div
- `AutocompleteDropdown` (portal) for suggestions
- `DateRangePicker` (portal) for date fields
- `ValidationSquiggles` for error/warning underlines

All styling is **inline** (no CSS files). Colors and structural styles are passed as props (`ColorConfig`, `StyleConfig`) and merged with defaults from `src/constants.ts`.

## Key Conventions

- **Single quotes are NOT phrase delimiters.** Only double quotes delimit phrases, matching Elasticsearch `query_string` syntax. Single quotes are regular characters.
- **Character offsets everywhere.** Tokens, AST nodes, and validation errors all carry `start`/`end` for precise highlighting and squiggly positioning.
- **No jsdom or browser test deps.** Extract logic into pure functions and test those. All tests run without a DOM environment.
- **Custom validation is top-level**, not per-field. The `validateValue` prop on `ElasticInput` receives a `ValidateValueContext` and handles all value types (field values, bare terms, range bounds, field group terms).
- **BEHAVIORS.md** is the authoritative behavior reference. Update it on every behavior change, citing the relevant test(s).
- **GLOSSARY.md** defines shared terminology (partial, cursor context, suggestion, etc.). Use these terms consistently.
- **Always commit** after completing work so the user can backtrack.
- **Always add regression tests** when fixing bugs.

## Testing

Tests live in `src/__tests__/`. Pattern: create tokens via `new Lexer(input).tokenize()`, parse via `new Parser(tokens).parse()`, validate via `new Validator(fields).validate(ast, validateValueFn?)`.

No snapshots. Assert on specific values, offsets, and error messages.

## Demo

`demo/` contains a standalone app with three tabs (CRM, Logs, E-Commerce) showcasing all features. `demo/DemoConfig.ts` has field definitions, mock async data, and the `demoValidateValue` function demonstrating the validation API.
