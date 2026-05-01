import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  InteractiveControlKind,
  InteractiveResultOutcome,
  InteractiveResultStatus,
  InteractiveTargetConfidence,
  InteractiveValidationResultsFile,
} from '../fixtures/interactive-validation';
import { FIELD_CONCEPT_REGISTRY, type FieldConceptKey } from '../fixtures/field-concepts';
import type { MappingCalibrationFile } from '../fixtures/validation-scorecard';
import { detectValueShape, type ValueShape } from '../lib/mapping-calibration';
import {
  PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX,
  PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION,
  PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION,
  PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX,
} from './generate-mapping-calibration';

interface DiagnosticsFile {
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
  rows: DiagnosticRow[];
}

interface DiagnosticRow {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  testName: string;
  targetConfidence: InteractiveTargetConfidence;
  targetConfidenceReason?: string;
  mappingDecisionReason: string | null;
  mappingShiftReason: string | null;
  mappingFlags?: string[];
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  interpretation: string;
}

interface ValidationScorecardFile {
  schemaVersion: 1;
  generatedAt: string;
  overall: {
    expectedValidationCount: number;
    executedValidationCount: number;
    passedValidationCount: number;
    failedValidationCount: number;
    warningValidationCount: number;
    manualReviewValidationCount: number;
    skippedValidationCount: number;
    validationCoveragePercent: number;
    validationQualityGrade: string;
  };
  interactiveValidation: {
    resultsLoaded: boolean;
    total: number;
    passed: number;
    failed: number;
    warning: number;
    manual_review: number;
    skipped: number;
  };
  conceptScores: Array<{
    key: FieldConceptKey;
    displayName: string;
    identifiedWithConfidence: boolean;
    identificationConfidence: string;
    expectedValidationCount: number;
    executedValidationCount: number;
    passedValidationCount: number;
    failedValidationCount: number;
    warningValidationCount: number;
    manualReviewValidationCount: number;
    skippedValidationCount: number;
    notRunValidationCount: number;
    cannotRunValidationCount: number;
    validationCoveragePercent: number;
    validationQualityGrade: string;
    summary: string;
  }>;
}

type ValidationResult = InteractiveValidationResultsFile['results'][number];

interface FindingItem {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  fieldLabel: string | null;
  validationId: string;
  testName: string;
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  severity: string;
  targetConfidence: InteractiveTargetConfidence | null;
  targetConfidenceReason: string | null;
  calibrationDecision: string | null;
  calibrationReason: string | null;
  calibrationMappingDecisionReason: string | null;
  calibrationSelectedCandidate: string | null;
  mappingDecisionReason: string | null;
  mappingShiftReason: string | null;
  mappingMissingProof: string[];
  humanConfirmation: HumanConfirmationRequest | null;
  controlKind: InteractiveControlKind | null;
  optionsDiscoverable: boolean | null;
  freeTextEntryImpossible: boolean | null;
  restoreSucceeded: boolean | null;
  currentValueReadable: boolean | null;
  controlledChoiceClassification: ControlledChoiceClassification | null;
  ambiguity: AmbiguityReview | null;
  interpretation: string;
  recommendation: string;
}

type AmbiguityType =
  | 'observer_needs_stronger_text_evidence'
  | 'expected_text_leniency'
  | 'policy_question'
  | 'matrix_expectation_mismatch'
  | 'mapping_evidence_issue'
  | 'product_validation_gap_candidate'
  | 'acceptable_behavior_documented';

type ControlledChoiceClassification =
  | 'expected_select_behavior'
  | 'options_not_discoverable'
  | 'restore_behavior_documented'
  | 'policy_question'
  | 'observer_needs_better_select_evidence'
  | 'product_validation_gap_candidate'
  | 'acceptable_behavior_documented';

interface AmbiguityReview {
  type: AmbiguityType;
  groupTitle: string;
  evidenceSourceSummary: string;
  valueBehaviorSummary: string;
  attemptedValueShape: ValueShape | 'missing';
  observedValueShape: ValueShape | 'missing';
  lengthEffect: 'not_observed' | 'unchanged_length' | 'shortened' | 'expanded' | 'cleared_or_prevented' | 'unknown';
  whyNotProductFinding: string;
  wouldBecomeProductFindingIf: string;
  humanGuidanceNeeded: boolean;
  humanGuidancePrompt: string | null;
}

interface HumanConfirmationRequest {
  needed: true;
  concept: FieldConceptKey;
  suspectedFieldLocation: string;
  currentBlocker: string;
  requestedEvidence: string;
  decisionImpact: string;
}

interface PerConceptSummary {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  targetConfidence: Record<string, number>;
  statuses: Record<string, number>;
  outcomes: Record<string, number>;
  executed: number;
  total: number;
  expectedValidationCount: number | null;
  executedValidationCount: number | null;
  notRunValidationCount: number | null;
  validationCoveragePercent: number | null;
  validationQualityGrade: string | null;
  calibrationDecision: string | null;
  calibrationReason: string | null;
  summary: string;
  notes: string[];
}

interface RecommendedBatch {
  batch: string;
  focus: string;
  concepts: string[];
  notes: string;
}

interface RemainingCalibrationBlocker {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  calibrationDecision: string;
  calibrationReason: string;
  mappingDecisionReason: string;
  missingProof: string[];
  appliedHumanProofStatus: string | null;
  appliedHumanProofSummary: string | null;
  currentBlocker: string | null;
  requestedEvidence: string | null;
  decisionImpact: string | null;
}

export interface ValidationFindingsReport {
  schemaVersion: 1;
  generatedAt: string;
  inputs: {
    resultsPath: string;
    diagnosticsPath: string;
    scorecardPath: string;
    calibrationPath: string;
  };
  executiveSummary: string[];
  runScope: {
    runStartedAt: string;
    runFinishedAt: string;
    targetConcepts: FieldConceptKey[];
    totalObservations: number;
    resultCounts: InteractiveValidationResultsFile['summary'];
    outcomeCounts: InteractiveValidationResultsFile['outcomes'];
    trustedTargetObservations: number;
    scorecardCoverage: string;
  };
  trustedExecutedObservations: FindingItem[];
  likelyProductValidationFindings: FindingItem[];
  ambiguousHumanReviewFindings: FindingItem[];
  ambiguityTypeBreakdown: Record<AmbiguityType, number>;
  ambiguousFindingsByType: Record<AmbiguityType, FindingItem[]>;
  controlledChoiceFindings: FindingItem[];
  controlledChoiceBreakdown: Record<ControlledChoiceClassification, number>;
  controlledChoiceFindingsByClassification: Record<ControlledChoiceClassification, FindingItem[]>;
  readyForGuardedRerun: FindingItem[];
  mappingBlockedFields: FindingItem[];
  remainingCalibrationBlockers: RemainingCalibrationBlocker[];
  perConceptResults: PerConceptSummary[];
  scorecardCoverage: {
    executedValidationCount: number;
    expectedValidationCount: number;
    validationCoveragePercent: number;
    validationQualityGrade: string;
  };
  recommendedNextToolingWork: string[];
  recommendedNextFieldExpansionBatches: RecommendedBatch[];
  safetyNotes: string[];
}

const TARGET_CONCEPT_ORDER: FieldConceptKey[] = [
  'website',
  'email',
  'stakeholder_email',
  'phone',
  'stakeholder_phone',
  'bank_name',
  'date_of_birth',
  'registration_date',
  'ownership_percentage',
  'postal_code',
  'business_name',
  'dba_name',
  'business_description',
];
const NON_PRODUCT_OUTCOMES = new Set<InteractiveResultOutcome>([
  'mapping_not_confident',
  'tool_mapping_suspect',
  'error_ownership_suspect',
  'observer_ambiguous',
]);
const EMAIL_CONCEPTS = new Set<FieldConceptKey>(['email', 'stakeholder_email']);
const PHONE_CONCEPTS = new Set<FieldConceptKey>(['phone', 'stakeholder_phone']);
const ADDRESS_LOCATION_CONCEPTS = new Set<FieldConceptKey>([
  'location_name',
  'registered_address_line_1',
  'registered_address_line_2',
  'registered_city',
  'registered_state',
  'registered_country',
  'postal_code',
  'address_line_1',
  'address_line_2',
  'city',
  'state',
  'country',
  'business_mailing_address_line_1',
  'business_mailing_city',
  'business_mailing_state',
  'business_mailing_postal_code',
  'bank_address_line_1',
  'bank_city',
  'bank_state',
  'bank_country',
  'bank_postal_code',
]);
const ADDRESS_TEXT_CONCEPTS = new Set<FieldConceptKey>([
  'location_name',
  'registered_address_line_1',
  'registered_address_line_2',
  'registered_city',
  'address_line_1',
  'address_line_2',
  'city',
  'business_mailing_address_line_1',
  'business_mailing_city',
  'bank_address_line_1',
  'bank_city',
]);
const OPTIONAL_ADDRESS_LINE_2_CONCEPTS = new Set<FieldConceptKey>([
  'registered_address_line_2',
  'address_line_2',
]);

const AMBIGUITY_SECTIONS: Array<{ type: AmbiguityType; title: string }> = [
  { type: 'observer_needs_stronger_text_evidence', title: 'Observer needs stronger text evidence' },
  { type: 'policy_question', title: 'Policy question' },
  { type: 'product_validation_gap_candidate', title: 'Possible product validation gap' },
  { type: 'expected_text_leniency', title: 'Expected text leniency' },
  { type: 'mapping_evidence_issue', title: 'Mapping evidence issue' },
  { type: 'matrix_expectation_mismatch', title: 'Test matrix expectation mismatch' },
  { type: 'acceptable_behavior_documented', title: 'Acceptable behavior documented' },
];

const CONTROLLED_CHOICE_CLASSIFICATIONS: Array<{ type: ControlledChoiceClassification; title: string }> = [
  { type: 'expected_select_behavior', title: 'Controlled-choice observations' },
  { type: 'options_not_discoverable', title: 'Options not discoverable' },
  { type: 'restore_behavior_documented', title: 'Restore behavior' },
  { type: 'policy_question', title: 'Policy questions' },
  { type: 'observer_needs_better_select_evidence', title: 'Controlled-choice observations' },
  { type: 'product_validation_gap_candidate', title: 'Possible product validation gaps' },
  { type: 'acceptable_behavior_documented', title: 'Acceptable behavior documented' },
];

export function buildValidationFindingsReport(input: {
  results: InteractiveValidationResultsFile;
  diagnostics: DiagnosticsFile;
  scorecard: ValidationScorecardFile;
  calibration: MappingCalibrationFile;
  inputPaths?: Partial<ValidationFindingsReport['inputs']>;
  generatedAt?: string;
}): ValidationFindingsReport {
  const diagnosticByConceptAndTest = new Map(
    input.diagnostics.rows.map((row) => [`${row.concept}\u0000${row.testName}`, row]),
  );
  const scoreByConcept = new Map(input.scorecard.conceptScores.map((score) => [score.key, score]));
  const calibrationByConcept = new Map(input.calibration.rows.map((row) => [row.concept, row]));

  const toFinding = (result: ValidationResult): FindingItem => {
    const diagnostic = diagnosticByConceptAndTest.get(`${result.concept}\u0000${result.testName}`);
    const targetConfidence = result.targetDiagnostics?.targetConfidence ?? diagnostic?.targetConfidence ?? null;
    const calibration = calibrationByConcept.get(result.concept);
    const calibrationDecision = calibration?.decision ?? null;
    const calibrationReason = calibration?.calibrationReason ?? null;
    const calibrationMappingDecisionReason = calibration?.mappingDecisionReason ?? null;
    const calibrationSelectedCandidate = calibration?.selectedCandidate ?? null;
    const calibrationTrusted = calibrationDecision === 'trust_current_mapping' || calibrationDecision === 'trust_likely_better_candidate';
    const staleSkippedMappingResult = result.status === 'skipped' && result.outcome === 'mapping_not_confident' && calibrationTrusted;
    const includeMappingProof = !staleSkippedMappingResult && (
      result.status === 'skipped' ||
      result.outcome === 'mapping_not_confident' ||
      result.outcome === 'tool_mapping_suspect' ||
      targetConfidence === 'mapping_not_confident' ||
      targetConfidence === 'tool_mapping_suspect'
    );
    const targetConfidenceReason = result.targetDiagnostics?.targetConfidenceReason ?? diagnostic?.targetConfidenceReason ?? result.skippedReason ?? null;
    const mappingFlags = result.targetDiagnostics?.mappingFlags ?? diagnostic?.mappingFlags ?? [];
    const humanConfirmation = includeMappingProof
      ? calibration?.humanConfirmation ?? buildLiveHumanConfirmationRequest(result, targetConfidenceReason, mappingFlags)
      : null;
    const finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'> = {
      concept: result.concept,
      conceptDisplayName: result.conceptDisplayName,
      fieldLabel: result.fieldLabel ?? null,
      validationId: result.validationId,
      testName: result.testName,
      status: result.status,
      outcome: result.outcome,
      severity: result.severity,
      targetConfidence,
      targetConfidenceReason,
      calibrationDecision,
      calibrationReason,
      calibrationMappingDecisionReason,
      calibrationSelectedCandidate,
      mappingDecisionReason: result.targetDiagnostics?.mappingDecisionReason ?? diagnostic?.mappingDecisionReason ?? null,
      mappingShiftReason: result.targetDiagnostics?.mappingShiftReason ?? diagnostic?.mappingShiftReason ?? null,
      mappingMissingProof: includeMappingProof ? calibration?.missingProof ?? [] : [],
      humanConfirmation,
      controlKind: result.observation?.controlKind ?? null,
      optionsDiscoverable: result.observation?.optionsDiscoverable ?? null,
      freeTextEntryImpossible: result.observation?.freeTextEntryImpossible ?? null,
      restoreSucceeded: result.targetDiagnostics?.restoreSucceeded ?? null,
      currentValueReadable: isControlledChoiceCurrentObservation(result)
        ? hasReadableControlledChoiceCurrentValue(result)
        : null,
      interpretation: result.interpretation,
      recommendation: staleSkippedMappingResult
        ? calibrationSelectedCandidate
          ? `Offline calibration now trusts ${calibrationSelectedCandidate}; rerun this guarded case to replace the stale skipped result.`
          : 'Offline calibration now trusts this mapping; rerun this guarded case to replace the stale skipped result.'
        : result.recommendation,
    };
    const resolvedFinding = resolveFindingForPolicy(result, finding);
    return {
      ...resolvedFinding,
      controlledChoiceClassification: classifyControlledChoiceFinding(result, resolvedFinding),
      ambiguity: buildAmbiguityReview(result, resolvedFinding),
    };
  };

  const findings = input.results.results.map(toFinding);
  const resultCounts = countFindingStatuses(findings);
  const outcomeCounts = countFindingOutcomes(findings);
  const trustedExecutedObservations = findings.filter((finding) =>
    finding.status !== 'skipped' && finding.targetConfidence === 'trusted',
  );
  const likelyProductValidationFindings = findings.filter(isLikelyProductFinding);
  const ambiguousHumanReviewFindings = findings.filter((finding) => finding.ambiguity !== null);
  const ambiguousFindingsByType = groupAmbiguousFindingsByType(ambiguousHumanReviewFindings);
  const ambiguityTypeBreakdown = Object.fromEntries(
    AMBIGUITY_SECTIONS.map((section) => [section.type, ambiguousFindingsByType[section.type].length]),
  ) as Record<AmbiguityType, number>;
  const controlledChoiceFindings = findings.filter((finding) => finding.controlledChoiceClassification !== null);
  const controlledChoiceFindingsByClassification = groupControlledChoiceFindingsByClassification(controlledChoiceFindings);
  const controlledChoiceBreakdown = Object.fromEntries(
    CONTROLLED_CHOICE_CLASSIFICATIONS.map((section) => [section.type, controlledChoiceFindingsByClassification[section.type].length]),
  ) as Record<ControlledChoiceClassification, number>;
  const readyForGuardedRerun = findings.filter((finding) => isReadyForGuardedRerun(finding));
  const mappingBlockedFields = findings.filter((finding) =>
    (finding.outcome === 'mapping_not_confident' || finding.targetConfidence === 'mapping_not_confident') && !isReadyForGuardedRerun(finding),
  );
  const remainingCalibrationBlockers = input.calibration.rows
    .filter((row) => isUnresolvedCalibrationDecision(row.decision))
    .filter((row) => isAddressLocationConcept(row.concept))
    .filter((row) => !input.results.targetConcepts.includes(row.concept))
    .map((row) => ({
      concept: row.concept,
      conceptDisplayName: row.conceptDisplayName,
      calibrationDecision: row.decision,
      calibrationReason: row.calibrationReason,
      mappingDecisionReason: row.mappingDecisionReason,
      missingProof: row.missingProof ?? [],
      appliedHumanProofStatus: row.appliedHumanProof?.status ?? null,
      appliedHumanProofSummary: row.appliedHumanProof?.summary ?? null,
      currentBlocker: row.humanConfirmation?.currentBlocker ?? row.missingProof?.[0] ?? null,
      requestedEvidence: row.humanConfirmation?.requestedEvidence ?? null,
      decisionImpact: row.humanConfirmation?.decisionImpact ?? null,
    }));

  const perConceptResults = buildPerConceptSummaries({
    findings,
    diagnostics: input.diagnostics,
    scoreByConcept,
    calibrationByConcept,
  });

  const scorecardCoverage = {
    executedValidationCount: input.scorecard.overall.executedValidationCount,
    expectedValidationCount: input.scorecard.overall.expectedValidationCount,
    validationCoveragePercent: input.scorecard.overall.validationCoveragePercent,
    validationQualityGrade: input.scorecard.overall.validationQualityGrade,
  };

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      resultsPath: input.inputPaths?.resultsPath ?? 'artifacts/latest-interactive-validation-results.json',
      diagnosticsPath: input.inputPaths?.diagnosticsPath ?? 'artifacts/latest-interactive-target-diagnostics.json',
      scorecardPath: input.inputPaths?.scorecardPath ?? 'artifacts/latest-validation-scorecard.json',
      calibrationPath: input.inputPaths?.calibrationPath ?? 'artifacts/latest-mapping-calibration.json',
    },
    executiveSummary: buildExecutiveSummary({
      totalObservations: resultCounts.total,
      targetConcepts: input.results.targetConcepts,
      resultCounts,
      likelyProductValidationFindings,
      ambiguousHumanReviewFindings,
      readyForGuardedRerun,
      mappingBlockedFields,
      remainingCalibrationBlockers,
      scorecardCoverage,
    }),
    runScope: {
      runStartedAt: input.results.runStartedAt,
      runFinishedAt: input.results.runFinishedAt,
      targetConcepts: input.results.targetConcepts,
      totalObservations: resultCounts.total,
      resultCounts,
      outcomeCounts,
      trustedTargetObservations: trustedExecutedObservations.length,
      scorecardCoverage: `${scorecardCoverage.executedValidationCount}/${scorecardCoverage.expectedValidationCount} (${scorecardCoverage.validationCoveragePercent}%)`,
    },
    trustedExecutedObservations,
    likelyProductValidationFindings,
    ambiguousHumanReviewFindings,
    ambiguityTypeBreakdown,
    ambiguousFindingsByType,
    controlledChoiceFindings,
    controlledChoiceBreakdown,
    controlledChoiceFindingsByClassification,
    readyForGuardedRerun,
    mappingBlockedFields,
    remainingCalibrationBlockers,
    perConceptResults,
    scorecardCoverage,
    recommendedNextToolingWork: buildRecommendedToolingWork(mappingBlockedFields, readyForGuardedRerun, remainingCalibrationBlockers),
    recommendedNextFieldExpansionBatches: buildRecommendedBatches(),
    safetyNotes: [
      'This report is generated from existing offline artifacts only; it does not run live, interactive, or destructive validation.',
      'Product-like findings include only trusted executed observations and exclude mapping-not-confident, tool-mapping, ownership, and observer-ambiguous outcomes.',
      'Mapping-blocked checks are not product validation failures.',
      'Sensitive values, raw URLs, credentials, and private sample inputs are not required for this export.',
    ],
  };
}

export function renderValidationFindingsMarkdown(report: ValidationFindingsReport): string {
  const lines: string[] = [];
  lines.push('# Bead Onboarding - Validation Findings');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  for (const item of report.executiveSummary) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Run Scope');
  lines.push('');
  lines.push(`- Run started: ${esc(report.runScope.runStartedAt)}`);
  lines.push(`- Run finished: ${esc(report.runScope.runFinishedAt)}`);
  lines.push(`- Target concepts: ${report.runScope.targetConcepts.join(', ')}`);
  lines.push(`- Total observations: ${report.runScope.totalObservations}`);
  lines.push(`- Result counts: ${formatCounts(report.runScope.resultCounts)}`);
  lines.push(`- Outcome counts: ${formatCounts(report.runScope.outcomeCounts)}`);
  lines.push(`- Trusted executed observations: ${report.runScope.trustedTargetObservations}`);
  lines.push(`- Scorecard coverage: ${report.runScope.scorecardCoverage}`);
  lines.push('');
  renderFindingTable(lines, 'Trusted Executed Observations', report.trustedExecutedObservations);
  renderControlledChoiceFindings(lines, report);
  renderLikelyProductValidationFindings(lines, report.likelyProductValidationFindings);
  renderAddressLocationFindings(lines, report);
  renderAmbiguousFindingsByType(lines, report);
  renderFindingTable(lines, 'Mapping-Blocked Fields', report.mappingBlockedFields);
  renderRemainingCalibrationBlockers(lines, report.remainingCalibrationBlockers);
  lines.push('## Per-Concept Results');
  lines.push('');
  for (const concept of report.perConceptResults) {
    lines.push(`### ${concept.conceptDisplayName}`);
    lines.push('');
    lines.push(`- Target confidence: ${formatCounts(concept.targetConfidence) || 'n/a'}`);
    lines.push(`- Status counts: ${formatCounts(concept.statuses) || 'n/a'}`);
    lines.push(`- Outcome counts: ${formatCounts(concept.outcomes) || 'n/a'}`);
    lines.push(`- Coverage: ${concept.executedValidationCount ?? 0}/${concept.expectedValidationCount ?? 0} (${concept.validationCoveragePercent ?? 0}%), grade ${concept.validationQualityGrade ?? 'n/a'}`);
    if (concept.calibrationDecision) {
      lines.push(`- Calibration: ${concept.calibrationDecision} (${concept.calibrationReason ?? 'n/a'})`);
    }
    lines.push(`- Summary: ${concept.summary}`);
    for (const note of concept.notes) lines.push(`- ${note}`);
    lines.push('');
  }
  lines.push('## Scorecard Coverage');
  lines.push('');
  lines.push(`- Executed validations: ${report.scorecardCoverage.executedValidationCount}/${report.scorecardCoverage.expectedValidationCount}`);
  lines.push(`- Coverage: ${report.scorecardCoverage.validationCoveragePercent}%`);
  lines.push(`- Grade: ${report.scorecardCoverage.validationQualityGrade}`);
  lines.push('');
  lines.push('## Recommended Next Tooling Work');
  lines.push('');
  for (const item of report.recommendedNextToolingWork) lines.push(`- ${item}`);
  lines.push('');
  lines.push('## Recommended Next Field Expansion Batches');
  lines.push('');
  for (const batch of report.recommendedNextFieldExpansionBatches) {
    lines.push(`### ${batch.batch}`);
    lines.push('');
    lines.push(`- Focus: ${batch.focus}`);
    lines.push(`- Concepts: ${batch.concepts.join(', ')}`);
    lines.push(`- Notes: ${batch.notes}`);
    lines.push('');
  }
  lines.push('## Safety Notes');
  lines.push('');
  for (const item of report.safetyNotes) lines.push(`- ${item}`);
  lines.push('');
  return lines.join('\n');
}

export function writeValidationFindingsArtifacts(input: {
  artifactsDir?: string;
  resultsPath?: string;
  diagnosticsPath?: string;
  scorecardPath?: string;
  calibrationPath?: string;
  jsonPath?: string;
  mdPath?: string;
} = {}): { jsonPath: string; mdPath: string; report: ValidationFindingsReport } {
  const artifactsDir = path.resolve(input.artifactsDir ?? path.join(__dirname, '..', 'artifacts'));
  const resultsPath = path.resolve(input.resultsPath ?? path.join(artifactsDir, 'latest-interactive-validation-results.json'));
  const diagnosticsPath = path.resolve(input.diagnosticsPath ?? path.join(artifactsDir, 'latest-interactive-target-diagnostics.json'));
  const scorecardPath = path.resolve(input.scorecardPath ?? path.join(artifactsDir, 'latest-validation-scorecard.json'));
  const calibrationPath = path.resolve(input.calibrationPath ?? path.join(artifactsDir, 'latest-mapping-calibration.json'));
  const jsonPath = path.resolve(input.jsonPath ?? path.join(artifactsDir, 'latest-validation-findings.json'));
  const mdPath = path.resolve(input.mdPath ?? path.join(artifactsDir, 'latest-validation-findings.md'));

  const report = buildValidationFindingsReport({
    results: readJson<InteractiveValidationResultsFile>(resultsPath),
    diagnostics: readJson<DiagnosticsFile>(diagnosticsPath),
    scorecard: readJson<ValidationScorecardFile>(scorecardPath),
    calibration: readJson<MappingCalibrationFile>(calibrationPath),
    inputPaths: { resultsPath, diagnosticsPath, scorecardPath, calibrationPath },
  });

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderValidationFindingsMarkdown(report), 'utf8');

  return { jsonPath, mdPath, report };
}

function isLikelyProductFinding(finding: FindingItem): boolean {
  if (finding.targetConfidence !== 'trusted' || finding.status === 'skipped') return false;
  if (finding.outcome === 'product_failure') return true;
  if (finding.outcome === 'passed') return false;
  return finding.status === 'warning' && !NON_PRODUCT_OUTCOMES.has(finding.outcome);
}

function groupAmbiguousFindingsByType(findings: FindingItem[]): Record<AmbiguityType, FindingItem[]> {
  const grouped = Object.fromEntries(
    AMBIGUITY_SECTIONS.map((section) => [section.type, []]),
  ) as Record<AmbiguityType, FindingItem[]>;
  for (const finding of findings) {
    const type = finding.ambiguity?.type ?? 'observer_needs_stronger_error_ownership';
    grouped[type].push(finding);
  }
  return grouped;
}

function groupControlledChoiceFindingsByClassification(
  findings: FindingItem[],
): Record<ControlledChoiceClassification, FindingItem[]> {
  const grouped = Object.fromEntries(
    CONTROLLED_CHOICE_CLASSIFICATIONS.map((section) => [section.type, []]),
  ) as Record<ControlledChoiceClassification, FindingItem[]>;
  for (const finding of findings) {
    if (!finding.controlledChoiceClassification) continue;
    grouped[finding.controlledChoiceClassification].push(finding);
  }
  return grouped;
}

function resolveFindingForPolicy(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'> {
  if (finding.targetConfidence !== 'trusted') return finding;

  if (hasReadableControlledChoiceCurrentValue(result)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: `Current/default ${finding.conceptDisplayName} selection was readable through the controlled-choice state without disclosing the raw option value.`,
      recommendation: 'Treat this as expected select behavior and keep raw selected values out of the exported findings.',
    };
  }

  if (finding.concept === 'postal_code' && /letters-behavior/i.test(result.validationId) && hasObservedValidationFeedback(result.observation)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: 'Expected alphabetic ZIP input was rejected or clearly flagged for this US postal-code field.',
      recommendation: 'Observed behavior matched the current Batch 1 postal-code expectation.',
    };
  }

  if (finding.concept === 'dba_name' && /empty-required/i.test(result.validationId) && isBlankValue(result.inputValue) && isBlankValue(result.observation?.observedValue ?? null)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: 'Blank DBA Name remained allowed, which matches the optional DBA policy when no separate trade name exists.',
      recommendation: 'Observed behavior matched the optional-field expectation for DBA Name.',
    };
  }

  if (isPhoneTooLongBehaviorResolved(result, finding)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: `Observed acceptable ${finding.conceptDisplayName} length enforcement through truncation, input prevention, or field-local validation.`,
      recommendation: 'Treat safe truncation, input prevention, or field-local rejection as acceptable enforcement unless policy explicitly requires a different visible error.',
    };
  }

  if (isNameLengthBehaviorResolved(result, finding)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: `Observed acceptable ${finding.conceptDisplayName} length enforcement through truncation or normalization.`,
      recommendation: 'Document the enforced limit or maxlength, but do not treat this behavior as a product defect.',
    };
  }

  if (isAddressLengthBehaviorResolved(result, finding)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: `Observed acceptable ${finding.conceptDisplayName} length enforcement through truncation or normalization.`,
      recommendation: 'Document the enforced limit or maxlength, but do not treat this behavior as a product defect.',
    };
  }

  if (isOptionalAddressLine2BlankAllowed(result, finding)) {
    return {
      ...finding,
      status: 'passed',
      outcome: 'passed',
      interpretation: `Blank ${finding.conceptDisplayName} remained allowed, which matches the optional address-line-2 policy for unit, suite, and apartment details.`,
      recommendation: 'Treat blank address line 2 as acceptable optional-field behavior unless product policy later makes it required.',
    };
  }

  if (isNameSpecialCharacterBehaviorResolved(result, finding)) {
    return {
      ...finding,
      status: 'warning',
      outcome: 'passed',
      interpretation: `Observed documented leniency for symbol-heavy ${finding.conceptDisplayName} input under the current name policy.`,
      recommendation: 'Keep this as accepted leniency unless policy later requires blocking clearly harmful characters.',
    };
  }

  return finding;
}

function isControlledChoiceConcept(concept: FieldConceptKey): boolean {
  return FIELD_CONCEPT_REGISTRY[concept]?.bestPracticeValidations.some((validation) =>
    validation.id === 'current-option-documented'
  ) ?? false;
}

function isControlledChoiceCurrentObservation(result: ValidationResult): boolean {
  return isControlledChoiceConcept(result.concept) && /current-option-documented/i.test(result.validationId);
}

function isSelectLikeControl(result: ValidationResult): boolean {
  return result.observation?.controlKind === 'native-select' ||
    result.targetDiagnostics?.actualElement?.tagName?.toLowerCase() === 'select' ||
    result.targetDiagnostics?.docusignTabType === 'List' ||
    Boolean(result.targetDiagnostics?.actualFieldSignature?.includes('tag=select'));
}

function hasReadableControlledChoiceCurrentValue(result: ValidationResult): boolean {
  return isControlledChoiceCurrentObservation(result) &&
    isSelectLikeControl(result) &&
    result.targetDiagnostics?.actualValueBeforeTest !== undefined &&
    result.targetDiagnostics?.actualValueBeforeTest !== null;
}

function controlledChoiceOptionsNotDiscoverable(result: ValidationResult): boolean {
  const haystack = `${result.skippedReason ?? ''} ${result.evidence ?? ''} ${result.recommendation ?? ''}`;
  return isControlledChoiceConcept(result.concept) && (
    result.observation?.optionsDiscoverable === false ||
    /options not discoverable/i.test(haystack)
  );
}

function controlledChoiceCannotSafelyClear(result: ValidationResult): boolean {
  const haystack = `${result.skippedReason ?? ''} ${result.evidence ?? ''} ${result.recommendation ?? ''}`;
  return isControlledChoiceConcept(result.concept) &&
    /empty-required/i.test(result.validationId) &&
    /cannot safely clear/i.test(haystack);
}

function controlledChoiceEmptyAcceptedWithoutValidation(result: ValidationResult): boolean {
  return isControlledChoiceConcept(result.concept) &&
    /empty-required/i.test(result.validationId) &&
    Boolean(result.observation) &&
    !hasObservedValidationFeedback(result.observation) &&
    !result.observation?.inputPrevented &&
    (result.observation?.observedValue ?? null) === '';
}

function classifyControlledChoiceFinding(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): ControlledChoiceClassification | null {
  if (!isControlledChoiceConcept(finding.concept)) return null;
  if (controlledChoiceOptionsNotDiscoverable(result)) return 'options_not_discoverable';
  if (result.targetDiagnostics?.restoreSucceeded === false) return 'restore_behavior_documented';
  if (isControlledChoiceCurrentObservation(result)) {
    return hasReadableControlledChoiceCurrentValue(result)
      ? 'expected_select_behavior'
      : 'observer_needs_better_select_evidence';
  }
  if (/valid-option-accepted/i.test(result.validationId)) {
    return 'restore_behavior_documented';
  }
  if (/invalid-freeform/i.test(result.validationId)) {
    return result.observation?.freeTextEntryImpossible
      ? 'acceptable_behavior_documented'
      : 'observer_needs_better_select_evidence';
  }
  if (/empty-required/i.test(result.validationId)) {
    if (controlledChoiceCannotSafelyClear(result)) return 'acceptable_behavior_documented';
    if (controlledChoiceEmptyAcceptedWithoutValidation(result)) return 'product_validation_gap_candidate';
    if (finding.status === 'passed') return 'acceptable_behavior_documented';
    return 'policy_question';
  }
  return finding.status === 'manual_review'
    ? 'observer_needs_better_select_evidence'
    : 'expected_select_behavior';
}

function buildAmbiguityReview(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): AmbiguityReview | null {
  if (finding.outcome !== 'observer_ambiguous' && finding.status !== 'manual_review') return null;

  const attemptedValueShape = valueShape(result.inputValue);
  const observedValueShape = valueShape(result.observation?.observedValue ?? null);
  const lengthEffect = inferLengthEffect(result);
  const valueBehaviorSummary = summarizeValueBehavior(result, attemptedValueShape, observedValueShape, lengthEffect);
  const evidenceSourceSummary = summarizeEvidenceSources(result);
  const type = classifyAmbiguityType(result, finding, lengthEffect);
  const humanGuidancePrompt = humanGuidancePromptFor(type, result, finding);

  return {
    type,
    groupTitle: sectionTitle(type),
    evidenceSourceSummary,
    valueBehaviorSummary,
    attemptedValueShape,
    observedValueShape,
    lengthEffect,
    whyNotProductFinding: whyNotProductFinding(type, result, finding),
    wouldBecomeProductFindingIf: wouldBecomeProductFindingIf(type, result, finding),
    humanGuidanceNeeded: humanGuidancePrompt !== null,
    humanGuidancePrompt,
  };
}

function classifyAmbiguityType(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
  lengthEffect: AmbiguityReview['lengthEffect'],
): AmbiguityType {
  if (
    finding.targetConfidence !== 'trusted' ||
    finding.outcome === 'mapping_not_confident' ||
    finding.outcome === 'tool_mapping_suspect' ||
    finding.outcome === 'error_ownership_suspect'
  ) {
    return 'mapping_evidence_issue';
  }
  if (isPhoneTooLongAcceptedWithoutSignal(result, finding)) {
    return 'product_validation_gap_candidate';
  }
  if (isPhoneTooLongCase(result, finding) && hasObservedValidationFeedback(result.observation)) {
    return 'acceptable_behavior_documented';
  }
  if (isPhoneMissingPlusCase(result, finding) && !hasExplicitE164Requirement(result)) {
    return 'policy_question';
  }
  if (isAddressTextLeniencyCase(result, finding)) {
    return 'expected_text_leniency';
  }
  if (hasObservedValidationFeedback(result.observation)) {
    return 'matrix_expectation_mismatch';
  }
  if (result.observation?.normalizedOrReformatted || lengthEffect === 'shortened' || lengthEffect === 'expanded') {
    return 'acceptable_behavior_documented';
  }
  if (/empty-required/i.test(result.validationId)) {
    return 'product_validation_gap_candidate';
  }
  if (/very-short/i.test(result.validationId)) {
    return 'policy_question';
  }
  if (isKnownPolicyQuestion(result, finding)) {
    return 'policy_question';
  }
  if (/special-characters/i.test(result.validationId)) {
    return 'expected_text_leniency';
  }
  return 'observer_needs_stronger_text_evidence';
}

function isKnownPolicyQuestion(result: ValidationResult, finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>): boolean {
  const haystack = `${result.validationId} ${result.testName}`;
  return (finding.concept === 'website' && /protocol|missing/i.test(haystack)) ||
    (PHONE_CONCEPTS.has(finding.concept) && /plus|domestic|format/i.test(haystack)) ||
    (finding.concept === 'date_of_birth' && /under|age|alternate|format|MM\/DD|YYYY\/MM/i.test(haystack)) ||
    (finding.concept === 'business_description' && /short|special|garbage/i.test(haystack));
}

function sectionTitle(type: AmbiguityType): string {
  return AMBIGUITY_SECTIONS.find((section) => section.type === type)?.title ?? type;
}

function hasObservedValidationFeedback(observation: ValidationResult['observation']): boolean {
  if (!observation) return false;
  return observation.ariaInvalid === 'true' ||
    Boolean(observation.validationMessage) ||
    Boolean(observation.nearbyErrorText) ||
    observation.docusignValidationText.length > 0 ||
    observation.invalidIndicators.length > 0 ||
    observation.evidenceItems.some((item) => item.classification === 'field-local');
}

function valueShape(value: string | null | undefined): ValueShape | 'missing' {
  return value === null || value === undefined ? 'missing' : detectValueShape(value);
}

function isBlankValue(value: string | null | undefined): boolean {
  return (value ?? '').trim().length === 0;
}

function isPhoneMissingPlusCase(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  return PHONE_CONCEPTS.has(finding.concept) && /plus|domestic|format/i.test(`${result.validationId} ${result.testName}`);
}

function isPhoneTooLongCase(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  return PHONE_CONCEPTS.has(finding.concept) && /too-long/i.test(result.validationId);
}

function hasExplicitE164Requirement(result: ValidationResult): boolean {
  const texts = [
    result.observation?.validationMessage,
    result.observation?.nearbyErrorText,
    ...(result.observation?.docusignValidationText ?? []),
    ...((result.observation?.evidenceItems ?? []).map((item) => item.text)),
  ].filter((text): text is string => Boolean(text));

  return texts.some((text) => /\bE\.?164\b/i.test(text));
}

function isPhoneTooLongBehaviorResolved(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  if (!isPhoneTooLongCase(result, finding)) return false;
  return result.observation?.normalizedOrReformatted === true ||
    result.observation?.inputPrevented === true ||
    hasObservedValidationFeedback(result.observation);
}

function isPhoneTooLongAcceptedWithoutSignal(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  if (!isPhoneTooLongCase(result, finding) || !result.observation) return false;
  if (result.observation.normalizedOrReformatted || result.observation.inputPrevented || hasObservedValidationFeedback(result.observation)) {
    return false;
  }
  return (result.observation.observedValue ?? null) === result.inputValue;
}

function isNameLengthBehaviorResolved(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  if (!isNameConcept(finding.concept) || !/excessive-length/i.test(result.validationId)) return false;
  const lengthEffect = inferLengthEffect(result);
  return result.observation?.normalizedOrReformatted === true || lengthEffect === 'shortened';
}

function isNameSpecialCharacterBehaviorResolved(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  return isNameConcept(finding.concept) && /special-characters/i.test(result.validationId);
}

function isAddressLocationConcept(concept: FieldConceptKey): boolean {
  return ADDRESS_LOCATION_CONCEPTS.has(concept);
}

function isAddressTextConcept(concept: FieldConceptKey): boolean {
  return ADDRESS_TEXT_CONCEPTS.has(concept);
}

function isAddressLengthBehaviorResolved(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  if (!isAddressTextConcept(finding.concept) || !/excessive-length/i.test(result.validationId)) return false;
  const lengthEffect = inferLengthEffect(result);
  return result.observation?.normalizedOrReformatted === true || lengthEffect === 'shortened';
}

function isOptionalAddressLine2BlankAllowed(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  return OPTIONAL_ADDRESS_LINE_2_CONCEPTS.has(finding.concept) &&
    /empty-required/i.test(result.validationId) &&
    isBlankValue(result.inputValue) &&
    isBlankValue(result.observation?.observedValue ?? null);
}

function isAddressTextLeniencyCase(
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): boolean {
  return isAddressTextConcept(finding.concept) &&
    /special-characters|punctuation-format-handling/i.test(result.validationId);
}

function isNameConcept(concept: FieldConceptKey): concept is 'business_name' | 'dba_name' {
  return concept === 'business_name' || concept === 'dba_name';
}

function inferLengthEffect(result: ValidationResult): AmbiguityReview['lengthEffect'] {
  const attempted = result.inputValue;
  const observed = result.observation?.observedValue ?? null;
  if (!result.observation) return 'not_observed';
  if (result.observation.inputPrevented || (attempted.length > 0 && observed !== null && observed.length === 0)) {
    return 'cleared_or_prevented';
  }
  if (observed === null) return 'unknown';
  if (observed.length === attempted.length) return 'unchanged_length';
  return observed.length < attempted.length ? 'shortened' : 'expanded';
}

function summarizeValueBehavior(
  result: ValidationResult,
  attemptedValueShape: ValueShape | 'missing',
  observedValueShape: ValueShape | 'missing',
  lengthEffect: AmbiguityReview['lengthEffect'],
): string {
  const signals: string[] = [
    `attempted shape=${attemptedValueShape}`,
    `observed shape=${observedValueShape}`,
    `length=${lengthEffect}`,
  ];
  if (result.observation?.normalizedOrReformatted) signals.push('normalized/reformatted=yes');
  if (result.observation?.inputPrevented) signals.push('input prevented=yes');
  if (result.targetDiagnostics?.restoreSucceeded === true) signals.push('restore=ok');
  if (result.targetDiagnostics?.restoreSucceeded === false) signals.push('restore=failed');
  return signals.join('; ');
}

function summarizeEvidenceSources(result: ValidationResult): string {
  const observation = result.observation;
  if (!observation) return 'no observation captured';
  const sources = Array.from(new Set(
    observation.evidenceItems
      .filter((item) => item.classification !== 'ignored')
      .map((item) => item.source),
  ));
  const parts = [
    `aria-invalid=${observation.ariaInvalid ?? 'null'}`,
    `native-message=${observation.validationMessage ? 'present' : 'absent'}`,
    `field-local-text=${observation.nearbyErrorText || observation.docusignValidationText.length > 0 ? 'present' : 'absent'}`,
    `invalid-indicators=${observation.invalidIndicators.length}`,
  ];
  if (sources.length > 0) parts.push(`sources=${sources.join(',')}`);
  return parts.join('; ');
}

function whyNotProductFinding(
  type: AmbiguityType,
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): string {
  switch (type) {
    case 'observer_needs_stronger_text_evidence':
      return 'No field-local error, native validity change, or confirmed policy rule is strong enough to claim a product defect.';
    case 'expected_text_leniency':
      return `${finding.conceptDisplayName} accepted a value that may be legitimate leniency unless product policy says this case must be rejected.`;
    case 'policy_question':
      return 'The observed behavior depends on product or underwriting policy that is not encoded in the current matrix.';
    case 'matrix_expectation_mismatch':
      return 'The observer captured field-local validation evidence, but this matrix row is configured as observe/manual-review instead of a reject expectation.';
    case 'mapping_evidence_issue':
      return 'The target mapping is not trusted enough to connect behavior to the intended field.';
    case 'product_validation_gap_candidate':
      return 'A trusted target accepted or failed to flag the value, but policy still needs to confirm this case is mandatory at form entry.';
    case 'acceptable_behavior_documented':
      return result.observation?.normalizedOrReformatted
        ? 'The control changed the submitted value, which can be acceptable enforcement if truncation or normalization is intended.'
        : 'The behavior is documented as acceptable unless product policy requires a stricter visible error.';
  }
}

function wouldBecomeProductFindingIf(
  type: AmbiguityType,
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): string {
  switch (type) {
    case 'observer_needs_stronger_text_evidence':
      return 'A fresh trusted observation still shows no local error, no input prevention, and no normalization after stronger ownership capture.';
    case 'expected_text_leniency':
      return `Policy says ${finding.conceptDisplayName} must reject this case and a trusted rerun still accepts it without a local validation signal.`;
    case 'policy_question':
      return `A human policy decision says this ${finding.conceptDisplayName} case must be rejected at form entry, and the trusted observation still shows no rejection signal.`;
    case 'matrix_expectation_mismatch':
      return 'The matrix is updated to expect rejection and a rerun lacks field-local validation or input blocking.';
    case 'mapping_evidence_issue':
      return 'The target is later trusted and the same behavior persists without a field-local validation signal.';
    case 'product_validation_gap_candidate':
      return `Policy confirms ${finding.conceptDisplayName} is required/invalid for this case and a trusted rerun still allows it without field-local error or input prevention.`;
    case 'acceptable_behavior_documented':
      return result.observation?.normalizedOrReformatted
        ? 'Policy requires a visible blocking error instead of silent normalization/truncation.'
        : 'Policy says the documented behavior is not acceptable and the trusted observation still lacks validation feedback.';
  }
}

function humanGuidancePromptFor(
  type: AmbiguityType,
  result: ValidationResult,
  finding: Omit<FindingItem, 'ambiguity' | 'controlledChoiceClassification'>,
): string | null {
  if (type === 'mapping_evidence_issue') return finding.humanConfirmation?.requestedEvidence ?? null;
  if (isPhoneMissingPlusCase(result, finding)) {
    return hasExplicitE164Requirement(result)
      ? `Field-local validation currently requires E.164. Should ${finding.conceptDisplayName} instead accept or normalize domestic phone format without a leading plus?`
      : `Should ${finding.conceptDisplayName} allow domestic phone format without a leading plus, or require explicit E.164 input?`;
  }
  if (type === 'matrix_expectation_mismatch') {
    return `Should ${finding.conceptDisplayName}: ${finding.testName} become a reject expectation now that field-local validation was observed?`;
  }
  if (type === 'acceptable_behavior_documented') {
    return `Should ${finding.conceptDisplayName} accept normalization/truncation for ${finding.testName}, or require a visible blocking error?`;
  }
  if (finding.concept === 'website' && /protocol|missing/i.test(result.validationId + ' ' + result.testName)) {
    return 'Should missing protocol in Website be allowed or normalized?';
  }
  if (PHONE_CONCEPTS.has(finding.concept) && /plus|domestic|format/i.test(result.validationId + ' ' + result.testName)) {
    return `Should ${finding.conceptDisplayName} require a leading plus or allow domestic format?`;
  }
  if (finding.concept === 'date_of_birth' && /under|age/i.test(result.validationId + ' ' + result.testName)) {
    return 'Should Date of Birth reject under-age applicants at form entry or defer to downstream review?';
  }
  if (finding.concept === 'date_of_birth' && /alternate|format|MM\/DD|YYYY\/MM/i.test(result.validationId + ' ' + result.testName)) {
    return 'Should alternate date formats be accepted or rejected?';
  }
  if (finding.concept === 'business_description' && /short|special|garbage/i.test(result.validationId + ' ' + result.testName)) {
    return 'Should Business Description allow very short / special-character text?';
  }
  if ((finding.concept === 'business_name' || finding.concept === 'dba_name') && /very-short/i.test(result.validationId)) {
    return `Should ${finding.conceptDisplayName} require more than one character?`;
  }
  if ((finding.concept === 'business_name' || finding.concept === 'dba_name') && /special-characters/i.test(result.validationId)) {
    return `Should ${finding.conceptDisplayName} allow punctuation and symbol-heavy names, normalize them, or reject them?`;
  }
  if (isAddressTextConcept(finding.concept) && /special-characters|punctuation-format-handling/i.test(result.validationId)) {
    return `Should ${finding.conceptDisplayName} allow punctuation or symbol-heavy text, normalize it, or reject it?`;
  }
  if (finding.concept === 'dba_name' && /empty-required/i.test(result.validationId)) {
    return 'Should DBA Name be required, or can it be blank when the merchant has no DBA?';
  }
  if (type === 'observer_needs_stronger_text_evidence') {
    return `Is there any visible field-local validation text or styling for ${finding.conceptDisplayName} that the observer missed?`;
  }
  return type === 'policy_question' || type === 'product_validation_gap_candidate'
    ? `What is the expected product policy for ${finding.conceptDisplayName}: ${finding.testName}?`
    : null;
}

function buildPerConceptSummaries(input: {
  findings: FindingItem[];
  diagnostics: DiagnosticsFile;
  scoreByConcept: Map<FieldConceptKey, ValidationScorecardFile['conceptScores'][number]>;
  calibrationByConcept: Map<FieldConceptKey, MappingCalibrationFile['rows'][number]>;
}): PerConceptSummary[] {
  const concepts = Array.from(new Set([
    ...TARGET_CONCEPT_ORDER,
    ...input.findings.map((finding) => finding.concept),
  ]));

  return concepts
    .filter((concept) => input.findings.some((finding) => finding.concept === concept))
    .map((concept) => {
      const findings = input.findings.filter((finding) => finding.concept === concept);
      const diagnosticRows = input.diagnostics.rows.filter((row) => row.concept === concept);
      const score = input.scoreByConcept.get(concept) ?? null;
      const calibration = input.calibrationByConcept.get(concept) ?? null;
      const conceptDisplayName = findings[0]?.conceptDisplayName ?? score?.displayName ?? concept;
      const executed = findings.filter((finding) => finding.status !== 'skipped').length;
      return {
        concept,
        conceptDisplayName,
        targetConfidence: countBy(diagnosticRows, (row) => row.targetConfidence),
        statuses: countBy(findings, (finding) => finding.status),
        outcomes: countBy(findings, (finding) => finding.outcome),
        executed,
        total: findings.length,
        expectedValidationCount: score?.expectedValidationCount ?? null,
        executedValidationCount: score?.executedValidationCount ?? null,
        notRunValidationCount: score?.notRunValidationCount ?? null,
        validationCoveragePercent: score?.validationCoveragePercent ?? null,
        validationQualityGrade: score?.validationQualityGrade ?? null,
        calibrationDecision: calibration?.decision ?? null,
        calibrationReason: calibration?.calibrationReason ?? null,
        summary: summarizeConceptForReport(conceptDisplayName, findings, score),
        notes: conceptNotes(concept, findings, score),
      };
    });
}

function buildExecutiveSummary(input: {
  totalObservations: number;
  targetConcepts: FieldConceptKey[];
  resultCounts: InteractiveValidationResultsFile['summary'];
  likelyProductValidationFindings: FindingItem[];
  ambiguousHumanReviewFindings: FindingItem[];
  readyForGuardedRerun: FindingItem[];
  mappingBlockedFields: FindingItem[];
  remainingCalibrationBlockers: RemainingCalibrationBlocker[];
  scorecardCoverage: ValidationFindingsReport['scorecardCoverage'];
}): string[] {
  const readyConcepts = unique(input.readyForGuardedRerun.map((finding) => finding.conceptDisplayName));
  const blockedConcepts = unique(input.mappingBlockedFields.map((finding) => finding.conceptDisplayName));
  const pendingHumanProofConcepts = unique(
    input.remainingCalibrationBlockers
      .filter((blocker) => blocker.appliedHumanProofStatus === null)
      .map((blocker) => blocker.conceptDisplayName),
  );
  const captureBlockedConcepts = unique(
    input.remainingCalibrationBlockers
      .filter((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden')
      .filter((blocker) => hasPhysicalAddressPostToggleCaptureAmbiguity(blocker))
      .map((blocker) => blocker.conceptDisplayName),
  );
  const probeGenericBlockedConcepts = unique(
    input.remainingCalibrationBlockers
      .filter((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden')
      .filter((blocker) => !hasPhysicalAddressPostToggleCaptureAmbiguity(blocker))
      .filter((blocker) => hasPhysicalAddressProbeAmbiguity(blocker))
      .map((blocker) => blocker.conceptDisplayName),
  );
  const proofRecordedButBlockedConcepts = unique(
    input.remainingCalibrationBlockers
      .filter((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden')
      .filter((blocker) => !hasPhysicalAddressPostToggleCaptureAmbiguity(blocker))
      .filter((blocker) => !hasPhysicalAddressProbeAmbiguity(blocker))
      .map((blocker) => blocker.conceptDisplayName),
  );
  const omittedFlowConcepts = unique(
    input.remainingCalibrationBlockers
      .filter((blocker) => blocker.appliedHumanProofStatus === 'confirmed_omitted_or_hidden')
      .map((blocker) => blocker.conceptDisplayName),
  );
  const summary = [
    `${input.totalObservations} observations were reviewed across ${input.targetConcepts.length} targeted concept(s).`,
    `${input.resultCounts.passed} passed, ${input.resultCounts.failed} failed, ${input.resultCounts.warning} warned, ${input.resultCounts.manual_review} require manual review, and ${input.resultCounts.skipped} were skipped.`,
    `${input.likelyProductValidationFindings.length} likely product validation finding(s) came from trusted executed observations.`,
    `${input.ambiguousHumanReviewFindings.length} ambiguous observation(s) require human review before product-defect classification.`,
    `Merged scorecard coverage is ${input.scorecardCoverage.executedValidationCount}/${input.scorecardCoverage.expectedValidationCount} (${input.scorecardCoverage.validationCoveragePercent}%), grade ${input.scorecardCoverage.validationQualityGrade}.`,
  ];
  if (readyConcepts.length > 0) {
    summary.splice(4, 0, `${readyConcepts.join(', ')} are now trusted by offline calibration and ready for a guarded rerun; their latest interactive results are stale skipped observations.`);
  }
  summary.splice(readyConcepts.length > 0 ? 5 : 4, 0, blockedConcepts.length > 0
    ? `${blockedConcepts.join(', ')} remained mapping-blocked after applying the latest offline calibration and should not be treated as product validation failure(s).`
    : 'No currently mapping-blocked target concepts remain after applying the latest offline calibration.');
  let summaryInsertIndex = readyConcepts.length > 0 ? 6 : 5;
  if (captureBlockedConcepts.length > 0) {
    summary.splice(summaryInsertIndex, 0, `${captureBlockedConcepts.join(', ')} have operator proof recorded, and the guarded post-toggle structure capture now runs after isOperatingAddress, but it still does not isolate field-local Physical Operating Address labels; keep them separate from product validation findings until the capture anchor, bounds, or DOM selector isolates the same field-local target.`);
    summaryInsertIndex += 1;
  }
  if (probeGenericBlockedConcepts.length > 0) {
    summary.splice(summaryInsertIndex, 0, `${probeGenericBlockedConcepts.join(', ')} have operator proof recorded, but the guarded post-toggle DOM probe still exposed only generic unlabeled controls after isOperatingAddress; keep them separate from product validation findings until a screenshot/MHTML capture or narrower selector recovers the same field-local target.`);
    summaryInsertIndex += 1;
  }
  if (proofRecordedButBlockedConcepts.length > 0) {
    summary.splice(summaryInsertIndex, 0, `${proofRecordedButBlockedConcepts.join(', ')} have operator proof recorded, but the saved safe-mode report still lacks a matching field-local live target; keep them separate from product validation findings.`);
    summaryInsertIndex += 1;
  }
  if (omittedFlowConcepts.length > 0) {
    summary.splice(summaryInsertIndex, 0, `${omittedFlowConcepts.join(', ')} are intentionally omitted or not signer-editable in this flow and remain out of product validation findings.`);
    summaryInsertIndex += 1;
  }
  if (pendingHumanProofConcepts.length > 0) {
    summary.splice(summaryInsertIndex, 0, `${pendingHumanProofConcepts.join(', ')} remain unresolved calibration blockers outside this rerun scope and still need human proof; keep them separate from product validation findings.`);
  }
  return summary;
}

function buildRecommendedToolingWork(
  mappingBlockedFields: FindingItem[],
  readyForGuardedRerun: FindingItem[],
  remainingCalibrationBlockers: RemainingCalibrationBlocker[],
): string[] {
  const items = [
    'Keep mapping-not-confident, tool-mapping-suspect, ownership-suspect, and observer-ambiguous outcomes out of product-defect counts.',
    'Preserve the calibrated target handoff for Website, Email, Phone, and Date of Birth while continuing to require live verifier agreement before mutation.',
  ];
  if (readyForGuardedRerun.length > 0) {
    items.push('Rerun guarded interactive checks for concepts that are now trusted by offline calibration before treating the stale skipped results as remaining blockers or coverage gaps.');
  }
  if (mappingBlockedFields.some((finding) => finding.concept === 'bank_name')) {
    items.push('Resolve Bank Name by improving live verifier evidence around the page-1 banking window; do not mutate Bank Name until a safe text/name-like candidate is unclaimed and trusted.');
    items.push('Record the Bank Name block as mapping/tool work, not a product validation finding.');
  }
  if (remainingCalibrationBlockers.some((blocker) => blocker.appliedHumanProofStatus === null)) {
    items.push('Keep unresolved calibration blockers out of product findings until screenshots confirm whether the saved-sample controls are visible, editable, omitted, or intentionally hidden in this flow.');
  }
  if (remainingCalibrationBlockers.some((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden' && hasPhysicalAddressPostToggleCaptureAmbiguity(blocker))) {
    items.push(`For proof-recorded Physical Operating Address blockers, ${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION}`);
  }
  if (remainingCalibrationBlockers.some((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden' && hasPhysicalAddressProbeAmbiguity(blocker))) {
    items.push(`For proof-recorded Physical Operating Address blockers, ${PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION}`);
  }
  if (remainingCalibrationBlockers.some((blocker) => blocker.appliedHumanProofStatus !== null && blocker.appliedHumanProofStatus !== 'confirmed_omitted_or_hidden' && !hasPhysicalAddressProbeAmbiguity(blocker))) {
    items.push('Keep proof-confirmed but live-unresolved calibration blockers out of product findings until a safe-mode capture or guarded rerun surfaces the same field-local target.');
  }
  if (remainingCalibrationBlockers.some((blocker) => blocker.appliedHumanProofStatus === 'confirmed_omitted_or_hidden')) {
    items.push('Treat proof-confirmed omitted or hidden address fields as flow omissions, not rerun candidates or product defects.');
  }
  items.push('Add concise exports for reviewer handoff before expanding to sensitive tax or bank-account fields.');
  return items;
}

function buildRecommendedBatches(): RecommendedBatch[] {
  return [
    {
      batch: 'Batch 1',
      focus: 'Low-risk mapped merchant fields with clear validation expectations.',
      concepts: ['registration_date', 'ownership_percentage', 'postal_code', 'business_name', 'dba_name', 'business_description'],
      notes: 'Keep runs targeted and non-finalizing; use calibrated target confidence before mutation.',
    },
    {
      batch: 'Batch 2',
      focus: 'Deepen already-trusted contact/date coverage.',
      concepts: ['website/email/phone expanded checks', 'date_of_birth expanded age/date-policy checks', 'stakeholder email/phone/DOB'],
      notes: 'Use the current trusted targets but keep observer-ambiguous policy cases separate from product failures.',
    },
    {
      batch: 'Batch 3',
      focus: 'Sensitive identifiers and controlled dropdowns after mapping and redaction are strong.',
      concepts: ['EIN / SSN / tax IDs', 'routing number / account number', 'legal entity type', 'state', 'country', 'account type dropdowns'],
      notes: 'Do not expand into tax IDs or bank account values until redaction and ownership evidence are strong.',
    },
    {
      batch: 'Batch 4',
      focus: 'Upload, acknowledgement, and signature-adjacent controls.',
      concepts: ['uploads', 'acknowledgement controls', 'signature controls'],
      notes: 'Keep these non-finalizing unless explicitly approved for a disposable envelope completion boundary.',
    },
  ];
}

function conceptNotes(
  concept: FieldConceptKey,
  findings: FindingItem[],
  score: ValidationScorecardFile['conceptScores'][number] | null,
): string[] {
  const notes: string[] = [];
  const hasTrustedExecutedFinding = findings.some((finding) => finding.targetConfidence === 'trusted' && finding.status !== 'skipped');
  if (concept === 'website' && hasTrustedExecutedFinding) {
    notes.push('Website ran through a trusted target. Malformed URL and URL-with-spaces behavior should be reviewed as likely lenient validation.');
  }
  if (EMAIL_CONCEPTS.has(concept) && hasTrustedExecutedFinding) {
    notes.push(`${concept === 'stakeholder_email' ? 'Stakeholder Email' : 'Email'} ran through a trusted target and all exercised checks passed.`);
    if ((score?.notRunValidationCount ?? 0) > 0) notes.push(`${score!.notRunValidationCount} expected ${score!.displayName} check(s) remain not run.`);
  }
  if (PHONE_CONCEPTS.has(concept) && hasTrustedExecutedFinding) {
    const conceptLabel = concept === 'stakeholder_phone' ? 'Stakeholder Phone' : 'Phone';
    const tooLongFinding = findings.find((finding) => finding.validationId === 'too-long-rejected');
    const missingPlusFinding = findings.find((finding) => finding.validationId === 'missing-plus-handling');

    if (tooLongFinding?.outcome === 'passed') {
      notes.push(`${conceptLabel} too-long input showed acceptable truncation, prevention, or field-local enforcement and is not treated as a product defect in this report.`);
    } else if (tooLongFinding?.ambiguity?.type === 'acceptable_behavior_documented') {
      notes.push(`${conceptLabel} too-long input showed acceptable normalization or truncation and is documented, not a product defect, unless policy requires a visible blocking error.`);
    } else if (tooLongFinding?.ambiguity?.type === 'product_validation_gap_candidate') {
      notes.push(`${conceptLabel} too-long input may indicate a product validation gap if policy requires blocking the full invalid value with a field-local signal.`);
    }

    if (missingPlusFinding?.ambiguity?.type === 'policy_question') {
      notes.push('Missing-plus handling remains a phone-format policy question until domestic-format acceptance or normalization is confirmed.');
    } else if (missingPlusFinding?.ambiguity?.type === 'matrix_expectation_mismatch') {
      notes.push('Missing-plus handling showed field-local E.164 validation and should stay in human review until domestic-format acceptance or normalization policy is confirmed.');
    }

    if ((score?.notRunValidationCount ?? 0) > 0) notes.push(`${score!.notRunValidationCount} expected ${score!.displayName} check(s) remain not run.`);
  }
  if (concept === 'date_of_birth' && hasTrustedExecutedFinding) {
    notes.push('Date of Birth ran through a trusted target. Future-date behavior remains a likely product validation finding if accepted.');
    notes.push('Alternate format and under-age behavior should remain human-review policy questions unless product policy is confirmed.');
  }
  if (concept === 'postal_code' && findings.some((finding) => finding.validationId === 'letters-behavior' && finding.outcome === 'passed')) {
    notes.push('Alphabetic ZIP input is treated as expected rejection when field-local ZIP validation is present for this Batch 1 US address flow.');
  }
  if (isNameConcept(concept) && findings.some((finding) => /excessive-length/i.test(finding.validationId) && finding.outcome === 'passed')) {
    notes.push('Safe truncation or normalization for excessive length is treated as acceptable enforcement in this report.');
  }
  if (isNameConcept(concept) && findings.some((finding) => /special-characters/i.test(finding.validationId) && finding.outcome === 'passed')) {
    notes.push('Symbol-heavy name input is reported as documented leniency, not as a product defect, unless policy later tightens this rule.');
  }
  if (concept === 'dba_name' && findings.some((finding) => /empty-required/i.test(finding.validationId) && finding.outcome === 'passed')) {
    notes.push('Blank DBA Name is treated as acceptable when the merchant has no separate trade name.');
  }
  if (concept === 'bank_name' && !hasTrustedExecutedFinding) {
    notes.push('The tool did not mutate Bank Name because the resolved live target did not have safe bank-name-shaped evidence and no unclaimed neighboring candidate was safe enough.');
    notes.push('This is not a product validation finding yet.');
  }
  if (notes.length === 0) notes.push(summarizeConcept(findings[0]?.conceptDisplayName ?? concept, findings));
  return notes;
}

function summarizeConceptForReport(
  displayName: string,
  findings: FindingItem[],
  score: ValidationScorecardFile['conceptScores'][number] | null,
): string {
  if (findings.every((finding) => finding.status === 'skipped')) {
    return score?.summary ?? summarizeConcept(displayName, findings);
  }

  const executed = findings.filter((finding) => finding.status !== 'skipped').length;
  const reviewCount = findings.filter((finding) => finding.ambiguity !== null).length;
  const warningCount = findings.filter((finding) => finding.status === 'warning').length;

  if (reviewCount > 0) {
    return `${executed} best-practice validations ran and ${reviewCount} need review.`;
  }
  if (warningCount > 0) {
    return `${executed} best-practice validations ran with ${warningCount} documented warning${warningCount === 1 ? '' : 's'}.`;
  }
  return `${executed} best-practice validations ran and none need review.`;
}

function summarizeConcept(displayName: string, findings: FindingItem[]): string {
  const passed = findings.filter((finding) => finding.status === 'passed').length;
  const failed = findings.filter((finding) => finding.status === 'failed').length;
  const skipped = findings.filter((finding) => finding.status === 'skipped').length;
  return `${displayName}: ${passed} passed, ${failed} failed, ${skipped} skipped.`;
}

function renderFindingTable(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`## ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }
  lines.push('| Concept | Check | Status | Outcome | Target | Interpretation | Recommendation |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(finding.testName)} | ${finding.status} | ${finding.outcome} | ${finding.targetConfidence ?? 'n/a'} | ${esc(finding.interpretation)} | ${esc(formatRecommendation(finding))} |`);
  }
  lines.push('');
}

function renderLikelyProductValidationFindings(lines: string[], findings: FindingItem[]): void {
  lines.push('## Likely Product Validation Findings');
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Field | Check | Why trusted | What was accepted | Why it matters | Recommended product action |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(finding.fieldLabel ?? finding.conceptDisplayName)} | ${esc(finding.testName)} | ${esc(productFindingTrustSummary(finding))} | ${esc(productFindingAcceptedSummary(finding))} | ${esc(productFindingImpactSummary(finding))} | ${esc(productFindingActionSummary(finding))} |`);
  }
  lines.push('');
}

function renderControlledChoiceFindings(lines: string[], report: ValidationFindingsReport): void {
  lines.push('## Controlled-choice observations');
  lines.push('');
  if (report.controlledChoiceFindings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Classification | Count |');
  lines.push('|---|---|');
  lines.push(`| Expected select behavior | ${report.controlledChoiceBreakdown.expected_select_behavior} |`);
  lines.push(`| Observer needs better select evidence | ${report.controlledChoiceBreakdown.observer_needs_better_select_evidence} |`);
  lines.push(`| Options not discoverable | ${report.controlledChoiceBreakdown.options_not_discoverable} |`);
  lines.push(`| Restore behavior documented | ${report.controlledChoiceBreakdown.restore_behavior_documented} |`);
  lines.push(`| Acceptable behavior documented | ${report.controlledChoiceBreakdown.acceptable_behavior_documented} |`);
  lines.push(`| Policy question | ${report.controlledChoiceBreakdown.policy_question} |`);
  lines.push(`| Possible product validation gap | ${report.controlledChoiceBreakdown.product_validation_gap_candidate} |`);
  lines.push('');

  const overview = [
    ...(report.controlledChoiceFindingsByClassification.expected_select_behavior ?? []),
    ...(report.controlledChoiceFindingsByClassification.observer_needs_better_select_evidence ?? []),
  ];
  renderControlledChoiceSection(lines, 'Controlled-choice observations', overview);
  renderControlledChoiceSection(lines, 'Options not discoverable', report.controlledChoiceFindingsByClassification.options_not_discoverable ?? []);
  renderControlledChoiceSection(lines, 'Free-text impossible by design', report.controlledChoiceFindings.filter((finding) =>
    finding.controlledChoiceClassification === 'acceptable_behavior_documented' &&
    /invalid-freeform/i.test(finding.validationId) &&
    finding.freeTextEntryImpossible === true,
  ));
  renderControlledChoiceSection(lines, 'Clear/empty behavior not supported', report.controlledChoiceFindings.filter((finding) =>
    /empty-required/i.test(finding.validationId) && finding.status !== 'passed',
  ));
  renderControlledChoiceSection(lines, 'Restore behavior', report.controlledChoiceFindingsByClassification.restore_behavior_documented ?? []);
  renderControlledChoiceSection(lines, 'Policy questions', report.controlledChoiceFindingsByClassification.policy_question ?? []);
  renderControlledChoiceSection(lines, 'Possible product validation gaps', report.controlledChoiceFindingsByClassification.product_validation_gap_candidate ?? []);
}

function renderControlledChoiceSection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Check | Classification | Status | Outcome | Control | Why not product finding yet | Would convert to product finding if | Human guidance |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(finding.testName)} | ${esc(controlledChoiceClassificationLabel(finding.controlledChoiceClassification))} | ${finding.status} | ${finding.outcome} | ${esc(finding.controlKind ?? 'n/a')} | ${esc(controlledChoiceWhyNotProductFinding(finding))} | ${esc(controlledChoiceWouldBecomeProductFindingIf(finding))} | ${esc(controlledChoiceHumanGuidance(finding))} |`);
  }
  lines.push('');
}

function renderAmbiguousFindingsByType(lines: string[], report: ValidationFindingsReport): void {
  lines.push('## Ambiguous / Human Review Findings');
  lines.push('');
  if (report.ambiguousHumanReviewFindings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Type | Count |');
  lines.push('|---|---|');
  for (const section of AMBIGUITY_SECTIONS) {
    lines.push(`| ${section.title} | ${report.ambiguityTypeBreakdown[section.type] ?? 0} |`);
  }
  lines.push('');

  for (const section of AMBIGUITY_SECTIONS) {
    const findings = report.ambiguousFindingsByType[section.type] ?? [];
    lines.push(`### ${section.title}`);
    lines.push('');
    if (findings.length === 0) {
      lines.push('No findings in this category.');
      lines.push('');
      continue;
    }
    lines.push('| Concept | Check | Interpretation | Why not product bug yet | Would convert to product finding if | Human guidance | Evidence summary |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const finding of findings) {
      const ambiguity = finding.ambiguity;
      lines.push(
        `| ${esc(finding.conceptDisplayName)} | ${esc(finding.testName)} | ${esc(finding.interpretation)} | ${esc(ambiguity?.whyNotProductFinding)} | ${esc(ambiguity?.wouldBecomeProductFindingIf)} | ${esc(ambiguity?.humanGuidanceNeeded ? ambiguity.humanGuidancePrompt ?? 'Yes' : 'No')} | ${esc(formatAmbiguityEvidenceSummary(finding))} |`,
      );
    }
    lines.push('');
  }
}

function renderAddressLocationFindings(lines: string[], report: ValidationFindingsReport): void {
  const addressObservations = report.trustedExecutedObservations.filter((finding) => isAddressLocationConcept(finding.concept));
  const addressAmbiguousFindings = report.ambiguousHumanReviewFindings.filter((finding) => isAddressLocationConcept(finding.concept));
  const addressAmbiguousByType = groupAmbiguousFindingsByType(addressAmbiguousFindings);
  const addressReadyForGuardedRerun = report.readyForGuardedRerun.filter((finding) => isAddressLocationConcept(finding.concept));
  const addressMappingBlocked = report.mappingBlockedFields.filter((finding) => isAddressLocationConcept(finding.concept));
  const addressHumanConfirmation = addressMappingBlocked.filter((finding) => finding.humanConfirmation !== null);

  if (!addressObservations.length && !addressReadyForGuardedRerun.length && !addressMappingBlocked.length) {
    return;
  }

  lines.push('## Address / Location Findings');
  lines.push('');
  renderAddressObservationSection(lines, 'Address/location observations', addressObservations);
  renderAddressAmbiguitySection(lines, 'Expected address/text leniency', [
    ...(addressAmbiguousByType.expected_text_leniency ?? []),
    ...(addressAmbiguousByType.acceptable_behavior_documented ?? []),
  ]);
  renderAddressAmbiguitySection(lines, 'Address policy questions', addressAmbiguousByType.policy_question ?? []);
  renderAddressAmbiguitySection(lines, 'Matrix expectation mismatches', addressAmbiguousByType.matrix_expectation_mismatch ?? []);
  renderAddressAmbiguitySection(lines, 'Possible product validation gaps', addressAmbiguousByType.product_validation_gap_candidate ?? []);
  renderAddressReadyForGuardedRerunSection(lines, 'Offline-calibrated targets awaiting guarded rerun', addressReadyForGuardedRerun);
  renderAddressMappingBlockedSection(lines, 'Mapping-blocked address fields', addressMappingBlocked);
  renderAddressHumanConfirmationSection(lines, 'Human visual confirmation needed', addressHumanConfirmation);
}

function renderRemainingCalibrationBlockers(lines: string[], blockers: RemainingCalibrationBlocker[]): void {
  lines.push('## Remaining Unresolved Calibration Blockers');
  lines.push('');
  if (blockers.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Disposition | Current blocker | Exact next step | Decision impact |');
  lines.push('|---|---|---|---|---|');
  for (const blocker of blockers) {
    lines.push(`| ${esc(blocker.conceptDisplayName)} | ${esc(blockerDisposition(blocker))} | ${esc(blockerCurrentBlocker(blocker))} | ${esc(blockerNextStep(blocker))} | ${esc(blockerDecisionImpact(blocker))} |`);
  }
  lines.push('');
}

function blockerCurrentBlocker(blocker: RemainingCalibrationBlocker): string {
  return blocker.missingProof.find((entry) => entry.startsWith(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX))
    ?? blocker.missingProof.find((entry) => entry.startsWith(PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX))
    ?? blocker.currentBlocker
    ?? blocker.appliedHumanProofSummary
    ?? blocker.missingProof[0]
    ?? 'n/a';
}

function blockerDisposition(blocker: RemainingCalibrationBlocker): string {
  if (blocker.appliedHumanProofStatus === 'confirmed_omitted_or_hidden') {
    return 'Flow omission confirmed';
  }
  if (blocker.appliedHumanProofStatus) {
    return 'Human proof recorded; live mapping still insufficient';
  }
  return 'Human proof still needed';
}

function blockerNextStep(blocker: RemainingCalibrationBlocker): string {
  if (blocker.appliedHumanProofStatus === 'confirmed_omitted_or_hidden') {
    return 'No additional human proof requested. Keep this concept non-product and do not infer it from other visible country dropdowns.';
  }
  if (blocker.appliedHumanProofStatus && hasPhysicalAddressPostToggleCaptureAmbiguity(blocker)) {
    return PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION;
  }
  if (blocker.appliedHumanProofStatus && hasPhysicalAddressProbeAmbiguity(blocker)) {
    return PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION;
  }
  if (blocker.appliedHumanProofStatus) {
    return `Need a safe-mode capture or guarded rerun that surfaces ${blocker.conceptDisplayName} as the same field-local target proven by the saved sample.`;
  }
  return blocker.requestedEvidence ?? 'n/a';
}

function blockerDecisionImpact(blocker: RemainingCalibrationBlocker): string {
  if (blocker.appliedHumanProofStatus === 'confirmed_omitted_or_hidden') {
    return 'Keep this concept out of product findings and do not promote it to trusted for this flow.';
  }
  if (blocker.appliedHumanProofStatus) {
    return 'Keep this concept out of product findings until stronger live mapping evidence agrees with the recorded human proof.';
  }
  return blocker.decisionImpact ?? 'n/a';
}

function hasPhysicalAddressProbeAmbiguity(blocker: Pick<RemainingCalibrationBlocker, 'missingProof'>): boolean {
  return blocker.missingProof.some((entry) => entry.startsWith(PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX));
}

function hasPhysicalAddressPostToggleCaptureAmbiguity(blocker: Pick<RemainingCalibrationBlocker, 'missingProof'>): boolean {
  return blocker.missingProof.some((entry) => entry.startsWith(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX));
}

function renderAddressReadyForGuardedRerunSection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Offline calibration | Trusted target | Next step |');
  lines.push('|---|---|---|---|');
  for (const finding of findings) {
    const calibrationSummary = [finding.calibrationDecision, finding.calibrationMappingDecisionReason].filter(Boolean).join(' / ');
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(calibrationSummary || 'trusted offline')} | ${esc(finding.calibrationSelectedCandidate)} | ${esc(finding.recommendation)} |`);
  }
  lines.push('');
}

function renderAddressObservationSection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Check | Status | Outcome | Review bucket | Interpretation |');
  lines.push('|---|---|---|---|---|---|');
  for (const finding of findings) {
    const reviewBucket = finding.ambiguity?.type
      ? sectionTitle(finding.ambiguity.type)
      : (finding.status === 'passed' ? 'Resolved / documented' : 'n/a');
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(finding.testName)} | ${finding.status} | ${finding.outcome} | ${esc(reviewBucket)} | ${esc(finding.interpretation)} |`);
  }
  lines.push('');
}

function renderAddressAmbiguitySection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Check | Why not product bug yet | Human guidance | Evidence summary |');
  lines.push('|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(finding.testName)} | ${esc(finding.ambiguity?.whyNotProductFinding)} | ${esc(finding.ambiguity?.humanGuidanceNeeded ? finding.ambiguity.humanGuidancePrompt ?? 'Yes' : 'No')} | ${esc(formatAmbiguityEvidenceSummary(finding))} |`);
  }
  lines.push('');
}

function renderAddressMappingBlockedSection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Policy prompt | Current blocker | Requested evidence | Decision impact |');
  lines.push('|---|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(addressMappingPolicyPrompt(finding.concept))} | ${esc(finding.humanConfirmation?.currentBlocker ?? finding.targetConfidenceReason ?? 'n/a')} | ${esc(finding.humanConfirmation?.requestedEvidence ?? finding.recommendation)} | ${esc(finding.humanConfirmation?.decisionImpact ?? 'n/a')} |`);
  }
  lines.push('');
}

function renderAddressHumanConfirmationSection(lines: string[], title: string, findings: FindingItem[]): void {
  lines.push(`### ${title}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push('No findings in this category.');
    lines.push('');
    return;
  }

  lines.push('| Concept | Policy prompt | Human confirmation prompt | Decision impact |');
  lines.push('|---|---|---|---|');
  for (const finding of findings) {
    lines.push(`| ${esc(finding.conceptDisplayName)} | ${esc(addressMappingPolicyPrompt(finding.concept))} | ${esc(finding.humanConfirmation?.requestedEvidence)} | ${esc(finding.humanConfirmation?.decisionImpact)} |`);
  }
  lines.push('');
}

function addressMappingPolicyPrompt(concept: FieldConceptKey): string {
  switch (concept) {
    case 'registered_address_line_2':
      return 'Should registered_address_line_2 be tested, and is it optional?';
    case 'registered_state':
    case 'registered_country':
      return 'Should registered_state/country be tested if display-only or not surfaced as editable controls?';
    case 'business_mailing_address_line_1':
    case 'business_mailing_city':
    case 'business_mailing_state':
    case 'business_mailing_postal_code':
      return 'Should business mailing address be tested separately from registered legal address? Should physical operating address empty fields be ignored unless explicitly populated?';
    case 'bank_state':
    case 'bank_country':
      return 'Should bank address be tested separately from registered address? Are bank state/country editable or display-only?';
    default:
      return 'Review whether this address/location field should be treated as a separate editable validation target.';
  }
}

function isUnresolvedCalibrationDecision(decision: string | null | undefined): boolean {
  return decision === 'leave_unresolved' || decision === 'downgrade_current_mapping_to_unresolved';
}

function isStateValidationProductFinding(finding: FindingItem): boolean {
  return finding.outcome === 'product_failure' && /(^|_)state$/i.test(finding.concept);
}

function productFindingTrustSummary(finding: FindingItem): string {
  const parts = [finding.targetConfidenceReason ?? 'Trusted executed target.'];
  if (finding.calibrationDecision && finding.calibrationMappingDecisionReason) {
    parts.push(`Offline calibration: ${finding.calibrationDecision} / ${finding.calibrationMappingDecisionReason}.`);
  }
  return parts.join(' ');
}

function productFindingAcceptedSummary(finding: FindingItem): string {
  if (isStateValidationProductFinding(finding) && /numbers/i.test(finding.validationId + ' ' + finding.testName)) {
    return 'Accepted numeric non-state value.';
  }
  if (isStateValidationProductFinding(finding) && /invalid state/i.test(finding.validationId + ' ' + finding.testName)) {
    return 'Accepted invalid non-state value.';
  }
  if (finding.outcome === 'product_failure') {
    return 'Accepted an input that should have been rejected.';
  }
  return finding.interpretation;
}

function productFindingImpactSummary(finding: FindingItem): string {
  if (isStateValidationProductFinding(finding)) {
    return 'State should be constrained to valid state values or reject invalid state-like inputs at the field level.';
  }
  return finding.interpretation;
}

function productFindingActionSummary(finding: FindingItem): string {
  if (isStateValidationProductFinding(finding)) {
    return `Constrain ${finding.fieldLabel ?? finding.conceptDisplayName} to valid state values and reject invalid or numeric entries with a field-local validation signal.`;
  }
  return formatRecommendation(finding);
}

function controlledChoiceClassificationLabel(classification: ControlledChoiceClassification | null): string {
  switch (classification) {
    case 'expected_select_behavior':
      return 'expected_select_behavior';
    case 'options_not_discoverable':
      return 'options_not_discoverable';
    case 'restore_behavior_documented':
      return 'restore_behavior_documented';
    case 'policy_question':
      return 'policy_question';
    case 'observer_needs_better_select_evidence':
      return 'observer_needs_better_select_evidence';
    case 'product_validation_gap_candidate':
      return 'product_validation_gap_candidate';
    case 'acceptable_behavior_documented':
      return 'acceptable_behavior_documented';
    default:
      return 'n/a';
  }
}

function controlledChoiceWhyNotProductFinding(finding: FindingItem): string {
  switch (finding.controlledChoiceClassification) {
    case 'expected_select_behavior':
      return 'The current/select state was readable from the recorded control state without exposing the raw option value in findings output.';
    case 'options_not_discoverable':
      return 'The observer could not enumerate safe options, which is a tooling-evidence gap rather than a product defect by itself.';
    case 'restore_behavior_documented':
      return finding.restoreSucceeded === false
        ? 'Restore safety is documented as a tooling risk and does not prove a product defect.'
        : 'The exercised alternate selection restored cleanly, so this documents safe select behavior rather than a defect.';
    case 'policy_question':
      return 'Clearability or allowed-option policy is not specific enough to classify this as a product issue yet.';
    case 'observer_needs_better_select_evidence':
      return 'The select control was trusted, but the observer did not capture enough non-sensitive evidence to certify the current option.';
    case 'product_validation_gap_candidate':
      return 'The controlled choice appears clearable without a local validation signal, but policy still needs to confirm that the empty state is truly invalid.';
    case 'acceptable_behavior_documented':
      return finding.freeTextEntryImpossible
        ? 'Free-text entry is impossible by design on this controlled select, which is acceptable behavior for a fixed option set.'
        : 'The UI either prevented the unsupported empty state or handled it in an acceptable documented way.';
    default:
      return 'n/a';
  }
}

function controlledChoiceWouldBecomeProductFindingIf(finding: FindingItem): string {
  switch (finding.controlledChoiceClassification) {
    case 'expected_select_behavior':
      return 'A trusted rerun shows the control cannot surface its current selection at all, or that a required select accepts an invalid state without local validation.';
    case 'options_not_discoverable':
      return 'The options become discoverable and the same select still accepts an invalid or empty state without field-local validation.';
    case 'restore_behavior_documented':
      return finding.restoreSucceeded === false
        ? 'A future trusted run shows restore loss is caused by product-side behavior rather than harness safety handling.'
        : 'A future trusted run loses the original selection or fails to restore after a valid alternate choice.';
    case 'policy_question':
      return 'Product policy explicitly requires different select behavior and a trusted run still shows no local validation or input blocking.';
    case 'observer_needs_better_select_evidence':
      return 'Stronger select readback still fails to document the current option, leaving the control unreadable to the signer and reviewer.';
    case 'product_validation_gap_candidate':
      return 'Policy confirms the empty or invalid state must be blocked at form entry and the trusted control still accepts it without local validation.';
    case 'acceptable_behavior_documented':
      return 'Policy later requires a stricter visible error instead of the currently documented blocked or unsupported behavior.';
    default:
      return 'n/a';
  }
}

function controlledChoiceHumanGuidance(finding: FindingItem): string {
  if (finding.controlledChoiceClassification === 'policy_question' || finding.controlledChoiceClassification === 'product_validation_gap_candidate') {
    switch (finding.concept) {
      case 'legal_entity_type':
        return 'Should Legal Entity Type allow clearing, or is one option always required?';
      case 'proof_of_business_type':
      case 'proof_of_address_type':
      case 'proof_of_bank_account_type':
        return 'Should proof type dropdowns be clearable, or always selected from the provided application data?';
      case 'bank_account_type':
        return 'Should Account Type allow only checking/savings, and should free text be impossible?';
      default:
        return `What is the expected product policy for ${finding.conceptDisplayName}: ${finding.testName}?`;
    }
  }
  if (finding.controlledChoiceClassification === 'observer_needs_better_select_evidence') {
    return `Is there any visible field-local validation text or styling for ${finding.conceptDisplayName} that the select observer missed?`;
  }
  return 'No';
}

function formatAmbiguityEvidenceSummary(finding: FindingItem): string {
  const ambiguity = finding.ambiguity;
  if (!ambiguity) return 'n/a';
  return `${ambiguity.evidenceSourceSummary}; ${ambiguity.valueBehaviorSummary}; restore ${finding.targetConfidence === 'trusted' ? 'tracked' : 'n/a'}`;
}

function formatRecommendation(finding: FindingItem): string {
  const parts = [finding.recommendation];
  if (finding.targetConfidenceReason && finding.targetConfidence !== 'trusted') {
    parts.push(`Target reason: ${finding.targetConfidenceReason}`);
  }
  if (finding.mappingMissingProof.length > 0) {
    parts.push(`Missing mapping proof: ${finding.mappingMissingProof.join('; ')}`);
  }
  if (finding.humanConfirmation) {
    parts.push(`Human confirmation: ${finding.humanConfirmation.requestedEvidence}`);
  }
  return parts.join(' ');
}

function isReadyForGuardedRerun(finding: FindingItem): boolean {
  return finding.status === 'skipped' &&
    finding.outcome === 'mapping_not_confident' &&
    (finding.calibrationDecision === 'trust_current_mapping' || finding.calibrationDecision === 'trust_likely_better_candidate');
}

function buildLiveHumanConfirmationRequest(
  result: ValidationResult,
  targetConfidenceReason: string | null,
  mappingFlags: string[],
): HumanConfirmationRequest | null {
  if (result.status !== 'skipped' || result.outcome !== 'mapping_not_confident') return null;
  const reason = [targetConfidenceReason, ...mappingFlags].filter(Boolean).join(' | ');
  if (!reason) return null;
  const actualField = result.targetDiagnostics?.actualFieldSignature ?? result.fieldLabel ?? result.conceptDisplayName;
  return {
    needed: true,
    concept: result.concept,
    suspectedFieldLocation: actualField,
    currentBlocker: reason,
    requestedEvidence: `Review a screenshot around ${result.conceptDisplayName} (${actualField}) and identify the visible editable field label, section header, and nearest neighboring labels that distinguish the intended input from same-shaped neighbors.`,
    decisionImpact: `If the screenshot supplies a single unambiguous ${result.conceptDisplayName} target, the next guarded run can trust and mutate that field; otherwise it remains mapping-blocked and out of product-failure counts.`,
  };
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const value = key(item) ?? 'none';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function countFindingStatuses(findings: FindingItem[]): InteractiveValidationResultsFile['summary'] {
  return {
    total: findings.length,
    passed: findings.filter((finding) => finding.status === 'passed').length,
    failed: findings.filter((finding) => finding.status === 'failed').length,
    warning: findings.filter((finding) => finding.status === 'warning').length,
    manual_review: findings.filter((finding) => finding.status === 'manual_review').length,
    skipped: findings.filter((finding) => finding.status === 'skipped').length,
  };
}

function countFindingOutcomes(findings: FindingItem[]): InteractiveValidationResultsFile['outcomes'] {
  return {
    passed: findings.filter((finding) => finding.outcome === 'passed').length,
    product_failure: findings.filter((finding) => finding.outcome === 'product_failure').length,
    tool_mapping_suspect: findings.filter((finding) => finding.outcome === 'tool_mapping_suspect').length,
    error_ownership_suspect: findings.filter((finding) => finding.outcome === 'error_ownership_suspect').length,
    observer_ambiguous: findings.filter((finding) => finding.outcome === 'observer_ambiguous').length,
    mapping_not_confident: findings.filter((finding) => finding.outcome === 'mapping_not_confident').length,
  };
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function esc(value: string | null | undefined): string {
  return (value ?? 'n/a').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

if (require.main === module) {
  const defaultArtifactsDir = path.resolve(__dirname, '..', 'artifacts');
  const artifactsDir = path.resolve(process.argv[2] ?? defaultArtifactsDir);
  const { jsonPath, mdPath, report } = writeValidationFindingsArtifacts({ artifactsDir });
  // eslint-disable-next-line no-console
  console.log(`Wrote ${mdPath}`);
  // eslint-disable-next-line no-console
  console.log(`Wrote ${jsonPath}`);
  // eslint-disable-next-line no-console
  console.log(
    `Findings: product ${report.likelyProductValidationFindings.length}, ambiguous ${report.ambiguousHumanReviewFindings.length}, mapping-blocked ${report.mappingBlockedFields.length}, ready-for-rerun ${report.readyForGuardedRerun.length}`,
  );
}
