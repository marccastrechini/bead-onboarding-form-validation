import { existsSync, readFileSync } from 'node:fs';
import type { MhtmlParseResult, MhtmlTab } from './mhtml-parser';
import type { PdfTextParseResult } from './pdf-text-parser';
import {
  isRedactedSampleValue,
  normalizeSampleApplication,
  type ResolvedSampleInputs,
} from './sample-inputs';
import { redactUrl } from './url-sanitize';

type MatchSeverity = 'required' | 'advisory';
type ParseStatus = 'ok' | 'missing' | 'invalid' | 'not_provided';
type OverrideStatus =
  | 'accepted'
  | 'skipped_not_redacted'
  | 'missing_tab'
  | 'missing_pdf'
  | 'pdf_mismatch';

interface OverrideSpec {
  jsonKeyPath: string;
  pageIndex: number;
  ordinalOnPage: number;
}

export interface SampleReviewFileSummary {
  path: string | null;
  detectedType: string;
  parseStatus: ParseStatus;
  matchesSet: boolean | null;
  details: Record<string, unknown>;
}

export interface SampleReviewCrossCheck {
  name: string;
  severity: MatchSeverity;
  matched: boolean;
  notes: string;
}

export interface SampleReviewOverride {
  jsonKeyPath: string;
  pageIndex: number;
  ordinalOnPage: number;
  valueShape: string;
  valueLength: number;
  status: OverrideStatus;
  notes: string;
}

export interface SampleIngestionReview {
  generatedAt: string;
  resolvedFrom: ResolvedSampleInputs['resolvedFrom'];
  manifestPath: string | null;
  matchedSet: boolean;
  stopReason: string | null;
  files: {
    json: SampleReviewFileSummary;
    pdf: SampleReviewFileSummary;
    mhtml: SampleReviewFileSummary;
    url: SampleReviewFileSummary;
  };
  crossChecks: SampleReviewCrossCheck[];
  pdfConfirmedOverrides: SampleReviewOverride[];
  acceptedOverrideCount: number;
  mismatchCount: number;
}

export interface SampleIngestionBuildResult {
  review: SampleIngestionReview;
  valueOverrides: Record<string, string>;
}

const PAGE_ONE_OVERRIDE_SPECS: OverrideSpec[] = [
  { jsonKeyPath: 'merchantData.registeredName', pageIndex: 1, ordinalOnPage: 4 },
  { jsonKeyPath: 'merchantData.registrationDate', pageIndex: 1, ordinalOnPage: 5 },
  { jsonKeyPath: 'merchantData.mainPointOfContact.firstName', pageIndex: 1, ordinalOnPage: 31 },
  { jsonKeyPath: 'merchantData.mainPointOfContact.lastName', pageIndex: 1, ordinalOnPage: 32 },
  { jsonKeyPath: 'merchantData.mainPointOfContact.email', pageIndex: 1, ordinalOnPage: 33 },
  { jsonKeyPath: 'merchantData.mainPointOfContact.phoneNumber', pageIndex: 1, ordinalOnPage: 34 },
  { jsonKeyPath: 'merchantData.businessEmail', pageIndex: 1, ordinalOnPage: 56 },
  { jsonKeyPath: 'merchantData.businessPhone', pageIndex: 1, ordinalOnPage: 57 },
  { jsonKeyPath: 'merchantData.bankName', pageIndex: 1, ordinalOnPage: 58 },
];

export function buildSampleIngestionReview(input: {
  inputs: ResolvedSampleInputs;
  submission: unknown;
  mhtml: MhtmlParseResult;
  pdf: PdfTextParseResult | null;
}): SampleIngestionBuildResult {
  const normalized = normalizeSampleApplication(input.submission);
  const urlSummary = summarizeUrlInput(input.inputs.urlPath);
  const mhtmlOrigin = parseOrigin(input.mhtml.snapshotLocationRedacted);
  const pdfEnvelopeId = input.pdf ? extractPdfEnvelopeId(input.pdf) : null;

  const crossChecks: SampleReviewCrossCheck[] = [
    buildMhtmlPdfIdentityCheck({
      name: 'application_id',
      severity: 'required',
      jsonValue: normalized.applicationId,
      mhtmlValue: findTabValue(input.mhtml, 1, 0),
      pdf: input.pdf,
      pdfPage: 1,
    }),
    buildMhtmlPdfIdentityCheck({
      name: 'partner_id',
      severity: 'required',
      jsonValue: normalized.partnerId,
      mhtmlValue: findTabValue(input.mhtml, 1, 2),
      pdf: input.pdf,
      pdfPage: 1,
    }),
    buildMhtmlPdfIdentityCheck({
      name: 'partner_external_id',
      severity: 'required',
      jsonValue: normalized.partnerExternalId,
      mhtmlValue: findTabValue(input.mhtml, 1, 3),
      pdf: input.pdf,
      pdfPage: 1,
    }),
    {
      name: 'envelope_id',
      severity: input.inputs.pdfPath ? 'required' : 'advisory',
      matched: !input.inputs.pdfPath
        ? Boolean(normalized.envelopeId)
        : Boolean(normalized.envelopeId && pdfEnvelopeId && equalNormalized(normalized.envelopeId, pdfEnvelopeId)),
      notes: !input.inputs.pdfPath
        ? 'PDF not provided; skipped envelope footer confirmation.'
        : normalized.envelopeId && pdfEnvelopeId
          ? `JSON and PDF footer envelope ids ${equalNormalized(normalized.envelopeId, pdfEnvelopeId) ? 'agree' : 'do not agree'}.`
          : 'Missing JSON or PDF envelope id evidence.',
    },
    buildMhtmlPdfIdentityCheck({
      name: 'business_website',
      severity: 'advisory',
      jsonValue: asNonEmptyString((normalized.merchantData as Record<string, unknown>).businessWebsite),
      mhtmlValue: findTabValue(input.mhtml, 1, 55),
      pdf: input.pdf,
      pdfPage: 1,
    }),
    {
      name: 'url_origin',
      severity: input.inputs.urlPath ? 'required' : 'advisory',
      matched: !input.inputs.urlPath
        ? true
        : Boolean(urlSummary.origin && mhtmlOrigin && urlSummary.origin === mhtmlOrigin),
      notes: !input.inputs.urlPath
        ? 'URL file not provided.'
        : urlSummary.origin && mhtmlOrigin
          ? `URL origin ${urlSummary.origin === mhtmlOrigin ? 'matches' : 'does not match'} MHTML snapshot origin.`
          : 'Could not parse URL origin or MHTML snapshot origin.',
    },
  ];

  const overrideSpecs = [
    ...PAGE_ONE_OVERRIDE_SPECS,
    ...buildStakeholderOverrideSpecs(normalized.merchantData as Record<string, unknown>, input.mhtml),
  ];

  const valueOverrides: Record<string, string> = {};
  const overrideReviews: SampleReviewOverride[] = [];

  for (const spec of overrideSpecs) {
    const originalValue = getValueAtKeyPath(normalized.merchantData as Record<string, unknown>, spec.jsonKeyPath.replace(/^merchantData\./, ''));
    const originalRedacted = isRedactedSampleValue(originalValue);
    const candidateValue = findTabValue(input.mhtml, spec.pageIndex, spec.ordinalOnPage);
    const pdfConfirmed = candidateValue
      ? pdfContainsValue(input.pdf, spec.pageIndex, candidateValue)
      : false;

    let status: OverrideStatus;
    let notes: string;
    if (!originalRedacted) {
      status = 'skipped_not_redacted';
      notes = 'JSON value is already usable; no override needed.';
    } else if (!candidateValue) {
      status = 'missing_tab';
      notes = 'Expected MHTML tab value was not present.';
    } else if (!input.inputs.pdfPath || !input.pdf) {
      status = 'missing_pdf';
      notes = 'PDF confirmation was unavailable for a redacted field.';
    } else if (!pdfConfirmed) {
      status = 'pdf_mismatch';
      notes = 'MHTML candidate value was not found in the PDF text layer.';
    } else {
      status = 'accepted';
      notes = 'Redacted JSON value replaced with an MHTML value confirmed by the PDF text layer.';
      valueOverrides[spec.jsonKeyPath] = candidateValue;
    }

    overrideReviews.push({
      jsonKeyPath: spec.jsonKeyPath,
      pageIndex: spec.pageIndex,
      ordinalOnPage: spec.ordinalOnPage,
      valueShape: classifyValue(candidateValue),
      valueLength: candidateValue?.length ?? 0,
      status,
      notes,
    });
  }

  const blockingCrossChecks = crossChecks.filter((check) => check.severity === 'required');
  const blockingOverrideFailures = input.inputs.pdfPath
    ? overrideReviews.filter(
        (override) =>
          override.status === 'missing_tab' ||
          override.status === 'missing_pdf' ||
          override.status === 'pdf_mismatch',
      )
    : [];
  const matchedSet = blockingCrossChecks.every((check) => check.matched) && blockingOverrideFailures.length === 0;
  const mismatchNotes = [
    ...blockingCrossChecks.filter((check) => !check.matched).map((check) => `${check.name}: ${check.notes}`),
    ...blockingOverrideFailures.map((override) => `${override.jsonKeyPath}: ${override.notes}`),
  ];

  const jsonMatches = blockingCrossChecks
    .filter((check) => ['application_id', 'partner_id', 'partner_external_id', 'envelope_id'].includes(check.name))
    .every((check) => check.matched);
  const pdfMatches = input.inputs.pdfPath
    ? Boolean(input.pdf) && crossChecks.filter((check) => ['application_id', 'partner_id', 'partner_external_id', 'envelope_id'].includes(check.name)).every((check) => check.matched)
    : null;
  const urlMatches = input.inputs.urlPath ? crossChecks.find((check) => check.name === 'url_origin')?.matched ?? false : null;

  return {
    review: {
      generatedAt: new Date().toISOString(),
      resolvedFrom: input.inputs.resolvedFrom,
      manifestPath: input.inputs.manifestPath,
      matchedSet,
      stopReason: matchedSet ? null : mismatchNotes.join(' | '),
      files: {
        json: {
          path: input.inputs.applicationJsonPath,
          detectedType: 'application-json',
          parseStatus: 'ok',
          matchesSet: jsonMatches,
          details: {
            applicationId: summarizeIdentifier(normalized.applicationId),
            partnerId: summarizeIdentifier(normalized.partnerId),
            partnerExternalId: summarizeIdentifier(normalized.partnerExternalId),
            envelopeId: summarizeIdentifier(normalized.envelopeId),
            status: normalized.status,
            agreementStatus: normalized.agreementStatus,
            stakeholderCount: Array.isArray((normalized.merchantData as Record<string, unknown>).stakeholders)
              ? ((normalized.merchantData as Record<string, unknown>).stakeholders as unknown[]).length
              : 0,
          },
        },
        pdf: {
          path: input.inputs.pdfPath,
          detectedType: 'pdf-text-layer',
          parseStatus: input.inputs.pdfPath ? (input.pdf ? 'ok' : 'invalid') : 'not_provided',
          matchesSet: pdfMatches,
          details: {
            pageCount: input.pdf?.pageCount ?? null,
            envelopeId: summarizeIdentifier(pdfEnvelopeId),
            hasTextLayer: Boolean(input.pdf?.text.trim()),
          },
        },
        mhtml: {
          path: input.inputs.mhtmlPath,
          detectedType: 'docusign-mhtml',
          parseStatus: 'ok',
          matchesSet: blockingCrossChecks
            .filter((check) => ['application_id', 'partner_id', 'partner_external_id', 'business_website'].includes(check.name))
            .every((check) => check.matched),
          details: {
            pageCount: input.mhtml.pageCount,
            tabCount: input.mhtml.tabs.length,
            subject: input.mhtml.subject,
            snapshotLocationRedacted: input.mhtml.snapshotLocationRedacted,
            applicationId: summarizeIdentifier(findTabValue(input.mhtml, 1, 0)),
            partnerId: summarizeIdentifier(findTabValue(input.mhtml, 1, 2)),
            partnerExternalId: summarizeIdentifier(findTabValue(input.mhtml, 1, 3)),
          },
        },
        url: {
          path: input.inputs.urlPath,
          detectedType: 'docusign-url',
          parseStatus: input.inputs.urlPath
            ? (existsSync(input.inputs.urlPath) && urlSummary.sanitizedUrl ? 'ok' : 'invalid')
            : 'not_provided',
          matchesSet: urlMatches,
          details: {
            sanitizedUrl: urlSummary.sanitizedUrl,
            origin: urlSummary.origin,
            host: urlSummary.host,
            protocol: urlSummary.protocol,
            queryKeys: urlSummary.queryKeys,
          },
        },
      },
      crossChecks,
      pdfConfirmedOverrides: overrideReviews,
      acceptedOverrideCount: overrideReviews.filter((override) => override.status === 'accepted').length,
      mismatchCount: mismatchNotes.length,
    },
    valueOverrides,
  };
}

export function renderSampleIngestionReviewMarkdown(review: SampleIngestionReview): string {
  const lines: string[] = [];
  lines.push('# Sample ingestion review');
  lines.push('');
  lines.push(`Generated: ${review.generatedAt}`);
  lines.push(`Resolved from: ${review.resolvedFrom}`);
  if (review.manifestPath) lines.push(`Manifest: \`${review.manifestPath}\``);
  lines.push(`Match verdict: ${review.matchedSet ? 'matched' : 'mismatch'}`);
  if (review.stopReason) lines.push(`Stop reason: ${review.stopReason}`);
  lines.push('');
  lines.push('## Files');
  lines.push('');
  lines.push('| File | Path | Type | Parse | Matches set |');
  lines.push('|---|---|---|---|---|');
  for (const [label, file] of Object.entries(review.files)) {
    lines.push(
      `| ${label} | ${file.path ?? '(not provided)'} | ${file.detectedType} | ${file.parseStatus} | ${file.matchesSet === null ? 'n/a' : file.matchesSet ? 'yes' : 'no'} |`,
    );
  }
  lines.push('');
  lines.push('## Cross-checks');
  lines.push('');
  lines.push('| Check | Severity | Status | Notes |');
  lines.push('|---|---|---|---|');
  for (const check of review.crossChecks) {
    lines.push(`| ${check.name} | ${check.severity} | ${check.matched ? 'ok' : 'mismatch'} | ${check.notes} |`);
  }
  lines.push('');
  lines.push('## PDF-confirmed overrides');
  lines.push('');
  lines.push('| JSON key | Page | Ordinal | Shape | Length | Status | Notes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const override of review.pdfConfirmedOverrides) {
    lines.push(
      `| \`${override.jsonKeyPath}\` | ${override.pageIndex} | ${override.ordinalOnPage} | ${override.valueShape} | ${override.valueLength} | ${override.status} | ${override.notes} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function buildMhtmlPdfIdentityCheck(input: {
  name: string;
  severity: MatchSeverity;
  jsonValue: string | null;
  mhtmlValue: string | null;
  pdf: PdfTextParseResult | null;
  pdfPage: number;
}): SampleReviewCrossCheck {
  const jsonMatchesMhtml = Boolean(input.jsonValue && input.mhtmlValue && valuesCompatible(input.jsonValue, input.mhtmlValue));
  const pdfMatches = !input.pdf ? true : Boolean(input.mhtmlValue && pdfContainsValue(input.pdf, input.pdfPage, input.mhtmlValue));
  const matched = jsonMatchesMhtml && pdfMatches;
  const notes = !input.jsonValue || !input.mhtmlValue
    ? 'Missing JSON or MHTML evidence.'
    : !jsonMatchesMhtml
      ? 'JSON and MHTML values differ.'
      : !pdfMatches
        ? 'Value was not found in the PDF text layer.'
        : 'JSON, MHTML, and PDF evidence agree.';
  return {
    name: input.name,
    severity: input.severity,
    matched,
    notes,
  };
}

function buildStakeholderOverrideSpecs(
  merchantData: Record<string, unknown>,
  mhtml: MhtmlParseResult,
): OverrideSpec[] {
  const stakeholders = Array.isArray(merchantData.stakeholders)
    ? merchantData.stakeholders as Array<Record<string, unknown>>
    : [];
  const specs: OverrideSpec[] = [];
  stakeholders.forEach((stakeholder, index) => {
    const jobTitle = asNonEmptyString(stakeholder.jobTitle);
    const ownership = stringifyScalar(stakeholder.ownershipPercentage);
    let baseOrdinal: number | null = null;
    if (jobTitle) {
      const jobTab = findTabByValue(mhtml, 3, jobTitle);
      if (jobTab) baseOrdinal = jobTab.ordinalOnPage - 26;
    }
    if (baseOrdinal === null && ownership) {
      const ownershipTab = findTabByValue(mhtml, 3, ownership);
      if (ownershipTab) baseOrdinal = ownershipTab.ordinalOnPage - 6;
    }
    if (baseOrdinal === null || baseOrdinal < 0) return;
    specs.push(
      { jsonKeyPath: `merchantData.stakeholders[${index}].lastName`, pageIndex: 3, ordinalOnPage: baseOrdinal },
      { jsonKeyPath: `merchantData.stakeholders[${index}].firstName`, pageIndex: 3, ordinalOnPage: baseOrdinal + 1 },
      { jsonKeyPath: `merchantData.stakeholders[${index}].dateOfBirth`, pageIndex: 3, ordinalOnPage: baseOrdinal + 4 },
      { jsonKeyPath: `merchantData.stakeholders[${index}].email`, pageIndex: 3, ordinalOnPage: baseOrdinal + 21 },
      { jsonKeyPath: `merchantData.stakeholders[${index}].phoneNumber`, pageIndex: 3, ordinalOnPage: baseOrdinal + 22 },
    );
  });
  return specs;
}

function findTabValue(mhtml: MhtmlParseResult, pageIndex: number, ordinalOnPage: number): string | null {
  const tab = mhtml.tabs.find((candidate) => candidate.pageIndex === pageIndex && candidate.ordinalOnPage === ordinalOnPage);
  return tab ? normalizeTabValue(tab) : null;
}

function findTabByValue(mhtml: MhtmlParseResult, pageIndex: number, value: string): MhtmlTab | null {
  const target = normalizeCompare(value);
  return mhtml.tabs.find((tab) => tab.pageIndex === pageIndex && normalizeCompare(normalizeTabValue(tab) ?? '') === target) ?? null;
}

function normalizeTabValue(tab: MhtmlTab): string | null {
  const value = tab.inputValue?.trim() || tab.renderedValue?.trim() || '';
  return value || null;
}

function pdfContainsValue(pdf: PdfTextParseResult | null, pageNumber: number, value: string): boolean {
  if (!pdf) return false;
  const page = pdf.pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (!page) return false;
  return normalizeCompare(page.text).includes(normalizeCompare(value));
}

function extractPdfEnvelopeId(pdf: PdfTextParseResult): string | null {
  const match = /Docusign Envelope ID:\s*([A-Z0-9-]+)/i.exec(pdf.text);
  return match?.[1] ?? null;
}

function summarizeUrlInput(urlPath: string | null): {
  sanitizedUrl: string | null;
  origin: string | null;
  host: string | null;
  protocol: string | null;
  queryKeys: string[];
} {
  if (!urlPath || !existsSync(urlPath)) {
    return {
      sanitizedUrl: null,
      origin: null,
      host: null,
      protocol: null,
      queryKeys: [],
    };
  }
  const raw = readFileSync(urlPath, 'utf8');
  const match = raw.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) {
    return {
      sanitizedUrl: null,
      origin: null,
      host: null,
      protocol: null,
      queryKeys: [],
    };
  }
  const rawUrl = match[0];
  try {
    const parsed = new URL(rawUrl);
    return {
      sanitizedUrl: redactUrl(rawUrl),
      origin: parsed.origin,
      host: parsed.host,
      protocol: parsed.protocol.replace(/:$/, ''),
      queryKeys: Array.from(new Set(Array.from(parsed.searchParams.keys()))).sort(),
    };
  } catch {
    return {
      sanitizedUrl: redactUrl(rawUrl),
      origin: null,
      host: null,
      protocol: null,
      queryKeys: [],
    };
  }
}

function parseOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function summarizeIdentifier(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) return `len=${trimmed.length};suffix=${trimmed}`;
  return `len=${trimmed.length};prefix=${trimmed.slice(0, 8)};suffix=${trimmed.slice(-4)}`;
}

function getValueAtKeyPath(root: Record<string, unknown>, keyPath: string): unknown {
  const normalized = keyPath.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringifyScalar(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function classifyValue(value: string | null): string {
  const raw = value?.trim() ?? '';
  if (!raw) return 'empty';
  if (/^https?:\/\//i.test(raw) || /^www\./i.test(raw)) return 'url';
  if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(raw)) return 'email';
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(raw) || /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(raw)) return 'date';
  if (/^\+?\d[\d\s().-]{6,}$/.test(raw)) return 'phone';
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return 'numeric';
  return 'text';
}

function equalNormalized(left: string, right: string): boolean {
  return normalizeCompare(left) === normalizeCompare(right);
}

function normalizeCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function valuesCompatible(jsonValue: string, mhtmlValue: string): boolean {
  if (equalNormalized(jsonValue, mhtmlValue)) return true;
  if (!isRedactedSampleValue(jsonValue)) return false;
  const visibleChunks = jsonValue
    .split(/[*•xX]+/)
    .map((chunk) => chunk.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase())
    .filter(Boolean);
  if (!visibleChunks.length) return false;
  const normalizedCandidate = mhtmlValue.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
  let offset = 0;
  for (const chunk of visibleChunks) {
    const index = normalizedCandidate.indexOf(chunk, offset);
    if (index < 0) return false;
    offset = index + chunk.length;
  }
  return true;
}