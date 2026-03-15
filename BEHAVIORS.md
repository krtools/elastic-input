# ElasticInput — Behavior Reference

This document describes every behavior of the ElasticInput component. Each section includes examples and references the unit test(s) that verify the claim.

---

## 1. Lexer (Tokenization)

The lexer converts raw input text into a stream of typed tokens with character offsets.

### 1.1 Field:Value Pairs

Input `status:active` produces tokens: `FIELD_NAME("status")`, `COLON(":")`, `VALUE("active")`.

- Character offsets are preserved: `FIELD_NAME(0,6)`, `COLON(6,7)`, `VALUE(7,13)`.
- **Tests:** `Lexer.test.ts` → "tokenizes a simple field:value pair", "preserves character offsets"

### 1.2 Quoted Values

Only **double quotes** (`"`) are recognized as phrase delimiters, consistent with Elasticsearch query_string syntax. Single quotes (`'`) are treated as regular characters (apostrophes). Unclosed double quotes are tokenized gracefully (the token runs to end-of-input). Escaped characters inside quotes (e.g., `\"`) are preserved.

- `status:"hello world"` → `FIELD_NAME`, `COLON`, `QUOTED_VALUE("\"hello world\"")`
- `name:'Jane'` → `FIELD_NAME`, `COLON`, `VALUE("'Jane'")` (single quotes are literal)
- **Tests:** `Lexer.test.ts` → "tokenizes quoted values", "treats single quotes as regular characters", "handles unclosed quotes gracefully", "handles escaped characters in quotes"

### 1.3 Boolean Operators

`AND`, `OR`, `NOT` are recognized as distinct token types. They are **case-insensitive** (`and`, `or`, `not` also work).

- **Tests:** `Lexer.test.ts` → "tokenizes AND operator", "tokenizes OR operator", "tokenizes NOT operator", "is case-insensitive for boolean operators"

### 1.4 Comparison Operators

After a colon, `>`, `>=`, `<`, `<=` are tokenized as `COMPARISON_OP`.

- `price:>100` → `FIELD_NAME("price")`, `COLON`, `COMPARISON_OP(">")`, `VALUE("100")`
- **Tests:** `Lexer.test.ts` → "tokenizes > after colon", "tokenizes >= after colon", "tokenizes < and <="

### 1.5 Parentheses

`(` and `)` produce `LPAREN` and `RPAREN` tokens. Nesting is supported.

- `(status:active AND level:ERROR)` tokenizes with field:value pairs inside parens.
- **Tests:** `Lexer.test.ts` → "tokenizes parentheses", "tokenizes nested parentheses", "tokenizes field:value inside parens", "tokenizes complex expression in parens"

### 1.6 Special Tokens

| Prefix | Token Type | Example |
|--------|------------|---------|
| `#` | `SAVED_SEARCH` | `#my-search` |
| `!` | `HISTORY_REF` | `!recent` |
| `*` | `WILDCARD` | `stat*`, `*` |

- Bare `#` and `!` are also valid tokens (for autocomplete).
- **Tests:** `Lexer.test.ts` → "tokenizes saved search (#)", "tokenizes bare # as saved search", "tokenizes history ref (!)", "tokenizes bare ! as history ref", "tokenizes wildcards", "tokenizes bare wildcard term"

### 1.7 Prefix Operators (`-`, `+`)

A `-` or `+` immediately before a term (field name, quoted string, paren, `#`, `!`) is tokenized as `PREFIX_OP`. Hyphens within field names (e.g., `last-contact`) are **not** treated as prefix operators.

- `-status:active` → `PREFIX_OP("-")`, `FIELD_NAME("status")`, `COLON`, `VALUE("active")`
- `last-contact:x` → `FIELD_NAME("last-contact")`, `COLON`, `VALUE("x")`
- **Tests:** `Lexer.test.ts` → "tokenizes - as prefix operator before a field", "tokenizes + as prefix operator before a field", "tokenizes - before a bare term", "tokenizes - before parenthesized group", "tokenizes - before quoted string", "tokenizes - before saved search", "preserves hyphen in mid-word field names", "does not treat standalone - as prefix op"

### 1.8 Whitespace

Whitespace is preserved as `WHITESPACE` tokens for lossless offset mapping. Leading and trailing whitespace is preserved.

Newlines (`\n`, `\r\n`) are treated as whitespace, allowing multi-line queries. A newline in the input is lexed as a `WHITESPACE` token and rendered as `<br>` in the highlighted output.

- `status:active\nAND name:John` → same tokens as the single-line version
- Multiple consecutive newlines are collapsed into a single whitespace token

- **Tests:** `Lexer.test.ts` → "preserves whitespace tokens", "handles leading whitespace", "handles trailing whitespace", "treats newlines as whitespace between terms", "handles multiple consecutive newlines", "handles \\r\\n (Windows line endings)", "preserves newlines in whitespace token values"

### 1.9 Boolean Operator Aliases (`&&`, `||`)

`&&` is an alias for `AND` and `||` is an alias for `OR`. They produce `TokenType.AND` and `TokenType.OR` respectively, with the original text preserved as the token value (`"&&"` or `"||"`).

- Works with and without spaces: `a&&b`, `a && b`
- Single `&` or `|` is not treated as an operator (consumed as part of a word)
- **Tests:** `Lexer.test.ts` → "tokenizes && as AND", "tokenizes || as OR", "tokenizes && without spaces", "tokenizes || without spaces", "mixes && and || in same query", "single & is not treated as operator"

### 1.10 Tilde Modifier (`~N`)

After a value or quoted string, `~` followed by optional digits is tokenized as a `TILDE` token. Used for fuzzy matching (on bare terms) and proximity/slop (on quoted phrases).

- `abc~1` → `VALUE("abc")`, `TILDE("~1")`
- `"hello world"~5` → `QUOTED_VALUE`, `TILDE("~5")`
- `field:value~2` → `FIELD_NAME`, `COLON`, `VALUE`, `TILDE("~2")`
- `abc~` → `VALUE("abc")`, `TILDE("~")` (no number)
- **Tests:** `Lexer.test.ts` → "tokenizes term~N as VALUE + TILDE", "tokenizes quoted phrase~N as QUOTED_VALUE + TILDE", "tokenizes ~ without number", "tokenizes field:value~N", "preserves offsets for tilde"

### 1.11 Boost Modifier (`^N`)

After a value or quoted string, `^` followed by optional digits (including decimals) is tokenized as a `BOOST` token.

- `abc^2` → `VALUE("abc")`, `BOOST("^2")`
- `abc^1.5` → `VALUE("abc")`, `BOOST("^1.5")`
- Combined: `abc~1^2` → `VALUE`, `TILDE("~1")`, `BOOST("^2")`
- **Tests:** `Lexer.test.ts` → "tokenizes term^N as VALUE + BOOST", "tokenizes field:value^N", "tokenizes ^ with decimal", "tokenizes ^ without number", "combined ~N^N produces VALUE + TILDE + BOOST"

### 1.12 Range Expressions (`[`, `{`)

`[` or `{` starts a range expression, emitted as a `RANGE` token. The lexer captures the full bracketed expression as one opaque token; internal parsing (bounds, `TO` keyword) happens in the Parser.

Elasticsearch `query_string` range syntax is supported:
- `[min TO max]` — inclusive both ends
- `{min TO max}` — exclusive both ends
- `[min TO max}` / `{min TO max]` — mixed inclusivity
- `*` for unbounded: `[* TO 100]`, `[100 TO *]`
- Bounds can be bare words or double-quoted strings
- `TO` is matched case-insensitively

The `-`/`+` prefix operators recognize `[` and `{` as valid following characters, so `-[abc TO def]` tokenizes as `PREFIX_OP` + `RANGE`.

- `created:[now-7d TO now]` → `FIELD_NAME`, `COLON`, `RANGE("[now-7d TO now]")`
- `created:{now-30d TO now}` → `FIELD_NAME`, `COLON`, `RANGE("{now-30d TO now}")`
- `name:(-[abc TO "abd"])` → `FIELD_NAME`, `COLON`, `LPAREN`, `PREFIX_OP`, `RANGE`, `RPAREN`
- Mixed brackets and unclosed ranges are handled gracefully
- **Tests:** `Lexer.test.ts` → "tokenizes [value TO value] as RANGE token", "tokenizes {value TO value} as RANGE token", "tokenizes mixed brackets", "tokenizes -[range] as PREFIX_OP + RANGE", "tokenizes name:(-[abc TO \"abd\"]) correctly", "tokenizes [* TO 100] as RANGE"

### 1.13 Single-Character Wildcard (`?`)

Words containing `?` are tokenized as `WILDCARD`, just like `*`. This supports Elasticsearch's single-character wildcard syntax.

- `qu?ck` → `WILDCARD("qu?ck")`
- `field:qu?ck` → `FIELD_NAME`, `COLON`, `WILDCARD`
- `?ello` → `WILDCARD("?ello")`
- Combined `te?t*` → `WILDCARD`
- **Tests:** `Lexer.test.ts` → "single-char wildcard (?)" suite (4 tests)

### 1.14 Regex Literals (`/pattern/`)

`/…/` produces a `REGEX` token. The lexer reads from the opening `/` to the closing `/`, handling `\/` escapes inside the pattern. If unclosed (no closing `/`), the text is emitted as a `VALUE` fallback.

- `/pattern/` → `REGEX("/pattern/")`
- `field:/joh?n/` → `FIELD_NAME`, `COLON`, `REGEX`
- `/pattern` (unclosed) → `VALUE("/pattern")`
- **Tests:** `Lexer.test.ts` → "regex literals (/pattern/)" suite (5 tests)

### 1.15 Backslash Escaping

Outside of quoted strings, `\` before any character causes both the backslash and the following character to be consumed as literal text. This prevents the escaped character from being treated as a special character (space, `:`, `(`, `)`, `!`, etc.).

- `hello\!world` → single `VALUE("hello\!world")`
- `first\ name:value` → `FIELD_NAME("first\ name")`, `COLON`, `VALUE("value")`
- `a\(b` → single `VALUE("a\(b")`
- `not\:afield` → single `VALUE("not\:afield")` (escaped colon is not a field separator)
- **Tests:** `Lexer.test.ts` → "backslash escaping" suite (5 tests)

---

## 2. Parser (AST)

The parser builds an AST from tokens using recursive descent with precedence: **OR < AND < NOT < Primary**.

### 2.1 AST Node Types

| Node Type | Example Input |
|-----------|--------------|
| `FieldValue` | `status:active` |
| `FieldGroup` | `status:(a b c)` |
| `BooleanExpr` | `a AND b`, `a OR b` |
| `Not` | `NOT x`, `-x` |
| `Group` | `(a OR b)` |
| `BareTerm` | `hello`, `"phrase"` |
| `SavedSearch` | `#my-search` |
| `HistoryRef` | `!recent` |
| `Regex` | `/pattern/` |
| `Range` | `[abc TO def]`, `{10 TO 100}` |
| `Error` | unexpected tokens |

### 2.2 Implicit AND

Adjacent terms without an explicit operator are treated as implicit AND.

- `status:active level:ERROR` → `BooleanExpr(AND, FieldValue, FieldValue)`
- **Tests:** `Parser.test.ts` → "parses implicit AND between adjacent terms"

### 2.3 Operator Precedence

`NOT` binds tightest, then `AND`, then `OR`.

- `a OR b AND c` → `OR(a, AND(b, c))`
- **Tests:** `Parser.test.ts` → "OR has lower precedence than AND", "NOT has higher precedence than AND"

### 2.4 Grouping

Parentheses override precedence. Empty and unclosed parens are handled gracefully.

- `(a OR b) AND c` → `AND(Group(OR(a, b)), c)`
- **Tests:** `Parser.test.ts` → "parses a grouped expression", "parses group overriding precedence", "parses nested groups", "handles empty parens gracefully", "handles unclosed parens gracefully"

### 2.5 Comparison Operators

`>`, `>=`, `<`, `<=` after a colon are stored in the `operator` field of `FieldValue` nodes.

- `price:>100` → `FieldValue(field="price", operator=">", value="100")`
- **Tests:** `Parser.test.ts` → "parses field:>value", "parses field:>=value", "parses field:<value", "parses field:<=value"

### 2.6 Prefix Operators in AST

`-term` becomes a `Not` node. `+term` is a passthrough (no transformation).

- `-status:active` → `Not(FieldValue("status", "active"))`
- **Tests:** `Parser.test.ts` → "parses -field:value as NOT", "parses +field:value (required)", "parses - before a group", "parses - before quoted string", "preserves hyphenated field names"

### 2.7 Offset Tracking

All AST nodes track `start` and `end` character offsets from the original input.

- **Tests:** `Parser.test.ts` → "tracks start and end offsets for field:value", "tracks offsets in boolean expression", "tracks offsets with prefix operator"

### 2.8 `&&` and `||` Aliases

`&&` and `||` parse identically to `AND` and `OR`, including precedence rules.

- `a && b` → `BooleanExpr(AND, a, b)`
- `a || b` → `BooleanExpr(OR, a, b)`
- `a && b || c` → `OR(AND(a, b), c)` (same precedence as AND/OR)
- **Tests:** `Parser.test.ts` → "parses a && b same as a AND b", "parses a || b same as a OR b", "respects precedence: a && b || c", "works with field:value pairs"

### 2.9 Fuzzy, Proximity, and Boost Modifiers

`BareTerm` and `FieldValue` nodes may have optional `fuzzy`, `proximity`, and `boost` fields:

| Modifier | Applies To | AST Field | Example |
|----------|-----------|-----------|---------|
| `~N` | Unquoted terms | `fuzzy` | `abc~1` → `fuzzy: 1` |
| `~N` | Quoted phrases | `proximity` | `"a b"~5` → `proximity: 5` |
| `^N` | Any term | `boost` | `abc^2` → `boost: 2` |

Modifiers can be combined: `abc~1^2` sets both `fuzzy: 1` and `boost: 2`.

The `end` offset of the node is extended to include the modifier tokens.

- **Tests:** `Parser.test.ts` → "parses bare term with fuzzy", "parses fuzzy 0", "parses fuzzy without number as 0", "tracks end offset including tilde", "parses field:value~N", "parses quoted phrase with proximity", "proximity on quoted field value", "parses bare term with boost", "parses decimal boost", "parses field:value^N", "tracks end offset including caret", "parses fuzzy + boost: abc~1^2", "parses proximity + boost"

### 2.10 Field-Scoped Groups

`field:(a b c)` is parsed as a `FieldGroup` node containing the field name and an inner expression. The inner expression is parsed with normal precedence rules (implicit AND, explicit OR, NOT, nested groups).

- `created:(a b c)` → `FieldGroup(field="created", expr=AND(AND(a, b), c))`
- `status:(active OR inactive)` → `FieldGroup(field="status", expr=OR(active, inactive))`
- `status:((a OR b) AND c)` → nested Group inside FieldGroup

Empty groups `field:()` produce a FieldGroup with an empty BareTerm. Unclosed groups are handled gracefully.

- **Tests:** `Parser.test.ts` → "field-scoped groups" suite (8 tests)

### 2.11 Regex Nodes

`/pattern/` produces a `Regex` AST node with the pattern (without delimiters). When used as a field value (`field:/pattern/`), the node's `start` extends to the field name.

- `/pattern/` → `Regex(pattern="pattern")`
- `field:/joh?n/` → `Regex(pattern="joh?n", start=0)`
- **Tests:** `Parser.test.ts` → "regex literals" suite (3 tests)

### 2.12 Range Nodes

`RANGE` tokens are parsed into `RangeNode` AST nodes. The parser splits the token's raw value on `TO` (case-insensitive) to extract lower/upper bounds, bracket types determine inclusivity, and bounds can be bare words, quoted strings, or `*` (unbounded).

- `[abc TO def]` → `Range(lower="abc", upper="def", lowerInclusive=true, upperInclusive=true)`
- `{abc TO def}` → both exclusive
- `[abc TO def}` → mixed inclusivity
- `name:[abc TO def]` → `Range(field="name", ...)`
- `name:(-[abc TO "abd"])` → `FieldGroup > Not > Range` (the key fix for the original bug)
- `[* TO 100]` → lower=`*`, upper=`100`
- Missing `TO` keyword → error pushed, best-effort RangeNode returned
- Unclosed bracket → error pushed
- **Tests:** `Parser.test.ts` → "range expressions" suite (10 tests)

### 2.13 Group Boost (`(...)^N`)

Groups and field groups can have a boost modifier after the closing parenthesis. The boost value is attached to the `Group` or `FieldGroup` node, and the node's `end` offset extends to include the boost.

- `(a OR b)^2` → `Group(boost=2, end=10)`
- `field:(a b)^3` → `FieldGroup(field="field", boost=3, end=13)`
- `(a)^1.5` → `Group(boost=1.5)`
- **Tests:** `Parser.test.ts` → "group boost" suite (4 tests)

### 2.14 Syntax Error Detection

The parser detects common structural/syntax mistakes and reports them via `parser.getErrors()`. These errors are accumulated separately from the AST so the parser can still return a valid tree. ElasticInput merges these with validator errors to show red squiggly underlines.

| Input | Squiggly On | Message |
|-------|-------------|---------|
| `(a b c` | `(` | "Missing closing parenthesis" |
| `field:(a b` | `(` | "Missing closing parenthesis" |
| `a ) b` | `)` | "Unexpected closing parenthesis" |
| `a AND` | `AND` | "Missing search term after AND" |
| `a OR` | `OR` | "Missing search term after OR" |
| `NOT` (alone) | `NOT` | "Missing search term after NOT" |
| `AND a` | `AND` | "Unexpected AND" |
| `a OR AND b` | `AND` | "Unexpected AND" |
| `"hello world` | `"` | "Missing closing quote" |
| `status:"hello` | `"` | "Missing closing quote" |

Empty groups `()` are **not** flagged — the user is likely mid-typing. Properly closed quotes (`"hello"`, `'world'`) produce no error.

Each error detection consumes the problematic token and produces exactly one error. The parser continues from the next token. Existing deferred display hides errors at the cursor position, preventing flash during typing.

- **Tests:** `Parser.test.ts` → "syntax errors" suite (16 tests)

---

## 3. Cursor Context Detection

`Parser.getCursorContext(tokens, cursorOffset)` determines what kind of input the user is entering based on cursor position.

### 3.1 Context Types

| Context | When | Example (cursor at `|`) |
|---------|------|------------------------|
| `EMPTY` | Empty or whitespace-only input | `\|` |
| `FIELD_NAME` | Typing a field name or at start of new term | `sta\|`, `AND \|`, `(\|` |
| `FIELD_VALUE` | After a colon, typing a value | `status:\|`, `status:act\|` |
| `OPERATOR` | After a complete value with space | `status:active \|` |
| `SAVED_SEARCH` | After `#` | `#my\|` |
| `HISTORY_REF` | After `!` | `!rec\|` |

### 3.2 Empty / Whitespace

- `""` at offset 0 → `EMPTY`
- `"   "` at any offset → `EMPTY`
- **Tests:** `CursorContext.test.ts` → "returns EMPTY for empty input", "returns EMPTY for whitespace-only input"

### 3.3 Field Name Context

Returned when typing a bare word that could be a field name.

- `sta|` → `FIELD_NAME`, partial=`"status"` (full token value)
- Cursor at position 0 in `status:active` → `FIELD_NAME`, partial=`"status"`
- After `AND ` → `FIELD_NAME`, partial=`""`
- After `-` prefix → `FIELD_NAME`, partial=`""`
- **Tests:** `CursorContext.test.ts` → "returns FIELD_NAME while typing a word", "returns FIELD_NAME with cursor mid-word", "returns FIELD_NAME after AND", "returns FIELD_NAME after OR", "returns FIELD_NAME after NOT", "returns FIELD_NAME while typing after AND"

### 3.4 Field Value Context

Returned when the cursor is after a colon (or comparison operator) belonging to a field.

- `status:|` → `FIELD_VALUE`, fieldName=`"status"`, partial=`""`
- `status:act|` → `FIELD_VALUE`, fieldName=`"status"`, partial=`"active"` (full token value)
- `price:>|` → `FIELD_VALUE`, fieldName=`"price"`, partial=`""`
- Works inside parens: `(status:act|)` → `FIELD_VALUE`
- Works after prefix op: `-status:act|` → `FIELD_VALUE`
- **Tests:** `CursorContext.test.ts` → "returns FIELD_VALUE right after colon", "returns FIELD_VALUE while typing value", "returns FIELD_VALUE after comparison operator", "returns FIELD_VALUE for field:value inside parens", "returns FIELD_VALUE for field:partial inside parens"

### 3.5 Colon-Value Boundary

When cursor is exactly at the colon's end and a VALUE token follows, the context includes that VALUE token so replacements cover it.

- `status:active` at offset 7 → `FIELD_VALUE`, partial=`"active"`, token covers `(7,13)`
- `status:` at offset 7 → `FIELD_VALUE`, partial=`""`, no token
- **Tests:** `CursorContext.test.ts` → "returns FIELD_VALUE with cursor at colon end"; `ReplacementRange.test.ts` → "cursor at colon end with following value returns FIELD_VALUE with token", "cursor at colon end with no following value returns empty partial", "cursor at colon end in compound query picks up following value"

### 3.6 Operator Context

After a complete value followed by whitespace.

- `status:active |` → `OPERATOR`
- `(a OR b) |` → `OPERATOR`
- **Tests:** `CursorContext.test.ts` → "returns OPERATOR after a complete field:value", "returns OPERATOR after a quoted value", "returns OPERATOR after closing paren"

### 3.7 After Open Paren

Cursor at or after `(` returns `FIELD_NAME` (start of new sub-expression), **not** `OPERATOR`.

- `status:active (|` → `FIELD_NAME` (not OPERATOR)
- `(|` → `FIELD_NAME`
- **Tests:** `CursorContext.test.ts` → "cursor right after open paren suggests fields", "cursor after \"status:active (\" suggests fields, not operators", "cursor after \"a AND (\" suggests fields", "cursor inside paren with space suggests fields"

### 3.8 Saved Search / History Ref Context

- `#my|` → `SAVED_SEARCH`, partial=`"my"`
- `!rec|` → `HISTORY_REF`, partial=`"rec"`
- **Tests:** `CursorContext.test.ts` → "returns SAVED_SEARCH for #", "returns SAVED_SEARCH for #partial", "returns HISTORY_REF for !", "returns HISTORY_REF for !partial"

### 3.9 Prefix Operator Context

After a prefix operator (`-` or `+`), context is `FIELD_NAME`.

- `-|` → `FIELD_NAME`, partial=`""`
- `-sta|` → `FIELD_NAME`, partial=`"sta"`
- `-status:|` → `FIELD_VALUE`, fieldName=`"status"`
- **Tests:** `CursorContext.test.ts` → "returns FIELD_NAME after - prefix", "returns FIELD_NAME while typing after - prefix", "returns FIELD_VALUE for -field:", "returns FIELD_VALUE for -field:partial"

### 3.10 Range Expression Context

When the cursor is inside a RANGE token (`[... TO ...]`), context is `RANGE` with empty partial. The context now also includes `fieldName` (resolved by walking back through COLON to the preceding FIELD_NAME) and `token` (the RANGE token itself). For non-date fields this produces no autocomplete suggestions. For date fields, the date picker opens in range mode, pre-populated with the existing bounds.

- `field:[ab|c TO def]` → `RANGE`, partial=`""`, fieldName=`"field"`, token=`[abc TO def]`
- `[* TO |now]` → `RANGE`, partial=`""`, fieldName=`""` (standalone range, no field)
- `company:[a TO b]` with cursor on `b` → `RANGE`, no suggestions (non-date field)
- `created:[2024-01-01 TO 2024-12-31]` with cursor inside → `RANGE`, date picker opens in range mode with start=2024-01-01 and end=2024-12-31
- `field:[abc TO def] |` → `OPERATOR` (after complete range, outside the token)
- **Tests:** `CursorContext.test.ts` → "range expressions" suite (9 tests); `AutocompleteEngine.test.ts` → "range expression context" suite (6 tests)

---

## 4. Autocomplete Suggestions

### 4.1 Field Name Suggestions

Shown in `FIELD_NAME` and `EMPTY` contexts. Fields are scored and ranked:

| Match Type | Score | Example: partial=`"dat"` |
|------------|-------|--------------------------|
| Name starts with partial | 4 | — |
| Label starts with partial | 3 | — |
| Name contains partial | 2 | — |
| Label contains partial | 1 | `"Created Date"` (label contains "dat") |

Suggestion text includes a trailing colon: `"status:"`.

- **Tests:** `AutocompleteEngine.test.ts` → "suggests all fields on empty input", "filters fields by prefix (startsWith name)", "filters fields by prefix (startsWith label)", "matches fields by includes (name contains)", "matches fields by includes (label contains)", "ranks startsWith higher than includes", "appends colon to field suggestion text"

### 4.2 Field Value Suggestions

Shown in `FIELD_VALUE` context. Behavior depends on field type:

| Field Type | Behavior |
|------------|----------|
| `enum` | Shows `field.suggestions` filtered by partial (startsWith > includes). Skipped when `fetchSuggestions` is provided — async is the single source of truth. |
| `boolean` | Shows `true`, `false` filtered by partial |
| `date` | Opens a date picker (no text suggestions) |
| `number` | Shows hint: "Enter a number" (persists while typing) |
| `string` | No default hint — dropdown stays closed. Use `placeholder` for a custom hint. |
| `ip` | Shows hint: "Enter an IP address" (persists while typing) |

For fields with a default hint (number, ip), the hint **stays visible while the user types** rather than disappearing after the first keystroke. This provides persistent context about what the field expects. String fields show no hint by default — consumers can add one via `FieldConfig.placeholder`.

The hint text is configurable per field via `FieldConfig.placeholder`:
- Custom string: `placeholder: "Search companies..."` — shown instead of the default
- `false`: `placeholder: false` — suppresses the hint entirely
- Omitted: uses the default type-based hint

When async results arrive (via `fetchSuggestions`), they replace the hint. When async results are empty, the hint is restored as a fallback.

For fully custom hint rendering (e.g. multiline rich content with instructions), the `renderFieldHint` prop accepts a callback `(field: FieldConfig, partial: string) => ReactNode | null`. When provided and returning a non-null value, the custom element replaces the default text hint in the dropdown. Returning `null` falls back to the default behavior. The callback receives the resolved `FieldConfig` (aliases are resolved to the canonical field).

- **Tests:** `AutocompleteEngine.test.ts` → "suggests all enum values after colon", "filters enum values by prefix", "filters enum values by includes", "suggests true/false for boolean fields", "shows date picker for date field", "shows hint for number field", "shows no hint for string field with no suggestions", "shows hint for IP field", "shows no hint while typing in string field", "keeps hint visible while typing in number field", "uses custom placeholder from field config", "custom placeholder stays visible while typing", "suppresses hint when placeholder is false"

### 4.3 Operator Suggestions

Shown in `OPERATOR` context (after a complete value + space). Suggests `AND`, `OR`, `NOT` **plus all field names** (since space acts as implicit AND).

- `status:active |` → `[AND, OR, NOT, #saved-search, !history, status:, level:, ...]`
- **Tests:** `AutocompleteEngine.test.ts` → "suggests operators after a complete value", "suggests operators after closing paren", "also suggests fields in operator context (implicit AND)", "suggests fields after closing paren with space"

### 4.4 Saved Search Suggestions

Shown in `SAVED_SEARCH` context (after `#`). Filtered by prefix match on saved search name.

- `#vip|` → matches `"vip-active"` → suggestion text: `"#vip-active"`
- **Tests:** `AutocompleteEngine.test.ts` → "suggests saved searches for #", "filters saved searches by prefix", "includes # in suggestion text", "includes description"

### 4.5 History Suggestions

Shown in `HISTORY_REF` context (after `!`). Filtered by substring match. Complex history queries (containing AND/OR) are wrapped in parentheses.

- `!API|` → matches history entry "API errors" → suggestion text: `"level:ERROR AND service:api"` wrapped as `"(level:ERROR AND service:api)"`
- **Tests:** `AutocompleteEngine.test.ts` → "suggests history for !", "filters history by partial (includes)", "wraps history with boolean ops in parens", "does not wrap simple history in parens"

#### History Item Layout

History suggestions use a vertical two-row layout, unlike other suggestion types which are single-line horizontal:

- **Row 1**: The query text (or explicit label), wrapping up to 2 lines then truncated with `...` (CSS `-webkit-line-clamp: 2`). Long unspaced tokens wrap via `word-break: break-all`.
- **Row 2**: Timestamp (if present) on the left, `history` type badge on the right.
- When an explicit label is set (label differs from query), the `title` attribute on the item shows the full query text on hover.

### 4.6 `#` and `!` Hint Suggestions

When saved searches or history entries are configured, hint suggestions appear to inform the user about `#` and `!` features. These hints:

- Only appear when the partial is **empty** (start of a new expression)
- Disappear as soon as the user starts typing
- Do not appear in `FIELD_VALUE` context
- Are configurable via `showSavedSearchHint` (default: `true`) and `showHistoryHint` (default: `true`)
- Do not appear when no saved searches or history entries exist
- **Clickable:** Clicking the `#saved-search` or `!history` hint inserts the trigger character (`#` or `!`) into the input, focuses it, and immediately shows the corresponding saved search or history suggestions

- **Tests:** `AutocompleteEngine.test.ts` → "shows #saved-search hint on empty input when saved searches exist", "shows !history hint on empty input when history exists", "shows hints in operator context", "shows hints in field name context after AND", "does not show hints when no saved searches or history exist", "does not show #hint when showSavedSearchHint is false", "does not show !hint when showHistoryHint is false", "does not show hints when both are disabled", "does not show hints in field value context", "no hints when user has started typing a partial", "no hints when typing partial after AND", "hints appear after AND with no partial"

### 4.7 Suggestion Priority & Ordering

Suggestions are sorted by descending `priority`:

| Category | Priority | Position |
|----------|----------|----------|
| Operators (AND/OR/NOT) | 30 | First |
| Hints (#, !) | 20 | Middle |
| Fields | 10 | Last |

Within the same priority, items retain their relevance-based ordering.

- **Tests:** `AutocompleteEngine.test.ts` → "hints appear before fields on empty input", "in operator context: operators first, then hints, then fields", "suggestions have correct priority values"

### 4.8 Async Suggestions (`fetchSuggestions`)

When a `fetchSuggestions` prop is provided, the component calls it for field value suggestions. The function receives the field name and partial text and returns a `Promise<SuggestionItem[]>`.

**Only fields with `asyncSearch: true`** in their `FieldConfig` trigger async fetching. Fields without this flag always show their sync hint if one exists (e.g. "Enter a number") and never call `fetchSuggestions`. This prevents fields that have no async data source from flashing "Searching..." before falling back to a static hint.

#### 4.8.1 Async Lifecycle & Dropdown Content

The dropdown content follows strict rules to prevent stale results from flashing. These rules only apply to fields with `asyncSearch: true`:

| Phase | Dropdown Shows | Notes |
|-------|---------------|-------|
| First entry into async field | "Searching..." spinner | Immediate loading indicator, no sync hint flash |
| Subsequent keystrokes (debounce pending) | Previous results preserved | No flash to empty/sync |
| Debounce fires, fetch starts | Previous results preserved | Last-good results stay visible |
| Fetch resolves (current) | New results | Fresh data shown |
| Fetch resolves (stale) | Ignored | Monotonic fetch ID prevents old results from overwriting newer ones |
| Fetch errors | Dropdown closes | No stale results left behind |
| Context changes (cursor moves away, different field) | Cleared | In-flight fetch cancelled, async state reset |

#### 4.8.2 Staleness Guard

Each async fetch is tagged with a monotonic request ID. When results arrive, they are discarded if the ID does not match the latest request. This prevents slow responses from overwriting results from faster, newer requests.

#### 4.8.3 Loading Spinner

The "Searching..." loading item is a non-selectable dropdown entry with an animated CSS spinner. The loading indicator:

- Appears immediately on first entry into an async field value
- On subsequent keystrokes, previous results are preserved (no loading flash)
- Only appears if the request is still the latest (checked via fetch ID)
- Is cleared when the fetch completes, errors, or the dropdown closes
- Uses the `placeholder` color for the spinner border

#### 4.8.4 Debouncing

Async fetches are debounced by `suggestDebounceMs` (default: 200ms) to avoid excessive API calls during rapid typing.

### 4.9 Bare Quoted Phrases — No Suggestions

When typing a bare quoted phrase (not after a colon), **no suggestions appear**. The quote character doesn't match any field name.

- `"hello|` → no suggestions
- `status:active "foo|` → no suggestions
- `status:"act|` → **does** show value suggestions (after colon)

- **Tests:** `AutocompleteEngine.test.ts` → "typing a bare double-quote shows no suggestions", "typing an unclosed quoted phrase shows no suggestions", "typing a closed quoted phrase shows no suggestions", "quote after a field:value pair shows no field suggestions", "unclosed quote after field:value shows no suggestions", "quoted value AFTER colon still shows field value suggestions", "bare single-quote is treated as regular text", "single-quoted phrase is treated as regular text"

---

## 5. Replacement Ranges

When a suggestion is accepted, its `replaceStart` and `replaceEnd` define what text to replace.

### 5.1 Field Name Replacement Includes Colon

When the cursor is on a `FIELD_NAME` token and a `COLON` follows, the replacement range extends past the colon. This prevents double-colon bugs (e.g., `status::x`).

- `status:active` with cursor on "status" → replacement range `(0, 7)` (includes colon)
- `stat` (no colon) → replacement range `(0, 4)`
- **Tests:** `ReplacementRange.test.ts` → "extends past colon for FIELD_NAME tokens", "does NOT extend past colon for VALUE tokens", "works for bare word", "extends past colon for FIELD_NAME inside parens", "extends past colon for FIELD_NAME after PREFIX_OP"

### 5.2 Double Colon Prevention

Re-selecting the same field when a colon already exists does not duplicate the colon.

- Click "status" in `status:x` → accept `status:` → result: `status:x` (not `status::x`)
- **Tests:** `ReplacementRange.test.ts` → "clicking field in \"status:x\" and re-selecting same field does not double colon", "replacement range in compound query does not double colon", "replacement range in parens does not double colon", "replacement range after PREFIX_OP does not double colon"

### 5.3 Selection-Aware Replacement

When the user has a browser selection (e.g., double-click to select a word), the effective replacement range is the **broader** of the token-based range and the browser selection range.

- Double-click "active" in `status:active` (selects chars 7–13) → replacement covers full selection
- Drag-select "active " (7–14, including trailing space) → replacement extends to 14
- **Tests:** `ReplacementRange.test.ts` → "double-clicking a value and accepting replaces it correctly", "collapsed cursor (no selection) uses token range only", "double-clicking value in multi-field query replaces only that value", "selection extending beyond token uses broader range", "selecting entire field:value pair and replacing field works"

### 5.4 Value Replacement Boundaries

Replacing a partial value does not affect adjacent tokens.

- `status:act AND x` → accept "active" → `status:active AND x`
- **Tests:** `ReplacementRange.test.ts` → "replacing partial value does not affect rest of query", "replacing value at end of input works"

---

## 6. Suggestion Chaining

After accepting a suggestion, the component immediately evaluates the new cursor position and shows the next appropriate suggestions. This applies to all acceptance methods: Tab key, Enter key (for non-field-value contexts), and mouse click. Mouse clicks on suggestions never trigger search submission — only keyboard Enter on field values submits.

### 6.1 Field → Value

Accepting a field suggestion (e.g., `status:`) immediately shows value suggestions for that field.

- Type `sta` → accept `status:` → shows `[active, inactive, pending]`
- Type `is` → accept `is_vip:` → shows `[true, false]`
- Type `pri` → accept `price:` → shows hint "Enter a number"
- Type `cre` → accept `created:` → opens date picker
- **Tests:** `SuggestionChaining.test.ts` → "selecting \"status:\" shows enum value suggestions", "selecting \"level:\" shows enum value suggestions", "selecting \"is_vip:\" shows boolean suggestions", "selecting \"price:\" shows number hint", "selecting \"created:\" shows date picker", "selecting \"name:\" shows no suggestions (string field, no default hint)"

### 6.2 Value → Operator

After accepting a value and pressing space, operator suggestions appear.

- `status:active` + space → shows `[AND, OR, NOT, fields...]`
- **Tests:** `SuggestionChaining.test.ts` → "after accepting value and pressing space, operator suggestions appear"

### 6.3 Operator → Field

Accepting an operator suggestion shows field suggestions.

- `status:active ` → accept `AND ` → shows all field names
- **Tests:** `SuggestionChaining.test.ts` → "selecting \"AND \" after value suggests fields"

### 6.4 Full Query Building Flow

A complete query can be built step-by-step using only suggestion acceptance:

```
"sta" → status: → active → [space] → AND → level: → ERROR
```

- **Tests:** `SuggestionChaining.test.ts` → "builds \"status:active AND level:ERROR\" step by step"

### 6.5 Cursor Movement Updates Context

Moving the cursor (via arrow keys, mouse click, Home/End) recalculates the context and updates suggestions accordingly. Suggestions update on **any** caret position change, not just mouse clicks.

- Cursor in "status" of `status:active` → field name suggestions
- Cursor after ":" → value suggestions
- Cursor after "active " → operator suggestions
- **Tests:** `SuggestionChaining.test.ts` → "moving cursor from value to field shows field context", "moving cursor to after colon shows value context", "moving cursor to middle of value shows value context", "moving cursor to space after value shows operator context", "moving cursor into second field shows field context", "moving cursor into second value shows value context"

---

## 7. Keyboard Behavior

### 7.1 Trailing Space on Accept

When accepting a **complete term** (field value, saved search, or history ref) at the end of input, a trailing space is always appended regardless of whether Tab or Enter was used:

- `status:` → accept "active" → `status:active ` (with space)
- `#vip` → accept "#vip-active" → `#vip-active ` (with space)
- `!Err` → accept "level:ERROR" → `level:ERROR ` (with space)

A trailing space is **not** appended for:
- Field names: `sta` → accept "status:" → `status:` (no space; value entry follows)
- Operators: `status:active ` → accept "AND " → `status:active AND ` (operator already has space)
- Values not at end of input: no extra space inserted

- **Tests:** `SuggestionChaining.test.ts` → "Tab on field value at end of input appends trailing space", "Tab on field value NOT at end of input does NOT append space", "Tab on field name does NOT append space", "Tab on operator does NOT append space", "Tab on boolean value at end appends space", "Tab on saved search at end appends space", "Tab on history ref at end appends space", "Enter on field value at end appends trailing space", "full flow: Tab-accept values appends spaces for easy chaining"

### 7.2 Tab — Accept Suggestion

Tab accepts the currently highlighted suggestion. **Tab never submits the search.**

### 7.3 Enter — Accept & Possibly Submit

Enter's behavior depends on what is being selected:

| Selection Type | Enter Behavior |
|----------------|----------------|
| Field value | Accept value **and submit search** |
| Field name | Accept only (no submit) |
| Operator | Accept only (no submit) |
| Saved search | Accept only (no submit) |
| History ref | Accept only (no submit) |

When no dropdown is open, Enter submits the search.

- **Tests:** `SuggestionChaining.test.ts` → "Enter on field value sets shouldSubmit flag", "Enter on field value at end appends trailing space", "Enter on field name does NOT submit", "Enter on operator does NOT submit", "Enter on saved search does NOT submit"

### 7.4 Ctrl+Enter — Always Submit

Ctrl+Enter (or Cmd+Enter on Mac) always submits the search, bypassing any autocomplete selection. The dropdown is closed first.

### 7.5 Selection Wrapping (VS Code Style)

When text is selected and the user types an opening bracket or quote character, the selected text is wrapped with the matching pair instead of being replaced. This is the same behavior as VS Code, JetBrains, and other modern editors.

| Key Typed | Wrap Result | Example |
|-----------|------------|---------|
| `(` | `(…)` | Select `a AND b` in `a AND b OR c` → `(a AND b) OR c` |
| `[` | `[…]` | Select `world` in `hello world` → `hello [world]` |
| `"` | `"…"` | Select `hello world` → `"hello world"` |
| `'` | `'…'` | Select `bar` in `foo bar` → `foo 'bar'` |

After wrapping, the original selection is preserved inside the new brackets/quotes (VS Code behavior). The selection spans from after the opening character to before the closing character, so the user can immediately see what was wrapped and continue editing.

When no text is selected, the bracket/quote character is inserted normally.

- **Tests:** `wrapSelection.test.ts` → 18 tests covering all pair types, positions (start/middle/end/entire), single character, selection preservation (`newSelStart`/`newSelEnd`), and ambiguity resolution scenarios

### 7.6 Escape — Close Dropdown

Escape closes the autocomplete dropdown or date picker without accepting anything.

### 7.7 Typographic Character Normalization

Pasted and typed text is automatically normalized to replace typographic/smart characters with their ASCII equivalents. This prevents issues when queries are copied from Outlook, Word, Google Docs, or other rich-text sources.

| Character(s) | Normalized To | Source |
|--------------|---------------|--------|
| `\u201C` `\u201D` `\u201E` `\u201F` `\u2033` `\u00AB` `\u00BB` | `"` | Smart double quotes, guillemets |
| `\u2018` `\u2019` `\u201A` `\u201B` `\u2032` | `'` | Smart single quotes, apostrophes |
| `\u2013` `\u2014` | `-` | En dash, em dash |
| `\u2026` | `...` | Horizontal ellipsis |
| `\u00A0` `\u202F` `\u2007` | ` ` | Non-breaking / figure spaces |
| `\uFF01`–`\uFF5E` | ASCII equivalent | Fullwidth ASCII (CJK input) |
| `\r\n` | `\n` | Windows CRLF line endings |
| `\r` | `\n` | Stray carriage returns |

Normalization runs on both paste and regular input events. The original text is never stored — only the normalized version enters the lexer.

- **Tests:** `normalizeTypographic.test.ts` → 31 tests covering all character categories, line endings, and mixed input

### 7.8 Shift+Enter — Insert Newline (Multiline Mode)

When the `multiline` prop is enabled (default: `true`), Shift+Enter inserts a line break into the query instead of submitting. This allows users to write multi-line queries for readability.

- Shift+Enter inserts a `<br>` via `document.execCommand('insertLineBreak')`
- The newline is treated as whitespace by the lexer — it does not change query semantics
- Ctrl+Enter always submits regardless of multiline mode
- Plain Enter still submits (or accepts a suggestion if the dropdown is open)
- When `multiline` is `false`, Shift+Enter has no special behavior (falls through to default Enter handling)

- **Tests:** `multiline.test.ts` → "parses multiline queries correctly", "validates multiline queries same as single-line"

### 7.9 Arrow Keys — Navigate / Move Cursor

- **ArrowUp/ArrowDown** with dropdown open: navigate suggestions (ArrowUp can deselect all items by going to index -1)
- **ArrowLeft/ArrowRight/Home/End/PageUp/PageDown** (any time): move cursor and update suggestions for new position

### 7.10 Dropdown Selection Behavior

The dropdown's selected index determines which item is highlighted and which Enter/Tab would accept.

- **Empty partial** (cursor just landed in a position, nothing typed yet): no item is pre-selected (index = -1). The dropdown shows options but the user must arrow-down or click to select one. Enter/Tab fall through to their default behavior (Enter submits, Tab moves focus).
- **Non-empty partial** (user has started typing): the first matching item is pre-selected (index = 0). Enter/Tab accept it immediately.
- **Non-interactive hint selected** (fields like `price:42` where the only dropdown item is a hint such as "Enter a number"): Tab adds a trailing space after the typed value, closes the dropdown, and then reopens it with suggestions for the next position. Enter closes the dropdown and submits the search. This matches the behavior of fields with real suggestions — Tab/Enter always "exit" the field value.
- **ArrowUp past first item**: deselects all (returns to index -1).
- **Loading state** ("Searching..." for async fields): no item is pre-selected.

- **Tests:** `SuggestionChaining.test.ts` → "number field returns a hint suggestion with empty text", "Tab on a hint should \"exit\" the field — trailing space confirms the value"

---

## 8. Dropdown Positioning

The autocomplete dropdown and date picker are rendered via `ReactDOM.createPortal` to `document.body` with fixed positioning based on the caret's `getBoundingClientRect()`.

### 8.1 Position Calculation

- Position is derived from the browser's `Selection` API: `range.getBoundingClientRect()`
- Dropdown appears below the caret by default, flips above if insufficient viewport space below
- Clamped to viewport edges (no overflow left/right)

### 8.2 Full-Width Dropdown Mode (`dropdownAlignToInput`)

When the `dropdownAlignToInput` prop is `true`, the suggestion dropdown spans the full width of the input container and is affixed to its bottom edge, rather than following the caret. The `fixedWidth` override disables the default min/max width constraints.

Custom dropdowns like the date picker are **excluded** from full-width mode — they remain compact and caret-relative even when `dropdownAlignToInput` is true. This prevents rendered components from being stretched to the full input width.

### 8.3 Dropdown Mode (`dropdownMode`)

Controls when the autocomplete dropdown appears:

| Mode | Behavior |
|------|----------|
| `'always'` (default) | Dropdown appears automatically as the user types, based on cursor context. |
| `'never'` | Dropdown is completely disabled. No suggestions, date picker, or hints are shown. |
| `'manual'` | Dropdown only appears after the user presses **Ctrl+Space** (or Cmd+Space on macOS). Once activated, the dropdown stays open for the current context type. When the context changes (e.g. moving from a field name to a field value), the dropdown is dismissed and must be re-activated with another Ctrl+Space. Escape also dismisses it. |

The `manualActivationContextRef` tracks which context type was activated. When `updateSuggestionsFromTokens` detects a context change, it clears the ref and hides the dropdown. `closeDropdown` also resets the ref.

### 8.4 Deferred Positioning

To prevent a visible flash where the dropdown appears at a stale position before snapping to the correct one, positioning is deferred via `requestAnimationFrame`. The dropdown's suggestions and context are set first (with `showDropdown: false`), then after the DOM has painted, the position is calculated and the dropdown becomes visible.

### 8.4.1 Reposition on Resize / Scroll

When the dropdown or date picker is visible, the component listens for `window` resize and scroll events (with capture, to catch nested scrollable containers) and recalculates the position. Full-width dropdowns recompute from the container rect; caret-relative dropdowns (including date picker) recompute from the caret rect.

### 8.5 Date Picker

The date picker appears when a date-type field's value is being entered. It supports single date and date range selection.

#### 8.5.1 View Levels (Zoom Out)

Clicking the header label (month/year) zooms out to a higher-level view:

| View Level | Header Label | Grid | Click Header → |
|------------|-------------|------|----------------|
| Days | "March 2026" | Calendar days (7 cols) | → Months |
| Months | "2026" | 12 month names (3 cols) | → Years |
| Years | "2020–2029" | 12 years incl. adjacent decade (3 cols) | (no further zoom) |

Selecting a month in the months view drills down to days. Selecting a year in the years view drills down to months.

The left/right arrows navigate by month, year, or decade depending on the current view level.

- **Tests:** `DatePicker.test.ts` → "days view shows month+year header", "months view shows year header", "years view shows decade range header", "zoom out from days goes to months", "zoom out from months goes to years", "cannot zoom out from years", "selecting a year zooms into months", "selecting a month zooms into days"

#### 8.5.2 Years Grid

The years view shows 12 cells: the 10 years of the current decade plus one year from the adjacent decades on each side (shown dimmed). For decade 2020–2029, the grid shows 2019, 2020–2029, 2030.

- **Tests:** `DatePicker.test.ts` → "generates 12 years centered on the decade", "first and last years are out-of-range (adjacent decades)"

#### 8.5.3 Navigation

| View Level | Prev/Next Step |
|------------|---------------|
| Days | ±1 month (wraps year) |
| Months | ±1 year |
| Years | ±10 years (decade) |

- **Tests:** `DatePicker.test.ts` → "prev/next at days level changes month", "prev/next at days level wraps year", "prev at days level wraps year backward", "prev/next at months level changes year", "prev/next at years level changes by decade"

#### 8.5.4 Single / Range Mode

- **Single mode**: Clicking a day emits `YYYY-MM-DD`.
- **Range mode**: First click sets range start, second click sets range end. Emits `[YYYY-MM-DD TO YYYY-MM-DD]`. Reversed selections are auto-corrected.
- **Initial values**: The picker accepts `initialMode`, `initialStart`, and `initialEnd` props. When the cursor is inside an existing range expression on a date field (e.g., `created:[2024-01-01 TO 2024-12-31]`), the picker opens in range mode with the bounds pre-populated. When clicking into an existing single date value (e.g., `created:2024-01-15`), the picker opens in single mode with that date highlighted (blue background, white text via `daySelected` style). In range mode, the view navigates to the **end** date's month (so `[now-365d TO now]` shows the current month, not a month a year ago). In single mode, the view navigates to the selected date's month. Empty contexts (`created:` with no value) open with no date pre-selected. **Tests:** `DatePickerRangeTransition.test.ts` → "range view should navigate to end date month (bug #1)" suite
- **Range → single transition**: When the picker is already open and the init state changes (mode switch or different date), the picker is forced to remount so `useState` picks up the fresh initial values. The `shouldRemountDatePicker` function compares mode and date timestamps between previous and new init; when any differ, `showDatePicker` is set to `false` before the rAF re-opens it. **Tests:** `DatePickerRangeTransition.test.ts` → "shouldRemountDatePicker" suite (6 tests), "full paste-over-range scenario" suite (3 tests), "single date highlight on reopen" suite (3 tests)
- **Range hover preview**: After the first click (start selected, end pending), hovering over any date highlights the preview range between start and the hovered date. This works across all view levels:
  - **Days view**: individual day cells in the preview range get the in-range highlight.
  - **Months view**: month cells whose month falls between start and hovered month are highlighted.
  - **Years view**: year cells between start year and hovered year are highlighted.
  - Hovering backward (before the start date) works — preview shows the reversed range. Leaving the calendar clears the preview.
- Range presets (e.g., "Last 7 days", "Last 30 days") are shown in a 2-column grid below the calendar in range mode only. The date picker dropdown has no max-height constraint so presets are visible without scrolling.

- **Tests:** `DatePicker.test.ts` → "single mode formats as YYYY-MM-DD", "range format is [start TO end]", "range with reversed dates orders correctly", "hover date creates a preview range with isDateInRange", "hover preview works when hovering before the start date (reversed)", "no preview when hoverDate is null (mouse left the calendar)", "month-level preview", "year-level preview"

#### 8.5.5 Replacement Range Capture

When the date picker opens, the replacement range (start/end character offsets) is captured from the current context token and stored in `datePickerReplaceRef`. When the user selects a date, `handleDateSelect` uses this saved range instead of re-computing from the current cursor position. This prevents the bug where the cursor drifts (e.g., after clicking inside the picker) and the date gets inserted at the wrong position instead of replacing the existing value. For RANGE contexts the replacement covers the entire `[... TO ...]` expression; for FIELD_VALUE contexts it covers the value token; for empty contexts (no value after colon) it inserts at the cursor position. **Tests:** `DatePickerRangeTransition.test.ts` → "replacement range for date picker (bug #2)" suite

#### 8.5.6 Trailing Space After Date Selection

When a date value is selected from the date picker and the cursor is at the end of the input (or only whitespace follows), a trailing space is appended after the inserted value. This enables seamless continuation of the query without manually pressing space.

---

## 9. Validation

Validation runs on the AST and produces errors with character offsets for squiggly underline display. Errors are **deferred** — they only display after the cursor leaves the error range.

### 9.1 Squiggly Underlines

Validation errors are rendered as red wavy underlines beneath the invalid text. The wave pattern uses an SVG-based `background-image` with a smooth sinusoidal curve (8px wavelength) for a clear, readable underline.

The squigglies are absolutely positioned relative to the input container, with positions computed from DOM `Range.getClientRects()` measurements. For errors spanning multiple lines, each line gets its own squiggly underline (one rect per line), preventing the single-bounding-box problem where a multi-line range would produce a squiggly covering the entire width of the input.

DOM measurements for squiggly positions are **debounced** (150ms) to avoid layout thrashing during rapid input. A maximum of 30 errors are measured per cycle to cap the cost of large queries with many validation errors. When errors clear entirely (e.g., deleting all text), squigglies are removed immediately without waiting for the debounce.

### 9.2 Hover Tooltips

Hovering over a squiggly underline displays a styled tooltip with the error/warning message. The tooltip:

- Appears just below the squiggly wave by default, or flips above the text line if below would exit the viewport
- Never covers the text line the mouse is hovering over
- Positioned horizontally near the mouse cursor, clamped so it doesn't overflow the right edge of the viewport
- Uses the configured error/warning color for the border and text
- Respects the configured font family and z-index from `StyleConfig`
- Has a widened hover target area (16px height) for easier mouse targeting
- Works correctly for very long squigglies spanning hundreds of clauses — the tooltip stays near the mouse rather than anchoring to the start of the underline

### 9.3 Deferred Display

Errors are only shown visually after the cursor leaves the error range. This prevents distracting underlines while the user is still typing.

- Cursor within error range → error hidden
- Cursor at error start or end → error hidden
- Cursor outside all error ranges → all errors shown
- Multiple errors: each independently shown/hidden based on cursor position

- **Tests:** `ValidationSquiggles.test.ts` → "hides error when cursor is within error range", "hides error when cursor is at error start", "hides error when cursor is at error end", "shows error when cursor is past error range", "shows error when cursor is before error range", "shows one error and hides another based on cursor position", "shows all errors when cursor is outside all error ranges", "hides value error when cursor is on the value being typed", "shows value error once cursor moves to next term"

### 9.3.1 Blur Releases All Deferred Errors

When the input loses focus (blur), `cursorOffset` is set to `-1`, which causes all deferred errors to become visible. This ensures errors are always shown when the user is not actively editing.

- Input focused, cursor at end of `status:bad` → error on "bad" hidden (cursor within range)
- Input blurred → error on "bad" shown (cursorOffset = -1, outside all ranges)

### 9.4 External Error Access

Validation errors are accessible outside the component in two ways:

1. **`onValidationChange` callback** — fires on every input change with the current error array
2. **`api.getValidationErrors()`** — returns errors on demand via the imperative API

Each error has: `{ message: string, start: number, end: number, field?: string }`

- **Tests:** `ValidationSquiggles.test.ts` → "errors include field name for field-specific errors", "errors include field name for unknown fields", "returns empty array for valid input", "returns empty array for empty input"

### 9.5 Error Positions

Errors are placed precisely on the relevant part of the input:

| Error Type | Underlined Text | Example |
|-----------|----------------|---------|
| Unknown field | Field name | `unknown` in `unknown:value` |
| Invalid number | Value | `abc` in `price:abc` |
| Invalid boolean | Value | `maybe` in `is_vip:maybe` |
| Invalid IP | Value | `notanip` in `ip:notanip` |
| Custom validator | Value | `10` in `rating:10` |
| Invalid comparison | Value | `active` in `status:>active` |

- **Tests:** `ValidationSquiggles.test.ts` → "unknown field error covers the field name", "invalid number error covers the value", "invalid boolean error covers the value", "invalid IP error covers the value", "custom validator error covers the value", "multiple errors have correct non-overlapping positions", "comparison op on non-numeric/date field produces error on value"

### 9.6 Field Validation

- Unknown field names are flagged
- Field aliases: if a `FieldConfig` has `aliases: ['contact_name']`, then `contact_name:value` is treated identically to `name:value` — no "Unknown field" error, and the canonical field's type/validation rules apply.
- **Tests:** `Validator.test.ts` → "flags unknown fields"; "field aliases" suite (6 tests covering alias resolution, type validation through aliases, and field groups)

### 9.7 Type Validation

| Field Type | Valid | Invalid |
|------------|-------|---------|
| `enum` | — (no built-in validation; `suggestions` drive autocomplete only) | — |
| `boolean` | `true`, `false` | Anything else |
| `number` | Integers, decimals, negatives | Non-numeric strings |
| `date` | ISO format, relative (`now-7d`) | Invalid formats |
| `ip` | Valid IPv4, wildcards (`192.168.*`) | Malformed addresses |
| `string` | Anything | — |

- **Tests:** `Validator.test.ts` → "does not validate enum values (autocomplete only)", "flags invalid numbers", "accepts valid numbers", "flags invalid booleans", "accepts valid booleans", "flags invalid IP addresses", "accepts valid IP addresses", "accepts wildcard IP", "flags invalid dates", "accepts valid date formats"

### 9.8 Comparison Operator Validation

Comparison operators (`>`, `>=`, `<`, `<=`) are only allowed on `number` and `date` fields.

- `price:>100` ✓
- `created:>2024-01-01` ✓
- `status:>active` ✗
- **Tests:** `Validator.test.ts` → "flags comparison operator on non-numeric/date field", "allows comparison operator on number field", "allows comparison operator on date field"

### 9.9 Custom Validation (`validateValue` prop)

Custom validation is provided via a single top-level `validateValue` prop on `ElasticInput`, rather than per-field `validate` callbacks on `FieldConfig`. The callback receives a `ValidateValueContext` with:

- `value` — the raw value string
- `position` — `'field_value'`, `'range_start'`, `'range_end'`, `'bare_term'`, or `'field_group_term'`
- `fieldName` — the field name (absent for bare terms)
- `fieldConfig` — the resolved `FieldConfig` (absent for bare terms)
- `quoted` — whether the value is double-quoted
- `operator` — comparison operator if present (e.g. `>`, `>=`; only for `field_value`)
- `inclusive` — for range bounds, whether the bracket is inclusive (`[`/`]`) or exclusive (`{`/`}`)

Return values:
- `null` — valid, no issue
- `string` — error message (red squiggles)
- `{ message: string, severity: 'error' | 'warning' }` — explicit severity control. Warnings render as amber squiggles.

The callback is passed to `Validator.validate(ast, validateValueFn?)`, not to the constructor, so changing it doesn't require re-instantiating the Validator. Inside `ElasticInput`, the callback is stored in a ref to avoid stale closures.

The `ValidateValueContext`, `ValidationResult`, `ValidateReturn`, and `ValidateValueFn` types are exported for consumers.

- **Tests:** `Validator.test.ts` → "runs custom validateValue callback", "passes custom validateValue for valid value", "ValidateValueContext in validateValue callback" suite, "Validation warnings (ValidationResult return type)" suite

### 9.10 Nested Validation

Validation recurses through boolean expressions, groups, and NOT nodes. Multiple errors are collected.

- **Tests:** `Validator.test.ts` → "validates nested boolean expressions", "validates inside groups", "validates inside NOT", "collects multiple errors"

### 9.11 Modifier Validation

Fuzzy, proximity, and boost modifiers are validated for valid ranges:

| Modifier | Valid Range | Error |
|----------|-----------|-------|
| `~N` (fuzzy) | 0, 1, or 2 | "Fuzzy edit distance must be 0, 1, or 2" |
| `~N` (proximity) | ≥ 0 | "Proximity value must be non-negative" |
| `^N` (boost) | > 0 | "Boost value must be positive" |

- **Tests:** `Validator.test.ts` → "accepts valid fuzzy value (0-2)", "flags fuzzy value > 2", "accepts valid boost value", "flags boost value <= 0", "flags fuzzy > 2 on bare term", "accepts valid proximity on bare quoted phrase", "accepts combined fuzzy + boost"

### 9.12 Range Validation

Range expressions (`RangeNode`) are validated by checking each bound against the field's type. Wildcard bounds (`*`) are skipped.

| Field Type | Validation | Example |
|------------|-----------|---------|
| `number` | Both bounds must be numeric | `price:[10 TO 100]` ✓, `price:[abc TO def]` ✗ |
| `date` | Both bounds must be valid dates | `created:[now-7d TO now]` ✓, `created:[invalid TO now]` ✗ |
| `boolean` | Ranges not supported | `is_vip:[true TO false]` ✗ |
| `string`, `ip` | No validation (lexicographic OK) | `name:[abc TO def]` ✓ |
| `enum` | No range-specific validation | |

Rounding syntax (`now/d`, `now-1d/d`) is accepted for date ranges. Unknown fields produce an "Unknown field" error.

Ranges inside `FieldGroup` nodes are validated against the group's field config.

#### Per-bound error offsets

Validation errors on range bounds are positioned on the **specific bound** (lower or upper), not on the entire range expression. `RangeNode` includes `lowerStart`/`lowerEnd`/`upperStart`/`upperEnd` character offsets computed by the parser. For `price:[abc TO def]`, the error on `abc` highlights only characters 7-10, and `def` highlights 14-17.

The top-level `validateValue` callback receives range bounds with `position: 'range_start'` or `'range_end'`, along with `inclusive` indicating bracket type and `fieldConfig` for the range's field.

- **Tests:** `Validator.test.ts` → "Range validation" suite, "Per-bound range validation offsets" suite, "ValidateValueContext in validateValue callback" suite

### 9.13 Field-Scoped Group Validation

When a `FieldGroup` node is encountered (e.g., `created:(a b c)`), each bare term inside the group is validated against the group's field config as if it were an individual `field:value` pair.

- `created:(a b c)` → 3 errors (each value is not a valid date)
- `created:(2024-01-01 now-7d)` → no errors
- `status:(active OR bogus)` → 1 error on "bogus"
- `price:(abc 100 xyz)` → 2 errors on "abc" and "xyz"

Nested groups are validated recursively: `created:((a OR b) AND c)` validates all 3 terms. NOT inside a group is also handled: `created:(NOT invalid)` validates "invalid".

Unknown fields in groups produce a single "Unknown field" error without descending into the inner expression.

- **Tests:** `Validator.test.ts` → "Field-scoped group validation" suite (10 tests)

### 9.14 Star Field (`*`) Bypass

`*` as a field name means "all fields" and bypasses all field-specific validation. No unknown-field error is produced, and no type validation is applied.

- `*:value` → no errors
- `*:*` → no errors
- `*:(a OR b)` → no errors
- **Tests:** `Validator.test.ts` → "Star (*) as field name" suite (3 tests)

### 9.15 Group Boost Validation

Boost on groups and field groups is validated the same as on terms: must be positive (> 0).

- `(a OR b)^2` → no errors
- `(a)^0` → "Boost value must be positive"
- `field:(a b)^3` → no errors
- `field:(a)^0` → "Boost value must be positive"
- **Tests:** `Validator.test.ts` → "Group boost validation" suite (4 tests)

### 9.16 Ambiguous Precedence Warnings

Mixing AND and OR at the same expression level without parentheses produces a **warning** (not an error). The warning message is: "Ambiguous precedence: mix of AND and OR without parentheses. Add parentheses to clarify."

The detection works by traversing `BooleanExpr` chains at the same level (stopping at `Group` boundaries). If both AND and OR operators are found, a warning is emitted with `severity: 'warning'`.

| Input | Warning? | Reason |
|-------|----------|--------|
| `a AND b OR c` | Yes | Mixed AND/OR |
| `a AND b AND c` | No | Same operator |
| `a OR b OR c` | No | Same operator |
| `(a AND b) OR c` | No | Parens clarify |
| `a AND b OR c AND d` | Yes | Mixed chain |
| `(a AND b OR c)` | Yes | Inside group, still mixed |

Warning squiggles are rendered with an amber/yellow color (`warning` color key) instead of red, matching the severity level. Tooltips also use the warning color.

- **Tests:** `Validator.test.ts` → "Ambiguous precedence warnings" suite (8 tests)

### 9.17 Non-Validated Cases

- Bare terms have no built-in type validation, but the `validateValue` callback is still called with `position: 'bare_term'` for custom validation
- Empty field groups (`field:()`) pass validation
- Null AST (empty input) passes validation
- **Tests:** `Validator.test.ts` → "does not validate bare terms" (no built-in errors), "returns no errors for null AST", "Incomplete expression errors" suite, "passes bare_term context for unfielded terms" (validateValue callback)

### 9.4.1 Incomplete Expression Errors

The validator flags structurally incomplete expressions that would produce empty or broken Elasticsearch queries:

| Pattern | Example | Error Message |
|---------|---------|---------------|
| Field with missing value | `name:` | `Missing value after "name:"` |
| Comparison op with missing value | `price:>` | `Missing value after "price>"` |
| Empty range lower bound | `price:[ TO 100]` | `Missing lower bound in range` |
| Empty range upper bound | `price:[0 TO ]` | `Missing upper bound in range` |

Wildcard range bounds (`*`) are not flagged — `[* TO 100]` is valid Elasticsearch syntax.

- **Tests:** `Validator.test.ts` → "Incomplete expression errors" suite

---

## 9.5. Syntax Highlighting

### 9.5.1 Regex Syntax Highlighting

REGEX tokens (`/pattern/`) are sub-highlighted with distinct colors for internal regex syntax elements:

| Element | Example | Color Key |
|---------|---------|-----------|
| Delimiters | `/` | `regexDelimiter` |
| Character classes | `[abc]`, `[^0-9]` | `regexCharClass` |
| Group parens | `(`, `)`, `(?:`, `(?=` | `regexGroup` |
| Escape sequences | `\d`, `\w`, `\.` | `regexEscape` |
| Quantifiers | `+`, `*`, `?`, `+?`, `{1,3}` | `regexQuantifier` |
| Anchors | `^`, `$` | `regexAnchor` |
| Alternation | `\|` | `regexAlternation` |
| Literal text | `abc` | `regexText` |

The sub-tokenizer handles nested structures (escapes inside character classes, non-capturing groups `(?:...)`, lookaheads `(?=...)`, `(?!...)`, lookbehinds `(?<=...)`, `(?<!...)`, and lazy quantifiers `+?`, `*?`).

- **Tests:** `regexHighlight.test.ts` → 20 tests covering all element types, nesting, and edge cases

### 9.5.2 Range Syntax Highlighting

RANGE tokens are sub-highlighted with distinct colors for each part:

| Element | Example | Color Key |
|---------|---------|-----------|
| Brackets | `[`, `]`, `{`, `}` | `operator` |
| `TO` keyword | `TO` | `booleanOp` |
| Bare bounds | `abc`, `100` | `fieldValue` |
| Quoted bounds | `"abd"` | `quoted` |
| Wildcard bound | `*` | `wildcard` |
| Whitespace | spaces | (no color) |

No new `ColorConfig` properties are needed — existing color keys are reused.

### 9.5.3 Matching Parenthesis Highlighting

When the cursor is adjacent to a parenthesis, both the paren and its matching counterpart are highlighted with a background color (`matchedParenBg`) and bold weight. This follows standard IDE bracket matching rules:

1. **Check "after" first (left of caret):** If the character immediately before the cursor is a paren, that pair is highlighted.
2. **Then check "before" (right of caret):** If no paren was found at step 1, check the character at the cursor position.
3. **"After" takes precedence** — if cursor is between `)(`, the `)` on the left is matched.

Matching respects nesting: `((a))` with cursor after inner `(` matches the inner `)`, not the outer one. Unmatched parens (e.g. `(a b` with no closing paren) produce no highlight. Parens inside quoted strings or regex are ignored (they are not `LPAREN`/`RPAREN` tokens). When the input is blurred (cursor offset -1), no matching is performed.

- **Tests:** `parenMatch.test.ts` → 12 tests covering basic matching, nesting, priority, unmatched, and edge cases

### 9.5.4 Large Input Performance

For large inputs (hundreds of tokens), two optimizations prevent browser lock-up:

**Debounced highlight rebuild:** When the input has >80 tokens, the `innerHTML` replacement (which destroys and rebuilds all spans) is debounced by 60ms during active typing. The browser natively handles the text edit within existing spans, so highlighting stays visually intact with slightly stale token boundaries until the debounced refresh. Programmatic updates (`setValue`, controlled value, initial load) bypass the debounce and highlight immediately.

**DOM simplification for bulk selection operations:** When the editor has >40 child nodes and the user is about to delete or replace a large selection (>20 characters), the component strips all syntax-highlighting spans down to plain text before the browser processes the edit. This prevents forced reflow from the browser splitting/merging hundreds of styled spans. Single-character edits (backspace/delete at a cursor position, or small selection replacements) are not stripped — they only touch 1-2 spans and are fast natively.

### 9.5.5 Theme Transition Re-highlighting

When the `colors` prop changes (e.g. switching between light and dark themes), the inline-styled HTML in the contentEditable editor must be regenerated with the new color values. The paren matching effect tracks the previous `colors` reference and forces a `buildHighlightedHTML` re-render when it changes, bypassing the paren-match-key early-return optimization. Without this, the old color values remain baked into the HTML spans until the next text edit.

---

## 10. Configuration Options

### 10.1 Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fields` | `FieldConfig[] \| () => Promise<FieldConfig[]>` | required | Field definitions (static or async loader) |
| `onSearch` | `(query, ast) => void` | — | Called on submit (Enter on value, Ctrl+Enter) |
| `onChange` | `(query, ast) => void` | — | Called on every input change |
| `onValidationChange` | `(errors) => void` | — | Called when validation errors change |
| `value` | `string` | — | Controlled value |
| `defaultValue` | `string` | — | Initial uncontrolled value |
| `savedSearches` | `SavedSearch[] \| () => Promise` | — | Saved search data or async loader |
| `searchHistory` | `HistoryEntry[] \| () => Promise` | — | History data or async loader |
| `fetchSuggestions` | `(field, partial) => Promise` | — | Async value suggestion provider |
| `colors` | `ColorConfig` | `DEFAULT_COLORS` | Syntax highlighting colors |
| `styles` | `StyleConfig` | `DEFAULT_STYLES` | Structural/layout style overrides |
| `placeholder` | `string` | — | Placeholder text |
| `className` | `string` | — | CSS class for outer container |
| `style` | `CSSProperties` | — | Inline styles for outer container |
| `suggestDebounceMs` | `number` | `200` | Debounce for async suggestions |
| `maxSuggestions` | `number` | `10` | Max suggestions shown |
| `showSavedSearchHint` | `boolean` | `true` | Show `#saved-search` hint in dropdown |
| `showHistoryHint` | `boolean` | `true` | Show `!history` hint in dropdown |
| `inputRef` | `(api) => void` | — | Provides imperative API handle |
| `multiline` | `boolean` | `true` | Enable Shift+Enter for line breaks |
| `dropdownAlignToInput` | `boolean` | `false` | Full-width dropdown affixed to input bottom |
| `dropdownMode` | `'always' \| 'never' \| 'manual'` | `'always'` | Controls when the dropdown appears: always, never, or on Ctrl+Space |
| `onKeyDown` | `(e: React.KeyboardEvent) => void` | — | Called before internal keyboard handling; `preventDefault()` skips internal handling |
| `renderFieldHint` | `(field, partial) => ReactNode` | — | Custom rich-content hint renderer for field values |
| `renderHistoryItem` | `(entry, isSelected) => ReactNode` | — | Custom renderer for history suggestion items |
| `renderSavedSearchItem` | `(search, isSelected) => ReactNode` | — | Custom renderer for saved search suggestion items |

#### Async Field Loading

When `fields` is an async function (`() => Promise<FieldConfig[]>`), the component starts with an empty field list while loading. During this time:
- No "Unknown field" errors are raised (there are no known fields to compare against)
- No field autocomplete suggestions appear
- The input is fully functional — users can type freely

Once the promise resolves, the engine and validator are rebuilt and the current input is re-validated with the loaded fields. The async function should be memoized (e.g. with `useCallback`) to avoid re-fetching on every render.

#### Field Aliases

Each `FieldConfig` can declare `aliases: string[]`. An alias is treated identically to the canonical field name for all purposes:
- No "Unknown field" validation error
- Type validation uses the canonical field's rules (e.g. `cost:abc` validates as number if `cost` is an alias of a `number` field)
- Value autocomplete resolves to the canonical field's suggestions
- `fetchSuggestions` receives the canonical field name, not the alias
- Alias names are matchable in field autocomplete (typing `contact_` matches a field with alias `contact_name`)

- **Tests:** `Validator.test.ts` → "field aliases" suite; `AutocompleteEngine.test.ts` → "field aliases" suite

#### `asyncSearch` Flag

Each `FieldConfig` can set `asyncSearch: true` to indicate that the field's values are provided by the `fetchSuggestions` callback. This controls the initial dropdown behavior when entering a value for that field:

- **`asyncSearch: true`**: Shows a loading spinner immediately on first entry. The `fetchSuggestions` callback is invoked. Subsequent keystrokes preserve previous results until new ones arrive.
- **`asyncSearch: false` (default)**: Shows the sync hint if one exists for the field type (e.g. "Enter a number" for number fields). String fields show no default hint. The `fetchSuggestions` callback is **not** invoked for this field.

This prevents fields without an async data source (e.g. `email`, `price`) from flashing a loading spinner before falling back to a static hint.

#### `asyncSearchLabel`

Customizes the loading spinner label for async fields. Accepts a static string or a callback receiving the current partial text. Defaults to `"Searching..."`.

```ts
// Static string
{ name: 'company', asyncSearch: true, asyncSearchLabel: 'Searching companies...' }

// Dynamic callback
{ name: 'company', asyncSearch: true, asyncSearchLabel: (partial) => `Searching for "${partial}"...` }
```

### 10.2 Style Configuration

The `styles` prop accepts a `StyleConfig` object for structural/layout customization. All properties are optional; defaults come from `DEFAULT_STYLES`. A `DARK_STYLES` preset is also exported for dark-mode layouts.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `fontFamily` | `string` | `'SF Mono', 'Fira Code', ...` | Shared font across input and dropdown |
| `fontSize` | `string` | `14px` | Base font size for the input |
| `inputMinHeight` | `string` | `40px` | Minimum input height |
| `inputPadding` | `string` | `8px 12px` | Input padding (also drives placeholder position) |
| `inputBorderWidth` | `string` | `2px` | Input border width |
| `inputBorderColor` | `string` | `#d0d7de` | Input border color |
| `inputBorderRadius` | `string` | `8px` | Input border radius |
| `inputFocusBorderColor` | `string` | `#0969da` | Border color on focus |
| `inputFocusShadow` | `string` | `0 0 0 3px rgba(...)` | Box shadow on focus |
| `dropdownBorderColor` | `string` | `#d0d7de` | Dropdown border color |
| `dropdownBorderRadius` | `string` | `8px` | Dropdown border radius |
| `dropdownShadow` | `string` | `0 8px 24px rgba(...)` | Dropdown box shadow |
| `dropdownMaxHeight` | `string` | `300px` | Dropdown max height |
| `dropdownMinWidth` | `string` | `200px` | Dropdown min width |
| `dropdownMaxWidth` | `string` | `400px` | Dropdown max width |
| `dropdownZIndex` | `number` | `99999` | Dropdown z-index |
| `dropdownItemPadding` | `string` | `6px 12px` | Dropdown item padding |
| `dropdownItemFontSize` | `string` | `13px` | Dropdown item font size |
| `typeBadgeBg` | `string` | `#eef1f5` | Type badge background |
| `typeBadgeSelectedBg` | `string` | `rgba(255,255,255,0.2)` | Type badge background when selected |
| `typeBadgeColor` | `string` | `#656d76` | Type badge text color |
| `typeBadgeSelectedColor` | `string` | `#ffffff` | Type badge text color when selected |

`DARK_STYLES` overrides border colors, focus colors, shadows, and badge colors for dark backgrounds.

Placeholder positioning is automatically derived from `inputPadding` so it aligns with the input text.

### 10.3 ElasticInputAPI (via `inputRef`)

| Method | Description |
|--------|-------------|
| `getValue()` | Returns current input text |
| `setValue(value)` | Sets input text programmatically |
| `focus()` | Focuses the input |
| `blur()` | Blurs the input |
| `getAST()` | Returns current parsed AST |
| `getValidationErrors()` | Returns current validation errors |

---

## 11. Undo / Redo

The component implements a custom undo/redo stack that operates at the semantic level rather than relying on the browser's built-in `execCommand` undo.

### 11.1 Typing Group Debounce

Consecutive single-character edits within 300ms are grouped into one undo entry. If the user pauses for 300ms+, the next keystroke starts a new group.

- **Implementation:** `handleInput` in `ElasticInput.tsx` uses `replaceCurrent()` for small changes within the timer window, `push()` when the timer has expired.
- **Tests:** `undoStack.test.ts` → "replaceCurrent updates the current entry"

### 11.2 Transactional Operations

The following operations each push a distinct undo entry, breaking any current typing group:

- Accepting an autocomplete suggestion
- Selecting a date from the date picker
- Selecting a history ref (`!`) or saved search (`#`)
- Paste (typing group is broken before the paste text is inserted)

- **Implementation:** `applyNewValue()` clears the typing group timer and pushes a new entry.

### 11.3 Undo (Ctrl+Z)

Pressing `Ctrl+Z` (or `Cmd+Z` on macOS) reverts to the previous undo entry, restoring both the text content and cursor position. The editor is re-lexed, re-parsed, and re-validated without recording the restoration as a new undo entry.

- **Tests:** `undoStack.test.ts` → "undo returns previous entry", "undo returns null when at beginning"

### 11.4 Redo (Ctrl+Y / Ctrl+Shift+Z)

Pressing `Ctrl+Y` or `Ctrl+Shift+Z` moves forward in the undo stack. Works symmetrically with undo.

- **Tests:** `undoStack.test.ts` → "redo returns next entry after undo", "redo returns null when at end"

### 11.5 Redo Discard on New Input

Typing new text after an undo discards all redo entries ahead of the current position.

- **Tests:** `undoStack.test.ts` → "push after undo discards redo entries"

### 11.6 Stack Size Limit

The undo stack is capped at 100 entries. When exceeded, the oldest entry is trimmed.

- **Tests:** `undoStack.test.ts` → "respects maxSize"

### 11.7 Deduplication

Pushing a value identical to the current entry only updates the cursor position — it does not create a new undo step.

- **Tests:** `undoStack.test.ts` → "deduplicates identical values (updates cursor only)"
