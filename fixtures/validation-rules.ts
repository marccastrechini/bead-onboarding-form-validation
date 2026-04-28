/**
 * Field type inference and per-type validation case matrices.
 *
 * Every FieldType has:
 *   - signal regexes tested against label/placeholder/aria/title/describedby/
 *     helper/section/autocomplete/inputmode/type strings
 *   - a classification – how confident we are about the inference
 *   - a case matrix – (input, expectation) pairs used in destructive mode
 *
 * Classifications:
 *   - confirmed_from_ui      → verified against the live DOM (none yet)
 *   - inferred_best_practice → matches industry norms / strong signals
 *   - manual_review          → plausible but must be confirmed
 */

export type RuleClassification =
  | 'confirmed_from_ui'
  | 'inferred_best_practice'
  | 'manual_review';

export type FieldType =
  // Onboarding-specific (listed first so they match before generic fallbacks)
  | 'business_name'
  | 'dba_name'
  | 'legal_entity_type'
  | 'business_type'
  | 'business_description'
  | 'naics'
  | 'mcc'
  | 'formation_date'
  | 'incorporation_date'
  | 'date_of_birth'
  | 'months_of_operation'
  | 'signer_first_name'
  | 'signer_last_name'
  | 'signer_email'
  | 'signer_phone'
  | 'address_line_1'
  | 'address_line_2'
  | 'city'
  | 'state'
  | 'zip'
  | 'ein'
  | 'ssn'
  | 'ownership_percent'
  | 'document_type'
  | 'proof_type'
  | 'federal_tax_id_type'
  | 'proof_of_business_type'
  | 'proof_of_address_type'
  | 'proof_of_bank_account_type'
  | 'bank_account_type'
  | 'bank_name'
  | 'address_option'
  | 'stakeholder_role'
  | 'annual_revenue'
  | 'average_ticket'
  | 'monthly_volume'
  | 'website'
  | 'upload'
  | 'acknowledgement_checkbox'
  | 'signature'
  | 'date_signed'
  // Generic / legacy types
  | 'phone_e164'
  | 'date'
  | 'dob'
  | 'email'
  | 'url'
  | 'zip_postal_code'
  | 'state_region'
  | 'country'
  | 'legal_name'
  | 'tax_id_ein'
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
  expectation: 'accept' | 'reject' | 'normalize';
  expectedNormalized?: RegExp;
  severity: 'fail' | 'warning';
}

export interface FieldTypeDefinition {
  type: FieldType;
  classification: RuleClassification;
  description: string;
  signals: RegExp[];
  cases: ValidationCase[];
  /**
   * When true, this type implies the control is NOT a merchant input
   * (e.g. signature widgets, uploads).  Used by the report to avoid
   * inflating "merchant failures" with DocuSign chrome.
   */
  nonMerchantInput?: boolean;
}

// ---------------------------------------------------------------------------
// Reusable case fragments
// ---------------------------------------------------------------------------
const COMMON_GARBAGE: ValidationCase[] = [
  { name: 'suspicious-garbage', input: '!@#$%^&*()', expectation: 'reject', severity: 'warning' },
  {
    name: 'leading-trailing-spaces',
    input: '   test   ',
    expectation: 'normalize',
    expectedNormalized: /^test$/,
    severity: 'warning',
  },
];

const numericIdCases = (validLen: number, validSample: string, label: string): ValidationCase[] => [
  { name: `valid-${label}`, input: validSample, expectation: 'accept', severity: 'fail' },
  { name: 'too-short', input: '1'.repeat(Math.max(1, validLen - 2)), expectation: 'reject', severity: 'fail' },
  { name: 'too-long', input: '1'.repeat(validLen + 3), expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'ABCDEFGHIJ'.slice(0, validLen), expectation: 'reject', severity: 'fail' },
  { name: 'punctuation-only', input: '-'.repeat(validLen), expectation: 'reject', severity: 'fail' },
];

const EMAIL_CASES: ValidationCase[] = [
  { name: 'valid-email', input: 'qa.signer@example.com', expectation: 'accept', severity: 'fail' },
  { name: 'missing-at', input: 'qa.signerexample.com', expectation: 'reject', severity: 'fail' },
  { name: 'missing-domain', input: 'qa.signer@', expectation: 'reject', severity: 'fail' },
  { name: 'internal-spaces', input: 'qa signer@example.com', expectation: 'reject', severity: 'fail' },
];

const PHONE_CASES: ValidationCase[] = [
  { name: 'valid-e164', input: '+15551234567', expectation: 'accept', severity: 'fail' },
  { name: 'us-formatted', input: '(555) 123-4567', expectation: 'accept', severity: 'warning' },
  { name: 'missing-plus', input: '15551234567', expectation: 'accept', severity: 'warning' },
  { name: 'too-short', input: '555', expectation: 'reject', severity: 'fail' },
  { name: 'too-long', input: '+1555123456789012', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'callmemaybe', expectation: 'reject', severity: 'fail' },
];

const ZIP_CASES: ValidationCase[] = [
  { name: 'valid-5', input: '02115', expectation: 'accept', severity: 'fail' },
  { name: 'valid-9', input: '02115-1234', expectation: 'accept', severity: 'warning' },
  { name: 'too-short', input: '021', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'ABCDE', expectation: 'reject', severity: 'fail' },
];

const STATE_CASES: ValidationCase[] = [
  { name: 'valid-two-letter', input: 'MA', expectation: 'accept', severity: 'fail' },
  { name: 'invalid-two-letter', input: 'ZZ', expectation: 'reject', severity: 'warning' },
  { name: 'numbers', input: '12', expectation: 'reject', severity: 'fail' },
];

const DATE_CASES: ValidationCase[] = [
  { name: 'valid-iso', input: '2024-06-15', expectation: 'accept', severity: 'warning' },
  { name: 'valid-us', input: '06/15/2024', expectation: 'accept', severity: 'warning' },
  { name: 'invalid-separators', input: '2024.06.15', expectation: 'reject', severity: 'warning' },
  { name: 'impossible-date', input: '2024-02-31', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'tomorrow', expectation: 'reject', severity: 'fail' },
];

const DOB_CASES: ValidationCase[] = [
  { name: 'valid-adult-dob', input: '1990-01-15', expectation: 'accept', severity: 'fail' },
  { name: 'invalid-separators', input: '1990.01.15', expectation: 'reject', severity: 'warning' },
  { name: 'impossible-date', input: '1990-02-31', expectation: 'reject', severity: 'fail' },
  { name: 'partial-date', input: '1990-01', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'yesterday', expectation: 'reject', severity: 'fail' },
  { name: 'future-date', input: '2099-01-01', expectation: 'reject', severity: 'fail' },
];

const EIN_CASES: ValidationCase[] = [
  { name: 'valid-formatted', input: '12-3456789', expectation: 'accept', severity: 'fail' },
  { name: 'valid-digits-only', input: '123456789', expectation: 'accept', severity: 'warning' },
  { name: 'too-short', input: '12-345', expectation: 'reject', severity: 'fail' },
  { name: 'too-long', input: '12-34567890', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'AB-CDEFGHI', expectation: 'reject', severity: 'fail' },
];

const SSN_CASES: ValidationCase[] = [
  { name: 'valid-formatted', input: '123-45-6789', expectation: 'accept', severity: 'fail' },
  { name: 'valid-digits-only', input: '123456789', expectation: 'accept', severity: 'warning' },
  { name: 'too-short', input: '123', expectation: 'reject', severity: 'fail' },
  { name: 'too-long', input: '123-45-67890', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'ABC-DE-FGHI', expectation: 'reject', severity: 'fail' },
];

const NAME_CASES: ValidationCase[] = [
  { name: 'valid-typical', input: 'Jane', expectation: 'accept', severity: 'fail' },
  { name: 'hyphenated', input: 'Smith-Jones', expectation: 'accept', severity: 'warning' },
  { name: 'digits', input: '1234', expectation: 'reject', severity: 'warning' },
  { name: 'only-spaces', input: '     ', expectation: 'reject', severity: 'fail' },
];

const ADDRESS_CASES: ValidationCase[] = [
  { name: 'valid-typical', input: '123 Main St', expectation: 'accept', severity: 'fail' },
  { name: 'punctuation', input: "O'Brien & Sons, Ltd.", expectation: 'accept', severity: 'warning' },
  ...COMMON_GARBAGE,
];

const PERCENT_CASES: ValidationCase[] = [
  { name: 'valid-mid', input: '50', expectation: 'accept', severity: 'fail' },
  { name: 'over-100', input: '150', expectation: 'reject', severity: 'warning' },
  { name: 'negative', input: '-5', expectation: 'reject', severity: 'fail' },
  { name: 'letters', input: 'fifty', expectation: 'reject', severity: 'fail' },
];

// ---------------------------------------------------------------------------
// Field-type registry. First match wins, so onboarding-specific types are
// listed before their generic equivalents.
// ---------------------------------------------------------------------------
export const FIELD_TYPES: FieldTypeDefinition[] = [
  // -----------------------------------------------------------------------
  // Business identity
  // -----------------------------------------------------------------------
  {
    type: 'dba_name',
    classification: 'inferred_best_practice',
    description: 'Doing-Business-As / trade name',
    signals: [/\bdba\b|doing\s*business\s*as|trade\s*name|operating\s*name/i],
    cases: [
      { name: 'valid-typical', input: 'Acme Trade Co', expectation: 'accept', severity: 'fail' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'business_name',
    classification: 'inferred_best_practice',
    description: 'Legal business / entity / company name',
    signals: [/legal\s*business|business\s*name|company\s*name|entity\s*name|legal\s*name\s*of\s*(business|entity|company)/i],
    cases: [
      { name: 'valid-typical', input: 'Test Business LLC', expectation: 'accept', severity: 'fail' },
      { name: 'single-char', input: 'A', expectation: 'reject', severity: 'warning' },
      { name: 'only-spaces', input: '     ', expectation: 'reject', severity: 'fail' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'legal_entity_type',
    classification: 'inferred_best_practice',
    description: 'Legal entity type (LLC, C-Corp, S-Corp, Sole Prop, etc.)',
    signals: [/entity\s*type|business\s*structure|legal\s*structure|organization\s*type|tax\s*classification/i],
    cases: [],
  },
  {
    type: 'business_type',
    classification: 'manual_review',
    description: 'Business type / location business type selector',
    signals: [/business\s*type|location\s*business\s*type|type\s*of\s*business/i],
    cases: [],
  },
  {
    type: 'business_description',
    classification: 'manual_review',
    description: 'Free-text business description / nature of business',
    signals: [/business\s*description|nature\s*of\s*business|what\s*does\s*(the|your)\s*business|describe\s*your\s*business/i],
    cases: [
      { name: 'valid-typical', input: 'We sell handmade ceramics online.', expectation: 'accept', severity: 'fail' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'naics',
    classification: 'manual_review',
    description: 'NAICS industry code (2–6 digits)',
    signals: [/\bnaics\b|industry\s*code/i],
    cases: [
      { name: 'valid-6-digit', input: '722511', expectation: 'accept', severity: 'fail' },
      { name: 'too-short', input: '7', expectation: 'reject', severity: 'warning' },
      { name: 'letters', input: 'ABCDEF', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'mcc',
    classification: 'manual_review',
    description: 'Merchant Category Code (4 digits)',
    signals: [/\bmcc\b|merchant\s*category/i],
    cases: [
      { name: 'valid-4-digit', input: '5812', expectation: 'accept', severity: 'fail' },
      { name: 'too-short', input: '58', expectation: 'reject', severity: 'fail' },
      { name: 'letters', input: 'ABCD', expectation: 'reject', severity: 'fail' },
    ],
  },

  // -----------------------------------------------------------------------
  // Dates
  // -----------------------------------------------------------------------
  {
    type: 'date_of_birth',
    classification: 'manual_review',
    description: 'Date of birth – must be a past, adult date',
    signals: [/\bdob\b|date\s*of\s*birth|birth\s*date|birthdate/i],
    cases: DOB_CASES,
  },
  {
    type: 'formation_date',
    classification: 'manual_review',
    description: 'Business formation date',
    signals: [/formation\s*date|date\s*(of\s*)?formation|business\s*start\s*date|start\s*date\s*of\s*business/i],
    cases: DATE_CASES,
  },
  {
    type: 'incorporation_date',
    classification: 'manual_review',
    description: 'Incorporation date',
    signals: [/incorporation\s*date|date\s*(of\s*)?incorporation|incorporated\s*on/i],
    cases: DATE_CASES,
  },
  {
    type: 'months_of_operation',
    classification: 'manual_review',
    description: 'Months / years in business',
    signals: [/months?\s*(in|of)\s*(business|operation)|years?\s*in\s*business|time\s*in\s*business/i],
    cases: [
      { name: 'valid-small', input: '12', expectation: 'accept', severity: 'fail' },
      { name: 'letters', input: 'twelve', expectation: 'reject', severity: 'fail' },
      { name: 'negative', input: '-3', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'date_signed',
    classification: 'inferred_best_practice',
    description: 'DocuSign Date-Signed widget (auto-populated, non-merchant)',
    signals: [/date[-_\s]*signed|signeddate|signed\s*on|docusign-date-signed|datesigned/i],
    cases: [],
    nonMerchantInput: true,
  },

  // -----------------------------------------------------------------------
  // Identifiers
  // -----------------------------------------------------------------------
  {
    type: 'ein',
    classification: 'manual_review',
    description: 'US Employer Identification Number (##-#######)',
    signals: [/\bein\b|employer\s*identification|federal\s*tax\s*id|federal\s*ein|fein/i],
    cases: EIN_CASES,
  },
  {
    type: 'ssn',
    classification: 'manual_review',
    description: 'US Social Security Number (###-##-####)',
    signals: [/\bssn\b|social\s*security/i],
    cases: SSN_CASES,
  },

  // -----------------------------------------------------------------------
  // Signer identity
  // -----------------------------------------------------------------------
  {
    type: 'signer_first_name',
    classification: 'inferred_best_practice',
    description: 'Signer / owner first name',
    signals: [/first\s*name|given\s*name/i],
    cases: NAME_CASES,
  },
  {
    type: 'signer_last_name',
    classification: 'inferred_best_practice',
    description: 'Signer / owner last name',
    signals: [/last\s*name|surname|family\s*name/i],
    cases: NAME_CASES,
  },
  {
    type: 'signer_email',
    classification: 'inferred_best_practice',
    description: 'Signer email address',
    signals: [/signer.*e?-?mail|owner.*e?-?mail|contact.*e?-?mail|e-?mail\s*address/i],
    cases: EMAIL_CASES,
  },
  {
    type: 'signer_phone',
    classification: 'inferred_best_practice',
    description: 'Signer / contact phone number',
    signals: [/signer.*phone|owner.*phone|contact.*phone|mobile|cell|\btel\b|phone\s*number/i],
    cases: PHONE_CASES,
  },

  // -----------------------------------------------------------------------
  // Address parts
  // -----------------------------------------------------------------------
  {
    type: 'address_line_2',
    classification: 'inferred_best_practice',
    description: 'Secondary address line (apt, suite, unit)',
    signals: [/address\s*(line\s*)?2|apt|apartment|suite|unit\b|address2/i],
    cases: ADDRESS_CASES,
  },
  {
    type: 'address_line_1',
    classification: 'inferred_best_practice',
    description: 'Primary street address',
    signals: [/address\s*(line\s*)?1|street\s*address|street\s*1|address1|mailing\s*address|business\s*address/i],
    cases: ADDRESS_CASES,
  },
  {
    type: 'city',
    classification: 'inferred_best_practice',
    description: 'City / locality',
    signals: [/\bcity\b|town|locality/i],
    cases: [
      { name: 'valid-typical', input: 'Boston', expectation: 'accept', severity: 'fail' },
      { name: 'digits', input: '123', expectation: 'reject', severity: 'warning' },
    ],
  },
  {
    type: 'state',
    classification: 'inferred_best_practice',
    description: 'US state / region',
    signals: [/\bstate\b|province|region/i],
    cases: STATE_CASES,
  },
  {
    type: 'zip',
    classification: 'inferred_best_practice',
    description: 'US ZIP / postal code',
    signals: [/\bzip\b|postal\s*code|post\s*code/i],
    cases: ZIP_CASES,
  },

  // -----------------------------------------------------------------------
  // Ownership / percent / documents
  // -----------------------------------------------------------------------
  {
    type: 'ownership_percent',
    classification: 'manual_review',
    description: 'Ownership percentage (0–100)',
    signals: [/ownership\s*(percent|pct|%)?|percent\s*(of\s*)?ownership|owner.*percent|percent\s*owned/i],
    cases: PERCENT_CASES,
  },
  {
    type: 'proof_type',
    classification: 'manual_review',
    description: 'Proof-of-business document type selector',
    signals: [
      /proof\s*document\s*type/i,
    ],
    cases: [],
  },
  {
    type: 'federal_tax_id_type',
    classification: 'manual_review',
    description: 'Federal tax ID document type selector',
    signals: [/federal\s*tax\s*id\s*type|tax\s*id\s*type/i, /\bfederalTaxIdType\b/],
    cases: [],
  },
  {
    type: 'proof_of_business_type',
    classification: 'manual_review',
    description: 'Proof-of-business document type selector',
    signals: [/proof\s*of\s*business(\s*type)?/i, /\bproofOfBusinessType\b/],
    cases: [],
  },
  {
    type: 'proof_of_address_type',
    classification: 'manual_review',
    description: 'Proof-of-address document type selector',
    signals: [/proof\s*of\s*address(\s*type)?/i, /\bproofOfAddressType\b/],
    cases: [],
  },
  {
    type: 'proof_of_bank_account_type',
    classification: 'manual_review',
    description: 'Proof-of-bank-account document type selector',
    signals: [/proof\s*of\s*bank\s*account(\s*type)?/i, /\bproofOfBankAccountType\b/],
    cases: [],
  },
  {
    type: 'document_type',
    classification: 'manual_review',
    description: 'Document type selector (e.g. driver license, passport)',
    signals: [/document\s*type|id\s*type|identification\s*type/i],
    cases: [],
  },
  {
    type: 'bank_account_type',
    classification: 'manual_review',
    description: 'Bank account type (Checking / Savings)',
    signals: [/bank\s*account\s*type|\bbankAccountType\b|\baccountType\b/i],
    cases: [],
  },
  {
    type: 'bank_name',
    classification: 'manual_review',
    description: 'Bank name (free text)',
    signals: [/\bbank\s*name\b|\bbankName\b|name\s*of\s*bank|financial\s*institution/i],
    cases: [
      { name: 'valid-typical', input: 'Bank of Example', expectation: 'accept', severity: 'fail' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'address_option',
    classification: 'manual_review',
    description: 'Address classification toggle (legal / operating / virtual)',
    signals: [
      /\baddressOptions?\b/,
      /\bisLegalAddress\b/,
      /\bisOperatingAddress\b/,
      /\bisVirtualAddress\b/,
      /\blegalAddressType\b/,
    ],
    cases: [],
  },
  {
    type: 'stakeholder_role',
    classification: 'manual_review',
    description: 'Stakeholder / beneficial-owner role selector',
    signals: [
      /\bstakeholder\d*(Role|Type|Title)?\b/,
      /beneficial\s*owner|control\s*person/i,
    ],
    cases: [],
  },
  {
    type: 'annual_revenue',
    classification: 'manual_review',
    description: 'Annual revenue / yearly sales volume',
    signals: [/annual\s*revenue|yearly\s*(revenue|sales)|annual\s*sales|\bannualRevenue\b/i],
    cases: [
      { name: 'valid-plain', input: '500000', expectation: 'accept', severity: 'fail' },
      { name: 'letters', input: 'a lot', expectation: 'reject', severity: 'fail' },
      { name: 'negative', input: '-100', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'average_ticket',
    classification: 'manual_review',
    description: 'Average transaction / ticket size',
    signals: [/average\s*(ticket|transaction)|\bavgTicket\b|avg\s*sale/i],
    cases: [
      { name: 'valid-plain', input: '75', expectation: 'accept', severity: 'fail' },
      { name: 'letters', input: 'medium', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'monthly_volume',
    classification: 'manual_review',
    description: 'Monthly processing / sales volume',
    signals: [/monthly\s*(volume|sales|processing)|\bmonthlyVolume\b/i],
    cases: [
      { name: 'valid-plain', input: '25000', expectation: 'accept', severity: 'fail' },
      { name: 'letters', input: 'high', expectation: 'reject', severity: 'fail' },
    ],
  },
  {
    type: 'website',
    classification: 'inferred_best_practice',
    description: 'Business website / URL',
    signals: [/\bwebsite\b|\bhomepage\b|\bbusinessUrl\b|\bbusiness\s*site\b/i],
    cases: [
      { name: 'valid-https', input: 'https://example.com', expectation: 'accept', severity: 'fail' },
      { name: 'missing-protocol', input: 'example.com', expectation: 'accept', severity: 'warning' },
      { name: 'malformed', input: 'htp:/bad', expectation: 'reject', severity: 'fail' },
    ],
  },

  // -----------------------------------------------------------------------
  // DocuSign widgets – not merchant inputs
  // -----------------------------------------------------------------------
  {
    type: 'signature',
    classification: 'inferred_best_practice',
    description: 'DocuSign SignHere widget (non-merchant)',
    signals: [/signhere|sign\s*here|signaturetab|signature\s*tab|adoptsignature/i],
    cases: [],
    nonMerchantInput: true,
  },
  {
    type: 'upload',
    classification: 'inferred_best_practice',
    description: 'File upload / attachment control (strong signals only)',
    // Tightened: only fire on explicit upload/attachment verbs or the
    // DocuSign SignerAttachment tab marker.  Do NOT fire on the word
    // "attachment" alone — it bleeds into every merchant input whose
    // ancestor helper text mentions signer attachments.
    signals: [
      /\bsignerattachment(tab)?\b/i,
      /\bupload\s*(file|document|image|photo)\b/i,
      /\bchoose\s*file\b/i,
      /\badd\s*file\b/i,
      /\bbrowse\s*(file|for\s*file)\b/i,
      /\battach\s*(file|document|image)\b/i,
    ],
    cases: [],
    nonMerchantInput: true,
  },
  {
    type: 'acknowledgement_checkbox',
    classification: 'inferred_best_practice',
    description: 'Acknowledgement / consent / certification checkbox',
    signals: [/acknowledge|i\s*agree|consent|certif|terms|authoriz/i],
    cases: [],
  },

  // -----------------------------------------------------------------------
  // Generic fallbacks (kept for back-compat)
  // -----------------------------------------------------------------------
  {
    type: 'email',
    classification: 'inferred_best_practice',
    description: 'RFC-5322-style email address',
    signals: [/e-?mail/i],
    cases: EMAIL_CASES,
  },
  {
    type: 'phone_e164',
    classification: 'inferred_best_practice',
    description: 'Phone number, ideally E.164 compatible',
    signals: [/phone|mobile|cell|\btel\b|contact\s*number/i],
    cases: PHONE_CASES,
  },
  {
    type: 'dob',
    classification: 'manual_review',
    description: 'Date of birth (generic)',
    signals: [/dob|birth/i],
    cases: DOB_CASES,
  },
  {
    type: 'date',
    classification: 'manual_review',
    description: 'Generic date (YYYY-MM-DD or MM/DD/YYYY)',
    signals: [/date|expiration|effective|\bissue(d)?\b/i],
    cases: DATE_CASES,
  },
  {
    type: 'tax_id_ein',
    classification: 'manual_review',
    description: 'US Employer Identification Number (generic signal)',
    signals: [/\btax\s*id\b|federal\s*tax/i],
    cases: EIN_CASES,
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
    ],
  },
  {
    type: 'zip_postal_code',
    classification: 'inferred_best_practice',
    description: 'US ZIP / postal code (generic)',
    signals: [/postal/i],
    cases: ZIP_CASES,
  },
  {
    type: 'state_region',
    classification: 'inferred_best_practice',
    description: 'US state or region (generic)',
    signals: [/province|region/i],
    cases: STATE_CASES,
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
      { name: 'letters', input: 'one thousand', expectation: 'reject', severity: 'fail' },
      { name: 'negative', input: '-100', expectation: 'reject', severity: 'warning' },
    ],
  },
  {
    type: 'percent',
    classification: 'manual_review',
    description: 'Percentage (0–100)',
    signals: [/percent|percentage|\bpct\b/i],
    cases: PERCENT_CASES,
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
    type: 'legal_name',
    classification: 'inferred_best_practice',
    description: 'Person legal name (generic)',
    signals: [/\b(middle|full|legal)\s*name\b|owner\s*name|signer\s*name/i],
    cases: NAME_CASES,
  },
  {
    type: 'free_text',
    classification: 'inferred_best_practice',
    description: 'Free-form text (notes, description)',
    signals: [/note|description|comment|details|\btitle\b/i],
    cases: [
      { name: 'normal-value', input: '123 Main St, Apt 4B', expectation: 'accept', severity: 'fail' },
      { name: 'punctuation', input: "O'Brien & Sons, Ltd.", expectation: 'accept', severity: 'warning' },
      ...COMMON_GARBAGE,
    ],
  },
  {
    type: 'file_upload',
    classification: 'inferred_best_practice',
    description: 'Legacy alias for upload controls',
    signals: [/file\s*upload|upload\s*file/i],
    cases: [],
    nonMerchantInput: true,
  },
  {
    type: 'checkbox_acknowledgement',
    classification: 'inferred_best_practice',
    description: 'Legacy alias for acknowledgement checkboxes',
    signals: [/i\s*accept|i\s*acknowledge/i],
    cases: [],
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

/** Field types which indicate a non-merchant / chrome / widget control. */
export const NON_MERCHANT_TYPES: ReadonlySet<FieldType> = new Set(
  FIELD_TYPES.filter((t) => t.nonMerchantInput).map((t) => t.type),
);

/**
 * First-match inference against the concatenated signal haystack.
 * Filters out boilerplate values (required markers, DocuSign stubs) before
 * matching so they do not force false matches against the fallback type.
 */
export function inferFieldType(...signals: Array<string | null | undefined>): FieldTypeDefinition {
  const cleaned = signals
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    // Drop DocuSign stub "labels" that cause false matches.  e.g. "Required -
    // Attachment" should not infer type 'attachment' from merchant text.
    // Drop DocuSign stub "labels" that cause false matches.
    .map((s) =>
      s
        .replace(
          /required\s*[-–]\s*(attachment|signhere|signature|datesigned|full\s*name|number\s*[-–]\s*#?,?#{0,3}\.?#*|text|name|initial|addressoptions|checkbox|dropdown|list)/gi,
          ' ',
        )
        .replace(/\s+(required|optional)\b/gi, ' ')
        .replace(/this\s+link\s+will\s+open\s+in\s+a\s+new\s+window\.?/gi, ' ')
        .replace(/select\s+to\s+load\s+content\s+for\s+this\s+page/gi, ' '))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const haystack = cleaned.join(' | ');
  if (!haystack) return FIELD_TYPES[FIELD_TYPES.length - 1];

  for (const t of FIELD_TYPES) {
    if (t.type === 'unknown_manual_review') continue;
    if (t.signals.some((s) => s.test(haystack))) return t;
  }
  return FIELD_TYPES[FIELD_TYPES.length - 1];
}
