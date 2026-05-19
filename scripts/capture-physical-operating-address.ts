import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import {
  maybeExpandPhysicalOperatingAddressSection,
  SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV,
  type GuardedPhysicalOperatingAddressDiscoveryOptions,
  type PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary,
  type PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory,
  type PhysicalOperatingAddressAddressOptionsAnchorRejectedReason,
  type PhysicalOperatingAddressAddressOptionsAnchorSourceChecked,
  type PhysicalOperatingAddressAddressOptionsAnchorTokenBucket,
  type PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary,
  type PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory,
  type PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason,
  type PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked,
  type PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked,
  type PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket,
  type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory,
  type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason,
  type PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary,
  type PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory,
  type PhysicalOperatingAddressCandidateSignatureSourceRejectedReason,
  type PhysicalOperatingAddressCandidateSignatureSourceSummary,
  type PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory,
  type PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason,
  type PhysicalOperatingAddressOwnershipSourceHarvestSummary,
  type PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory,
  type PhysicalOperatingAddressOwnershipSourceInputRejectedReason,
  type PhysicalOperatingAddressOwnershipSourceInputSummary,
  type PhysicalOperatingAddressCalibratedFallbackGuardSummary,
  type PhysicalOperatingAddressCalibratedFallbackRejectedReason,
  type PhysicalOperatingAddressExpansionSkippedReason,
  type PhysicalOperatingAddressToggleSelectionMode,
  type PhysicalOperatingAddressToggleSelectionOutcomeCategory,
  type PhysicalOperatingAddressToggleSelectionStage,
  type PhysicalOperatingAddressUiEffectOutcomeCategory,
} from '../fixtures/conditional-discovery';
import {
  discoverFields,
  type FieldDiscoveryRadioBuilderSkipReason,
} from '../fixtures/field-discovery';
import { SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS_ENV } from '../fixtures/physical-address-dom-probe';
import {
  SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS_ENV,
  writePhysicalOperatingAddressPostToggleArtifacts,
} from '../fixtures/physical-address-post-toggle-capture';
import { hasSignerUrl, openSigner } from '../fixtures/signer-helpers';
import { loadEnv } from '../lib/config';
import { redactUrl } from '../lib/url-sanitize';

const ARTIFACTS_DIR = path.resolve(__dirname, '..', 'artifacts');

export const PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND = 'capture:physical-address';
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_SCRIPT_PATH = 'scripts/capture-physical-operating-address.ts';
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND = 'capture-physical-address';
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_DISCOVERY_OPTIONS: GuardedPhysicalOperatingAddressDiscoveryOptions = {
  stopAfterCaptureAttempt: true,
};
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_ARTIFACT_FILENAMES = [
  'latest-physical-operating-address-post-toggle-screenshot.png',
  'latest-physical-operating-address-post-toggle-dom.html',
  'latest-physical-operating-address-post-toggle-structure.json',
  'latest-physical-operating-address-post-toggle-structure.md',
] as const;
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES = {
  structureJson: 'latest-physical-operating-address-post-toggle-structure.json',
  domHtml: 'latest-physical-operating-address-post-toggle-dom.html',
} as const;
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_FILE_NAME = 'latest-physical-operating-address-capture-receipt.json';
export const PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_SENTINEL_PREFIX = 'PHYSICAL_ADDRESS_CAPTURE_RECEIPT_JSON:';

const PHYSICAL_ADDRESS_CAPTURE_ONLY_CALIBRATED_TARGET_SLOT = 2;
const PHYSICAL_ADDRESS_CAPTURE_ONLY_ANCHORLESS_FALLBACK_REASON =
  'calibrated-slot-2-allowed-after-anchorless-exact-three-guard';
const PHYSICAL_ADDRESS_CAPTURE_ONLY_ANCHORLESS_FALLBACK_USED_BECAUSE =
  'primary-and-cue-selection-failed-under-exact-three-guard';

const TOGGLE_FALLBACK_INVENTORY_DIAGNOSTIC_PREFIX = 'physical-operating-address discovery toggle fallback inventory: ';
const TOGGLE_SELECTION_REASON_DIAGNOSTIC_PREFIX = 'physical-operating-address discovery toggle selection reason: ';
const TOGGLE_CANDIDATE_SOURCE_DIAGNOSTIC_PREFIX = 'physical-operating-address discovery toggle candidate source: ';
const TOGGLE_CANDIDATE_DIAGNOSTIC_PREFIX = 'physical-operating-address discovery toggle candidate: ';

export interface PhysicalOperatingAddressCaptureOnlyArtifactState {
  fileName: string;
  exists: boolean;
  mtimeIso: string | null;
  generatedAt: string | null;
}

export interface PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot {
  structureJson: PhysicalOperatingAddressCaptureOnlyArtifactState;
  domHtml: PhysicalOperatingAddressCaptureOnlyArtifactState;
}

export interface PhysicalOperatingAddressCaptureOnlyArtifactFreshness {
  before: PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot;
  after: PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot;
  structureJsonExistsChanged: boolean;
  domHtmlExistsChanged: boolean;
  structureJsonGeneratedAtChanged: boolean;
  structureJsonMtimeChanged: boolean;
  domHtmlMtimeChanged: boolean;
  anyFreshnessSignalChanged: boolean;
  artifactsFresh: boolean;
  artifactsRemainStale: boolean;
  staleArtifactsIgnored: boolean;
  reportsRefreshSkipped: boolean;
  findingsOpenSkipped: boolean;
}

export type PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason =
  'calibrated-slot-2-allowed-after-anchorless-exact-three-guard';

export type PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause =
  'primary-and-cue-selection-failed-under-exact-three-guard';

export type PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome =
  | 'not-required'
  | 'passed-proof-visible-physical-fields-visible'
  | 'failed-proof-visible-physical-fields-hidden'
  | 'failed-proof-hidden-physical-fields-hidden'
  | 'failed-proof-hidden-physical-fields-visible';

export type PhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote =
  | 'capture-only-path'
  | 'finalization-controls-forbidden'
  | 'address-options-anchor-not-required-under-exact-three-guard'
  | 'slot-2-selection-requires-post-click-ui-validation'
  | 'proof-and-physical-fields-must-both-be-visible';

export type PhysicalOperatingAddressCaptureOnlySelectionMode = 'primary' | 'fallback' | 'calibrated-fallback' | null;

export type PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory =
  | 'expansion-skipped-no-selected-toggle'
  | 'expansion-attempted-not-expanded'
  | 'expansion-expanded-no-capture-report'
  | 'post-click-ui-effect-validation-failed'
  | 'capture-report-not-writable'
  | 'writer-failed'
  | 'stale-artifact-blocked'
  | 'another bounded reason'
  | null;

export type PhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory =
  | 'no-pre-signer-failure'
  | 'resend-failed'
  | 'gmail-poll-timeout'
  | 'gmail-invite-not-found'
  | 'gmail-link-extraction-failed'
  | 'child-runner-not-launched'
  | 'child-runner-missing-signer-url'
  | 'child-runner-exited-before-open-signer'
  | 'open-signer-navigation-failed'
  | 'external-warning-handling-failed'
  | 'signer-surface-timeout'
  | 'signer-surface-not-reached'
  | 'malformed-child-receipt'
  | 'missing-child-receipt'
  | 'another-bounded-pre-signer-failure';

export type PhysicalOperatingAddressCaptureOnlyPreSignerFailureStage =
  | 'none'
  | 'bootstrap-resend'
  | 'bootstrap-gmail-poll'
  | 'bootstrap-link-extraction'
  | 'bootstrap-child-launch'
  | 'bootstrap-receipt-preservation'
  | 'child-pre-open-signer'
  | 'child-open-signer'
  | 'child-signer-surface-wait'
  | 'child-signer-surface'
  | 'another-bounded-pre-signer-stage';

export interface PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields {
  preSignerFailureSummaryPresent: boolean;
  preSignerFailureCategory: PhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory;
  preSignerFailureStage: PhysicalOperatingAddressCaptureOnlyPreSignerFailureStage;
  preSignerFailureReason: string | null;
  preSignerFailureSummary: string | null;
  bootstrapResendAttempted: boolean;
  bootstrapResendSucceeded: boolean | null;
  gmailPollAttempted: boolean;
  gmailInviteFound: boolean | null;
  gmailSigningLinkExtracted: boolean | null;
  childRunnerLaunched: boolean;
  childRunnerReceivedSignerUrl: boolean | null;
  childRunnerStartedCapture: boolean;
  openSignerAttempted: boolean;
  openSignerExternalWarningHandled: boolean | null;
  openSignerReachedSignerSurface: boolean;
  signerSurfaceWaitAttempted: boolean;
  signerSurfaceWaitTimedOut: boolean | null;
  preSignerFailureBeforeChildLaunch: boolean;
  preSignerFailureInChildRunner: boolean;
  preSignerFailureReceiptPreserved: boolean;
}

export type PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput =
  Partial<Omit<PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields, 'preSignerFailureSummaryPresent'>>;

export interface PhysicalOperatingAddressCaptureOnlyCalibratedFallbackGuardSummary {
  addressOptionsAnchorMatched: boolean | null;
  addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory | null;
  addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[];
  addressOptionsAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary | null;
  addressOptionsAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[];
  addressOptionsAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorTextBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorFieldKeyBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorContainerBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorAttributeBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory | null;
  addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[];
  addressOptionsGroupAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary | null;
  addressOptionsGroupAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[];
  addressOptionsGroupAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAccessibleNameBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupLegendBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupQuestionPromptBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupSectionHeaderBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAssociationBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory | null;
  addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[];
  addressOptionsOwnershipAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary | null;
  addressOptionsOwnershipAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[];
  addressOptionsOwnershipAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaLabelledbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaDescribedbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedNameBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupDocusignOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupReferenceTargetExists: boolean | null;
  radioGroupReferenceTargetVisible: boolean | null;
  radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory | null;
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean | null;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory | null;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary | null;
  fieldDiscoveryTotalFieldCount: number | null;
  fieldDiscoveryVisibleRadioInputCount: number | null;
  fieldDiscoveryVisibleEditableRadioInputCount: number | null;
  fieldDiscoveryExactThreeRadioCandidateCount: number | null;
  fieldDiscoveryRadioBuildersAttempted: boolean | null;
  fieldDiscoveryRadioBuildersSkipped: boolean | null;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithInputNameCount: number | null;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number | null;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number | null;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number | null;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number | null;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number | null;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number | null;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number | null;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean | null;
  candidateSignatureSourceSummaryPresent: boolean | null;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory | null;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary | null;
  candidateSignatureSourceCandidateCount: number | null;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number | null;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number | null;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number | null;
  candidateSignatureSourceCandidatesWithInputTypeCount: number | null;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number | null;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number | null;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number | null;
  candidateSignatureSourceCandidatesWithGroupNameCount: number | null;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number | null;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number | null;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number | null;
  candidateSignatureSourceAllCandidatesReducedShape: boolean | null;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean | null;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean | null;
  ownershipSourceInputSummaryPresent: boolean | null;
  ownershipSourceInputOutcomeCategory: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory | null;
  ownershipSourceInputRejectedReasons: PhysicalOperatingAddressOwnershipSourceInputRejectedReason[];
  ownershipSourceInputSummary: PhysicalOperatingAddressOwnershipSourceInputSummary | null;
  ownershipSourceCandidateCount: number | null;
  ownershipSourceCandidatesWithAnySignatureCount: number | null;
  ownershipSourceCandidatesWithProxySignatureCount: number | null;
  ownershipSourceCandidatesWithDomAttributeSignatureCount: number | null;
  ownershipSourceCandidatesWithRadioGraphicSignatureCount: number | null;
  ownershipSourceCandidatesWithLayoutSignatureCount: number | null;
  ownershipSourceCandidatesWithFieldKeyCount: number | null;
  ownershipSourceCandidatesWithInputNameCount: number | null;
  ownershipSourceCandidatesWithAriaAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithDataAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithDocusignAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: number | null;
  ownershipSourceInputAllCandidatesEmpty: boolean | null;
  ownershipSourceInputAnyCandidateHadUsableSource: boolean | null;
  ownershipSourceInputHarvestGapDetected: boolean | null;
  ownershipSourceHarvestAttempted: boolean | null;
  ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory | null;
  ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[];
  ownershipSourceHarvestSummary: PhysicalOperatingAddressOwnershipSourceHarvestSummary | null;
  ariaLabelledbyAttributePresentCount: number | null;
  ariaDescribedbyAttributePresentCount: number | null;
  sharedNamePresentCount: number | null;
  sharedOwnerPresentCount: number | null;
  docusignOwnerSignalPresentCount: number | null;
  ownershipReferenceTargetLookupAttempted: boolean | null;
  ownershipReferenceTargetExistsCount: number | null;
  ownershipReferenceTargetVisibleCount: number | null;
  ownershipReferenceTargetSafeTokenCount: number | null;
  ownershipEvidenceFilteredAsGeneratedOnlyCount: number | null;
  ownershipEvidenceFilteredAsGenericOnlyCount: number | null;
  ownershipEvidenceFilteredByRedactionCount: number | null;
  ownershipEvidenceSourcesEmpty: boolean | null;
  ownershipEvidenceSourcesPresentButNoSafeTokens: boolean | null;
  exactThreeRadioGuardPassed: boolean | null;
  candidateOrderStable: boolean | null;
  conflictingCueDetected: boolean | null;
}

export interface PhysicalOperatingAddressCaptureOnlyTargetFileFreshnessSummary {
  fileName: string;
  existsBefore: boolean;
  existsAfter: boolean;
  mtimeChanged: boolean;
  generatedAtChanged: boolean | null;
  fresh: boolean;
  stale: boolean;
}

export interface PhysicalOperatingAddressCaptureOnlyReceipt extends PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields {
  runKind: typeof PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND;
  childCommand: string;
  childExitCode: number | null;
  bootstrapExitCode: number | null;
  signerSurfaceReached: boolean;
  initialFieldCount: number | null;
  toggleSelectionOutcomeCategory: PhysicalOperatingAddressToggleSelectionOutcomeCategory | null;
  toggleSelectionStage: PhysicalOperatingAddressToggleSelectionStage | null;
  toggleSelectionMode: PhysicalOperatingAddressToggleSelectionMode;
  selectedToggleSlot: number | null;
  selectedToggleReason: string | null;
  fallbackReason: string | null;
  calibratedFallbackConsidered: boolean;
  calibratedFallbackAllowed: boolean | null;
  calibratedFallbackSelected: boolean | null;
  calibratedFallbackSelectedSlot: number | null;
  calibratedFallbackRejectedReasons: PhysicalOperatingAddressCalibratedFallbackRejectedReason[];
  calibratedAnchorlessFallbackEnabled: boolean;
  calibratedAnchorlessFallbackReason: PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason | null;
  calibratedAnchorlessFallbackGuardPassed: boolean;
  calibratedAnchorlessFallbackTargetSlot: number | null;
  calibratedAnchorlessFallbackCaptureOnly: boolean;
  calibratedAnchorlessFallbackUsedBecause: PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause | null;
  postClickUiEffectValidationRequired: boolean;
  postClickUiEffectValidationPassed: boolean | null;
  postClickUiEffectValidationOutcome: PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome;
  calibratedFallbackSafetyNotes: PhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote[];
  calibratedFallbackGuardSummary: PhysicalOperatingAddressCaptureOnlyCalibratedFallbackGuardSummary;
  primarySelectionCandidateCount: number | null;
  cueBasedFallbackCandidateCount: number | null;
  calibratedFallbackCandidateCount: number | null;
  eligibleRadioCandidateCount: number | null;
  exactThreeRadioGuardPassed: boolean | null;
  addressOptionsAnchorMatched: boolean | null;
  addressOptionsAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory | null;
  addressOptionsAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsAnchorRejectedReason[];
  addressOptionsAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary | null;
  addressOptionsAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsAnchorSourceChecked[];
  addressOptionsAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorTextBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorFieldKeyBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorContainerBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsAnchorAttributeBucketsPresent: PhysicalOperatingAddressAddressOptionsAnchorTokenBucket[];
  addressOptionsGroupAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory | null;
  addressOptionsGroupAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason[];
  addressOptionsGroupAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary | null;
  addressOptionsGroupAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked[];
  addressOptionsGroupAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAccessibleNameBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupLegendBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupQuestionPromptBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupSectionHeaderBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  radioGroupAssociationBucketsPresent: PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket[];
  addressOptionsOwnershipAnchorOutcomeCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory | null;
  addressOptionsOwnershipAnchorRejectedReasons: PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason[];
  addressOptionsOwnershipAnchorEvidenceSummary: PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary | null;
  addressOptionsOwnershipAnchorSourcesChecked: PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked[];
  addressOptionsOwnershipAnchorSafeTokensObserved: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaLabelledbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupAriaDescribedbyBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedNameBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupSharedOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupDocusignOwnerBucketsPresent: PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket[];
  radioGroupReferenceTargetExists: boolean | null;
  radioGroupReferenceTargetVisible: boolean | null;
  radioGroupCommonOwnerCategory: PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory | null;
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean | null;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory | null;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary | null;
  fieldDiscoveryTotalFieldCount: number | null;
  fieldDiscoveryVisibleRadioInputCount: number | null;
  fieldDiscoveryVisibleEditableRadioInputCount: number | null;
  fieldDiscoveryExactThreeRadioCandidateCount: number | null;
  fieldDiscoveryRadioBuildersAttempted: boolean | null;
  fieldDiscoveryRadioBuildersSkipped: boolean | null;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithInputNameCount: number | null;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number | null;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number | null;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number | null;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number | null;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number | null;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number | null;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number | null;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean | null;
  candidateSignatureSourceSummaryPresent: boolean | null;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory | null;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary | null;
  candidateSignatureSourceCandidateCount: number | null;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number | null;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number | null;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number | null;
  candidateSignatureSourceCandidatesWithInputTypeCount: number | null;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number | null;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number | null;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number | null;
  candidateSignatureSourceCandidatesWithGroupNameCount: number | null;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number | null;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number | null;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number | null;
  candidateSignatureSourceAllCandidatesReducedShape: boolean | null;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean | null;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean | null;
  ownershipSourceInputSummaryPresent: boolean | null;
  ownershipSourceInputOutcomeCategory: PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory | null;
  ownershipSourceInputRejectedReasons: PhysicalOperatingAddressOwnershipSourceInputRejectedReason[];
  ownershipSourceInputSummary: PhysicalOperatingAddressOwnershipSourceInputSummary | null;
  ownershipSourceCandidateCount: number | null;
  ownershipSourceCandidatesWithAnySignatureCount: number | null;
  ownershipSourceCandidatesWithProxySignatureCount: number | null;
  ownershipSourceCandidatesWithDomAttributeSignatureCount: number | null;
  ownershipSourceCandidatesWithRadioGraphicSignatureCount: number | null;
  ownershipSourceCandidatesWithLayoutSignatureCount: number | null;
  ownershipSourceCandidatesWithFieldKeyCount: number | null;
  ownershipSourceCandidatesWithInputNameCount: number | null;
  ownershipSourceCandidatesWithAriaAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithDataAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithDocusignAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: number | null;
  ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: number | null;
  ownershipSourceInputAllCandidatesEmpty: boolean | null;
  ownershipSourceInputAnyCandidateHadUsableSource: boolean | null;
  ownershipSourceInputHarvestGapDetected: boolean | null;
  ownershipSourceHarvestAttempted: boolean | null;
  ownershipSourceHarvestOutcomeCategory: PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory | null;
  ownershipSourceHarvestRejectedReasons: PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason[];
  ownershipSourceHarvestSummary: PhysicalOperatingAddressOwnershipSourceHarvestSummary | null;
  ariaLabelledbyAttributePresentCount: number | null;
  ariaDescribedbyAttributePresentCount: number | null;
  sharedNamePresentCount: number | null;
  sharedOwnerPresentCount: number | null;
  docusignOwnerSignalPresentCount: number | null;
  ownershipReferenceTargetLookupAttempted: boolean | null;
  ownershipReferenceTargetExistsCount: number | null;
  ownershipReferenceTargetVisibleCount: number | null;
  ownershipReferenceTargetSafeTokenCount: number | null;
  ownershipEvidenceFilteredAsGeneratedOnlyCount: number | null;
  ownershipEvidenceFilteredAsGenericOnlyCount: number | null;
  ownershipEvidenceFilteredByRedactionCount: number | null;
  ownershipEvidenceSourcesEmpty: boolean | null;
  ownershipEvidenceSourcesPresentButNoSafeTokens: boolean | null;
  candidateOrderStable: boolean | null;
  conflictingCueDetected: boolean | null;
  selectionMode: PhysicalOperatingAddressCaptureOnlySelectionMode;
  proofOfAddressUploadVisibleBefore: boolean | null;
  proofOfAddressUploadVisibleAfter: boolean | null;
  proofOfAddressUploadVisibilityChanged: boolean | null;
  proofOfAddressUploadExpectedForSelectedOption: boolean | null;
  physicalOperatingAddressFieldsVisibleBefore: boolean | null;
  physicalOperatingAddressFieldsVisibleAfter: boolean | null;
  physicalOperatingAddressFieldsVisibilityChanged: boolean | null;
  physicalOperatingAddressFieldsExpectedForSelectedOption: boolean | null;
  uiEffectOutcomeCategory: PhysicalOperatingAddressUiEffectOutcomeCategory | null;
  expansionAttempted: boolean | null;
  expansionSkippedReason: PhysicalOperatingAddressExpansionSkippedReason;
  expansionReturned: boolean;
  expansionExpanded: boolean;
  captureReportPresent: boolean;
  captureReportWritable: boolean;
  writerCalled: boolean;
  writerCompleted: boolean;
  artifactsFresh: boolean;
  artifactsRemainStale: boolean;
  staleArtifactsIgnored: boolean;
  blockedReasonCategory: PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory;
  reportsRefreshSkipped: boolean;
  findingsOpenSkipped: boolean;
  targetFileFreshnessSummary: PhysicalOperatingAddressCaptureOnlyTargetFileFreshnessSummary[];
  redactionApplied: true;
}

type PhysicalOperatingAddressCaptureOnlyDependencies = {
  openSigner: typeof openSigner;
  discoverFields: typeof discoverFields;
  maybeExpandPhysicalOperatingAddressSection: typeof maybeExpandPhysicalOperatingAddressSection;
  writePhysicalOperatingAddressPostToggleArtifacts: typeof writePhysicalOperatingAddressPostToggleArtifacts;
  readArtifactFreshnessSnapshot: typeof readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot;
};

type CandidateSignatureSourceFieldCarrier = {
  candidateSignatureSourceSummaryPresent: boolean | null;
  candidateSignatureSourceOutcomeCategory: PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory | null;
  candidateSignatureSourceRejectedReasons: PhysicalOperatingAddressCandidateSignatureSourceRejectedReason[];
  candidateSignatureSourceSummary: PhysicalOperatingAddressCandidateSignatureSourceSummary | null;
  candidateSignatureSourceCandidateCount: number | null;
  candidateSignatureSourceCandidatesWithOriginalFieldCount: number | null;
  candidateSignatureSourceCandidatesWithSafeFieldKeyCount: number | null;
  candidateSignatureSourceCandidatesWithIdOrNameKeyCount: number | null;
  candidateSignatureSourceCandidatesWithInputTypeCount: number | null;
  candidateSignatureSourceCandidatesWithControlCategoryCount: number | null;
  candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: number | null;
  candidateSignatureSourceCandidatesWithContainerContextLabelsCount: number | null;
  candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: number | null;
  candidateSignatureSourceCandidatesWithGroupNameCount: number | null;
  candidateSignatureSourceCandidatesWithResolvedLabelCount: number | null;
  candidateSignatureSourceCandidatesWithAnyLabelBucketCount: number | null;
  candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: number | null;
  candidateSignatureSourceAllCandidatesReducedShape: boolean | null;
  candidateSignatureSourceAllCandidatesSurfaceEmpty: boolean | null;
  candidateSignatureSourcePotentialPropagationGapDetected: boolean | null;
};

type FieldDiscoveryRadioSurfaceFieldCarrier = {
  fieldDiscoveryRadioSurfaceSummaryPresent: boolean | null;
  fieldDiscoveryRadioSurfaceOutcomeCategory: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory | null;
  fieldDiscoveryRadioSurfaceRejectedReasons: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason[];
  fieldDiscoveryRadioSurfaceSummary: PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary | null;
  fieldDiscoveryTotalFieldCount: number | null;
  fieldDiscoveryVisibleRadioInputCount: number | null;
  fieldDiscoveryVisibleEditableRadioInputCount: number | null;
  fieldDiscoveryExactThreeRadioCandidateCount: number | null;
  fieldDiscoveryRadioBuildersAttempted: boolean | null;
  fieldDiscoveryRadioBuildersSkipped: boolean | null;
  fieldDiscoveryRadioBuilderSkipReasons: FieldDiscoveryRadioBuilderSkipReason[];
  fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: number | null;
  fieldDiscoveryRadioFieldsWithInputNameCount: number | null;
  fieldDiscoveryRadioFieldsWithGroupNameCount: number | null;
  fieldDiscoveryRadioFieldsWithResolvedLabelCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: number | null;
  fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: number | null;
  fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: number | null;
  fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: number | null;
  fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: number | null;
  fieldDiscoveryRadioFieldsSurfaceEmptyCount: number | null;
  fieldDiscoveryRadioFieldsGeneratedOnlyCount: number | null;
  fieldDiscoveryRadioFieldsUnsafeOmittedCount: number | null;
  fieldDiscoveryRadioSurfaceAttachmentGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceFilteringGapDetected: boolean | null;
  fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: boolean | null;
};

export interface PhysicalOperatingAddressCaptureOnlyResult {
  diagnostics: string[];
  fieldsBefore: number;
  fieldsAfter: number;
  captureWritten: boolean;
  artifactPaths: Awaited<ReturnType<typeof writePhysicalOperatingAddressPostToggleArtifacts>> | null;
  expansionReturned: boolean;
  expansionExpanded: boolean;
  captureReportPresent: boolean;
  captureReportWritable: boolean;
  writerCalled: boolean;
  writerCompleted: boolean;
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
  calibratedFallbackGuardSummary: PhysicalOperatingAddressCaptureOnlyCalibratedFallbackGuardSummary;
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
  candidateOrderStable: boolean;
  conflictingCueDetected: boolean;
  proofOfAddressUploadVisibleBefore: boolean;
  proofOfAddressUploadVisibleAfter: boolean;
  proofOfAddressUploadVisibilityChanged: boolean;
  proofOfAddressUploadExpectedForSelectedOption: boolean | null;
  physicalOperatingAddressFieldsVisibleBefore: boolean;
  physicalOperatingAddressFieldsVisibleAfter: boolean;
  physicalOperatingAddressFieldsVisibilityChanged: boolean;
  physicalOperatingAddressFieldsExpectedForSelectedOption: boolean | null;
  uiEffectOutcomeCategory: PhysicalOperatingAddressUiEffectOutcomeCategory;
  expansionAttempted: boolean;
  expansionSkippedReason: PhysicalOperatingAddressExpansionSkippedReason;
  artifactFreshness: PhysicalOperatingAddressCaptureOnlyArtifactFreshness;
  reason: string;
}

type ExitReason = { code: number; reason: string };

const PHYSICAL_ADDRESS_CAPTURE_ONLY_DEPENDENCIES: PhysicalOperatingAddressCaptureOnlyDependencies = {
  openSigner,
  discoverFields,
  maybeExpandPhysicalOperatingAddressSection,
  writePhysicalOperatingAddressPostToggleArtifacts,
  readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
};

function buildCandidateSignatureSourceFieldProjection<T extends CandidateSignatureSourceFieldCarrier>(
  source: T,
): CandidateSignatureSourceFieldCarrier {
  return {
    candidateSignatureSourceSummaryPresent: source.candidateSignatureSourceSummaryPresent,
    candidateSignatureSourceOutcomeCategory: source.candidateSignatureSourceOutcomeCategory,
    candidateSignatureSourceRejectedReasons: source.candidateSignatureSourceRejectedReasons,
    candidateSignatureSourceSummary: source.candidateSignatureSourceSummary,
    candidateSignatureSourceCandidateCount: source.candidateSignatureSourceCandidateCount,
    candidateSignatureSourceCandidatesWithOriginalFieldCount:
      source.candidateSignatureSourceCandidatesWithOriginalFieldCount,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount:
      source.candidateSignatureSourceCandidatesWithSafeFieldKeyCount,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount:
      source.candidateSignatureSourceCandidatesWithIdOrNameKeyCount,
    candidateSignatureSourceCandidatesWithInputTypeCount:
      source.candidateSignatureSourceCandidatesWithInputTypeCount,
    candidateSignatureSourceCandidatesWithControlCategoryCount:
      source.candidateSignatureSourceCandidatesWithControlCategoryCount,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount:
      source.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount:
      source.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount:
      source.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount:
      source.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount:
      source.candidateSignatureSourceCandidatesWithContainerContextLabelsCount,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount:
      source.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount,
    candidateSignatureSourceCandidatesWithGroupNameCount:
      source.candidateSignatureSourceCandidatesWithGroupNameCount,
    candidateSignatureSourceCandidatesWithResolvedLabelCount:
      source.candidateSignatureSourceCandidatesWithResolvedLabelCount,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount:
      source.candidateSignatureSourceCandidatesWithAnyLabelBucketCount,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount:
      source.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount,
    candidateSignatureSourceAllCandidatesReducedShape: source.candidateSignatureSourceAllCandidatesReducedShape,
    candidateSignatureSourceAllCandidatesSurfaceEmpty: source.candidateSignatureSourceAllCandidatesSurfaceEmpty,
    candidateSignatureSourcePotentialPropagationGapDetected:
      source.candidateSignatureSourcePotentialPropagationGapDetected,
  };
}

function buildFieldDiscoveryRadioSurfaceFieldProjection<T extends FieldDiscoveryRadioSurfaceFieldCarrier>(
  source: T,
): FieldDiscoveryRadioSurfaceFieldCarrier {
  return {
    fieldDiscoveryRadioSurfaceSummaryPresent: source.fieldDiscoveryRadioSurfaceSummaryPresent,
    fieldDiscoveryRadioSurfaceOutcomeCategory: source.fieldDiscoveryRadioSurfaceOutcomeCategory,
    fieldDiscoveryRadioSurfaceRejectedReasons: source.fieldDiscoveryRadioSurfaceRejectedReasons,
    fieldDiscoveryRadioSurfaceSummary: source.fieldDiscoveryRadioSurfaceSummary,
    fieldDiscoveryTotalFieldCount: source.fieldDiscoveryTotalFieldCount,
    fieldDiscoveryVisibleRadioInputCount: source.fieldDiscoveryVisibleRadioInputCount,
    fieldDiscoveryVisibleEditableRadioInputCount: source.fieldDiscoveryVisibleEditableRadioInputCount,
    fieldDiscoveryExactThreeRadioCandidateCount: source.fieldDiscoveryExactThreeRadioCandidateCount,
    fieldDiscoveryRadioBuildersAttempted: source.fieldDiscoveryRadioBuildersAttempted,
    fieldDiscoveryRadioBuildersSkipped: source.fieldDiscoveryRadioBuildersSkipped,
    fieldDiscoveryRadioBuilderSkipReasons: source.fieldDiscoveryRadioBuilderSkipReasons,
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: source.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: source.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount,
    fieldDiscoveryRadioFieldsWithInputNameCount: source.fieldDiscoveryRadioFieldsWithInputNameCount,
    fieldDiscoveryRadioFieldsWithGroupNameCount: source.fieldDiscoveryRadioFieldsWithGroupNameCount,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount: source.fieldDiscoveryRadioFieldsWithResolvedLabelCount,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: source.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount:
      source.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount:
      source.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount:
      source.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount:
      source.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount:
      source.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount:
      source.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount:
      source.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount: source.fieldDiscoveryRadioFieldsSurfaceEmptyCount,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount: source.fieldDiscoveryRadioFieldsGeneratedOnlyCount,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount: source.fieldDiscoveryRadioFieldsUnsafeOmittedCount,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected:
      source.fieldDiscoveryRadioSurfaceAttachmentGapDetected,
    fieldDiscoveryRadioSurfaceFilteringGapDetected:
      source.fieldDiscoveryRadioSurfaceFilteringGapDetected,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected:
      source.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected,
  };
}

function normalizeDiagnosticText(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

function buildPhysicalOperatingAddressCaptureOnlyFallbackFreshness(
  artifactsDir: string,
): PhysicalOperatingAddressCaptureOnlyArtifactFreshness {
  const snapshot = readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot(artifactsDir);
  return comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(snapshot, snapshot);
}

function buildPhysicalOperatingAddressCaptureOnlyFallbackGuardSummary(): PhysicalOperatingAddressCaptureOnlyCalibratedFallbackGuardSummary {
  return {
    addressOptionsAnchorMatched: null,
    addressOptionsAnchorOutcomeCategory: null,
    addressOptionsAnchorRejectedReasons: [],
    addressOptionsAnchorEvidenceSummary: null,
    addressOptionsAnchorSourcesChecked: [],
    addressOptionsAnchorSafeTokensObserved: [],
    addressOptionsAnchorTextBucketsPresent: [],
    addressOptionsAnchorFieldKeyBucketsPresent: [],
    addressOptionsAnchorContainerBucketsPresent: [],
    addressOptionsAnchorAttributeBucketsPresent: [],
    addressOptionsGroupAnchorOutcomeCategory: null,
    addressOptionsGroupAnchorRejectedReasons: [],
    addressOptionsGroupAnchorEvidenceSummary: null,
    addressOptionsGroupAnchorSourcesChecked: [],
    addressOptionsGroupAnchorSafeTokensObserved: [],
    radioGroupAccessibleNameBucketsPresent: [],
    radioGroupLegendBucketsPresent: [],
    radioGroupQuestionPromptBucketsPresent: [],
    radioGroupSectionHeaderBucketsPresent: [],
    radioGroupAssociationBucketsPresent: [],
    addressOptionsOwnershipAnchorOutcomeCategory: null,
    addressOptionsOwnershipAnchorRejectedReasons: [],
    addressOptionsOwnershipAnchorEvidenceSummary: null,
    addressOptionsOwnershipAnchorSourcesChecked: [],
    addressOptionsOwnershipAnchorSafeTokensObserved: [],
    radioGroupAriaLabelledbyBucketsPresent: [],
    radioGroupAriaDescribedbyBucketsPresent: [],
    radioGroupSharedNameBucketsPresent: [],
    radioGroupSharedOwnerBucketsPresent: [],
    radioGroupDocusignOwnerBucketsPresent: [],
    radioGroupReferenceTargetExists: null,
    radioGroupReferenceTargetVisible: null,
    radioGroupCommonOwnerCategory: null,
    fieldDiscoveryRadioSurfaceSummaryPresent: null,
    fieldDiscoveryRadioSurfaceOutcomeCategory: null,
    fieldDiscoveryRadioSurfaceRejectedReasons: [],
    fieldDiscoveryRadioSurfaceSummary: null,
    fieldDiscoveryTotalFieldCount: null,
    fieldDiscoveryVisibleRadioInputCount: null,
    fieldDiscoveryVisibleEditableRadioInputCount: null,
    fieldDiscoveryExactThreeRadioCandidateCount: null,
    fieldDiscoveryRadioBuildersAttempted: null,
    fieldDiscoveryRadioBuildersSkipped: null,
    fieldDiscoveryRadioBuilderSkipReasons: [],
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: null,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: null,
    fieldDiscoveryRadioFieldsWithInputNameCount: null,
    fieldDiscoveryRadioFieldsWithGroupNameCount: null,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount: null,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: null,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: null,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: null,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: null,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: null,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: null,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: null,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: null,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount: null,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount: null,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount: null,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected: null,
    fieldDiscoveryRadioSurfaceFilteringGapDetected: null,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: null,
    candidateSignatureSourceSummaryPresent: null,
    candidateSignatureSourceOutcomeCategory: null,
    candidateSignatureSourceRejectedReasons: [],
    candidateSignatureSourceSummary: null,
    candidateSignatureSourceCandidateCount: null,
    candidateSignatureSourceCandidatesWithOriginalFieldCount: null,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount: null,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount: null,
    candidateSignatureSourceCandidatesWithInputTypeCount: null,
    candidateSignatureSourceCandidatesWithControlCategoryCount: null,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: null,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: null,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: null,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: null,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount: null,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: null,
    candidateSignatureSourceCandidatesWithGroupNameCount: null,
    candidateSignatureSourceCandidatesWithResolvedLabelCount: null,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount: null,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: null,
    candidateSignatureSourceAllCandidatesReducedShape: null,
    candidateSignatureSourceAllCandidatesSurfaceEmpty: null,
    candidateSignatureSourcePotentialPropagationGapDetected: null,
    ownershipSourceInputSummaryPresent: null,
    ownershipSourceInputOutcomeCategory: null,
    ownershipSourceInputRejectedReasons: [],
    ownershipSourceInputSummary: null,
    ownershipSourceCandidateCount: null,
    ownershipSourceCandidatesWithAnySignatureCount: null,
    ownershipSourceCandidatesWithProxySignatureCount: null,
    ownershipSourceCandidatesWithDomAttributeSignatureCount: null,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount: null,
    ownershipSourceCandidatesWithLayoutSignatureCount: null,
    ownershipSourceCandidatesWithFieldKeyCount: null,
    ownershipSourceCandidatesWithInputNameCount: null,
    ownershipSourceCandidatesWithAriaAttributePresenceCount: null,
    ownershipSourceCandidatesWithDataAttributePresenceCount: null,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount: null,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: null,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: null,
    ownershipSourceInputAllCandidatesEmpty: null,
    ownershipSourceInputAnyCandidateHadUsableSource: null,
    ownershipSourceInputHarvestGapDetected: null,
    ownershipSourceHarvestAttempted: null,
    ownershipSourceHarvestOutcomeCategory: null,
    ownershipSourceHarvestRejectedReasons: [],
    ownershipSourceHarvestSummary: null,
    ariaLabelledbyAttributePresentCount: null,
    ariaDescribedbyAttributePresentCount: null,
    sharedNamePresentCount: null,
    sharedOwnerPresentCount: null,
    docusignOwnerSignalPresentCount: null,
    ownershipReferenceTargetLookupAttempted: null,
    ownershipReferenceTargetExistsCount: null,
    ownershipReferenceTargetVisibleCount: null,
    ownershipReferenceTargetSafeTokenCount: null,
    ownershipEvidenceFilteredAsGeneratedOnlyCount: null,
    ownershipEvidenceFilteredAsGenericOnlyCount: null,
    ownershipEvidenceFilteredByRedactionCount: null,
    ownershipEvidenceSourcesEmpty: null,
    ownershipEvidenceSourcesPresentButNoSafeTokens: null,
    exactThreeRadioGuardPassed: null,
    candidateOrderStable: null,
    conflictingCueDetected: null,
  };
}

function buildPhysicalOperatingAddressCaptureOnlyTargetFileFreshnessSummary(
  freshness: PhysicalOperatingAddressCaptureOnlyArtifactFreshness,
): PhysicalOperatingAddressCaptureOnlyTargetFileFreshnessSummary[] {
  const structureFresh = freshness.after.structureJson.exists
    && (freshness.structureJsonExistsChanged || freshness.structureJsonGeneratedAtChanged || freshness.structureJsonMtimeChanged);
  const domFresh = freshness.after.domHtml.exists
    && (freshness.domHtmlExistsChanged || freshness.domHtmlMtimeChanged);

  return [
    {
      fileName: freshness.after.structureJson.fileName,
      existsBefore: freshness.before.structureJson.exists,
      existsAfter: freshness.after.structureJson.exists,
      mtimeChanged: freshness.structureJsonMtimeChanged,
      generatedAtChanged: freshness.structureJsonGeneratedAtChanged,
      fresh: structureFresh,
      stale: !structureFresh,
    },
    {
      fileName: freshness.after.domHtml.fileName,
      existsBefore: freshness.before.domHtml.exists,
      existsAfter: freshness.after.domHtml.exists,
      mtimeChanged: freshness.domHtmlMtimeChanged,
      generatedAtChanged: null,
      fresh: domFresh,
      stale: !domFresh,
    },
  ];
}

function coalesceDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureDetail(
  category: PhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory,
): {
  stage: PhysicalOperatingAddressCaptureOnlyPreSignerFailureStage;
  reason: string | null;
  summary: string | null;
} {
  switch (category) {
    case 'no-pre-signer-failure':
      return {
        stage: 'none',
        reason: null,
        summary: null,
      };
    case 'resend-failed':
      return {
        stage: 'bootstrap-resend',
        reason: 'bootstrap resend failed',
        summary: 'bootstrap resend failed before Gmail polling or child launch began',
      };
    case 'gmail-poll-timeout':
      return {
        stage: 'bootstrap-gmail-poll',
        reason: 'gmail polling timed out before a usable DocuSign invite was selected',
        summary: 'bootstrap resend succeeded but Gmail polling timed out before a usable DocuSign invite was found',
      };
    case 'gmail-invite-not-found':
      return {
        stage: 'bootstrap-gmail-poll',
        reason: 'no usable Gmail invite was selected after bootstrap resend',
        summary: 'bootstrap resend succeeded but no usable Gmail invite was found for bounded link extraction',
      };
    case 'gmail-link-extraction-failed':
      return {
        stage: 'bootstrap-link-extraction',
        reason: 'Gmail invite was found but no DocuSign signing link was extracted',
        summary: 'bootstrap found an invite email but bounded signing-link extraction produced no signer URL',
      };
    case 'child-runner-not-launched':
      return {
        stage: 'bootstrap-child-launch',
        reason: 'bootstrap could not launch the capture child runner',
        summary: 'bootstrap finished resend and Gmail/link extraction but the capture child runner was not launched',
      };
    case 'child-runner-missing-signer-url':
      return {
        stage: 'child-pre-open-signer',
        reason: 'capture child runner started without a signer URL',
        summary: 'the child runner started but DOCUSIGN_SIGNING_URL was unavailable before openSigner',
      };
    case 'child-runner-exited-before-open-signer':
      return {
        stage: 'child-pre-open-signer',
        reason: 'the child runner exited before openSigner was attempted',
        summary: 'the child runner started but exited before the signer surface could be opened',
      };
    case 'open-signer-navigation-failed':
      return {
        stage: 'child-open-signer',
        reason: 'openSigner failed before the signer surface was reached',
        summary: 'the child runner received a signer URL but openSigner navigation failed before signer readiness',
      };
    case 'external-warning-handling-failed':
      return {
        stage: 'child-open-signer',
        reason: 'openSigner failed while handling the bounded external-site warning',
        summary: 'the child runner reached the safe-redirect warning but could not complete the bounded external warning flow',
      };
    case 'signer-surface-timeout':
      return {
        stage: 'child-signer-surface-wait',
        reason: 'the signer surface did not become ready before timeout',
        summary: 'openSigner timed out while waiting for a usable signer surface',
      };
    case 'signer-surface-not-reached':
      return {
        stage: 'child-signer-surface',
        reason: 'the signer surface was not reached before capture aborted',
        summary: 'the child runner attempted openSigner but never reached a usable signer surface',
      };
    case 'malformed-child-receipt':
      return {
        stage: 'bootstrap-receipt-preservation',
        reason: 'bootstrap observed a malformed child receipt',
        summary: 'the child runner exited but bootstrap could not preserve a valid bounded child receipt',
      };
    case 'missing-child-receipt':
      return {
        stage: 'bootstrap-receipt-preservation',
        reason: 'bootstrap did not observe a child receipt',
        summary: 'the child runner exited without a bounded receipt for bootstrap to preserve',
      };
    case 'another-bounded-pre-signer-failure':
      return {
        stage: 'another-bounded-pre-signer-stage',
        reason: 'another bounded pre-signer failure blocked capture',
        summary: 'capture stopped before signer surface readiness for another bounded pre-signer reason',
      };
  }
}

export function buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput(
  category: PhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory,
  overrides: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput = {},
): PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput {
  const detail = buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureDetail(category);
  const base: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput = {
    preSignerFailureCategory: category,
    preSignerFailureStage: detail.stage,
    preSignerFailureReason: detail.reason,
    preSignerFailureSummary: detail.summary,
    bootstrapResendAttempted: false,
    bootstrapResendSucceeded: null,
    gmailPollAttempted: false,
    gmailInviteFound: null,
    gmailSigningLinkExtracted: null,
    childRunnerLaunched: false,
    childRunnerReceivedSignerUrl: null,
    childRunnerStartedCapture: false,
    openSignerAttempted: false,
    openSignerExternalWarningHandled: null,
    openSignerReachedSignerSurface: false,
    signerSurfaceWaitAttempted: false,
    signerSurfaceWaitTimedOut: null,
    preSignerFailureBeforeChildLaunch: false,
    preSignerFailureInChildRunner: false,
    preSignerFailureReceiptPreserved: false,
  };

  switch (category) {
    case 'no-pre-signer-failure':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerReachedSignerSurface: true,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: false,
      });
      break;
    case 'resend-failed':
      Object.assign(base, {
        bootstrapResendAttempted: true,
        bootstrapResendSucceeded: false,
        preSignerFailureBeforeChildLaunch: true,
      });
      break;
    case 'gmail-poll-timeout':
    case 'gmail-invite-not-found':
      Object.assign(base, {
        bootstrapResendAttempted: true,
        bootstrapResendSucceeded: true,
        gmailPollAttempted: true,
        gmailInviteFound: false,
        preSignerFailureBeforeChildLaunch: true,
      });
      break;
    case 'gmail-link-extraction-failed':
      Object.assign(base, {
        bootstrapResendAttempted: true,
        bootstrapResendSucceeded: true,
        gmailPollAttempted: true,
        gmailInviteFound: true,
        gmailSigningLinkExtracted: false,
        preSignerFailureBeforeChildLaunch: true,
      });
      break;
    case 'child-runner-not-launched':
      Object.assign(base, {
        bootstrapResendAttempted: true,
        bootstrapResendSucceeded: true,
        gmailPollAttempted: true,
        gmailInviteFound: true,
        gmailSigningLinkExtracted: true,
        childRunnerLaunched: false,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: false,
        preSignerFailureBeforeChildLaunch: true,
      });
      break;
    case 'child-runner-missing-signer-url':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: false,
        childRunnerStartedCapture: true,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'child-runner-exited-before-open-signer':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'open-signer-navigation-failed':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerReachedSignerSurface: false,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: false,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'external-warning-handling-failed':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerExternalWarningHandled: false,
        openSignerReachedSignerSurface: false,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: false,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'signer-surface-timeout':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerReachedSignerSurface: false,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: true,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'signer-surface-not-reached':
      Object.assign(base, {
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerReachedSignerSurface: false,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: false,
        preSignerFailureInChildRunner: true,
      });
      break;
    case 'malformed-child-receipt':
    case 'missing-child-receipt':
      Object.assign(base, {
        bootstrapResendAttempted: true,
        bootstrapResendSucceeded: true,
        gmailPollAttempted: true,
        gmailInviteFound: true,
        gmailSigningLinkExtracted: true,
        childRunnerLaunched: true,
        childRunnerReceivedSignerUrl: true,
        childRunnerStartedCapture: true,
      });
      break;
    case 'another-bounded-pre-signer-failure':
      break;
  }

  return {
    ...base,
    ...overrides,
    preSignerFailureCategory: overrides.preSignerFailureCategory ?? category,
    preSignerFailureStage: overrides.preSignerFailureStage ?? detail.stage,
    preSignerFailureReason: overrides.preSignerFailureReason ?? detail.reason,
    preSignerFailureSummary: overrides.preSignerFailureSummary ?? detail.summary,
  };
}

function pickPhysicalOperatingAddressCaptureOnlyPreSignerFailureFields(
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt,
): PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields {
  return {
    preSignerFailureSummaryPresent: receipt.preSignerFailureSummaryPresent,
    preSignerFailureCategory: receipt.preSignerFailureCategory,
    preSignerFailureStage: receipt.preSignerFailureStage,
    preSignerFailureReason: receipt.preSignerFailureReason,
    preSignerFailureSummary: receipt.preSignerFailureSummary,
    bootstrapResendAttempted: receipt.bootstrapResendAttempted,
    bootstrapResendSucceeded: receipt.bootstrapResendSucceeded,
    gmailPollAttempted: receipt.gmailPollAttempted,
    gmailInviteFound: receipt.gmailInviteFound,
    gmailSigningLinkExtracted: receipt.gmailSigningLinkExtracted,
    childRunnerLaunched: receipt.childRunnerLaunched,
    childRunnerReceivedSignerUrl: receipt.childRunnerReceivedSignerUrl,
    childRunnerStartedCapture: receipt.childRunnerStartedCapture,
    openSignerAttempted: receipt.openSignerAttempted,
    openSignerExternalWarningHandled: receipt.openSignerExternalWarningHandled,
    openSignerReachedSignerSurface: receipt.openSignerReachedSignerSurface,
    signerSurfaceWaitAttempted: receipt.signerSurfaceWaitAttempted,
    signerSurfaceWaitTimedOut: receipt.signerSurfaceWaitTimedOut,
    preSignerFailureBeforeChildLaunch: receipt.preSignerFailureBeforeChildLaunch,
    preSignerFailureInChildRunner: receipt.preSignerFailureInChildRunner,
    preSignerFailureReceiptPreserved: receipt.preSignerFailureReceiptPreserved,
  };
}

function buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureFields(input: {
  signerSurfaceReached: boolean;
  preSignerFailure?: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput;
  existing?: PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields;
  preserveExistingFailureDetail?: boolean;
}): PhysicalOperatingAddressCaptureOnlyPreSignerFailureFields {
  const fallbackCategory = input.signerSurfaceReached
    ? 'no-pre-signer-failure'
    : 'another-bounded-pre-signer-failure';
  const preferredExisting = input.preserveExistingFailureDetail ? input.existing : undefined;
  const category = preferredExisting?.preSignerFailureCategory
    ?? input.preSignerFailure?.preSignerFailureCategory
    ?? input.existing?.preSignerFailureCategory
    ?? fallbackCategory;
  const defaults = buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput(category);
  const stage = category === 'no-pre-signer-failure'
    ? 'none'
    : preferredExisting?.preSignerFailureStage
      ?? input.preSignerFailure?.preSignerFailureStage
      ?? input.existing?.preSignerFailureStage
      ?? defaults.preSignerFailureStage
      ?? 'another-bounded-pre-signer-stage';
  const reason = category === 'no-pre-signer-failure'
    ? null
    : preferredExisting?.preSignerFailureReason
      ?? input.preSignerFailure?.preSignerFailureReason
      ?? input.existing?.preSignerFailureReason
      ?? defaults.preSignerFailureReason
      ?? null;
  const summary = category === 'no-pre-signer-failure'
    ? null
    : preferredExisting?.preSignerFailureSummary
      ?? input.preSignerFailure?.preSignerFailureSummary
      ?? input.existing?.preSignerFailureSummary
      ?? defaults.preSignerFailureSummary
      ?? null;

  return {
    preSignerFailureSummaryPresent: category !== 'no-pre-signer-failure' && Boolean(summary),
    preSignerFailureCategory: category,
    preSignerFailureStage: stage,
    preSignerFailureReason: reason,
    preSignerFailureSummary: summary,
    bootstrapResendAttempted: coalesceDefined(
      input.preSignerFailure?.bootstrapResendAttempted,
      input.existing?.bootstrapResendAttempted,
      defaults.bootstrapResendAttempted,
    ) ?? false,
    bootstrapResendSucceeded: coalesceDefined(
      input.preSignerFailure?.bootstrapResendSucceeded,
      input.existing?.bootstrapResendSucceeded,
      defaults.bootstrapResendSucceeded,
    ) ?? null,
    gmailPollAttempted: coalesceDefined(
      input.preSignerFailure?.gmailPollAttempted,
      input.existing?.gmailPollAttempted,
      defaults.gmailPollAttempted,
    ) ?? false,
    gmailInviteFound: coalesceDefined(
      input.preSignerFailure?.gmailInviteFound,
      input.existing?.gmailInviteFound,
      defaults.gmailInviteFound,
    ) ?? null,
    gmailSigningLinkExtracted: coalesceDefined(
      input.preSignerFailure?.gmailSigningLinkExtracted,
      input.existing?.gmailSigningLinkExtracted,
      defaults.gmailSigningLinkExtracted,
    ) ?? null,
    childRunnerLaunched: coalesceDefined(
      input.preSignerFailure?.childRunnerLaunched,
      input.existing?.childRunnerLaunched,
      defaults.childRunnerLaunched,
    ) ?? false,
    childRunnerReceivedSignerUrl: coalesceDefined(
      input.preSignerFailure?.childRunnerReceivedSignerUrl,
      input.existing?.childRunnerReceivedSignerUrl,
      defaults.childRunnerReceivedSignerUrl,
    ) ?? null,
    childRunnerStartedCapture: coalesceDefined(
      input.preSignerFailure?.childRunnerStartedCapture,
      input.existing?.childRunnerStartedCapture,
      defaults.childRunnerStartedCapture,
    ) ?? false,
    openSignerAttempted: coalesceDefined(
      input.preSignerFailure?.openSignerAttempted,
      input.existing?.openSignerAttempted,
      defaults.openSignerAttempted,
    ) ?? false,
    openSignerExternalWarningHandled: coalesceDefined(
      input.preSignerFailure?.openSignerExternalWarningHandled,
      input.existing?.openSignerExternalWarningHandled,
      defaults.openSignerExternalWarningHandled,
    ) ?? null,
    openSignerReachedSignerSurface: coalesceDefined(
      input.preSignerFailure?.openSignerReachedSignerSurface,
      input.existing?.openSignerReachedSignerSurface,
      defaults.openSignerReachedSignerSurface,
    ) ?? false,
    signerSurfaceWaitAttempted: coalesceDefined(
      input.preSignerFailure?.signerSurfaceWaitAttempted,
      input.existing?.signerSurfaceWaitAttempted,
      defaults.signerSurfaceWaitAttempted,
    ) ?? false,
    signerSurfaceWaitTimedOut: coalesceDefined(
      input.preSignerFailure?.signerSurfaceWaitTimedOut,
      input.existing?.signerSurfaceWaitTimedOut,
      defaults.signerSurfaceWaitTimedOut,
    ) ?? null,
    preSignerFailureBeforeChildLaunch: coalesceDefined(
      input.preSignerFailure?.preSignerFailureBeforeChildLaunch,
      input.existing?.preSignerFailureBeforeChildLaunch,
      defaults.preSignerFailureBeforeChildLaunch,
    ) ?? false,
    preSignerFailureInChildRunner: coalesceDefined(
      input.preSignerFailure?.preSignerFailureInChildRunner,
      input.existing?.preSignerFailureInChildRunner,
      defaults.preSignerFailureInChildRunner,
    ) ?? false,
    preSignerFailureReceiptPreserved: coalesceDefined(
      input.preSignerFailure?.preSignerFailureReceiptPreserved,
      input.existing?.preSignerFailureReceiptPreserved,
      defaults.preSignerFailureReceiptPreserved,
    ) ?? false,
  };
}

export function mergePhysicalOperatingAddressCaptureOnlyPreSignerFailureFields(
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt,
  preSignerFailure: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput,
  options: {
    preserveExistingFailureDetail?: boolean;
  } = {},
): PhysicalOperatingAddressCaptureOnlyReceipt {
  return {
    ...receipt,
    ...buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureFields({
      signerSurfaceReached: receipt.signerSurfaceReached,
      preSignerFailure,
      existing: pickPhysicalOperatingAddressCaptureOnlyPreSignerFailureFields(receipt),
      preserveExistingFailureDetail: options.preserveExistingFailureDetail ?? false,
    }),
  };
}

export function classifyPhysicalOperatingAddressCaptureOnlyOpenSignerFailure(
  safeMessage: string,
): PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput {
  const normalized = normalizeDiagnosticText(safeMessage).toLowerCase();
  if (
    normalized.includes('external-site')
    || normalized.includes('warning-page')
    || normalized.includes('expected bead test host')
    || normalized.includes('proceed control target')
  ) {
    return buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('external-warning-handling-failed');
  }
  if (
    normalized.includes('timed out')
    || normalized.includes('timeout')
    || normalized.includes('did not become ready')
  ) {
    return buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('signer-surface-timeout');
  }
  if (
    normalized.includes('navigation')
    || normalized.includes('load state')
    || normalized.includes('goto')
    || normalized.includes('net::')
  ) {
    return buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('open-signer-navigation-failed');
  }
  return buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('signer-surface-not-reached');
}

function buildFallbackPhysicalOperatingAddressCaptureOnlyResultFields(input: {
  artifactFreshness: PhysicalOperatingAddressCaptureOnlyArtifactFreshness;
  fieldsBefore?: number | null;
  fieldsAfter?: number | null;
}): Omit<PhysicalOperatingAddressCaptureOnlyResult, 'diagnostics' | 'captureWritten' | 'artifactPaths' | 'reason'> {
  return {
    fieldsBefore: input.fieldsBefore ?? 0,
    fieldsAfter: input.fieldsAfter ?? input.fieldsBefore ?? 0,
    expansionReturned: false,
    expansionExpanded: false,
    captureReportPresent: false,
    captureReportWritable: false,
    writerCalled: false,
    writerCompleted: false,
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
    calibratedFallbackGuardSummary: buildPhysicalOperatingAddressCaptureOnlyFallbackGuardSummary(),
    primarySelectionCandidateCount: 0,
    cueBasedFallbackCandidateCount: 0,
    calibratedFallbackCandidateCount: 0,
    eligibleRadioCandidateCount: 0,
    exactThreeRadioGuardPassed: false,
    addressOptionsAnchorMatched: false,
    addressOptionsAnchorOutcomeCategory: null,
    addressOptionsAnchorRejectedReasons: [],
    addressOptionsAnchorEvidenceSummary: null,
    addressOptionsAnchorSourcesChecked: [],
    addressOptionsAnchorSafeTokensObserved: [],
    addressOptionsAnchorTextBucketsPresent: [],
    addressOptionsAnchorFieldKeyBucketsPresent: [],
    addressOptionsAnchorContainerBucketsPresent: [],
    addressOptionsAnchorAttributeBucketsPresent: [],
    addressOptionsGroupAnchorOutcomeCategory: null,
    addressOptionsGroupAnchorRejectedReasons: [],
    addressOptionsGroupAnchorEvidenceSummary: null,
    addressOptionsGroupAnchorSourcesChecked: [],
    addressOptionsGroupAnchorSafeTokensObserved: [],
    radioGroupAccessibleNameBucketsPresent: [],
    radioGroupLegendBucketsPresent: [],
    radioGroupQuestionPromptBucketsPresent: [],
    radioGroupSectionHeaderBucketsPresent: [],
    radioGroupAssociationBucketsPresent: [],
    addressOptionsOwnershipAnchorOutcomeCategory: null,
    addressOptionsOwnershipAnchorRejectedReasons: [],
    addressOptionsOwnershipAnchorEvidenceSummary: null,
    addressOptionsOwnershipAnchorSourcesChecked: [],
    addressOptionsOwnershipAnchorSafeTokensObserved: [],
    radioGroupAriaLabelledbyBucketsPresent: [],
    radioGroupAriaDescribedbyBucketsPresent: [],
    radioGroupSharedNameBucketsPresent: [],
    radioGroupSharedOwnerBucketsPresent: [],
    radioGroupDocusignOwnerBucketsPresent: [],
    radioGroupReferenceTargetExists: false,
    radioGroupReferenceTargetVisible: false,
    radioGroupCommonOwnerCategory: null,
    fieldDiscoveryRadioSurfaceSummaryPresent: null,
    fieldDiscoveryRadioSurfaceOutcomeCategory: null,
    fieldDiscoveryRadioSurfaceRejectedReasons: [],
    fieldDiscoveryRadioSurfaceSummary: null,
    fieldDiscoveryTotalFieldCount: null,
    fieldDiscoveryVisibleRadioInputCount: null,
    fieldDiscoveryVisibleEditableRadioInputCount: null,
    fieldDiscoveryExactThreeRadioCandidateCount: null,
    fieldDiscoveryRadioBuildersAttempted: null,
    fieldDiscoveryRadioBuildersSkipped: null,
    fieldDiscoveryRadioBuilderSkipReasons: [],
    fieldDiscoveryRadioFieldsWithSafeFieldKeyCount: null,
    fieldDiscoveryRadioFieldsWithIdOrNameKeyCount: null,
    fieldDiscoveryRadioFieldsWithInputNameCount: null,
    fieldDiscoveryRadioFieldsWithGroupNameCount: null,
    fieldDiscoveryRadioFieldsWithResolvedLabelCount: null,
    fieldDiscoveryRadioFieldsWithAnyLabelBucketCount: null,
    fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount: null,
    fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount: null,
    fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount: null,
    fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount: null,
    fieldDiscoveryRadioFieldsWithContainerContextLabelsCount: null,
    fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount: null,
    fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount: null,
    fieldDiscoveryRadioFieldsSurfaceEmptyCount: null,
    fieldDiscoveryRadioFieldsGeneratedOnlyCount: null,
    fieldDiscoveryRadioFieldsUnsafeOmittedCount: null,
    fieldDiscoveryRadioSurfaceAttachmentGapDetected: null,
    fieldDiscoveryRadioSurfaceFilteringGapDetected: null,
    fieldDiscoveryRadioSurfaceUpstreamAbsentDetected: null,
    candidateSignatureSourceSummaryPresent: null,
    candidateSignatureSourceOutcomeCategory: null,
    candidateSignatureSourceRejectedReasons: [],
    candidateSignatureSourceSummary: null,
    candidateSignatureSourceCandidateCount: null,
    candidateSignatureSourceCandidatesWithOriginalFieldCount: null,
    candidateSignatureSourceCandidatesWithSafeFieldKeyCount: null,
    candidateSignatureSourceCandidatesWithIdOrNameKeyCount: null,
    candidateSignatureSourceCandidatesWithInputTypeCount: null,
    candidateSignatureSourceCandidatesWithControlCategoryCount: null,
    candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount: null,
    candidateSignatureSourceCandidatesWithDomAttributeSignatureCount: null,
    candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount: null,
    candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount: null,
    candidateSignatureSourceCandidatesWithContainerContextLabelsCount: null,
    candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount: null,
    candidateSignatureSourceCandidatesWithGroupNameCount: null,
    candidateSignatureSourceCandidatesWithResolvedLabelCount: null,
    candidateSignatureSourceCandidatesWithAnyLabelBucketCount: null,
    candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount: null,
    candidateSignatureSourceAllCandidatesReducedShape: null,
    candidateSignatureSourceAllCandidatesSurfaceEmpty: null,
    candidateSignatureSourcePotentialPropagationGapDetected: null,
    ownershipSourceInputSummaryPresent: null,
    ownershipSourceInputOutcomeCategory: null,
    ownershipSourceInputRejectedReasons: [],
    ownershipSourceInputSummary: null,
    ownershipSourceCandidateCount: null,
    ownershipSourceCandidatesWithAnySignatureCount: null,
    ownershipSourceCandidatesWithProxySignatureCount: null,
    ownershipSourceCandidatesWithDomAttributeSignatureCount: null,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount: null,
    ownershipSourceCandidatesWithLayoutSignatureCount: null,
    ownershipSourceCandidatesWithFieldKeyCount: null,
    ownershipSourceCandidatesWithInputNameCount: null,
    ownershipSourceCandidatesWithAriaAttributePresenceCount: null,
    ownershipSourceCandidatesWithDataAttributePresenceCount: null,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount: null,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount: null,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount: null,
    ownershipSourceInputAllCandidatesEmpty: null,
    ownershipSourceInputAnyCandidateHadUsableSource: null,
    ownershipSourceInputHarvestGapDetected: null,
    ownershipSourceHarvestAttempted: null,
    ownershipSourceHarvestOutcomeCategory: null,
    ownershipSourceHarvestRejectedReasons: [],
    ownershipSourceHarvestSummary: null,
    ariaLabelledbyAttributePresentCount: null,
    ariaDescribedbyAttributePresentCount: null,
    sharedNamePresentCount: null,
    sharedOwnerPresentCount: null,
    docusignOwnerSignalPresentCount: null,
    ownershipReferenceTargetLookupAttempted: null,
    ownershipReferenceTargetExistsCount: null,
    ownershipReferenceTargetVisibleCount: null,
    ownershipReferenceTargetSafeTokenCount: null,
    ownershipEvidenceFilteredAsGeneratedOnlyCount: null,
    ownershipEvidenceFilteredAsGenericOnlyCount: null,
    ownershipEvidenceFilteredByRedactionCount: null,
    ownershipEvidenceSourcesEmpty: null,
    ownershipEvidenceSourcesPresentButNoSafeTokens: null,
    candidateOrderStable: false,
    conflictingCueDetected: false,
    proofOfAddressUploadVisibleBefore: false,
    proofOfAddressUploadVisibleAfter: false,
    proofOfAddressUploadVisibilityChanged: false,
    proofOfAddressUploadExpectedForSelectedOption: null,
    physicalOperatingAddressFieldsVisibleBefore: false,
    physicalOperatingAddressFieldsVisibleAfter: false,
    physicalOperatingAddressFieldsVisibilityChanged: false,
    physicalOperatingAddressFieldsExpectedForSelectedOption: null,
    uiEffectOutcomeCategory: 'proof-address-hidden-physical-fields-hidden',
    expansionAttempted: false,
    expansionSkippedReason: null,
    artifactFreshness: input.artifactFreshness,
  };
}

type PhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAuditInput = {
  calibratedFallbackConsidered: boolean;
  primarySelectionCandidateCount: number | null;
  cueBasedFallbackCandidateCount: number | null;
  calibratedFallbackCandidateCount: number | null;
  eligibleRadioCandidateCount: number | null;
  exactThreeRadioGuardPassed: boolean | null;
  addressOptionsAnchorMatched: boolean | null;
  candidateOrderStable: boolean | null;
  conflictingCueDetected: boolean | null;
};

type PhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAudit = {
  enabled: boolean;
  reason: PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason | null;
  guardPassed: boolean;
  targetSlot: number | null;
  captureOnly: boolean;
  usedBecause: PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause | null;
  safetyNotes: PhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote[];
};

type PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation = {
  required: boolean;
  passed: boolean | null;
  outcome: PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome;
};

function buildPhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAudit(
  input: PhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAuditInput,
): PhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAudit {
  const enabled = input.calibratedFallbackConsidered && input.addressOptionsAnchorMatched === false;
  const guardPassed = enabled
    && input.primarySelectionCandidateCount === 0
    && input.cueBasedFallbackCandidateCount === 0
    && input.calibratedFallbackCandidateCount === PHYSICAL_ADDRESS_CAPTURE_ONLY_CALIBRATED_TARGET_SLOT + 1
    && input.eligibleRadioCandidateCount === PHYSICAL_ADDRESS_CAPTURE_ONLY_CALIBRATED_TARGET_SLOT + 1
    && input.exactThreeRadioGuardPassed === true
    && input.candidateOrderStable === true
    && input.conflictingCueDetected === false;
  const safetyNotes: PhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote[] = [
    'capture-only-path',
    'finalization-controls-forbidden',
  ];

  if (enabled) {
    safetyNotes.push(
      'address-options-anchor-not-required-under-exact-three-guard',
      'slot-2-selection-requires-post-click-ui-validation',
      'proof-and-physical-fields-must-both-be-visible',
    );
  }

  return {
    enabled,
    reason: enabled ? PHYSICAL_ADDRESS_CAPTURE_ONLY_ANCHORLESS_FALLBACK_REASON : null,
    guardPassed,
    targetSlot: enabled ? PHYSICAL_ADDRESS_CAPTURE_ONLY_CALIBRATED_TARGET_SLOT : null,
    captureOnly: enabled,
    usedBecause: enabled ? PHYSICAL_ADDRESS_CAPTURE_ONLY_ANCHORLESS_FALLBACK_USED_BECAUSE : null,
    safetyNotes,
  };
}

function buildPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation(input: {
  toggleSelectionMode: PhysicalOperatingAddressCaptureOnlySelectionMode;
  selectedToggleSlot: number | null;
  proofOfAddressUploadVisibleAfter: boolean | null;
  physicalOperatingAddressFieldsVisibleAfter: boolean | null;
}): PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation {
  const required = input.toggleSelectionMode === 'calibrated-fallback'
    && input.selectedToggleSlot === PHYSICAL_ADDRESS_CAPTURE_ONLY_CALIBRATED_TARGET_SLOT;

  if (!required) {
    return {
      required: false,
      passed: null,
      outcome: 'not-required',
    };
  }

  const proofVisible = input.proofOfAddressUploadVisibleAfter === true;
  const physicalFieldsVisible = input.physicalOperatingAddressFieldsVisibleAfter === true;

  if (proofVisible && physicalFieldsVisible) {
    return {
      required: true,
      passed: true,
      outcome: 'passed-proof-visible-physical-fields-visible',
    };
  }

  if (proofVisible && !physicalFieldsVisible) {
    return {
      required: true,
      passed: false,
      outcome: 'failed-proof-visible-physical-fields-hidden',
    };
  }

  if (!proofVisible && !physicalFieldsVisible) {
    return {
      required: true,
      passed: false,
      outcome: 'failed-proof-hidden-physical-fields-hidden',
    };
  }

  return {
    required: true,
    passed: false,
    outcome: 'failed-proof-hidden-physical-fields-visible',
  };
}

function resolvePhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(
  result: PhysicalOperatingAddressCaptureOnlyResult | null,
  childExitCode: number | null,
): PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory {
  if (childExitCode === 0 && result?.artifactFreshness.artifactsFresh) return null;
  if (!result) return 'another bounded reason';
  const postClickUiEffectValidation = buildPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation({
    toggleSelectionMode: result.toggleSelectionMode,
    selectedToggleSlot: result.selectedToggleSlot,
    proofOfAddressUploadVisibleAfter: result.proofOfAddressUploadVisibleAfter,
    physicalOperatingAddressFieldsVisibleAfter: result.physicalOperatingAddressFieldsVisibleAfter,
  });

  if (postClickUiEffectValidation.required && postClickUiEffectValidation.passed === false) {
    return 'post-click-ui-effect-validation-failed';
  }
  if (!result.expansionAttempted || result.expansionSkippedReason === 'no-selected-toggle') {
    return 'expansion-skipped-no-selected-toggle';
  }
  if (!result.expansionExpanded) return 'expansion-attempted-not-expanded';
  if (!result.captureReportPresent) return 'expansion-expanded-no-capture-report';
  if (!result.captureReportWritable) return 'capture-report-not-writable';
  if (!result.writerCompleted && result.writerCalled) return 'writer-failed';
  if (result.artifactFreshness.artifactsRemainStale) return 'stale-artifact-blocked';
  return 'another bounded reason';
}

function isPhysicalOperatingAddressCaptureOnlySelectionMode(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlySelectionMode {
  return value === null || value === 'primary' || value === 'fallback' || value === 'calibrated-fallback';
}

function isPhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory {
  return value === null
    || value === 'expansion-skipped-no-selected-toggle'
    || value === 'expansion-attempted-not-expanded'
    || value === 'expansion-expanded-no-capture-report'
    || value === 'post-click-ui-effect-validation-failed'
    || value === 'capture-report-not-writable'
    || value === 'writer-failed'
    || value === 'stale-artifact-blocked'
    || value === 'another bounded reason';
}

function isPhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason {
  return value === 'calibrated-slot-2-allowed-after-anchorless-exact-three-guard';
}

function isPhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause {
  return value === 'primary-and-cue-selection-failed-under-exact-three-guard';
}

function isPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome {
  return value === 'not-required'
    || value === 'passed-proof-visible-physical-fields-visible'
    || value === 'failed-proof-visible-physical-fields-hidden'
    || value === 'failed-proof-hidden-physical-fields-hidden'
    || value === 'failed-proof-hidden-physical-fields-visible';
}

function isPhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote {
  return value === 'capture-only-path'
    || value === 'finalization-controls-forbidden'
    || value === 'address-options-anchor-not-required-under-exact-three-guard'
    || value === 'slot-2-selection-requires-post-click-ui-validation'
    || value === 'proof-and-physical-fields-must-both-be-visible';
}

function isPhysicalOperatingAddressToggleSelectionStage(
  value: unknown,
): value is PhysicalOperatingAddressToggleSelectionStage {
  return value === 'primary' || value === 'cue-based-fallback' || value === 'calibrated-fallback' || value === 'none';
}

function isPhysicalOperatingAddressToggleSelectionOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressToggleSelectionOutcomeCategory {
  return value === 'primary-selected'
    || value === 'cue-based-selected'
    || value === 'calibrated-selected'
    || value === 'calibrated-considered-not-selected'
    || value === 'calibrated-rejected-anchor-missing'
    || value === 'calibrated-rejected-candidate-count'
    || value === 'calibrated-rejected-order-unstable'
    || value === 'calibrated-rejected-conflicting-cue'
    || value === 'no-safe-toggle-selected';
}

function isPhysicalOperatingAddressCalibratedFallbackRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressCalibratedFallbackRejectedReason {
  return value === 'anchor-missing'
    || value === 'candidate-count'
    || value === 'order-unstable'
    || value === 'conflicting-cue'
    || value === 'cue-based-selection-already-available'
    || value === 'cue-based-selection-ambiguous'
    || value === 'calibrated-slot-missing'
    || value === 'another-bounded-reason';
}

function isPhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory {
  return value === 'anchor-matched-field-key'
    || value === 'anchor-matched-label'
    || value === 'anchor-matched-container'
    || value === 'anchor-matched-attribute-token'
    || value === 'anchor-missing-no-safe-evidence'
    || value === 'anchor-missing-safe-evidence-empty'
    || value === 'anchor-missing-only-generic-evidence'
    || value === 'anchor-missing-conflicting-evidence'
    || value === 'anchor-not-checked';
}

function isPhysicalOperatingAddressAddressOptionsAnchorRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsAnchorRejectedReason {
  return value === 'anchor-missing'
    || value === 'no-safe-evidence'
    || value === 'safe-evidence-empty'
    || value === 'only-generic-evidence'
    || value === 'conflicting-evidence'
    || value === 'not-checked-prior-guard-failed';
}

function isPhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary {
  return value === 'matched via field-key address-options bucket'
    || value === 'matched via label address-options bucket'
    || value === 'matched via container address-options bucket'
    || value === 'matched via attribute-token address-options bucket'
    || value === 'checked sources contained no address-options bucket'
    || value === 'checked sources were empty'
    || value === 'only generic anchor evidence buckets were observed'
    || value === 'conflicting cue blocked anchor broadening'
    || value === 'anchor check skipped because the exact-three-radio guard failed';
}

function isPhysicalOperatingAddressAddressOptionsAnchorSourceChecked(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsAnchorSourceChecked {
  return value === 'field-key'
    || value === 'label'
    || value === 'container'
    || value === 'attribute-token'
    || value === 'proxy-token'
    || value === 'graphic-token';
}

function isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsAnchorTokenBucket {
  return value === 'address-options'
    || value === 'address'
    || value === 'operating-address'
    || value === 'physical-address'
    || value === 'radio-group'
    || value === 'generic-only';
}

function isPhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory {
  return value === 'group-anchor-matched-accessible-name'
    || value === 'group-anchor-matched-legend'
    || value === 'group-anchor-matched-question-prompt'
    || value === 'group-anchor-matched-section-header'
    || value === 'group-anchor-matched-association'
    || value === 'group-anchor-missing-no-safe-evidence'
    || value === 'group-anchor-missing-safe-evidence-empty'
    || value === 'group-anchor-missing-only-generic-evidence'
    || value === 'group-anchor-not-checked';
}

function isPhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason {
  return value === 'group-anchor-missing'
    || value === 'no-safe-evidence'
    || value === 'safe-evidence-empty'
    || value === 'only-generic-evidence'
    || value === 'not-checked-prior-guard-failed';
}

function isPhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary {
  return value === 'matched via radio-group accessible-name bucket'
    || value === 'matched via radio-group legend bucket'
    || value === 'matched via radio-group question-prompt bucket'
    || value === 'matched via radio-group section-header bucket'
    || value === 'matched via radio-group association bucket'
    || value === 'checked group-level sources contained no safe anchor bucket'
    || value === 'checked group-level sources were empty'
    || value === 'only generic group-level anchor buckets were observed'
    || value === 'group anchor check skipped because the exact-three-radio guard failed';
}

function isPhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked {
  return value === 'accessible-name'
    || value === 'legend'
    || value === 'question-prompt'
    || value === 'section-header'
    || value === 'association';
}

function isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket {
  return value === 'business-primary-location'
    || value === 'registered-legal-address'
    || value === 'proof-of-address'
    || value === 'physical-operating-address'
    || value === 'po-box'
    || value === 'virtual-agent'
    || value === 'radio-group'
    || value === 'question-prompt'
    || value === 'generic-only';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory {
  return value === 'ownership-anchor-matched-aria-labelledby'
    || value === 'ownership-anchor-matched-aria-describedby'
    || value === 'ownership-anchor-matched-shared-name'
    || value === 'ownership-anchor-matched-shared-owner'
    || value === 'ownership-anchor-matched-docusign-owner'
    || value === 'ownership-anchor-missing-no-safe-evidence'
    || value === 'ownership-anchor-missing-safe-evidence-empty'
    || value === 'ownership-anchor-missing-only-generated-reference'
    || value === 'ownership-anchor-missing-only-generic-evidence'
    || value === 'ownership-anchor-not-checked';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason {
  return value === 'ownership-anchor-missing'
    || value === 'no-safe-evidence'
    || value === 'safe-evidence-empty'
    || value === 'only-generated-reference'
    || value === 'only-generic-evidence'
    || value === 'not-checked-prior-guard-failed';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary {
  return value === 'matched via resolved aria-labelledby reference bucket'
    || value === 'matched via resolved aria-describedby reference bucket'
    || value === 'matched via shared radio-group name bucket'
    || value === 'matched via shared owner-reference bucket'
    || value === 'matched via DocuSign owner metadata bucket'
    || value === 'checked ownership/reference sources contained no safe anchor bucket'
    || value === 'checked ownership/reference sources were empty'
    || value === 'only generated ownership/reference buckets were observed'
    || value === 'only generic ownership/reference buckets were observed'
    || value === 'ownership anchor check skipped because the exact-three-radio guard failed';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked {
  return value === 'aria-labelledby'
    || value === 'aria-describedby'
    || value === 'shared-name'
    || value === 'shared-owner'
    || value === 'docusign-owner';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket {
  return value === 'business-primary-location'
    || value === 'registered-legal-address'
    || value === 'proof-of-address'
    || value === 'physical-operating-address'
    || value === 'po-box'
    || value === 'virtual-agent'
    || value === 'address-options'
    || value === 'radio-group'
    || value === 'question-prompt'
    || value === 'generated-reference-only'
    || value === 'generic-only';
}

function isPhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory(
  value: unknown,
): value is PhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory {
  return value === 'shared-name'
    || value === 'shared-owner'
    || value === 'docusign-owner'
    || value === 'generated-reference-only'
    || value === 'generic-only'
    || value === 'none'
    || value === 'not-checked';
}

function isPhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory {
  return value === 'ownership-source-not-attempted'
    || value === 'ownership-source-empty'
    || value === 'ownership-source-attributes-present-no-targets'
    || value === 'ownership-source-targets-present-no-safe-tokens'
    || value === 'ownership-source-generated-only'
    || value === 'ownership-source-generic-only'
    || value === 'ownership-source-filtered-by-redaction'
    || value === 'ownership-source-safe-tokens-present'
    || value === 'ownership-source-prior-guard-failed';
}

function isPhysicalOperatingAddressOwnershipSourceHarvestRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceHarvestRejectedReason {
  return value === 'not-attempted'
    || value === 'prior-guard-failed'
    || value === 'sources-empty'
    || value === 'reference-targets-missing'
    || value === 'reference-targets-present-no-safe-tokens'
    || value === 'generated-only'
    || value === 'generic-only'
    || value === 'filtered-by-redaction';
}

function isPhysicalOperatingAddressOwnershipSourceHarvestSummary(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceHarvestSummary {
  return value === 'ownership source harvest was not attempted'
    || value === 'ownership source harvest skipped because the exact-three-radio guard failed'
    || value === 'ownership source harvest found no ownership/reference sources'
    || value === 'ownership source harvest found ownership/reference attributes but no targets'
    || value === 'ownership source harvest found reference targets but no safe token buckets'
    || value === 'ownership source harvest found only generated ownership/reference evidence'
    || value === 'ownership source harvest found only generic ownership/reference evidence'
    || value === 'ownership source harvest found source evidence but safety guards filtered it before bucketing'
    || value === 'ownership source harvest found safe ownership/reference token buckets';
}

function isPhysicalOperatingAddressOwnershipSourceInputOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceInputOutcomeCategory {
  return value === 'ownership-input-not-checked'
    || value === 'ownership-input-all-candidates-empty'
    || value === 'ownership-input-signatures-present-no-ownership-surfaces'
    || value === 'ownership-input-ownership-surfaces-present-not-harvested'
    || value === 'ownership-input-generated-only'
    || value === 'ownership-input-generic-only'
    || value === 'ownership-input-safe-source-present'
    || value === 'ownership-input-prior-guard-failed';
}

function isPhysicalOperatingAddressOwnershipSourceInputRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceInputRejectedReason {
  return value === 'prior-guard-failed'
    || value === 'all-candidates-empty'
    || value === 'no-signatures-present'
    || value === 'signatures-present-no-ownership-surfaces'
    || value === 'ownership-surfaces-present-not-harvested'
    || value === 'generated-only'
    || value === 'generic-only'
    || value === 'no-safe-source-token'
    || value === 'another-bounded-reason';
}

function isPhysicalOperatingAddressOwnershipSourceInputSummary(
  value: unknown,
): value is PhysicalOperatingAddressOwnershipSourceInputSummary {
  return value === 'ownership source input check was not performed'
    || value === 'ownership source input check skipped because the exact-three-radio guard failed'
    || value === 'ownership source input check found all exact-three-radio candidates empty before harvest'
    || value === 'ownership source input check found candidate signatures but no ownership-capable surfaces'
    || value === 'ownership source input check found ownership-capable surfaces that did not feed harvest sources'
    || value === 'ownership source input check found only generated ownership/reference source buckets before harvest'
    || value === 'ownership source input check found only generic ownership/reference source buckets before harvest'
    || value === 'ownership source input check found safe ownership/reference source buckets before harvest';
}

function isFieldDiscoveryRadioBuilderSkipReason(
  value: unknown,
): value is FieldDiscoveryRadioBuilderSkipReason {
  return value === 'not-radio-like' || value === 'dom-context-extraction-failed';
}

function isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory {
  return value === 'field-discovery-radio-surface-not-checked'
    || value === 'field-discovery-radio-surfaces-present'
    || value === 'field-discovery-radio-all-surfaces-empty'
    || value === 'field-discovery-radio-builders-skipped'
    || value === 'field-discovery-radio-built-but-not-attached'
    || value === 'field-discovery-radio-attached-but-filtered'
    || value === 'field-discovery-radio-generated-only'
    || value === 'field-discovery-radio-unsafe-omitted'
    || value === 'field-discovery-radio-prior-guard-failed';
}

function isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason {
  return value === 'prior-guard-failed'
    || value === 'no-visible-radio-fields'
    || value === 'no-visible-editable-radio-fields'
    || value === 'exact-three-candidates-missing'
    || value === 'builders-skipped'
    || value === 'built-but-not-attached'
    || value === 'attached-but-filtered'
    || value === 'all-surfaces-empty'
    || value === 'generated-only'
    || value === 'unsafe-omitted'
    || value === 'another-bounded-reason';
}

function isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary(
  value: unknown,
): value is PhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary {
  return value === 'field discovery radio surface check was not performed'
    || value === 'field discovery radio surface check skipped because the exact-three-radio guard failed'
    || value === 'field discovery radio surface check found bounded diagnostic surfaces on the exact-three radio candidates'
    || value === 'field discovery radio surface check found the exact-three radio candidates surface-empty before ownership input diagnostics'
    || value === 'field discovery radio surface builders were skipped before exact-three candidate summarization'
    || value === 'field discovery radio surfaces were built but not attached to discovered fields'
    || value === 'field discovery radio surfaces were attached on discovered fields but filtered before exact-three candidate summarization'
    || value === 'field discovery radio surfaces were reduced to generated-only evidence before exact-three candidate summarization'
    || value === 'field discovery radio surfaces were omitted as unsafe before exact-three candidate summarization';
}

function isFieldDiscoveryRadioSurfaceFieldCarrier(candidate: Record<string, unknown>): boolean {
  return (typeof candidate.fieldDiscoveryRadioSurfaceSummaryPresent === 'boolean'
      || candidate.fieldDiscoveryRadioSurfaceSummaryPresent === null)
    && (candidate.fieldDiscoveryRadioSurfaceOutcomeCategory === null
      || isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceOutcomeCategory(
        candidate.fieldDiscoveryRadioSurfaceOutcomeCategory,
      ))
    && Array.isArray(candidate.fieldDiscoveryRadioSurfaceRejectedReasons)
    && candidate.fieldDiscoveryRadioSurfaceRejectedReasons
      .every(isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceRejectedReason)
    && (candidate.fieldDiscoveryRadioSurfaceSummary === null
      || isPhysicalOperatingAddressFieldDiscoveryRadioSurfaceSummary(candidate.fieldDiscoveryRadioSurfaceSummary))
    && (typeof candidate.fieldDiscoveryTotalFieldCount === 'number'
      || candidate.fieldDiscoveryTotalFieldCount === null)
    && (typeof candidate.fieldDiscoveryVisibleRadioInputCount === 'number'
      || candidate.fieldDiscoveryVisibleRadioInputCount === null)
    && (typeof candidate.fieldDiscoveryVisibleEditableRadioInputCount === 'number'
      || candidate.fieldDiscoveryVisibleEditableRadioInputCount === null)
    && (typeof candidate.fieldDiscoveryExactThreeRadioCandidateCount === 'number'
      || candidate.fieldDiscoveryExactThreeRadioCandidateCount === null)
    && (typeof candidate.fieldDiscoveryRadioBuildersAttempted === 'boolean'
      || candidate.fieldDiscoveryRadioBuildersAttempted === null)
    && (typeof candidate.fieldDiscoveryRadioBuildersSkipped === 'boolean'
      || candidate.fieldDiscoveryRadioBuildersSkipped === null)
    && Array.isArray(candidate.fieldDiscoveryRadioBuilderSkipReasons)
    && candidate.fieldDiscoveryRadioBuilderSkipReasons.every(isFieldDiscoveryRadioBuilderSkipReason)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithSafeFieldKeyCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithIdOrNameKeyCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithInputNameCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithInputNameCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithGroupNameCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithGroupNameCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithResolvedLabelCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithResolvedLabelCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithAnyLabelBucketCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithProxyReferenceSignatureCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithDomAttributeSignatureCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithRadioGraphicSignatureCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithNonTextLayoutSignatureCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithContainerContextLabelsCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithLayoutProximityEvidenceCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsWithAnyDiagnosticSurfaceCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsSurfaceEmptyCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsSurfaceEmptyCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsGeneratedOnlyCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsGeneratedOnlyCount === null)
    && (typeof candidate.fieldDiscoveryRadioFieldsUnsafeOmittedCount === 'number'
      || candidate.fieldDiscoveryRadioFieldsUnsafeOmittedCount === null)
    && (typeof candidate.fieldDiscoveryRadioSurfaceAttachmentGapDetected === 'boolean'
      || candidate.fieldDiscoveryRadioSurfaceAttachmentGapDetected === null)
    && (typeof candidate.fieldDiscoveryRadioSurfaceFilteringGapDetected === 'boolean'
      || candidate.fieldDiscoveryRadioSurfaceFilteringGapDetected === null)
    && (typeof candidate.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected === 'boolean'
      || candidate.fieldDiscoveryRadioSurfaceUpstreamAbsentDetected === null);
}

function isPhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory {
  return value === 'candidate-signature-source-not-checked'
    || value === 'candidate-signature-source-all-surfaces-empty'
    || value === 'candidate-signature-source-reduced-candidate-shape'
    || value === 'candidate-signature-source-original-fields-have-surfaces'
    || value === 'candidate-signature-source-fallback-candidates-lost-surfaces'
    || value === 'candidate-signature-source-surfaces-present-but-not-owned'
    || value === 'candidate-signature-source-prior-guard-failed';
}

function isPhysicalOperatingAddressCandidateSignatureSourceRejectedReason(
  value: unknown,
): value is PhysicalOperatingAddressCandidateSignatureSourceRejectedReason {
  return value === 'prior-guard-failed'
    || value === 'all-surfaces-empty'
    || value === 'reduced-candidate-shape'
    || value === 'original-fields-have-surfaces-but-fallback-lost-them'
    || value === 'surfaces-present-but-not-owned'
    || value === 'no-safe-field-key'
    || value === 'no-safe-signature-surface'
    || value === 'another-bounded-reason';
}

function isPhysicalOperatingAddressCandidateSignatureSourceSummary(
  value: unknown,
): value is PhysicalOperatingAddressCandidateSignatureSourceSummary {
  return value === 'candidate signature source check was not performed'
    || value === 'candidate signature source check skipped because the exact-three-radio guard failed'
    || value === 'candidate signature source check found all candidate diagnostic surfaces empty'
    || value === 'candidate signature source check found only reduced fallback candidate shape before ownership input diagnostics'
    || value === 'candidate signature source check found original field surfaces that fallback candidates did not preserve'
    || value === 'candidate signature source check found original fields preserving diagnostic surfaces before ownership input diagnostics'
    || value === 'candidate signature source check found safe candidate surfaces that ownership-input diagnostics do not use';
}

function isCandidateSignatureSourceFieldCarrier(candidate: Record<string, unknown>): boolean {
  return (typeof candidate.candidateSignatureSourceSummaryPresent === 'boolean'
      || candidate.candidateSignatureSourceSummaryPresent === null)
    && (candidate.candidateSignatureSourceOutcomeCategory === null
      || isPhysicalOperatingAddressCandidateSignatureSourceOutcomeCategory(candidate.candidateSignatureSourceOutcomeCategory))
    && Array.isArray(candidate.candidateSignatureSourceRejectedReasons)
    && candidate.candidateSignatureSourceRejectedReasons
      .every(isPhysicalOperatingAddressCandidateSignatureSourceRejectedReason)
    && (candidate.candidateSignatureSourceSummary === null
      || isPhysicalOperatingAddressCandidateSignatureSourceSummary(candidate.candidateSignatureSourceSummary))
    && (typeof candidate.candidateSignatureSourceCandidateCount === 'number'
      || candidate.candidateSignatureSourceCandidateCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithOriginalFieldCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithOriginalFieldCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithSafeFieldKeyCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithSafeFieldKeyCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithIdOrNameKeyCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithIdOrNameKeyCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithInputTypeCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithInputTypeCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithControlCategoryCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithControlCategoryCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithProxyReferenceSignatureCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithDomAttributeSignatureCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithRadioGraphicSignatureCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithNonTextLayoutSignatureCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithContainerContextLabelsCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithContainerContextLabelsCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithLayoutProximityEvidenceCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithGroupNameCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithGroupNameCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithResolvedLabelCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithResolvedLabelCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithAnyLabelBucketCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithAnyLabelBucketCount === null)
    && (typeof candidate.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount === 'number'
      || candidate.candidateSignatureSourceCandidatesWithAnyDiagnosticSurfaceCount === null)
    && (typeof candidate.candidateSignatureSourceAllCandidatesReducedShape === 'boolean'
      || candidate.candidateSignatureSourceAllCandidatesReducedShape === null)
    && (typeof candidate.candidateSignatureSourceAllCandidatesSurfaceEmpty === 'boolean'
      || candidate.candidateSignatureSourceAllCandidatesSurfaceEmpty === null)
    && (typeof candidate.candidateSignatureSourcePotentialPropagationGapDetected === 'boolean'
      || candidate.candidateSignatureSourcePotentialPropagationGapDetected === null);
}

function isPhysicalOperatingAddressUiEffectOutcomeCategory(
  value: unknown,
): value is PhysicalOperatingAddressUiEffectOutcomeCategory {
  return value === 'proof-address-visible-physical-fields-hidden'
    || value === 'proof-address-visible-physical-fields-visible'
    || value === 'proof-address-hidden-physical-fields-hidden'
    || value === 'proof-address-hidden-physical-fields-visible';
}

function isPhysicalOperatingAddressExpansionSkippedReason(
  value: unknown,
): value is PhysicalOperatingAddressExpansionSkippedReason {
  return value === null || value === 'no-selected-toggle';
}

function isPhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory {
  return value === 'no-pre-signer-failure'
    || value === 'resend-failed'
    || value === 'gmail-poll-timeout'
    || value === 'gmail-invite-not-found'
    || value === 'gmail-link-extraction-failed'
    || value === 'child-runner-not-launched'
    || value === 'child-runner-missing-signer-url'
    || value === 'child-runner-exited-before-open-signer'
    || value === 'open-signer-navigation-failed'
    || value === 'external-warning-handling-failed'
    || value === 'signer-surface-timeout'
    || value === 'signer-surface-not-reached'
    || value === 'malformed-child-receipt'
    || value === 'missing-child-receipt'
    || value === 'another-bounded-pre-signer-failure';
}

function isPhysicalOperatingAddressCaptureOnlyPreSignerFailureStage(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyPreSignerFailureStage {
  return value === 'none'
    || value === 'bootstrap-resend'
    || value === 'bootstrap-gmail-poll'
    || value === 'bootstrap-link-extraction'
    || value === 'bootstrap-child-launch'
    || value === 'bootstrap-receipt-preservation'
    || value === 'child-pre-open-signer'
    || value === 'child-open-signer'
    || value === 'child-signer-surface-wait'
    || value === 'child-signer-surface'
    || value === 'another-bounded-pre-signer-stage';
}

export function buildPhysicalOperatingAddressCaptureOnlyReceiptPath(artifactsDir = ARTIFACTS_DIR): string {
  return path.join(artifactsDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_FILE_NAME);
}

export function buildPhysicalOperatingAddressCaptureOnlyReceipt(input: {
  result: PhysicalOperatingAddressCaptureOnlyResult | null;
  childExitCode: number | null;
  bootstrapExitCode?: number | null;
  artifactsDir?: string;
  blockedReasonCategory?: PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory;
  childCommand?: string;
  signerSurfaceReached?: boolean;
  preSignerFailure?: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput;
}): PhysicalOperatingAddressCaptureOnlyReceipt {
  const artifactsDir = input.artifactsDir ?? ARTIFACTS_DIR;
  const artifactFreshness = input.result?.artifactFreshness ?? buildPhysicalOperatingAddressCaptureOnlyFallbackFreshness(artifactsDir);
  const fallbackFields = buildFallbackPhysicalOperatingAddressCaptureOnlyResultFields({ artifactFreshness });
  const result = input.result ?? {
    diagnostics: [],
    captureWritten: false,
    artifactPaths: null,
    reason: 'BLOCKED',
    ...fallbackFields,
  };
  const calibratedAnchorlessFallbackAudit = buildPhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAudit({
    calibratedFallbackConsidered: result.calibratedFallbackConsidered,
    primarySelectionCandidateCount: result.primarySelectionCandidateCount,
    cueBasedFallbackCandidateCount: result.cueBasedFallbackCandidateCount,
    calibratedFallbackCandidateCount: result.calibratedFallbackCandidateCount,
    eligibleRadioCandidateCount: result.eligibleRadioCandidateCount,
    exactThreeRadioGuardPassed: result.exactThreeRadioGuardPassed,
    addressOptionsAnchorMatched: result.addressOptionsAnchorMatched,
    candidateOrderStable: result.candidateOrderStable,
    conflictingCueDetected: result.conflictingCueDetected,
  });
  const postClickUiEffectValidation = buildPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation({
    toggleSelectionMode: result.toggleSelectionMode,
    selectedToggleSlot: result.selectedToggleSlot,
    proofOfAddressUploadVisibleAfter: result.proofOfAddressUploadVisibleAfter,
    physicalOperatingAddressFieldsVisibleAfter: result.physicalOperatingAddressFieldsVisibleAfter,
  });
  const signerSurfaceReached = input.signerSurfaceReached ?? input.result !== null;
  const preSignerFailure = buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureFields({
    signerSurfaceReached,
    preSignerFailure: input.preSignerFailure,
  });

  return {
    runKind: PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND,
    childCommand: input.childCommand ?? `npm run ${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    childExitCode: input.childExitCode ?? null,
    bootstrapExitCode: input.bootstrapExitCode ?? null,
    signerSurfaceReached,
    initialFieldCount: input.result?.fieldsBefore ?? null,
    ...preSignerFailure,
    toggleSelectionOutcomeCategory: input.result?.toggleSelectionOutcomeCategory ?? null,
    toggleSelectionStage: input.result?.toggleSelectionStage ?? null,
    toggleSelectionMode: input.result?.toggleSelectionMode ?? null,
    selectedToggleSlot: input.result?.selectedToggleSlot ?? null,
    selectedToggleReason: input.result?.selectedToggleReason ?? null,
    fallbackReason: result.fallbackReason,
    calibratedFallbackConsidered: result.calibratedFallbackConsidered,
    calibratedFallbackAllowed: result.calibratedFallbackAllowed,
    calibratedFallbackSelected: input.result?.calibratedFallbackSelected ?? null,
    calibratedFallbackSelectedSlot: result.calibratedFallbackSelectedSlot,
    calibratedFallbackRejectedReasons: result.calibratedFallbackRejectedReasons,
    calibratedAnchorlessFallbackEnabled: calibratedAnchorlessFallbackAudit.enabled,
    calibratedAnchorlessFallbackReason: calibratedAnchorlessFallbackAudit.reason,
    calibratedAnchorlessFallbackGuardPassed: calibratedAnchorlessFallbackAudit.guardPassed,
    calibratedAnchorlessFallbackTargetSlot: calibratedAnchorlessFallbackAudit.targetSlot,
    calibratedAnchorlessFallbackCaptureOnly: calibratedAnchorlessFallbackAudit.captureOnly,
    calibratedAnchorlessFallbackUsedBecause: calibratedAnchorlessFallbackAudit.usedBecause,
    postClickUiEffectValidationRequired: postClickUiEffectValidation.required,
    postClickUiEffectValidationPassed: postClickUiEffectValidation.passed,
    postClickUiEffectValidationOutcome: postClickUiEffectValidation.outcome,
    calibratedFallbackSafetyNotes: calibratedAnchorlessFallbackAudit.safetyNotes,
    calibratedFallbackGuardSummary: {
      addressOptionsAnchorMatched: result.calibratedFallbackGuardSummary.addressOptionsAnchorMatched,
      addressOptionsAnchorOutcomeCategory: result.calibratedFallbackGuardSummary.addressOptionsAnchorOutcomeCategory,
      addressOptionsAnchorRejectedReasons: result.calibratedFallbackGuardSummary.addressOptionsAnchorRejectedReasons,
      addressOptionsAnchorEvidenceSummary: result.calibratedFallbackGuardSummary.addressOptionsAnchorEvidenceSummary,
      addressOptionsAnchorSourcesChecked: result.calibratedFallbackGuardSummary.addressOptionsAnchorSourcesChecked,
      addressOptionsAnchorSafeTokensObserved: result.calibratedFallbackGuardSummary.addressOptionsAnchorSafeTokensObserved,
      addressOptionsAnchorTextBucketsPresent: result.calibratedFallbackGuardSummary.addressOptionsAnchorTextBucketsPresent,
      addressOptionsAnchorFieldKeyBucketsPresent: result.calibratedFallbackGuardSummary.addressOptionsAnchorFieldKeyBucketsPresent,
      addressOptionsAnchorContainerBucketsPresent: result.calibratedFallbackGuardSummary.addressOptionsAnchorContainerBucketsPresent,
      addressOptionsAnchorAttributeBucketsPresent: result.calibratedFallbackGuardSummary.addressOptionsAnchorAttributeBucketsPresent,
      addressOptionsGroupAnchorOutcomeCategory:
        result.calibratedFallbackGuardSummary.addressOptionsGroupAnchorOutcomeCategory,
      addressOptionsGroupAnchorRejectedReasons:
        result.calibratedFallbackGuardSummary.addressOptionsGroupAnchorRejectedReasons,
      addressOptionsGroupAnchorEvidenceSummary:
        result.calibratedFallbackGuardSummary.addressOptionsGroupAnchorEvidenceSummary,
      addressOptionsGroupAnchorSourcesChecked:
        result.calibratedFallbackGuardSummary.addressOptionsGroupAnchorSourcesChecked,
      addressOptionsGroupAnchorSafeTokensObserved:
        result.calibratedFallbackGuardSummary.addressOptionsGroupAnchorSafeTokensObserved,
      radioGroupAccessibleNameBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupAccessibleNameBucketsPresent,
      radioGroupLegendBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupLegendBucketsPresent,
      radioGroupQuestionPromptBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupQuestionPromptBucketsPresent,
      radioGroupSectionHeaderBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupSectionHeaderBucketsPresent,
      radioGroupAssociationBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupAssociationBucketsPresent,
      addressOptionsOwnershipAnchorOutcomeCategory:
        result.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorOutcomeCategory,
      addressOptionsOwnershipAnchorRejectedReasons:
        result.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorRejectedReasons,
      addressOptionsOwnershipAnchorEvidenceSummary:
        result.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorEvidenceSummary,
      addressOptionsOwnershipAnchorSourcesChecked:
        result.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorSourcesChecked,
      addressOptionsOwnershipAnchorSafeTokensObserved:
        result.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
      radioGroupAriaLabelledbyBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupAriaLabelledbyBucketsPresent,
      radioGroupAriaDescribedbyBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupAriaDescribedbyBucketsPresent,
      radioGroupSharedNameBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupSharedNameBucketsPresent,
      radioGroupSharedOwnerBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupSharedOwnerBucketsPresent,
      radioGroupDocusignOwnerBucketsPresent:
        result.calibratedFallbackGuardSummary.radioGroupDocusignOwnerBucketsPresent,
      radioGroupReferenceTargetExists:
        result.calibratedFallbackGuardSummary.radioGroupReferenceTargetExists,
      radioGroupReferenceTargetVisible:
        result.calibratedFallbackGuardSummary.radioGroupReferenceTargetVisible,
      radioGroupCommonOwnerCategory:
        result.calibratedFallbackGuardSummary.radioGroupCommonOwnerCategory,
      ...buildFieldDiscoveryRadioSurfaceFieldProjection(result.calibratedFallbackGuardSummary),
      ...buildCandidateSignatureSourceFieldProjection(result.calibratedFallbackGuardSummary),
      ownershipSourceInputSummaryPresent:
        result.calibratedFallbackGuardSummary.ownershipSourceInputSummaryPresent,
      ownershipSourceInputOutcomeCategory:
        result.calibratedFallbackGuardSummary.ownershipSourceInputOutcomeCategory,
      ownershipSourceInputRejectedReasons:
        result.calibratedFallbackGuardSummary.ownershipSourceInputRejectedReasons,
      ownershipSourceInputSummary:
        result.calibratedFallbackGuardSummary.ownershipSourceInputSummary,
      ownershipSourceCandidateCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidateCount,
      ownershipSourceCandidatesWithAnySignatureCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithAnySignatureCount,
      ownershipSourceCandidatesWithProxySignatureCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithProxySignatureCount,
      ownershipSourceCandidatesWithDomAttributeSignatureCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
      ownershipSourceCandidatesWithRadioGraphicSignatureCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
      ownershipSourceCandidatesWithLayoutSignatureCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
      ownershipSourceCandidatesWithFieldKeyCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithFieldKeyCount,
      ownershipSourceCandidatesWithInputNameCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithInputNameCount,
      ownershipSourceCandidatesWithAriaAttributePresenceCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
      ownershipSourceCandidatesWithDataAttributePresenceCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
      ownershipSourceCandidatesWithDocusignAttributePresenceCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
      ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
      ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
        result.calibratedFallbackGuardSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
      ownershipSourceInputAllCandidatesEmpty:
        result.calibratedFallbackGuardSummary.ownershipSourceInputAllCandidatesEmpty,
      ownershipSourceInputAnyCandidateHadUsableSource:
        result.calibratedFallbackGuardSummary.ownershipSourceInputAnyCandidateHadUsableSource,
      ownershipSourceInputHarvestGapDetected:
        result.calibratedFallbackGuardSummary.ownershipSourceInputHarvestGapDetected,
      ownershipSourceHarvestAttempted:
        result.calibratedFallbackGuardSummary.ownershipSourceHarvestAttempted,
      ownershipSourceHarvestOutcomeCategory:
        result.calibratedFallbackGuardSummary.ownershipSourceHarvestOutcomeCategory,
      ownershipSourceHarvestRejectedReasons:
        result.calibratedFallbackGuardSummary.ownershipSourceHarvestRejectedReasons,
      ownershipSourceHarvestSummary:
        result.calibratedFallbackGuardSummary.ownershipSourceHarvestSummary,
      ariaLabelledbyAttributePresentCount:
        result.calibratedFallbackGuardSummary.ariaLabelledbyAttributePresentCount,
      ariaDescribedbyAttributePresentCount:
        result.calibratedFallbackGuardSummary.ariaDescribedbyAttributePresentCount,
      sharedNamePresentCount:
        result.calibratedFallbackGuardSummary.sharedNamePresentCount,
      sharedOwnerPresentCount:
        result.calibratedFallbackGuardSummary.sharedOwnerPresentCount,
      docusignOwnerSignalPresentCount:
        result.calibratedFallbackGuardSummary.docusignOwnerSignalPresentCount,
      ownershipReferenceTargetLookupAttempted:
        result.calibratedFallbackGuardSummary.ownershipReferenceTargetLookupAttempted,
      ownershipReferenceTargetExistsCount:
        result.calibratedFallbackGuardSummary.ownershipReferenceTargetExistsCount,
      ownershipReferenceTargetVisibleCount:
        result.calibratedFallbackGuardSummary.ownershipReferenceTargetVisibleCount,
      ownershipReferenceTargetSafeTokenCount:
        result.calibratedFallbackGuardSummary.ownershipReferenceTargetSafeTokenCount,
      ownershipEvidenceFilteredAsGeneratedOnlyCount:
        result.calibratedFallbackGuardSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
      ownershipEvidenceFilteredAsGenericOnlyCount:
        result.calibratedFallbackGuardSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
      ownershipEvidenceFilteredByRedactionCount:
        result.calibratedFallbackGuardSummary.ownershipEvidenceFilteredByRedactionCount,
      ownershipEvidenceSourcesEmpty:
        result.calibratedFallbackGuardSummary.ownershipEvidenceSourcesEmpty,
      ownershipEvidenceSourcesPresentButNoSafeTokens:
        result.calibratedFallbackGuardSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
      exactThreeRadioGuardPassed: result.calibratedFallbackGuardSummary.exactThreeRadioGuardPassed,
      candidateOrderStable: result.calibratedFallbackGuardSummary.candidateOrderStable,
      conflictingCueDetected: result.calibratedFallbackGuardSummary.conflictingCueDetected,
    },
    primarySelectionCandidateCount: input.result?.primarySelectionCandidateCount ?? null,
    cueBasedFallbackCandidateCount: input.result?.cueBasedFallbackCandidateCount ?? null,
    calibratedFallbackCandidateCount: input.result?.calibratedFallbackCandidateCount ?? null,
    eligibleRadioCandidateCount: input.result?.eligibleRadioCandidateCount ?? null,
    exactThreeRadioGuardPassed: input.result?.exactThreeRadioGuardPassed ?? null,
    addressOptionsAnchorMatched: input.result?.addressOptionsAnchorMatched ?? null,
    addressOptionsAnchorOutcomeCategory: input.result?.addressOptionsAnchorOutcomeCategory ?? null,
    addressOptionsAnchorRejectedReasons: result.addressOptionsAnchorRejectedReasons,
    addressOptionsAnchorEvidenceSummary: input.result?.addressOptionsAnchorEvidenceSummary ?? null,
    addressOptionsAnchorSourcesChecked: result.addressOptionsAnchorSourcesChecked,
    addressOptionsAnchorSafeTokensObserved: result.addressOptionsAnchorSafeTokensObserved,
    addressOptionsAnchorTextBucketsPresent: result.addressOptionsAnchorTextBucketsPresent,
    addressOptionsAnchorFieldKeyBucketsPresent: result.addressOptionsAnchorFieldKeyBucketsPresent,
    addressOptionsAnchorContainerBucketsPresent: result.addressOptionsAnchorContainerBucketsPresent,
    addressOptionsAnchorAttributeBucketsPresent: result.addressOptionsAnchorAttributeBucketsPresent,
    addressOptionsGroupAnchorOutcomeCategory: result.addressOptionsGroupAnchorOutcomeCategory,
    addressOptionsGroupAnchorRejectedReasons: result.addressOptionsGroupAnchorRejectedReasons,
    addressOptionsGroupAnchorEvidenceSummary: result.addressOptionsGroupAnchorEvidenceSummary,
    addressOptionsGroupAnchorSourcesChecked: result.addressOptionsGroupAnchorSourcesChecked,
    addressOptionsGroupAnchorSafeTokensObserved: result.addressOptionsGroupAnchorSafeTokensObserved,
    radioGroupAccessibleNameBucketsPresent: result.radioGroupAccessibleNameBucketsPresent,
    radioGroupLegendBucketsPresent: result.radioGroupLegendBucketsPresent,
    radioGroupQuestionPromptBucketsPresent: result.radioGroupQuestionPromptBucketsPresent,
    radioGroupSectionHeaderBucketsPresent: result.radioGroupSectionHeaderBucketsPresent,
    radioGroupAssociationBucketsPresent: result.radioGroupAssociationBucketsPresent,
    addressOptionsOwnershipAnchorOutcomeCategory: result.addressOptionsOwnershipAnchorOutcomeCategory,
    addressOptionsOwnershipAnchorRejectedReasons: result.addressOptionsOwnershipAnchorRejectedReasons,
    addressOptionsOwnershipAnchorEvidenceSummary: result.addressOptionsOwnershipAnchorEvidenceSummary,
    addressOptionsOwnershipAnchorSourcesChecked: result.addressOptionsOwnershipAnchorSourcesChecked,
    addressOptionsOwnershipAnchorSafeTokensObserved: result.addressOptionsOwnershipAnchorSafeTokensObserved,
    radioGroupAriaLabelledbyBucketsPresent: result.radioGroupAriaLabelledbyBucketsPresent,
    radioGroupAriaDescribedbyBucketsPresent: result.radioGroupAriaDescribedbyBucketsPresent,
    radioGroupSharedNameBucketsPresent: result.radioGroupSharedNameBucketsPresent,
    radioGroupSharedOwnerBucketsPresent: result.radioGroupSharedOwnerBucketsPresent,
    radioGroupDocusignOwnerBucketsPresent: result.radioGroupDocusignOwnerBucketsPresent,
    radioGroupReferenceTargetExists: result.radioGroupReferenceTargetExists,
    radioGroupReferenceTargetVisible: result.radioGroupReferenceTargetVisible,
    radioGroupCommonOwnerCategory: result.radioGroupCommonOwnerCategory,
    ...buildFieldDiscoveryRadioSurfaceFieldProjection(result),
    ...buildCandidateSignatureSourceFieldProjection(result),
    ownershipSourceInputSummaryPresent: result.ownershipSourceInputSummaryPresent,
    ownershipSourceInputOutcomeCategory: result.ownershipSourceInputOutcomeCategory,
    ownershipSourceInputRejectedReasons: result.ownershipSourceInputRejectedReasons,
    ownershipSourceInputSummary: result.ownershipSourceInputSummary,
    ownershipSourceCandidateCount: result.ownershipSourceCandidateCount,
    ownershipSourceCandidatesWithAnySignatureCount: result.ownershipSourceCandidatesWithAnySignatureCount,
    ownershipSourceCandidatesWithProxySignatureCount: result.ownershipSourceCandidatesWithProxySignatureCount,
    ownershipSourceCandidatesWithDomAttributeSignatureCount:
      result.ownershipSourceCandidatesWithDomAttributeSignatureCount,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount:
      result.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
    ownershipSourceCandidatesWithLayoutSignatureCount: result.ownershipSourceCandidatesWithLayoutSignatureCount,
    ownershipSourceCandidatesWithFieldKeyCount: result.ownershipSourceCandidatesWithFieldKeyCount,
    ownershipSourceCandidatesWithInputNameCount: result.ownershipSourceCandidatesWithInputNameCount,
    ownershipSourceCandidatesWithAriaAttributePresenceCount:
      result.ownershipSourceCandidatesWithAriaAttributePresenceCount,
    ownershipSourceCandidatesWithDataAttributePresenceCount:
      result.ownershipSourceCandidatesWithDataAttributePresenceCount,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount:
      result.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
      result.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
      result.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
    ownershipSourceInputAllCandidatesEmpty: result.ownershipSourceInputAllCandidatesEmpty,
    ownershipSourceInputAnyCandidateHadUsableSource: result.ownershipSourceInputAnyCandidateHadUsableSource,
    ownershipSourceInputHarvestGapDetected: result.ownershipSourceInputHarvestGapDetected,
    ownershipSourceHarvestAttempted: result.ownershipSourceHarvestAttempted,
    ownershipSourceHarvestOutcomeCategory: result.ownershipSourceHarvestOutcomeCategory,
    ownershipSourceHarvestRejectedReasons: result.ownershipSourceHarvestRejectedReasons,
    ownershipSourceHarvestSummary: result.ownershipSourceHarvestSummary,
    ariaLabelledbyAttributePresentCount: result.ariaLabelledbyAttributePresentCount,
    ariaDescribedbyAttributePresentCount: result.ariaDescribedbyAttributePresentCount,
    sharedNamePresentCount: result.sharedNamePresentCount,
    sharedOwnerPresentCount: result.sharedOwnerPresentCount,
    docusignOwnerSignalPresentCount: result.docusignOwnerSignalPresentCount,
    ownershipReferenceTargetLookupAttempted: result.ownershipReferenceTargetLookupAttempted,
    ownershipReferenceTargetExistsCount: result.ownershipReferenceTargetExistsCount,
    ownershipReferenceTargetVisibleCount: result.ownershipReferenceTargetVisibleCount,
    ownershipReferenceTargetSafeTokenCount: result.ownershipReferenceTargetSafeTokenCount,
    ownershipEvidenceFilteredAsGeneratedOnlyCount: result.ownershipEvidenceFilteredAsGeneratedOnlyCount,
    ownershipEvidenceFilteredAsGenericOnlyCount: result.ownershipEvidenceFilteredAsGenericOnlyCount,
    ownershipEvidenceFilteredByRedactionCount: result.ownershipEvidenceFilteredByRedactionCount,
    ownershipEvidenceSourcesEmpty: result.ownershipEvidenceSourcesEmpty,
    ownershipEvidenceSourcesPresentButNoSafeTokens: result.ownershipEvidenceSourcesPresentButNoSafeTokens,
    candidateOrderStable: input.result?.candidateOrderStable ?? null,
    conflictingCueDetected: input.result?.conflictingCueDetected ?? null,
    selectionMode: result.toggleSelectionMode,
    proofOfAddressUploadVisibleBefore: input.result?.proofOfAddressUploadVisibleBefore ?? null,
    proofOfAddressUploadVisibleAfter: input.result?.proofOfAddressUploadVisibleAfter ?? null,
    proofOfAddressUploadVisibilityChanged: input.result?.proofOfAddressUploadVisibilityChanged ?? null,
    proofOfAddressUploadExpectedForSelectedOption: input.result?.proofOfAddressUploadExpectedForSelectedOption ?? null,
    physicalOperatingAddressFieldsVisibleBefore: input.result?.physicalOperatingAddressFieldsVisibleBefore ?? null,
    physicalOperatingAddressFieldsVisibleAfter: input.result?.physicalOperatingAddressFieldsVisibleAfter ?? null,
    physicalOperatingAddressFieldsVisibilityChanged: input.result?.physicalOperatingAddressFieldsVisibilityChanged ?? null,
    physicalOperatingAddressFieldsExpectedForSelectedOption:
      input.result?.physicalOperatingAddressFieldsExpectedForSelectedOption ?? null,
    uiEffectOutcomeCategory: input.result?.uiEffectOutcomeCategory ?? null,
    expansionAttempted: input.result?.expansionAttempted ?? null,
    expansionSkippedReason: input.result?.expansionSkippedReason ?? null,
    expansionReturned: result.expansionReturned,
    expansionExpanded: result.expansionExpanded,
    captureReportPresent: result.captureReportPresent,
    captureReportWritable: result.captureReportWritable,
    writerCalled: result.writerCalled,
    writerCompleted: result.writerCompleted,
    artifactsFresh: artifactFreshness.artifactsFresh,
    artifactsRemainStale: artifactFreshness.artifactsRemainStale,
    staleArtifactsIgnored: artifactFreshness.staleArtifactsIgnored,
    blockedReasonCategory: input.blockedReasonCategory
      ?? resolvePhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(input.result, input.childExitCode),
    reportsRefreshSkipped: artifactFreshness.reportsRefreshSkipped,
    findingsOpenSkipped: artifactFreshness.findingsOpenSkipped,
    targetFileFreshnessSummary: buildPhysicalOperatingAddressCaptureOnlyTargetFileFreshnessSummary(artifactFreshness),
    redactionApplied: true,
  };
}

export function writePhysicalOperatingAddressCaptureOnlyReceipt(
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt,
  artifactsDir = ARTIFACTS_DIR,
): string {
  const receiptPath = buildPhysicalOperatingAddressCaptureOnlyReceiptPath(artifactsDir);
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');
  return receiptPath;
}

export function formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt,
): string {
  return `${PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_SENTINEL_PREFIX} ${JSON.stringify(receipt)}`;
}

export function isPhysicalOperatingAddressCaptureOnlyReceipt(
  value: unknown,
): value is PhysicalOperatingAddressCaptureOnlyReceipt {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Record<string, unknown>;
  return candidate.runKind === PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND
    && typeof candidate.childCommand === 'string'
    && (typeof candidate.childExitCode === 'number' || candidate.childExitCode === null)
    && (typeof candidate.bootstrapExitCode === 'number' || candidate.bootstrapExitCode === null)
    && typeof candidate.signerSurfaceReached === 'boolean'
    && (typeof candidate.initialFieldCount === 'number' || candidate.initialFieldCount === null)
    && typeof candidate.preSignerFailureSummaryPresent === 'boolean'
    && isPhysicalOperatingAddressCaptureOnlyPreSignerFailureCategory(candidate.preSignerFailureCategory)
    && isPhysicalOperatingAddressCaptureOnlyPreSignerFailureStage(candidate.preSignerFailureStage)
    && (typeof candidate.preSignerFailureReason === 'string' || candidate.preSignerFailureReason === null)
    && (typeof candidate.preSignerFailureSummary === 'string' || candidate.preSignerFailureSummary === null)
    && typeof candidate.bootstrapResendAttempted === 'boolean'
    && (typeof candidate.bootstrapResendSucceeded === 'boolean' || candidate.bootstrapResendSucceeded === null)
    && typeof candidate.gmailPollAttempted === 'boolean'
    && (typeof candidate.gmailInviteFound === 'boolean' || candidate.gmailInviteFound === null)
    && (typeof candidate.gmailSigningLinkExtracted === 'boolean' || candidate.gmailSigningLinkExtracted === null)
    && typeof candidate.childRunnerLaunched === 'boolean'
    && (typeof candidate.childRunnerReceivedSignerUrl === 'boolean' || candidate.childRunnerReceivedSignerUrl === null)
    && typeof candidate.childRunnerStartedCapture === 'boolean'
    && typeof candidate.openSignerAttempted === 'boolean'
    && (typeof candidate.openSignerExternalWarningHandled === 'boolean'
      || candidate.openSignerExternalWarningHandled === null)
    && typeof candidate.openSignerReachedSignerSurface === 'boolean'
    && typeof candidate.signerSurfaceWaitAttempted === 'boolean'
    && (typeof candidate.signerSurfaceWaitTimedOut === 'boolean' || candidate.signerSurfaceWaitTimedOut === null)
    && typeof candidate.preSignerFailureBeforeChildLaunch === 'boolean'
    && typeof candidate.preSignerFailureInChildRunner === 'boolean'
    && typeof candidate.preSignerFailureReceiptPreserved === 'boolean'
    && (candidate.toggleSelectionOutcomeCategory === null || isPhysicalOperatingAddressToggleSelectionOutcomeCategory(candidate.toggleSelectionOutcomeCategory))
    && (candidate.toggleSelectionStage === null || isPhysicalOperatingAddressToggleSelectionStage(candidate.toggleSelectionStage))
    && isPhysicalOperatingAddressCaptureOnlySelectionMode(candidate.toggleSelectionMode)
    && (typeof candidate.selectedToggleSlot === 'number' || candidate.selectedToggleSlot === null)
    && (typeof candidate.selectedToggleReason === 'string' || candidate.selectedToggleReason === null)
    && typeof candidate.calibratedFallbackConsidered === 'boolean'
    && (typeof candidate.calibratedFallbackAllowed === 'boolean' || candidate.calibratedFallbackAllowed === null)
    && (typeof candidate.calibratedFallbackSelected === 'boolean' || candidate.calibratedFallbackSelected === null)
    && (typeof candidate.calibratedFallbackSelectedSlot === 'number' || candidate.calibratedFallbackSelectedSlot === null)
    && Array.isArray(candidate.calibratedFallbackRejectedReasons)
    && candidate.calibratedFallbackRejectedReasons.every(isPhysicalOperatingAddressCalibratedFallbackRejectedReason)
    && typeof candidate.calibratedAnchorlessFallbackEnabled === 'boolean'
    && (candidate.calibratedAnchorlessFallbackReason === null
      || isPhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackReason(candidate.calibratedAnchorlessFallbackReason))
    && typeof candidate.calibratedAnchorlessFallbackGuardPassed === 'boolean'
    && (typeof candidate.calibratedAnchorlessFallbackTargetSlot === 'number'
      || candidate.calibratedAnchorlessFallbackTargetSlot === null)
    && typeof candidate.calibratedAnchorlessFallbackCaptureOnly === 'boolean'
    && (candidate.calibratedAnchorlessFallbackUsedBecause === null
      || isPhysicalOperatingAddressCaptureOnlyCalibratedAnchorlessFallbackUsedBecause(candidate.calibratedAnchorlessFallbackUsedBecause))
    && typeof candidate.postClickUiEffectValidationRequired === 'boolean'
    && (typeof candidate.postClickUiEffectValidationPassed === 'boolean'
      || candidate.postClickUiEffectValidationPassed === null)
    && isPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidationOutcome(candidate.postClickUiEffectValidationOutcome)
    && Array.isArray(candidate.calibratedFallbackSafetyNotes)
    && candidate.calibratedFallbackSafetyNotes.every(isPhysicalOperatingAddressCaptureOnlyCalibratedFallbackSafetyNote)
    && Boolean(candidate.calibratedFallbackGuardSummary)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorMatched === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorMatched === null)
    && (((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorOutcomeCategory === null)
      || isPhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorOutcomeCategory))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorRejectedReasons)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorRejectedReasons as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorRejectedReason)
    && (((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorEvidenceSummary === null)
      || isPhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorEvidenceSummary))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorSourcesChecked)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorSourcesChecked as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorSourceChecked)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorSafeTokensObserved)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorSafeTokensObserved as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorTextBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorTextBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorFieldKeyBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorFieldKeyBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorContainerBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorContainerBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorAttributeBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsAnchorAttributeBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorOutcomeCategory) === null)
      || isPhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorOutcomeCategory,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorRejectedReasons)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorRejectedReasons as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorEvidenceSummary) === null)
      || isPhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorEvidenceSummary,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorSourcesChecked)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorSourcesChecked as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorSafeTokensObserved)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsGroupAnchorSafeTokensObserved as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAccessibleNameBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAccessibleNameBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupLegendBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupLegendBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupQuestionPromptBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupQuestionPromptBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSectionHeaderBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSectionHeaderBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAssociationBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAssociationBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorOutcomeCategory) === null)
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorOutcomeCategory,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorRejectedReasons)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorRejectedReasons as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorEvidenceSummary) === null)
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorEvidenceSummary,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorSourcesChecked)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorSourcesChecked as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorSafeTokensObserved)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).addressOptionsOwnershipAnchorSafeTokensObserved as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAriaLabelledbyBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAriaLabelledbyBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAriaDescribedbyBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupAriaDescribedbyBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSharedNameBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSharedNameBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSharedOwnerBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupSharedOwnerBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupDocusignOwnerBucketsPresent)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupDocusignOwnerBucketsPresent as unknown[])
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupReferenceTargetExists === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupReferenceTargetExists === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupReferenceTargetVisible === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupReferenceTargetVisible === null)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupCommonOwnerCategory) === null)
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).radioGroupCommonOwnerCategory,
      ))
    && isFieldDiscoveryRadioSurfaceFieldCarrier(candidate.calibratedFallbackGuardSummary as Record<string, unknown>)
    && isCandidateSignatureSourceFieldCarrier(candidate.calibratedFallbackGuardSummary as Record<string, unknown>)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputSummaryPresent === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputSummaryPresent === null)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputOutcomeCategory) === null)
      || isPhysicalOperatingAddressOwnershipSourceInputOutcomeCategory(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputOutcomeCategory,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputRejectedReasons)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputRejectedReasons as unknown[])
      .every(isPhysicalOperatingAddressOwnershipSourceInputRejectedReason)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputSummary) === null)
      || isPhysicalOperatingAddressOwnershipSourceInputSummary(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputSummary,
      ))
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidateCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidateCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithAnySignatureCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithAnySignatureCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithProxySignatureCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithProxySignatureCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDomAttributeSignatureCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDomAttributeSignatureCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithRadioGraphicSignatureCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithRadioGraphicSignatureCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithLayoutSignatureCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithLayoutSignatureCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithFieldKeyCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithFieldKeyCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithInputNameCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithInputNameCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithAriaAttributePresenceCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithAriaAttributePresenceCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDataAttributePresenceCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDataAttributePresenceCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDocusignAttributePresenceCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithDocusignAttributePresenceCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputAllCandidatesEmpty === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputAllCandidatesEmpty === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputAnyCandidateHadUsableSource === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputAnyCandidateHadUsableSource === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputHarvestGapDetected === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceInputHarvestGapDetected === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestAttempted === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestAttempted === null)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestOutcomeCategory) === null)
      || isPhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestOutcomeCategory,
      ))
    && Array.isArray((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestRejectedReasons)
    && ((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestRejectedReasons as unknown[])
      .every(isPhysicalOperatingAddressOwnershipSourceHarvestRejectedReason)
    && ((((candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestSummary) === null)
      || isPhysicalOperatingAddressOwnershipSourceHarvestSummary(
        (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipSourceHarvestSummary,
      ))
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ariaLabelledbyAttributePresentCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ariaLabelledbyAttributePresentCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ariaDescribedbyAttributePresentCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ariaDescribedbyAttributePresentCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).sharedNamePresentCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).sharedNamePresentCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).sharedOwnerPresentCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).sharedOwnerPresentCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).docusignOwnerSignalPresentCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).docusignOwnerSignalPresentCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetLookupAttempted === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetLookupAttempted === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetExistsCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetExistsCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetVisibleCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetVisibleCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetSafeTokenCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipReferenceTargetSafeTokenCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredAsGeneratedOnlyCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredAsGeneratedOnlyCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredAsGenericOnlyCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredAsGenericOnlyCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredByRedactionCount === 'number'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceFilteredByRedactionCount === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceSourcesEmpty === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceSourcesEmpty === null)
    && (typeof (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceSourcesPresentButNoSafeTokens === 'boolean'
      || (candidate.calibratedFallbackGuardSummary as Record<string, unknown>).ownershipEvidenceSourcesPresentButNoSafeTokens === null)
    && (typeof candidate.primarySelectionCandidateCount === 'number' || candidate.primarySelectionCandidateCount === null)
    && (typeof candidate.cueBasedFallbackCandidateCount === 'number' || candidate.cueBasedFallbackCandidateCount === null)
    && (typeof candidate.calibratedFallbackCandidateCount === 'number' || candidate.calibratedFallbackCandidateCount === null)
    && (typeof candidate.eligibleRadioCandidateCount === 'number' || candidate.eligibleRadioCandidateCount === null)
    && (typeof candidate.exactThreeRadioGuardPassed === 'boolean' || candidate.exactThreeRadioGuardPassed === null)
    && (typeof candidate.addressOptionsAnchorMatched === 'boolean' || candidate.addressOptionsAnchorMatched === null)
    && (candidate.addressOptionsAnchorOutcomeCategory === null || isPhysicalOperatingAddressAddressOptionsAnchorOutcomeCategory(candidate.addressOptionsAnchorOutcomeCategory))
    && Array.isArray(candidate.addressOptionsAnchorRejectedReasons)
    && candidate.addressOptionsAnchorRejectedReasons.every(isPhysicalOperatingAddressAddressOptionsAnchorRejectedReason)
    && (candidate.addressOptionsAnchorEvidenceSummary === null || isPhysicalOperatingAddressAddressOptionsAnchorEvidenceSummary(candidate.addressOptionsAnchorEvidenceSummary))
    && Array.isArray(candidate.addressOptionsAnchorSourcesChecked)
    && candidate.addressOptionsAnchorSourcesChecked.every(isPhysicalOperatingAddressAddressOptionsAnchorSourceChecked)
    && Array.isArray(candidate.addressOptionsAnchorSafeTokensObserved)
    && candidate.addressOptionsAnchorSafeTokensObserved.every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray(candidate.addressOptionsAnchorTextBucketsPresent)
    && candidate.addressOptionsAnchorTextBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray(candidate.addressOptionsAnchorFieldKeyBucketsPresent)
    && candidate.addressOptionsAnchorFieldKeyBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray(candidate.addressOptionsAnchorContainerBucketsPresent)
    && candidate.addressOptionsAnchorContainerBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && Array.isArray(candidate.addressOptionsAnchorAttributeBucketsPresent)
    && candidate.addressOptionsAnchorAttributeBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsAnchorTokenBucket)
    && (candidate.addressOptionsGroupAnchorOutcomeCategory === null
      || isPhysicalOperatingAddressAddressOptionsGroupAnchorOutcomeCategory(candidate.addressOptionsGroupAnchorOutcomeCategory))
    && Array.isArray(candidate.addressOptionsGroupAnchorRejectedReasons)
    && candidate.addressOptionsGroupAnchorRejectedReasons.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorRejectedReason)
    && (candidate.addressOptionsGroupAnchorEvidenceSummary === null
      || isPhysicalOperatingAddressAddressOptionsGroupAnchorEvidenceSummary(candidate.addressOptionsGroupAnchorEvidenceSummary))
    && Array.isArray(candidate.addressOptionsGroupAnchorSourcesChecked)
    && candidate.addressOptionsGroupAnchorSourcesChecked.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorSourceChecked)
    && Array.isArray(candidate.addressOptionsGroupAnchorSafeTokensObserved)
    && candidate.addressOptionsGroupAnchorSafeTokensObserved.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupAccessibleNameBucketsPresent)
    && candidate.radioGroupAccessibleNameBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupLegendBucketsPresent)
    && candidate.radioGroupLegendBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupQuestionPromptBucketsPresent)
    && candidate.radioGroupQuestionPromptBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupSectionHeaderBucketsPresent)
    && candidate.radioGroupSectionHeaderBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupAssociationBucketsPresent)
    && candidate.radioGroupAssociationBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsGroupAnchorTokenBucket)
    && (candidate.addressOptionsOwnershipAnchorOutcomeCategory === null
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorOutcomeCategory(candidate.addressOptionsOwnershipAnchorOutcomeCategory))
    && Array.isArray(candidate.addressOptionsOwnershipAnchorRejectedReasons)
    && candidate.addressOptionsOwnershipAnchorRejectedReasons
      .every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorRejectedReason)
    && (candidate.addressOptionsOwnershipAnchorEvidenceSummary === null
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorEvidenceSummary(candidate.addressOptionsOwnershipAnchorEvidenceSummary))
    && Array.isArray(candidate.addressOptionsOwnershipAnchorSourcesChecked)
    && candidate.addressOptionsOwnershipAnchorSourcesChecked.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorSourceChecked)
    && Array.isArray(candidate.addressOptionsOwnershipAnchorSafeTokensObserved)
    && candidate.addressOptionsOwnershipAnchorSafeTokensObserved.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupAriaLabelledbyBucketsPresent)
    && candidate.radioGroupAriaLabelledbyBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupAriaDescribedbyBucketsPresent)
    && candidate.radioGroupAriaDescribedbyBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupSharedNameBucketsPresent)
    && candidate.radioGroupSharedNameBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupSharedOwnerBucketsPresent)
    && candidate.radioGroupSharedOwnerBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && Array.isArray(candidate.radioGroupDocusignOwnerBucketsPresent)
    && candidate.radioGroupDocusignOwnerBucketsPresent.every(isPhysicalOperatingAddressAddressOptionsOwnershipAnchorTokenBucket)
    && (typeof candidate.radioGroupReferenceTargetExists === 'boolean' || candidate.radioGroupReferenceTargetExists === null)
    && (typeof candidate.radioGroupReferenceTargetVisible === 'boolean' || candidate.radioGroupReferenceTargetVisible === null)
    && (candidate.radioGroupCommonOwnerCategory === null
      || isPhysicalOperatingAddressAddressOptionsOwnershipAnchorCommonOwnerCategory(candidate.radioGroupCommonOwnerCategory))
    && isFieldDiscoveryRadioSurfaceFieldCarrier(candidate as Record<string, unknown>)
    && isCandidateSignatureSourceFieldCarrier(candidate as Record<string, unknown>)
    && (typeof candidate.ownershipSourceInputSummaryPresent === 'boolean' || candidate.ownershipSourceInputSummaryPresent === null)
    && (candidate.ownershipSourceInputOutcomeCategory === null
      || isPhysicalOperatingAddressOwnershipSourceInputOutcomeCategory(candidate.ownershipSourceInputOutcomeCategory))
    && Array.isArray(candidate.ownershipSourceInputRejectedReasons)
    && candidate.ownershipSourceInputRejectedReasons.every(isPhysicalOperatingAddressOwnershipSourceInputRejectedReason)
    && (candidate.ownershipSourceInputSummary === null
      || isPhysicalOperatingAddressOwnershipSourceInputSummary(candidate.ownershipSourceInputSummary))
    && (typeof candidate.ownershipSourceCandidateCount === 'number' || candidate.ownershipSourceCandidateCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithAnySignatureCount === 'number'
      || candidate.ownershipSourceCandidatesWithAnySignatureCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithProxySignatureCount === 'number'
      || candidate.ownershipSourceCandidatesWithProxySignatureCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithDomAttributeSignatureCount === 'number'
      || candidate.ownershipSourceCandidatesWithDomAttributeSignatureCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithRadioGraphicSignatureCount === 'number'
      || candidate.ownershipSourceCandidatesWithRadioGraphicSignatureCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithLayoutSignatureCount === 'number'
      || candidate.ownershipSourceCandidatesWithLayoutSignatureCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithFieldKeyCount === 'number'
      || candidate.ownershipSourceCandidatesWithFieldKeyCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithInputNameCount === 'number'
      || candidate.ownershipSourceCandidatesWithInputNameCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithAriaAttributePresenceCount === 'number'
      || candidate.ownershipSourceCandidatesWithAriaAttributePresenceCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithDataAttributePresenceCount === 'number'
      || candidate.ownershipSourceCandidatesWithDataAttributePresenceCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithDocusignAttributePresenceCount === 'number'
      || candidate.ownershipSourceCandidatesWithDocusignAttributePresenceCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount === 'number'
      || candidate.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount === null)
    && (typeof candidate.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === 'number'
      || candidate.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount === null)
    && (typeof candidate.ownershipSourceInputAllCandidatesEmpty === 'boolean'
      || candidate.ownershipSourceInputAllCandidatesEmpty === null)
    && (typeof candidate.ownershipSourceInputAnyCandidateHadUsableSource === 'boolean'
      || candidate.ownershipSourceInputAnyCandidateHadUsableSource === null)
    && (typeof candidate.ownershipSourceInputHarvestGapDetected === 'boolean'
      || candidate.ownershipSourceInputHarvestGapDetected === null)
    && (typeof candidate.ownershipSourceHarvestAttempted === 'boolean' || candidate.ownershipSourceHarvestAttempted === null)
    && (candidate.ownershipSourceHarvestOutcomeCategory === null
      || isPhysicalOperatingAddressOwnershipSourceHarvestOutcomeCategory(candidate.ownershipSourceHarvestOutcomeCategory))
    && Array.isArray(candidate.ownershipSourceHarvestRejectedReasons)
    && candidate.ownershipSourceHarvestRejectedReasons.every(isPhysicalOperatingAddressOwnershipSourceHarvestRejectedReason)
    && (candidate.ownershipSourceHarvestSummary === null
      || isPhysicalOperatingAddressOwnershipSourceHarvestSummary(candidate.ownershipSourceHarvestSummary))
    && (typeof candidate.ariaLabelledbyAttributePresentCount === 'number' || candidate.ariaLabelledbyAttributePresentCount === null)
    && (typeof candidate.ariaDescribedbyAttributePresentCount === 'number' || candidate.ariaDescribedbyAttributePresentCount === null)
    && (typeof candidate.sharedNamePresentCount === 'number' || candidate.sharedNamePresentCount === null)
    && (typeof candidate.sharedOwnerPresentCount === 'number' || candidate.sharedOwnerPresentCount === null)
    && (typeof candidate.docusignOwnerSignalPresentCount === 'number' || candidate.docusignOwnerSignalPresentCount === null)
    && (typeof candidate.ownershipReferenceTargetLookupAttempted === 'boolean' || candidate.ownershipReferenceTargetLookupAttempted === null)
    && (typeof candidate.ownershipReferenceTargetExistsCount === 'number' || candidate.ownershipReferenceTargetExistsCount === null)
    && (typeof candidate.ownershipReferenceTargetVisibleCount === 'number' || candidate.ownershipReferenceTargetVisibleCount === null)
    && (typeof candidate.ownershipReferenceTargetSafeTokenCount === 'number' || candidate.ownershipReferenceTargetSafeTokenCount === null)
    && (typeof candidate.ownershipEvidenceFilteredAsGeneratedOnlyCount === 'number' || candidate.ownershipEvidenceFilteredAsGeneratedOnlyCount === null)
    && (typeof candidate.ownershipEvidenceFilteredAsGenericOnlyCount === 'number' || candidate.ownershipEvidenceFilteredAsGenericOnlyCount === null)
    && (typeof candidate.ownershipEvidenceFilteredByRedactionCount === 'number' || candidate.ownershipEvidenceFilteredByRedactionCount === null)
    && (typeof candidate.ownershipEvidenceSourcesEmpty === 'boolean' || candidate.ownershipEvidenceSourcesEmpty === null)
    && (typeof candidate.ownershipEvidenceSourcesPresentButNoSafeTokens === 'boolean' || candidate.ownershipEvidenceSourcesPresentButNoSafeTokens === null)
    && (typeof candidate.candidateOrderStable === 'boolean' || candidate.candidateOrderStable === null)
    && (typeof candidate.conflictingCueDetected === 'boolean' || candidate.conflictingCueDetected === null)
    && isPhysicalOperatingAddressCaptureOnlySelectionMode(candidate.selectionMode)
    && (typeof candidate.fallbackReason === 'string' || candidate.fallbackReason === null)
    && (typeof candidate.proofOfAddressUploadVisibleBefore === 'boolean' || candidate.proofOfAddressUploadVisibleBefore === null)
    && (typeof candidate.proofOfAddressUploadVisibleAfter === 'boolean' || candidate.proofOfAddressUploadVisibleAfter === null)
    && (typeof candidate.proofOfAddressUploadVisibilityChanged === 'boolean' || candidate.proofOfAddressUploadVisibilityChanged === null)
    && (typeof candidate.proofOfAddressUploadExpectedForSelectedOption === 'boolean' || candidate.proofOfAddressUploadExpectedForSelectedOption === null)
    && (typeof candidate.physicalOperatingAddressFieldsVisibleBefore === 'boolean' || candidate.physicalOperatingAddressFieldsVisibleBefore === null)
    && (typeof candidate.physicalOperatingAddressFieldsVisibleAfter === 'boolean' || candidate.physicalOperatingAddressFieldsVisibleAfter === null)
    && (typeof candidate.physicalOperatingAddressFieldsVisibilityChanged === 'boolean' || candidate.physicalOperatingAddressFieldsVisibilityChanged === null)
    && (typeof candidate.physicalOperatingAddressFieldsExpectedForSelectedOption === 'boolean' || candidate.physicalOperatingAddressFieldsExpectedForSelectedOption === null)
    && (candidate.uiEffectOutcomeCategory === null || isPhysicalOperatingAddressUiEffectOutcomeCategory(candidate.uiEffectOutcomeCategory))
    && (typeof candidate.expansionAttempted === 'boolean' || candidate.expansionAttempted === null)
    && isPhysicalOperatingAddressExpansionSkippedReason(candidate.expansionSkippedReason)
    && typeof candidate.expansionReturned === 'boolean'
    && typeof candidate.expansionExpanded === 'boolean'
    && typeof candidate.captureReportPresent === 'boolean'
    && typeof candidate.captureReportWritable === 'boolean'
    && typeof candidate.writerCalled === 'boolean'
    && typeof candidate.writerCompleted === 'boolean'
    && typeof candidate.artifactsFresh === 'boolean'
    && typeof candidate.artifactsRemainStale === 'boolean'
    && typeof candidate.staleArtifactsIgnored === 'boolean'
    && isPhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(candidate.blockedReasonCategory)
    && typeof candidate.reportsRefreshSkipped === 'boolean'
    && typeof candidate.findingsOpenSkipped === 'boolean'
    && Array.isArray(candidate.targetFileFreshnessSummary)
    && candidate.redactionApplied === true;
}

export function parsePhysicalOperatingAddressCaptureOnlyReceiptSentinel(
  line: string,
): PhysicalOperatingAddressCaptureOnlyReceipt | null {
  const normalized = normalizeDiagnosticText(line);
  if (!normalized || !normalized.startsWith(PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_SENTINEL_PREFIX)) return null;

  const payload = normalized.slice(PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_SENTINEL_PREFIX.length).trimStart();
  try {
    const parsed = JSON.parse(payload) as unknown;
    return isPhysicalOperatingAddressCaptureOnlyReceipt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readPhysicalOperatingAddressCaptureOnlyReceipt(
  receiptPath: string,
): PhysicalOperatingAddressCaptureOnlyReceipt | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as unknown;
    return isPhysicalOperatingAddressCaptureOnlyReceipt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeMtimeIso(filePath: string): string | null {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function safeGeneratedAtIso(filePath: string): string | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as { generatedAt?: unknown };
    return typeof parsed.generatedAt === 'string' ? normalizeDiagnosticText(parsed.generatedAt) : null;
  } catch {
    return null;
  }
}

export function buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessPaths(outDir: string): {
  structureJsonPath: string;
  domHtmlPath: string;
} {
  return {
    structureJsonPath: path.join(outDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson),
    domHtmlPath: path.join(outDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml),
  };
}

export function readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot(
  outDir: string,
): PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot {
  const paths = buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessPaths(outDir);

  return {
    structureJson: {
      fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson,
      exists: fs.existsSync(paths.structureJsonPath),
      mtimeIso: safeMtimeIso(paths.structureJsonPath),
      generatedAt: safeGeneratedAtIso(paths.structureJsonPath),
    },
    domHtml: {
      fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml,
      exists: fs.existsSync(paths.domHtmlPath),
      mtimeIso: safeMtimeIso(paths.domHtmlPath),
      generatedAt: null,
    },
  };
}

export function comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(
  before: PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
  after: PhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
): PhysicalOperatingAddressCaptureOnlyArtifactFreshness {
  const structureJsonExistsChanged = before.structureJson.exists !== after.structureJson.exists;
  const domHtmlExistsChanged = before.domHtml.exists !== after.domHtml.exists;
  const structureJsonGeneratedAtChanged = before.structureJson.generatedAt !== after.structureJson.generatedAt;
  const structureJsonMtimeChanged = before.structureJson.mtimeIso !== after.structureJson.mtimeIso;
  const domHtmlMtimeChanged = before.domHtml.mtimeIso !== after.domHtml.mtimeIso;
  const anyFreshnessSignalChanged = structureJsonExistsChanged
    || domHtmlExistsChanged
    || structureJsonGeneratedAtChanged
    || structureJsonMtimeChanged
    || domHtmlMtimeChanged;
  const artifactsFresh = after.structureJson.exists && after.domHtml.exists && anyFreshnessSignalChanged;
  const artifactsRemainStale = !artifactsFresh;

  return {
    before,
    after,
    structureJsonExistsChanged,
    domHtmlExistsChanged,
    structureJsonGeneratedAtChanged,
    structureJsonMtimeChanged,
    domHtmlMtimeChanged,
    anyFreshnessSignalChanged,
    artifactsFresh,
    artifactsRemainStale,
    staleArtifactsIgnored: artifactsRemainStale,
    reportsRefreshSkipped: artifactsRemainStale,
    findingsOpenSkipped: artifactsRemainStale,
  };
}

function formatPhysicalOperatingAddressCaptureOnlyArtifactState(
  state: PhysicalOperatingAddressCaptureOnlyArtifactState,
): string {
  const generatedAt = state.generatedAt === null ? 'n/a' : state.generatedAt;
  const mtimeIso = state.mtimeIso === null ? 'n/a' : state.mtimeIso;
  return `${state.fileName}: exists=${state.exists ? 'yes' : 'no'}; mtime=${mtimeIso}; generatedAt=${generatedAt}`;
}

export function buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics(
  freshness: PhysicalOperatingAddressCaptureOnlyArtifactFreshness,
): string[] {
  const diagnostics = [
    `physical-address capture-only artifact freshness before: ${formatPhysicalOperatingAddressCaptureOnlyArtifactState(freshness.before.structureJson)} | ${formatPhysicalOperatingAddressCaptureOnlyArtifactState(freshness.before.domHtml)}`,
    `physical-address capture-only artifact freshness after: ${formatPhysicalOperatingAddressCaptureOnlyArtifactState(freshness.after.structureJson)} | ${formatPhysicalOperatingAddressCaptureOnlyArtifactState(freshness.after.domHtml)}`,
    `physical-address capture-only artifact freshness changed: structure-exists=${freshness.structureJsonExistsChanged ? 'yes' : 'no'}; dom-exists=${freshness.domHtmlExistsChanged ? 'yes' : 'no'}; structure-generatedAt=${freshness.structureJsonGeneratedAtChanged ? 'yes' : 'no'}; structure-mtime=${freshness.structureJsonMtimeChanged ? 'yes' : 'no'}; dom-mtime=${freshness.domHtmlMtimeChanged ? 'yes' : 'no'}`,
    `physical-address capture-only artifact freshness status: ${freshness.artifactsFresh ? 'fresh' : 'stale'}`,
  ];

  if (freshness.staleArtifactsIgnored) {
    diagnostics.push('physical-address capture-only stale artifacts intentionally ignored');
  }
  if (freshness.reportsRefreshSkipped || freshness.findingsOpenSkipped) {
    diagnostics.push('physical-address capture-only downstream reports skipped: stale post-toggle artifacts');
  }

  return diagnostics;
}

export function canWritePhysicalOperatingAddressPostToggleArtifacts(
  report: Parameters<typeof writePhysicalOperatingAddressPostToggleArtifacts>[1] | null | undefined,
): boolean {
  if (!report) return false;

  return Boolean(normalizeDiagnosticText(report.generatedAt))
    && Number.isFinite(report.captureBounds.width)
    && report.captureBounds.width > 0
    && Number.isFinite(report.captureBounds.height)
    && report.captureBounds.height > 0
    && (report.textNodes.length > 0 || report.controls.length > 0 || report.observations.length > 0);
}

function emitPhysicalOperatingAddressCaptureOnlyReceipt(
  receipt: PhysicalOperatingAddressCaptureOnlyReceipt,
  artifactsDir = ARTIFACTS_DIR,
): void {
  writePhysicalOperatingAddressCaptureOnlyReceipt(receipt, artifactsDir);
  // eslint-disable-next-line no-console
  console.log(formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(receipt));
}

export function assertPhysicalOperatingAddressCaptureOnlyGuards(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.DESTRUCTIVE_VALIDATION === '1') {
    throw new Error('capture:physical-address refuses to run when DESTRUCTIVE_VALIDATION=1.');
  }
}

export function buildPhysicalOperatingAddressCaptureOnlyEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...env,
    DESTRUCTIVE_VALIDATION: '',
    [SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV]: '1',
    [SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS_ENV]: '1',
    [SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS_ENV]: '',
  };
}

export async function runPhysicalOperatingAddressCaptureOnly(
  page: Page,
  env: NodeJS.ProcessEnv = process.env,
  artifactsDir = ARTIFACTS_DIR,
  dependencies: PhysicalOperatingAddressCaptureOnlyDependencies = PHYSICAL_ADDRESS_CAPTURE_ONLY_DEPENDENCIES,
): Promise<PhysicalOperatingAddressCaptureOnlyResult> {
  const effectiveEnv = buildPhysicalOperatingAddressCaptureOnlyEnv(env);
  const artifactFreshnessBefore = dependencies.readArtifactFreshnessSnapshot(artifactsDir);
  const { frame, diagnostics } = await dependencies.openSigner(page);
  const initialFields = await dependencies.discoverFields(frame);
  diagnostics.push(`physical-address capture-only fields: initial=${initialFields.length}`);

  const expansion = await dependencies.maybeExpandPhysicalOperatingAddressSection(
    frame,
    initialFields,
    effectiveEnv,
    PHYSICAL_ADDRESS_CAPTURE_ONLY_DISCOVERY_OPTIONS,
  );
  const calibratedAnchorlessFallbackAudit = buildPhysicalOperatingAddressCaptureOnlyAnchorlessFallbackAudit({
    calibratedFallbackConsidered: expansion.toggleSelectionSummary.calibratedFallbackConsidered,
    primarySelectionCandidateCount: expansion.toggleSelectionSummary.primarySelectionCandidateCount,
    cueBasedFallbackCandidateCount: expansion.toggleSelectionSummary.cueBasedFallbackCandidateCount,
    calibratedFallbackCandidateCount: expansion.toggleSelectionSummary.calibratedFallbackCandidateCount,
    eligibleRadioCandidateCount: expansion.toggleSelectionSummary.eligibleRadioCandidateCount,
    exactThreeRadioGuardPassed: expansion.toggleSelectionSummary.exactThreeRadioGuardPassed,
    addressOptionsAnchorMatched: expansion.toggleSelectionSummary.addressOptionsAnchorMatched,
    candidateOrderStable: expansion.toggleSelectionSummary.candidateOrderStable,
    conflictingCueDetected: expansion.toggleSelectionSummary.conflictingCueDetected,
  });
  const postClickUiEffectValidation = buildPhysicalOperatingAddressCaptureOnlyPostClickUiEffectValidation({
    toggleSelectionMode: expansion.toggleSelectionSummary.toggleSelectionMode,
    selectedToggleSlot: expansion.toggleSelectionSummary.selectedToggleSlot,
    proofOfAddressUploadVisibleAfter: expansion.uiEffectSummary.proofOfAddressUploadVisibleAfter,
    physicalOperatingAddressFieldsVisibleAfter: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleAfter,
  });
  const captureReportPresent = Boolean(expansion.captureReport);
  const captureReportWritable = canWritePhysicalOperatingAddressPostToggleArtifacts(expansion.captureReport)
    && (!postClickUiEffectValidation.required || postClickUiEffectValidation.passed === true);

  diagnostics.push(
    `physical-address capture-only expansion returned: yes; expanded=${expansion.expanded ? 'yes' : 'no'}; capture-report=${captureReportPresent ? 'present' : 'missing'}`,
  );
  diagnostics.push(
    `physical-address capture-only calibrated anchorless fallback: enabled=${calibratedAnchorlessFallbackAudit.enabled ? 'yes' : 'no'}; guard-passed=${calibratedAnchorlessFallbackAudit.guardPassed ? 'yes' : 'no'}`,
  );
  diagnostics.push(
    `physical-address capture-only post-click ui validation: required=${postClickUiEffectValidation.required ? 'yes' : 'no'}; outcome=${postClickUiEffectValidation.outcome}`,
  );
  diagnostics.push(...expansion.diagnostics);
  diagnostics.push(`physical-address capture-only capture report writable: ${captureReportWritable ? 'yes' : 'no'}`);

  if (!captureReportPresent || !captureReportWritable) {
    const artifactFreshness = comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(
      artifactFreshnessBefore,
      artifactFreshnessBefore,
    );
    diagnostics.push(`physical-address capture-only writer called: no`);
    diagnostics.push(
      `physical-address capture-only writer skipped reason: ${!captureReportPresent
        ? expansion.expanded
          ? 'toggle expansion exercised but capture report missing'
          : 'capture report missing'
        : postClickUiEffectValidation.required && postClickUiEffectValidation.passed === false
          ? `post-click-ui-effect-validation-${postClickUiEffectValidation.outcome}`
          : 'capture report missing bounded safe content needed for artifact write'}`,
    );
    diagnostics.push(...buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics(artifactFreshness));

    return {
      diagnostics,
      fieldsBefore: initialFields.length,
      fieldsAfter: expansion.fields.length,
      captureWritten: false,
      artifactPaths: null,
      expansionReturned: true,
      expansionExpanded: expansion.expanded,
      captureReportPresent,
      captureReportWritable,
      writerCalled: false,
      writerCompleted: false,
      toggleSelectionOutcomeCategory: expansion.toggleSelectionSummary.toggleSelectionOutcomeCategory,
      toggleSelectionStage: expansion.toggleSelectionSummary.toggleSelectionStage,
      toggleSelectionMode: expansion.toggleSelectionSummary.toggleSelectionMode,
      selectedToggleSlot: expansion.toggleSelectionSummary.selectedToggleSlot,
      selectedToggleReason: expansion.toggleSelectionSummary.selectedToggleReason,
      fallbackReason: expansion.toggleSelectionSummary.fallbackReason,
      calibratedFallbackConsidered: expansion.toggleSelectionSummary.calibratedFallbackConsidered,
      calibratedFallbackAllowed: expansion.toggleSelectionSummary.calibratedFallbackAllowed,
      calibratedFallbackSelected: expansion.toggleSelectionSummary.calibratedFallbackSelected,
      calibratedFallbackSelectedSlot: expansion.toggleSelectionSummary.calibratedFallbackSelectedSlot,
      calibratedFallbackRejectedReasons: expansion.toggleSelectionSummary.calibratedFallbackRejectedReasons,
      calibratedFallbackGuardSummary: expansion.toggleSelectionSummary.calibratedFallbackGuardSummary,
      primarySelectionCandidateCount: expansion.toggleSelectionSummary.primarySelectionCandidateCount,
      cueBasedFallbackCandidateCount: expansion.toggleSelectionSummary.cueBasedFallbackCandidateCount,
      calibratedFallbackCandidateCount: expansion.toggleSelectionSummary.calibratedFallbackCandidateCount,
      eligibleRadioCandidateCount: expansion.toggleSelectionSummary.eligibleRadioCandidateCount,
      exactThreeRadioGuardPassed: expansion.toggleSelectionSummary.exactThreeRadioGuardPassed,
      addressOptionsAnchorMatched: expansion.toggleSelectionSummary.addressOptionsAnchorMatched,
      addressOptionsAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsAnchorOutcomeCategory,
      addressOptionsAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsAnchorRejectedReasons,
      addressOptionsAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsAnchorEvidenceSummary,
      addressOptionsAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsAnchorSourcesChecked,
      addressOptionsAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsAnchorSafeTokensObserved,
      addressOptionsAnchorTextBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorTextBucketsPresent,
      addressOptionsAnchorFieldKeyBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorFieldKeyBucketsPresent,
      addressOptionsAnchorContainerBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorContainerBucketsPresent,
      addressOptionsAnchorAttributeBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorAttributeBucketsPresent,
      addressOptionsGroupAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsGroupAnchorOutcomeCategory,
      addressOptionsGroupAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsGroupAnchorRejectedReasons,
      addressOptionsGroupAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsGroupAnchorEvidenceSummary,
      addressOptionsGroupAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSourcesChecked,
      addressOptionsGroupAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSafeTokensObserved,
      radioGroupAccessibleNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupAccessibleNameBucketsPresent,
      radioGroupLegendBucketsPresent: expansion.toggleSelectionSummary.radioGroupLegendBucketsPresent,
      radioGroupQuestionPromptBucketsPresent: expansion.toggleSelectionSummary.radioGroupQuestionPromptBucketsPresent,
      radioGroupSectionHeaderBucketsPresent: expansion.toggleSelectionSummary.radioGroupSectionHeaderBucketsPresent,
      radioGroupAssociationBucketsPresent: expansion.toggleSelectionSummary.radioGroupAssociationBucketsPresent,
      addressOptionsOwnershipAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorOutcomeCategory,
      addressOptionsOwnershipAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorRejectedReasons,
      addressOptionsOwnershipAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorEvidenceSummary,
      addressOptionsOwnershipAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSourcesChecked,
      addressOptionsOwnershipAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
      radioGroupAriaLabelledbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaLabelledbyBucketsPresent,
      radioGroupAriaDescribedbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaDescribedbyBucketsPresent,
      radioGroupSharedNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedNameBucketsPresent,
      radioGroupSharedOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedOwnerBucketsPresent,
      radioGroupDocusignOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupDocusignOwnerBucketsPresent,
      radioGroupReferenceTargetExists: expansion.toggleSelectionSummary.radioGroupReferenceTargetExists,
      radioGroupReferenceTargetVisible: expansion.toggleSelectionSummary.radioGroupReferenceTargetVisible,
      radioGroupCommonOwnerCategory: expansion.toggleSelectionSummary.radioGroupCommonOwnerCategory,
      ...buildFieldDiscoveryRadioSurfaceFieldProjection(expansion.toggleSelectionSummary),
      ...buildCandidateSignatureSourceFieldProjection(expansion.toggleSelectionSummary),
      ownershipSourceInputSummaryPresent: expansion.toggleSelectionSummary.ownershipSourceInputSummaryPresent,
      ownershipSourceInputOutcomeCategory: expansion.toggleSelectionSummary.ownershipSourceInputOutcomeCategory,
      ownershipSourceInputRejectedReasons: expansion.toggleSelectionSummary.ownershipSourceInputRejectedReasons,
      ownershipSourceInputSummary: expansion.toggleSelectionSummary.ownershipSourceInputSummary,
      ownershipSourceCandidateCount: expansion.toggleSelectionSummary.ownershipSourceCandidateCount,
      ownershipSourceCandidatesWithAnySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAnySignatureCount,
      ownershipSourceCandidatesWithProxySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithProxySignatureCount,
      ownershipSourceCandidatesWithDomAttributeSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
      ownershipSourceCandidatesWithRadioGraphicSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
      ownershipSourceCandidatesWithLayoutSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
      ownershipSourceCandidatesWithFieldKeyCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithFieldKeyCount,
      ownershipSourceCandidatesWithInputNameCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithInputNameCount,
      ownershipSourceCandidatesWithAriaAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
      ownershipSourceCandidatesWithDataAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
      ownershipSourceCandidatesWithDocusignAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
      ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
      ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
      ownershipSourceInputAllCandidatesEmpty:
        expansion.toggleSelectionSummary.ownershipSourceInputAllCandidatesEmpty,
      ownershipSourceInputAnyCandidateHadUsableSource:
        expansion.toggleSelectionSummary.ownershipSourceInputAnyCandidateHadUsableSource,
      ownershipSourceInputHarvestGapDetected:
        expansion.toggleSelectionSummary.ownershipSourceInputHarvestGapDetected,
      ownershipSourceHarvestAttempted: expansion.toggleSelectionSummary.ownershipSourceHarvestAttempted,
      ownershipSourceHarvestOutcomeCategory:
        expansion.toggleSelectionSummary.ownershipSourceHarvestOutcomeCategory,
      ownershipSourceHarvestRejectedReasons:
        expansion.toggleSelectionSummary.ownershipSourceHarvestRejectedReasons,
      ownershipSourceHarvestSummary: expansion.toggleSelectionSummary.ownershipSourceHarvestSummary,
      ariaLabelledbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaLabelledbyAttributePresentCount,
      ariaDescribedbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaDescribedbyAttributePresentCount,
      sharedNamePresentCount: expansion.toggleSelectionSummary.sharedNamePresentCount,
      sharedOwnerPresentCount: expansion.toggleSelectionSummary.sharedOwnerPresentCount,
      docusignOwnerSignalPresentCount:
        expansion.toggleSelectionSummary.docusignOwnerSignalPresentCount,
      ownershipReferenceTargetLookupAttempted:
        expansion.toggleSelectionSummary.ownershipReferenceTargetLookupAttempted,
      ownershipReferenceTargetExistsCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetExistsCount,
      ownershipReferenceTargetVisibleCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetVisibleCount,
      ownershipReferenceTargetSafeTokenCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetSafeTokenCount,
      ownershipEvidenceFilteredAsGeneratedOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
      ownershipEvidenceFilteredAsGenericOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
      ownershipEvidenceFilteredByRedactionCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredByRedactionCount,
      ownershipEvidenceSourcesEmpty:
        expansion.toggleSelectionSummary.ownershipEvidenceSourcesEmpty,
      ownershipEvidenceSourcesPresentButNoSafeTokens:
        expansion.toggleSelectionSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
      candidateOrderStable: expansion.toggleSelectionSummary.candidateOrderStable,
      conflictingCueDetected: expansion.toggleSelectionSummary.conflictingCueDetected,
      proofOfAddressUploadVisibleBefore: expansion.uiEffectSummary.proofOfAddressUploadVisibleBefore,
      proofOfAddressUploadVisibleAfter: expansion.uiEffectSummary.proofOfAddressUploadVisibleAfter,
      proofOfAddressUploadVisibilityChanged: expansion.uiEffectSummary.proofOfAddressUploadVisibilityChanged,
      proofOfAddressUploadExpectedForSelectedOption: expansion.uiEffectSummary.proofOfAddressUploadExpectedForSelectedOption,
      physicalOperatingAddressFieldsVisibleBefore: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleBefore,
      physicalOperatingAddressFieldsVisibleAfter: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleAfter,
      physicalOperatingAddressFieldsVisibilityChanged: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibilityChanged,
      physicalOperatingAddressFieldsExpectedForSelectedOption:
        expansion.uiEffectSummary.physicalOperatingAddressFieldsExpectedForSelectedOption,
      uiEffectOutcomeCategory: expansion.uiEffectSummary.uiEffectOutcomeCategory,
      expansionAttempted: expansion.expansionAttempted,
      expansionSkippedReason: expansion.expansionSkippedReason,
      artifactFreshness,
      reason: !captureReportPresent
        ? expansion.expanded
          ? 'toggle expansion exercised but guarded post-toggle capture did not produce a sanitized capture report'
          : 'guarded post-toggle capture did not produce a sanitized capture report'
        : 'guarded post-toggle capture report did not contain enough bounded safe content to write artifacts',
    };
  }

  diagnostics.push('physical-address capture-only writer called: yes');

  let artifactPaths: Awaited<ReturnType<typeof writePhysicalOperatingAddressPostToggleArtifacts>> | null = null;
  let writerCompleted = false;

  try {
    artifactPaths = await dependencies.writePhysicalOperatingAddressPostToggleArtifacts(
      page,
      expansion.captureReport,
      artifactsDir,
    );
    writerCompleted = true;
    diagnostics.push('physical-address capture-only writer completed: yes');
  } catch {
    const artifactFreshness = comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(
      artifactFreshnessBefore,
      dependencies.readArtifactFreshnessSnapshot(artifactsDir),
    );
    diagnostics.push('physical-address capture-only writer completed: no');
    diagnostics.push(...buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics(artifactFreshness));

    return {
      diagnostics,
      fieldsBefore: initialFields.length,
      fieldsAfter: expansion.fields.length,
      captureWritten: false,
      artifactPaths: null,
      expansionReturned: true,
      expansionExpanded: expansion.expanded,
      captureReportPresent,
      captureReportWritable,
      writerCalled: true,
      writerCompleted,
      toggleSelectionOutcomeCategory: expansion.toggleSelectionSummary.toggleSelectionOutcomeCategory,
      toggleSelectionStage: expansion.toggleSelectionSummary.toggleSelectionStage,
      toggleSelectionMode: expansion.toggleSelectionSummary.toggleSelectionMode,
      selectedToggleSlot: expansion.toggleSelectionSummary.selectedToggleSlot,
      selectedToggleReason: expansion.toggleSelectionSummary.selectedToggleReason,
      fallbackReason: expansion.toggleSelectionSummary.fallbackReason,
      calibratedFallbackConsidered: expansion.toggleSelectionSummary.calibratedFallbackConsidered,
      calibratedFallbackAllowed: expansion.toggleSelectionSummary.calibratedFallbackAllowed,
      calibratedFallbackSelected: expansion.toggleSelectionSummary.calibratedFallbackSelected,
      calibratedFallbackSelectedSlot: expansion.toggleSelectionSummary.calibratedFallbackSelectedSlot,
      calibratedFallbackRejectedReasons: expansion.toggleSelectionSummary.calibratedFallbackRejectedReasons,
      calibratedFallbackGuardSummary: expansion.toggleSelectionSummary.calibratedFallbackGuardSummary,
      primarySelectionCandidateCount: expansion.toggleSelectionSummary.primarySelectionCandidateCount,
      cueBasedFallbackCandidateCount: expansion.toggleSelectionSummary.cueBasedFallbackCandidateCount,
      calibratedFallbackCandidateCount: expansion.toggleSelectionSummary.calibratedFallbackCandidateCount,
      eligibleRadioCandidateCount: expansion.toggleSelectionSummary.eligibleRadioCandidateCount,
      exactThreeRadioGuardPassed: expansion.toggleSelectionSummary.exactThreeRadioGuardPassed,
      addressOptionsAnchorMatched: expansion.toggleSelectionSummary.addressOptionsAnchorMatched,
      addressOptionsAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsAnchorOutcomeCategory,
      addressOptionsAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsAnchorRejectedReasons,
      addressOptionsAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsAnchorEvidenceSummary,
      addressOptionsAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsAnchorSourcesChecked,
      addressOptionsAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsAnchorSafeTokensObserved,
      addressOptionsAnchorTextBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorTextBucketsPresent,
      addressOptionsAnchorFieldKeyBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorFieldKeyBucketsPresent,
      addressOptionsAnchorContainerBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorContainerBucketsPresent,
      addressOptionsAnchorAttributeBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorAttributeBucketsPresent,
      addressOptionsGroupAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsGroupAnchorOutcomeCategory,
      addressOptionsGroupAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsGroupAnchorRejectedReasons,
      addressOptionsGroupAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsGroupAnchorEvidenceSummary,
      addressOptionsGroupAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSourcesChecked,
      addressOptionsGroupAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSafeTokensObserved,
      radioGroupAccessibleNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupAccessibleNameBucketsPresent,
      radioGroupLegendBucketsPresent: expansion.toggleSelectionSummary.radioGroupLegendBucketsPresent,
      radioGroupQuestionPromptBucketsPresent: expansion.toggleSelectionSummary.radioGroupQuestionPromptBucketsPresent,
      radioGroupSectionHeaderBucketsPresent: expansion.toggleSelectionSummary.radioGroupSectionHeaderBucketsPresent,
      radioGroupAssociationBucketsPresent: expansion.toggleSelectionSummary.radioGroupAssociationBucketsPresent,
      addressOptionsOwnershipAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorOutcomeCategory,
      addressOptionsOwnershipAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorRejectedReasons,
      addressOptionsOwnershipAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorEvidenceSummary,
      addressOptionsOwnershipAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSourcesChecked,
      addressOptionsOwnershipAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
      radioGroupAriaLabelledbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaLabelledbyBucketsPresent,
      radioGroupAriaDescribedbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaDescribedbyBucketsPresent,
      radioGroupSharedNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedNameBucketsPresent,
      radioGroupSharedOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedOwnerBucketsPresent,
      radioGroupDocusignOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupDocusignOwnerBucketsPresent,
      radioGroupReferenceTargetExists: expansion.toggleSelectionSummary.radioGroupReferenceTargetExists,
      radioGroupReferenceTargetVisible: expansion.toggleSelectionSummary.radioGroupReferenceTargetVisible,
      radioGroupCommonOwnerCategory: expansion.toggleSelectionSummary.radioGroupCommonOwnerCategory,
      ...buildFieldDiscoveryRadioSurfaceFieldProjection(expansion.toggleSelectionSummary),
      ...buildCandidateSignatureSourceFieldProjection(expansion.toggleSelectionSummary),
      ownershipSourceInputSummaryPresent: expansion.toggleSelectionSummary.ownershipSourceInputSummaryPresent,
      ownershipSourceInputOutcomeCategory: expansion.toggleSelectionSummary.ownershipSourceInputOutcomeCategory,
      ownershipSourceInputRejectedReasons: expansion.toggleSelectionSummary.ownershipSourceInputRejectedReasons,
      ownershipSourceInputSummary: expansion.toggleSelectionSummary.ownershipSourceInputSummary,
      ownershipSourceCandidateCount: expansion.toggleSelectionSummary.ownershipSourceCandidateCount,
      ownershipSourceCandidatesWithAnySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAnySignatureCount,
      ownershipSourceCandidatesWithProxySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithProxySignatureCount,
      ownershipSourceCandidatesWithDomAttributeSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
      ownershipSourceCandidatesWithRadioGraphicSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
      ownershipSourceCandidatesWithLayoutSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
      ownershipSourceCandidatesWithFieldKeyCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithFieldKeyCount,
      ownershipSourceCandidatesWithInputNameCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithInputNameCount,
      ownershipSourceCandidatesWithAriaAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
      ownershipSourceCandidatesWithDataAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
      ownershipSourceCandidatesWithDocusignAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
      ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
      ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
      ownershipSourceInputAllCandidatesEmpty:
        expansion.toggleSelectionSummary.ownershipSourceInputAllCandidatesEmpty,
      ownershipSourceInputAnyCandidateHadUsableSource:
        expansion.toggleSelectionSummary.ownershipSourceInputAnyCandidateHadUsableSource,
      ownershipSourceInputHarvestGapDetected:
        expansion.toggleSelectionSummary.ownershipSourceInputHarvestGapDetected,
      ownershipSourceHarvestAttempted: expansion.toggleSelectionSummary.ownershipSourceHarvestAttempted,
      ownershipSourceHarvestOutcomeCategory:
        expansion.toggleSelectionSummary.ownershipSourceHarvestOutcomeCategory,
      ownershipSourceHarvestRejectedReasons:
        expansion.toggleSelectionSummary.ownershipSourceHarvestRejectedReasons,
      ownershipSourceHarvestSummary: expansion.toggleSelectionSummary.ownershipSourceHarvestSummary,
      ariaLabelledbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaLabelledbyAttributePresentCount,
      ariaDescribedbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaDescribedbyAttributePresentCount,
      sharedNamePresentCount: expansion.toggleSelectionSummary.sharedNamePresentCount,
      sharedOwnerPresentCount: expansion.toggleSelectionSummary.sharedOwnerPresentCount,
      docusignOwnerSignalPresentCount:
        expansion.toggleSelectionSummary.docusignOwnerSignalPresentCount,
      ownershipReferenceTargetLookupAttempted:
        expansion.toggleSelectionSummary.ownershipReferenceTargetLookupAttempted,
      ownershipReferenceTargetExistsCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetExistsCount,
      ownershipReferenceTargetVisibleCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetVisibleCount,
      ownershipReferenceTargetSafeTokenCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetSafeTokenCount,
      ownershipEvidenceFilteredAsGeneratedOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
      ownershipEvidenceFilteredAsGenericOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
      ownershipEvidenceFilteredByRedactionCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredByRedactionCount,
      ownershipEvidenceSourcesEmpty:
        expansion.toggleSelectionSummary.ownershipEvidenceSourcesEmpty,
      ownershipEvidenceSourcesPresentButNoSafeTokens:
        expansion.toggleSelectionSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
      candidateOrderStable: expansion.toggleSelectionSummary.candidateOrderStable,
      conflictingCueDetected: expansion.toggleSelectionSummary.conflictingCueDetected,
      proofOfAddressUploadVisibleBefore: expansion.uiEffectSummary.proofOfAddressUploadVisibleBefore,
      proofOfAddressUploadVisibleAfter: expansion.uiEffectSummary.proofOfAddressUploadVisibleAfter,
      proofOfAddressUploadVisibilityChanged: expansion.uiEffectSummary.proofOfAddressUploadVisibilityChanged,
      proofOfAddressUploadExpectedForSelectedOption: expansion.uiEffectSummary.proofOfAddressUploadExpectedForSelectedOption,
      physicalOperatingAddressFieldsVisibleBefore: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleBefore,
      physicalOperatingAddressFieldsVisibleAfter: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleAfter,
      physicalOperatingAddressFieldsVisibilityChanged: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibilityChanged,
      physicalOperatingAddressFieldsExpectedForSelectedOption:
        expansion.uiEffectSummary.physicalOperatingAddressFieldsExpectedForSelectedOption,
      uiEffectOutcomeCategory: expansion.uiEffectSummary.uiEffectOutcomeCategory,
      expansionAttempted: expansion.expansionAttempted,
      expansionSkippedReason: expansion.expansionSkippedReason,
      artifactFreshness,
      reason: 'post-toggle artifact writer failed before freshness could be confirmed',
    };
  }

  const artifactFreshness = comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(
    artifactFreshnessBefore,
    dependencies.readArtifactFreshnessSnapshot(artifactsDir),
  );
  diagnostics.push(...buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics(artifactFreshness));

  if (!artifactFreshness.artifactsFresh) {
    return {
      diagnostics,
      fieldsBefore: initialFields.length,
      fieldsAfter: expansion.fields.length,
      captureWritten: false,
      artifactPaths,
      expansionReturned: true,
      expansionExpanded: expansion.expanded,
      captureReportPresent,
      captureReportWritable,
      writerCalled: true,
      writerCompleted,
      toggleSelectionOutcomeCategory: expansion.toggleSelectionSummary.toggleSelectionOutcomeCategory,
      toggleSelectionStage: expansion.toggleSelectionSummary.toggleSelectionStage,
      toggleSelectionMode: expansion.toggleSelectionSummary.toggleSelectionMode,
      selectedToggleSlot: expansion.toggleSelectionSummary.selectedToggleSlot,
      selectedToggleReason: expansion.toggleSelectionSummary.selectedToggleReason,
      fallbackReason: expansion.toggleSelectionSummary.fallbackReason,
      calibratedFallbackConsidered: expansion.toggleSelectionSummary.calibratedFallbackConsidered,
      calibratedFallbackAllowed: expansion.toggleSelectionSummary.calibratedFallbackAllowed,
      calibratedFallbackSelected: expansion.toggleSelectionSummary.calibratedFallbackSelected,
      calibratedFallbackSelectedSlot: expansion.toggleSelectionSummary.calibratedFallbackSelectedSlot,
      calibratedFallbackRejectedReasons: expansion.toggleSelectionSummary.calibratedFallbackRejectedReasons,
      calibratedFallbackGuardSummary: expansion.toggleSelectionSummary.calibratedFallbackGuardSummary,
      primarySelectionCandidateCount: expansion.toggleSelectionSummary.primarySelectionCandidateCount,
      cueBasedFallbackCandidateCount: expansion.toggleSelectionSummary.cueBasedFallbackCandidateCount,
      calibratedFallbackCandidateCount: expansion.toggleSelectionSummary.calibratedFallbackCandidateCount,
      eligibleRadioCandidateCount: expansion.toggleSelectionSummary.eligibleRadioCandidateCount,
      exactThreeRadioGuardPassed: expansion.toggleSelectionSummary.exactThreeRadioGuardPassed,
      addressOptionsAnchorMatched: expansion.toggleSelectionSummary.addressOptionsAnchorMatched,
      addressOptionsAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsAnchorOutcomeCategory,
      addressOptionsAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsAnchorRejectedReasons,
      addressOptionsAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsAnchorEvidenceSummary,
      addressOptionsAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsAnchorSourcesChecked,
      addressOptionsAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsAnchorSafeTokensObserved,
      addressOptionsAnchorTextBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorTextBucketsPresent,
      addressOptionsAnchorFieldKeyBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorFieldKeyBucketsPresent,
      addressOptionsAnchorContainerBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorContainerBucketsPresent,
      addressOptionsAnchorAttributeBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorAttributeBucketsPresent,
      addressOptionsGroupAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsGroupAnchorOutcomeCategory,
      addressOptionsGroupAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsGroupAnchorRejectedReasons,
      addressOptionsGroupAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsGroupAnchorEvidenceSummary,
      addressOptionsGroupAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSourcesChecked,
      addressOptionsGroupAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSafeTokensObserved,
      radioGroupAccessibleNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupAccessibleNameBucketsPresent,
      radioGroupLegendBucketsPresent: expansion.toggleSelectionSummary.radioGroupLegendBucketsPresent,
      radioGroupQuestionPromptBucketsPresent: expansion.toggleSelectionSummary.radioGroupQuestionPromptBucketsPresent,
      radioGroupSectionHeaderBucketsPresent: expansion.toggleSelectionSummary.radioGroupSectionHeaderBucketsPresent,
      radioGroupAssociationBucketsPresent: expansion.toggleSelectionSummary.radioGroupAssociationBucketsPresent,
      addressOptionsOwnershipAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorOutcomeCategory,
      addressOptionsOwnershipAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorRejectedReasons,
      addressOptionsOwnershipAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorEvidenceSummary,
      addressOptionsOwnershipAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSourcesChecked,
      addressOptionsOwnershipAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
      radioGroupAriaLabelledbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaLabelledbyBucketsPresent,
      radioGroupAriaDescribedbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaDescribedbyBucketsPresent,
      radioGroupSharedNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedNameBucketsPresent,
      radioGroupSharedOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedOwnerBucketsPresent,
      radioGroupDocusignOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupDocusignOwnerBucketsPresent,
      radioGroupReferenceTargetExists: expansion.toggleSelectionSummary.radioGroupReferenceTargetExists,
      radioGroupReferenceTargetVisible: expansion.toggleSelectionSummary.radioGroupReferenceTargetVisible,
      radioGroupCommonOwnerCategory: expansion.toggleSelectionSummary.radioGroupCommonOwnerCategory,
      ...buildFieldDiscoveryRadioSurfaceFieldProjection(expansion.toggleSelectionSummary),
      ...buildCandidateSignatureSourceFieldProjection(expansion.toggleSelectionSummary),
      ownershipSourceInputSummaryPresent: expansion.toggleSelectionSummary.ownershipSourceInputSummaryPresent,
      ownershipSourceInputOutcomeCategory: expansion.toggleSelectionSummary.ownershipSourceInputOutcomeCategory,
      ownershipSourceInputRejectedReasons: expansion.toggleSelectionSummary.ownershipSourceInputRejectedReasons,
      ownershipSourceInputSummary: expansion.toggleSelectionSummary.ownershipSourceInputSummary,
      ownershipSourceCandidateCount: expansion.toggleSelectionSummary.ownershipSourceCandidateCount,
      ownershipSourceCandidatesWithAnySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAnySignatureCount,
      ownershipSourceCandidatesWithProxySignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithProxySignatureCount,
      ownershipSourceCandidatesWithDomAttributeSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
      ownershipSourceCandidatesWithRadioGraphicSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
      ownershipSourceCandidatesWithLayoutSignatureCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
      ownershipSourceCandidatesWithFieldKeyCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithFieldKeyCount,
      ownershipSourceCandidatesWithInputNameCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithInputNameCount,
      ownershipSourceCandidatesWithAriaAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
      ownershipSourceCandidatesWithDataAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
      ownershipSourceCandidatesWithDocusignAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
      ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
      ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
        expansion.toggleSelectionSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
      ownershipSourceInputAllCandidatesEmpty:
        expansion.toggleSelectionSummary.ownershipSourceInputAllCandidatesEmpty,
      ownershipSourceInputAnyCandidateHadUsableSource:
        expansion.toggleSelectionSummary.ownershipSourceInputAnyCandidateHadUsableSource,
      ownershipSourceInputHarvestGapDetected:
        expansion.toggleSelectionSummary.ownershipSourceInputHarvestGapDetected,
      ownershipSourceHarvestAttempted: expansion.toggleSelectionSummary.ownershipSourceHarvestAttempted,
      ownershipSourceHarvestOutcomeCategory:
        expansion.toggleSelectionSummary.ownershipSourceHarvestOutcomeCategory,
      ownershipSourceHarvestRejectedReasons:
        expansion.toggleSelectionSummary.ownershipSourceHarvestRejectedReasons,
      ownershipSourceHarvestSummary: expansion.toggleSelectionSummary.ownershipSourceHarvestSummary,
      ariaLabelledbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaLabelledbyAttributePresentCount,
      ariaDescribedbyAttributePresentCount:
        expansion.toggleSelectionSummary.ariaDescribedbyAttributePresentCount,
      sharedNamePresentCount: expansion.toggleSelectionSummary.sharedNamePresentCount,
      sharedOwnerPresentCount: expansion.toggleSelectionSummary.sharedOwnerPresentCount,
      docusignOwnerSignalPresentCount:
        expansion.toggleSelectionSummary.docusignOwnerSignalPresentCount,
      ownershipReferenceTargetLookupAttempted:
        expansion.toggleSelectionSummary.ownershipReferenceTargetLookupAttempted,
      ownershipReferenceTargetExistsCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetExistsCount,
      ownershipReferenceTargetVisibleCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetVisibleCount,
      ownershipReferenceTargetSafeTokenCount:
        expansion.toggleSelectionSummary.ownershipReferenceTargetSafeTokenCount,
      ownershipEvidenceFilteredAsGeneratedOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
      ownershipEvidenceFilteredAsGenericOnlyCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
      ownershipEvidenceFilteredByRedactionCount:
        expansion.toggleSelectionSummary.ownershipEvidenceFilteredByRedactionCount,
      ownershipEvidenceSourcesEmpty: expansion.toggleSelectionSummary.ownershipEvidenceSourcesEmpty,
      ownershipEvidenceSourcesPresentButNoSafeTokens:
        expansion.toggleSelectionSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
      candidateOrderStable: expansion.toggleSelectionSummary.candidateOrderStable,
      conflictingCueDetected: expansion.toggleSelectionSummary.conflictingCueDetected,
      proofOfAddressUploadVisibleBefore: expansion.uiEffectSummary.proofOfAddressUploadVisibleBefore,
      proofOfAddressUploadVisibleAfter: expansion.uiEffectSummary.proofOfAddressUploadVisibleAfter,
      proofOfAddressUploadVisibilityChanged: expansion.uiEffectSummary.proofOfAddressUploadVisibilityChanged,
      proofOfAddressUploadExpectedForSelectedOption: expansion.uiEffectSummary.proofOfAddressUploadExpectedForSelectedOption,
      physicalOperatingAddressFieldsVisibleBefore: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleBefore,
      physicalOperatingAddressFieldsVisibleAfter: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleAfter,
      physicalOperatingAddressFieldsVisibilityChanged: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibilityChanged,
      physicalOperatingAddressFieldsExpectedForSelectedOption:
        expansion.uiEffectSummary.physicalOperatingAddressFieldsExpectedForSelectedOption,
      uiEffectOutcomeCategory: expansion.uiEffectSummary.uiEffectOutcomeCategory,
      expansionAttempted: expansion.expansionAttempted,
      expansionSkippedReason: expansion.expansionSkippedReason,
      artifactFreshness,
      reason: 'post-toggle artifact writer completed but freshness did not change; stale artifacts intentionally ignored',
    };
  }

  return {
    diagnostics,
    fieldsBefore: initialFields.length,
    fieldsAfter: expansion.fields.length,
    captureWritten: true,
    artifactPaths,
    expansionReturned: true,
    expansionExpanded: expansion.expanded,
    captureReportPresent,
    captureReportWritable,
    writerCalled: true,
    writerCompleted,
    toggleSelectionOutcomeCategory: expansion.toggleSelectionSummary.toggleSelectionOutcomeCategory,
    toggleSelectionStage: expansion.toggleSelectionSummary.toggleSelectionStage,
    toggleSelectionMode: expansion.toggleSelectionSummary.toggleSelectionMode,
    selectedToggleSlot: expansion.toggleSelectionSummary.selectedToggleSlot,
    selectedToggleReason: expansion.toggleSelectionSummary.selectedToggleReason,
    fallbackReason: expansion.toggleSelectionSummary.fallbackReason,
    calibratedFallbackConsidered: expansion.toggleSelectionSummary.calibratedFallbackConsidered,
    calibratedFallbackAllowed: expansion.toggleSelectionSummary.calibratedFallbackAllowed,
    calibratedFallbackSelected: expansion.toggleSelectionSummary.calibratedFallbackSelected,
    calibratedFallbackSelectedSlot: expansion.toggleSelectionSummary.calibratedFallbackSelectedSlot,
    calibratedFallbackRejectedReasons: expansion.toggleSelectionSummary.calibratedFallbackRejectedReasons,
    calibratedFallbackGuardSummary: expansion.toggleSelectionSummary.calibratedFallbackGuardSummary,
    primarySelectionCandidateCount: expansion.toggleSelectionSummary.primarySelectionCandidateCount,
    cueBasedFallbackCandidateCount: expansion.toggleSelectionSummary.cueBasedFallbackCandidateCount,
    calibratedFallbackCandidateCount: expansion.toggleSelectionSummary.calibratedFallbackCandidateCount,
    eligibleRadioCandidateCount: expansion.toggleSelectionSummary.eligibleRadioCandidateCount,
    exactThreeRadioGuardPassed: expansion.toggleSelectionSummary.exactThreeRadioGuardPassed,
    addressOptionsAnchorMatched: expansion.toggleSelectionSummary.addressOptionsAnchorMatched,
    addressOptionsAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsAnchorOutcomeCategory,
    addressOptionsAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsAnchorRejectedReasons,
    addressOptionsAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsAnchorEvidenceSummary,
    addressOptionsAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsAnchorSourcesChecked,
    addressOptionsAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsAnchorSafeTokensObserved,
    addressOptionsAnchorTextBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorTextBucketsPresent,
    addressOptionsAnchorFieldKeyBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorFieldKeyBucketsPresent,
    addressOptionsAnchorContainerBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorContainerBucketsPresent,
    addressOptionsAnchorAttributeBucketsPresent: expansion.toggleSelectionSummary.addressOptionsAnchorAttributeBucketsPresent,
    addressOptionsGroupAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsGroupAnchorOutcomeCategory,
    addressOptionsGroupAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsGroupAnchorRejectedReasons,
    addressOptionsGroupAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsGroupAnchorEvidenceSummary,
    addressOptionsGroupAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSourcesChecked,
    addressOptionsGroupAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsGroupAnchorSafeTokensObserved,
    radioGroupAccessibleNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupAccessibleNameBucketsPresent,
    radioGroupLegendBucketsPresent: expansion.toggleSelectionSummary.radioGroupLegendBucketsPresent,
    radioGroupQuestionPromptBucketsPresent: expansion.toggleSelectionSummary.radioGroupQuestionPromptBucketsPresent,
    radioGroupSectionHeaderBucketsPresent: expansion.toggleSelectionSummary.radioGroupSectionHeaderBucketsPresent,
    radioGroupAssociationBucketsPresent: expansion.toggleSelectionSummary.radioGroupAssociationBucketsPresent,
    addressOptionsOwnershipAnchorOutcomeCategory: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorOutcomeCategory,
    addressOptionsOwnershipAnchorRejectedReasons: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorRejectedReasons,
    addressOptionsOwnershipAnchorEvidenceSummary: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorEvidenceSummary,
    addressOptionsOwnershipAnchorSourcesChecked: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSourcesChecked,
    addressOptionsOwnershipAnchorSafeTokensObserved: expansion.toggleSelectionSummary.addressOptionsOwnershipAnchorSafeTokensObserved,
    radioGroupAriaLabelledbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaLabelledbyBucketsPresent,
    radioGroupAriaDescribedbyBucketsPresent: expansion.toggleSelectionSummary.radioGroupAriaDescribedbyBucketsPresent,
    radioGroupSharedNameBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedNameBucketsPresent,
    radioGroupSharedOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupSharedOwnerBucketsPresent,
    radioGroupDocusignOwnerBucketsPresent: expansion.toggleSelectionSummary.radioGroupDocusignOwnerBucketsPresent,
    radioGroupReferenceTargetExists: expansion.toggleSelectionSummary.radioGroupReferenceTargetExists,
    radioGroupReferenceTargetVisible: expansion.toggleSelectionSummary.radioGroupReferenceTargetVisible,
    radioGroupCommonOwnerCategory: expansion.toggleSelectionSummary.radioGroupCommonOwnerCategory,
    ...buildFieldDiscoveryRadioSurfaceFieldProjection(expansion.toggleSelectionSummary),
    ...buildCandidateSignatureSourceFieldProjection(expansion.toggleSelectionSummary),
    ownershipSourceInputSummaryPresent: expansion.toggleSelectionSummary.ownershipSourceInputSummaryPresent,
    ownershipSourceInputOutcomeCategory: expansion.toggleSelectionSummary.ownershipSourceInputOutcomeCategory,
    ownershipSourceInputRejectedReasons: expansion.toggleSelectionSummary.ownershipSourceInputRejectedReasons,
    ownershipSourceInputSummary: expansion.toggleSelectionSummary.ownershipSourceInputSummary,
    ownershipSourceCandidateCount: expansion.toggleSelectionSummary.ownershipSourceCandidateCount,
    ownershipSourceCandidatesWithAnySignatureCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAnySignatureCount,
    ownershipSourceCandidatesWithProxySignatureCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithProxySignatureCount,
    ownershipSourceCandidatesWithDomAttributeSignatureCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDomAttributeSignatureCount,
    ownershipSourceCandidatesWithRadioGraphicSignatureCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithRadioGraphicSignatureCount,
    ownershipSourceCandidatesWithLayoutSignatureCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithLayoutSignatureCount,
    ownershipSourceCandidatesWithFieldKeyCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithFieldKeyCount,
    ownershipSourceCandidatesWithInputNameCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithInputNameCount,
    ownershipSourceCandidatesWithAriaAttributePresenceCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithAriaAttributePresenceCount,
    ownershipSourceCandidatesWithDataAttributePresenceCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDataAttributePresenceCount,
    ownershipSourceCandidatesWithDocusignAttributePresenceCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithDocusignAttributePresenceCount,
    ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithReferenceLikeAttributePresenceCount,
    ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount:
      expansion.toggleSelectionSummary.ownershipSourceCandidatesWithSafeOwnershipTokenBucketCount,
    ownershipSourceInputAllCandidatesEmpty:
      expansion.toggleSelectionSummary.ownershipSourceInputAllCandidatesEmpty,
    ownershipSourceInputAnyCandidateHadUsableSource:
      expansion.toggleSelectionSummary.ownershipSourceInputAnyCandidateHadUsableSource,
    ownershipSourceInputHarvestGapDetected:
      expansion.toggleSelectionSummary.ownershipSourceInputHarvestGapDetected,
    ownershipSourceHarvestAttempted: expansion.toggleSelectionSummary.ownershipSourceHarvestAttempted,
    ownershipSourceHarvestOutcomeCategory: expansion.toggleSelectionSummary.ownershipSourceHarvestOutcomeCategory,
    ownershipSourceHarvestRejectedReasons: expansion.toggleSelectionSummary.ownershipSourceHarvestRejectedReasons,
    ownershipSourceHarvestSummary: expansion.toggleSelectionSummary.ownershipSourceHarvestSummary,
    ariaLabelledbyAttributePresentCount: expansion.toggleSelectionSummary.ariaLabelledbyAttributePresentCount,
    ariaDescribedbyAttributePresentCount: expansion.toggleSelectionSummary.ariaDescribedbyAttributePresentCount,
    sharedNamePresentCount: expansion.toggleSelectionSummary.sharedNamePresentCount,
    sharedOwnerPresentCount: expansion.toggleSelectionSummary.sharedOwnerPresentCount,
    docusignOwnerSignalPresentCount: expansion.toggleSelectionSummary.docusignOwnerSignalPresentCount,
    ownershipReferenceTargetLookupAttempted:
      expansion.toggleSelectionSummary.ownershipReferenceTargetLookupAttempted,
    ownershipReferenceTargetExistsCount: expansion.toggleSelectionSummary.ownershipReferenceTargetExistsCount,
    ownershipReferenceTargetVisibleCount: expansion.toggleSelectionSummary.ownershipReferenceTargetVisibleCount,
    ownershipReferenceTargetSafeTokenCount:
      expansion.toggleSelectionSummary.ownershipReferenceTargetSafeTokenCount,
    ownershipEvidenceFilteredAsGeneratedOnlyCount:
      expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGeneratedOnlyCount,
    ownershipEvidenceFilteredAsGenericOnlyCount:
      expansion.toggleSelectionSummary.ownershipEvidenceFilteredAsGenericOnlyCount,
    ownershipEvidenceFilteredByRedactionCount:
      expansion.toggleSelectionSummary.ownershipEvidenceFilteredByRedactionCount,
    ownershipEvidenceSourcesEmpty: expansion.toggleSelectionSummary.ownershipEvidenceSourcesEmpty,
    ownershipEvidenceSourcesPresentButNoSafeTokens:
      expansion.toggleSelectionSummary.ownershipEvidenceSourcesPresentButNoSafeTokens,
    candidateOrderStable: expansion.toggleSelectionSummary.candidateOrderStable,
    conflictingCueDetected: expansion.toggleSelectionSummary.conflictingCueDetected,
    proofOfAddressUploadVisibleBefore: expansion.uiEffectSummary.proofOfAddressUploadVisibleBefore,
    proofOfAddressUploadVisibleAfter: expansion.uiEffectSummary.proofOfAddressUploadVisibleAfter,
    proofOfAddressUploadVisibilityChanged: expansion.uiEffectSummary.proofOfAddressUploadVisibilityChanged,
    proofOfAddressUploadExpectedForSelectedOption: expansion.uiEffectSummary.proofOfAddressUploadExpectedForSelectedOption,
    physicalOperatingAddressFieldsVisibleBefore: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleBefore,
    physicalOperatingAddressFieldsVisibleAfter: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibleAfter,
    physicalOperatingAddressFieldsVisibilityChanged: expansion.uiEffectSummary.physicalOperatingAddressFieldsVisibilityChanged,
    physicalOperatingAddressFieldsExpectedForSelectedOption:
      expansion.uiEffectSummary.physicalOperatingAddressFieldsExpectedForSelectedOption,
    uiEffectOutcomeCategory: expansion.uiEffectSummary.uiEffectOutcomeCategory,
    expansionAttempted: expansion.expansionAttempted,
    expansionSkippedReason: expansion.expansionSkippedReason,
    artifactFreshness,
    reason: 'OK',
  };
}

export async function main(): Promise<ExitReason> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let signerSurfaceReached = false;
  let preSignerFailure: PhysicalOperatingAddressCaptureOnlyPreSignerFailureInput = {
    childRunnerLaunched: true,
    childRunnerReceivedSignerUrl: null,
    childRunnerStartedCapture: false,
    openSignerAttempted: false,
    openSignerExternalWarningHandled: null,
    openSignerReachedSignerSurface: false,
    signerSurfaceWaitAttempted: false,
    signerSurfaceWaitTimedOut: null,
    preSignerFailureBeforeChildLaunch: false,
    preSignerFailureInChildRunner: true,
    preSignerFailureReceiptPreserved: false,
  };
  try {
    loadEnv();
    assertPhysicalOperatingAddressCaptureOnlyGuards(process.env);

    if (!hasSignerUrl()) {
      const exitReason = {
        code: 2,
        reason: 'BLOCKED: DOCUSIGN_SIGNING_URL is not set. Provide a fresh signer URL before running capture:physical-address.',
      };
      emitPhysicalOperatingAddressCaptureOnlyReceipt(
        buildPhysicalOperatingAddressCaptureOnlyReceipt({
          result: null,
          childExitCode: exitReason.code,
          artifactsDir: ARTIFACTS_DIR,
          blockedReasonCategory: 'another bounded reason',
          preSignerFailure: buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput(
            'child-runner-missing-signer-url',
            {
              ...preSignerFailure,
              childRunnerReceivedSignerUrl: false,
              childRunnerStartedCapture: true,
            },
          ),
        }),
        ARTIFACTS_DIR,
      );
      return exitReason;
    }

    preSignerFailure = {
      ...preSignerFailure,
      childRunnerReceivedSignerUrl: true,
      childRunnerStartedCapture: true,
    };
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const instrumentedDependencies: PhysicalOperatingAddressCaptureOnlyDependencies = {
      ...PHYSICAL_ADDRESS_CAPTURE_ONLY_DEPENDENCIES,
      openSigner: async (currentPage) => {
        preSignerFailure = {
          ...preSignerFailure,
          openSignerAttempted: true,
          signerSurfaceWaitAttempted: true,
        };
        try {
          const opened = await PHYSICAL_ADDRESS_CAPTURE_ONLY_DEPENDENCIES.openSigner(currentPage);
          signerSurfaceReached = true;
          preSignerFailure = {
            ...preSignerFailure,
            openSignerReachedSignerSurface: true,
            signerSurfaceWaitTimedOut: false,
            openSignerExternalWarningHandled:
              opened.diagnostics.some((diagnostic) => diagnostic.includes('safe-redirect external-site warning clicked'))
                ? true
                : preSignerFailure.openSignerExternalWarningHandled,
          };
          return opened;
        } catch (error) {
          const safeMessage = (error instanceof Error ? error.message : String(error))
            .replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
          preSignerFailure = {
            ...preSignerFailure,
            ...classifyPhysicalOperatingAddressCaptureOnlyOpenSignerFailure(safeMessage),
            childRunnerLaunched: true,
            childRunnerReceivedSignerUrl: preSignerFailure.childRunnerReceivedSignerUrl ?? true,
            childRunnerStartedCapture: true,
          };
          throw error;
        }
      },
    };
    const result = await runPhysicalOperatingAddressCaptureOnly(
      page,
      process.env,
      ARTIFACTS_DIR,
      instrumentedDependencies,
    );

    for (const diagnostic of result.diagnostics) {
      // eslint-disable-next-line no-console
      console.log(`[capture:physical-address] ${diagnostic}`);
    }

    const exitReason = !result.captureWritten || !result.artifactPaths
      ? {
        code: 3,
        reason: `BLOCKED: ${result.reason}`,
      }
      : { code: 0, reason: 'OK' };

    emitPhysicalOperatingAddressCaptureOnlyReceipt(
      buildPhysicalOperatingAddressCaptureOnlyReceipt({
        result,
        childExitCode: exitReason.code,
        artifactsDir: ARTIFACTS_DIR,
        signerSurfaceReached,
        preSignerFailure: buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput(
          'no-pre-signer-failure',
          {
            ...preSignerFailure,
            childRunnerReceivedSignerUrl: preSignerFailure.childRunnerReceivedSignerUrl ?? true,
            childRunnerStartedCapture: true,
            openSignerAttempted: preSignerFailure.openSignerAttempted || signerSurfaceReached,
            openSignerReachedSignerSurface: true,
            signerSurfaceWaitAttempted: true,
            signerSurfaceWaitTimedOut: false,
          },
        ),
      }),
      ARTIFACTS_DIR,
    );

    if (exitReason.code !== 0) {
      return exitReason;
    }

    // eslint-disable-next-line no-console
    console.log('[capture:physical-address] wrote sanitized post-toggle artifact bundle');

    return exitReason;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const safe = message.replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
    // eslint-disable-next-line no-console
    console.error(`[capture:physical-address] ERROR: ${safe}`);

    const exitReason = {
      code: 1,
      reason: 'BLOCKED: capture:physical-address failed before sanitized freshness receipt could be confirmed.',
    };
    const failurePreSigner = signerSurfaceReached
      ? buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('no-pre-signer-failure', {
        ...preSignerFailure,
        childRunnerReceivedSignerUrl: preSignerFailure.childRunnerReceivedSignerUrl ?? true,
        childRunnerStartedCapture: true,
        openSignerAttempted: true,
        openSignerReachedSignerSurface: true,
        signerSurfaceWaitAttempted: true,
        signerSurfaceWaitTimedOut: false,
      })
      : preSignerFailure.childRunnerReceivedSignerUrl === false
        ? buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('child-runner-missing-signer-url', {
          ...preSignerFailure,
          childRunnerStartedCapture: true,
        })
        : preSignerFailure.openSignerAttempted
          ? {
            ...preSignerFailure,
            ...classifyPhysicalOperatingAddressCaptureOnlyOpenSignerFailure(safe),
            childRunnerLaunched: true,
            childRunnerReceivedSignerUrl: preSignerFailure.childRunnerReceivedSignerUrl ?? true,
            childRunnerStartedCapture: true,
          }
          : buildPhysicalOperatingAddressCaptureOnlyPreSignerFailureInput('child-runner-exited-before-open-signer', {
            ...preSignerFailure,
            childRunnerReceivedSignerUrl: preSignerFailure.childRunnerReceivedSignerUrl ?? true,
            childRunnerStartedCapture: true,
          });

    emitPhysicalOperatingAddressCaptureOnlyReceipt(
      buildPhysicalOperatingAddressCaptureOnlyReceipt({
        result: null,
        childExitCode: exitReason.code,
        artifactsDir: ARTIFACTS_DIR,
        blockedReasonCategory: 'another bounded reason',
        signerSurfaceReached,
        preSignerFailure: failurePreSigner,
      }),
      ARTIFACTS_DIR,
    );

    return exitReason;
  } finally {
    await browser?.close();
  }
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[capture:physical-address] done: ${result.reason}`);
      process.exit(result.code);
    });
}