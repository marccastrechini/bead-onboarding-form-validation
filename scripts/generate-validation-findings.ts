import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  InteractiveResultOutcome,
  InteractiveResultStatus,
  InteractiveTargetConfidence,
  InteractiveValidationResultsFile,
} from '../fixtures/interactive-validation';
import type { FieldConceptKey } from '../fixtures/field-concepts';
import type { MappingCalibrationFile } from '../fixtures/validation-scorecard';

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
  validationId: string;
  testName: string;
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  severity: string;
  targetConfidence: InteractiveTargetConfidence | null;
  targetConfidenceReason: string | null;
  mappingDecisionReason: string | null;
  mappingShiftReason: string | null;
  mappingMissingProof: string[];
  humanConfirmation: HumanConfirmationRequest | null;
  interpretation: string;
  recommendation: string;
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
  mappingBlockedFields: FindingItem[];
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
  'phone',
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
    const includeMappingProof = result.status === 'skipped' ||
      result.outcome === 'mapping_not_confident' ||
      result.outcome === 'tool_mapping_suspect' ||
      targetConfidence === 'mapping_not_confident' ||
      targetConfidence === 'tool_mapping_suspect';
    const calibration = calibrationByConcept.get(result.concept);
    const targetConfidenceReason = result.targetDiagnostics?.targetConfidenceReason ?? diagnostic?.targetConfidenceReason ?? result.skippedReason ?? null;
    const mappingFlags = result.targetDiagnostics?.mappingFlags ?? diagnostic?.mappingFlags ?? [];
    const humanConfirmation = includeMappingProof
      ? calibration?.humanConfirmation ?? buildLiveHumanConfirmationRequest(result, targetConfidenceReason, mappingFlags)
      : null;
    return {
      concept: result.concept,
      conceptDisplayName: result.conceptDisplayName,
      validationId: result.validationId,
      testName: result.testName,
      status: result.status,
      outcome: result.outcome,
      severity: result.severity,
      targetConfidence,
      targetConfidenceReason,
      mappingDecisionReason: result.targetDiagnostics?.mappingDecisionReason ?? diagnostic?.mappingDecisionReason ?? null,
      mappingShiftReason: result.targetDiagnostics?.mappingShiftReason ?? diagnostic?.mappingShiftReason ?? null,
      mappingMissingProof: includeMappingProof ? calibration?.missingProof ?? [] : [],
      humanConfirmation,
      interpretation: result.interpretation,
      recommendation: result.recommendation,
    };
  };

  const findings = input.results.results.map(toFinding);
  const trustedExecutedObservations = findings.filter((finding) =>
    finding.status !== 'skipped' && finding.targetConfidence === 'trusted',
  );
  const likelyProductValidationFindings = findings.filter(isLikelyProductFinding);
  const ambiguousHumanReviewFindings = findings.filter((finding) =>
    finding.outcome === 'observer_ambiguous' || finding.status === 'manual_review',
  );
  const mappingBlockedFields = findings.filter((finding) =>
    finding.outcome === 'mapping_not_confident' || finding.targetConfidence === 'mapping_not_confident',
  );

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
      results: input.results,
      likelyProductValidationFindings,
      ambiguousHumanReviewFindings,
      mappingBlockedFields,
      scorecardCoverage,
    }),
    runScope: {
      runStartedAt: input.results.runStartedAt,
      runFinishedAt: input.results.runFinishedAt,
      targetConcepts: input.results.targetConcepts,
      totalObservations: input.results.summary.total,
      resultCounts: input.results.summary,
      outcomeCounts: input.results.outcomes,
      trustedTargetObservations: trustedExecutedObservations.length,
      scorecardCoverage: `${scorecardCoverage.executedValidationCount}/${scorecardCoverage.expectedValidationCount} (${scorecardCoverage.validationCoveragePercent}%)`,
    },
    trustedExecutedObservations,
    likelyProductValidationFindings,
    ambiguousHumanReviewFindings,
    mappingBlockedFields,
    perConceptResults,
    scorecardCoverage,
    recommendedNextToolingWork: buildRecommendedToolingWork(mappingBlockedFields),
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
  renderFindingTable(lines, 'Likely Product Validation Findings', report.likelyProductValidationFindings);
  renderFindingTable(lines, 'Ambiguous / Human Review Findings', report.ambiguousHumanReviewFindings);
  renderFindingTable(lines, 'Mapping-Blocked Fields', report.mappingBlockedFields);
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
  return finding.status === 'warning' && !NON_PRODUCT_OUTCOMES.has(finding.outcome);
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
        summary: score?.summary ?? summarizeConcept(conceptDisplayName, findings),
        notes: conceptNotes(concept, findings, score),
      };
    });
}

function buildExecutiveSummary(input: {
  results: InteractiveValidationResultsFile;
  likelyProductValidationFindings: FindingItem[];
  ambiguousHumanReviewFindings: FindingItem[];
  mappingBlockedFields: FindingItem[];
  scorecardCoverage: ValidationFindingsReport['scorecardCoverage'];
}): string[] {
  const blockedConcepts = unique(input.mappingBlockedFields.map((finding) => finding.conceptDisplayName));
  return [
    `${input.results.summary.total} observations were reviewed across ${input.results.targetConcepts.length} targeted concept(s).`,
    `${input.results.summary.passed} passed, ${input.results.summary.failed} failed, ${input.results.summary.warning} warned, ${input.results.summary.manual_review} require manual review, and ${input.results.summary.skipped} were skipped.`,
    `${input.likelyProductValidationFindings.length} likely product validation finding(s) came from trusted executed observations.`,
    `${input.ambiguousHumanReviewFindings.length} ambiguous observation(s) require human review before product-defect classification.`,
    blockedConcepts.length > 0
      ? `${blockedConcepts.join(', ')} remained mapping-blocked and should not be treated as product validation failure(s).`
      : 'No mapping-blocked target concepts were present in the latest run.',
    `Merged scorecard coverage is ${input.scorecardCoverage.executedValidationCount}/${input.scorecardCoverage.expectedValidationCount} (${input.scorecardCoverage.validationCoveragePercent}%), grade ${input.scorecardCoverage.validationQualityGrade}.`,
  ];
}

function buildRecommendedToolingWork(mappingBlockedFields: FindingItem[]): string[] {
  const items = [
    'Keep mapping-not-confident, tool-mapping-suspect, ownership-suspect, and observer-ambiguous outcomes out of product-defect counts.',
    'Preserve the calibrated target handoff for Website, Email, Phone, and Date of Birth while continuing to require live verifier agreement before mutation.',
  ];
  if (mappingBlockedFields.some((finding) => finding.concept === 'bank_name')) {
    items.push('Resolve Bank Name by improving live verifier evidence around the page-1 banking window; do not mutate Bank Name until a safe text/name-like candidate is unclaimed and trusted.');
    items.push('Record the Bank Name block as mapping/tool work, not a product validation finding.');
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
  if (concept === 'website') {
    notes.push('Website ran through a trusted target. Malformed URL and URL-with-spaces behavior should be reviewed as likely lenient validation.');
  }
  if (concept === 'email') {
    notes.push('Email ran through a trusted target and all exercised checks passed.');
    if ((score?.notRunValidationCount ?? 0) > 0) notes.push(`${score!.notRunValidationCount} expected Email check(s) remain not run.`);
  }
  if (concept === 'phone') {
    notes.push('Phone ran through a trusted target. Too-long behavior remains a likely product validation finding if accepted.');
    notes.push('Missing-plus handling is observer-ambiguous and should stay in human review.');
  }
  if (concept === 'date_of_birth') {
    notes.push('Date of Birth ran through a trusted target. Future-date behavior remains a likely product validation finding if accepted.');
    notes.push('Alternate format and under-age behavior should remain human-review policy questions unless product policy is confirmed.');
  }
  if (concept === 'bank_name') {
    notes.push('The tool did not mutate Bank Name because the resolved live target did not have safe bank-name-shaped evidence and no unclaimed neighboring candidate was safe enough.');
    notes.push('This is not a product validation finding yet.');
  }
  if (notes.length === 0) notes.push(summarizeConcept(findings[0]?.conceptDisplayName ?? concept, findings));
  return notes;
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
    `Findings: product ${report.likelyProductValidationFindings.length}, ambiguous ${report.ambiguousHumanReviewFindings.length}, mapping-blocked ${report.mappingBlockedFields.length}`,
  );
}
