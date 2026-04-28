import {
  FIELD_CONCEPT_REGISTRY,
  type FieldConceptKey,
} from '../fixtures/field-concepts';

export type ValueShape =
  | 'empty'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'postal_code'
  | 'percentage'
  | 'numeric'
  | 'text_name_like'
  | 'unknown';

export type MappingDecisionReason =
  | 'trusted_by_label'
  | 'trusted_by_enrichment_and_value_shape'
  | 'trusted_by_anchor_and_value_shape'
  | 'trusted_by_date_tab_and_value_shape'
  | 'rejected_not_editable_merchant_input'
  | 'rejected_value_shape_mismatch'
  | 'rejected_section_mismatch'
  | 'rejected_neighbor_better_match'
  | 'rejected_insufficient_description_proof'
  | 'rejected_insufficient_label_proof'
  | 'rejected_stale_enrichment'
  | 'rejected_ambiguous_neighbors';

export type MappingShiftReason =
  | 'none'
  | 'ordinal_shift'
  | 'coordinate_scale_mismatch'
  | 'page_mismatch'
  | 'tabType_mismatch'
  | 'enrichment_bundle_stale'
  | 'sample_live_template_drift'
  | 'concept_alias_mismatch'
  | 'page1_anchor_drift_after_website'
  | 'stale_enrichment_after_anchor_mismatch'
  | 'shifted_contact_block_candidate'
  | 'no_unclaimed_neighbor_with_expected_shape';

export interface MappingClaimRequest {
  concept: FieldConceptKey;
  currentCandidateId: string | null;
  candidates: MappingCandidate[];
  expectedAnchor?: ExpectedMappingAnchor | null;
}

export interface MappingClaimResolution {
  concept: FieldConceptKey;
  blockedCandidateIds: string[];
  selection: MappingSelectionResult;
}

export interface MappingCandidate {
  id: string;
  resolvedLabel?: string | null;
  labelSource?: string | null;
  labelConfidence?: string | null;
  businessSection?: string | null;
  sectionName?: string | null;
  inferredType?: string | null;
  docusignTabType?: string | null;
  pageIndex?: number | null;
  ordinalOnPage?: number | null;
  tabLeft?: number | null;
  tabTop?: number | null;
  currentValue?: string | null;
  currentValueShape?: ValueShape | null;
  observedValueLikeTextNearControl?: string | null;
  layoutValueShape?: ValueShape | null;
  layoutSectionHeader?: string | null;
  layoutFieldLabel?: string | null;
  layoutEvidenceSource?: string | null;
  controlCategory?: string | null;
  visible?: boolean | null;
  editable?: boolean | null;
  enrichment?: {
    jsonKeyPath?: string | null;
    matchedBy?: 'guid' | 'position' | 'coordinate' | null;
    confidence?: 'high' | 'medium' | 'low' | null;
    suggestedDisplayName?: string | null;
    suggestedBusinessSection?: string | null;
    positionalFingerprint?: string | null;
  } | null;
}

export interface ExpectedMappingAnchor {
  jsonKeyPath?: string | null;
  displayName?: string | null;
  businessSection?: string | null;
  pageIndex?: number | null;
  ordinalOnPage?: number | null;
  tabLeft?: number | null;
  tabTop?: number | null;
  docusignFieldFamily?: string | null;
}

export interface CandidateAssessment {
  candidateId: string;
  trustScore: number;
  valueShape: ValueShape;
  pageIndex: number | null;
  ordinalOnPage: number | null;
  tabLeft: number | null;
  tabTop: number | null;
  docusignTabType: string | null;
  labelMatches: boolean;
  strongLabel: boolean;
  sectionMatches: boolean;
  typeMatches: boolean;
  enrichmentMatches: boolean;
  valueShapeMatches: boolean;
  valueShapeMismatch: boolean;
  mutatable: boolean;
  conceptSpecificProofMatches: boolean;
  reasons: string[];
}

export interface MappingSelectionResult {
  selectedCandidateId: string | null;
  trusted: boolean;
  decisionReason: MappingDecisionReason;
  shiftReason: MappingShiftReason;
  valueShape: ValueShape;
  assessments: CandidateAssessment[];
  explanation: string;
}

export function conceptKeyForJsonKeyPath(jsonKeyPath: string | null | undefined): FieldConceptKey | null {
  if (!jsonKeyPath) return null;
  for (const concept of Object.values(FIELD_CONCEPT_REGISTRY)) {
    if (concept.jsonKeyPatterns.some((pattern) => pattern.test(jsonKeyPath))) {
      return concept.key;
    }
  }
  return null;
}

const EMAIL_LIKE_CONCEPTS = new Set<FieldConceptKey>(['email', 'stakeholder_email']);
const PHONE_LIKE_CONCEPTS = new Set<FieldConceptKey>(['phone', 'stakeholder_phone']);

const STRONG_LABEL_SOURCES = new Set([
  'aria-label',
  'aria-labelledby',
  'label-for',
  'wrapping-label',
  'title',
  'enrichment-guid',
  'layout-cell',
]);

const EXPECTED_SHAPES: Partial<Record<FieldConceptKey, ValueShape[]>> = {
  email: ['email'],
  stakeholder_email: ['email'],
  phone: ['phone'],
  stakeholder_phone: ['phone'],
  website: ['url'],
  bank_name: ['text_name_like'],
  business_name: ['text_name_like'],
  dba_name: ['text_name_like'],
  business_description: ['text_name_like'],
  date_of_birth: ['date'],
  registration_date: ['date'],
  postal_code: ['postal_code', 'numeric'],
  ownership_percentage: ['percentage', 'numeric'],
};

const REJECTED_SHAPES: Partial<Record<FieldConceptKey, ValueShape[]>> = {
  email: ['phone', 'url', 'date', 'text_name_like'],
  stakeholder_email: ['phone', 'url', 'date', 'text_name_like'],
  phone: ['email', 'url', 'date', 'text_name_like'],
  stakeholder_phone: ['email', 'url', 'date', 'text_name_like'],
  website: ['email', 'phone', 'date', 'text_name_like'],
  bank_name: ['email', 'phone', 'url', 'date', 'numeric'],
  business_name: ['email', 'phone', 'url', 'date', 'postal_code', 'percentage', 'numeric'],
  dba_name: ['email', 'phone', 'url', 'date', 'postal_code', 'percentage', 'numeric'],
  business_description: ['email', 'phone', 'url', 'date', 'postal_code', 'percentage', 'numeric'],
  date_of_birth: ['email', 'phone', 'url', 'text_name_like', 'postal_code', 'percentage', 'numeric'],
  registration_date: ['email', 'phone', 'url', 'text_name_like', 'postal_code', 'percentage', 'numeric'],
  postal_code: ['email', 'phone', 'url', 'date', 'text_name_like', 'percentage'],
  ownership_percentage: ['email', 'phone', 'url', 'date', 'postal_code', 'text_name_like'],
};

export function expectedValueShapesForConcept(concept: FieldConceptKey): ValueShape[] {
  return [...(EXPECTED_SHAPES[concept] ?? [])];
}

export function detectValueShape(value: string | null | undefined): ValueShape {
  const raw = (value ?? '').trim();
  if (!raw) return 'empty';
  if (/^\[redacted-url\]$/i.test(raw)) return 'url';
  if (/^https?:\/\//i.test(raw) || /^www\./i.test(raw)) return 'url';
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(raw)) return 'email';
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(raw) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(raw)) return 'date';
  if (/^\+?\d[\d\s().-]{6,}$/.test(raw)) return 'phone';
  if (/^\d{5}(?:-\d{4})?$/.test(raw)) return 'postal_code';
  if (/^-?\d+(?:\.\d+)?%$/.test(raw)) return 'percentage';
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) return 'numeric';
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return 'numeric';
  if (/[A-Za-z]/.test(raw) && /^[A-Za-z0-9 '&.,/-]{2,}$/.test(raw)) return 'text_name_like';
  return 'unknown';
}

export function candidateValueShape(candidate: Pick<MappingCandidate, 'currentValue' | 'observedValueLikeTextNearControl' | 'currentValueShape' | 'layoutValueShape'>): ValueShape {
  if (candidate.currentValueShape) return candidate.currentValueShape;
  if (candidate.currentValue) return detectValueShape(candidate.currentValue);
  if (candidate.layoutValueShape) return candidate.layoutValueShape;
  return detectValueShape(candidate.observedValueLikeTextNearControl ?? null);
}

export function valueShapeMatchesConcept(concept: FieldConceptKey, shape: ValueShape): boolean {
  const expected = EXPECTED_SHAPES[concept];
  if (!expected || shape === 'empty' || shape === 'unknown') return false;
  return expected.includes(shape);
}

export function valueShapeConflictsWithConcept(concept: FieldConceptKey, shape: ValueShape): boolean {
  if (shape === 'empty' || shape === 'unknown') return false;
  return (REJECTED_SHAPES[concept] ?? []).includes(shape);
}

export function assessMappingCandidate(
  concept: FieldConceptKey,
  candidate: MappingCandidate,
  expectedAnchor: ExpectedMappingAnchor | null = null,
): CandidateAssessment {
  const reasons: string[] = [];
  const valueShape = candidateValueShape(candidate);
  const labelText = [candidate.resolvedLabel, candidate.layoutFieldLabel, candidate.enrichment?.suggestedDisplayName]
    .filter(Boolean)
    .join(' | ');
  const labelMatches = FIELD_CONCEPT_REGISTRY[concept].labelPatterns.some((pattern) => pattern.test(labelText));
  const strongLabel = Boolean(candidate.labelSource && STRONG_LABEL_SOURCES.has(candidate.labelSource));
  const businessSection = candidate.businessSection ?? candidate.enrichment?.suggestedBusinessSection ?? null;
  const sectionMatches =
    businessSection === FIELD_CONCEPT_REGISTRY[concept].businessSection ||
    sectionNameMatchesBusinessSection(candidate.sectionName ?? null, FIELD_CONCEPT_REGISTRY[concept].businessSection);
  const inferredType = (candidate.inferredType ?? '').toLowerCase();
  const docusignTabType = (candidate.docusignTabType ?? '').toLowerCase();
  const typeMatches =
    (EMAIL_LIKE_CONCEPTS.has(concept) && (inferredType.includes('email') || docusignTabType === 'email')) ||
    (PHONE_LIKE_CONCEPTS.has(concept) && inferredType.includes('phone')) ||
    (concept === 'bank_name' && (businessSection === 'Banking' || /bank/.test(labelText))) ||
    (concept === 'date_of_birth' && (docusignTabType === 'date' || inferredType.includes('date') || inferredType.includes('dob'))) ||
    (concept === 'registration_date' && (docusignTabType === 'date' || inferredType.includes('date'))) ||
    (![...EMAIL_LIKE_CONCEPTS, ...PHONE_LIKE_CONCEPTS, 'bank_name', 'date_of_birth', 'registration_date'].includes(concept) && labelMatches);
  const enrichmentMatches = Boolean(
    expectedAnchor?.jsonKeyPath &&
    candidate.enrichment?.jsonKeyPath &&
    candidate.enrichment.jsonKeyPath === expectedAnchor.jsonKeyPath,
  );
  const valueShapeMatches = valueShapeMatchesConcept(concept, valueShape);
  const valueShapeMismatch = valueShapeConflictsWithConcept(concept, valueShape);
  const mutatable = (candidate.controlCategory === undefined || candidate.controlCategory === null || candidate.controlCategory === 'merchant_input') &&
    candidate.visible !== false &&
    candidate.editable !== false;
  const conceptSpecificProofMatches = concept !== 'business_description' || businessDescriptionProofMatches({
    candidate,
    labelText,
    businessSection,
    valueShape,
    labelMatches,
    sectionMatches,
    typeMatches,
  });

  let trustScore = 0;
  if (strongLabel && labelMatches) trustScore += 6;
  if (labelMatches) trustScore += 2;
  if (sectionMatches) trustScore += 3;
  if (typeMatches) trustScore += 4;
  if (enrichmentMatches) trustScore += 2;
  if (valueShapeMatches) trustScore += 5;
  if (valueShapeMismatch) trustScore -= 8;
  if (!mutatable) trustScore -= 20;
  if (concept === 'business_description' && valueShapeMatches && conceptSpecificProofMatches) trustScore += 2;
  if (concept === 'business_description' && valueShapeMatches && !conceptSpecificProofMatches) trustScore -= 3;

  if (expectedAnchor?.pageIndex !== undefined && expectedAnchor.pageIndex !== null) {
    if (candidate.pageIndex === expectedAnchor.pageIndex) {
      trustScore += 2;
    } else {
      trustScore -= 4;
      reasons.push('page mismatch');
    }
  }

  if (expectedAnchor?.ordinalOnPage !== undefined && expectedAnchor.ordinalOnPage !== null && candidate.ordinalOnPage !== undefined && candidate.ordinalOnPage !== null) {
    const ordinalDistance = Math.abs(candidate.ordinalOnPage - expectedAnchor.ordinalOnPage);
    if (ordinalDistance === 0) trustScore += 2;
    else if (ordinalDistance <= 2) trustScore += 1;
    else trustScore -= Math.min(ordinalDistance, 4);
  }

  if (expectedAnchor?.tabLeft !== undefined && expectedAnchor.tabLeft !== null && candidate.tabLeft !== undefined && candidate.tabLeft !== null) {
    const distance = Math.max(
      Math.abs((candidate.tabLeft ?? 0) - (expectedAnchor.tabLeft ?? 0)),
      Math.abs((candidate.tabTop ?? 0) - (expectedAnchor.tabTop ?? 0)),
    );
    if (distance <= 5) trustScore += 2;
    else if (distance <= 60) trustScore += 1;
    else trustScore -= 2;
  }

  if (valueShapeMismatch) reasons.push(`value shape ${valueShape} conflicts with ${concept}`);
  if (!mutatable) reasons.push('candidate is not an editable merchant input');
  if (concept === 'business_description' && valueShapeMatches && !conceptSpecificProofMatches) {
    reasons.push('missing long-text, textarea, or field-local Business Description proof');
  }
  if (!sectionMatches && businessSection) reasons.push(`section ${businessSection} does not match ${FIELD_CONCEPT_REGISTRY[concept].businessSection}`);
  if (!strongLabel && !valueShapeMatches) reasons.push('insufficient label/value proof');

  return {
    candidateId: candidate.id,
    trustScore,
    valueShape,
    pageIndex: candidate.pageIndex ?? null,
    ordinalOnPage: candidate.ordinalOnPage ?? null,
    tabLeft: candidate.tabLeft ?? null,
    tabTop: candidate.tabTop ?? null,
    docusignTabType: candidate.docusignTabType ?? null,
    labelMatches,
    strongLabel,
    sectionMatches,
    typeMatches,
    enrichmentMatches,
    valueShapeMatches,
    valueShapeMismatch,
    mutatable,
    conceptSpecificProofMatches,
    reasons,
  };
}

export function selectBestMappingCandidate(input: {
  concept: FieldConceptKey;
  currentCandidateId: string | null;
  candidates: MappingCandidate[];
  expectedAnchor?: ExpectedMappingAnchor | null;
  blockedCandidateIds?: string[];
}): MappingSelectionResult {
  const blockedCandidateIds = new Set(input.blockedCandidateIds ?? []);
  const assessments = input.candidates
    .map((candidate) => assessMappingCandidate(input.concept, candidate, input.expectedAnchor ?? null))
    .sort((a, b) => b.trustScore - a.trustScore || a.candidateId.localeCompare(b.candidateId));

  const availableAssessments = assessments.filter((assessment) => !blockedCandidateIds.has(assessment.candidateId));

  const best = availableAssessments[0] ?? null;
  const current = input.currentCandidateId
    ? assessments.find((assessment) => assessment.candidateId === input.currentCandidateId) ?? null
    : null;

  if (!best) {
    return {
      selectedCandidateId: null,
      trusted: false,
      decisionReason: 'rejected_insufficient_label_proof',
      shiftReason: 'none',
      valueShape: 'unknown',
      assessments,
      explanation: `No candidates were available for ${FIELD_CONCEPT_REGISTRY[input.concept].displayName}.`,
    };
  }

  if (!best.mutatable) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: false,
      decisionReason: 'rejected_not_editable_merchant_input',
      shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
      valueShape: best.valueShape,
      assessments,
      explanation: `The best candidate for ${FIELD_CONCEPT_REGISTRY[input.concept].displayName} is not an editable merchant input, so it cannot be safely mutated.`,
    };
  }

  if (input.concept === 'date_of_birth') {
    const stakeholderContext = (input.candidates.find((candidate) => candidate.id === best.candidateId)?.businessSection ?? '') === 'Stakeholder';
    if (best.mutatable && best.typeMatches && best.valueShape === 'date' && stakeholderContext) {
      return {
        selectedCandidateId: best.candidateId,
        trusted: true,
        decisionReason: 'trusted_by_date_tab_and_value_shape',
        shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null) : 'none',
        valueShape: best.valueShape,
        assessments,
        explanation: 'Date of Birth is date-shaped, date-typed, and sits in stakeholder context.',
      };
    }
  }

  if (best.mutatable && best.strongLabel && best.labelMatches && !best.valueShapeMismatch && !hasExplicitWrongSection(best, input.candidates)) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: true,
      decisionReason: 'trusted_by_label',
      shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null) : 'none',
      valueShape: best.valueShape,
      assessments,
      explanation: 'A strong field-local label agrees with the concept without a conflicting value shape.',
    };
  }

  const anchorShapeMatches = availableAssessments.filter((assessment) =>
    assessment.mutatable &&
    assessment.valueShapeMatches &&
    !assessment.valueShapeMismatch &&
    isNearAnchorCandidate(assessment, input.expectedAnchor ?? null),
  );
  const exactAnchorShapeMatches = anchorShapeMatches.filter((assessment) =>
    isExactAnchorCandidate(assessment, input.expectedAnchor ?? null),
  );
  const exactAnchorTrustedShapeMatches = exactAnchorShapeMatches.filter((assessment) =>
    assessment.conceptSpecificProofMatches,
  );

  if (
    anchorShapeMatches.length > 1 &&
    exactAnchorShapeMatches.length === 0
  ) {
    return {
      selectedCandidateId: anchorShapeMatches[0]!.candidateId,
      trusted: false,
      decisionReason: 'rejected_ambiguous_neighbors',
      shiftReason: inferShiftReason(input.concept, current ?? anchorShapeMatches[0]!, anchorShapeMatches[0]!, input.expectedAnchor ?? null),
      valueShape: anchorShapeMatches[0]!.valueShape,
      assessments,
      explanation: 'Multiple nearby candidates match the expected value shape without a single exact anchor hit.',
    };
  }

  if (
    input.concept === 'business_description' &&
    exactAnchorShapeMatches.length === 1 &&
    exactAnchorTrustedShapeMatches.length === 0
  ) {
    return {
      selectedCandidateId: exactAnchorShapeMatches[0]!.candidateId,
      trusted: false,
      decisionReason: 'rejected_insufficient_description_proof',
      shiftReason: inferShiftReason(input.concept, current ?? exactAnchorShapeMatches[0]!, exactAnchorShapeMatches[0]!, input.expectedAnchor ?? null),
      valueShape: exactAnchorShapeMatches[0]!.valueShape,
      assessments,
      explanation: 'The Business Description candidate is text-shaped, but needs long-text, textarea, or field-local description proof before mutation.',
    };
  }

  if (exactAnchorTrustedShapeMatches.length === 1 && exactAnchorTrustedShapeMatches[0]!.candidateId === best.candidateId) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: true,
      decisionReason: 'trusted_by_anchor_and_value_shape',
      shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null) : 'none',
      valueShape: best.valueShape,
      assessments,
      explanation: 'The candidate sits on the sample anchor and its live value shape matches the expected concept.',
    };
  }

  if (best.mutatable && best.enrichmentMatches && best.sectionMatches && best.valueShapeMatches && !best.valueShapeMismatch && best.trustScore >= 8) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: true,
      decisionReason: 'trusted_by_enrichment_and_value_shape',
      shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null) : 'none',
      valueShape: best.valueShape,
      assessments,
      explanation: 'Enrichment, section, and live value shape agree strongly enough to trust this mapping.',
    };
  }

  if (current?.valueShapeMismatch) {
    return {
      selectedCandidateId: current.candidateId,
      trusted: false,
      decisionReason: 'rejected_value_shape_mismatch',
      shiftReason: best.candidateId !== current.candidateId
        ? inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null)
        : inferShiftReason(input.concept, current, current, input.expectedAnchor ?? null),
      valueShape: current.valueShape,
      assessments,
      explanation: `The current mapped candidate has a ${current.valueShape} value shape that conflicts with ${FIELD_CONCEPT_REGISTRY[input.concept].displayName}; no unclaimed exact-anchor candidate with the expected value shape was trusted instead.`,
    };
  }

  const second = availableAssessments[1] ?? null;
  if (current && best.candidateId !== current.candidateId && best.trustScore >= current.trustScore + 3) {
    return {
      selectedCandidateId: current.candidateId,
      trusted: false,
      decisionReason: 'rejected_neighbor_better_match',
      shiftReason: inferShiftReason(input.concept, current, best, input.expectedAnchor ?? null),
      valueShape: current.valueShape,
      assessments,
      explanation: `${best.candidateId} is a better nearby match than the current mapped field for ${FIELD_CONCEPT_REGISTRY[input.concept].displayName}.`,
    };
  }

  if (best.valueShapeMismatch) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: false,
      decisionReason: 'rejected_value_shape_mismatch',
      shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
      valueShape: best.valueShape,
      assessments,
      explanation: `The best candidate still has a ${best.valueShape} value shape that conflicts with ${FIELD_CONCEPT_REGISTRY[input.concept].displayName}.`,
    };
  }

  if (!best.sectionMatches && (input.candidates.find((candidate) => candidate.id === best.candidateId)?.businessSection ?? null)) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: false,
      decisionReason: 'rejected_section_mismatch',
      shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
      valueShape: best.valueShape,
      assessments,
      explanation: `The best candidate sits in the wrong business section for ${FIELD_CONCEPT_REGISTRY[input.concept].displayName}.`,
    };
  }

  if (second && best.trustScore - second.trustScore <= 1) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: false,
      decisionReason: 'rejected_ambiguous_neighbors',
      shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
      valueShape: best.valueShape,
      assessments,
      explanation: 'Multiple nearby candidates remain too close to trust a mutating mapping decision.',
    };
  }

  if ((input.expectedAnchor?.ordinalOnPage ?? null) !== null && best.ordinalOnPage !== undefined && best.ordinalOnPage !== null) {
    const expectedOrdinal = input.expectedAnchor?.ordinalOnPage ?? null;
    if (expectedOrdinal !== null && Math.abs(best.ordinalOnPage - expectedOrdinal) >= 1) {
      return {
        selectedCandidateId: best.candidateId,
        trusted: false,
        decisionReason: 'rejected_stale_enrichment',
        shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
        valueShape: best.valueShape,
        assessments,
        explanation: 'The enrichment anchor appears stale relative to the live neighbor window.',
      };
    }
  }

  return {
    selectedCandidateId: best.candidateId,
    trusted: false,
    decisionReason: 'rejected_insufficient_label_proof',
    shiftReason: inferShiftReason(input.concept, current ?? best, best, input.expectedAnchor ?? null),
    valueShape: best.valueShape,
    assessments,
    explanation: 'The candidate does not yet have enough converging proof to trust mutation.',
  };
}

function businessDescriptionProofMatches(input: {
  candidate: MappingCandidate;
  labelText: string;
  businessSection: string | null;
  valueShape: ValueShape;
  labelMatches: boolean;
  sectionMatches: boolean;
  typeMatches: boolean;
}): boolean {
  const descriptorText = [
    input.labelText,
    input.candidate.sectionName,
    input.businessSection,
    input.candidate.layoutSectionHeader,
    input.candidate.layoutFieldLabel,
    input.candidate.enrichment?.jsonKeyPath,
  ].filter(Boolean).join(' ');
  const hasDescriptionText = /business\s*description|nature\s+of\s+business|description|describe/i.test(descriptorText);
  const hasGeneralLayoutSection = /\bgeneral\b/i.test(input.candidate.layoutSectionHeader ?? '');
  const tabType = (input.candidate.docusignTabType ?? '').toLowerCase();
  const inferredType = (input.candidate.inferredType ?? '').toLowerCase();
  const currentText = (input.candidate.currentValue ?? input.candidate.observedValueLikeTextNearControl ?? '').trim();
  const longText = input.valueShape === 'text_name_like' && currentText.length >= 40;

  return (hasDescriptionText && (input.sectionMatches || hasGeneralLayoutSection)) ||
    tabType.includes('textarea') ||
    inferredType.includes('description') ||
    (input.sectionMatches && input.typeMatches && input.labelMatches) ||
    (input.sectionMatches && longText);
}

function hasExplicitWrongSection(
  assessment: CandidateAssessment,
  candidates: MappingCandidate[],
): boolean {
  const candidate = candidates.find((entry) => entry.id === assessment.candidateId) ?? null;
  const section = candidate?.businessSection ?? candidate?.enrichment?.suggestedBusinessSection ?? null;
  return Boolean(section && !assessment.sectionMatches);
}

export function resolveMappingClaims(requests: MappingClaimRequest[]): MappingClaimResolution[] {
  const blockedByConcept = new Map<FieldConceptKey, Set<string>>();
  const selections = new Map<FieldConceptKey, MappingSelectionResult>();

  const getBlocked = (concept: FieldConceptKey): Set<string> => {
    const existing = blockedByConcept.get(concept);
    if (existing) return existing;
    const created = new Set<string>();
    blockedByConcept.set(concept, created);
    return created;
  };

  for (let pass = 0; pass < 4; pass++) {
    for (const request of requests) {
      selections.set(
        request.concept,
        selectBestMappingCandidate({
          ...request,
          blockedCandidateIds: Array.from(getBlocked(request.concept)),
        }),
      );
    }

    const claims = new Map<string, MappingClaimRequest[]>();
    for (const request of requests) {
      const selection = selections.get(request.concept)!;
      if (!selection.trusted || !selection.selectedCandidateId) continue;
      const arr = claims.get(selection.selectedCandidateId) ?? [];
      arr.push(request);
      claims.set(selection.selectedCandidateId, arr);
    }

    let changed = false;
    for (const [candidateId, conflictingRequests] of claims) {
      if (conflictingRequests.length <= 1) continue;

      const ranked = conflictingRequests
        .map((request) => ({
          request,
          selection: selections.get(request.concept)!,
          priority: claimPriority(selections.get(request.concept)!),
        }))
        .sort((a, b) => b.priority - a.priority || a.request.concept.localeCompare(b.request.concept));

      const winner = ranked[0]!;
      const ambiguousTop = ranked[1] && ranked[1]!.priority === winner.priority;
      for (const entry of ranked) {
        if (!ambiguousTop && entry.request.concept === winner.request.concept) continue;
        const blocked = getBlocked(entry.request.concept);
        if (!blocked.has(candidateId)) {
          blocked.add(candidateId);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return requests.map((request) => ({
    concept: request.concept,
    blockedCandidateIds: Array.from(getBlocked(request.concept)),
    selection: selections.get(request.concept)!,
  }));
}

function inferShiftReason(
  concept: FieldConceptKey,
  current: Pick<CandidateAssessment, 'candidateId'> & Partial<MappingCandidate>,
  best: Pick<CandidateAssessment, 'candidateId'> & Partial<MappingCandidate>,
  expectedAnchor: ExpectedMappingAnchor | null,
): MappingShiftReason {
  if (
    expectedAnchor?.pageIndex === 1 &&
    current.candidateId !== best.candidateId &&
    isPage1AnchorAligned(best, expectedAnchor)
  ) {
    if (concept === 'website') return 'page1_anchor_drift_after_website';
    if (concept === 'bank_name') return 'stale_enrichment_after_anchor_mismatch';
    if (concept === 'email' || concept === 'phone') return 'shifted_contact_block_candidate';
  }
  if (expectedAnchor?.pageIndex !== null && expectedAnchor?.pageIndex !== undefined) {
    if (best.pageIndex !== undefined && best.pageIndex !== null && best.pageIndex !== expectedAnchor.pageIndex) {
      return 'page_mismatch';
    }
  }
  if (expectedAnchor?.docusignFieldFamily && best.docusignTabType && expectedAnchor.docusignFieldFamily !== best.docusignTabType) {
    return 'tabType_mismatch';
  }
  if (
    expectedAnchor?.ordinalOnPage !== null &&
    expectedAnchor?.ordinalOnPage !== undefined &&
    best.ordinalOnPage !== undefined &&
    best.ordinalOnPage !== null &&
    best.ordinalOnPage !== expectedAnchor.ordinalOnPage
  ) {
    return 'ordinal_shift';
  }
  if (
    expectedAnchor?.tabLeft !== null &&
    expectedAnchor?.tabLeft !== undefined &&
    expectedAnchor?.tabTop !== null &&
    expectedAnchor?.tabTop !== undefined &&
    best.tabLeft !== undefined &&
    best.tabLeft !== null &&
    best.tabTop !== undefined &&
    best.tabTop !== null
  ) {
    const deltaX = Math.abs(best.tabLeft - expectedAnchor.tabLeft);
    const deltaY = Math.abs(best.tabTop - expectedAnchor.tabTop);
    if (deltaX > 100 || deltaY > 100) return 'sample_live_template_drift';
    if (deltaX > 20 || deltaY > 20) return 'coordinate_scale_mismatch';
  }
  if (current.candidateId !== best.candidateId && expectedAnchor?.pageIndex === 1) {
    return 'no_unclaimed_neighbor_with_expected_shape';
  }
  if (current.candidateId !== best.candidateId) return 'enrichment_bundle_stale';
  return 'none';
}

function isNearAnchorCandidate(
  assessment: Pick<CandidateAssessment, 'pageIndex' | 'ordinalOnPage' | 'tabLeft' | 'tabTop'>,
  expectedAnchor: ExpectedMappingAnchor | null,
): boolean {
  if (!expectedAnchor) return false;
  if (expectedAnchor.pageIndex !== null && expectedAnchor.pageIndex !== undefined) {
    if (assessment.pageIndex === null || assessment.pageIndex !== expectedAnchor.pageIndex) return false;
  }

  const coordinateDistance = anchorCoordinateDistance(assessment, expectedAnchor);
  if (coordinateDistance !== null && coordinateDistance <= 20) return true;

  if (
    expectedAnchor.ordinalOnPage !== null &&
    expectedAnchor.ordinalOnPage !== undefined &&
    assessment.ordinalOnPage !== null &&
    assessment.ordinalOnPage !== undefined
  ) {
    return Math.abs(assessment.ordinalOnPage - expectedAnchor.ordinalOnPage) <= 2;
  }

  return false;
}

function isExactAnchorCandidate(
  assessment: Pick<CandidateAssessment, 'pageIndex' | 'tabLeft' | 'tabTop'>,
  expectedAnchor: ExpectedMappingAnchor | null,
): boolean {
  const coordinateDistance = anchorCoordinateDistance(assessment, expectedAnchor);
  return coordinateDistance !== null && coordinateDistance <= 5;
}

function anchorCoordinateDistance(
  assessment: Pick<CandidateAssessment, 'tabLeft' | 'tabTop'>,
  expectedAnchor: ExpectedMappingAnchor | null,
): number | null {
  if (!expectedAnchor) return null;
  if (
    expectedAnchor.tabLeft === null ||
    expectedAnchor.tabLeft === undefined ||
    expectedAnchor.tabTop === null ||
    expectedAnchor.tabTop === undefined ||
    assessment.tabLeft === null ||
    assessment.tabLeft === undefined ||
    assessment.tabTop === null ||
    assessment.tabTop === undefined
  ) {
    return null;
  }
  return Math.max(
    Math.abs(assessment.tabLeft - expectedAnchor.tabLeft),
    Math.abs(assessment.tabTop - expectedAnchor.tabTop),
  );
}

function isPage1AnchorAligned(
  assessment: Pick<CandidateAssessment, 'pageIndex' | 'tabLeft' | 'tabTop'>,
  expectedAnchor: ExpectedMappingAnchor | null,
): boolean {
  return expectedAnchor?.pageIndex === 1 && isExactAnchorCandidate(assessment, expectedAnchor);
}

function claimPriority(selection: MappingSelectionResult): number {
  if (!selection.selectedCandidateId) return Number.NEGATIVE_INFINITY;
  const assessment = selection.assessments.find((entry) => entry.candidateId === selection.selectedCandidateId);
  if (!assessment) return Number.NEGATIVE_INFINITY;
  let priority = assessment.trustScore;
  if (assessment.strongLabel && assessment.labelMatches) priority += 20;
  if (assessment.enrichmentMatches) priority += 15;
  if (assessment.valueShapeMatches) priority += 10;
  if (selection.decisionReason === 'trusted_by_label') priority += 8;
  if (selection.decisionReason === 'trusted_by_enrichment_and_value_shape') priority += 6;
  if (selection.decisionReason === 'trusted_by_anchor_and_value_shape') priority += 4;
  return priority;
}

function sectionNameMatchesBusinessSection(sectionName: string | null, businessSection: string): boolean {
  if (!sectionName) return false;
  const tokens = SECTION_TOKENS[businessSection] ?? [];
  if (tokens.length === 0) return false;
  const lower = sectionName.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

const SECTION_TOKENS: Record<string, string[]> = {
  'Business Details': ['business', 'merchant', 'location'],
  Address: ['address', 'mailing', 'legal'],
  Contact: ['contact', 'email', 'phone'],
  Banking: ['bank', 'routing', 'account'],
  'Processing & Financials': ['processing', 'financial', 'volume', 'ticket', 'revenue'],
  Stakeholder: ['stakeholder', 'owner', 'principal', 'signer'],
  Attachments: ['attachment', 'upload', 'document'],
  'Agreements / Signature': ['agreement', 'signature', 'sign'],
  Fees: ['fee'],
};