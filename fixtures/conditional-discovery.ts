import {
  discoverFields,
  type DiscoveredField,
  type FieldDiscoveryRadioBuilderSkipReason,
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
  'index' | 'kind' | 'type' | 'controlCategory' | 'visible' | 'editable' | 'resolvedLabel' | 'label' | 'sectionName' | 'rawCandidateLabels' | 'containerContextLabels' | 'layoutProximityLabels' | 'nonTextLayoutSignature' | 'domAttributeSignature' | 'proxyReferenceSignature' | 'radioGraphicSignature' | 'radioSurfaceDiagnostics' | 'groupName' | 'idOrNameKey' | 'inferredType'
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

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory =
  | 'ownership-anchor-matched-aria-labelledby'
  | 'ownership-anchor-matched-aria-describedby'
  | 'ownership-anchor-matched-shared-name'
  | 'ownership-anchor-matched-shared-owner'
  | 'ownership-anchor-matched-docusign-owner'
  | 'ownership-anchor-missing-no-safe-evidence'
  | 'ownership-anchor-missing-safe-evidence-empty'
  | 'ownership-anchor-missing-only-generated-reference'
  | 'ownership-anchor-missing-only-generic-evidence'
  | 'ownership-anchor-not-checked';

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason =
  | 'ownership-anchor-missing'
  | 'no-safe-evidence'
  | 'safe-evidence-empty'
  | 'only-generated-reference'
  | 'only-generic-evidence'
  | 'not-checked-prior-guard-failed';

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary =
  | 'matched via resolved aria-labelledby reference bucket'
  | 'matched via resolved aria-describedby reference bucket'
  | 'matched via shared radio-group name bucket'
  | 'matched via shared owner-reference bucket'
  | 'matched via DocuSign owner metadata bucket'
  | 'checked ownership/reference sources contained no safe anchor bucket'
  | 'checked ownership/reference sources were empty'
  | 'only generated ownership/reference buckets were observed'
  | 'only generic ownership/reference buckets were observed'
  | 'ownership anchor check skipped because the exact-three-radio guard failed';

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked =
  | 'aria-labelledby'
  | 'aria-describedby'
  | 'shared-name'
  | 'shared-owner'
  | 'docusign-owner';

export type PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory =
  | 'ownership-source-not-attempted'
  | 'ownership-source-empty'
  | 'ownership-source-attributes-present-no-targets'
  | 'ownership-source-targets-present-no-safe-tokens'
  | 'ownership-source-generated-only'
  | 'ownership-source-generic-only'
  | 'ownership-source-filtered-by-redaction'
  | 'ownership-source-safe-tokens-present'
  | 'ownership-source-prior-guard-failed';

export type PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason =
  | 'not-attempted'
  | 'prior-guard-failed'
  | 'sources-empty'
  | 'reference-targets-missing'
  | 'reference-targets-present-no-safe-tokens'
  | 'generated-only'
  | 'generic-only'
  | 'filtered-by-redaction';

export type PhysicalOperatingAddressOwnershipSourceHarvestSummary =
  | 'ownership source harvest was not attempted'
  | 'ownership source harvest skipped because the exact-three-radio guard failed'
  | 'ownership source harvest found no ownership/reference sources'
  | 'ownership source harvest found ownership/reference attributes but no targets'
  | 'ownership source harvest found reference targets but no safe token buckets'
  | 'ownership source harvest found only generated ownership/reference evidence'
  | 'ownership source harvest found only generic ownership/reference evidence'
  | 'ownership source harvest found source evidence but safety guards filtered it before bucketing'
  | 'ownership source harvest found safe ownership/reference token buckets';

export type PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory =
  | 'ownership-input-not-checked'
  | 'ownership-input-all-candidates-empty'
  | 'ownership-input-signatures-present-no-ownership-surfaces'
  | 'ownership-input-ownership-surfaces-present-not-harvested'
  | 'ownership-input-generated-only'
  | 'ownership-input-generic-only'
  | 'ownership-input-safe-source-present'
  | 'ownership-input-prior-guard-failed';

export type PhysicalOperatingAddressOwnershipSourceInputRejectedReason =
  | 'prior-guard-failed'
  | 'all-candidates-empty'
  | 'no-signatures-present'
  | 'signatures-present-no-ownership-surfaces'
  | 'ownership-surfaces-present-not-harvested'
  | 'generated-only'
  | 'generic-only'
  | 'no-safe-source-token'
  | 'another-bounded-reason';

export type PhysicalOperatingAddressOwnershipSourceInputSummary =
  | 'ownership source input check was not performed'
  | 'ownership source input check skipped because the exact-three-radio guard failed'
  | 'ownership source input check found all exact-three-radio candidates empty before harvest'
  | 'ownership source input check found candidate signatures but no ownership-capable surfaces'
  | 'ownership source input check found ownership-capable surfaces that did not feed harvest sources'
  | 'ownership source input check found only generated ownership/reference source buckets before harvest'
  | 'ownership source input check found only generic ownership/reference source buckets before harvest'
  | 'ownership source input check found safe ownership/reference source buckets before harvest';

export type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory =
  | 'field-discovery-radio-surface-not-checked'
  | 'field-discovery-radio-surfaces-present'
  | 'field-discovery-radio-all-surfaces-empty'
  | 'field-discovery-radio-builders-skipped'
  | 'field-discovery-radio-built-but-not-attached'
  | 'field-discovery-radio-attached-but-filtered'
  | 'field-discovery-radio-generated-only'
  | 'field-discovery-radio-unsafe-omitted'
  | 'field-discovery-radio-prior-guard-failed';

export type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason =
  | 'prior-guard-failed'
  | 'no-visible-radio-fields'
  | 'no-visible-editable-radio-fields'
  | 'exact-three-candidates-missing'
  | 'builders-skipped'
  | 'built-but-not-attached'
  | 'attached-but-filtered'
  | 'all-surfaces-empty'
  | 'generated-only'
  | 'unsafe-omitted'
  | 'another-bounded-reason';

export type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary =
  | 'field discovery radio surface check was not performed'
  | 'field discovery radio surface check skipped because the exact-three-radio guard failed'
  | 'field discovery radio surface check found bounded diagnostic surfaces on the exact-three radio candidates'
  | 'field discovery radio surface check found the exact-three radio candidates surface-empty before ownership input diagnostics'
  | 'field discovery radio surface builders were skipped before exact-three candidate summarization'
  | 'field discovery radio surfaces were built but not attached to discovered fields'
  | 'field discovery radio surfaces were attached on discovered fields but filtered before exact-three candidate summarization'
  | 'field discovery radio surfaces were reduced to generated-only evidence before exact-three candidate summarization'
  | 'field discovery radio surfaces were omitted as unsafe before exact-three candidate summarization';

export type PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory =
  | 'candidate-signature-source-not-checked'
  | 'candidate-signature-source-all-surfaces-empty'
  | 'candidate-signature-source-reduced-candidate-shape'
  | 'candidate-signature-source-original-fields-have-surfaces'
  | 'candidate-signature-source-fallback-candidates-lost-surfaces'
  | 'candidate-signature-source-surfaces-present-but-not-owned'
  | 'candidate-signature-source-prior-guard-failed';

export type PhysicalOperatingAddressCandidateSignatureSourceRejectedReason =
  | 'prior-guard-failed'
  | 'all-surfaces-empty'
  | 'reduced-candidate-shape'
  | 'original-fields-have-surfaces-but-fallback-lost-them'
  | 'surfaces-present-but-not-owned'
  | 'no-safe-field-key'
  | 'no-safe-signature-surface'
  | 'another-bounded-reason';

export type PhysicalOperatingAddressCandidateSignatureSourceSummary =
  | 'candidate signature source check was not performed'
  | 'candidate signature source check skipped because the exact-three-radio guard failed'
  | 'candidate signature source check found all candidate diagnostic surfaces empty'
  | 'candidate signature source check found only reduced fallback candidate shape before ownership input diagnostics'
  | 'candidate signature source check found original field surfaces that fallback candidates did not preserve'
  | 'candidate signature source check found original fields preserving diagnostic surfaces before ownership input diagnostics'
  | 'candidate signature source check found safe candidate surfaces that ownership-input diagnostics do not use';

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket =
  | 'business-primary-location'
  | 'registered-legal-address'
  | 'proof-of-address'
  | 'physical-operating-address'
  | 'po-box'
  | 'virtual-agent'
  | 'address-options'
  | 'radio-group'
  | 'question-prompt'
  | 'generated-reference-only'
  | 'generic-only';

export type PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory =
  | 'shared-name'
  | 'shared-owner'
  | 'docusign-owner'
  | 'generated-reference-only'
  | 'generic-only'
  | 'none'
  | 'not-checked';

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
  addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory;
  addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[];
  addressOptionsOwnershipAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary;
  addressOptionsOwnershipAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[];
  addressOptionsOwnershipAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaLabelledbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaDescribedbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedNameBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupDocusignOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupReferenceTargetExists: boolean;
  radioGroupReferenceTargetVisible: boolean;
  radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory;
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary;
  fieldDiscoveryTotalFieldCount: number;
  fieldDiscoveryVisibleRadioInputCount: number;
  fieldDiscoveryVisibleEditableRadioInputCount: number;
  fieldDiscoveryExactThreeRadioCandidateCount: number;
  fieldDiscoveryRadioBuildersAttempted: boolean;
  fieldDiscoveryRadioBuildersSkipped: boolean;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number;
  fieldDiscoveryRadioFieldsWithInputNameCount: number;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean;
  candidateSignatureSourceSummaryPresent: boolean;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary;
  candidateSignatureSourceCandidateCount: number;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number;
  candidateSignatureSourceCandidatesWithInputTypeCount: number;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number;
  candidateSignatureSourceCandidatesWithGroupNameCount: number;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number;
  candidateSignatureSourceAllCandidatesReducedShape: boolean;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean;
  ownershipSourceInputSummaryPresent: boolean;
  ownershipSourceInputOutcomeCategory: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory;
  ownershipSourceInputRejectedReasons: PhysicalOperatingAddressOwnershipSourceInputRejectedReason[];
  ownershipSourceInputSummary: PhysicalOperatingAddressOwnershipSourceInputSummary;
  ownershipSourceCandidateCount: number;
  ownershipSourceCandidatesWithAnySignatureCount: number;
  ownershipSourceCandidatesWithProxySignatureCount: number;
  ownershipSourceCandidatesWithDomAttributeSignatureCount: number;
  ownershipSourceCandidatesWithRadioGraphicSignatureCount: number;
  ownershipSourceCandidatesWithLayoutSignatureCount: number;
  ownershipSourceCandidatesWithFieldKeyCount: number;
  ownershipSourceCandidatesWithInputNameCount: number;
  ownershipSourceCandidatesWithAriaAttributePresenceCount: number;
  ownershipSourceCandidatesWithDataAttributePresenceCount: number;
  ownershipSourceCandidatesWithDocusignAttributePresenceCount: number;
  ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: number;
  ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: number;
  ownershipSourceInputAllCandidatesEmpty: boolean;
  ownershipSourceInputAnyCandidateHadUsableSource: boolean;
  ownershipSourceInputHarvestGapDetected: boolean;
  ownershipSourceHarvestAttempted: boolean;
  ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory;
  ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[];
  ownershipSourceHarvestSummary: PhysicalOperatingAddressOwnershipSourceHarvestSummary;
  ariaLabelledbyAttributePresentCount: number;
  ariaDescribedbyAttributePresentCount: number;
  sharedNamePresentCount: number;
  sharedOwnerPresentCount: number;
  docusignOwnerSignalPresentCount: number;
  ownershipReferenceTargetLookupAttempted: boolean;
  ownershipReferenceTargetExistsCount: number;
  ownershipReferenceTargetVisibleCount: number;
  ownershipReferenceTargetSafeTokenCount: number;
  ownershipEvidenceFilteredAsGeneratedOnlyCount: number;
  ownershipEvidenceFilteredAsGenericOnlyCount: number;
  ownershipEvidenceFilteredByRedactionCount: number;
  ownershipEvidenceSourcesEmpty: boolean;
  ownershipEvidenceSourcesPresentButNoSafeTokens: boolean;
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
  addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory;
  addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[];
  addressOptionsOwnershipAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary;
  addressOptionsOwnershipAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[];
  addressOptionsOwnershipAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaLabelledbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaDescribedbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedNameBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupDocusignOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupReferenceTargetExists: boolean;
  radioGroupReferenceTargetVisible: boolean;
  radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory;
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary;
  fieldDiscoveryTotalFieldCount: number;
  fieldDiscoveryVisibleRadioInputCount: number;
  fieldDiscoveryVisibleEditableRadioInputCount: number;
  fieldDiscoveryExactThreeRadioCandidateCount: number;
  fieldDiscoveryRadioBuildersAttempted: boolean;
  fieldDiscoveryRadioBuildersSkipped: boolean;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number;
  fieldDiscoveryRadioFieldsWithInputNameCount: number;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean;
  candidateSignatureSourceSummaryPresent: boolean;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary;
  candidateSignatureSourceCandidateCount: number;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number;
  candidateSignatureSourceCandidatesWithInputTypeCount: number;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number;
  candidateSignatureSourceCandidatesWithGroupNameCount: number;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number;
  candidateSignatureSourceAllCandidatesReducedShape: boolean;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean;
  ownershipSourceInputSummaryPresent: boolean;
  ownershipSourceInputOutcomeCategory: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory;
  ownershipSourceInputRejectedReasons: PhysicalOperatingAddressOwnershipSourceInputRejectedReason[];
  ownershipSourceInputSummary: PhysicalOperatingAddressOwnershipSourceInputSummary;
  ownershipSourceCandidateCount: number;
  ownershipSourceCandidatesWithAnySignatureCount: number;
  ownershipSourceCandidatesWithProxySignatureCount: number;
  ownershipSourceCandidatesWithDomAttributeSignatureCount: number;
  ownershipSourceCandidatesWithRadioGraphicSignatureCount: number;
  ownershipSourceCandidatesWithLayoutSignatureCount: number;
  ownershipSourceCandidatesWithFieldKeyCount: number;
  ownershipSourceCandidatesWithInputNameCount: number;
  ownershipSourceCandidatesWithAriaAttributePresenceCount: number;
  ownershipSourceCandidatesWithDataAttributePresenceCount: number;
  ownershipSourceCandidatesWithDocusignAttributePresenceCount: number;
  ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: number;
  ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: number;
  ownershipSourceInputAllCandidatesEmpty: boolean;
  ownershipSourceInputAnyCandidateHadUsableSource: boolean;
  ownershipSourceInputHarvestGapDetected: boolean;
  ownershipSourceHarvestAttempted: boolean;
  ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory;
  ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[];
  ownershipSourceHarvestSummary: PhysicalOperatingAddressOwnershipSourceHarvestSummary;
  ariaLabelledbyAttributePresentCount: number;
  ariaDescribedbyAttributePresentCount: number;
  sharedNamePresentCount: number;
  sharedOwnerPresentCount: number;
  docusignOwnerSignalPresentCount: number;
  ownershipReferenceTargetLookupAttempted: boolean;
  ownershipReferenceTargetExistsCount: number;
  ownershipReferenceTargetVisibleCount: number;
  ownershipReferenceTargetSafeTokenCount: number;
  ownershipEvidenceFilteredAsGeneratedOnlyCount: number;
  ownershipEvidenceFilteredAsGenericOnlyCount: number;
  ownershipEvidenceFilteredByRedactionCount: number;
  ownershipEvidenceSourcesEmpty: boolean;
  ownershipEvidenceSourcesPresentButNoSafeTokens: boolean;
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
const ADDRESS_OPTIONS_OWNERSHIP_ANCHOR_SOURCES_CHECKED: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[] = [
  'aria-labelledby',
  'aria-describedby',
  'shared-name',
  'shared-owner',
  'docusign-owner',
];
const ADDRESS_OPTIONS_OWNERSHIP_ANCHOR_TOKEN_BUCKET_ORDER: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] = [
  'business-primary-location',
  'registered-legal-address',
  'proof-of-address',
  'physical-operating-address',
  'po-box',
  'virtual-agent',
  'address-options',
  'radio-group',
  'question-prompt',
  'generated-reference-only',
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

type PhysicalOperatingAddressCandidateSignatureSourceDiagnostics = {
  candidateSignatureSourceSummaryPresent: boolean;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary;
  candidateSignatureSourceCandidateCount: number;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number;
  candidateSignatureSourceCandidatesWithInputTypeCount: number;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number;
  candidateSignatureSourceCandidatesWithGroupNameCount: number;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number;
  candidateSignatureSourceAllCandidatesReducedShape: boolean;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean;
};

type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceDiagnostics = {
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary;
  fieldDiscoveryTotalFieldCount: number;
  fieldDiscoveryVisibleRadioInputCount: number;
  fieldDiscoveryVisibleEditableRadioInputCount: number;
  fieldDiscoveryExactThreeRadioCandidateCount: number;
  fieldDiscoveryRadioBuildersAttempted: boolean;
  fieldDiscoveryRadioBuildersSkipped: boolean;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number;
  fieldDiscoveryRadioFieldsWithInputNameCount: number;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean;
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
  addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory;
  addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[];
  addressOptionsOwnershipAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary;
  addressOptionsOwnershipAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[];
  addressOptionsOwnershipAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaLabelledbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaDescribedbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedNameBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupDocusignOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupReferenceTargetExists: boolean;
  radioGroupReferenceTargetVisible: boolean;
  radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory;
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary;
  fieldDiscoveryTotalFieldCount: number;
  fieldDiscoveryVisibleRadioInputCount: number;
  fieldDiscoveryVisibleEditableRadioInputCount: number;
  fieldDiscoveryExactThreeRadioCandidateCount: number;
  fieldDiscoveryRadioBuildersAttempted: boolean;
  fieldDiscoveryRadioBuildersSkipped: boolean;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number;
  fieldDiscoveryRadioFieldsWithInputNameCount: number;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean;
  candidateSignatureSourceSummaryPresent: boolean;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary;
  candidateSignatureSourceCandidateCount: number;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number;
  candidateSignatureSourceCandidatesWithInputTypeCount: number;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number;
  candidateSignatureSourceCandidatesWithGroupNameCount: number;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number;
  candidateSignatureSourceAllCandidatesReducedShape: boolean;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean;
  ownershipSourceHarvestAttempted: boolean;
  ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory;
  ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[];
  ownershipSourceHarvestSummary: PhysicalOperatingAddressOwnershipSourceHarvestSummary;
  ariaLabelledbyAttributePresentCount: number;
  ariaDescribedbyAttributePresentCount: number;
  sharedNamePresentCount: number;
  sharedOwnerPresentCount: number;
  docusignOwnerSignalPresentCount: number;
  ownershipReferenceTargetLookupAttempted: boolean;
  ownershipReferenceTargetExistsCount: number;
  ownershipReferenceTargetVisibleCount: number;
  ownershipReferenceTargetSafeTokenCount: number;
  ownershipEvidenceFilteredAsGeneratedOnlyCount: number;
  ownershipEvidenceFilteredAsGenericOnlyCount: number;
  ownershipEvidenceFilteredByRedactionCount: number;
  ownershipEvidenceSourcesEmpty: boolean;
  ownershipEvidenceSourcesPresentButNoSafeTokens: boolean;
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

function resolveSharedNormalizedTextValue(values: Array<string | null | undefined>): string | null {
  if (values.length === 0) return null;

  const normalizedValues = values.map((value) => normalizeText(value));
  if (normalizedValues.some((value) => !value)) return null;

  const firstValue = normalizedValues[0];
  if (!firstValue) return null;

  return normalizedValues.every((value) => value === firstValue) ? firstValue : null;
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

function sortUniqueAddressOptionsOwnershipAnchorTokenBuckets(
  values: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[],
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] {
  const seen = new Set(values);
  return ADDRESS_OPTIONS_OWNERSHIP_ANCHOR_TOKEN_BUCKET_ORDER.filter((bucket) => seen.has(bucket));
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

function collectAddressOptionsOwnershipAnchorTextBuckets(
  values: Array<string | null | undefined>,
  source: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked,
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] {
  const buckets: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const matchable = toMatchableText(normalized);
    const localBuckets: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] = [];

    if (BUSINESS_PRIMARY_LOCATION_RE.test(matchable)) localBuckets.push('business-primary-location');
    if (REGISTERED_LEGAL_ADDRESS_RE.test(matchable) || LEGAL_ADDRESS_RE.test(matchable)) {
      localBuckets.push('registered-legal-address');
    }
    if (PROOF_OF_ADDRESS_RE.test(matchable)) localBuckets.push('proof-of-address');
    if (PHYSICAL_ADDRESS_RE.test(matchable) || OPERATING_ADDRESS_RE.test(matchable) || BUSINESS_PHYSICAL_ADDRESS_RE.test(matchable)) {
      localBuckets.push('physical-operating-address');
    }
    if (PO_BOX_RE.test(matchable)) localBuckets.push('po-box');
    if (VIRTUAL_AGENT_RE.test(matchable)) localBuckets.push('virtual-agent');
    if (ADDRESS_OPTIONS_RE.test(matchable)) localBuckets.push('address-options');
    if ((source === 'shared-name' || source === 'shared-owner') && /\bradio\b|\bgroup\b/i.test(matchable)) {
      localBuckets.push('radio-group');
    }
    if (source === 'aria-describedby' && (matchable.includes('?') || /\b(is|does|do|can|will|should|would)\b/i.test(matchable))) {
      localBuckets.push('question-prompt');
    }
    if (localBuckets.length === 0 && ADDRESS_OPTIONS_ANCHOR_GENERIC_TEXT_RE.test(matchable)) {
      localBuckets.push('generic-only');
    }

    buckets.push(...localBuckets);
  }

  return sortUniqueAddressOptionsOwnershipAnchorTokenBuckets(buckets);
}

function collectAddressOptionsOwnershipAnchorHintBuckets(
  values: string[],
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] {
  const buckets: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] = [];

  for (const value of values) {
    const normalized = normalizeText(value)?.toLowerCase();
    if (!normalized) continue;

    if (
      normalized.includes('business-physical-address-token')
      || normalized.includes('physical-operating-address-token')
      || normalized.includes('operating-address-token')
    ) {
      buckets.push('physical-operating-address');
    }
    if (normalized.includes('legal-address-token')) buckets.push('registered-legal-address');
    if (normalized.includes('virtual-address-token')) buckets.push('virtual-agent');
    if (normalized.includes('address-like-token')) buckets.push('address-options');
    if (normalized.includes('generated-token-pattern')) buckets.push('generated-reference-only');
    if (
      normalized.includes('mailing-address-token')
      || normalized.includes('same-token')
      || normalized.includes('different-token')
      || normalized.includes('yes-token')
      || normalized.includes('no-token')
      || normalized.includes('empty-value')
    ) {
      buckets.push('generic-only');
    }
  }

  return sortUniqueAddressOptionsOwnershipAnchorTokenBuckets(buckets);
}

function intersectAddressOptionsOwnershipAnchorTokenBuckets(
  bucketSets: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[][],
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] {
  if (bucketSets.length === 0) return [];

  const [firstBucketSet, ...remainingBucketSets] = bucketSets;
  const sharedBuckets = new Set(firstBucketSet);

  for (const bucketSet of remainingBucketSets) {
    for (const bucket of [...sharedBuckets]) {
      if (!bucketSet.includes(bucket)) {
        sharedBuckets.delete(bucket);
      }
    }
  }

  return sortUniqueAddressOptionsOwnershipAnchorTokenBuckets([...sharedBuckets]);
}

function isNonSafeOnlyAddressOptionsOwnershipAnchorTokenBucket(
  bucket: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket,
): boolean {
  return bucket === 'address-options'
    || bucket === 'radio-group'
    || bucket === 'question-prompt'
    || bucket === 'generated-reference-only'
    || bucket === 'generic-only';
}

function countOwnershipSafeReferenceTokenBuckets(
  buckets: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[],
): number {
  return buckets.filter(isNonGenericAddressOptionsOwnershipAnchorTokenBucket).length;
}

function hasAnyOwnershipReferenceTargetExists(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  return Boolean(signature && (
    signature.forReferenceTargetExists
    || signature.ariaLabelledByTargetExists
    || signature.ariaDescribedByTargetExists
    || signature.ariaControlsTargetExists
    || signature.dataReferenceTargetExists
    || signature.docuSignReferenceTargetExists
  ));
}

function hasAnyOwnershipReferenceTargetVisible(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  return Boolean(signature && (
    signature.forReferenceTargetVisible
    || signature.ariaLabelledByTargetVisible
    || signature.ariaDescribedByTargetVisible
    || signature.ariaControlsTargetVisible
    || signature.dataReferenceTargetVisible
    || signature.docuSignReferenceTargetVisible
  ));
}

function hasAnyOwnershipReferenceLookupSignal(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  return Boolean(signature && (
    signature.hasForIdReference
    || signature.hasAriaLabelledByReference
    || signature.hasAriaDescribedByReference
    || signature.hasAriaControlsReference
    || signature.hasDataReference
    || signature.hasDocuSignReference
  ));
}

function hasOwnershipSourceFilteredByRedactionSignal(
  field: GuardedToggleField,
  source: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked,
): boolean {
  if (source === 'shared-name') {
    return Boolean(normalizeText(field.groupName));
  }

  if (source === 'shared-owner' || source === 'docusign-owner') {
    const signature = field.proxyReferenceSignature;
    const attributeSignature = field.domAttributeSignature;
    return Boolean(
      (signature?.tokenShapeCount ?? 0) > 0
      || (signature?.valueHintCount ?? 0) > 0
      || (attributeSignature?.tokenShapeCount ?? 0) > 0
      || (attributeSignature?.valueHintCount ?? 0) > 0,
    );
  }

  const signature = field.proxyReferenceSignature;
  return Boolean(signature && (
    signature.tokenShapeCount > 0 || signature.valueHintCount > 0
  ));
}

function hasAnyOwnershipSourceInputSignature(field: GuardedToggleField): boolean {
  return Boolean(
    field.nonTextLayoutSignature
    || field.domAttributeSignature
    || field.proxyReferenceSignature
    || field.radioGraphicSignature,
  );
}

function hasAnyOwnershipSourceInputAriaAttributePresence(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  const attributeSignature = field.domAttributeSignature;

  return Boolean(
    attributeSignature?.hasAriaLabel
    || attributeSignature?.hasAriaLabelledBy
    || attributeSignature?.hasAriaDescribedBy
    || signature?.hasProxyAriaLabel
    || signature?.hasProxyAriaLabelledBy
    || signature?.hasProxyAriaDescribedBy
    || signature?.hasProxyAriaControls
    || signature?.hasAriaLabelledByReference
    || signature?.hasAriaDescribedByReference
    || signature?.hasAriaControlsReference,
  );
}

function hasAnyOwnershipSourceInputDataAttributePresence(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  const attributeSignature = field.domAttributeSignature;

  return Boolean(
    attributeSignature?.hasDataAttributes
    || signature?.hasProxyDataAttributes
    || signature?.hasDataReference,
  );
}

function hasAnyOwnershipSourceInputDocusignAttributePresence(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  const attributeSignature = field.domAttributeSignature;

  return Boolean(
    attributeSignature?.hasDocuSignMetadataAttributes
    || signature?.hasProxyDocuSignMetadataAttributes
    || signature?.hasDocuSignReference,
  );
}

function hasAnyOwnershipSourceInputReferenceLikeAttributePresence(field: GuardedToggleField): boolean {
  const signature = field.proxyReferenceSignature;
  const attributeSignature = field.domAttributeSignature;

  return Boolean(
    attributeSignature?.hasAriaLabelledBy
    || attributeSignature?.hasAriaDescribedBy
    || attributeSignature?.hasDataAttributes
    || attributeSignature?.hasDocuSignMetadataAttributes
    || signature?.hasProxyForAttribute
    || signature?.hasProxyAriaLabelledBy
    || signature?.hasProxyAriaDescribedBy
    || signature?.hasProxyAriaControls
    || signature?.hasProxyDataAttributes
    || signature?.hasProxyDocuSignMetadataAttributes
    || signature?.hasForIdReference
    || signature?.hasAriaLabelledByReference
    || signature?.hasAriaDescribedByReference
    || signature?.hasAriaControlsReference
    || signature?.hasDataReference
    || signature?.hasDocuSignReference,
  );
}

function isVisibleRadioInputField(field: GuardedToggleField): boolean {
  return field.kind === 'radio'
    && field.visible
    && (field.type ?? '').toLowerCase() === 'radio';
}

function isVisibleEditableRadioInputField(field: GuardedToggleField): boolean {
  return isVisibleRadioInputField(field) && field.editable;
}

function resolveFieldDiscoveryRadioSurfaceDiagnostics(field: GuardedToggleField) {
  if (field.radioSurfaceDiagnostics) return field.radioSurfaceDiagnostics;

  const hasIdOrNameKey = Boolean(normalizeText(field.idOrNameKey));
  const hasGroupName = Boolean(normalizeText(field.groupName));
  const hasResolvedLabel = Boolean(normalizeText(field.resolvedLabel));
  const hasContainerContext = (field.containerContextLabels?.length ?? 0) > 0;
  const hasLayoutProximity = (field.layoutProximityLabels?.length ?? 0) > 0;
  const hasLabelBucket = (field.rawCandidateLabels?.length ?? 0) > 0
    || hasContainerContext
    || hasLayoutProximity
    || hasResolvedLabel;
  const hasProxyReference = Boolean(field.proxyReferenceSignature);
  const hasDomAttribute = Boolean(field.domAttributeSignature);
  const hasRadioGraphic = Boolean(field.radioGraphicSignature);
  const hasNonTextLayout = Boolean(field.nonTextLayoutSignature);
  const anyDiagnosticSurface = hasIdOrNameKey
    || hasGroupName
    || hasResolvedLabel
    || hasLabelBucket
    || hasProxyReference
    || hasDomAttribute
    || hasRadioGraphic
    || hasNonTextLayout
    || hasContainerContext
    || hasLayoutProximity;

  return {
    buildersAttempted: isVisibleRadioInputField(field),
    buildersSkipped: field.kind === 'radio' && !isVisibleRadioInputField(field),
    builderSkipReasons: field.kind === 'radio' && !isVisibleRadioInputField(field)
      ? ['not-radio-like']
      : [],
    hasSafeFieldKey: hasIdOrNameKey,
    hasIdOrNameKey,
    hasInputName: hasGroupName,
    hasGroupName,
    hasResolvedLabel,
    hasLabelBucket,
    hasProxyReference,
    hasDomAttribute,
    hasRadioGraphic,
    hasNonTextLayout,
    hasContainerContext,
    hasLayoutProximity,
    generatedOnly: false,
    unsafeOmitted: false,
    genericOnly: false,
    anyDiagnosticSurface,
    surfaceEmpty: !anyDiagnosticSurface,
    attachmentGapDetected: false,
  };
}

function buildFieldDiscoveryRadioSurfaceSummary(
  category: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory,
): PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary {
  switch (category) {
    case 'field-discovery-radio-surfaces-present':
      return 'field discovery radio surface check found bounded diagnostic surfaces on the exact-three radio candidates';
    case 'field-discovery-radio-all-surfaces-empty':
      return 'field discovery radio surface check found the exact-three radio candidates surface-empty before ownership input diagnostics';
    case 'field-discovery-radio-builders-skipped':
      return 'field discovery radio surface builders were skipped before exact-three candidate summarization';
    case 'field-discovery-radio-built-but-not-attached':
      return 'field discovery radio surfaces were built but not attached to discovered fields';
    case 'field-discovery-radio-attached-but-filtered':
      return 'field discovery radio surfaces were attached on discovered fields but filtered before exact-three candidate summarization';
    case 'field-discovery-radio-generated-only':
      return 'field discovery radio surfaces were reduced to generated-only evidence before exact-three candidate summarization';
    case 'field-discovery-radio-unsafe-omitted':
      return 'field discovery radio surfaces were omitted as unsafe before exact-three candidate summarization';
    case 'field-discovery-radio-prior-guard-failed':
      return 'field discovery radio surface check skipped because the exact-three-radio guard failed';
    case 'field-discovery-radio-surface-not-checked':
    default:
      return 'field discovery radio surface check was not performed';
  }
}

function buildPhysicalOperatingAddressFieldDiscoveryRadioSurfaceDiagnostics(input: {
  fields: GuardedToggleField[];
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory;
  exactThreeRadioGuardPassed: boolean;
}): PhysicalOperatingAddressFieldDiscoveryRadioSurfaceDiagnostics {
  const visibleRadioInputFields = input.fields.filter(isVisibleRadioInputField);
  const visibleEditableRadioInputFields = input.fields.filter(isVisibleEditableRadioInputField);
  const exactThreeRadioCandidateFields = input.fallbackInventory.entries
    .map((entry) => visibleEditableRadioInputFields.find((field) => field.index === entry.fieldIndex) ?? null)
    .filter((field): field is GuardedToggleField => Boolean(field));
  const exactThreeRadioCandidateDiagnostics = exactThreeRadioCandidateFields.map(
    resolveFieldDiscoveryRadioSurfaceDiagnostics,
  );
  const visibleEditableRadioDiagnostics = visibleEditableRadioInputFields.map(
    resolveFieldDiscoveryRadioSurfaceDiagnostics,
  );

  const fieldDiscoveryTotalFieldCount = input.fields.length;
  const fieldDiscoveryVisibleRadioInputCount = visibleRadioInputFields.length;
  const fieldDiscoveryVisibleEditableRadioInputCount = visibleEditableRadioInputFields.length;
  const fieldDiscoveryExactThreeRadioCandidateCount = exactThreeRadioCandidateFields.length;
  const fieldDiscoveryRadioBuildersAttempted = exactThreeRadioCandidateDiagnostics.length > 0
    && exactThreeRadioCandidateDiagnostics.every((diagnostic) => diagnostic.buildersAttempted);
  const fieldDiscoveryRadioBuildersSkipped = exactThreeRadioCandidateDiagnostics.some(
    (diagnostic) => diagnostic.buildersSkipped,
  );
  const fieldDiscoveryRadioBuilderSkipReasons = Array.from(new Set(
    exactThreeRadioCandidateDiagnostics.flatMap((diagnostic) => diagnostic.builderSkipReasons),
  ));
  const fieldDiscoveryRadioFieldsWithSafeFieldKeyCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasSafeFieldKey,
  ).length;
  const fieldDiscoveryRadioFieldsWithIdOrNameKeyCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasIdOrNameKey,
  ).length;
  const fieldDiscoveryRadioFieldsWithInputNameCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasInputName,
  ).length;
  const fieldDiscoveryRadioFieldsWithGroupNameCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasGroupName,
  ).length;
  const fieldDiscoveryRadioFieldsWithResolvedLabelCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasResolvedLabel,
  ).length;
  const fieldDiscoveryRadioFieldsWithAnyLabelBucketCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasLabelBucket,
  ).length;
  const fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasProxyReference,
  ).length;
  const fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasDomAttribute,
  ).length;
  const fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasRadioGraphic,
  ).length;
  const fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasNonTextLayout,
  ).length;
  const fieldDiscoveryRadioFieldsWithContainerContextLabelsCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasContainerContext,
  ).length;
  const fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.hasLayoutProximity,
  ).length;
  const fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.anyDiagnosticSurface,
  ).length;
  const fieldDiscoveryRadioFieldsSurfaceEmptyCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.surfaceEmpty,
  ).length;
  const fieldDiscoveryRadioFieldsGeneratedOnlyCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.generatedOnly,
  ).length;
  const fieldDiscoveryRadioFieldsUnsafeOmittedCount = exactThreeRadioCandidateDiagnostics.filter(
    (diagnostic) => diagnostic.unsafeOmitted,
  ).length;
  const fieldDiscoveryRadioSurfaceAttachmentGapDetected = exactThreeRadioCandidateDiagnostics.some(
    (diagnostic) => diagnostic.attachmentGapDetected,
  );
  const fieldDiscoveryRadioSurfaceFilteringGapDetected = visibleEditableRadioDiagnostics.some(
    (diagnostic) => diagnostic.anyDiagnosticSurface,
  ) && exactThreeRadioCandidateDiagnostics.length > 0
    && exactThreeRadioCandidateDiagnostics.every((diagnostic) => !diagnostic.anyDiagnosticSurface)
    && visibleEditableRadioDiagnostics.length > exactThreeRadioCandidateDiagnostics.length;
  const fieldDiscoveryRadioSurfaceUpstreamAbsentDetected = exactThreeRadioCandidateDiagnostics.length > 0
    && fieldDiscoveryRadioBuildersAttempted
    && !fieldDiscoveryRadioBuildersSkipped
    && !fieldDiscoveryRadioSurfaceAttachmentGapDetected
    && !fieldDiscoveryRadioSurfaceFilteringGapDetected
    && fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount === 0;
  const fieldDiscoveryRadioSurfaceSummaryPresent = input.exactThreeRadioGuardPassed
    && fieldDiscoveryExactThreeRadioCandidateCount > 0;

  let fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory =
    'field-discovery-radio-prior-guard-failed';
  if (!input.exactThreeRadioGuardPassed) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-prior-guard-failed';
  } else if (!fieldDiscoveryRadioSurfaceSummaryPresent) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-surface-not-checked';
  } else if (fieldDiscoveryRadioSurfaceAttachmentGapDetected) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-built-but-not-attached';
  } else if (fieldDiscoveryRadioSurfaceFilteringGapDetected) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-attached-but-filtered';
  } else if (fieldDiscoveryRadioBuildersSkipped) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-builders-skipped';
  } else if (
    fieldDiscoveryRadioFieldsGeneratedOnlyCount > 0
    && fieldDiscoveryRadioFieldsGeneratedOnlyCount === fieldDiscoveryExactThreeRadioCandidateCount
  ) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-generated-only';
  } else if (
    fieldDiscoveryRadioFieldsUnsafeOmittedCount > 0
    && fieldDiscoveryRadioFieldsUnsafeOmittedCount === fieldDiscoveryExactThreeRadioCandidateCount
  ) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-unsafe-omitted';
  } else if (fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount > 0) {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-surfaces-present';
  } else {
    fieldDiscoveryRadioSurfaceOutcomeCategory = 'field-discovery-radio-all-surfaces-empty';
  }

  const fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[] = [];
  if (!input.exactThreeRadioGuardPassed) {
    fieldDiscoveryRadioSurfaceRejectedReasons.push('prior-guard-failed');
  } else {
    if (fieldDiscoveryVisibleRadioInputCount === 0) {
      fieldDiscoveryRadioSurfaceRejectedReasons.push('no-visible-radio-fields');
    }
    if (fieldDiscoveryVisibleEditableRadioInputCount === 0) {
      fieldDiscoveryRadioSurfaceRejectedReasons.push('no-visible-editable-radio-fields');
    }
    if (fieldDiscoveryExactThreeRadioCandidateCount === 0) {
      fieldDiscoveryRadioSurfaceRejectedReasons.push('exact-three-candidates-missing');
    }

    switch (fieldDiscoveryRadioSurfaceOutcomeCategory) {
      case 'field-discovery-radio-builders-skipped':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('builders-skipped');
        break;
      case 'field-discovery-radio-built-but-not-attached':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('built-but-not-attached');
        break;
      case 'field-discovery-radio-attached-but-filtered':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('attached-but-filtered');
        break;
      case 'field-discovery-radio-generated-only':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('generated-only');
        break;
      case 'field-discovery-radio-unsafe-omitted':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('unsafe-omitted');
        break;
      case 'field-discovery-radio-all-surfaces-empty':
        fieldDiscoveryRadioSurfaceRejectedReasons.push('all-surfaces-empty');
        break;
      case 'field-discovery-radio-surface-not-checked':
        if (fieldDiscoveryRadioSurfaceRejectedReasons.length === 0) {
          fieldDiscoveryRadioSurfaceRejectedReasons.push('another-bounded-reason');
        }
        break;
      default:
        break;
    }
  }

  return {
    fieldDiscoveryRadioSurfaceSummaryPresent,
    fieldDiscoveryRadioSurfaceOutcomeCategory,
    fieldDiscoveryRadioSurfaceRejectedReasons,
    fieldDiscoveryRadioSurfaceSummary:
      buildFieldDiscoveryRadioSurfaceSummary(fieldDiscoveryRadioSurfaceOutcomeCategory),
    fieldDiscoveryTotalFieldCount,
    fieldDiscoveryVisibleRadioInputCount,
    fieldDiscoveryVisibleEditableRadioInputCount,
    fieldDiscoveryExactThreeRadioCandidateCount,
    fieldDiscoveryRadioBuildersAttempted,
    fieldDiscoveryRadioBuildersSkipped,
    fieldDiscoveryRadioBuilderSkipReasons,
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount,
    fieldDiscoveryRadioFieldsWithInputNameCount,
    fieldDiscoveryRadioFieldsWithGroupNameCount,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected,
    fieldDiscoveryRadioSurfaceFilteringGapDetected,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected,
  };
}

function hasAnyCandidateSignatureSourceLabelBucket(
  entry: PhysicalOperatingAddressToggleFallbackInventoryEntry,
): boolean {
  return entry.resolvedLabelFragments.length > 0
    || entry.groupLabelFragments.length > 0
    || entry.ancestorTextFragments.length > 0
    || entry.siblingTextFragments.length > 0
    || entry.containerParentTextFragments.length > 0
    || entry.containerGrandparentTextFragments.length > 0
    || entry.containerSectionTextFragments.length > 0
    || entry.containerPrecedingTextFragments.length > 0
    || entry.containerFollowingTextFragments.length > 0
    || entry.layoutProximityTextFragments.length > 0
    || entry.nearbyLabelFragments.length > 0
    || entry.nearbyTextFragments.length > 0;
}

function hasAnyCandidateSignatureSourcePreservedSurface(
  entry: PhysicalOperatingAddressToggleFallbackInventoryEntry,
): boolean {
  return Boolean(
    normalizeText(entry.fieldKey)
    || entry.proxyReferenceSignature
    || entry.domAttributeSignature
    || entry.radioGraphicSignature
    || entry.nonTextLayoutSignature
    || hasAnyCandidateSignatureSourceLabelBucket(entry)
  );
}

function hasAnyCandidateSignatureSourceRichSurface(
  field: GuardedToggleField,
  entry: PhysicalOperatingAddressToggleFallbackInventoryEntry | null,
): boolean {
  return Boolean(
    normalizeText(entry?.fieldKey ?? null)
    || normalizeText(field.idOrNameKey)
    || field.proxyReferenceSignature
    || field.domAttributeSignature
    || field.radioGraphicSignature
    || field.nonTextLayoutSignature
    || (field.containerContextLabels?.length ?? 0) > 0
    || (field.layoutProximityLabels?.length ?? 0) > 0
    || normalizeText(field.groupName)
    || normalizeText(field.resolvedLabel)
    || (entry && hasAnyCandidateSignatureSourceLabelBucket(entry))
  );
}

function buildPhysicalOperatingAddressCandidateSignatureSourceDiagnostics(input: {
  fields: GuardedToggleField[];
  fallbackInventory: PhysicalOperatingAddressToggleFallbackInventory;
  exactThreeRadioGuardPassed: boolean;
}): PhysicalOperatingAddressCandidateSignatureSourceDiagnostics {
  const originalVisibleRadioLikeFields = input.fields
    .map((field) => ({ field, analysis: buildPhysicalOperatingAddressToggleFallbackAnalysis(field) }))
    .filter(({ analysis }) => analysis.visibleRadioLike)
    .map(({ field }) => field);
  const pairedCandidates = input.fallbackInventory.entries.map((entry) => ({
    entry,
    field: originalVisibleRadioLikeFields.find((candidate) => candidate.index === entry.fieldIndex) ?? null,
  }));
  const candidateSignatureSourceCandidateCount = input.fallbackInventory.entries.length;
  const candidateSignatureSourceCandidatesWithOriginalFieldCount = pairedCandidates.filter(({ field }) => Boolean(field)).length;
  const candidateSignatureSourceCandidatesWithSafeFieldKeyCount = input.fallbackInventory.entries.filter(
    (entry) => Boolean(normalizeText(entry.fieldKey)),
  ).length;
  const candidateSignatureSourceCandidatesWithIdOrNameKeyCount = pairedCandidates.filter(
    ({ field }) => Boolean(field && normalizeText(field.idOrNameKey)),
  ).length;
  const candidateSignatureSourceCandidatesWithInputTypeCount = input.fallbackInventory.entries.filter(
    (entry) => Boolean(normalizeText(entry.inputType)),
  ).length;
  const candidateSignatureSourceCandidatesWithControlCategoryCount = input.fallbackInventory.entries.filter(
    (entry) => Boolean(normalizeText(entry.controlCategory)),
  ).length;
  const candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount = pairedCandidates.filter(
    ({ field }) => Boolean(field?.proxyReferenceSignature),
  ).length;
  const candidateSignatureSourceCandidatesWithDomAttributeSignatureCount = pairedCandidates.filter(
    ({ field }) => Boolean(field?.domAttributeSignature),
  ).length;
  const candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount = pairedCandidates.filter(
    ({ field }) => Boolean(field?.radioGraphicSignature),
  ).length;
  const candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount = pairedCandidates.filter(
    ({ field }) => Boolean(field?.nonTextLayoutSignature),
  ).length;
  const candidateSignatureSourceCandidatesWithContainerContextLabelsCount = pairedCandidates.filter(
    ({ field }) => Boolean(field && (field.containerContextLabels?.length ?? 0) > 0),
  ).length;
  const candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount = pairedCandidates.filter(
    ({ field }) => Boolean(field && (field.layoutProximityLabels?.length ?? 0) > 0),
  ).length;
  const candidateSignatureSourceCandidatesWithGroupNameCount = pairedCandidates.filter(
    ({ field }) => Boolean(field && normalizeText(field.groupName)),
  ).length;
  const candidateSignatureSourceCandidatesWithResolvedLabelCount = pairedCandidates.filter(
    ({ field }) => Boolean(field && normalizeText(field.resolvedLabel)),
  ).length;
  const candidateSignatureSourceCandidatesWithAnyLabelBucketCount = input.fallbackInventory.entries.filter(
    hasAnyCandidateSignatureSourceLabelBucket,
  ).length;
  const candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount = pairedCandidates.filter(
    ({ field, entry }) => Boolean(field && hasAnyCandidateSignatureSourceRichSurface(field, entry)),
  ).length;
  const candidateSignatureSourceAllCandidatesSurfaceEmpty = candidateSignatureSourceCandidateCount > 0
    && candidateSignatureSourceCandidatesWithSafeFieldKeyCount === 0
    && candidateSignatureSourceCandidatesWithIdOrNameKeyCount === 0
    && candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount === 0
    && candidateSignatureSourceCandidatesWithDomAttributeSignatureCount === 0
    && candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount === 0
    && candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount === 0
    && candidateSignatureSourceCandidatesWithContainerContextLabelsCount === 0
    && candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount === 0
    && candidateSignatureSourceCandidatesWithGroupNameCount === 0
    && candidateSignatureSourceCandidatesWithResolvedLabelCount === 0
    && candidateSignatureSourceCandidatesWithAnyLabelBucketCount === 0;
  const candidateSignatureSourceAllCandidatesReducedShape = candidateSignatureSourceAllCandidatesSurfaceEmpty
    && candidateSignatureSourceCandidateCount > 0
    && candidateSignatureSourceCandidatesWithOriginalFieldCount === candidateSignatureSourceCandidateCount
    && candidateSignatureSourceCandidatesWithInputTypeCount === candidateSignatureSourceCandidateCount
    && candidateSignatureSourceCandidatesWithControlCategoryCount === candidateSignatureSourceCandidateCount;
  const candidateSignatureSourcePotentialPropagationGapDetected = pairedCandidates.some(({ field, entry }) => Boolean(
    field
    && (
      normalizeText(field.idOrNameKey)
      || field.proxyReferenceSignature
      || field.domAttributeSignature
      || field.radioGraphicSignature
      || field.nonTextLayoutSignature
      || (field.containerContextLabels?.length ?? 0) > 0
      || (field.layoutProximityLabels?.length ?? 0) > 0
      || normalizeText(field.groupName)
      || normalizeText(field.resolvedLabel)
    )
    && entry
    && !hasAnyCandidateSignatureSourcePreservedSurface(entry)
  ));
  const candidateSignatureSourceSummaryPresent = input.exactThreeRadioGuardPassed
    && candidateSignatureSourceCandidateCount > 0;

  let candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory =
    'candidate-signature-source-prior-guard-failed';
  if (!input.exactThreeRadioGuardPassed) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-prior-guard-failed';
  } else if (!candidateSignatureSourceSummaryPresent) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-not-checked';
  } else if (candidateSignatureSourcePotentialPropagationGapDetected) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-fallback-candidates-lost-surfaces';
  } else if (candidateSignatureSourceAllCandidatesReducedShape) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-reduced-candidate-shape';
  } else if (candidateSignatureSourceAllCandidatesSurfaceEmpty) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-all-surfaces-empty';
  } else if (candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount > 0
    && candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount === 0
    && candidateSignatureSourceCandidatesWithDomAttributeSignatureCount === 0
    && candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount === 0
    && candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount === 0) {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-surfaces-present-but-not-owned';
  } else {
    candidateSignatureSourceOutcomeCategory = 'candidate-signature-source-original-fields-have-surfaces';
  }

  const candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[] = [];
  switch (candidateSignatureSourceOutcomeCategory) {
    case 'candidate-signature-source-not-checked':
      candidateSignatureSourceRejectedReasons.push('another-bounded-reason');
      break;
    case 'candidate-signature-source-all-surfaces-empty':
      candidateSignatureSourceRejectedReasons.push('all-surfaces-empty', 'no-safe-signature-surface');
      break;
    case 'candidate-signature-source-reduced-candidate-shape':
      candidateSignatureSourceRejectedReasons.push('reduced-candidate-shape', 'no-safe-signature-surface');
      if (candidateSignatureSourceCandidatesWithSafeFieldKeyCount === 0) {
        candidateSignatureSourceRejectedReasons.push('no-safe-field-key');
      }
      break;
    case 'candidate-signature-source-fallback-candidates-lost-surfaces':
      candidateSignatureSourceRejectedReasons.push('original-fields-have-surfaces-but-fallback-lost-them');
      break;
    case 'candidate-signature-source-surfaces-present-but-not-owned':
      candidateSignatureSourceRejectedReasons.push('surfaces-present-but-not-owned', 'no-safe-signature-surface');
      if (candidateSignatureSourceCandidatesWithSafeFieldKeyCount === 0) {
        candidateSignatureSourceRejectedReasons.push('no-safe-field-key');
      }
      break;
    case 'candidate-signature-source-prior-guard-failed':
      candidateSignatureSourceRejectedReasons.push('prior-guard-failed');
      break;
    case 'candidate-signature-source-original-fields-have-surfaces':
    default:
      break;
  }

  return {
    candidateSignatureSourceSummaryPresent,
    candidateSignatureSourceOutcomeCategory,
    candidateSignatureSourceRejectedReasons,
    candidateSignatureSourceSummary: buildCandidateSignatureSourceSummary(candidateSignatureSourceOutcomeCategory),
    candidateSignatureSourceCandidateCount,
    candidateSignatureSourceCandidatesWithOriginalFieldCount,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount,
    candidateSignatureSourceCandidatesWithInputTypeCount,
    candidateSignatureSourceCandidatesWithControlCategoryCount,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount,
    candidateSignatureSourceCandidatesWithGroupNameCount,
    candidateSignatureSourceCandidatesWithResolvedLabelCount,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount,
    candidateSignatureSourceAllCandidatesReducedShape,
    candidateSignatureSourceAllCandidatesSurfaceEmpty,
    candidateSignatureSourcePotentialPropagationGapDetected,
  };
}

function collectOwnershipSourceInputCandidateBuckets(
  field: GuardedToggleField,
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[] {
  const sharedName = normalizeText(field.groupName);

  return sortUniqueAddressOptionsOwnershipAnchorTokenBuckets([
    ...collectAddressOptionsOwnershipAnchorTextBuckets(sharedName ? [sharedName] : [], 'shared-name'),
    ...collectAddressOptionsOwnershipAnchorHintBuckets([
      ...(field.domAttributeSignature?.valueHintBuckets ?? []),
      ...(field.proxyReferenceSignature?.valueHintBuckets ?? []),
    ]),
  ]);
}

function buildOwnershipSourceInputSummary(
  category: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory,
): PhysicalOperatingAddressOwnershipSourceInputSummary {
  switch (category) {
    case 'ownership-input-not-checked':
      return 'ownership source input check was not performed';
    case 'ownership-input-all-candidates-empty':
      return 'ownership source input check found all exact-three-radio candidates empty before harvest';
    case 'ownership-input-signatures-present-no-ownership-surfaces':
      return 'ownership source input check found candidate signatures but no ownership-capable surfaces';
    case 'ownership-input-ownership-surfaces-present-not-harvested':
      return 'ownership source input check found ownership-capable surfaces that did not feed harvest sources';
    case 'ownership-input-generated-only':
      return 'ownership source input check found only generated ownership/reference source buckets before harvest';
    case 'ownership-input-generic-only':
      return 'ownership source input check found only generic ownership/reference source buckets before harvest';
    case 'ownership-input-safe-source-present':
      return 'ownership source input check found safe ownership/reference source buckets before harvest';
    case 'ownership-input-prior-guard-failed':
    default:
      return 'ownership source input check skipped because the exact-three-radio guard failed';
  }
}

function buildCandidateSignatureSourceSummary(
  category: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory,
): PhysicalOperatingAddressCandidateSignatureSourceSummary {
  switch (category) {
    case 'candidate-signature-source-all-surfaces-empty':
      return 'candidate signature source check found all candidate diagnostic surfaces empty';
    case 'candidate-signature-source-reduced-candidate-shape':
      return 'candidate signature source check found only reduced fallback candidate shape before ownership input diagnostics';
    case 'candidate-signature-source-fallback-candidates-lost-surfaces':
      return 'candidate signature source check found original field surfaces that fallback candidates did not preserve';
    case 'candidate-signature-source-original-fields-have-surfaces':
      return 'candidate signature source check found original fields preserving diagnostic surfaces before ownership input diagnostics';
    case 'candidate-signature-source-surfaces-present-but-not-owned':
      return 'candidate signature source check found safe candidate surfaces that ownership-input diagnostics do not use';
    case 'candidate-signature-source-prior-guard-failed':
      return 'candidate signature source check skipped because the exact-three-radio guard failed';
    case 'candidate-signature-source-not-checked':
    default:
      return 'candidate signature source check was not performed';
  }
}

function buildOwnershipSourceHarvestSummary(
  category: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory,
): PhysicalOperatingAddressOwnershipSourceHarvestSummary {
  switch (category) {
    case 'ownership-source-not-attempted':
      return 'ownership source harvest was not attempted';
    case 'ownership-source-empty':
      return 'ownership source harvest found no ownership/reference sources';
    case 'ownership-source-attributes-present-no-targets':
      return 'ownership source harvest found ownership/reference attributes but no targets';
    case 'ownership-source-targets-present-no-safe-tokens':
      return 'ownership source harvest found reference targets but no safe token buckets';
    case 'ownership-source-generated-only':
      return 'ownership source harvest found only generated ownership/reference evidence';
    case 'ownership-source-generic-only':
      return 'ownership source harvest found only generic ownership/reference evidence';
    case 'ownership-source-filtered-by-redaction':
      return 'ownership source harvest found source evidence but safety guards filtered it before bucketing';
    case 'ownership-source-safe-tokens-present':
      return 'ownership source harvest found safe ownership/reference token buckets';
    case 'ownership-source-prior-guard-failed':
    default:
      return 'ownership source harvest skipped because the exact-three-radio guard failed';
  }
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

function buildAddressOptionsOwnershipAnchorEvidenceSummary(
  category: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory,
): PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary {
  switch (category) {
    case 'ownership-anchor-matched-aria-labelledby':
      return 'matched via resolved aria-labelledby reference bucket';
    case 'ownership-anchor-matched-aria-describedby':
      return 'matched via resolved aria-describedby reference bucket';
    case 'ownership-anchor-matched-shared-name':
      return 'matched via shared radio-group name bucket';
    case 'ownership-anchor-matched-shared-owner':
      return 'matched via shared owner-reference bucket';
    case 'ownership-anchor-matched-docusign-owner':
      return 'matched via DocuSign owner metadata bucket';
    case 'ownership-anchor-missing-safe-evidence-empty':
      return 'checked ownership/reference sources were empty';
    case 'ownership-anchor-missing-only-generated-reference':
      return 'only generated ownership/reference buckets were observed';
    case 'ownership-anchor-missing-only-generic-evidence':
      return 'only generic ownership/reference buckets were observed';
    case 'ownership-anchor-not-checked':
      return 'ownership anchor check skipped because the exact-three-radio guard failed';
    case 'ownership-anchor-missing-no-safe-evidence':
    default:
      return 'checked ownership/reference sources contained no safe anchor bucket';
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
    addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-not-checked',
    addressOptionsOwnershipAnchorRejectedReasons: [],
    addressOptionsOwnershipAnchorEvidenceSummary: 'ownership anchor check skipped because the exact-three-radio guard failed',
    addressOptionsOwnershipAnchorSourcesChecked: [],
    addressOptionsOwnershipAnchorSafeTokensObserved: [],
    radioGroupAriaLabelledbyBucketsPresent: [],
    radioGroupAriaDescribedbyBucketsPresent: [],
    radioGroupSharedNameBucketsPresent: [],
    radioGroupSharedOwnerBucketsPresent: [],
    radioGroupDocusignOwnerBucketsPresent: [],
    radioGroupReferenceTargetExists: false,
    radioGroupReferenceTargetVisible: false,
    radioGroupCommonOwnerCategory: 'not-checked',
    fieldDiscoveryRadioSurfaceSummaryPresent: false,
    fieldDiscoveryRadioSurfaceOutcomeCategory: 'field-discovery-radio-prior-guard-failed',
    fieldDiscoveryRadioSurfaceRejectedReasons: ['prior-guard-failed'],
    fieldDiscoveryRadioSurfaceSummary: 'field discovery radio surface check skipped because the exact-three-radio guard failed',
    fieldDiscoveryTotalFieldCount: 0,
    fieldDiscoveryVisibleRadioInputCount: 0,
    fieldDiscoveryVisibleEditableRadioInputCount: 0,
    fieldDiscoveryExactThreeRadioCandidateCount: 0,
    fieldDiscoveryRadioBuildersAttempted: false,
    fieldDiscoveryRadioBuildersSkipped: false,
    fieldDiscoveryRadioBuilderSkipReasons: [],
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: 0,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: 0,
    fieldDiscoveryRadioFieldsWithInputNameCount: 0,
    fieldDiscoveryRadioFieldsWithGroupNameCount: 0,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount: 0,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: 0,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: 0,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: 0,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: 0,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: 0,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: 0,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: 0,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: 0,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount: 0,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount: 0,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount: 0,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected: false,
    fieldDiscoveryRadioSurfaceFilteringGapDetected: false,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: false,
    candidateSignatureSourceSummaryPresent: false,
    candidateSignatureSourceOutcomeCategory: 'candidate-signature-source-prior-guard-failed',
    candidateSignatureSourceRejectedReasons: ['prior-guard-failed'],
    candidateSignatureSourceSummary: 'candidate signature source check skipped because the exact-three-radio guard failed',
    candidateSignatureSourceCandidateCount: 0,
    candidateSignatureSourceCandidatesWithOriginalFieldCount: 0,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount: 0,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount: 0,
    candidateSignatureSourceCandidatesWithInputTypeCount: 0,
    candidateSignatureSourceCandidatesWithControlCategoryCount: 0,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: 0,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: 0,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: 0,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: 0,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount: 0,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: 0,
    candidateSignatureSourceCandidatesWithGroupNameCount: 0,
    candidateSignatureSourceCandidatesWithResolvedLabelCount: 0,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount: 0,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: 0,
    candidateSignatureSourceAllCandidatesReducedShape: false,
    candidateSignatureSourceAllCandidatesSurfaceEmpty: false,
    candidateSignatureSourcePotentialPropagationGapDetected: false,
    ownershipSourceInputSummaryPresent: false,
    ownershipSourceInputOutcomeCategory: 'ownership-input-prior-guard-failed',
    ownershipSourceInputRejectedReasons: ['prior-guard-failed'],
    ownershipSourceInputSummary: 'ownership source input check skipped because the exact-three-radio guard failed',
    ownershipSourceCandidateCount: 0,
    ownershipSourceCandidatesWithAnySignatureCount: 0,
    ownershipSourceCandidatesWithProxySignatureCount: 0,
    ownershipSourceCandidatesWithDomAttributeSignatureCount: 0,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount: 0,
    ownershipSourceCandidatesWithLayoutSignatureCount: 0,
    ownershipSourceCandidatesWithFieldKeyCount: 0,
    ownershipSourceCandidatesWithInputNameCount: 0,
    ownershipSourceCandidatesWithAriaAttributePresenceCount: 0,
    ownershipSourceCandidatesWithDataAttributePresenceCount: 0,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount: 0,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: 0,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: 0,
    ownershipSourceInputAllCandidatesEmpty: false,
    ownershipSourceInputAnyCandidateHadUsableSource: false,
    ownershipSourceInputHarvestGapDetected: false,
    ownershipSourceHarvestAttempted: false,
    ownershipSourceHarvestOutcomeCategory: 'ownership-source-prior-guard-failed',
    ownershipSourceHarvestRejectedReasons: ['prior-guard-failed'],
    ownershipSourceHarvestSummary: 'ownership source harvest skipped because the exact-three-radio guard failed',
    ariaLabelledbyAttributePresentCount: 0,
    ariaDescribedbyAttributePresentCount: 0,
    sharedNamePresentCount: 0,
    sharedOwnerPresentCount: 0,
    docusignOwnerSignalPresentCount: 0,
    ownershipReferenceTargetLookupAttempted: false,
    ownershipReferenceTargetExistsCount: 0,
    ownershipReferenceTargetVisibleCount: 0,
    ownershipReferenceTargetSafeTokenCount: 0,
    ownershipEvidenceFilteredAsGeneratedOnlyCount: 0,
    ownershipEvidenceFilteredAsGenericOnlyCount: 0,
    ownershipEvidenceFilteredByRedactionCount: 0,
    ownershipEvidenceSourcesEmpty: true,
    ownershipEvidenceSourcesPresentButNoSafeTokens: false,
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

function isNonGenericAddressOptionsOwnershipAnchorTokenBucket(
  bucket: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket,
): boolean {
  return bucket !== 'address-options'
    && bucket !== 'radio-group'
    && bucket !== 'question-prompt'
    && bucket !== 'generated-reference-only'
    && bucket !== 'generic-only';
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

function buildPhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidence(input: {
  fields: GuardedToggleField[];
  exactThreeRadioGuardPassed: boolean;
}): Pick<
  PhysicalOperatingAddressToggleCalibratedFallbackDiagnostics,
  | 'addressOptionsOwnershipAnchorOutcomeCategory'
  | 'addressOptionsOwnershipAnchorRejectedReasons'
  | 'addressOptionsOwnershipAnchorEvidenceSummary'
  | 'addressOptionsOwnershipAnchorSourcesChecked'
  | 'addressOptionsOwnershipAnchorSafeTokensObserved'
  | 'radioGroupAriaLabelledbyBucketsPresent'
  | 'radioGroupAriaDescribedbyBucketsPresent'
  | 'radioGroupSharedNameBucketsPresent'
  | 'radioGroupSharedOwnerBucketsPresent'
  | 'radioGroupDocusignOwnerBucketsPresent'
  | 'radioGroupReferenceTargetExists'
  | 'radioGroupReferenceTargetVisible'
  | 'radioGroupCommonOwnerCategory'
  | 'ownershipSourceInputSummaryPresent'
  | 'ownershipSourceInputOutcomeCategory'
  | 'ownershipSourceInputRejectedReasons'
  | 'ownershipSourceInputSummary'
  | 'ownershipSourceCandidateCount'
  | 'ownershipSourceCandidatesWithAnySignatureCount'
  | 'ownershipSourceCandidatesWithProxySignatureCount'
  | 'ownershipSourceCandidatesWithDomAttributeSignatureCount'
  | 'ownershipSourceCandidatesWithRadioGraphicSignatureCount'
  | 'ownershipSourceCandidatesWithLayoutSignatureCount'
  | 'ownershipSourceCandidatesWithFieldKeyCount'
  | 'ownershipSourceCandidatesWithInputNameCount'
  | 'ownershipSourceCandidatesWithAriaAttributePresenceCount'
  | 'ownershipSourceCandidatesWithDataAttributePresenceCount'
  | 'ownershipSourceCandidatesWithDocusignAttributePresenceCount'
  | 'ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount'
  | 'ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount'
  | 'ownershipSourceInputAllCandidatesEmpty'
  | 'ownershipSourceInputAnyCandidateHadUsableSource'
  | 'ownershipSourceInputHarvestGapDetected'
  | 'ownershipSourceHarvestAttempted'
  | 'ownershipSourceHarvestOutcomeCategory'
  | 'ownershipSourceHarvestRejectedReasons'
  | 'ownershipSourceHarvestSummary'
  | 'ariaLabelledbyAttributePresentCount'
  | 'ariaDescribedbyAttributePresentCount'
  | 'sharedNamePresentCount'
  | 'sharedOwnerPresentCount'
  | 'docusignOwnerSignalPresentCount'
  | 'ownershipReferenceTargetLookupAttempted'
  | 'ownershipReferenceTargetExistsCount'
  | 'ownershipReferenceTargetVisibleCount'
  | 'ownershipReferenceTargetSafeTokenCount'
  | 'ownershipEvidenceFilteredAsGeneratedOnlyCount'
  | 'ownershipEvidenceFilteredAsGenericOnlyCount'
  | 'ownershipEvidenceFilteredByRedactionCount'
  | 'ownershipEvidenceSourcesEmpty'
  | 'ownershipEvidenceSourcesPresentButNoSafeTokens'
> {
  const visibleRadioLikeFields = input.fields
    .map((field) => ({ field, analysis: buildPhysicalOperatingAddressToggleFallbackAnalysis(field) }))
    .filter(({ analysis }) => analysis.visibleRadioLike)
    .map(({ field }) => field);
  const ownershipSourceCandidateCount = visibleRadioLikeFields.length;
  const ownershipSourceCandidateBuckets = visibleRadioLikeFields.map((field) =>
    collectOwnershipSourceInputCandidateBuckets(field),
  );
  const ownershipSourceCandidatesWithAnySignatureCount = visibleRadioLikeFields.filter(
    hasAnyOwnershipSourceInputSignature,
  ).length;
  const ownershipSourceCandidatesWithProxySignatureCount = visibleRadioLikeFields.filter(
    (field) => Boolean(field.proxyReferenceSignature),
  ).length;
  const ownershipSourceCandidatesWithDomAttributeSignatureCount = visibleRadioLikeFields.filter(
    (field) => Boolean(field.domAttributeSignature),
  ).length;
  const ownershipSourceCandidatesWithRadioGraphicSignatureCount = visibleRadioLikeFields.filter(
    (field) => Boolean(field.radioGraphicSignature),
  ).length;
  const ownershipSourceCandidatesWithLayoutSignatureCount = visibleRadioLikeFields.filter(
    (field) => Boolean(field.nonTextLayoutSignature),
  ).length;
  const ownershipSourceCandidatesWithFieldKeyCount = visibleRadioLikeFields.filter(
    (field) => Boolean(normalizeText(field.idOrNameKey)),
  ).length;
  const ownershipSourceCandidatesWithInputNameCount = visibleRadioLikeFields.filter(
    (field) => Boolean(normalizeText(field.groupName)),
  ).length;
  const ownershipSourceCandidatesWithAriaAttributePresenceCount = visibleRadioLikeFields.filter(
    hasAnyOwnershipSourceInputAriaAttributePresence,
  ).length;
  const ownershipSourceCandidatesWithDataAttributePresenceCount = visibleRadioLikeFields.filter(
    hasAnyOwnershipSourceInputDataAttributePresence,
  ).length;
  const ownershipSourceCandidatesWithDocusignAttributePresenceCount = visibleRadioLikeFields.filter(
    hasAnyOwnershipSourceInputDocusignAttributePresence,
  ).length;
  const ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount = visibleRadioLikeFields.filter(
    hasAnyOwnershipSourceInputReferenceLikeAttributePresence,
  ).length;
  const ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount = ownershipSourceCandidateBuckets.filter(
    (buckets) => buckets.some(isNonGenericAddressOptionsOwnershipAnchorTokenBucket),
  ).length;
  const ownershipSourceInputSummaryPresent = input.exactThreeRadioGuardPassed && ownershipSourceCandidateCount > 0;
  const ownershipSourceInputAllCandidatesEmpty = ownershipSourceCandidateCount > 0
    && ownershipSourceCandidatesWithAnySignatureCount === 0
    && ownershipSourceCandidatesWithFieldKeyCount === 0
    && ownershipSourceCandidatesWithInputNameCount === 0
    && ownershipSourceCandidatesWithAriaAttributePresenceCount === 0
    && ownershipSourceCandidatesWithDataAttributePresenceCount === 0
    && ownershipSourceCandidatesWithDocusignAttributePresenceCount === 0
    && ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount === 0
    && ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === 0;
  const ownershipSourceInputAnyCandidateHadUsableSource = visibleRadioLikeFields.some((field, index) => {
    const candidateBuckets = ownershipSourceCandidateBuckets[index];
    return Boolean(
      normalizeText(field.groupName)
      || candidateBuckets.length > 0
      || hasAnyOwnershipSourceInputAriaAttributePresence(field)
      || hasAnyOwnershipSourceInputDataAttributePresence(field)
      || hasAnyOwnershipSourceInputDocusignAttributePresence(field)
      || hasAnyOwnershipSourceInputReferenceLikeAttributePresence(field),
    );
  });
  const sharedNameValue = resolveSharedNormalizedTextValue(visibleRadioLikeFields.map((field) => field.groupName));
  const ariaLabelledbyAttributePresentCount = visibleRadioLikeFields.filter((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(signature && signature.hasAriaLabelledByReference);
  }).length;
  const ariaDescribedbyAttributePresentCount = visibleRadioLikeFields.filter((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(signature && signature.hasAriaDescribedByReference);
  }).length;
  const sharedNamePresentCount = visibleRadioLikeFields.filter((field) => Boolean(normalizeText(field.groupName))).length;
  const ariaLabelledbyHintValues = visibleRadioLikeFields.flatMap((field) => {
    const signature = field.proxyReferenceSignature;
    return signature?.hasAriaLabelledByReference ? signature.valueHintBuckets : [];
  });
  const ariaDescribedbyHintValues = visibleRadioLikeFields.flatMap((field) => {
    const signature = field.proxyReferenceSignature;
    return signature?.hasAriaDescribedByReference ? signature.valueHintBuckets : [];
  });
  const sharedOwnerSourceFields = visibleRadioLikeFields.filter((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(signature && (
      signature.hasForIdReference
      || signature.hasDataReference
      || signature.hasAriaControlsReference
      || signature.hasAriaLabelledByReference
      || signature.hasAriaDescribedByReference
    ));
  });
  const sharedOwnerPresentCount = sharedOwnerSourceFields.length;
  const sharedOwnerHintBuckets = sharedOwnerSourceFields.map((field) => collectAddressOptionsOwnershipAnchorHintBuckets([
    ...(field.domAttributeSignature?.valueHintBuckets ?? []),
    ...(field.proxyReferenceSignature?.valueHintBuckets ?? []),
  ]));
  const docusignOwnerSourceFields = visibleRadioLikeFields.filter((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(
      signature?.hasDocuSignReference
      || signature?.hasProxyDocuSignMetadataAttributes
      || field.domAttributeSignature?.hasDocuSignMetadataAttributes,
    );
  });
  const docusignOwnerSignalPresentCount = docusignOwnerSourceFields.length;
  const docusignOwnerHintValues = visibleRadioLikeFields.flatMap((field) => {
    const signature = field.proxyReferenceSignature;
    const hasDocusignOwnerSource = Boolean(
      signature?.hasDocuSignReference
      || signature?.hasProxyDocuSignMetadataAttributes
      || field.domAttributeSignature?.hasDocuSignMetadataAttributes,
    );
    return hasDocusignOwnerSource
      ? [
        ...(field.domAttributeSignature?.valueHintBuckets ?? []),
        ...(signature?.valueHintBuckets ?? []),
      ]
      : [];
  });
  const radioGroupAriaLabelledbyBucketsPresent = collectAddressOptionsOwnershipAnchorHintBuckets(
    ariaLabelledbyHintValues,
  );
  const radioGroupAriaDescribedbyBucketsPresent = collectAddressOptionsOwnershipAnchorHintBuckets(
    ariaDescribedbyHintValues,
  );
  const radioGroupSharedNameBucketsPresent = collectAddressOptionsOwnershipAnchorTextBuckets(
    sharedNameValue ? [sharedNameValue] : [],
    'shared-name',
  );
  const radioGroupSharedOwnerBucketsPresent = sharedOwnerHintBuckets.length === visibleRadioLikeFields.length
    && sharedOwnerHintBuckets.length > 0
    ? intersectAddressOptionsOwnershipAnchorTokenBuckets(sharedOwnerHintBuckets)
    : [];
  const radioGroupDocusignOwnerBucketsPresent = collectAddressOptionsOwnershipAnchorHintBuckets(
    docusignOwnerHintValues,
  );
  const ownershipReferenceTargetLookupAttempted = visibleRadioLikeFields.some(hasAnyOwnershipReferenceLookupSignal);
  const ownershipReferenceTargetExistsCount = visibleRadioLikeFields.filter(hasAnyOwnershipReferenceTargetExists).length;
  const ownershipReferenceTargetVisibleCount = visibleRadioLikeFields.filter(hasAnyOwnershipReferenceTargetVisible).length;
  const safeTokensObserved = sortUniqueAddressOptionsOwnershipAnchorTokenBuckets([
    ...radioGroupAriaLabelledbyBucketsPresent,
    ...radioGroupAriaDescribedbyBucketsPresent,
    ...radioGroupSharedNameBucketsPresent,
    ...radioGroupSharedOwnerBucketsPresent,
    ...radioGroupDocusignOwnerBucketsPresent,
  ]);
  const ownershipReferenceTargetSafeTokenCount = sortUniqueAddressOptionsOwnershipAnchorTokenBuckets([
    ...radioGroupAriaLabelledbyBucketsPresent,
    ...radioGroupAriaDescribedbyBucketsPresent,
    ...radioGroupSharedOwnerBucketsPresent,
    ...radioGroupDocusignOwnerBucketsPresent,
  ]).filter(isNonGenericAddressOptionsOwnershipAnchorTokenBucket).length;
  const radioGroupReferenceTargetExists = visibleRadioLikeFields.some((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(signature && (
      signature.forReferenceTargetExists
      || signature.ariaLabelledByTargetExists
      || signature.ariaDescribedByTargetExists
      || signature.ariaControlsTargetExists
      || signature.dataReferenceTargetExists
      || signature.docuSignReferenceTargetExists
    ));
  });
  const radioGroupReferenceTargetVisible = visibleRadioLikeFields.some((field) => {
    const signature = field.proxyReferenceSignature;
    return Boolean(signature && (
      signature.forReferenceTargetVisible
      || signature.ariaLabelledByTargetVisible
      || signature.ariaDescribedByTargetVisible
      || signature.ariaControlsTargetVisible
      || signature.dataReferenceTargetVisible
      || signature.docuSignReferenceTargetVisible
    ));
  });
  const ariaLabelledbyMatched = radioGroupAriaLabelledbyBucketsPresent.some(
    isNonGenericAddressOptionsOwnershipAnchorTokenBucket,
  );
  const ariaDescribedbyMatched = radioGroupAriaDescribedbyBucketsPresent.some(
    isNonGenericAddressOptionsOwnershipAnchorTokenBucket,
  );
  const sharedNameMatched = radioGroupSharedNameBucketsPresent.some(
    isNonGenericAddressOptionsOwnershipAnchorTokenBucket,
  );
  const sharedOwnerMatched = radioGroupSharedOwnerBucketsPresent.some(
    isNonGenericAddressOptionsOwnershipAnchorTokenBucket,
  );
  const docusignOwnerMatched = radioGroupDocusignOwnerBucketsPresent.some(
    isNonGenericAddressOptionsOwnershipAnchorTokenBucket,
  );
  const ariaLabelledbySourceHasContent = ariaLabelledbyAttributePresentCount > 0;
  const ariaDescribedbySourceHasContent = ariaDescribedbyAttributePresentCount > 0;
  const sharedNameSourceHasContent = sharedNamePresentCount > 0;
  const sharedOwnerSourceHasContent = sharedOwnerPresentCount > 0;
  const docusignOwnerSourceHasContent = docusignOwnerSignalPresentCount > 0;
  const anySourceHasContent = ariaLabelledbySourceHasContent
    || ariaDescribedbySourceHasContent
    || sharedNameSourceHasContent
    || sharedOwnerSourceHasContent
    || docusignOwnerSourceHasContent;
  const safeOwnershipTokenCount = countOwnershipSafeReferenceTokenBuckets(safeTokensObserved);
  const ownershipEvidenceSourcesEmpty = !anySourceHasContent;
  const ownershipEvidenceSourcesPresentButNoSafeTokens = anySourceHasContent && safeOwnershipTokenCount === 0;
  const ownershipSourceInputGeneratedOnly = ownershipSourceCandidateBuckets.some((buckets) => buckets.length > 0)
    && ownershipSourceCandidateBuckets
      .filter((buckets) => buckets.length > 0)
      .every((buckets) => buckets.includes('generated-reference-only')
        && buckets.every(isNonSafeOnlyAddressOptionsOwnershipAnchorTokenBucket));
  const ownershipSourceInputGenericOnly = ownershipSourceCandidateBuckets.some((buckets) => buckets.length > 0)
    && ownershipSourceCandidateBuckets
      .filter((buckets) => buckets.length > 0)
      .every((buckets) => !buckets.includes('generated-reference-only')
        && buckets.every((bucket) => !isNonGenericAddressOptionsOwnershipAnchorTokenBucket(bucket)));
  const onlyGeneratedReferenceEvidence = safeTokensObserved.includes('generated-reference-only')
    && safeTokensObserved.every((bucket) => bucket === 'generated-reference-only'
      || bucket === 'address-options'
      || bucket === 'radio-group'
      || bucket === 'question-prompt'
      || bucket === 'generic-only');
  const onlyGenericEvidence = safeTokensObserved.length > 0
    && safeTokensObserved.every((bucket) => !isNonGenericAddressOptionsOwnershipAnchorTokenBucket(bucket)
      && bucket !== 'generated-reference-only');
  const ownershipEvidenceFilteredAsGeneratedOnlyCount = [
    { presentCount: ariaLabelledbyAttributePresentCount, buckets: radioGroupAriaLabelledbyBucketsPresent },
    { presentCount: ariaDescribedbyAttributePresentCount, buckets: radioGroupAriaDescribedbyBucketsPresent },
    { presentCount: sharedNamePresentCount, buckets: radioGroupSharedNameBucketsPresent },
    { presentCount: sharedOwnerPresentCount, buckets: radioGroupSharedOwnerBucketsPresent },
    { presentCount: docusignOwnerSignalPresentCount, buckets: radioGroupDocusignOwnerBucketsPresent },
  ].filter(({ presentCount, buckets }) => presentCount > 0
    && buckets.includes('generated-reference-only')
    && buckets.every(isNonSafeOnlyAddressOptionsOwnershipAnchorTokenBucket))
    .length;
  const ownershipEvidenceFilteredAsGenericOnlyCount = [
    { presentCount: ariaLabelledbyAttributePresentCount, buckets: radioGroupAriaLabelledbyBucketsPresent },
    { presentCount: ariaDescribedbyAttributePresentCount, buckets: radioGroupAriaDescribedbyBucketsPresent },
    { presentCount: sharedNamePresentCount, buckets: radioGroupSharedNameBucketsPresent },
    { presentCount: sharedOwnerPresentCount, buckets: radioGroupSharedOwnerBucketsPresent },
    { presentCount: docusignOwnerSignalPresentCount, buckets: radioGroupDocusignOwnerBucketsPresent },
  ].filter(({ presentCount, buckets }) => presentCount > 0
    && buckets.length > 0
    && !buckets.includes('generated-reference-only')
    && buckets.every((bucket) => !isNonGenericAddressOptionsOwnershipAnchorTokenBucket(bucket)))
    .length;
  const ownershipEvidenceFilteredByRedactionCount = [
    {
      presentCount: ariaLabelledbyAttributePresentCount,
      buckets: radioGroupAriaLabelledbyBucketsPresent,
      fieldPredicate: (field: GuardedToggleField) => Boolean(
        field.proxyReferenceSignature?.hasAriaLabelledByReference
          && field.proxyReferenceSignature?.ariaLabelledByTargetExists
          && hasOwnershipSourceFilteredByRedactionSignal(field, 'aria-labelledby'),
      ),
    },
    {
      presentCount: ariaDescribedbyAttributePresentCount,
      buckets: radioGroupAriaDescribedbyBucketsPresent,
      fieldPredicate: (field: GuardedToggleField) => Boolean(
        field.proxyReferenceSignature?.hasAriaDescribedByReference
          && field.proxyReferenceSignature?.ariaDescribedByTargetExists
          && hasOwnershipSourceFilteredByRedactionSignal(field, 'aria-describedby'),
      ),
    },
    {
      presentCount: sharedNamePresentCount,
      buckets: radioGroupSharedNameBucketsPresent,
      fieldPredicate: (field: GuardedToggleField) => hasOwnershipSourceFilteredByRedactionSignal(field, 'shared-name'),
    },
    {
      presentCount: sharedOwnerPresentCount,
      buckets: radioGroupSharedOwnerBucketsPresent,
      fieldPredicate: (field: GuardedToggleField) => Boolean(
        field.proxyReferenceSignature
        && (
          field.proxyReferenceSignature.forReferenceTargetExists
          || field.proxyReferenceSignature.ariaLabelledByTargetExists
          || field.proxyReferenceSignature.ariaDescribedByTargetExists
          || field.proxyReferenceSignature.ariaControlsTargetExists
          || field.proxyReferenceSignature.dataReferenceTargetExists
        )
        && hasOwnershipSourceFilteredByRedactionSignal(field, 'shared-owner'),
      ),
    },
    {
      presentCount: docusignOwnerSignalPresentCount,
      buckets: radioGroupDocusignOwnerBucketsPresent,
      fieldPredicate: (field: GuardedToggleField) => Boolean(
        (
          field.proxyReferenceSignature?.docuSignReferenceTargetExists
          || field.proxyReferenceSignature?.hasProxyDocuSignMetadataAttributes
          || field.domAttributeSignature?.hasDocuSignMetadataAttributes
        )
        && hasOwnershipSourceFilteredByRedactionSignal(field, 'docusign-owner'),
      ),
    },
  ].filter(({ presentCount, buckets, fieldPredicate }) => presentCount > 0
    && buckets.length === 0
    && visibleRadioLikeFields.some(fieldPredicate))
    .length;
  const ownershipSourceInputHarvestGapDetected = input.exactThreeRadioGuardPassed
    && ownershipEvidenceSourcesEmpty
    && ownershipSourceInputAnyCandidateHadUsableSource
    && ownershipSourceCandidatesWithInputNameCount === 0
    && ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === 0
    && (
      ownershipSourceCandidatesWithAriaAttributePresenceCount > 0
      || ownershipSourceCandidatesWithDataAttributePresenceCount > 0
      || ownershipSourceCandidatesWithDocusignAttributePresenceCount > 0
      || ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount > 0
    );
  let ownershipSourceInputOutcomeCategory: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory =
    'ownership-input-prior-guard-failed';
  if (!input.exactThreeRadioGuardPassed) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-prior-guard-failed';
  } else if (!ownershipSourceInputSummaryPresent) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-not-checked';
  } else if (ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount > 0) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-safe-source-present';
  } else if (ownershipSourceInputGeneratedOnly) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-generated-only';
  } else if (ownershipSourceInputGenericOnly) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-generic-only';
  } else if (ownershipSourceInputAllCandidatesEmpty) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-all-candidates-empty';
  } else if (ownershipSourceInputHarvestGapDetected) {
    ownershipSourceInputOutcomeCategory = 'ownership-input-ownership-surfaces-present-not-harvested';
  } else {
    ownershipSourceInputOutcomeCategory = 'ownership-input-signatures-present-no-ownership-surfaces';
  }
  const ownershipSourceInputRejectedReasons: PhysicalOperatingAddressOwnershipSourceInputRejectedReason[] = [];
  switch (ownershipSourceInputOutcomeCategory) {
    case 'ownership-input-not-checked':
      ownershipSourceInputRejectedReasons.push('another-bounded-reason');
      break;
    case 'ownership-input-all-candidates-empty':
      ownershipSourceInputRejectedReasons.push('all-candidates-empty', 'no-signatures-present');
      break;
    case 'ownership-input-signatures-present-no-ownership-surfaces':
      ownershipSourceInputRejectedReasons.push('signatures-present-no-ownership-surfaces');
      break;
    case 'ownership-input-ownership-surfaces-present-not-harvested':
      ownershipSourceInputRejectedReasons.push('ownership-surfaces-present-not-harvested', 'no-safe-source-token');
      break;
    case 'ownership-input-generated-only':
      ownershipSourceInputRejectedReasons.push('generated-only', 'no-safe-source-token');
      break;
    case 'ownership-input-generic-only':
      ownershipSourceInputRejectedReasons.push('generic-only', 'no-safe-source-token');
      break;
    case 'ownership-input-prior-guard-failed':
      ownershipSourceInputRejectedReasons.push('prior-guard-failed');
      break;
    case 'ownership-input-safe-source-present':
    default:
      break;
  }

  let addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory =
    'ownership-anchor-missing-no-safe-evidence';
  if (!input.exactThreeRadioGuardPassed) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-not-checked';
  } else if (ariaLabelledbyMatched) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-matched-aria-labelledby';
  } else if (ariaDescribedbyMatched) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-matched-aria-describedby';
  } else if (sharedNameMatched) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-matched-shared-name';
  } else if (docusignOwnerMatched) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-matched-docusign-owner';
  } else if (sharedOwnerMatched) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-matched-shared-owner';
  } else if (!anySourceHasContent) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-missing-safe-evidence-empty';
  } else if (onlyGeneratedReferenceEvidence) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-missing-only-generated-reference';
  } else if (onlyGenericEvidence) {
    addressOptionsOwnershipAnchorOutcomeCategory = 'ownership-anchor-missing-only-generic-evidence';
  }

  const addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[] = [];
  if (addressOptionsOwnershipAnchorOutcomeCategory === 'ownership-anchor-not-checked') {
    addressOptionsOwnershipAnchorRejectedReasons.push('not-checked-prior-guard-failed');
  } else if (
    addressOptionsOwnershipAnchorOutcomeCategory === 'ownership-anchor-missing-no-safe-evidence'
    || addressOptionsOwnershipAnchorOutcomeCategory === 'ownership-anchor-missing-safe-evidence-empty'
    || addressOptionsOwnershipAnchorOutcomeCategory === 'ownership-anchor-missing-only-generated-reference'
    || addressOptionsOwnershipAnchorOutcomeCategory === 'ownership-anchor-missing-only-generic-evidence'
  ) {
    addressOptionsOwnershipAnchorRejectedReasons.push('ownership-anchor-missing');
    switch (addressOptionsOwnershipAnchorOutcomeCategory) {
      case 'ownership-anchor-missing-safe-evidence-empty':
        addressOptionsOwnershipAnchorRejectedReasons.push('safe-evidence-empty');
        break;
      case 'ownership-anchor-missing-only-generated-reference':
        addressOptionsOwnershipAnchorRejectedReasons.push('only-generated-reference');
        break;
      case 'ownership-anchor-missing-only-generic-evidence':
        addressOptionsOwnershipAnchorRejectedReasons.push('only-generic-evidence');
        break;
      case 'ownership-anchor-missing-no-safe-evidence':
      default:
        addressOptionsOwnershipAnchorRejectedReasons.push('no-safe-evidence');
        break;
    }
  }

  let radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory = 'none';
  if (!input.exactThreeRadioGuardPassed) {
    radioGroupCommonOwnerCategory = 'not-checked';
  } else if (sharedNameMatched) {
    radioGroupCommonOwnerCategory = 'shared-name';
  } else if (docusignOwnerMatched) {
    radioGroupCommonOwnerCategory = 'docusign-owner';
  } else if (ariaLabelledbyMatched || ariaDescribedbyMatched || sharedOwnerMatched) {
    radioGroupCommonOwnerCategory = 'shared-owner';
  } else if (onlyGeneratedReferenceEvidence) {
    radioGroupCommonOwnerCategory = 'generated-reference-only';
  } else if (onlyGenericEvidence) {
    radioGroupCommonOwnerCategory = 'generic-only';
  }

  const ownershipSourceHarvestAttempted = input.exactThreeRadioGuardPassed && visibleRadioLikeFields.length > 0;
  let ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory =
    'ownership-source-prior-guard-failed';
  if (!input.exactThreeRadioGuardPassed) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-prior-guard-failed';
  } else if (!ownershipSourceHarvestAttempted) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-not-attempted';
  } else if (safeOwnershipTokenCount > 0 || sharedNameMatched) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-safe-tokens-present';
  } else if (ownershipEvidenceSourcesEmpty) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-empty';
  } else if (onlyGeneratedReferenceEvidence) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-generated-only';
  } else if (onlyGenericEvidence) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-generic-only';
  } else if (ownershipReferenceTargetLookupAttempted && ownershipReferenceTargetExistsCount === 0) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-attributes-present-no-targets';
  } else if (ownershipEvidenceFilteredByRedactionCount > 0) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-filtered-by-redaction';
  } else if (ownershipReferenceTargetExistsCount > 0) {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-targets-present-no-safe-tokens';
  } else {
    ownershipSourceHarvestOutcomeCategory = 'ownership-source-filtered-by-redaction';
  }
  const ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[] = [];
  switch (ownershipSourceHarvestOutcomeCategory) {
    case 'ownership-source-not-attempted':
      ownershipSourceHarvestRejectedReasons.push('not-attempted');
      break;
    case 'ownership-source-prior-guard-failed':
      ownershipSourceHarvestRejectedReasons.push('prior-guard-failed');
      break;
    case 'ownership-source-empty':
      ownershipSourceHarvestRejectedReasons.push('sources-empty');
      break;
    case 'ownership-source-attributes-present-no-targets':
      ownershipSourceHarvestRejectedReasons.push('reference-targets-missing');
      break;
    case 'ownership-source-targets-present-no-safe-tokens':
      ownershipSourceHarvestRejectedReasons.push('reference-targets-present-no-safe-tokens');
      break;
    case 'ownership-source-generated-only':
      ownershipSourceHarvestRejectedReasons.push('generated-only');
      break;
    case 'ownership-source-generic-only':
      ownershipSourceHarvestRejectedReasons.push('generic-only');
      break;
    case 'ownership-source-filtered-by-redaction':
      ownershipSourceHarvestRejectedReasons.push('filtered-by-redaction');
      break;
    case 'ownership-source-safe-tokens-present':
    default:
      break;
  }

  return {
    addressOptionsOwnershipAnchorOutcomeCategory,
    addressOptionsOwnershipAnchorRejectedReasons,
    addressOptionsOwnershipAnchorEvidenceSummary:
      buildAddressOptionsOwnershipAnchorEvidenceSummary(addressOptionsOwnershipAnchorOutcomeCategory),
    addressOptionsOwnershipAnchorSourcesChecked: ADDRESS_OPTIONS_OWNERSHIP_ANCHOR_SOURCES_CHECKED.slice(),
    addressOptionsOwnershipAnchorSafeTokensObserved: safeTokensObserved,
    radioGroupAriaLabelledbyBucketsPresent,
    radioGroupAriaDescribedbyBucketsPresent,
    radioGroupSharedNameBucketsPresent,
    radioGroupSharedOwnerBucketsPresent,
    radioGroupDocusignOwnerBucketsPresent,
    radioGroupReferenceTargetExists,
    radioGroupReferenceTargetVisible,
    radioGroupCommonOwnerCategory,
    ownershipSourceInputSummaryPresent,
    ownershipSourceInputOutcomeCategory,
    ownershipSourceInputRejectedReasons,
    ownershipSourceInputSummary: buildOwnershipSourceInputSummary(ownershipSourceInputOutcomeCategory),
    ownershipSourceCandidateCount,
    ownershipSourceCandidatesWithAnySignatureCount,
    ownershipSourceCandidatesWithProxySignatureCount,
    ownershipSourceCandidatesWithDomAttributeSignatureCount,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount,
    ownershipSourceCandidatesWithLayoutSignatureCount,
    ownershipSourceCandidatesWithFieldKeyCount,
    ownershipSourceCandidatesWithInputNameCount,
    ownershipSourceCandidatesWithAriaAttributePresenceCount,
    ownershipSourceCandidatesWithDataAttributePresenceCount,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
    ownershipSourceInputAllCandidatesEmpty,
    ownershipSourceInputAnyCandidateHadUsableSource,
    ownershipSourceInputHarvestGapDetected,
    ownershipSourceHarvestAttempted,
    ownershipSourceHarvestOutcomeCategory,
    ownershipSourceHarvestRejectedReasons,
    ownershipSourceHarvestSummary: buildOwnershipSourceHarvestSummary(ownershipSourceHarvestOutcomeCategory),
    ariaLabelledbyAttributePresentCount,
    ariaDescribedbyAttributePresentCount,
    sharedNamePresentCount,
    sharedOwnerPresentCount,
    docusignOwnerSignalPresentCount,
    ownershipReferenceTargetLookupAttempted,
    ownershipReferenceTargetExistsCount,
    ownershipReferenceTargetVisibleCount,
    ownershipReferenceTargetSafeTokenCount,
    ownershipEvidenceFilteredAsGeneratedOnlyCount,
    ownershipEvidenceFilteredAsGenericOnlyCount,
    ownershipEvidenceFilteredByRedactionCount,
    ownershipEvidenceSourcesEmpty,
    ownershipEvidenceSourcesPresentButNoSafeTokens,
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
  const fieldDiscoveryRadioSurfaceDiagnostics = buildPhysicalOperatingAddressFieldDiscoveryRadioSurfaceDiagnostics({
    fields,
    fallbackInventory,
    exactThreeRadioGuardPassed,
  });
  const candidateSignatureSourceDiagnostics = buildPhysicalOperatingAddressCandidateSignatureSourceDiagnostics({
    fields,
    fallbackInventory,
    exactThreeRadioGuardPassed,
  });
  const ownershipAnchorEvidence = buildPhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidence({
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
    addressOptionsOwnershipAnchorOutcomeCategory: ownershipAnchorEvidence.addressOptionsOwnershipAnchorOutcomeCategory,
    addressOptionsOwnershipAnchorRejectedReasons: ownershipAnchorEvidence.addressOptionsOwnershipAnchorRejectedReasons,
    addressOptionsOwnershipAnchorEvidenceSummary: ownershipAnchorEvidence.addressOptionsOwnershipAnchorEvidenceSummary,
    addressOptionsOwnershipAnchorSourcesChecked: ownershipAnchorEvidence.addressOptionsOwnershipAnchorSourcesChecked,
    addressOptionsOwnershipAnchorSafeTokensObserved: ownershipAnchorEvidence.addressOptionsOwnershipAnchorSafeTokensObserved,
    radioGroupAriaLabelledbyBucketsPresent: ownershipAnchorEvidence.radioGroupAriaLabelledbyBucketsPresent,
    radioGroupAriaDescribedbyBucketsPresent: ownershipAnchorEvidence.radioGroupAriaDescribedbyBucketsPresent,
    radioGroupSharedNameBucketsPresent: ownershipAnchorEvidence.radioGroupSharedNameBucketsPresent,
    radioGroupSharedOwnerBucketsPresent: ownershipAnchorEvidence.radioGroupSharedOwnerBucketsPresent,
    radioGroupDocusignOwnerBucketsPresent: ownershipAnchorEvidence.radioGroupDocusignOwnerBucketsPresent,
    radioGroupReferenceTargetExists: ownershipAnchorEvidence.radioGroupReferenceTargetExists,
    radioGroupReferenceTargetVisible: ownershipAnchorEvidence.radioGroupReferenceTargetVisible,
    radioGroupCommonOwnerCategory: ownershipAnchorEvidence.radioGroupCommonOwnerCategory,
    fieldDiscoveryRadioSurfaceSummaryPresent:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceSummaryPresent,
    fieldDiscoveryRadioSurfaceOutcomeCategory:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceOutcomeCategory,
    fieldDiscoveryRadioSurfaceRejectedReasons:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceRejectedReasons,
    fieldDiscoveryRadioSurfaceSummary:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceSummary,
    fieldDiscoveryTotalFieldCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryTotalFieldCount,
    fieldDiscoveryVisibleRadioInputCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryVisibleRadioInputCount,
    fieldDiscoveryVisibleEditableRadioInputCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryVisibleEditableRadioInputCount,
    fieldDiscoveryExactThreeRadioCandidateCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryExactThreeRadioCandidateCount,
    fieldDiscoveryRadioBuildersAttempted:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioBuildersAttempted,
    fieldDiscoveryRadioBuildersSkipped:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioBuildersSkipped,
    fieldDiscoveryRadioBuilderSkipReasons:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioBuilderSkipReasons,
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount,
    fieldDiscoveryRadioFieldsWithInputNameCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithInputNameCount,
    fieldDiscoveryRadioFieldsWithGroupNameCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithGroupNameCount,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithResolvedLabelCount,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsSurfaceEmptyCount,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsGeneratedOnlyCount,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioFieldsUnsafeOmittedCount,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceAttachmentGapDetected,
    fieldDiscoveryRadioSurfaceFilteringGapDetected:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceFilteringGapDetected,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected:
      fieldDiscoveryRadioSurfaceDiagnostics.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected,
    candidateSignatureSourceSummaryPresent: candidateSignatureSourceDiagnostics.candidateSignatureSourceSummaryPresent,
    candidateSignatureSourceOutcomeCategory: candidateSignatureSourceDiagnostics.candidateSignatureSourceOutcomeCategory,
    candidateSignatureSourceRejectedReasons: candidateSignatureSourceDiagnostics.candidateSignatureSourceRejectedReasons,
    candidateSignatureSourceSummary: candidateSignatureSourceDiagnostics.candidateSignatureSourceSummary,
    candidateSignatureSourceCandidateCount: candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidateCount,
    candidateSignatureSourceCandidatesWithOriginalFieldCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithOriginalFieldCount,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithSafeFieldKeyCount,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithIdOrNameKeyCount,
    candidateSignatureSourceCandidatesWithInputTypeCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithInputTypeCount,
    candidateSignatureSourceCandidatesWithControlCategoryCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithControlCategoryCount,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithContainerContextLabelsCount,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount,
    candidateSignatureSourceCandidatesWithGroupNameCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithGroupNameCount,
    candidateSignatureSourceCandidatesWithResolvedLabelCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithResolvedLabelCount,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithAnyLabelBucketCount,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount,
    candidateSignatureSourceAllCandidatesReducedShape:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceAllCandidatesReducedShape,
    candidateSignatureSourceAllCandidatesSurfaceEmpty:
      candidateSignatureSourceDiagnostics.candidateSignatureSourceAllCandidatesSurfaceEmpty,
    candidateSignatureSourcePotentialPropagationGapDetected:
      candidateSignatureSourceDiagnostics.candidateSignatureSourcePotentialPropagationGapDetected,
    ownershipSourceInputSummaryPresent: ownershipAnchorEvidence.ownershipSourceInputSummaryPresent,
    ownershipSourceInputOutcomeCategory: ownershipAnchorEvidence.ownershipSourceInputOutcomeCategory,
    ownershipSourceInputRejectedReasons: ownershipAnchorEvidence.ownershipSourceInputRejectedReasons,
    ownershipSourceInputSummary: ownershipAnchorEvidence.ownershipSourceInputSummary,
    ownershipSourceCandidateCount: ownershipAnchorEvidence.ownershipSourceCandidateCount,
    ownershipSourceCandidatesWithAnySignatureCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithAnySignatureCount,
    ownershipSourceCandidatesWithProxySignatureCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithProxySignatureCount,
    ownershipSourceCandidatesWithDomAttributeSignatureCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithDomAttributeSignatureCount,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
    ownershipSourceCandidatesWithLayoutSignatureCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithLayoutSignatureCount,
    ownershipSourceCandidatesWithFieldKeyCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithFieldKeyCount,
    ownershipSourceCandidatesWithInputNameCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithInputNameCount,
    ownershipSourceCandidatesWithAriaAttributePresenceCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithAriaAttributePresenceCount,
    ownershipSourceCandidatesWithDataAttributePresenceCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithDataAttributePresenceCount,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
      ownershipAnchorEvidence.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
    ownershipSourceInputAllCandidatesEmpty: ownershipAnchorEvidence.ownershipSourceInputAllCandidatesEmpty,
    ownershipSourceInputAnyCandidateHadUsableSource:
      ownershipAnchorEvidence.ownershipSourceInputAnyCandidateHadUsableSource,
    ownershipSourceInputHarvestGapDetected: ownershipAnchorEvidence.ownershipSourceInputHarvestGapDetected,
    ownershipSourceHarvestAttempted: ownershipAnchorEvidence.ownershipSourceHarvestAttempted,
    ownershipSourceHarvestOutcomeCategory: ownershipAnchorEvidence.ownershipSourceHarvestOutcomeCategory,
    ownershipSourceHarvestRejectedReasons: ownershipAnchorEvidence.ownershipSourceHarvestRejectedReasons,
    ownershipSourceHarvestSummary: ownershipAnchorEvidence.ownershipSourceHarvestSummary,
    ariaLabelledbyAttributePresentCount: ownershipAnchorEvidence.ariaLabelledbyAttributePresentCount,
    ariaDescribedbyAttributePresentCount: ownershipAnchorEvidence.ariaDescribedbyAttributePresentCount,
    sharedNamePresentCount: ownershipAnchorEvidence.sharedNamePresentCount,
    sharedOwnerPresentCount: ownershipAnchorEvidence.sharedOwnerPresentCount,
    docusignOwnerSignalPresentCount: ownershipAnchorEvidence.docusignOwnerSignalPresentCount,
    ownershipReferenceTargetLookupAttempted: ownershipAnchorEvidence.ownershipReferenceTargetLookupAttempted,
    ownershipReferenceTargetExistsCount: ownershipAnchorEvidence.ownershipReferenceTargetExistsCount,
    ownershipReferenceTargetVisibleCount: ownershipAnchorEvidence.ownershipReferenceTargetVisibleCount,
    ownershipReferenceTargetSafeTokenCount: ownershipAnchorEvidence.ownershipReferenceTargetSafeTokenCount,
    ownershipEvidenceFilteredAsGeneratedOnlyCount:
      ownershipAnchorEvidence.ownershipEvidenceFilteredAsGeneratedOnlyCount,
    ownershipEvidenceFilteredAsGenericOnlyCount:
      ownershipAnchorEvidence.ownershipEvidenceFilteredAsGenericOnlyCount,
    ownershipEvidenceFilteredByRedactionCount:
      ownershipAnchorEvidence.ownershipEvidenceFilteredByRedactionCount,
    ownershipEvidenceSourcesEmpty: ownershipAnchorEvidence.ownershipEvidenceSourcesEmpty,
    ownershipEvidenceSourcesPresentButNoSafeTokens:
      ownershipAnchorEvidence.ownershipEvidenceSourcesPresentButNoSafeTokens,
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
      addressOptionsOwnershipAnchorOutcomeCategory: calibratedFallback.addressOptionsOwnershipAnchorOutcomeCategory,
      addressOptionsOwnershipAnchorRejectedReasons: calibratedFallback.addressOptionsOwnershipAnchorRejectedReasons,
      addressOptionsOwnershipAnchorEvidenceSummary: calibratedFallback.addressOptionsOwnershipAnchorEvidenceSummary,
      addressOptionsOwnershipAnchorSourcesChecked: calibratedFallback.addressOptionsOwnershipAnchorSourcesChecked,
      addressOptionsOwnershipAnchorSafeTokensObserved: calibratedFallback.addressOptionsOwnershipAnchorSafeTokensObserved,
      radioGroupAriaLabelledbyBucketsPresent: calibratedFallback.radioGroupAriaLabelledbyBucketsPresent,
      radioGroupAriaDescribedbyBucketsPresent: calibratedFallback.radioGroupAriaDescribedbyBucketsPresent,
      radioGroupSharedNameBucketsPresent: calibratedFallback.radioGroupSharedNameBucketsPresent,
      radioGroupSharedOwnerBucketsPresent: calibratedFallback.radioGroupSharedOwnerBucketsPresent,
      radioGroupDocusignOwnerBucketsPresent: calibratedFallback.radioGroupDocusignOwnerBucketsPresent,
      radioGroupReferenceTargetExists: calibratedFallback.radioGroupReferenceTargetExists,
      radioGroupReferenceTargetVisible: calibratedFallback.radioGroupReferenceTargetVisible,
      radioGroupCommonOwnerCategory: calibratedFallback.radioGroupCommonOwnerCategory,
      fieldDiscoveryRadioSurfaceSummaryPresent: calibratedFallback.fieldDiscoveryRadioSurfaceSummaryPresent,
      fieldDiscoveryRadioSurfaceOutcomeCategory: calibratedFallback.fieldDiscoveryRadioSurfaceOutcomeCategory,
      fieldDiscoveryRadioSurfaceRejectedReasons: calibratedFallback.fieldDiscoveryRadioSurfaceRejectedReasons,
      fieldDiscoveryRadioSurfaceSummary: calibratedFallback.fieldDiscoveryRadioSurfaceSummary,
      fieldDiscoveryTotalFieldCount: calibratedFallback.fieldDiscoveryTotalFieldCount,
      fieldDiscoveryVisibleRadioInputCount: calibratedFallback.fieldDiscoveryVisibleRadioInputCount,
      fieldDiscoveryVisibleEditableRadioInputCount:
        calibratedFallback.fieldDiscoveryVisibleEditableRadioInputCount,
      fieldDiscoveryExactThreeRadioCandidateCount:
        calibratedFallback.fieldDiscoveryExactThreeRadioCandidateCount,
      fieldDiscoveryRadioBuildersAttempted: calibratedFallback.fieldDiscoveryRadioBuildersAttempted,
      fieldDiscoveryRadioBuildersSkipped: calibratedFallback.fieldDiscoveryRadioBuildersSkipped,
      fieldDiscoveryRadioBuilderSkipReasons: calibratedFallback.fieldDiscoveryRadioBuilderSkipReasons,
      fieldDiscoveryRadioFieldsWithSafeFieldKeyCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount,
      fieldDiscoveryRadioFieldsWithIdOrNameKeyCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount,
      fieldDiscoveryRadioFieldsWithInputNameCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithInputNameCount,
      fieldDiscoveryRadioFieldsWithGroupNameCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithGroupNameCount,
      fieldDiscoveryRadioFieldsWithResolvedLabelCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithResolvedLabelCount,
      fieldDiscoveryRadioFieldsWithAnyLabelBucketCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount,
      fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount,
      fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount,
      fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount,
      fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount,
      fieldDiscoveryRadioFieldsWithContainerContextLabelsCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount,
      fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount,
      fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount:
        calibratedFallback.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount,
      fieldDiscoveryRadioFieldsSurfaceEmptyCount:
        calibratedFallback.fieldDiscoveryRadioFieldsSurfaceEmptyCount,
      fieldDiscoveryRadioFieldsGeneratedOnlyCount:
        calibratedFallback.fieldDiscoveryRadioFieldsGeneratedOnlyCount,
      fieldDiscoveryRadioFieldsUnsafeOmittedCount:
        calibratedFallback.fieldDiscoveryRadioFieldsUnsafeOmittedCount,
      fieldDiscoveryRadioSurfaceAttachmentGapDetected:
        calibratedFallback.fieldDiscoveryRadioSurfaceAttachmentGapDetected,
      fieldDiscoveryRadioSurfaceFilteringGapDetected:
        calibratedFallback.fieldDiscoveryRadioSurfaceFilteringGapDetected,
      fieldDiscoveryRadioSurfaceUpstreamAbsentDetected:
        calibratedFallback.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected,
      candidateSignatureSourceSummaryPresent: calibratedFallback.candidateSignatureSourceSummaryPresent,
      candidateSignatureSourceOutcomeCategory: calibratedFallback.candidateSignatureSourceOutcomeCategory,
      candidateSignatureSourceRejectedReasons: calibratedFallback.candidateSignatureSourceRejectedReasons,
      candidateSignatureSourceSummary: calibratedFallback.candidateSignatureSourceSummary,
      candidateSignatureSourceCandidateCount: calibratedFallback.candidateSignatureSourceCandidateCount,
      candidateSignatureSourceCandidatesWithOriginalFieldCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithOriginalFieldCount,
      candidateSignatureSourceCandidatesWithSafeFieldKeyCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithSafeFieldKeyCount,
      candidateSignatureSourceCandidatesWithIdOrNameKeyCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithIdOrNameKeyCount,
      candidateSignatureSourceCandidatesWithInputTypeCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithInputTypeCount,
      candidateSignatureSourceCandidatesWithControlCategoryCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithControlCategoryCount,
      candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount,
      candidateSignatureSourceCandidatesWithDomAttributeSignatureCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount,
      candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount,
      candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount,
      candidateSignatureSourceCandidatesWithContainerContextLabelsCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithContainerContextLabelsCount,
      candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount,
      candidateSignatureSourceCandidatesWithGroupNameCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithGroupNameCount,
      candidateSignatureSourceCandidatesWithResolvedLabelCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithResolvedLabelCount,
      candidateSignatureSourceCandidatesWithAnyLabelBucketCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithAnyLabelBucketCount,
      candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount:
        calibratedFallback.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount,
      candidateSignatureSourceAllCandidatesReducedShape:
        calibratedFallback.candidateSignatureSourceAllCandidatesReducedShape,
      candidateSignatureSourceAllCandidatesSurfaceEmpty:
        calibratedFallback.candidateSignatureSourceAllCandidatesSurfaceEmpty,
      candidateSignatureSourcePotentialPropagationGapDetected:
        calibratedFallback.candidateSignatureSourcePotentialPropagationGapDetected,
      ownershipSourceInputSummaryPresent: calibratedFallback.ownershipSourceInputSummaryPresent,
      ownershipSourceInputOutcomeCategory: calibratedFallback.ownershipSourceInputOutcomeCategory,
      ownershipSourceInputRejectedReasons: calibratedFallback.ownershipSourceInputRejectedReasons,
      ownershipSourceInputSummary: calibratedFallback.ownershipSourceInputSummary,
      ownershipSourceCandidateCount: calibratedFallback.ownershipSourceCandidateCount,
      ownershipSourceCandidatesWithAnySignatureCount:
        calibratedFallback.ownershipSourceCandidatesWithAnySignatureCount,
      ownershipSourceCandidatesWithProxySignatureCount:
        calibratedFallback.ownershipSourceCandidatesWithProxySignatureCount,
      ownershipSourceCandidatesWithDomAttributeSignatureCount:
        calibratedFallback.ownershipSourceCandidatesWithDomAttributeSignatureCount,
      ownershipSourceCandidatesWithRadioGraphicSignatureCount:
        calibratedFallback.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
      ownershipSourceCandidatesWithLayoutSignatureCount:
        calibratedFallback.ownershipSourceCandidatesWithLayoutSignatureCount,
      ownershipSourceCandidatesWithFieldKeyCount:
        calibratedFallback.ownershipSourceCandidatesWithFieldKeyCount,
      ownershipSourceCandidatesWithInputNameCount:
        calibratedFallback.ownershipSourceCandidatesWithInputNameCount,
      ownershipSourceCandidatesWithAriaAttributePresenceCount:
        calibratedFallback.ownershipSourceCandidatesWithAriaAttributePresenceCount,
      ownershipSourceCandidatesWithDataAttributePresenceCount:
        calibratedFallback.ownershipSourceCandidatesWithDataAttributePresenceCount,
      ownershipSourceCandidatesWithDocusignAttributePresenceCount:
        calibratedFallback.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
      ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
        calibratedFallback.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
      ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
        calibratedFallback.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
      ownershipSourceInputAllCandidatesEmpty: calibratedFallback.ownershipSourceInputAllCandidatesEmpty,
      ownershipSourceInputAnyCandidateHadUsableSource:
        calibratedFallback.ownershipSourceInputAnyCandidateHadUsableSource,
      ownershipSourceInputHarvestGapDetected: calibratedFallback.ownershipSourceInputHarvestGapDetected,
      ownershipSourceHarvestAttempted: calibratedFallback.ownershipSourceHarvestAttempted,
      ownershipSourceHarvestOutcomeCategory: calibratedFallback.ownershipSourceHarvestOutcomeCategory,
      ownershipSourceHarvestRejectedReasons: calibratedFallback.ownershipSourceHarvestRejectedReasons,
      ownershipSourceHarvestSummary: calibratedFallback.ownershipSourceHarvestSummary,
      ariaLabelledbyAttributePresentCount: calibratedFallback.ariaLabelledbyAttributePresentCount,
      ariaDescribedbyAttributePresentCount: calibratedFallback.ariaDescribedbyAttributePresentCount,
      sharedNamePresentCount: calibratedFallback.sharedNamePresentCount,
      sharedOwnerPresentCount: calibratedFallback.sharedOwnerPresentCount,
      docusignOwnerSignalPresentCount: calibratedFallback.docusignOwnerSignalPresentCount,
      ownershipReferenceTargetLookupAttempted: calibratedFallback.ownershipReferenceTargetLookupAttempted,
      ownershipReferenceTargetExistsCount: calibratedFallback.ownershipReferenceTargetExistsCount,
      ownershipReferenceTargetVisibleCount: calibratedFallback.ownershipReferenceTargetVisibleCount,
      ownershipReferenceTargetSafeTokenCount: calibratedFallback.ownershipReferenceTargetSafeTokenCount,
      ownershipEvidenceFilteredAsGeneratedOnlyCount: calibratedFallback.ownershipEvidenceFilteredAsGeneratedOnlyCount,
      ownershipEvidenceFilteredAsGenericOnlyCount: calibratedFallback.ownershipEvidenceFilteredAsGenericOnlyCount,
      ownershipEvidenceFilteredByRedactionCount: calibratedFallback.ownershipEvidenceFilteredByRedactionCount,
      ownershipEvidenceSourcesEmpty: calibratedFallback.ownershipEvidenceSourcesEmpty,
      ownershipEvidenceSourcesPresentButNoSafeTokens:
        calibratedFallback.ownershipEvidenceSourcesPresentButNoSafeTokens,
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
    addressOptionsOwnershipAnchorOutcomeCategory: calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorOutcomeCategory,
    addressOptionsOwnershipAnchorRejectedReasons: calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorRejectedReasons,
    addressOptionsOwnershipAnchorEvidenceSummary: calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorEvidenceSummary,
    addressOptionsOwnershipAnchorSourcesChecked: calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorSourcesChecked,
    addressOptionsOwnershipAnchorSafeTokensObserved: calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
    radioGroupAriaLabelledbyBucketsPresent: calibratedFallbackGuardSummary.radioGroupAriaLabelledbyBucketsPresent,
    radioGroupAriaDescribedbyBucketsPresent: calibratedFallbackGuardSummary.radioGroupAriaDescribedbyBucketsPresent,
    radioGroupSharedNameBucketsPresent: calibratedFallbackGuardSummary.radioGroupSharedNameBucketsPresent,
    radioGroupSharedOwnerBucketsPresent: calibratedFallbackGuardSummary.radioGroupSharedOwnerBucketsPresent,
    radioGroupDocusignOwnerBucketsPresent: calibratedFallbackGuardSummary.radioGroupDocusignOwnerBucketsPresent,
    radioGroupReferenceTargetExists: calibratedFallbackGuardSummary.radioGroupReferenceTargetExists,
    radioGroupReferenceTargetVisible: calibratedFallbackGuardSummary.radioGroupReferenceTargetVisible,
    radioGroupCommonOwnerCategory: calibratedFallbackGuardSummary.radioGroupCommonOwnerCategory,
    fieldDiscoveryRadioSurfaceSummaryPresent:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceSummaryPresent,
    fieldDiscoveryRadioSurfaceOutcomeCategory:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceOutcomeCategory,
    fieldDiscoveryRadioSurfaceRejectedReasons:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceRejectedReasons,
    fieldDiscoveryRadioSurfaceSummary:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceSummary,
    fieldDiscoveryTotalFieldCount: calibratedFallbackGuardSummary.fieldDiscoveryTotalFieldCount,
    fieldDiscoveryVisibleRadioInputCount:
      calibratedFallbackGuardSummary.fieldDiscoveryVisibleRadioInputCount,
    fieldDiscoveryVisibleEditableRadioInputCount:
      calibratedFallbackGuardSummary.fieldDiscoveryVisibleEditableRadioInputCount,
    fieldDiscoveryExactThreeRadioCandidateCount:
      calibratedFallbackGuardSummary.fieldDiscoveryExactThreeRadioCandidateCount,
    fieldDiscoveryRadioBuildersAttempted:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioBuildersAttempted,
    fieldDiscoveryRadioBuildersSkipped:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioBuildersSkipped,
    fieldDiscoveryRadioBuilderSkipReasons:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioBuilderSkipReasons,
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount,
    fieldDiscoveryRadioFieldsWithInputNameCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithInputNameCount,
    fieldDiscoveryRadioFieldsWithGroupNameCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithGroupNameCount,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithResolvedLabelCount,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsSurfaceEmptyCount,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsGeneratedOnlyCount,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioFieldsUnsafeOmittedCount,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceAttachmentGapDetected,
    fieldDiscoveryRadioSurfaceFilteringGapDetected:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceFilteringGapDetected,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected:
      calibratedFallbackGuardSummary.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected,
    candidateSignatureSourceSummaryPresent: calibratedFallbackGuardSummary.candidateSignatureSourceSummaryPresent,
    candidateSignatureSourceOutcomeCategory: calibratedFallbackGuardSummary.candidateSignatureSourceOutcomeCategory,
    candidateSignatureSourceRejectedReasons: calibratedFallbackGuardSummary.candidateSignatureSourceRejectedReasons,
    candidateSignatureSourceSummary: calibratedFallbackGuardSummary.candidateSignatureSourceSummary,
    candidateSignatureSourceCandidateCount: calibratedFallbackGuardSummary.candidateSignatureSourceCandidateCount,
    candidateSignatureSourceCandidatesWithOriginalFieldCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithOriginalFieldCount,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithSafeFieldKeyCount,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithIdOrNameKeyCount,
    candidateSignatureSourceCandidatesWithInputTypeCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithInputTypeCount,
    candidateSignatureSourceCandidatesWithControlCategoryCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithControlCategoryCount,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithContainerContextLabelsCount,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount,
    candidateSignatureSourceCandidatesWithGroupNameCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithGroupNameCount,
    candidateSignatureSourceCandidatesWithResolvedLabelCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithResolvedLabelCount,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithAnyLabelBucketCount,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount:
      calibratedFallbackGuardSummary.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount,
    candidateSignatureSourceAllCandidatesReducedShape:
      calibratedFallbackGuardSummary.candidateSignatureSourceAllCandidatesReducedShape,
    candidateSignatureSourceAllCandidatesSurfaceEmpty:
      calibratedFallbackGuardSummary.candidateSignatureSourceAllCandidatesSurfaceEmpty,
    candidateSignatureSourcePotentialPropagationGapDetected:
      calibratedFallbackGuardSummary.candidateSignatureSourcePotentialPropagationGapDetected,
    ownershipSourceInputSummaryPresent: calibratedFallbackGuardSummary.ownershipSourceInputSummaryPresent,
    ownershipSourceInputOutcomeCategory: calibratedFallbackGuardSummary.ownershipSourceInputOutcomeCategory,
    ownershipSourceInputRejectedReasons: calibratedFallbackGuardSummary.ownershipSourceInputRejectedReasons,
    ownershipSourceInputSummary: calibratedFallbackGuardSummary.ownershipSourceInputSummary,
    ownershipSourceCandidateCount: calibratedFallbackGuardSummary.ownershipSourceCandidateCount,
    ownershipSourceCandidatesWithAnySignatureCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithAnySignatureCount,
    ownershipSourceCandidatesWithProxySignatureCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithProxySignatureCount,
    ownershipSourceCandidatesWithDomAttributeSignatureCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
    ownershipSourceCandidatesWithLayoutSignatureCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
    ownershipSourceCandidatesWithFieldKeyCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithFieldKeyCount,
    ownershipSourceCandidatesWithInputNameCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithInputNameCount,
    ownershipSourceCandidatesWithAriaAttributePresenceCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
    ownershipSourceCandidatesWithDataAttributePresenceCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
      calibratedFallbackGuardSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
    ownershipSourceInputAllCandidatesEmpty: calibratedFallbackGuardSummary.ownershipSourceInputAllCandidatesEmpty,
    ownershipSourceInputAnyCandidateHadUsableSource:
      calibratedFallbackGuardSummary.ownershipSourceInputAnyCandidateHadUsableSource,
    ownershipSourceInputHarvestGapDetected: calibratedFallbackGuardSummary.ownershipSourceInputHarvestGapDetected,
    ownershipSourceHarvestAttempted: calibratedFallbackGuardSummary.ownershipSourceHarvestAttempted,
    ownershipSourceHarvestOutcomeCategory: calibratedFallbackGuardSummary.ownershipSourceHarvestOutcomeCategory,
    ownershipSourceHarvestRejectedReasons: calibratedFallbackGuardSummary.ownershipSourceHarvestRejectedReasons,
    ownershipSourceHarvestSummary: calibratedFallbackGuardSummary.ownershipSourceHarvestSummary,
    ariaLabelledbyAttributePresentCount: calibratedFallbackGuardSummary.ariaLabelledbyAttributePresentCount,
    ariaDescribedbyAttributePresentCount: calibratedFallbackGuardSummary.ariaDescribedbyAttributePresentCount,
    sharedNamePresentCount: calibratedFallbackGuardSummary.sharedNamePresentCount,
    sharedOwnerPresentCount: calibratedFallbackGuardSummary.sharedOwnerPresentCount,
    docusignOwnerSignalPresentCount: calibratedFallbackGuardSummary.docusignOwnerSignalPresentCount,
    ownershipReferenceTargetLookupAttempted: calibratedFallbackGuardSummary.ownershipReferenceTargetLookupAttempted,
    ownershipReferenceTargetExistsCount: calibratedFallbackGuardSummary.ownershipReferenceTargetExistsCount,
    ownershipReferenceTargetVisibleCount: calibratedFallbackGuardSummary.ownershipReferenceTargetVisibleCount,
    ownershipReferenceTargetSafeTokenCount: calibratedFallbackGuardSummary.ownershipReferenceTargetSafeTokenCount,
    ownershipEvidenceFilteredAsGeneratedOnlyCount:
      calibratedFallbackGuardSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
    ownershipEvidenceFilteredAsGenericOnlyCount:
      calibratedFallbackGuardSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
    ownershipEvidenceFilteredByRedactionCount:
      calibratedFallbackGuardSummary.ownershipEvidenceFilteredByRedactionCount,
    ownershipEvidenceSourcesEmpty: calibratedFallbackGuardSummary.ownershipEvidenceSourcesEmpty,
    ownershipEvidenceSourcesPresentButNoSafeTokens:
      calibratedFallbackGuardSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
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