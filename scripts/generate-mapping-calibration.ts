import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  FIELD_CONCEPT_REGISTRY,
  type FieldConceptKey,
} from '../fixtures/field-concepts';
import type { InteractiveTargetDiagnosticsFile } from '../fixtures/interactive-validation';
import type { FieldRecord, ValidationReport } from '../fixtures/validation-report';
import type { EnrichmentBundle, EnrichmentRecord } from '../lib/enrichment-loader';
import {
  detectValueShape,
  selectBestMappingCandidate,
  type MappingDecisionReason,
  type MappingShiftReason,
  type ValueShape,
  valueShapeConflictsWithConcept,
} from '../lib/mapping-calibration';

interface SampleAlignmentArtifact {
  rows: Array<{
    jsonKeyPath: string;
    jsonTypeHint: string;
    businessSection: string;
    candidateDocuSignFieldFamily: string | null;
    tabPageIndex: number | null;
    tabOrdinalOnPage: number | null;
    tabLeft: number | null;
    tabTop: number | null;
    confidence: string;
    matchingMethod: string;
    notes: string;
  }>;
}

type CalibrationDecision =
  | 'trust_current_mapping'
  | 'trust_likely_better_candidate'
  | 'downgrade_current_mapping_to_unresolved'
  | 'leave_unresolved';

interface CalibrationCandidateSummary {
  fieldIndex: number;
  label: string;
  tabType: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  coordinates: string;
  valueShape: ValueShape;
}

interface MappingCalibrationRow {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  jsonKeyPath: string;
  currentMappedField: string;
  currentMappedValueShape: ValueShape;
  sampleExpectedAnchor: string;
  nearbyCandidateShapes: string;
  likelyBetterCandidate: string | null;
  decision: CalibrationDecision;
  mappingDecisionReason: MappingDecisionReason;
  suspectedShiftReason: MappingShiftReason;
  explanation: string;
}

interface MappingCalibrationFile {
  schemaVersion: 1;
  generatedAt: string;
  inputs: {
    summaryPath: string;
    targetDiagnosticsPath: string;
    enrichmentPath: string;
    alignmentPath: string;
  };
  summary: {
    totalConcepts: number;
    trustCurrent: number;
    trustBetter: number;
    downgradeToUnresolved: number;
    unresolved: number;
  };
  findings: string[];
  rows: MappingCalibrationRow[];
}

const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
const summaryPath = path.resolve(process.argv[2] ?? path.join(artifactsDir, 'latest-validation-summary.json'));
const targetDiagnosticsPath = path.resolve(process.argv[3] ?? path.join(artifactsDir, 'latest-interactive-target-diagnostics.json'));
const enrichmentPath = path.resolve(process.argv[4] ?? path.join(artifactsDir, 'sample-field-enrichment.json'));
const alignmentPath = path.resolve(process.argv[5] ?? path.join(artifactsDir, 'sample-field-alignment.json'));
const outDir = path.resolve(process.argv[6] ?? artifactsDir);

const report = loadJson<ValidationReport>(summaryPath);
const targetDiagnostics = loadJson<InteractiveTargetDiagnosticsFile>(targetDiagnosticsPath);
const enrichment = loadJson<EnrichmentBundle>(enrichmentPath);
const alignment = loadJson<SampleAlignmentArtifact>(alignmentPath);

const calibration = buildMappingCalibration({
  report,
  targetDiagnostics,
  enrichment,
  alignment,
  summaryPath,
  targetDiagnosticsPath,
  enrichmentPath,
  alignmentPath,
});

fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, 'latest-mapping-calibration.json');
const mdPath = path.join(outDir, 'latest-mapping-calibration.md');
fs.writeFileSync(jsonPath, JSON.stringify(calibration, null, 2), 'utf8');
fs.writeFileSync(mdPath, renderMappingCalibrationMarkdown(calibration), 'utf8');

console.log(`Wrote ${mdPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(
  `Calibration decisions: trust current ${calibration.summary.trustCurrent}, trust better ${calibration.summary.trustBetter}, downgrade ${calibration.summary.downgradeToUnresolved}, unresolved ${calibration.summary.unresolved}`,
);

function buildMappingCalibration(input: {
  report: ValidationReport;
  targetDiagnostics: InteractiveTargetDiagnosticsFile;
  enrichment: EnrichmentBundle;
  alignment: SampleAlignmentArtifact;
  summaryPath: string;
  targetDiagnosticsPath: string;
  enrichmentPath: string;
  alignmentPath: string;
}): MappingCalibrationFile {
  const byConcept = new Map<FieldConceptKey, InteractiveTargetDiagnosticsFile['rows'][number]>();
  for (const row of input.targetDiagnostics.rows) {
    if (!byConcept.has(row.concept)) byConcept.set(row.concept, row);
  }

  const rows = Array.from(byConcept.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((concept) => buildConceptRow(concept, byConcept.get(concept)!, input))
    .filter((row): row is MappingCalibrationRow => row !== null);

  const trustCurrent = rows.filter((row) => row.decision === 'trust_current_mapping').length;
  const trustBetter = rows.filter((row) => row.decision === 'trust_likely_better_candidate').length;
  const downgradeToUnresolved = rows.filter((row) => row.decision === 'downgrade_current_mapping_to_unresolved').length;
  const unresolved = rows.filter((row) => row.decision === 'leave_unresolved').length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
      summaryPath: input.summaryPath,
      targetDiagnosticsPath: input.targetDiagnosticsPath,
      enrichmentPath: input.enrichmentPath,
      alignmentPath: input.alignmentPath,
    },
    summary: {
      totalConcepts: rows.length,
      trustCurrent,
      trustBetter,
      downgradeToUnresolved,
      unresolved,
    },
    findings: buildFindings(rows, input.report),
    rows,
  };
}

function buildConceptRow(
  concept: FieldConceptKey,
  diagnosticsRow: InteractiveTargetDiagnosticsFile['rows'][number],
  input: {
    report: ValidationReport;
    targetDiagnostics: InteractiveTargetDiagnosticsFile;
    enrichment: EnrichmentBundle;
    alignment: SampleAlignmentArtifact;
  },
): MappingCalibrationRow | null {
  const conceptDef = FIELD_CONCEPT_REGISTRY[concept];
  const enrichmentRecord = input.enrichment.records.find((record) => conceptDef.jsonKeyPatterns.some((pattern) => pattern.test(record.jsonKeyPath)));
  if (!enrichmentRecord) return null;

  const alignmentRow = input.alignment.rows.find((row) => row.jsonKeyPath === enrichmentRecord.jsonKeyPath) ?? null;
  const currentSummaryField = input.report.fields.find((field) => field.enrichment?.jsonKeyPath === enrichmentRecord.jsonKeyPath) ?? null;
  const anchor = {
    jsonKeyPath: enrichmentRecord.jsonKeyPath,
    displayName: enrichmentRecord.suggestedDisplayName,
    businessSection: alignmentRow?.businessSection ?? enrichmentRecord.suggestedBusinessSection,
    pageIndex: alignmentRow?.tabPageIndex ?? parseFingerprint(enrichmentRecord.positionalFingerprint)?.pageIndex ?? null,
    ordinalOnPage: alignmentRow?.tabOrdinalOnPage ?? parseFingerprint(enrichmentRecord.positionalFingerprint)?.ordinalOnPage ?? null,
    tabLeft: alignmentRow?.tabLeft ?? enrichmentRecord.tabLeft ?? null,
    tabTop: alignmentRow?.tabTop ?? enrichmentRecord.tabTop ?? null,
    docusignFieldFamily: alignmentRow?.candidateDocuSignFieldFamily ?? enrichmentRecord.docusignFieldFamily,
  };

  const nearbyFields = input.report.fields
    .filter((field) => field.controlCategory === 'merchant_input')
    .filter((field) => field.pageIndex === anchor.pageIndex || anchor.pageIndex === null)
    .filter((field) => {
      if (anchor.ordinalOnPage === null) return true;
      if (field.ordinalOnPage === null) return false;
      return Math.abs(field.ordinalOnPage - anchor.ordinalOnPage) <= 3;
    })
    .sort((a, b) => (a.pageIndex ?? 0) - (b.pageIndex ?? 0) || (a.ordinalOnPage ?? 0) - (b.ordinalOnPage ?? 0));

  const selection = selectBestMappingCandidate({
    concept,
    currentCandidateId: currentSummaryField ? String(currentSummaryField.index) : null,
    candidates: nearbyFields.map((field) => ({
      id: String(field.index),
      resolvedLabel: field.resolvedLabel,
      labelSource: field.labelSource,
      labelConfidence: field.labelConfidence,
      businessSection: field.enrichment?.suggestedBusinessSection ?? null,
      sectionName: field.section,
      inferredType: field.inferredType,
      docusignTabType: field.docusignTabType,
      pageIndex: field.pageIndex,
      ordinalOnPage: field.ordinalOnPage,
      tabLeft: field.tabLeft,
      tabTop: field.tabTop,
      observedValueLikeTextNearControl: field.observedValueLikeTextNearControl,
      enrichment: field.enrichment ? {
        jsonKeyPath: field.enrichment.jsonKeyPath,
        matchedBy: field.enrichment.matchedBy,
        confidence: field.enrichment.confidence,
        suggestedDisplayName: field.enrichment.suggestedDisplayName,
        suggestedBusinessSection: field.enrichment.suggestedBusinessSection,
        positionalFingerprint: field.enrichment.positionalFingerprint,
      } : null,
    })),
    expectedAnchor: anchor,
  });

  const diagnosticsShape = detectValueShape(diagnosticsRow.valueBefore);
  const currentShape = diagnosticsShape !== 'unknown'
    ? diagnosticsShape
    : detectValueShape(currentSummaryField?.observedValueLikeTextNearControl ?? null);
  const exactCoordinateCandidate = nearbyFields.find((field) =>
    currentSummaryField?.index !== field.index &&
    field.tabLeft !== null &&
    field.tabTop !== null &&
    anchor.tabLeft !== null &&
    anchor.tabTop !== null &&
    Math.max(Math.abs(field.tabLeft - anchor.tabLeft), Math.abs(field.tabTop - anchor.tabTop)) <= 3,
  ) ?? null;

  const likelyBetterCandidate = pickLikelyBetterCandidate(selection, currentSummaryField, nearbyFields, exactCoordinateCandidate);
  const decision = decideCalibrationOutcome(selection, currentShape, currentSummaryField, likelyBetterCandidate);
  const explanation = explainDecision({
    concept,
    diagnosticsRow,
    currentShape,
    currentSummaryField,
    likelyBetterCandidate,
    selection,
    exactCoordinateCandidate,
    alignmentRow,
    enrichmentRecord,
  });

  return {
    concept,
    conceptDisplayName: conceptDef.displayName,
    jsonKeyPath: enrichmentRecord.jsonKeyPath,
    currentMappedField: diagnosticsRow.actualFieldSignature,
    currentMappedValueShape: currentShape,
    sampleExpectedAnchor: formatAnchor(enrichmentRecord, alignmentRow),
    nearbyCandidateShapes: nearbyFields.map((field) => formatCandidateSummary(summarizeField(field))).join(' ; '),
    likelyBetterCandidate: likelyBetterCandidate ? formatCandidateSummary(summarizeField(likelyBetterCandidate)) : null,
    decision,
    mappingDecisionReason: selection.decisionReason,
    suspectedShiftReason: selection.shiftReason,
    explanation,
  };
}

function decideCalibrationOutcome(
  selection: ReturnType<typeof selectBestMappingCandidate>,
  currentShape: ValueShape,
  currentSummaryField: FieldRecord | null,
  likelyBetterCandidate: FieldRecord | null,
): CalibrationDecision {
  if (selection.trusted && selection.selectedCandidateId === (currentSummaryField ? String(currentSummaryField.index) : null)) {
    return 'trust_current_mapping';
  }
  if (selection.trusted && selection.selectedCandidateId && selection.selectedCandidateId !== (currentSummaryField ? String(currentSummaryField.index) : null)) {
    return 'trust_likely_better_candidate';
  }
  if (
    likelyBetterCandidate &&
    currentShape !== 'empty' &&
    currentShape !== 'unknown' &&
    selection.decisionReason !== 'trusted_by_date_tab_and_value_shape'
  ) {
    return 'downgrade_current_mapping_to_unresolved';
  }
  return 'leave_unresolved';
}

function pickLikelyBetterCandidate(
  selection: ReturnType<typeof selectBestMappingCandidate>,
  currentSummaryField: FieldRecord | null,
  nearbyFields: FieldRecord[],
  exactCoordinateCandidate: FieldRecord | null,
): FieldRecord | null {
  if (selection.trusted && selection.selectedCandidateId) {
    return nearbyFields.find((field) => String(field.index) === selection.selectedCandidateId) ?? null;
  }
  if (exactCoordinateCandidate) return exactCoordinateCandidate;
  const bestAssessment = selection.assessments[0] ?? null;
  if (!bestAssessment) return null;
  if (currentSummaryField && bestAssessment.candidateId === String(currentSummaryField.index)) return null;
  return nearbyFields.find((field) => String(field.index) === bestAssessment.candidateId) ?? null;
}

function explainDecision(input: {
  concept: FieldConceptKey;
  diagnosticsRow: InteractiveTargetDiagnosticsFile['rows'][number];
  currentShape: ValueShape;
  currentSummaryField: FieldRecord | null;
  likelyBetterCandidate: FieldRecord | null;
  selection: ReturnType<typeof selectBestMappingCandidate>;
  exactCoordinateCandidate: FieldRecord | null;
  alignmentRow: SampleAlignmentArtifact['rows'][number] | null;
  enrichmentRecord: EnrichmentRecord;
}): string {
  const parts: string[] = [];
  if (valueShapeConflictsWithConcept(input.concept, input.currentShape)) {
    parts.push(`Current mapped value looks ${input.currentShape}, which conflicts with ${FIELD_CONCEPT_REGISTRY[input.concept].displayName.toLowerCase()} for the stale target.`);
  }
  if (input.exactCoordinateCandidate) {
    parts.push(`The sample anchor lands exactly on nearby field #${input.exactCoordinateCandidate.index} in the safe summary, which is stronger drift evidence than the current position fallback.`);
  }
  if (input.concept === 'date_of_birth') {
    parts.push('Date Of Birth is the first case with converging proof: date tab, stakeholder section, and date-shaped value.');
  }
  if (input.alignmentRow?.matchingMethod) {
    parts.push(`Offline sample alignment matched by ${input.alignmentRow.matchingMethod}.`);
  }
  if (input.selection.shiftReason !== 'none') {
    parts.push(`Suspected shift reason: ${input.selection.shiftReason}.`);
  }
  if (parts.length === 0) {
    parts.push(`Current evidence remains insufficient to trust ${input.enrichmentRecord.suggestedDisplayName}.`);
  }
  return parts.join(' ');
}

function buildFindings(rows: MappingCalibrationRow[], report: ValidationReport): string[] {
  const findings: string[] = [];
  const websiteUnmatched = report.enrichmentDiagnostics.unmatchedRecords.find(
    (record) => record.jsonKeyPath === 'merchantData.businessWebsite',
  );
  if (websiteUnmatched?.reason === 'tab-type-mismatch') {
    findings.push('The page-1 contact/banking cluster is drifting after the sample website anchor: the website record no longer lands on a live Text tab, so later position-only matches are stale.');
  }
  const downgraded = rows.filter((row) => row.decision === 'downgrade_current_mapping_to_unresolved');
  if (downgraded.length > 0) {
    findings.push(`Downgrade ${downgraded.length} current mapping(s) to unresolved before mutation; their current values contradict the intended concept more strongly than the enrichment label supports it.`);
  }
  const dob = rows.find((row) => row.concept === 'date_of_birth');
  if (dob?.decision === 'trust_current_mapping') {
    findings.push('Date of Birth has enough independent proof to trust the current mapping without loosening the gate: date tab, date-shaped value, and stakeholder context agree.');
  }
  return findings;
}

function summarizeField(field: FieldRecord): CalibrationCandidateSummary {
  const label = field.resolvedLabel ?? '(unresolved)';
  const valueShape = detectValueShape(field.observedValueLikeTextNearControl ?? null);
  return {
    fieldIndex: field.index,
    label,
    tabType: field.docusignTabType,
    pageIndex: field.pageIndex,
    ordinalOnPage: field.ordinalOnPage,
    coordinates: `${field.tabLeft ?? 'n/a'},${field.tabTop ?? 'n/a'}`,
    valueShape,
  };
}

function formatCandidateSummary(candidate: CalibrationCandidateSummary): string {
  return `#${candidate.fieldIndex} ${candidate.label} p${candidate.pageIndex ?? 'n/a'} ord${candidate.ordinalOnPage ?? 'n/a'} ${candidate.tabType ?? 'n/a'} shape=${candidate.valueShape} @ ${candidate.coordinates}`;
}

function formatAnchor(record: EnrichmentRecord, alignmentRow: SampleAlignmentArtifact['rows'][number] | null): string {
  const parsed = parseFingerprint(record.positionalFingerprint);
  const page = alignmentRow?.tabPageIndex ?? parsed?.pageIndex ?? 'n/a';
  const ordinal = alignmentRow?.tabOrdinalOnPage ?? parsed?.ordinalOnPage ?? 'n/a';
  const family = alignmentRow?.candidateDocuSignFieldFamily ?? record.docusignFieldFamily ?? parsed?.family ?? 'n/a';
  const left = alignmentRow?.tabLeft ?? record.tabLeft ?? 'n/a';
  const top = alignmentRow?.tabTop ?? record.tabTop ?? 'n/a';
  return `${record.suggestedDisplayName} p${page} ord${ordinal} ${family} @ ${left},${top}`;
}

function parseFingerprint(
  fingerprint: string | null | undefined,
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

function renderMappingCalibrationMarkdown(file: MappingCalibrationFile): string {
  const lines: string[] = [];
  lines.push('# Bead Onboarding - Mapping Calibration');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Generated at: ${file.generatedAt}`);
  lines.push(`- Concepts reviewed: ${file.summary.totalConcepts}`);
  lines.push(`- Trust current mapping: ${file.summary.trustCurrent}`);
  lines.push(`- Trust likely better candidate: ${file.summary.trustBetter}`);
  lines.push(`- Downgrade current mapping to unresolved: ${file.summary.downgradeToUnresolved}`);
  lines.push(`- Leave unresolved: ${file.summary.unresolved}`);
  lines.push('');
  if (file.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');
    for (const finding of file.findings) lines.push(`- ${finding}`);
    lines.push('');
  }
  lines.push('## Calibration Table');
  lines.push('');
  lines.push('| Concept | Current mapped field | Current value shape | Sample expected anchor | Nearby candidate shapes | Likely better candidate | Decision | Why |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const row of file.rows) {
    lines.push(
      `| ${escapePipe(row.conceptDisplayName)} | ${escapePipe(row.currentMappedField)} | ${row.currentMappedValueShape} | ${escapePipe(row.sampleExpectedAnchor)} | ${escapePipe(row.nearbyCandidateShapes)} | ${escapePipe(row.likelyBetterCandidate ?? 'n/a')} | ${escapePipe(row.decision)} | ${escapePipe(row.explanation)} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}