/**
 * Field type inference and per-type validation case matrices.
 *
 * Every FieldType has:
 *   - signal regexes tested against label/placeholder/aria/title/describedby
 *   - a classification – how confident we are about the inference
 *   - a case matrix – (input, expectation) pairs used in destructive mode
 *
 * Classifications:
 *   - confirmed_from_ui      → verified against the live DOM (none yet)
 *   - inferred_best_practice → matches industry norms
 *   - manual_review          → plausible but must be confirmed
 */

export type RuleClassification =
  | 'confirmed_from_ui'
  | 'inferred_best_practice'
  | 'manual_review';

export type FieldType =
  | 'phone_e164'
  | 'date'
  | 'dob'
  | 'email'
  | 'url'
  | 'zip_postal_code'
  | 'state_region'
  | 'country'
  | 'business_name'
  | 'legal_name'
  | 'tax_id_ein'
  | 'ssn'
  | 'routing_number'
  | 'account_number'
  | 'currency'
  | 'percent'
  | 'integer'
  | 'free_text'
  | 'checkbox_acknowledgement'
  | 'file_upload'
  | 'unknown_manual_review';

export interface ValidationCase {
  name: string;
  input: string;
  /** What we expect the UI to do. */
  expectation: 'accept' | 'reject' | 'normalize';
  expectedNormalized?: RegExp;
  /** Severity of a disagreement between UI behaviour and expectation. */
  severity: 'fail' | 'warning';
}

export interface FieldTypeDefinition {
  type: FieldType;
  classification: RuleClassification;
  description: string;
  /** First signal match wins – list specific types before general ones. */
  signals: RegExp[];
  cases: ValidationCase[];
}

// ---------------------------------------------------------------------------
// Reusable case fragments
// ---------------------------------------------------------------------------
const COMMON_GARBAGE: ValidationCase[] = [
  { name: 'suspicious-garbage', input: '!@#$%^&*()', expectation: 'reject', severity: 'warning' },
  { name: 'leading-trailing-spaces', input: '   test   ', expectation: 'normalize', expectedNormalized: /^test$/, severity: 'warning' },
];

const numericIdCases = (validLen: number, validSample: string, label: string): ValidationCase[] => [
  { name: `valid-${label}`, input: validSample, expectation: 'accept', severity: 'fail' },
  { name: 'too-short', input: '1'.repeat(Math.max(1, validLen - 2)), expectation: 'reject', severity: 'fail' },
  { name: 'too-long', input: '1'.repeat(validLen + 3), expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'ABCDEFGHIJ'.slice(0, validLen), expectation: 'reject', severity: 'fail' },
  { name: 'punctuation-only', input: '-'.repeat(validLen), expectation: 'reject', severity: 'fail' },
];

// ---------------------------------------------------------------------------
// Field-type registry. First match wins.
// ---------------------------------------------------------------------------
export const FIELD_TYPES: FieldTypeDefinition[] = [
  {
    type: 'email',
    classification: 'inferred_best_practice',
    description: 'RFC-5322-style email address',
    signals: [/e-?mail/i],
    cases: [
      { name: 'valid-email', input: 'qa.signer@example.com', expectation: 'accept', severity: 'fail' },
      { name: 'missing-at', input: 'qa.signerexample.com', expectation: 'reject', severity: 'fail' },
      { name: 'missing-domain', input: 'qa.signer@', expectation: 'reject', severity: 'fail' },
      { name: 'internal-spaces', input: 'qa signer@example.com', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'phone_e164',
    classification: 'inferred_best_practice',
    description: 'Phone number, ideally E.164 compatible',
    signals: [/phone|mobile|cell|\btel\b|contact\s*number/i],
    cases: [
      { name: 'valid-e164', input: '+15551234567', expectation: 'accept', severity: 'fail' },
      { name: 'us-formatted', input: '(555) 123-4567', expectation: 'accept', severity: 'warning' },
      { name: 'missing-plus', input: '15551234567', expectation: 'accept', severity: 'warning' },
      { name: 'too-short', input: '555', expectation: 'reject', severity: 'fail' },
      { name: 'too-long', input: '+1555123456789012', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'callmemaybe', expectation: 'reject', severity: 'fail' },
      { name: 'mixed-junk', input: '+1 (ABC) DEF-GHIJ', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'dob',
    classification: 'manual_review',
    description: 'Date of birth – must be in the past and plausibly adult',
    signals: [/dob|date\s*of\s*birth|birth\s*date/i],
    cases: [
      { name: 'valid-adult-dob', input: '1990-01-15', expectation: 'accept', severity: 'fail' },
      { name: 'invalid-separators', input: '1990.01.15', expectation: 'reject', severity: 'warning' },
      { name: 'impossible-date', input: '1990-02-31', expectation: 'reject', severity: 'fail' },
      { name: 'partial-date', input: '1990-01', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'yesterday', expectation: 'reject', severity: 'fail' },
      { name: 'future-date', input: '2099-01-01', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'date',
    classification: 'manual_review',
    description: 'Date (YYYY-MM-DD or MM/DD/YYYY)',
    signals: [/date|expiration|effective|\bissue(d)?\b/i],
    cases: [
      { name: 'valid-iso', input: '2024-06-15', expectation: 'accept', severity: 'warning' },
      { name: 'valid-us', input: '06/15/2024', expectation: 'accept', severity: 'warning' },
      { name: 'invalid-separators', input: '2024.06.15', expectation: 'reject', severity: 'warning' },
      { name: 'impossible-date', input: '2024-02-31', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'tomorrow', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'tax_id_ein',
    classification: 'manual_review',
    description: 'US Employer Identification Number, format ##-#######',
    signals: [/\bein\b|employer\s*identification|\btax\s*id\b|federal\s*tax/i],
    cases: [
      { name: 'valid-formatted', input: '12-3456789', expectation: 'accept', severity: 'fail' },
      { name: 'valid-digits-only', input: '123456789', expectation: 'accept', severity: 'warning' },
      { name: 'too-short', input: '12-345', expectation: 'reject', severity: 'fail' },
      { name: 'too-long', input: '12-34567890', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'AB-CDEFGHI', expectation: 'reject', severity: 'fail' },
      { name: 'punctuation', input: '--------', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'ssn',
    classification: 'manual_review',
    description: 'US Social Security Number, format ###-##-####',
    signals: [/\bssn\b|social\s*security/i],
    cases: [
      { name: 'valid-formatted', input: '123-45-6789', expectation: 'accept', severity: 'fail' },
      { name: 'valid-digits-only', input: '123456789', expectation: 'accept', severity: 'warning' },
      { name: 'too-short', input: '123', expectation: 'reject', severity: 'fail' },
      { name: 'too-long', input: '123-45-67890', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'ABC-DE-FGHI', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'routing_number',
    classification: 'manual_review',
    description: 'US ACH routing number (9 digits)',
    signals: [/routing|\baba\b/i],
    cases: numericIdCases(9, '011000015', 'routing'),
  },
  {
    type: 'account_number',
    classification: 'manual_review',
    description: 'Bank account number (4–17 digits)',
    signals: [/account\s*number|acct\s*no|bank\s*account/i],
    cases: [
      { name: 'valid-typical', input: '12345678', expectation: 'accept', severity: 'fail' },
      { name: 'too-short', input: '123', expectation: 'reject', severity: 'fail' },
      { name: 'too-long', input: '1'.repeat(25), expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'ACCOUNT123', expectation: 'reject', severity: 'fail' },
      { name: 'punctuation', input: '----------', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'zip_postal_code',
    classification: 'inferred_best_practice',
    description: 'US ZIP / postal code',
    signals: [/\bzip\b|postal/i],
    cases: [
      { name: 'valid-5', input: '02115', expectation: 'accept', severity: 'fail' },
      { name: 'valid-9', input: '02115-1234', expectation: 'accept', severity: 'warning' },
      { name: 'too-short', input: '021', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'ABCDE', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'state_region',
    classification: 'inferred_best_practice',
    description: 'US state or region',
    signals: [/\bstate\b|province|region/i],
    cases: [
      { name: 'valid-two-letter', input: 'MA', expectation: 'accept', severity: 'fail' },
      { name: 'invalid-two-letter', input: 'ZZ', expectation: 'reject', severity: 'warning' },
      { name: 'numbers', input: '12', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'country',
    classification: 'inferred_best_practice',
    description: 'Country name or ISO code',
    signals: [/country/i],
    cases: [
      { name: 'valid-us', input: 'United States', expectation: 'accept', severity: 'fail' },
      { name: 'invalid-country', input: 'Zzzland', expectation: 'reject', severity: 'warning' },
    ],
  },
  {
    type: 'url',
    classification: 'inferred_best_practice',
    description: 'URL / website',
    signals: [/website|\burl\b|domain|homepage/i],
    cases: [
      { name: 'valid-https', input: 'https://example.com', expectation: 'accept', severity: 'fail' },
      { name: 'missing-protocol', input: 'example.com', expectation: 'accept', severity: 'warning' },
      { name: 'malformed', input: 'htp:/bad', expectation: 'reject', severity: 'fail' },
      { name: 'spaces', input: 'https://exam ple.com', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'currency',
    classification: 'manual_review',
    description: 'Monetary amount',
    signals: [/amount|revenue|income|balance|price|salary|\$/i],
    cases: [
      { name: 'valid-plain', input: '1000', expectation: 'accept', severity: 'fail' },
      { name: 'valid-formatted', input: '1,000.00', expectation: 'accept', severity: 'warning' },
      { name: 'valid-currency-symbol', input: '$1,000.00', expectation: 'accept', severity: 'warning' },
      { name: 'letters', input: 'one thousand', expectation: 'reject', severity: 'fail' },
      { name: 'negative', input: '-100', expectation: 'reject', severity: 'warning' },
    ],
  },
  {
    type: 'percent',
    classification: 'manual_review',
    description: 'Percentage (0–100)',
    signals: [/percent|percentage|\bpct\b/i],
    cases: [
      { name: 'valid-mid', input: '50', expectation: 'accept', severity: 'fail' },
      { name: 'over-100', input: '150', expectation: 'reject', severity: 'warning' },
      { name: 'negative', input: '-5', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'fifty', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'integer',
    classification: 'inferred_best_practice',
    description: 'Whole number (count, quantity, headcount)',
    signals: [/count|quantity|\bqty\b|headcount|employees|number\s*of/i],
    cases: [
      { name: 'valid-small', input: '5', expectation: 'accept', severity: 'fail' },
      { name: 'decimal', input: '5.5', expectation: 'reject', severity: 'warning' },
      { name: 'letters', input: 'five', expectation: 'reject', severity: 'fail' },
      { name: 'negative', input: '-1', expectation: 'reject', severity: 'warning' },
    ],
  },
  {
    type: 'business_name',
    classification: 'inferred_best_practice',
    description: 'Business / DBA / legal entity name',
    signals: [/business\s*name|legal\s*business|\bdba\b|doing\s*business|company\s*name|entity\s*name/i],
    cases: [
      { name: 'valid-typical', input: 'Test Business LLC', expectation: 'accept', severity: 'fail' },
      { name: 'single-char', input: 'A', expectation: 'reject', severity: 'warning' },
      { name: 'only-spaces', input: '     ', expectation: 'reject', severity: 'fail' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'legal_name',
    classification: 'inferred_best_practice',
    description: 'Person legal name',
    signals: [/\b(first|last|middle|full|legal)\s*name\b|owner\s*name|signer\s*name/i],
    cases: [
      { name: 'valid-typical', input: 'Jane Q Public', expectation: 'accept', severity: 'fail' },
      { name: 'hyphenated', input: 'Smith-Jones', expectation: 'accept', severity: 'warning' },
      { name: 'digits', input: '1234', expectation: 'reject', severity: 'warning' },
      { name: 'only-spaces', input: '     ', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'free_text',
    classification: 'inferred_best_practice',
    description: 'Free-form text (address, notes, description)',
    signals: [/address|street|city|note|description|comment|details|\btitle\b/i],
    cases: [
      { name: 'normal-value', input: '123 Main St, Apt 4B', expectation: 'accept', severity: 'fail' },
      { name: 'punctuation', input: "O'Brien & Sons, Ltd.", expectation: 'accept', severity: 'warning' },
      ...COMMON_GARBAGE,
    ],
  },
  // Fallback – must be last.
  {
    type: 'unknown_manual_review',
    classification: 'manual_review',
    description: 'Field type could not be inferred – manual review required',
    signals: [/.*/],
    cases: [],
  },
];

/** First-match inference; returns the fallback `unknown_manual_review` if nothing matches. */
export function inferFieldType(...signals: Array<string | null | undefined>): FieldTypeDefinition {
  const haystack = signals.filter(Boolean).join(' ').trim();
  if (!haystack) return FIELD_TYPES[FIELD_TYPES.length - 1];
  for (const t of FIELD_TYPES) {
    if (t.type === 'unknown_manual_review') continue;
    if (t.signals.some((s) => s.test(haystack))) return t;
  }
  return FIELD_TYPES[FIELD_TYPES.length - 1];
}
