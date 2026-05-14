import { discoverFields, type DiscoveredField } from './field-discovery';
import {
  buildPhysicalOperatingAddressDomProbeReport,
  capturePhysicalOperatingAddressDomProbeSnapshot,
  guardedPhysicalOperatingAddressDomProbeEnabled,
  type PhysicalOperatingAddressDomProbeReport,
} from './physical-address-dom-probe';
import {
  capturePhysicalOperatingAddressPostToggleStructure,
  guardedPhysicalOperatingAddressPostToggleCaptureEnabled,
  type PhysicalOperatingAddressPostToggleCaptureReport,
} from './physical-address-post-toggle-capture';
import type { FrameHost } from './signer-helpers';

export const SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV = 'SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS';

type GuardedToggleField = Pick<
  DiscoveredField,
  'index' | 'kind' | 'type' | 'controlCategory' | 'visible' | 'editable' | 'resolvedLabel' | 'label' | 'sectionName' | 'rawCandidateLabels' | 'groupName' | 'idOrNameKey' | 'inferredType'
>;

export interface GuardedPhysicalOperatingAddressDiscoveryResult {
  fields: DiscoveredField[];
  diagnostics: string[];
  expanded: boolean;
  probeReport: PhysicalOperatingAddressDomProbeReport | null;
  captureReport: PhysicalOperatingAddressPostToggleCaptureReport | null;
}

export interface GuardedPhysicalOperatingAddressDiscoveryOptions {
  stopAfterCaptureAttempt?: boolean;
}

const ADDRESS_OPTIONS_RE = /\baddressoptions\b/i;
const OPERATING_ADDRESS_RE = /\bisoperatingaddress\b|\boperating\s+address\b/i;
const BUSINESS_PHYSICAL_ADDRESS_RE = /\bbusiness\s+physical\s+address\b/i;
const LEGAL_ADDRESS_RE = /\bislegaladdress\b|\blegal\s+address\b/i;
const VIRTUAL_ADDRESS_RE = /\bisvirtualaddress\b|\bvirtual\s+address\b/i;
const MAILING_ADDRESS_RE = /\bismailingaddress\b|\bbusiness\s+mailing\s+address\b|\bmailing\s+address\b/i;
const PHYSICAL_ADDRESS_RE = /\bphysical\s+operating\s+address\b/i;
const TOGGLE_INVENTORY_CANDIDATE_LIMIT = 6;
const TOGGLE_INVENTORY_FRAGMENT_LIMIT = 4;
const TOGGLE_FALLBACK_CUE_LIMIT = 4;

const SAFE_TOGGLE_FRAGMENT_PATTERNS = [
  { label: 'Physical Operating Address', pattern: /\bphysical\s+operating\s+address\b/i },
  { label: 'Business Physical Address', pattern: /\bbusiness\s+physical\s+address\b/i },
  { label: 'Operating Address', pattern: /\boperating\s+address\b/i },
  { label: 'Business Mailing Address', pattern: /\bbusiness\s+mailing\s+address\b/i },
  { label: 'Mailing Address', pattern: /\bmailing\s+address\b/i },
  { label: 'Legal Address', pattern: /\blegal\s+address\b/i },
  { label: 'Virtual Address', pattern: /\bvirtual\s+address\b/i },
  { label: 'addressOptions', pattern: /\baddressoptions\b/i },
  { label: 'isOperatingAddress', pattern: /\bisoperatingaddress\b/i },
  { label: 'isMailingAddress', pattern: /\bismailingaddress\b/i },
  { label: 'isLegalAddress', pattern: /\bislegaladdress\b/i },
  { label: 'isVirtualAddress', pattern: /\bisvirtualaddress\b/i },
  { label: 'Required', pattern: /\brequired\b/i },
  { label: 'Optional', pattern: /\boptional\b/i },
  { label: 'Same', pattern: /\bsame\b/i },
  { label: 'Different', pattern: /\bdifferent\b/i },
] as const;

type ToggleCueFragment = {
  source: string;
  value: string;
};

type PhysicalOperatingAddressToggleMatchAnalysis = {
  eligibleRadio: boolean;
  addressOptionPattern: boolean;
  operatingAddressPattern: boolean;
  mailingAddressPattern: boolean;
  legalAddressPattern: boolean;
  virtualAddressPattern: boolean;
  selectedByMatcher: boolean;
  excludedReasons: string[];
};

type PhysicalOperatingAddressCuePatternMatches = {
  physicalOperatingAddress: boolean;
  businessPhysicalAddress: boolean;
  operatingAddress: boolean;
  mailingAddress: boolean;
  legalAddress: boolean;
  virtualAddress: boolean;
};

type PhysicalOperatingAddressToggleFallbackAnalysis = {
  visibleRadioLike: boolean;
  eligibleRadioLike: boolean;
  explicitPhysicalCue: boolean;
  selectedByFallback: boolean;
  cueMatches: PhysicalOperatingAddressCuePatternMatches;
  excludedReasons: string[];
};

type PhysicalOperatingAddressToggleInventoryEntry = {
  slot: number;
  fieldIndex: number | null;
  fieldKey: string | null;
  inputKind: string;
  controlCategory: string;
  visible: boolean;
  editable: boolean;
  inferredType: string;
  resolvedLabelFragments: string[];
  groupLabelFragments: string[];
  nearbyLabelFragments: Array<{ source: string; text: string }>;
  matches: {
    addressOptionPattern: boolean;
    operatingAddressPattern: boolean;
    mailingAddressPattern: boolean;
    legalAddressPattern: boolean;
    virtualAddressPattern: boolean;
  };
  selectedByMatcher: boolean;
  excludedReasons: string[];
};

type PhysicalOperatingAddressToggleInventory = {
  candidateCount: number;
  eligibleCandidateCount: number;
  matchingCandidateCount: number;
  displayedCandidateCount: number;
  truncatedCandidateCount: number;
  entries: PhysicalOperatingAddressToggleInventoryEntry[];
};

type PhysicalOperatingAddressToggleFallbackInventoryEntry = {
  slot: number;
  fieldIndex: number | null;
  fieldKey: string | null;
  inputKind: string;
  role: string | null;
  inputType: string | null;
  controlCategory: string;
  visible: boolean;
  editable: boolean;
  inferredType: string;
  resolvedLabelFragments: string[];
  groupLabelFragments: string[];
  nearbyLabelFragments: Array<{ source: string; text: string }>;
  nearbyCueMatches: PhysicalOperatingAddressCuePatternMatches;
  selectedByFallback: boolean;
  excludedReasons: string[];
};

type PhysicalOperatingAddressToggleFallbackCueEntry = {
  slot: number;
  fieldIndex: number | null;
  inputKind: string;
  controlCategory: string;
  labelFragments: string[];
  nearbyLabelFragments: Array<{ source: string; text: string }>;
  cueMatches: PhysicalOperatingAddressCuePatternMatches;
};

type PhysicalOperatingAddressToggleFallbackInventory = {
  visibleRadioInputCount: number;
  visibleRoleRadioCount: number;
  visibleRadioLikeCandidateCount: number;
  eligibleFallbackCandidateCount: number;
  matchingFallbackCandidateCount: number;
  displayedCandidateCount: number;
  truncatedCandidateCount: number;
  cueObservationCount: number;
  displayedCueObservationCount: number;
  truncatedCueObservationCount: number;
  entries: PhysicalOperatingAddressToggleFallbackInventoryEntry[];
  cueObservations: PhysicalOperatingAddressToggleFallbackCueEntry[];
};

type PhysicalOperatingAddressToggleSelection<T extends GuardedToggleField> = {
  selectedField: T | null;
  selectionMode: 'primary' | 'fallback' | null;
  primaryInventory: PhysicalOperatingAddressToggleInventory;
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory | null;
};

function normalizeText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function toMatchableText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_>]+/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueToggleCueFragments(entries: ToggleCueFragment[]): ToggleCueFragment[] {
  const unique: ToggleCueFragment[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const normalized = normalizeText(entry.value);
    if (!normalized) continue;

    const key = `${entry.source}:${normalized}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push({ source: entry.source, value: normalized });
  }

  return unique;
}

function collectToggleCueFragments(field: GuardedToggleField): ToggleCueFragment[] {
  return uniqueToggleCueFragments([
    { source: 'section', value: field.sectionName ?? '' },
    { source: 'label', value: field.label ?? '' },
    { source: 'resolved-label', value: field.resolvedLabel ?? '' },
    { source: 'field-key', value: field.idOrNameKey ?? '' },
    { source: 'group', value: field.groupName ?? '' },
    ...field.rawCandidateLabels.map((candidate) => ({ source: candidate.source, value: candidate.value })),
  ]);
}

function cueFragmentsMention(entries: ToggleCueFragment[], pattern: RegExp): boolean {
  return entries.some((entry) => pattern.test(toMatchableText(entry.value)));
}

function buildPhysicalOperatingAddressCuePatternMatches(
  cueFragments: ToggleCueFragment[],
): PhysicalOperatingAddressCuePatternMatches {
  return {
    physicalOperatingAddress: cueFragmentsMention(cueFragments, PHYSICAL_ADDRESS_RE),
    businessPhysicalAddress: cueFragmentsMention(cueFragments, BUSINESS_PHYSICAL_ADDRESS_RE),
    operatingAddress: cueFragmentsMention(cueFragments, OPERATING_ADDRESS_RE),
    mailingAddress: cueFragmentsMention(cueFragments, MAILING_ADDRESS_RE),
    legalAddress: cueFragmentsMention(cueFragments, LEGAL_ADDRESS_RE),
    virtualAddress: cueFragmentsMention(cueFragments, VIRTUAL_ADDRESS_RE),
  };
}

function hasAnyPhysicalAddressCueMatch(matches: PhysicalOperatingAddressCuePatternMatches): boolean {
  return matches.physicalOperatingAddress
    || matches.businessPhysicalAddress
    || matches.operatingAddress
    || matches.mailingAddress
    || matches.legalAddress
    || matches.virtualAddress;
}

function sanitizeToggleDiagnosticFragment(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  if (/https?:\/\/\S+/i.test(normalized)) return '[redacted:url]';
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized)) return '[redacted:email]';
  if (/\b(?:[A-F0-9]{16,}|[A-Z0-9_-]{24,})\b/i.test(normalized)) return '[redacted:token]';

  const safeLabels = SAFE_TOGGLE_FRAGMENT_PATTERNS
    .filter((entry) => entry.pattern.test(toMatchableText(normalized)))
    .map((entry) => entry.label);

  if (safeLabels.length === 0) return '[redacted:text]';
  return Array.from(new Set(safeLabels)).join(' | ');
}

function collectSanitizedToggleFragments(entries: ToggleCueFragment[], limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT): string[] {
  const fragments: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const sanitized = sanitizeToggleDiagnosticFragment(entry.value);
    if (!sanitized || seen.has(sanitized)) continue;

    seen.add(sanitized);
    fragments.push(sanitized);
    if (fragments.length >= limit) break;
  }

  return fragments;
}

function collectSanitizedToggleNearbyFragments(
  entries: ToggleCueFragment[],
  limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT,
): Array<{ source: string; text: string }> {
  const fragments: Array<{ source: string; text: string }> = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const sanitized = sanitizeToggleDiagnosticFragment(entry.value);
    if (!sanitized) continue;

    const key = `${entry.source}:${sanitized}`;
    if (seen.has(key)) continue;

    seen.add(key);
    fragments.push({ source: entry.source, text: sanitized });
    if (fragments.length >= limit) break;
  }

  return fragments;
}

function fieldTextFragments(field: GuardedToggleField): string[] {
  const fragments = [
    field.sectionName,
    field.label,
    field.resolvedLabel,
    ...field.rawCandidateLabels.map((candidate) => candidate.value),
  ]
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(fragments));
}

function fieldResolvedFragments(field: GuardedToggleField): string[] {
  const fragments = [
    field.sectionName,
    field.label,
    field.resolvedLabel,
    ...field.rawCandidateLabels
      .filter((candidate) => candidate.source === 'section+row' || candidate.source === 'preceding-text')
      .map((candidate) => candidate.value),
  ]
    .map(normalizeText)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(fragments));
}

function buildPhysicalOperatingAddressToggleMatchAnalysis(
  field: GuardedToggleField,
): PhysicalOperatingAddressToggleMatchAnalysis {
  const cueFragments = collectToggleCueFragments(field);
  const cueMatches = buildPhysicalOperatingAddressCuePatternMatches(cueFragments);
  const eligibleRadio = isEligibleAddressOptionRadio(field);
  const addressOptionPattern = cueFragmentsMention(cueFragments, ADDRESS_OPTIONS_RE);
  const operatingAddressPattern = cueMatches.operatingAddress
    || cueMatches.physicalOperatingAddress
    || cueMatches.businessPhysicalAddress;
  const mailingAddressPattern = cueMatches.mailingAddress;
  const legalAddressPattern = cueMatches.legalAddress;
  const virtualAddressPattern = cueMatches.virtualAddress;
  const selectedByMatcher = eligibleRadio
    && operatingAddressPattern
    && !mailingAddressPattern
    && !legalAddressPattern
    && !virtualAddressPattern;

  const excludedReasons: string[] = [];
  if (field.kind !== 'radio') excludedReasons.push('not-radio');
  if (field.controlCategory !== 'merchant_input') excludedReasons.push('not-merchant-input');
  if (!field.visible) excludedReasons.push('not-visible');
  if (!field.editable) excludedReasons.push('not-editable');
  if (field.inferredType.type !== 'address_option') excludedReasons.push(`inferred-type:${field.inferredType.type}`);
  if (!operatingAddressPattern) excludedReasons.push('operating-address-cue-missing');
  if (mailingAddressPattern) excludedReasons.push('matched-mailing-address');
  if (legalAddressPattern) excludedReasons.push('matched-legal-address');
  if (virtualAddressPattern) excludedReasons.push('matched-virtual-address');

  return {
    eligibleRadio,
    addressOptionPattern,
    operatingAddressPattern,
    mailingAddressPattern,
    legalAddressPattern,
    virtualAddressPattern,
    selectedByMatcher,
    excludedReasons,
  };
}

function buildPhysicalOperatingAddressToggleFallbackAnalysis(
  field: GuardedToggleField,
): PhysicalOperatingAddressToggleFallbackAnalysis {
  const cueFragments = collectToggleCueFragments(field);
  const cueMatches = buildPhysicalOperatingAddressCuePatternMatches(cueFragments);
  const visibleRadioLike = field.kind === 'radio' && field.visible;
  const eligibleRadioLike = visibleRadioLike
    && field.controlCategory === 'merchant_input'
    && field.editable;
  const explicitPhysicalCue = cueMatches.physicalOperatingAddress || cueMatches.businessPhysicalAddress;
  const selectedByFallback = eligibleRadioLike
    && explicitPhysicalCue
    && !cueMatches.mailingAddress
    && !cueMatches.legalAddress
    && !cueMatches.virtualAddress;

  const excludedReasons: string[] = [];
  if (field.kind !== 'radio') excludedReasons.push('not-radio-like');
  if (!field.visible) excludedReasons.push('not-visible');
  if (field.controlCategory !== 'merchant_input') excludedReasons.push('not-merchant-input');
  if (!field.editable) excludedReasons.push('not-editable');
  if (!explicitPhysicalCue) excludedReasons.push('explicit-physical-cue-missing');
  if (cueMatches.mailingAddress) excludedReasons.push('matched-mailing-address');
  if (cueMatches.legalAddress) excludedReasons.push('matched-legal-address');
  if (cueMatches.virtualAddress) excludedReasons.push('matched-virtual-address');

  return {
    visibleRadioLike,
    eligibleRadioLike,
    explicitPhysicalCue,
    selectedByFallback,
    cueMatches,
    excludedReasons,
  };
}

function isRelevantPhysicalOperatingAddressToggleCandidate(
  field: GuardedToggleField,
  analysis: PhysicalOperatingAddressToggleMatchAnalysis,
): boolean {
  return field.kind === 'radio'
    && (
      field.inferredType.type === 'address_option'
      || analysis.addressOptionPattern
      || analysis.operatingAddressPattern
      || analysis.mailingAddressPattern
      || analysis.legalAddressPattern
      || analysis.virtualAddressPattern
    );
}

function buildPhysicalOperatingAddressToggleInventory(
  fields: GuardedToggleField[],
): PhysicalOperatingAddressToggleInventory {
  const candidates = fields
    .map((field) => ({ field, analysis: buildPhysicalOperatingAddressToggleMatchAnalysis(field) }))
    .filter(({ field, analysis }) => isRelevantPhysicalOperatingAddressToggleCandidate(field, analysis));

  const entries = candidates
    .slice(0, TOGGLE_INVENTORY_CANDIDATE_LIMIT)
    .map(({ field, analysis }, index): PhysicalOperatingAddressToggleInventoryEntry => ({
      slot: index + 1,
      fieldIndex: typeof field.index === 'number' ? field.index : null,
      fieldKey: sanitizeToggleDiagnosticFragment(field.idOrNameKey),
      inputKind: field.kind,
      controlCategory: field.controlCategory,
      visible: field.visible,
      editable: field.editable,
      inferredType: field.inferredType.type,
      resolvedLabelFragments: collectSanitizedToggleFragments(uniqueToggleCueFragments([
        { source: 'label', value: field.label ?? '' },
        { source: 'resolved-label', value: field.resolvedLabel ?? '' },
      ]), 2),
      groupLabelFragments: collectSanitizedToggleFragments(uniqueToggleCueFragments([
        { source: 'group', value: field.groupName ?? '' },
      ]), 2),
      nearbyLabelFragments: collectSanitizedToggleNearbyFragments(uniqueToggleCueFragments([
        { source: 'section', value: field.sectionName ?? '' },
        ...field.rawCandidateLabels.map((candidate) => ({ source: candidate.source, value: candidate.value })),
      ])),
      matches: {
        addressOptionPattern: analysis.addressOptionPattern,
        operatingAddressPattern: analysis.operatingAddressPattern,
        mailingAddressPattern: analysis.mailingAddressPattern,
        legalAddressPattern: analysis.legalAddressPattern,
        virtualAddressPattern: analysis.virtualAddressPattern,
      },
      selectedByMatcher: analysis.selectedByMatcher,
      excludedReasons: analysis.selectedByMatcher ? [] : analysis.excludedReasons,
    }));

  return {
    candidateCount: candidates.length,
    eligibleCandidateCount: candidates.filter(({ analysis }) => analysis.eligibleRadio).length,
    matchingCandidateCount: candidates.filter(({ analysis }) => analysis.selectedByMatcher).length,
    displayedCandidateCount: entries.length,
    truncatedCandidateCount: Math.max(0, candidates.length - entries.length),
    entries,
  };
}

function buildPhysicalOperatingAddressToggleFallbackInventory(
  fields: GuardedToggleField[],
): PhysicalOperatingAddressToggleFallbackInventory {
  const radioCandidates = fields
    .map((field) => ({ field, analysis: buildPhysicalOperatingAddressToggleFallbackAnalysis(field) }))
    .filter(({ analysis }) => analysis.visibleRadioLike);
  const cueObservations = fields
    .map((field) => ({
      field,
      cueMatches: buildPhysicalOperatingAddressCuePatternMatches(collectToggleCueFragments(field)),
    }))
    .filter(({ field, cueMatches }) => field.visible && field.kind !== 'radio' && hasAnyPhysicalAddressCueMatch(cueMatches));

  const entries = radioCandidates
    .slice(0, TOGGLE_INVENTORY_CANDIDATE_LIMIT)
    .map(({ field, analysis }, index): PhysicalOperatingAddressToggleFallbackInventoryEntry => ({
      slot: index + 1,
      fieldIndex: typeof field.index === 'number' ? field.index : null,
      fieldKey: sanitizeToggleDiagnosticFragment(field.idOrNameKey),
      inputKind: field.kind,
      role: field.kind === 'radio' ? 'radio' : null,
      inputType: normalizeText(field.type),
      controlCategory: field.controlCategory,
      visible: field.visible,
      editable: field.editable,
      inferredType: field.inferredType.type,
      resolvedLabelFragments: collectSanitizedToggleFragments(uniqueToggleCueFragments([
        { source: 'label', value: field.label ?? '' },
        { source: 'resolved-label', value: field.resolvedLabel ?? '' },
      ]), 2),
      groupLabelFragments: collectSanitizedToggleFragments(uniqueToggleCueFragments([
        { source: 'group', value: field.groupName ?? '' },
      ]), 2),
      nearbyLabelFragments: collectSanitizedToggleNearbyFragments(uniqueToggleCueFragments([
        { source: 'section', value: field.sectionName ?? '' },
        ...field.rawCandidateLabels.map((candidate) => ({ source: candidate.source, value: candidate.value })),
      ])),
      nearbyCueMatches: analysis.cueMatches,
      selectedByFallback: analysis.selectedByFallback,
      excludedReasons: analysis.selectedByFallback ? [] : analysis.excludedReasons,
    }));
  const cueEntries = cueObservations
    .slice(0, TOGGLE_FALLBACK_CUE_LIMIT)
    .map(({ field, cueMatches }, index): PhysicalOperatingAddressToggleFallbackCueEntry => ({
      slot: index + 1,
      fieldIndex: typeof field.index === 'number' ? field.index : null,
      inputKind: field.kind,
      controlCategory: field.controlCategory,
      labelFragments: collectSanitizedToggleFragments(uniqueToggleCueFragments([
        { source: 'label', value: field.label ?? '' },
        { source: 'resolved-label', value: field.resolvedLabel ?? '' },
      ]), 2),
      nearbyLabelFragments: collectSanitizedToggleNearbyFragments(uniqueToggleCueFragments([
        { source: 'section', value: field.sectionName ?? '' },
        { source: 'group', value: field.groupName ?? '' },
        ...field.rawCandidateLabels.map((candidate) => ({ source: candidate.source, value: candidate.value })),
      ])),
      cueMatches,
    }));

  return {
    visibleRadioInputCount: radioCandidates.filter(({ field }) => normalizeText(field.type)?.toLowerCase() === 'radio').length,
    visibleRoleRadioCount: radioCandidates.filter(({ field }) => normalizeText(field.type)?.toLowerCase() !== 'radio').length,
    visibleRadioLikeCandidateCount: radioCandidates.length,
    eligibleFallbackCandidateCount: radioCandidates.filter(({ analysis }) => analysis.eligibleRadioLike).length,
    matchingFallbackCandidateCount: radioCandidates.filter(({ analysis }) => analysis.selectedByFallback).length,
    displayedCandidateCount: entries.length,
    truncatedCandidateCount: Math.max(0, radioCandidates.length - entries.length),
    cueObservationCount: cueObservations.length,
    displayedCueObservationCount: cueEntries.length,
    truncatedCueObservationCount: Math.max(0, cueObservations.length - cueEntries.length),
    entries,
    cueObservations: cueEntries,
  };
}

function fieldMentions(field: GuardedToggleField, pattern: RegExp): boolean {
  return fieldTextFragments(field).some((value) => pattern.test(value));
}

function fieldResolvedMentions(field: GuardedToggleField, pattern: RegExp): boolean {
  return fieldResolvedFragments(field).some((value) => pattern.test(value));
}

function isEligibleAddressOptionRadio(field: GuardedToggleField): boolean {
  return field.kind === 'radio'
    && field.controlCategory === 'merchant_input'
    && field.visible
    && field.editable
    && field.inferredType.type === 'address_option';
}

function countPhysicalOperatingAddressFields(fields: GuardedToggleField[]): number {
  return fields.filter((field) => fieldMentions(field, PHYSICAL_ADDRESS_RE)).length;
}

export function guardedPhysicalOperatingAddressDiscoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV] === '1';
}

export function explainPhysicalOperatingAddressToggleSelection<T extends GuardedToggleField>(
  fields: T[],
): PhysicalOperatingAddressToggleSelection<T> {
  const primaryInventory = buildPhysicalOperatingAddressToggleInventory(fields);
  const primaryMatches = fields.filter((field) => buildPhysicalOperatingAddressToggleMatchAnalysis(field).selectedByMatcher);
  if (primaryMatches.length === 1) {
    return {
      selectedField: primaryMatches[0],
      selectionMode: 'primary',
      primaryInventory,
      fallbackInventory: null,
    };
  }

  if (primaryInventory.eligibleCandidateCount === 0) {
    const fallbackInventory = buildPhysicalOperatingAddressToggleFallbackInventory(fields);
    const fallbackMatches = fields.filter((field) => buildPhysicalOperatingAddressToggleFallbackAnalysis(field).selectedByFallback);
    if (fallbackMatches.length === 1) {
      return {
        selectedField: fallbackMatches[0],
        selectionMode: 'fallback',
        primaryInventory,
        fallbackInventory,
      };
    }

    return {
      selectedField: null,
      selectionMode: null,
      primaryInventory,
      fallbackInventory,
    };
  }

  return {
    selectedField: null,
    selectionMode: null,
    primaryInventory,
    fallbackInventory: null,
  };
}

export function findPhysicalOperatingAddressToggle<T extends GuardedToggleField>(fields: T[]): T | null {
  return explainPhysicalOperatingAddressToggleSelection(fields).selectedField;
}

export function shouldStopAfterPhysicalAddressCaptureAttempt(
  options?: GuardedPhysicalOperatingAddressDiscoveryOptions,
): boolean {
  return options?.stopAfterCaptureAttempt === true;
}

async function readCheckedState(field: DiscoveredField): Promise<boolean | null> {
  try {
    return await field.locator.isChecked({ timeout: 1_500 });
  } catch {
    try {
      return await field.locator.evaluate((element) => {
        if (element instanceof HTMLInputElement) return element.checked;
        const ariaChecked = element.getAttribute('aria-checked');
        if (ariaChecked === 'true') return true;
        if (ariaChecked === 'false') return false;
        return null;
      }, { timeout: 1_500 });
    } catch {
      return null;
    }
  }
}

async function waitForSectionSettle(field: DiscoveredField): Promise<void> {
  await field.locator
    .evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 500)), { timeout: 1_500 })
    .catch(() => undefined);
}

export async function maybeExpandPhysicalOperatingAddressSection(
  frame: FrameHost,
  initialFields: DiscoveredField[],
  env: NodeJS.ProcessEnv = process.env,
  options?: GuardedPhysicalOperatingAddressDiscoveryOptions,
): Promise<GuardedPhysicalOperatingAddressDiscoveryResult> {
  const diagnostics: string[] = [];

  if (!guardedPhysicalOperatingAddressDiscoveryEnabled(env)) {
    diagnostics.push('physical-operating-address discovery toggle: disabled');
    return { fields: initialFields, diagnostics, expanded: false, probeReport: null, captureReport: null };
  }

  const toggleSelection = explainPhysicalOperatingAddressToggleSelection(initialFields);
  if (toggleSelection.fallbackInventory) {
    diagnostics.push(
      `physical-operating-address discovery toggle fallback inventory: ${JSON.stringify(toggleSelection.fallbackInventory)}`,
    );
    if (toggleSelection.selectionMode === 'fallback') {
      diagnostics.push('physical-operating-address discovery toggle candidate source: fallback radio-like candidate');
    }
  }

  const toggleField = toggleSelection.selectedField;
  if (!toggleField) {
    diagnostics.push('physical-operating-address discovery toggle: no unique visible isOperatingAddress radio candidate found');
    diagnostics.push(
      `physical-operating-address discovery toggle inventory: ${JSON.stringify(toggleSelection.primaryInventory)}`,
    );
    return { fields: initialFields, diagnostics, expanded: false, probeReport: null, captureReport: null };
  }

  const toggleLabel = normalizeText(toggleField.resolvedLabel ?? toggleField.label) ?? '(unlabelled radio)';
  const alreadyChecked = await readCheckedState(toggleField);
  const probeEnabled = guardedPhysicalOperatingAddressDomProbeEnabled(env);
  const captureEnabled = guardedPhysicalOperatingAddressPostToggleCaptureEnabled(env);

  diagnostics.push(`physical-operating-address discovery toggle candidate: ${toggleLabel}`);
  diagnostics.push(
    `physical-operating-address discovery toggle already selected: ${alreadyChecked === true ? 'yes' : alreadyChecked === false ? 'no' : 'unknown'}`,
  );

  const beforeProbeSnapshot = probeEnabled
    ? await capturePhysicalOperatingAddressDomProbeSnapshot(frame, 'before-toggle')
    : null;

  if (alreadyChecked !== true) {
    await toggleField.locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
    await toggleField.locator.check({ timeout: 3_000, force: true });
    diagnostics.push('physical-operating-address discovery toggle action: selected isOperatingAddress radio');
    await waitForSectionSettle(toggleField);
  } else {
    diagnostics.push('physical-operating-address discovery toggle action: skipped (already selected)');
  }

  const afterProbeSnapshot = probeEnabled
    ? await capturePhysicalOperatingAddressDomProbeSnapshot(frame, 'after-toggle')
    : null;

  const captureReport = captureEnabled
    ? await capturePhysicalOperatingAddressPostToggleStructure(frame)
    : null;

  if (shouldStopAfterPhysicalAddressCaptureAttempt(options)) {
    diagnostics.push('physical-operating-address discovery fields: skipped post-toggle rediscovery in capture-only mode');
    if (beforeProbeSnapshot && afterProbeSnapshot) {
      diagnostics.push('physical-operating-address dom probe report skipped in capture-only mode');
    }
    if (captureReport) {
      diagnostics.push('physical-operating-address post-toggle capture: captured sanitized structural review payload');
    }

    return {
      fields: initialFields,
      diagnostics,
      expanded: true,
      probeReport: null,
      captureReport,
    };
  }

  const fields = await discoverFields(frame);
  diagnostics.push(`physical-operating-address discovery fields: before=${initialFields.length}; after=${fields.length}`);
  const labeledBefore = countPhysicalOperatingAddressFields(initialFields);
  const labeledAfter = countPhysicalOperatingAddressFields(fields);
  diagnostics.push(
    `physical-operating-address labeled fields: before=${labeledBefore}; after=${labeledAfter}`,
  );

  const probeReport = beforeProbeSnapshot && afterProbeSnapshot
    ? buildPhysicalOperatingAddressDomProbeReport({
      toggleCandidateLabel: toggleLabel,
      toggleAction: alreadyChecked === true ? 'already_selected' : 'selected',
      discoveredFieldsBefore: initialFields.length,
      discoveredFieldsAfter: fields.length,
      labeledPhysicalAddressFieldsBefore: labeledBefore,
      labeledPhysicalAddressFieldsAfter: labeledAfter,
      snapshots: [beforeProbeSnapshot, afterProbeSnapshot],
    })
    : null;

  if (probeReport) {
    diagnostics.push('physical-operating-address dom probe: captured before/after structural snapshots');
  }

  if (captureReport) {
    diagnostics.push('physical-operating-address post-toggle capture: captured sanitized structural review payload');
  }

  return { fields, diagnostics, expanded: true, probeReport, captureReport };
}