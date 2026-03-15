# elastic-input

A syntax-aware smart autocomplete input for building structured queries. Supports field:value pairs, boolean operators, comparison operators, saved searches, history references, date pickers, and real-time validation — all in a single React component.

Built with React functional components and hooks (compatible with React 16.8+), zero runtime dependencies beyond React/ReactDOM, and fully inline-styled (no CSS imports required).

## Features

- **Syntax highlighting** — field names, values, operators, quoted strings, and special tokens are color-coded in real time
- **Context-aware autocomplete** — suggestions adapt based on cursor position (field names, values, operators, saved searches, history)
- **Built-in date picker** — calendar UI with single date and date range selection for date-typed fields
- **Validation with squiggly underlines** — unknown fields, type mismatches, and custom validators shown as red wavy underlines with hover tooltips
- **Deferred error display** — validation errors only appear after the cursor leaves the error range
- **Saved searches (`#`)** — reference saved queries by name with autocomplete
- **History references (`!`)** — recall previous searches with autocomplete
- **Keyboard-driven** — Tab to accept + continue, Enter to accept + submit, Ctrl+Enter to force submit, arrow keys to navigate
- **Fully configurable** — colors, structural styles, fonts, and layout are all customizable via props
- **Dark mode ready** — ships with `DARK_COLORS` and `DARK_STYLES` presets

## Installation

```bash
npm install elastic-input
# or
yarn add elastic-input
```

## Quick Start

```tsx
import { ElasticInput } from 'elastic-input';
import type { FieldConfig } from 'elastic-input';

const fields: FieldConfig[] = [
  {
    name: 'status',
    label: 'Status',
    type: 'string',
    suggestions: ['active', 'inactive', 'pending'],
    description: 'Account status',
  },
  {
    name: 'created',
    label: 'Created Date',
    type: 'date',
    description: 'When the record was created',
  },
  {
    name: 'price',
    label: 'Price',
    type: 'number',
    description: 'Item price',
  },
  {
    name: 'is_active',
    label: 'Active',
    type: 'boolean',
  },
];

function App() {
  return (
    <ElasticInput
      fields={fields}
      placeholder="Search... e.g. status:active AND price:>100"
      onSearch={(query, ast) => {
        console.log('Search:', query);
        console.log('AST:', ast);
      }}
      onChange={(query, ast) => {
        console.log('Changed:', query);
      }}
    />
  );
}
```

## Query Syntax

| Syntax | Example | Description |
|--------|---------|-------------|
| `field:value` | `status:active` | Field equals value |
| `field:"quoted value"` | `name:"John Doe"` | Quoted value with spaces |
| `field:>value` | `price:>100` | Greater than (also `>=`, `<`, `<=`) |
| `AND` / `OR` / `NOT` | `a AND b OR NOT c` | Boolean operators (case-insensitive) |
| `(...)` | `(a OR b) AND c` | Grouping with parentheses |
| `-field:value` | `-status:inactive` | Negation (shorthand for NOT) |
| `#name` | `#vip-active` | Saved search reference |
| `!partial` | `!recent` | History search reference |
| `value*` | `stat*` | Wildcard matching |
| `"phrase"` | `"error occurred"` | Bare phrase (full-text) |

Implicit AND is supported — `status:active level:ERROR` is equivalent to `status:active AND level:ERROR`.

## Props

### Required

| Prop | Type | Description |
|------|------|-------------|
| `fields` | `FieldConfig[] \| () => Promise<FieldConfig[]>` | Field definitions for autocomplete and validation |

### Optional

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSearch` | `(query, ast) => void` | — | Called on search submission |
| `onChange` | `(query, ast) => void` | — | Called on every input change |
| `onValidationChange` | `(errors) => void` | — | Called when validation errors change |
| `value` | `string` | — | Controlled input value |
| `defaultValue` | `string` | — | Initial uncontrolled value |
| `savedSearches` | `SavedSearch[] \| () => Promise<SavedSearch[]>` | — | Saved search definitions (sync or async) |
| `searchHistory` | `HistoryEntry[] \| () => Promise<HistoryEntry[]>` | — | Search history entries (sync or async) |
| `fetchSuggestions` | `(field, partial) => Promise<SuggestionItem[]>` | — | Async suggestion provider for field values |
| `colors` | `ColorConfig` | `DEFAULT_COLORS` | Syntax highlighting and UI colors |
| `styles` | `StyleConfig` | `DEFAULT_STYLES` | Structural/layout style overrides |
| `placeholder` | `string` | `"Search..."` | Placeholder text |
| `className` | `string` | — | CSS class for the outer container |
| `style` | `CSSProperties` | — | Inline styles for the outer container |
| `suggestDebounceMs` | `number` | `200` | Debounce delay for `fetchSuggestions` |
| `maxSuggestions` | `number` | `10` | Maximum suggestions shown in dropdown |
| `showSavedSearchHint` | `boolean` | `true` | Show `#saved-search` hint in dropdown |
| `showHistoryHint` | `boolean` | `true` | Show `!history` hint in dropdown |
| `inputRef` | `(api) => void` | — | Receive an imperative API handle |

## Field Configuration

```typescript
interface FieldConfig {
  name: string;          // Field identifier used in queries
  label?: string;        // Display label (used in autocomplete)
  type: FieldType;       // 'string' | 'number' | 'date' | 'boolean' | 'ip'
  suggestions?: string[];// Autocomplete values (any field type can have suggestions)
  operators?: string[];  // Allowed operators (future use)
  description?: string;  // Shown in autocomplete dropdown
}
```

### Field Types

| Type | Autocomplete | Validation | Comparison Ops |
|------|-------------|------------|----------------|
| `boolean` | Shows `true` / `false` | Must be `true` or `false` | No |
| `number` | Shows hint "Enter a number" | Must be numeric | Yes (`>`, `>=`, `<`, `<=`) |
| `date` | Opens date picker with calendar | ISO dates, relative dates (`now-7d`) | Yes |
| `ip` | Shows hint "Enter an IP address" | Valid IPv4, supports wildcards (`192.168.*`) | No |
| `string` | No default hint (use `placeholder` for custom) | No validation (anything accepted) | No |

## Imperative API

Access via `inputRef`:

```tsx
let api;

<ElasticInput
  fields={fields}
  inputRef={(ref) => { api = ref; }}
/>

// Later:
api.getValue();              // Returns current query string
api.setValue('status:active');// Sets query programmatically
api.focus();                 // Focuses the input
api.blur();                  // Blurs the input
api.getAST();                // Returns the parsed AST
api.getValidationErrors();   // Returns current validation errors
```

## Validation

Validation runs automatically on every input change. Errors appear as red wavy underlines beneath the invalid text. Hover over a squiggly to see the error message.

### Deferred Display

Errors are only shown visually after the cursor moves away from the error range, so the user isn't distracted while still typing.

### External Error Access

Use `onValidationChange` to receive errors outside the component:

```tsx
<ElasticInput
  fields={fields}
  onValidationChange={(errors) => {
    // errors: Array<{ message: string, start: number, end: number, field?: string }>
    if (errors.length > 0) {
      console.log('Validation errors:', errors);
    }
  }}
/>
```

Or use the imperative API:

```tsx
const errors = api.getValidationErrors();
```

### Custom Validators

```typescript
const fields: FieldConfig[] = [
  {
    name: 'rating',
    type: 'number',
    validate: (value) => {
      const n = Number(value);
      return (n >= 1 && n <= 5) ? null : 'Rating must be between 1 and 5';
    },
  },
  {
    name: 'phone',
    type: 'string',
    validate: (value) =>
      /^[\d\-\+\(\)\s]+$/.test(value) ? null : 'Invalid phone format',
  },
];
```

## Saved Searches

Reference saved queries with `#`:

```tsx
const savedSearches = [
  { id: '1', name: 'vip-active', query: 'status:active AND is_vip:true', description: 'All active VIPs' },
  { id: '2', name: 'high-value', query: 'deal_value:>10000', description: 'Deals over $10k' },
];

<ElasticInput
  fields={fields}
  savedSearches={savedSearches}
/>
```

Type `#` in the input to see saved search suggestions. Selecting one replaces the `#token` with the saved query text.

Supports async loading:

```tsx
<ElasticInput
  fields={fields}
  savedSearches={() => fetch('/api/saved-searches').then(r => r.json())}
/>
```

## Search History

Reference previous searches with `!`:

```tsx
const history = [
  { query: 'status:active AND deal_value:>5000', label: 'Active high-value deals' },
  { query: 'level:ERROR AND service:api-gateway', label: 'API errors' },
];

<ElasticInput
  fields={fields}
  searchHistory={history}
/>
```

Type `!` to see history suggestions. Selecting one inserts the query (wrapped in parentheses if it contains boolean operators).

## Async Suggestions

Provide dynamic suggestions for field values:

```tsx
<ElasticInput
  fields={fields}
  fetchSuggestions={async (fieldName, partial) => {
    const res = await fetch(`/api/suggest?field=${fieldName}&q=${partial}`);
    const data = await res.json();
    return data.map(item => ({
      text: item.value,
      label: item.display,
      description: item.desc,
      type: fieldName,
    }));
  }}
  suggestDebounceMs={300}
/>
```

## Keyboard Shortcuts

| Key | Context | Behavior |
|-----|---------|----------|
| Tab | Dropdown open | Accept suggestion; append space if completing a value/search/history at end of input |
| Enter | Dropdown open (field value) | Accept value and submit search |
| Enter | Dropdown open (other) | Accept suggestion without submitting |
| Enter | No dropdown | Submit search |
| Ctrl+Enter | Any | Force submit, bypassing autocomplete |
| Escape | Dropdown/picker open | Close without accepting |
| Arrow Up/Down | Dropdown open | Navigate suggestions |
| Arrow Left/Right | Any | Move cursor; suggestions update for new position |

## Theming

### Colors

```tsx
import { ElasticInput, DARK_COLORS } from 'elastic-input';
import type { ColorConfig } from 'elastic-input';

// Use the built-in dark preset
<ElasticInput fields={fields} colors={DARK_COLORS} />

// Or customize individual colors
const myColors: ColorConfig = {
  fieldName: '#0550ae',
  fieldValue: '#1a7f37',
  operator: '#cf222e',
  booleanOp: '#8250df',
  quoted: '#0a3069',
  paren: '#656d76',
  savedSearch: '#bf8700',
  historyRef: '#6639ba',
  wildcard: '#953800',
  error: '#cf222e',
  background: '#ffffff',
  text: '#1f2328',
  placeholder: '#656d76',
  cursor: '#1f2328',
  dropdownSelected: '#0969da',
  dropdownHover: '#f6f8fa',
};
```

### Structural Styles

```tsx
import { ElasticInput, DARK_STYLES } from 'elastic-input';
import type { StyleConfig } from 'elastic-input';

const myStyles: StyleConfig = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '16px',
  inputPadding: '12px 16px',
  inputBorderRadius: '12px',
  inputFocusBorderColor: '#7c3aed',
  inputFocusShadow: '0 0 0 3px rgba(124, 58, 237, 0.3)',
  dropdownBorderRadius: '12px',
  dropdownShadow: '0 12px 32px rgba(0, 0, 0, 0.2)',
};

<ElasticInput fields={fields} styles={myStyles} />
```

### Full Dark Mode

```tsx
import { DARK_COLORS, DARK_STYLES } from 'elastic-input';

<ElasticInput
  fields={fields}
  colors={DARK_COLORS}
  styles={DARK_STYLES}
/>
```

## AST Output

The `onSearch` and `onChange` callbacks receive a parsed AST alongside the raw query string. AST node types:

| Node Type | Description | Example |
|-----------|-------------|---------|
| `FieldValue` | Field:value pair | `status:active` |
| `BooleanExpr` | AND/OR expression | `a AND b` |
| `Not` | Negation | `NOT x`, `-x` |
| `Group` | Parenthesized group | `(a OR b)` |
| `BareTerm` | Unstructured text | `hello`, `"phrase"` |
| `SavedSearch` | Saved search ref | `#my-search` |
| `HistoryRef` | History ref | `!recent` |
| `Error` | Parse error | malformed input |

All nodes include `start` and `end` character offsets for mapping back to the source text.

## Advanced: Using the Parser Directly

The lexer, parser, and validator are exported for standalone use:

```typescript
import { Lexer, Parser, Validator } from 'elastic-input';
import type { FieldConfig } from 'elastic-input';

const query = 'status:active AND price:>100';

// Tokenize
const lexer = new Lexer(query);
const tokens = lexer.tokenize();

// Parse to AST
const parser = new Parser(tokens);
const ast = parser.parse();

// Validate
const fields: FieldConfig[] = [
  { name: 'status', type: 'string', suggestions: ['active', 'inactive'] },
  { name: 'price', type: 'number' },
];
const validator = new Validator(fields);
const errors = validator.validate(ast);
```

## Requirements

### Runtime (Browser)

| Browser | Minimum Version |
|---------|----------------|
| Chrome  | 85+            |
| Firefox | 103+           |
| Safari  | 16.4+          |
| Edge    | 85+ (Chromium) |

The compiled output targets **ES2018**. Uses modern Range/Selection APIs for text insertion (no deprecated `document.execCommand`).

### Build / Development

| Dependency | Minimum Version |
|------------|----------------|
| Node.js    | 18.0.0+        |
| React      | 16.8.0+ (hooks) |
| React DOM  | 16.8.0+        |

These constraints are also declared in `package.json` via `engines` and `browserslist`.

No runtime dependencies beyond React/ReactDOM.

## Development

```bash
yarn install
yarn dev          # Start demo dev server
yarn test         # Run tests
yarn test:watch   # Run tests in watch mode
yarn build        # Build library (ES + CJS)
yarn build:demo   # Build demo page
```

## License

MIT
