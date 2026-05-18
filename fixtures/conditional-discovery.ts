import {
  discoverFields,
  type DiscoveredField,
  type LayoutProximityAssociation,
  type LayoutProximityDirection,
  type LayoutProximityDistanceBucket,
  type LayoutProximityLabelCandidate,
  type RadioDomAttributeSignature,
  type RadioGraphicSignature,
  type RadioNonTextLayoutSignature,
  type RadioProxyReferenceSignature,
} from './field-discovery';
import {
  buildPhysicalOperatingAddressDomProbeReport,
  capturePhysicalOperatingAddressDomProbeSnapshot,
  guardedPhysicalOperatingAddressDomProbeEnabled,
  type PhysicalOperatingAddressDomProbeReport,
} from './physical-address-dom-probe';
import {
  capturePhysicalOperatingAddressUiEffectSnapshot,
  capturePhysicalOperatingAddressPostToggleStructure,
  guardedPhysicalOperatingAddressPostToggleCaptureEnabled,
  type PhysicalOperatingAddressUiEffectSnapshot,
  type PhysicalOperatingAddressPostToggleCaptureReport,
} from './physical-address-post-toggle-capture';
import type { FrameHost } from './signer-helpers';

export const SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV = 'SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS';

type GuardedToggleField = Pick<
  DiscoveredField,
  'index' | 'kind' | 'type' | 'controlCategory' | 'visible' | 'editable' | 'resolvedLabel' | 'label' | 'sectionName' | 'rawCandidateLabels' | 'containerContextLabels' | 'layoutProximityLabels' | 'nonTextLayoutSignature' | 'domAttributeSignature' | 'proxyReferenceSignature' | 'radioGraphicSignature' | 'groupName' | 'idOrNameKey' | 'inferredType'
>;

export interface GuardedPhysicalOperatingAddressDiscoveryResult {
  fields: DiscoveredField[];
  diagnostics: string[];
  expanded: boolean;
  probeReport: PhysicalOperatingAddressDomProbeReport | null;
  captureReport: PhysicalOperatingAddressPostToggleCaptureReport | null;
  toggleSelectionSummary: PhysicalOperatingAddressToggleSelectionSummary;
  uiEffectSummary: PhysicalOperatingAddressUiEffectSummary;
  expansionAttempted: boolean;
  expansionSkippedReason: PhysicalOperatingAddressExpansionSkippedReason;
}

export interface GuardedPhysicalOperatingAddressDiscoveryOptions {
  stopAfterCaptureAttempt?: boolean;
}

export type PhysicalOperatingAddressToggleSelectionStage = 'primary' | 'cue-based-fallback' | 'calibrated-fallback' | 'none';

export type PhysicalOperatingAddressToggleSelectionMode = 'primary' | 'fallback' | 'calibrated-fallback' | null;

export type PhysicalOperatingAddressToggleSelectionOutcomeCategory =
  | 'primary-selected'
  | 'cue-based-selected'
  | 'calibrated-selected'
  | 'calibrated-considered-not-selected'
  | 'calibrated-rejected-anchor-missing'
  | 'calibrated-rejected-candidate-count'
  | 'calibrated-rejected-order-unstable'
  | 'calibrated-rejected-conflicting-cue'
  | 'no-safe-toggle-selected';

export type PhysicalOperatingAddressCalibratedFallbackRejectedReason =
  | 'anchor-missing'
  | 'candidate-count'
  | 'order-unstable'
  | 'conflicting-cue'
  | 'cue-based-selection-already-available'
  | 'cue-based-selection-ambiguous'
  | 'calibrated-slot-missing'
  | 'another-bounded-reason';

export type PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory =
  | 'anchor-matched-field-key'
  | 'anchor-matched-label'
  | 'anchor-matched-container'
  | 'anchor-matched-attribute-token'
  | 'anchor-missing-no-safe-evidence'
  | 'anchor-missing-safe-evidence-empty'
  | 'anchor-missing-only-generic-evidence'
  | 'anchor-missing-conflicting-evidence'
  | 'anchor-not-checked';

export type PhysicalOperatingAddressAddressOptionsAnchorRejectedReason =
  | 'anchor-missing'
  | 'no-safe-evidence'
  | 'safe-evidence-empty'
  | 'only-generic-evidence'
  | 'conflicting-evidence'
  | 'not-checked-prior-guard-failed';

export type PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary =
  | 'matched via field-key address-options bucket'
  | 'matched via label address-options bucket'
  | 'matched via container address-options bucket'
  | 'matched via attribute-token address-options bucket'
  | 'checked sources contained no address-options bucket'
  | 'checked sources were empty'
  | 'only generic anchor evidence buckets were observed'
  | 'conflicting cue blocked anchor broadening'
  | 'anchor check skipped because the exact-three-radio guard failed';

export type PhysicalOperatingAddressAddressOptionsAnchorSourceChecked =
  | 'field-key'
  | 'label'
  | 'container'
  | 'attribute-token'
  | 'proxy-token'
  | 'graphic-token';

export type PhysicalOperatingAddressAddressOptionsAnchorTokenBucket =
  | 'address-options'
  | 'address'
  | 'operating-address'
  | 'physical-address'
  | 'radio-group'
  | 'generic-only';

export type PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory =
  | 'group-anchor-matched-accessible-name'
  | 'group-anchor-matched-legend'
  | 'group-anchor-matched-question-prompt'
  | 'group-anchor-matched-section-header'
  | 'group-anchor-matched-association'
  | 'group-anchor-missing-no-safe-evidence'
  | 'group-anchor-missing-safe-evidence-empty'
  | 'group-anchor-missing-only-generic-evidence'
  | 'group-anchor-not-checked';

export type PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason =
  | 'group-anchor-missing'
  | 'no-safe-evidence'
  | 'safe-evidence-empty'
  | 'only-generic-evidence'
  | 'not-checked-prior-guard-failed';

export type PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary =
  | 'matched via radio-group accessible-name bucket'
  | 'matched via radio-group legend bucket'
  | 'matched via radio-group question-prompt bucket'
  | 'matched via radio-group section-header bucket'
  | 'matched via radio-group association bucket'
  | 'checked group-level sources contained no safe anchor bucket'
  | 'checked group-level sources were empty'
  | 'only generic group-level anchor buckets were observed'
  | 'group anchor check skipped because the exact-three-radio guard failed';

export type PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked =
  | 'accessible-name'
  | 'legend'
  | 'question-prompt'
  | 'section-header'
  | 'association';

export type PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket =
  | 'business-primary-location'
  | 'registered-legal-address'
  | 'proof-of-address'
  | 'physical-operating-address'
  | 'po-box'
  | 'virtual-agent'
  | 'radio-group'
  | 'question-prompt'
  | 'generic-only';

export interface PhysicalOperatingAddressCalibratedFallbackGuardSummary {
  addressOptionsAnchorMatched: boolean;
  addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory;
  addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[];
  addressOptionsAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary;
  addressOptionsAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[];
  addressOptionsAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorTextBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorFieldKeyBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorContainerBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorAttributeBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory;
  addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[];
  addressOptionsGroupAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary;
  addressOptionsGroupAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[];
  addressOptionsGroupAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAccessibleNameBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupLegendBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupQuestionPromptBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupSectionHeaderBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAssociationBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  exactThreeRadioGuardPassed: boolean;
  candidateOrderStable: boolean;
  conflictingCueDetected: boolean;
}

export interface PhysicalOperatingAddressToggleSelectionSummary {
  toggleSelectionOutcomeCategory: PhysicalOperatingAddressToggleSelectionOutcomeCategory;
  toggleSelectionStage: PhysicalOperatingAddressToggleSelectionStage;
  toggleSelectionMode: PhysicalOperatingAddressToggleSelectionMode;
  selectedToggleSlot: number | null;
  selectedToggleReason: string | null;
  fallbackReason: string | null;
  calibratedFallbackConsidered: boolean;
  calibratedFallbackAllowed: boolean | null;
  calibratedFallbackSelected: boolean;
  calibratedFallbackSelectedSlot: number | null;
  calibratedFallbackRejectedReasons: PhysicalOperatingAddressCalibratedFallbackRejectedReason[];
  calibratedFallbackGuardSummary: PhysicalOperatingAddressCalibratedFallbackGuardSummary;
  primarySelectionCandidateCount: number;
  cueBasedFallbackCandidateCount: number;
  calibratedFallbackCandidateCount: number;
  eligibleRadioCandidateCount: number;
  exactThreeRadioGuardPassed: boolean;
  addressOptionsAnchorMatched: boolean;
  addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory;
  addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[];
  addressOptionsAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary;
  addressOptionsAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[];
  addressOptionsAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorTextBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorFieldKeyBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorContainerBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorAttributeBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory;
  addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[];
  addressOptionsGroupAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary;
  addressOptionsGroupAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[];
  addressOptionsGroupAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAccessibleNameBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupLegendBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupQuestionPromptBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupSectionHeaderBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAssociationBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  candidateOrderStable: boolean;
  conflictingCueDetected: boolean;
}

export type PhysicalOperatingAddressUiEffectOutcomeCategory =
  | 'proof-address-visible-physical-fields-hidden'
  | 'proof-address-visible-physical-fields-visible'
  | 'proof-address-hidden-physical-fields-hidden'
  | 'proof-address-hidden-physical-fields-visible';

export type PhysicalOperatingAddressExpansionSkippedReason = 'no-selected-toggle' | null;

export interface PhysicalOperatingAddressUiEffectSummary {
  proofOfAddressUploadVisibleBefore: boolean;
  proofOfAddressUploadVisibleAfter: boolean;
  proofOfAddressUploadVisibilityChanged: boolean;
  proofOfAddressUploadExpectedForSelectedOption: boolean | null;
  physicalOperatingAddressFieldsVisibleBefore: boolean;
  physicalOperatingAddressFieldsVisibleAfter: boolean;
  physicalOperatingAddressFieldsVisibilityChanged: boolean;
  physicalOperatingAddressFieldsExpectedForSelectedOption: boolean | null;
  uiEffectOutcomeCategory: PhysicalOperatingAddressUiEffectOutcomeCategory;
}

const ADDRESS_OPTIONS_RE = /\baddress\s+options\b|\baddressoptions\b/i;
const OPERATING_ADDRESS_RE = /\bisoperatingaddress\b|\boperating\s+address\b/i;
const BUSINESS_PHYSICAL_ADDRESS_RE = /\bbusiness\s+physical\s+address\b/i;
const LEGAL_ADDRESS_RE = /\bislegaladdress\b|\blegal\s+address\b/i;
const VIRTUAL_ADDRESS_RE = /\bisvirtualaddress\b|\bvirtual\s+address\b/i;
const MAILING_ADDRESS_RE = /\bismailingaddress\b|\bbusiness\s+mailing\s+address\b|\bmailing\s+address\b/i;
const PHYSICAL_ADDRESS_RE = /\bphysical\s+operating\s+address\b/i;
const SAME_TOGGLE_RE = /\bsame\b/i;
const DIFFERENT_TOGGLE_RE = /\bdifferent\b/i;
const YES_TOGGLE_RE = /\byes\b/i;
const NO_TOGGLE_RE = /\bno\b/i;
const TOGGLE_INVENTORY_CANDIDATE_LIMIT = 6;
const TOGGLE_INVENTORY_FRAGMENT_LIMIT = 4;
const TOGGLE_FALLBACK_CUE_LIMIT = 4;
const CALIBRATED_BUSINESS_PRIMARY_LOCATION_FALLBACK_REASON = 'calibrated-business-primary-location-physical-address-option';
const CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT = 3;
const CALIBRATED_BUSINESS_PRIMARY_LOCATION_TARGET_SLOT = 2;
const ADDRESS_OPTIONS_ANCHOR_SOURCES_CHECKED: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[] = [
  'field-key',
  'label',
  'container',
  'attribute-token',
  'proxy-token',
  'graphic-token',
];
const ADDRESS_OPTIONS_ANCHOR_TOKEN_BUCKET_ORDER: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] = [
  'address-options',
  'address',
  'operating-address',
  'physical-address',
  'radio-group',
  'generic-only',
];
const ADDRESS_OPTIONS_GROUP_ANCHOR_SOURCES_CHECKED: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[] = [
  'accessible-name',
  'legend',
  'question-prompt',
  'section-header',
  'association',
];
const ADDRESS_OPTIONS_GROUP_ANCHOR_TOKEN_BUCKET_ORDER: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[] = [
  'business-primary-location',
  'registered-legal-address',
  'proof-of-address',
  'physical-operating-address',
  'po-box',
  'virtual-agent',
  'radio-group',
  'question-prompt',
  'generic-only',
];
const ADDRESS_OPTIONS_ANCHOR_GENERIC_TEXT_RE = /\brequired\b|\boptional\b|\bsame\b|\bdifferent\b|\byes\b|\bno\b/i;
const ADDRESS_OPTIONS_ANCHOR_GENERIC_SIGNATURE_BUCKETS = new Set([
  'generated-token-pattern',
  'generated/generic-only-token',
  'empty-value',
]);
const BUSINESS_PRIMARY_LOCATION_RE = /\bbusiness\s+primary\s+location\b/i;
const REGISTERED_LEGAL_ADDRESS_RE = /\bregistered\s+legal\s+address\b/i;
const PROOF_OF_ADDRESS_RE = /\bproof\s+of\s+address\b/i;
const PO_BOX_RE = /\bp\.?\s*o\.?\s*box\b|\bpo\s+box\b/i;
const VIRTUAL_AGENT_RE = /\bvirtual\b|\bregistered\s+agent\b/i;
const GROUP_ANCHOR_QUESTION_PROMPT_SOURCES = new Set([
  'aria-labelledby',
  'wrapping-label',
  'described-by',
  'helper-text',
  'preceding-text',
  'positional-prompt',
]);
const GROUP_ANCHOR_ASSOCIATION_SOURCES = new Set([
  'label-for',
  'row-header',
  'section+row',
]);
const ANCESTOR_TOGGLE_LABEL_SOURCES = new Set([
  'aria-labelledby',
  'wrapping-label',
  'described-by',
  'helper-text',
  'section+row',
]);
const SIBLING_TOGGLE_LABEL_SOURCES = new Set([
  'label-for',
  'row-header',
  'positional-prompt',
  'preceding-text',
]);
const CONTAINER_PARENT_TOGGLE_LABEL_SOURCES = new Set(['container-parent']);
const CONTAINER_GRANDPARENT_TOGGLE_LABEL_SOURCES = new Set(['container-grandparent']);
const CONTAINER_SECTION_TOGGLE_LABEL_SOURCES = new Set(['container-section']);
const CONTAINER_PRECEDING_TOGGLE_LABEL_SOURCES = new Set(['container-preceding']);
const CONTAINER_FOLLOWING_TOGGLE_LABEL_SOURCES = new Set(['container-following']);

const SAFE_TOGGLE_FRAGMENT_PATTERNS = [
  { label: 'Physical Operating Address', pattern: /\bphysical\s+operating\s+address\b/i },
  { label: 'Business Physical Address', pattern: /\bbusiness\s+physical\s+address\b/i },
  { label: 'Operating Address', pattern: /\boperating\s+address\b/i },
  { label: 'Business Mailing Address', pattern: /\bbusiness\s+mailing\s+address\b/i },
  { label: 'Mailing Address', pattern: /\bmailing\s+address\b/i },
  { label: 'Legal Address', pattern: /\blegal\s+address\b/i },
  { label: 'Virtual Address', pattern: /\bvirtual\s+address\b/i },
  { label: 'addressOptions', pattern: /\baddress\s+options\b|\baddressoptions\b/i },
  { label: 'isOperatingAddress', pattern: /\bisoperatingaddress\b/i },
  { label: 'isMailingAddress', pattern: /\bismailingaddress\b/i },
  { label: 'isLegalAddress', pattern: /\bislegaladdress\b/i },
  { label: 'isVirtualAddress', pattern: /\bisvirtualaddress\b/i },
  { label: 'Required', pattern: /\brequired\b/i },
  { label: 'Optional', pattern: /\boptional\b/i },
  { label: 'Same', pattern: /\bsame\b/i },
  { label: 'Different', pattern: /\bdifferent\b/i },
  { label: 'Yes', pattern: /\byes\b/i },
  { label: 'No', pattern: /\bno\b/i },
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
  same: boolean;
  different: boolean;
  yes: boolean;
  no: boolean;
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
  resolvedLabelTruncated: boolean;
  resolvedLabelCueMatches: PhysicalOperatingAddressCuePatternMatches;
  groupLabelFragments: string[];
  groupLabelTruncated: boolean;
  groupCueMatches: PhysicalOperatingAddressCuePatternMatches;
  ancestorTextFragments: Array<{ source: string; text: string }>;
  ancestorTextTruncated: boolean;
  ancestorCueMatches: PhysicalOperatingAddressCuePatternMatches;
  siblingTextFragments: Array<{ source: string; text: string }>;
  siblingTextTruncated: boolean;
  siblingCueMatches: PhysicalOperatingAddressCuePatternMatches;
  containerParentTextFragments: Array<{ source: string; text: string }>;
  containerParentTextTruncated: boolean;
  containerParentCueMatches: PhysicalOperatingAddressCuePatternMatches;
  containerGrandparentTextFragments: Array<{ source: string; text: string }>;
  containerGrandparentTextTruncated: boolean;
  containerGrandparentCueMatches: PhysicalOperatingAddressCuePatternMatches;
  containerSectionTextFragments: Array<{ source: string; text: string }>;
  containerSectionTextTruncated: boolean;
  containerSectionCueMatches: PhysicalOperatingAddressCuePatternMatches;
  containerPrecedingTextFragments: Array<{ source: string; text: string }>;
  containerPrecedingTextTruncated: boolean;
  containerPrecedingCueMatches: PhysicalOperatingAddressCuePatternMatches;
  containerFollowingTextFragments: Array<{ source: string; text: string }>;
  containerFollowingTextTruncated: boolean;
  containerFollowingCueMatches: PhysicalOperatingAddressCuePatternMatches;
  layoutProximityTextFragments: Array<{
    direction: LayoutProximityDirection;
    distanceBucket: LayoutProximityDistanceBucket;
    association: LayoutProximityAssociation;
    text: string;
  }>;
  layoutProximityTextTruncated: boolean;
  layoutProximityCueMatches: PhysicalOperatingAddressCuePatternMatches;
  nonTextLayoutSignature: RadioNonTextLayoutSignature | null;
  domAttributeSignature: RadioDomAttributeSignature | null;
  attributeCueMatches: PhysicalOperatingAddressCuePatternMatches;
  proxyReferenceSignature: RadioProxyReferenceSignature | null;
  proxyCueMatches: PhysicalOperatingAddressCuePatternMatches;
  radioGraphicSignature: RadioGraphicSignature | null;
  graphicCueMatches: PhysicalOperatingAddressCuePatternMatches;
  nearbyLabelFragments: Array<{ source: string; text: string }>;
  nearbyTextFragments: Array<{ source: string; text: string }>;
  nearbyTextTruncated: boolean;
  nearbyCueMatches: PhysicalOperatingAddressCuePatternMatches;
  cueMatches: PhysicalOperatingAddressCuePatternMatches;
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

type PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics = {
  candidateCount: number;
  eligibleCandidateCount: number;
  targetCalibratedSlot: number;
  selectedCalibratedSlot: number | null;
  fallbackReason: string;
  cueBasedFailureReason: 'no-explicit-physical-cue-match' | 'ambiguous-explicit-physical-cue-match';
  allowed: boolean;
  rejectedReasons: string[];
  addressOptionsAnchorMatched: boolean;
  addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory;
  addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[];
  addressOptionsAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary;
  addressOptionsAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[];
  addressOptionsAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorTextBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorFieldKeyBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorContainerBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorAttributeBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory;
  addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[];
  addressOptionsGroupAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary;
  addressOptionsGroupAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[];
  addressOptionsGroupAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAccessibleNameBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupLegendBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupQuestionPromptBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupSectionHeaderBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAssociationBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  addressOptionsClusterGuardPassed: boolean;
  candidateOrderStable: boolean;
  exactThreeRadioGuardPassed: boolean;
  conflictingCueDetected: boolean;
  generatedValuesOmitted: boolean;
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
  calibratedFallback: PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics | null;
};

type PhysicalOperatingAddressToggleSelection<T extends GuardedToggleField> = {
  selectedField: T | null;
  selectionMode: 'primary' | 'fallback' | 'calibrated-fallback' | null;
  selectionReason: string | null;
  primaryInventory: PhysicalOperatingAddressToggleInventory;
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory | null;
};

type ToggleCueContext = {
  currentLabelEntries: ToggleCueFragment[];
  groupEntries: ToggleCueFragment[];
  ancestorEntries: ToggleCueFragment[];
  siblingEntries: ToggleCueFragment[];
  containerParentEntries: ToggleCueFragment[];
  containerGrandparentEntries: ToggleCueFragment[];
  containerSectionEntries: ToggleCueFragment[];
  containerPrecedingEntries: ToggleCueFragment[];
  containerFollowingEntries: ToggleCueFragment[];
  containerEntries: ToggleCueFragment[];
  layoutProximityEntries: ToggleCueFragment[];
  attributeSignatureEntries: ToggleCueFragment[];
  proxyReferenceSignatureEntries: ToggleCueFragment[];
  radioGraphicSignatureEntries: ToggleCueFragment[];
  nearbyEntries: ToggleCueFragment[];
  allEntries: ToggleCueFragment[];
};

type BoundedSanitizedToggleFragments = {
  fragments: string[];
  truncated: boolean;
};

type BoundedSanitizedToggleNearbyFragments = {
  fragments: Array<{ source: string; text: string }>;
  truncated: boolean;
};

type BoundedSanitizedToggleLayoutFragments = {
  fragments: Array<{
    direction: LayoutProximityDirection;
    distanceBucket: LayoutProximityDistanceBucket;
    association: LayoutProximityAssociation;
    text: string;
  }>;
  truncated: boolean;
};

type ToggleCueContextOptions = {
  includeLayoutProximity?: boolean;
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

function isToggleAncestorLabelSource(source: string): boolean {
  return ANCESTOR_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleSiblingLabelSource(source: string): boolean {
  return SIBLING_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleContainerParentLabelSource(source: string): boolean {
  return CONTAINER_PARENT_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleContainerGrandparentLabelSource(source: string): boolean {
  return CONTAINER_GRANDPARENT_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleContainerSectionLabelSource(source: string): boolean {
  return CONTAINER_SECTION_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleContainerPrecedingLabelSource(source: string): boolean {
  return CONTAINER_PRECEDING_TOGGLE_LABEL_SOURCES.has(source);
}

function isToggleContainerFollowingLabelSource(source: string): boolean {
  return CONTAINER_FOLLOWING_TOGGLE_LABEL_SOURCES.has(source);
}

function buildRadioGraphicCueEntries(signature: RadioGraphicSignature | null | undefined): ToggleCueFragment[] {
  if (!signature) return [];

  const tokenHints = new Set(signature.tokenHintBuckets);
  const entries: ToggleCueFragment[] = [];
  const push = (value: string) => {
    entries.push({ source: 'radio-graphic-signature', value });
  };

  if (tokenHints.has('business-like-token') && tokenHints.has('physical-like-token') && tokenHints.has('address-like-token')) {
    push('Business Physical Address');
  }
  if (tokenHints.has('physical-like-token') && tokenHints.has('operating-like-token') && tokenHints.has('address-like-token')) {
    push('Physical Operating Address');
  }
  if (tokenHints.has('operating-like-token') && tokenHints.has('address-like-token')) {
    push('Operating Address');
  }
  if (tokenHints.has('mailing-like-token') && tokenHints.has('address-like-token')) {
    push('Mailing Address');
  }
  if (tokenHints.has('legal-like-token') && tokenHints.has('address-like-token')) {
    push('Legal Address');
  }
  if (tokenHints.has('virtual-like-token') && tokenHints.has('address-like-token')) {
    push('Virtual Address');
  }
  if (signature.hasSameChoiceCue) push('Same');
  if (signature.hasDifferentChoiceCue) push('Different');
  if (signature.hasYesChoiceCue) push('Yes');
  if (signature.hasNoChoiceCue) push('No');

  return uniqueToggleCueFragments(entries);
}

function buildToggleCueContext(
  field: GuardedToggleField,
  options?: ToggleCueContextOptions,
): ToggleCueContext {
  const containerContextLabels = field.containerContextLabels ?? [];
  const layoutProximityLabels = options?.includeLayoutProximity ? field.layoutProximityLabels ?? [] : [];
  const currentLabelEntries = uniqueToggleCueFragments([
    { source: 'label', value: field.label ?? '' },
    { source: 'resolved-label', value: field.resolvedLabel ?? '' },
  ]);
  const groupEntries = uniqueToggleCueFragments([
    { source: 'group', value: field.groupName ?? '' },
  ]);
  const ancestorEntries = uniqueToggleCueFragments([
    { source: 'section', value: field.sectionName ?? '' },
    ...field.rawCandidateLabels
      .filter((candidate) => isToggleAncestorLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  ]);
  const siblingEntries = uniqueToggleCueFragments(
    field.rawCandidateLabels
      .filter((candidate) => isToggleSiblingLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerParentEntries = uniqueToggleCueFragments(
    containerContextLabels
      .filter((candidate) => isToggleContainerParentLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerGrandparentEntries = uniqueToggleCueFragments(
    containerContextLabels
      .filter((candidate) => isToggleContainerGrandparentLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerSectionEntries = uniqueToggleCueFragments(
    containerContextLabels
      .filter((candidate) => isToggleContainerSectionLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerPrecedingEntries = uniqueToggleCueFragments(
    containerContextLabels
      .filter((candidate) => isToggleContainerPrecedingLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerFollowingEntries = uniqueToggleCueFragments(
    containerContextLabels
      .filter((candidate) => isToggleContainerFollowingLabelSource(candidate.source))
      .map((candidate) => ({ source: candidate.source, value: candidate.value })),
  );
  const containerEntries = uniqueToggleCueFragments([
    ...containerParentEntries,
    ...containerGrandparentEntries,
    ...containerSectionEntries,
    ...containerPrecedingEntries,
    ...containerFollowingEntries,
  ]);
  const layoutProximityEntries = uniqueToggleCueFragments(
    layoutProximityLabels.map((candidate) => ({
      source: `layout-${candidate.direction}`,
      value: candidate.value,
    })),
  );
  const attributeSignatureEntries = uniqueToggleCueFragments(
    (field.domAttributeSignature?.valueHintBuckets ?? []).map((value) => ({
      source: 'attribute-signature',
      value,
    })),
  );
  const proxyReferenceSignatureEntries = uniqueToggleCueFragments(
    (field.proxyReferenceSignature?.valueHintBuckets ?? []).map((value) => ({
      source: 'proxy-reference-signature',
      value,
    })),
  );
  const radioGraphicSignatureEntries = buildRadioGraphicCueEntries(field.radioGraphicSignature);
  const nearbyEntries = uniqueToggleCueFragments([
    { source: 'section', value: field.sectionName ?? '' },
    ...field.rawCandidateLabels.map((candidate) => ({ source: candidate.source, value: candidate.value })),
  ]);

  return {
    currentLabelEntries,
    groupEntries,
    ancestorEntries,
    siblingEntries,
    containerParentEntries,
    containerGrandparentEntries,
    containerSectionEntries,
    containerPrecedingEntries,
    containerFollowingEntries,
    containerEntries,
    layoutProximityEntries,
    attributeSignatureEntries,
    proxyReferenceSignatureEntries,
    radioGraphicSignatureEntries,
    nearbyEntries,
    allEntries: uniqueToggleCueFragments([
      ...currentLabelEntries,
      { source: 'field-key', value: field.idOrNameKey ?? '' },
      ...groupEntries,
      ...nearbyEntries,
      ...containerEntries,
      ...layoutProximityEntries,
      ...attributeSignatureEntries,
      ...proxyReferenceSignatureEntries,
      ...radioGraphicSignatureEntries,
    ]),
  };
}

function collectToggleCueFragments(field: GuardedToggleField, options?: ToggleCueContextOptions): ToggleCueFragment[] {
  return buildToggleCueContext(field, options).allEntries;
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
    same: cueFragmentsMention(cueFragments, SAME_TOGGLE_RE),
    different: cueFragmentsMention(cueFragments, DIFFERENT_TOGGLE_RE),
    yes: cueFragmentsMention(cueFragments, YES_TOGGLE_RE),
    no: cueFragmentsMention(cueFragments, NO_TOGGLE_RE),
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

function hasAnyToggleCueSignal(matches: PhysicalOperatingAddressCuePatternMatches): boolean {
  return hasAnyPhysicalAddressCueMatch(matches)
    || matches.same
    || matches.different
    || matches.yes
    || matches.no;
}

function hasStableCalibratedCandidateOrder(
  entries: PhysicalOperatingAddressToggleFallbackInventoryEntry[],
): boolean {
  if (entries.length !== CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT) return false;

  const seenFieldIndexes = new Set<number>();
  let previousFieldIndex = -1;

  for (const [index, entry] of entries.entries()) {
    if (entry.slot !== index + 1) return false;
    if (typeof entry.fieldIndex !== 'number') return false;
    if (seenFieldIndexes.has(entry.fieldIndex)) return false;
    if (entry.fieldIndex <= previousFieldIndex) return false;

    seenFieldIndexes.add(entry.fieldIndex);
    previousFieldIndex = entry.fieldIndex;
  }

  return true;
}

function sortUniqueAddressOptionsAnchorTokenBuckets(
  values: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[],
): PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] {
  const seen = new Set(values);
  return ADDRESS_OPTIONS_ANCHOR_TOKEN_BUCKET_ORDER.filter((bucket) => seen.has(bucket));
}

function sortUniqueAddressOptionsGroupAnchorTokenBuckets(
  values: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[],
): PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[] {
  const seen = new Set(values);
  return ADDRESS_OPTIONS_GROUP_ANCHOR_TOKEN_BUCKET_ORDER.filter((bucket) => seen.has(bucket));
}

function collectAddressOptionsAnchorTextBuckets(
  values: Array<string | null | undefined>,
): PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] {
  const buckets: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const matchable = toMatchableText(normalized);
    const localBuckets: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] = [];

    if (ADDRESS_OPTIONS_RE.test(matchable)) localBuckets.push('address-options');
    if (/\baddress\b/i.test(matchable)) localBuckets.push('address');
    if ((/\bphysical\b/i.test(matchable) && /\baddress\b/i.test(matchable)) || BUSINESS_PHYSICAL_ADDRESS_RE.test(matchable)) {
      localBuckets.push('physical-address');
    }
    if ((/\boperating\b/i.test(matchable) && /\baddress\b/i.test(matchable)) || /\bisoperatingaddress\b/i.test(matchable)) {
      localBuckets.push('operating-address');
    }
    if (/\bradio\b|\bgroup\b/i.test(matchable)) localBuckets.push('radio-group');
    if (localBuckets.length === 0 && ADDRESS_OPTIONS_ANCHOR_GENERIC_TEXT_RE.test(matchable)) {
      localBuckets.push('generic-only');
    }

    buckets.push(...localBuckets);
  }

  return sortUniqueAddressOptionsAnchorTokenBuckets(buckets);
}

function collectAddressOptionsAnchorSignatureBuckets(
  values: string[],
): PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] {
  const buckets: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[] = [];

  for (const value of values) {
    const normalized = normalizeText(value)?.toLowerCase();
    if (!normalized) continue;

    if (normalized.includes('addressoptions') || normalized.includes('address options')) {
      buckets.push('address-options');
    }
    if (normalized.includes('address-like-token')) buckets.push('address');
    if (normalized.includes('operating-like-token')) buckets.push('operating-address');
    if (normalized.includes('physical-like-token')) buckets.push('physical-address');
    if (normalized.includes('radio-like-token')) buckets.push('radio-group');
    if (ADDRESS_OPTIONS_ANCHOR_GENERIC_SIGNATURE_BUCKETS.has(normalized)) buckets.push('generic-only');
  }

  return sortUniqueAddressOptionsAnchorTokenBuckets(buckets);
}

function collectAddressOptionsGroupAnchorTextBuckets(
  values: Array<string | null | undefined>,
  source: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked,
): PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[] {
  const buckets: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const matchable = toMatchableText(normalized);
    const localBuckets: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[] = [];

    if (BUSINESS_PRIMARY_LOCATION_RE.test(matchable)) localBuckets.push('business-primary-location');
    if (REGISTERED_LEGAL_ADDRESS_RE.test(matchable)) localBuckets.push('registered-legal-address');
    if (PROOF_OF_ADDRESS_RE.test(matchable)) localBuckets.push('proof-of-address');
    if (PHYSICAL_ADDRESS_RE.test(matchable) || OPERATING_ADDRESS_RE.test(matchable) || BUSINESS_PHYSICAL_ADDRESS_RE.test(matchable)) {
      localBuckets.push('physical-operating-address');
    }
    if (PO_BOX_RE.test(matchable)) localBuckets.push('po-box');
    if (VIRTUAL_AGENT_RE.test(matchable)) localBuckets.push('virtual-agent');
    if (source === 'question-prompt' && (matchable.includes('?') || /\b(is|does|do|can|will|should|would)\b/i.test(matchable))) {
      localBuckets.push('question-prompt');
    }
    if ((source === 'accessible-name' || source === 'association') && /\bradio\b|\bgroup\b/i.test(matchable)) {
      localBuckets.push('radio-group');
    }
    if (localBuckets.length === 0 && ADDRESS_OPTIONS_ANCHOR_GENERIC_TEXT_RE.test(matchable)) {
      localBuckets.push('generic-only');
    }

    buckets.push(...localBuckets);
  }

  return sortUniqueAddressOptionsGroupAnchorTokenBuckets(buckets);
}

function buildAddressOptionsAnchorEvidenceSummary(
  category: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory,
): PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary {
  switch (category) {
    case 'anchor-matched-field-key':
      return 'matched via field-key address-options bucket';
    case 'anchor-matched-label':
      return 'matched via label address-options bucket';
    case 'anchor-matched-container':
      return 'matched via container address-options bucket';
    case 'anchor-matched-attribute-token':
      return 'matched via attribute-token address-options bucket';
    case 'anchor-missing-safe-evidence-empty':
      return 'checked sources were empty';
    case 'anchor-missing-only-generic-evidence':
      return 'only generic anchor evidence buckets were observed';
    case 'anchor-missing-conflicting-evidence':
      return 'conflicting cue blocked anchor broadening';
    case 'anchor-not-checked':
      return 'anchor check skipped because the exact-three-radio guard failed';
    case 'anchor-missing-no-safe-evidence':
    default:
      return 'checked sources contained no address-options bucket';
  }
}

function buildAddressOptionsGroupAnchorEvidenceSummary(
  category: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory,
): PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary {
  switch (category) {
    case 'group-anchor-matched-accessible-name':
      return 'matched via radio-group accessible-name bucket';
    case 'group-anchor-matched-legend':
      return 'matched via radio-group legend bucket';
    case 'group-anchor-matched-question-prompt':
      return 'matched via radio-group question-prompt bucket';
    case 'group-anchor-matched-section-header':
      return 'matched via radio-group section-header bucket';
    case 'group-anchor-matched-association':
      return 'matched via radio-group association bucket';
    case 'group-anchor-missing-safe-evidence-empty':
      return 'checked group-level sources were empty';
    case 'group-anchor-missing-only-generic-evidence':
      return 'only generic group-level anchor buckets were observed';
    case 'group-anchor-not-checked':
      return 'group anchor check skipped because the exact-three-radio guard failed';
    case 'group-anchor-missing-no-safe-evidence':
    default:
      return 'checked group-level sources contained no safe anchor bucket';
  }
}

function buildDefaultPhysicalOperatingAddressCalibratedFallbackGuardSummary(): PhysicalOperatingAddressCalibratedFallbackGuardSummary {
  return {
    addressOptionsAnchorMatched: false,
    addressOptionsAnchorOutcomeCategory: 'anchor-not-checked',
    addressOptionsAnchorRejectedReasons: [],
    addressOptionsAnchorEvidenceSummary: 'anchor check skipped because the exact-three-radio guard failed',
    addressOptionsAnchorSourcesChecked: [],
    addressOptionsAnchorSafeTokensObserved: [],
    addressOptionsAnchorTextBucketsPresent: [],
    addressOptionsAnchorFieldKeyBucketsPresent: [],
    addressOptionsAnchorContainerBucketsPresent: [],
    addressOptionsAnchorAttributeBucketsPresent: [],
    addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-not-checked',
    addressOptionsGroupAnchorRejectedReasons: [],
    addressOptionsGroupAnchorEvidenceSummary: 'group anchor check skipped because the exact-three-radio guard failed',
    addressOptionsGroupAnchorSourcesChecked: [],
    addressOptionsGroupAnchorSafeTokensObserved: [],
    radioGroupAccessibleNameBucketsPresent: [],
    radioGroupLegendBucketsPresent: [],
    radioGroupQuestionPromptBucketsPresent: [],
    radioGroupSectionHeaderBucketsPresent: [],
    radioGroupAssociationBucketsPresent: [],
    exactThreeRadioGuardPassed: false,
    candidateOrderStable: false,
    conflictingCueDetected: false,
  };
}

function isGroupAnchorQuestionPromptSource(source: string): boolean {
  return GROUP_ANCHOR_QUESTION_PROMPT_SOURCES.has(source);
}

function isGroupAnchorAssociationSource(source: string): boolean {
  return GROUP_ANCHOR_ASSOCIATION_SOURCES.has(source);
}

function isNonGenericAddressOptionsGroupAnchorTokenBucket(
  bucket: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket,
): boolean {
  return bucket !== 'radio-group' && bucket !== 'question-prompt' && bucket !== 'generic-only';
}

function buildPhysicalOperatingAddressAddressOptionsGroupAnchorEvidence(input: {
  fields: GuardedToggleField[];
  exactThreeRadioGuardPassed: boolean;
}): Pick<
  PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics,
  | 'addressOptionsGroupAnchorOutcomeCategory'
  | 'addressOptionsGroupAnchorRejectedReasons'
  | 'addressOptionsGroupAnchorEvidenceSummary'
  | 'addressOptionsGroupAnchorSourcesChecked'
  | 'addressOptionsGroupAnchorSafeTokensObserved'
  | 'radioGroupAccessibleNameBucketsPresent'
  | 'radioGroupLegendBucketsPresent'
  | 'radioGroupQuestionPromptBucketsPresent'
  | 'radioGroupSectionHeaderBucketsPresent'
  | 'radioGroupAssociationBucketsPresent'
> {
  const visibleRadioLikeFields = input.fields
    .map((field) => ({ field, analysis: buildPhysicalOperatingAddressToggleFallbackAnalysis(field) }))
    .filter(({ analysis }) => analysis.visibleRadioLike)
    .map(({ field }) => field);
  const accessibleNameValues = visibleRadioLikeFields.map((field) => field.groupName);
  const legendValues = visibleRadioLikeFields.flatMap((field) => (field.containerContextLabels ?? [])
    .filter((candidate) => candidate.source === 'container-section')
    .map((candidate) => candidate.value));
  const questionPromptValues = visibleRadioLikeFields.flatMap((field) => field.rawCandidateLabels
    .filter((candidate) => isGroupAnchorQuestionPromptSource(candidate.source))
    .map((candidate) => candidate.value));
  const sectionHeaderValues = visibleRadioLikeFields.map((field) => field.sectionName);
  const associationValues = visibleRadioLikeFields.flatMap((field) => [
    ...field.rawCandidateLabels
      .filter((candidate) => isGroupAnchorAssociationSource(candidate.source))
      .map((candidate) => candidate.value),
    ...(field.layoutProximityLabels ?? [])
      .filter((candidate) => candidate.association === 'group')
      .map((candidate) => candidate.value),
  ]);
  const radioGroupAccessibleNameBucketsPresent = collectAddressOptionsGroupAnchorTextBuckets(
    accessibleNameValues,
    'accessible-name',
  );
  const radioGroupLegendBucketsPresent = collectAddressOptionsGroupAnchorTextBuckets(legendValues, 'legend');
  const radioGroupQuestionPromptBucketsPresent = collectAddressOptionsGroupAnchorTextBuckets(
    questionPromptValues,
    'question-prompt',
  );
  const radioGroupSectionHeaderBucketsPresent = collectAddressOptionsGroupAnchorTextBuckets(
    sectionHeaderValues,
    'section-header',
  );
  const radioGroupAssociationBucketsPresent = collectAddressOptionsGroupAnchorTextBuckets(
    associationValues,
    'association',
  );
  const safeTokensObserved = sortUniqueAddressOptionsGroupAnchorTokenBuckets([
    ...radioGroupAccessibleNameBucketsPresent,
    ...radioGroupLegendBucketsPresent,
    ...radioGroupQuestionPromptBucketsPresent,
    ...radioGroupSectionHeaderBucketsPresent,
    ...radioGroupAssociationBucketsPresent,
  ]);
  const accessibleNameMatched = radioGroupAccessibleNameBucketsPresent.some(isNonGenericAddressOptionsGroupAnchorTokenBucket);
  const legendMatched = radioGroupLegendBucketsPresent.some(isNonGenericAddressOptionsGroupAnchorTokenBucket);
  const questionPromptMatched = radioGroupQuestionPromptBucketsPresent.some(isNonGenericAddressOptionsGroupAnchorTokenBucket);
  const sectionHeaderMatched = radioGroupSectionHeaderBucketsPresent.some(isNonGenericAddressOptionsGroupAnchorTokenBucket);
  const associationMatched = radioGroupAssociationBucketsPresent.some(isNonGenericAddressOptionsGroupAnchorTokenBucket);
  const anySourceHasContent = accessibleNameValues.some((value) => Boolean(normalizeText(value)))
    || legendValues.some((value) => Boolean(normalizeText(value)))
    || questionPromptValues.some((value) => Boolean(normalizeText(value)))
    || sectionHeaderValues.some((value) => Boolean(normalizeText(value)))
    || associationValues.some((value) => Boolean(normalizeText(value)));
  const onlyGenericEvidence = safeTokensObserved.length > 0
    && safeTokensObserved.every((bucket) => !isNonGenericAddressOptionsGroupAnchorTokenBucket(bucket));

  let addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory =
    'group-anchor-missing-no-safe-evidence';
  if (!input.exactThreeRadioGuardPassed) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-not-checked';
  } else if (accessibleNameMatched) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-matched-accessible-name';
  } else if (legendMatched) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-matched-legend';
  } else if (questionPromptMatched) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-matched-question-prompt';
  } else if (sectionHeaderMatched) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-matched-section-header';
  } else if (associationMatched) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-matched-association';
  } else if (!anySourceHasContent) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-missing-safe-evidence-empty';
  } else if (onlyGenericEvidence) {
    addressOptionsGroupAnchorOutcomeCategory = 'group-anchor-missing-only-generic-evidence';
  }

  const addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[] = [];
  if (addressOptionsGroupAnchorOutcomeCategory === 'group-anchor-not-checked') {
    addressOptionsGroupAnchorRejectedReasons.push('not-checked-prior-guard-failed');
  } else if (
    addressOptionsGroupAnchorOutcomeCategory === 'group-anchor-missing-no-safe-evidence'
    || addressOptionsGroupAnchorOutcomeCategory === 'group-anchor-missing-safe-evidence-empty'
    || addressOptionsGroupAnchorOutcomeCategory === 'group-anchor-missing-only-generic-evidence'
  ) {
    addressOptionsGroupAnchorRejectedReasons.push('group-anchor-missing');
    switch (addressOptionsGroupAnchorOutcomeCategory) {
      case 'group-anchor-missing-safe-evidence-empty':
        addressOptionsGroupAnchorRejectedReasons.push('safe-evidence-empty');
        break;
      case 'group-anchor-missing-only-generic-evidence':
        addressOptionsGroupAnchorRejectedReasons.push('only-generic-evidence');
        break;
      case 'group-anchor-missing-no-safe-evidence':
      default:
        addressOptionsGroupAnchorRejectedReasons.push('no-safe-evidence');
        break;
    }
  }

  return {
    addressOptionsGroupAnchorOutcomeCategory,
    addressOptionsGroupAnchorRejectedReasons,
    addressOptionsGroupAnchorEvidenceSummary:
      buildAddressOptionsGroupAnchorEvidenceSummary(addressOptionsGroupAnchorOutcomeCategory),
    addressOptionsGroupAnchorSourcesChecked: ADDRESS_OPTIONS_GROUP_ANCHOR_SOURCES_CHECKED.slice(),
    addressOptionsGroupAnchorSafeTokensObserved: safeTokensObserved,
    radioGroupAccessibleNameBucketsPresent,
    radioGroupLegendBucketsPresent,
    radioGroupQuestionPromptBucketsPresent,
    radioGroupSectionHeaderBucketsPresent,
    radioGroupAssociationBucketsPresent,
  };
}

function buildPhysicalOperatingAddressAddressOptionsAnchorEvidence(input: {
  primaryInventory: PhysicalOperatingAddressToggleInventory;
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory;
  addressOptionsAnchorMatched: boolean;
  exactThreeRadioGuardPassed: boolean;
  conflictingCueDetected: boolean;
}): Pick<
  PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics,
  | 'addressOptionsAnchorOutcomeCategory'
  | 'addressOptionsAnchorRejectedReasons'
  | 'addressOptionsAnchorEvidenceSummary'
  | 'addressOptionsAnchorSourcesChecked'
  | 'addressOptionsAnchorSafeTokensObserved'
  | 'addressOptionsAnchorTextBucketsPresent'
  | 'addressOptionsAnchorFieldKeyBucketsPresent'
  | 'addressOptionsAnchorContainerBucketsPresent'
  | 'addressOptionsAnchorAttributeBucketsPresent'
> {
  const textBucketsPresent = collectAddressOptionsAnchorTextBuckets(
    input.primaryInventory.entries.flatMap((entry) => [
      ...entry.resolvedLabelFragments,
      ...entry.groupLabelFragments,
      ...entry.nearbyLabelFragments.map((fragment) => fragment.text),
    ]),
  );
  const fieldKeyBucketsPresent = collectAddressOptionsAnchorTextBuckets(
    input.primaryInventory.entries.map((entry) => entry.fieldKey),
  );
  const containerBucketsPresent = collectAddressOptionsAnchorTextBuckets(
    input.fallbackInventory.entries.flatMap((entry) => [
      ...entry.containerParentTextFragments.map((fragment) => fragment.text),
      ...entry.containerGrandparentTextFragments.map((fragment) => fragment.text),
      ...entry.containerSectionTextFragments.map((fragment) => fragment.text),
      ...entry.containerPrecedingTextFragments.map((fragment) => fragment.text),
      ...entry.containerFollowingTextFragments.map((fragment) => fragment.text),
    ]),
  );
  const attributeBucketsPresent = collectAddressOptionsAnchorSignatureBuckets(
    input.fallbackInventory.entries.flatMap((entry) => [
      ...(entry.domAttributeSignature?.valueHintBuckets ?? []),
      ...(entry.proxyReferenceSignature?.valueHintBuckets ?? []),
      ...(entry.radioGraphicSignature?.tokenHintBuckets ?? []),
    ]),
  );
  const safeTokensObserved = sortUniqueAddressOptionsAnchorTokenBuckets([
    ...fieldKeyBucketsPresent,
    ...textBucketsPresent,
    ...containerBucketsPresent,
    ...attributeBucketsPresent,
  ]);
  const fieldKeySourceHasContent = input.primaryInventory.entries.some((entry) => Boolean(entry.fieldKey));
  const textSourceHasContent = input.primaryInventory.entries.some((entry) =>
    entry.resolvedLabelFragments.length > 0 || entry.groupLabelFragments.length > 0 || entry.nearbyLabelFragments.length > 0);
  const containerSourceHasContent = input.fallbackInventory.entries.some((entry) =>
    entry.containerParentTextFragments.length > 0
      || entry.containerGrandparentTextFragments.length > 0
      || entry.containerSectionTextFragments.length > 0
      || entry.containerPrecedingTextFragments.length > 0
      || entry.containerFollowingTextFragments.length > 0);
  const attributeSourceHasContent = input.fallbackInventory.entries.some((entry) =>
    (entry.domAttributeSignature?.valueHintBuckets.length ?? 0) > 0);
  const proxySourceHasContent = input.fallbackInventory.entries.some((entry) =>
    (entry.proxyReferenceSignature?.valueHintBuckets.length ?? 0) > 0);
  const graphicSourceHasContent = input.fallbackInventory.entries.some((entry) =>
    (entry.radioGraphicSignature?.tokenHintBuckets.length ?? 0) > 0);
  const anySourceHasContent = fieldKeySourceHasContent
    || textSourceHasContent
    || containerSourceHasContent
    || attributeSourceHasContent
    || proxySourceHasContent
    || graphicSourceHasContent;
  const fieldKeyMatched = fieldKeyBucketsPresent.includes('address-options');
  const textMatched = textBucketsPresent.includes('address-options');
  const containerMatched = containerBucketsPresent.includes('address-options');
  const attributeMatched = attributeBucketsPresent.includes('address-options');
  const onlyGenericEvidence = safeTokensObserved.length > 0
    && safeTokensObserved.every((bucket) => bucket === 'radio-group' || bucket === 'generic-only');

  let addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory = 'anchor-missing-no-safe-evidence';
  if (!input.exactThreeRadioGuardPassed) {
    addressOptionsAnchorOutcomeCategory = 'anchor-not-checked';
  } else if (input.addressOptionsAnchorMatched) {
    if (fieldKeyMatched) {
      addressOptionsAnchorOutcomeCategory = 'anchor-matched-field-key';
    } else if (textMatched) {
      addressOptionsAnchorOutcomeCategory = 'anchor-matched-label';
    } else if (containerMatched) {
      addressOptionsAnchorOutcomeCategory = 'anchor-matched-container';
    } else if (attributeMatched) {
      addressOptionsAnchorOutcomeCategory = 'anchor-matched-attribute-token';
    } else {
      addressOptionsAnchorOutcomeCategory = 'anchor-matched-label';
    }
  } else if (input.conflictingCueDetected) {
    addressOptionsAnchorOutcomeCategory = 'anchor-missing-conflicting-evidence';
  } else if (!anySourceHasContent) {
    addressOptionsAnchorOutcomeCategory = 'anchor-missing-safe-evidence-empty';
  } else if (onlyGenericEvidence) {
    addressOptionsAnchorOutcomeCategory = 'anchor-missing-only-generic-evidence';
  }

  const addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[] = [];
  if (addressOptionsAnchorOutcomeCategory === 'anchor-not-checked') {
    addressOptionsAnchorRejectedReasons.push('not-checked-prior-guard-failed');
  } else if (!input.addressOptionsAnchorMatched) {
    addressOptionsAnchorRejectedReasons.push('anchor-missing');
    switch (addressOptionsAnchorOutcomeCategory) {
      case 'anchor-missing-safe-evidence-empty':
        addressOptionsAnchorRejectedReasons.push('safe-evidence-empty');
        break;
      case 'anchor-missing-only-generic-evidence':
        addressOptionsAnchorRejectedReasons.push('only-generic-evidence');
        break;
      case 'anchor-missing-conflicting-evidence':
        addressOptionsAnchorRejectedReasons.push('conflicting-evidence');
        break;
      case 'anchor-missing-no-safe-evidence':
      default:
        addressOptionsAnchorRejectedReasons.push('no-safe-evidence');
        break;
    }
  }

  return {
    addressOptionsAnchorOutcomeCategory,
    addressOptionsAnchorRejectedReasons,
    addressOptionsAnchorEvidenceSummary: buildAddressOptionsAnchorEvidenceSummary(addressOptionsAnchorOutcomeCategory),
    addressOptionsAnchorSourcesChecked: ADDRESS_OPTIONS_ANCHOR_SOURCES_CHECKED.slice(),
    addressOptionsAnchorSafeTokensObserved: safeTokensObserved,
    addressOptionsAnchorTextBucketsPresent: textBucketsPresent,
    addressOptionsAnchorFieldKeyBucketsPresent: fieldKeyBucketsPresent,
    addressOptionsAnchorContainerBucketsPresent: containerBucketsPresent,
    addressOptionsAnchorAttributeBucketsPresent: attributeBucketsPresent,
  };
}

function buildCalibratedPhysicalOperatingAddressFallbackDiagnostics(
  fields: GuardedToggleField[],
  primaryInventory: PhysicalOperatingAddressToggleInventory,
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory,
): PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics {
  const entries = fallbackInventory.entries;
  const addressOptionsAnchorMatched = primaryInventory.entries.length > 0
    && primaryInventory.entries.every((entry) => entry.matches.addressOptionPattern);
  const addressOptionsClusterGuardPassed = addressOptionsAnchorMatched
    && primaryInventory.candidateCount === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT
    && primaryInventory.matchingCandidateCount === 0
    && primaryInventory.truncatedCandidateCount === 0
    && primaryInventory.entries.length === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT;
  const exactThreeRadioGuardPassed = fallbackInventory.visibleRadioInputCount === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT
    && fallbackInventory.visibleRoleRadioCount === 0
    && fallbackInventory.visibleRadioLikeCandidateCount === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT
    && fallbackInventory.eligibleFallbackCandidateCount === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT
    && fallbackInventory.truncatedCandidateCount === 0
    && entries.length === CALIBRATED_BUSINESS_PRIMARY_LOCATION_CANDIDATE_COUNT
    && entries.every((entry) => entry.inputKind === 'radio'
      && entry.controlCategory === 'merchant_input'
      && entry.visible
      && entry.editable
      && (entry.inputType ?? '').toLowerCase() === 'radio');
  const candidateOrderStable = exactThreeRadioGuardPassed && hasStableCalibratedCandidateOrder(entries);
  const conflictingCueDetected = entries.some((entry) => hasAnyToggleCueSignal(entry.cueMatches));
  const anchorEvidence = buildPhysicalOperatingAddressAddressOptionsAnchorEvidence({
    primaryInventory,
    fallbackInventory,
    addressOptionsAnchorMatched,
    exactThreeRadioGuardPassed,
    conflictingCueDetected,
  });
  const groupAnchorEvidence = buildPhysicalOperatingAddressAddressOptionsGroupAnchorEvidence({
    fields,
    exactThreeRadioGuardPassed,
  });
  const cueBasedFailureReason = fallbackInventory.matchingFallbackCandidateCount === 0
    ? 'no-explicit-physical-cue-match'
    : 'ambiguous-explicit-physical-cue-match';
  const rejectedReasons: string[] = [];

  if (fallbackInventory.matchingFallbackCandidateCount !== 0) {
    rejectedReasons.push(
      fallbackInventory.matchingFallbackCandidateCount === 1
        ? 'cue-based-selection-already-available'
        : 'cue-based-selection-ambiguous',
    );
  }
  if (exactThreeRadioGuardPassed && !addressOptionsAnchorMatched) rejectedReasons.push('address-options-anchor-missing');
  if (addressOptionsAnchorMatched && !exactThreeRadioGuardPassed) rejectedReasons.push('candidate-count-not-exactly-three');
  if (!candidateOrderStable) rejectedReasons.push('candidate-order-unstable');
  if (conflictingCueDetected) rejectedReasons.push('conflicting-safe-cue-surfaced');

  return {
    candidateCount: fallbackInventory.visibleRadioLikeCandidateCount,
    eligibleCandidateCount: fallbackInventory.eligibleFallbackCandidateCount,
    targetCalibratedSlot: CALIBRATED_BUSINESS_PRIMARY_LOCATION_TARGET_SLOT,
    selectedCalibratedSlot:
      rejectedReasons.length === 0 ? CALIBRATED_BUSINESS_PRIMARY_LOCATION_TARGET_SLOT : null,
    fallbackReason: CALIBRATED_BUSINESS_PRIMARY_LOCATION_FALLBACK_REASON,
    cueBasedFailureReason,
    allowed: rejectedReasons.length === 0,
    rejectedReasons,
    addressOptionsAnchorMatched,
    addressOptionsAnchorOutcomeCategory: anchorEvidence.addressOptionsAnchorOutcomeCategory,
    addressOptionsAnchorRejectedReasons: anchorEvidence.addressOptionsAnchorRejectedReasons,
    addressOptionsAnchorEvidenceSummary: anchorEvidence.addressOptionsAnchorEvidenceSummary,
    addressOptionsAnchorSourcesChecked: anchorEvidence.addressOptionsAnchorSourcesChecked,
    addressOptionsAnchorSafeTokensObserved: anchorEvidence.addressOptionsAnchorSafeTokensObserved,
    addressOptionsAnchorTextBucketsPresent: anchorEvidence.addressOptionsAnchorTextBucketsPresent,
    addressOptionsAnchorFieldKeyBucketsPresent: anchorEvidence.addressOptionsAnchorFieldKeyBucketsPresent,
    addressOptionsAnchorContainerBucketsPresent: anchorEvidence.addressOptionsAnchorContainerBucketsPresent,
    addressOptionsAnchorAttributeBucketsPresent: anchorEvidence.addressOptionsAnchorAttributeBucketsPresent,
    addressOptionsGroupAnchorOutcomeCategory: groupAnchorEvidence.addressOptionsGroupAnchorOutcomeCategory,
    addressOptionsGroupAnchorRejectedReasons: groupAnchorEvidence.addressOptionsGroupAnchorRejectedReasons,
    addressOptionsGroupAnchorEvidenceSummary: groupAnchorEvidence.addressOptionsGroupAnchorEvidenceSummary,
    addressOptionsGroupAnchorSourcesChecked: groupAnchorEvidence.addressOptionsGroupAnchorSourcesChecked,
    addressOptionsGroupAnchorSafeTokensObserved: groupAnchorEvidence.addressOptionsGroupAnchorSafeTokensObserved,
    radioGroupAccessibleNameBucketsPresent: groupAnchorEvidence.radioGroupAccessibleNameBucketsPresent,
    radioGroupLegendBucketsPresent: groupAnchorEvidence.radioGroupLegendBucketsPresent,
    radioGroupQuestionPromptBucketsPresent: groupAnchorEvidence.radioGroupQuestionPromptBucketsPresent,
    radioGroupSectionHeaderBucketsPresent: groupAnchorEvidence.radioGroupSectionHeaderBucketsPresent,
    radioGroupAssociationBucketsPresent: groupAnchorEvidence.radioGroupAssociationBucketsPresent,
    addressOptionsClusterGuardPassed,
    candidateOrderStable,
    exactThreeRadioGuardPassed,
    conflictingCueDetected,
    generatedValuesOmitted: true,
  };
}

function mapPhysicalOperatingAddressCalibratedRejectedReason(
  reason: string,
): PhysicalOperatingAddressCalibratedFallbackRejectedReason {
  switch (reason) {
    case 'address-options-anchor-missing':
      return 'anchor-missing';
    case 'candidate-count-not-exactly-three':
      return 'candidate-count';
    case 'candidate-order-unstable':
      return 'order-unstable';
    case 'conflicting-safe-cue-surfaced':
      return 'conflicting-cue';
    case 'cue-based-selection-already-available':
      return 'cue-based-selection-already-available';
    case 'cue-based-selection-ambiguous':
      return 'cue-based-selection-ambiguous';
    case 'calibrated-slot-missing':
      return 'calibrated-slot-missing';
    default:
      return 'another-bounded-reason';
  }
}

function resolveSelectedToggleSlot<T extends GuardedToggleField>(
  toggleSelection: PhysicalOperatingAddressToggleSelection<T>,
): number | null {
  if (toggleSelection.selectionMode === 'primary') {
    return toggleSelection.primaryInventory.entries.find((entry) => entry.selectedByMatcher)?.slot ?? null;
  }
  if (toggleSelection.selectionMode === 'fallback') {
    return toggleSelection.fallbackInventory?.entries.find((entry) => entry.selectedByFallback)?.slot ?? null;
  }
  if (toggleSelection.selectionMode === 'calibrated-fallback') {
    return toggleSelection.fallbackInventory?.calibratedFallback?.selectedCalibratedSlot ?? null;
  }

  return null;
}

export function buildPhysicalOperatingAddressToggleSelectionSummary<T extends GuardedToggleField>(
  toggleSelection: PhysicalOperatingAddressToggleSelection<T>,
): PhysicalOperatingAddressToggleSelectionSummary {
  const calibratedFallback = toggleSelection.fallbackInventory?.calibratedFallback ?? null;
  const calibratedFallbackGuardSummary = calibratedFallback
    ? {
      addressOptionsAnchorMatched: calibratedFallback.addressOptionsAnchorMatched,
      addressOptionsAnchorOutcomeCategory: calibratedFallback.addressOptionsAnchorOutcomeCategory,
      addressOptionsAnchorRejectedReasons: calibratedFallback.addressOptionsAnchorRejectedReasons,
      addressOptionsAnchorEvidenceSummary: calibratedFallback.addressOptionsAnchorEvidenceSummary,
      addressOptionsAnchorSourcesChecked: calibratedFallback.addressOptionsAnchorSourcesChecked,
      addressOptionsAnchorSafeTokensObserved: calibratedFallback.addressOptionsAnchorSafeTokensObserved,
      addressOptionsAnchorTextBucketsPresent: calibratedFallback.addressOptionsAnchorTextBucketsPresent,
      addressOptionsAnchorFieldKeyBucketsPresent: calibratedFallback.addressOptionsAnchorFieldKeyBucketsPresent,
      addressOptionsAnchorContainerBucketsPresent: calibratedFallback.addressOptionsAnchorContainerBucketsPresent,
      addressOptionsAnchorAttributeBucketsPresent: calibratedFallback.addressOptionsAnchorAttributeBucketsPresent,
      addressOptionsGroupAnchorOutcomeCategory: calibratedFallback.addressOptionsGroupAnchorOutcomeCategory,
      addressOptionsGroupAnchorRejectedReasons: calibratedFallback.addressOptionsGroupAnchorRejectedReasons,
      addressOptionsGroupAnchorEvidenceSummary: calibratedFallback.addressOptionsGroupAnchorEvidenceSummary,
      addressOptionsGroupAnchorSourcesChecked: calibratedFallback.addressOptionsGroupAnchorSourcesChecked,
      addressOptionsGroupAnchorSafeTokensObserved: calibratedFallback.addressOptionsGroupAnchorSafeTokensObserved,
      radioGroupAccessibleNameBucketsPresent: calibratedFallback.radioGroupAccessibleNameBucketsPresent,
      radioGroupLegendBucketsPresent: calibratedFallback.radioGroupLegendBucketsPresent,
      radioGroupQuestionPromptBucketsPresent: calibratedFallback.radioGroupQuestionPromptBucketsPresent,
      radioGroupSectionHeaderBucketsPresent: calibratedFallback.radioGroupSectionHeaderBucketsPresent,
      radioGroupAssociationBucketsPresent: calibratedFallback.radioGroupAssociationBucketsPresent,
      exactThreeRadioGuardPassed: calibratedFallback.exactThreeRadioGuardPassed,
      candidateOrderStable: calibratedFallback.candidateOrderStable,
      conflictingCueDetected: calibratedFallback.conflictingCueDetected,
    }
    : buildDefaultPhysicalOperatingAddressCalibratedFallbackGuardSummary();
  const calibratedFallbackRejectedReasons = (calibratedFallback?.rejectedReasons ?? []).map(
    mapPhysicalOperatingAddressCalibratedRejectedReason,
  );
  const selectedToggleSlot = resolveSelectedToggleSlot(toggleSelection);

  let toggleSelectionOutcomeCategory: PhysicalOperatingAddressToggleSelectionOutcomeCategory = 'no-safe-toggle-selected';
  if (toggleSelection.selectionMode === 'primary') {
    toggleSelectionOutcomeCategory = 'primary-selected';
  } else if (toggleSelection.selectionMode === 'fallback') {
    toggleSelectionOutcomeCategory = 'cue-based-selected';
  } else if (toggleSelection.selectionMode === 'calibrated-fallback' && selectedToggleSlot !== null) {
    toggleSelectionOutcomeCategory = 'calibrated-selected';
  } else if (calibratedFallback) {
    if (calibratedFallbackRejectedReasons.includes('anchor-missing')) {
      toggleSelectionOutcomeCategory = 'calibrated-rejected-anchor-missing';
    } else if (calibratedFallbackRejectedReasons.includes('candidate-count')) {
      toggleSelectionOutcomeCategory = 'calibrated-rejected-candidate-count';
    } else if (calibratedFallbackRejectedReasons.includes('order-unstable')) {
      toggleSelectionOutcomeCategory = 'calibrated-rejected-order-unstable';
    } else if (calibratedFallbackRejectedReasons.includes('conflicting-cue')) {
      toggleSelectionOutcomeCategory = 'calibrated-rejected-conflicting-cue';
    } else {
      toggleSelectionOutcomeCategory = 'calibrated-considered-not-selected';
    }
  }

  let toggleSelectionStage: PhysicalOperatingAddressToggleSelectionStage = 'none';
  if (toggleSelection.selectionMode === 'primary') {
    toggleSelectionStage = 'primary';
  } else if (toggleSelection.selectionMode === 'fallback') {
    toggleSelectionStage = 'cue-based-fallback';
  } else if (calibratedFallback) {
    toggleSelectionStage = 'calibrated-fallback';
  } else if (toggleSelection.fallbackInventory) {
    toggleSelectionStage = 'cue-based-fallback';
  } else if (toggleSelection.primaryInventory.candidateCount > 0) {
    toggleSelectionStage = 'primary';
  }

  return {
    toggleSelectionOutcomeCategory,
    toggleSelectionStage,
    toggleSelectionMode: toggleSelection.selectionMode,
    selectedToggleSlot,
    selectedToggleReason: toggleSelection.selectionReason,
    fallbackReason: calibratedFallback?.fallbackReason
      ?? (toggleSelection.selectionMode === 'fallback' ? toggleSelection.selectionReason : null),
    calibratedFallbackConsidered: calibratedFallback !== null,
    calibratedFallbackAllowed: calibratedFallback?.allowed ?? null,
    calibratedFallbackSelected: toggleSelection.selectionMode === 'calibrated-fallback' && selectedToggleSlot !== null,
    calibratedFallbackSelectedSlot: calibratedFallback?.selectedCalibratedSlot ?? null,
    calibratedFallbackRejectedReasons,
    calibratedFallbackGuardSummary,
    primarySelectionCandidateCount: toggleSelection.primaryInventory.matchingCandidateCount,
    cueBasedFallbackCandidateCount: toggleSelection.fallbackInventory?.matchingFallbackCandidateCount ?? 0,
    calibratedFallbackCandidateCount: calibratedFallback?.candidateCount ?? 0,
    eligibleRadioCandidateCount: toggleSelection.fallbackInventory?.eligibleFallbackCandidateCount ?? toggleSelection.primaryInventory.eligibleCandidateCount,
    exactThreeRadioGuardPassed: calibratedFallbackGuardSummary.exactThreeRadioGuardPassed,
    addressOptionsAnchorMatched: calibratedFallbackGuardSummary.addressOptionsAnchorMatched,
    addressOptionsAnchorOutcomeCategory: calibratedFallbackGuardSummary.addressOptionsAnchorOutcomeCategory,
    addressOptionsAnchorRejectedReasons: calibratedFallbackGuardSummary.addressOptionsAnchorRejectedReasons,
    addressOptionsAnchorEvidenceSummary: calibratedFallbackGuardSummary.addressOptionsAnchorEvidenceSummary,
    addressOptionsAnchorSourcesChecked: calibratedFallbackGuardSummary.addressOptionsAnchorSourcesChecked,
    addressOptionsAnchorSafeTokensObserved: calibratedFallbackGuardSummary.addressOptionsAnchorSafeTokensObserved,
    addressOptionsAnchorTextBucketsPresent: calibratedFallbackGuardSummary.addressOptionsAnchorTextBucketsPresent,
    addressOptionsAnchorFieldKeyBucketsPresent: calibratedFallbackGuardSummary.addressOptionsAnchorFieldKeyBucketsPresent,
    addressOptionsAnchorContainerBucketsPresent: calibratedFallbackGuardSummary.addressOptionsAnchorContainerBucketsPresent,
    addressOptionsAnchorAttributeBucketsPresent: calibratedFallbackGuardSummary.addressOptionsAnchorAttributeBucketsPresent,
    addressOptionsGroupAnchorOutcomeCategory: calibratedFallbackGuardSummary.addressOptionsGroupAnchorOutcomeCategory,
    addressOptionsGroupAnchorRejectedReasons: calibratedFallbackGuardSummary.addressOptionsGroupAnchorRejectedReasons,
    addressOptionsGroupAnchorEvidenceSummary: calibratedFallbackGuardSummary.addressOptionsGroupAnchorEvidenceSummary,
    addressOptionsGroupAnchorSourcesChecked: calibratedFallbackGuardSummary.addressOptionsGroupAnchorSourcesChecked,
    addressOptionsGroupAnchorSafeTokensObserved: calibratedFallbackGuardSummary.addressOptionsGroupAnchorSafeTokensObserved,
    radioGroupAccessibleNameBucketsPresent: calibratedFallbackGuardSummary.radioGroupAccessibleNameBucketsPresent,
    radioGroupLegendBucketsPresent: calibratedFallbackGuardSummary.radioGroupLegendBucketsPresent,
    radioGroupQuestionPromptBucketsPresent: calibratedFallbackGuardSummary.radioGroupQuestionPromptBucketsPresent,
    radioGroupSectionHeaderBucketsPresent: calibratedFallbackGuardSummary.radioGroupSectionHeaderBucketsPresent,
    radioGroupAssociationBucketsPresent: calibratedFallbackGuardSummary.radioGroupAssociationBucketsPresent,
    candidateOrderStable: calibratedFallbackGuardSummary.candidateOrderStable,
    conflictingCueDetected: calibratedFallbackGuardSummary.conflictingCueDetected,
  };
}

function expectedProofOfAddressUploadVisibility(selectedToggleSlot: number | null): boolean | null {
  if (selectedToggleSlot === 1 || selectedToggleSlot === 2) return true;
  if (selectedToggleSlot === 3) return false;
  return null;
}

function expectedPhysicalOperatingAddressFieldsVisibility(selectedToggleSlot: number | null): boolean | null {
  if (selectedToggleSlot === 2) return true;
  if (selectedToggleSlot === 1 || selectedToggleSlot === 3) return false;
  return null;
}

function buildPhysicalOperatingAddressUiEffectOutcomeCategory(
  after: PhysicalOperatingAddressUiEffectSnapshot,
): PhysicalOperatingAddressUiEffectOutcomeCategory {
  if (after.proofOfAddressUploadVisible && after.physicalOperatingAddressFieldsVisible) {
    return 'proof-address-visible-physical-fields-visible';
  }
  if (after.proofOfAddressUploadVisible && !after.physicalOperatingAddressFieldsVisible) {
    return 'proof-address-visible-physical-fields-hidden';
  }
  if (!after.proofOfAddressUploadVisible && after.physicalOperatingAddressFieldsVisible) {
    return 'proof-address-hidden-physical-fields-visible';
  }
  return 'proof-address-hidden-physical-fields-hidden';
}

export function buildPhysicalOperatingAddressUiEffectSummary(input: {
  before: PhysicalOperatingAddressUiEffectSnapshot;
  after: PhysicalOperatingAddressUiEffectSnapshot;
  selectedToggleSlot: number | null;
}): PhysicalOperatingAddressUiEffectSummary {
  return {
    proofOfAddressUploadVisibleBefore: input.before.proofOfAddressUploadVisible,
    proofOfAddressUploadVisibleAfter: input.after.proofOfAddressUploadVisible,
    proofOfAddressUploadVisibilityChanged:
      input.before.proofOfAddressUploadVisible !== input.after.proofOfAddressUploadVisible,
    proofOfAddressUploadExpectedForSelectedOption: expectedProofOfAddressUploadVisibility(input.selectedToggleSlot),
    physicalOperatingAddressFieldsVisibleBefore: input.before.physicalOperatingAddressFieldsVisible,
    physicalOperatingAddressFieldsVisibleAfter: input.after.physicalOperatingAddressFieldsVisible,
    physicalOperatingAddressFieldsVisibilityChanged:
      input.before.physicalOperatingAddressFieldsVisible !== input.after.physicalOperatingAddressFieldsVisible,
    physicalOperatingAddressFieldsExpectedForSelectedOption:
      expectedPhysicalOperatingAddressFieldsVisibility(input.selectedToggleSlot),
    uiEffectOutcomeCategory: buildPhysicalOperatingAddressUiEffectOutcomeCategory(input.after),
  };
}

const DEFAULT_PHYSICAL_OPERATING_ADDRESS_UI_EFFECT_SNAPSHOT: PhysicalOperatingAddressUiEffectSnapshot = {
  proofOfAddressUploadVisible: false,
  physicalOperatingAddressFieldsVisible: false,
};

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
  return collectBoundedSanitizedToggleFragments(entries, limit).fragments;
}

function collectBoundedSanitizedToggleFragments(
  entries: ToggleCueFragment[],
  limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT,
): BoundedSanitizedToggleFragments {
  const fragments: string[] = [];
  const seen = new Set<string>();
  let uniqueCount = 0;

  for (const entry of entries) {
    const sanitized = sanitizeToggleDiagnosticFragment(entry.value);
    if (!sanitized || seen.has(sanitized)) continue;

    seen.add(sanitized);
    uniqueCount += 1;
    if (fragments.length < limit) fragments.push(sanitized);
  }

  return {
    fragments,
    truncated: uniqueCount > fragments.length,
  };
}

function collectSanitizedToggleNearbyFragments(
  entries: ToggleCueFragment[],
  limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT,
): Array<{ source: string; text: string }> {
  return collectBoundedSanitizedToggleNearbyFragments(entries, limit).fragments;
}

function collectBoundedSanitizedToggleNearbyFragments(
  entries: ToggleCueFragment[],
  limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT,
): BoundedSanitizedToggleNearbyFragments {
  const fragments: Array<{ source: string; text: string }> = [];
  const seen = new Set<string>();
  let uniqueCount = 0;

  for (const entry of entries) {
    const sanitized = sanitizeToggleDiagnosticFragment(entry.value);
    if (!sanitized) continue;

    const key = `${entry.source}:${sanitized}`;
    if (seen.has(key)) continue;

    seen.add(key);
    uniqueCount += 1;
    if (fragments.length < limit) fragments.push({ source: entry.source, text: sanitized });
  }

  return {
    fragments,
    truncated: uniqueCount > fragments.length,
  };
}

function collectBoundedSanitizedToggleLayoutFragments(
  entries: LayoutProximityLabelCandidate[] | null | undefined,
  limit = TOGGLE_INVENTORY_FRAGMENT_LIMIT,
): BoundedSanitizedToggleLayoutFragments {
  const fragments: Array<{
    direction: LayoutProximityDirection;
    distanceBucket: LayoutProximityDistanceBucket;
    association: LayoutProximityAssociation;
    text: string;
  }> = [];
  const seen = new Set<string>();
  let uniqueCount = 0;

  for (const entry of entries ?? []) {
    const sanitized = sanitizeToggleDiagnosticFragment(entry.value);
    if (!sanitized) continue;

    const key = `${entry.direction}|${entry.distanceBucket}|${entry.association}|${sanitized}`;
    if (seen.has(key)) continue;

    seen.add(key);
    uniqueCount += 1;
    if (fragments.length < limit) {
      fragments.push({
        direction: entry.direction,
        distanceBucket: entry.distanceBucket,
        association: entry.association,
        text: sanitized,
      });
    }
  }

  return {
    fragments,
    truncated: uniqueCount > fragments.length,
  };
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
  const cueFragments = collectToggleCueFragments(field, { includeLayoutProximity: true });
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
    .map(({ field, analysis }, index): PhysicalOperatingAddressToggleFallbackInventoryEntry => {
      const cueContext = buildToggleCueContext(field, { includeLayoutProximity: true });
      const resolvedLabelFragments = collectBoundedSanitizedToggleFragments(cueContext.currentLabelEntries, 2);
      const groupLabelFragments = collectBoundedSanitizedToggleFragments(cueContext.groupEntries, 2);
      const ancestorTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.ancestorEntries);
      const siblingTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.siblingEntries);
      const containerParentTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.containerParentEntries);
      const containerGrandparentTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.containerGrandparentEntries);
      const containerSectionTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.containerSectionEntries);
      const containerPrecedingTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.containerPrecedingEntries);
      const containerFollowingTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.containerFollowingEntries);
      const layoutProximityTextFragments = collectBoundedSanitizedToggleLayoutFragments(field.layoutProximityLabels);
      const nearbyTextFragments = collectBoundedSanitizedToggleNearbyFragments(cueContext.nearbyEntries);
      const attributeCueMatches = buildPhysicalOperatingAddressCuePatternMatches(cueContext.attributeSignatureEntries);
      const proxyCueMatches = buildPhysicalOperatingAddressCuePatternMatches(cueContext.proxyReferenceSignatureEntries);
      const graphicCueMatches = buildPhysicalOperatingAddressCuePatternMatches(cueContext.radioGraphicSignatureEntries);

      return {
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
        resolvedLabelFragments: resolvedLabelFragments.fragments,
        resolvedLabelTruncated: resolvedLabelFragments.truncated,
        resolvedLabelCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.currentLabelEntries),
        groupLabelFragments: groupLabelFragments.fragments,
        groupLabelTruncated: groupLabelFragments.truncated,
        groupCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.groupEntries),
        ancestorTextFragments: ancestorTextFragments.fragments,
        ancestorTextTruncated: ancestorTextFragments.truncated,
        ancestorCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.ancestorEntries),
        siblingTextFragments: siblingTextFragments.fragments,
        siblingTextTruncated: siblingTextFragments.truncated,
        siblingCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.siblingEntries),
        containerParentTextFragments: containerParentTextFragments.fragments,
        containerParentTextTruncated: containerParentTextFragments.truncated,
        containerParentCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.containerParentEntries),
        containerGrandparentTextFragments: containerGrandparentTextFragments.fragments,
        containerGrandparentTextTruncated: containerGrandparentTextFragments.truncated,
        containerGrandparentCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.containerGrandparentEntries),
        containerSectionTextFragments: containerSectionTextFragments.fragments,
        containerSectionTextTruncated: containerSectionTextFragments.truncated,
        containerSectionCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.containerSectionEntries),
        containerPrecedingTextFragments: containerPrecedingTextFragments.fragments,
        containerPrecedingTextTruncated: containerPrecedingTextFragments.truncated,
        containerPrecedingCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.containerPrecedingEntries),
        containerFollowingTextFragments: containerFollowingTextFragments.fragments,
        containerFollowingTextTruncated: containerFollowingTextFragments.truncated,
        containerFollowingCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.containerFollowingEntries),
        layoutProximityTextFragments: layoutProximityTextFragments.fragments,
        layoutProximityTextTruncated: layoutProximityTextFragments.truncated,
        layoutProximityCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.layoutProximityEntries),
        nonTextLayoutSignature: field.nonTextLayoutSignature ?? null,
        domAttributeSignature: field.domAttributeSignature ?? null,
        attributeCueMatches,
        proxyReferenceSignature: field.proxyReferenceSignature ?? null,
        proxyCueMatches,
        radioGraphicSignature: field.radioGraphicSignature ?? null,
        graphicCueMatches,
        nearbyLabelFragments: nearbyTextFragments.fragments,
        nearbyTextFragments: nearbyTextFragments.fragments,
        nearbyTextTruncated: nearbyTextFragments.truncated,
        nearbyCueMatches: buildPhysicalOperatingAddressCuePatternMatches(cueContext.nearbyEntries),
        cueMatches: analysis.cueMatches,
        selectedByFallback: analysis.selectedByFallback,
        excludedReasons: analysis.selectedByFallback ? [] : analysis.excludedReasons,
      };
    });
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
    calibratedFallback: null,
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
      selectionReason: 'primary-operating-address-cue',
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
        selectionReason: 'fallback-explicit-physical-cue',
        primaryInventory,
        fallbackInventory,
      };
    }

    const calibratedFallback = buildCalibratedPhysicalOperatingAddressFallbackDiagnostics(
      fields,
      primaryInventory,
      fallbackInventory,
    );
    const fallbackInventoryWithCalibrated = {
      ...fallbackInventory,
      calibratedFallback,
    };

    if (calibratedFallback.allowed) {
      const eligibleFallbackCandidates = fields.filter(
        (field) => buildPhysicalOperatingAddressToggleFallbackAnalysis(field).eligibleRadioLike,
      );
      const calibratedField = eligibleFallbackCandidates[CALIBRATED_BUSINESS_PRIMARY_LOCATION_TARGET_SLOT - 1] ?? null;

      if (calibratedField) {
        return {
          selectedField: calibratedField,
          selectionMode: 'calibrated-fallback',
          selectionReason: CALIBRATED_BUSINESS_PRIMARY_LOCATION_FALLBACK_REASON,
          primaryInventory,
          fallbackInventory: fallbackInventoryWithCalibrated,
        };
      }
    }

    return {
      selectedField: null,
      selectionMode: null,
      selectionReason: null,
      primaryInventory,
      fallbackInventory: fallbackInventoryWithCalibrated,
    };
  }

  return {
    selectedField: null,
    selectionMode: null,
    selectionReason: null,
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
  const beforeUiEffectSnapshot = await capturePhysicalOperatingAddressUiEffectSnapshot(frame)
    .catch(() => DEFAULT_PHYSICAL_OPERATING_ADDRESS_UI_EFFECT_SNAPSHOT);

  if (!guardedPhysicalOperatingAddressDiscoveryEnabled(env)) {
    diagnostics.push('physical-operating-address discovery toggle: disabled');
    const toggleSelectionSummary: PhysicalOperatingAddressToggleSelectionSummary = {
      toggleSelectionOutcomeCategory: 'no-safe-toggle-selected',
      toggleSelectionStage: 'none',
      toggleSelectionMode: null,
      selectedToggleSlot: null,
      selectedToggleReason: null,
      fallbackReason: null,
      calibratedFallbackConsidered: false,
      calibratedFallbackAllowed: null,
      calibratedFallbackSelected: false,
      calibratedFallbackSelectedSlot: null,
      calibratedFallbackRejectedReasons: [],
      calibratedFallbackGuardSummary: buildDefaultPhysicalOperatingAddressCalibratedFallbackGuardSummary(),
      primarySelectionCandidateCount: 0,
      cueBasedFallbackCandidateCount: 0,
      calibratedFallbackCandidateCount: 0,
      eligibleRadioCandidateCount: 0,
      exactThreeRadioGuardPassed: false,
      addressOptionsAnchorMatched: false,
      addressOptionsAnchorOutcomeCategory: 'anchor-not-checked',
      addressOptionsAnchorRejectedReasons: [],
      addressOptionsAnchorEvidenceSummary: 'anchor check skipped because the exact-three-radio guard failed',
      addressOptionsAnchorSourcesChecked: [],
      addressOptionsAnchorSafeTokensObserved: [],
      addressOptionsAnchorTextBucketsPresent: [],
      addressOptionsAnchorFieldKeyBucketsPresent: [],
      addressOptionsAnchorContainerBucketsPresent: [],
      addressOptionsAnchorAttributeBucketsPresent: [],
      candidateOrderStable: false,
      conflictingCueDetected: false,
    };
    return {
      fields: initialFields,
      diagnostics,
      expanded: false,
      probeReport: null,
      captureReport: null,
      toggleSelectionSummary,
      uiEffectSummary: buildPhysicalOperatingAddressUiEffectSummary({
        before: beforeUiEffectSnapshot,
        after: beforeUiEffectSnapshot,
        selectedToggleSlot: null,
      }),
      expansionAttempted: false,
      expansionSkippedReason: 'no-selected-toggle',
    };
  }

  const toggleSelection = explainPhysicalOperatingAddressToggleSelection(initialFields);
  const toggleSelectionSummary = buildPhysicalOperatingAddressToggleSelectionSummary(toggleSelection);
  if (toggleSelection.fallbackInventory) {
    diagnostics.push(
      `physical-operating-address discovery toggle fallback inventory: ${JSON.stringify(toggleSelection.fallbackInventory)}`,
    );
    if (toggleSelection.selectionMode === 'fallback') {
      diagnostics.push('physical-operating-address discovery toggle candidate source: fallback radio-like candidate');
    }
    if (toggleSelection.selectionMode === 'calibrated-fallback') {
      diagnostics.push('physical-operating-address discovery toggle candidate source: calibrated business primary location fallback');
    }
  }

  if (toggleSelection.selectionReason) {
    diagnostics.push(`physical-operating-address discovery toggle selection reason: ${toggleSelection.selectionReason}`);
  }

  const toggleField = toggleSelection.selectedField;
  if (!toggleField) {
    diagnostics.push('physical-operating-address discovery toggle: no unique visible isOperatingAddress radio candidate found');
    diagnostics.push(
      `physical-operating-address discovery toggle inventory: ${JSON.stringify(toggleSelection.primaryInventory)}`,
    );
    return {
      fields: initialFields,
      diagnostics,
      expanded: false,
      probeReport: null,
      captureReport: null,
      toggleSelectionSummary,
      uiEffectSummary: buildPhysicalOperatingAddressUiEffectSummary({
        before: beforeUiEffectSnapshot,
        after: beforeUiEffectSnapshot,
        selectedToggleSlot: null,
      }),
      expansionAttempted: false,
      expansionSkippedReason: 'no-selected-toggle',
    };
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
  const afterUiEffectSnapshot = await capturePhysicalOperatingAddressUiEffectSnapshot(frame)
    .catch(() => beforeUiEffectSnapshot);

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
      toggleSelectionSummary,
      uiEffectSummary: buildPhysicalOperatingAddressUiEffectSummary({
        before: beforeUiEffectSnapshot,
        after: afterUiEffectSnapshot,
        selectedToggleSlot: toggleSelectionSummary.selectedToggleSlot,
      }),
      expansionAttempted: true,
      expansionSkippedReason: null,
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

  return {
    fields,
    diagnostics,
    expanded: true,
    probeReport,
    captureReport,
    toggleSelectionSummary,
    uiEffectSummary: buildPhysicalOperatingAddressUiEffectSummary({
      before: beforeUiEffectSnapshot,
      after: afterUiEffectSnapshot,
      selectedToggleSlot: toggleSelectionSummary.selectedToggleSlot,
    }),
    expansionAttempted: true,
    expansionSkippedReason: null,
  };
}