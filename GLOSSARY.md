# ElasticInput — Glossary

Common terminology for discussing the ElasticInput component. Use these terms for unambiguous communication.

---

## Input & Text

| Term | Meaning | Example |
|------|---------|---------|
| **query** | The entire raw text in the input field | `status:active AND name:"John"` |
| **token** | A single lexer output with type and offsets | `FIELD_NAME("status", 0, 6)` |
| **partial** | The text the user is currently typing at the cursor position — the incomplete fragment within one token, not the whole query | In `status:act|ive`, partial is `act`; in `status:|`, partial is `""` (empty) |

## Query Structure

| Term | Meaning | Example |
|------|---------|---------|
| **field** | The left-hand side of a `field:value` pair | `status` in `status:active` |
| **value** | The right-hand side of a `field:value` pair | `active` in `status:active` |
| **bare term** | A word not attached to any field | `hello` in `hello AND status:active` |
| **field group** | A field followed by a parenthesized expression | `status:(active OR inactive)` |
| **range** | A bracketed min/max expression | `[10 TO 100]`, `{now-7d TO now}` |
| **bound** | One side of a range expression | `10` is the lower bound, `100` is the upper bound |
| **modifier** | A suffix on a value: fuzzy (`~N`), proximity (`~N` on quoted), boost (`^N`) | `john~2`, `"quick fox"~5`, `title^3` |
| **prefix op** | A `-` or `+` before a term | `-status:active` |

## AST Nodes

| Term | Meaning |
|------|---------|
| **FieldValue** | A `field:value` pair |
| **FieldGroup** | A `field:(expression)` construct |
| **BareTerm** | An unfielded word or phrase |
| **BooleanExpr** | An AND/OR combining two nodes |
| **Not** | A negation (from `NOT` keyword or `-` prefix) |
| **Group** | A parenthesized sub-expression |
| **Range** | A `[min TO max]` or `{min TO max}` expression |
| **Regex** | A `/pattern/` expression |

## UI Components

| Term | Meaning |
|------|---------|
| **dropdown** | The autocomplete suggestion list that appears below the input |
| **suggestion** | A single item in the dropdown |
| **hint** | A non-selectable dropdown item (e.g. `#saved-search`, `!history`, type placeholders) |
| **selected index** | Which dropdown item is highlighted for keyboard accept (Enter/Tab). `-1` means nothing selected. |
| **date picker** | The calendar popup for date-type fields |
| **squiggly** | The wavy underline indicating a validation error or warning |
| **cursor context** | What the cursor is "in" — determines dropdown behavior: `FIELD_NAME`, `FIELD_VALUE`, `OPERATOR`, `SAVED_SEARCH`, `HISTORY_REF`, or `EMPTY` |
| **caret** / **cursor** | The text insertion point in the input |

## Pipeline Stages

| Term | Meaning |
|------|---------|
| **lexer** | Converts raw text into tokens |
| **parser** | Converts tokens into an AST |
| **validator** | Checks the AST for semantic errors (unknown fields, type mismatches) |
| **highlighter** | Converts tokens into colored HTML spans |
| **autocomplete engine** | Generates suggestions based on cursor context |
