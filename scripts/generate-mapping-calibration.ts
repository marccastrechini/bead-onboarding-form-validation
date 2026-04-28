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
  expectedValueShapesForConcept,
  resolveMappingClaims,
  type MappingDecisionReason,
  type MappingShiftReason,
  type ValueShape,
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

type CalibrationReason =
  | 'page1_anchor_drift_after_website'
  | 'stale_enrichment_after_anchor_mismatch'
  | 'shifted_contact_block_candidate'
  | 'no_unclaimed_neighbor_with_expected_shape'
  | 'none';

interface CalibrationCandidateSummary {
  fieldIndex: number;
  label: string;
  businessSection: string | null;
  layoutSectionHeader: string | null;
  layoutFieldLabel: string | null;
  editability: 'editable' | 'read_only' | 'unknown';
  tabType: string | null;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  coordinates: string;
  valueShape: ValueShape;
}

interface NeighborWindowEntry {
  fieldIndex: number;
  label: string;
  businessSection: string | null;
  layoutSectionHeader: string | null;
  layoutFieldLabel: string | null;
  editability: 'editable' | 'read_only' | 'unknown';
  pageIndex: number | null;
  ordinalOnPage: number | null;
  coordinates: string;
  tabType: string | null;
  valueShape: ValueShape;
}

interface MappingCalibrationRow {
  concept: FieldConceptKey;
  conceptDisplayName: string;
  jsonKeyPath: string;
  currentMappedField: string;
  currentCandidateFieldIndex: number | null;
  currentCandidateOrdinal: number | null;
  currentCandidateCoordinates: string | null;
  currentMappedValueShape: ValueShape;
  expectedValueShapes: ValueShape[];
  sampleExpectedAnchor: string;
  sampleAnchorSource: string;
  nearbyCandidateShapes: string;
  nearestShapeMatch: string | null;
  nearestLabelSectionMatch: string | null;
  likelyBetterCandidate: string | null;
  selectedCandidate: string | null;
  decision: CalibrationDecision;
  calibrationReason: CalibrationReason;
  mappingDecisionReason: MappingDecisionReason;
  suspectedShiftReason: MappingShiftReason;
  blockedCandidateIds: string[];
  missingProof: string[];
  humanConfirmation: HumanConfirmationRequest | null;
  explanation: string;
  neighborWindow: NeighborWindowEntry[];
}

interface HumanConfirmationRequest {
  needed: true;
  concept: FieldConceptKey;
  suspectedFieldLocation: string;
  currentBlocker: string;
  requestedEvidence: string;
  decisionImpact: string;
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

interface ConceptCalibrationContext {
  concept: FieldConceptKey;
  diagnosticsRow: InteractiveTargetDiagnosticsFile['rows'][number] | null;
  enrichmentRecord: EnrichmentRecord;
  alignmentRow: SampleAlignmentArtifact['rows'][number] | null;
  anchor: {
    jsonKeyPath: string;
    displayName: string;
    businessSection: string | null;
    pageIndex: number | null;
    ordinalOnPage: number | null;
    tabLeft: number | null;
    tabTop: number | null;
    docusignFieldFamily: string | null;
  };
  currentField: FieldRecord | null;
  currentSignature: string;
  currentValueShape: ValueShape;
  nearbyFields: FieldRecord[];
  sourceFieldIndexByField: Map<FieldRecord, number>;
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
  const contexts = buildConceptContexts(input);
  const resolutions = resolveMappingClaims(contexts.map((context) => ({
    concept: context.concept,
    currentCandidateId: context.currentField ? String(sourceFieldIndex(context, context.currentField)) : null,
    candidates: context.nearbyFields.map((field) => toMappingCandidate(context, field)),
    expectedAnchor: context.anchor,
  })));
  const resolutionByConcept = new Map(resolutions.map((resolution) => [resolution.concept, resolution]));

  const rows = contexts
    .map((context) => buildConceptRow(context, resolutionByConcept.get(context.concept)!))
    .sort((a, b) => conceptOrder(a.concept) - conceptOrder(b.concept));

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
    findings: buildFindings(rows),
    rows,
  };
}

function buildConceptContexts(input: {
  report: ValidationReport;
  targetDiagnostics: InteractiveTargetDiagnosticsFile;
  enrichment: EnrichmentBundle;
  alignment: SampleAlignmentArtifact;
}): ConceptCalibrationContext[] {
  const sourceFieldIndexByField = new Map(input.report.fields.map((field, index) => [field, index + 1]));
  const diagnosticsByConcept = new Map<FieldConceptKey, InteractiveTargetDiagnosticsFile['rows'][number]>();
  for (const row of input.targetDiagnostics.rows) {
    if (!diagnosticsByConcept.has(row.concept)) diagnosticsByConcept.set(row.concept, row);
  }

  const requestedConcepts = new Set<FieldConceptKey>([
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
    'legal_entity_type',
    'business_type',
    'bank_account_type',
    'federal_tax_id_type',
    'proof_of_business_type',
    'proof_of_address_type',
    'proof_of_bank_account_type',
  ]);
  for (const concept of diagnosticsByConcept.keys()) requestedConcepts.add(concept);

  return Array.from(requestedConcepts)
    .sort((a, b) => conceptOrder(a) - conceptOrder(b))
    .flatMap((concept) => {
      const enrichmentRecord = findConceptEnrichmentRecord(input, concept);
      if (!enrichmentRecord) return [];

      const alignmentRow = input.alignment.rows.find((row) => row.jsonKeyPath === enrichmentRecord.jsonKeyPath) ?? null;
      const fingerprint = parseFingerprint(enrichmentRecord.positionalFingerprint);
      const anchor = {
        jsonKeyPath: enrichmentRecord.jsonKeyPath,
        displayName: enrichmentRecord.suggestedDisplayName,
        businessSection: alignmentRow?.businessSection ?? enrichmentRecord.suggestedBusinessSection,
        pageIndex: alignmentRow?.tabPageIndex ?? fingerprint?.pageIndex ?? null,
        ordinalOnPage: alignmentRow?.tabOrdinalOnPage ?? fingerprint?.ordinalOnPage ?? null,
        tabLeft: alignmentRow?.tabLeft ?? enrichmentRecord.tabLeft ?? null,
        tabTop: alignmentRow?.tabTop ?? enrichmentRecord.tabTop ?? null,
        docusignFieldFamily: alignmentRow?.candidateDocuSignFieldFamily ?? enrichmentRecord.docusignFieldFamily,
      };

      const diagnosticsRow = diagnosticsByConcept.get(concept) ?? null;

      const hasAnchorWindow = Boolean(
        diagnosticsRow ||
        anchor.pageIndex !== null ||
        anchor.ordinalOnPage !== null ||
        anchor.tabLeft !== null ||
        anchor.tabTop !== null,
      );

      const nearbyFields = hasAnchorWindow
        ? input.report.fields
          .filter((field) => field.controlCategory === 'merchant_input')
          .filter((field) => field.pageIndex === anchor.pageIndex || anchor.pageIndex === null)
          .filter((field) => {
            if (anchor.ordinalOnPage === null) return true;
            if (field.ordinalOnPage === null) return false;
            return Math.abs(field.ordinalOnPage - anchor.ordinalOnPage) <= 5;
          })
          .sort((a, b) => (a.pageIndex ?? 0) - (b.pageIndex ?? 0) || (a.ordinalOnPage ?? 0) - (b.ordinalOnPage ?? 0))
        : [];
      const currentField = findCurrentField({
        diagnosticsRow,
        enrichmentRecord,
        nearbyFields,
      });
      const currentValueShape = diagnosticsRow?.valueBefore
        ? detectValueShape(diagnosticsRow.valueBefore)
        : currentField
          ? detectValueShape(extractFieldCurrentValueHint(currentField))
          : 'unknown';

      const context: ConceptCalibrationContext = {
        concept,
        diagnosticsRow,
        enrichmentRecord,
        alignmentRow,
        anchor,
        currentField,
        currentSignature: 'n/a',
        currentValueShape,
        nearbyFields,
        sourceFieldIndexByField,
      };
      context.currentSignature = diagnosticsRow?.actualFieldSignature ?? (currentField ? formatCandidateSummary(summarizeField(context, currentField)) : 'n/a');
      return [context];
    });
}

function findConceptEnrichmentRecord(input: {
  report: ValidationReport;
  enrichment: EnrichmentBundle;
  alignment: SampleAlignmentArtifact;
}, concept: FieldConceptKey): EnrichmentRecord | null {
  const conceptDef = FIELD_CONCEPT_REGISTRY[concept];
  const bundled = input.enrichment.records
    .filter((record) =>
    conceptDef.jsonKeyPatterns.some((pattern) => pattern.test(record.jsonKeyPath)),
    )
    .sort((a, b) => conceptRecordPriority(concept, a) - conceptRecordPriority(concept, b))[0];
  if (bundled) return bundled;

  const field = input.report.fields.find((candidate) =>
    candidate.enrichment?.jsonKeyPath && conceptDef.jsonKeyPatterns.some((pattern) => pattern.test(candidate.enrichment!.jsonKeyPath)),
  );

  const alignmentRow = input.alignment.rows.find((row) =>
    conceptDef.jsonKeyPatterns.some((pattern) => pattern.test(row.jsonKeyPath)),
  );
  if (alignmentRow) {
    return {
      tabGuid: '',
      positionalFingerprint: null,
      tabLeft: alignmentRow.tabLeft,
      tabTop: alignmentRow.tabTop,
      jsonKeyPath: alignmentRow.jsonKeyPath,
      jsonFieldFamily: alignmentRow.businessSection,
      jsonTypeHint: alignmentRow.jsonTypeHint,
      docusignFieldFamily: alignmentRow.candidateDocuSignFieldFamily ?? 'Unknown',
      confidence: alignmentRow.confidence as EnrichmentRecord['confidence'],
      suggestedDisplayName: FIELD_CONCEPT_REGISTRY[concept].displayName,
      suggestedBusinessSection: alignmentRow.businessSection,
    };
  }

  if (!field?.enrichment) return null;

  return {
    tabGuid: field.tabGuid ?? '',
    positionalFingerprint: field.enrichment.positionalFingerprint,
    tabLeft: field.enrichment.expectedTabLeft ?? field.tabLeft,
    tabTop: field.enrichment.expectedTabTop ?? field.tabTop,
    jsonKeyPath: field.enrichment.jsonKeyPath,
    jsonFieldFamily: field.enrichment.suggestedBusinessSection,
    jsonTypeHint: field.enrichment.expectedJsonTypeHint ?? 'string',
    docusignFieldFamily: field.enrichment.expectedDocusignFieldFamily ?? field.docusignTabType ?? 'Unknown',
    confidence: field.enrichment.confidence,
    suggestedDisplayName: field.enrichment.suggestedDisplayName,
    suggestedBusinessSection: field.enrichment.suggestedBusinessSection,
  };
}

function conceptRecordPriority(concept: FieldConceptKey, record: EnrichmentRecord): number {
  const key = record.jsonKeyPath;
  if (concept === 'postal_code') {
    if (/registeredLegalAddress\.postalCode$/i.test(key)) return 0;
    if (/businessMailingAddress\.postalCode$/i.test(key)) return 5;
    if (/bankAddress\.postalCode$/i.test(key)) return 10;
    if (/stakeholders\[\d+\]\.address\.postalCode$/i.test(key)) return 20;
  }
  if (concept === 'business_name') {
    if (/merchantData\.registeredName$/i.test(key)) return 0;
    if (/merchantData\.merchantName$/i.test(key)) return 5;
  }
  if (concept === 'dba_name' && /merchantData\.dbaName$/i.test(key)) return 0;
  if (concept === 'business_description' && /merchantData\.businessDescription$/i.test(key)) return 0;
  if (concept === 'legal_entity_type' && /merchantData\.legalEntityType$/i.test(key)) return 0;
  if (concept === 'business_type') {
    if (/merchantData\.locationBusinessType$/i.test(key)) return 0;
    if (/merchantData\.businessType$/i.test(key)) return 5;
  }
  if (concept === 'bank_account_type') {
    if (/merchantData\.accountType$/i.test(key)) return 0;
    if (/merchantData\.bankAccountType$/i.test(key)) return 5;
  }
  if (concept === 'federal_tax_id_type' && /merchantData\.federalTaxIdType$/i.test(key)) return 0;
  if (concept === 'proof_of_business_type' && /merchantData\.proofOfBusinessType$/i.test(key)) return 0;
  if (concept === 'proof_of_address_type' && /merchantData\.proofOfAddressType$/i.test(key)) return 0;
  if (concept === 'proof_of_bank_account_type' && /merchantData\.proofOfBankAccountType$/i.test(key)) return 0;
  return 50;
}

function buildConceptRow(
  context: ConceptCalibrationContext,
  resolution: ReturnType<typeof resolveMappingClaims>[number],
): MappingCalibrationRow {
  const selection = resolution.selection;
  const selectedField = selection.selectedCandidateId
    ? context.nearbyFields.find((field) => String(sourceFieldIndex(context, field)) === selection.selectedCandidateId) ?? null
    : null;
  const nearestShapeMatch = pickNearestField(context, selection, (assessment) =>
    assessment.valueShapeMatches && !assessment.valueShapeMismatch,
  );
  const nearestLabelSectionMatch = pickNearestField(context, selection, (assessment) =>
    assessment.labelMatches || assessment.sectionMatches || assessment.enrichmentMatches,
  );

  const decision = decideCalibrationOutcome(context, selection, context.currentField, selectedField);
  const calibrationReason = deriveCalibrationReason(context, selection, selectedField, nearestShapeMatch);
  const missingProof = missingProofForSelection(context, selection, selectedField, nearestShapeMatch);
  const humanConfirmation = buildHumanConfirmationRequest(context, selection, selectedField, nearestShapeMatch, missingProof);

  return {
    concept: context.concept,
    conceptDisplayName: FIELD_CONCEPT_REGISTRY[context.concept].displayName,
    jsonKeyPath: context.enrichmentRecord.jsonKeyPath,
    currentMappedField: context.currentSignature,
    currentCandidateFieldIndex: context.currentField ? sourceFieldIndex(context, context.currentField) : null,
    currentCandidateOrdinal: context.currentField?.ordinalOnPage ?? null,
    currentCandidateCoordinates: context.currentField ? formatCoordinates(context.currentField.tabLeft, context.currentField.tabTop) : null,
    currentMappedValueShape: context.currentValueShape,
    expectedValueShapes: expectedValueShapesForConcept(context.concept),
    sampleExpectedAnchor: formatAnchor(context.enrichmentRecord, context.alignmentRow),
    sampleAnchorSource: formatAnchorSource(context.enrichmentRecord, context.alignmentRow),
    nearbyCandidateShapes: context.nearbyFields.map((field) => formatCandidateSummary(summarizeField(context, field))).join(' ; '),
    nearestShapeMatch: nearestShapeMatch ? formatCandidateSummary(summarizeField(context, nearestShapeMatch)) : null,
    nearestLabelSectionMatch: nearestLabelSectionMatch ? formatCandidateSummary(summarizeField(context, nearestLabelSectionMatch)) : null,
    likelyBetterCandidate: selectedField && (!context.currentField || sourceFieldIndex(context, selectedField) !== sourceFieldIndex(context, context.currentField))
      ? formatCandidateSummary(summarizeField(context, selectedField))
      : null,
    selectedCandidate: selectedField ? formatCandidateSummary(summarizeField(context, selectedField)) : null,
    decision,
    calibrationReason,
    mappingDecisionReason: selection.decisionReason,
    suspectedShiftReason: selection.shiftReason,
    blockedCandidateIds: resolution.blockedCandidateIds,
    missingProof,
    humanConfirmation,
    explanation: explainDecision(context, selection, selectedField, nearestShapeMatch, calibrationReason),
    neighborWindow: context.nearbyFields.map((field) => {
      const summary = summarizeField(context, field);
      return {
        fieldIndex: summary.fieldIndex,
        label: summary.label,
        businessSection: summary.businessSection,
        layoutSectionHeader: summary.layoutSectionHeader,
        layoutFieldLabel: summary.layoutFieldLabel,
        editability: summary.editability,
        pageIndex: summary.pageIndex,
        ordinalOnPage: summary.ordinalOnPage,
        coordinates: summary.coordinates,
        tabType: summary.tabType,
        valueShape: summary.valueShape,
      };
    }),
  };
}

function decideCalibrationOutcome(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  currentField: FieldRecord | null,
  selectedField: FieldRecord | null,
): CalibrationDecision {
  if (selection.trusted && currentField && selectedField && sourceFieldIndex(context, currentField) === sourceFieldIndex(context, selectedField)) {
    return 'trust_current_mapping';
  }
  if (selection.trusted && selectedField) {
    return 'trust_likely_better_candidate';
  }
  if (currentField) {
    return 'downgrade_current_mapping_to_unresolved';
  }
  return 'leave_unresolved';
}

function deriveCalibrationReason(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  selectedField: FieldRecord | null,
  nearestShapeMatch: FieldRecord | null,
): CalibrationReason {
  if (context.concept === 'website' && context.anchor.pageIndex === 1) {
    return 'page1_anchor_drift_after_website';
  }
  if ((context.concept === 'email' || context.concept === 'phone') && selection.trusted && selectedField) {
    return 'shifted_contact_block_candidate';
  }
  if (context.concept === 'bank_name' && selection.trusted && selectedField) {
    return 'stale_enrichment_after_anchor_mismatch';
  }
  if (!selection.trusted && !nearestShapeMatch) {
    return 'no_unclaimed_neighbor_with_expected_shape';
  }
  return 'none';
}

function missingProofForSelection(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  selectedField: FieldRecord | null,
  nearestShapeMatch: FieldRecord | null,
): string[] {
  if (selection.trusted) return [];

  const selectedAssessment = selection.selectedCandidateId
    ? selection.assessments.find((assessment) => assessment.candidateId === selection.selectedCandidateId) ?? null
    : null;
  const missing: string[] = [];
  const expectedShapes = expectedValueShapesForConcept(context.concept);
  const expectedShapeSummary = expectedShapes.length > 0
    ? `${expectedShapes.join(' or ')} live value shape`
    : 'concept-specific field-family proof';

  if (!nearestShapeMatch) {
    missing.push(`No unclaimed editable candidate has the expected ${expectedShapeSummary}.`);
  }
  if (selectedAssessment?.reasons.length) {
    missing.push(...selectedAssessment.reasons.map((reason) => sentenceCase(reason)));
  }

  switch (selection.decisionReason) {
    case 'rejected_value_shape_mismatch':
      missing.push(`The current candidate value shape is ${selection.valueShape}, not ${expectedShapes.length > 0 ? expectedShapes.join(' or ') : 'the expected shape for this concept'}.`);
      break;
    case 'rejected_neighbor_better_match':
      missing.push('The live neighbor window points at a better candidate than the current mapped field.');
      break;
    case 'rejected_ambiguous_neighbors':
      missing.push('Multiple nearby editable candidates still look plausible, with no single exact anchor hit.');
      break;
    case 'rejected_stale_enrichment':
      missing.push('The saved sample anchor appears stale relative to the live field position.');
      break;
    case 'rejected_not_editable_merchant_input':
      missing.push('The best candidate is not an editable merchant input.');
      break;
    case 'rejected_insufficient_description_proof':
      missing.push('Business Description needs long-text, textarea, or field-local description proof before mutation.');
      break;
    case 'rejected_section_mismatch':
      missing.push(`The best candidate is outside the ${FIELD_CONCEPT_REGISTRY[context.concept].businessSection} section.`);
      break;
    case 'rejected_insufficient_label_proof':
      missing.push('The candidate does not have enough label, section, enrichment, and value-shape proof to trust mutation.');
      break;
  }

  if (context.concept === 'postal_code') {
    missing.push('Need a visible editable Address field with ZIP/postal-code-shaped value or field-local Postal Code label proof.');
  }
  if (context.concept === 'business_name') {
    missing.push('Need the editable Registered/Business Name input, not a neighboring read-only display row.');
  }
  if (context.concept === 'dba_name') {
    missing.push('Need one unclaimed DBA Name input distinct from Registered Name, Registration Date, and location/name neighbors.');
  }
  if (context.concept === 'business_description') {
    missing.push('Need a Business Description label/section cue, textarea-like control, or long descriptive live text.');
  }
  if (context.concept === 'legal_entity_type' || context.concept === 'business_type') {
    missing.push('Need a visible editable List/combobox control with a field-local Legal Entity Type or Business Type label, or enrichment that anchors the intended selector uniquely.');
  }
  if (context.concept === 'bank_account_type') {
    missing.push('Need a visible editable Bank Account Type or Account Type selector with discoverable options such as checking or savings.');
  }
  if (context.concept === 'federal_tax_id_type') {
    missing.push('Need a visible editable Federal Tax ID Type selector rather than the sensitive tax ID value field itself.');
  }
  if (context.concept === 'proof_of_business_type' || context.concept === 'proof_of_address_type' || context.concept === 'proof_of_bank_account_type') {
    missing.push('Need a visible editable proof-type selector that identifies document category only, not an upload widget or uploaded file value.');
  }

  if (selectedField && selectedAssessment && !selectedAssessment.labelMatches && !selectedAssessment.enrichmentMatches) {
    missing.push(`Candidate #${sourceFieldIndex(context, selectedField)} needs field-local label or enrichment proof for ${FIELD_CONCEPT_REGISTRY[context.concept].displayName}.`);
  }

  return unique(missing);
}

function buildHumanConfirmationRequest(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  selectedField: FieldRecord | null,
  nearestShapeMatch: FieldRecord | null,
  missingProof: string[],
): HumanConfirmationRequest | null {
  if (selection.trusted || missingProof.length === 0) return null;

  const suspectedField = selectedField ?? nearestShapeMatch ?? context.currentField;
  const suspectedFieldLocation = suspectedField
    ? formatCandidateSummary(summarizeField(context, suspectedField))
    : context.anchor.displayName
      ? `${context.anchor.displayName} (${context.anchor.businessSection ?? 'unknown section'})`
      : context.currentSignature;
  const conceptName = FIELD_CONCEPT_REGISTRY[context.concept].displayName;

  return {
    needed: true,
    concept: context.concept,
    suspectedFieldLocation,
    currentBlocker: selection.explanation,
    requestedEvidence: `Review a screenshot of ${suspectedFieldLocation} and answer whether it is the visible editable ${conceptName} input, including the field label, section header, and nearest neighboring labels.`,
    decisionImpact: `If the visual answer supplies the missing proof (${missingProof.join('; ')}), the next calibration can trust this mapping; otherwise ${conceptName} stays mapping-blocked and out of product-failure counts.`,
  };
}

function explainDecision(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  selectedField: FieldRecord | null,
  nearestShapeMatch: FieldRecord | null,
  calibrationReason: CalibrationReason,
): string {
  const parts: string[] = [];

  if (context.currentField && selection.selectedCandidateId && String(sourceFieldIndex(context, context.currentField)) !== selection.selectedCandidateId) {
    parts.push(`Current candidate #${sourceFieldIndex(context, context.currentField)} looks ${context.currentValueShape}, but #${selection.selectedCandidateId} is the safer anchor-aligned choice.`);
  } else if (!context.currentField) {
    parts.push('No prior live-mapped candidate could be recovered from the saved diagnostics for this concept.');
  }

  if (selectedField) {
    parts.push(`Selected candidate ${formatCandidateSummary(summarizeField(context, selectedField))}.`);
  }
  if (nearestShapeMatch && (!selectedField || sourceFieldIndex(context, nearestShapeMatch) !== sourceFieldIndex(context, selectedField))) {
    parts.push(`Nearest expected-shape neighbor: ${formatCandidateSummary(summarizeField(context, nearestShapeMatch))}.`);
  }
  if (selection.shiftReason !== 'none') {
    parts.push(`Shift reason: ${selection.shiftReason}.`);
  }
  if (calibrationReason !== 'none') {
    parts.push(`Calibration reason: ${calibrationReason}.`);
  }
  parts.push(`Decision reason: ${selection.decisionReason}.`);

  return parts.join(' ');
}

function pickNearestField(
  context: ConceptCalibrationContext,
  selection: ReturnType<typeof resolveMappingClaims>[number]['selection'],
  predicate: (assessment: ReturnType<typeof resolveMappingClaims>[number]['selection']['assessments'][number]) => boolean,
): FieldRecord | null {
  const matches = selection.assessments
    .filter(predicate)
    .map((assessment) => {
      const field = context.nearbyFields.find((candidate) => sourceFieldIndex(context, candidate) === Number(assessment.candidateId)) ?? null;
      return field ? { field, distance: anchorDistance(context.anchor, field) } : null;
    })
    .filter((entry): entry is { field: FieldRecord; distance: number } => entry !== null)
    .sort((a, b) => a.distance - b.distance || sourceFieldIndex(context, a.field) - sourceFieldIndex(context, b.field));

  return matches[0]?.field ?? null;
}

function findCurrentField(input: {
  diagnosticsRow: InteractiveTargetDiagnosticsFile['rows'][number] | null;
  enrichmentRecord: EnrichmentRecord;
  nearbyFields: FieldRecord[];
}): FieldRecord | null {
  if (input.diagnosticsRow?.valueBefore) {
    const exact = input.nearbyFields.filter((field) => normalizeValue(extractFieldCurrentValueHint(field)) === normalizeValue(input.diagnosticsRow!.valueBefore));
    if (exact.length === 1) return exact[0]!;

    const shape = detectValueShape(input.diagnosticsRow.valueBefore);
    const shapeMatches = input.nearbyFields.filter((field) => detectValueShape(extractFieldCurrentValueHint(field)) === shape);
    if (shapeMatches.length === 1) return shapeMatches[0]!;
  }

  return input.nearbyFields.find((field) => matchingLayoutRecord(input.enrichmentRecord, field))
    ?? input.nearbyFields.find((field) => field.enrichment?.jsonKeyPath === input.enrichmentRecord.jsonKeyPath)
    ?? null;
}

function toMappingCandidate(context: ConceptCalibrationContext, field: FieldRecord) {
  const layoutRecord = matchingLayoutRecord(context.enrichmentRecord, field);
  const currentValueShape = field.currentValueShape ?? null;
  const currentValue = layoutRecord && !currentValueShape ? null : extractFieldCurrentValueHint(field);
  const enrichment = layoutRecord ? enrichmentPayload(layoutRecord) : field.enrichment ? {
    jsonKeyPath: field.enrichment.jsonKeyPath,
    matchedBy: field.enrichment.matchedBy,
    confidence: field.enrichment.confidence,
    suggestedDisplayName: field.enrichment.suggestedDisplayName,
    suggestedBusinessSection: field.enrichment.suggestedBusinessSection,
    positionalFingerprint: field.enrichment.positionalFingerprint,
  } : null;
  return {
    id: String(sourceFieldIndex(context, field)),
    resolvedLabel: layoutRecord?.suggestedDisplayName ?? field.resolvedLabel,
    labelSource: layoutRecord ? 'layout-cell' : field.labelSource,
    labelConfidence: layoutRecord?.confidence === 'high' ? 'high' : field.labelConfidence,
    businessSection: layoutRecord?.suggestedBusinessSection ?? field.enrichment?.suggestedBusinessSection ?? null,
    sectionName: field.section,
    inferredType: field.inferredType,
    docusignTabType: field.docusignTabType,
    pageIndex: field.pageIndex,
    ordinalOnPage: field.ordinalOnPage,
    tabLeft: field.tabLeft,
    tabTop: field.tabTop,
    currentValue,
    currentValueShape,
    observedValueLikeTextNearControl: field.observedValueLikeTextNearControl,
    layoutValueShape: layoutRecord?.layoutValueShape as ValueShape | null | undefined,
    layoutSectionHeader: layoutRecord?.layoutSectionHeader ?? null,
    layoutFieldLabel: layoutRecord?.layoutFieldLabel ?? null,
    layoutEvidenceSource: layoutRecord?.layoutEvidenceSource ?? null,
    controlCategory: field.controlCategory,
    visible: field.visible,
    editable: field.editable,
    enrichment,
  };
}

function matchingLayoutRecord(record: EnrichmentRecord, field: FieldRecord): EnrichmentRecord | null {
  if (!record.layoutEvidenceSource) return null;
  const expected = parseFingerprint(record.positionalFingerprint);
  if (expected?.pageIndex !== undefined && field.pageIndex !== null && field.pageIndex !== expected.pageIndex) return null;
  if (expected?.family && field.docusignTabType && expected.family !== field.docusignTabType) return null;
  if (typeof record.tabLeft !== 'number' || typeof record.tabTop !== 'number') return null;
  if (typeof field.tabLeft !== 'number' || typeof field.tabTop !== 'number') return null;
  const distance = Math.max(Math.abs(record.tabLeft - field.tabLeft), Math.abs(record.tabTop - field.tabTop));
  return distance <= 3 ? record : null;
}

function enrichmentPayload(record: EnrichmentRecord) {
  return {
    jsonKeyPath: record.jsonKeyPath,
    matchedBy: 'coordinate' as const,
    confidence: record.confidence,
    suggestedDisplayName: record.suggestedDisplayName,
    suggestedBusinessSection: record.suggestedBusinessSection,
    positionalFingerprint: record.positionalFingerprint,
  };
}

function extractFieldCurrentValueHint(field: FieldRecord): string | null {
  const equalValueCandidates = new Set(
    field.rejectedLabelCandidates
      .filter((candidate) => candidate.reason === 'equals-field-value')
      .map((candidate) => `${candidate.source}::${normalizeValue(candidate.value)}`),
  );

  for (const source of ['preceding-text', 'section+row'] as const) {
    const raw = field.rawCandidateLabels.find((candidate) =>
      candidate.source === source && equalValueCandidates.has(`${candidate.source}::${normalizeValue(candidate.value)}`),
    )?.value;
    if (raw) return stripSectionPrefix(raw);
  }

  return field.observedValueLikeTextNearControl;
}

function summarizeField(context: ConceptCalibrationContext, field: FieldRecord): CalibrationCandidateSummary {
  const layoutRecord = matchingLayoutRecord(context.enrichmentRecord, field);
  const valueHint = layoutRecord && !field.currentValueShape ? null : extractFieldCurrentValueHint(field);
  const valueShape = field.currentValueShape ?? (layoutRecord?.layoutValueShape as ValueShape | null | undefined) ?? detectValueShape(valueHint);
  return {
    fieldIndex: sourceFieldIndex(context, field),
    label: layoutRecord?.suggestedDisplayName ?? field.resolvedLabel ?? '(unresolved)',
    businessSection: layoutRecord?.suggestedBusinessSection ?? field.enrichment?.suggestedBusinessSection ?? null,
    layoutSectionHeader: layoutRecord?.layoutSectionHeader ?? field.enrichment?.layoutSectionHeader ?? null,
    layoutFieldLabel: layoutRecord?.layoutFieldLabel ?? field.enrichment?.layoutFieldLabel ?? null,
    editability: field.editable === false || field.controlCategory !== 'merchant_input'
      ? 'read_only'
      : field.editable === true
        ? 'editable'
        : 'unknown',
    tabType: field.docusignTabType,
    pageIndex: field.pageIndex,
    ordinalOnPage: field.ordinalOnPage,
    coordinates: formatCoordinates(field.tabLeft, field.tabTop),
    valueShape,
  };
}

function sourceFieldIndex(context: ConceptCalibrationContext, field: FieldRecord): number {
  return context.sourceFieldIndexByField.get(field) ?? field.index + 1;
}

function formatCandidateSummary(candidate: CalibrationCandidateSummary): string {
  const section = candidate.businessSection ? ` ${candidate.businessSection}` : '';
  const layout = candidate.layoutSectionHeader && candidate.layoutFieldLabel
    ? ` layout=${candidate.layoutSectionHeader} > ${candidate.layoutFieldLabel}`
    : '';
  return `#${candidate.fieldIndex} ${candidate.label}${section} p${candidate.pageIndex ?? 'n/a'} ord${candidate.ordinalOnPage ?? 'n/a'} ${candidate.tabType ?? 'n/a'} shape=${candidate.valueShape} editable=${candidate.editability}${layout} @ ${candidate.coordinates}`;
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

function formatAnchorSource(record: EnrichmentRecord, alignmentRow: SampleAlignmentArtifact['rows'][number] | null): string {
  const alignmentEvidence = alignmentRow
    ? `${alignmentRow.matchingMethod}/${alignmentRow.confidence}`
    : 'no-alignment-row';
  return `${record.positionalFingerprint}; enrichment=${record.confidence}; alignment=${alignmentEvidence}`;
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

function anchorDistance(
  anchor: { tabLeft: number | null; tabTop: number | null; ordinalOnPage: number | null },
  field: Pick<FieldRecord, 'tabLeft' | 'tabTop' | 'ordinalOnPage'>,
): number {
  const coordinateDistance =
    anchor.tabLeft === null || anchor.tabTop === null || field.tabLeft === null || field.tabTop === null
      ? 1000
      : Math.max(Math.abs(anchor.tabLeft - field.tabLeft), Math.abs(anchor.tabTop - field.tabTop));
  const ordinalDistance =
    anchor.ordinalOnPage === null || field.ordinalOnPage === null
      ? 100
      : Math.abs(anchor.ordinalOnPage - field.ordinalOnPage);
  return coordinateDistance + ordinalDistance;
}

function buildFindings(rows: MappingCalibrationRow[]): string[] {
  const findings: string[] = [];
  const pageOneRetargets = rows.filter((row) => row.concept !== 'date_of_birth' && row.decision === 'trust_likely_better_candidate');
  const website = rows.find((row) => row.concept === 'website');
  if (website?.decision === 'trust_likely_better_candidate') {
    findings.push('The page-1 website anchor is now usable again: the exact anchor carries a URL-shaped live value, so the contact block can be retargeted from that drift seam instead of trusting stale position-only labels.');
  }
  if (pageOneRetargets.length > 0) {
    findings.push(`Promote ${pageOneRetargets.length} better page-1 candidate(s) where exact sample-anchor coordinates and live value shape agree more strongly than the stale current mapping.`);
  }
  const downgrades = rows.filter((row) => row.decision === 'downgrade_current_mapping_to_unresolved');
  if (downgrades.length > 0) {
    findings.push(`Keep ${downgrades.length} concept(s) downgraded because no unclaimed nearby candidate has enough anchor-plus-shape evidence to trust mutation.`);
  }
  const dob = rows.find((row) => row.concept === 'date_of_birth');
  if (dob?.decision === 'trust_current_mapping') {
    findings.push('Date of Birth remains trusted: the live field still has date type, date-shaped value, and stakeholder-context alignment.');
  }
  return findings;
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
  lines.push('| Concept | Current candidate | Current shape | Expected shape | Sample expected anchor | Nearest shape match | Nearest label/section match | Selected candidate | Decision | Calibration reason |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const row of file.rows) {
    const currentCandidate = row.currentCandidateFieldIndex
      ? `#${row.currentCandidateFieldIndex} ord${row.currentCandidateOrdinal ?? 'n/a'} @ ${row.currentCandidateCoordinates ?? 'n/a'}`
      : 'n/a';
    lines.push(
      `| ${escapePipe(row.conceptDisplayName)} | ${escapePipe(currentCandidate)} | ${row.currentMappedValueShape} | ${escapePipe(row.expectedValueShapes.join(', ') || 'n/a')} | ${escapePipe(row.sampleExpectedAnchor)} | ${escapePipe(row.nearestShapeMatch ?? 'n/a')} | ${escapePipe(row.nearestLabelSectionMatch ?? 'n/a')} | ${escapePipe(row.selectedCandidate ?? 'n/a')} | ${escapePipe(row.decision)} | ${escapePipe(row.calibrationReason)} |`,
    );
  }
  lines.push('');
  lines.push('## Page-1 Retargeting Diagnostics');
  lines.push('');
  for (const row of file.rows.filter((candidate) => candidate.sampleExpectedAnchor.includes('p1 '))) {
    lines.push(`### ${row.conceptDisplayName}`);
    lines.push('');
    lines.push(`- Current candidate: ${row.currentCandidateFieldIndex ? `#${row.currentCandidateFieldIndex} ord${row.currentCandidateOrdinal ?? 'n/a'} @ ${row.currentCandidateCoordinates ?? 'n/a'} shape=${row.currentMappedValueShape}` : 'n/a'}`);
    lines.push(`- Expected value shape: ${row.expectedValueShapes.join(', ') || 'n/a'}`);
    lines.push(`- Sample anchor source: ${row.sampleAnchorSource}`);
    lines.push(`- Decision reason: ${row.mappingDecisionReason}`);
    lines.push(`- Shift reason: ${row.suspectedShiftReason}`);
    lines.push(`- Calibration reason: ${row.calibrationReason}`);
    if (row.blockedCandidateIds.length > 0) {
      lines.push(`- Blocked candidate ids: ${row.blockedCandidateIds.join(', ')}`);
    }
    if (row.missingProof.length > 0) {
      lines.push(`- Missing proof: ${row.missingProof.join('; ')}`);
    }
    if (row.humanConfirmation) {
      lines.push(`- Human confirmation requested: ${row.humanConfirmation.requestedEvidence}`);
      lines.push(`- Decision impact: ${row.humanConfirmation.decisionImpact}`);
    }
    lines.push(`- Explanation: ${row.explanation}`);
    lines.push('- Neighbor window:');
    for (const neighbor of row.neighborWindow) {
      lines.push(`  - #${neighbor.fieldIndex} ${neighbor.label} ${neighbor.businessSection ?? '(unclassified)'} p${neighbor.pageIndex ?? 'n/a'} ord${neighbor.ordinalOnPage ?? 'n/a'} ${neighbor.tabType ?? 'n/a'} shape=${neighbor.valueShape} @ ${neighbor.coordinates}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function stripSectionPrefix(value: string): string {
  return value.replace(/^.*›\s*/, '').trim();
}

function normalizeValue(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function formatCoordinates(left: number | null, top: number | null): string {
  return `${left ?? 'n/a'},${top ?? 'n/a'}`;
}

function conceptOrder(concept: FieldConceptKey): number {
  const ordered: FieldConceptKey[] = [
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
    'legal_entity_type',
    'business_type',
    'bank_account_type',
    'federal_tax_id_type',
    'proof_of_business_type',
    'proof_of_address_type',
    'proof_of_bank_account_type',
  ];
  const index = ordered.indexOf(concept);
  return index >= 0 ? index : ordered.length + concept.localeCompare('website');
}

function escapePipe(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed[0]!.toUpperCase()}${trimmed.slice(1)}${/[.!?]$/.test(trimmed) ? '' : '.'}`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
