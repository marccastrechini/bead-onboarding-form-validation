import type { FieldType } from './validation-rules';

export type FieldConceptKey =
  | 'business_name'
  | 'dba_name'
  | 'business_description'
  | 'website'
  | 'email'
  | 'stakeholder_email'
  | 'phone'
  | 'stakeholder_phone'
  | 'ein'
  | 'ssn'
  | 'date_of_birth'
  | 'registration_date'
  | 'legal_entity_type'
  | 'naics'
  | 'merchant_category_code'
  | 'address_line_1'
  | 'address_line_2'
  | 'city'
  | 'state'
  | 'postal_code'
  | 'country'
  | 'bank_name'
  | 'routing_number'
  | 'account_number'
  | 'bank_account_type'
  | 'annual_revenue'
  | 'highest_monthly_volume'
  | 'average_ticket'
  | 'max_ticket'
  | 'ownership_percentage'
  | 'document_type'
  | 'upload'
  | 'acknowledgement_checkbox'
  | 'signature';

export type ValidationExpectationSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface BestPracticeValidation {
  id: string;
  displayName: string;
  expectedBehavior: string;
  severity: ValidationExpectationSeverity;
  caseNames: string[];
  rationale: string;
}

export interface FieldConceptDefinition {
  key: FieldConceptKey;
  displayName: string;
  businessSection: string;
  fieldTypes: FieldType[];
  labelPatterns: RegExp[];
  jsonKeyPatterns: RegExp[];
  bestPracticeValidations: BestPracticeValidation[];
  missingValidationSeverity: ValidationExpectationSeverity;
  weakValidationSeverity: ValidationExpectationSeverity;
  validExamples: string[];
  invalidExamples: string[];
  notes: string;
}

function v(
  id: string,
  displayName: string,
  expectedBehavior: string,
  severity: ValidationExpectationSeverity,
  caseNames: string[],
  rationale: string,
): BestPracticeValidation {
  return { id, displayName, expectedBehavior, severity, caseNames, rationale };
}

const EMPTY_REQUIRED = v(
  'empty-required-behavior',
  'Empty required behavior',
  'An empty required field is rejected or clearly marked before completion.',
  'high',
  ['empty-required'],
  'Required onboarding data should not be silently omitted.',
);

const TEXT_LENGTH_AND_CONTENT = [
  v('normal-value-accepted', 'Normal value accepted', 'A normal representative value is accepted.', 'critical', ['valid-typical', 'normal-value'], 'Confirms the field can accept expected production input.'),
  v('very-short-behavior', 'Very short value behavior', 'A suspiciously short value is rejected, flagged, or explicitly allowed.', 'medium', ['single-char', 'too-short'], 'Short values often indicate incomplete onboarding data.'),
  v('excessive-length-behavior', 'Excessive length behavior', 'An excessive length value is rejected, truncated safely, or constrained by maxlength.', 'high', ['too-long', 'excessive-length'], 'Safe truncation or maxlength enforcement is acceptable when the product intentionally preserves a usable name value.'),
  v('special-characters-behavior', 'Special characters behavior', 'Common punctuation is handled intentionally and garbage characters are rejected, normalized, or explicitly allowed.', 'medium', ['punctuation', 'suspicious-garbage'], 'Business names often contain punctuation, symbols, or trade-style formatting that should not be treated as defects by default.'),
  EMPTY_REQUIRED,
];

const FREE_TEXT_MATRIX = [
  v('normal-text-accepted', 'Normal text accepted', 'A realistic free-text value is accepted.', 'critical', ['valid-typical', 'normal-value'], 'Confirms that legitimate descriptive text can be entered.'),
  v('very-short-behavior', 'Very short value behavior', 'A suspiciously short free-text value is rejected, flagged, or explicitly allowed.', 'medium', ['single-char', 'too-short'], 'Short descriptions often indicate incomplete onboarding data.'),
  v('garbage-text-rejected-or-flagged', 'Garbage text rejected or flagged', 'Obvious garbage text is rejected, warned, or flagged for review.', 'medium', ['suspicious-garbage'], 'Free-text fields still benefit from light quality gates.'),
  v('excessive-length-behavior', 'Excessive length behavior', 'Very long text is constrained or handled intentionally.', 'medium', ['too-long', 'excessive-length'], 'Prevents unreadable or downstream-breaking descriptions.'),
  EMPTY_REQUIRED,
];

const DROPDOWN_MATRIX = [
  v('valid-option-accepted', 'Valid option accepted', 'A listed option can be selected and retained.', 'critical', ['valid-option'], 'Dropdown fields should preserve known controlled vocabulary selections.'),
  v('invalid-freeform-rejected', 'Invalid free-form value rejected', 'A value outside the allowed option set cannot be submitted.', 'high', ['invalid-option'], 'Controlled choices should not allow arbitrary values.'),
  EMPTY_REQUIRED,
];

const ADDRESS_TEXT_MATRIX = [
  v('normal-address-accepted', 'Normal address accepted', 'A realistic address value is accepted.', 'critical', ['valid-typical', 'normal-value'], 'Confirms legitimate address data can be entered.'),
  v('punctuation-format-handling', 'Punctuation handling documented', 'Common address punctuation is accepted or normalized intentionally.', 'medium', ['punctuation'], 'Real addresses often contain punctuation, unit markers, and directional text.'),
  v('garbage-rejected-or-flagged', 'Garbage rejected or flagged', 'Obvious garbage characters are rejected or flagged.', 'medium', ['suspicious-garbage'], 'Reduces low-quality address submissions.'),
  v('excessive-length-behavior', 'Excessive length behavior', 'An excessive length address is constrained or handled intentionally.', 'medium', ['too-long', 'excessive-length'], 'Protects address systems with practical field limits.'),
  EMPTY_REQUIRED,
];

const MONEY_MATRIX = [
  v('valid-amount-accepted', 'Valid amount accepted', 'A normal numeric amount is accepted.', 'critical', ['valid-plain', 'valid-formatted'], 'Confirms normal volume and ticket values can be supplied.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic text is rejected for numeric money fields.', 'high', ['letters'], 'Prevents non-numeric financial data.'),
  v('negative-value-behavior', 'Negative value behavior', 'Negative values are rejected or explicitly handled.', 'high', ['negative'], 'Negative processing values are usually invalid for onboarding.'),
  v('excessive-value-behavior', 'Excessive value behavior', 'Outlier values are rejected, capped, or flagged.', 'medium', ['too-long', 'excessive-value'], 'Extreme values often require review or risk controls.'),
  EMPTY_REQUIRED,
];

const EMAIL_MATRIX = [
  v('valid-email-accepted', 'Valid email accepted', 'A standard valid email address is accepted.', 'critical', ['valid-email'], 'Confirms normal contact email entry works.'),
  v('missing-at-rejected', 'Missing @ rejected', 'An address without @ is rejected.', 'critical', ['missing-at'], 'This is the baseline email syntax guard.'),
  v('invalid-domain-rejected', 'Invalid domain rejected', 'An incomplete or invalid domain is rejected.', 'high', ['missing-domain', 'invalid-domain'], 'Prevents unusable contact addresses.'),
  v('spaces-rejected', 'Spaces rejected', 'Internal spaces are rejected.', 'high', ['internal-spaces', 'spaces'], 'Spaces commonly indicate a malformed email.'),
  v('too-long-rejected', 'Too long rejected', 'An excessively long email is rejected or constrained.', 'medium', ['too-long'], 'Prevents values that exceed practical email limits.'),
  EMPTY_REQUIRED,
];

const PHONE_MATRIX = [
  v('valid-e164-accepted', 'Valid E.164 accepted', 'A valid E.164 phone number is accepted.', 'critical', ['valid-e164'], 'E.164 is the safest interoperable phone representation.'),
  v('missing-plus-handling', 'Missing plus sign behavior', 'A number missing the leading plus is accepted, normalized, rejected, or documented.', 'medium', ['missing-plus'], 'The product should be explicit about national-format tolerance.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic phone input is rejected.', 'critical', ['letters'], 'Prevents clearly invalid contact data.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short phone number is rejected.', 'critical', ['too-short'], 'Short values are not dialable phone numbers.'),
  v('too-long-rejected', 'Too long rejected', 'A too-long phone number is rejected.', 'critical', ['too-long'], 'Overlong values are not valid E.164 numbers.'),
  v('punctuation-format-handling', 'Punctuation/format handling documented', 'Common US punctuation is accepted, normalized, rejected, or documented.', 'medium', ['us-formatted'], 'Reviewers need to know whether local formats are supported.'),
  EMPTY_REQUIRED,
];

const DOB_MATRIX = [
  v('valid-adult-dob-accepted', 'Valid adult DOB accepted', 'A realistic adult date of birth is accepted.', 'critical', ['valid-adult-dob'], 'Confirms legitimate owner data can be entered.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic date text is rejected.', 'critical', ['letters'], 'Prevents non-date owner data.'),
  v('impossible-date-rejected', 'Impossible date rejected', 'An impossible calendar date is rejected.', 'critical', ['impossible-date'], 'Date parsing should reject invalid calendar values.'),
  v('future-date-rejected', 'Future date rejected', 'A future date of birth is rejected.', 'critical', ['future-date'], 'A birth date cannot be in the future.'),
  v('under-age-dob-rejected-or-flagged', 'Under-age DOB rejected or flagged', 'A DOB below the minimum age is rejected or flagged.', 'high', ['under-age-dob', 'underage-dob'], 'Beneficial owners and signers often need minimum-age enforcement.'),
  v('unrealistic-old-date-rejected-or-flagged', 'Unrealistic old date rejected or flagged', 'An implausibly old DOB is rejected or flagged.', 'medium', ['unrealistic-old-date'], 'Implausible ages usually indicate data-entry errors.'),
  EMPTY_REQUIRED,
  v('accepted-date-format-documented', 'Accepted date format documented', 'Accepted date formats are documented by UI hints, masks, or validation behavior.', 'medium', ['valid-us', 'valid-iso', 'invalid-separators'], 'Reviewers need to know which date formats users can enter.'),
];

const DATE_MATRIX = [
  v('valid-date-accepted', 'Valid date accepted', 'A valid date is accepted.', 'critical', ['valid-us', 'valid-iso'], 'Confirms normal date entry works.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic date text is rejected.', 'high', ['letters'], 'Prevents non-date values.'),
  v('impossible-date-rejected', 'Impossible date rejected', 'An impossible calendar date is rejected.', 'high', ['impossible-date'], 'Prevents invalid calendar values.'),
  v('future-date-behavior', 'Future date behavior', 'Future dates are accepted, rejected, or flagged according to business policy.', 'medium', ['future-date'], 'Date rules should reflect the field purpose.'),
  EMPTY_REQUIRED,
  v('accepted-date-format-documented', 'Accepted date format documented', 'Accepted date formats are documented by UI hints, masks, or validation behavior.', 'medium', ['valid-us', 'valid-iso', 'invalid-separators'], 'Avoids user confusion and inconsistent parsing.'),
];

const EIN_MATRIX = [
  v('valid-ein-accepted', 'Valid EIN accepted', 'A valid formatted EIN is accepted.', 'critical', ['valid-formatted'], 'Confirms expected federal tax ID entry works.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic EIN input is rejected.', 'critical', ['letters'], 'EINs are numeric except for formatting punctuation.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short EIN is rejected.', 'critical', ['too-short'], 'Short EINs are incomplete.'),
  v('too-long-rejected', 'Too long rejected', 'A too-long EIN is rejected.', 'critical', ['too-long'], 'Overlong EINs are invalid.'),
  v('missing-dash-behavior', 'Missing dash behavior', 'Digits-only EIN input is accepted, normalized, rejected, or documented.', 'medium', ['valid-digits-only', 'missing-dash'], 'The product should be explicit about formatted vs unformatted EINs.'),
  v('repeated-digits-behavior', 'Repeated digits behavior', 'Repeated or obviously fake EINs are rejected or flagged.', 'medium', ['repeated-digits'], 'Synthetic values can pass length checks while still being weak.'),
  EMPTY_REQUIRED,
];

const SSN_MATRIX = [
  v('valid-ssn-accepted', 'Valid SSN accepted', 'A valid formatted SSN is accepted.', 'critical', ['valid-formatted'], 'Confirms normal SSN entry works when SSN is required.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic SSN input is rejected.', 'critical', ['letters'], 'SSNs are numeric except for formatting punctuation.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short SSN is rejected.', 'critical', ['too-short'], 'Short SSNs are incomplete.'),
  v('too-long-rejected', 'Too long rejected', 'A too-long SSN is rejected.', 'critical', ['too-long'], 'Overlong SSNs are invalid.'),
  v('missing-dash-behavior', 'Missing dash behavior', 'Digits-only SSN input is accepted, normalized, rejected, or documented.', 'medium', ['valid-digits-only', 'missing-dash'], 'The product should be explicit about formatted vs unformatted SSNs.'),
  EMPTY_REQUIRED,
];

const ROUTING_MATRIX = [
  v('valid-routing-number-accepted', 'Valid 9-digit ABA accepted', 'A known valid 9-digit ABA routing number is accepted.', 'critical', ['valid-routing'], 'Confirms normal ACH routing data can be entered.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic routing input is rejected.', 'critical', ['letters'], 'Routing numbers are numeric.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short routing number is rejected.', 'critical', ['too-short'], 'Routing numbers must be 9 digits.'),
  v('too-long-rejected', 'Too long rejected', 'A too-long routing number is rejected.', 'critical', ['too-long'], 'Routing numbers must be 9 digits.'),
  v('checksum-validation', 'Checksum validation if possible', 'The ABA checksum is validated or a limitation is documented.', 'high', ['checksum'], 'Length-only routing validation can allow invalid bank routes.'),
  EMPTY_REQUIRED,
];

const ACCOUNT_NUMBER_MATRIX = [
  v('valid-account-number-accepted', 'Valid account number accepted', 'A realistic bank account number is accepted.', 'critical', ['valid-typical'], 'Confirms normal account data can be entered.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic account-number input is rejected.', 'critical', ['letters'], 'Bank account numbers are usually numeric in this flow.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short account number is rejected.', 'high', ['too-short'], 'Short account numbers are likely incomplete.'),
  v('too-long-rejected', 'Too long rejected', 'A too-long account number is rejected.', 'high', ['too-long'], 'Practical length limits should be enforced.'),
  EMPTY_REQUIRED,
];

const CODE_MATRIX = [
  v('valid-code-accepted', 'Valid code accepted', 'A valid industry/category code is accepted.', 'critical', ['valid-4-digit', 'valid-6-digit'], 'Confirms coded business classification data can be entered.'),
  v('letters-rejected', 'Letters rejected', 'Letters are rejected for numeric code fields.', 'high', ['letters'], 'Industry/category codes should remain numeric.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short code is rejected or flagged.', 'medium', ['too-short'], 'Short codes may be incomplete or too broad.'),
  EMPTY_REQUIRED,
];

const POSTAL_MATRIX = [
  v('valid-postal-code-accepted', 'Valid postal code accepted', 'A valid ZIP/postal code is accepted.', 'critical', ['valid-5', 'valid-9'], 'Confirms normal postal-code entry works.'),
  v('too-short-rejected', 'Too short rejected', 'A too-short postal code is rejected.', 'high', ['too-short'], 'Short postal codes are incomplete.'),
  v('letters-behavior', 'Letters behavior documented', 'Letters are accepted or rejected according to supported countries.', 'medium', ['letters'], 'US-only flows should reject letters; international flows may allow them.'),
  EMPTY_REQUIRED,
];

const STATE_MATRIX = [
  v('valid-state-accepted', 'Valid state accepted', 'A valid state/region value is accepted.', 'critical', ['valid-two-letter'], 'Confirms normal state entry works.'),
  v('invalid-state-rejected', 'Invalid state rejected', 'An invalid state/region value is rejected or flagged.', 'high', ['invalid-two-letter'], 'Prevents unusable address data.'),
  v('numbers-rejected', 'Numbers rejected', 'Numeric state input is rejected.', 'high', ['numbers'], 'State values should not be numeric in US flows.'),
  EMPTY_REQUIRED,
];

const COUNTRY_MATRIX = [
  v('valid-country-accepted', 'Valid country accepted', 'A supported country value is accepted.', 'critical', ['valid-us'], 'Confirms normal country selection works.'),
  v('invalid-country-rejected', 'Invalid country rejected', 'An unsupported country is rejected or flagged.', 'medium', ['invalid-country'], 'Country support should match product policy.'),
  EMPTY_REQUIRED,
];

const PERCENT_MATRIX = [
  v('valid-percent-accepted', 'Valid percentage accepted', 'A normal ownership percentage is accepted.', 'critical', ['valid-mid'], 'Confirms normal ownership entry works.'),
  v('over-100-rejected', 'Over 100 rejected', 'Values above 100 are rejected or flagged.', 'critical', ['over-100'], 'Ownership percentage cannot exceed 100 for a single owner.'),
  v('negative-rejected', 'Negative rejected', 'Negative percentages are rejected.', 'critical', ['negative'], 'Ownership cannot be negative.'),
  v('letters-rejected', 'Letters rejected', 'Alphabetic percentage input is rejected.', 'high', ['letters'], 'Prevents non-numeric ownership data.'),
  EMPTY_REQUIRED,
];

const URL_MATRIX = [
  v('valid-https-accepted', 'Valid HTTPS URL accepted', 'A valid HTTPS URL is accepted.', 'critical', ['valid-https'], 'Confirms normal website entry works.'),
  v('missing-protocol-behavior', 'Missing protocol behavior', 'A missing protocol is accepted, normalized, rejected, or documented.', 'medium', ['missing-protocol'], 'Reviewers need to know whether bare domains are supported.'),
  v('malformed-url-rejected', 'Malformed URL rejected', 'A malformed URL is rejected.', 'high', ['malformed'], 'Prevents unusable website values.'),
  v('spaces-rejected', 'Spaces rejected', 'URLs containing spaces are rejected.', 'medium', ['spaces'], 'Spaces usually indicate a malformed URL.'),
  EMPTY_REQUIRED,
];

const UPLOAD_MATRIX = [
  v('upload-control-detected', 'Upload control detected', 'The attachment control is discoverable and reachable.', 'critical', ['upload-detected'], 'Reviewers need confidence that document upload fields are visible.'),
  v('required-upload-behavior', 'Required upload behavior', 'Required uploads are enforced before completion.', 'high', ['empty-required'], 'Required document evidence should not be bypassed.'),
  v('file-type-validation', 'File type validation', 'Allowed and blocked file types are documented or enforced.', 'medium', ['file-type'], 'Document uploads should match policy and security expectations.'),
  v('file-size-validation', 'File size validation', 'Oversized files are rejected with a clear message.', 'medium', ['file-size'], 'Prevents upload failures late in the flow.'),
];

const ACK_MATRIX = [
  v('default-state-documented', 'Default state documented', 'The default checked/unchecked state is known.', 'medium', ['default-state'], 'Consent should not be ambiguous.'),
  v('can-check', 'Can check', 'The user can check the acknowledgement when required.', 'critical', ['can-check'], 'Required acknowledgements must be actionable.'),
  v('can-uncheck-or-sticky-documented', 'Can uncheck or sticky behavior documented', 'Uncheck behavior is either allowed or intentionally sticky.', 'medium', ['can-uncheck'], 'Sticky acknowledgements should be a deliberate product choice.'),
  EMPTY_REQUIRED,
];

const SIGNATURE_MATRIX = [
  v('signature-widget-detected', 'Signature widget detected', 'The signature field is discoverable as a signature action.', 'critical', ['signature-detected'], 'The signer must be able to complete required signature fields.'),
  v('required-before-completion', 'Required before completion', 'The form prevents completion until signature is provided.', 'critical', ['empty-required'], 'Unsigned agreements should not be complete.'),
  v('adoption-flow-not-run-in-safe-mode', 'Adoption flow safe-mode boundary', 'Adopt/sign flows are tested only on disposable envelopes.', 'high', ['adopt-signature'], 'Signature adoption can mutate the envelope and must stay gated.'),
];

export const FIELD_CONCEPTS: FieldConceptDefinition[] = [
  {
    key: 'business_name',
    displayName: 'Business Name',
    businessSection: 'Business Details',
    fieldTypes: ['business_name'],
    labelPatterns: [/business\s*name/i, /legal\s*(business|entity|company)\s*name/i, /registered\s*name/i, /merchant\s*name/i],
    jsonKeyPatterns: [/merchantData\.(merchantName|registeredName)$/i],
    bestPracticeValidations: TEXT_LENGTH_AND_CONTENT,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['Test Business LLC', 'Acme Payments, Inc.'],
    invalidExamples: ['', 'A', '!@#$%^&*()'],
    notes: 'Core legal/business identity field used for underwriting and contract records. Common legal-name punctuation is acceptable, and excessive-length handling may be satisfied by intentional truncation or normalization rather than only hard rejection.',
  },
  {
    key: 'dba_name',
    displayName: 'DBA Name',
    businessSection: 'Business Details',
    fieldTypes: ['dba_name'],
    labelPatterns: [/\bdba\b/i, /doing\s*business\s*as/i, /trade\s*name/i, /operating\s*name/i],
    jsonKeyPatterns: [/merchantData\.dbaName$/i],
    bestPracticeValidations: TEXT_LENGTH_AND_CONTENT,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'medium',
    validExamples: ['Acme Storefront'],
    invalidExamples: ['', '!@#$%^&*()'],
    notes: 'DBA/trade names are often optional and may be blank when the merchant has no separate trade name. When present, common punctuation is acceptable, and excessive-length handling may be satisfied by intentional truncation or normalization.',
  },
  {
    key: 'business_description',
    displayName: 'Business Description',
    businessSection: 'Business Details',
    fieldTypes: ['business_description'],
    labelPatterns: [/business\s*description/i, /nature\s*of\s*business/i, /describe\s*(your|the)\s*business/i],
    jsonKeyPatterns: [/merchantData\.businessDescription$/i],
    bestPracticeValidations: FREE_TEXT_MATRIX,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'low',
    validExamples: ['We sell handmade ceramics online.'],
    invalidExamples: ['', 'A', '!@#$%^&*()'],
    notes: 'Description quality affects risk review and supportability.',
  },
  {
    key: 'website',
    displayName: 'Website',
    businessSection: 'Contact',
    fieldTypes: ['website', 'url'],
    labelPatterns: [/website/i, /business\s*(url|site)/i, /homepage/i, /domain/i],
    jsonKeyPatterns: [/merchantData\.businessWebsite$/i],
    bestPracticeValidations: URL_MATRIX,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'medium',
    validExamples: ['https://example.com', 'example.com'],
    invalidExamples: ['htp:/bad', 'https://exam ple.com'],
    notes: 'Website validation should make accepted domain/URL formats clear.',
  },
  {
    key: 'email',
    displayName: 'Email',
    businessSection: 'Contact',
    fieldTypes: ['email', 'signer_email'],
    labelPatterns: [/e-?mail/i, /contact\s*email/i, /business\s*email/i],
    jsonKeyPatterns: [/merchantData\.businessEmail$/i],
    bestPracticeValidations: EMAIL_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['qa.signer@example.com'],
    invalidExamples: ['qa.signerexample.com', 'qa.signer@', 'qa signer@example.com'],
    notes: 'Email is a primary contact and notification channel.',
  },
  {
    key: 'stakeholder_email',
    displayName: 'Stakeholder Email',
    businessSection: 'Stakeholder',
    fieldTypes: ['email', 'signer_email'],
    labelPatterns: [/e-?mail/i, /email\s*address/i, /owner\s*email/i, /principal\s*email/i, /stakeholder.*email/i],
    jsonKeyPatterns: [/merchantData\.stakeholders\[\d+\]\.email$/i],
    bestPracticeValidations: EMAIL_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['owner@example.com'],
    invalidExamples: ['ownerexample.com', 'owner@', 'owner @example.com'],
    notes: 'Stakeholder email targets beneficial-owner contact data and should stay anchored to stakeholder-only fields.',
  },
  {
    key: 'phone',
    displayName: 'Phone',
    businessSection: 'Contact',
    fieldTypes: ['phone_e164', 'signer_phone'],
    labelPatterns: [/phone/i, /mobile/i, /cell/i, /contact\s*number/i, /business\s*phone/i],
    jsonKeyPatterns: [/merchantData\.businessPhone$/i],
    bestPracticeValidations: PHONE_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['+15551234567', '(555) 123-4567'],
    invalidExamples: ['callmemaybe', '555', '+1555123456789012'],
    notes: 'Phone validation should be explicit about E.164 vs local-format handling.',
  },
  {
    key: 'stakeholder_phone',
    displayName: 'Stakeholder Phone',
    businessSection: 'Stakeholder',
    fieldTypes: ['phone_e164', 'signer_phone'],
    labelPatterns: [/phone/i, /mobile/i, /cell/i, /phone\s*number/i, /owner\s*phone/i, /stakeholder.*phone/i],
    jsonKeyPatterns: [/merchantData\.stakeholders\[\d+\]\.(phoneNumber|phone)$/i],
    bestPracticeValidations: PHONE_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['+15551234567', '(555) 123-4567'],
    invalidExamples: ['callmemaybe', '555', '+1555123456789012'],
    notes: 'Stakeholder phone targets owner contact data and should not reuse business-contact anchors from page 1.',
  },
  {
    key: 'ein',
    displayName: 'EIN',
    businessSection: 'Business Details',
    fieldTypes: ['ein', 'tax_id_ein'],
    labelPatterns: [/\bein\b/i, /employer\s*identification/i, /federal\s*(tax\s*)?id/i, /fein/i],
    jsonKeyPatterns: [/merchantData\.(ein|federalTaxId|taxId)$/i],
    bestPracticeValidations: EIN_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['12-3456789', '123456789'],
    invalidExamples: ['AB-CDEFGHI', '12-345', '12-34567890'],
    notes: 'Tax IDs need strict format handling and should avoid accepting fake-looking values when possible.',
  },
  {
    key: 'ssn',
    displayName: 'SSN',
    businessSection: 'Stakeholder',
    fieldTypes: ['ssn'],
    labelPatterns: [/\bssn\b/i, /social\s*security/i],
    jsonKeyPatterns: [/stakeholders\[\d+\]\.(ssn|socialSecurity)/i],
    bestPracticeValidations: SSN_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['123-45-6789', '123456789'],
    invalidExamples: ['ABC-DE-FGHI', '123', '123-45-67890'],
    notes: 'SSN fields are sensitive and should be validated without exposing raw values in artifacts.',
  },
  {
    key: 'date_of_birth',
    displayName: 'Date of Birth',
    businessSection: 'Stakeholder',
    fieldTypes: ['date_of_birth', 'dob'],
    labelPatterns: [/date\s*of\s*birth/i, /birth\s*date/i, /birthdate/i, /\bdob\b/i],
    jsonKeyPatterns: [/stakeholders\[\d+\]\.dateOfBirth$/i],
    bestPracticeValidations: DOB_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['1990-01-15', '01/15/1990'],
    invalidExamples: ['yesterday', '1990-02-31', '2099-01-01'],
    notes: 'DOB validation should confirm valid dates, past dates, and age-policy behavior.',
  },
  {
    key: 'registration_date',
    displayName: 'Registration Date',
    businessSection: 'Business Details',
    fieldTypes: ['formation_date', 'incorporation_date'],
    labelPatterns: [/registration\s*date/i, /formation\s*date/i, /incorporation\s*date/i, /business\s*start\s*date/i],
    jsonKeyPatterns: [/merchantData\.(registrationDate|formationDate|incorporationDate)$/i],
    bestPracticeValidations: DATE_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['2020-06-15', '06/15/2020'],
    invalidExamples: ['tomorrow', '2024-02-31'],
    notes: 'Business dates should reject impossible dates and document format expectations.',
  },
  {
    key: 'legal_entity_type',
    displayName: 'Legal Entity Type',
    businessSection: 'Business Details',
    fieldTypes: ['legal_entity_type'],
    labelPatterns: [/legal\s*entity\s*type/i, /entity\s*type/i, /business\s*(structure|type)/i, /tax\s*classification/i],
    jsonKeyPatterns: [/merchantData\.(legalEntityType|businessType|taxClassification)$/i],
    bestPracticeValidations: DROPDOWN_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['LLC', 'Corporation', 'Sole Proprietor'],
    invalidExamples: ['', 'Not a real entity'],
    notes: 'Legal entity type should be a controlled choice with clear required behavior.',
  },
  {
    key: 'naics',
    displayName: 'NAICS',
    businessSection: 'Business Details',
    fieldTypes: ['naics'],
    labelPatterns: [/\bnaics\b/i, /industry\s*code/i],
    jsonKeyPatterns: [/merchantData\.naicsCode$/i],
    bestPracticeValidations: CODE_MATRIX,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'medium',
    validExamples: ['722511'],
    invalidExamples: ['7', 'ABCDEF'],
    notes: 'NAICS values should be numeric and match the intended code length or selection model.',
  },
  {
    key: 'merchant_category_code',
    displayName: 'Merchant Category Code',
    businessSection: 'Business Details',
    fieldTypes: ['mcc'],
    labelPatterns: [/merchant\s*category\s*code/i, /\bmcc\b/i],
    jsonKeyPatterns: [/merchantData\.merchantCategoryCode$/i],
    bestPracticeValidations: CODE_MATRIX,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'medium',
    validExamples: ['5812'],
    invalidExamples: ['58', 'ABCD'],
    notes: 'MCC values should be exactly controlled to underwriting policy.',
  },
  {
    key: 'address_line_1',
    displayName: 'Address Line 1',
    businessSection: 'Address',
    fieldTypes: ['address_line_1'],
    labelPatterns: [/address.*line\s*1/i, /line\s*1/i, /street\s*address/i, /address1/i],
    jsonKeyPatterns: [/Address\.line1$/i, /Address\.Line1$/i],
    bestPracticeValidations: ADDRESS_TEXT_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['123 Main St'],
    invalidExamples: ['', '!@#$%^&*()'],
    notes: 'Primary street address should be required for most merchant/stakeholder address groups.',
  },
  {
    key: 'address_line_2',
    displayName: 'Address Line 2',
    businessSection: 'Address',
    fieldTypes: ['address_line_2'],
    labelPatterns: [/address.*line\s*2/i, /line\s*2/i, /apt/i, /suite/i, /unit\b/i, /address2/i],
    jsonKeyPatterns: [/Address\.line2$/i, /Address\.Line2$/i],
    bestPracticeValidations: ADDRESS_TEXT_MATRIX.filter((item) => item.id !== 'empty-required-behavior'),
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'low',
    validExamples: ['Suite 400'],
    invalidExamples: ['!@#$%^&*()'],
    notes: 'Secondary address fields are often optional but should still handle length and punctuation.',
  },
  {
    key: 'city',
    displayName: 'City',
    businessSection: 'Address',
    fieldTypes: ['city'],
    labelPatterns: [/\bcity\b/i, /town/i, /locality/i],
    jsonKeyPatterns: [/Address\.city$/i, /Address\.City$/i],
    bestPracticeValidations: [
      v('valid-city-accepted', 'Valid city accepted', 'A realistic city value is accepted.', 'critical', ['valid-typical'], 'Confirms normal city entry works.'),
      v('digits-rejected-or-flagged', 'Digits rejected or flagged', 'Pure numeric city values are rejected or flagged.', 'medium', ['digits'], 'City names should generally not be numeric.'),
      v('excessive-length-behavior', 'Excessive length behavior', 'An excessive length city is constrained or handled intentionally.', 'medium', ['too-long'], 'Prevents impractical address values.'),
      EMPTY_REQUIRED,
    ],
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['Boston'],
    invalidExamples: ['123', ''],
    notes: 'City validation can be light but should catch obvious non-city values.',
  },
  {
    key: 'state',
    displayName: 'State',
    businessSection: 'Address',
    fieldTypes: ['state', 'state_region'],
    labelPatterns: [/\bstate\b/i, /province/i, /region/i],
    jsonKeyPatterns: [/Address\.(state|State|region|Region)$/i],
    bestPracticeValidations: STATE_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['MA', 'CA'],
    invalidExamples: ['ZZ', '12'],
    notes: 'State values should match the supported country model.',
  },
  {
    key: 'postal_code',
    displayName: 'Postal Code',
    businessSection: 'Address',
    fieldTypes: ['zip', 'zip_postal_code'],
    labelPatterns: [/postal\s*code/i, /post\s*code/i, /\bzip\b/i],
    jsonKeyPatterns: [/Address\.(postalCode|PostalCode|zip|Zip)$/i],
    bestPracticeValidations: POSTAL_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['02115', '02115-1234'],
    invalidExamples: ['021', 'ABCDE'],
    notes: 'Postal validation should match the countries actually supported by the flow. In this Batch 1 US ZIP context, alphabetic values should be treated as invalid when field-local ZIP validation is shown.',
  },
  {
    key: 'country',
    displayName: 'Country',
    businessSection: 'Address',
    fieldTypes: ['country'],
    labelPatterns: [/country/i],
    jsonKeyPatterns: [/Address\.(country|Country)$/i],
    bestPracticeValidations: COUNTRY_MATRIX,
    missingValidationSeverity: 'medium',
    weakValidationSeverity: 'medium',
    validExamples: ['United States', 'US'],
    invalidExamples: ['Zzzland'],
    notes: 'Country behavior should be clear, especially if only US onboarding is supported.',
  },
  {
    key: 'bank_name',
    displayName: 'Bank Name',
    businessSection: 'Banking',
    fieldTypes: ['bank_name'],
    labelPatterns: [/bank\s*name/i, /financial\s*institution/i, /name\s*of\s*bank/i],
    jsonKeyPatterns: [/merchantData\.bankName$/i],
    bestPracticeValidations: TEXT_LENGTH_AND_CONTENT,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['Bank of Example'],
    invalidExamples: ['', '!@#$%^&*()'],
    notes: 'Bank name supports payout setup review and should reject obvious garbage.',
  },
  {
    key: 'routing_number',
    displayName: 'Bank Routing Number',
    businessSection: 'Banking',
    fieldTypes: ['routing_number'],
    labelPatterns: [/routing/i, /\baba\b/i],
    jsonKeyPatterns: [/merchantData\.(routingNumber|bankRoutingNumber)$/i],
    bestPracticeValidations: ROUTING_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['011000015'],
    invalidExamples: ['ABCDEFGHI', '123', '1234567890'],
    notes: 'Routing-number validation should go beyond length when checksum validation is available.',
  },
  {
    key: 'account_number',
    displayName: 'Bank Account Number',
    businessSection: 'Banking',
    fieldTypes: ['account_number'],
    labelPatterns: [/account\s*number/i, /acct\s*no/i, /bank\s*account/i],
    jsonKeyPatterns: [/merchantData\.(accountNumber|bankAccountNumber)$/i],
    bestPracticeValidations: ACCOUNT_NUMBER_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['12345678'],
    invalidExamples: ['ABC123', '123', '1111111111111111111111111'],
    notes: 'Bank account number checks should validate numeric content and practical length.',
  },
  {
    key: 'bank_account_type',
    displayName: 'Bank Account Type',
    businessSection: 'Banking',
    fieldTypes: ['bank_account_type'],
    labelPatterns: [/bank\s*account\s*type/i, /account\s*type/i, /checking/i, /savings/i],
    jsonKeyPatterns: [/merchantData\.bankAccountType$/i],
    bestPracticeValidations: DROPDOWN_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['Checking', 'Savings'],
    invalidExamples: ['', 'Crypto Wallet'],
    notes: 'Bank account type should be a controlled choice.',
  },
  {
    key: 'annual_revenue',
    displayName: 'Annual Revenue',
    businessSection: 'Processing & Financials',
    fieldTypes: ['annual_revenue'],
    labelPatterns: [/annual\s*revenue/i, /annual\s*sales/i, /yearly\s*(revenue|sales)/i],
    jsonKeyPatterns: [/merchantData\.annualRevenue$/i],
    bestPracticeValidations: MONEY_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['500000', '1,000,000.00'],
    invalidExamples: ['a lot', '-100'],
    notes: 'Revenue values feed underwriting and should reject non-numeric or negative input.',
  },
  {
    key: 'highest_monthly_volume',
    displayName: 'Highest Monthly Volume',
    businessSection: 'Processing & Financials',
    fieldTypes: ['monthly_volume'],
    labelPatterns: [/highest\s*monthly\s*volume/i, /monthly\s*(processing\s*)?volume/i, /monthly\s*sales/i],
    jsonKeyPatterns: [/merchantData\.(highestMonthlyVolume|monthlyVolume)$/i],
    bestPracticeValidations: MONEY_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['25000'],
    invalidExamples: ['high', '-50'],
    notes: 'Processing-volume values need numeric validation and policy-driven range checks.',
  },
  {
    key: 'average_ticket',
    displayName: 'Average Ticket',
    businessSection: 'Processing & Financials',
    fieldTypes: ['average_ticket'],
    labelPatterns: [/average\s*(ticket|transaction)/i, /avg\s*(ticket|sale)/i],
    jsonKeyPatterns: [/merchantData\.(averageTicket|avgTicket)$/i],
    bestPracticeValidations: MONEY_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['75', '605.00'],
    invalidExamples: ['medium', '-5'],
    notes: 'Average-ticket values should be numeric and non-negative.',
  },
  {
    key: 'max_ticket',
    displayName: 'Max Ticket',
    businessSection: 'Processing & Financials',
    fieldTypes: [],
    labelPatterns: [/max(imum)?\s*(ticket|transaction)/i, /largest\s*(ticket|transaction)/i],
    jsonKeyPatterns: [/merchantData\.(maxTicket|maximumTicket)$/i],
    bestPracticeValidations: MONEY_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['1500', '1,815.00'],
    invalidExamples: ['huge', '-10'],
    notes: 'Maximum-ticket values should be numeric and should support policy thresholds.',
  },
  {
    key: 'ownership_percentage',
    displayName: 'Ownership Percentage',
    businessSection: 'Stakeholder',
    fieldTypes: ['ownership_percent', 'percent'],
    labelPatterns: [/ownership\s*(percentage|percent|pct|%)/i, /percent\s*owned/i],
    jsonKeyPatterns: [/stakeholders\[\d+\]\.ownershipPercentage$/i],
    bestPracticeValidations: PERCENT_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['50', '100'],
    invalidExamples: ['150', '-5', 'fifty'],
    notes: 'Ownership percentages need range validation and should align with beneficial-owner policy.',
  },
  {
    key: 'document_type',
    displayName: 'Document Type',
    businessSection: 'Attachments',
    fieldTypes: ['document_type', 'proof_type'],
    labelPatterns: [/document\s*type/i, /proof\s*of\s*business/i, /id\s*type/i, /identification\s*type/i],
    jsonKeyPatterns: [/merchantData\.(documentType|proofOfBusinessType|federalTaxIdType)$/i],
    bestPracticeValidations: DROPDOWN_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['Business License', 'Driver License', 'Passport'],
    invalidExamples: ['', 'Unsupported Document'],
    notes: 'Document type should be controlled and should align with upload requirements.',
  },
  {
    key: 'upload',
    displayName: 'Upload',
    businessSection: 'Attachments',
    fieldTypes: ['upload', 'file_upload'],
    labelPatterns: [/upload/i, /attach\s*(file|document)/i, /choose\s*file/i, /signerattachment/i],
    jsonKeyPatterns: [/attachment|upload/i],
    bestPracticeValidations: UPLOAD_MATRIX,
    missingValidationSeverity: 'high',
    weakValidationSeverity: 'medium',
    validExamples: ['PDF business license', 'PNG ID image'],
    invalidExamples: ['Unsupported file type', 'Oversized file'],
    notes: 'Upload validation should be verified without exposing private documents in artifacts.',
  },
  {
    key: 'acknowledgement_checkbox',
    displayName: 'Acknowledgement Checkbox',
    businessSection: 'Agreements / Signature',
    fieldTypes: ['acknowledgement_checkbox', 'checkbox_acknowledgement'],
    labelPatterns: [/acknowledge/i, /i\s*agree/i, /consent/i, /certif/i, /authoriz/i, /terms/i],
    jsonKeyPatterns: [/acknowledge|consent|certif|terms/i],
    bestPracticeValidations: ACK_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['Checked acknowledgement'],
    invalidExamples: ['Unchecked required acknowledgement'],
    notes: 'Acknowledgement fields should make consent state and required behavior explicit.',
  },
  {
    key: 'signature',
    displayName: 'Signature',
    businessSection: 'Agreements / Signature',
    fieldTypes: ['signature'],
    labelPatterns: [/signature/i, /sign\s*here/i, /signhere/i],
    jsonKeyPatterns: [/signature|signHere/i],
    bestPracticeValidations: SIGNATURE_MATRIX,
    missingValidationSeverity: 'critical',
    weakValidationSeverity: 'high',
    validExamples: ['Signed via DocuSign adoption flow'],
    invalidExamples: ['Missing required signature'],
    notes: 'Signature/adoption validation must remain gated to disposable envelopes only.',
  },
];

export const FIELD_CONCEPT_REGISTRY: Record<FieldConceptKey, FieldConceptDefinition> = Object.fromEntries(
  FIELD_CONCEPTS.map((concept) => [concept.key, concept]),
) as Record<FieldConceptKey, FieldConceptDefinition>;

export function getFieldConcept(key: FieldConceptKey): FieldConceptDefinition {
  return FIELD_CONCEPT_REGISTRY[key];
}
