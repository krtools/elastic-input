import * as React from 'react';
import { ElasticInput } from '../src/components/ElasticInput';
import { ASTNode } from '../src/parser/ast';
import { ValidationError } from '../src/validation/Validator';
import { ColorConfig, FieldConfig } from '../src/types';
import { DEFAULT_COLORS, DARK_COLORS } from '../src/constants';
import {
  CRM_FIELDS, LOG_FIELDS, ECOMMERCE_FIELDS,
  SAMPLE_SAVED_SEARCHES, SAMPLE_HISTORY,
  mockFetchSuggestions,
} from './DemoConfig';
import { lightTheme, darkTheme, getAppStyles, ThemeColors } from './styles';

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

interface DemoAppState {
  isDark: boolean;
  activeTab: TabId;
  showInspector: boolean;
  lastQuery: string;
  lastAST: ASTNode | null;
  searchResult: string;
  validationErrors: ValidationError[];
}

export class DemoApp extends React.Component<{}, DemoAppState> {
  constructor(props: {}) {
    super(props);
    this.state = {
      isDark: false,
      activeTab: 'crm',
      showInspector: false,
      lastQuery: '',
      lastAST: null,
      searchResult: '',
      validationErrors: [],
    };
  }

  private getTheme(): ThemeColors {
    return this.state.isDark ? darkTheme : lightTheme;
  }

  private getColors(): ColorConfig {
    return this.state.isDark ? DARK_COLORS : DEFAULT_COLORS;
  }

  private getActiveTab(): TabConfig {
    return TABS.find(t => t.id === this.state.activeTab) || TABS[0];
  }

  private handleSearch = (query: string, ast: ASTNode | null) => {
    this.setState({
      searchResult: query ? `Searching: ${query}` : '',
      lastQuery: query,
      lastAST: ast,
    });
  };

  private handleChange = (query: string, ast: ASTNode | null) => {
    this.setState({ lastQuery: query, lastAST: ast });
  };

  private handleValidationChange = (errors: ValidationError[]) => {
    this.setState({ validationErrors: errors });
  };

  render() {
    const { isDark, activeTab, showInspector, lastQuery, lastAST, searchResult, validationErrors } = this.state;
    const theme = this.getTheme();
    const styles = getAppStyles(theme);
    const tab = this.getActiveTab();
    const colors = this.getColors();

    return React.createElement('div', { style: styles.app },
      // Header
      React.createElement('div', { style: styles.header },
        React.createElement('div', null,
          React.createElement('div', { style: styles.title }, 'Elastic Input'),
          React.createElement('div', { style: styles.subtitle },
            'Syntax-aware smart autocomplete input for Elastic query syntax'
          ),
        ),
        React.createElement('button', {
          style: styles.themeToggle,
          onClick: () => this.setState({ isDark: !isDark }),
        }, isDark ? 'Light Mode' : 'Dark Mode'),
      ),

      // Main content
      React.createElement('div', { style: styles.main },
        // Tabs
        React.createElement('div', { style: styles.tabs },
          TABS.map(t =>
            React.createElement('button', {
              key: t.id,
              style: styles.tab(t.id === activeTab),
              onClick: () => this.setState({ activeTab: t.id, lastQuery: '', lastAST: null, searchResult: '' }),
            }, t.label)
          ),
        ),

        // Search section
        React.createElement('div', { style: styles.searchSection },
          React.createElement('div', { style: styles.searchRow },
            React.createElement('div', { style: { flex: 1 } },
              React.createElement(ElasticInput, {
                fields: tab.fields,
                colors,
                placeholder: tab.placeholder,
                onSearch: this.handleSearch,
                onChange: this.handleChange,
                onValidationChange: this.handleValidationChange,
                savedSearches: SAMPLE_SAVED_SEARCHES,
                searchHistory: SAMPLE_HISTORY,
                fetchSuggestions: mockFetchSuggestions,
                maxSuggestions: 8,
              }),
            ),
            React.createElement('button', {
              style: styles.searchButton,
              onClick: () => this.handleSearch(lastQuery, lastAST),
            }, 'Search'),
          ),
          searchResult ? React.createElement('div', { style: styles.queryResult }, searchResult) : null,
        ),

        // Inspector toggle
        React.createElement('div', { style: { marginBottom: '16px' } },
          React.createElement('button', {
            style: styles.inspectorToggle,
            onClick: () => this.setState({ showInspector: !showInspector }),
          }, showInspector ? 'Hide Inspector' : 'Show Token/AST Inspector'),
        ),

        // Inspector
        showInspector && React.createElement('div', { style: styles.inspector },
          React.createElement('div', { style: { marginBottom: '8px', fontWeight: 600 } }, 'Query:'),
          React.createElement('div', { style: { marginBottom: '12px' } }, lastQuery || '(empty)'),
          React.createElement('div', { style: { marginBottom: '8px', fontWeight: 600 } }, 'Validation Errors:'),
          React.createElement('div', { style: { marginBottom: '12px', color: validationErrors.length > 0 ? '#cf222e' : undefined } },
            validationErrors.length > 0
              ? validationErrors.map((e, i) =>
                  React.createElement('div', { key: i },
                    `[${e.start}-${e.end}] ${e.message}${e.field ? ` (field: ${e.field})` : ''}`
                  )
                )
              : '(none)'
          ),
          React.createElement('div', { style: { marginBottom: '8px', fontWeight: 600 } }, 'AST:'),
          React.createElement('div', null, lastAST ? JSON.stringify(lastAST, null, 2) : '(none)'),
        ),

        // Feature showcase
        React.createElement('div', { style: styles.featureGrid },
          ...[
            { title: 'Syntax Highlighting', desc: 'Fields, values, operators, and special tokens are color-coded in real time.' },
            { title: 'Smart Autocomplete', desc: 'Context-aware suggestions for field names, enum values, and operators.' },
            { title: 'Date Picker', desc: 'Visual calendar picker with range support for date-type fields.' },
            { title: 'Validation', desc: 'Red squiggly underlines for type mismatches, unknown fields, and custom rules.' },
            { title: 'Saved Searches (#)', desc: 'Type # to quickly access saved search shortcuts.' },
            { title: 'History (!)', desc: 'Type ! to search through previous queries.' },
            { title: 'Boolean Logic', desc: 'AND, OR, NOT operators with implicit AND between terms.' },
            { title: 'Theme Support', desc: 'Fully customizable color scheme with light and dark presets.' },
          ].map((feature, i) =>
            React.createElement('div', { key: i, style: styles.featureCard },
              React.createElement('div', { style: styles.featureTitle }, feature.title),
              React.createElement('div', { style: styles.featureDesc }, feature.desc),
            )
          ),
        ),

        // Usage hints
        React.createElement('div', { style: { ...styles.card, marginTop: '24px' } },
          React.createElement('div', { style: styles.cardTitle }, 'Try These'),
          React.createElement('div', { style: { fontSize: '13px', lineHeight: 1.8, color: theme.textSecondary } },
            React.createElement('div', null, 'Type a field name (e.g. "status") to see autocomplete'),
            React.createElement('div', null, 'Type "status:" to see enum value suggestions'),
            React.createElement('div', null, 'Type "created:" to open the date picker'),
            React.createElement('div', null, 'Type "xyz:hello" to see red squiggly on unknown field "xyz"'),
            React.createElement('div', null, 'Type "status:bad" then press Home or click before it to see validation squiggly'),
            React.createElement('div', null, 'Type "#" for saved searches, "!" for history'),
            React.createElement('div', null, 'Type "company:" (CRM) or "brand:" (E-Commerce) to see async suggestions with loading delay'),
            React.createElement('div', null, 'Use AND, OR, NOT, and parentheses for complex queries'),
          ),
        ),
      ),
    );
  }
}
