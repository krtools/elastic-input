/**
 * Debug utility: dump tokens, cursor context, replacement range, and suggestions
 * for a given query string and cursor offset.
 *
 * Usage:
 *   npx tsx scripts/debug-query.ts "created:[2024-01-01 TO 2024-12-31]" 8
 *   npx tsx scripts/debug-query.ts "status:active AND name:jo"
 *   npx tsx scripts/debug-query.ts "status:active" --all
 *
 * If cursor offset is omitted, defaults to end of string.
 * Use --all to dump context at every offset (0..length).
 * Use --fields crm|logs|ecom to pick a field set (default: crm).
 */

import { Lexer } from '../src/lexer/Lexer';
import { Parser } from '../src/parser/Parser';
import { AutocompleteEngine } from '../src/autocomplete/AutocompleteEngine';
import { CRM_FIELDS, LOG_FIELDS, ECOMMERCE_FIELDS } from '../demo/DemoConfig';
import { FieldConfig } from '../src/types';

const FIELD_SETS: Record<string, FieldConfig[]> = {
  crm: CRM_FIELDS,
  logs: LOG_FIELDS,
  ecom: ECOMMERCE_FIELDS,
};

// --- Parse CLI args ---
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));

const input = positional[0];
if (input == null) {
  console.error('Usage: npx tsx scripts/debug-query.ts "<query>" [cursor_offset] [--all] [--fields crm|logs|ecom]');
  process.exit(1);
}

const allOffsets = flags.has('--all');
const fieldsIdx = args.indexOf('--fields');
const fieldSetName = fieldsIdx >= 0 ? args[fieldsIdx + 1] ?? 'crm' : 'crm';
const fields = FIELD_SETS[fieldSetName] ?? CRM_FIELDS;

// --- Helpers ---
function visualCursor(str: string, offset: number): string {
  return str.slice(0, offset) + '|' + str.slice(offset);
}

function dumpAtOffset(input: string, offset: number, engine: AutocompleteEngine, compact: boolean = false) {
  const tokens = new Lexer(input).tokenize();
  const result = engine.getSuggestions(tokens, offset);
  const ctx = result.context;

  if (compact) {
    const sugs = result.suggestions.filter(s => s.type !== 'hint' && s.type !== 'loading');
    const sugStr = sugs.length > 0
      ? sugs.slice(0, 5).map(s => s.text).join(', ') + (sugs.length > 5 ? ` (+${sugs.length - 5})` : '')
      : '(none)';
    console.log(
      `  offset=${String(offset).padStart(2)} │ ${visualCursor(input, offset).padEnd(input.length + 3)} │ ` +
      `${ctx.type.padEnd(12)} partial=${JSON.stringify(ctx.partial).padEnd(14)} field=${(ctx.fieldName || '-').padEnd(10)} │ ` +
      `sugs: ${sugStr}${result.showDatePicker ? ' [DATE PICKER]' : ''}`
    );
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  Query:  ${JSON.stringify(input)}`);
  console.log(`  Cursor: ${visualCursor(input, offset)}  (offset ${offset})`);
  console.log(`${'='.repeat(70)}`);

  // Tokens
  console.log('\n  TOKENS:');
  for (const t of tokens) {
    const marker = (offset >= t.start && offset <= t.end) ? ' ◄── cursor' : '';
    console.log(`    ${t.type.padEnd(16)} ${JSON.stringify(t.value).padEnd(24)} [${t.start}, ${t.end})${marker}`);
  }

  // Cursor context
  console.log('\n  CURSOR CONTEXT:');
  console.log(`    type:      ${ctx.type}`);
  console.log(`    partial:   ${JSON.stringify(ctx.partial)}`);
  console.log(`    fieldName: ${JSON.stringify(ctx.fieldName || '')}`);
  if (ctx.token) {
    console.log(`    token:     ${ctx.token.type} ${JSON.stringify(ctx.token.value)} [${ctx.token.start}, ${ctx.token.end})`);
  } else {
    console.log(`    token:     (none)`);
  }

  // Suggestions
  const sugs = result.suggestions;
  console.log(`\n  SUGGESTIONS: (${sugs.length} total)${result.showDatePicker ? '  [DATE PICKER]' : ''}`);
  for (const s of sugs.slice(0, 15)) {
    const range = `[${s.replaceStart}, ${s.replaceEnd})`;
    console.log(`    ${s.type.padEnd(10)} ${JSON.stringify(s.text).padEnd(24)} replace=${range}`);
  }
  if (sugs.length > 15) console.log(`    ... +${sugs.length - 15} more`);
  if (sugs.length === 0) console.log(`    (none)`);
}

// --- Main ---
const engine = new AutocompleteEngine(fields);

if (allOffsets) {
  console.log(`\n  Query: ${JSON.stringify(input)}  (fields: ${fieldSetName})\n`);

  // Print token table first
  const tokens = new Lexer(input).tokenize();
  console.log('  TOKENS:');
  for (const t of tokens) {
    console.log(`    ${t.type.padEnd(16)} ${JSON.stringify(t.value).padEnd(24)} [${t.start}, ${t.end})`);
  }
  console.log('');

  for (let i = 0; i <= input.length; i++) {
    dumpAtOffset(input, i, engine, true);
  }
} else {
  const offset = positional[1] != null ? parseInt(positional[1], 10) : input.length;
  if (isNaN(offset) || offset < 0 || offset > input.length) {
    console.error(`Invalid offset: ${positional[1]} (must be 0..${input.length})`);
    process.exit(1);
  }
  dumpAtOffset(input, offset, engine);
}
