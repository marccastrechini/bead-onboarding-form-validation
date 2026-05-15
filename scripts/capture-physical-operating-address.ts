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
  loadEnv();
  assertPhysicalOperatingAddressCaptureOnlyGuards(process.env);

  if (!hasSignerUrl()) {
    return {
      code: 2,
      reason: 'BLOCKED: DOCUSIGN_SIGNING_URL is not set. Provide a fresh signer URL before running capture:physical-address.',
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const result = await runPhysicalOperatingAddressCaptureOnly(page, process.env, ARTIFACTS_DIR);

    for (const diagnostic of result.diagnostics) {
      // eslint-disable-next-line no-console
      console.log(`[capture:physical-address] ${diagnostic}`);
    }

    if (!result.captureWritten || !result.artifactPaths) {
      return {
        code: 3,
        reason: `BLOCKED: ${result.reason}`,
      };
    }

    // eslint-disable-next-line no-console
    console.log('[capture:physical-address] wrote sanitized post-toggle artifact bundle');

    return { code: 0, reason: 'OK' };
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[capture:physical-address] done: ${result.reason}`);
      process.exit(result.code);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const safe = message.replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
      // eslint-disable-next-line no-console
      console.error(`[capture:physical-address] ERROR: ${safe}`);
      process.exit(1);
    });
}