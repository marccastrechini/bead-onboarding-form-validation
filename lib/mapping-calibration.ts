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
  | 'trusted_by_date_tab_and_value_shape'
  | 'rejected_value_shape_mismatch'
  | 'rejected_section_mismatch'
  | 'rejected_neighbor_better_match'
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
  | 'concept_alias_mismatch';

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
  observedValueLikeTextNearControl?: string | null;
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

const STRONG_LABEL_SOURCES = new Set([
  'aria-label',
  'aria-labelledby',
  'label-for',
  'wrapping-label',
  'title',
  'enrichment-guid',
]);

const EXPECTED_SHAPES: Partial<Record<FieldConceptKey, ValueShape[]>> = {
  email: ['email'],
  phone: ['phone'],
  website: ['url'],
  bank_name: ['text_name_like'],
  business_name: ['text_name_like'],
  dba_name: ['text_name_like'],
  date_of_birth: ['date'],
  registration_date: ['date'],
  postal_code: ['postal_code', 'numeric'],
  ownership_percentage: ['percentage', 'numeric'],
};

const REJECTED_SHAPES: Partial<Record<FieldConceptKey, ValueShape[]>> = {
  email: ['phone', 'url', 'date', 'text_name_like'],
  phone: ['email', 'url', 'date', 'text_name_like'],
  website: ['email', 'phone', 'date', 'text_name_like'],
  bank_name: ['email', 'phone', 'url', 'date'],
  date_of_birth: ['email', 'phone', 'url', 'text_name_like'],
};

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
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return 'numeric';
  if (/[A-Za-z]/.test(raw) && /^[A-Za-z0-9 '&.,/-]{2,}$/.test(raw)) return 'text_name_like';
  return 'unknown';
}

export function candidateValueShape(candidate: Pick<MappingCandidate, 'currentValue' | 'observedValueLikeTextNearControl'>): ValueShape {
  return detectValueShape(candidate.currentValue ?? candidate.observedValueLikeTextNearControl ?? null);
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
  const labelText = [candidate.resolvedLabel, candidate.enrichment?.suggestedDisplayName]
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
    (concept === 'email' && (inferredType.includes('email') || docusignTabType === 'email')) ||
    (concept === 'phone' && inferredType.includes('phone')) ||
    (concept === 'bank_name' && (businessSection === 'Banking' || /bank/.test(labelText))) ||
    (concept === 'date_of_birth' && (docusignTabType === 'date' || inferredType.includes('date') || inferredType.includes('dob'))) ||
    (concept === 'registration_date' && (docusignTabType === 'date' || inferredType.includes('date'))) ||
    (!['email', 'phone', 'bank_name', 'date_of_birth', 'registration_date'].includes(concept) && labelMatches);
  const enrichmentMatches = Boolean(
    expectedAnchor?.jsonKeyPath &&
    candidate.enrichment?.jsonKeyPath &&
    candidate.enrichment.jsonKeyPath === expectedAnchor.jsonKeyPath,
  );
  const valueShapeMatches = valueShapeMatchesConcept(concept, valueShape);
  const valueShapeMismatch = valueShapeConflictsWithConcept(concept, valueShape);

  let trustScore = 0;
  if (strongLabel && labelMatches) trustScore += 6;
  if (labelMatches) trustScore += 2;
  if (sectionMatches) trustScore += 3;
  if (typeMatches) trustScore += 4;
  if (enrichmentMatches) trustScore += 2;
  if (valueShapeMatches) trustScore += 5;
  if (valueShapeMismatch) trustScore -= 8;

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
    reasons,
  };
}

export function selectBestMappingCandidate(input: {
  concept: FieldConceptKey;
  currentCandidateId: string | null;
  candidates: MappingCandidate[];
  expectedAnchor?: ExpectedMappingAnchor | null;
}): MappingSelectionResult {
  const assessments = input.candidates
    .map((candidate) => assessMappingCandidate(input.concept, candidate, input.expectedAnchor ?? null))
    .sort((a, b) => b.trustScore - a.trustScore || a.candidateId.localeCompare(b.candidateId));

  const best = assessments[0] ?? null;
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

  if (input.concept === 'date_of_birth') {
    const stakeholderContext = (input.candidates.find((candidate) => candidate.id === best.candidateId)?.businessSection ?? '') === 'Stakeholder';
    if (best.typeMatches && best.valueShape === 'date' && stakeholderContext) {
      return {
        selectedCandidateId: best.candidateId,
        trusted: true,
        decisionReason: 'trusted_by_date_tab_and_value_shape',
        shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(current, best, input.expectedAnchor ?? null) : 'none',
        valueShape: best.valueShape,
        assessments,
        explanation: 'Date of Birth is date-shaped, date-typed, and sits in stakeholder context.',
      };
    }
  }

  if (best.strongLabel && best.labelMatches && !best.valueShapeMismatch) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: true,
      decisionReason: 'trusted_by_label',
      shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(current, best, input.expectedAnchor ?? null) : 'none',
      valueShape: best.valueShape,
      assessments,
      explanation: 'A strong field-local label agrees with the concept without a conflicting value shape.',
    };
  }

  if (best.enrichmentMatches && best.sectionMatches && best.valueShapeMatches && !best.valueShapeMismatch && best.trustScore >= 8) {
    return {
      selectedCandidateId: best.candidateId,
      trusted: true,
      decisionReason: 'trusted_by_enrichment_and_value_shape',
      shiftReason: current && current.candidateId !== best.candidateId ? inferShiftReason(current, best, input.expectedAnchor ?? null) : 'none',
      valueShape: best.valueShape,
      assessments,
      explanation: 'Enrichment, section, and live value shape agree strongly enough to trust this mapping.',
    };
  }

  const second = assessments[1] ?? null;
  if (current && best.candidateId !== current.candidateId && best.trustScore >= current.trustScore + 3) {
    return {
      selectedCandidateId: current.candidateId,
      trusted: false,
      decisionReason: 'rejected_neighbor_better_match',
      shiftReason: inferShiftReason(current, best, input.expectedAnchor ?? null),
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
      shiftReason: inferShiftReason(current ?? best, best, input.expectedAnchor ?? null),
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
      shiftReason: inferShiftReason(current ?? best, best, input.expectedAnchor ?? null),
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
      shiftReason: inferShiftReason(current ?? best, best, input.expectedAnchor ?? null),
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
        shiftReason: inferShiftReason(current ?? best, best, input.expectedAnchor ?? null),
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
    shiftReason: inferShiftReason(current ?? best, best, input.expectedAnchor ?? null),
    valueShape: best.valueShape,
    assessments,
    explanation: 'The candidate does not yet have enough converging proof to trust mutation.',
  };
}

function inferShiftReason(
  current: Pick<CandidateAssessment, 'candidateId'> & Partial<MappingCandidate>,
  best: Pick<CandidateAssessment, 'candidateId'> & Partial<MappingCandidate>,
  expectedAnchor: ExpectedMappingAnchor | null,
): MappingShiftReason {
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
  if (current.candidateId !== best.candidateId) return 'enrichment_bundle_stale';
  return 'none';
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