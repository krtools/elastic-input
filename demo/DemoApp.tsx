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

export function DemoApp() {
  const [isDark, setIsDark] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabId>('crm');
  const [showInspector, setShowInspector] = React.useState(false);
  const [lastQuery, setLastQuery] = React.useState('');
  const [lastAST, setLastAST] = React.useState<ASTNode | null>(null);
  const [searchResult, setSearchResult] = React.useState('');
  const [validationErrors, setValidationErrors] = React.useState<ValidationError[]>([]);
  const [dropdownAlignToInput, setDropdownAlignToInput] = React.useState(false);
  const [dropdownMode, setDropdownMode] = React.useState<'always' | 'never' | 'manual'>('always');
  const [showDropdownHeaders, setShowDropdownHeaders] = React.useState(false);
  const [tabActions, setTabActions] = React.useState<{ accept: boolean; blur: boolean; submit: boolean }>({ accept: true, blur: false, submit: false });
  const [useOnTab, setUseOnTab] = React.useState(false);
  const [showTabMenu, setShowTabMenu] = React.useState(false);
  const tabMenuRef = React.useRef<HTMLDivElement | null>(null);
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

  // Close tab menu on outside click
  React.useEffect(() => {
    if (!showTabMenu) return;
    const handler = (e: MouseEvent) => {
      if (tabMenuRef.current && !tabMenuRef.current.contains(e.target as Node)) {
        setShowTabMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTabMenu]);

  const handleTab = React.useCallback((ctx: TabContext): TabActionResult => {
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

  const switchTab = React.useCallback((id: TabId) => {
    setActiveTab(id);
    setLastQuery('');
    setLastAST(null);
    setSearchResult('');
  }, []);

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
          <select
            style={{ ...styles.themeToggle, cursor: 'pointer' }}
            value={dropdownMode}
            onChange={e => setDropdownMode(e.target.value as 'always' | 'never' | 'manual')}
          >
            <option value="always">Dropdown: Always</option>
            <option value="never">Dropdown: Never</option>
            <option value="manual">Dropdown: Ctrl+Space</option>
          </select>
          <button
            style={styles.themeToggle}
            onClick={() => setDropdownAlignToInput(d => !d)}
          >
            {dropdownAlignToInput ? 'Caret Dropdown' : 'Full-Width Dropdown'}
          </button>
          <button
            style={styles.themeToggle}
            onClick={() => setShowDropdownHeaders(d => !d)}
          >
            {showDropdownHeaders ? 'Headers: On' : 'Headers: Off'}
          </button>
          <div ref={tabMenuRef} style={{ position: 'relative' }}>
            <button
              style={{ ...styles.themeToggle, ...(useOnTab ? { borderColor: theme.accent, color: theme.accent } : {}) }}
              onClick={() => setShowTabMenu(s => !s)}
            >
              Tab: {useOnTab ? [tabActions.accept && 'Accept', tabActions.blur && 'Blur', tabActions.submit && 'Submit'].filter(Boolean).join('+') || 'None' : 'Default'}
            </button>
            {showTabMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '4px',
                backgroundColor: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: '6px',
                padding: '6px 0',
                zIndex: 1000,
                minWidth: '160px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                fontSize: '13px',
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', cursor: 'pointer', color: theme.text }}>
                  <input type="checkbox" checked={useOnTab} onChange={e => { const v = e.currentTarget.checked; setUseOnTab(v); }} />
                  Override Tab
                </label>
                <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />
                {(['accept', 'blur', 'submit'] as const).map(action => (
                  <label key={action} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', cursor: useOnTab ? 'pointer' : 'default', color: useOnTab ? theme.text : theme.textSecondary, opacity: useOnTab ? 1 : 0.5 }}>
                    <input
                      type="checkbox"
                      checked={tabActions[action]}
                      disabled={!useOnTab}
                      onChange={e => { const v = e.currentTarget.checked; setTabActions(prev => ({ ...prev, [action]: v })); }}
                    />
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            style={styles.themeToggle}
            onClick={() => setIsDark(d => !d)}
          >
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
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
                maxSuggestions={8}
                dropdownAlignToInput={dropdownAlignToInput}
                dropdownMode={dropdownMode}
                validateValue={demoValidateValue}
                renderDropdownHeader={showDropdownHeaders ? renderDropdownHeader : undefined}
                onTab={useOnTab ? handleTab : undefined}
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
    </div>
  );
}
