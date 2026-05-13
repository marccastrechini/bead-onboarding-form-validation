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

export interface PhysicalOperatingAddressCaptureOnlyResult {
  diagnostics: string[];
  fieldsBefore: number;
  fieldsAfter: number;
  captureWritten: boolean;
  artifactPaths: Awaited<ReturnType<typeof writePhysicalOperatingAddressPostToggleArtifacts>> | null;
  reason: string;
}

type ExitReason = { code: number; reason: string };

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
): Promise<PhysicalOperatingAddressCaptureOnlyResult> {
  const effectiveEnv = buildPhysicalOperatingAddressCaptureOnlyEnv(env);
  const { frame, diagnostics } = await openSigner(page);
  const initialFields = await discoverFields(frame);
  diagnostics.push(`physical-address capture-only fields: initial=${initialFields.length}`);

  const expansion = await maybeExpandPhysicalOperatingAddressSection(
    frame,
    initialFields,
    effectiveEnv,
    PHYSICAL_ADDRESS_CAPTURE_ONLY_DISCOVERY_OPTIONS,
  );
  diagnostics.push(...expansion.diagnostics);

  if (!expansion.captureReport) {
    return {
      diagnostics,
      fieldsBefore: initialFields.length,
      fieldsAfter: expansion.fields.length,
      captureWritten: false,
      artifactPaths: null,
      reason: 'guarded post-toggle capture did not produce a sanitized capture report',
    };
  }

  const artifactPaths = await writePhysicalOperatingAddressPostToggleArtifacts(
    page,
    expansion.captureReport,
    artifactsDir,
  );
  diagnostics.push(
    `physical-address capture-only artifacts written: ${[
      artifactPaths.screenshotPath,
      artifactPaths.htmlPath,
      artifactPaths.jsonPath,
      artifactPaths.mdPath,
    ].map((entry) => path.basename(entry)).join(', ')}`,
  );

  return {
    diagnostics,
    fieldsBefore: initialFields.length,
    fieldsAfter: expansion.fields.length,
    captureWritten: true,
    artifactPaths,
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
    console.log(
      `[capture:physical-address] wrote ${PHYSICAL_ADDRESS_CAPTURE_ONLY_ARTIFACT_FILENAMES.join(', ')}`,
    );

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