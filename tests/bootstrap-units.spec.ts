/**
 * Narrow unit tests for the bootstrap pipeline.  These are pure-logic tests –
 * no browser, no network – but they live under tests/ so they run with the
 * existing `playwright test` runner.
 */

import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildResendUrl, normalizeResendMethod } from '../lib/bead-client';
import {
  findPhysicalOperatingAddressToggle,
  guardedPhysicalOperatingAddressDiscoveryEnabled,
} from '../fixtures/conditional-discovery';
import type { DiscoveredField } from '../fixtures/field-discovery';
import {
  buildPhysicalOperatingAddressDomProbeReport,
  collectPhysicalOperatingAddressProbeTextFragments,
  guardedPhysicalOperatingAddressDomProbeEnabled,
  sanitizePhysicalOperatingAddressProbeControl,
  selectPhysicalOperatingAddressDomProbeAnchor,
  writePhysicalOperatingAddressDomProbeArtifacts,
} from '../fixtures/physical-address-dom-probe';
import {
  guardedPhysicalOperatingAddressPostToggleCaptureEnabled,
  refinePhysicalOperatingAddressPostToggleCaptureRegion,
  sanitizePhysicalOperatingAddressPostToggleCaptureText,
  writePhysicalOperatingAddressPostToggleArtifacts,
} from '../fixtures/physical-address-post-toggle-capture';
import { ReportBuilder } from '../fixtures/validation-report';
import type { FieldRecord, ValidationReport } from '../fixtures/validation-report';
import { FIELD_CONCEPT_REGISTRY } from '../fixtures/field-concepts';
import {
  buildValidationScorecard,
  renderScorecardMarkdown,
  writeScorecardArtifacts,
} from '../fixtures/validation-scorecard';
import {
  applyRestoreSafetyGate,
  assertInteractiveValidationGuards,
  buildExpectedAnchor,
  buildInteractiveProgressArtifact,
  buildInteractiveResultsFile,
  buildInteractiveStepTimeoutResult,
  buildInteractiveValidationPlan,
  extractFieldLocalValidationDiagnostics,
  INTERACTIVE_TARGET_CONCEPTS,
  INTERACTIVE_STEP_TIMEOUT_MS,
  prepareControlledChoiceInteraction,
  releaseInteractiveTimeoutSession,
  renderInteractiveResultsMarkdown,
  resolveInteractiveTargetConcepts,
  resolveInteractiveTargetField,
  skippedConceptToResult,
  type InteractiveProgressState,
  type InteractiveResultOutcome,
  type InteractiveResultStatus,
  type InteractiveValidationCase,
  type InteractiveTargetConfidence,
  type InteractiveValidationResultsFile,
} from '../fixtures/interactive-validation';
import { buildSearchQuery, messageTargetsAddress, selectFreshestMessage, selectMailboxMessage } from '../lib/gmail-client';
import { loadEnrichment, matchField } from '../lib/enrichment-loader';
import type { MhtmlParseResult, MhtmlTab } from '../lib/mhtml-parser';
import {
  findDirectDocusignUrls,
  findCandidateRedirectUrls,
  extractSigningUrl,
} from '../lib/link-extractor';
import {
  conceptKeyForJsonKeyPath,
  detectValueShape,
  expectedFieldFamiliesForConcept,
  expectedValueShapesForConcept,
  resolveMappingClaims,
  selectBestMappingCandidate,
} from '../lib/mapping-calibration';
import {
  isRedactedSampleValue,
  normalizeSampleApplication,
  resolveSampleInputs,
} from '../lib/sample-inputs';
import { buildAlignment, buildEnrichmentBundle, buildSourceFieldInventory } from '../lib/sample-alignment';
import { inferFieldCellEvidenceFromPositionedText } from '../lib/sample-layout-evidence';
import { buildSampleIngestionReview } from '../lib/sample-ingestion';
import { redactUrl } from '../lib/url-sanitize';
import {
  buildValidationFindingsReport,
  renderValidationFindingsMarkdown,
  writeValidationFindingsArtifacts,
} from '../scripts/generate-validation-findings';
import {
  buildMappingCalibration,
  PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX,
  PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION,
  PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION,
  PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX,
} from '../scripts/generate-mapping-calibration';
import {
  buildInteractiveTimeoutArtifact,
  buildWindowsProcessTreeKillCommand,
  runNpmScriptWithWatchdog,
} from '../scripts/bootstrap-interactive-run';

test.describe('bead-client: buildResendUrl', () => {
  test('substitutes {applicationId} and joins base + path', () => {
    const url = buildResendUrl({
      baseUrl: 'https://api.example.com',
      resendPath: '/v1/onboarding/{applicationId}/resend',
      applicationId: 'abc-123',
    });
    expect(url).toBe('https://api.example.com/v1/onboarding/abc-123/resend');
  });

  test('tolerates missing leading slash in path', () => {
    const url = buildResendUrl({
      baseUrl: 'https://api.example.com/',
      resendPath: 'v1/onboarding/{applicationId}/resend',
      applicationId: 'x',
    });
    expect(url).toBe('https://api.example.com/v1/onboarding/x/resend');
  });

  test('url-encodes application id', () => {
    const url = buildResendUrl({
      baseUrl: 'https://api.example.com',
      resendPath: '/v1/onboarding/{applicationId}/resend',
      applicationId: 'a/b c',
    });
    expect(url).toBe('https://api.example.com/v1/onboarding/a%2Fb%20c/resend');
  });

  test('normalizes supported resend methods', () => {
    expect(normalizeResendMethod(' put ')).toBe('PUT');
    expect(normalizeResendMethod('post')).toBe('POST');
    expect(normalizeResendMethod('PATCH')).toBe('PATCH');
  });

  test('rejects unsupported resend methods', () => {
    expect(() => normalizeResendMethod('DELETE')).toThrow(
      'Unsupported BEAD_ONBOARDING_RESEND_METHOD: DELETE',
    );
  });
});

test.describe('gmail-client: buildSearchQuery', () => {
  test('composes to/from/subject/after with skew', () => {
    const q = buildSearchQuery(
      { address: 'me@example.com', queryFrom: 'dse@docusign.net', querySubjectContains: 'Please DocuSign' },
      1_700_000_000,
    );
    expect(q).toContain('from:dse@docusign.net');
    expect(q).toContain('subject:"Please DocuSign"');
    expect(q).toMatch(/after:1699\d+/); // after 30s skew backward
    expect(q).toContain('newer_than:1d');
  });

  test('quotes subject fragments with punctuation safely', () => {
    const q = buildSearchQuery(
      { address: 'me@example.com', queryFrom: 'integrations@bead.xyz', querySubjectContains: 'Complete with Docusign:' },
      1_700_000_000,
    );
    expect(q).toContain('subject:"Complete with Docusign:"');
  });
});

test.describe('gmail-client: selectFreshestMessage', () => {
  test('picks newest message after start time', () => {
    const after = 1000;
    const pick = selectFreshestMessage(
      [
        { id: 'a', internalDate: '900' },  // before start → ignored
        { id: 'b', internalDate: '1500' },
        { id: 'c', internalDate: '1200' },
      ],
      after,
    );
    expect(pick).toEqual({ id: 'b', internalDateMs: 1500 });
  });

  test('returns null when no candidates qualify', () => {
    const pick = selectFreshestMessage([{ id: 'a', internalDate: '500' }], 1000);
    expect(pick).toBeNull();
  });
});

test.describe('gmail-client: selectMailboxMessage', () => {
  test('prefers recipient-header matches when available', () => {
    const pick = selectMailboxMessage(
      [
        {
          id: 'a',
          internalDate: '1500',
          payload: { headers: [{ name: 'To', value: 'someone@example.com' }] },
        },
        {
          id: 'b',
          internalDate: '1400',
          payload: { headers: [{ name: 'To', value: 'marc@bead.xyz' }] },
        },
      ],
      'marc@bead.xyz',
      1000,
    );
    expect(pick).toEqual({ id: 'b', internalDateMs: 1400 });
  });

  test('falls back to freshest queried message when recipient headers use an alias', () => {
    const pick = selectMailboxMessage(
      [
        {
          id: 'a',
          internalDate: '1500',
          payload: { headers: [{ name: 'To', value: 'marc@bead.xyz' }] },
        },
        {
          id: 'b',
          internalDate: '2500',
          payload: { headers: [{ name: 'To', value: 'marc@alias.example' }] },
        },
      ],
      'marc@castro9.com',
      1000,
    );
    expect(pick).toEqual({ id: 'b', internalDateMs: 2500 });
  });
});

test.describe('gmail-client: messageTargetsAddress', () => {
  test('matches plus-address recipients against the configured mailbox', () => {
    expect(messageTargetsAddress([
      { name: 'To', value: 'Janie Leuschke <marc+202604231106@bead.xyz>' },
    ], 'marc@bead.xyz')).toBe(true);
  });

  test('matches exact delivered-to header when present', () => {
    expect(messageTargetsAddress([
      { name: 'Delivered-To', value: 'marc@bead.xyz' },
    ], 'marc@bead.xyz')).toBe(true);
  });

  test('rejects different recipients', () => {
    expect(messageTargetsAddress([
      { name: 'To', value: 'someone@example.com' },
    ], 'marc@bead.xyz')).toBe(false);
  });
});

test.describe('link-extractor', () => {
  test('findDirectDocusignUrls prefers signing-entry links', () => {
    const body = `
      Click <a href="https://na4.docusign.net/Member/Home.aspx">home</a>
      Primary <a href="https://na4.docusign.net/Signing/EmailStart.aspx?a=1&t=abc">sign</a>
    `;
    const hits = findDirectDocusignUrls(body);
    expect(hits[0]).toContain('/Signing/EmailStart.aspx');
  });

  test('findDirectDocusignUrls demotes support articles behind signer links', () => {
    const body = `
      Primary <a href="https://demo.docusign.net/Signing/StartInSession.aspx?a=1">sign</a>
      Help <a href="https://support.docusign.com/s/articles/How-do-I-sign-a-DocuSign-document-Basic-Signing?language=en_US">support</a>
    `;
    const hits = findDirectDocusignUrls(body);
    expect(hits[0]).toContain('demo.docusign.net/Signing/StartInSession.aspx');
    expect(hits[1]).toContain('support.docusign.com');
  });

  test('findCandidateRedirectUrls includes tracker hosts', () => {
    const body = `
      https://click.example.com/abc
      https://cdn.example.com/static.css
      https://track.mailer.net/r/xyz
    `;
    const hits = findCandidateRedirectUrls(body);
    expect(hits).toContain('https://click.example.com/abc');
    expect(hits).toContain('https://track.mailer.net/r/xyz');
    expect(hits).not.toContain('https://cdn.example.com/static.css');
  });

  test('extractSigningUrl returns a direct DocuSign match with redacted sanitized form', async () => {
    const raw = 'https://na4.docusign.net/Signing/EmailStart.aspx?a=1&t=SECRET';
    const body = `Hello,\nPlease sign: ${raw}\n`;
    const result = await extractSigningUrl(body);
    expect(result).not.toBeNull();
    expect(result!.via).toBe('direct');
    expect(result!.url).toBe(raw);
    expect(result!.sanitized).toBe('https://na4.docusign.net/[redacted-path]?[redacted]');
    expect(result!.sanitized).not.toContain('SECRET');
  });

  test('extractSigningUrl prefers signer entry links over support articles', async () => {
    const signer = 'https://demo.docusign.net/Signing/StartInSession.aspx?a=1';
    const help = 'https://support.docusign.com/s/articles/How-do-I-sign-a-DocuSign-document-Basic-Signing?language=en_US';
    const body = `Need help? ${help}\nStart here: ${signer}`;
    const result = await extractSigningUrl(body);
    expect(result).not.toBeNull();
    expect(result!.url).toBe(signer);
  });

  test('extractSigningUrl returns null when no docusign link present and no trackers', async () => {
    const result = await extractSigningUrl('plain body with https://cdn.example.com/image.png');
    expect(result).toBeNull();
  });
});

test.describe('url-sanitize: redactUrl', () => {
  test('redacts path, query, and hash', () => {
    expect(redactUrl('https://x.example.com/path?token=ABC#frag'))
      .toBe('https://x.example.com/[redacted-path]?[redacted]#[redacted]');
  });

  test('handles no query or hash', () => {
    expect(redactUrl('https://x.example.com/path')).toBe('https://x.example.com/[redacted-path]');
  });

  test('preserves bare origins', () => {
    expect(redactUrl('https://x.example.com')).toBe('https://x.example.com/');
  });

  test('handles unparseable input', () => {
    expect(redactUrl('not a url')).toBe('[unparseable-url]');
  });
});

test.describe('sample enrichment status', () => {
  test('loadEnrichment reports missing bundle when requested', () => {
    const bundlePath = path.join(os.tmpdir(), `missing-enrichment-${Date.now()}.json`);
    const result = loadEnrichment({ enabled: true, bundlePath });

    expect(result.requested).toBe(true);
    expect(result.bundlePath).toBe(path.resolve(bundlePath));
    expect(result.index).toBeNull();
    expect(result.unavailableReason).toBe('missing');
  });

  test('report artifacts show requested-but-unavailable enrichment', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-report-'));
    try {
      const report = new ReportBuilder(false);
      report.attachEnrichment(null, {
        requested: true,
        bundlePath: 'C:/tmp/sample-field-enrichment.json',
        unavailableReason: 'missing',
      });

      const { jsonPath, mdPath } = report.writeArtifacts(outDir);
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
        enrichmentSummary: {
          requested: boolean;
          enabled: boolean;
          bundlePath: string | null;
          unavailableReason: string | null;
        };
      };
      const md = fs.readFileSync(mdPath, 'utf8');

      expect(json.enrichmentSummary).toMatchObject({
        requested: true,
        enabled: false,
        bundlePath: 'C:/tmp/sample-field-enrichment.json',
        unavailableReason: 'missing',
      });
      expect(md).toContain('## Sample-field enrichment');
      expect(md).toContain('| Requested | yes |');
      expect(md).toContain('| Bundle loaded | no |');
      expect(md).toContain('| Unavailable reason | missing |');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

test.describe('sample layout evidence', () => {
  test('infers field-cell labels from positioned layout text', () => {
    const evidence = inferFieldCellEvidenceFromPositionedText({
      tabs: [mockLayoutMhtmlTab({ ordinalOnPage: 0, left: 24, top: 140, inputValue: 'Example LLC' })],
      textBlocks: [
        { pageIndex: 1, text: 'General', left: 20, top: 100, width: 300, isSectionHeader: true },
        { pageIndex: 1, text: 'Registered Name', left: 24, top: 118, width: 160 },
      ],
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sectionHeader: 'General',
      fieldLabel: 'Registered Name',
      layoutValueShape: 'text_name_like',
      editability: 'editable',
    });
  });

  test('adds Bead PDF/MHTML field-cell anchors for Batch 1 page-1 concepts', () => {
    const report = buildAlignment(mockSubmissionForLayout(), mockLayoutMhtmlParseResult([
      mockLayoutMhtmlTab({ ordinalOnPage: 4, left: 35.2, top: 224.64, inputValue: 'Example Business LLC' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 5, left: 661.76, top: 224.64, dataType: 'Text', rawDataType: 'Text', inputValue: '2024/06/18' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 6, left: 35.2, top: 256.64, inputValue: '' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 17, left: 35.2, top: 348.8, inputValue: 'Retail goods and services' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 35, left: 410.88, top: 433.92, inputValue: '679 Lester Courts' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 36, left: 348.16, top: 512.64, inputValue: '' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 39, left: 35.2, top: 543.36, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 41, left: 568.32, top: 543.36, inputValue: '12345' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 47, left: 35.2, top: 657.92, inputValue: '124 Uptown Blvd' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 49, left: 348.16, top: 657.92, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 51, left: 567.04, top: 657.92, inputValue: '' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 52, left: 35.2, top: 712.32, inputValue: 'Location Name Value' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 63, left: 35.2, top: 905.6, inputValue: '456 Bank Plaza' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 64, left: 409.6, top: 905.6, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 67, left: 410.88, top: 936.32, inputValue: '54321' }),
    ]), {
      jsonPath: 'sample.json',
      mhtmlPath: 'sample.mhtml',
      pdfText: beadPageOneLabelText(),
    });
    const bundle = buildEnrichmentBundle(report);
    const byKey = new Map(bundle.records.map((record) => [record.jsonKeyPath, record]));

    expect(report.rows.find((row) => row.jsonKeyPath === 'merchantData.dbaName')?.matchingMethod).toBe('layout_cell');
    expect(byKey.get('merchantData.registeredName')).toMatchObject({
      suggestedDisplayName: 'Registered Name',
      suggestedBusinessSection: 'Business Details',
      layoutSectionHeader: 'General',
    });
    expect(byKey.get('merchantData.dbaName')).toMatchObject({
      suggestedDisplayName: 'DBA Name',
      layoutSectionHeader: 'General',
    });
    expect(byKey.get('merchantData.businessDescription')).toMatchObject({
      suggestedDisplayName: 'Business Description',
      layoutSectionHeader: 'General',
    });
    expect(byKey.get('merchantData.registeredLegalAddress.line1')).toMatchObject({
      suggestedDisplayName: 'Registered Legal Address Line 1',
      suggestedBusinessSection: 'Address',
      layoutSectionHeader: 'Registered Legal Address',
      layoutFieldLabel: 'Address Line 1',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.registeredLegalAddress.line2')).toMatchObject({
      suggestedDisplayName: 'Registered Legal Address Line 2',
      suggestedBusinessSection: 'Address',
      layoutSectionHeader: 'Registered Legal Address',
      layoutFieldLabel: 'Address Line 2',
      layoutValueShape: 'empty',
    });
    expect(byKey.get('merchantData.registeredLegalAddress.city')).toMatchObject({
      suggestedDisplayName: 'Registered Legal Address City',
      layoutSectionHeader: 'Registered Legal Address',
      layoutFieldLabel: 'City',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.registeredLegalAddress.postalCode')).toMatchObject({
      suggestedDisplayName: 'Registered Legal Address ZIP',
      suggestedBusinessSection: 'Address',
      tabLeft: 568.32,
      layoutValueShape: 'postal_code',
    });
    expect(byKey.get('merchantData.businessMailingAddress.line1')).toMatchObject({
      suggestedDisplayName: 'Physical Operating Address Line 1',
      layoutSectionHeader: 'Physical Operating Address',
      layoutFieldLabel: 'Address Line 1',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.businessMailingAddress.city')).toMatchObject({
      suggestedDisplayName: 'Physical Operating Address City',
      layoutSectionHeader: 'Physical Operating Address',
      layoutFieldLabel: 'City',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.businessMailingAddress.postalCode')).toMatchObject({
      suggestedDisplayName: 'Physical Operating Address ZIP',
      layoutValueShape: 'empty',
    });
    expect(byKey.get('merchantData.bankAddress.line1')).toMatchObject({
      suggestedDisplayName: 'Bank Address Line 1',
      suggestedBusinessSection: 'Banking',
      layoutSectionHeader: 'Bank Address',
      layoutFieldLabel: 'Bank Address Line 1',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.bankAddress.city')).toMatchObject({
      suggestedDisplayName: 'Bank Address City',
      suggestedBusinessSection: 'Banking',
      layoutSectionHeader: 'Bank Address',
      layoutFieldLabel: 'Bank Address City',
      layoutValueShape: 'text_name_like',
    });
    expect(byKey.get('merchantData.bankAddress.postalCode')).toMatchObject({
      suggestedDisplayName: 'Bank Address ZIP',
      suggestedBusinessSection: 'Banking',
    });
  });

  test('repeated address cells preserve section-specific labels', () => {
    const report = buildAlignment(mockSubmissionForLayout(), mockLayoutMhtmlParseResult([
      mockLayoutMhtmlTab({ ordinalOnPage: 35, left: 410.88, top: 433.92, inputValue: '679 Lester Courts' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 39, left: 35.2, top: 543.36, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 41, left: 568.32, top: 543.36, inputValue: '12345' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 47, left: 35.2, top: 657.92, inputValue: '124 Uptown Blvd' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 49, left: 348.16, top: 657.92, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 51, left: 567.04, top: 657.92, inputValue: '' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 63, left: 35.2, top: 905.6, inputValue: '456 Bank Plaza' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 64, left: 409.6, top: 905.6, inputValue: 'Charlotte' }),
      mockLayoutMhtmlTab({ ordinalOnPage: 67, left: 410.88, top: 936.32, inputValue: '54321' }),
    ]), {
      jsonPath: 'sample.json',
      mhtmlPath: 'sample.mhtml',
      pdfText: beadPageOneLabelText(),
    });

    const bundle = buildEnrichmentBundle(report);
    const byKey = new Map(bundle.records.map((record) => [record.jsonKeyPath, record]));

    expect(byKey.get('merchantData.registeredLegalAddress.city')?.suggestedDisplayName).toBe('Registered Legal Address City');
    expect(byKey.get('merchantData.businessMailingAddress.city')?.suggestedDisplayName).toBe('Physical Operating Address City');
    expect(byKey.get('merchantData.bankAddress.city')?.suggestedDisplayName).toBe('Bank Address City');
    expect(new Set([
      byKey.get('merchantData.registeredLegalAddress.city')?.suggestedDisplayName,
      byKey.get('merchantData.businessMailingAddress.city')?.suggestedDisplayName,
      byKey.get('merchantData.bankAddress.city')?.suggestedDisplayName,
    ]).size).toBe(3);
  });

  test('city and postal code are not cross-labeled when coordinates are near each other', () => {
    const index = {
      byGuid: new Map([
        ['city-guid', {
          tabGuid: 'city-guid',
          positionalFingerprint: 'page:1|Text|ord:39',
          tabLeft: 35.2,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.city',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address City',
          suggestedBusinessSection: 'Address',
        }],
        ['postal-guid', {
          tabGuid: 'postal-guid',
          positionalFingerprint: 'page:1|Text|ord:41',
          tabLeft: 568.32,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'postalCode',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address ZIP',
          suggestedBusinessSection: 'Address',
        }],
      ]),
      byFingerprint: new Map([
        ['page:1|Text|ord:39', {
          tabGuid: 'city-guid',
          positionalFingerprint: 'page:1|Text|ord:39',
          tabLeft: 35.2,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.city',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address City',
          suggestedBusinessSection: 'Address',
        }],
        ['page:1|Text|ord:41', {
          tabGuid: 'postal-guid',
          positionalFingerprint: 'page:1|Text|ord:41',
          tabLeft: 568.32,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'postalCode',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address ZIP',
          suggestedBusinessSection: 'Address',
        }],
      ]),
      records: [
        {
          tabGuid: 'city-guid',
          positionalFingerprint: 'page:1|Text|ord:39',
          tabLeft: 35.2,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.city',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address City',
          suggestedBusinessSection: 'Address',
        },
        {
          tabGuid: 'postal-guid',
          positionalFingerprint: 'page:1|Text|ord:41',
          tabLeft: 568.32,
          tabTop: 543.36,
          jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'postalCode',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Registered Legal Address ZIP',
          suggestedBusinessSection: 'Address',
        },
      ],
      bundlePath: 'in-memory',
      recordCount: 2,
    };

    const cityMatch = matchField(index as any, {
      tabGuid: null,
      pageIndex: 1,
      dataType: 'Text',
      ordinalOnPage: 41,
      tabLeft: 35.2,
      tabTop: 543.36,
    });
    const postalMatch = matchField(index as any, {
      tabGuid: null,
      pageIndex: 1,
      dataType: 'Text',
      ordinalOnPage: 43,
      tabLeft: 568.32,
      tabTop: 543.36,
    });

    expect(cityMatch?.record.jsonKeyPath).toBe('merchantData.registeredLegalAddress.city');
    expect(cityMatch?.record.suggestedDisplayName).toBe('Registered Legal Address City');
    expect(cityMatch?.matchedBy).toBe('coordinate');
    expect(postalMatch?.record.jsonKeyPath).toBe('merchantData.registeredLegalAddress.postalCode');
    expect(postalMatch?.record.suggestedDisplayName).toBe('Registered Legal Address ZIP');
    expect(postalMatch?.matchedBy).toBe('coordinate');
  });

  test('buildEnrichmentBundle preserves layout-only address rows when value matching does not produce a row', () => {
    const bundle = buildEnrichmentBundle({
      generatedAt: '2026-04-29T00:00:00.000Z',
      source: {
        jsonPath: 'sample.json',
        mhtmlPath: 'sample.mhtml',
        mhtmlSubject: null,
        mhtmlSnapshotRedacted: null,
        mhtmlPageCount: 1,
        mhtmlTabCount: 1,
        mhtmlCountsByType: { Text: 1 },
      },
      totals: {
        jsonFields: 1,
        matchedFields: 0,
        unmatchedJsonFields: 1,
        unmatchedRenderedValues: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
      },
      rows: [],
      layoutEvidence: [{
        tabGuid: 'guid-registered-line1',
        positionalFingerprint: 'page:1|Text|ord:35',
        pageIndex: 1,
        ordinalOnPage: 35,
        tabLeft: 35.2,
        tabTop: 512.64,
        docusignFieldFamily: 'Text',
        jsonKeyPath: 'merchantData.registeredLegalAddress.line1',
        jsonTypeHint: 'string',
        businessSection: 'Address',
        sectionHeader: 'Registered Legal Address',
        fieldLabel: 'Address Line 1',
        suggestedDisplayName: 'Registered Legal Address Line 1',
        neighboringLabels: ['Proof of Address Type', 'City'],
        layoutValueShape: 'text_name_like',
        editability: 'editable',
        evidenceSource: 'pdf-text-sequence',
        confidence: 'high',
      }],
      unmatchedRenderedValues: [],
      recommendedManualConfirmations: [],
    });

    expect(bundle.records).toEqual([
      expect.objectContaining({
        jsonKeyPath: 'merchantData.registeredLegalAddress.line1',
        suggestedDisplayName: 'Registered Legal Address Line 1',
        suggestedBusinessSection: 'Address',
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Address Line 1',
        layoutValueShape: 'text_name_like',
      }),
    ]);
  });

  test('adds Bead PDF/MHTML field-cell anchors for controlled-choice page-1 concepts', () => {
    const report = buildAlignment(mockSubmissionForLayout(), mockLayoutMhtmlParseResult([
      mockLayoutMhtmlTab({ ordinalOnPage: 7, left: 663.68, top: 256.64, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 8, left: 37.12, top: 288.64, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 10, left: 288, top: 287.36, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 37, left: 663.68, top: 512.64, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 40, left: 350.08, top: 544.64, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 50, left: 348.8, top: 660.48, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 53, left: 411.52, top: 713.6, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 61, left: 536.96, top: 876.8, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 62, left: 663.68, top: 876.8, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 66, left: 288, top: 938.88, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
      mockLayoutMhtmlTab({ ordinalOnPage: 68, left: 535.68, top: 938.88, dataType: 'List', rawDataType: 'List', inputValue: '', ownedBySigner: false }),
    ]), {
      jsonPath: 'sample.json',
      mhtmlPath: 'sample.mhtml',
      pdfText: beadPageOneLabelText(),
    });
    const byKey = new Map(report.rows.map((row) => [row.jsonKeyPath, row]));

    expect(byKey.get('merchantData.proofOfBusinessType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'General',
      layoutFieldLabel: 'Proof of Business Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.federalTaxIdType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'General',
      layoutFieldLabel: 'Federal Tax ID Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.legalEntityType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'General',
      layoutFieldLabel: 'Legal Entity Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.proofOfAddressType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Registered Legal Address',
      layoutFieldLabel: 'Proof of Address Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.registeredLegalAddress.state')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Registered Legal Address',
      layoutFieldLabel: 'State',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.businessMailingAddress.state')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Physical Operating Address',
      layoutFieldLabel: 'State',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.locationBusinessType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Location Details',
      layoutFieldLabel: 'Business Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.accountType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Bank Info',
      layoutFieldLabel: 'Account Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.proofOfBankAccountType')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Bank Info',
      layoutFieldLabel: 'Proof of Bank Account Type',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.bankAddress.state')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Bank Address',
      layoutFieldLabel: 'State',
      candidateDocuSignFieldFamily: 'List',
    });
    expect(byKey.get('merchantData.bankAddress.country')).toMatchObject({
      matchingMethod: 'layout_cell',
      layoutSectionHeader: 'Bank Address',
      layoutFieldLabel: 'Country',
      candidateDocuSignFieldFamily: 'List',
    });
  });
});

test.describe('field validation scorecard', () => {
  test('concept registry includes required concepts and validation expectations', () => {
    for (const key of ['business_name', 'date_of_birth', 'phone', 'ein', 'email', 'routing_number', 'signature', 'business_type', 'bank_account_type', 'proof_of_business_type'] as const) {
      const concept = FIELD_CONCEPT_REGISTRY[key];
      expect(concept.displayName.length).toBeGreaterThan(0);
      expect(concept.businessSection.length).toBeGreaterThan(0);
      expect(concept.bestPracticeValidations.length).toBeGreaterThan(0);
      expect(concept.validExamples.length).toBeGreaterThan(0);
      expect(concept.invalidExamples.length).toBeGreaterThan(0);
      expect(concept.notes.length).toBeGreaterThan(0);
    }
  });

  test('distinguishes not-run validations from failed validations', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Business Email',
        label: 'Business Email',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
        checks: [
          { case: 'email:missing-at', status: 'fail', detail: 'accepted invalid address' },
        ],
      }),
    ]);

    const scorecard = buildValidationScorecard(report);
    const email = scorecard.conceptScores.find((score) => score.key === 'email')!;
    const failed = email.bestPracticeValidations.find((row) => row.id === 'missing-at-rejected')!;
    const notRun = email.bestPracticeValidations.find((row) => row.id === 'valid-email-accepted')!;

    expect(failed.status).toBe('failed');
    expect(failed.executed).toBe(true);
    expect(notRun.status).toBe('not_run');
    expect(notRun.executed).toBe(false);
  });

  test('generic DocuSign labels do not count as identified business fields', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Email',
        label: 'Email',
        labelSource: 'docusign-tab-type',
        labelConfidence: 'low',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
      }),
    ]);

    const scorecard = buildValidationScorecard(report);
    const email = scorecard.conceptScores.find((score) => score.key === 'email')!;

    expect(email.foundField).toBe(true);
    expect(email.identifiedWithConfidence).toBe(false);
    expect(email.validationQualityGrade).toBe('Needs Mapping');
    expect(email.bestPracticeValidations[0].status).toBe('cannot_run_not_confidently_mapped');
  });

  test('calibrated matches replace stale low-confidence address labels with the concept display name', () => {
    const report = mockValidationReport([
      mockField({
        index: 18,
        label: 'registered Legal Address › Postal Code',
        resolvedLabel: 'registered Legal Address › Postal Code',
        labelSource: 'enrichment-position',
        labelConfidence: 'low',
        currentValueShape: 'text_name_like',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 35.2,
        tabTop: 543.36,
      }),
      mockField({
        index: 19,
        label: null,
        resolvedLabel: null,
        labelSource: 'none',
        labelConfidence: 'none',
        currentValueShape: 'text_name_like',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 43,
        tabLeft: 568.32,
        tabTop: 543.36,
      }),
    ]);

    const scorecard = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [
        {
          concept: 'registered_city',
          conceptDisplayName: 'Registered Legal Address City',
          currentCandidateFieldIndex: 1,
          selectedCandidate: '#1 Registered Legal Address City',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
        },
        {
          concept: 'postal_code',
          conceptDisplayName: 'Postal Code',
          currentCandidateFieldIndex: 2,
          selectedCandidate: '#2 Postal Code',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_anchor_and_value_shape',
        },
      ],
    } as any);

    const registeredCity = scorecard.conceptScores.find((score) => score.key === 'registered_city')!;
    const postalCode = scorecard.conceptScores.find((score) => score.key === 'postal_code')!;

    expect(registeredCity.mappedFields[0]).toMatchObject({
      fieldIndex: 1,
      displayName: 'Registered Legal Address City',
      identificationConfidence: 'high',
    });
    expect(postalCode.mappedFields[0]).toMatchObject({
      fieldIndex: 2,
      displayName: 'Postal Code',
      identificationConfidence: 'high',
    });
  });

  test('DOB, phone, EIN, and email matrices include expected recommended tests', () => {
    expect(FIELD_CONCEPT_REGISTRY.date_of_birth.bestPracticeValidations.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'valid-adult-dob-accepted',
        'letters-rejected',
        'impossible-date-rejected',
        'future-date-rejected',
        'under-age-dob-rejected-or-flagged',
        'unrealistic-old-date-rejected-or-flagged',
        'empty-required-behavior',
        'accepted-date-format-documented',
      ]),
    );
    expect(FIELD_CONCEPT_REGISTRY.phone.bestPracticeValidations.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'valid-e164-accepted',
        'missing-plus-handling',
        'letters-rejected',
        'too-short-rejected',
        'too-long-rejected',
        'punctuation-format-handling',
        'empty-required-behavior',
      ]),
    );
    expect(FIELD_CONCEPT_REGISTRY.ein.bestPracticeValidations.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'valid-ein-accepted',
        'letters-rejected',
        'too-short-rejected',
        'too-long-rejected',
        'missing-dash-behavior',
        'repeated-digits-behavior',
        'empty-required-behavior',
      ]),
    );
    expect(FIELD_CONCEPT_REGISTRY.email.bestPracticeValidations.map((row) => row.id)).toEqual(
      expect.arrayContaining([
        'valid-email-accepted',
        'missing-at-rejected',
        'invalid-domain-rejected',
        'spaces-rejected',
        'too-long-rejected',
        'empty-required-behavior',
      ]),
    );
  });

  test('contact and stakeholder profile concepts resolve to scoped keys and shapes', () => {
    expect(conceptKeyForJsonKeyPath('merchantData.mainPointOfContact.firstName')).toBe('contact_first_name');
    expect(conceptKeyForJsonKeyPath('merchantData.mainPointOfContact.lastName')).toBe('contact_last_name');
    expect(conceptKeyForJsonKeyPath('merchantData.stakeholders[0].firstName')).toBe('stakeholder_first_name');
    expect(conceptKeyForJsonKeyPath('merchantData.stakeholders[0].lastName')).toBe('stakeholder_last_name');
    expect(conceptKeyForJsonKeyPath('merchantData.stakeholders[0].jobTitle')).toBe('stakeholder_job_title');
    expect(conceptKeyForJsonKeyPath('merchantData.businessEmail')).toBe('email');
    expect(conceptKeyForJsonKeyPath('merchantData.businessPhone')).toBe('phone');
    expect(conceptKeyForJsonKeyPath('merchantData.stakeholders[0].email')).toBe('stakeholder_email');
    expect(conceptKeyForJsonKeyPath('merchantData.stakeholders[0].phoneNumber')).toBe('stakeholder_phone');

    expect(FIELD_CONCEPT_REGISTRY.contact_first_name.businessSection).toBe('Contact');
    expect(FIELD_CONCEPT_REGISTRY.contact_last_name.businessSection).toBe('Contact');
    expect(FIELD_CONCEPT_REGISTRY.stakeholder_first_name.businessSection).toBe('Stakeholder');
    expect(FIELD_CONCEPT_REGISTRY.stakeholder_last_name.businessSection).toBe('Stakeholder');
    expect(FIELD_CONCEPT_REGISTRY.stakeholder_job_title.businessSection).toBe('Stakeholder');
    expect(FIELD_CONCEPT_REGISTRY.stakeholder_email.businessSection).toBe('Stakeholder');
    expect(FIELD_CONCEPT_REGISTRY.stakeholder_phone.businessSection).toBe('Stakeholder');
    expect(expectedValueShapesForConcept('contact_first_name')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('contact_last_name')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('stakeholder_first_name')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('stakeholder_last_name')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('stakeholder_job_title')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('stakeholder_email')).toEqual(['email']);
    expect(expectedValueShapesForConcept('stakeholder_phone')).toEqual(['phone']);
  });

  test('scoped address and location concepts resolve exact key paths, shapes, and select families', () => {
    expect(conceptKeyForJsonKeyPath('merchantData.locationName')).toBe('location_name');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.line1')).toBe('registered_address_line_1');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.line2')).toBe('registered_address_line_2');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.city')).toBe('registered_city');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.state')).toBe('registered_state');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.country')).toBe('registered_country');
    expect(conceptKeyForJsonKeyPath('merchantData.registeredLegalAddress.postalCode')).toBe('postal_code');
    expect(conceptKeyForJsonKeyPath('merchantData.businessMailingAddress.line1')).toBe('business_mailing_address_line_1');
    expect(conceptKeyForJsonKeyPath('merchantData.businessMailingAddress.city')).toBe('business_mailing_city');
    expect(conceptKeyForJsonKeyPath('merchantData.businessMailingAddress.state')).toBe('business_mailing_state');
    expect(conceptKeyForJsonKeyPath('merchantData.businessMailingAddress.postalCode')).toBe('business_mailing_postal_code');
    expect(conceptKeyForJsonKeyPath('merchantData.bankAddress.line1')).toBe('bank_address_line_1');
    expect(conceptKeyForJsonKeyPath('merchantData.bankAddress.city')).toBe('bank_city');
    expect(conceptKeyForJsonKeyPath('merchantData.bankAddress.state')).toBe('bank_state');
    expect(conceptKeyForJsonKeyPath('merchantData.bankAddress.postalCode')).toBe('bank_postal_code');
    expect(conceptKeyForJsonKeyPath('merchantData.bankAddress.country')).toBe('bank_country');

    expect(expectedValueShapesForConcept('location_name')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('registered_address_line_1')).toEqual(['text_name_like']);
    expect(expectedValueShapesForConcept('business_mailing_postal_code')).toEqual(['postal_code', 'numeric']);
    expect(expectedValueShapesForConcept('bank_postal_code')).toEqual(['postal_code', 'numeric']);
    expect(expectedFieldFamiliesForConcept('registered_state')).toEqual(['list']);
    expect(expectedFieldFamiliesForConcept('registered_country')).toEqual(['list']);
    expect(expectedFieldFamiliesForConcept('bank_state')).toEqual(['list']);
    expect(expectedFieldFamiliesForConcept('bank_country')).toEqual(['list']);
  });

  test('scorecard output is generated from a small mock report', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-scorecard-'));
    try {
      const report = mockValidationReport([
        mockField({
          index: 1,
          resolvedLabel: 'Business Phone',
          label: 'Business Phone',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          inferredType: 'phone_e164',
          inferredClassification: 'inferred_best_practice',
          checks: [{ case: 'phone_e164:valid-e164', status: 'pass' }],
        }),
      ]);

      const { jsonPath, mdPath, scorecard } = writeScorecardArtifacts(report, outDir);
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { overall: { fieldConceptsCovered: number } };
      const md = fs.readFileSync(mdPath, 'utf8');

      expect(scorecard.conceptScores.find((score) => score.key === 'phone')!.executedValidationCount).toBe(1);
      expect(json.overall.fieldConceptsCovered).toBeGreaterThan(0);
      expect(md).toContain('# Bead Onboarding - Field Validation Scorecard');
      expect(md).toContain('Business Phone');
      expect(renderScorecardMarkdown(scorecard)).toContain('Tests actually executed');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('merges observed interactive results into matching scorecard rows', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Business Email',
        label: 'Business Email',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
      }),
    ]);
    const scorecard = buildValidationScorecard(report, mockInteractiveResults({
      concept: 'email',
      conceptDisplayName: 'Email',
      fieldLabel: 'Business Email',
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      testName: 'missing @ rejected',
      status: 'failed',
      evidence: 'input "qa.signerexample.com"; observed "qa.signerexample.com"; aria-invalid=null',
    }));

    const email = scorecard.conceptScores.find((score) => score.key === 'email')!;
    const failed = email.bestPracticeValidations.find((row) => row.id === 'missing-at-rejected')!;

    expect(scorecard.interactiveValidation.resultsLoaded).toBe(true);
    expect(email.executedValidationCount).toBe(1);
    expect(email.failedValidationCount).toBe(1);
    expect(failed.status).toBe('failed');
    expect(failed.executed).toBe(true);
    expect(failed.actualChecks[0].case).toBe('interactive:missing-at');
    expect(failed.actualChecks[0].detail).toContain('qa.signerexample.com');
  });

  test('interactive merge keeps not-run and failed distinct', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Business Email',
        label: 'Business Email',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
      }),
    ]);
    const scorecard = buildValidationScorecard(report, mockInteractiveResults({
      concept: 'email',
      conceptDisplayName: 'Email',
      fieldLabel: 'Business Email',
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      testName: 'missing @ rejected',
      status: 'failed',
      evidence: 'invalid email was accepted',
    }));

    const email = scorecard.conceptScores.find((score) => score.key === 'email')!;
    expect(email.bestPracticeValidations.find((row) => row.id === 'missing-at-rejected')!.status).toBe('failed');
    expect(email.bestPracticeValidations.find((row) => row.id === 'valid-email-accepted')!.status).toBe('not_run');
  });

  test('interactive merge does not treat mapping suspects as clean failures', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Business Email',
        label: 'Business Email',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
      }),
    ]);
    const scorecard = buildValidationScorecard(report, mockInteractiveResults({
      concept: 'email',
      conceptDisplayName: 'Email',
      fieldLabel: 'Business Email',
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      testName: 'missing @ rejected',
      status: 'skipped',
      outcome: 'tool_mapping_suspect',
      evidence: 'target signature suggests phone instead of Email',
    }));

    const email = scorecard.conceptScores.find((score) => score.key === 'email')!;
    const skipped = email.bestPracticeValidations.find((row) => row.id === 'missing-at-rejected')!;

    expect(email.failedValidationCount).toBe(0);
    expect(email.skippedValidationCount).toBe(1);
    expect(skipped.status).toBe('skipped');
  });
});

test.describe('validation findings export', () => {
  test('product_failure appears in likely product findings only when trusted', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'website',
          conceptDisplayName: 'Website',
          validationId: 'malformed-url-rejected',
          testName: 'malformed URL rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
          validationId: 'too-long-rejected',
          testName: 'too long rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'tool_mapping_suspect',
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings.map((finding) => finding.concept)).toEqual(['website']);
    expect(report.likelyProductValidationFindings[0].validationId).toBe('malformed-url-rejected');
  });

  test('trusted state invalid and numeric acceptances render as likely product findings', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'numbers-rejected',
          testName: 'numbers rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
        mockFindingsResult({
          concept: 'bank_state',
          conceptDisplayName: 'Bank Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
        mockFindingsResult({
          concept: 'bank_state',
          conceptDisplayName: 'Bank Address State',
          validationId: 'numbers-rejected',
          testName: 'numbers rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings).toHaveLength(4);

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('| Concept | Field | Check | Why trusted | What was accepted | Why it matters | Recommended product action |');
    expect(md).toContain('Accepted invalid non-state value.');
    expect(md).toContain('Accepted numeric non-state value.');
    expect(md).toContain('State should be constrained to valid state values or reject invalid state-like inputs at the field level.');
    expect(md).toContain('Constrain Registered Legal Address State to valid state values and reject invalid or numeric entries with a field-local validation signal.');
    expect(md).toContain('Constrain Bank Address State to valid state values and reject invalid or numeric entries with a field-local validation signal.');
  });

  test('state product findings do not expose raw attempted values', () => {
    const rawInvalidState = 'NEVER_EXPORT_STATE_TOKEN';
    const rawNumericState = 'NEVER_EXPORT_NUMERIC_TOKEN';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          inputValue: rawInvalidState,
          observedValue: rawInvalidState,
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
        mockFindingsResult({
          concept: 'bank_state',
          conceptDisplayName: 'Bank Address State',
          validationId: 'numbers-rejected',
          testName: 'numbers rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          inputValue: rawNumericState,
          observedValue: rawNumericState,
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    }));

    const json = JSON.stringify(report);
    const md = renderValidationFindingsMarkdown(report);

    expect(json).not.toContain(rawInvalidState);
    expect(json).not.toContain(rawNumericState);
    expect(md).not.toContain(rawInvalidState);
    expect(md).not.toContain(rawNumericState);
  });

  test('mapping_not_confident appears only in mapping-blocked section', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'normal-value-accepted',
          testName: 'normal value accepted',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          mappingDecisionReason: 'rejected_value_shape_mismatch',
        }),
      ],
    }));

    expect(report.mappingBlockedFields).toHaveLength(1);
    expect(report.mappingBlockedFields[0].concept).toBe('bank_name');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.ambiguousHumanReviewFindings).toEqual([]);
  });

  test('Batch 1 mapping_not_confident remains distinct from product_failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'normal-value-accepted',
          testName: 'normal value accepted',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          mappingDecisionReason: 'rejected_value_shape_mismatch',
        }),
        mockFindingsResult({
          concept: 'ownership_percentage',
          conceptDisplayName: 'Ownership Percentage',
          validationId: 'over-100-rejected',
          testName: 'over 100 rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.mappingBlockedFields.map((finding) => finding.concept)).toEqual(['business_name']);
    expect(report.likelyProductValidationFindings.map((finding) => finding.concept)).toEqual(['ownership_percentage']);
  });

  test('mapping-blocked stakeholder concepts do not claim trusted execution in per-concept notes', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_email',
          conceptDisplayName: 'Stakeholder Email',
          validationId: 'concept-mapping',
          testName: 'Stakeholder Email skipped',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          mappingDecisionReason: 'rejected_insufficient_label_proof',
        }),
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'concept-mapping',
          testName: 'Stakeholder Phone skipped',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          mappingDecisionReason: 'rejected_insufficient_label_proof',
        }),
      ],
    }));

    const markdown = renderValidationFindingsMarkdown(report);

    expect(markdown).not.toContain('Stakeholder Email ran through a trusted target');
    expect(markdown).not.toContain('Stakeholder Phone ran through a trusted target');
  });

  test('observer_ambiguous appears only in human-review section', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'date_of_birth',
          conceptDisplayName: 'Date of Birth',
          validationId: 'accepted-date-format-documented',
          testName: 'MM/DD/YYYY format behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings).toHaveLength(1);
    expect(report.ambiguousHumanReviewFindings[0].concept).toBe('date_of_birth');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.mappingBlockedFields).toEqual([]);
  });

  test('bank country invalid-country ambiguity remains non-product unless policy evidence is stronger', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_country',
          conceptDisplayName: 'Bank Address Country',
          validationId: 'invalid-country-rejected',
          testName: 'invalid country rejected or flagged',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'NOT_A_COUNTRY',
          observedValue: 'NOT_A_COUNTRY',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.ambiguousHumanReviewFindings).toHaveLength(1);
    expect(report.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('observer_needs_stronger_text_evidence');

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('### Observer needs stronger text evidence');
    expect(md).toContain('| Bank Address Country | invalid country rejected or flagged |');
    expect(md).not.toContain('Accepted invalid non-state value.');
  });

  test('controlled-choice current/default readable resolves to expected select behavior', () => {
    const rawSelectedValue = 'SECRET_SELECTED_OPTION';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'legal_entity_type',
          conceptDisplayName: 'Legal Entity Type',
          validationId: 'current-option-documented',
          testName: 'current/default value observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          observedValue: null,
          controlKind: 'native-select',
          optionsDiscoverable: true,
          actualValueBeforeTest: rawSelectedValue,
          actualValueAfterBlur: rawSelectedValue,
          actualElementTagName: 'select',
        }),
      ],
    }));

    const finding = report.trustedExecutedObservations[0]!;
    expect(finding.status).toBe('passed');
    expect(finding.outcome).toBe('passed');
    expect(finding.controlledChoiceClassification).toBe('expected_select_behavior');
    expect(report.ambiguousHumanReviewFindings).toEqual([]);

    const markdown = renderValidationFindingsMarkdown(report);
    expect(markdown).toContain('## Controlled-choice observations');
    expect(markdown).toContain('expected_select_behavior');
    expect(JSON.stringify(report)).not.toContain(rawSelectedValue);
    expect(markdown).not.toContain(rawSelectedValue);
  });

  test('controlled-choice free-text impossible is acceptable_behavior_documented', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_account_type',
          conceptDisplayName: 'Bank Account Type',
          validationId: 'invalid-freeform-rejected',
          testName: 'invalid free-text entry rejected or impossible',
          status: 'passed',
          outcome: 'passed',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
          freeTextEntryImpossible: true,
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('acceptable_behavior_documented');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(renderValidationFindingsMarkdown(report)).toContain('### Free-text impossible by design');
  });

  test('controlled-choice options not discoverable is not product_failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'proof_of_business_type',
          conceptDisplayName: 'Proof Of Business Type',
          validationId: 'valid-option-accepted',
          testName: 'valid alternate option selected and retained',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          controlKind: 'combobox',
          optionsDiscoverable: false,
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('options_not_discoverable');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(renderValidationFindingsMarkdown(report)).toContain('### Options not discoverable');
  });

  test('controlled-choice restore failure does not become product_failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'proof_of_address_type',
          conceptDisplayName: 'Proof Of Address Type',
          validationId: 'valid-option-accepted',
          testName: 'valid alternate option selected and retained',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
          restoreSucceeded: false,
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('restore_behavior_documented');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(renderValidationFindingsMarkdown(report)).toContain('### Restore behavior');
  });

  test('controlled-choice cannot safely clear is not product_failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'legal_entity_type',
          conceptDisplayName: 'Legal Entity Type',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed when clearing is supported',
          status: 'skipped',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
          skippedReason: 'cannot safely clear Legal Entity Type; empty required behavior was not exercised',
          evidence: 'cannot safely clear Legal Entity Type; empty required behavior was not exercised',
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('acceptable_behavior_documented');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(renderValidationFindingsMarkdown(report)).toContain('### Clear/empty behavior not supported');
  });

  test('controlled-choice required empty behavior only becomes product_validation_gap_candidate when clearing is possible and accepted without local validation', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'proof_of_bank_account_type',
          conceptDisplayName: 'Proof Of Bank Account Type',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed when clearing is supported',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          observedValue: '',
          controlKind: 'native-select',
          optionsDiscoverable: true,
          inputPrevented: false,
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('product_validation_gap_candidate');
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(renderValidationFindingsMarkdown(report)).toContain('### Possible product validation gaps');
  });

  test('controlled-choice ambiguity appears in controlled-choice findings section', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_type',
          conceptDisplayName: 'Business Type',
          validationId: 'current-option-documented',
          testName: 'current/default value observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          observedValue: null,
          controlKind: 'native-select',
          optionsDiscoverable: true,
          actualValueBeforeTest: null,
          actualValueAfterBlur: null,
          actualElementTagName: 'select',
        }),
      ],
    }));

    expect(report.controlledChoiceFindings[0].controlledChoiceClassification).toBe('observer_needs_better_select_evidence');
    const markdown = renderValidationFindingsMarkdown(report);
    expect(markdown).toContain('## Controlled-choice observations');
    expect(markdown).toContain('observer_needs_better_select_evidence');
  });

  test('controlled-choice findings do not write raw selected values', () => {
    const rawSelectedValue = 'VERY_SECRET_SELECTED_OPTION';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'proof_of_business_type',
          conceptDisplayName: 'Proof Of Business Type',
          validationId: 'current-option-documented',
          testName: 'current/default value observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          observedValue: null,
          controlKind: 'native-select',
          optionsDiscoverable: true,
          actualValueBeforeTest: rawSelectedValue,
          actualValueAfterBlur: rawSelectedValue,
          actualElementTagName: 'select',
        }),
      ],
    }));

    expect(JSON.stringify(report)).not.toContain(rawSelectedValue);
    expect(renderValidationFindingsMarkdown(report)).not.toContain(rawSelectedValue);
  });

  test('ambiguous findings are grouped by ambiguity type', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
          validationId: 'missing-plus-behavior',
          testName: 'missing plus behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          ariaInvalid: 'true',
          docusignValidationText: ['Phone number is invalid.'],
          invalidIndicators: ['field-root:class=has-error'],
        }),
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Long Business Name'.repeat(20),
          observedValue: 'Long Business Name',
          normalizedOrReformatted: true,
        }),
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '',
          observedValue: '',
        }),
      ],
    }));

    expect(report.ambiguityTypeBreakdown.matrix_expectation_mismatch).toBe(0);
    expect(report.ambiguityTypeBreakdown.policy_question).toBe(2);
    expect(report.ambiguityTypeBreakdown.acceptable_behavior_documented).toBe(1);
    expect(report.ambiguityTypeBreakdown.expected_text_leniency).toBe(1);
    expect(report.ambiguityTypeBreakdown.product_validation_gap_candidate).toBe(1);
    expect(report.ambiguousFindingsByType.policy_question.map((finding) => finding.concept)).toEqual(['phone', 'business_name']);

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('### Observer needs stronger text evidence');
    expect(md).toContain('### Policy question');
    expect(md).toContain('### Possible product validation gap');
    expect(md).toContain('### Expected text leniency');
    expect(md).toContain('### Mapping evidence issue');
  });

  test('address findings render dedicated address/location review sections', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_address_line_1',
          conceptDisplayName: 'Registered Legal Address Line 1',
          validationId: 'punctuation-format-handling',
          testName: 'punctuation handling observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Suite #200 / East',
          observedValue: 'Suite #200 / East',
        }),
        mockFindingsResult({
          concept: 'location_name',
          conceptDisplayName: 'Location Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '!@#$%^&*()',
          observedValue: '!@#$%^&*()',
        }),
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'current-option-documented',
          testName: 'current option documented',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
      ],
    }));

    expect(report.ambiguousFindingsByType.expected_text_leniency.map((finding) => finding.concept)).toEqual([
      'registered_address_line_1',
      'location_name',
    ]);

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('## Address / Location Findings');
    expect(md).toContain('### Address/location observations');
    expect(md).toContain('### Expected address/text leniency');
    expect(md).toContain('### Mapping-blocked address fields');
    expect(md).toContain('### Human visual confirmation needed');
    expect(md).toContain('Should registered_state/country be tested if display-only or not surfaced as editable controls?');
    expect(md).toContain('Review a screenshot around Registered Legal Address State');
  });

  test('mapping-blocked address fields include the requested human-confirmation prompts', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_address_line_2',
          conceptDisplayName: 'Registered Legal Address Line 2',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
        mockFindingsResult({
          concept: 'registered_country',
          conceptDisplayName: 'Registered Legal Address Country',
          validationId: 'current-option-documented',
          testName: 'current option documented',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
        mockFindingsResult({
          concept: 'business_mailing_address_line_1',
          conceptDisplayName: 'Business Mailing Address Line 1',
          validationId: 'punctuation-format-handling',
          testName: 'punctuation handling observed',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
        mockFindingsResult({
          concept: 'bank_country',
          conceptDisplayName: 'Bank Address Country',
          validationId: 'current-option-documented',
          testName: 'current option documented',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
      ],
    }));

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('Should registered_address_line_2 be tested, and is it optional?');
    expect(md).toContain('Should registered_state/country be tested if display-only or not surfaced as editable controls?');
    expect(md).toContain('Should business mailing address be tested separately from registered legal address? Should physical operating address empty fields be ignored unless explicitly populated?');
    expect(md).toContain('Should bank address be tested separately from registered address? Are bank state/country editable or display-only?');
  });

  test('offline-calibrated skipped address concepts move to guarded rerun instead of mapping-blocked', () => {
    const input = mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'current-option-documented',
          testName: 'current option documented',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
        mockFindingsResult({
          concept: 'bank_country',
          conceptDisplayName: 'Bank Address Country',
          validationId: 'current-option-documented',
          testName: 'current option documented',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
          skippedReason: 'field is not confidently mapped in the scorecard source report',
        }),
      ],
    });
    input.calibration.rows = [
      {
        concept: 'registered_state',
        conceptDisplayName: 'Registered Legal Address State',
        currentCandidateFieldIndex: 63,
        selectedCandidate: '#63 Registered Legal Address State Address p1 ord42 List shape=empty editable=editable layout=Registered Legal Address > State @ 350.08,544.64',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
      {
        concept: 'bank_country',
        conceptDisplayName: 'Bank Address Country',
        currentCandidateFieldIndex: 68,
        selectedCandidate: '#68 Bank Address Country Banking p1 ord70 List shape=empty editable=editable layout=Bank Address > Country @ 535.68,938.88',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
    ];

    const report = buildValidationFindingsReport(input);

    expect(report.readyForGuardedRerun.map((finding) => finding.concept)).toEqual(['registered_state', 'bank_country']);
    expect(report.mappingBlockedFields).toEqual([]);

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('### Offline-calibrated targets awaiting guarded rerun');
    expect(md).toContain('rerun this guarded case to replace the stale skipped result');
    expect(md).toContain('now trusted by offline calibration and ready for a guarded rerun');
  });

  test('remaining unresolved calibration blockers stay separate from product findings and keep exact proof requests', () => {
    const input = mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    });
    input.calibration.rows = [
      {
        concept: 'registered_state',
        conceptDisplayName: 'Registered Legal Address State',
        currentCandidateFieldIndex: 63,
        selectedCandidate: '#63 Registered Legal Address State Address p1 ord42 List shape=empty editable=editable layout=Registered Legal Address > State @ 350.08,544.64',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
      {
        concept: 'registration_date',
        conceptDisplayName: 'Registration Date',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'date_anchor_mismatch',
        mappingDecisionReason: 'rejected_value_shape_mismatch',
        missingProof: [
          'No unclaimed editable candidate has the expected date live value shape.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'registration_date',
          suspectedFieldLocation: 'General > Registration Date',
          currentBlocker: 'The current mapped candidate has a text_name_like value shape that conflicts with Registration Date.',
          requestedEvidence: 'Review a screenshot of the General section and answer whether Registration Date is the visible editable date input in this flow.',
          decisionImpact: 'If the screenshot confirms the editable date control, the next calibration can trust Registration Date; otherwise keep it out of product-failure counts.',
        },
      },
      {
        concept: 'registered_country',
        conceptDisplayName: 'Registered Legal Address Country',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'no_sample_layout_proof',
        mappingDecisionReason: 'rejected_insufficient_label_proof',
        missingProof: [
          'No sample PDF/MHTML layout evidence currently proves a separate Registered Legal Address Country control in this saved US flow.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'registered_country',
          suspectedFieldLocation: 'Registered Legal Address (Registered Legal Address Country)',
          currentBlocker: 'The saved sample does not currently prove a separate editable Registered Legal Address Country control.',
          requestedEvidence: 'Review a screenshot of the Registered Legal Address section and answer whether Country is exposed as an editable control in this flow, or whether it is omitted or display-only.',
          decisionImpact: 'If the screenshot confirms one visible editable Registered Legal Address Country control, the next calibration can trust it; otherwise keep Registered Legal Address Country mapping-blocked and out of product-failure counts for this flow.',
        },
      },
      {
        concept: 'business_mailing_address_line_1',
        conceptDisplayName: 'Business Mailing Address Line 1',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'physical_address_block_hidden',
        mappingDecisionReason: 'rejected_section_mismatch',
        missingProof: [
          'Sample layout evidence points to Physical Operating Address > Address Line 1.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'business_mailing_address_line_1',
          suspectedFieldLocation: 'Physical Operating Address > Address Line 1',
          currentBlocker: 'The saved sample proves Physical Operating Address > Address Line 1, but the current safe-mode report does not surface that field near the expected anchor.',
          requestedEvidence: 'Review a screenshot of the Physical Operating Address section and answer whether Address Line 1 is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.',
          decisionImpact: 'If the section is visible and Address Line 1 is editable, the next calibration can trust Business Mailing Address Line 1; if the section is hidden or intentionally omitted for this flow, keep Business Mailing Address Line 1 out of product-failure counts and current batch coverage.',
        },
      },
      {
        concept: 'business_mailing_city',
        conceptDisplayName: 'Business Mailing Address City',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'physical_address_block_hidden',
        mappingDecisionReason: 'rejected_section_mismatch',
        missingProof: [
          'Sample layout evidence points to Physical Operating Address > City.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'business_mailing_city',
          suspectedFieldLocation: 'Physical Operating Address > City',
          currentBlocker: 'The saved sample proves Physical Operating Address > City, but the current safe-mode report does not surface that field near the expected anchor.',
          requestedEvidence: 'Review a screenshot of the Physical Operating Address section and answer whether City is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.',
          decisionImpact: 'If the section is visible and City is editable, the next calibration can trust Business Mailing Address City; if the section is hidden or intentionally omitted for this flow, keep Business Mailing Address City out of product-failure counts and current batch coverage.',
        },
      },
      {
        concept: 'business_mailing_state',
        conceptDisplayName: 'Business Mailing Address State',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'physical_address_block_hidden',
        mappingDecisionReason: 'rejected_insufficient_label_proof',
        missingProof: [
          'Sample layout evidence points to Physical Operating Address > State.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'business_mailing_state',
          suspectedFieldLocation: 'Physical Operating Address > State',
          currentBlocker: 'The saved sample proves Physical Operating Address > State, but the current safe-mode report does not surface that field near the expected anchor.',
          requestedEvidence: 'Review a screenshot of the Physical Operating Address section and answer whether State is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.',
          decisionImpact: 'If the section is visible and State is editable, the next calibration can trust Business Mailing Address State; if the section is hidden or intentionally omitted for this flow, keep Business Mailing Address State out of product-failure counts and current batch coverage.',
        },
      },
      {
        concept: 'business_mailing_postal_code',
        conceptDisplayName: 'Business Mailing Address Postal Code',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'physical_address_block_hidden',
        mappingDecisionReason: 'rejected_value_shape_mismatch',
        missingProof: [
          'Sample layout evidence points to Physical Operating Address > ZIP.',
        ],
        humanConfirmation: {
          needed: true,
          concept: 'business_mailing_postal_code',
          suspectedFieldLocation: 'Physical Operating Address > ZIP',
          currentBlocker: 'The saved sample proves Physical Operating Address > ZIP, but the current safe-mode report does not surface that field near the expected anchor.',
          requestedEvidence: 'Review a screenshot of the Physical Operating Address section and answer whether ZIP is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.',
          decisionImpact: 'If the section is visible and ZIP is editable, the next calibration can trust Business Mailing Address Postal Code; if the section is hidden or intentionally omitted for this flow, keep Business Mailing Address Postal Code out of product-failure counts and current batch coverage.',
        },
      },
    ];

    const report = buildValidationFindingsReport(input);

    expect(report.likelyProductValidationFindings.map((finding) => finding.concept)).toEqual(['registered_state']);
    expect(report.remainingCalibrationBlockers.map((blocker) => blocker.concept)).toEqual([
      'registered_country',
      'business_mailing_address_line_1',
      'business_mailing_city',
      'business_mailing_state',
      'business_mailing_postal_code',
    ]);

    const md = renderValidationFindingsMarkdown(report);
    expect(md).toContain('## Remaining Unresolved Calibration Blockers');
    expect(md).toContain('remain unresolved calibration blockers outside this rerun scope and still need human proof; keep them separate from product validation findings.');
    expect(md).toContain('Review a screenshot of the Registered Legal Address section and answer whether Country is exposed as an editable control in this flow, or whether it is omitted or display-only.');
    expect(md).toContain('Review a screenshot of the Physical Operating Address section and answer whether Address Line 1 is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.');
    expect(md).toContain('Review a screenshot of the Physical Operating Address section and answer whether City is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.');
    expect(md).toContain('Review a screenshot of the Physical Operating Address section and answer whether State is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.');
    expect(md).toContain('Review a screenshot of the Physical Operating Address section and answer whether ZIP is currently visible/editable, or whether the section is intentionally hidden because the operating address matches the registered legal address.');
  });

  test('Batch 1 policy resolutions reduce resolved findings out of ambiguity', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'postal_code',
          conceptDisplayName: 'Postal Code',
          validationId: 'letters-behavior',
          testName: 'letters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          ariaInvalid: 'true',
          docusignValidationText: ['Zip code is invalid.'],
          invalidIndicators: ['field-root:class=has-error'],
        }),
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Long Business Name'.repeat(20),
          observedValue: 'Long Business Name',
          normalizedOrReformatted: true,
        }),
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'dba_name',
          conceptDisplayName: 'DBA Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'dba_name',
          conceptDisplayName: 'DBA Name',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Long Business Name'.repeat(20),
          observedValue: 'Long Business Name',
          normalizedOrReformatted: true,
        }),
        mockFindingsResult({
          concept: 'dba_name',
          conceptDisplayName: 'DBA Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'dba_name',
          conceptDisplayName: 'DBA Name',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '',
          observedValue: '',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.concept}:${finding.validationId}`)).toEqual([
      'business_name:very-short-behavior',
      'dba_name:very-short-behavior',
    ]);
    expect(report.runScope.resultCounts).toMatchObject({
      total: 8,
      passed: 4,
      warning: 2,
      manual_review: 2,
      skipped: 0,
    });
    expect(report.runScope.outcomeCounts).toMatchObject({
      passed: 6,
      observer_ambiguous: 2,
    });
    expect(report.likelyProductValidationFindings).toEqual([]);

    const postalLetters = report.trustedExecutedObservations.find((finding) => finding.concept === 'postal_code')!;
    expect(postalLetters.status).toBe('passed');
    expect(postalLetters.outcome).toBe('passed');

    const dbaBlank = report.trustedExecutedObservations.find((finding) => finding.concept === 'dba_name' && finding.validationId === 'empty-required-behavior')!;
    expect(dbaBlank.status).toBe('passed');
    expect(dbaBlank.outcome).toBe('passed');
  });

  test('policy question does not appear as product finding', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('policy_question');
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('product validation gap candidate stays separate from confirmed product failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '',
          observedValue: '',
        }),
        mockFindingsResult({
          concept: 'ownership_percentage',
          conceptDisplayName: 'Ownership Percentage',
          validationId: 'over-100-rejected',
          testName: 'over 100 rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousFindingsByType.product_validation_gap_candidate.map((finding) => finding.concept)).toEqual(['bank_name']);
    expect(report.likelyProductValidationFindings.map((finding) => finding.concept)).toEqual(['ownership_percentage']);
  });

  test('bank name numeric-only behavior stays separate from product findings', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'numeric-only-behavior',
          testName: 'numeric-only behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '123456789',
          observedValue: '123456789',
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.ambiguousHumanReviewFindings).toHaveLength(1);
    expect(report.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('observer_needs_stronger_text_evidence');
  });

  test('findings report includes human-guidance prompt when policy is required', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
          validationId: 'missing-plus-behavior',
          testName: 'missing plus behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings[0].ambiguity?.humanGuidancePrompt)
      .toBe('Should Phone allow domestic phone format without a leading plus, or require explicit E.164 input?');
    expect(renderValidationFindingsMarkdown(report)).toContain('Should Phone allow domestic phone format without a leading plus, or require explicit E.164 input?');
  });

  test('phone missing-plus is policy-sensitive unless field-local copy explicitly requires E.164', () => {
    const withoutE164 = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
          validationId: 'missing-plus-handling',
          testName: 'missing plus sign behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(withoutE164.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('policy_question');

    const withE164 = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'missing-plus-handling',
          testName: 'missing plus sign behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          ariaInvalid: 'true',
          docusignValidationText: ['Invalid phone number format. Must be a valid E.164 format (e.g., +15551234567).'],
          invalidIndicators: ['field-root:class=has-tab-error'],
        }),
      ],
    }));

    expect(withE164.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('matrix_expectation_mismatch');
    expect(withE164.ambiguousHumanReviewFindings[0].ambiguity?.humanGuidancePrompt)
      .toBe('Field-local validation currently requires E.164. Should Stakeholder Phone instead accept or normalize domestic phone format without a leading plus?');
  });

  test('phone too-long with truncation, prevention, or local validation is not a product finding', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'too-long-rejected',
          testName: 'too long behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '+1555123456789012',
          observedValue: '+155512345678',
          normalizedOrReformatted: true,
        }),
      ],
    }));

    const resolved = report.trustedExecutedObservations.find((finding) => finding.concept === 'stakeholder_phone' && finding.validationId === 'too-long-rejected')!;
    expect(resolved.status).toBe('passed');
    expect(resolved.outcome).toBe('passed');
    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('phone too-long accepted without signal becomes a product validation gap candidate', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'too-long-rejected',
          testName: 'too long behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '+1555123456789012',
          observedValue: '+1555123456789012',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('product_validation_gap_candidate');
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('excessive-length address normalization is documented and removed from ambiguity', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_city',
          conceptDisplayName: 'Registered Legal Address City',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Validation Test ' + 'A'.repeat(120),
          observedValue: 'Validation Test ' + 'A'.repeat(16),
          normalizedOrReformatted: true,
        }),
      ],
    }));

    const resolved = report.trustedExecutedObservations.find((finding) => finding.concept === 'registered_city')!;
    expect(resolved.status).toBe('passed');
    expect(resolved.outcome).toBe('passed');
    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('empty optional address line 2 is not treated as a product finding', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_address_line_2',
          conceptDisplayName: 'Registered Legal Address Line 2',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '',
          observedValue: '',
        }),
      ],
    }));

    const resolved = report.trustedExecutedObservations.find((finding) => finding.concept === 'registered_address_line_2')!;
    expect(resolved.status).toBe('passed');
    expect(resolved.outcome).toBe('passed');
    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('address findings do not write raw address values', () => {
    const rawAddress = 'Suite #200 / East';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_address_line_1',
          conceptDisplayName: 'Registered Legal Address Line 1',
          validationId: 'punctuation-format-handling',
          testName: 'punctuation handling observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: rawAddress,
          observedValue: rawAddress,
        }),
      ],
    }));

    expect(JSON.stringify(report)).not.toContain(rawAddress);
    expect(renderValidationFindingsMarkdown(report)).not.toContain(rawAddress);
  });

  test('stakeholder_phone findings do not write raw phone values', () => {
    const rawAttemptedPhone = '+199988877771234';
    const rawObservedPhone = '+1999888777712';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'too-long-rejected',
          testName: 'too long behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: rawAttemptedPhone,
          observedValue: rawObservedPhone,
          normalizedOrReformatted: true,
        }),
      ],
    }));

    expect(JSON.stringify(report)).not.toContain(rawAttemptedPhone);
    expect(JSON.stringify(report)).not.toContain(rawObservedPhone);
    expect(renderValidationFindingsMarkdown(report)).not.toContain(rawAttemptedPhone);
    expect(renderValidationFindingsMarkdown(report)).not.toContain(rawObservedPhone);
  });

  test('stakeholder phone findings remain product 0 when artifacts support lenient or policy-backed outcomes', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'missing-plus-handling',
          testName: 'missing plus sign behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          ariaInvalid: 'true',
          docusignValidationText: ['Invalid phone number format. Must be a valid E.164 format (e.g., +15551234567).'],
          invalidIndicators: ['field-root:class=has-tab-error'],
        }),
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'too-long-rejected',
          testName: 'too long behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '+1555123456789012',
          observedValue: '+155512345678',
          normalizedOrReformatted: true,
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.runScope.resultCounts).toMatchObject({
      total: 2,
      passed: 1,
      manual_review: 1,
    });
    expect(report.perConceptResults.find((concept) => concept.concept === 'stakeholder_phone')!.notes.join(' '))
      .not.toContain('likely product validation finding');
  });

  test('findings report does not write raw attempted or observed values', () => {
    const rawValue = 'SECRET_RAW_VALUE_123';
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: rawValue,
          observedValue: rawValue,
        }),
      ],
    }));

    expect(JSON.stringify(report)).not.toContain(rawValue);
    expect(renderValidationFindingsMarkdown(report)).not.toContain(rawValue);
  });

  test('Bank Name blocked is not classified as product failure', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'empty-required-behavior',
          testName: 'empty required behavior observed',
          status: 'skipped',
          outcome: 'mapping_not_confident',
          targetConfidence: 'mapping_not_confident',
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.mappingBlockedFields).toHaveLength(1);
    expect(report.perConceptResults.find((concept) => concept.concept === 'bank_name')!.notes.join(' '))
      .toContain('not a product validation finding');
  });

  test('Bank Name trusted execution does not keep the blocked-only note', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'bank_name',
          conceptDisplayName: 'Bank Name',
          validationId: 'normal-value-accepted',
          testName: 'normal value accepted',
          status: 'passed',
          outcome: 'passed',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.perConceptResults.find((concept) => concept.concept === 'bank_name')!.notes.join(' '))
      .not.toContain('did not mutate Bank Name');
  });

  test('findings report can generate from a small mock artifact set', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-findings-'));
    try {
      const input = mockFindingsInput({
        results: [
          mockFindingsResult({
            concept: 'website',
            conceptDisplayName: 'Website',
            validationId: 'spaces-rejected',
            testName: 'URL containing spaces rejected',
            status: 'warning',
            outcome: 'product_failure',
            targetConfidence: 'trusted',
          }),
          mockFindingsResult({
            concept: 'bank_name',
            conceptDisplayName: 'Bank Name',
            validationId: 'normal-value-accepted',
            testName: 'normal value accepted',
            status: 'skipped',
            outcome: 'mapping_not_confident',
            targetConfidence: 'mapping_not_confident',
          }),
        ],
      });
      const resultsPath = path.join(outDir, 'results.json');
      const diagnosticsPath = path.join(outDir, 'diagnostics.json');
      const scorecardPath = path.join(outDir, 'scorecard.json');
      const calibrationPath = path.join(outDir, 'calibration.json');
      fs.writeFileSync(resultsPath, JSON.stringify(input.results), 'utf8');
      fs.writeFileSync(diagnosticsPath, JSON.stringify(input.diagnostics), 'utf8');
      fs.writeFileSync(scorecardPath, JSON.stringify(input.scorecard), 'utf8');
      fs.writeFileSync(calibrationPath, JSON.stringify(input.calibration), 'utf8');

      const { jsonPath, mdPath, report } = writeValidationFindingsArtifacts({
        artifactsDir: outDir,
        resultsPath,
        diagnosticsPath,
        scorecardPath,
        calibrationPath,
      });

      const md = fs.readFileSync(mdPath, 'utf8');
      const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { likelyProductValidationFindings: unknown[] };

      expect(report.likelyProductValidationFindings).toHaveLength(1);
      expect(json.likelyProductValidationFindings).toHaveLength(1);
      expect(md).toContain('## Likely Product Validation Findings');
      expect(md).toContain('## Mapping-Blocked Fields');
      expect(md).toContain('Batch 1');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

test.describe('sample input normalization', () => {
  test('normalizes legacy merchantData sample shape', () => {
    const normalized = normalizeSampleApplication({
      id: 'app-1',
      partnerId: 'partner-1',
      status: 'Draft',
      merchantData: {
        registeredName: 'Juniper Home Goods',
      },
      signer: {
        position: 'owner',
      },
    });

    expect(normalized.applicationId).toBe('app-1');
    expect(normalized.partnerId).toBe('partner-1');
    expect(normalized.signerPosition).toBe('owner');
    expect(normalized.merchantData.registeredName).toBe('Juniper Home Goods');
  });

  test('normalizes application-response sample shape', () => {
    const normalized = normalizeSampleApplication({
      id: '69efc4c4282f71a0677471da',
      partnerId: '69d54991387048d86725ef06',
      status: 'Signing',
      agreementApplication: {
        envelopeId: 'faab2807-d326-8c41-80e6-c69272421bb2',
        partnerExternalId: 'ext-202604271618',
        templateId: 'template-1',
        status: 'sent',
        signer: {
          position: 'president',
        },
        merchantOnboardingApplicationDetails: {
          registeredName: 'Mosaic Zieme',
          businessWebsite: 'https://example.test',
        },
      },
    });

    expect(normalized.applicationId).toBe('69efc4c4282f71a0677471da');
    expect(normalized.envelopeId).toBe('faab2807-d326-8c41-80e6-c69272421bb2');
    expect(normalized.partnerExternalId).toBe('ext-202604271618');
    expect(normalized.agreementStatus).toBe('sent');
    expect(normalized.signerPosition).toBe('president');
    expect(normalized.merchantData.businessWebsite).toBe('https://example.test');
  });

  test('marks masked sample values as redacted and non-matchable', () => {
    expect(isRedactedSampleValue('***')).toBe(true);
    expect(isRedactedSampleValue('***-0000')).toBe(true);
    expect(isRedactedSampleValue('m***@example.com')).toBe(true);
    expect(isRedactedSampleValue('https://juniper-home.example')).toBe(false);
  });

  test('source inventory skips rendered variants for redacted values', () => {
    const fields = buildSourceFieldInventory({
      agreementApplication: {
        merchantOnboardingApplicationDetails: {
          businessEmail: 'm***@example.com',
          businessWebsite: 'https://juniper-home.example',
        },
      },
    });

    const email = fields.find((field) => field.keyPath === 'merchantData.businessEmail');
    const website = fields.find((field) => field.keyPath === 'merchantData.businessWebsite');
    expect(email?.redacted).toBe(true);
    expect(website?.redacted).toBe(false);
  });

  test('source inventory applies PDF-confirmed overrides to redacted values', () => {
    const fields = buildSourceFieldInventory(
      {
        agreementApplication: {
          merchantOnboardingApplicationDetails: {
            businessEmail: 'm***@example.com',
          },
        },
      },
      {
        valueOverrides: {
          'merchantData.businessEmail': 'merchant@example.com',
        },
      },
    );

    const email = fields.find((field) => field.keyPath === 'merchantData.businessEmail');
    expect(email?.redacted).toBe(false);
    expect(email?.valueSample).toBe('merchant@example.com');
    expect(email?.valueSource).toBe('pdf_confirmed_mhtml');
  });

  test('sample ingestion review accepts PDF-confirmed overrides for a matched sample set', () => {
    const review = buildSampleIngestionReview({
      inputs: {
        applicationJsonPath: path.resolve('samples/private/app.json'),
        pdfPath: path.resolve('samples/private/app.pdf'),
        mhtmlPath: path.resolve('samples/private/app.mhtml'),
        urlPath: null,
        manifestPath: path.resolve('samples/private/current-sample-manifest.json'),
        resolvedFrom: 'manifest',
      },
      submission: {
        id: '69efc4c4282f71a0677471da',
        partnerId: '69d54991387048d86725ef06',
        status: 'Signing',
        agreementApplication: {
          envelopeId: 'FAAB2807-D326-8C41-80E6-C69272421BB2',
          partnerExternalId: 'castro-test-all-tender-202604271618',
          status: 'sent',
          signer: {
            position: 'owner',
          },
          merchantOnboardingApplicationDetails: {
            registeredName: '***',
            registrationDate: '***-0000',
            businessWebsite: 'https://example.test',
            businessEmail: '***@example.test',
            businessPhone: '***-2480',
            bankName: '***',
            mainPointOfContact: {
              firstName: '***',
              lastName: '***',
              email: '***',
              phoneNumber: '***',
            },
            stakeholders: [
              {
                firstName: '***',
                lastName: '***',
                email: '***',
                phoneNumber: '***',
                dateOfBirth: '***-0000',
                ownershipPercentage: 60,
                jobTitle: 'Managing Member',
              },
            ],
          },
        },
      },
      mhtml: {
        snapshotLocationRedacted: 'https://apps-d.docusign.com/[redacted-path]?[redacted]',
        subject: 'Review and sign documents on Docusign | Docusign',
        pageCount: 4,
        decodedHtmlLength: 1,
        warnings: [],
        countsByType: { Text: 18, Unknown: 2 },
        tabs: [
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 0, value: '69efc4c4282f71a0677471da' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 2, value: '69d54991387048d86725ef06' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 3, value: 'castro-test-all-tender-202604271618' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 4, value: 'Mosaic Zieme Living Inc' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 5, value: '2024/06/18', type: 'Unknown' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 31, value: 'Justine' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 32, value: 'Mueller' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 33, value: 'justine@example.test' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 34, value: '+13049558791' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 55, value: 'https://example.test' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 56, value: 'hello@example.test' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 57, value: '+14029122480' }),
          mockMhtmlTab({ pageIndex: 1, ordinalOnPage: 58, value: 'JPMorgan Chase Bank' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 1, value: 'Test' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 2, value: 'marc.castrechini' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 5, value: '1968/04/28', type: 'Unknown' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 7, value: '60' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 22, value: 'marc@example.test' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 23, value: '+12193662653' }),
          mockMhtmlTab({ pageIndex: 3, ordinalOnPage: 27, value: 'Managing Member' }),
        ],
      },
      pdf: {
        pageCount: 3,
        text: [
          '69efc4c4282f71a0677471da',
          '69d54991387048d86725ef06',
          'castro-test-all-tender-202604271618',
          'Mosaic Zieme Living Inc',
          '2024/06/18',
          'Justine',
          'Mueller',
          'justine@example.test',
          '+13049558791',
          'https://example.test',
          'hello@example.test',
          '+14029122480',
          'JPMorgan Chase Bank',
          'Docusign Envelope ID: FAAB2807-D326-8C41-80E6-C69272421BB2',
          'Test',
          'marc.castrechini',
          '1968/04/28',
          '60',
          'marc@example.test',
          '+12193662653',
          'Managing Member',
        ].join('\n'),
        pages: [
          {
            pageNumber: 1,
            text: [
              '69efc4c4282f71a0677471da',
              '69d54991387048d86725ef06',
              'castro-test-all-tender-202604271618',
              'Mosaic Zieme Living Inc',
              '2024/06/18',
              'Justine',
              'Mueller',
              'justine@example.test',
              '+13049558791',
              'https://example.test',
              'hello@example.test',
              '+14029122480',
              'JPMorgan Chase Bank',
              'Docusign Envelope ID: FAAB2807-D326-8C41-80E6-C69272421BB2',
            ].join('\n'),
          },
          {
            pageNumber: 3,
            text: [
              'Test',
              'marc.castrechini',
              '1968/04/28',
              '60',
              'marc@example.test',
              '+12193662653',
              'Managing Member',
            ].join('\n'),
          },
        ],
      },
    });

    expect(review.review.matchedSet).toBe(true);
    expect(review.review.acceptedOverrideCount).toBeGreaterThanOrEqual(6);
    expect(review.valueOverrides['merchantData.businessEmail']).toBe('hello@example.test');
    expect(review.valueOverrides['merchantData.registrationDate']).toBe('2024/06/18');
    expect(review.valueOverrides['merchantData.stakeholders[0].email']).toBe('marc@example.test');
  });

  test('manifest resolution supports ignored current-sample manifest', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-manifest-'));
    const cwd = process.cwd();
    try {
      process.chdir(tempDir);
      fs.mkdirSync(path.join(tempDir, 'samples', 'private'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, 'samples', 'private', 'current-sample-manifest.json'),
        JSON.stringify({
          applicationJsonPath: 'samples/private/new-app.txt',
          pdfPath: 'samples/private/new.pdf',
          mhtmlPath: 'samples/private/new.mhtml',
          urlPath: 'samples/private/url.txt',
        }),
        'utf8',
      );

      const resolved = resolveSampleInputs({ env: {} as NodeJS.ProcessEnv });
      expect(resolved.resolvedFrom).toBe('manifest');
      expect(path.basename(resolved.applicationJsonPath)).toBe('new-app.txt');
      expect(path.basename(resolved.mhtmlPath)).toBe('new.mhtml');
      expect(path.basename(resolved.pdfPath ?? '')).toBe('new.pdf');
      expect(path.basename(resolved.urlPath ?? '')).toBe('url.txt');
    } finally {
      process.chdir(cwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

test.describe('interactive validation safety', () => {
  test('detects email value shape', () => {
    expect(detectValueShape('qa.signer@example.com')).toBe('email');
  });

  test('detects phone value shape', () => {
    expect(detectValueShape('+15551234567')).toBe('phone');
  });

  test('detects URL value shape', () => {
    expect(detectValueShape('https://example.com')).toBe('url');
  });

  test('detects redacted URL value shape', () => {
    expect(detectValueShape('[redacted-url]')).toBe('url');
  });

  test('detects date value shape', () => {
    expect(detectValueShape('1990/01/15')).toBe('date');
  });

  test('detects bank-name/text value shape', () => {
    expect(detectValueShape('Wells Fargo Bank')).toBe('text_name_like');
  });

  test('detects formatted numeric value shape', () => {
    expect(detectValueShape('1,815.00')).toBe('numeric');
  });

  test('interactive guard refuses to run without INTERACTIVE_VALIDATION=1', () => {
    expect(() => assertInteractiveValidationGuards({ DISPOSABLE_ENVELOPE: '1' } as NodeJS.ProcessEnv))
      .toThrow(/INTERACTIVE_VALIDATION=1/);
  });

  test('disposable guard refuses to run without DISPOSABLE_ENVELOPE=1', () => {
    expect(() => assertInteractiveValidationGuards({ INTERACTIVE_VALIDATION: '1' } as NodeJS.ProcessEnv))
      .toThrow(/DISPOSABLE_ENVELOPE=1/);
  });

  test('unmapped target concepts are skipped, not failed', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([]));
    const skippedResults = plan.skippedConcepts.map(skippedConceptToResult);

    expect(plan.cases).toHaveLength(0);
    expect(plan.skippedConcepts.length).toBeGreaterThan(0);
    expect(skippedResults.every((result) => result.status === 'skipped')).toBe(true);
    expect(skippedResults.some((result) => result.status === 'failed')).toBe(false);
  });

  test('interactive spec does not contain finalizing action labels', () => {
    const specPath = path.join(__dirname, 'signer-interactive-validation.spec.ts');
    const source = fs.readFileSync(specPath, 'utf8');

    expect(source).not.toMatch(/\b(Finish|Complete|Sign|Adopt|Submit)\b/);
  });

  test('observer filters generic DocuSign attachment noise from wrapper text', () => {
    const diagnostics = extractFieldLocalValidationDiagnostics([
      {
        source: 'same-tab-wrapper',
        text: 'Required | AttachmentRequired | Attachment | SignerAttachmentOptional',
        associatedWithSameElement: true,
        associatedWithSameTabGuid: true,
      },
    ], {
      ariaInvalid: 'false',
      inputValue: 'Test Business LLC',
      observedValue: 'Test Business LLC',
    });

    expect(diagnostics.fieldLocalTexts).toEqual([]);
    expect(diagnostics.ignoredTexts).toEqual(expect.arrayContaining([
      'Required',
      'AttachmentRequired',
      'Attachment',
      'SignerAttachmentOptional',
    ]));
  });

  test('observer keeps field-local validation text while dropping generic chrome noise', () => {
    const diagnostics = extractFieldLocalValidationDiagnostics([
      {
        source: 'same-tab-wrapper',
        text: 'Merchant Category Code must be exactly 4 digits | Required | AttachmentRequired | Attachment | SignerAttachmentOptional',
        associatedWithSameElement: true,
        associatedWithSameTabGuid: true,
      },
    ], {
      concept: 'merchant_category_code',
      ariaInvalid: 'true',
      inputValue: 'ABCD',
      observedValue: 'ABCD',
    });

    expect(diagnostics.fieldLocalTexts).toContain('Merchant Category Code must be exactly 4 digits');
    expect(diagnostics.docusignLocalTexts).toContain('Merchant Category Code must be exactly 4 digits');
    expect(diagnostics.fieldLocalTexts).not.toContain('AttachmentRequired');
  });

  test('observer marks cross-type evidence as ownership suspect', () => {
    const diagnostics = extractFieldLocalValidationDiagnostics([
      {
        source: 'same-tab-wrapper',
        text: 'Field must be an email.',
        associatedWithSameElement: true,
        associatedWithSameTabGuid: true,
      },
    ], {
      concept: 'phone',
      ariaInvalid: 'true',
      inputValue: '+15551234567',
      observedValue: '+15551234567',
    });

    expect(diagnostics.fieldLocalTexts).toEqual([]);
    expect(diagnostics.ownershipSuspectTexts).toContain('Field must be an email.');
  });

  test('value shape mismatch blocks trust', () => {
    const result = selectBestMappingCandidate({
      concept: 'bank_name',
      currentCandidateId: 'bank-field',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.bankName',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 58,
        tabLeft: 35.2,
        tabTop: 874.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'bank-field',
        resolvedLabel: 'Bank Name',
        labelSource: 'enrichment-position',
        labelConfidence: 'medium',
        businessSection: 'Banking',
        inferredType: 'unknown_manual_review',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 58,
        tabLeft: 35.2,
        tabTop: 874.88,
        currentValue: '+15154407899',
        enrichment: {
          jsonKeyPath: 'merchantData.bankName',
          matchedBy: 'position',
          suggestedDisplayName: 'Bank Name',
          suggestedBusinessSection: 'Banking',
        },
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_value_shape_mismatch');
  });

  test('Date of Birth can be promoted only with date tab, date value, and stakeholder context', () => {
    const promoted = selectBestMappingCandidate({
      concept: 'date_of_birth',
      currentCandidateId: 'dob',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].dateOfBirth',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 5,
        tabLeft: 128.64,
        tabTop: 154.88,
        docusignFieldFamily: 'Date',
      },
      candidates: [{
        id: 'dob',
        resolvedLabel: 'stakeholders #0 › Date Of Birth',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        businessSection: 'Stakeholder',
        inferredType: 'date',
        docusignTabType: 'Date',
        pageIndex: 3,
        ordinalOnPage: 6,
        tabLeft: 128.64,
        tabTop: 154.88,
        currentValue: '1969/01/30',
        enrichment: {
          jsonKeyPath: 'merchantData.stakeholders[0].dateOfBirth',
          matchedBy: 'coordinate',
          suggestedDisplayName: 'Date Of Birth',
          suggestedBusinessSection: 'Stakeholder',
        },
      }],
    });

    const rejected = selectBestMappingCandidate({
      concept: 'date_of_birth',
      currentCandidateId: 'dob',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].dateOfBirth',
        businessSection: 'Stakeholder',
      },
      candidates: [{
        id: 'dob',
        resolvedLabel: 'Date Of Birth',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        businessSection: 'Business Details',
        inferredType: 'date',
        docusignTabType: 'Text',
        currentValue: 'not-a-date',
      }],
    });

    expect(promoted.trusted).toBe(true);
    expect(promoted.decisionReason).toBe('trusted_by_date_tab_and_value_shape');
    expect(rejected.trusted).toBe(false);
  });

  test('shifted page-1 candidate is retargeted when neighboring anchor has better value shape', () => {
    const result = selectBestMappingCandidate({
      concept: 'email',
      currentCandidateId: 'current',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessEmail',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 410.88,
        tabTop: 766.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'current',
          resolvedLabel: 'Business Email',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          businessSection: 'Contact',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 35.2,
          tabTop: 766.08,
          currentValue: 'https://example.com',
          enrichment: {
            jsonKeyPath: 'merchantData.businessEmail',
            matchedBy: 'position',
            suggestedDisplayName: 'Business Email',
            suggestedBusinessSection: 'Contact',
          },
        },
        {
          id: 'neighbor',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Contact',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 57,
          tabLeft: 410.88,
          tabTop: 766.08,
          currentValue: 'hello@example.com',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('neighbor');
    expect(result.decisionReason).toBe('trusted_by_anchor_and_value_shape');
    expect(result.shiftReason).toBe('shifted_contact_block_candidate');
  });

  test('Website URL-shaped candidate anchors the page-1 contact block', () => {
    const result = selectBestMappingCandidate({
      concept: 'website',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessWebsite',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 55,
        tabLeft: 35.2,
        tabTop: 766.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '21',
          resolvedLabel: 'Business Email',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 599.04,
          tabTop: 712.32,
          currentValue: 'Cedar Landscaping Charlotte',
        },
        {
          id: '22',
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 57,
          tabLeft: 35.2,
          tabTop: 766.08,
          currentValue: 'https://example.com',
        },
        {
          id: '23',
          resolvedLabel: 'Bank Name',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 410.88,
          tabTop: 766.08,
          currentValue: 'hello@example.com',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('22');
  });

  test('Email rejects URL-shaped candidate and prefers email-shaped neighbor', () => {
    const result = selectBestMappingCandidate({
      concept: 'email',
      currentCandidateId: '22',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessEmail',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 410.88,
        tabTop: 766.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '22',
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 57,
          tabLeft: 35.2,
          tabTop: 766.08,
          currentValue: 'https://example.com',
        },
        {
          id: '23',
          resolvedLabel: 'Bank Name',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 410.88,
          tabTop: 766.08,
          currentValue: 'hello@example.com',
        },
        {
          id: '24',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
          tabLeft: 663.04,
          tabTop: 766.08,
          currentValue: '+15551234567',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('23');
  });

  test('Phone rejects email-shaped candidate and prefers phone-shaped neighbor', () => {
    const result = selectBestMappingCandidate({
      concept: 'phone',
      currentCandidateId: '23',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessPhone',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 57,
        tabLeft: 663.04,
        tabTop: 766.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '23',
          resolvedLabel: 'Bank Name',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 410.88,
          tabTop: 766.08,
          currentValue: 'hello@example.com',
        },
        {
          id: '24',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
          tabLeft: 663.04,
          tabTop: 766.08,
          currentValue: '+15551234567',
        },
        {
          id: '29',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 60,
          tabLeft: 35.2,
          tabTop: 874.88,
          currentValue: 'Bank of Example',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('24');
  });

  test('Stakeholder Email prefers stakeholder anchors over business contact fields', () => {
    const result = selectBestMappingCandidate({
      concept: 'stakeholder_email',
      currentCandidateId: 'business-email',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].email',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 22,
        tabLeft: 35.2,
        tabTop: 280.32,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'business-email',
          resolvedLabel: 'Business Email',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Contact',
          inferredType: 'email',
          docusignTabType: 'Email',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 410.88,
          tabTop: 766.08,
          currentValue: 'merchant@example.com',
          enrichment: {
            jsonKeyPath: 'merchantData.businessEmail',
            matchedBy: 'guid',
            confidence: 'high',
            suggestedDisplayName: 'Business Email',
            suggestedBusinessSection: 'Contact',
          },
        },
        {
          id: 'stakeholder-email',
          resolvedLabel: 'stakeholders #0 › Email',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Stakeholder',
          inferredType: 'email',
          docusignTabType: 'Email',
          pageIndex: 3,
          ordinalOnPage: 22,
          tabLeft: 35.2,
          tabTop: 280.32,
          currentValue: 'owner@example.com',
          enrichment: {
            jsonKeyPath: 'merchantData.stakeholders[0].email',
            matchedBy: 'guid',
            confidence: 'high',
            suggestedDisplayName: 'stakeholders #0 › Email',
            suggestedBusinessSection: 'Stakeholder',
          },
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('stakeholder-email');
  });

  test('Stakeholder Phone does not trust a business-contact-only candidate', () => {
    const result = selectBestMappingCandidate({
      concept: 'stakeholder_phone',
      currentCandidateId: 'business-phone',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].phoneNumber',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 23,
        tabLeft: 410.88,
        tabTop: 279.04,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'business-phone',
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Contact',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 57,
          tabLeft: 663.04,
          tabTop: 766.08,
          currentValue: '+15551234567',
          enrichment: {
            jsonKeyPath: 'merchantData.businessPhone',
            matchedBy: 'guid',
            confidence: 'high',
            suggestedDisplayName: 'Business Phone',
            suggestedBusinessSection: 'Contact',
          },
        },
      ],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_section_mismatch');
  });

  test('Bank Name rejects phone-shaped candidate and prefers nearby text/name-like banking candidate', () => {
    const result = selectBestMappingCandidate({
      concept: 'bank_name',
      currentCandidateId: '24',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.bankName',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 58,
        tabLeft: 35.2,
        tabTop: 874.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '24',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
          tabLeft: 663.04,
          tabTop: 766.08,
          currentValue: '+15551234567',
        },
        {
          id: '29',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 60,
          tabLeft: 35.2,
          tabTop: 874.88,
          currentValue: 'Bank of Example',
        },
        {
          id: '30',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 61,
          tabLeft: 284.16,
          tabTop: 874.88,
          currentValue: '026009593',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('29');
  });

  test('Bank Name does not confuse a nearby deposit-method dropdown with the bank-name text field', () => {
    const result = selectBestMappingCandidate({
      concept: 'bank_name',
      currentCandidateId: '65',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.bankName',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 58,
        tabLeft: 35.2,
        tabTop: 874.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '65',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
          currentValue: 'manual',
        },
        {
          id: '29',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 61,
          tabLeft: 35.2,
          tabTop: 874.88,
          currentValue: 'Bank of Example',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('29');
  });

  test('Bank Name rejects URL, email, phone, date, and numeric-shaped current targets', () => {
    const conflictingValues = [
      'https://example.test',
      'hello@example.test',
      '+15551234567',
      '1990/01/15',
      '1,815.00',
    ];

    for (const currentValue of conflictingValues) {
      const result = selectBestMappingCandidate({
        concept: 'bank_name',
        currentCandidateId: '29',
        expectedAnchor: {
          jsonKeyPath: 'merchantData.bankName',
          businessSection: 'Banking',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 35.2,
          tabTop: 874.88,
          docusignFieldFamily: 'Text',
        },
        candidates: [
          {
            id: '29',
            resolvedLabel: null,
            labelSource: 'none',
            labelConfidence: 'none',
            businessSection: 'Banking',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 60,
            tabLeft: 35.2,
            tabTop: 874.88,
            currentValue,
          },
          {
            id: '30',
            resolvedLabel: null,
            labelSource: 'none',
            labelConfidence: 'none',
            businessSection: 'Banking',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 61,
            tabLeft: 284.16,
            tabTop: 874.88,
            currentValue: 'Bank of Example',
          },
        ],
      });

      expect(result.trusted).toBe(false);
      expect(result.decisionReason).toBe('rejected_value_shape_mismatch');
    }
  });

  test('Bank Name diagnostic explains missing proof when current target is formatted numeric', () => {
    const result = selectBestMappingCandidate({
      concept: 'bank_name',
      currentCandidateId: '29',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.bankName',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 58,
        tabLeft: 35.2,
        tabTop: 874.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '29',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 60,
          tabLeft: 35.2,
          tabTop: 874.88,
          currentValue: '1,815.00',
        },
        {
          id: '30',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          businessSection: 'Banking',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 61,
          tabLeft: 284.16,
          tabTop: 874.88,
          currentValue: 'Bank of Example',
        },
      ],
    });

    expect(result.trusted).toBe(false);
    expect(result.valueShape).toBe('numeric');
    expect(result.explanation).toContain('numeric value shape');
    expect(result.explanation).toContain('no unclaimed exact-anchor candidate');
  });

  test('Bank Name is rejected when its candidate is claimed by a stronger concept', () => {
    const results = resolveMappingClaims([
      {
        concept: 'business_name',
        currentCandidateId: null,
        expectedAnchor: {
          jsonKeyPath: 'merchantData.registeredName',
          businessSection: 'Business Details',
          pageIndex: 1,
          ordinalOnPage: 54,
          tabLeft: 35.2,
          tabTop: 712.32,
          docusignFieldFamily: 'Text',
        },
        candidates: [
          {
            id: 'shared',
            resolvedLabel: 'Registered Name',
            labelSource: 'aria-label',
            labelConfidence: 'high',
            businessSection: 'Business Details',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 54,
            tabLeft: 35.2,
            tabTop: 712.32,
            currentValue: 'Example Business LLC',
          },
        ],
      },
      {
        concept: 'bank_name',
        currentCandidateId: null,
        expectedAnchor: {
          jsonKeyPath: 'merchantData.bankName',
          businessSection: 'Banking',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 35.2,
          tabTop: 712.32,
          docusignFieldFamily: 'Text',
        },
        candidates: [
          {
            id: 'shared',
            resolvedLabel: 'Registered Name',
            labelSource: 'aria-label',
            labelConfidence: 'high',
            businessSection: 'Business Details',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 54,
            tabLeft: 35.2,
            tabTop: 712.32,
            currentValue: 'Example Business LLC',
          },
        ],
      },
    ]);

    const businessName = results.find((result) => result.concept === 'business_name')!;
    const bankName = results.find((result) => result.concept === 'bank_name')!;

    expect(businessName.selection.trusted).toBe(true);
    expect(bankName.blockedCandidateIds).toContain('shared');
    expect(bankName.selection.trusted).toBe(false);
  });

  test('Retargeting does not let two concepts claim the same candidate', () => {
    const results = resolveMappingClaims([
      {
        concept: 'business_name',
        currentCandidateId: null,
        expectedAnchor: {
          jsonKeyPath: 'merchantData.registeredName',
          businessSection: 'Business Details',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 35.2,
          tabTop: 874.88,
          docusignFieldFamily: 'Text',
        },
        candidates: [
          {
            id: 'shared',
            resolvedLabel: 'Bank Name',
            labelSource: 'enrichment-position',
            labelConfidence: 'medium',
            businessSection: 'Banking',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 60,
            tabLeft: 35.2,
            tabTop: 874.88,
            currentValue: 'Bank of Example',
          },
        ],
      },
      {
        concept: 'bank_name',
        currentCandidateId: null,
        expectedAnchor: {
          jsonKeyPath: 'merchantData.bankName',
          businessSection: 'Banking',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 35.2,
          tabTop: 874.88,
          docusignFieldFamily: 'Text',
        },
        candidates: [
          {
            id: 'shared',
            resolvedLabel: 'Bank Name',
            labelSource: 'enrichment-position',
            labelConfidence: 'medium',
            businessSection: 'Banking',
            docusignTabType: 'Text',
            pageIndex: 1,
            ordinalOnPage: 60,
            tabLeft: 35.2,
            tabTop: 874.88,
            currentValue: 'Bank of Example',
          },
        ],
      },
    ]);

    const businessName = results.find((result) => result.concept === 'business_name')!;
    const bankName = results.find((result) => result.concept === 'bank_name')!;

    expect(bankName.selection.trusted).toBe(true);
    expect(bankName.selection.selectedCandidateId).toBe('shared');
    expect(businessName.blockedCandidateIds).toContain('shared');
    expect(businessName.selection.trusted).toBe(false);
  });

  test('Ambiguous neighbor window remains downgraded', () => {
    const result = selectBestMappingCandidate({
      concept: 'website',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessWebsite',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 55,
        tabLeft: 35.2,
        tabTop: 766.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: '22',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 57,
          tabLeft: 25.2,
          tabTop: 766.08,
          currentValue: 'https://alpha.example.com',
        },
        {
          id: '23',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 58,
          tabLeft: 45.2,
          tabTop: 766.08,
          currentValue: 'https://beta.example.com',
        },
      ],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_ambiguous_neighbors');
  });

  test('Batch 1 concepts are recognized by INTERACTIVE_CONCEPTS', () => {
    const batchOne = [
      'registration_date',
      'ownership_percentage',
      'postal_code',
      'business_name',
      'dba_name',
      'business_description',
    ] as const;

    expect(INTERACTIVE_TARGET_CONCEPTS).toEqual(expect.arrayContaining([...batchOne]));
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: batchOne.join(','),
    } as NodeJS.ProcessEnv)).toEqual([...batchOne]);
  });

  test('processing and code concepts are recognized by INTERACTIVE_CONCEPTS aliases', () => {
    const processingBatch = [
      'naics',
      'merchant_category_code',
      'annual_revenue',
      'highest_monthly_volume',
      'average_ticket',
      'max_ticket',
    ] as const;

    expect(INTERACTIVE_TARGET_CONCEPTS).toEqual(expect.arrayContaining([...processingBatch]));
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'naics,merchant_category_code,gross_annual_revenue,highest_monthly_volume,average_ticket_size,maximum_ticket_size',
    } as NodeJS.ProcessEnv)).toEqual([
      'naics',
      'merchant_category_code',
      'annual_revenue',
      'highest_monthly_volume',
      'average_ticket',
      'max_ticket',
    ]);
  });

  test('descriptive concept aliases are recognized by INTERACTIVE_CONCEPTS aliases', () => {
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'legal_name,registered_name,dba_name,description_of_services,bank_name',
    } as NodeJS.ProcessEnv)).toEqual([
      'business_name',
      'dba_name',
      'business_description',
      'bank_name',
    ]);
  });

  test('profile concept aliases are recognized by INTERACTIVE_CONCEPTS aliases', () => {
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'contact_first_name,main_point_of_contact_last_name,stakeholder_first_name,stakeholder_last_name,stakeholder_title',
    } as NodeJS.ProcessEnv)).toEqual([
      'contact_first_name',
      'contact_last_name',
      'stakeholder_first_name',
      'stakeholder_last_name',
      'stakeholder_job_title',
    ]);
  });

  test('address batch concepts are recognized by INTERACTIVE_CONCEPTS', () => {
    const addressBatch = [
      'location_name',
      'registered_address_line_1',
      'registered_address_line_2',
      'registered_city',
      'registered_state',
      'registered_country',
      'business_mailing_address_line_1',
      'business_mailing_city',
      'business_mailing_state',
      'business_mailing_postal_code',
      'bank_address_line_1',
      'bank_city',
      'bank_state',
      'bank_postal_code',
      'bank_country',
    ] as const;

    expect(INTERACTIVE_TARGET_CONCEPTS).toEqual(expect.arrayContaining([...addressBatch]));
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: addressBatch.join(','),
    } as NodeJS.ProcessEnv)).toEqual([...addressBatch]);
  });

  test('select/dropdown concepts are recognized by INTERACTIVE_CONCEPTS', () => {
    expect(INTERACTIVE_TARGET_CONCEPTS).toEqual(expect.arrayContaining([
      'legal_entity_type',
      'business_type',
      'bank_account_type',
      'federal_tax_id_type',
      'proof_of_business_type',
      'proof_of_address_type',
      'proof_of_bank_account_type',
    ]));

    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'legal_entity_type,account_type,business_type,federal_tax_id_type,proof_of_business_type,proof_of_address_type,proof_of_bank_account_type,location_business_type',
    } as NodeJS.ProcessEnv)).toEqual([
      'legal_entity_type',
      'bank_account_type',
      'business_type',
      'federal_tax_id_type',
      'proof_of_business_type',
      'proof_of_address_type',
      'proof_of_bank_account_type',
    ]);
  });

  test('Batch 1 concepts build the expected interactive matrix', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Registration Date',
        label: 'Registration Date',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'formation_date',
      }),
      mockField({
        index: 2,
        resolvedLabel: 'Ownership Percentage',
        label: 'Ownership Percentage',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'ownership_percent',
      }),
      mockField({
        index: 3,
        resolvedLabel: 'Postal Code',
        label: 'Postal Code',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'zip_postal_code',
      }),
      mockField({
        index: 4,
        resolvedLabel: 'Business Name',
        label: 'Business Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'business_name',
      }),
      mockField({
        index: 5,
        resolvedLabel: 'DBA Name',
        label: 'DBA Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'dba_name',
      }),
      mockField({
        index: 6,
        resolvedLabel: 'Business Description',
        label: 'Business Description',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'business_description',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'registration_date,ownership_percentage,postal_code,business_name,dba_name,business_description',
    } as NodeJS.ProcessEnv);

    const casesByConcept = new Map<string, string[]>();
    for (const entry of plan.cases) {
      casesByConcept.set(entry.concept, [...(casesByConcept.get(entry.concept) ?? []), entry.validationId]);
    }

    expect(plan.skippedConcepts).toEqual([]);
    expect(casesByConcept.get('registration_date')).toEqual([
      'valid-date-accepted',
      'accepted-date-format-documented',
      'letters-rejected',
      'impossible-date-rejected',
      'future-date-behavior',
    ]);
    expect(casesByConcept.get('ownership_percentage')).toEqual([
      'valid-percent-accepted',
      'over-100-rejected',
      'negative-rejected',
      'letters-rejected',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('postal_code')).toEqual([
      'valid-postal-code-accepted',
      'too-short-rejected',
      'letters-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('business_name')).toEqual([
      'normal-value-accepted',
      'very-short-behavior',
      'excessive-length-behavior',
      'special-characters-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('dba_name')).toEqual([
      'normal-value-accepted',
      'very-short-behavior',
      'excessive-length-behavior',
      'special-characters-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('business_description')).toEqual([
      'normal-text-accepted',
      'very-short-behavior',
      'excessive-length-behavior',
      'garbage-text-rejected-or-flagged',
      'empty-required-behavior',
    ]);
  });

  test('bank name builds the expected interactive matrix', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Bank Name',
        label: 'Bank Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'bank_name',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'bank_name',
    } as NodeJS.ProcessEnv);

    expect(plan.skippedConcepts).toEqual([]);
    expect(plan.cases.map((entry) => entry.validationId)).toEqual([
      'normal-value-accepted',
      'very-short-behavior',
      'numeric-only-behavior',
      'excessive-length-behavior',
      'special-characters-behavior',
      'empty-required-behavior',
    ]);
  });

  test('profile name and title concepts build the expected interactive matrix', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        section: 'Contact',
        resolvedLabel: 'Point Of Contact First Name',
        label: 'Point Of Contact First Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'signer_first_name',
      }),
      mockField({
        index: 2,
        section: 'Contact',
        resolvedLabel: 'Point Of Contact Last Name',
        label: 'Point Of Contact Last Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'signer_last_name',
      }),
      mockField({
        index: 3,
        section: 'Stakeholder',
        resolvedLabel: 'Stakeholder First Name',
        label: 'Stakeholder First Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'signer_first_name',
      }),
      mockField({
        index: 4,
        section: 'Stakeholder',
        resolvedLabel: 'Stakeholder Last Name',
        label: 'Stakeholder Last Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'signer_last_name',
      }),
      mockField({
        index: 5,
        section: 'Stakeholder',
        resolvedLabel: 'Stakeholder Job Title',
        label: 'Stakeholder Job Title',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'free_text',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'contact_first_name,contact_last_name,stakeholder_first_name,stakeholder_last_name,stakeholder_job_title',
    } as NodeJS.ProcessEnv);

    const casesByConcept = new Map<string, string[]>();
    for (const entry of plan.cases) {
      casesByConcept.set(entry.concept, [...(casesByConcept.get(entry.concept) ?? []), entry.validationId]);
    }

    expect(plan.skippedConcepts).toEqual([]);
    for (const concept of [
      'contact_first_name',
      'contact_last_name',
      'stakeholder_first_name',
      'stakeholder_last_name',
      'stakeholder_job_title',
    ] as const) {
      expect(casesByConcept.get(concept)).toEqual([
        'normal-value-accepted',
        'very-short-behavior',
        'excessive-length-behavior',
        'special-characters-behavior',
        'empty-required-behavior',
      ]);
    }
  });

  test('processing and code concepts build the expected interactive matrix', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'NAICS',
        label: 'NAICS',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'naics',
      }),
      mockField({
        index: 2,
        resolvedLabel: 'Merchant Category Code',
        label: 'Merchant Category Code',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'mcc',
      }),
      mockField({
        index: 3,
        resolvedLabel: 'Annual Revenue',
        label: 'Annual Revenue',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'annual_revenue',
      }),
      mockField({
        index: 4,
        resolvedLabel: 'Highest Monthly Volume',
        label: 'Highest Monthly Volume',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'monthly_volume',
      }),
      mockField({
        index: 5,
        resolvedLabel: 'Average Ticket',
        label: 'Average Ticket',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'average_ticket',
      }),
      mockField({
        index: 6,
        resolvedLabel: 'Max Ticket',
        label: 'Max Ticket',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'max_ticket',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'naics,merchant_category_code,annual_revenue,highest_monthly_volume,average_ticket,max_ticket',
    } as NodeJS.ProcessEnv);

    const casesByConcept = new Map<string, string[]>();
    for (const entry of plan.cases) {
      casesByConcept.set(entry.concept, [...(casesByConcept.get(entry.concept) ?? []), entry.validationId]);
    }

    expect(plan.skippedConcepts).toEqual([]);
    expect(casesByConcept.get('naics')).toEqual([
      'valid-code-accepted',
      'letters-rejected',
      'too-short-rejected',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('merchant_category_code')).toEqual([
      'valid-code-accepted',
      'letters-rejected',
      'too-short-rejected',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('annual_revenue')).toEqual([
      'valid-amount-accepted',
      'letters-rejected',
      'negative-value-behavior',
      'excessive-value-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('highest_monthly_volume')).toEqual([
      'valid-amount-accepted',
      'letters-rejected',
      'negative-value-behavior',
      'excessive-value-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('average_ticket')).toEqual([
      'valid-amount-accepted',
      'letters-rejected',
      'negative-value-behavior',
      'excessive-value-behavior',
      'empty-required-behavior',
    ]);
    expect(casesByConcept.get('max_ticket')).toEqual([
      'valid-amount-accepted',
      'letters-rejected',
      'negative-value-behavior',
      'excessive-value-behavior',
      'empty-required-behavior',
    ]);
  });

  test('invalid interactive concept names are rejected', () => {
    expect(() => resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'registration_date,not_a_real_concept',
    } as NodeJS.ProcessEnv)).toThrow(/Invalid INTERACTIVE_CONCEPTS value/);
  });

  test('Batch 1 mappings are not trusted when value shape is contradictory', () => {
    const contradictions = [
      { concept: 'registration_date', label: 'Registration Date', section: 'Business Details', value: 'qa.signer@example.com' },
      { concept: 'ownership_percentage', label: 'Ownership Percentage', section: 'Stakeholder', value: 'Example Business LLC' },
      { concept: 'postal_code', label: 'Postal Code', section: 'Address', value: 'https://example.test' },
      { concept: 'business_name', label: 'Business Name', section: 'Business Details', value: '+15551234567' },
      { concept: 'dba_name', label: 'DBA Name', section: 'Business Details', value: '2024/06/18' },
      { concept: 'business_description', label: 'Business Description', section: 'Business Details', value: '12345' },
    ] as const;

    for (const item of contradictions) {
      expect(expectedValueShapesForConcept(item.concept).length).toBeGreaterThan(0);
      const result = selectBestMappingCandidate({
        concept: item.concept,
        currentCandidateId: 'candidate',
        expectedAnchor: {
          displayName: item.label,
          businessSection: item.section,
          pageIndex: 1,
          ordinalOnPage: 1,
          tabLeft: 10,
          tabTop: 10,
          docusignFieldFamily: 'Text',
        },
        candidates: [{
          id: 'candidate',
          resolvedLabel: item.label,
          labelSource: 'aria-label',
          labelConfidence: 'high',
          businessSection: item.section,
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 1,
          tabLeft: 10,
          tabTop: 10,
          currentValue: item.value,
        }],
      });

      expect(result.trusted).toBe(false);
      expect(result.decisionReason).toBe('rejected_value_shape_mismatch');
    }
  });

  test('processing and code mappings are not trusted when value shape is contradictory', () => {
    const contradictions = [
      { concept: 'naics', label: 'NAICS', section: 'Business Details', value: 'Example Business LLC' },
      { concept: 'merchant_category_code', label: 'Merchant Category Code', section: 'Business Details', value: 'merchant@example.test' },
      { concept: 'annual_revenue', label: 'Annual Revenue', section: 'Processing & Financials', value: 'merchant@example.test' },
      { concept: 'highest_monthly_volume', label: 'Highest Monthly Volume', section: 'Processing & Financials', value: 'https://example.test' },
      { concept: 'average_ticket', label: 'Average Ticket', section: 'Processing & Financials', value: 'Bank of Example' },
      { concept: 'max_ticket', label: 'Max Ticket', section: 'Processing & Financials', value: '+15551234567' },
    ] as const;

    for (const item of contradictions) {
      expect(expectedValueShapesForConcept(item.concept).length).toBeGreaterThan(0);
      const result = selectBestMappingCandidate({
        concept: item.concept,
        currentCandidateId: 'candidate',
        expectedAnchor: {
          displayName: item.label,
          businessSection: item.section,
          pageIndex: 1,
          ordinalOnPage: 1,
          tabLeft: 10,
          tabTop: 10,
          docusignFieldFamily: 'Text',
        },
        candidates: [{
          id: 'candidate',
          resolvedLabel: item.label,
          labelSource: 'aria-label',
          labelConfidence: 'high',
          businessSection: item.section,
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 1,
          tabLeft: 10,
          tabTop: 10,
          currentValue: item.value,
        }],
      });

      expect(result.trusted).toBe(false);
      expect(result.decisionReason).toBe('rejected_value_shape_mismatch');
    }
  });

  test('Merchant Category Code exact-anchor numeric candidate can be trusted', () => {
    const result = selectBestMappingCandidate({
      concept: 'merchant_category_code',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.merchantCategoryCode',
        displayName: 'Merchant Category Code',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 14,
        tabLeft: 286.08,
        tabTop: 318.08,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'mcc',
          businessSection: 'Business Details',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 15,
          tabLeft: 286.08,
          tabTop: 318.08,
          currentValue: '5812',
          enrichment: {
            jsonKeyPath: 'merchantData.merchantCategoryCode',
            matchedBy: 'position',
            suggestedDisplayName: 'Merchant Category Code',
            suggestedBusinessSection: 'Business Details',
          },
        },
        {
          id: 'naics',
          businessSection: 'Business Details',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 13,
          tabLeft: 35.2,
          tabTop: 318.08,
          currentValue: '722511',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('mcc');
    expect(result.decisionReason).toBe('trusted_by_anchor_and_value_shape');
  });

  test('Batch 1 can run only when mapping is trusted', () => {
    const trustedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Postal Code',
        label: 'Postal Code',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'zip_postal_code',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'postal_code',
    } as NodeJS.ProcessEnv);
    const blockedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Business Name',
        label: 'Business Name',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        observedValueLikeTextNearControl: 'qa.signer@example.com',
        enrichment: mockEnrichment({
          jsonKeyPath: 'merchantData.registeredName',
          suggestedDisplayName: 'Business Name',
          suggestedBusinessSection: 'Business Details',
        }),
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'business_name',
    } as NodeJS.ProcessEnv);

    expect(trustedPlan.cases.length).toBeGreaterThan(0);
    expect(trustedPlan.skippedConcepts).toEqual([]);
    expect(blockedPlan.cases).toEqual([]);
    expect(blockedPlan.skippedConcepts[0]).toMatchObject({
      concept: 'business_name',
      reason: 'field is not confidently mapped in the scorecard source report',
    });
    expect(skippedConceptToResult(blockedPlan.skippedConcepts[0]!).outcome).toBe('mapping_not_confident');
  });

  test('address batch plan includes layout-backed concepts and skips unresolved physical operating address rows', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
        resolvedLabel: 'Location Name',
        label: 'Location Name',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        currentValueShape: 'text_name_like',
        pageIndex: 1,
        ordinalOnPage: 52,
        tabLeft: 35.2,
        tabTop: 712.32,
        enrichment: mockEnrichment({
          matchedBy: 'coordinate',
          jsonKeyPath: 'merchantData.locationName',
          suggestedDisplayName: 'Location Name',
          suggestedBusinessSection: 'Business Details',
          expectedOrdinalOnPage: 52,
          expectedTabLeft: 35.2,
          expectedTabTop: 712.32,
          layoutSectionHeader: 'Location Details',
          layoutFieldLabel: 'Location Name',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
        }),
      }),
      mockField({
        index: 2,
        section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
        resolvedLabel: 'Bank Address City',
        label: 'Bank Address City',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        currentValueShape: 'text_name_like',
        pageIndex: 1,
        ordinalOnPage: 64,
        tabLeft: 409.6,
        tabTop: 905.6,
        enrichment: mockEnrichment({
          matchedBy: 'coordinate',
          jsonKeyPath: 'merchantData.bankAddress.city',
          suggestedDisplayName: 'Bank Address City',
          suggestedBusinessSection: 'Banking',
          expectedOrdinalOnPage: 64,
          expectedTabLeft: 409.6,
          expectedTabTop: 905.6,
          layoutSectionHeader: 'Bank Address',
          layoutFieldLabel: 'Bank Address City',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
        }),
      }),
      mockField({
        index: 3,
        section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
        resolvedLabel: 'Physical Operating Address Line 1',
        label: 'Physical Operating Address Line 1',
        labelSource: 'enrichment-position',
        labelConfidence: 'medium',
        currentValueShape: 'empty',
        pageIndex: 1,
        ordinalOnPage: 47,
        tabLeft: 35.2,
        tabTop: 657.92,
        enrichment: mockEnrichment({
          matchedBy: 'position',
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          suggestedDisplayName: 'Physical Operating Address Line 1',
          suggestedBusinessSection: 'Address',
          expectedOrdinalOnPage: 47,
          expectedTabLeft: 35.2,
          expectedTabTop: 657.92,
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
        }),
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'location_name,bank_city,business_mailing_address_line_1',
    } as NodeJS.ProcessEnv);

    expect(plan.targetConcepts).toEqual(['location_name', 'bank_city', 'business_mailing_address_line_1']);
    expect(plan.cases.some((entry) => entry.concept === 'location_name')).toBe(true);
    expect(plan.cases.some((entry) => entry.concept === 'bank_city')).toBe(true);
    expect(plan.cases.some((entry) => entry.concept === 'business_mailing_address_line_1')).toBe(false);
    expect(plan.skippedConcepts).toEqual(expect.arrayContaining([
      expect.objectContaining({ concept: 'business_mailing_address_line_1' }),
    ]));
  });

  test('guarded physical address discovery selects the unique isOperatingAddress radio', () => {
    const candidate = findPhysicalOperatingAddressToggle([
      {
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'addressOptions',
        label: 'addressOptions',
        resolvedLabel: 'addressOptions',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'addressOptions' },
        ],
        groupName: 'addressOptions_group',
        inferredType: { type: 'address_option' },
      },
      {
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'addressOptions',
        label: 'addressOptions › Required - addressOptions - isLegalAddress',
        resolvedLabel: 'addressOptions › Required - addressOptions - isLegalAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'addressOptions › Required - addressOptions - isLegalAddress' },
        ],
        groupName: 'addressOptions_group',
        inferredType: { type: 'address_option' },
      },
      {
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'addressOptions',
        label: 'addressOptions › Required - addressOptions - isOperatingAddress',
        resolvedLabel: 'addressOptions › Required - addressOptions - isOperatingAddress',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Required - addressOptions - isVirtualAddress' },
          { source: 'section+row', value: 'addressOptions › Required - addressOptions - isOperatingAddress' },
        ],
        groupName: 'addressOptions_group',
        inferredType: { type: 'address_option' },
      },
    ] as any);

    expect(candidate?.resolvedLabel).toContain('isOperatingAddress');
  });

  test('guarded physical address discovery stays opt-in and refuses unsafe candidates', () => {
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(true);
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '0',
    } as NodeJS.ProcessEnv)).toBe(false);

    const candidate = findPhysicalOperatingAddressToggle([
      {
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: false,
        sectionName: 'addressOptions',
        label: 'addressOptions › Required - addressOptions - isOperatingAddress',
        resolvedLabel: 'addressOptions › Required - addressOptions - isOperatingAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'addressOptions › Required - addressOptions - isOperatingAddress' },
        ],
        groupName: 'addressOptions_group',
        inferredType: { type: 'address_option' },
      },
      {
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'addressOptions',
        label: 'addressOptions › Required - addressOptions - isLegalAddress',
        resolvedLabel: 'addressOptions › Required - addressOptions - isLegalAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'addressOptions › Required - addressOptions - isLegalAddress' },
        ],
        groupName: 'addressOptions_group',
        inferredType: { type: 'address_option' },
      },
    ] as any);

    expect(candidate).toBeNull();
  });

  test('physical address DOM probe stays opt-in and does not enable guarded discovery by itself', () => {
    expect(guardedPhysicalOperatingAddressDomProbeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(guardedPhysicalOperatingAddressDomProbeEnabled({
      SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(true);
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(false);
  });

  test('physical address post-toggle capture stays opt-in and does not enable probe or guarded discovery by itself', () => {
    expect(guardedPhysicalOperatingAddressPostToggleCaptureEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(guardedPhysicalOperatingAddressPostToggleCaptureEnabled({
      SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(true);
    expect(guardedPhysicalOperatingAddressDomProbeEnabled({
      SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(false);
  });

  test('physical address post-toggle capture redacts raw values but preserves field-local labels', () => {
    expect(sanitizePhysicalOperatingAddressPostToggleCaptureText('hello@example.com')).toBe('[redacted:email]');
    expect(sanitizePhysicalOperatingAddressPostToggleCaptureText('https://example.test')).toBe('[redacted:url]');
    expect(sanitizePhysicalOperatingAddressPostToggleCaptureText('+15154407899')).toBe('[redacted:phone]');
    expect(sanitizePhysicalOperatingAddressPostToggleCaptureText('Address Line 1')).toBe('Address Line 1');
    expect(sanitizePhysicalOperatingAddressPostToggleCaptureText('Business Email')).toBe('Business Email');
  });

  test('physical address post-toggle capture refinement ignores page-scale wrappers and pre-anchor rows', () => {
    const refined = refinePhysicalOperatingAddressPostToggleCaptureRegion({
      anchorLeft: 407.44,
      anchorTop: 611.91,
      controls: [
        {
          tagName: 'INPUT',
          inputType: 'radio',
          role: 'radio',
          ariaLabel: null,
          ariaLabelledBy: null,
          ariaLabelledByText: null,
          name: 'addressOptions',
          dataType: 'Radio',
          dataTabType: 'Radio',
          elementId: 'tab-form-element-radio',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(1) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(1)',
          left: 407.44,
          top: 611.91,
          width: 18,
          height: 18,
          visible: true,
          editable: true,
          checked: true,
          withinDocTab: true,
          nearestSectionText: 'addressOptions',
          labelText: 'addressOptions',
          keywordMatches: [],
          valueShape: 'checked',
        },
        {
          tagName: 'SELECT',
          inputType: null,
          role: 'combobox',
          ariaLabel: null,
          ariaLabelledBy: null,
          ariaLabelledByText: null,
          name: null,
          dataType: 'List',
          dataTabType: 'List',
          elementId: 'tab-form-element-legal-state',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(2) > select:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(2)',
          left: 548.33,
          top: 579.63,
          width: 69,
          height: 17,
          visible: true,
          editable: true,
          checked: null,
          withinDocTab: true,
          nearestSectionText: null,
          labelText: 'List',
          keywordMatches: [],
          valueShape: 'selected',
        },
        {
          tagName: 'INPUT',
          inputType: 'text',
          role: 'textbox',
          ariaLabel: null,
          ariaLabelledBy: null,
          ariaLabelledByText: null,
          name: null,
          dataType: 'Text',
          dataTabType: 'Text',
          elementId: 'tab-form-element-address-1',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(3) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(3)',
          left: 233.44,
          top: 747.31,
          width: 376,
          height: 22,
          visible: true,
          editable: true,
          checked: null,
          withinDocTab: true,
          nearestSectionText: 'addressOptions Required - addressOptions - isOperatingAddress',
          labelText: 'Text',
          keywordMatches: [],
          valueShape: 'text_like',
        },
        {
          tagName: 'SELECT',
          inputType: null,
          role: 'combobox',
          ariaLabel: null,
          ariaLabelledBy: null,
          ariaLabelledByText: null,
          name: null,
          dataType: 'List',
          dataTabType: 'List',
          elementId: 'tab-form-element-location-type',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(3) > select:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(3)',
          left: 609.77,
          top: 748.59,
          width: 69,
          height: 17,
          visible: true,
          editable: true,
          checked: null,
          withinDocTab: true,
          nearestSectionText: 'addressOptions Required - addressOptions - isOperatingAddress',
          labelText: 'List',
          keywordMatches: [],
          valueShape: 'selected',
        },
      ],
      textNodes: [
        {
          tagName: 'DIV',
          domPath: 'div#root',
          className: null,
          text: 'Review and complete Finish Press enter to complete the required fields',
          keywords: [],
          textShape: 'text_like',
          redacted: false,
          withinDocTab: false,
          left: 0,
          top: 0,
          width: 1304,
          height: 4641,
        },
        {
          tagName: 'LABEL',
          domPath: 'div#tab-legalState > label:nth-of-type(1)',
          className: null,
          text: 'Required - legalState',
          keywords: ['State'],
          textShape: 'text_like',
          redacted: false,
          withinDocTab: true,
          left: 548.33,
          top: 579.63,
          width: 140,
          height: 18,
        },
        {
          tagName: 'DIV',
          domPath: 'div#tab-addressOptions-operating',
          className: 'doc-tab',
          text: 'Required - addressOptions - isOperatingAddress',
          keywords: ['isOperatingAddress', 'addressOptions'],
          textShape: 'text_like',
          redacted: false,
          withinDocTab: true,
          left: 407.44,
          top: 611.91,
          width: 230,
          height: 18,
        },
      ],
    });

    expect(refined.captureBounds.left).toBeGreaterThan(200);
    expect(refined.captureBounds.top).toBeGreaterThan(580);
    expect(refined.captureBounds.width).toBeLessThan(520);
    expect(refined.captureBounds.height).toBeLessThan(220);
    expect(refined.textNodes.some((node) => node.domPath === 'div#root')).toBe(false);
    expect(refined.textNodes.some((node) => node.text === 'Required - legalState')).toBe(false);
  });

  test('physical address DOM probe redacts raw values into shapes', () => {
    const sanitized = sanitizePhysicalOperatingAddressProbeControl({
      tagName: 'INPUT',
      inputType: 'text',
      role: 'textbox',
      ariaLabel: 'Physical Operating Address ZIP',
      ariaLabelledBy: 'zip-field-label',
      name: 'physicalAddressZip',
      dataType: 'Text',
      left: 567.04,
      top: 657.92,
      width: 160,
      height: 24,
      visible: true,
      editable: true,
      checked: null,
      withinDocTab: true,
      nearestSectionText: 'Physical Operating Address',
      labelText: 'ZIP',
      currentValue: '28202',
    });

    expect(sanitized.valueShape).toBe('postal_like');
    expect((sanitized as Record<string, unknown>).currentValue).toBeUndefined();
  });

  test('physical address DOM probe identifies address text fragments', () => {
    const fragments = collectPhysicalOperatingAddressProbeTextFragments([
      {
        text: 'addressOptions › Required - addressOptions - isOperatingAddress',
        source: 'nearby',
        left: 403.2,
        top: 577.92,
      },
      {
        text: 'Physical Operating Address',
        source: 'frame',
        left: 35.2,
        top: 627.2,
      },
      {
        text: 'completely unrelated text',
        source: 'frame',
      },
    ]);

    expect(fragments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        text: 'addressOptions › Required - addressOptions - isOperatingAddress',
        keywords: expect.arrayContaining(['addressOptions', 'isOperatingAddress']),
      }),
      expect.objectContaining({
        text: 'Physical Operating Address',
        keywords: expect.arrayContaining(['Physical Operating Address']),
      }),
    ]));
    expect(fragments).toHaveLength(2);
  });

  test('physical address DOM probe keeps section text separate from direct control keyword matches', () => {
    const sanitized = sanitizePhysicalOperatingAddressProbeControl({
      tagName: 'INPUT',
      inputType: 'text',
      role: 'textbox',
      ariaLabel: null,
      ariaLabelledBy: null,
      name: null,
      dataType: 'Text',
      left: 797.28,
      top: 895.47,
      width: 164,
      height: 22,
      visible: true,
      editable: true,
      checked: null,
      withinDocTab: false,
      nearestSectionText: 'addressOptions Required - addressOptions - isLegalAddress Required - addressOptions - isOperatingAddress Required - addressOptions - isVirtualAddress',
      labelText: 'Text',
      currentValue: '',
    });

    expect(sanitized.keywordMatches).toEqual([]);
    expect(sanitized.nearestSectionText).toContain('isOperatingAddress');
  });

  test('physical address DOM probe falls back to visible isOperatingAddress text when radios are unlabeled', () => {
    const anchor = selectPhysicalOperatingAddressDomProbeAnchor([], [
      {
        text: 'Required - addressOptions - isOperatingAddress',
        keywords: ['isOperatingAddress', 'addressOptions'],
        source: 'frame',
        left: 407.44,
        top: 650.91,
      },
    ]);

    expect(anchor).toEqual({
      label: 'Required - addressOptions - isOperatingAddress',
      left: 407.44,
      top: 650.91,
    });
  });

  test('physical address DOM probe output is artifact-only', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-physical-address-probe-'));
    const report = buildPhysicalOperatingAddressDomProbeReport({
      toggleCandidateLabel: 'addressOptions › Required - addressOptions - isOperatingAddress',
      toggleAction: 'selected',
      discoveredFieldsBefore: 100,
      discoveredFieldsAfter: 98,
      labeledPhysicalAddressFieldsBefore: 0,
      labeledPhysicalAddressFieldsAfter: 0,
      snapshots: [
        {
          stage: 'before-toggle',
          capturedAt: '2026-04-30T14:00:00.000Z',
          anchorLabel: 'addressOptions › Required - addressOptions - isOperatingAddress',
          counts: {
            candidateDocTabs: 100,
            visibleInputs: 84,
            visibleControlCandidates: 98,
            visibleControlsOutsideDocTab: 0,
            physicalOperatingAddressMentionControls: 0,
          },
          nearbyText: [],
          keywordText: [],
          nearbyControls: [],
          matchingControls: [],
        },
        {
          stage: 'after-toggle',
          capturedAt: '2026-04-30T14:00:01.000Z',
          anchorLabel: 'addressOptions › Required - addressOptions - isOperatingAddress',
          counts: {
            candidateDocTabs: 98,
            visibleInputs: 82,
            visibleControlCandidates: 96,
            visibleControlsOutsideDocTab: 0,
            physicalOperatingAddressMentionControls: 0,
          },
          nearbyText: [],
          keywordText: [],
          nearbyControls: [],
          matchingControls: [],
        },
      ],
    });
    const original = JSON.parse(JSON.stringify(report));

    const { jsonPath, mdPath } = writePhysicalOperatingAddressDomProbeArtifacts(report, outDir);

    expect(path.basename(jsonPath)).toBe('latest-physical-operating-address-dom-probe.json');
    expect(path.basename(mdPath)).toBe('latest-physical-operating-address-dom-probe.md');
    expect(fs.readdirSync(outDir).sort()).toEqual([
      'latest-physical-operating-address-dom-probe.json',
      'latest-physical-operating-address-dom-probe.md',
    ]);
    expect(report).toEqual(original);
  });

  test('physical address post-toggle capture output is artifact-only', async ({ page }) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-physical-address-capture-'));
    const report = {
      generatedAt: '2026-04-30T14:05:00.000Z',
      anchorLabel: 'Required - addressOptions - isOperatingAddress',
      anchorLeft: 407.44,
      anchorTop: 611.91,
      captureBounds: {
        left: 180,
        top: 700,
        width: 860,
        height: 220,
      },
      textNodes: [
        {
          tagName: 'DIV',
          domPath: 'body:nth-of-type(1) > div:nth-of-type(4)',
          className: 'field-label',
          text: 'Address Line 1',
          keywords: ['Address Line 1'],
          textShape: 'text_like',
          redacted: false,
          withinDocTab: true,
          left: 233.44,
          top: 728.11,
          width: 108,
          height: 18,
        },
        {
          tagName: 'DIV',
          domPath: 'body:nth-of-type(1) > div:nth-of-type(8)',
          className: 'value-like',
          text: '[redacted:email]',
          keywords: [],
          textShape: 'email',
          redacted: true,
          withinDocTab: true,
          left: 410.88,
          top: 801.08,
          width: 140,
          height: 18,
        },
      ],
      controls: [
        {
          tagName: 'INPUT',
          inputType: 'text',
          role: 'textbox',
          ariaLabel: null,
          ariaLabelledBy: 'physical-address-line-1',
          ariaLabelledByText: 'Address Line 1',
          name: null,
          dataType: 'Text',
          dataTabType: 'Text',
          elementId: 'tab-form-element-00000000-0000-4000-8000-000000000001',
          className: 'doc-tab',
          domPath: 'body:nth-of-type(1) > div:nth-of-type(4) > input:nth-of-type(1)',
          parentPath: 'body:nth-of-type(1) > div:nth-of-type(4)',
          left: 233.44,
          top: 747.31,
          width: 376,
          height: 22,
          visible: true,
          editable: true,
          checked: null,
          withinDocTab: true,
          nearestSectionText: 'Physical Operating Address',
          labelText: 'Text',
          keywordMatches: [],
          valueShape: 'text_like',
        },
      ],
      observations: ['Potential value-like text was redacted inside the post-toggle capture preview.'],
    };
    const original = JSON.parse(JSON.stringify(report));

    const { screenshotPath, htmlPath, jsonPath, mdPath } = await writePhysicalOperatingAddressPostToggleArtifacts(page, report, outDir);

    expect(path.basename(screenshotPath)).toBe('latest-physical-operating-address-post-toggle-screenshot.png');
    expect(path.basename(htmlPath)).toBe('latest-physical-operating-address-post-toggle-dom.html');
    expect(path.basename(jsonPath)).toBe('latest-physical-operating-address-post-toggle-structure.json');
    expect(path.basename(mdPath)).toBe('latest-physical-operating-address-post-toggle-structure.md');
    expect(fs.readdirSync(outDir).sort()).toEqual([
      'latest-physical-operating-address-post-toggle-dom.html',
      'latest-physical-operating-address-post-toggle-screenshot.png',
      'latest-physical-operating-address-post-toggle-structure.json',
      'latest-physical-operating-address-post-toggle-structure.md',
    ]);
    expect(fs.readFileSync(htmlPath, 'utf8')).toContain('[redacted:email]');
    expect(fs.readFileSync(htmlPath, 'utf8')).not.toContain('hello@example.com');
    expect(fs.readFileSync(jsonPath, 'utf8')).toContain('[redacted:email]');
    expect(fs.statSync(screenshotPath).size).toBeGreaterThan(0);
    expect(report).toEqual(original);
  });

  test('legal_entity_type matrix is generated only for trusted mappings', () => {
    const trustedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Legal Entity Type',
        label: 'Legal Entity Type',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'legal_entity_type',
        docusignTabType: 'List',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'legal_entity_type',
    } as NodeJS.ProcessEnv);
    const blockedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        inferredType: 'legal_entity_type',
        docusignTabType: 'List',
        labelSource: 'none',
        labelConfidence: 'none',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'legal_entity_type',
    } as NodeJS.ProcessEnv);

    expect(trustedPlan.cases.map((entry) => entry.validationId)).toEqual([
      'current-option-documented',
      'valid-option-accepted',
      'invalid-freeform-rejected',
      'empty-required-behavior',
    ]);
    expect(blockedPlan.cases).toEqual([]);
    expect(blockedPlan.skippedConcepts[0]).toMatchObject({
      concept: 'legal_entity_type',
      reason: 'field is not confidently mapped in the scorecard source report',
    });
  });

  test('account_type matrix is generated only for trusted mappings', () => {
    const trustedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        section: 'Banking',
        resolvedLabel: 'Account Type',
        label: 'Account Type',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'bank_account_type',
        docusignTabType: 'List',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'account_type',
    } as NodeJS.ProcessEnv);
    const blockedPlan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        section: 'Banking',
        inferredType: 'bank_account_type',
        docusignTabType: 'List',
        labelSource: 'none',
        labelConfidence: 'none',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'account_type',
    } as NodeJS.ProcessEnv);

    expect(trustedPlan.targetConcepts).toEqual(['bank_account_type']);
    expect(trustedPlan.cases.map((entry) => entry.validationId)).toEqual([
      'current-option-documented',
      'valid-option-accepted',
      'invalid-freeform-rejected',
      'empty-required-behavior',
    ]);
    expect(blockedPlan.cases).toEqual([]);
    expect(blockedPlan.skippedConcepts[0]).toMatchObject({
      concept: 'bank_account_type',
      reason: 'field is not confidently mapped in the scorecard source report',
    });
  });

  test('calibrated controlled-choice mappings carry layout proof into the interactive target profile', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-calibrated-controlled-choice-'));
    const calibrationPath = path.join(outDir, 'latest-mapping-calibration.json');
    try {
      fs.writeFileSync(calibrationPath, JSON.stringify({
        schemaVersion: 1,
        rows: [{
          concept: 'proof_of_bank_account_type',
          conceptDisplayName: 'Proof Of Bank Account Type',
          jsonKeyPath: 'merchantData.proofOfBankAccountType',
          currentCandidateFieldIndex: 1,
          currentCandidateCoordinates: '663.68,876.8',
          selectedCandidate: '#1 Proof of Bank Account Type Attachments p1 ord65 List shape=text_name_like editable=editable layout=Bank Info > Proof of Bank Account Type @ 663.68,876.8',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 1,
            businessSection: 'Attachments',
            layoutSectionHeader: 'Bank Info',
            layoutFieldLabel: 'Proof of Bank Account Type',
            pageIndex: 1,
            ordinalOnPage: 65,
            coordinates: '663.68,876.8',
            tabType: 'List',
          }],
        }],
      }), 'utf8');

      const plan = buildInteractiveValidationPlan(mockValidationReport([
        mockField({
          index: 1,
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          labelSource: 'none',
          labelConfidence: 'none',
          inferredType: 'proof_of_bank_account_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 65,
          tabLeft: 663.68,
          tabTop: 876.8,
        }),
      ]), {
        INTERACTIVE_CONCEPTS: 'proof_of_bank_account_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases).toHaveLength(4);
      expect(plan.cases[0]!.targetProfile).toMatchObject({
        intendedBusinessSection: 'Attachments',
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Proof of Bank Account Type',
        layoutEvidenceSource: 'mapping-calibration',
        jsonKeyPath: 'merchantData.proofOfBankAccountType',
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 65,
        expectedDocusignFieldFamily: 'List',
        expectedCoordinates: {
          left: 663.68,
          top: 876.8,
        },
      });
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('bank_account_type calibrated layout proof displaces stale Account Type enrichment', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-bank-account-calibration-'));
    const calibrationPath = path.join(outDir, 'latest-mapping-calibration.json');
    try {
      fs.writeFileSync(calibrationPath, JSON.stringify({
        schemaVersion: 1,
        rows: [{
          concept: 'bank_account_type',
          conceptDisplayName: 'Bank Account Type',
          jsonKeyPath: 'merchantData.accountType',
          currentCandidateFieldIndex: 2,
          currentCandidateCoordinates: '536.96,876.8',
          selectedCandidate: '#2 Account Type Banking p1 ord64 List shape=text_name_like editable=editable layout=Bank Info > Account Type @ 536.96,876.8',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 2,
            label: 'Account Type',
            businessSection: 'Banking',
            layoutSectionHeader: 'Bank Info',
            layoutFieldLabel: 'Account Type',
            pageIndex: 1,
            ordinalOnPage: 64,
            coordinates: '536.96,876.8',
            tabType: 'List',
          }],
        }],
      }), 'utf8');

      const plan = buildInteractiveValidationPlan(mockValidationReport([
        mockField({
          index: 1,
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'business_type',
          docusignTabType: 'List',
          labelSource: 'enrichment-coordinate',
          labelConfidence: 'medium',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
          enrichment: {
            jsonKeyPath: 'merchantData.accountType',
            matchedBy: 'coordinate',
            confidence: 'high',
            suggestedDisplayName: 'Bank Account Type',
            suggestedBusinessSection: 'Banking',
            expectedPageIndex: 1,
            expectedOrdinalOnPage: 56,
            expectedTabLeft: 411.52,
            expectedTabTop: 713.6,
            expectedDocusignFieldFamily: 'List',
          },
        }),
        mockField({
          index: 2,
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockField({
          index: 3,
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'bank_account_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 64,
          tabLeft: 536.96,
          tabTop: 876.8,
        }),
      ]), {
        INTERACTIVE_CONCEPTS: 'bank_account_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases).toHaveLength(4);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 3)).toBe(true);
      expect(plan.cases[0]!.targetProfile).toMatchObject({
        intendedFieldDisplayName: 'Bank Account Type',
        intendedBusinessSection: 'Banking',
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Account Type',
        layoutEvidenceSource: 'mapping-calibration',
        jsonKeyPath: 'merchantData.accountType',
        expectedOrdinalOnPage: 64,
        expectedDocusignFieldFamily: 'List',
      });
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('bank_account_type live verifier trusts the calibrated Bank Info Account Type target', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-bank-live-target-'));
    const calibrationPath = path.join(outDir, 'latest-mapping-calibration.json');
    try {
      fs.writeFileSync(calibrationPath, JSON.stringify({
        schemaVersion: 1,
        rows: [{
          concept: 'bank_account_type',
          conceptDisplayName: 'Bank Account Type',
          jsonKeyPath: 'merchantData.accountType',
          currentCandidateFieldIndex: 2,
          currentCandidateCoordinates: '536.96,876.8',
          selectedCandidate: '#2 Account Type Banking p1 ord64 List shape=text_name_like editable=editable layout=Bank Info > Account Type @ 536.96,876.8',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 2,
            businessSection: 'Banking',
            layoutSectionHeader: 'Bank Info',
            layoutFieldLabel: 'Account Type',
            pageIndex: 1,
            ordinalOnPage: 64,
            coordinates: '536.96,876.8',
            tabType: 'List',
          }],
        }],
      }), 'utf8');

      const plan = buildInteractiveValidationPlan(mockValidationReport([
        mockField({
          index: 1,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockField({
          index: 2,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockField({
          index: 3,
          inferredType: 'bank_account_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 64,
          tabLeft: 536.96,
          tabTop: 876.8,
        }),
      ]), {
        INTERACTIVE_CONCEPTS: 'bank_account_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const testCase = plan.cases[0]!;
      const liveFields = [
        mockDiscoveredField({
          index: 0,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockDiscoveredField({
          index: 1,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockDiscoveredField({
          index: 2,
          inferredType: 'bank_account_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 64,
          tabLeft: 536.96,
          tabTop: 876.8,
        }),
      ];

      const resolved = resolveInteractiveTargetField(testCase, liveFields[testCase.targetField.fieldIndex - 1]!, liveFields);

      expect(testCase.targetProfile).toMatchObject({
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Account Type',
        jsonKeyPath: 'merchantData.accountType',
        expectedOrdinalOnPage: 64,
        expectedDocusignFieldFamily: 'List',
      });
      expect(resolved.field.ordinalOnPage).toBe(64);
      expect(resolved.selection.trusted).toBe(true);
      expect(resolved.selection.decisionReason).not.toBe('rejected_insufficient_label_proof');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('options-not-discoverable results are manual_review or skipped, not product-like execution', () => {
    const undiscoverable = prepareControlledChoiceInteraction(
      { interactionKind: 'select_alternate', conceptDisplayName: 'Legal Entity Type' },
      {
        kind: 'combobox',
        tagName: 'div',
        role: 'combobox',
        inputType: null,
        options: [],
        supportsFreeText: true,
        canClear: false,
      },
      'llc',
    );
    const uncleareable = prepareControlledChoiceInteraction(
      { interactionKind: 'clear_if_supported', conceptDisplayName: 'Bank Account Type' },
      {
        kind: 'native-select',
        tagName: 'select',
        role: null,
        inputType: null,
        options: [{ value: 'checking', label: 'Checking' }],
        supportsFreeText: false,
        canClear: false,
      },
      'checking',
    );

    expect('status' in undiscoverable && undiscoverable.status).toBe('manual_review');
    expect('detail' in undiscoverable && undiscoverable.detail).toMatch(/options not discoverable/i);
    expect('status' in uncleareable && uncleareable.status).toBe('skipped');
    expect('detail' in uncleareable && uncleareable.detail).toMatch(/cannot safely clear/i);
  });

  test('controlled-choice interactive anchors prefer live report ordinal over stale enrichment ordinal', () => {
    const anchor = buildExpectedAnchor({
      targetProfile: {
        jsonKeyPath: 'merchantData.legalEntityType',
        intendedFieldDisplayName: 'Legal Entity Type',
        intendedBusinessSection: 'Business Details',
        intendedSectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        enrichmentMatchedBy: 'coordinate',
        enrichmentPositionalFingerprint: 'page:1|List|ord:10',
        inferredType: 'legal_entity_type',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        mappingConfidence: 'high',
        tabGuid: 'guid-legal-entity',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 11,
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 10,
        expectedDocusignFieldFamily: 'List',
        coordinates: {
          left: 288,
          top: 287.36,
          width: null,
          height: null,
        },
        expectedCoordinates: {
          left: 288,
          top: 287.36,
        },
      },
    } as any);

    expect(anchor.pageIndex).toBe(1);
    expect(anchor.ordinalOnPage).toBe(11);
    expect(anchor.docusignFieldFamily).toBe('List');

    const selection = selectBestMappingCandidate({
      concept: 'legal_entity_type',
      currentCandidateId: '61',
      expectedAnchor: anchor,
      candidates: [{
        id: '61',
        resolvedLabel: 'Legal Entity Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Legal Entity Type',
        inferredType: 'legal_entity_type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 11,
        tabLeft: 288,
        tabTop: 287.36,
        currentValue: 'Llc',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(selection.trusted).toBe(true);
    expect(selection.decisionReason).toBe('trusted_by_label');
    expect(selection.shiftReason).toBe('none');
  });

  test('restore-original-value failure prevents product finding', () => {
    const downgraded = applyRestoreSafetyGate({
      concept: 'bank_account_type',
      conceptDisplayName: 'Bank Account Type',
      fieldLabel: 'Bank Account Type',
      targetField: null,
      validationId: 'valid-option-accepted',
      caseName: 'alternate-option',
      testName: 'valid alternate option selected and retained',
      inputValue: 'Savings',
      expectedBehavior: 'A listed alternate option can be selected and retained.',
      severity: 'critical',
      status: 'failed',
      outcome: 'product_failure',
      reasonCode: 'product_failure',
      observation: null,
      targetDiagnostics: null,
      evidence: 'accepted invalid option',
      interpretation: 'Bank Account Type accepted a value that should have been rejected.',
      recommendation: 'Tighten validation.',
      cleanupStrategy: 'restore_original_value_then_blur',
      safetyNotes: [],
    } as any, { restoreSucceeded: false });

    expect(downgraded.status).toBe('manual_review');
    expect(downgraded.outcome).toBe('observer_ambiguous');
    expect(downgraded.reasonCode).toBe('observer_ambiguous');
  });

  test('interactive step timeout becomes observer ambiguity without product finding', () => {
    const validationCase = mockInteractiveCase();
    const result = buildInteractiveStepTimeoutResult(
      validationCase,
      mockInteractiveTargetDiagnostics(validationCase),
      {
        phase: 'collect-observation',
        timeoutMs: 12_345,
      },
    );

    expect(result.status).toBe('manual_review');
    expect(result.outcome).toBe('observer_ambiguous');
    expect(result.reasonCode).toBe('observer_timeout');
    expect(result.evidence).toContain('phase=collect-observation');
    expect(result.evidence).toContain(`validationId=${validationCase.validationId}`);

    const report = buildValidationFindingsReport(mockFindingsInput({ results: [result] }));
    expect(report.likelyProductValidationFindings).toEqual([]);
    expect(report.ambiguousHumanReviewFindings).toHaveLength(1);
  });

  test('interactive step timeout preserves existing target confidence', () => {
    const validationCase = mockInteractiveCase();
    const result = buildInteractiveStepTimeoutResult(
      validationCase,
      mockInteractiveTargetDiagnostics(validationCase, {
        targetConfidence: 'mapping_not_confident',
        targetConfidenceReason: 'Target verification not yet evaluated.',
      }),
      {
        phase: 'read-target-signature',
        timeoutMs: INTERACTIVE_STEP_TIMEOUT_MS,
      },
    );

    expect(result.targetDiagnostics?.targetConfidence).toBe('mapping_not_confident');
    expect(result.evidence).toContain('targetConfidence=mapping_not_confident');
  });

  test('interactive timeout release closes the page/context/browser path', async () => {
    const calls: string[] = [];
    const browser = {
      isConnected: () => true,
      close: async () => {
        calls.push('browser.close');
      },
    };
    const context = {
      close: async () => {
        calls.push('context.close');
        throw new Error('context close failed');
      },
      browser: () => browser,
    };
    const page = {
      close: async () => {
        calls.push('page.close');
        throw new Error('page close failed');
      },
      context: () => context,
    };

    const release = await releaseInteractiveTimeoutSession({
      page: () => page,
    } as any);

    expect(calls).toEqual(['page.close', 'context.close', 'browser.close']);
    expect(release.pageClosed).toBe(false);
    expect(release.contextClosed).toBe(false);
    expect(release.browserClosed).toBe(true);
    expect(release.releaseErrors).toContain('page.close:page close failed');
    expect(release.releaseErrors).toContain('context.close:context close failed');
  });

  test('interactive results markdown surfaces the current in-progress step', () => {
    const currentStep: InteractiveProgressState = {
      concept: 'email',
      conceptDisplayName: 'Email',
      validationId: 'missing-at-rejected',
      caseName: 'missing-at',
      phase: 'collect-observation',
      startedAt: '2026-04-27T00:00:00.500Z',
    };

    const resultFile = buildInteractiveResultsFile({
      runStartedAt: '2026-04-27T00:00:00.000Z',
      guardState: { INTERACTIVE_VALIDATION: true, DISPOSABLE_ENVELOPE: true },
      plan: null,
      results: [],
      currentStep,
    });

    expect(resultFile.currentStep).toEqual(currentStep);
    const markdown = renderInteractiveResultsMarkdown(resultFile);
    expect(markdown).toContain('In progress');
    expect(markdown).toContain('validationId=missing-at-rejected');
    expect(markdown).toContain('phase=collect-observation');
  });

  test('interactive progress heartbeat records concept validationId phase and timestamp', () => {
    const currentStep: InteractiveProgressState = {
      concept: 'legal_entity_type',
      conceptDisplayName: 'Legal Entity Type',
      validationId: 'current-option-documented',
      caseName: 'observe-current',
      phase: 'collect-observation',
      startedAt: '2026-05-04T18:58:40.000Z',
    };

    const artifact = buildInteractiveProgressArtifact(currentStep, currentStep.startedAt);

    expect(artifact.status).toBe('in_progress');
    expect(artifact.concept).toBe('legal_entity_type');
    expect(artifact.validationId).toBe('current-option-documented');
    expect(artifact.phase).toBe('collect-observation');
    expect(artifact.timestamp).toBe('2026-05-04T18:58:40.000Z');
  });

  test('bootstrap watchdog selects Windows process-tree kill command', () => {
    expect(buildWindowsProcessTreeKillCommand(4321)).toEqual({
      command: 'taskkill',
      args: ['/pid', '4321', '/t', '/f'],
    });
  });

  test('bootstrap watchdog times out non-zero and writes a timeout artifact with last progress', async () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-watchdog-'));
    const progressPath = path.join(artifactsDir, 'latest-interactive-progress.json');
    fs.writeFileSync(progressPath, JSON.stringify(buildInteractiveProgressArtifact({
      concept: 'legal_entity_type',
      conceptDisplayName: 'Legal Entity Type',
      validationId: 'current-option-documented',
      caseName: 'observe-current',
      phase: 'collect-observation',
      startedAt: '2026-05-04T18:58:40.000Z',
    }, '2026-05-04T18:58:40.000Z'), null, 2), 'utf8');

    const child = new EventEmitter() as EventEmitter & { pid: number };
    child.pid = 4321;
    const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
    const killCalls: Array<{ pid: number; platform?: NodeJS.Platform }> = [];

    try {
      const result = await runNpmScriptWithWatchdog('test:interactive', {}, {
        timeoutMs: 25,
        platform: 'win32',
        artifactsDir,
        now: () => new Date('2026-05-04T18:59:00.000Z'),
        spawnImpl: ((command: string, args: readonly string[]) => {
          spawnCalls.push({ command, args });
          return child as any;
        }) as any,
        killProcessTree: async (pid, platform) => {
          killCalls.push({ pid, platform });
        },
      });

      expect(spawnCalls).toHaveLength(1);
      expect(result.code).toBe(124);
      expect(result.timedOut).toBe(true);
      expect(result.reason).toContain('exceeded INTERACTIVE_RUN_TIMEOUT_MS=25ms');
      expect(result.reason).toContain('lastProgress=legal_entity_type/current-option-documented/collect-observation');
      expect(killCalls).toEqual([{ pid: 4321, platform: 'win32' }]);
      expect(result.timeoutArtifactPath).toBeTruthy();

      const timeoutArtifact = JSON.parse(fs.readFileSync(result.timeoutArtifactPath!, 'utf8')) as ReturnType<typeof buildInteractiveTimeoutArtifact>;
      expect(timeoutArtifact.childPid).toBe(4321);
      expect(timeoutArtifact.progress?.concept).toBe('legal_entity_type');
      expect(timeoutArtifact.progress?.validationId).toBe('current-option-documented');
      expect(timeoutArtifact.progress?.phase).toBe('collect-observation');
      expect(timeoutArtifact.timedOutAt).toBe('2026-05-04T18:59:00.000Z');
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test.describe('interactive operator watchdog wrapper', () => {
    test.skip(process.platform !== 'win32', 'PowerShell operator watchdog is Windows-specific.');

    test('heartbeat output appears while a fake child is still running', () => {
      const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-operator-watchdog-'));

      try {
        const result = runInteractiveWatchdogFixture({
          artifactsDir,
          timeoutSeconds: 5,
          pollSeconds: 1,
          progress: mockWatchdogProgressState(),
          childScriptContent: [
            'Start-Sleep -Seconds 2',
            'exit 0',
          ].join('\n'),
        });

        expect(result.exitCode).toBe(0);
        expect(result.combinedOutput).toContain('heartbeat elapsed=0s');
        expect(result.combinedOutput).toContain('heartbeat elapsed=1s');
        expect(result.combinedOutput).toContain('validationId=valid-option-accepted');
        expect(result.combinedOutput).toContain('caseName=alternate-option');
        expect(result.combinedOutput).toContain('phase=collect-observation');
        expect(result.combinedOutput).toContain('environment cleanup complete');
      } finally {
        fs.rmSync(artifactsDir, { recursive: true, force: true });
      }
    });

    test('timeout writes operator timeout artifact and terminates the fake child process tree', () => {
      const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-operator-watchdog-timeout-'));

      try {
        const result = runInteractiveWatchdogFixture({
          artifactsDir,
          timeoutSeconds: 2,
          pollSeconds: 1,
          progress: mockWatchdogProgressState(),
          childScriptContent: [
            'Start-Sleep -Seconds 30',
            'exit 0',
          ].join('\n'),
        });

        expect(result.exitCode).toBe(124);
        expect(result.combinedOutput).toContain('operator timeout after 2s');
        expect(result.combinedOutput).toContain('terminating child process tree');
        expect(result.combinedOutput).toContain('environment cleanup complete');

        const timeoutArtifact = parseJsonFile<{
          childProcessId: number;
          timeoutSeconds: number;
          elapsedSeconds: number;
          concepts: string[];
          lastProgress: {
            concept: string;
            validationId: string;
            caseName: string;
            phase: string;
          } | null;
        }>(result.operatorTimeoutPath);

        expect(timeoutArtifact.timeoutSeconds).toBe(2);
        expect(timeoutArtifact.elapsedSeconds).toBeGreaterThanOrEqual(2);
        expect(timeoutArtifact.concepts).toEqual(['legal_entity_type']);
        expect(timeoutArtifact.lastProgress?.concept).toBe('legal_entity_type');
        expect(timeoutArtifact.lastProgress?.validationId).toBe('valid-option-accepted');
        expect(timeoutArtifact.lastProgress?.caseName).toBe('alternate-option');
        expect(timeoutArtifact.lastProgress?.phase).toBe('collect-observation');
        expect(isWindowsProcessRunning(timeoutArtifact.childProcessId)).toBe(false);
      } finally {
        fs.rmSync(artifactsDir, { recursive: true, force: true });
      }
    });

    test('wrapper command is documented for operator use', () => {
      const docs = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'LIVE_BOOTSTRAP.md'), 'utf8');
      expect(docs).toContain('scripts/run-interactive-watchdog.ps1');
      expect(docs).toContain('npm run interactive:watchdog -- -Concepts legal_entity_type -TimeoutSeconds 240');
      expect(docs).toContain('wait for heartbeat lines');
    });
  });

  test('sensitive fields are excluded from this batch', () => {
    for (const concept of ['ein', 'ssn', 'routing_number', 'account_number', 'upload'] as const) {
      expect(INTERACTIVE_TARGET_CONCEPTS).not.toContain(concept as any);
    }
  });

  test('calibrated Batch 1 targets use report-order field indexes for interactive plans', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-calibration-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [
        {
          concept: 'business_name',
          conceptDisplayName: 'Business Name',
          currentCandidateFieldIndex: 4,
          selectedCandidate: '#4 Registered Name Business Details p1 ord5 Text shape=text_name_like @ 35,224',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_anchor_and_value_shape',
        },
      ],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({ index: 0, resolvedLabel: 'Intro display', controlCategory: 'merchant_input' }),
        mockField({ index: 1, resolvedLabel: 'Unrelated', controlCategory: 'merchant_input' }),
        mockField({ index: 2, resolvedLabel: 'Unrelated 2', controlCategory: 'merchant_input' }),
        mockField({
          index: 3,
          resolvedLabel: 'Tab Label D7a05bfc Be9e 4541 84fe 3e86440e62c4',
          label: 'Tab Label D7a05bfc Be9e 4541 84fe 3e86440e62c4',
          labelSource: 'id-or-name-key',
          labelConfidence: 'high',
          controlCategory: 'read_only_display',
          visible: true,
          editable: false,
        }),
        mockField({
          index: 4,
          resolvedLabel: 'Registered Name',
          label: 'Registered Name',
          labelSource: 'enrichment-coordinate',
          labelConfidence: 'medium',
          observedValueLikeTextNearControl: 'Example Business LLC',
          controlCategory: 'merchant_input',
          enrichment: mockEnrichment({
            jsonKeyPath: 'merchantData.registeredName',
            suggestedDisplayName: 'Registered Name',
            suggestedBusinessSection: 'Business Details',
          }),
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'business_name',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases.length).toBeGreaterThan(0);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 5)).toBe(true);
      expect(plan.cases.every((entry) => entry.targetField.displayName === 'Registered Name')).toBe(true);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('Postal Code trusts only editable ZIP-shaped address candidates', () => {
    const trusted = selectBestMappingCandidate({
      concept: 'postal_code',
      currentCandidateId: 'zip',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 35.2,
        tabTop: 543.36,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'zip',
        resolvedLabel: 'Postal Code',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        businessSection: 'Address',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 35.2,
        tabTop: 543.36,
        currentValue: '12345',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const readOnly = selectBestMappingCandidate({
      concept: 'postal_code',
      currentCandidateId: 'zip',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 35.2,
        tabTop: 543.36,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'zip',
        resolvedLabel: 'Postal Code',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        businessSection: 'Address',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 35.2,
        tabTop: 543.36,
        currentValue: '12345',
        controlCategory: 'read_only_display',
        visible: true,
        editable: false,
      }],
    });
    const conflictingShape = selectBestMappingCandidate({
      concept: 'postal_code',
      currentCandidateId: 'zip',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
        businessSection: 'Address',
      },
      candidates: [{
        id: 'zip',
        resolvedLabel: 'Postal Code',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        businessSection: 'Address',
        currentValue: 'Example Business LLC',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(trusted.trusted).toBe(true);
    expect(trusted.decisionReason).toBe('trusted_by_anchor_and_value_shape');
    expect(readOnly.trusted).toBe(false);
    expect(readOnly.decisionReason).toBe('rejected_not_editable_merchant_input');
    expect(conflictingShape.trusted).toBe(false);
    expect(conflictingShape.decisionReason).toBe('rejected_value_shape_mismatch');
  });

  test('layout-cell ZIP evidence prefers registered legal address over physical and bank ZIP cells', () => {
    const registered = selectBestMappingCandidate({
      concept: 'postal_code',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 41,
        tabLeft: 568.32,
        tabTop: 543.36,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'registered-zip',
          resolvedLabel: 'Registered Legal Address ZIP',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Address',
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'ZIP',
          layoutValueShape: 'postal_code',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 43,
          tabLeft: 568.32,
          tabTop: 543.36,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
        {
          id: 'physical-zip-empty',
          resolvedLabel: 'Physical Operating Address ZIP',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Address',
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'ZIP',
          currentValueShape: 'empty',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 51,
          tabLeft: 567.04,
          tabTop: 657.92,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
        {
          id: 'bank-zip',
          resolvedLabel: 'Bank Address ZIP',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Banking',
          layoutSectionHeader: 'Bank Address',
          layoutFieldLabel: 'ZIP',
          currentValue: '12345',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 67,
          tabLeft: 410.88,
          tabTop: 936.32,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });
    const bankOnly = selectBestMappingCandidate({
      concept: 'postal_code',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.postalCode',
        businessSection: 'Address',
      },
      candidates: [{
        id: 'bank-zip',
        resolvedLabel: 'Bank Address ZIP',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Address',
        layoutFieldLabel: 'ZIP',
        currentValue: '12345',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(registered.trusted).toBe(true);
    expect(registered.selectedCandidateId).toBe('registered-zip');
    expect(bankOnly.trusted).toBe(false);
    expect(bankOnly.decisionReason).toBe('rejected_section_mismatch');
  });

  test('scoped address line concepts do not confuse registered and bank address blocks', () => {
    const candidates = [
      {
        id: 'registered-line1',
        resolvedLabel: 'Registered Legal Address Line 1',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Address',
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Address Line 1',
        currentValue: '679 Lester Courts',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 35,
        tabLeft: 410.88,
        tabTop: 433.92,
        controlCategory: 'merchant_input' as const,
        visible: true,
        editable: true,
      },
      {
        id: 'bank-line1',
        resolvedLabel: 'Bank Address Line 1',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Address',
        layoutFieldLabel: 'Bank Address Line 1',
        currentValue: '456 Bank Plaza',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 63,
        tabLeft: 35.2,
        tabTop: 905.6,
        controlCategory: 'merchant_input' as const,
        visible: true,
        editable: true,
      },
    ];

    const registered = selectBestMappingCandidate({
      concept: 'registered_address_line_1',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.line1',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 35,
        tabLeft: 410.88,
        tabTop: 433.92,
        docusignFieldFamily: 'Text',
      },
      candidates,
    });
    const bank = selectBestMappingCandidate({
      concept: 'bank_address_line_1',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.bankAddress.line1',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 63,
        tabLeft: 35.2,
        tabTop: 905.6,
        docusignFieldFamily: 'Text',
      },
      candidates,
    });
    const bankOnly = selectBestMappingCandidate({
      concept: 'registered_address_line_1',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.line1',
        businessSection: 'Address',
      },
      candidates: [candidates[1]!],
    });

    expect(registered.trusted).toBe(true);
    expect(registered.selectedCandidateId).toBe('registered-line1');
    expect(bank.trusted).toBe(true);
    expect(bank.selectedCandidateId).toBe('bank-line1');
    expect(bankOnly.trusted).toBe(false);
    expect(bankOnly.decisionReason).toBe('rejected_section_mismatch');
  });

  test('Business and DBA names require editable unambiguous name-like targets', () => {
    const businessName = selectBestMappingCandidate({
      concept: 'business_name',
      currentCandidateId: 'display',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredName',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 5,
        tabLeft: 35.2,
        tabTop: 224.64,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'display',
          resolvedLabel: 'Registered Name',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          businessSection: 'Business Details',
          currentValue: 'Example Business LLC',
          controlCategory: 'read_only_display',
          visible: true,
          editable: false,
        },
        {
          id: 'editable',
          resolvedLabel: 'Registered Name',
          labelSource: 'enrichment-coordinate',
          labelConfidence: 'medium',
          businessSection: 'Business Details',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 5,
          tabLeft: 35.2,
          tabTop: 224.64,
          currentValue: 'Example Business LLC',
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });
    const dbaName = selectBestMappingCandidate({
      concept: 'dba_name',
      currentCandidateId: 'registered-name',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.dbaName',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 7,
        tabLeft: 35.2,
        tabTop: 256.64,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'registered-name',
          resolvedLabel: 'Registered Name',
          labelSource: 'enrichment-coordinate',
          labelConfidence: 'medium',
          businessSection: 'Business Details',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 5,
          tabLeft: 25.2,
          tabTop: 256.64,
          currentValue: 'Example Business LLC',
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
        {
          id: 'location-name',
          resolvedLabel: 'Location Name',
          labelSource: 'enrichment-coordinate',
          labelConfidence: 'medium',
          businessSection: 'Business Details',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 8,
          tabLeft: 45.2,
          tabTop: 256.64,
          currentValue: 'Example Location',
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });

    expect(businessName.trusted).toBe(true);
    expect(businessName.selectedCandidateId).toBe('editable');
    expect(dbaName.trusted).toBe(false);
    expect(dbaName.decisionReason).toBe('rejected_ambiguous_neighbors');
  });

  test('profile name concepts trust scoped text-like anchors and reject numeric title shapes', () => {
    const contactFirstName = selectBestMappingCandidate({
      concept: 'contact_first_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.mainPointOfContact.firstName',
        businessSection: 'Contact',
        pageIndex: 1,
        ordinalOnPage: 31,
        tabLeft: 35.2,
        tabTop: 433.92,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'contact-first-name',
        resolvedLabel: 'Main Point Of Contact First Name',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        businessSection: 'Contact',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 31,
        tabLeft: 35.2,
        tabTop: 433.92,
        currentValue: 'Taylor',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const stakeholderJobTitle = selectBestMappingCandidate({
      concept: 'stakeholder_job_title',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].jobTitle',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 27,
        tabLeft: 35.2,
        tabTop: 311.04,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'stakeholder-job-title',
        resolvedLabel: 'Stakeholder Job Title',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 27,
        tabLeft: 35.2,
        tabTop: 311.04,
        currentValue: '123456',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(contactFirstName.trusted).toBe(true);
    expect(contactFirstName.selectedCandidateId).toBe('contact-first-name');
    expect(contactFirstName.decisionReason).toBe('trusted_by_label');
    expect(stakeholderJobTitle.trusted).toBe(false);
    expect(stakeholderJobTitle.decisionReason).toBe('rejected_value_shape_mismatch');
  });

  test('layout-cell labels separate Registered Name and DBA Name from Location Name', () => {
    const businessName = selectBestMappingCandidate({
      concept: 'business_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredName',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 4,
        tabLeft: 35.2,
        tabTop: 224.64,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'registered-name',
        resolvedLabel: 'Registered Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Registered Name',
        layoutValueShape: 'text_name_like',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 5,
        tabLeft: 35.2,
        tabTop: 224.64,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const dbaName = selectBestMappingCandidate({
      concept: 'dba_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.dbaName',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 6,
        tabLeft: 35.2,
        tabTop: 256.64,
        docusignFieldFamily: 'Text',
      },
      candidates: [
        {
          id: 'dba-name',
          resolvedLabel: 'DBA Name',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Business Details',
          layoutSectionHeader: 'General',
          layoutFieldLabel: 'DBA Name (optional)',
          currentValueShape: 'empty',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 7,
          tabLeft: 35.2,
          tabTop: 256.64,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
        {
          id: 'location-name',
          resolvedLabel: 'Location Name',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Business Details',
          layoutSectionHeader: 'Location Details',
          layoutFieldLabel: 'Location Name',
          currentValue: 'Example Location',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 52,
          tabLeft: 35.2,
          tabTop: 712.32,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });

    expect(businessName.trusted).toBe(true);
    expect(businessName.selectedCandidateId).toBe('registered-name');
    expect(dbaName.trusted).toBe(true);
    expect(dbaName.selectedCandidateId).toBe('dba-name');
  });

  test('legal_entity_type requires General section proof', () => {
    const trusted = selectBestMappingCandidate({
      concept: 'legal_entity_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.legalEntityType',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 10,
        tabLeft: 288,
        tabTop: 287.36,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'legal-entity',
        resolvedLabel: 'Legal Entity Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Legal Entity Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 10,
        tabLeft: 288,
        tabTop: 287.36,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const wrongSection = selectBestMappingCandidate({
      concept: 'legal_entity_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.legalEntityType',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 10,
        tabLeft: 288,
        tabTop: 287.36,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'legal-entity',
        resolvedLabel: 'Legal Entity Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'Location Details',
        layoutFieldLabel: 'Legal Entity Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 10,
        tabLeft: 288,
        tabTop: 287.36,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(trusted.trusted).toBe(true);
    expect(wrongSection.trusted).toBe(false);
    expect(wrongSection.decisionReason).toBe('rejected_insufficient_label_proof');
  });

  test('bank_account_type requires Bank Info and Account Type proof', () => {
    const trusted = selectBestMappingCandidate({
      concept: 'bank_account_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.accountType',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 61,
        tabLeft: 536.96,
        tabTop: 876.8,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'account-type',
        resolvedLabel: 'Account Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Account Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 61,
        tabLeft: 536.96,
        tabTop: 876.8,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const wrongSection = selectBestMappingCandidate({
      concept: 'bank_account_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.accountType',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 61,
        tabLeft: 536.96,
        tabTop: 876.8,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'account-type',
        resolvedLabel: 'Account Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Account Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 61,
        tabLeft: 536.96,
        tabTop: 876.8,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(trusted.trusted).toBe(true);
    expect(wrongSection.trusted).toBe(false);
    expect(wrongSection.decisionReason).toBe('rejected_insufficient_label_proof');
  });

  test('proof_of_bank_account_type does not steal Bank Info Account Type proof', () => {
    const result = selectBestMappingCandidate({
      concept: 'proof_of_bank_account_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.proofOfBankAccountType',
        businessSection: 'Attachments',
        pageIndex: 1,
        ordinalOnPage: 65,
        tabLeft: 663.68,
        tabTop: 876.8,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'account-type',
        resolvedLabel: 'Account Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Account Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 64,
        tabLeft: 536.96,
        tabTop: 876.8,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_section_mismatch');
  });

  test('bank_account_type does not trust Proof of Bank Account Type label proof', () => {
    const result = selectBestMappingCandidate({
      concept: 'bank_account_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.accountType',
        businessSection: 'Banking',
        pageIndex: 1,
        ordinalOnPage: 64,
        tabLeft: 536.96,
        tabTop: 876.8,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'proof-of-bank-account-type',
        resolvedLabel: 'Proof of Bank Account Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Info',
        layoutFieldLabel: 'Proof of Bank Account Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 65,
        tabLeft: 663.68,
        tabTop: 876.8,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.assessments[0]!.conceptSpecificProofMatches).toBe(false);
    expect(result.decisionReason).not.toBe('trusted_by_label');
  });

  test('scoped address state concepts require the matching address-block section proof', () => {
    const trusted = selectBestMappingCandidate({
      concept: 'registered_state',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.state',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 40,
        tabLeft: 410.88,
        tabTop: 543.36,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'registered-state',
        resolvedLabel: 'Registered Legal Address State',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Address',
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'State',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 40,
        tabLeft: 410.88,
        tabTop: 543.36,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const wrongSection = selectBestMappingCandidate({
      concept: 'registered_state',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.registeredLegalAddress.state',
        businessSection: 'Address',
        pageIndex: 1,
        ordinalOnPage: 40,
        tabLeft: 410.88,
        tabTop: 543.36,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'bank-state',
        resolvedLabel: 'Bank Address State',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Banking',
        layoutSectionHeader: 'Bank Address',
        layoutFieldLabel: 'State',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 66,
        tabLeft: 410.88,
        tabTop: 936.32,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(trusted.trusted).toBe(true);
    expect(trusted.selectedCandidateId).toBe('registered-state');
    expect(wrongSection.trusted).toBe(false);
    expect(wrongSection.decisionReason).toBe('rejected_section_mismatch');
  });

  test('proof_of_address_type is not confused with the upload control', () => {
    const result = selectBestMappingCandidate({
      concept: 'proof_of_address_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.proofOfAddressType',
        businessSection: 'Attachments',
        pageIndex: 1,
        ordinalOnPage: 37,
        tabLeft: 663.68,
        tabTop: 512.64,
        docusignFieldFamily: 'List',
      },
      candidates: [
        {
          id: 'upload',
          resolvedLabel: 'Proof of Address Document',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          businessSection: 'Attachments',
          docusignTabType: 'SignerAttachment',
          controlCategory: 'attachment_control',
          visible: true,
          editable: false,
        },
        {
          id: 'proof-type',
          resolvedLabel: 'Proof Of Address Type',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Attachments',
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 39,
          tabLeft: 663.68,
          tabTop: 512.64,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('proof-type');
  });

  test('proof_of_bank_account_type is not confused with bank account number', () => {
    const result = selectBestMappingCandidate({
      concept: 'proof_of_bank_account_type',
      currentCandidateId: 'bank-number',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.proofOfBankAccountType',
        businessSection: 'Attachments',
        pageIndex: 1,
        ordinalOnPage: 62,
        tabLeft: 663.68,
        tabTop: 876.8,
        docusignFieldFamily: 'List',
      },
      candidates: [
        {
          id: 'bank-number',
          resolvedLabel: 'Bank Account Number',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          businessSection: 'Banking',
          currentValue: '123456789',
          docusignTabType: 'Text',
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
        {
          id: 'proof-type',
          resolvedLabel: 'Proof Of Bank Account Type',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          businessSection: 'Attachments',
          layoutSectionHeader: 'Bank Info',
          layoutFieldLabel: 'Proof of Bank Account Type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 63,
          tabLeft: 663.68,
          tabTop: 876.8,
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('proof-type');
  });

  test('Business Description needs description-specific proof before mutation', () => {
    const shortUnlabelled = selectBestMappingCandidate({
      concept: 'business_description',
      currentCandidateId: 'description',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessDescription',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 19,
        tabLeft: 35.2,
        tabTop: 348.8,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'description',
        resolvedLabel: null,
        labelSource: 'none',
        labelConfidence: 'none',
        businessSection: 'Business Details',
        docusignTabType: 'Text',
        pageIndex: 1,
        ordinalOnPage: 19,
        tabLeft: 35.2,
        tabTop: 348.8,
        currentValue: 'Retail goods',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const labelled = selectBestMappingCandidate({
      concept: 'business_description',
      currentCandidateId: 'description',
      candidates: [{
        id: 'description',
        resolvedLabel: 'Business Description',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        currentValue: 'Retail goods',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const textareaLike = selectBestMappingCandidate({
      concept: 'business_description',
      currentCandidateId: 'description',
      expectedAnchor: {
        jsonKeyPath: 'merchantData.businessDescription',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 19,
        tabLeft: 35.2,
        tabTop: 348.8,
        docusignFieldFamily: 'Textarea',
      },
      candidates: [{
        id: 'description',
        resolvedLabel: null,
        labelSource: 'none',
        labelConfidence: 'none',
        businessSection: 'Business Details',
        docusignTabType: 'Textarea',
        pageIndex: 1,
        ordinalOnPage: 19,
        tabLeft: 35.2,
        tabTop: 348.8,
        currentValue: 'Retail goods',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(shortUnlabelled.trusted).toBe(false);
    expect(shortUnlabelled.decisionReason).toBe('rejected_insufficient_description_proof');
    expect(labelled.trusted).toBe(true);
    expect(labelled.decisionReason).toBe('trusted_by_label');
    expect(textareaLike.trusted).toBe(true);
    expect(textareaLike.decisionReason).toBe('trusted_by_anchor_and_value_shape');
  });

  test('Business Description layout proof requires the General field-cell label', () => {
    const generalDescription = selectBestMappingCandidate({
      concept: 'business_description',
      currentCandidateId: 'description',
      candidates: [{
        id: 'description',
        resolvedLabel: 'Business Description',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Business Description',
        layoutValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });
    const wrongSection = selectBestMappingCandidate({
      concept: 'business_description',
      currentCandidateId: 'description',
      candidates: [{
        id: 'description',
        resolvedLabel: 'Business Description',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Address',
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Business Description',
        currentValue: 'Retail goods',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(generalDescription.trusted).toBe(true);
    expect(wrongSection.trusted).toBe(false);
    expect(wrongSection.decisionReason).toBe('rejected_section_mismatch');
  });

  test('layout-cell evidence never promotes read-only display fields', () => {
    const result = selectBestMappingCandidate({
      concept: 'business_name',
      currentCandidateId: 'display',
      candidates: [{
        id: 'display',
        resolvedLabel: 'Registered Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Registered Name',
        layoutValueShape: 'text_name_like',
        controlCategory: 'read_only_display',
        visible: true,
        editable: false,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_not_editable_merchant_input');
  });

  test('mapping-blocked findings carry missing proof and human confirmation request', () => {
    const input = mockFindingsInput({
      results: [mockFindingsResult({
        concept: 'postal_code',
        conceptDisplayName: 'Postal Code',
        validationId: 'concept-mapping',
        testName: 'Postal Code skipped',
        status: 'skipped',
        outcome: 'mapping_not_confident',
        targetConfidence: 'mapping_not_confident',
        mappingDecisionReason: 'rejected_value_shape_mismatch',
        mappingShiftReason: 'none',
      })],
    });
    input.calibration.rows = [{
      concept: 'postal_code',
      conceptDisplayName: 'Postal Code',
      currentCandidateFieldIndex: 19,
      selectedCandidate: '#19 Postal Code Address p1 ord41 Text shape=text_name_like @ 35,543',
      decision: 'downgrade_current_mapping_to_unresolved',
      calibrationReason: 'no_unclaimed_neighbor_with_expected_shape',
      mappingDecisionReason: 'rejected_value_shape_mismatch',
      missingProof: ['Need a visible editable Address field with ZIP/postal-code-shaped value or field-local Postal Code label proof.'],
      humanConfirmation: {
        needed: true,
        concept: 'postal_code',
        suspectedFieldLocation: '#19 Postal Code Address p1 ord41 Text shape=text_name_like @ 35,543',
        currentBlocker: 'The current mapped candidate has a text_name_like value shape.',
        requestedEvidence: 'Review a screenshot of #19 and confirm whether it is the visible editable Postal Code input.',
        decisionImpact: 'If confirmed, postal_code can be recalibrated; otherwise it remains mapping-blocked.',
      },
    }];

    const report = buildValidationFindingsReport(input);

    expect(report.mappingBlockedFields[0]!.mappingMissingProof).toContain('Need a visible editable Address field with ZIP/postal-code-shaped value or field-local Postal Code label proof.');
    expect(report.mappingBlockedFields[0]!.humanConfirmation?.requestedEvidence).toContain('Review a screenshot');
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('unresolved dropdown concepts get specific missing-proof diagnostics and human confirmation prompts', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([]),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [{
          tabGuid: 'guid-legal-entity',
          positionalFingerprint: 'page:1|List|ord:10',
          tabLeft: 288,
          tabTop: 287.36,
          jsonKeyPath: 'merchantData.legalEntityType',
          jsonFieldFamily: 'Business Details',
          jsonTypeHint: 'enum',
          docusignFieldFamily: 'List',
          confidence: 'high',
          suggestedDisplayName: 'Legal Entity Type',
          suggestedBusinessSection: 'Business Details',
          layoutSectionHeader: 'General',
          layoutFieldLabel: 'Legal Entity Type',
          layoutValueShape: 'empty',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Federal Tax ID Type'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.legalEntityType',
          jsonFieldFamily: 'Business Details',
          jsonValueSample: 'corporationSType',
          jsonTypeHint: 'enum',
          matchedTabGuid: 'guid-legal-entity',
          matchedRenderedValue: null,
          candidateRenderedPrompt: 'Required - legalEntityType',
          candidateDocuSignFieldFamily: 'List',
          tabPageIndex: 1,
          tabOrdinalOnPage: 10,
          tabLeft: 288,
          tabTop: 287.36,
          layoutSectionHeader: 'General',
          layoutFieldLabel: 'Legal Entity Type',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'empty',
          layoutNeighboringLabels: ['Federal Tax ID Type'],
          layoutEditability: 'editable',
          businessSection: 'Business Details',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (General > Legal Entity Type)',
        }],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });
    const row = calibration.rows.find((entry) => entry.concept === 'legal_entity_type');

    expect(row).toBeTruthy();
    expect(row!.decision).toBe('leave_unresolved');
    expect(row!.missingProof).toContain('Field not found in the safe-mode report.');
    expect(row!.missingProof).toContain('Sample alignment exists, but no live field matched the aligned select/list control in the safe-mode report.');
    expect(row!.missingProof).toContain('Sample layout evidence points to General > Legal Entity Type.');
    expect(row!.missingProof).toContain('A human screenshot is needed to confirm the field label, section, editability, and control family.');
    expect(row!.humanConfirmation?.requestedEvidence).toBe('On page 1 General, is Legal Entity Type an editable dropdown/list or display text?');
  });

  test('physical operating address blockers ask for block visibility instead of a nearby unrelated control', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
          resolvedLabel: 'addressOptions › Required - addressOptions - isLegalAddress',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          docusignTabType: 'Radio',
          inferredType: 'address_option',
          pageIndex: 1,
          ordinalOnPage: 45,
          tabLeft: 211.2,
          tabTop: 577.92,
        }),
        mockField({
          index: 2,
          section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
          resolvedLabel: 'Location Name',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          docusignTabType: 'Text',
          inferredType: 'unknown_manual_review',
          pageIndex: 1,
          ordinalOnPage: 54,
          tabLeft: 35.2,
          tabTop: 712.32,
        }),
      ]),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [{
          tabGuid: 'guid-physical-line1',
          positionalFingerprint: 'page:1|Text|ord:47',
          tabLeft: 35.2,
          tabTop: 627.2,
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Physical Operating Address Line 1',
          suggestedBusinessSection: 'Address',
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['City', 'State'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonValueSample: '124 Uptown Blvd',
          jsonTypeHint: 'string',
          matchedTabGuid: 'guid-physical-line1',
          matchedRenderedValue: '124 Uptown Blvd',
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'Text',
          tabPageIndex: 1,
          tabOrdinalOnPage: 47,
          tabLeft: 35.2,
          tabTop: 627.2,
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'text_name_like',
          layoutNeighboringLabels: ['City', 'State'],
          layoutEditability: 'editable',
          businessSection: 'Address',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Physical Operating Address > Address Line 1)',
        }],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });
    const row = calibration.rows.find((entry) => entry.concept === 'business_mailing_address_line_1');

    expect(row).toBeTruthy();
    expect(row!.missingProof).toContain('Sample layout evidence points to Physical Operating Address > Address Line 1.');
    expect(row!.missingProof).toContain('The Physical Operating Address block may be conditionally hidden unless the signer indicates the operating address differs from the registered legal address.');
    expect(row!.humanConfirmation?.requestedEvidence).toContain('Review a screenshot of the Physical Operating Address section');
    expect(row!.humanConfirmation?.requestedEvidence).not.toContain('#');
  });

  test('physical operating address fields promote only when human proof and an exact live layout target agree', () => {
    const concepts = [
      {
        concept: 'business_mailing_address_line_1',
        conceptDisplayName: 'Business Mailing Address Line 1',
        proofStatus: 'confirmed_editable',
        proofSummary: 'Operator confirmed Physical Operating Address > Address Line 1 is visible and editable.',
        jsonKeyPath: 'merchantData.businessMailingAddress.line1',
        fieldLabel: 'Address Line 1',
        suggestedDisplayName: 'Physical Operating Address Line 1',
        tabType: 'Text',
        ordinalOnPage: 47,
        tabLeft: 35.2,
        tabTop: 627.2,
        layoutValueShape: 'text_name_like',
        jsonValueSample: '124 Uptown Blvd',
      },
      {
        concept: 'business_mailing_city',
        conceptDisplayName: 'Business Mailing Address City',
        proofStatus: 'confirmed_editable',
        proofSummary: 'Operator confirmed Physical Operating Address > City is visible and editable.',
        jsonKeyPath: 'merchantData.businessMailingAddress.city',
        fieldLabel: 'City',
        suggestedDisplayName: 'Physical Operating Address City',
        tabType: 'Text',
        ordinalOnPage: 49,
        tabLeft: 35.2,
        tabTop: 657.92,
        layoutValueShape: 'text_name_like',
        jsonValueSample: 'Charlotte',
      },
      {
        concept: 'business_mailing_state',
        conceptDisplayName: 'Business Mailing Address State',
        proofStatus: 'confirmed_editable_dropdown',
        proofSummary: 'Operator confirmed Physical Operating Address > State is visible and editable as a dropdown/list.',
        jsonKeyPath: 'merchantData.businessMailingAddress.state',
        fieldLabel: 'State',
        suggestedDisplayName: 'Physical Operating Address State',
        tabType: 'List',
        ordinalOnPage: 50,
        tabLeft: 348.8,
        tabTop: 660.48,
        layoutValueShape: 'empty',
        jsonValueSample: 'NC',
      },
      {
        concept: 'business_mailing_postal_code',
        conceptDisplayName: 'Business Mailing Address Postal Code',
        proofStatus: 'confirmed_editable',
        proofSummary: 'Operator confirmed Physical Operating Address > ZIP is visible and editable.',
        jsonKeyPath: 'merchantData.businessMailingAddress.postalCode',
        fieldLabel: 'ZIP',
        suggestedDisplayName: 'Physical Operating Address ZIP',
        tabType: 'Text',
        ordinalOnPage: 51,
        tabLeft: 567.04,
        tabTop: 657.92,
        layoutValueShape: 'postal_code',
        jsonValueSample: '28202',
      },
    ] as const;

    const baseInput = {
      report: mockValidationReport(concepts.map((entry, index) =>
        mockField({
          index: index + 1,
          section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
          resolvedLabel: null,
          labelSource: 'none',
          labelConfidence: 'none',
          docusignTabType: entry.tabType,
          inferredType: entry.tabType === 'List' ? 'state' : 'unknown_manual_review',
          pageIndex: 1,
          ordinalOnPage: entry.ordinalOnPage,
          tabLeft: entry.tabLeft,
          tabTop: entry.tabTop,
          visible: false,
          editable: false,
          observedValueLikeTextNearControl: null,
        }),
      )),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: concepts.map((entry) => ({
          tabGuid: `guid-${entry.concept}`,
          positionalFingerprint: `page:1|${entry.tabType}|ord:${entry.ordinalOnPage}`,
          tabLeft: entry.tabLeft,
          tabTop: entry.tabTop,
          jsonKeyPath: entry.jsonKeyPath,
          jsonFieldFamily: 'Address',
          jsonTypeHint: entry.concept === 'business_mailing_state' ? 'state' : 'string',
          docusignFieldFamily: entry.tabType,
          confidence: 'high',
          suggestedDisplayName: entry.suggestedDisplayName,
          suggestedBusinessSection: 'Address',
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: entry.fieldLabel,
          layoutValueShape: entry.layoutValueShape,
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
        })),
      },
      alignment: {
        rows: concepts.map((entry) => ({
          jsonKeyPath: entry.jsonKeyPath,
          jsonFieldFamily: 'Address',
          jsonValueSample: entry.jsonValueSample,
          jsonTypeHint: entry.concept === 'business_mailing_state' ? 'state' : 'string',
          matchedTabGuid: `guid-${entry.concept}`,
          matchedRenderedValue: entry.tabType === 'Text' ? entry.jsonValueSample : null,
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: entry.tabType,
          tabPageIndex: 1,
          tabOrdinalOnPage: entry.ordinalOnPage,
          tabLeft: entry.tabLeft,
          tabTop: entry.tabTop,
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: entry.fieldLabel,
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: entry.layoutValueShape,
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
          businessSection: 'Address',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: `matched using PDF/MHTML field-cell evidence (Physical Operating Address > ${entry.fieldLabel})`,
        })),
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    };

    const withoutProof = buildMappingCalibration(baseInput);
    for (const entry of concepts) {
      const row = withoutProof.rows.find((candidate) => candidate.concept === entry.concept);
      expect(row).toBeTruthy();
      expect(row!.decision).toBe('downgrade_current_mapping_to_unresolved');
      expect(row!.humanConfirmation).not.toBeNull();
    }

    const withProof = buildMappingCalibration({
      ...baseInput,
      humanProof: {
        byConcept: {
          business_mailing_address_line_1: {
            status: 'confirmed_editable',
            summary: 'Operator confirmed Physical Operating Address > Address Line 1 is visible and editable.',
          },
          business_mailing_city: {
            status: 'confirmed_editable',
            summary: 'Operator confirmed Physical Operating Address > City is visible and editable.',
          },
          business_mailing_state: {
            status: 'confirmed_editable_dropdown',
            summary: 'Operator confirmed Physical Operating Address > State is visible and editable as a dropdown/list.',
          },
          business_mailing_postal_code: {
            status: 'confirmed_editable',
            summary: 'Operator confirmed Physical Operating Address > ZIP is visible and editable.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
    });
    for (const entry of concepts) {
      const row = withProof.rows.find((candidate) => candidate.concept === entry.concept);
      expect(row).toBeTruthy();
      expect(row!.decision).toBe('trust_current_mapping');
      expect(row!.appliedHumanProof?.status).toBe(entry.proofStatus);
      expect(row!.humanConfirmation).toBeNull();
    }

    const mismatchOnly = buildMappingCalibration({
      ...baseInput,
      report: mockValidationReport([
        mockField({
          index: 1,
          section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 47,
          tabLeft: 35.2,
          tabTop: 640,
          visible: false,
          editable: false,
        }),
      ]),
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [{
          tabGuid: 'guid-business_mailing_address_line_1',
          positionalFingerprint: 'page:1|Text|ord:47',
          tabLeft: 35.2,
          tabTop: 627.2,
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Physical Operating Address Line 1',
          suggestedBusinessSection: 'Address',
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonValueSample: '124 Uptown Blvd',
          jsonTypeHint: 'string',
          matchedTabGuid: 'guid-business_mailing_address_line_1',
          matchedRenderedValue: '124 Uptown Blvd',
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'Text',
          tabPageIndex: 1,
          tabOrdinalOnPage: 47,
          tabLeft: 35.2,
          tabTop: 627.2,
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'text_name_like',
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
          businessSection: 'Address',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Physical Operating Address > Address Line 1)',
        }],
      },
      humanProof: {
        byConcept: {
          business_mailing_address_line_1: {
            status: 'confirmed_editable',
            summary: 'Operator confirmed Physical Operating Address > Address Line 1 is visible and editable.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      physicalAddressProbe: {
        generatedAt: '2026-04-28T00:00:02.000Z',
        toggleCandidateLabel: 'Required - addressOptions - isOperatingAddress',
        toggleAction: 'selected',
        discoveryCounts: {
          discoveredFieldsBefore: 102,
          discoveredFieldsAfter: 100,
          labeledPhysicalAddressFieldsBefore: 0,
          labeledPhysicalAddressFieldsAfter: 0,
        },
        snapshots: [{
          stage: 'after-toggle',
          capturedAt: '2026-04-28T00:00:02.000Z',
          anchorLabel: 'Required - addressOptions - isOperatingAddress',
          counts: {
            candidateDocTabs: 1,
            visibleInputs: 7,
            visibleControlCandidates: 7,
            visibleControlsOutsideDocTab: 0,
            physicalOperatingAddressMentionControls: 0,
          },
          nearbyText: [],
          keywordText: [{
            text: 'Required - addressOptions - isOperatingAddress',
            keywords: ['isOperatingAddress'],
            source: 'nearby',
            left: 599.44,
            top: 611.91,
          }],
          nearbyControls: [
            {
              tagName: 'INPUT',
              inputType: 'radio',
              role: 'radio',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: 'addressOptions',
              dataType: 'Radio',
              left: 599.44,
              top: 611.91,
              width: 18,
              height: 18,
              visible: true,
              editable: true,
              checked: true,
              withinDocTab: true,
              nearestSectionText: 'Required - addressOptions - isOperatingAddress',
              labelText: 'addressOptions',
              keywordMatches: [],
              valueShape: 'checked',
            },
            {
              tagName: 'INPUT',
              inputType: 'text',
              role: 'textbox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'Text',
              left: 233.44,
              top: 747.31,
              width: 376,
              height: 22,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'Text',
              keywordMatches: [],
              valueShape: 'text_like',
            },
            {
              tagName: 'SELECT',
              inputType: null,
              role: 'combobox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'List',
              left: 609.77,
              top: 748.59,
              width: 69,
              height: 17,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'List',
              keywordMatches: [],
              valueShape: 'selected',
            },
            {
              tagName: 'INPUT',
              inputType: 'text',
              role: 'textbox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'Text',
              left: 797.28,
              top: 747.31,
              width: 188,
              height: 20,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'Text',
              keywordMatches: [],
              valueShape: 'blank',
            },
            {
              tagName: 'INPUT',
              inputType: 'text',
              role: 'textbox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'Text',
              left: 233.44,
              top: 801.08,
              width: 374,
              height: 22,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'Text',
              keywordMatches: [],
              valueShape: 'text_like',
            },
            {
              tagName: 'INPUT',
              inputType: 'text',
              role: 'textbox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'Text',
              left: 609.13,
              top: 801.08,
              width: 308.25,
              height: 22,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'Text',
              keywordMatches: [],
              valueShape: 'text_like',
            },
            {
              tagName: 'INPUT',
              inputType: 'text',
              role: 'textbox',
              ariaLabel: null,
              ariaLabelledBy: null,
              name: null,
              dataType: 'Text',
              left: 861.28,
              top: 801.08,
              width: 122,
              height: 22,
              visible: true,
              editable: true,
              checked: null,
              withinDocTab: true,
              nearestSectionText: 'addressOptions',
              labelText: 'Text',
              keywordMatches: [],
              valueShape: 'text_like',
            },
          ],
          matchingControls: [],
        }],
        observations: [],
      },
    });
    const mismatchRow = mismatchOnly.rows.find((candidate) => candidate.concept === 'business_mailing_address_line_1');

    expect(mismatchRow).toBeTruthy();
    expect(mismatchRow!.decision).not.toMatch(/^trust_/);
    expect(mismatchRow!.missingProof.some((entry) => entry.includes(PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX))).toBe(true);
    expect(mismatchRow!.missingProof).toContain('Operator confirmed Physical Operating Address > Address Line 1 is visible and editable. The saved safe-mode report still does not surface a matching field-local Physical Operating Address target.');
    expect(mismatchOnly.findings.join(' ')).toContain(PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION);
  });

  test('post-toggle capture blockers prefer capture-isolation wording over screenshot recapture', () => {
    const baseInput = {
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    };
    const calibration = buildMappingCalibration({
      ...baseInput,
      report: mockValidationReport([
        mockField({
          index: 41,
          acceptedLabel: 'Required - legalState',
          rawCandidateLabels: [{ source: 'label-for', value: 'Required - legalState' }],
          docusignTabType: 'List',
          inferredType: 'state',
          inferredClassification: 'manual_review',
          currentValueShape: 'state_like',
          pageIndex: 1,
          ordinalOnPage: 43,
          tabLeft: 548.33,
          tabTop: 579.63,
        }),
        mockField({
          index: 47,
          acceptedLabel: 'Required',
          rawCandidateLabels: [{ source: 'label-for', value: 'Required' }],
          docusignTabType: 'Text',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_like',
          pageIndex: 1,
          ordinalOnPage: 47,
          tabLeft: 35.2,
          tabTop: 640,
          visible: false,
          editable: false,
        }),
      ]),
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [{
          tabGuid: 'guid-business_mailing_address_line_1',
          positionalFingerprint: 'page:1|Text|ord:47',
          tabLeft: 35.2,
          tabTop: 627.2,
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonTypeHint: 'string',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Physical Operating Address Line 1',
          suggestedBusinessSection: 'Address',
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.businessMailingAddress.line1',
          jsonFieldFamily: 'Address',
          jsonValueSample: '124 Uptown Blvd',
          jsonTypeHint: 'string',
          matchedTabGuid: 'guid-business_mailing_address_line_1',
          matchedRenderedValue: '124 Uptown Blvd',
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'Text',
          tabPageIndex: 1,
          tabOrdinalOnPage: 47,
          tabLeft: 35.2,
          tabTop: 627.2,
          layoutSectionHeader: 'Physical Operating Address',
          layoutFieldLabel: 'Address Line 1',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'text_name_like',
          layoutNeighboringLabels: ['Address Line 1', 'City', 'State', 'ZIP'],
          layoutEditability: 'editable',
          businessSection: 'Address',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Physical Operating Address > Address Line 1)',
        }],
      },
      humanProof: {
        byConcept: {
          business_mailing_address_line_1: {
            status: 'confirmed_editable',
            summary: 'Operator confirmed Physical Operating Address > Address Line 1 is visible and editable.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      physicalAddressProbe: {
        generatedAt: '2026-04-28T00:00:02.000Z',
        toggleCandidateLabel: 'Required - addressOptions - isOperatingAddress',
        toggleAction: 'selected',
        discoveryCounts: {
          discoveredFieldsBefore: 102,
          discoveredFieldsAfter: 100,
          labeledPhysicalAddressFieldsBefore: 0,
          labeledPhysicalAddressFieldsAfter: 0,
        },
        snapshots: [],
        observations: [],
      },
      physicalAddressPostToggleCapture: {
        generatedAt: '2026-04-28T00:00:03.000Z',
        anchorLabel: 'Required - addressOptions - isOperatingAddress',
        anchorLeft: 407.44,
        anchorTop: 611.91,
        captureBounds: {
          left: 0,
          top: 0,
          width: 1304,
          height: 4641,
        },
        textNodes: [],
        controls: [],
        observations: [
          'No field-local Physical Operating Address leaf labels were recovered inside the post-toggle capture bounds.',
          'The post-toggle capture bounds still include controls outside .doc-tab.',
        ],
      },
    });
    const row = calibration.rows.find((entry) => entry.concept === 'business_mailing_address_line_1');

    expect(row).toBeTruthy();
    expect(row!.missingProof.some((entry) => entry.startsWith(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX))).toBe(true);
    expect(row!.missingProof.some((entry) => entry.startsWith(PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX))).toBe(false);
    expect(calibration.findings.join(' ')).toContain(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION);
  });

  test('country blockers without sample layout proof ask whether the control exists or is display-only', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([]),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.registeredLegalAddress.country',
          jsonFieldFamily: 'Address',
          jsonValueSample: 'US',
          jsonTypeHint: 'country',
          matchedTabGuid: null,
          matchedRenderedValue: null,
          candidateRenderedPrompt: null,
          candidateDocuSignFieldFamily: null,
          tabPageIndex: null,
          tabOrdinalOnPage: null,
          tabLeft: null,
          tabTop: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          layoutEvidenceSource: null,
          layoutValueShape: null,
          layoutNeighboringLabels: [],
          layoutEditability: null,
          businessSection: 'Address',
          confidence: 'none',
          matchingMethod: 'unmatched',
          notes: 'no rendered value matched any variant',
        }],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });
    const row = calibration.rows.find((entry) => entry.concept === 'registered_country');

    expect(row).toBeTruthy();
    expect(row!.missingProof).toContain('No sample PDF/MHTML layout evidence currently proves a separate Registered Legal Address Country control in this saved US flow.');
    expect(row!.humanConfirmation?.requestedEvidence).toContain('Registered Legal Address section');
    expect(row!.humanConfirmation?.requestedEvidence).toContain('omitted or display-only');
  });

  test('registered country omission proof keeps the field omitted and does not infer it from other visible dropdowns', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([]),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.registeredLegalAddress.country',
          jsonFieldFamily: 'Address',
          jsonValueSample: 'US',
          jsonTypeHint: 'country',
          matchedTabGuid: null,
          matchedRenderedValue: null,
          candidateRenderedPrompt: null,
          candidateDocuSignFieldFamily: null,
          tabPageIndex: null,
          tabOrdinalOnPage: null,
          tabLeft: null,
          tabTop: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          layoutEvidenceSource: null,
          layoutValueShape: null,
          layoutNeighboringLabels: [],
          layoutEditability: null,
          businessSection: 'Address',
          confidence: 'none',
          matchingMethod: 'unmatched',
          notes: 'no rendered value matched any variant',
        }],
      },
      humanProof: {
        byConcept: {
          registered_country: {
            status: 'confirmed_omitted_or_hidden',
            summary: 'Operator confirmed Registered Legal Address Country is omitted or not signer-editable in this flow.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });
    const row = calibration.rows.find((entry) => entry.concept === 'registered_country');

    expect(row).toBeTruthy();
    expect(row!.decision).toBe('leave_unresolved');
    expect(row!.appliedHumanProof?.status).toBe('confirmed_omitted_or_hidden');
    expect(row!.humanConfirmation).toBeNull();
    expect(row!.missingProof).toContain('Do not infer this missing country field from other visible country dropdowns in the flow.');
  });

  test('proof-confirmed omitted and still-blocked address fields stay separate from product findings', () => {
    const input = mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    });
    input.calibration.rows = [
      {
        concept: 'registered_state',
        conceptDisplayName: 'Registered Legal Address State',
        currentCandidateFieldIndex: 63,
        selectedCandidate: '#63 Registered Legal Address State',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
      {
        concept: 'registered_country',
        conceptDisplayName: 'Registered Legal Address Country',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'no_unclaimed_neighbor_with_expected_shape',
        mappingDecisionReason: 'rejected_insufficient_label_proof',
        missingProof: [
          'Operator confirmed Registered Legal Address Country is omitted or not signer-editable in this flow.',
          'Do not infer this missing country field from other visible country dropdowns in the flow.',
        ],
        appliedHumanProof: {
          status: 'confirmed_omitted_or_hidden',
          summary: 'Operator confirmed Registered Legal Address Country is omitted or not signer-editable in this flow.',
        },
        humanConfirmation: null,
      },
      {
        concept: 'business_mailing_city',
        conceptDisplayName: 'Business Mailing Address City',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'none',
        mappingDecisionReason: 'rejected_section_mismatch',
        missingProof: [
          'Sample layout evidence points to Physical Operating Address > City.',
          'Operator confirmed Physical Operating Address > City is visible and editable. The saved safe-mode report still does not surface a matching field-local Physical Operating Address target.',
        ],
        appliedHumanProof: {
          status: 'confirmed_editable',
          summary: 'Operator confirmed Physical Operating Address > City is visible and editable.',
        },
        humanConfirmation: null,
      },
    ];

    const report = buildValidationFindingsReport(input);
    const markdown = renderValidationFindingsMarkdown(report);

    expect(report.likelyProductValidationFindings.map((finding) => finding.concept)).toEqual(['registered_state']);
    expect(report.remainingCalibrationBlockers.map((blocker) => blocker.concept)).toEqual([
      'registered_country',
      'business_mailing_city',
    ]);
    expect(report.executiveSummary.join(' ')).toContain('intentionally omitted or not signer-editable in this flow');
    expect(report.executiveSummary.join(' ')).toContain('have operator proof recorded, but the saved safe-mode report still lacks a matching field-local live target');
    expect(report.executiveSummary.join(' ')).not.toContain('Registered Legal Address Country remain unresolved calibration blockers outside this rerun scope and still need human proof');
    expect(markdown).toContain('Flow omission confirmed');
    expect(markdown).toContain('Human proof recorded; live mapping still insufficient');
    expect(markdown).toContain('do not infer it from other visible country dropdowns');
  });

  test('probe-observed physical operating blockers ask for a post-toggle capture instead of geometry promotion', () => {
    const input = mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    });
    input.calibration.rows = [
      {
        concept: 'registered_state',
        conceptDisplayName: 'Registered Legal Address State',
        currentCandidateFieldIndex: 63,
        selectedCandidate: '#63 Registered Legal Address State',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
      {
        concept: 'business_mailing_city',
        conceptDisplayName: 'Business Mailing Address City',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'none',
        mappingDecisionReason: 'rejected_section_mismatch',
        missingProof: [
          `${PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX} (first row: Text / List / Text; next row: Text / Text / Text) and found no direct Physical Operating Address / Address Line 1 / City / State / ZIP keyword matches.`,
          'Operator confirmed Physical Operating Address > City is visible and editable. The saved safe-mode report still does not surface a matching field-local Physical Operating Address target.',
        ],
        appliedHumanProof: {
          status: 'confirmed_editable',
          summary: 'Operator confirmed Physical Operating Address > City is visible and editable.',
        },
        humanConfirmation: null,
      },
    ];

    const report = buildValidationFindingsReport(input);
    const markdown = renderValidationFindingsMarkdown(report);

    expect(report.executiveSummary.join(' ')).toContain('guarded post-toggle DOM probe still exposed only generic unlabeled controls after isOperatingAddress');
    expect(report.recommendedNextToolingWork).toContain(`For proof-recorded Physical Operating Address blockers, ${PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION}`);
    expect(markdown).toContain(PHYSICAL_ADDRESS_PROBE_GENERIC_CONTROLS_PREFIX);
    expect(markdown).toContain(PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION);
  });

  test('post-toggle capture blockers ask for capture refinement instead of recapturing the same artifacts', () => {
    const input = mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          validationId: 'invalid-state-rejected',
          testName: 'invalid state rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
          controlKind: 'native-select',
          optionsDiscoverable: true,
        }),
      ],
    });
    input.calibration.rows = [
      {
        concept: 'registered_state',
        conceptDisplayName: 'Registered Legal Address State',
        currentCandidateFieldIndex: 63,
        selectedCandidate: '#63 Registered Legal Address State',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
      },
      {
        concept: 'business_mailing_city',
        conceptDisplayName: 'Business Mailing Address City',
        currentCandidateFieldIndex: null,
        selectedCandidate: null,
        decision: 'leave_unresolved',
        calibrationReason: 'none',
        mappingDecisionReason: 'rejected_section_mismatch',
        missingProof: [
          `${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX}; the capture bounds still included controls outside .doc-tab and the capture bounds expanded to near page scale, so the block is not isolated enough for geometry-only assignment.`,
          'Operator confirmed Physical Operating Address > City is visible and editable. The saved safe-mode report still does not surface a matching field-local Physical Operating Address target.',
        ],
        appliedHumanProof: {
          status: 'confirmed_editable',
          summary: 'Operator confirmed Physical Operating Address > City is visible and editable.',
        },
        humanConfirmation: null,
      },
    ];

    const report = buildValidationFindingsReport(input);
    const markdown = renderValidationFindingsMarkdown(report);

    expect(report.executiveSummary.join(' ')).toContain('guarded post-toggle structure capture now runs after isOperatingAddress, but it still does not isolate field-local Physical Operating Address labels');
    expect(report.recommendedNextToolingWork).toContain(`For proof-recorded Physical Operating Address blockers, ${PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION}`);
    expect(markdown).toContain(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_PREFIX);
    expect(markdown).toContain(PHYSICAL_ADDRESS_POST_TOGGLE_CAPTURE_REFINEMENT_RECOMMENDATION);
    expect(markdown).not.toContain(PHYSICAL_ADDRESS_PROBE_CAPTURE_RECOMMENDATION);
  });

  test('controlled-choice calibration diagnostics do not emit sensitive values', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          section: 'Bead Onboarding Application US-02604-1.pdf Page 1 of 4.',
          rawCandidateLabels: [
            { source: 'preceding-text', value: '123456789 Required' },
            { source: 'label-for', value: 'Required - bankAccountType' },
          ],
          rejectedLabelCandidates: [
            { source: 'preceding-text', value: '123456789 Required', reason: 'equals-field-value' },
            { source: 'label-for', value: 'Required - bankAccountType', reason: 'docusign-stub' },
          ],
          observedValueLikeTextNearControl: '123456789',
          currentValueShape: 'numeric',
          docusignTabType: 'Text',
          inferredType: 'account_number',
          inferredClassification: 'manual_review',
          pageIndex: 1,
          ordinalOnPage: 63,
          tabLeft: 663.68,
          tabTop: 876.8,
        }),
      ]),
      targetDiagnostics: {
        schemaVersion: 1,
        runStartedAt: '2026-04-28T00:00:00.000Z',
        runFinishedAt: '2026-04-28T00:00:01.000Z',
        summary: {
          total: 0,
          trusted: 0,
          tool_mapping_suspect: 0,
          mapping_not_confident: 0,
          error_ownership_suspect: 0,
          product_failure: 0,
          observer_ambiguous: 0,
          passed: 0,
          skipped: 0,
          manual_review: 0,
        },
        rows: [],
      },
      enrichment: {
        schemaVersion: 1,
        generatedAt: '2026-04-28T00:00:00.000Z',
        sourceJson: 'sample.json',
        sourceMhtml: 'sample.mhtml',
        records: [{
          tabGuid: 'guid-proof-bank-account',
          positionalFingerprint: 'page:1|List|ord:62',
          tabLeft: 663.68,
          tabTop: 876.8,
          jsonKeyPath: 'merchantData.proofOfBankAccountType',
          jsonFieldFamily: 'Attachments',
          jsonTypeHint: 'enum',
          docusignFieldFamily: 'List',
          confidence: 'high',
          suggestedDisplayName: 'Proof Of Bank Account Type',
          suggestedBusinessSection: 'Attachments',
          layoutSectionHeader: 'Bank Info',
          layoutFieldLabel: 'Proof of Bank Account Type',
          layoutValueShape: 'empty',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Account Type'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.proofOfBankAccountType',
          jsonFieldFamily: 'Attachments',
          jsonValueSample: 'colorizedVoidCheck',
          jsonTypeHint: 'enum',
          matchedTabGuid: 'guid-proof-bank-account',
          matchedRenderedValue: null,
          candidateRenderedPrompt: 'Required - proofOfBankAccountType',
          candidateDocuSignFieldFamily: 'List',
          tabPageIndex: 1,
          tabOrdinalOnPage: 62,
          tabLeft: 663.68,
          tabTop: 876.8,
          layoutSectionHeader: 'Bank Info',
          layoutFieldLabel: 'Proof of Bank Account Type',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'empty',
          layoutNeighboringLabels: ['Account Type'],
          layoutEditability: 'editable',
          businessSection: 'Attachments',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Bank Info > Proof of Bank Account Type)',
        }],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });
    const rowText = JSON.stringify(calibration.rows.find((entry) => entry.concept === 'proof_of_bank_account_type'));

    expect(rowText).not.toContain('123456789');
  });

  test('trusted findings do not request human mapping confirmation', () => {
    const input = mockFindingsInput({
      results: [mockFindingsResult({
        concept: 'business_name',
        conceptDisplayName: 'Business Name',
        validationId: 'very-short-behavior',
        testName: 'Business Name rejects very short text',
        status: 'passed',
        outcome: 'passed',
        targetConfidence: 'trusted',
        mappingDecisionReason: 'trusted_by_label',
        mappingShiftReason: 'none',
      })],
    });
    input.calibration.rows = [{
      concept: 'business_name',
      conceptDisplayName: 'Business Name',
      currentCandidateFieldIndex: 5,
      selectedCandidate: '#5 Registered Name Business Details p1 ord5 Text shape=text_name_like editable=editable layout=General > Registered Name @ 35,224',
      decision: 'trust_current_mapping',
      calibrationReason: 'none',
      mappingDecisionReason: 'trusted_by_label',
      missingProof: [],
      humanConfirmation: null,
    }];

    const report = buildValidationFindingsReport(input);

    expect(report.trustedExecutedObservations[0]!.humanConfirmation).toBeNull();
    expect(report.mappingBlockedFields).toEqual([]);
  });

  test('INTERACTIVE_CONCEPTS filters the interactive target set and normalizes supported aliases', () => {
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'stakeholder_email,stakeholder_phone,stakeholder_date_of_birth,registered_postal_code,ownership_percentage',
    } as NodeJS.ProcessEnv)).toEqual([
      'stakeholder_email',
      'stakeholder_phone',
      'date_of_birth',
      'postal_code',
      'ownership_percentage',
    ]);
  });

  test('website matrix uses URL cases and observes missing protocol separately', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Website',
        label: 'Website',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'website',
        inferredClassification: 'inferred_best_practice',
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'website',
    } as NodeJS.ProcessEnv);

    const valid = plan.cases.find((entry) => entry.concept === 'website' && entry.validationId === 'valid-https-accepted')!;
    const missingProtocol = plan.cases.find((entry) => entry.concept === 'website' && entry.validationId === 'missing-protocol-behavior')!;
    const malformed = plan.cases.find((entry) => entry.concept === 'website' && entry.validationId === 'malformed-url-rejected')!;

    expect(valid.inputValue).toBe('https://example.test');
    expect(missingProtocol.inputValue).toBe('example.test');
    expect(missingProtocol.expectedSignal).toBe('observe');
    expect(malformed.inputValue).toBe('not a url');
    expect(plan.targetConcepts).toEqual(['website']);
  });

  test('interactive plan uses trusted mapping calibration when scorecard mapping is otherwise not confident', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-calibration-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [
        {
          concept: 'website',
          conceptDisplayName: 'Website',
          currentCandidateFieldIndex: null,
          selectedCandidate: '#1 (unresolved) p1 ord1 Text shape=url @ 10,10',
          decision: 'trust_likely_better_candidate',
          calibrationReason: 'page1_anchor_drift_after_website',
          mappingDecisionReason: 'trusted_by_anchor_and_value_shape',
        },
      ],
    }), 'utf8');

    try {
      const plan = buildInteractiveValidationPlan(mockValidationReport([
        mockField({
          index: 1,
          observedValueLikeTextNearControl: 'https://example.test',
        }),
      ]), {
        INTERACTIVE_CONCEPTS: 'website',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases.map((entry) => entry.validationId)).toContain('valid-https-accepted');
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 1)).toBe(true);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('interactive plan does not let calibration fallback displace an existing confident mapping', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-calibration-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [
        {
          concept: 'date_of_birth',
          conceptDisplayName: 'Date Of Birth',
          currentCandidateFieldIndex: 1,
          selectedCandidate: '#1 textbox / unknown_manual_review (high)',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_date_tab_and_value_shape',
        },
      ],
    }), 'utf8');

    try {
      const plan = buildInteractiveValidationPlan(mockValidationReport([
        mockField({
          index: 1,
          observedValueLikeTextNearControl: 'not-a-date',
        }),
        mockField({
          index: 2,
          resolvedLabel: 'Date Of Birth',
          label: 'Date Of Birth',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          inferredType: 'date_of_birth',
          inferredClassification: 'inferred_best_practice',
        }),
      ]), {
        INTERACTIVE_CONCEPTS: 'date_of_birth',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 2)).toBe(true);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('date matrix uses YYYY/MM/DD as valid input and observes MM/DD/YYYY separately', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        resolvedLabel: 'Date Of Birth',
        label: 'Date Of Birth',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'date_of_birth',
        inferredClassification: 'inferred_best_practice',
      }),
      mockField({
        index: 2,
        resolvedLabel: 'Registration Date',
        label: 'Registration Date',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'formation_date',
        inferredClassification: 'inferred_best_practice',
      }),
    ]));

    const dobValid = plan.cases.find((entry) => entry.concept === 'date_of_birth' && entry.validationId === 'valid-adult-dob-accepted')!;
    const dobFormat = plan.cases.find((entry) => entry.concept === 'date_of_birth' && entry.validationId === 'accepted-date-format-documented')!;
    const registrationValid = plan.cases.find((entry) => entry.concept === 'registration_date' && entry.validationId === 'valid-date-accepted')!;
    const registrationFormat = plan.cases.find((entry) => entry.concept === 'registration_date' && entry.validationId === 'accepted-date-format-documented')!;

    expect(dobValid.inputValue).toBe('1990/01/15');
    expect(dobFormat.inputValue).toBe('01/15/1990');
    expect(dobFormat.expectedSignal).toBe('observe');
    expect(registrationValid.inputValue).toBe('2020/06/15');
    expect(registrationFormat.inputValue).toBe('06/15/2020');
    expect(registrationFormat.expectedSignal).toBe('observe');
  });

  test('stakeholder batch builds stakeholder contact cases and keeps DOB separate from registration date', () => {
    const plan = buildInteractiveValidationPlan(mockValidationReport([
      mockField({
        index: 1,
        section: 'Stakeholder',
        resolvedLabel: 'stakeholders #0 › Email',
        label: 'stakeholders #0 › Email',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'email',
        inferredClassification: 'inferred_best_practice',
        docusignTabType: 'Email',
        enrichment: {
          jsonKeyPath: 'merchantData.stakeholders[0].email',
          matchedBy: 'guid',
          confidence: 'high',
          suggestedDisplayName: 'stakeholders #0 › Email',
          suggestedBusinessSection: 'Stakeholder',
        },
      }),
      mockField({
        index: 2,
        section: 'Stakeholder',
        resolvedLabel: 'stakeholders #0 › Phone Number',
        label: 'stakeholders #0 › Phone Number',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'phone_e164',
        inferredClassification: 'inferred_best_practice',
        enrichment: {
          jsonKeyPath: 'merchantData.stakeholders[0].phoneNumber',
          matchedBy: 'guid',
          confidence: 'high',
          suggestedDisplayName: 'stakeholders #0 › Phone Number',
          suggestedBusinessSection: 'Stakeholder',
        },
      }),
      mockField({
        index: 3,
        section: 'Stakeholder',
        resolvedLabel: 'stakeholders #0 › Date Of Birth',
        label: 'stakeholders #0 › Date Of Birth',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'date_of_birth',
        inferredClassification: 'inferred_best_practice',
        docusignTabType: 'Date',
        enrichment: {
          jsonKeyPath: 'merchantData.stakeholders[0].dateOfBirth',
          matchedBy: 'guid',
          confidence: 'high',
          suggestedDisplayName: 'stakeholders #0 › Date Of Birth',
          suggestedBusinessSection: 'Stakeholder',
        },
      }),
      mockField({
        index: 4,
        section: 'Stakeholder',
        resolvedLabel: 'stakeholders #0 › Ownership Percentage',
        label: 'stakeholders #0 › Ownership Percentage',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'ownership_percent',
        inferredClassification: 'inferred_best_practice',
        enrichment: {
          jsonKeyPath: 'merchantData.stakeholders[0].ownershipPercentage',
          matchedBy: 'guid',
          confidence: 'high',
          suggestedDisplayName: 'stakeholders #0 › Ownership Percentage',
          suggestedBusinessSection: 'Stakeholder',
        },
      }),
      mockField({
        index: 5,
        section: 'Business Details',
        resolvedLabel: 'Registration Date',
        label: 'Registration Date',
        labelSource: 'aria-label',
        labelConfidence: 'high',
        inferredType: 'formation_date',
        inferredClassification: 'inferred_best_practice',
        enrichment: {
          jsonKeyPath: 'merchantData.registrationDate',
          matchedBy: 'guid',
          confidence: 'high',
          suggestedDisplayName: 'Registration Date',
          suggestedBusinessSection: 'Business Details',
        },
      }),
    ]), {
      INTERACTIVE_CONCEPTS: 'stakeholder_email,stakeholder_phone,stakeholder_date_of_birth,ownership_percentage',
    } as NodeJS.ProcessEnv);

    expect(plan.skippedConcepts).toEqual([]);
    expect(plan.targetConcepts).toEqual(['stakeholder_email', 'stakeholder_phone', 'date_of_birth', 'ownership_percentage']);

    expect(plan.cases.filter((entry) => entry.concept === 'stakeholder_email').map((entry) => entry.validationId)).toEqual([
      'valid-email-accepted',
      'missing-at-rejected',
      'invalid-domain-rejected',
      'spaces-rejected',
    ]);

    const stakeholderPhoneCases = plan.cases.filter((entry) => entry.concept === 'stakeholder_phone');
    expect(stakeholderPhoneCases.map((entry) => entry.validationId)).toEqual([
      'valid-e164-accepted',
      'missing-plus-handling',
      'letters-rejected',
      'too-short-rejected',
      'too-long-rejected',
    ]);
    expect(stakeholderPhoneCases.find((entry) => entry.validationId === 'too-long-rejected')!.expectedSignal).toBe('observe');

    const dobCases = plan.cases.filter((entry) => entry.concept === 'date_of_birth');
    expect(dobCases.every((entry) => entry.targetField.fieldIndex === 3)).toBe(true);
    expect(dobCases.find((entry) => entry.validationId === 'future-date-rejected')!.expectedSignal).toBe('observe');
    expect(dobCases.find((entry) => entry.validationId === 'under-age-dob-rejected-or-flagged')!.expectedSignal).toBe('observe');
    expect(plan.cases.some((entry) => entry.concept === 'registration_date')).toBe(false);
  });
});

function mockField(overrides: Partial<FieldRecord> = {}): FieldRecord {
  const field: FieldRecord = {
    kind: 'textbox',
    index: 1,
    section: 'Mock section',
    label: null,
    resolvedLabel: null,
    labelSource: 'none',
    labelConfidence: 'none',
    rawCandidateLabels: [],
    rejectedLabelCandidates: [],
    labelLooksLikeValue: false,
    observedValueLikeTextNearControl: null,
    idOrNameKey: null,
    attachmentEvidence: 'none',
    groupName: null,
    placeholder: null,
    ariaLabel: null,
    title: null,
    describedBy: null,
    helperText: null,
    type: 'text',
    inputMode: null,
    autocomplete: null,
    pattern: null,
    minLength: null,
    maxLength: null,
    required: true,
    docusignTabType: null,
    visible: true,
    editable: true,
    controlCategory: 'merchant_input',
    inferredType: 'unknown_manual_review',
    inferredClassification: 'manual_review',
    locatorConfidence: 'css-fallback',
    checks: [],
    enrichment: null,
    tabGuid: null,
    pageIndex: null,
    ordinalOnPage: null,
    tabLeft: null,
    tabTop: null,
    tabWidth: null,
    tabHeight: null,
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'label')) field.label = field.resolvedLabel;
  return field;
}

type MockDiscoveredFieldOverrides = Partial<Omit<DiscoveredField, 'inferredType'>> & {
  inferredType?: DiscoveredField['inferredType'] | string;
};

function mockDiscoveredField(overrides: MockDiscoveredFieldOverrides = {}): DiscoveredField {
  const field = {
    kind: 'combobox',
    index: 1,
    sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
    label: null,
    placeholder: null,
    ariaLabel: null,
    title: null,
    describedByText: null,
    helperText: null,
    resolvedLabel: null,
    labelSource: 'none',
    labelConfidence: 'none',
    labelLooksLikeValue: false,
    rawCandidateLabels: [],
    rejectedLabelCandidates: [],
    observedValueLikeTextNearControl: null,
    idOrNameKey: null,
    attachmentEvidence: 'none',
    groupName: null,
    currentValue: null,
    type: null,
    inputMode: null,
    autocomplete: null,
    pattern: null,
    minLength: null,
    maxLength: null,
    required: true,
    docusignTabType: 'List',
    elementId: null,
    tabGuid: null,
    pageIndex: null,
    ordinalOnPage: null,
    tabLeft: null,
    tabTop: null,
    tabWidth: null,
    tabHeight: null,
    visible: true,
    editable: true,
    controlCategory: 'merchant_input',
    inferredType: 'unknown_manual_review',
    locatorConfidence: 'css-fallback',
    locator: {} as DiscoveredField['locator'],
    ...overrides,
  } as DiscoveredField;
  if (!Object.prototype.hasOwnProperty.call(overrides, 'label')) field.label = field.resolvedLabel;
  return field;
}

function mockLayoutMhtmlTab(overrides: Partial<MhtmlTab> = {}): MhtmlTab {
  const ordinal = overrides.ordinalOnPage ?? 0;
  return {
    tabGuid: `00000000-0000-4000-8000-${String(ordinal).padStart(12, '0')}`,
    dataType: 'Text',
    rawDataType: 'Text',
    pageIndex: 1,
    pageGuid: 'page-1',
    ordinalOnPage: ordinal,
    left: 0,
    top: 0,
    required: true,
    ownedBySigner: true,
    renderedValue: overrides.inputValue ?? null,
    inputValue: overrides.inputValue ?? null,
    decoratorLabel: null,
    dataQa: null,
    maxLength: null,
    ...overrides,
  };
}

function mockLayoutMhtmlParseResult(tabs: MhtmlTab[]): MhtmlParseResult {
  const countsByType = tabs.reduce<Record<string, number>>((counts, tab) => {
    counts[tab.dataType] = (counts[tab.dataType] ?? 0) + 1;
    return counts;
  }, {});
  return {
    snapshotLocationRedacted: null,
    subject: null,
    tabs,
    countsByType,
    pageCount: 1,
    decodedHtmlLength: 0,
    warnings: [],
  };
}

function mockSubmissionForLayout(): unknown {
  return {
    merchantData: {
      registeredName: 'Example Business LLC',
      dbaName: '',
      businessDescription: 'Retail goods and services',
      registrationDate: '2024/06/18',
      legalEntityType: 'corporationSType',
      federalTaxIdType: 'ein',
      proofOfBusinessType: 'articlesOfIncorporation',
      proofOfAddressType: 'utilityBill',
      locationName: 'Location Name Value',
      locationBusinessType: 'virtual',
      accountType: 'checking',
      proofOfBankAccountType: 'colorizedVoidCheck',
      registeredLegalAddress: {
        line1: '679 Lester Courts',
        line2: '',
        city: 'Charlotte',
        state: 'NC',
        postalCode: '[redacted]',
      },
      businessMailingAddress: {
        line1: '124 Uptown Blvd',
        city: 'Charlotte',
        state: 'NC',
        postalCode: '',
      },
      bankAddress: {
        line1: '456 Bank Plaza',
        city: 'Charlotte',
        state: 'NC',
        postalCode: '[redacted]',
        country: 'US',
      },
    },
  };
}

function beadPageOneLabelText(): string {
  return [
    'General Registered Name Registration Date DBA Name (optional) Proof of Business Type Federal Tax ID Type Legal Entity Type Business Description',
    'Business Primary Location Registered Legal Address Proof of Address Type Address Line 1 Address Line 2 City State ZIP',
    'Physical Operating Address Address Line 1 City State ZIP',
    'Location Details Location Name Business Type',
    'Bank Info Account Type Proof of Bank Account Type Bank Address Line 1 Bank Address Line 2 Bank Address City State ZIP Country',
  ].join(' ');
}

function mockEnrichment(
  overrides: Partial<NonNullable<FieldRecord['enrichment']>> = {},
): NonNullable<FieldRecord['enrichment']> {
  return {
    matchedBy: 'coordinate',
    jsonKeyPath: 'merchantData.registeredName',
    suggestedDisplayName: 'Registered Name',
    suggestedBusinessSection: 'Business Details',
    confidence: 'high',
    positionalFingerprint: 'page:1|Text|ord:1',
    expectedPageIndex: 1,
    expectedOrdinalOnPage: 1,
    expectedDocusignFieldFamily: 'Text',
    expectedTabLeft: 10,
    expectedTabTop: 10,
    expectedJsonTypeHint: 'string',
    priorResolvedLabel: null,
    priorLabelSource: 'none',
    appliedToLabel: true,
    labelUpgradeBlockedReason: null,
    ...overrides,
  };
}

function mockInteractiveResults(
  result: Pick<InteractiveValidationResultsFile['results'][number],
    'concept' | 'conceptDisplayName' | 'fieldLabel' | 'validationId' | 'caseName' | 'testName' | 'status' | 'outcome' | 'evidence'>,
): InteractiveValidationResultsFile {
  return {
    schemaVersion: 1,
    runStartedAt: '2026-04-27T00:00:00.000Z',
    runFinishedAt: '2026-04-27T00:00:01.000Z',
    currentStep: null,
    guardState: { INTERACTIVE_VALIDATION: true, DISPOSABLE_ENVELOPE: true },
    sourceReport: {
      runStartedAt: '2026-04-27T00:00:00.000Z',
      runFinishedAt: '2026-04-27T00:00:01.000Z',
    },
    summary: {
      total: 1,
      passed: result.status === 'passed' ? 1 : 0,
      failed: result.status === 'failed' ? 1 : 0,
      warning: result.status === 'warning' ? 1 : 0,
      manual_review: result.status === 'manual_review' ? 1 : 0,
      skipped: result.status === 'skipped' ? 1 : 0,
    },
    outcomes: {
      passed: result.outcome === 'passed' ? 1 : 0,
      product_failure: result.outcome === 'product_failure' ? 1 : 0,
      tool_mapping_suspect: result.outcome === 'tool_mapping_suspect' ? 1 : 0,
      error_ownership_suspect: result.outcome === 'error_ownership_suspect' ? 1 : 0,
      observer_ambiguous: result.outcome === 'observer_ambiguous' ? 1 : 0,
      mapping_not_confident: result.outcome === 'mapping_not_confident' ? 1 : 0,
    },
    targetConcepts: ['email'],
    skippedConcepts: [],
    results: [{
      ...result,
      targetField: {
        primary: 'live-discovery-field-index',
        fieldIndex: 1,
        displayName: result.fieldLabel ?? 'Business Email',
        inferredType: 'email',
        confidence: 'high',
        fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input',
      },
      inputValue: 'qa.signerexample.com',
      expectedBehavior: 'An address without @ is rejected.',
      severity: 'critical',
      reasonCode: result.outcome === 'passed' ? 'none' : result.outcome === 'product_failure' ? 'product_failure' : 'target_mapping_not_trusted',
      observation: {
        ariaInvalid: null,
        validationMessage: null,
        nearbyErrorText: null,
        docusignValidationText: [],
        invalidIndicators: [],
        ignoredDiagnostics: [],
        ownershipSuspectText: [],
        evidenceItems: [],
        observedValue: 'qa.signerexample.com',
        normalizedOrReformatted: false,
        inputPrevented: false,
      },
      targetDiagnostics: null,
      interpretation: result.outcome === 'tool_mapping_suspect'
        ? 'Target mapping was not trusted enough to classify this as a product failure.'
        : 'Synthetic test result.',
      recommendation: 'Block this value or show a validation error on blur.',
      cleanupStrategy: 'restore_original_value_then_blur',
      safetyNotes: ['Uses disposable test input values.'],
    }],
  };
}

function mockFindingsResult(input: {
  concept: InteractiveValidationResultsFile['results'][number]['concept'];
  conceptDisplayName: string;
  validationId: string;
  testName: string;
  status: InteractiveResultStatus;
  outcome: InteractiveResultOutcome;
  targetConfidence: InteractiveTargetConfidence;
  mappingDecisionReason?: string | null;
  mappingShiftReason?: string | null;
  inputValue?: string;
  observedValue?: string | null;
  ariaInvalid?: string | null;
  docusignValidationText?: string[];
  invalidIndicators?: string[];
  normalizedOrReformatted?: boolean;
  inputPrevented?: boolean;
  controlKind?: 'native-select' | 'combobox' | 'checkbox' | 'radio' | 'text' | 'unsupported';
  optionsDiscoverable?: boolean;
  freeTextEntryImpossible?: boolean;
  restoreSucceeded?: boolean | null;
  actualValueBeforeTest?: string | null;
  actualValueAfterBlur?: string | null;
  actualElementTagName?: string | null;
  evidence?: string;
  skippedReason?: string;
}): InteractiveValidationResultsFile['results'][number] {
  const inputValue = input.inputValue ?? 'synthetic-value';
  const observedValue = input.observedValue === undefined ? inputValue : input.observedValue;
  return {
    concept: input.concept,
    conceptDisplayName: input.conceptDisplayName,
    fieldLabel: input.conceptDisplayName,
    validationId: input.validationId,
    caseName: input.validationId,
    testName: input.testName,
    status: input.status,
    outcome: input.outcome,
    targetField: {
      primary: 'live-discovery-field-index',
      fieldIndex: 1,
      displayName: input.conceptDisplayName,
      inferredType: input.concept,
      confidence: 'high',
      fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input',
    },
    inputValue,
    expectedBehavior: 'Synthetic expected behavior.',
    severity: 'major',
    reasonCode: interactiveReasonCodeFor(input.outcome),
    observation: {
      ariaInvalid: input.ariaInvalid ?? null,
      validationMessage: null,
      nearbyErrorText: null,
      docusignValidationText: input.docusignValidationText ?? [],
      invalidIndicators: input.invalidIndicators ?? [],
      ignoredDiagnostics: [],
      ownershipSuspectText: [],
      evidenceItems: [
        ...(input.ariaInvalid === 'true'
          ? [{ source: 'aria-invalid' as const, text: 'true', associatedWithSameElement: true, associatedWithSameTabGuid: true, otherFieldTypeHints: [], classification: 'field-local' as const }]
          : []),
        ...((input.docusignValidationText ?? []).map((text) => ({ source: 'same-tab-wrapper' as const, text, associatedWithSameElement: true, associatedWithSameTabGuid: true, otherFieldTypeHints: [], classification: 'field-local' as const }))),
        ...((input.invalidIndicators ?? []).map((text) => ({ source: 'invalid-indicator' as const, text, associatedWithSameElement: true, associatedWithSameTabGuid: true, otherFieldTypeHints: [], classification: 'field-local' as const }))),
      ],
      observedValue,
      normalizedOrReformatted: input.normalizedOrReformatted ?? false,
      inputPrevented: input.inputPrevented ?? false,
      controlKind: input.controlKind,
      optionsDiscoverable: input.optionsDiscoverable,
      freeTextEntryImpossible: input.freeTextEntryImpossible,
    },
    targetDiagnostics: {
      targetConfidence: input.targetConfidence,
      mappingDecisionReason: input.mappingDecisionReason ?? (input.targetConfidence === 'trusted' ? 'trusted_by_value_shape' : 'not_trusted_by_value_shape'),
      mappingShiftReason: input.mappingShiftReason ?? null,
      actualValueBeforeTest: input.actualValueBeforeTest === undefined ? inputValue : input.actualValueBeforeTest,
      actualValueAfterBlur: input.actualValueAfterBlur === undefined ? observedValue : input.actualValueAfterBlur,
      restoreSucceeded: input.restoreSucceeded ?? null,
      actualElement: {
        id: null,
        name: null,
        ariaLabel: null,
        title: null,
        role: null,
        tagName: input.actualElementTagName ?? null,
        type: null,
        inputMode: null,
        autocomplete: null,
        placeholder: null,
        docusignTabType: null,
      },
      actualFieldSignature: input.actualElementTagName ? `tag=${input.actualElementTagName}` : 'n/a',
      activeCandidate: null,
      selectedCandidate: null,
      neighborCandidates: [],
    } as InteractiveValidationResultsFile['results'][number]['targetDiagnostics'],
    interpretation: `Synthetic ${input.outcome} interpretation.`,
    recommendation: 'Review the observed behavior.',
    cleanupStrategy: 'restore_original_value_then_blur',
    safetyNotes: ['Synthetic offline fixture.'],
    evidence: input.evidence ?? `${input.testName} evidence`,
    skippedReason: input.skippedReason,
  };
}

function mockFindingsInput(args: {
  results: InteractiveValidationResultsFile['results'];
}): Parameters<typeof buildValidationFindingsReport>[0] {
  const summary = countStatuses(args.results);
  const outcomes = countOutcomes(args.results);
  const targetConcepts = Array.from(new Set(args.results.map((result) => result.concept)));
  const conceptScores = targetConcepts.map((concept) => {
    const conceptResults = args.results.filter((result) => result.concept === concept);
    const executedValidationCount = conceptResults.filter((result) => result.status !== 'skipped').length;
    const skippedValidationCount = conceptResults.filter((result) => result.status === 'skipped').length;
    return {
      key: concept,
      displayName: conceptResults[0].conceptDisplayName,
      identifiedWithConfidence: true,
      identificationConfidence: 'high',
      expectedValidationCount: conceptResults.length,
      executedValidationCount,
      passedValidationCount: conceptResults.filter((result) => result.status === 'passed').length,
      failedValidationCount: conceptResults.filter((result) => result.status === 'failed').length,
      warningValidationCount: conceptResults.filter((result) => result.status === 'warning').length,
      manualReviewValidationCount: conceptResults.filter((result) => result.status === 'manual_review').length,
      skippedValidationCount,
      notRunValidationCount: 0,
      cannotRunValidationCount: 0,
      validationCoveragePercent: conceptResults.length === 0 ? 0 : Math.round((executedValidationCount / conceptResults.length) * 100),
      validationQualityGrade: executedValidationCount === conceptResults.length ? 'A' : 'D',
      summary: `${conceptResults[0].conceptDisplayName} mock summary`,
    };
  });

  return {
    results: {
      schemaVersion: 1,
      runStartedAt: '2026-04-27T00:00:00.000Z',
      runFinishedAt: '2026-04-27T00:00:01.000Z',
      currentStep: null,
      guardState: { INTERACTIVE_VALIDATION: true, DISPOSABLE_ENVELOPE: true },
      sourceReport: {
        runStartedAt: '2026-04-27T00:00:00.000Z',
        runFinishedAt: '2026-04-27T00:00:01.000Z',
      },
      summary,
      outcomes,
      targetConcepts,
      skippedConcepts: [],
      results: args.results,
    },
    diagnostics: {
      schemaVersion: 1,
      runStartedAt: '2026-04-27T00:00:00.000Z',
      runFinishedAt: '2026-04-27T00:00:01.000Z',
      summary: {
        total: args.results.length,
        trusted: args.results.filter((result) => result.targetDiagnostics?.targetConfidence === 'trusted').length,
        tool_mapping_suspect: args.results.filter((result) => result.targetDiagnostics?.targetConfidence === 'tool_mapping_suspect').length,
        mapping_not_confident: args.results.filter((result) => result.targetDiagnostics?.targetConfidence === 'mapping_not_confident').length,
        error_ownership_suspect: outcomes.error_ownership_suspect,
        product_failure: outcomes.product_failure,
        observer_ambiguous: outcomes.observer_ambiguous,
        passed: summary.passed,
        skipped: summary.skipped,
        manual_review: summary.manual_review,
      },
      rows: args.results.map((result) => ({
        concept: result.concept,
        conceptDisplayName: result.conceptDisplayName,
        testName: result.testName,
        targetConfidence: result.targetDiagnostics?.targetConfidence ?? 'trusted',
        mappingDecisionReason: result.targetDiagnostics?.mappingDecisionReason ?? null,
        mappingShiftReason: result.targetDiagnostics?.mappingShiftReason ?? null,
        status: result.status,
        outcome: result.outcome,
        interpretation: result.interpretation,
      })),
    },
    scorecard: {
      schemaVersion: 1,
      generatedAt: '2026-04-27T00:00:01.000Z',
      overall: {
        expectedValidationCount: args.results.length,
        executedValidationCount: args.results.filter((result) => result.status !== 'skipped').length,
        passedValidationCount: summary.passed,
        failedValidationCount: summary.failed,
        warningValidationCount: summary.warning,
        manualReviewValidationCount: summary.manual_review,
        skippedValidationCount: summary.skipped,
        validationCoveragePercent: args.results.length === 0 ? 0 : Math.round(((args.results.length - summary.skipped) / args.results.length) * 100),
        validationQualityGrade: summary.skipped === 0 ? 'A' : 'D',
      },
      interactiveValidation: {
        resultsLoaded: true,
        total: summary.total,
        passed: summary.passed,
        failed: summary.failed,
        warning: summary.warning,
        manual_review: summary.manual_review,
        skipped: summary.skipped,
      },
      conceptScores,
    },
    calibration: {
      schemaVersion: 1,
      rows: targetConcepts.map((concept) => ({
        concept,
        conceptDisplayName: args.results.find((result) => result.concept === concept)!.conceptDisplayName,
        currentCandidateFieldIndex: 1,
        selectedCandidate: '#1 synthetic candidate',
        decision: args.results.some((result) => result.concept === concept && result.outcome === 'mapping_not_confident')
          ? 'leave_unresolved'
          : concept === 'bank_name'
            ? 'trust_likely_better_candidate'
            : 'trust_current_mapping',
        calibrationReason: args.results.some((result) => result.concept === concept && result.outcome === 'mapping_not_confident')
          ? 'no_unclaimed_neighbor_with_expected_shape'
          : concept === 'bank_name'
            ? 'page1_anchor_drift_after_website'
            : 'none',
        mappingDecisionReason: args.results.some((result) => result.concept === concept && result.outcome === 'mapping_not_confident')
          ? 'rejected_insufficient_label_proof'
          : concept === 'bank_name'
            ? 'rejected_value_shape_mismatch'
            : 'trusted_by_value_shape',
      })),
    },
    generatedAt: '2026-04-27T00:00:02.000Z',
  } as Parameters<typeof buildValidationFindingsReport>[0];
}

const WATCHDOG_SCRIPT_PATH = path.resolve(__dirname, '..', 'scripts', 'run-interactive-watchdog.ps1');
const POWERSHELL_EXE = 'powershell.exe';

function mockWatchdogProgressState(overrides: Partial<InteractiveProgressState> = {}): InteractiveProgressState {
  return {
    concept: 'legal_entity_type',
    conceptDisplayName: 'Legal Entity Type',
    validationId: 'valid-option-accepted',
    caseName: 'alternate-option',
    phase: 'collect-observation',
    startedAt: '2026-05-05T00:00:00.000Z',
    ...overrides,
  };
}

function runInteractiveWatchdogFixture(input: {
  artifactsDir: string;
  childScriptContent: string;
  concepts?: string;
  timeoutSeconds?: number;
  pollSeconds?: number;
  progress?: InteractiveProgressState | null;
}): {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  operatorTimeoutPath: string;
} {
  fs.mkdirSync(input.artifactsDir, { recursive: true });
  const childScriptPath = path.join(input.artifactsDir, 'fake-child.ps1');
  fs.writeFileSync(childScriptPath, input.childScriptContent, 'utf8');

  if (input.progress) {
    const progressPath = path.join(input.artifactsDir, 'latest-interactive-progress.json');
    fs.writeFileSync(
      progressPath,
      JSON.stringify(buildInteractiveProgressArtifact(input.progress, input.progress.startedAt), null, 2),
      'utf8',
    );
  }

  const result = spawnSync(
    POWERSHELL_EXE,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      WATCHDOG_SCRIPT_PATH,
      '-Concepts',
      input.concepts ?? 'legal_entity_type',
      '-TimeoutSeconds',
      String(input.timeoutSeconds ?? 5),
      '-PollSeconds',
      String(input.pollSeconds ?? 1),
      '-ArtifactsDir',
      input.artifactsDir,
      '-ChildFilePath',
      POWERSHELL_EXE,
      '-ChildArgumentList',
      `-NoProfile -ExecutionPolicy Bypass -File "${childScriptPath.replace(/"/g, '""')}"`,
    ],
    {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return {
    exitCode: result.status,
    stdout,
    stderr,
    combinedOutput: `${stdout}\n${stderr}`.trim(),
    operatorTimeoutPath: path.join(input.artifactsDir, 'latest-interactive-operator-timeout.json'),
  };
}

function parseJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as T;
}

function isWindowsProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const result = spawnSync(
    POWERSHELL_EXE,
    [
      '-NoProfile',
      '-Command',
      `if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { exit 0 } exit 1`,
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  return result.status === 0;
}

function countStatuses(results: InteractiveValidationResultsFile['results']): InteractiveValidationResultsFile['summary'] {
  return {
    total: results.length,
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    warning: results.filter((result) => result.status === 'warning').length,
    manual_review: results.filter((result) => result.status === 'manual_review').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
  };
}

function countOutcomes(results: InteractiveValidationResultsFile['results']): InteractiveValidationResultsFile['outcomes'] {
  return {
    passed: results.filter((result) => result.outcome === 'passed').length,
    product_failure: results.filter((result) => result.outcome === 'product_failure').length,
    tool_mapping_suspect: results.filter((result) => result.outcome === 'tool_mapping_suspect').length,
    error_ownership_suspect: results.filter((result) => result.outcome === 'error_ownership_suspect').length,
    observer_ambiguous: results.filter((result) => result.outcome === 'observer_ambiguous').length,
    mapping_not_confident: results.filter((result) => result.outcome === 'mapping_not_confident').length,
  };
}

function interactiveReasonCodeFor(outcome: InteractiveResultOutcome): InteractiveValidationResultsFile['results'][number]['reasonCode'] {
  if (outcome === 'passed') return 'none';
  if (outcome === 'product_failure') return 'product_failure';
  if (outcome === 'observer_ambiguous') return 'observer_ambiguous';
  if (outcome === 'error_ownership_suspect') return 'error_ownership_suspect';
  return 'target_mapping_not_trusted';
}

function mockInteractiveCase(overrides: Partial<InteractiveValidationCase> = {}): InteractiveValidationCase {
  return {
    id: 'email:missing-at-rejected:missing-at',
    concept: 'email',
    conceptDisplayName: 'Email',
    fieldLabel: 'Email',
    targetField: {
      primary: 'live-discovery-field-index',
      fieldIndex: 1,
      displayName: 'Email',
      inferredType: 'email',
      confidence: 'high',
      fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input',
    },
    targetProfile: {
      intendedFieldDisplayName: 'Email',
      intendedBusinessSection: 'Contact',
      intendedSectionName: 'Contact',
      layoutSectionHeader: 'Contact',
      layoutFieldLabel: 'Email',
      layoutEvidenceSource: 'synthetic-test',
      jsonKeyPath: 'merchantData.email',
      enrichmentMatchedBy: 'guid',
      enrichmentPositionalFingerprint: 'page:1|Text|ord:1',
      inferredType: 'email',
      labelSource: 'aria-label',
      labelConfidence: 'high',
      mappingConfidence: 'high',
      tabGuid: 'guid-email',
      docusignTabType: 'Text',
      pageIndex: 1,
      ordinalOnPage: 1,
      expectedPageIndex: 1,
      expectedOrdinalOnPage: 1,
      expectedDocusignFieldFamily: 'Text',
      coordinates: {
        left: 10,
        top: 10,
        width: 100,
        height: 20,
      },
      expectedCoordinates: {
        left: 10,
        top: 10,
      },
    },
    validationId: 'missing-at-rejected',
    caseName: 'missing-at',
    testName: 'missing @ rejected',
    inputValue: 'invalid-email',
    expectedBehavior: 'An email without @ is rejected.',
    expectedSignal: 'reject',
    interactionKind: 'fill',
    severity: 'critical',
    cleanupStrategy: 'restore_original_value_then_blur',
    safetyNotes: ['Synthetic offline test case.'],
    ...overrides,
  };
}

function mockInteractiveTargetDiagnostics(
  validationCase: InteractiveValidationCase,
  overrides: Partial<NonNullable<InteractiveValidationResultsFile['results'][number]['targetDiagnostics']>> = {},
): NonNullable<InteractiveValidationResultsFile['results'][number]['targetDiagnostics']> {
  return {
    intendedFieldDisplayName: validationCase.targetProfile.intendedFieldDisplayName,
    intendedBusinessSection: validationCase.targetProfile.intendedBusinessSection,
    intendedSectionName: validationCase.targetProfile.intendedSectionName,
    inferredType: validationCase.targetProfile.inferredType,
    labelSource: validationCase.targetProfile.labelSource,
    labelConfidence: validationCase.targetProfile.labelConfidence,
    mappingConfidence: validationCase.targetProfile.mappingConfidence,
    tabGuid: validationCase.targetProfile.tabGuid,
    docusignTabType: validationCase.targetProfile.docusignTabType,
    pageIndex: validationCase.targetProfile.pageIndex,
    ordinalOnPage: validationCase.targetProfile.ordinalOnPage,
    coordinates: {
      left: validationCase.targetProfile.coordinates.left,
      top: validationCase.targetProfile.coordinates.top,
      width: validationCase.targetProfile.coordinates.width,
      height: validationCase.targetProfile.coordinates.height,
    },
    locatorStrategy: 'live-discovery-field-index:1',
    actualElement: {
      id: 'email-input',
      name: 'email',
      ariaLabel: 'Email',
      title: null,
      role: 'textbox',
      tagName: 'input',
      type: 'email',
      inputMode: 'email',
      autocomplete: 'email',
      placeholder: 'Email',
      docusignTabType: 'Text',
    },
    actualFieldSignature: 'tag=input type=email role=textbox',
    targetConfidence: 'trusted',
    targetConfidenceReason: 'trusted_by_label',
    mappingDecisionReason: 'trusted_by_label',
    mappingShiftReason: 'none',
    mappingFlags: [],
    actualValueBeforeTest: 'owner@example.test',
    attemptedValue: validationCase.inputValue,
    actualValueAfterFill: null,
    actualValueAfterBlur: null,
    restoredValue: null,
    restoreSucceeded: null,
    ...overrides,
  };
}

function mockMhtmlTab(args: {
  pageIndex: number;
  ordinalOnPage: number;
  value: string;
  type?: 'Text' | 'Unknown';
}) {
  return {
    tabGuid: `00000000-0000-0000-0000-${String(args.pageIndex).padStart(4, '0')}${String(args.ordinalOnPage).padStart(8, '0')}`,
    dataType: args.type ?? 'Text',
    rawDataType: args.type ?? 'Text',
    pageIndex: args.pageIndex,
    pageGuid: null,
    ordinalOnPage: args.ordinalOnPage,
    left: null,
    top: null,
    required: true,
    ownedBySigner: true,
    renderedValue: args.value,
    inputValue: args.value,
    decoratorLabel: 'Required',
    dataQa: null,
    maxLength: null,
  };
}

function mockValidationReport(fields: FieldRecord[]): ValidationReport {
  const allChecks = fields.flatMap((field) => field.checks);
  return {
    runStartedAt: '2026-04-27T00:00:00.000Z',
    runFinishedAt: '2026-04-27T00:00:01.000Z',
    destructiveMode: false,
    discoveryDiagnostics: {
      disclosureDetected: null,
      disclosureCheckboxChecked: null,
      disclosureContinueClicked: null,
      formReadyAfterDisclosure: null,
      signerSurfaceResolved: true,
    },
    totals: {
      discovered: fields.length,
      merchantInputs: fields.filter((field) => field.controlCategory === 'merchant_input').length,
      pass: allChecks.filter((check) => check.status === 'pass').length,
      fail: allChecks.filter((check) => check.status === 'fail').length,
      warning: allChecks.filter((check) => check.status === 'warning').length,
      manual_review: allChecks.filter((check) => check.status === 'manual_review').length,
      skipped: allChecks.filter((check) => check.status === 'skipped').length,
    },
    countsByControlCategory: {
      merchant_input: fields.filter((field) => field.controlCategory === 'merchant_input').length,
      read_only_display: 0,
      docusign_chrome: 0,
      signature_widget: 0,
      date_signed_widget: 0,
      attachment_control: 0,
      acknowledgement_checkbox: 0,
      unknown_control: 0,
    },
    countsByClassification: {
      confirmed_from_ui: 0,
      inferred_best_practice: fields.filter((field) => field.inferredClassification === 'inferred_best_practice').length,
      manual_review: fields.filter((field) => field.inferredClassification === 'manual_review').length,
    },
    countsByInferredType: {},
    countsByLabelSource: {},
    countsBySection: {},
    countsByBusinessSection: {},
    countsByCategory: {
      hard_fail: 0,
      warning: 0,
      accessibility_gap: 0,
      validation_gap: 0,
      selector_risk: 0,
      manual_review: 0,
    },
    labelExtractionSummary: {
      labelsRejectedTotal: 0,
      labelsRejectedByReason: {
        'looks-like-value': 0,
        'docusign-stub': 0,
        'chrome-text': 0,
        'equals-field-value': 0,
        'generic-docusign-tab-type': 0,
        'too-short': 0,
        'too-long': 0,
        'pure-punctuation': 0,
        'pure-digits': 0,
      },
      labelsLookedLikeValue: 0,
      controlsWithNoAcceptedLabel: fields.filter((field) => !field.resolvedLabel).length,
    },
    labelQualitySummary: {
      acceptedHumanLabels: fields.filter((field) => field.resolvedLabel && field.labelSource !== 'docusign-tab-type').length,
      enrichmentLabels: fields.filter((field) => field.labelSource.startsWith('enrichment-')).length,
      genericDocusignTabTypeHints: fields.filter((field) => Boolean(field.docusignTabType)).length,
      genericDocusignTabTypeLabelsAccepted: fields.filter((field) => field.labelSource === 'docusign-tab-type').length,
      unresolvedFields: fields.filter((field) => !field.resolvedLabel).length,
    },
    enrichmentDiagnostics: { matchedRecords: [], unmatchedRecords: [] },
    attachmentEvidenceBreakdown: { strong: 0, weak: 0, none: fields.length },
    candidateValidations: [],
    prioritizedUnknowns: [],
    fragileSelectors: [],
    topFindings: [],
    quickFieldIndex: [],
    enrichmentSummary: {
      requested: false,
      enabled: false,
      bundlePath: null,
      unavailableReason: null,
      bundleRecordCount: 0,
      fieldsConsidered: 0,
      matchesByGuid: 0,
      matchesByPosition: 0,
      matchesByCoordinate: 0,
      labelsUpgraded: 0,
      businessSectionsUpgraded: 0,
      unmatchedRecords: 0,
      unmatchedRecordReasons: {},
    },
    fields,
  };
}
