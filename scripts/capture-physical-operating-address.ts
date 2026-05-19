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
import { discoverFields } from '../fixtures/field-discovery';
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

export type PhysicalOperatingAddressCaptureOnlySelectionMode = 'primary' | 'fallback' | 'calibrated-fallback' | null;

export type PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory =
  | 'expansion-skipped-no-selected-toggle'
  | 'expansion-attempted-not-expanded'
  | 'expansion-expanded-no-capture-report'
  | 'capture-report-not-writable'
  | 'writer-failed'
  | 'stale-artifact-blocked'
  | 'another bounded reason'
  | null;

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

export interface PhysicalOperatingAddressCaptureOnlyReceipt {
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

function resolvePhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(
  result: PhysicalOperatingAddressCaptureOnlyResult | null,
  childExitCode: number | null,
): PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory {
  if (childExitCode === 0 && result?.artifactFreshness.artifactsFresh) return null;
  if (!result) return 'another bounded reason';
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
    || value === 'capture-report-not-writable'
    || value === 'writer-failed'
    || value === 'stale-artifact-blocked'
    || value === 'another bounded reason';
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

  return {
    runKind: PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND,
    childCommand: input.childCommand ?? `npm run ${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    childExitCode: input.childExitCode ?? null,
    bootstrapExitCode: input.bootstrapExitCode ?? null,
    signerSurfaceReached: input.result !== null,
    initialFieldCount: input.result?.fieldsBefore ?? null,
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
  const captureReportPresent = Boolean(expansion.captureReport);
  const captureReportWritable = canWritePhysicalOperatingAddressPostToggleArtifacts(expansion.captureReport);

  diagnostics.push(
    `physical-address capture-only expansion returned: yes; expanded=${expansion.expanded ? 'yes' : 'no'}; capture-report=${captureReportPresent ? 'present' : 'missing'}`,
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
        }),
        ARTIFACTS_DIR,
      );
      return exitReason;
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const result = await runPhysicalOperatingAddressCaptureOnly(page, process.env, ARTIFACTS_DIR);

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

    emitPhysicalOperatingAddressCaptureOnlyReceipt(
      buildPhysicalOperatingAddressCaptureOnlyReceipt({
        result: null,
        childExitCode: exitReason.code,
        artifactsDir: ARTIFACTS_DIR,
        blockedReasonCategory: 'another bounded reason',
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