import * as React from 'react';
import { ElasticInput } from '../src/components/ElasticInput';
import { ASTNode } from '../src/parser/ast';
import { CursorContext } from '../src/parser/Parser';
import { ValidationError } from '../src/validation/Validator';
import { ElasticInputAPI, FieldConfig, TabContext, TabActionResult } from '../src/types';
import { DEFAULT_COLORS, DARK_COLORS } from '../src/constants';
import {
  CRM_FIELDS, LOG_FIELDS, ECOMMERCE_FIELDS,
  mockFetchSuggestions, mockFetchSavedSearches, mockFetchHistory,
  demoValidateValue,
} from './DemoConfig';
import { formatQuery } from '../src/utils/formatQuery';
import { lightTheme, darkTheme, getAppStyles } from './styles';

type TabId = 'crm' | 'logs' | 'ecommerce';

interface TabConfig {
  id: TabId;
  label: string;
  fields: FieldConfig[];
  placeholder: string;
}

const TABS: TabConfig[] = [
  { id: 'crm', label: 'CRM Search', fields: CRM_FIELDS, placeholder: 'Search contacts... e.g. status:active AND deal_value:>5000' },
  { id: 'logs', label: 'Log Explorer', fields: LOG_FIELDS, placeholder: 'Search logs... e.g. level:ERROR AND service:api-gateway' },
  { id: 'ecommerce', label: 'E-Commerce', fields: ECOMMERCE_FIELDS, placeholder: 'Search products... e.g. category:electronics AND price:<100' },
];

// --- Example queries per tab ---

interface ExampleQuery { label: string; query: string; desc: string }

// Generate a large query to demonstrate plain mode
function generateLargeQuery(): string {
  const statuses = ['active', 'lead', 'prospect', 'churned', 'inactive'];
  const tags = ['enterprise', 'smb', 'startup', 'partner', 'trial', 'premium'];
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) {
    const status = statuses[i % statuses.length];
    const tag = tags[i % tags.length];
    const value = (i + 1) * 1000;
    lines.push(`(status:${status} AND tags:${tag} AND deal_value:>${value})`);
  }
  return lines.join('\nOR ');
}

const EXAMPLE_QUERIES: Record<TabId, ExampleQuery[]> = {
  crm: [
    { label: 'status:active AND deal_value:>5000',
      query: 'status:active AND deal_value:>5000',
      desc: 'Field values with comparison operator' },
    { label: 'Multiline boolean',
      query: '(status:active OR status:lead)\nAND deal_value:[1000 TO 50000]\nAND created:>now-90d',
      desc: 'Multiline query with range and relative date' },
    { label: 'Wildcards + boost',
      query: 'name:John* OR (tags:enterprise AND company:Acme*)^2',
      desc: 'Wildcards, grouping, and boost syntax' },
    { label: 'Leading wildcard (warning)',
      query: '*corp AND status:active',
      desc: 'Leading wildcard triggers a slow-query warning' },
    { label: 'Bad email (warning)',
      query: 'email:john.doe AND status:active',
      desc: 'Email without @ triggers a format warning' },
    { label: 'Errors: unknown + type',
      query: 'status:active AND region:west AND deal_value:abc',
      desc: 'Unknown field "region" and non-numeric deal_value' },
    { label: 'Fuzzy + phrase',
      query: '"enterprise deal" AND name:Jhon~2 AND is_vip:true',
      desc: 'Exact phrase, fuzzy match, and boolean field' },
    { label: 'Saved search + NOT',
      query: '#vip-active AND NOT tags:churned',
      desc: 'Saved search reference with NOT operator' },
    { label: 'Complex multiline',
      query: '(\n  (status:active AND deal_value:>10000)\n  OR (status:lead AND tags:enterprise)\n)\nAND created:[2024-01-01 TO 2024-12-31]\nAND NOT company:"Umbrella Corp"',
      desc: 'Nested groups, ranges, NOT, and quoted phrase on multiple lines' },
    { label: 'Regex',
      query: 'name:/[Jj]oh?n(athan)?/ AND status:(active OR lead)',
      desc: 'Regex pattern with field group' },
    { label: 'Age validation',
      query: 'age:abc AND status:active',
      desc: 'Invalid age format triggers custom validation' },
    { label: 'Plain mode (large query)',
      query: generateLargeQuery(),
      desc: 'Exceeds plainModeLength — highlighting and autocomplete disabled' },
  ],
  logs: [
    { label: 'level:ERROR AND service:api-gateway',
      query: 'level:ERROR AND service:api-gateway',
      desc: 'Basic field value filtering' },
    { label: 'Multiline log search',
      query: '(level:ERROR OR level:FATAL)\nAND service:(api-gateway OR auth-service)\nAND timestamp:>now-1h',
      desc: 'Multi-service error search with recency filter' },
    { label: 'Status codes + duration',
      query: 'status_code:[500 TO 599] AND duration_ms:>2000',
      desc: 'Range for 5xx errors with slow response filter' },
    { label: 'IP + wildcard',
      query: 'ip:192.168.* AND level:WARN AND NOT service:notification-service',
      desc: 'IP wildcard with NOT exclusion' },
    { label: 'Errors: bad IP + type',
      query: 'ip:not-an-ip AND status_code:fast AND fakefield:x',
      desc: 'Invalid IP, non-numeric status_code, unknown field' },
    { label: 'Regex request ID',
      query: 'request_id:/req-[a-f0-9]{8}/ AND level:ERROR',
      desc: 'Regex pattern matching request IDs' },
    { label: 'Complex multiline',
      query: '(\n  level:(ERROR OR FATAL)\n  AND status_code:>=500\n  AND duration_ms:>1000\n)\nOR (\n  message:"connection refused"\n  AND service:payment-service\n)\nAND timestamp:[2024-06-01 TO 2024-06-30]',
      desc: 'Complex OR of two condition groups with date range' },
    { label: 'Leading wildcard (warning)',
      query: '*timeout* AND level:ERROR',
      desc: 'Leading wildcard triggers slow-query warning' },
  ],
  ecommerce: [
    { label: 'category:electronics AND price:<100',
      query: 'category:electronics AND price:<100',
      desc: 'Category filter with price comparison' },
    { label: 'Multiline product search',
      query: 'category:(electronics OR books)\nAND price:[10 TO 200]\nAND in_stock:true\nAND rating:>=4',
      desc: 'Multi-category with price range and availability' },
    { label: 'Boost + fuzzy',
      query: '(category:electronics)^3 OR product:headphone~ AND in_stock:true',
      desc: 'Category boost with fuzzy product match' },
    { label: 'Errors: bad rating + unknown',
      query: 'rating:99 AND color:red AND price:cheap',
      desc: 'Rating out of range, unknown field, non-numeric price' },
    { label: 'Regex SKU',
      query: 'sku:/[A-Z]{3}-\\d{4}/ AND in_stock:true',
      desc: 'Regex SKU pattern with availability filter' },
    { label: 'Wildcard brand',
      query: 'brand:Sam* AND price:[100 TO 500] AND NOT category:clothing',
      desc: 'Brand wildcard with range and NOT' },
    { label: 'Complex multiline',
      query: '(\n  (category:electronics AND price:<500 AND rating:>=4)\n  OR (category:books AND price:<30)\n)\nAND in_stock:true\nAND added_date:>now-30d\nAND NOT product:"refurbished"',
      desc: 'Nested OR groups with date, NOT, and phrase exclusion' },
    { label: 'Leading wildcard (warning)',
      query: '*phone* AND category:electronics',
      desc: 'Leading wildcard triggers slow-query warning' },
  ],
};

// --- Options panel helpers ---

function OptionToggle({ label, checked, onChange, theme }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; theme: any;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: theme.text }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.currentTarget.checked)} />
      {label}
    </label>
  );
}

function OptionSelect<T extends string | number>({ label, value, options, onChange, theme }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; theme: any;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.text }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <select
        style={{
          flex: 1,
          padding: '3px 6px',
          border: `1px solid ${theme.border}`,
          borderRadius: '4px',
          backgroundColor: theme.surface,
          color: theme.text,
          fontSize: '12px',
          cursor: 'pointer',
        }}
        value={value}
        onChange={e => {
          const raw = e.target.value;
          onChange((typeof value === 'number' ? Number(raw) : raw) as T);
        }}
      >
        {options.map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function OptionNumber({ label, value, onChange, min, max, theme }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; theme: any;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.text }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <input
        type="number"
        style={{
          width: '60px',
          padding: '3px 6px',
          border: `1px solid ${theme.border}`,
          borderRadius: '4px',
          backgroundColor: theme.surface,
          color: theme.text,
          fontSize: '12px',
        }}
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(n);
        }}
      />
    </label>
  );
}

function OptionColor({ label, value, onChange, theme }: {
  label: string; value: string; onChange: (v: string) => void; theme: any;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.text }}>
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '24px', height: '20px', padding: 0, border: `1px solid ${theme.border}`, borderRadius: '3px', cursor: 'pointer', backgroundColor: 'transparent' }}
      />
      <span>{label}</span>
    </label>
  );
}

function OptionGroup({ label, children, theme }: { label: string; children: React.ReactNode; theme: any }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: theme.textSecondary, marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '5px' }}>
        {children}
      </div>
    </div>
  );
}

// --- Main component ---

export function DemoApp() {
  const [isDark, setIsDark] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabId>('crm');
  const [showInspector, setShowInspector] = React.useState(false);
  const [showOptions, setShowOptions] = React.useState(true);
  const [lastQuery, setLastQuery] = React.useState('');
  const [lastAST, setLastAST] = React.useState<ASTNode | null>(null);
  const [searchResult, setSearchResult] = React.useState('');
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);

  // Dropdown options
  const [dropdownOpen, setDropdownOpen] = React.useState<'always' | 'never' | 'manual' | 'input'>('input');
  const [dropdownAlignToInput, setDropdownAlignToInput] = React.useState(false);
  const [showDropdownHeaders, setShowDropdownHeaders] = React.useState(false);
  const [showOperators, setShowOperators] = React.useState(false);
  const [navTrigger, setNavTrigger] = React.useState(true);
  const [navDelay, setNavDelay] = React.useState(0);

  // Feature options
  const [multiline, setMultiline] = React.useState(true);
  const [smartSelectAll, setSmartSelectAll] = React.useState(true);
  const [expandSelection, setExpandSelection] = React.useState(true);
  const [wildcardWrap, setWildcardWrap] = React.useState(true);
  const [savedSearchesEnabled, setSavedSearchesEnabled] = React.useState(true);
  const [historySearchEnabled, setHistorySearchEnabled] = React.useState(true);

  // Selection options
  const [autoSelect, setAutoSelect] = React.useState(false);
  const [homeEndKeys, setHomeEndKeys] = React.useState(false);

  // Hint options
  const [showSavedSearchHint, setShowSavedSearchHint] = React.useState(true);
  const [showHistoryHint, setShowHistoryHint] = React.useState(true);

  // Limit options
  const [maxSuggestions, setMaxSuggestions] = React.useState(8);
  const [suggestDebounceMs, setSuggestDebounceMs] = React.useState(200);

  // Value type colors
  const [vtString, setVtString] = React.useState(isDark ? '#a5d6ff' : '#0550ae');
  const [vtNumber, setVtNumber] = React.useState(isDark ? '#79c0ff' : '#0a3069');
  const [vtDate, setVtDate] = React.useState(isDark ? '#d2a8ff' : '#8250df');
  const [vtBoolean, setVtBoolean] = React.useState(isDark ? '#ff7b72' : '#cf222e');
  const [vtIp, setVtIp] = React.useState(isDark ? '#7ee787' : '#116329');

  // No-results message
  const [showNoResults, setShowNoResults] = React.useState(false);

  // Tab override
  const [useOnTab, setUseOnTab] = React.useState(false);
  const [tabActions, setTabActions] = React.useState<{ accept: boolean; blur: boolean; submit: boolean }>({ accept: true, blur: false, submit: false });

  const inputApiRef = React.useRef<ElasticInputAPI | null>(null);

  const theme = isDark ? darkTheme : lightTheme;
  const colors = {
    ...(isDark ? DARK_COLORS : DEFAULT_COLORS),
    valueTypes: { string: vtString, number: vtNumber, date: vtDate, boolean: vtBoolean, ip: vtIp },
  };
  const styles = getAppStyles(theme);
  const tab = TABS.find(t => t.id === activeTab) || TABS[0];

  const handleSearch = React.useCallback((query: string, ast: ASTNode | null) => {
    setSearchResult(query ? `Searching: ${query}` : '');
    setLastQuery(query);
    setLastAST(ast);
  }, []);

  const handleChange = React.useCallback((query: string, ast: ASTNode | null) => {
    setLastQuery(query);
    setLastAST(ast);
  }, []);

  const handleTab = React.useCallback((ctx: TabContext): TabActionResult => {
    if (ctx.suggestion) return { accept: true };
    return { accept: tabActions.accept, blur: tabActions.blur, submit: tabActions.submit };
  }, [tabActions]);

  const renderDropdownHeader = React.useCallback((ctx: CursorContext) => {
    switch (ctx.type) {
      case 'FIELD_NAME': return 'Filter by field';
      case 'FIELD_VALUE': return ctx.fieldName ? `Values for ${ctx.fieldName}` : 'Enter a value';
      case 'OPERATOR': return 'Operators & fields';
      case 'SAVED_SEARCH': return 'Insert saved search';
      case 'HISTORY_REF': return 'Insert query from history';
      default: return null;
    }
  }, []);

  const renderFieldHint = React.useCallback((field: FieldConfig, partial: string) => {
    if (field.name === 'age') {
      return React.createElement('div', { style: { padding: '4px 0' } },
        React.createElement('div', { style: { fontWeight: 700, fontSize: '14px', marginBottom: '4px' } }, 'Entering Ages'),
        React.createElement('div', { style: { fontSize: '12px', lineHeight: 1.5, opacity: 0.85 } },
          'Ages are date-of-birth queries where the value represents years since today. ',
          'Enter a single age (e.g. 30) or a range like 21-26 to match contacts whose age falls within that span.',
        ),
      );
    }
    return null;
  }, []);

  const renderNoResults = React.useCallback((ctx: { cursorContext: { type: string; fieldName?: string; partial: string }; partial: string }) => {
    if (ctx.cursorContext.type === 'FIELD_VALUE' && ctx.cursorContext.fieldName) {
      return React.createElement('span', { style: { fontStyle: 'italic', fontSize: '13px' } },
        `No values matching "${ctx.partial}" for ${ctx.cursorContext.fieldName}`
      );
    }
    if (ctx.cursorContext.type === 'FIELD_NAME' && ctx.partial) {
      return React.createElement('span', { style: { fontStyle: 'italic', fontSize: '13px' } },
        `No fields matching "${ctx.partial}"`
      );
    }
    return null;
  }, []);

  const switchTab = React.useCallback((id: TabId) => {
    setActiveTab(id);
    setLastQuery('');
    setLastAST(null);
    setSearchResult('');
  }, []);

  const panelStyle: React.CSSProperties = {
    width: '220px',
    flexShrink: 0,
    backgroundColor: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    padding: '14px',
    alignSelf: 'flex-start',
    position: 'sticky',
    top: '16px',
  };

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Elastic Input</div>
          <div style={styles.subtitle}>
            Syntax-aware smart autocomplete input for Elastic query syntax
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            style={styles.themeToggle}
            onClick={() => setShowOptions(s => !s)}
          >
            {showOptions ? 'Hide Options' : 'Show Options'}
          </button>
          <button
            style={styles.themeToggle}
            onClick={() => {
              setIsDark(d => {
                const dark = !d;
                setVtString(dark ? '#a5d6ff' : '#0550ae');
                setVtNumber(dark ? '#79c0ff' : '#0a3069');
                setVtDate(dark ? '#d2a8ff' : '#8250df');
                setVtBoolean(dark ? '#ff7b72' : '#cf222e');
                setVtIp(dark ? '#7ee787' : '#116329');
                return dark;
              });
            }}
          >
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </div>

      {/* Main content — two-column when options visible */}
      <div style={{ maxWidth: '1140px', margin: '0 auto', padding: '32px 24px', display: 'flex', gap: '24px' }}>
        {/* Left: main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tabs */}
          <div style={styles.tabs}>
            {TABS.map(t => (
              <button
                key={t.id}
                style={styles.tab(t.id === activeTab)}
                onClick={() => switchTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search section */}
          <div style={styles.searchSection}>
            <div style={styles.searchRow}>
              <div style={{ flex: 1 }}>
                <ElasticInput
                  fields={tab.fields}
                  colors={colors}
                  placeholder={tab.placeholder}
                  onSearch={handleSearch}
                  onChange={handleChange}
                  onValidationChange={setValidationErrors}
                  savedSearches={mockFetchSavedSearches}
                  searchHistory={mockFetchHistory}
                  fetchSuggestions={mockFetchSuggestions}
                  dropdown={{
                    open: dropdownOpen,
                    alignToInput: dropdownAlignToInput,
                    autoSelect,
                    homeEndKeys,
                    maxSuggestions,
                    suggestDebounceMs,
                    showSavedSearchHint,
                    showHistoryHint,
                    showOperators,
                    onNavigation: navTrigger,
                    navigationDelay: navDelay,
                    renderFieldHint,
                    renderHeader: showDropdownHeaders ? renderDropdownHeader : undefined,
                    renderNoResults: showNoResults ? renderNoResults : undefined,
                  }}
                  features={{
                    multiline,
                    smartSelectAll,
                    expandSelection,
                    wildcardWrap,
                    savedSearches: savedSearchesEnabled,
                    historySearch: historySearchEnabled,
                  }}
                  validateValue={demoValidateValue}
                  onTab={useOnTab ? handleTab : undefined}
                  inputRef={api => { inputApiRef.current = api; }}
                  plainModeLength={2000}
                />
              </div>
              <button
                style={styles.searchButton}
                onClick={() => handleSearch(lastQuery, lastAST)}
              >
                Search
              </button>
              <button
                style={{ ...styles.searchButton, backgroundColor: theme.textSecondary }}
                onClick={() => {
                  const api = inputApiRef.current;
                  if (!api) return;
                  const formatted = formatQuery(api.getValue());
                  api.setValue(formatted);
                }}
              >
                Format
              </button>
            </div>
            {searchResult && <div style={styles.queryResult}>{searchResult}</div>}
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div style={{
              marginBottom: '12px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              fontSize: '12px',
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: theme.text }}>
                Errors ({validationErrors.length})
              </div>
              {validationErrors.map((e, i) => (
                <div
                  key={i}
                  style={{ color: e.severity === 'warning' ? '#d4a72c' : '#cf222e', cursor: 'pointer', borderRadius: '3px', padding: '1px 4px', margin: '0 -4px' }}
                  onClick={() => inputApiRef.current?.setSelection(e.start, e.end)}
                  onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.backgroundColor = theme.border; }}
                  onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                >
                  {e.severity === 'warning' ? '\u26a0' : '\u2716'}{' '}
                  <span style={{ color: theme.textSecondary, fontFamily: 'monospace' }}>[{e.start}:{e.end}]</span>{' '}
                  {e.message}
                  {e.field ? <span style={{ color: theme.textSecondary }}> ({e.field})</span> : null}
                </div>
              ))}
            </div>
          )}

          {/* Inspector toggle */}
          <div style={{ marginBottom: '16px' }}>
            <button
              style={styles.inspectorToggle}
              onClick={() => setShowInspector(s => !s)}
            >
              {showInspector ? 'Hide Inspector' : 'Show Token/AST Inspector'}
            </button>
          </div>

          {/* Inspector */}
          {showInspector && (
            <div style={styles.inspector}>
              <div style={{ marginBottom: '8px', fontWeight: 600 }}>Query:</div>
              <div style={{ marginBottom: '12px' }}>{lastQuery || '(empty)'}</div>
              <div style={{ marginBottom: '8px', fontWeight: 600 }}>Validation Errors:</div>
              <div style={{ marginBottom: '12px', color: validationErrors.length > 0 ? '#cf222e' : undefined }}>
                {validationErrors.length > 0
                  ? validationErrors.map((e, i) => (
                      <div key={i}>
                        {`[${e.start}-${e.end}] ${e.message}${e.field ? ` (field: ${e.field})` : ''}`}
                      </div>
                    ))
                  : '(none)'}
              </div>
              <div style={{ marginBottom: '8px', fontWeight: 600 }}>AST:</div>
              <div>{lastAST ? JSON.stringify(lastAST, null, 2) : '(none)'}</div>
            </div>
          )}

          {/* Feature showcase */}
          <div style={styles.featureGrid}>
            {[
              { title: 'Syntax Highlighting', desc: 'Fields, values, operators, and special tokens are color-coded in real time.' },
              { title: 'Smart Autocomplete', desc: 'Context-aware suggestions for field names, enum values, and operators.' },
              { title: 'Date Picker', desc: 'Visual calendar picker with range support for date-type fields.' },
              { title: 'Validation', desc: 'Red squiggly underlines for type mismatches, unknown fields, and custom rules.' },
              { title: 'Saved Searches (#)', desc: 'Type # to quickly access saved search shortcuts.' },
              { title: 'History (!)', desc: 'Type ! to search through previous queries.' },
              { title: 'Boolean Logic', desc: 'AND, OR, NOT operators with implicit AND between terms.' },
              { title: 'Theme Support', desc: 'Fully customizable color scheme with light and dark presets.' },
            ].map((feature, i) => (
              <div key={i} style={styles.featureCard}>
                <div style={styles.featureTitle}>{feature.title}</div>
                <div style={styles.featureDesc}>{feature.desc}</div>
              </div>
            ))}
          </div>

          {/* Example queries */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={styles.cardTitle}>Examples</div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '6px' }}>
              {(EXAMPLE_QUERIES[activeTab] || []).map((ex, i) => (
                <button
                  key={i}
                  title={ex.desc}
                  onClick={() => inputApiRef.current?.setValue(ex.query)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre' as const,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '4px',
                    backgroundColor: theme.surface,
                    color: theme.text,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={ev => { (ev.currentTarget as HTMLElement).style.backgroundColor = theme.border; }}
                  onMouseLeave={ev => { (ev.currentTarget as HTMLElement).style.backgroundColor = theme.surface; }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: options panel */}
        {showOptions && (
          <div style={panelStyle}>
            <OptionGroup label="Dropdown" theme={theme}>
              <OptionSelect
                label="Open"
                value={dropdownOpen}
                options={[
                  { value: 'always', label: 'Always' },
                  { value: 'input', label: 'On Input' },
                  { value: 'never', label: 'Never' },
                  { value: 'manual', label: 'Ctrl+Space' },
                ]}
                onChange={setDropdownOpen}
                theme={theme}
              />
              <OptionToggle label="Full-width align" checked={dropdownAlignToInput} onChange={setDropdownAlignToInput} theme={theme} />
              <OptionToggle label="Section headers" checked={showDropdownHeaders} onChange={setShowDropdownHeaders} theme={theme} />
              <OptionToggle label="No results message" checked={showNoResults} onChange={setShowNoResults} theme={theme} />
              <OptionToggle label="Auto-select first" checked={autoSelect} onChange={setAutoSelect} theme={theme} />
              <OptionToggle label="Home/End keys" checked={homeEndKeys} onChange={setHomeEndKeys} theme={theme} />
              <OptionToggle label="Operator suggestions" checked={showOperators} onChange={setShowOperators} theme={theme} />
              <OptionToggle label="Show on navigation" checked={navTrigger} onChange={setNavTrigger} theme={theme} />
              <OptionSelect
                label="Nav delay"
                value={navDelay}
                options={[
                  { value: 0, label: '0ms' },
                  { value: 200, label: '200ms' },
                  { value: 500, label: '500ms' },
                ]}
                onChange={setNavDelay}
                theme={theme}
              />
            </OptionGroup>

            <OptionGroup label="Features" theme={theme}>
              <OptionToggle label="Multiline" checked={multiline} onChange={setMultiline} theme={theme} />
              <OptionToggle label="Smart Ctrl+A" checked={smartSelectAll} onChange={setSmartSelectAll} theme={theme} />
              <OptionToggle label="Expand selection" checked={expandSelection} onChange={setExpandSelection} theme={theme} />
              <OptionToggle label="Wildcard wrap (*)" checked={wildcardWrap} onChange={setWildcardWrap} theme={theme} />
              <OptionToggle label="#saved-search syntax" checked={savedSearchesEnabled} onChange={setSavedSearchesEnabled} theme={theme} />
              <OptionToggle label="!history syntax" checked={historySearchEnabled} onChange={setHistorySearchEnabled} theme={theme} />
            </OptionGroup>

            <OptionGroup label="Hints" theme={theme}>
              <OptionToggle label="#saved-search hint" checked={showSavedSearchHint} onChange={setShowSavedSearchHint} theme={theme} />
              <OptionToggle label="!history hint" checked={showHistoryHint} onChange={setShowHistoryHint} theme={theme} />
            </OptionGroup>

            <OptionGroup label="Limits" theme={theme}>
              <OptionNumber
                label="Max suggestions"
                value={maxSuggestions}
                onChange={setMaxSuggestions}
                min={1}
                max={100}
                theme={theme}
              />
              <OptionSelect
                label="Async debounce"
                value={suggestDebounceMs}
                options={[
                  { value: 0, label: '0ms' },
                  { value: 100, label: '100ms' },
                  { value: 200, label: '200ms' },
                  { value: 500, label: '500ms' },
                ]}
                onChange={setSuggestDebounceMs}
                theme={theme}
              />
            </OptionGroup>

            <OptionGroup label="Tab Key" theme={theme}>
              <OptionToggle label="Override Tab" checked={useOnTab} onChange={setUseOnTab} theme={theme} />
              {useOnTab && (
                <div style={{ paddingLeft: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {(['accept', 'blur', 'submit'] as const).map(action => (
                    <OptionToggle
                      key={action}
                      label={action.charAt(0).toUpperCase() + action.slice(1)}
                      checked={tabActions[action]}
                      onChange={v => setTabActions(prev => ({ ...prev, [action]: v }))}
                      theme={theme}
                    />
                  ))}
                </div>
              )}
            </OptionGroup>

            <OptionGroup label="Value Type Colors" theme={theme}>
              <OptionColor label="string" value={vtString} onChange={setVtString} theme={theme} />
              <OptionColor label="number" value={vtNumber} onChange={setVtNumber} theme={theme} />
              <OptionColor label="date" value={vtDate} onChange={setVtDate} theme={theme} />
              <OptionColor label="boolean" value={vtBoolean} onChange={setVtBoolean} theme={theme} />
              <OptionColor label="ip" value={vtIp} onChange={setVtIp} theme={theme} />
            </OptionGroup>
          </div>
        )}
      </div>
    </div>
  );
}
