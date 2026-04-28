import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Locator } from '@playwright/test';
import {
  FIELD_CONCEPT_REGISTRY,
  type BestPracticeValidation,
  type FieldConceptKey,
  type ValidationExpectationSeverity,
} from './field-concepts';
import type { DiscoveredField } from './field-discovery';
import type { FieldRecord, ValidationReport } from './validation-report';
import { buildValidationScorecard, loadMappingCalibration, type ScorecardFieldMatch } from './validation-scorecard';
import type { FrameHost } from './signer-helpers';
import { selectBestMappingCandidate } from '../lib/mapping-calibration';

export const INTERACTIVE_RESULTS_JSON = 'latest-interactive-validation-results.json';
export const INTERACTIVE_RESULTS_MD = 'latest-interactive-validation-results.md';
export const INTERACTIVE_TARGET_DIAGNOSTICS_JSON = 'latest-interactive-target-diagnostics.json';
export const INTERACTIVE_TARGET_DIAGNOSTICS_MD = 'latest-interactive-target-diagnostics.md';

export const INTERACTIVE_TARGET_CONCEPTS = [
  'website',
  'date_of_birth',
  'registration_date',
  'email',
  'stakeholder_email',
  'phone',
  'stakeholder_phone',
  'business_name',
  'dba_name',
  'business_description',
  'naics',
  'merchant_category_code',
  'ownership_percentage',
  'postal_code',
  'bank_name',
  'legal_entity_type',
  'business_type',
  'bank_account_type',
  'federal_tax_id_type',
  'proof_of_business_type',
  'proof_of_address_type',
  'proof_of_bank_account_type',
] as const satisfies readonly FieldConceptKey[];

const INTERACTIVE_TARGET_ALIASES: Record<string, InteractiveTargetConcept> = {
  stakeholder_date_of_birth: 'date_of_birth',
  account_type: 'bank_account_type',
  location_business_type: 'business_type',
};

export type InteractiveTargetConcept = typeof INTERACTIVE_TARGET_CONCEPTS[number];
export type InteractiveResultStatus = 'passed' | 'failed' | 'warning' | 'manual_review' | 'skipped';
export type InteractiveResultOutcome =
  | 'passed'
  | 'product_failure'
  | 'tool_mapping_suspect'
  | 'error_ownership_suspect'
  | 'observer_ambiguous'
  | 'mapping_not_confident';
export type InteractiveExpectedBehavior =
  | 'accept'
  | 'reject'
  | 'reject_or_warn'
  | 'reject_or_manual_review'
  | 'document'
  | 'observe';
export type InteractiveReasonCode =
  | 'none'
  | 'target_mapping_not_trusted'
  | 'error_ownership_suspect'
  | 'observer_ambiguous'
  | 'product_failure'
  | 'interaction_error';
export type InteractiveTargetConfidence = 'trusted' | 'tool_mapping_suspect' | 'mapping_not_confident';

export interface InteractiveGuardState {
  INTERACTIVE_VALIDATION: boolean;
  DISPOSABLE_ENVELOPE: boolean;
}

export type InteractiveInteractionKind =
  | 'fill'
  | 'observe_current'
  | 'select_alternate'
  | 'invalid_freeform'
  | 'clear_if_supported';

export type InteractiveControlKind = 'native-select' | 'combobox' | 'checkbox' | 'radio' | 'text' | 'unsupported';

export interface InteractiveControlDescriptor {
  kind: InteractiveControlKind;
  tagName: string | null;
  role: string | null;
  inputType: string | null;
  options: Array<{ value: string; label: string }>;
  supportsFreeText: boolean;
  canClear: boolean;
}

interface MatrixCaseDefinition {
  validationId: string;
  caseName: string;
  testName: string;
  inputValue: string;
  expectedBehavior: InteractiveExpectedBehavior;
  interactionKind?: InteractiveInteractionKind;
}

export interface InteractiveLocatorStrategy {
  primary: 'live-discovery-field-index';
  fieldIndex: number;
  displayName: string;
  inferredType: string;
  confidence: string;
  fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input';
}

export interface InteractiveTargetProfile {
  intendedFieldDisplayName: string;
  intendedBusinessSection: string | null;
  intendedSectionName: string | null;
  jsonKeyPath: string | null;
  enrichmentMatchedBy: 'guid' | 'position' | 'coordinate' | null;
  enrichmentPositionalFingerprint: string | null;
  inferredType: string;
  labelSource: string;
  labelConfidence: string;
  mappingConfidence: string;
  tabGuid: string | null;
  docusignTabType: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  expectedPageIndex: number | null;
  expectedOrdinalOnPage: number | null;
  expectedDocusignFieldFamily: string | null;
  coordinates: {
    left: number | null;
    top: number | null;
    width: number | null;
    height: number | null;
  };
  expectedCoordinates: {
    left: number | null;
    top: number | null;
  };
}

export interface InteractiveValidationCase {
  id: string;
  concept: FieldConceptKey;
  conceptDisplayName: string;
  fieldLabel: string;
  targetField: InteractiveLocatorStrategy;
  targetProfile: InteractiveTargetProfile;
  validationId: string;
  caseName: string;
  testName: string;
  inputValue: string;
  expectedBehavior: string;
  expectedSignal: InteractiveExpectedBehavior;
  interactionKind: InteractiveInteractionKind;
  severity: ValidationExpectationSeverity;
  cleanupStrategy: 'restore_original_value_then_blur';
  safetyNotes: string[];
}

export interface InteractiveSkippedConcept {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  status: 'skipped';
  reason: string;
}

export interface InteractiveValidationPlan {
  schemaVersion: 1;
  generatedAt: string;
  sourceReport: {
    runStartedAt: string;
    runFinishedAt: string;
  };
  targetConcepts: FieldConceptKey[];
  cases: InteractiveValidationCase[];
  skippedConcepts: InteractiveSkippedConcept[];
}

export interface InteractiveObservation {
  ariaInvalid: string | null;
  validationMessage: string | null;
  nearbyErrorText: string | null;
  docusignValidationText: string[];
  invalidIndicators: string[];
  ignoredDiagnostics: string[];
  ownershipSuspectText: string[];
  evidenceItems: InteractiveEvidenceItem[];
  observedValue: string | null;
  normalizedOrReformatted: boolean;
  inputPrevented: boolean;
  controlKind?: InteractiveControlKind;
  optionsDiscoverable?: boolean;
  freeTextEntryImpossible?: boolean;
  valueChangedFromOriginal?: boolean;
}

export type ValidationCandidateSource =
  | 'aria-errormessage'
  | 'aria-describedby'
  | 'direct-field-container'
  | 'same-tab-wrapper';

export type InteractiveEvidenceSource =
  | ValidationCandidateSource
  | 'aria-invalid'
  | 'native-validation-message'
  | 'invalid-indicator';

export interface InteractiveEvidenceItem {
  source: InteractiveEvidenceSource;
  text: string;
  associatedWithSameElement: boolean;
  associatedWithSameTabGuid: boolean | null;
  otherFieldTypeHints: string[];
  classification: 'field-local' | 'ignored' | 'other-field-type-suspect';
}

export interface RawValidationCandidate {
  source: ValidationCandidateSource;
  text: string;
  associatedWithSameElement: boolean;
  associatedWithSameTabGuid: boolean | null;
}

export interface FieldLocalValidationDiagnostics {
  fieldLocalTexts: string[];
  docusignLocalTexts: string[];
  ignoredTexts: string[];
  ownershipSuspectTexts: string[];
  evidenceItems: InteractiveEvidenceItem[];
}

export interface InteractiveElementSignature {
  id: string | null;
  name: string | null;
  ariaLabel: string | null;
  title: string | null;
  role: string | null;
  tagName: string | null;
  type: string | null;
  inputMode: string | null;
  autocomplete: string | null;
  placeholder: string | null;
  docusignTabType: string | null;
}

export interface InteractiveTargetDiagnostics {
  intendedFieldDisplayName: string;
  intendedBusinessSection: string | null;
  intendedSectionName: string | null;
  inferredType: string;
  labelSource: string;
  labelConfidence: string;
  mappingConfidence: string;
  tabGuid: string | null;
  docusignTabType: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  coordinates: {
    left: number | null;
    top: number | null;
    width: number | null;
    height: number | null;
  };
  locatorStrategy: string;
  actualElement: InteractiveElementSignature;
  actualFieldSignature: string;
  targetConfidence: InteractiveTargetConfidence;
  targetConfidenceReason: string;
  mappingDecisionReason: string | null;
  mappingShiftReason: string | null;
  mappingFlags: string[];
  actualValueBeforeTest: string | null;
  attemptedValue: string;
  actualValueAfterFill: string | null;
  actualValueAfterBlur: string | null;
  restoredValue: string | null;
  restoreSucceeded: boolean | null;
}

export interface InteractiveTargetDiagnosticsFile {
  schemaVersion: 1;
  runStartedAt: string;
  runFinishedAt: string;
  summary: {
    total: number;
    trusted: number;
    tool_mapping_suspect: number;
    mapping_not_confident: number;
    error_ownership_suspect: number;
    product_failure: number;
    observer_ambiguous: number;
    passed: number;
    skipped: number;
    manual_review: number;
  };
  rows: Array<{
    concept: FieldConceptKey;
    conceptDisplayName: string;
    testName: string;
    intendedField: string;
    actualFieldSignature: string;
    targetConfidence: InteractiveTargetConfidence;
    targetConfidenceReason: string;
    mappingDecisionReason: string | null;
    mappingShiftReason: string | null;
    mappingFlags: string[];
    valueBefore: string | null;
    attemptedValue: string | null;
    valueAfter: string | null;
    restore: string | null;
    restoreSucceeded: boolean | null;
    errorEvidence: string;
    status: InteractiveResultStatus;
    outcome: InteractiveResultOutcome;
    interpretation: string;
  }>;
}

export interface InteractiveValidationResult {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  fieldLabel: string | null;
  targetField: InteractiveLocatorStrategy | null;
  validationId: string;
  caseName: string;
  testName: string;
  inputValue: string | null;
  expectedBehavior: string;
  severity: ValidationExpectationSeverity;
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  reasonCode: InteractiveReasonCode;
  observation: InteractiveObservation | null;
  targetDiagnostics: InteractiveTargetDiagnostics | null;
  evidence: string;
  interpretation: string;
  recommendation: string;
  cleanupStrategy: string;
  safetyNotes: string[];
  skippedReason?: string;
}

export interface InteractiveValidationResultsFile {
  schemaVersion: 1;
  runStartedAt: string;
  runFinishedAt: string;
  guardState: InteractiveGuardState;
  sourceReport: {
    runStartedAt: string | null;
    runFinishedAt: string | null;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    warning: number;
    manual_review: number;
    skipped: number;
  };
  outcomes: Record<InteractiveResultOutcome, number>;
  targetConcepts: FieldConceptKey[];
  skippedConcepts: InteractiveSkippedConcept[];
  results: InteractiveValidationResult[];
}

interface PreparedInteractiveAction {
  mode: 'fill' | 'select_option' | 'observe_current';
  attemptedValue: string;
  mutated: boolean;
  optionValue?: string;
  freeTextEntryImpossible?: boolean;
}

interface BlockedInteractiveAction {
  status: InteractiveResultStatus;
  detail: string;
}

const LONG_NAME = `Validation Test ${'A'.repeat(180)}`;
const LONG_DESCRIPTION = `This is a disposable validation test description. ${'A'.repeat(420)}`;
const GENERIC_DOCUSIGN_TEXT_RE =
  /attachmentrequired|signerattachment|attachmentoptional|attachmentrequired|select to load content for this page|this link will open in a new window|hide note|show note|view electronic record|press enter to use the screen reader|page\s+\d+\s+of\s+\d+/i;
const AMBIGUOUS_REQUIRED_RE = /^required$/i;
const FIELD_LOCAL_MESSAGE_RE = /(invalid|must\b|format\b|enter\b|between\b|too\s+(short|long)|minimum|max(imum)?|whole number|email|phone|website|url|domain|zip|postal|naics|merchant category|date of birth|date)/i;
const STRONG_LABEL_SOURCES = new Set([
  'aria-label',
  'aria-labelledby',
  'label-for',
  'wrapping-label',
  'title',
  'placeholder',
  'enrichment-guid',
]);
const SECTION_TOKENS: Record<string, string[]> = {
  'Business Details': ['business', 'merchant', 'company', 'entity', 'registration'],
  'Contact': ['contact', 'email', 'phone'],
  'Stakeholder': ['stakeholder', 'owner', 'principal', 'beneficial'],
  'Address': ['address', 'postal', 'zip', 'location'],
  'Banking': ['bank', 'banking', 'deposit', 'account', 'routing'],
};
const SIGNATURE_FAMILY_PATTERNS: Array<{ family: string; pattern: RegExp }> = [
  { family: 'email', pattern: /\b(e-?mail|email address|@)\b/i },
  { family: 'phone', pattern: /\b(phone|telephone|e\.164|phone number|tel)\b|\+1\d{6,}/i },
  { family: 'url', pattern: /\b(website|url|homepage|domain)\b|https?:\/\/\S+|www\./i },
  { family: 'date', pattern: /\b(date of birth|dob|yyyy\/mm\/dd|mm\/dd\/yyyy|enter date|birth date|date)\b/i },
  { family: 'postal', pattern: /\b(zip|postal\s*code|post\s*code)\b/i },
  { family: 'percentage', pattern: /\b(percent|percentage|pct|%)\b/i },
  { family: 'description', pattern: /\b(business description|description|nature of business|describe)\b/i },
  { family: 'bank', pattern: /\b(bank|routing|account number|account type|deposit)\b/i },
  { family: 'name', pattern: /\b(name|business name|registered name|dba)\b/i },
];
const PRIMARY_FAMILY_BY_CONCEPT: Partial<Record<FieldConceptKey, string>> = {
  website: 'url',
  email: 'email',
  stakeholder_email: 'email',
  phone: 'phone',
  stakeholder_phone: 'phone',
  bank_name: 'bank',
  date_of_birth: 'date',
  registration_date: 'date',
  postal_code: 'postal',
  ownership_percentage: 'percentage',
  business_name: 'name',
  dba_name: 'name',
  business_description: 'description',
};
const BLOCKED_SIGNATURE_FAMILIES: Partial<Record<FieldConceptKey, string[]>> = {
  website: ['email', 'phone', 'bank', 'date', 'name', 'postal', 'percentage', 'description'],
  bank_name: ['phone', 'email', 'date', 'postal', 'percentage', 'description'],
  phone: ['email', 'bank', 'date', 'name', 'postal', 'percentage', 'description'],
  stakeholder_phone: ['email', 'bank', 'date', 'name', 'postal', 'percentage', 'description'],
  email: ['phone', 'bank', 'date', 'name', 'postal', 'percentage', 'description'],
  stakeholder_email: ['phone', 'bank', 'date', 'name', 'postal', 'percentage', 'description'],
  registration_date: ['email', 'phone', 'url', 'bank', 'name', 'postal', 'percentage', 'description'],
  postal_code: ['email', 'phone', 'url', 'bank', 'date', 'name', 'percentage', 'description'],
  ownership_percentage: ['email', 'phone', 'url', 'bank', 'date', 'name', 'postal', 'description'],
  business_name: ['email', 'phone', 'url', 'bank', 'date', 'postal', 'percentage', 'description'],
  dba_name: ['email', 'phone', 'url', 'bank', 'date', 'postal', 'percentage', 'description'],
  business_description: ['email', 'phone', 'url', 'bank', 'date', 'postal', 'percentage'],
};
const CONTROLLED_CHOICE_CONCEPTS = new Set<FieldConceptKey>([
  'legal_entity_type',
  'business_type',
  'bank_account_type',
  'federal_tax_id_type',
  'proof_of_business_type',
  'proof_of_address_type',
  'proof_of_bank_account_type',
]);

const TEXT_FIELD_MATRIX: MatrixCaseDefinition[] = [
  {
    validationId: 'normal-value-accepted',
    caseName: 'normal-value',
    testName: 'normal value accepted',
    inputValue: 'Test Business LLC',
    expectedBehavior: 'accept',
  },
  {
    validationId: 'very-short-behavior',
    caseName: 'single-char',
    testName: 'very short value behavior observed',
    inputValue: 'A',
    expectedBehavior: 'reject_or_manual_review',
  },
  {
    validationId: 'excessive-length-behavior',
    caseName: 'excessive-length',
    testName: 'excessive length behavior observed',
    inputValue: LONG_NAME,
    expectedBehavior: 'observe',
  },
  {
    validationId: 'special-characters-behavior',
    caseName: 'suspicious-garbage',
    testName: 'special characters behavior observed',
    inputValue: '!@#$%^&*()',
    expectedBehavior: 'observe',
  },
  {
    validationId: 'empty-required-behavior',
    caseName: 'empty-required',
    testName: 'empty required behavior observed',
    inputValue: '',
    expectedBehavior: 'reject_or_manual_review',
  },
];

const CONTROLLED_CHOICE_MATRIX: MatrixCaseDefinition[] = [
  {
    validationId: 'current-option-documented',
    caseName: 'observe-current',
    testName: 'current/default value observed',
    inputValue: '(current value)',
    expectedBehavior: 'document',
    interactionKind: 'observe_current',
  },
  {
    validationId: 'valid-option-accepted',
    caseName: 'alternate-option',
    testName: 'valid alternate option selected and retained',
    inputValue: '(alternate listed option)',
    expectedBehavior: 'accept',
    interactionKind: 'select_alternate',
  },
  {
    validationId: 'invalid-freeform-rejected',
    caseName: 'invalid-option',
    testName: 'invalid free-text entry rejected or impossible',
    inputValue: '(free-text entry outside option set)',
    expectedBehavior: 'document',
    interactionKind: 'invalid_freeform',
  },
  {
    validationId: 'empty-required-behavior',
    caseName: 'empty-required',
    testName: 'empty required behavior observed when clearing is supported',
    inputValue: '',
    expectedBehavior: 'reject_or_manual_review',
    interactionKind: 'clear_if_supported',
  },
];

const MATRIX_BY_CONCEPT: Record<InteractiveTargetConcept, MatrixCaseDefinition[]> = {
  website: [
    {
      validationId: 'valid-https-accepted',
      caseName: 'valid-https',
      testName: 'valid HTTPS URL accepted',
      inputValue: 'https://example.test',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'missing-protocol-behavior',
      caseName: 'missing-protocol',
      testName: 'missing protocol behavior observed',
      inputValue: 'example.test',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'malformed-url-rejected',
      caseName: 'malformed',
      testName: 'malformed URL rejected',
      inputValue: 'not a url',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'spaces-rejected',
      caseName: 'spaces',
      testName: 'URL containing spaces rejected',
      inputValue: 'https://example .test',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  date_of_birth: [
    {
      validationId: 'valid-adult-dob-accepted',
      caseName: 'valid-adult-dob',
      testName: 'valid adult DOB accepted',
      inputValue: '1990/01/15',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'accepted-date-format-documented',
      caseName: 'valid-us-format',
      testName: 'MM/DD/YYYY format behavior observed',
      inputValue: '01/15/1990',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'abcdef',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'impossible-date-rejected',
      caseName: 'impossible-date',
      testName: 'impossible date rejected',
      inputValue: '1990/02/31',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'future-date-rejected',
      caseName: 'future-date',
      testName: 'future date behavior observed',
      inputValue: '2099/01/01',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'under-age-dob-rejected-or-flagged',
      caseName: 'under-age-dob',
      testName: 'under-age DOB behavior observed',
      inputValue: '2012/01/01',
      expectedBehavior: 'observe',
    },
  ],
  registration_date: [
    {
      validationId: 'valid-date-accepted',
      caseName: 'valid-us',
      testName: 'valid date accepted',
      inputValue: '2020/06/15',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'accepted-date-format-documented',
      caseName: 'valid-us-format',
      testName: 'MM/DD/YYYY format behavior observed',
      inputValue: '06/15/2020',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'abcdef',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'impossible-date-rejected',
      caseName: 'impossible-date',
      testName: 'impossible date rejected',
      inputValue: '2024/02/31',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'future-date-behavior',
      caseName: 'future-date',
      testName: 'future date behavior observed',
      inputValue: '2099/01/01',
      expectedBehavior: 'observe',
    },
  ],
  email: [
    {
      validationId: 'valid-email-accepted',
      caseName: 'valid-email',
      testName: 'valid email accepted',
      inputValue: 'qa.signer@example.com',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      testName: 'missing @ rejected',
      inputValue: 'qa.signerexample.com',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'invalid-domain-rejected',
      caseName: 'invalid-domain',
      testName: 'invalid domain rejected',
      inputValue: 'qa.signer@',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'spaces-rejected',
      caseName: 'spaces',
      testName: 'spaces rejected',
      inputValue: 'qa signer@example.com',
      expectedBehavior: 'reject',
    },
  ],
  stakeholder_email: [
    {
      validationId: 'valid-email-accepted',
      caseName: 'valid-email',
      testName: 'valid stakeholder email accepted',
      inputValue: 'owner@example.test',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      testName: 'missing @ rejected',
      inputValue: 'ownerexample.test',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'invalid-domain-rejected',
      caseName: 'invalid-domain',
      testName: 'invalid domain rejected',
      inputValue: 'owner@',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'spaces-rejected',
      caseName: 'spaces',
      testName: 'spaces rejected',
      inputValue: 'owner @example.test',
      expectedBehavior: 'reject',
    },
  ],
  phone: [
    {
      validationId: 'valid-e164-accepted',
      caseName: 'valid-e164',
      testName: 'valid E.164 accepted',
      inputValue: '+15551234567',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'missing-plus-handling',
      caseName: 'missing-plus',
      testName: 'missing plus sign behavior observed',
      inputValue: '15551234567',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'callmemaybe',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-short-rejected',
      caseName: 'too-short',
      testName: 'too short rejected',
      inputValue: '555',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-long-rejected',
      caseName: 'too-long',
      testName: 'too long rejected',
      inputValue: '+1555123456789012',
      expectedBehavior: 'reject',
    },
  ],
  stakeholder_phone: [
    {
      validationId: 'valid-e164-accepted',
      caseName: 'valid-e164',
      testName: 'valid stakeholder phone accepted',
      inputValue: '+15551234567',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'missing-plus-handling',
      caseName: 'missing-plus',
      testName: 'missing plus sign behavior observed',
      inputValue: '15551234567',
      expectedBehavior: 'observe',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'callmemaybe',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-short-rejected',
      caseName: 'too-short',
      testName: 'too short rejected',
      inputValue: '555',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-long-rejected',
      caseName: 'too-long',
      testName: 'too long behavior observed',
      inputValue: '+1555123456789012',
      expectedBehavior: 'observe',
    },
  ],
  business_name: TEXT_FIELD_MATRIX,
  dba_name: TEXT_FIELD_MATRIX.map((entry) =>
    entry.validationId === 'normal-value-accepted'
      ? { ...entry, inputValue: 'Acme Trade Co' }
      : entry.validationId === 'empty-required-behavior'
        ? { ...entry, expectedBehavior: 'accept', testName: 'empty optional behavior documented' }
        : entry,
  ),
  business_description: [
    {
      validationId: 'normal-text-accepted',
      caseName: 'normal-value',
      testName: 'normal text accepted',
      inputValue: 'We sell handmade ceramics online.',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'very-short-behavior',
      caseName: 'single-char',
      testName: 'very short value behavior observed',
      inputValue: 'A',
      expectedBehavior: 'reject_or_manual_review',
    },
    {
      validationId: 'excessive-length-behavior',
      caseName: 'excessive-length',
      testName: 'excessive length behavior observed',
      inputValue: LONG_DESCRIPTION,
      expectedBehavior: 'reject_or_manual_review',
    },
    {
      validationId: 'garbage-text-rejected-or-flagged',
      caseName: 'suspicious-garbage',
      testName: 'garbage text rejected or flagged',
      inputValue: '!@#$%^&*()',
      expectedBehavior: 'reject_or_warn',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  naics: [
    {
      validationId: 'valid-code-accepted',
      caseName: 'valid-6-digit',
      testName: 'valid code accepted',
      inputValue: '722511',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'ABCDEF',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-short-rejected',
      caseName: 'too-short',
      testName: 'too short rejected',
      inputValue: '7',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  merchant_category_code: [
    {
      validationId: 'valid-code-accepted',
      caseName: 'valid-4-digit',
      testName: 'valid 4-digit MCC accepted',
      inputValue: '5812',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'ABCD',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'too-short-rejected',
      caseName: 'too-short',
      testName: 'too short rejected',
      inputValue: '58',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  ownership_percentage: [
    {
      validationId: 'valid-percent-accepted',
      caseName: 'valid-mid',
      testName: 'valid percentage accepted',
      inputValue: '50',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'over-100-rejected',
      caseName: 'over-100',
      testName: 'over 100 rejected',
      inputValue: '150',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'negative-rejected',
      caseName: 'negative',
      testName: 'negative rejected',
      inputValue: '-5',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'letters-rejected',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'fifty',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  postal_code: [
    {
      validationId: 'valid-postal-code-accepted',
      caseName: 'valid-5',
      testName: 'valid ZIP accepted',
      inputValue: '02115',
      expectedBehavior: 'accept',
    },
    {
      validationId: 'too-short-rejected',
      caseName: 'too-short',
      testName: 'too short rejected',
      inputValue: '021',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'letters-behavior',
      caseName: 'letters',
      testName: 'letters rejected',
      inputValue: 'ABCDE',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'empty-required-behavior',
      caseName: 'empty-required',
      testName: 'empty required behavior observed',
      inputValue: '',
      expectedBehavior: 'reject_or_manual_review',
    },
  ],
  bank_name: TEXT_FIELD_MATRIX.map((entry) =>
    entry.validationId === 'normal-value-accepted'
      ? { ...entry, inputValue: 'Bank of Example' }
      : entry,
  ),
  legal_entity_type: CONTROLLED_CHOICE_MATRIX,
  business_type: CONTROLLED_CHOICE_MATRIX,
  bank_account_type: CONTROLLED_CHOICE_MATRIX,
  federal_tax_id_type: CONTROLLED_CHOICE_MATRIX,
  proof_of_business_type: CONTROLLED_CHOICE_MATRIX,
  proof_of_address_type: CONTROLLED_CHOICE_MATRIX,
  proof_of_bank_account_type: CONTROLLED_CHOICE_MATRIX,
};

export function getInteractiveGuardState(env: NodeJS.ProcessEnv = process.env): InteractiveGuardState {
  return {
    INTERACTIVE_VALIDATION: env.INTERACTIVE_VALIDATION === '1',
    DISPOSABLE_ENVELOPE: env.DISPOSABLE_ENVELOPE === '1',
  };
}

export function resolveInteractiveTargetConcepts(env: NodeJS.ProcessEnv = process.env): InteractiveTargetConcept[] {
  const raw = env.INTERACTIVE_CONCEPTS?.trim();
  if (!raw) return [...INTERACTIVE_TARGET_CONCEPTS];

  const requested = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = new Set<string>([
    ...INTERACTIVE_TARGET_CONCEPTS,
    ...Object.keys(INTERACTIVE_TARGET_ALIASES),
  ]);
  const invalid = requested.filter((value): value is string => !allowed.has(value));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid INTERACTIVE_CONCEPTS value(s): ${invalid.join(', ')}. Allowed concepts: ${[...INTERACTIVE_TARGET_CONCEPTS, ...Object.keys(INTERACTIVE_TARGET_ALIASES)].join(', ')}.`,
    );
  }

  return Array.from(new Set(
    requested.map((value) => INTERACTIVE_TARGET_ALIASES[value] ?? (value as InteractiveTargetConcept)),
  ));
}

export function assertInteractiveValidationGuards(env: NodeJS.ProcessEnv = process.env): void {
  const state = getInteractiveGuardState(env);
  const missing = Object.entries(state)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => `${name}=1`);

  if (missing.length > 0) {
    throw new Error(
      'Interactive validation is disabled. This runner mutates field values on a disposable envelope and requires explicit opt-in.\n' +
      `Missing guard(s): ${missing.join(', ')}.\n` +
      'Set INTERACTIVE_VALIDATION=1 and DISPOSABLE_ENVELOPE=1 only for a disposable DocuSign test envelope.',
    );
  }
}

export function buildInteractiveValidationPlan(
  report: ValidationReport,
  env: NodeJS.ProcessEnv = process.env,
): InteractiveValidationPlan {
  const mappingCalibration = loadMappingCalibration(
    path.resolve(env.INTERACTIVE_MAPPING_CALIBRATION_PATH ?? path.join(process.cwd(), 'artifacts', 'latest-mapping-calibration.json')),
  );
  const scorecard = buildValidationScorecard(report, null, mappingCalibration);
  const scoreByConcept = new Map(scorecard.conceptScores.map((score) => [score.key, score]));
  const cases: InteractiveValidationCase[] = [];
  const skippedConcepts: InteractiveSkippedConcept[] = [];
  const targetConcepts = resolveInteractiveTargetConcepts(env);

  for (const conceptKey of targetConcepts) {
    const concept = FIELD_CONCEPT_REGISTRY[conceptKey];
    const score = scoreByConcept.get(conceptKey);
    const match = score?.mappedFields.find(isConfidentMatch);
    const sourceField = match ? report.fields[match.fieldIndex - 1] : null;

    if (!score?.identifiedWithConfidence || !match || !sourceField) {
      skippedConcepts.push({
        concept: conceptKey,
        conceptDisplayName: concept.displayName,
        status: 'skipped',
        reason: 'field is not confidently mapped in the scorecard source report',
      });
      continue;
    }

    if (sourceField.controlCategory !== 'merchant_input') {
      skippedConcepts.push({
        concept: conceptKey,
        conceptDisplayName: concept.displayName,
        status: 'skipped',
        reason: `mapped field is ${sourceField.controlCategory}, not a merchant input`,
      });
      continue;
    }

    const locatorStrategy: InteractiveLocatorStrategy = {
      primary: 'live-discovery-field-index',
      fieldIndex: match.fieldIndex,
      displayName: match.displayName,
      inferredType: match.inferredType,
      confidence: match.identificationConfidence,
      fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input',
    };

    for (const matrixCase of MATRIX_BY_CONCEPT[conceptKey]) {
      const validation = concept.bestPracticeValidations.find((candidate) => candidate.id === matrixCase.validationId);
      if (!validation) continue;

      cases.push(toInteractiveCase(conceptKey, concept.displayName, match, sourceField, locatorStrategy, validation, matrixCase));
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceReport: {
      runStartedAt: report.runStartedAt,
      runFinishedAt: report.runFinishedAt,
    },
    targetConcepts,
    cases,
    skippedConcepts,
  };
}

export function skippedConceptToResult(skipped: InteractiveSkippedConcept): InteractiveValidationResult {
  return {
    concept: skipped.concept,
    conceptDisplayName: skipped.conceptDisplayName,
    fieldLabel: null,
    targetField: null,
    validationId: 'concept-mapping',
    caseName: 'concept-skipped',
    testName: `${skipped.conceptDisplayName} skipped`,
    inputValue: null,
    expectedBehavior: 'field must be confidently mapped before interactive validation',
    severity: FIELD_CONCEPT_REGISTRY[skipped.concept].missingValidationSeverity,
    status: 'skipped',
    outcome: 'mapping_not_confident',
    reasonCode: 'target_mapping_not_trusted',
    observation: null,
    targetDiagnostics: null,
    evidence: skipped.reason,
    interpretation: 'The target field mapping is not trusted enough to mutate or judge this concept.',
    recommendation: `Confirm the ${skipped.conceptDisplayName} field mapping before running this interactive case.`,
    cleanupStrategy: 'no field mutated',
    safetyNotes: ['No field was mutated for this concept.'],
    skippedReason: skipped.reason,
  };
}

export async function runInteractiveCase(
  testCase: InteractiveValidationCase,
  field: DiscoveredField | null,
  allFields: DiscoveredField[],
  _frame: FrameHost,
): Promise<InteractiveValidationResult> {
  if (!field || field.controlCategory !== 'merchant_input') {
    return skippedCase(testCase, 'target field was not available as a merchant input in live discovery');
  }

  if (!field.visible || !field.editable) {
    return skippedCase(testCase, 'target field was not visible and editable');
  }

  const targetResolution = resolveInteractiveTargetField(testCase, field, allFields);
  const liveField = targetResolution.field;
  const locator = liveField.locator;
  const originalValue = await readControlValue(locator);
  const control = await describeInteractiveControl(locator);
  const actualElement = await readElementSignature(liveField);
  const targetDiagnostics = createTargetDiagnostics(testCase, liveField, actualElement, originalValue);
  const targetVerification = verifyInteractiveTarget(testCase, liveField, actualElement, targetResolution.selection);
  targetDiagnostics.targetConfidence = targetVerification.confidence;
  targetDiagnostics.targetConfidenceReason = targetVerification.reason;
  targetDiagnostics.mappingDecisionReason = targetVerification.decisionReason;
  targetDiagnostics.mappingShiftReason = targetVerification.shiftReason;
  targetDiagnostics.mappingFlags = [...targetVerification.flags];

  let filled = false;
  let interactionMode: PreparedInteractiveAction['mode'] = 'observe_current';
  let result: InteractiveValidationResult;

  try {
    if (targetVerification.confidence !== 'trusted') {
      result = mappingGateResult(testCase, targetDiagnostics, targetVerification);
    } else {
      const preparedAction = isControlledChoiceConcept(testCase.concept)
        ? prepareControlledChoiceInteraction(testCase, control, originalValue)
        : {
          mode: 'fill',
          attemptedValue: testCase.inputValue,
          mutated: true,
        } satisfies PreparedInteractiveAction;

      targetDiagnostics.attemptedValue = sanitizeEvidenceText(preparedAction.attemptedValue);

      if ('detail' in preparedAction) {
        result = interactionBlockedResult(testCase, targetDiagnostics, preparedAction.status, preparedAction.detail);
      } else {
        interactionMode = preparedAction.mode;
        await locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
        await locator.click({ timeout: 3_000 }).catch(() => undefined);

        if (preparedAction.mode === 'fill') {
          await locator.fill(testCase.inputValue, { timeout: 7_500 });
          filled = true;
        } else if (preparedAction.mode === 'select_option') {
          await locator.selectOption({ value: preparedAction.optionValue ?? '' }, { timeout: 7_500 });
          filled = true;
        }

        if (filled) {
          targetDiagnostics.actualValueAfterFill = sanitizeNullable(await readControlValue(locator));
          await locator.blur({ timeout: 3_000 }).catch(() => undefined);
          await waitForClientValidation(locator);
          targetDiagnostics.actualValueAfterBlur = sanitizeNullable(await readControlValue(locator));
        } else {
          targetDiagnostics.actualValueAfterFill = sanitizeNullable(originalValue);
          targetDiagnostics.actualValueAfterBlur = sanitizeNullable(originalValue);
        }

        const observation = await collectObservation(liveField, testCase.concept, preparedAction.attemptedValue, filled);
        observation.controlKind = control.kind;
        observation.optionsDiscoverable = control.options.length > 0;
        observation.freeTextEntryImpossible = Boolean(preparedAction.freeTextEntryImpossible);
        observation.valueChangedFromOriginal = valueChanged(originalValue, targetDiagnostics.actualValueAfterBlur ?? observation.observedValue);
        if (!targetDiagnostics.actualValueAfterBlur) {
          targetDiagnostics.actualValueAfterBlur = observation.observedValue;
        }
        const evaluation = evaluateObservation(testCase, observation, targetDiagnostics);
        const evidence = summarizeObservation(testCase, observation, targetDiagnostics, evaluation);

        result = {
          concept: testCase.concept,
          conceptDisplayName: testCase.conceptDisplayName,
          fieldLabel: testCase.fieldLabel,
          targetField: testCase.targetField,
          validationId: testCase.validationId,
          caseName: testCase.caseName,
          testName: testCase.testName,
          inputValue: preparedAction.attemptedValue,
          expectedBehavior: testCase.expectedBehavior,
          severity: testCase.severity,
          status: evaluation.status,
          outcome: evaluation.outcome,
          reasonCode: evaluation.reasonCode,
          observation,
          targetDiagnostics,
          evidence,
          interpretation: evaluation.interpretation,
          recommendation: recommendationForResult(testCase, evaluation, observation),
          cleanupStrategy: testCase.cleanupStrategy,
          safetyNotes: testCase.safetyNotes,
        };
      }
    }
  } catch (error) {
    result = {
      concept: testCase.concept,
      conceptDisplayName: testCase.conceptDisplayName,
      fieldLabel: testCase.fieldLabel,
      targetField: testCase.targetField,
      validationId: testCase.validationId,
      caseName: testCase.caseName,
      testName: testCase.testName,
      inputValue: testCase.inputValue,
      expectedBehavior: testCase.expectedBehavior,
      severity: testCase.severity,
      status: 'skipped',
      outcome: 'observer_ambiguous',
      reasonCode: 'interaction_error',
      observation: null,
      targetDiagnostics,
      evidence: summarizeNonObservationResult(testCase, targetDiagnostics, oneLine(error)),
      interpretation: 'The runner could not complete this interaction cleanly enough to interpret the field behavior.',
      recommendation: 'Review the locator and field editability before interpreting this case.',
      cleanupStrategy: testCase.cleanupStrategy,
      safetyNotes: testCase.safetyNotes,
      skippedReason: oneLine(error),
    };
  } finally {
    const restore = await restoreOriginalValue(locator, originalValue, filled, interactionMode);
    targetDiagnostics.restoredValue = sanitizeNullable(restore.restoredValue);
    targetDiagnostics.restoreSucceeded = restore.restoreSucceeded;
  }

  result = applyRestoreSafetyGate(result, targetDiagnostics);
  result.targetDiagnostics = targetDiagnostics;
  result.evidence = result.observation
    ? summarizeObservation(testCase, result.observation, targetDiagnostics, {
      status: result.status,
      outcome: result.outcome,
      reasonCode: result.reasonCode,
      interpretation: result.interpretation,
    })
    : summarizeNonObservationResult(testCase, targetDiagnostics, result.skippedReason ?? result.evidence);
  return result;
}

export function buildInteractiveResultsFile(input: {
  runStartedAt: string;
  runFinishedAt?: string;
  guardState: InteractiveGuardState;
  plan: InteractiveValidationPlan | null;
  results: InteractiveValidationResult[];
}): InteractiveValidationResultsFile {
  const results = input.results;
  return {
    schemaVersion: 1,
    runStartedAt: input.runStartedAt,
    runFinishedAt: input.runFinishedAt ?? new Date().toISOString(),
    guardState: input.guardState,
    sourceReport: {
      runStartedAt: input.plan?.sourceReport.runStartedAt ?? null,
      runFinishedAt: input.plan?.sourceReport.runFinishedAt ?? null,
    },
    summary: {
      total: results.length,
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
      warning: results.filter((result) => result.status === 'warning').length,
      manual_review: results.filter((result) => result.status === 'manual_review').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
    },
    outcomes: countOutcomes(results),
    targetConcepts: input.plan?.targetConcepts ?? resolveInteractiveTargetConcepts(),
    skippedConcepts: input.plan?.skippedConcepts ?? [],
    results,
  };
}

export function writeInteractiveResultsArtifacts(
  resultFile: InteractiveValidationResultsFile,
  outDir: string,
): {
  jsonPath: string;
  mdPath: string;
  targetDiagnosticsJsonPath: string;
  targetDiagnosticsMdPath: string;
} {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, INTERACTIVE_RESULTS_JSON);
  const mdPath = path.join(outDir, INTERACTIVE_RESULTS_MD);
  const targetDiagnosticsJsonPath = path.join(outDir, INTERACTIVE_TARGET_DIAGNOSTICS_JSON);
  const targetDiagnosticsMdPath = path.join(outDir, INTERACTIVE_TARGET_DIAGNOSTICS_MD);
  fs.writeFileSync(jsonPath, JSON.stringify(resultFile, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderInteractiveResultsMarkdown(resultFile), 'utf8');
  const targetDiagnostics = buildInteractiveTargetDiagnosticsFile(resultFile);
  fs.writeFileSync(targetDiagnosticsJsonPath, JSON.stringify(targetDiagnostics, null, 2), 'utf8');
  fs.writeFileSync(targetDiagnosticsMdPath, renderInteractiveTargetDiagnosticsMarkdown(targetDiagnostics), 'utf8');
  return { jsonPath, mdPath, targetDiagnosticsJsonPath, targetDiagnosticsMdPath };
}

export function renderInteractiveResultsMarkdown(resultFile: InteractiveValidationResultsFile): string {
  const lines: string[] = [];
  lines.push('# Bead Onboarding - Interactive Field Validation Results');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Run started: ${esc(resultFile.runStartedAt)}`);
  lines.push(`- Run finished: ${esc(resultFile.runFinishedAt)}`);
  lines.push(`- INTERACTIVE_VALIDATION guard: ${resultFile.guardState.INTERACTIVE_VALIDATION ? 'on' : 'off'}`);
  lines.push(`- DISPOSABLE_ENVELOPE guard: ${resultFile.guardState.DISPOSABLE_ENVELOPE ? 'on' : 'off'}`);
  lines.push(`- Total observations: ${resultFile.summary.total}`);
  lines.push(`- Passed: ${resultFile.summary.passed}`);
  lines.push(`- Failed: ${resultFile.summary.failed}`);
  lines.push(`- Warning: ${resultFile.summary.warning}`);
  lines.push(`- Manual review: ${resultFile.summary.manual_review}`);
  lines.push(`- Skipped: ${resultFile.summary.skipped}`);
  lines.push(`- Product failures: ${resultFile.outcomes.product_failure}`);
  lines.push(`- Tool mapping suspects: ${resultFile.outcomes.tool_mapping_suspect}`);
  lines.push(`- Error ownership suspects: ${resultFile.outcomes.error_ownership_suspect}`);
  lines.push(`- Observer ambiguous: ${resultFile.outcomes.observer_ambiguous}`);
  lines.push(`- Mapping not confident: ${resultFile.outcomes.mapping_not_confident}`);
  lines.push('');

  if (resultFile.skippedConcepts.length) {
    lines.push('## Skipped Concepts');
    lines.push('');
    lines.push('| Concept | Reason |');
    lines.push('|---|---|');
    for (const skipped of resultFile.skippedConcepts) {
      lines.push(`| ${esc(skipped.conceptDisplayName)} | ${esc(skipped.reason)} |`);
    }
    lines.push('');
  }

  lines.push('## Observations');
  lines.push('');
  if (resultFile.results.length === 0) {
    lines.push('No interactive observations were recorded.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('| Concept | Field | Test | Severity | Status | Outcome | Evidence | Recommendation |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const result of resultFile.results) {
    lines.push(
      `| ${esc(result.conceptDisplayName)} | ${esc(result.fieldLabel ?? 'n/a')} | ${esc(result.testName)} | ${result.severity} | ${statusLabel(result.status)} | ${esc(result.outcome)} | ${esc(result.evidence)} | ${esc(result.recommendation)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function buildInteractiveTargetDiagnosticsFile(
  resultFile: InteractiveValidationResultsFile,
): InteractiveTargetDiagnosticsFile {
  const rows = resultFile.results.map((result) => ({
    concept: result.concept,
    conceptDisplayName: result.conceptDisplayName,
    testName: result.testName,
    intendedField: result.targetDiagnostics?.intendedFieldDisplayName ?? result.fieldLabel ?? 'n/a',
    actualFieldSignature: result.targetDiagnostics?.actualFieldSignature ?? 'n/a',
    targetConfidence: result.targetDiagnostics?.targetConfidence ?? 'mapping_not_confident',
    targetConfidenceReason: result.targetDiagnostics?.targetConfidenceReason ?? result.skippedReason ?? result.evidence,
    mappingDecisionReason: result.targetDiagnostics?.mappingDecisionReason ?? null,
    mappingShiftReason: result.targetDiagnostics?.mappingShiftReason ?? null,
    mappingFlags: result.targetDiagnostics?.mappingFlags ?? [],
    valueBefore: result.targetDiagnostics?.actualValueBeforeTest ?? null,
    attemptedValue: result.targetDiagnostics?.attemptedValue ?? result.inputValue,
    valueAfter: result.targetDiagnostics?.actualValueAfterBlur ?? result.observation?.observedValue ?? null,
    restore: result.targetDiagnostics?.restoredValue ?? null,
    restoreSucceeded: result.targetDiagnostics?.restoreSucceeded ?? null,
    errorEvidence: formatErrorEvidence(result.observation),
    status: result.status,
    outcome: result.outcome,
    interpretation: result.interpretation,
  }));

  return {
    schemaVersion: 1,
    runStartedAt: resultFile.runStartedAt,
    runFinishedAt: resultFile.runFinishedAt,
    summary: {
      total: rows.length,
      trusted: rows.filter((row) => row.targetConfidence === 'trusted').length,
      tool_mapping_suspect: rows.filter((row) => row.targetConfidence === 'tool_mapping_suspect').length,
      mapping_not_confident: rows.filter((row) => row.targetConfidence === 'mapping_not_confident').length,
      error_ownership_suspect: rows.filter((row) => row.outcome === 'error_ownership_suspect').length,
      product_failure: rows.filter((row) => row.outcome === 'product_failure').length,
      observer_ambiguous: rows.filter((row) => row.outcome === 'observer_ambiguous').length,
      passed: rows.filter((row) => row.outcome === 'passed').length,
      skipped: rows.filter((row) => row.status === 'skipped').length,
      manual_review: rows.filter((row) => row.status === 'manual_review').length,
    },
    rows,
  };
}

export function renderInteractiveTargetDiagnosticsMarkdown(file: InteractiveTargetDiagnosticsFile): string {
  const lines: string[] = [];
  lines.push('# Bead Onboarding - Interactive Target Diagnostics');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Run started: ${esc(file.runStartedAt)}`);
  lines.push(`- Run finished: ${esc(file.runFinishedAt)}`);
  lines.push(`- Total cases: ${file.summary.total}`);
  lines.push(`- Trusted targets: ${file.summary.trusted}`);
  lines.push(`- Tool mapping suspects: ${file.summary.tool_mapping_suspect}`);
  lines.push(`- Mapping not confident: ${file.summary.mapping_not_confident}`);
  lines.push(`- Error ownership suspects: ${file.summary.error_ownership_suspect}`);
  lines.push(`- Product failures: ${file.summary.product_failure}`);
  lines.push(`- Observer ambiguous: ${file.summary.observer_ambiguous}`);
  lines.push('');
  lines.push('## Target Review');
  lines.push('');
  lines.push('| Concept | Test | Intended field | Actual field signature | Target confidence | Reason | Value before/after | Error evidence | Outcome | Interpretation |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of file.rows) {
    const reason = [row.targetConfidenceReason, ...(row.mappingFlags ?? [])].filter(Boolean).join(' | ');
    lines.push(
      `| ${esc(row.conceptDisplayName)} | ${esc(row.testName)} | ${esc(row.intendedField)} | ${esc(row.actualFieldSignature)} | ${esc(row.targetConfidence)} | ${esc(reason || 'n/a')} | ${esc(formatValueFlow(row))} | ${esc(row.errorEvidence)} | ${esc(row.outcome)} | ${esc(row.interpretation)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function toInteractiveCase(
  concept: FieldConceptKey,
  conceptDisplayName: string,
  match: ScorecardFieldMatch,
  sourceField: FieldRecord,
  targetField: InteractiveLocatorStrategy,
  validation: BestPracticeValidation,
  matrixCase: MatrixCaseDefinition,
): InteractiveValidationCase {
  return {
    id: `${concept}:${validation.id}:${matrixCase.caseName}`,
    concept,
    conceptDisplayName,
    fieldLabel: match.displayName,
    targetField,
    targetProfile: {
      intendedFieldDisplayName: match.displayName,
      intendedBusinessSection: match.businessSection,
      intendedSectionName: sourceField.section,
      jsonKeyPath: sourceField.enrichment?.jsonKeyPath ?? null,
      enrichmentMatchedBy: sourceField.enrichment?.matchedBy ?? null,
      enrichmentPositionalFingerprint: sourceField.enrichment?.positionalFingerprint ?? null,
      inferredType: sourceField.inferredType,
      labelSource: sourceField.labelSource,
      labelConfidence: sourceField.labelConfidence,
      mappingConfidence: match.identificationConfidence,
      tabGuid: sourceField.tabGuid,
      docusignTabType: sourceField.docusignTabType,
      pageIndex: sourceField.pageIndex,
      ordinalOnPage: sourceField.ordinalOnPage,
      expectedPageIndex: sourceField.enrichment?.expectedPageIndex ?? null,
      expectedOrdinalOnPage: sourceField.enrichment?.expectedOrdinalOnPage ?? null,
      expectedDocusignFieldFamily: sourceField.enrichment?.expectedDocusignFieldFamily ?? null,
      coordinates: {
        left: sourceField.tabLeft,
        top: sourceField.tabTop,
        width: sourceField.tabWidth,
        height: sourceField.tabHeight,
      },
      expectedCoordinates: {
        left: sourceField.enrichment?.expectedTabLeft ?? null,
        top: sourceField.enrichment?.expectedTabTop ?? null,
      },
    },
    validationId: validation.id,
    caseName: matrixCase.caseName,
    testName: matrixCase.testName,
    inputValue: matrixCase.inputValue,
    expectedBehavior: validation.expectedBehavior,
    expectedSignal: matrixCase.expectedBehavior,
    interactionKind: matrixCase.interactionKind ?? 'fill',
    severity: validation.severity,
    cleanupStrategy: 'restore_original_value_then_blur',
    safetyNotes: [
      'Uses only disposable test/sample input values.',
      'Does not exercise signature or completion flows.',
      'Restores the original field value after observation when possible.',
    ],
  };
}

function isConfidentMatch(match: ScorecardFieldMatch): boolean {
  return match.identificationConfidence === 'medium' || match.identificationConfidence === 'high';
}

function skippedCase(testCase: InteractiveValidationCase, reason: string): InteractiveValidationResult {
  return {
    concept: testCase.concept,
    conceptDisplayName: testCase.conceptDisplayName,
    fieldLabel: testCase.fieldLabel,
    targetField: testCase.targetField,
    validationId: testCase.validationId,
    caseName: testCase.caseName,
    testName: testCase.testName,
    inputValue: testCase.inputValue,
    expectedBehavior: testCase.expectedBehavior,
    severity: testCase.severity,
    status: 'skipped',
    outcome: 'mapping_not_confident',
    reasonCode: 'target_mapping_not_trusted',
    observation: null,
    targetDiagnostics: null,
    evidence: reason,
    interpretation: 'The runner did not trust the target field enough to mutate it.',
    recommendation: 'Re-run after the target field is visible, editable, and confidently mapped.',
    cleanupStrategy: testCase.cleanupStrategy,
    safetyNotes: testCase.safetyNotes,
    skippedReason: reason,
  };
}

async function readControlValue(locator: Locator): Promise<string | null> {
  try {
    return await locator.inputValue({ timeout: 1_500 });
  } catch {
    try {
      return await locator.evaluate((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
          return element.value;
        }
        return element.textContent?.trim() ?? '';
      }, { timeout: 1_500 });
    } catch {
      return null;
    }
  }
}

function isControlledChoiceConcept(concept: FieldConceptKey): boolean {
  return CONTROLLED_CHOICE_CONCEPTS.has(concept);
}

async function describeInteractiveControl(locator: Locator): Promise<InteractiveControlDescriptor> {
  try {
    return await locator.evaluate((element) => {
      const clean = (value: string | null | undefined): string | null => {
        const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
        return normalized ? normalized.slice(0, 120) : null;
      };
      const toOptions = (nodes: Iterable<Element>): Array<{ value: string; label: string }> => {
        const seen = new Set<string>();
        const options: Array<{ value: string; label: string }> = [];
        for (const node of Array.from(nodes)) {
          const value = clean(node.getAttribute('value') ?? (node as HTMLOptionElement).value ?? node.textContent) ?? '';
          const label = clean((node as HTMLOptionElement).label ?? node.textContent) ?? value;
          const key = `${value}::${label}`;
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({ value, label });
        }
        return options;
      };

      if (element instanceof HTMLSelectElement) {
        const options = toOptions(element.options);
        return {
          kind: 'native-select' as const,
          tagName: 'select',
          role: clean(element.getAttribute('role')),
          inputType: null,
          options,
          supportsFreeText: false,
          canClear: options.some((option) => option.value === ''),
        };
      }

      if (element instanceof HTMLInputElement && element.type === 'checkbox') {
        return {
          kind: 'checkbox' as const,
          tagName: 'input',
          role: clean(element.getAttribute('role')),
          inputType: 'checkbox',
          options: [],
          supportsFreeText: false,
          canClear: true,
        };
      }

      if (element instanceof HTMLInputElement && element.type === 'radio') {
        return {
          kind: 'radio' as const,
          tagName: 'input',
          role: clean(element.getAttribute('role')),
          inputType: 'radio',
          options: [],
          supportsFreeText: false,
          canClear: false,
        };
      }

      const role = clean(element.getAttribute('role'))?.toLowerCase() ?? null;
      if (role === 'combobox') {
        const controlledId = element.getAttribute('aria-controls') ?? element.getAttribute('list');
        const options = controlledId
          ? toOptions(document.querySelectorAll(`#${CSS.escape(controlledId)} option, #${CSS.escape(controlledId)} [role="option"]`))
          : [];
        return {
          kind: 'combobox' as const,
          tagName: clean(element.tagName.toLowerCase()),
          role,
          inputType: clean(element.getAttribute('type')),
          options,
          supportsFreeText: element instanceof HTMLInputElement,
          canClear: false,
        };
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return {
          kind: 'text' as const,
          tagName: clean(element.tagName.toLowerCase()),
          role,
          inputType: element instanceof HTMLInputElement ? clean(element.type) : null,
          options: [],
          supportsFreeText: true,
          canClear: true,
        };
      }

      return {
        kind: 'unsupported' as const,
        tagName: clean(element.tagName.toLowerCase()),
        role,
        inputType: clean(element.getAttribute('type')),
        options: [],
        supportsFreeText: false,
        canClear: false,
      };
    }, { timeout: 2_000 });
  } catch {
    return {
      kind: 'unsupported',
      tagName: null,
      role: null,
      inputType: null,
      options: [],
      supportsFreeText: false,
      canClear: false,
    };
  }
}

export function prepareControlledChoiceInteraction(
  testCase: Pick<InteractiveValidationCase, 'interactionKind' | 'conceptDisplayName'>,
  control: InteractiveControlDescriptor,
  originalValue: string | null,
): PreparedInteractiveAction | BlockedInteractiveAction {
  if (testCase.interactionKind === 'observe_current') {
    return {
      mode: 'observe_current',
      attemptedValue: originalValue ?? '(empty current value)',
      mutated: false,
    };
  }

  if (control.kind === 'text' || control.kind === 'unsupported') {
    return {
      status: 'skipped',
      detail: `field is not a select/dropdown/radio/checkbox for ${testCase.conceptDisplayName}`,
    };
  }

  if (control.kind === 'combobox') {
    return {
      status: 'manual_review',
      detail: control.options.length > 0
        ? `options are discoverable, but ${testCase.conceptDisplayName} is not safely mutable as a native select in this batch`
        : `options not discoverable for ${testCase.conceptDisplayName}`,
    };
  }

  if (control.kind === 'checkbox' || control.kind === 'radio') {
    return {
      status: 'manual_review',
      detail: `${testCase.conceptDisplayName} resolved to a ${control.kind}-like control and needs alternate-selection support instead of select-option mutation`,
    };
  }

  const optionValues = new Set(control.options.map((option) => option.value));
  const nonEmptyOptions = control.options.filter((option) => option.value !== '');

  if (testCase.interactionKind === 'invalid_freeform') {
    return {
      mode: 'observe_current',
      attemptedValue: '(free-text entry impossible on controlled select)',
      mutated: false,
      freeTextEntryImpossible: true,
    };
  }

  if (testCase.interactionKind === 'clear_if_supported') {
    if (!control.canClear || !optionValues.has('')) {
      return {
        status: 'skipped',
        detail: `cannot safely clear ${testCase.conceptDisplayName}; empty required behavior was not exercised`,
      };
    }
    if (originalValue && !optionValues.has(originalValue)) {
      return {
        status: 'manual_review',
        detail: `cannot safely restore original value for ${testCase.conceptDisplayName}`,
      };
    }
    return {
      mode: 'select_option',
      attemptedValue: '(cleared selection)',
      mutated: true,
      optionValue: '',
    };
  }

  const alternate = nonEmptyOptions.find((option) => option.value !== (originalValue ?? ''));
  if (!alternate) {
    return {
      status: 'manual_review',
      detail: control.options.length === 0
        ? `options not discoverable for ${testCase.conceptDisplayName}`
        : `no safe alternate option was discoverable for ${testCase.conceptDisplayName}`,
    };
  }
  if (originalValue && !optionValues.has(originalValue)) {
    return {
      status: 'manual_review',
      detail: `cannot safely restore original value for ${testCase.conceptDisplayName}`,
    };
  }
  return {
    mode: 'select_option',
    attemptedValue: alternate.label,
    mutated: true,
    optionValue: alternate.value,
  };
}

function interactionBlockedResult(
  testCase: InteractiveValidationCase,
  targetDiagnostics: InteractiveTargetDiagnostics,
  status: InteractiveResultStatus,
  detail: string,
): InteractiveValidationResult {
  return {
    concept: testCase.concept,
    conceptDisplayName: testCase.conceptDisplayName,
    fieldLabel: testCase.fieldLabel,
    targetField: testCase.targetField,
    validationId: testCase.validationId,
    caseName: testCase.caseName,
    testName: testCase.testName,
    inputValue: testCase.inputValue,
    expectedBehavior: testCase.expectedBehavior,
    severity: testCase.severity,
    status,
    outcome: 'observer_ambiguous',
    reasonCode: 'observer_ambiguous',
    observation: null,
    targetDiagnostics,
    evidence: summarizeNonObservationResult(testCase, targetDiagnostics, detail),
    interpretation: `The runner recorded ${testCase.conceptDisplayName} as a non-product blocker because ${detail}.`,
    recommendation: `Review ${testCase.conceptDisplayName} control support before treating this case as a product defect.`,
    cleanupStrategy: testCase.cleanupStrategy,
    safetyNotes: testCase.safetyNotes,
    skippedReason: detail,
  };
}

function valueChanged(before: string | null, after: string | null): boolean {
  return normalizeObservedValue(before) !== normalizeObservedValue(after);
}

function normalizeObservedValue(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

async function restoreOriginalValue(
  locator: Locator,
  originalValue: string | null,
  attemptedFill: boolean,
  interactionMode: PreparedInteractiveAction['mode'],
): Promise<{ restoredValue: string | null; restoreSucceeded: boolean | null }> {
  if (!attemptedFill || originalValue === null) {
    return { restoredValue: originalValue, restoreSucceeded: null };
  }
  if (interactionMode === 'select_option') {
    await locator.selectOption({ value: originalValue }, { timeout: 5_000 }).catch(() => undefined);
  } else {
    await locator.fill(originalValue, { timeout: 5_000 }).catch(() => undefined);
  }
  await locator.blur({ timeout: 2_000 }).catch(() => undefined);
  const restoredValue = await readControlValue(locator);
  return {
    restoredValue,
    restoreSucceeded: restoredValue === originalValue,
  };
}

async function waitForClientValidation(locator: Locator): Promise<void> {
  await locator.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 250))).catch(() => undefined);
}

async function collectObservation(
  field: DiscoveredField,
  concept: FieldConceptKey,
  inputValue: string,
  filled: boolean,
): Promise<InteractiveObservation> {
  const dom = await field.locator.evaluate((element) => {
    const clean = (value: string | null | undefined): string | null => {
      const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
      return cleaned ? cleaned.slice(0, 500) : null;
    };
    const errorSelector = [
      '[role="alert"]',
      '[aria-live]',
      '[class*="error" i]',
      '[class*="invalid" i]',
      '[class*="validation" i]',
      '[data-qa*="error" i]',
      '[data-testid*="error" i]',
    ].join(',');
    const splitText = (value: string | null | undefined): string[] => {
      const cleaned = clean(value);
      if (!cleaned) return [];
      return cleaned
        .split(/\s+\|\s+|\r?\n|•|·/)
        .map((part) => clean(part.replace(/^[\-\u2022\s]+/, '')))
        .filter((part): part is string => Boolean(part));
    };
    const elementValue = (): string => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value;
      }
      return element.textContent?.trim() ?? '';
    };
    const validationMessage =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
        ? element.validationMessage
        : '';

    const errorCandidates: Array<{
      source: ValidationCandidateSource;
      text: string;
      associatedWithSameElement: boolean;
      associatedWithSameTabGuid: boolean | null;
    }> = [];
    const invalidIndicators: string[] = [];
    const seenCandidates = new Set<string>();
    const seenIndicators = new Set<string>();
    const addCandidate = (
      source: ValidationCandidateSource,
      value: string | null | undefined,
      associatedWithSameElement: boolean,
      associatedWithSameTabGuid: boolean | null,
    ) => {
      for (const part of splitText(value)) {
        const key = `${source}:${part}`;
        if (seenCandidates.has(key)) continue;
        seenCandidates.add(key);
        errorCandidates.push({ source, text: part, associatedWithSameElement, associatedWithSameTabGuid });
      }
    };
    const addInvalidIndicators = (source: string, node: Element | null) => {
      if (!node) return;
      const className = clean(node.getAttribute('class'));
      const dataState = clean(node.getAttribute('data-state'));
      const dataInvalid = clean(node.getAttribute('data-invalid'));
      const ariaInvalid = clean(node.getAttribute('aria-invalid'));
      const maybeAdd = (value: string | null) => {
        if (!value) return;
        const entry = `${source}:${value}`;
        if (seenIndicators.has(entry)) return;
        seenIndicators.add(entry);
        invalidIndicators.push(entry);
      };
      if (ariaInvalid === 'true') maybeAdd('aria-invalid=true');
      if (dataInvalid && /(true|invalid|error)/i.test(dataInvalid)) maybeAdd(`data-invalid=${dataInvalid}`);
      if (dataState && /(invalid|error)/i.test(dataState)) maybeAdd(`data-state=${dataState}`);
      if (className && /(invalid|error|has-error|is-invalid|validation-error|field-error)/i.test(className)) {
        maybeAdd(`class=${className}`);
      }
    };

    const collectByIds = (attribute: string) => {
      const ids = element.getAttribute(attribute);
      if (!ids) return;
      for (const id of ids.split(/\s+/).filter(Boolean)) {
        const node = document.getElementById(id);
        addCandidate(
          attribute === 'aria-errormessage' ? 'aria-errormessage' : 'aria-describedby',
          node?.textContent,
          true,
          true,
        );
        addInvalidIndicators(attribute, node);
      }
    };
    collectByIds('aria-errormessage');
    collectByIds('aria-describedby');

    const fieldRoot =
      element.closest('.doc-tab[data-type]') ??
      element.closest('.doc-tab') ??
      element.closest('[data-tabtype]') ??
      element.closest('[data-tab-type]') ??
      element.closest('label') ??
      element.closest('fieldset') ??
      element.closest('[role="group"]') ??
      element.parentElement;
    const wrappers = [element.parentElement, fieldRoot].filter(
      (node, index, list): node is Element => Boolean(node) && list.indexOf(node) === index,
    );
    addInvalidIndicators('control', element);
    for (const wrapper of wrappers) {
      addInvalidIndicators(wrapper === fieldRoot ? 'field-root' : 'parent', wrapper);
      if (wrapper.matches(errorSelector)) {
        addCandidate(
          wrapper === fieldRoot ? 'same-tab-wrapper' : 'direct-field-container',
          wrapper.textContent,
          true,
          true,
        );
      }
      for (const node of Array.from(wrapper.querySelectorAll(errorSelector)).slice(0, 8)) {
        const htmlNode = node as HTMLElement;
        const style = window.getComputedStyle(htmlNode);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        addCandidate(
          wrapper === fieldRoot ? 'same-tab-wrapper' : 'direct-field-container',
          htmlNode.textContent,
          true,
          true,
        );
      }
    }

    return {
      ariaInvalid: element.getAttribute('aria-invalid'),
      validationMessage: clean(validationMessage),
      observedValue: elementValue(),
      errorCandidates,
      invalidIndicators,
    };
  }, { timeout: 3_000 });

  const observedValue = filled ? sanitizeEvidenceText(dom.observedValue ?? '') : null;
  const normalizedOrReformatted = filled && observedValue !== null && observedValue !== inputValue;
  const inputPrevented = filled && inputValue.length > 0 && (observedValue === null || observedValue.length === 0);
  const diagnostics = extractFieldLocalValidationDiagnostics(dom.errorCandidates, {
    concept,
    ariaInvalid: dom.ariaInvalid,
    inputValue,
    observedValue,
  });
  const validationMessage = sanitizeNullable(dom.validationMessage);
  const validationMessageEvidence = validationMessage
    ? toEvidenceItem('native-validation-message', validationMessage, concept, true, field.tabGuid ? true : null)
    : null;
  const ariaInvalidEvidence = dom.ariaInvalid === 'true'
    ? toEvidenceItem('aria-invalid', 'true', concept, true, field.tabGuid ? true : null)
    : null;
  const invalidIndicatorEvidence = dom.invalidIndicators.map((item) =>
    toEvidenceItem('invalid-indicator', sanitizeEvidenceText(item), concept, true, field.tabGuid ? true : null),
  );
  const ownershipSuspectText = [
    ...diagnostics.ownershipSuspectTexts,
    ...(validationMessageEvidence?.classification === 'other-field-type-suspect' ? [validationMessageEvidence.text] : []),
    ...invalidIndicatorEvidence
      .filter((item) => item.classification === 'other-field-type-suspect')
      .map((item) => item.text),
  ];

  return {
    ariaInvalid: dom.ariaInvalid,
    validationMessage,
    nearbyErrorText: diagnostics.fieldLocalTexts.length > 0 ? diagnostics.fieldLocalTexts.join(' | ') : null,
    docusignValidationText: diagnostics.docusignLocalTexts,
    invalidIndicators: dom.invalidIndicators.map(sanitizeEvidenceText),
    ignoredDiagnostics: diagnostics.ignoredTexts,
    ownershipSuspectText,
    evidenceItems: [
      ...(ariaInvalidEvidence ? [ariaInvalidEvidence] : []),
      ...(validationMessageEvidence ? [validationMessageEvidence] : []),
      ...invalidIndicatorEvidence,
      ...diagnostics.evidenceItems,
    ],
    observedValue,
    normalizedOrReformatted,
    inputPrevented,
  };
}

export function extractFieldLocalValidationDiagnostics(
  candidates: RawValidationCandidate[],
  context: { concept?: FieldConceptKey; ariaInvalid: string | null; inputValue: string; observedValue: string | null },
): FieldLocalValidationDiagnostics {
  const fieldLocalTexts: string[] = [];
  const docusignLocalTexts: string[] = [];
  const ignoredTexts: string[] = [];
  const ownershipSuspectTexts: string[] = [];
  const evidenceItems: InteractiveEvidenceItem[] = [];
  const add = (bucket: string[], value: string) => {
    if (!bucket.includes(value)) bucket.push(value);
  };

  for (const candidate of candidates) {
    for (const part of splitValidationCandidateText(candidate.text)) {
      const splitCandidate: RawValidationCandidate = { ...candidate, text: part };
      const evidence = classifyValidationCandidate(splitCandidate, context);
      evidenceItems.push(evidence);
      if (evidence.classification === 'ignored') {
        add(ignoredTexts, part);
        continue;
      }
      if (evidence.classification === 'other-field-type-suspect') {
        add(ownershipSuspectTexts, part);
        continue;
      }
      add(fieldLocalTexts, part);
      if (candidate.source === 'same-tab-wrapper') {
        add(docusignLocalTexts, part);
      }
    }
  }

  return {
    fieldLocalTexts,
    docusignLocalTexts,
    ignoredTexts,
    ownershipSuspectTexts,
    evidenceItems,
  };
}

function classifyValidationCandidate(
  candidate: RawValidationCandidate,
  context: { concept?: FieldConceptKey; ariaInvalid: string | null; inputValue: string; observedValue: string | null },
): InteractiveEvidenceItem {
  const value = sanitizeEvidenceText(candidate.text);
  if (!value) return { ...candidate, text: value, otherFieldTypeHints: [], classification: 'ignored' };

  const lower = value.toLowerCase();
  const observed = (context.observedValue ?? '').trim().toLowerCase();
  const input = context.inputValue.trim().toLowerCase();
  if (lower === observed || lower === input) {
    return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid, 'ignored');
  }
  if (GENERIC_DOCUSIGN_TEXT_RE.test(value)) {
    return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid, 'ignored');
  }
  if (AMBIGUOUS_REQUIRED_RE.test(value)) {
    if (candidate.source === 'aria-describedby' || candidate.source === 'aria-errormessage') {
      return toEvidenceItem(
        candidate.source,
        value,
        context.concept,
        candidate.associatedWithSameElement,
        candidate.associatedWithSameTabGuid,
        context.ariaInvalid === 'true' || context.observedValue === '' ? undefined : 'ignored',
      );
    }
    return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid, 'ignored');
  }
  if (candidate.source === 'aria-describedby' || candidate.source === 'aria-errormessage') {
    return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid);
  }
  if (FIELD_LOCAL_MESSAGE_RE.test(value)) {
    return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid);
  }
  return toEvidenceItem(candidate.source, value, context.concept, candidate.associatedWithSameElement, candidate.associatedWithSameTabGuid, 'ignored');
}

function splitValidationCandidateText(value: string): string[] {
  return sanitizeEvidenceText(value)
    .split(/\s+\|\s+|\r?\n|•|·/)
    .map((part) => sanitizeEvidenceText(part.replace(/^[\-\u2022\s]+/, '')))
    .filter(Boolean);
}

function evaluateObservation(
  testCase: InteractiveValidationCase,
  observation: InteractiveObservation,
  targetDiagnostics: InteractiveTargetDiagnostics,
): {
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  reasonCode: InteractiveReasonCode;
  interpretation: string;
} {
  if (observation.ownershipSuspectText.length > 0) {
    return {
      status: 'manual_review',
      outcome: 'error_ownership_suspect',
      reasonCode: 'error_ownership_suspect',
      interpretation: `Observed validation evidence looks more like another field type than ${testCase.conceptDisplayName}.`,
    };
  }

  const rejected = hasValidationFeedback(observation);
  const accepted = !rejected && !observation.inputPrevented;
  const changed = observation.valueChangedFromOriginal ?? valueChanged(targetDiagnostics.actualValueBeforeTest, targetDiagnostics.actualValueAfterBlur ?? observation.observedValue);

  switch (testCase.expectedSignal) {
    case 'accept':
      if (testCase.interactionKind === 'select_alternate') {
        return changed
          ? passedEvaluation('Expected alternate controlled option was selected and retained.')
          : {
            status: 'manual_review',
            outcome: 'observer_ambiguous',
            reasonCode: 'observer_ambiguous',
            interpretation: `No alternate option change was observed for ${testCase.conceptDisplayName}.`,
          };
      }
      return accepted
        ? passedEvaluation('Expected valid input was accepted.')
        : failureEvaluation(testCase.severity, `${testCase.conceptDisplayName} rejected a value that should have been accepted.`);
    case 'reject':
      return rejected || observation.inputPrevented
        ? passedEvaluation('Expected invalid input was rejected or blocked.')
        : failureEvaluation(testCase.severity, `${testCase.conceptDisplayName} accepted a value that should have been rejected.`);
    case 'reject_or_warn':
      return rejected || observation.inputPrevented
        ? passedEvaluation('Expected risky input was rejected or clearly flagged.')
        : {
          status: 'warning',
          outcome: 'observer_ambiguous',
          reasonCode: 'observer_ambiguous',
          interpretation: `Observed lenient handling for ${testCase.conceptDisplayName}; review before claiming a product defect.`,
        };
    case 'reject_or_manual_review':
      return rejected || observation.inputPrevented
        ? passedEvaluation('Expected ambiguous input was rejected or clearly flagged.')
        : {
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          reasonCode: 'observer_ambiguous',
          interpretation: `Observed ambiguous behavior for ${testCase.conceptDisplayName}; record it without overclaiming.`,
        };
    case 'document':
      if (testCase.interactionKind === 'invalid_freeform' && observation.freeTextEntryImpossible) {
        return passedEvaluation('Controlled-choice field did not allow free-text entry outside the listed option set.');
      }
      return observation.observedValue && observation.observedValue.trim() !== ''
        ? passedEvaluation(`Recorded ${testCase.conceptDisplayName} state for reviewer audit.`)
        : {
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          reasonCode: 'observer_ambiguous',
          interpretation: `Could not document a stable current value for ${testCase.conceptDisplayName}.`,
        };
    case 'observe':
      return {
        status: 'manual_review',
        outcome: 'observer_ambiguous',
        reasonCode: 'observer_ambiguous',
        interpretation: `Recorded ${testCase.conceptDisplayName} behavior for reviewer audit without classifying it as pass/fail.`,
      };
  }
}

function hasValidationFeedback(observation: InteractiveObservation): boolean {
  return (
    observation.ariaInvalid === 'true' ||
    Boolean(observation.validationMessage) ||
    Boolean(observation.nearbyErrorText) ||
    observation.docusignValidationText.length > 0 ||
    observation.invalidIndicators.length > 0
  );
}

function severityFailureStatus(severity: ValidationExpectationSeverity): InteractiveResultStatus {
  return severity === 'critical' || severity === 'high' ? 'failed' : 'warning';
}

function summarizeObservation(
  testCase: InteractiveValidationCase,
  observation: InteractiveObservation,
  targetDiagnostics: InteractiveTargetDiagnostics,
  evaluation: {
    status: InteractiveResultStatus;
    outcome: InteractiveResultOutcome;
    reasonCode: InteractiveReasonCode;
    interpretation: string;
  },
): string {
  const parts = [
    `targetConfidence=${targetDiagnostics.targetConfidence}`,
    `input "${sanitizeEvidenceText(testCase.inputValue)}"`,
    `observed "${observation.observedValue ?? ''}"`,
    `aria-invalid=${observation.ariaInvalid ?? 'null'}`,
  ];
  if (observation.validationMessage) parts.push(`validationMessage="${observation.validationMessage}"`);
  if (observation.nearbyErrorText) parts.push(`nearbyError="${observation.nearbyErrorText}"`);
  if (observation.docusignValidationText.length) {
    parts.push(`visibleValidation="${observation.docusignValidationText.join(' | ')}"`);
  }
  if (observation.ownershipSuspectText.length) {
    parts.push(`ownershipSuspect="${observation.ownershipSuspectText.join(' | ')}"`);
  }
  if (observation.invalidIndicators.length) {
    parts.push(`invalidIndicators="${observation.invalidIndicators.join(' | ')}"`);
  }
  if (observation.ignoredDiagnostics.length) {
    parts.push(`ignoredDiagnostics="${observation.ignoredDiagnostics.join(' | ')}"`);
  }
  if (observation.controlKind) parts.push(`control=${observation.controlKind}`);
  if (observation.optionsDiscoverable !== undefined) parts.push(`optionsDiscoverable=${observation.optionsDiscoverable}`);
  if (observation.freeTextEntryImpossible) parts.push('free-text-impossible');
  if (observation.valueChangedFromOriginal !== undefined) parts.push(`valueChanged=${observation.valueChangedFromOriginal}`);
  if (targetDiagnostics.actualFieldSignature) {
    parts.push(`actualField="${targetDiagnostics.actualFieldSignature}"`);
  }
  if (targetDiagnostics.mappingFlags.length) {
    parts.push(`mappingFlags="${targetDiagnostics.mappingFlags.join(' | ')}"`);
  }
  if (targetDiagnostics.restoreSucceeded !== null) parts.push(`restore=${targetDiagnostics.restoreSucceeded ? 'ok' : 'failed'}`);
  parts.push(`outcome=${evaluation.outcome}`);
  if (observation.normalizedOrReformatted) parts.push('value normalized/reformatted');
  if (observation.inputPrevented) parts.push('input prevented or cleared');
  return parts.join('; ');
}

function summarizeNonObservationResult(
  testCase: InteractiveValidationCase,
  targetDiagnostics: InteractiveTargetDiagnostics,
  detail: string,
): string {
  const parts = [
    `targetConfidence=${targetDiagnostics.targetConfidence}`,
    `input "${sanitizeEvidenceText(testCase.inputValue)}"`,
    `actualField="${targetDiagnostics.actualFieldSignature}"`,
  ];
  if (targetDiagnostics.mappingFlags.length) {
    parts.push(`mappingFlags="${targetDiagnostics.mappingFlags.join(' | ')}"`);
  }
  if (detail) parts.push(detail);
  if (targetDiagnostics.restoreSucceeded !== null) parts.push(`restore=${targetDiagnostics.restoreSucceeded ? 'ok' : 'failed'}`);
  return parts.join('; ');
}

function recommendationForResult(
  testCase: InteractiveValidationCase,
  evaluation: {
    status: InteractiveResultStatus;
    outcome: InteractiveResultOutcome;
    reasonCode: InteractiveReasonCode;
    interpretation: string;
  },
  observation: InteractiveObservation,
): string {
  if (evaluation.outcome === 'passed') return 'Observed behavior matched the expected validation signal.';
  if (evaluation.outcome === 'tool_mapping_suspect' || evaluation.outcome === 'mapping_not_confident') {
    return `Verify the ${testCase.conceptDisplayName} target mapping before mutating or judging this field.`;
  }
  if (evaluation.outcome === 'error_ownership_suspect') {
    return `Review whether the observed validation message belongs to a different field than ${testCase.conceptDisplayName}.`;
  }
  if (evaluation.status === 'manual_review') {
    return `Review ${testCase.conceptDisplayName}: ${testCase.testName}; behavior was intentionally recorded without overclaiming.`;
  }
  if (evaluation.status === 'warning') {
    return `Review whether ${testCase.conceptDisplayName} should allow this value without a clearer validation signal.`;
  }
  if (evaluation.status === 'skipped') return 'Resolve the locator or mapping issue and rerun on a disposable envelope.';
  if (!hasValidationFeedback(observation)) {
    return `Block this value or show a validation error for ${testCase.conceptDisplayName} on blur.`;
  }
  return `Confirm the validation rule for ${testCase.conceptDisplayName}.`;
}

export function applyRestoreSafetyGate(
  result: InteractiveValidationResult,
  targetDiagnostics: Pick<InteractiveTargetDiagnostics, 'restoreSucceeded'>,
): InteractiveValidationResult {
  if (targetDiagnostics.restoreSucceeded !== false) return result;
  if (result.outcome === 'mapping_not_confident' || result.outcome === 'tool_mapping_suspect') return result;
  return {
    ...result,
    status: 'manual_review',
    outcome: 'observer_ambiguous',
    reasonCode: 'observer_ambiguous',
    interpretation: `The runner observed ${result.conceptDisplayName}, but could not safely restore the original value afterward.`,
    recommendation: `Fix restore-original-value safety for ${result.conceptDisplayName} before treating this case as a product finding.`,
  };
}

function mappingGateResult(
  testCase: InteractiveValidationCase,
  targetDiagnostics: InteractiveTargetDiagnostics,
  verification: {
    confidence: InteractiveTargetConfidence;
    reason: string;
    flags: string[];
  },
): InteractiveValidationResult {
  const outcome: InteractiveResultOutcome = verification.confidence === 'tool_mapping_suspect'
    ? 'tool_mapping_suspect'
    : 'mapping_not_confident';
  const interpretation = verification.confidence === 'tool_mapping_suspect'
    ? `The resolved target for ${testCase.conceptDisplayName} looks like a different field family, so the case was not mutated.`
    : `The resolved target for ${testCase.conceptDisplayName} is not trusted enough for a mutating check.`;

  return {
    concept: testCase.concept,
    conceptDisplayName: testCase.conceptDisplayName,
    fieldLabel: testCase.fieldLabel,
    targetField: testCase.targetField,
    validationId: testCase.validationId,
    caseName: testCase.caseName,
    testName: testCase.testName,
    inputValue: testCase.inputValue,
    expectedBehavior: testCase.expectedBehavior,
    severity: testCase.severity,
    status: 'skipped',
    outcome,
    reasonCode: 'target_mapping_not_trusted',
    observation: null,
    targetDiagnostics,
    evidence: summarizeNonObservationResult(testCase, targetDiagnostics, verification.reason),
    interpretation,
    recommendation: `Confirm the ${testCase.conceptDisplayName} field mapping before rerunning this check.`,
    cleanupStrategy: testCase.cleanupStrategy,
    safetyNotes: testCase.safetyNotes,
    skippedReason: verification.reason,
  };
}

function createTargetDiagnostics(
  testCase: InteractiveValidationCase,
  field: DiscoveredField,
  actualElement: InteractiveElementSignature,
  originalValue: string | null,
): InteractiveTargetDiagnostics {
  return {
    intendedFieldDisplayName: testCase.targetProfile.intendedFieldDisplayName,
    intendedBusinessSection: testCase.targetProfile.intendedBusinessSection,
    intendedSectionName: testCase.targetProfile.intendedSectionName,
    inferredType: testCase.targetProfile.inferredType,
    labelSource: testCase.targetProfile.labelSource,
    labelConfidence: testCase.targetProfile.labelConfidence,
    mappingConfidence: testCase.targetProfile.mappingConfidence,
    tabGuid: field.tabGuid ?? testCase.targetProfile.tabGuid,
    docusignTabType: field.docusignTabType ?? testCase.targetProfile.docusignTabType,
    pageIndex: field.pageIndex ?? testCase.targetProfile.pageIndex,
    ordinalOnPage: field.ordinalOnPage ?? testCase.targetProfile.ordinalOnPage,
    coordinates: {
      left: field.tabLeft ?? testCase.targetProfile.coordinates.left,
      top: field.tabTop ?? testCase.targetProfile.coordinates.top,
      width: field.tabWidth ?? testCase.targetProfile.coordinates.width,
      height: field.tabHeight ?? testCase.targetProfile.coordinates.height,
    },
    locatorStrategy: formatLocatorStrategy(testCase.targetField),
    actualElement,
    actualFieldSignature: formatActualFieldSignature(actualElement),
    targetConfidence: 'mapping_not_confident',
    targetConfidenceReason: 'Target verification not yet evaluated.',
    mappingDecisionReason: null,
    mappingShiftReason: null,
    mappingFlags: [],
    actualValueBeforeTest: sanitizeNullable(originalValue),
    attemptedValue: sanitizeEvidenceText(testCase.inputValue),
    actualValueAfterFill: null,
    actualValueAfterBlur: null,
    restoredValue: null,
    restoreSucceeded: null,
  };
}

function resolveInteractiveTargetField(
  testCase: InteractiveValidationCase,
  field: DiscoveredField,
  allFields: DiscoveredField[],
): {
  field: DiscoveredField;
  selection: ReturnType<typeof selectBestMappingCandidate>;
} {
  const expectedAnchor = buildExpectedAnchor(testCase);
  const candidatePool = allFields
    .filter((candidate) => candidate.controlCategory === 'merchant_input' && candidate.visible && candidate.editable)
    .filter((candidate) => candidate.pageIndex === expectedAnchor.pageIndex || expectedAnchor.pageIndex === null)
    .filter((candidate) => {
      if (expectedAnchor.ordinalOnPage === null) return true;
      if (candidate.ordinalOnPage === null) return false;
      return Math.abs(candidate.ordinalOnPage - expectedAnchor.ordinalOnPage) <= 3;
    });
  const candidates = candidatePool.some((candidate) => candidate.index === field.index)
    ? candidatePool
    : [field, ...candidatePool.filter((candidate) => candidate.index !== field.index)];

  const sourceFieldIndex = (candidate: DiscoveredField): number => {
    const index = allFields.indexOf(candidate);
    return index >= 0 ? index + 1 : candidate.index + 1;
  };

  const selection = selectBestMappingCandidate({
    concept: testCase.concept,
    currentCandidateId: String(sourceFieldIndex(field)),
    candidates: candidates.map((candidate) => ({
      id: String(sourceFieldIndex(candidate)),
      resolvedLabel: candidate.resolvedLabel,
      labelSource: candidate.labelSource,
      labelConfidence: candidate.labelConfidence,
      sectionName: candidate.sectionName,
      inferredType: typeof candidate.inferredType === 'string' ? candidate.inferredType : candidate.inferredType.type,
      docusignTabType: candidate.docusignTabType,
      pageIndex: candidate.pageIndex,
      ordinalOnPage: candidate.ordinalOnPage,
      tabLeft: candidate.tabLeft,
      tabTop: candidate.tabTop,
      currentValue: candidate.currentValue,
      observedValueLikeTextNearControl: candidate.observedValueLikeTextNearControl,
      controlCategory: candidate.controlCategory,
      visible: candidate.visible,
      editable: candidate.editable,
    })),
    expectedAnchor,
  });

  const selectedField = selection.trusted && selection.selectedCandidateId
    ? candidates.find((candidate) => String(sourceFieldIndex(candidate)) === selection.selectedCandidateId) ?? field
    : field;

  return {
    field: selectedField,
    selection,
  };
}

function buildExpectedAnchor(testCase: InteractiveValidationCase): {
  jsonKeyPath: string | null;
  displayName: string | null;
  businessSection: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  tabLeft: number | null;
  tabTop: number | null;
  docusignFieldFamily: string | null;
} {
  const fingerprint = parseEnrichmentFingerprint(testCase.targetProfile.enrichmentPositionalFingerprint);
  return {
    jsonKeyPath: testCase.targetProfile.jsonKeyPath,
    displayName: testCase.targetProfile.intendedFieldDisplayName,
    businessSection: testCase.targetProfile.intendedBusinessSection,
    pageIndex: testCase.targetProfile.expectedPageIndex ?? fingerprint?.pageIndex ?? testCase.targetProfile.pageIndex,
    ordinalOnPage: testCase.targetProfile.expectedOrdinalOnPage ?? fingerprint?.ordinalOnPage ?? testCase.targetProfile.ordinalOnPage,
    tabLeft: testCase.targetProfile.expectedCoordinates.left,
    tabTop: testCase.targetProfile.expectedCoordinates.top,
    docusignFieldFamily: testCase.targetProfile.expectedDocusignFieldFamily ?? fingerprint?.family ?? testCase.targetProfile.docusignTabType,
  };
}

function parseEnrichmentFingerprint(
  fingerprint: string | null,
): { pageIndex: number; family: string; ordinalOnPage: number } | null {
  if (!fingerprint) return null;
  const match = /^page:(\d+)\|([^|]+)\|ord:(\d+)$/.exec(fingerprint);
  if (!match) return null;
  return {
    pageIndex: Number(match[1]),
    family: match[2],
    ordinalOnPage: Number(match[3]),
  };
}

async function readElementSignature(field: DiscoveredField): Promise<InteractiveElementSignature> {
  return field.locator.evaluate((element) => {
    const clean = (value: string | null | undefined): string | null => {
      const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
      return cleaned ? cleaned.slice(0, 300) : null;
    };
    const fieldRoot =
      element.closest('.doc-tab[data-type]') ??
      element.closest('.doc-tab') ??
      element.closest('[data-tabtype]') ??
      element.closest('[data-tab-type]');
    return {
      id: clean(element.getAttribute('id')),
      name: clean(element.getAttribute('name')),
      ariaLabel: clean(element.getAttribute('aria-label')),
      title: clean(element.getAttribute('title')),
      role: clean(element.getAttribute('role')),
      tagName: clean(element.tagName.toLowerCase()),
      type: clean(element.getAttribute('type')),
      inputMode: clean(element.getAttribute('inputmode')),
      autocomplete: clean(element.getAttribute('autocomplete')),
      placeholder: clean(element.getAttribute('placeholder')),
      docusignTabType: clean(
        fieldRoot?.getAttribute('data-type') ??
        element.getAttribute('data-type') ??
        element.getAttribute('data-tabtype') ??
        element.getAttribute('data-tab-type'),
      ),
    };
  }, { timeout: 2_000 });
}

function verifyInteractiveTarget(
  testCase: InteractiveValidationCase,
  field: DiscoveredField,
  actualElement: InteractiveElementSignature,
  selection: ReturnType<typeof selectBestMappingCandidate>,
): {
  confidence: InteractiveTargetConfidence;
  reason: string;
  flags: string[];
  decisionReason: string;
  shiftReason: string;
} {
  const flags: string[] = [];
  const labelSource = testCase.targetProfile.labelSource;
  const strongLabelSource = STRONG_LABEL_SOURCES.has(labelSource);
  const actualFamilies = inferSignatureFamilies([
    field.sectionName,
    field.resolvedLabel,
    field.ariaLabel,
    field.title,
    field.placeholder,
    field.idOrNameKey,
    field.groupName,
    field.type,
    field.inputMode,
    field.autocomplete,
    field.docusignTabType,
    actualElement.id,
    actualElement.name,
    actualElement.ariaLabel,
    actualElement.title,
    actualElement.type,
    actualElement.inputMode,
    actualElement.autocomplete,
    actualElement.placeholder,
    actualElement.docusignTabType,
  ]);
  const inferredTypeName = typeof field.inferredType === 'string'
    ? field.inferredType
    : field.inferredType?.type ?? '';
  const blockedFamilies = BLOCKED_SIGNATURE_FAMILIES[testCase.concept] ?? [];

  if (!selection.trusted) {
    flags.push(selection.explanation);
    if (selection.shiftReason !== 'none') {
      flags.push(`suspected shift reason: ${selection.shiftReason}`);
    }
  } else if (selection.selectedCandidateId && Number(selection.selectedCandidateId) !== testCase.targetField.fieldIndex) {
    flags.push(`redirected to live field #${selection.selectedCandidateId} based on ${selection.decisionReason}`);
    if (selection.shiftReason !== 'none') {
      flags.push(`suspected shift reason: ${selection.shiftReason}`);
    }
  }
  if (!strongLabelSource && selection.trusted && testCase.targetProfile.mappingConfidence !== 'high') {
    flags.push(`mapping confidence was ${testCase.targetProfile.mappingConfidence} until live target verification promoted this candidate`);
  }
  for (const family of blockedFamilies) {
    if (actualFamilies.includes(family) || inferredTypeName.includes(family)) {
      flags.push(`target signature suggests ${family} instead of ${testCase.conceptDisplayName}`);
    }
  }

  if (flags.some((flag) => /suggests/.test(flag))) {
    return {
      confidence: 'tool_mapping_suspect',
      reason: flags[0],
      flags,
      decisionReason: selection.decisionReason,
      shiftReason: selection.shiftReason,
    };
  }
  if (!selection.trusted) {
    return {
      confidence: 'mapping_not_confident',
      reason: flags[0] ?? selection.explanation,
      flags,
      decisionReason: selection.decisionReason,
      shiftReason: selection.shiftReason,
    };
  }
  return {
    confidence: 'trusted',
    reason: 'Target label, section, and signature look consistent enough to mutate this control.',
    flags,
    decisionReason: selection.decisionReason,
    shiftReason: selection.shiftReason,
  };
}

function sectionLooksConsistent(intendedBusinessSection: string | null, actualSectionName: string | null): boolean {
  if (!intendedBusinessSection || !actualSectionName) return true;
  const tokens = SECTION_TOKENS[intendedBusinessSection] ?? [];
  if (tokens.length === 0) return true;
  const lower = actualSectionName.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

function inferSignatureFamilies(values: Array<string | null>): string[] {
  const text = values.filter(Boolean).join(' | ');
  return Array.from(new Set(
    SIGNATURE_FAMILY_PATTERNS
      .filter((entry) => entry.pattern.test(text))
      .map((entry) => entry.family),
  ));
}

function toEvidenceItem(
  source: InteractiveEvidenceSource,
  text: string,
  concept: FieldConceptKey | undefined,
  associatedWithSameElement: boolean,
  associatedWithSameTabGuid: boolean | null,
  forceClassification?: InteractiveEvidenceItem['classification'],
): InteractiveEvidenceItem {
  const otherFieldTypeHints = inferForeignFieldHints(text, concept);
  return {
    source,
    text,
    associatedWithSameElement,
    associatedWithSameTabGuid,
    otherFieldTypeHints,
    classification: forceClassification ?? (otherFieldTypeHints.length > 0 ? 'other-field-type-suspect' : 'field-local'),
  };
}

function inferForeignFieldHints(text: string, concept: FieldConceptKey | undefined): string[] {
  if (!concept) return [];
  const families = inferSignatureFamilies([text]);
  return families.filter((family) => !familyBelongsToConcept(family, concept));
}

function familyBelongsToConcept(family: string, concept: FieldConceptKey): boolean {
  const primary = PRIMARY_FAMILY_BY_CONCEPT[concept];
  if (primary && family === primary) return true;
  if ((concept === 'bank_name' || concept === 'business_name' || concept === 'dba_name') && family === 'name') return true;
  if (concept === 'business_description' && family === 'description') return true;
  return false;
}

function formatLocatorStrategy(strategy: InteractiveLocatorStrategy): string {
  return `${strategy.primary}#${strategy.fieldIndex} -> ${strategy.fallback}`;
}

function formatActualFieldSignature(actualElement: InteractiveElementSignature): string {
  const parts = [
    actualElement.id ? `id=${actualElement.id}` : null,
    actualElement.name ? `name=${actualElement.name}` : null,
    actualElement.ariaLabel ? `aria-label=${actualElement.ariaLabel}` : null,
    actualElement.title ? `title=${actualElement.title}` : null,
    actualElement.role ? `role=${actualElement.role}` : null,
    actualElement.tagName ? `tag=${actualElement.tagName}` : null,
    actualElement.type ? `type=${actualElement.type}` : null,
    actualElement.inputMode ? `inputmode=${actualElement.inputMode}` : null,
    actualElement.autocomplete ? `autocomplete=${actualElement.autocomplete}` : null,
    actualElement.placeholder ? `placeholder=${actualElement.placeholder}` : null,
    actualElement.docusignTabType ? `tabType=${actualElement.docusignTabType}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : 'n/a';
}

function formatErrorEvidence(observation: InteractiveObservation | null): string {
  if (!observation) return 'n/a';
  const parts = observation.evidenceItems
    .filter((item) => item.classification !== 'ignored')
    .map((item) => {
      const ownership = item.otherFieldTypeHints.length > 0 ? ` [other=${item.otherFieldTypeHints.join(',')}]` : '';
      return `${item.source}:${item.text}${ownership}`;
    });
  return parts.length > 0 ? parts.join(' | ') : 'n/a';
}

function formatValueFlow(row: InteractiveTargetDiagnosticsFile['rows'][number]): string {
  const restore = row.restoreSucceeded === null
    ? 'restore n/a'
    : row.restoreSucceeded
      ? `restore "${row.restore ?? ''}" ok`
      : `restore "${row.restore ?? ''}" failed`;
  return `before "${row.valueBefore ?? ''}" -> after "${row.valueAfter ?? ''}"; ${restore}`;
}

function countOutcomes(results: InteractiveValidationResult[]): Record<InteractiveResultOutcome, number> {
  return {
    passed: results.filter((result) => result.outcome === 'passed').length,
    product_failure: results.filter((result) => result.outcome === 'product_failure').length,
    tool_mapping_suspect: results.filter((result) => result.outcome === 'tool_mapping_suspect').length,
    error_ownership_suspect: results.filter((result) => result.outcome === 'error_ownership_suspect').length,
    observer_ambiguous: results.filter((result) => result.outcome === 'observer_ambiguous').length,
    mapping_not_confident: results.filter((result) => result.outcome === 'mapping_not_confident').length,
  };
}

function passedEvaluation(interpretation: string): {
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  reasonCode: InteractiveReasonCode;
  interpretation: string;
} {
  return {
    status: 'passed',
    outcome: 'passed',
    reasonCode: 'none',
    interpretation,
  };
}

function failureEvaluation(
  severity: ValidationExpectationSeverity,
  interpretation: string,
): {
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  reasonCode: InteractiveReasonCode;
  interpretation: string;
} {
  return {
    status: severityFailureStatus(severity),
    outcome: 'product_failure',
    reasonCode: 'product_failure',
    interpretation,
  };
}

function sanitizeNullable(value: string | null): string | null {
  if (!value) return null;
  const sanitized = sanitizeEvidenceText(value);
  return sanitized || null;
}

function sanitizeEvidenceText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[redacted-ssn]')
    .replace(/\b\d{2}-\d{7}\b/g, '[redacted-ein]')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function statusLabel(status: InteractiveResultStatus): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'warning':
      return 'Warning';
    case 'manual_review':
      return 'Manual review';
    case 'skipped':
      return 'Skipped';
  }
}

function oneLine(error: unknown): string {
  return sanitizeEvidenceText((error instanceof Error ? error.message : String(error)).split('\n')[0]);
}

function esc(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}