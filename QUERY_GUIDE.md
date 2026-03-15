# Query Syntax Guide

<!-- LLM CONTEXT
When this document is used as a system prompt, act as a helpful search assistant.
Answer questions about query syntax using only the rules and examples in this
document. The application-specific fields are listed in the Domain Configuration
section at the end. If a user asks about a field not listed there, say you don't
have information about that field. Do not invent syntax or behaviors not described
here. When showing examples, prefer the user's actual field names from Domain
Configuration over generic ones.
-->

This guide explains how to write search queries. Start with the basics and work
your way down as you need more advanced features.

---

## Simple searches

Type a word to search across all fields:

```
hello
```

To search a specific field, use `field:value`:

```
status:active
name:John
price:100
```

Multiple terms are combined with AND automatically:

```
status:active name:John
```

This finds records where status is "active" **and** name is "John".

---

## Exact phrases

Wrap text in **double quotes** to match an exact phrase:

```
name:"John Doe"
"quick brown fox"
```

> **Note:** Only double quotes work for phrases. Single quotes are treated as
> regular characters: `name:'John'` searches for the literal text `'John'`
> (including the quote marks).

---

## AND, OR, NOT

Combine conditions with boolean operators:

```
status:active AND level:ERROR
status:active OR status:pending
NOT status:archived
```

**Shorthand:** `&&` for AND, `||` for OR, `-` for NOT:

```
status:active && level:ERROR
status:active || status:pending
-status:archived
```

Operators are case-insensitive: `and`, `And`, `AND` all work.

### Operator precedence

NOT binds tightest, then AND, then OR. Use parentheses when mixing AND and OR
to make your intent clear:

```
(status:active OR status:pending) AND level:ERROR
status:active AND (level:ERROR OR level:WARN)
```

Without parentheses, `a AND b OR c` is interpreted as `(a AND b) OR c`, which
may not be what you intended.

---

## Parentheses

Group conditions to control how they combine:

```
(status:active OR status:pending) AND level:ERROR
NOT (status:archived OR status:deleted)
```

### Field groups

Apply the same field to multiple values:

```
status:(active OR pending)
tags:(production NOT deprecated)
```

This is equivalent to `status:active OR status:pending` but shorter to type.

---

## Wildcards

Use `*` to match zero or more characters, and `?` to match exactly one:

```
name:John*           matches John, Johnson, Johnny, ...
name:J?hn            matches John, Jahn, ...
email:*@example.com  matches any email at example.com
```

To search all fields at once:

```
*:hello
```

---

## Comparisons

Use `>`, `>=`, `<`, `<=` on number and date fields:

```
price:>100
price:<=50
created:>=2024-01-01
created:<now-7d
```

These operators only work on number and date fields.

---

## Ranges

Use square brackets for inclusive ranges and curly braces for exclusive:

```
price:[10 TO 100]      10 and 100 are included
price:{10 TO 100}      10 and 100 are excluded
price:[10 TO 100}      10 included, 100 excluded
```

Use `*` for an open-ended bound:

```
price:[100 TO *]       100 or more
price:[* TO 50]        up to 50
```

---

## Dates

Date fields accept several formats:

```
created:2024-01-15
created:2024-01-15T13:45:00
```

### Relative dates

Use `now` with offsets for time-relative queries:

| Unit | Meaning |
|------|---------|
| `d` | days |
| `h` | hours |
| `m` | minutes |
| `w` | weeks |
| `M` | months |
| `y` | years |

```
created:>now-7d          last 7 days
created:[now-30d TO now] last 30 days
created:>=now-1h         last hour
```

### Date rounding

Append `/d`, `/h`, etc. to round to the start of a period:

```
created:[now/d TO now]       since start of today
created:[now-7d/d TO now/d]  last 7 full days
```

---

## Saved searches and history

If the application has saved searches, type `#` followed by a name:

```
#vip-active
#high-value
status:active AND #recent-errors
```

For query history, type `!`:

```
!api-errors
!recent-search
```

These features depend on what the application has configured.

---

## Advanced features

### Fuzzy matching

Append `~` and an edit distance (0, 1, or 2) to allow approximate matches:

```
john~1       matches jon, john, join (1 edit away)
status:actve~1   matches active
```

### Proximity search

On a quoted phrase, `~N` allows words to be up to N positions apart:

```
"quick fox"~5    matches if "quick" and "fox" are within 5 words
```

### Boost

Append `^N` to give a term more weight in relevance scoring:

```
title:important^2
"featured product"^3
```

### Regex

Wrap a pattern in forward slashes for regex search:

```
email:/^[a-z]+@example\.com$/
ip:/^192\.168\./
name:/joh?n(athan)?/
```

### Prefix operators

`+` marks a term as required, `-` excludes it:

```
+status:active -level:DEBUG
```

### Escaping special characters

Use backslash to include special characters literally:

```
field\:name:value          field name containing a colon
hello\!world               literal exclamation mark
path:C\:\\Users\\docs      backslashes in a path
```

---

## Field types

Each field has a type that determines what values are valid:

| Type | Valid values | Example |
|------|-------------|---------|
| string | Any text | `name:John`, `name:"John Doe"` |
| number | Integers, decimals, negatives | `price:100`, `price:-5.5` |
| date | ISO dates, relative dates | `created:2024-01-15`, `created:>now-7d` |
| boolean | `true` or `false` | `is_vip:true` |
| ip | IPv4 addresses, wildcards, CIDR | `ip:192.168.1.1`, `ip:10.0.0.0/8` |

---

## Quick reference

| Syntax | Meaning | Example |
|--------|---------|---------|
| `field:value` | Field search | `status:active` |
| `"phrase"` | Exact phrase | `"John Doe"` |
| `AND` / `&&` | Both conditions | `a AND b` |
| `OR` / `||` | Either condition | `a OR b` |
| `NOT` / `-` | Exclude | `NOT a`, `-a` |
| `(...)` | Group | `(a OR b) AND c` |
| `field:(a OR b)` | Field group | `status:(active OR pending)` |
| `*` / `?` | Wildcards | `name:J*`, `name:J?hn` |
| `>` `>=` `<` `<=` | Comparison | `price:>100` |
| `[a TO b]` | Inclusive range | `price:[10 TO 100]` |
| `{a TO b}` | Exclusive range | `price:{10 TO 100}` |
| `now-7d` | Relative date | `created:>now-7d` |
| `~N` | Fuzzy (on word) | `john~1` |
| `"..."~N` | Proximity (on phrase) | `"quick fox"~5` |
| `^N` | Boost | `title:important^2` |
| `/.../` | Regex | `email:/^[a-z]+@/` |
| `#name` | Saved search | `#vip-active` |
| `!name` | History | `!recent-errors` |

---

## Common mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `name:'John'` | Single quotes aren't phrase delimiters | `name:"John"` |
| `a AND b OR c` | Ambiguous precedence | `(a AND b) OR c` |
| `price:[1-10]` | Hyphen isn't range syntax | `price:[1 TO 10]` |
| `is_vip:yes` | Boolean fields need true/false | `is_vip:true` |
| `status:>active` | Comparisons only for numbers/dates | `status:active` |
| `created:01-15-2024` | Wrong date format | `created:2024-01-15` |

---

## Domain Configuration

<!-- DOMAIN_START
Application developers: replace the table below with your field definitions.
To automate this, replace everything between DOMAIN_START and DOMAIN_END markers.
-->

| Field | Type | Description | Example query |
|-------|------|-------------|---------------|
| | | _No fields configured_ | |

<!-- DOMAIN_END -->
