import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FIELD_CONCEPTS,
  type BestPracticeValidation,
  type FieldConceptDefinition,
  type FieldConceptKey,
  type ValidationExpectationSeverity,
} from './field-concepts';
import type { CheckResult, FieldRecord, ValidationReport } from './validation-report';

export type IdentificationConfidence = 'none' | 'low' | 'medium' | 'high';

export type ScorecardValidationStatus =
  | 'passed'
  | 'failed'
  | 'warning'
  | 'manual_review'
  | 'skipped'
  | 'not_run'
  | 'cannot_run_not_confidently_mapped';

export type ValidationQualityGrade =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'Not Yet Tested'
  | 'Needs Mapping'
  | 'Not Found'
  | 'Review';

export interface ScorecardFieldMatch {
  fieldIndex: number;
  displayName: string;
  businessSection: string;
  controlCategory: FieldRecord['controlCategory'];
  inferredType: FieldRecord['inferredType'];
  labelSource: FieldRecord['labelSource'];
  labelConfidence: FieldRecord['labelConfidence'];
  identificationConfidence: IdentificationConfidence;
  evidence: string[];
}

export interface ScorecardValidationRow {
  id: string;
  displayName: string;
  expectedBehavior: string;
  severity: ValidationExpectationSeverity;
  status: ScorecardValidationStatus;
  executed: boolean;
  actualChecks: Array<{
    fieldIndex: number;
    case: string;
    status: CheckResult['status'];
    detail?: string;
  }>;
  recommendation: string;
}

export interface FieldConceptScore {
  key: FieldConceptKey;
  displayName: string;
  businessSection: string;
  foundField: boolean;
  identifiedWithConfidence: boolean;
  identificationConfidence: IdentificationConfidence;
  identificationEvidence: string[];
  mappedFields: ScorecardFieldMatch[];
  expectedValidationCount: number;
  executedValidationCount: number;
  passedValidationCount: number;
  failedValidationCount: number;
  skippedValidationCount: number;
  notRunValidationCount: number;
  cannotRunValidationCount: number;
  validationCoveragePercent: number;
  validationQualityGrade: ValidationQualityGrade;
  summary: string;
  recommendedImprovements: string[];
  bestPracticeValidations: ScorecardValidationRow[];
  validExamples: string[];
  invalidExamples: string[];
  notes: string;
}

export interface ValidationScorecard {
  schemaVersion: 1;
  generatedAt: string;
  sourceReport: {
    runStartedAt: string;
    runFinishedAt: string;
    destructiveMode: boolean;
    totals: ValidationReport['totals'];
  };
  overall: {
    fieldConceptsCovered: number;
    fieldConceptsFound: number;
    fieldConceptsIdentifiedWithConfidence: number;
    expectedValidationCount: number;
    executedValidationCount: number;
    passedValidationCount: number;
    failedValidationCount: number;
    skippedValidationCount: number;
    notRunValidationCount: number;
    cannotRunValidationCount: number;
    validationCoveragePercent: number;
    validationQualityGrade: ValidationQualityGrade;
    summary: string;
  };
  conceptScores: FieldConceptScore[];
  expectedButNotConfidentlyFound: Array<{
    key: FieldConceptKey;
    displayName: string;
    businessSection: string;
    reason: string;
  }>;
  testsActuallyExecuted: Array<{
    fieldConcept: string;
    validation: string;
    status: ScorecardValidationStatus;
    evidence: string;
  }>;
  testsNotYetExecuted: Array<{
    fieldConcept: string;
    validation: string;
    status: ScorecardValidationStatus;
    reason: string;
  }>;
  suggestedImprovements: string[];
  nextRecommendedValidationScenarios: string[];
  risksAndCaveats: string[];
}

const CONFIDENCE_RANK: Record<IdentificationConfidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function buildValidationScorecard(report: ValidationReport): ValidationScorecard {
  const conceptScores = FIELD_CONCEPTS.map((concept) => scoreConcept(report, concept));
  const overall = buildOverall(report, conceptScores);

  const expectedButNotConfidentlyFound = conceptScores
    .filter((score) => !score.identifiedWithConfidence)
    .map((score) => ({
      key: score.key,
      displayName: score.displayName,
      businessSection: score.businessSection,
      reason: score.foundField
        ? 'A possible field was found, but the label/enrichment evidence is not strong enough to treat it as mapped.'
        : 'No discovered field confidently matched this concept.',
    }));

  const testsActuallyExecuted = conceptScores.flatMap((score) =>
    score.bestPracticeValidations
      .filter((row) => row.executed)
      .map((row) => ({
        fieldConcept: score.displayName,
        validation: row.displayName,
        status: row.status,
        evidence: row.actualChecks
          .map((check) => `field #${check.fieldIndex} ${check.case} -> ${check.status}`)
          .join('; '),
      })),
  );

  const testsNotYetExecuted = conceptScores.flatMap((score) =>
    score.bestPracticeValidations
      .filter((row) => !row.executed)
      .map((row) => ({
        fieldConcept: score.displayName,
        validation: row.displayName,
        status: row.status,
        reason: row.recommendation,
      })),
  );

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceReport: {
      runStartedAt: report.runStartedAt,
      runFinishedAt: report.runFinishedAt,
      destructiveMode: report.destructiveMode,
      totals: report.totals,
    },
    overall,
    conceptScores,
    expectedButNotConfidentlyFound,
    testsActuallyExecuted,
    testsNotYetExecuted,
    suggestedImprovements: buildSuggestedImprovements(report, conceptScores),
    nextRecommendedValidationScenarios: buildNextScenarios(report, conceptScores),
    risksAndCaveats: buildRisksAndCaveats(report),
  };
}

export function writeScorecardArtifacts(
  report: ValidationReport,
  outDir: string,
): { jsonPath: string; mdPath: string; scorecard: ValidationScorecard } {
  fs.mkdirSync(outDir, { recursive: true });
  const scorecard = buildValidationScorecard(report);
  const jsonPath = path.join(outDir, 'latest-validation-scorecard.json');
  const mdPath = path.join(outDir, 'latest-validation-scorecard.md');
  fs.writeFileSync(jsonPath, JSON.stringify(scorecard, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderScorecardMarkdown(scorecard), 'utf8');
  return { jsonPath, mdPath, scorecard };
}

export function generateScorecardFromSummary(
  summaryPath: string,
  outDir = path.dirname(summaryPath),
): { jsonPath: string; mdPath: string; scorecard: ValidationScorecard } {
  const raw = fs.readFileSync(summaryPath, 'utf8');
  const report = JSON.parse(raw) as ValidationReport;
  return writeScorecardArtifacts(report, outDir);
}

function scoreConcept(report: ValidationReport, concept: FieldConceptDefinition): FieldConceptScore {
  const matches = report.fields
    .map((field, fieldIndex) => matchFieldToConcept(field, concept, fieldIndex + 1))
    .filter((match): match is ScorecardFieldMatch => match !== null)
    .sort((a, b) => {
      const confidence = CONFIDENCE_RANK[b.identificationConfidence] - CONFIDENCE_RANK[a.identificationConfidence];
      if (confidence !== 0) return confidence;
      return a.fieldIndex - b.fieldIndex;
    });

  const identifiedWithConfidence = matches.some(
    (match) => CONFIDENCE_RANK[match.identificationConfidence] >= CONFIDENCE_RANK.medium,
  );
  const identificationConfidence = matches.reduce<IdentificationConfidence>(
    (best, match) =>
      CONFIDENCE_RANK[match.identificationConfidence] > CONFIDENCE_RANK[best]
        ? match.identificationConfidence
        : best,
    'none',
  );
  const confidentFieldIndexes = new Set(
    matches
      .filter((match) => CONFIDENCE_RANK[match.identificationConfidence] >= CONFIDENCE_RANK.medium)
      .map((match) => match.fieldIndex),
  );
  const confidentFields = report.fields
    .map((field, fieldIndex) => ({ field, fieldIndex: fieldIndex + 1 }))
    .filter((entry) => confidentFieldIndexes.has(entry.fieldIndex));

  const bestPracticeValidations = concept.bestPracticeValidations.map((validation) =>
    scoreValidation(validation, confidentFields, identifiedWithConfidence),
  );

  const expectedValidationCount = bestPracticeValidations.length;
  const executedValidationCount = bestPracticeValidations.filter((row) => row.executed).length;
  const passedValidationCount = bestPracticeValidations.filter((row) => row.status === 'passed').length;
  const failedValidationCount = bestPracticeValidations.filter((row) => row.status === 'failed' || row.status === 'warning').length;
  const skippedValidationCount = bestPracticeValidations.filter((row) => row.status === 'skipped').length;
  const cannotRunValidationCount = bestPracticeValidations.filter(
    (row) => row.status === 'cannot_run_not_confidently_mapped',
  ).length;
  const notRunValidationCount = bestPracticeValidations.filter((row) => row.status === 'not_run').length;
  const validationCoveragePercent = expectedValidationCount === 0
    ? 100
    : Math.round((executedValidationCount / expectedValidationCount) * 100);
  const validationQualityGrade = gradeConcept({
    foundField: matches.length > 0,
    identifiedWithConfidence,
    expectedValidationCount,
    executedValidationCount,
    failedValidationCount,
    validationCoveragePercent,
  });

  const score: FieldConceptScore = {
    key: concept.key,
    displayName: concept.displayName,
    businessSection: concept.businessSection,
    foundField: matches.length > 0,
    identifiedWithConfidence,
    identificationConfidence,
    identificationEvidence: Array.from(new Set(matches.flatMap((match) => match.evidence))).slice(0, 8),
    mappedFields: matches,
    expectedValidationCount,
    executedValidationCount,
    passedValidationCount,
    failedValidationCount,
    skippedValidationCount,
    notRunValidationCount,
    cannotRunValidationCount,
    validationCoveragePercent,
    validationQualityGrade,
    summary: '',
    recommendedImprovements: [],
    bestPracticeValidations,
    validExamples: concept.validExamples,
    invalidExamples: concept.invalidExamples,
    notes: concept.notes,
  };
  score.summary = summarizeConcept(score, report);
  score.recommendedImprovements = recommendForConcept(score, report);
  return score;
}

function matchFieldToConcept(
  field: FieldRecord,
  concept: FieldConceptDefinition,
  fieldIndex: number,
): ScorecardFieldMatch | null {
  if (!fieldIsEligibleForConcept(field, concept)) return null;

  const evidence: string[] = [];
  let confidence: IdentificationConfidence = 'none';
  const businessTexts = businessLabelTexts(field);

  if (field.enrichment?.jsonKeyPath && concept.jsonKeyPatterns.some((pattern) => pattern.test(field.enrichment!.jsonKeyPath))) {
    confidence = maxConfidence(confidence, confidenceFromEnrichment(field));
    evidence.push(`enrichment key ${field.enrichment.jsonKeyPath}`);
  }

  const matchingText = businessTexts.find((text) => concept.labelPatterns.some((pattern) => pattern.test(text)));
  if (matchingText) {
    confidence = maxConfidence(confidence, confidenceFromLabel(field));
    evidence.push(`business label "${truncate(matchingText, 80)}"`);
  }

  if (concept.fieldTypes.includes(field.inferredType)) {
    const typeConfidence = usableBusinessLabel(field) || field.enrichment?.suggestedDisplayName
      ? confidenceFromLabel(field)
      : 'low';
    confidence = maxConfidence(confidence, typeConfidence);
    evidence.push(`inferred type ${field.inferredType}`);
  }

  if (confidence === 'none') return null;

  return {
    fieldIndex,
    displayName: displayNameForField(field),
    businessSection: field.enrichment?.suggestedBusinessSection ?? sectionFromField(field, concept),
    controlCategory: field.controlCategory,
    inferredType: field.inferredType,
    labelSource: field.labelSource,
    labelConfidence: field.labelConfidence,
    identificationConfidence: confidence,
    evidence,
  };
}

function fieldIsEligibleForConcept(field: FieldRecord, concept: FieldConceptDefinition): boolean {
  if (concept.key === 'upload') return field.controlCategory === 'attachment_control' || field.controlCategory === 'merchant_input';
  if (concept.key === 'signature') {
    return ['merchant_input', 'signature_widget', 'read_only_display'].includes(field.controlCategory);
  }
  if (concept.key === 'acknowledgement_checkbox') {
    return ['merchant_input', 'acknowledgement_checkbox'].includes(field.controlCategory);
  }
  return field.controlCategory === 'merchant_input';
}

function scoreValidation(
  validation: BestPracticeValidation,
  confidentFields: Array<{ field: FieldRecord; fieldIndex: number }>,
  identifiedWithConfidence: boolean,
): ScorecardValidationRow {
  if (!identifiedWithConfidence) {
    return {
      id: validation.id,
      displayName: validation.displayName,
      expectedBehavior: validation.expectedBehavior,
      severity: validation.severity,
      status: 'cannot_run_not_confidently_mapped',
      executed: false,
      actualChecks: [],
      recommendation: 'Confirm the field mapping before running or interpreting this validation.',
    };
  }

  const actualChecks = confidentFields.flatMap(({ field, fieldIndex }) =>
    field.checks
      .filter((check) => validationMatchesCheck(validation, check))
      .map((check) => ({
        fieldIndex,
        case: check.case,
        status: check.status,
        detail: check.detail,
      })),
  );

  if (actualChecks.length === 0) {
    return {
      id: validation.id,
      displayName: validation.displayName,
      expectedBehavior: validation.expectedBehavior,
      severity: validation.severity,
      status: 'not_run',
      executed: false,
      actualChecks: [],
      recommendation: 'Recommended but not executed in this report. Run value-level validation only on a disposable/test envelope.',
    };
  }

  const status = summarizeActualCheckStatus(actualChecks.map((check) => check.status));
  return {
    id: validation.id,
    displayName: validation.displayName,
    expectedBehavior: validation.expectedBehavior,
    severity: validation.severity,
    status,
    executed: status !== 'skipped',
    actualChecks,
    recommendation: recommendationForStatus(status),
  };
}

function validationMatchesCheck(validation: BestPracticeValidation, check: CheckResult): boolean {
  const checkCase = check.case.toLowerCase();
  if (checkCase.startsWith('case-matrix:')) return false;
  return validation.caseNames.some((caseName) => {
    const normalized = caseName.toLowerCase();
    return checkCase === normalized || checkCase.endsWith(`:${normalized}`);
  });
}

function summarizeActualCheckStatus(statuses: CheckResult['status'][]): ScorecardValidationStatus {
  if (statuses.some((status) => status === 'fail')) return 'failed';
  if (statuses.some((status) => status === 'warning')) return 'warning';
  if (statuses.some((status) => status === 'manual_review')) return 'manual_review';
  if (statuses.every((status) => status === 'skipped')) return 'skipped';
  return 'passed';
}

function recommendationForStatus(status: ScorecardValidationStatus): string {
  switch (status) {
    case 'passed':
      return 'Validation executed and passed in this report.';
    case 'failed':
      return 'Validation executed and failed. Tighten the UI rule or confirm expected behavior.';
    case 'warning':
      return 'Validation executed with a warning. Review whether the allowed behavior is intentional.';
    case 'manual_review':
      return 'Validation produced a manual-review result. Confirm the rule with product/risk owners.';
    case 'skipped':
      return 'Validation was selected but skipped, usually because the field was not editable or visible.';
    case 'not_run':
      return 'Recommended but not executed in this report. Run value-level validation only on a disposable/test envelope.';
    case 'cannot_run_not_confidently_mapped':
      return 'Confirm the field mapping before running or interpreting this validation.';
  }
}

function buildOverall(report: ValidationReport, scores: FieldConceptScore[]): ValidationScorecard['overall'] {
  const expectedValidationCount = sum(scores, (score) => score.expectedValidationCount);
  const executedValidationCount = sum(scores, (score) => score.executedValidationCount);
  const passedValidationCount = sum(scores, (score) => score.passedValidationCount);
  const failedValidationCount = sum(scores, (score) => score.failedValidationCount);
  const skippedValidationCount = sum(scores, (score) => score.skippedValidationCount);
  const notRunValidationCount = sum(scores, (score) => score.notRunValidationCount);
  const cannotRunValidationCount = sum(scores, (score) => score.cannotRunValidationCount);
  const validationCoveragePercent = expectedValidationCount === 0
    ? 100
    : Math.round((executedValidationCount / expectedValidationCount) * 100);
  const validationQualityGrade = gradeCoverage({
    expectedValidationCount,
    executedValidationCount,
    failedValidationCount,
    validationCoveragePercent,
  });

  return {
    fieldConceptsCovered: scores.length,
    fieldConceptsFound: scores.filter((score) => score.foundField).length,
    fieldConceptsIdentifiedWithConfidence: scores.filter((score) => score.identifiedWithConfidence).length,
    expectedValidationCount,
    executedValidationCount,
    passedValidationCount,
    failedValidationCount,
    skippedValidationCount,
    notRunValidationCount,
    cannotRunValidationCount,
    validationCoveragePercent,
    validationQualityGrade,
    summary: report.destructiveMode
      ? `${executedValidationCount} of ${expectedValidationCount} best-practice checks executed.`
      : `Safe mode was ON for this source report. Discovery/static checks ran, but value-level best-practice validations were not executed unless an individual row is explicitly shown as passed or failed.`,
  };
}

function gradeConcept(input: {
  foundField: boolean;
  identifiedWithConfidence: boolean;
  expectedValidationCount: number;
  executedValidationCount: number;
  failedValidationCount: number;
  validationCoveragePercent: number;
}): ValidationQualityGrade {
  if (!input.foundField) return 'Not Found';
  if (!input.identifiedWithConfidence) return 'Needs Mapping';
  return gradeCoverage(input);
}

function gradeCoverage(input: {
  expectedValidationCount: number;
  executedValidationCount: number;
  failedValidationCount: number;
  validationCoveragePercent: number;
}): ValidationQualityGrade {
  if (input.expectedValidationCount === 0) return 'Review';
  if (input.executedValidationCount === 0) return 'Not Yet Tested';
  if (input.failedValidationCount > 0) {
    if (input.validationCoveragePercent >= 80) return 'C';
    return 'D';
  }
  if (input.validationCoveragePercent >= 95) return 'A';
  if (input.validationCoveragePercent >= 80) return 'B';
  if (input.validationCoveragePercent >= 60) return 'C';
  return 'D';
}

function summarizeConcept(score: FieldConceptScore, report: ValidationReport): string {
  if (!score.foundField) {
    return 'No discovered field confidently or weakly matched this concept.';
  }
  if (!score.identifiedWithConfidence) {
    return 'A possible field was found, but mapping confidence is not high enough to interpret validation coverage.';
  }
  if (score.executedValidationCount === 0) {
    return report.destructiveMode
      ? 'Field was mapped, but no best-practice value validations were executed.'
      : 'Field was mapped, but source report was safe-mode discovery; best-practice value validations remain not run.';
  }
  if (score.failedValidationCount > 0) {
    return `${score.executedValidationCount} best-practice validations ran and ${score.failedValidationCount} need review.`;
  }
  return `${score.executedValidationCount} best-practice validations ran with no failures recorded.`;
}

function recommendForConcept(score: FieldConceptScore, report: ValidationReport): string[] {
  const recs: string[] = [];
  if (!score.foundField) {
    recs.push(`Add or confirm a stable mapping for ${score.displayName}.`);
  } else if (!score.identifiedWithConfidence) {
    recs.push(`Confirm the ${score.displayName} field label or enrichment mapping before interpreting validation results.`);
  }
  if (score.identificationConfidence === 'low' || score.identificationConfidence === 'none') {
    recs.push(`Improve accessible labeling or sample enrichment for ${score.displayName}.`);
  }
  if (!report.destructiveMode && score.identifiedWithConfidence) {
    recs.push(`Run disposable-envelope value validation for ${score.displayName}; keep safe mode as the default.`);
  }
  const failed = score.bestPracticeValidations.filter((row) => row.status === 'failed' || row.status === 'warning');
  for (const row of failed.slice(0, 3)) {
    recs.push(`Review ${score.displayName}: ${row.displayName}.`);
  }
  const missing = score.bestPracticeValidations.filter(
    (row) => row.status === 'not_run' || row.status === 'cannot_run_not_confidently_mapped',
  );
  if (missing.length) {
    recs.push(`Cover ${missing.length} recommended ${score.displayName} validation(s) that are not yet executed.`);
  }
  return Array.from(new Set(recs));
}

function buildSuggestedImprovements(report: ValidationReport, scores: FieldConceptScore[]): string[] {
  const improvements = [
    'Keep SAFE MODE as the default and run value-level mutation only on disposable/test envelopes.',
    'Do not treat recommended best-practice checks as tested unless the scorecard status is Passed, Failed, Warning, or Manual review.',
  ];
  if (report.labelQualitySummary.genericDocusignTabTypeLabelsAccepted > 0) {
    improvements.push('Remove any generic DocuSign tab-type labels from business-field identification.');
  }
  if (report.labelQualitySummary.unresolvedFields > 0) {
    improvements.push(`Improve labels/enrichment for ${report.labelQualitySummary.unresolvedFields} unresolved discovered control(s).`);
  }
  const needsMapping = scores.filter((score) => score.validationQualityGrade === 'Needs Mapping' || score.validationQualityGrade === 'Not Found');
  if (needsMapping.length) {
    improvements.push(
      `Prioritize mapping for: ${needsMapping.slice(0, 8).map((score) => score.displayName).join(', ')}.`,
    );
  }
  const notTested = scores.filter((score) => score.validationQualityGrade === 'Not Yet Tested');
  if (notTested.length) {
    improvements.push(
      `Next disposable-envelope validation pass should cover: ${notTested.slice(0, 8).map((score) => score.displayName).join(', ')}.`,
    );
  }
  return Array.from(new Set(improvements));
}

function buildNextScenarios(report: ValidationReport, scores: FieldConceptScore[]): string[] {
  const priorityOrder: FieldConceptKey[] = [
    'date_of_birth',
    'phone',
    'ein',
    'email',
    'business_name',
    'routing_number',
    'account_number',
    'legal_entity_type',
    'ownership_percentage',
  ];
  const byKey = new Map(scores.map((score) => [score.key, score]));
  const scenarios: string[] = [];
  for (const key of priorityOrder) {
    const score = byKey.get(key);
    if (!score) continue;
    if (!score.identifiedWithConfidence) {
      scenarios.push(`Confirm ${score.displayName} mapping before value-level validation.`);
      continue;
    }
    const missing = score.bestPracticeValidations.filter((row) => row.status === 'not_run');
    if (missing.length) {
      scenarios.push(
        `On a disposable envelope, run ${score.displayName}: ${missing.slice(0, 4).map((row) => row.displayName).join(', ')}.`,
      );
    }
  }
  if (!report.destructiveMode) {
    scenarios.unshift('Generate a disposable/test envelope before enabling DESTRUCTIVE_VALIDATION=1 for value-level validation.');
  }
  return Array.from(new Set(scenarios)).slice(0, 12);
}

function buildRisksAndCaveats(report: ValidationReport): string[] {
  const risks = [
    'This scorecard is a reporting/planning artifact. It does not submit, finish, complete, sign, adopt, or mutate the DocuSign envelope.',
    'Recommended validations are not evidence that a validation ran. Only rows marked Passed, Failed, Warning, or Manual review were executed.',
    'Generic DocuSign tab-type labels are not counted as confident business-field identification.',
    'Raw DocuSign URLs, Gmail token contents, and raw email bodies are not included in scorecard artifacts.',
  ];
  if (!report.destructiveMode) {
    risks.push('The source report was safe-mode discovery, so value-level validation coverage is expected to be low or zero.');
  }
  if (report.enrichmentSummary.enabled) {
    risks.push('Sample enrichment improves names/sections, but positional or coordinate matches should be reviewed before destructive validation.');
  }
  return risks;
}

export function renderScorecardMarkdown(scorecard: ValidationScorecard): string {
  const lines: string[] = [];
  lines.push('# Bead Onboarding - Field Validation Scorecard');
  lines.push('');
  lines.push('## Executive summary');
  lines.push('');
  lines.push(`- Source run: ${scorecard.sourceReport.runStartedAt} to ${scorecard.sourceReport.runFinishedAt}`);
  lines.push(`- Safe/destructive mode: ${scorecard.sourceReport.destructiveMode ? 'DESTRUCTIVE_VALIDATION=1 was ON' : 'SAFE MODE / destructive validation OFF'}`);
  lines.push(`- Field concepts covered: ${scorecard.overall.fieldConceptsCovered}`);
  lines.push(`- Field concepts found: ${scorecard.overall.fieldConceptsFound}`);
  lines.push(`- Field concepts identified with confidence: ${scorecard.overall.fieldConceptsIdentifiedWithConfidence}`);
  lines.push(`- Overall validation coverage: ${scorecard.overall.validationCoveragePercent}%`);
  lines.push(`- Overall grade: ${scorecard.overall.validationQualityGrade}`);
  lines.push('');
  lines.push(scorecard.overall.summary);
  lines.push('');

  lines.push('## Overall validation coverage grade');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---|');
  lines.push(`| Expected best-practice validations | ${scorecard.overall.expectedValidationCount} |`);
  lines.push(`| Executed best-practice checks | ${scorecard.overall.executedValidationCount} |`);
  lines.push(`| Passed | ${scorecard.overall.passedValidationCount} |`);
  lines.push(`| Failed / warning | ${scorecard.overall.failedValidationCount} |`);
  lines.push(`| Skipped | ${scorecard.overall.skippedValidationCount} |`);
  lines.push(`| Not run | ${scorecard.overall.notRunValidationCount} |`);
  lines.push(`| Cannot run until mapped | ${scorecard.overall.cannotRunValidationCount} |`);
  lines.push(`| Coverage | ${scorecard.overall.validationCoveragePercent}% |`);
  lines.push(`| Grade | ${scorecard.overall.validationQualityGrade} |`);
  lines.push('');

  lines.push('## Field concept coverage table');
  lines.push('');
  lines.push('| Field concept | Section | Found field | Identified with confidence | Confidence | Expected | Executed | Passed | Failed / warning | Skipped | Not run | Cannot run | Coverage | Grade | Summary |');
  lines.push('|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|');
  for (const score of scorecard.conceptScores) {
    lines.push(
      `| ${esc(score.displayName)} | ${esc(score.businessSection)} | ${yesNo(score.foundField)} | ${yesNo(score.identifiedWithConfidence)} | ${score.identificationConfidence} | ${score.expectedValidationCount} | ${score.executedValidationCount} | ${score.passedValidationCount} | ${score.failedValidationCount} | ${score.skippedValidationCount} | ${score.notRunValidationCount} | ${score.cannotRunValidationCount} | ${score.validationCoveragePercent}% | ${score.validationQualityGrade} | ${esc(score.summary)} |`,
    );
  }
  lines.push('');

  if (scorecard.expectedButNotConfidentlyFound.length) {
    lines.push('## Expected but not confidently found');
    lines.push('');
    lines.push('| Field concept | Section | Reason |');
    lines.push('|---|---|---|');
    for (const item of scorecard.expectedButNotConfidentlyFound) {
      lines.push(`| ${esc(item.displayName)} | ${esc(item.businessSection)} | ${esc(item.reason)} |`);
    }
    lines.push('');
  }

  lines.push('## Best-practice validation matrix by field concept');
  lines.push('');
  for (const score of scorecard.conceptScores) {
    lines.push(`### ${score.displayName}`);
    lines.push('');
    lines.push(`- Identification confidence: ${score.identificationConfidence}`);
    lines.push(`- Grade: ${score.validationQualityGrade}`);
    lines.push(`- Examples of valid values: ${score.validExamples.map((value) => `\`${esc(value)}\``).join(', ') || 'n/a'}`);
    lines.push(`- Examples of invalid values: ${score.invalidExamples.map((value) => `\`${esc(value)}\``).join(', ') || 'n/a'}`);
    lines.push(`- Rationale: ${esc(score.notes)}`);
    if (score.mappedFields.length) {
      lines.push(`- Mapped field evidence: ${score.mappedFields.slice(0, 4).map((field) => `#${field.fieldIndex} ${esc(field.displayName)} (${field.identificationConfidence})`).join('; ')}`);
    } else {
      lines.push('- Mapped field evidence: none');
    }
    lines.push('');
    lines.push('| Expected validation | Severity | Status | Expected behavior | Evidence / recommendation |');
    lines.push('|---|---|---|---|---|');
    for (const row of score.bestPracticeValidations) {
      const evidence = row.actualChecks.length
        ? row.actualChecks.map((check) => `field #${check.fieldIndex} ${check.case}: ${check.status}`).join('; ')
        : row.recommendation;
      lines.push(
        `| ${esc(row.displayName)} | ${row.severity} | ${statusLabel(row.status)} | ${esc(row.expectedBehavior)} | ${esc(evidence)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Tests actually executed');
  lines.push('');
  if (scorecard.testsActuallyExecuted.length === 0) {
    lines.push('No scorecard best-practice checks were executed. Static discovery checks may have run in the source summary, but they are not counted as business validation coverage unless represented by an individual scorecard row.');
  } else {
    lines.push('| Field concept | Validation | Status | Evidence |');
    lines.push('|---|---|---|---|');
    for (const row of scorecard.testsActuallyExecuted) {
      lines.push(`| ${esc(row.fieldConcept)} | ${esc(row.validation)} | ${statusLabel(row.status)} | ${esc(row.evidence)} |`);
    }
  }
  lines.push('');

  lines.push('## Tests not yet executed');
  lines.push('');
  lines.push('| Field concept | Validation | Status | Reason |');
  lines.push('|---|---|---|---|');
  for (const row of scorecard.testsNotYetExecuted.slice(0, 120)) {
    lines.push(`| ${esc(row.fieldConcept)} | ${esc(row.validation)} | ${statusLabel(row.status)} | ${esc(row.reason)} |`);
  }
  if (scorecard.testsNotYetExecuted.length > 120) {
    lines.push(`| Additional rows omitted from markdown table | ${scorecard.testsNotYetExecuted.length - 120} | Not run | See JSON artifact for full detail. |`);
  }
  lines.push('');

  lines.push('## Suggested improvements');
  lines.push('');
  for (const item of scorecard.suggestedImprovements) lines.push(`- ${esc(item)}`);
  lines.push('');

  lines.push('## Next recommended validation scenarios');
  lines.push('');
  for (const item of scorecard.nextRecommendedValidationScenarios) lines.push(`- ${esc(item)}`);
  lines.push('');

  lines.push('## Risks / caveats');
  lines.push('');
  for (const item of scorecard.risksAndCaveats) lines.push(`- ${esc(item)}`);
  lines.push('');

  return lines.join('\n');
}

function businessLabelTexts(field: FieldRecord): string[] {
  const texts: string[] = [];
  const label = usableBusinessLabel(field);
  if (label) texts.push(label);
  if (field.enrichment?.suggestedDisplayName && !isGenericDocusignLabel(field.enrichment.suggestedDisplayName)) {
    texts.push(field.enrichment.suggestedDisplayName);
  }
  if (field.idOrNameKey && !isGenericDocusignIdKey(field.idOrNameKey)) {
    texts.push(field.idOrNameKey);
  }
  return Array.from(new Set(texts));
}

function usableBusinessLabel(field: FieldRecord): string | null {
  const label = field.resolvedLabel?.trim();
  if (!label) return null;
  if (field.labelSource === 'docusign-tab-type') return null;
  if (field.labelLooksLikeValue) return null;
  if (isGenericDocusignLabel(label)) return null;
  if (/^required\s*[-:]?/i.test(label)) return null;
  return label;
}

function displayNameForField(field: FieldRecord): string {
  return usableBusinessLabel(field)
    ?? field.enrichment?.suggestedDisplayName
    ?? (field.idOrNameKey && !isGenericDocusignIdKey(field.idOrNameKey) ? humanize(field.idOrNameKey) : null)
    ?? `${field.kind} / ${field.inferredType}`;
}

function sectionFromField(field: FieldRecord, concept: FieldConceptDefinition): string {
  return field.section ?? concept.businessSection;
}

function confidenceFromEnrichment(field: FieldRecord): IdentificationConfidence {
  if (!field.enrichment) return 'none';
  if (field.enrichment.matchedBy === 'guid' && field.enrichment.confidence === 'high') return 'high';
  if (field.enrichment.confidence === 'low') return 'low';
  return 'medium';
}

function confidenceFromLabel(field: FieldRecord): IdentificationConfidence {
  if (field.enrichment?.appliedToLabel) return confidenceFromEnrichment(field);
  if (field.labelConfidence === 'high') return 'high';
  if (field.labelConfidence === 'medium') return 'medium';
  if (field.labelConfidence === 'low') return 'low';
  if (field.labelSource.startsWith('enrichment-')) return confidenceFromEnrichment(field);
  return 'low';
}

function maxConfidence(a: IdentificationConfidence, b: IdentificationConfidence): IdentificationConfidence {
  return CONFIDENCE_RANK[b] > CONFIDENCE_RANK[a] ? b : a;
}

function isGenericDocusignLabel(label: string): boolean {
  const value = label.trim();
  if (!value) return true;
  if (/^(text|list|checkbox|radio|date|signhere|signerattachment|datesigned|fullname|email|formula|unknown)$/i.test(value)) {
    return true;
  }
  if (/^tab\s*label\s+[0-9a-f\s-]{12,}$/i.test(value)) return true;
  if (/^tab-form-element-/i.test(value)) return true;
  if (/^<.*>$/.test(value) || /^\u27e8.*\u27e9$/.test(value)) return true;
  return false;
}

function isGenericDocusignIdKey(key: string): boolean {
  if (/^tab[-_\s]*form[-_\s]*element\b/i.test(key)) return true;
  if (/^(text|numeric|currency|date|list|checkbox|radio|formula|attachment|signer|signhere|datesigned|fullname|email)[-_\s]+/i.test(key)) {
    return true;
  }
  if (/^radix[-_]/i.test(key)) return true;
  if (/^:r[0-9a-z]+:$/i.test(key)) return true;
  return false;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function sum<T>(items: T[], project: (item: T) => number): number {
  return items.reduce((total, item) => total + project(item), 0);
}

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

function statusLabel(status: ScorecardValidationStatus): string {
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
    case 'not_run':
      return 'Not run';
    case 'cannot_run_not_confidently_mapped':
      return 'Cannot run - field not confidently mapped';
  }
}

function esc(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}
