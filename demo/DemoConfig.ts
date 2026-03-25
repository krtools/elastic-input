import { FieldConfig, SavedSearch, HistoryEntry, SuggestionItem, ValidateValueContext, ValidateReturn } from '../src/types';

export const CRM_FIELDS: FieldConfig[] = [
  { name: 'name', label: 'Contact Name', type: 'string', description: 'Full name of the contact' },
  { name: 'email', label: 'Email', type: 'string', description: 'Email address' },
  { name: 'phone', label: 'Phone', type: 'string', description: 'Phone number' },
  { name: 'status', label: 'Status', type: 'string', description: 'Contact status', placeholder: 'Search statuses...' },
  { name: 'company', label: 'Company', type: 'string', description: 'Company name', placeholder: 'Search companies...' },
  { name: 'deal_value', label: 'Deal Value', type: 'number', description: 'Deal value in dollars' },
  { name: 'created', label: 'Created Date', type: 'date', description: 'When the contact was created' },
  { name: 'last_contact', label: 'Last Contact', type: 'date', description: 'Last interaction date' },
  { name: 'is_vip', label: 'VIP', type: 'boolean', description: 'Whether the contact is a VIP' },
  { name: 'tags', label: 'Tags', type: 'string', description: 'Contact tags' },
  { name: 'age', label: 'Age', type: 'string', description: 'Contact age (years since DOB)', placeholder: false },
  { name: 'broken', label: 'Broken Field', type: 'string', description: 'Always fails (async error demo)' },
];

export const LOG_FIELDS: FieldConfig[] = [
  { name: 'level', label: 'Log Level', type: 'string', description: 'Severity level' },
  { name: 'service', label: 'Service', type: 'string', description: 'Microservice name' },
  { name: 'message', label: 'Message', type: 'string', description: 'Log message content' },
  { name: 'timestamp', label: 'Timestamp', type: 'date', description: 'When the log was recorded' },
  { name: 'request_id', label: 'Request ID', type: 'string', description: 'Unique request identifier' },
  { name: 'status_code', label: 'Status Code', type: 'number', description: 'HTTP status code' },
  { name: 'duration_ms', label: 'Duration (ms)', type: 'number', description: 'Request duration' },
  { name: 'host', label: 'Host', type: 'string', description: 'Server hostname' },
  { name: 'ip', label: 'Client IP', type: 'ip', description: 'Client IP address' },
];

export const ECOMMERCE_FIELDS: FieldConfig[] = [
  { name: 'product', label: 'Product Name', type: 'string', description: 'Product name' },
  { name: 'category', label: 'Category', type: 'string', description: 'Product category' },
  { name: 'price', label: 'Price', type: 'number', description: 'Product price' },
  { name: 'brand', label: 'Brand', type: 'string', description: 'Brand name', placeholder: 'Search brands...' },
  { name: 'in_stock', label: 'In Stock', type: 'boolean', description: 'Availability' },
  { name: 'rating', label: 'Rating', type: 'number', description: 'Customer rating (1-5)' },
  { name: 'added_date', label: 'Added Date', type: 'date', description: 'When product was added' },
  { name: 'sku', label: 'SKU', type: 'string', description: 'Stock keeping unit' },
];

/** Top-level demo validator — handles all custom validation in one place. */
export function demoValidateValue(ctx: ValidateValueContext): ValidateReturn {
  // Leading wildcard warning (applies to all non-phrase values)
  if (!ctx.quoted && (ctx.value.startsWith('*') || ctx.value.startsWith('?'))) {
    return { message: 'Leading wildcard — query may be slow and could be queued', severity: 'warning' };
  }

  // Wildcard values bypass all further validation
  if (!ctx.quoted && (ctx.value.includes('*') || ctx.value.includes('?'))) {
    return null;
  }

  // Email-specific warnings
  if (ctx.fieldName === 'email') {
    if (!ctx.value.includes('*') && !ctx.value.includes('?') && !ctx.value.includes('@')) {
      return { message: 'Not a valid email — did you mean to use a wildcard (*)?', severity: 'warning' as const };
    }
  }

  // Phone format validation
  if (ctx.fieldName === 'phone') {
    if (!/^[\d\-\+\(\)\s]+$/.test(ctx.value)) {
      return 'Invalid phone format';
    }
  }

  // Age format: single number, range (21-27), or comma-separated (21,24,23-29)
  if (ctx.fieldName === 'age' && ctx.position === 'field_value') {
    if (!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(ctx.value)) {
      return 'Expected age, range (21-27), or list (21,24,23-29)';
    }
  }

  // Rating range check
  if (ctx.fieldName === 'rating' && (ctx.position === 'field_value' || ctx.position === 'field_group_term')) {
    const n = Number(ctx.value);
    if (!(n >= 1 && n <= 5)) {
      return 'Rating must be between 1 and 5';
    }
  }

  return null;
}

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

// Large dataset for testing async suggestions with many results
const MOCK_SKUS = Array.from({ length: 500 }, (_, i) => `SKU-${String(i + 1).padStart(5, '0')}`);

/** Lookup of all field values for the mock fetch callback. */
const ALL_FIELD_VALUES: Record<string, string[]> = {
  status: ['active', 'inactive', 'lead', 'prospect', 'churned'],
  tags: ['enterprise', 'startup', 'smb', 'partner', 'referral'],
  level: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
  service: ['api-gateway', 'auth-service', 'user-service', 'payment-service', 'notification-service'],
  category: ['electronics', 'clothing', 'books', 'home', 'sports', 'toys'],
  company: MOCK_COMPANIES,
  brand: MOCK_BRANDS,
  sku: MOCK_SKUS,
};

export function mockFetchSuggestions(fieldName: string, partial: string): Promise<SuggestionItem[]> {
  // Simulate a broken endpoint for the "broken" demo field
  if (fieldName === 'broken') {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('Service unavailable')), 300));
  }

  const items = ALL_FIELD_VALUES[fieldName];
  if (!items) return Promise.resolve([]);

  const lower = partial.toLowerCase();
  const filtered = items
    .filter(item => item.toLowerCase().includes(lower))
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
  { query: '(status:lead OR status:prospect) AND company:Acme*', timestamp: Date.now() - 259200000, label: 'Acme leads/prospects' },
  { query: '-(is_vip:true AND status:churned)', timestamp: Date.now() - 345600000, label: 'Exclude churned VIPs' },
  { query: '(tags:enterprise OR deal_value:>10000)^2', timestamp: Date.now() - 432000000, label: 'Boosted enterprise/high-value' },
  { query: '"quick brown fox"', timestamp: Date.now() - 518400000, label: 'Exact phrase search' },
  { query: 'status:inactive', timestamp: Date.now() - 604800000, label: 'Inactive contacts' },
];

export function mockFetchSavedSearches(partial: string): Promise<SavedSearch[]> {
  const lower = partial.toLowerCase();
  const filtered = SAMPLE_SAVED_SEARCHES
    .filter(s => s.name.toLowerCase().includes(lower) || (s.description || '').toLowerCase().includes(lower));
  return new Promise(resolve => setTimeout(() => resolve(filtered), 100));
}

export function mockFetchHistory(partial: string): Promise<HistoryEntry[]> {
  const lower = partial.toLowerCase();
  const filtered = SAMPLE_HISTORY
    .filter(h => h.query.toLowerCase().includes(lower) || (h.label || '').toLowerCase().includes(lower));
  return new Promise(resolve => setTimeout(() => resolve(filtered), 100));
}
