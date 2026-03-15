import { FieldConfig, SavedSearch, HistoryEntry, SuggestionItem, ValidateReturn } from '../src/types';

/** Warn about leading wildcards — they force full index scans in Elasticsearch. */
function warnLeadingWildcard(v: string): ValidateReturn {
  if (v.startsWith('*') || v.startsWith('?')) {
    return { message: 'Leading wildcard — query may be slow and could be queued', severity: 'warning' };
  }
  return null;
}

/** Chain validators: returns first non-null result. */
function chainValidate(...fns: ((v: string) => ValidateReturn)[]): (v: string) => ValidateReturn {
  return (v) => {
    for (const fn of fns) {
      const r = fn(v);
      if (r != null) return r;
    }
    return null;
  };
}

export const CRM_FIELDS: FieldConfig[] = [
  { name: 'name', label: 'Contact Name', type: 'string', description: 'Full name of the contact', validate: warnLeadingWildcard },
  { name: 'email', label: 'Email', type: 'string', description: 'Email address',
    validate: chainValidate(warnLeadingWildcard, (v) => {
      if (v.includes('*') || v.includes('?')) return null;
      if (!v.includes('@')) return { message: 'Not a valid email — did you mean to use a wildcard (*)?', severity: 'warning' as const };
      return null;
    }) },
  { name: 'phone', label: 'Phone', type: 'string', description: 'Phone number',
    validate: chainValidate(warnLeadingWildcard, (v) => /^[\d\-\+\(\)\s]+$/.test(v) ? null : 'Invalid phone format') },
  { name: 'status', label: 'Status', type: 'enum',
    suggestions: ['active', 'inactive', 'lead', 'prospect', 'churned'],
    description: 'Contact status', placeholder: 'Search statuses...', validate: warnLeadingWildcard },
  { name: 'company', label: 'Company', type: 'string', description: 'Company name', placeholder: 'Search companies...', asyncSearch: true, asyncSearchLabel: 'Searching companies...', validate: warnLeadingWildcard },
  { name: 'deal_value', label: 'Deal Value', type: 'number', description: 'Deal value in dollars' },
  { name: 'created', label: 'Created Date', type: 'date', description: 'When the contact was created' },
  { name: 'last_contact', label: 'Last Contact', type: 'date', description: 'Last interaction date' },
  { name: 'is_vip', label: 'VIP', type: 'boolean', description: 'Whether the contact is a VIP' },
  { name: 'tags', label: 'Tags', type: 'enum',
    suggestions: ['enterprise', 'startup', 'smb', 'partner', 'referral'],
    description: 'Contact tags', validate: warnLeadingWildcard },
];

export const LOG_FIELDS: FieldConfig[] = [
  { name: 'level', label: 'Log Level', type: 'enum',
    suggestions: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    description: 'Severity level', validate: warnLeadingWildcard },
  { name: 'service', label: 'Service', type: 'enum',
    suggestions: ['api-gateway', 'auth-service', 'user-service', 'payment-service', 'notification-service'],
    description: 'Microservice name', validate: warnLeadingWildcard },
  { name: 'message', label: 'Message', type: 'string', description: 'Log message content', validate: warnLeadingWildcard },
  { name: 'timestamp', label: 'Timestamp', type: 'date', description: 'When the log was recorded' },
  { name: 'request_id', label: 'Request ID', type: 'string', description: 'Unique request identifier', validate: warnLeadingWildcard },
  { name: 'status_code', label: 'Status Code', type: 'number', description: 'HTTP status code' },
  { name: 'duration_ms', label: 'Duration (ms)', type: 'number', description: 'Request duration' },
  { name: 'host', label: 'Host', type: 'string', description: 'Server hostname', validate: warnLeadingWildcard },
  { name: 'ip', label: 'Client IP', type: 'ip', description: 'Client IP address', validate: warnLeadingWildcard },
];

export const ECOMMERCE_FIELDS: FieldConfig[] = [
  { name: 'product', label: 'Product Name', type: 'string', description: 'Product name', validate: warnLeadingWildcard },
  { name: 'category', label: 'Category', type: 'enum',
    suggestions: ['electronics', 'clothing', 'books', 'home', 'sports', 'toys'],
    description: 'Product category', validate: warnLeadingWildcard },
  { name: 'price', label: 'Price', type: 'number', description: 'Product price' },
  { name: 'brand', label: 'Brand', type: 'string', description: 'Brand name', placeholder: 'Search brands...', asyncSearch: true, validate: warnLeadingWildcard },
  { name: 'in_stock', label: 'In Stock', type: 'boolean', description: 'Availability' },
  { name: 'rating', label: 'Rating', type: 'number', description: 'Customer rating (1-5)',
    validate: (v) => {
      const n = Number(v);
      return (n >= 1 && n <= 5) ? null : 'Rating must be between 1 and 5';
    }},
  { name: 'added_date', label: 'Added Date', type: 'date', description: 'When product was added' },
  { name: 'sku', label: 'SKU', type: 'string', description: 'Stock keeping unit', validate: warnLeadingWildcard },
];

const MOCK_COMPANIES = [
  'Acme Corp', 'Globex Inc', 'Initech', 'Hooli', 'Piedmont Partners',
  'Soylent Corp', 'Wonka Industries', 'Stark Industries', 'Wayne Enterprises',
  'Umbrella Corp', 'Cyberdyne Systems', 'Oscorp', 'LexCorp', 'Massive Dynamic',
  'Weyland-Yutani', 'Tyrell Corp', 'Aperture Science', 'Black Mesa',
];

const MOCK_BRANDS = [
  'Apple', 'Samsung', 'Sony', 'Nike', 'Adidas', 'Patagonia',
  'Bose', 'LG', 'Dell', 'HP', 'Lenovo', 'Canon', 'Dyson',
];

/** Build a lookup of all field values across all demo field configs. */
const ALL_FIELD_VALUES: Record<string, string[]> = {};
for (const field of [...CRM_FIELDS, ...LOG_FIELDS, ...ECOMMERCE_FIELDS]) {
  if (field.suggestions && !ALL_FIELD_VALUES[field.name]) {
    ALL_FIELD_VALUES[field.name] = field.suggestions;
  }
}
// Add async-only fields (no static suggestions)
ALL_FIELD_VALUES['company'] = MOCK_COMPANIES;
ALL_FIELD_VALUES['brand'] = MOCK_BRANDS;

export function mockFetchSuggestions(fieldName: string, partial: string): Promise<SuggestionItem[]> {
  const items = ALL_FIELD_VALUES[fieldName];
  if (!items) return Promise.resolve([]);

  const lower = partial.toLowerCase();
  const filtered = items
    .filter(item => item.toLowerCase().includes(lower))
    .slice(0, 8)
    .map(item => ({ text: item, description: `${fieldName} match` }));

  // Simulate network delay — longer for async-only fields, shorter for enum fields
  const delay = (fieldName === 'company' || fieldName === 'brand') ? 800 : 150;
  return new Promise(resolve => setTimeout(() => resolve(filtered), delay));
}

export const SAMPLE_SAVED_SEARCHES: SavedSearch[] = [
  { id: '1', name: 'vip-active', query: 'status:active AND is_vip:true', description: 'All active VIP contacts' },
  { id: '2', name: 'high-value', query: 'deal_value:>10000', description: 'Deals over $10k' },
  { id: '3', name: 'recent-errors', query: 'level:ERROR AND timestamp:>now-1h', description: 'Errors in last hour' },
  { id: '4', name: 'stale-leads', query: 'status:lead AND last_contact:<now-30d', description: 'Leads not contacted in 30 days' },
];

export const SAMPLE_HISTORY: HistoryEntry[] = [
  { query: 'status:active AND deal_value:>5000', timestamp: Date.now() - 3600000, label: 'Active high-value deals' },
  { query: 'level:ERROR AND service:api-gateway', timestamp: Date.now() - 7200000, label: 'API gateway errors' },
  { query: 'category:electronics AND price:<100', timestamp: Date.now() - 86400000, label: 'Cheap electronics' },
  { query: 'name:John* OR name:Jane*', timestamp: Date.now() - 172800000, label: 'J names' },
];
