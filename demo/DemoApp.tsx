import * as React from 'react';
import { ElasticInput } from '../src/components/ElasticInput';
import { ASTNode } from '../src/parser/ast';
import { CursorContext } from '../src/parser/Parser';
import { ValidationError } from '../src/validation/Validator';
import { ElasticInputAPI, FieldConfig, TabContext, TabActionResult } from '../src/types';
import { DEFAULT_COLORS, DARK_COLORS } from '../src/constants';
import {
  CRM_FIELDS, LOG_FIELDS, ECOMMERCE_FIELDS,
  SAMPLE_SAVED_SEARCHES, SAMPLE_HISTORY,
  mockFetchSuggestions, demoValidateValue,
} from './DemoConfig';
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
  const [dropdownMode, setDropdownMode] = React.useState<'always' | 'never' | 'manual'>('always');
  const [dropdownAlignToInput, setDropdownAlignToInput] = React.useState(false);
  const [showDropdownHeaders, setShowDropdownHeaders] = React.useState(false);
  const [showOperators, setShowOperators] = React.useState(true);
  const [navTrigger, setNavTrigger] = React.useState(true);
  const [navDelay, setNavDelay] = React.useState(0);

  // Feature options
  const [multiline, setMultiline] = React.useState(true);
  const [smartSelectAll, setSmartSelectAll] = React.useState(true);
  const [expandSelection, setExpandSelection] = React.useState(true);

  // Hint options
  const [showSavedSearchHint, setShowSavedSearchHint] = React.useState(true);
  const [showHistoryHint, setShowHistoryHint] = React.useState(true);

  // Limit options
  const [maxSuggestions, setMaxSuggestions] = React.useState(8);
  const [suggestDebounceMs, setSuggestDebounceMs] = React.useState(200);

  // Tab override
  const [useOnTab, setUseOnTab] = React.useState(false);
  const [tabActions, setTabActions] = React.useState<{ accept: boolean; blur: boolean; submit: boolean }>({ accept: true, blur: false, submit: false });

  const inputApiRef = React.useRef<ElasticInputAPI | null>(null);

  const theme = isDark ? darkTheme : lightTheme;
  const colors = isDark ? DARK_COLORS : DEFAULT_COLORS;
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
            onClick={() => setIsDark(d => !d)}
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
                  savedSearches={SAMPLE_SAVED_SEARCHES}
                  searchHistory={SAMPLE_HISTORY}
                  fetchSuggestions={mockFetchSuggestions}
                  maxSuggestions={maxSuggestions}
                  suggestDebounceMs={suggestDebounceMs}
                  dropdownAlignToInput={dropdownAlignToInput}
                  dropdownMode={dropdownMode}
                  dropdownTrigger={{ showOperators, onNavigation: navTrigger, navigationDelay: navDelay }}
                  validateValue={demoValidateValue}
                  renderFieldHint={renderFieldHint}
                  renderDropdownHeader={showDropdownHeaders ? renderDropdownHeader : undefined}
                  onTab={useOnTab ? handleTab : undefined}
                  multiline={multiline}
                  smartSelectAll={smartSelectAll}
                  expandSelection={expandSelection}
                  showSavedSearchHint={showSavedSearchHint}
                  showHistoryHint={showHistoryHint}
                  inputRef={api => { inputApiRef.current = api; }}
                />
              </div>
              <button
                style={styles.searchButton}
                onClick={() => handleSearch(lastQuery, lastAST)}
              >
                Search
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

          {/* Usage hints */}
          <div style={{ ...styles.card, marginTop: '24px' }}>
            <div style={styles.cardTitle}>Try These</div>
            <div style={{ fontSize: '13px', lineHeight: 1.8, color: theme.textSecondary }}>
              <div>Type a field name (e.g. "status") to see autocomplete</div>
              <div>Type "status:" to see enum value suggestions</div>
              <div>Type "created:" to open the date picker</div>
              <div>Type "xyz:hello" to see red squiggly on unknown field "xyz"</div>
              <div>Type "status:bad" then press Home or click before it to see validation squiggly</div>
              <div>Type "#" for saved searches, "!" for history</div>
              <div>Type "company:" (CRM) or "brand:" (E-Commerce) to see async suggestions with loading delay</div>
              <div>Use AND, OR, NOT, and parentheses for complex queries</div>
            </div>
          </div>
        </div>

        {/* Right: options panel */}
        {showOptions && (
          <div style={panelStyle}>
            <OptionGroup label="Dropdown" theme={theme}>
              <OptionSelect
                label="Mode"
                value={dropdownMode}
                options={[
                  { value: 'always', label: 'Always' },
                  { value: 'never', label: 'Never' },
                  { value: 'manual', label: 'Ctrl+Space' },
                ]}
                onChange={setDropdownMode}
                theme={theme}
              />
              <OptionToggle label="Full-width align" checked={dropdownAlignToInput} onChange={setDropdownAlignToInput} theme={theme} />
              <OptionToggle label="Section headers" checked={showDropdownHeaders} onChange={setShowDropdownHeaders} theme={theme} />
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
            </OptionGroup>

            <OptionGroup label="Hints" theme={theme}>
              <OptionToggle label="#saved-search hint" checked={showSavedSearchHint} onChange={setShowSavedSearchHint} theme={theme} />
              <OptionToggle label="!history hint" checked={showHistoryHint} onChange={setShowHistoryHint} theme={theme} />
            </OptionGroup>

            <OptionGroup label="Limits" theme={theme}>
              <OptionSelect
                label="Max suggestions"
                value={maxSuggestions}
                options={[
                  { value: 3, label: '3' },
                  { value: 5, label: '5' },
                  { value: 8, label: '8' },
                  { value: 10, label: '10' },
                  { value: 15, label: '15' },
                ]}
                onChange={setMaxSuggestions}
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
          </div>
        )}
      </div>
    </div>
  );
}
