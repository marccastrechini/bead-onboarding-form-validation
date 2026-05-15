import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import {
  maybeExpandPhysicalOperatingAddressSection,
  SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS_ENV,
  type GuardedPhysicalOperatingAddressDiscoveryOptions,
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
  | 'expansion missing'
  | 'expansion not expanded'
  | 'captureReport missing'
  | 'captureReport not writable'
  | 'writer skipped'
  | 'writer failed'
  | 'writer completed but mtime/generatedAt did not change'
  | 'another bounded reason'
  | null;

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
  calibratedFallbackConsidered: boolean;
  calibratedFallbackSelectedSlot: number | null;
  selectionMode: PhysicalOperatingAddressCaptureOnlySelectionMode;
  fallbackReason: string | null;
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

function parsePhysicalOperatingAddressCaptureOnlySelectionDiagnostics(diagnostics: string[]): {
  calibratedFallbackConsidered: boolean;
  calibratedFallbackSelectedSlot: number | null;
  selectionMode: PhysicalOperatingAddressCaptureOnlySelectionMode;
  fallbackReason: string | null;
} {
  let calibratedFallbackConsidered = false;
  let calibratedFallbackSelectedSlot: number | null = null;
  let selectionMode: PhysicalOperatingAddressCaptureOnlySelectionMode = null;
  let fallbackReason: string | null = null;
  let sawCandidate = false;

  for (const diagnostic of diagnostics) {
    if (diagnostic.startsWith(TOGGLE_FALLBACK_INVENTORY_DIAGNOSTIC_PREFIX)) {
      const payload = diagnostic.slice(TOGGLE_FALLBACK_INVENTORY_DIAGNOSTIC_PREFIX.length);

      try {
        const parsed = JSON.parse(payload) as {
          calibratedFallback?: {
            selectedCalibratedSlot?: unknown;
            fallbackReason?: unknown;
          } | null;
        };

        if (parsed.calibratedFallback && typeof parsed.calibratedFallback === 'object') {
          calibratedFallbackConsidered = true;
          if (typeof parsed.calibratedFallback.selectedCalibratedSlot === 'number') {
            calibratedFallbackSelectedSlot = parsed.calibratedFallback.selectedCalibratedSlot;
          }
          if (typeof parsed.calibratedFallback.fallbackReason === 'string') {
            fallbackReason = normalizeDiagnosticText(parsed.calibratedFallback.fallbackReason);
          }
        }
      } catch {
        // Ignore malformed bounded diagnostics and fail closed on receipt enrichment.
      }
    }

    if (diagnostic === `${TOGGLE_CANDIDATE_SOURCE_DIAGNOSTIC_PREFIX}fallback radio-like candidate`) {
      selectionMode = 'fallback';
    }
    if (diagnostic === `${TOGGLE_CANDIDATE_SOURCE_DIAGNOSTIC_PREFIX}calibrated business primary location fallback`) {
      selectionMode = 'calibrated-fallback';
      calibratedFallbackConsidered = true;
    }
    if (diagnostic.startsWith(TOGGLE_SELECTION_REASON_DIAGNOSTIC_PREFIX)) {
      fallbackReason = normalizeDiagnosticText(diagnostic.slice(TOGGLE_SELECTION_REASON_DIAGNOSTIC_PREFIX.length));
    }
    if (diagnostic.startsWith(TOGGLE_CANDIDATE_DIAGNOSTIC_PREFIX)) {
      sawCandidate = true;
    }
  }

  if (selectionMode === null && sawCandidate) {
    selectionMode = 'primary';
  }

  return {
    calibratedFallbackConsidered,
    calibratedFallbackSelectedSlot,
    selectionMode,
    fallbackReason,
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

function resolvePhysicalOperatingAddressCaptureOnlyBlockedReasonCategory(
  result: PhysicalOperatingAddressCaptureOnlyResult | null,
  childExitCode: number | null,
): PhysicalOperatingAddressCaptureOnlyBlockedReasonCategory {
  if (childExitCode === 0 && result?.artifactFreshness.artifactsFresh) return null;
  if (!result) return 'another bounded reason';
  if (!result.expansionReturned) return 'expansion missing';
  if (!result.expansionExpanded) return 'expansion not expanded';
  if (!result.captureReportPresent) return 'captureReport missing';
  if (!result.captureReportWritable) return 'captureReport not writable';
  if (!result.writerCalled) return 'writer skipped';
  if (!result.writerCompleted) return 'writer failed';
  if (result.artifactFreshness.artifactsRemainStale) return 'writer completed but mtime/generatedAt did not change';
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
    || value === 'expansion missing'
    || value === 'expansion not expanded'
    || value === 'captureReport missing'
    || value === 'captureReport not writable'
    || value === 'writer skipped'
    || value === 'writer failed'
    || value === 'writer completed but mtime/generatedAt did not change'
    || value === 'another bounded reason';
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
  const selection = input.result
    ? parsePhysicalOperatingAddressCaptureOnlySelectionDiagnostics(input.result.diagnostics)
    : {
      calibratedFallbackConsidered: false,
      calibratedFallbackSelectedSlot: null,
      selectionMode: null,
      fallbackReason: null,
    };

  return {
    runKind: PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND,
    childCommand: input.childCommand ?? `npm run ${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    childExitCode: input.childExitCode ?? null,
    bootstrapExitCode: input.bootstrapExitCode ?? null,
    signerSurfaceReached: input.result !== null,
    initialFieldCount: input.result?.fieldsBefore ?? null,
    calibratedFallbackConsidered: selection.calibratedFallbackConsidered,
    calibratedFallbackSelectedSlot: selection.calibratedFallbackSelectedSlot,
    selectionMode: selection.selectionMode,
    fallbackReason: selection.fallbackReason,
    expansionReturned: input.result?.expansionReturned ?? false,
    expansionExpanded: input.result?.expansionExpanded ?? false,
    captureReportPresent: input.result?.captureReportPresent ?? false,
    captureReportWritable: input.result?.captureReportWritable ?? false,
    writerCalled: input.result?.writerCalled ?? false,
    writerCompleted: input.result?.writerCompleted ?? false,
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
    && typeof candidate.calibratedFallbackConsidered === 'boolean'
    && (typeof candidate.calibratedFallbackSelectedSlot === 'number' || candidate.calibratedFallbackSelectedSlot === null)
    && isPhysicalOperatingAddressCaptureOnlySelectionMode(candidate.selectionMode)
    && (typeof candidate.fallbackReason === 'string' || candidate.fallbackReason === null)
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