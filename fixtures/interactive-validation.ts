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
import type { ValidationReport } from './validation-report';
import { buildValidationScorecard, type ScorecardFieldMatch } from './validation-scorecard';
import type { FrameHost } from './signer-helpers';

export const INTERACTIVE_RESULTS_JSON = 'latest-interactive-validation-results.json';
export const INTERACTIVE_RESULTS_MD = 'latest-interactive-validation-results.md';

export const INTERACTIVE_TARGET_CONCEPTS = [
  'date_of_birth',
  'registration_date',
  'email',
  'phone',
  'business_name',
  'dba_name',
  'business_description',
  'naics',
  'merchant_category_code',
  'ownership_percentage',
  'postal_code',
  'bank_name',
] as const satisfies readonly FieldConceptKey[];

export type InteractiveTargetConcept = typeof INTERACTIVE_TARGET_CONCEPTS[number];
export type InteractiveResultStatus = 'passed' | 'failed' | 'warning' | 'manual_review' | 'skipped';
export type InteractiveExpectedBehavior =
  | 'accept'
  | 'reject'
  | 'reject_or_warn'
  | 'reject_or_manual_review'
  | 'observe';

export interface InteractiveGuardState {
  INTERACTIVE_VALIDATION: boolean;
  DISPOSABLE_ENVELOPE: boolean;
}

interface MatrixCaseDefinition {
  validationId: string;
  caseName: string;
  testName: string;
  inputValue: string;
  expectedBehavior: InteractiveExpectedBehavior;
}

export interface InteractiveLocatorStrategy {
  primary: 'live-discovery-field-index';
  fieldIndex: number;
  displayName: string;
  inferredType: string;
  confidence: string;
  fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input';
}

export interface InteractiveValidationCase {
  id: string;
  concept: FieldConceptKey;
  conceptDisplayName: string;
  fieldLabel: string;
  targetField: InteractiveLocatorStrategy;
  validationId: string;
  caseName: string;
  testName: string;
  inputValue: string;
  expectedBehavior: string;
  expectedSignal: InteractiveExpectedBehavior;
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
  observedValue: string | null;
  normalizedOrReformatted: boolean;
  inputPrevented: boolean;
}

export type ValidationCandidateSource =
  | 'aria-errormessage'
  | 'aria-describedby'
  | 'control-error'
  | 'field-wrapper-error'
  | 'field-wrapper-inline';

export interface RawValidationCandidate {
  source: ValidationCandidateSource;
  text: string;
}

export interface FieldLocalValidationDiagnostics {
  fieldLocalTexts: string[];
  docusignLocalTexts: string[];
  ignoredTexts: string[];
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
  observation: InteractiveObservation | null;
  evidence: string;
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
  targetConcepts: FieldConceptKey[];
  skippedConcepts: InteractiveSkippedConcept[];
  results: InteractiveValidationResult[];
}

const LONG_NAME = `Validation Test ${'A'.repeat(180)}`;
const LONG_DESCRIPTION = `This is a disposable validation test description. ${'A'.repeat(420)}`;
const GENERIC_DOCUSIGN_TEXT_RE =
  /attachmentrequired|signerattachment|attachmentoptional|attachmentrequired|select to load content for this page|this link will open in a new window|hide note|show note|view electronic record|press enter to use the screen reader|page\s+\d+\s+of\s+\d+/i;
const AMBIGUOUS_REQUIRED_RE = /^required$/i;
const INVALID_INDICATOR_RE = /(^|\b)(invalid|error|has-error|is-invalid|field-error|input-error|validation-error|ds-error)(\b|$)/i;
const FIELD_LOCAL_MESSAGE_RE = /(invalid|must\b|format\b|enter\b|between\b|too\s+(short|long)|minimum|max(imum)?|whole number|email|phone|zip|postal|naics|merchant category|date of birth|date)/i;

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
    expectedBehavior: 'reject_or_manual_review',
  },
  {
    validationId: 'special-characters-behavior',
    caseName: 'suspicious-garbage',
    testName: 'special characters behavior observed',
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
];

const MATRIX_BY_CONCEPT: Record<InteractiveTargetConcept, MatrixCaseDefinition[]> = {
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
      testName: 'future date rejected',
      inputValue: '2099/01/01',
      expectedBehavior: 'reject',
    },
    {
      validationId: 'under-age-dob-rejected-or-flagged',
      caseName: 'under-age-dob',
      testName: 'under-age DOB rejected or flagged',
      inputValue: '2012/01/01',
      expectedBehavior: 'reject_or_warn',
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
  business_name: TEXT_FIELD_MATRIX,
  dba_name: TEXT_FIELD_MATRIX.map((entry) =>
    entry.validationId === 'normal-value-accepted'
      ? { ...entry, inputValue: 'Acme Trade Co' }
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
      validationId: 'garbage-text-rejected-or-flagged',
      caseName: 'suspicious-garbage',
      testName: 'garbage text rejected or flagged',
      inputValue: '!@#$%^&*()',
      expectedBehavior: 'reject_or_warn',
    },
    {
      validationId: 'excessive-length-behavior',
      caseName: 'excessive-length',
      testName: 'excessive length behavior observed',
      inputValue: LONG_DESCRIPTION,
      expectedBehavior: 'reject_or_manual_review',
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
      testName: 'letters behavior observed',
      inputValue: 'ABCDE',
      expectedBehavior: 'observe',
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
};

export function getInteractiveGuardState(env: NodeJS.ProcessEnv = process.env): InteractiveGuardState {
  return {
    INTERACTIVE_VALIDATION: env.INTERACTIVE_VALIDATION === '1',
    DISPOSABLE_ENVELOPE: env.DISPOSABLE_ENVELOPE === '1',
  };
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

export function buildInteractiveValidationPlan(report: ValidationReport): InteractiveValidationPlan {
  const scorecard = buildValidationScorecard(report);
  const scoreByConcept = new Map(scorecard.conceptScores.map((score) => [score.key, score]));
  const cases: InteractiveValidationCase[] = [];
  const skippedConcepts: InteractiveSkippedConcept[] = [];

  for (const conceptKey of INTERACTIVE_TARGET_CONCEPTS) {
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

      cases.push(toInteractiveCase(conceptKey, concept.displayName, match, locatorStrategy, validation, matrixCase));
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceReport: {
      runStartedAt: report.runStartedAt,
      runFinishedAt: report.runFinishedAt,
    },
    targetConcepts: [...INTERACTIVE_TARGET_CONCEPTS],
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
    observation: null,
    evidence: skipped.reason,
    recommendation: `Confirm the ${skipped.conceptDisplayName} field mapping before running this interactive case.`,
    cleanupStrategy: 'no field mutated',
    safetyNotes: ['No field was mutated for this concept.'],
    skippedReason: skipped.reason,
  };
}

export async function runInteractiveCase(
  testCase: InteractiveValidationCase,
  field: DiscoveredField | null,
  frame: FrameHost,
): Promise<InteractiveValidationResult> {
  if (!field || field.controlCategory !== 'merchant_input') {
    return skippedCase(testCase, 'target field was not available as a merchant input in live discovery');
  }

  if (!field.visible || !field.editable) {
    return skippedCase(testCase, 'target field was not visible and editable');
  }

  const locator = field.locator;
  const originalValue = await readControlValue(locator);
  let filled = false;

  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    await locator.click({ timeout: 3_000 }).catch(() => undefined);
    await locator.fill(testCase.inputValue, { timeout: 7_500 });
    filled = true;
    await locator.blur({ timeout: 3_000 }).catch(() => undefined);
    await waitForClientValidation(locator);

    const observation = await collectObservation(field, frame, testCase.inputValue, filled);
    const status = evaluateObservation(testCase, observation);
    const evidence = summarizeObservation(testCase, observation);

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
      observation,
      evidence,
      recommendation: recommendationForResult(testCase, status, observation),
      cleanupStrategy: testCase.cleanupStrategy,
      safetyNotes: testCase.safetyNotes,
    };
  } catch (error) {
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
      observation: null,
      evidence: oneLine(error),
      recommendation: 'Review the locator and field editability before interpreting this case.',
      cleanupStrategy: testCase.cleanupStrategy,
      safetyNotes: testCase.safetyNotes,
      skippedReason: oneLine(error),
    };
  } finally {
    await restoreOriginalValue(locator, originalValue, filled);
  }
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
    targetConcepts: [...INTERACTIVE_TARGET_CONCEPTS],
    skippedConcepts: input.plan?.skippedConcepts ?? [],
    results,
  };
}

export function writeInteractiveResultsArtifacts(
  resultFile: InteractiveValidationResultsFile,
  outDir: string,
): { jsonPath: string; mdPath: string } {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, INTERACTIVE_RESULTS_JSON);
  const mdPath = path.join(outDir, INTERACTIVE_RESULTS_MD);
  fs.writeFileSync(jsonPath, JSON.stringify(resultFile, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderInteractiveResultsMarkdown(resultFile), 'utf8');
  return { jsonPath, mdPath };
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

  lines.push('| Concept | Field | Test | Severity | Status | Evidence | Recommendation |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const result of resultFile.results) {
    lines.push(
      `| ${esc(result.conceptDisplayName)} | ${esc(result.fieldLabel ?? 'n/a')} | ${esc(result.testName)} | ${result.severity} | ${statusLabel(result.status)} | ${esc(result.evidence)} | ${esc(result.recommendation)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function toInteractiveCase(
  concept: FieldConceptKey,
  conceptDisplayName: string,
  match: ScorecardFieldMatch,
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
    validationId: validation.id,
    caseName: matrixCase.caseName,
    testName: matrixCase.testName,
    inputValue: matrixCase.inputValue,
    expectedBehavior: validation.expectedBehavior,
    expectedSignal: matrixCase.expectedBehavior,
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
    observation: null,
    evidence: reason,
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

async function restoreOriginalValue(locator: Locator, originalValue: string | null, attemptedFill: boolean): Promise<void> {
  if (!attemptedFill || originalValue === null) return;
  await locator.fill(originalValue, { timeout: 5_000 }).catch(() => undefined);
  await locator.blur({ timeout: 2_000 }).catch(() => undefined);
}

async function waitForClientValidation(locator: Locator): Promise<void> {
  await locator.evaluate(() => new Promise((resolve) => window.setTimeout(resolve, 250))).catch(() => undefined);
}

async function collectObservation(
  field: DiscoveredField,
  frame: FrameHost,
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

    const errorCandidates: Array<{ source: ValidationCandidateSource; text: string }> = [];
    const invalidIndicators: string[] = [];
    const seenCandidates = new Set<string>();
    const seenIndicators = new Set<string>();
    const addCandidate = (source: ValidationCandidateSource, value: string | null | undefined) => {
      for (const part of splitText(value)) {
        const key = `${source}:${part}`;
        if (seenCandidates.has(key)) continue;
        seenCandidates.add(key);
        errorCandidates.push({ source, text: part });
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
        addCandidate(attribute === 'aria-errormessage' ? 'aria-errormessage' : 'aria-describedby', node?.textContent);
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
        addCandidate(wrapper === fieldRoot ? 'field-wrapper-inline' : 'control-error', wrapper.textContent);
      }
      for (const node of Array.from(wrapper.querySelectorAll(errorSelector)).slice(0, 8)) {
        const htmlNode = node as HTMLElement;
        const style = window.getComputedStyle(htmlNode);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        addCandidate(wrapper === fieldRoot ? 'field-wrapper-error' : 'control-error', htmlNode.textContent);
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
    ariaInvalid: dom.ariaInvalid,
    inputValue,
    observedValue,
  });

  return {
    ariaInvalid: dom.ariaInvalid,
    validationMessage: sanitizeNullable(dom.validationMessage),
    nearbyErrorText: diagnostics.fieldLocalTexts.length > 0 ? diagnostics.fieldLocalTexts.join(' | ') : null,
    docusignValidationText: diagnostics.docusignLocalTexts,
    invalidIndicators: dom.invalidIndicators.map(sanitizeEvidenceText),
    ignoredDiagnostics: diagnostics.ignoredTexts,
    observedValue,
    normalizedOrReformatted,
    inputPrevented,
  };
}

export function extractFieldLocalValidationDiagnostics(
  candidates: RawValidationCandidate[],
  context: { ariaInvalid: string | null; inputValue: string; observedValue: string | null },
): FieldLocalValidationDiagnostics {
  const fieldLocalTexts: string[] = [];
  const docusignLocalTexts: string[] = [];
  const ignoredTexts: string[] = [];
  const add = (bucket: string[], value: string) => {
    if (!bucket.includes(value)) bucket.push(value);
  };

  for (const candidate of candidates) {
    for (const part of splitValidationCandidateText(candidate.text)) {
      const splitCandidate: RawValidationCandidate = { ...candidate, text: part };
      const classification = classifyValidationCandidate(splitCandidate, context);
      if (classification === 'ignored') {
        add(ignoredTexts, part);
        continue;
      }
      add(fieldLocalTexts, part);
      if (candidate.source === 'field-wrapper-error' || candidate.source === 'field-wrapper-inline') {
        add(docusignLocalTexts, part);
      }
    }
  }

  return {
    fieldLocalTexts,
    docusignLocalTexts,
    ignoredTexts,
  };
}

function classifyValidationCandidate(
  candidate: RawValidationCandidate,
  context: { ariaInvalid: string | null; inputValue: string; observedValue: string | null },
): 'field-local' | 'ignored' {
  const value = sanitizeEvidenceText(candidate.text);
  if (!value) return 'ignored';

  const lower = value.toLowerCase();
  const observed = (context.observedValue ?? '').trim().toLowerCase();
  const input = context.inputValue.trim().toLowerCase();
  if (lower === observed || lower === input) return 'ignored';
  if (GENERIC_DOCUSIGN_TEXT_RE.test(value)) return 'ignored';
  if (AMBIGUOUS_REQUIRED_RE.test(value)) {
    if (candidate.source === 'aria-describedby' || candidate.source === 'aria-errormessage') {
      return context.ariaInvalid === 'true' || context.observedValue === '' ? 'field-local' : 'ignored';
    }
    return 'ignored';
  }
  if (candidate.source === 'aria-describedby' || candidate.source === 'aria-errormessage') {
    return 'field-local';
  }
  if (FIELD_LOCAL_MESSAGE_RE.test(value)) return 'field-local';
  return 'ignored';
}

function splitValidationCandidateText(value: string): string[] {
  return sanitizeEvidenceText(value)
    .split(/\s+\|\s+|\r?\n|•|·/)
    .map((part) => sanitizeEvidenceText(part.replace(/^[\-\u2022\s]+/, '')))
    .filter(Boolean);
}

function evaluateObservation(testCase: InteractiveValidationCase, observation: InteractiveObservation): InteractiveResultStatus {
  const rejected = hasValidationFeedback(observation);
  const accepted = !rejected && !observation.inputPrevented;

  switch (testCase.expectedSignal) {
    case 'accept':
      return accepted ? 'passed' : severityFailureStatus(testCase.severity);
    case 'reject':
      return rejected || observation.inputPrevented ? 'passed' : severityFailureStatus(testCase.severity);
    case 'reject_or_warn':
      return rejected || observation.inputPrevented ? 'passed' : 'warning';
    case 'reject_or_manual_review':
      return rejected || observation.inputPrevented ? 'passed' : 'manual_review';
    case 'observe':
      return 'manual_review';
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

function summarizeObservation(testCase: InteractiveValidationCase, observation: InteractiveObservation): string {
  const parts = [
    `input "${sanitizeEvidenceText(testCase.inputValue)}"`,
    `observed "${observation.observedValue ?? ''}"`,
    `aria-invalid=${observation.ariaInvalid ?? 'null'}`,
  ];
  if (observation.validationMessage) parts.push(`validationMessage="${observation.validationMessage}"`);
  if (observation.nearbyErrorText) parts.push(`nearbyError="${observation.nearbyErrorText}"`);
  if (observation.docusignValidationText.length) {
    parts.push(`visibleValidation="${observation.docusignValidationText.join(' | ')}"`);
  }
  if (observation.invalidIndicators.length) {
    parts.push(`invalidIndicators="${observation.invalidIndicators.join(' | ')}"`);
  }
  if (observation.ignoredDiagnostics.length) {
    parts.push(`ignoredDiagnostics="${observation.ignoredDiagnostics.join(' | ')}"`);
  }
  if (observation.normalizedOrReformatted) parts.push('value normalized/reformatted');
  if (observation.inputPrevented) parts.push('input prevented or cleared');
  return parts.join('; ');
}

function recommendationForResult(
  testCase: InteractiveValidationCase,
  status: InteractiveResultStatus,
  observation: InteractiveObservation,
): string {
  if (status === 'passed') return 'Observed behavior matched the expected validation signal.';
  if (status === 'manual_review') {
    return `Review ${testCase.conceptDisplayName}: ${testCase.testName}; behavior was intentionally recorded without overclaiming.`;
  }
  if (status === 'warning') {
    return `Review whether ${testCase.conceptDisplayName} should allow this value without a clearer validation signal.`;
  }
  if (status === 'skipped') return 'Resolve the locator or mapping issue and rerun on a disposable envelope.';
  if (!hasValidationFeedback(observation)) {
    return `Block this value or show a validation error for ${testCase.conceptDisplayName} on blur.`;
  }
  return `Confirm the validation rule for ${testCase.conceptDisplayName}.`;
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