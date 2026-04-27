import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

export interface SampleInputManifest {
  applicationJsonPath?: string;
  pdfPath?: string;
  mhtmlPath?: string;
  urlPath?: string;
}

export interface ResolvedSampleInputs {
  applicationJsonPath: string;
  pdfPath: string | null;
  mhtmlPath: string;
  urlPath: string | null;
  manifestPath: string | null;
  resolvedFrom: 'cli' | 'env' | 'manifest' | 'defaults';
}

export interface NormalizedSampleApplication {
  applicationId: string | null;
  partnerId: string | null;
  partnerExternalId: string | null;
  envelopeId: string | null;
  templateId: string | null;
  status: string | null;
  agreementStatus: string | null;
  signerPosition: string | null;
  merchantData: Record<string, unknown>;
}

interface ResolveOptions {
  applicationJsonPath?: string;
  pdfPath?: string;
  mhtmlPath?: string;
  urlPath?: string;
  manifestPath?: string;
  env?: NodeJS.ProcessEnv;
}

export function resolveSampleInputs(options: ResolveOptions = {}): ResolvedSampleInputs {
  const env = options.env ?? process.env;
  const manifestPath = path.resolve(options.manifestPath ?? 'samples/private/current-sample-manifest.json');

  if (
    options.applicationJsonPath ||
    options.pdfPath ||
    options.mhtmlPath ||
    options.urlPath ||
    options.manifestPath
  ) {
    return {
      applicationJsonPath: path.resolve(options.applicationJsonPath ?? defaultApplicationJsonPath(env, manifestPath)),
      pdfPath: resolveOptionalPath(options.pdfPath ?? env.SAMPLE_PDF_PATH),
      mhtmlPath: path.resolve(options.mhtmlPath ?? defaultMhtmlPath(env, manifestPath)),
      urlPath: resolveOptionalPath(options.urlPath ?? env.SAMPLE_URL_PATH),
      manifestPath: existsSync(manifestPath) ? manifestPath : null,
      resolvedFrom: 'cli',
    };
  }

  if (env.SAMPLE_APPLICATION_JSON_PATH || env.SAMPLE_MHTML_PATH) {
    return {
      applicationJsonPath: path.resolve(defaultApplicationJsonPath(env, manifestPath)),
      pdfPath: resolveOptionalPath(env.SAMPLE_PDF_PATH),
      mhtmlPath: path.resolve(defaultMhtmlPath(env, manifestPath)),
      urlPath: resolveOptionalPath(env.SAMPLE_URL_PATH),
      manifestPath: existsSync(manifestPath) ? manifestPath : null,
      resolvedFrom: 'env',
    };
  }

  if (existsSync(manifestPath)) {
    const manifest = loadSampleManifest(manifestPath);
    return {
      applicationJsonPath: path.resolve(manifest.applicationJsonPath ?? 'samples/private/app-submit-sample.json'),
      pdfPath: resolveOptionalPath(manifest.pdfPath),
      mhtmlPath: path.resolve(manifest.mhtmlPath ?? 'samples/private/docusign-app-sample.mhtml'),
      urlPath: resolveOptionalPath(manifest.urlPath),
      manifestPath,
      resolvedFrom: 'manifest',
    };
  }

  return {
    applicationJsonPath: path.resolve('samples/private/app-submit-sample.json'),
    pdfPath: null,
    mhtmlPath: path.resolve('samples/private/docusign-app-sample.mhtml'),
    urlPath: null,
    manifestPath: null,
    resolvedFrom: 'defaults',
  };
}

export function loadSampleManifest(manifestPath: string): SampleInputManifest {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as SampleInputManifest;
  return {
    applicationJsonPath: raw.applicationJsonPath,
    pdfPath: raw.pdfPath,
    mhtmlPath: raw.mhtmlPath,
    urlPath: raw.urlPath,
  };
}

export function normalizeSampleApplication(input: unknown): NormalizedSampleApplication {
  const root = asRecord(input);
  const agreement = asRecord(root.agreementApplication);
  const details = asRecord(agreement.merchantOnboardingApplicationDetails);
  const legacyMerchantData = asRecord(root.merchantData);

  if (Object.keys(legacyMerchantData).length > 0) {
    return {
      applicationId: asString(root.id),
      partnerId: asString(root.partnerId),
      partnerExternalId: asString(root.partnerExternalId),
      envelopeId: asString(root.envelopeId),
      templateId: asString(root.templateId),
      status: asString(root.status),
      agreementStatus: null,
      signerPosition: asString(asRecord(root.signer).position),
      merchantData: legacyMerchantData,
    };
  }

  return {
    applicationId: asString(root.id),
    partnerId: asString(root.partnerId),
    partnerExternalId: asString(agreement.partnerExternalId),
    envelopeId: asString(agreement.envelopeId),
    templateId: asString(agreement.templateId),
    status: asString(root.status),
    agreementStatus: asString(agreement.status),
    signerPosition: asString(asRecord(agreement.signer).position ?? asRecord(root.signer).position),
    merchantData: details,
  };
}

export function isRedactedSampleValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\[redacted\]$/i.test(trimmed)) return true;
  if (/[*•]{3,}/.test(trimmed)) return true;
  if (/\b[xX]{3,}\b/.test(trimmed)) return true;
  if (/^masked$/i.test(trimmed)) return true;
  return false;
}

function defaultApplicationJsonPath(env: NodeJS.ProcessEnv, manifestPath: string): string {
  return env.SAMPLE_APPLICATION_JSON_PATH ??
    (existsSync(manifestPath) ? loadSampleManifest(manifestPath).applicationJsonPath ?? 'samples/private/app-submit-sample.json' : 'samples/private/app-submit-sample.json');
}

function defaultMhtmlPath(env: NodeJS.ProcessEnv, manifestPath: string): string {
  return env.SAMPLE_MHTML_PATH ??
    (existsSync(manifestPath) ? loadSampleManifest(manifestPath).mhtmlPath ?? 'samples/private/docusign-app-sample.mhtml' : 'samples/private/docusign-app-sample.mhtml');
}

function resolveOptionalPath(value: string | null | undefined): string | null {
  return value ? path.resolve(value) : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}