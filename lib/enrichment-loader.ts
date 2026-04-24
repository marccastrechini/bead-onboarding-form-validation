/**
 * Optional live-report enrichment loader.
 *
 * Reads the offline `sample-field-enrichment.json` bundle produced by
 * `npm run align:sample` and exposes two lookup seams:
 *   - by DocuSign tab GUID (best — template-stable when the envelope reuses
 *     the same tab ids);
 *   - by positional fingerprint "page:N|FamilyType|ord:M" (template-shape
 *     fallback when GUIDs rotate across envelopes).
 *
 * Opt-in ONLY.  When `BEAD_SAMPLE_ENRICHMENT` is anything other than "1",
 * or when the bundle file is missing / malformed, this module returns
 * `null` and the live flow behaves exactly as before.
 *
 * SAFE MODE: purely local file read, no network, no secrets.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EnrichmentRecord {
  tabGuid: string;
  positionalFingerprint: string;
  jsonKeyPath: string;
  jsonFieldFamily: string;
  jsonTypeHint: string;
  docusignFieldFamily: string;
  confidence: 'high' | 'medium' | 'low';
  suggestedDisplayName: string;
  suggestedBusinessSection: string;
}

export interface EnrichmentBundle {
  schemaVersion: number;
  generatedAt: string;
  sourceJson?: string;
  sourceMhtml?: string;
  records: EnrichmentRecord[];
}

export interface EnrichmentIndex {
  byGuid: Map<string, EnrichmentRecord>;
  byFingerprint: Map<string, EnrichmentRecord>;
  bundlePath: string;
  recordCount: number;
}

export type EnrichmentUnavailableReason =
  | 'disabled'
  | 'missing'
  | 'unreadable'
  | 'invalid-json'
  | 'invalid-schema'
  | 'empty-index';

export interface EnrichmentLoadResult {
  requested: boolean;
  bundlePath: string;
  index: EnrichmentIndex | null;
  unavailableReason: EnrichmentUnavailableReason | null;
}

const SUPPORTED_SCHEMA_VERSION = 1;

function isEnabled(opts?: { enabled?: boolean }): boolean {
  return typeof opts?.enabled === 'boolean'
    ? opts.enabled
    : process.env.BEAD_SAMPLE_ENRICHMENT === '1';
}

function resolveBundlePath(opts?: { bundlePath?: string }): string {
  return path.resolve(
    opts?.bundlePath ??
      process.env.BEAD_SAMPLE_ENRICHMENT_PATH ??
      'artifacts/sample-field-enrichment.json',
  );
}

export function loadEnrichment(opts?: {
  /** Override the env gate (primarily for tests). */
  enabled?: boolean;
  /** Override the bundle path (primarily for tests). */
  bundlePath?: string;
}): EnrichmentLoadResult {
  const requested = isEnabled(opts);
  const bundlePath = resolveBundlePath(opts);

  if (!requested) {
    return {
      requested: false,
      bundlePath,
      index: null,
      unavailableReason: 'disabled',
    };
  }

  if (!fs.existsSync(bundlePath)) {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'missing',
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(bundlePath, 'utf8');
  } catch {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'unreadable',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'invalid-json',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'invalid-schema',
    };
  }
  const bundle = parsed as Partial<EnrichmentBundle>;
  if (bundle.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'invalid-schema',
    };
  }
  if (!Array.isArray(bundle.records)) {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'invalid-schema',
    };
  }

  const byGuid = new Map<string, EnrichmentRecord>();
  const byFingerprint = new Map<string, EnrichmentRecord>();

  for (const r of bundle.records) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Partial<EnrichmentRecord>;
    if (
      typeof rec.tabGuid !== 'string' ||
      typeof rec.suggestedDisplayName !== 'string' ||
      typeof rec.suggestedBusinessSection !== 'string'
    ) {
      continue;
    }
    const full = rec as EnrichmentRecord;
    if (full.tabGuid) byGuid.set(full.tabGuid.toLowerCase(), full);
    if (full.positionalFingerprint) {
      byFingerprint.set(full.positionalFingerprint, full);
    }
  }

  if (byGuid.size === 0 && byFingerprint.size === 0) {
    return {
      requested: true,
      bundlePath,
      index: null,
      unavailableReason: 'empty-index',
    };
  }

  return {
    requested: true,
    bundlePath,
    index: {
      byGuid,
      byFingerprint,
      bundlePath,
      recordCount: Array.isArray(bundle.records) ? bundle.records.length : 0,
    },
    unavailableReason: null,
  };
}

/**
 * Attempt to load the enrichment bundle.  Returns `null` when the feature
 * is disabled, the file is missing, or the payload is invalid.  Never
 * throws — enrichment is always a best-effort enhancement.
 */
export function loadEnrichmentIndex(opts?: {
  /** Override the env gate (primarily for tests). */
  enabled?: boolean;
  /** Override the bundle path (primarily for tests). */
  bundlePath?: string;
}): EnrichmentIndex | null {
  return loadEnrichment(opts).index;
}

/**
 * Extract the tab GUID from a DocuSign input id of the form
 * `tab-form-element-{GUID}`.  Returns `null` for non-tab ids.
 */
export function tabGuidFromElementId(elementId: string | null): string | null {
  if (!elementId) return null;
  const m = /^tab-form-element-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    elementId.trim(),
  );
  return m ? m[1].toLowerCase() : null;
}

/**
 * Build the positional fingerprint that matches the form used by
 * `lib/sample-alignment.ts`: `page:N|FamilyType|ord:M`.
 */
export function buildPositionalFingerprint(
  pageIndex: number | null,
  dataType: string | null,
  ordinalOnPage: number | null,
): string | null {
  if (!pageIndex || !dataType || !ordinalOnPage) return null;
  const family = normalizeFamily(dataType);
  return `page:${pageIndex}|${family}|ord:${ordinalOnPage}`;
}

/**
 * Normalise the raw DocuSign `data-type` attribute to the same whitelist the
 * MHTML parser uses, so fingerprints line up across offline and live runs.
 */
export function normalizeFamily(raw: string | null): string {
  const v = (raw ?? '').trim();
  const known = [
    'Text',
    'List',
    'Checkbox',
    'Radio',
    'SignHere',
    'SignerAttachment',
    'DateSigned',
    'FullName',
    'Email',
    'Formula',
  ];
  const match = known.find((k) => k.toLowerCase() === v.toLowerCase());
  return match ?? 'Unknown';
}

export interface EnrichmentMatch {
  record: EnrichmentRecord;
  matchedBy: 'guid' | 'position';
}

/**
 * Resolve a field against the enrichment index.  Returns the record plus
 * how we matched it.  GUID match is strictly preferred.
 */
export function matchField(
  index: EnrichmentIndex,
  args: {
    tabGuid: string | null;
    pageIndex: number | null;
    dataType: string | null;
    ordinalOnPage: number | null;
  },
): EnrichmentMatch | null {
  if (args.tabGuid) {
    const r = index.byGuid.get(args.tabGuid.toLowerCase());
    if (r) return { record: r, matchedBy: 'guid' };
  }
  const fp = buildPositionalFingerprint(args.pageIndex, args.dataType, args.ordinalOnPage);
  if (fp) {
    const r = index.byFingerprint.get(fp);
    if (r) return { record: r, matchedBy: 'position' };
  }
  return null;
}
