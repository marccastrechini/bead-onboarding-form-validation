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
import { PassThrough } from 'node:stream';
import { buildResendUrl, normalizeResendMethod } from '../lib/bead-client';
import {
  buildPhysicalOperatingAddressToggleSelectionSummary,
  buildPhysicalOperatingAddressUiEffectSummary,
  explainPhysicalOperatingAddressToggleSelection,
  findPhysicalOperatingAddressToggle,
  guardedPhysicalOperatingAddressDiscoveryEnabled,
  maybeExpandPhysicalOperatingAddressSection,
  shouldStopAfterPhysicalAddressCaptureAttempt,
} from '../fixtures/conditional-discovery';
import { discoverFields, type DiscoveredField } from '../fixtures/field-discovery';
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
import {
  assertPhysicalOperatingAddressCaptureOnlyGuards,
  buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics,
  buildPhysicalOperatingAddressCaptureOnlyReceipt,
  buildPhysicalOperatingAddressCaptureOnlyReceiptPath,
  buildPhysicalOperatingAddressCaptureOnlyEnv,
  comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness,
  formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_ARTIFACT_FILENAMES,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_DISCOVERY_OPTIONS,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_RECEIPT_FILE_NAME,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND,
  PHYSICAL_ADDRESS_CAPTURE_ONLY_SCRIPT_PATH,
  readPhysicalOperatingAddressCaptureOnlyReceipt,
  readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
  runPhysicalOperatingAddressCaptureOnly,
  type PhysicalOperatingAddressCaptureOnlyReceipt,
} from '../scripts/capture-physical-operating-address';
import {
  buildSignerChildEnv,
  formatSafeError,
  runBootstrapEmailScripts,
} from '../lib/bootstrap-email-runner';
import {
  parsePhysicalOperatingAddressBootstrapCaptureReceiptLines,
  PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
  PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
  PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_SCRIPT_PATH,
  runPhysicalOperatingAddressBootstrapCapture,
} from '../scripts/bootstrap-capture-physical-operating-address';
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
  buildInteractiveTargetDiagnosticsFile,
  buildInteractiveStepTimeoutResult,
  buildInteractiveValidationPlan,
  extractFieldLocalValidationDiagnostics,
  findDiscoveredFieldByDiscoveryIndex,
  INTERACTIVE_TARGET_CONCEPTS,
  isAvailableInteractiveMerchantField,
  INTERACTIVE_STEP_TIMEOUT_MS,
  prepareControlledChoiceInteraction,
  releaseInteractiveTimeoutSession,
  renderInteractiveResultsMarkdown,
  resolveInteractiveTargetConcepts,
  resolveInteractiveTargetField,
  skippedConceptToResult,
  writeInteractiveProgressArtifact,
  writeInteractiveResultsArtifacts,
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

test.describe('field-discovery: combobox fallback', () => {
  test('discovers DocuSign native select list tabs when combobox role lookup misses them', async ({ page }) => {
    await page.setContent(`
      <div class="page-shell">
        <img class="page-image" src="https://example.test/signing?p=1" />
        <div class="doc-tab list-tab signing-required is-off" id="tab-legal-address-type" data-id="legal-address-type" data-type="List" style="left:663.68px; top:512.64px; width:136px; height:18px;">
          <select id="tab-form-element-legal-address-type" class="tab-form-element main-list-tab-select inked">
            <option value="">-- select --</option>
            <option value="UtilityBill">Utility Bill</option>
            <option value="BankStatement">Bank Statement</option>
          </select>
          <label for="tab-form-element-legal-address-type" class="tab-label inked">Required - legalAddressType</label>
        </div>
      </div>
    `);

    const frame = {
      locator: page.locator.bind(page),
      getByLabel: page.getByLabel.bind(page),
      getByRole: ((role: Parameters<typeof page.getByRole>[0], options?: Parameters<typeof page.getByRole>[1]) => {
        if (role === 'combobox') return page.locator('[data-no-combobox-match]');
        return page.getByRole(role, options);
      }) as typeof page.getByRole,
      getByText: page.getByText.bind(page),
      getByTestId: page.getByTestId.bind(page),
    } as Parameters<typeof discoverFields>[0];

    const fields = await discoverFields(frame);
    const listField = fields.find((field) => field.kind === 'combobox');

    expect(listField).toBeTruthy();
    expect(listField).toMatchObject({
      kind: 'combobox',
      docusignTabType: 'List',
      controlCategory: 'merchant_input',
      pageIndex: 1,
      tabLeft: 663.68,
      tabTop: 512.64,
    });
  });

  test('does not duplicate DocuSign native selects already exposed as comboboxes', async ({ page }) => {
    await page.setContent(`
      <div class="page-shell">
        <img class="page-image" src="https://example.test/signing?p=1" />
        <div class="doc-tab list-tab signing-required is-off" id="tab-legal-address-type" data-id="legal-address-type" data-type="List" style="left:663.68px; top:512.64px; width:136px; height:18px;">
          <select id="tab-form-element-legal-address-type" class="tab-form-element main-list-tab-select inked">
            <option value="">-- select --</option>
            <option value="UtilityBill">Utility Bill</option>
          </select>
          <label for="tab-form-element-legal-address-type" class="tab-label inked">Required - legalAddressType</label>
        </div>
      </div>
    `);

    const fields = await discoverFields(page);
    const matchingFields = fields.filter((field) => field.elementId === 'tab-form-element-legal-address-type');

    expect(matchingFields).toHaveLength(1);
    expect(matchingFields[0]).toMatchObject({
      kind: 'combobox',
      docusignTabType: 'List',
    });
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
        index: 1,
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
        index: 2,
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

  test('processing amount concepts resolve sample alias key paths', () => {
    expect(conceptKeyForJsonKeyPath('merchantData.grossAnnualRevenue')).toBe('annual_revenue');
    expect(conceptKeyForJsonKeyPath('merchantData.highestMonthlyVolume')).toBe('highest_monthly_volume');
    expect(conceptKeyForJsonKeyPath('merchantData.averageTicketSize')).toBe('average_ticket');
    expect(conceptKeyForJsonKeyPath('merchantData.maxTicketSize')).toBe('max_ticket');
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

  test('very-short text-name behavior stays policy-question manual review across the trusted text-name family', () => {
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
          concept: 'location_name',
          conceptDisplayName: 'Location Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'contact_first_name',
          conceptDisplayName: 'Point Of Contact First Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'contact_last_name',
          conceptDisplayName: 'Point Of Contact Last Name',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.concept}:${finding.validationId}`)).toEqual([
      'business_name:very-short-behavior',
      'dba_name:very-short-behavior',
      'location_name:very-short-behavior',
      'contact_first_name:very-short-behavior',
      'contact_last_name:very-short-behavior',
    ]);
    expect(report.ambiguousHumanReviewFindings.every((finding) => finding.ambiguity?.type === 'policy_question')).toBe(true);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('contact first and last name truncation is acceptable documented behavior, not ambiguity', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'contact_first_name',
          conceptDisplayName: 'Point Of Contact First Name',
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
          concept: 'contact_last_name',
          conceptDisplayName: 'Point Of Contact Last Name',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Long Business Name'.repeat(20),
          observedValue: 'Long Business Name',
          normalizedOrReformatted: true,
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);

    const contactFirstName = report.trustedExecutedObservations.find((finding) => finding.concept === 'contact_first_name')!;
    expect(contactFirstName.status).toBe('passed');
    expect(contactFirstName.outcome).toBe('passed');

    const contactLastName = report.trustedExecutedObservations.find((finding) => finding.concept === 'contact_last_name')!;
    expect(contactLastName.status).toBe('passed');
    expect(contactLastName.outcome).toBe('passed');
  });

  test('stakeholder job title truncation is acceptable documented behavior, not ambiguity', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_job_title',
          conceptDisplayName: 'Stakeholder Job Title',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Managing Member'.repeat(20),
          observedValue: 'Managing Member',
          normalizedOrReformatted: true,
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);

    const stakeholderJobTitle = report.trustedExecutedObservations.find((finding) => finding.concept === 'stakeholder_job_title')!;
    expect(stakeholderJobTitle.status).toBe('passed');
    expect(stakeholderJobTitle.outcome).toBe('passed');
    expect(report.perConceptResults.find((concept) => concept.concept === 'stakeholder_job_title')!.notes.join(' '))
      .toContain('Safe truncation or normalization for excessive length is treated as acceptable enforcement in this report.');
  });

  test('business_description very-short and garbage text remain manual review policy questions', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_description',
          conceptDisplayName: 'Business Description',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'business_description',
          conceptDisplayName: 'Business Description',
          validationId: 'garbage-text-rejected-or-flagged',
          testName: 'garbage text rejected or flagged',
          status: 'warning',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.concept}:${finding.validationId}`)).toEqual([
      'business_description:very-short-behavior',
      'business_description:garbage-text-rejected-or-flagged',
    ]);
    expect(report.ambiguousHumanReviewFindings.every((finding) => finding.ambiguity?.type === 'policy_question')).toBe(true);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('business_description truncation is acceptable documented behavior and not ambiguity', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'business_description',
          conceptDisplayName: 'Business Description',
          validationId: 'excessive-length-behavior',
          testName: 'excessive length behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: 'Long Business Name'.repeat(20),
          observedValue: 'Long Business Name',
          normalizedOrReformatted: true,
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings).toEqual([]);
    expect(report.likelyProductValidationFindings).toEqual([]);

    const businessDescription = report.trustedExecutedObservations.find((finding) => finding.concept === 'business_description')!;
    expect(businessDescription.status).toBe('passed');
    expect(businessDescription.outcome).toBe('passed');
  });

  test('registration_date alternate format and future date remain manual review without product findings', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'registration_date',
          conceptDisplayName: 'Registration Date',
          validationId: 'accepted-date-format-documented',
          testName: 'MM/DD/YYYY format behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          ariaInvalid: 'true',
          invalidIndicators: ['field-root:class=has-error'],
          docusignValidationText: ['Please use YYYY/MM/DD.'],
        }),
        mockFindingsResult({
          concept: 'registration_date',
          conceptDisplayName: 'Registration Date',
          validationId: 'future-date-behavior',
          testName: 'future date behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
          inputValue: '2099/01/01',
          observedValue: '2099/01/01',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.validationId}:${finding.ambiguity?.type}`)).toEqual([
      'accepted-date-format-documented:matrix_expectation_mismatch',
      'future-date-behavior:observer_needs_stronger_text_evidence',
    ]);
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('symbol-heavy contact and location names remain manual review while business and DBA name leniency stays unchanged', () => {
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
          concept: 'location_name',
          conceptDisplayName: 'Location Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'contact_first_name',
          conceptDisplayName: 'Point Of Contact First Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'contact_last_name',
          conceptDisplayName: 'Point Of Contact Last Name',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.concept}:${finding.validationId}`)).toEqual([
      'location_name:special-characters-behavior',
      'contact_first_name:special-characters-behavior',
      'contact_last_name:special-characters-behavior',
    ]);
    expect(report.ambiguousHumanReviewFindings.every((finding) => finding.ambiguity?.type === 'expected_text_leniency')).toBe(true);

    const businessName = report.trustedExecutedObservations.find((finding) => finding.concept === 'business_name')!;
    expect(businessName.status).toBe('warning');
    expect(businessName.outcome).toBe('passed');

    const dbaName = report.trustedExecutedObservations.find((finding) => finding.concept === 'dba_name')!;
    expect(dbaName.status).toBe('warning');
    expect(dbaName.outcome).toBe('passed');
    expect(report.likelyProductValidationFindings).toEqual([]);
  });

  test('stakeholder job title keeps conservative very-short, special-character, and empty-required review policy', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_job_title',
          conceptDisplayName: 'Stakeholder Job Title',
          validationId: 'very-short-behavior',
          testName: 'very short value behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'stakeholder_job_title',
          conceptDisplayName: 'Stakeholder Job Title',
          validationId: 'special-characters-behavior',
          testName: 'special characters behavior observed',
          status: 'manual_review',
          outcome: 'observer_ambiguous',
          targetConfidence: 'trusted',
        }),
        mockFindingsResult({
          concept: 'stakeholder_job_title',
          conceptDisplayName: 'Stakeholder Job Title',
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

    expect(report.ambiguousHumanReviewFindings.map((finding) => `${finding.validationId}:${finding.ambiguity?.type}`)).toEqual([
      'very-short-behavior:policy_question',
      'special-characters-behavior:expected_text_leniency',
      'empty-required-behavior:product_validation_gap_candidate',
    ]);
    expect(report.likelyProductValidationFindings).toEqual([]);
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

    const stakeholderWithE164 = buildValidationFindingsReport(mockFindingsInput({
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

    const resolvedStakeholder = stakeholderWithE164.trustedExecutedObservations.find((finding) =>
      finding.concept === 'stakeholder_phone' && finding.validationId === 'missing-plus-handling'
    )!;

    expect(resolvedStakeholder.status).toBe('passed');
    expect(resolvedStakeholder.outcome).toBe('passed');
    expect(resolvedStakeholder.interpretation)
      .toBe('Observed explicit field-local E.164 enforcement for Stakeholder Phone input without a leading plus.');
    expect(stakeholderWithE164.ambiguousHumanReviewFindings).toEqual([]);
    expect(stakeholderWithE164.likelyProductValidationFindings).toEqual([]);

    const businessWithE164 = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
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

    expect(businessWithE164.ambiguousHumanReviewFindings[0].ambiguity?.type).toBe('matrix_expectation_mismatch');
    expect(businessWithE164.ambiguousHumanReviewFindings[0].ambiguity?.humanGuidancePrompt)
      .toBe('Field-local validation currently requires E.164. Should Phone instead accept or normalize domestic phone format without a leading plus?');
  });

  test('true invalid stakeholder phone acceptance still becomes a product finding', () => {
    const report = buildValidationFindingsReport(mockFindingsInput({
      results: [
        mockFindingsResult({
          concept: 'stakeholder_phone',
          conceptDisplayName: 'Stakeholder Phone',
          validationId: 'letters-rejected',
          testName: 'letters rejected',
          status: 'failed',
          outcome: 'product_failure',
          targetConfidence: 'trusted',
        }),
      ],
    }));

    expect(report.likelyProductValidationFindings.map((finding) => `${finding.concept}:${finding.validationId}`)).toEqual([
      'stakeholder_phone:letters-rejected',
    ]);
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
      passed: 2,
      manual_review: 0,
    });
    expect(report.perConceptResults.find((concept) => concept.concept === 'stakeholder_phone')!.notes.join(' '))
      .not.toContain('likely product validation finding');
    expect(report.perConceptResults.find((concept) => concept.concept === 'stakeholder_phone')!.notes.join(' '))
      .toContain('Missing-plus handling showed explicit field-local E.164 validation and is treated as acceptable documented behavior unless domestic-format normalization or acceptance becomes policy.');
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
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          businessSection: 'Contact',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
          tabLeft: 663.04,
          tabTop: 766.08,
          currentValue: '+15551234567',
          enrichment: {
            jsonKeyPath: 'merchantData.businessPhone',
            matchedBy: 'position',
            suggestedDisplayName: 'Business Phone',
            suggestedBusinessSection: 'Contact',
          },
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

  test('Contact Phone can be trusted when contact proof and phone value shape align', () => {
    const result = selectBestMappingCandidate({
      concept: 'phone',
      currentCandidateId: 'contact-phone',
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
          id: 'contact-phone',
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Contact',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
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

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('contact-phone');
  });

  test('Phone does not trust a phone-shaped field outside Contact', () => {
    const result = selectBestMappingCandidate({
      concept: 'phone',
      currentCandidateId: 'bank-phone',
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
          id: 'bank-phone',
          resolvedLabel: 'Bank Phone',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Banking',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 62,
          tabLeft: 284.16,
          tabTop: 874.88,
          currentValue: '+15557654321',
        },
      ],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_section_mismatch');
  });

  test('Stakeholder Phone does not satisfy business Phone', () => {
    const result = selectBestMappingCandidate({
      concept: 'phone',
      currentCandidateId: 'stakeholder-phone',
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
          id: 'stakeholder-phone',
          resolvedLabel: 'stakeholders #0 › Phone Number',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Stakeholder',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 3,
          ordinalOnPage: 27,
          tabLeft: 410.88,
          tabTop: 279.04,
          currentValue: '+15558765432',
          enrichment: {
            jsonKeyPath: 'merchantData.stakeholders[0].phoneNumber',
            matchedBy: 'guid',
            confidence: 'high',
            suggestedDisplayName: 'stakeholders #0 › Phone Number',
            suggestedBusinessSection: 'Stakeholder',
          },
        },
      ],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_section_mismatch');
  });

  test('Nearby same-shape phone candidates do not displace the Contact phone candidate', () => {
    const result = selectBestMappingCandidate({
      concept: 'phone',
      currentCandidateId: 'contact-phone',
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
          id: 'contact-phone',
          resolvedLabel: 'Business Phone',
          labelSource: 'enrichment-guid',
          labelConfidence: 'high',
          businessSection: 'Contact',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 59,
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
        {
          id: 'bank-phone',
          resolvedLabel: 'Bank Phone',
          labelSource: 'enrichment-position',
          labelConfidence: 'medium',
          businessSection: 'Banking',
          inferredType: 'phone_e164',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 62,
          tabLeft: 284.16,
          tabTop: 874.88,
          currentValue: '+15557654321',
        },
      ],
    });

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('contact-phone');
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
    const toggleField = (overrides: Record<string, unknown> = {}) => ({
      index: 0,
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
      idOrNameKey: null,
      inferredType: { type: 'address_option' },
      ...overrides,
    });

    const candidate = findPhysicalOperatingAddressToggle([
      toggleField({
        index: 1,
      }),
      toggleField({
        index: 2,
        label: 'addressOptions › Required - addressOptions - isLegalAddress',
        resolvedLabel: 'addressOptions › Required - addressOptions - isLegalAddress',
        idOrNameKey: 'isLegalAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'addressOptions › Required - addressOptions - isLegalAddress' },
        ],
      }),
      toggleField({
        index: 3,
        label: 'Physical Operating Address',
        resolvedLabel: 'Physical Operating Address',
        idOrNameKey: 'isOperatingAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'Physical Operating Address' },
        ],
      }),
    ] as any);

    expect(candidate?.idOrNameKey).toBe('isOperatingAddress');
  });

  test('guarded physical address discovery selects the unique isOperatingAddress radio when nearby group text carries the operating cue', () => {
    const toggleField = (overrides: Record<string, unknown> = {}) => ({
      index: 0,
      kind: 'radio',
      controlCategory: 'merchant_input',
      visible: true,
      editable: true,
      sectionName: 'Business Physical Address',
      label: 'Required',
      resolvedLabel: 'Required',
      rawCandidateLabels: [
        { source: 'preceding-text', value: 'Business Physical Address' },
        { source: 'section+row', value: 'Required option' },
      ],
      groupName: 'businessPhysicalAddress_group',
      idOrNameKey: null,
      inferredType: { type: 'address_option' },
      ...overrides,
    });

    const candidate = findPhysicalOperatingAddressToggle([
      toggleField({
        index: 1,
        idOrNameKey: 'isMailingAddress',
        sectionName: 'Business Mailing Address',
        groupName: 'businessMailingAddress_group',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Mailing Address' },
        ],
      }),
      toggleField({
        index: 2,
        idOrNameKey: 'isOperatingAddress',
      }),
    ] as any);

    expect(candidate?.idOrNameKey).toBe('isOperatingAddress');
  });

  test('guarded physical address discovery stays opt-in and refuses mailing or unsafe candidates', () => {
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv)).toBe(true);
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled({
      SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '0',
    } as NodeJS.ProcessEnv)).toBe(false);

    const candidate = findPhysicalOperatingAddressToggle([
      {
        index: 1,
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
        idOrNameKey: 'isOperatingAddress',
        inferredType: { type: 'address_option' },
      },
      {
        index: 2,
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Mailing Address',
        label: 'Business Mailing Address',
        resolvedLabel: 'Business Mailing Address',
        rawCandidateLabels: [
          { source: 'section+row', value: 'Business Mailing Address' },
        ],
        groupName: 'businessMailingAddress_group',
        idOrNameKey: 'isMailingAddress',
        inferredType: { type: 'address_option' },
      },
    ] as any);

    expect(candidate).toBeNull();
  });

  test('guarded physical address discovery field discovery collects bounded radio container context from wrapper layout', async ({ page }) => {
    await page.setContent(`
      <article class="card">
        <div class="card-title">Physical Operating Address</div>
        <div class="card-body">
          <div class="choice-shell"><input id="radio-a" type="radio" name="physicalAddress" /></div>
          <div class="choice-shell"><input id="radio-b" type="radio" name="physicalAddress" /></div>
          <div class="choice-shell"><input id="radio-c" type="radio" name="physicalAddress" /></div>
        </div>
      </article>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio');

    expect(radios).toHaveLength(3);
    expect(radios[0].containerContextLabels).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'container-section', value: 'Physical Operating Address' }),
    ]));
  });

  test('guarded physical address discovery field discovery collects bounded radio layout proximity from detached visible text', async ({ page }) => {
    await page.setContent(`
      <style>
        body { margin: 0; }
        .radio-row {
          position: absolute;
          top: 24px;
          left: 20px;
          display: flex;
          gap: 18px;
        }
        .detached-prompt {
          position: absolute;
          top: 72px;
          left: 16px;
        }
      </style>
      <div class="radio-row">
        <div class="choice-shell"><input id="radio-d" type="radio" name="physicalAddress" /></div>
        <div class="choice-shell"><input id="radio-e" type="radio" name="physicalAddress" /></div>
        <div class="choice-shell"><input id="radio-f" type="radio" name="physicalAddress" /></div>
      </div>
      <div class="detached-prompt">Physical Operating Address</div>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio');

    expect(radios).toHaveLength(3);
    expect(radios.every((field) => (field.containerContextLabels ?? []).length === 0)).toBe(true);
    expect(radios.every((field) => (field.layoutProximityLabels ?? []).some((candidate) => (
      candidate.value === 'Physical Operating Address'
      && candidate.direction === 'near-group'
      && candidate.distanceBucket === 'near'
      && candidate.association === 'group'
    )))).toBe(true);
  });

  test('guarded physical address discovery field discovery collects bounded non-text radio group signatures from repeated layout', async ({ page }) => {
    await page.setContent(`
      <style>
        body { margin: 0; }
        .radio-row {
          position: absolute;
          top: 32px;
          left: 20px;
          display: flex;
          gap: 8px;
        }
        .radio-row input {
          width: 14px;
          height: 14px;
        }
      </style>
      <div class="radio-row">
        <input id="radio-g" type="radio" name="physicalAddress" />
        <input id="radio-h" type="radio" name="physicalAddress" />
        <input id="radio-i" type="radio" name="physicalAddress" />
      </div>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio');

    expect(radios).toHaveLength(3);
    expect(radios.map((field) => field.nonTextLayoutSignature?.groupPatternBucket)).toEqual([
      'repeated-row-group',
      'repeated-row-group',
      'repeated-row-group',
    ]);
    expect(radios.map((field) => field.nonTextLayoutSignature?.relativeOrderBucket)).toEqual([
      'first',
      'middle',
      'last',
    ]);
    expect(radios.every((field) => field.nonTextLayoutSignature?.sharedContainerBucket === 'same-parent')).toBe(true);
    expect(radios.every((field) => field.nonTextLayoutSignature?.spacingBucket === 'tight')).toBe(true);
    expect(radios.every((field) => field.nonTextLayoutSignature?.shapeBucket === 'compact-group')).toBe(true);
  });

  test('guarded physical address discovery field discovery collects bounded overlay-layer radio signatures', async ({ page }) => {
    await page.setContent(`
      <div class="page-shell">
        <img class="page-image" src="/fake-page.png?p=1" />
        <div class="doc-tab" data-type="radio" style="left: 12px; top: 24px; width: 18px; height: 18px; position: absolute;">
          <input id="tab-form-element-abc123" type="radio" name="physicalAddress" data-tabtype="radio" />
        </div>
        <div class="doc-tab" data-type="radio" style="left: 44px; top: 24px; width: 18px; height: 18px; position: absolute;">
          <input id="tab-form-element-def456" type="radio" name="physicalAddress" data-tabtype="radio" />
        </div>
        <div class="doc-tab" data-type="radio" style="left: 76px; top: 24px; width: 18px; height: 18px; position: absolute;">
          <input id="tab-form-element-ghi789" type="radio" name="physicalAddress" data-tabtype="radio" />
        </div>
      </div>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio');

    expect(radios).toHaveLength(3);
    expect(radios.every((field) => field.nonTextLayoutSignature?.layerBucket === 'document-layer')).toBe(true);
    expect(radios.every((field) => field.nonTextLayoutSignature?.sharedDocumentLayer === true)).toBe(true);
    expect(radios.every((field) => (field.nonTextLayoutSignature?.metadataSignals ?? []).includes('data-tab-type'))).toBe(true);
    expect(radios.every((field) => (field.nonTextLayoutSignature?.metadataSignals ?? []).includes('tab-guid'))).toBe(true);
    expect(radios.every((field) => (field.nonTextLayoutSignature?.metadataSignals ?? []).includes('page-index'))).toBe(true);
  });

  test('guarded physical address discovery field discovery collects bounded DOM wrapper and safe attribute signatures', async ({ page }) => {
    await page.setContent(`
      <div class="toggle-card address-choice-group" data-group-kind="address-options">
        <div class="radio-row address-choice" data-choice-kind="physical-operating-address">
          <input id="tab-form-element-a1b2c3d4e5f60718293a4b5c" type="radio" name="addressOptions" aria-describedby="" />
        </div>
        <div class="radio-row address-choice" data-choice-kind="same-choice">
          <input id=":r42:" type="radio" name="addressOptions" />
        </div>
        <div class="radio-row address-choice" data-choice-kind="business-physical-address">
          <input id="tab-form-element-b1c2d3e4f5061728394a5b6c" type="radio" name="addressOptions" data-tabtype="radio" />
        </div>
      </div>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio');
    const physical = radios.find((field) => field.elementId === 'tab-form-element-a1b2c3d4e5f60718293a4b5c');
    const businessPhysical = radios.find((field) => field.elementId === 'tab-form-element-b1c2d3e4f5061728394a5b6c');

    expect(radios).toHaveLength(3);
    expect(physical?.domAttributeSignature).toEqual(expect.objectContaining({
      radioAttributeNames: expect.arrayContaining(['aria-describedby', 'id', 'name', 'type']),
      hasAriaDescribedBy: true,
      valueHintBuckets: expect.arrayContaining(['address-like-token', 'generated-token-pattern', 'physical-operating-address-token', 'empty-value']),
      wrapperPatternBucket: 'same-wrapper-pattern',
      attributePatternBucket: 'distinct-attribute-pattern',
    }));
    expect(physical?.domAttributeSignature?.wrapperSurfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        depthBucket: 'parent',
        tagName: 'div',
        attributeNames: expect.arrayContaining(['class', 'data-choice-kind']),
      }),
      expect.objectContaining({
        depthBucket: 'grandparent',
        tagName: 'div',
        attributeNames: expect.arrayContaining(['class', 'data-group-kind']),
      }),
    ]));
    expect(businessPhysical?.domAttributeSignature).toEqual(expect.objectContaining({
      hasDocuSignMetadataAttributes: true,
      valueHintBuckets: expect.arrayContaining(['address-like-token', 'business-physical-address-token', 'generated-token-pattern']),
    }));
  });

  test('guarded physical address discovery field discovery omits raw attribute values and keeps only safe buckets', async ({ page }) => {
    await page.setContent(`
      <div class="radio-row address-choice" data-choice-kind="physical-operating-address">
        <input
          id="tab-form-element-c1d2e3f40516273849a5b6c7"
          type="radio"
          name="https://demo.docusign.net/start?token=secret-token-value"
          data-qa="hidden.person@example.test"
          aria-describedby=""
        />
      </div>
    `);

    const fields = await discoverFields(page);
    const signature = fields.find((field) => field.kind === 'radio')?.domAttributeSignature;
    const serializedSignature = JSON.stringify(signature);

    expect(signature).toEqual(expect.objectContaining({
      radioAttributeNames: expect.arrayContaining(['aria-describedby', 'data-qa', 'id', 'name', 'type']),
      valueHintBuckets: expect.arrayContaining(['address-like-token', 'generated-token-pattern', 'empty-value']),
    }));
    expect(serializedSignature).not.toContain('https://demo.docusign.net/start');
    expect(serializedSignature).not.toContain('hidden.person@example.test');
    expect(serializedSignature).not.toContain('secret-token-value');
  });

  test('guarded physical address discovery field discovery collects bounded visible proxy wrapper and association-reference signatures', async ({ page }) => {
    await page.setContent(`
      <style>
        .proxy-choice {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0;
        }
        .proxy-choice input {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
        }
        .proxy-ring {
          display: inline-flex;
          gap: 6px;
          width: 42px;
          height: 18px;
        }
        .proxy-role-radio,
        .proxy-button,
        .proxy-target {
          display: inline-flex;
          width: 18px;
          height: 18px;
        }
      </style>
      <div class="toggle-card" data-group-kind="address-options">
        <div class="proxy-choice" data-choice-kind="physical-operating-address">
          <input id="proxy-radio-a" type="radio" name="addressOptions" aria-labelledby="proxy-label-a" aria-controls="proxy-panel-a" />
          <label for="proxy-radio-a" class="proxy-ring" data-choice-kind="physical-operating-address">
            <div role="radio" class="proxy-role-radio" data-field-ref="proxy-panel-a"></div>
            <button type="button" class="proxy-button" data-tab-target="tab-form-element-proxy-panel-a"></button>
          </label>
          <div id="proxy-label-a" class="proxy-target" data-recipient-target="proxy-panel-a"></div>
          <div id="proxy-panel-a" class="proxy-target"></div>
          <div id="tab-form-element-proxy-panel-a" class="proxy-target"></div>
        </div>
        <div class="proxy-choice" data-choice-kind="same-choice">
          <input id="proxy-radio-b" type="radio" name="addressOptions" aria-labelledby="proxy-label-b" aria-controls="proxy-panel-b" />
          <label for="proxy-radio-b" class="proxy-ring" data-choice-kind="same-choice">
            <div role="radio" class="proxy-role-radio" data-field-ref="proxy-panel-b"></div>
            <button type="button" class="proxy-button" data-tab-target="tab-form-element-proxy-panel-b"></button>
          </label>
          <div id="proxy-label-b" class="proxy-target" data-recipient-target="proxy-panel-b"></div>
          <div id="proxy-panel-b" class="proxy-target"></div>
          <div id="tab-form-element-proxy-panel-b" class="proxy-target"></div>
        </div>
        <div class="proxy-choice" data-choice-kind="business-physical-address">
          <input id="proxy-radio-c" type="radio" name="addressOptions" aria-labelledby="proxy-label-c" aria-controls="proxy-panel-c" />
          <label for="proxy-radio-c" class="proxy-ring" data-choice-kind="business-physical-address">
            <div role="radio" class="proxy-role-radio" data-field-ref="proxy-panel-c"></div>
            <button type="button" class="proxy-button" data-tab-target="tab-form-element-proxy-panel-c"></button>
          </label>
          <div id="proxy-label-c" class="proxy-target" data-recipient-target="proxy-panel-c"></div>
          <div id="proxy-panel-c" class="proxy-target"></div>
          <div id="tab-form-element-proxy-panel-c" class="proxy-target"></div>
        </div>
      </div>
    `);

    const fields = await discoverFields(page);
    const radioInputs = fields.filter((field) => field.kind === 'radio' && field.type === 'radio');
    const physical = radioInputs.find((field) => field.elementId === 'proxy-radio-a');
    const businessPhysical = radioInputs.find((field) => field.elementId === 'proxy-radio-c');

    expect(radioInputs).toHaveLength(3);
    expect(physical?.domAttributeSignature).not.toBeNull();
    expect(physical?.proxyReferenceSignature).toEqual(expect.objectContaining({
      inputVisibilityBucket: 'zero-size-or-hidden-input',
      candidateSlot: 1,
      hasForIdReference: true,
      forReferenceTargetExists: true,
      forReferenceTargetVisible: true,
      hasAriaLabelledByReference: true,
      ariaLabelledByTargetExists: true,
      ariaLabelledByTargetVisible: true,
      hasAriaControlsReference: true,
      ariaControlsTargetExists: true,
      ariaControlsTargetVisible: true,
      hasDataReference: true,
      dataReferenceTargetExists: true,
      dataReferenceTargetVisible: true,
      hasDocuSignReference: true,
      docuSignReferenceTargetExists: true,
      docuSignReferenceTargetVisible: true,
      proxyPatternBucket: 'same-proxy-pattern',
    }));
    expect(physical?.proxyReferenceSignature?.proxyTagBuckets).toEqual(expect.arrayContaining([
      'label',
      'role-radio',
      'button',
      'div',
    ]));
    expect(physical?.proxyReferenceSignature?.proxyRoleBuckets).toEqual(expect.arrayContaining([
      'radio',
      'none',
    ]));
    expect(physical?.proxyReferenceSignature?.valueHintBuckets).toEqual(expect.arrayContaining([
      'address-like-token',
      'physical-operating-address-token',
    ]));
    expect(businessPhysical?.proxyReferenceSignature?.valueHintBuckets).toEqual(expect.arrayContaining([
      'address-like-token',
      'business-physical-address-token',
    ]));
  });

  test('guarded physical address discovery field discovery omits raw proxy/reference values and keeps only safe buckets', async ({ page }) => {
    await page.setContent(`
      <style>
        .proxy-choice input {
          position: absolute;
          width: 0;
          height: 0;
          opacity: 0;
        }
        .proxy-choice label,
        .proxy-choice button,
        .proxy-choice div {
          display: inline-flex;
          width: 16px;
          height: 16px;
        }
      </style>
      <div class="proxy-choice" data-choice-kind="physical-operating-address">
        <input
          id="proxy-radio-raw"
          type="radio"
          name="addressOptions"
          aria-controls="https://demo.docusign.net/start?token=secret-token-value"
        />
        <label for="proxy-radio-raw" data-field-ref="hidden.person@example.test">
          <button type="button" data-tab-target="tab-form-element-secret-proxy" aria-describedby="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"></button>
        </label>
        <div id="tab-form-element-secret-proxy"></div>
      </div>
    `);

    const fields = await discoverFields(page);
    const signature = fields.find((field) => field.kind === 'radio')?.proxyReferenceSignature;
    const serializedSignature = JSON.stringify(signature);

    expect(signature).toEqual(expect.objectContaining({
      hasForIdReference: true,
      hasDataReference: true,
      hasDocuSignReference: true,
      valueHintBuckets: expect.arrayContaining(['generated-token-pattern']),
    }));
    expect(serializedSignature).not.toContain('https://demo.docusign.net/start');
    expect(serializedSignature).not.toContain('hidden.person@example.test');
    expect(serializedSignature).not.toContain('secret-token-value');
    expect(serializedSignature).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  test('guarded physical address discovery field discovery collects bounded same-wrapper and direct-sibling graphic signatures', async ({ page }) => {
    await page.setContent(`
      <style>
        .graphic-choice {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 8px 0;
        }
        .graphic-choice label,
        .graphic-choice span,
        .graphic-choice button {
          display: inline-flex;
          width: 18px;
          height: 18px;
        }
      </style>
      <div class="graphic-choice" data-choice-kind="physical-operating-address">
        <label class="choice-label selected-state"></label>
        <input id="graphic-radio-a" type="radio" name="addressOptions" />
        <span class="radio-ring selected physical operating address"></span>
        <button type="button" class="choice-dot"></button>
      </div>
      <div class="graphic-choice" data-choice-kind="same-choice">
        <label class="choice-label same-choice"></label>
        <input id="graphic-radio-b" type="radio" name="addressOptions" />
        <span class="radio-ring same choice"></span>
        <button type="button" class="choice-dot"></button>
      </div>
      <div class="graphic-choice" data-choice-kind="business-physical-address">
        <label class="choice-label business-choice"></label>
        <input id="graphic-radio-c" type="radio" name="addressOptions" />
        <span class="radio-ring business physical address"></span>
        <button type="button" class="choice-dot"></button>
      </div>
    `);

    const fields = await discoverFields(page);
    const radios = fields.filter((field) => field.kind === 'radio' && field.type === 'radio');
    const physical = radios.find((field) => field.elementId === 'graphic-radio-a');
    const businessPhysical = radios.find((field) => field.elementId === 'graphic-radio-c');

    expect(radios).toHaveLength(3);
    expect(physical?.radioGraphicSignature).toEqual(expect.objectContaining({
      candidateSlot: 1,
      sameWrapperChildTagBuckets: expect.arrayContaining(['label', 'span', 'button']),
      previousSiblingTagBuckets: expect.arrayContaining(['label']),
      nextSiblingTagBuckets: expect.arrayContaining(['span']),
      decorativeNodeBuckets: expect.arrayContaining(['pseudo-radio', 'button']),
      tokenHintBuckets: expect.arrayContaining([
        'radio-like-token',
        'selected-token',
        'address-like-token',
        'physical-like-token',
        'operating-like-token',
      ]),
      sameWrapperCommonalityBucket: 'same-wrapper-graphic-pattern',
      directSiblingCommonalityBucket: 'same-direct-sibling-graphic-pattern',
      hasUniqueTokenHintBucket: true,
      hasSharedTokenHintBucket: true,
    }));
    expect(businessPhysical?.radioGraphicSignature?.tokenHintBuckets).toEqual(expect.arrayContaining([
      'radio-like-token',
      'address-like-token',
      'business-like-token',
      'physical-like-token',
    ]));
  });

  test('guarded physical address discovery field discovery omits raw wrapper and sibling graphic values and keeps only safe buckets', async ({ page }) => {
    await page.setContent(`
      <style>
        .graphic-choice {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .graphic-choice label,
        .graphic-choice span,
        .graphic-choice button {
          display: inline-flex;
          width: 18px;
          height: 18px;
        }
      </style>
      <div class="graphic-choice https://demo.docusign.net/start?token=secret-token-value" data-choice-kind="physical-operating-address">
        <label class="hidden.person@example.test"></label>
        <input id="graphic-radio-raw" type="radio" name="addressOptions" />
        <span class="radio-ring selected physical operating address token-secret-value"></span>
        <button type="button" data-target="hidden.person@example.test"></button>
      </div>
    `);

    const fields = await discoverFields(page);
    const signature = fields.find((field) => field.kind === 'radio')?.radioGraphicSignature;
    const serializedSignature = JSON.stringify(signature);

    expect(signature).toEqual(expect.objectContaining({
      tokenHintBuckets: expect.arrayContaining([
        'radio-like-token',
        'selected-token',
        'address-like-token',
        'physical-like-token',
        'operating-like-token',
      ]),
    }));
    expect(serializedSignature).not.toContain('https://demo.docusign.net/start');
    expect(serializedSignature).not.toContain('hidden.person@example.test');
    expect(serializedSignature).not.toContain('secret-token-value');
    expect(serializedSignature).not.toContain('token-secret-value');
  });

  const fallbackRadioField = (overrides: Record<string, unknown> = {}) => ({
    index: 1,
    kind: 'radio',
    type: 'radio',
    controlCategory: 'merchant_input',
    visible: true,
    editable: true,
    sectionName: 'General',
    label: 'Required',
    resolvedLabel: 'Required',
    rawCandidateLabels: [],
    containerContextLabels: [],
    layoutProximityLabels: [],
    nonTextLayoutSignature: null,
    domAttributeSignature: null,
    proxyReferenceSignature: null,
    radioGraphicSignature: null,
    groupName: 'location_group',
    idOrNameKey: null,
    inferredType: { type: 'unknown' },
    ...overrides,
  });

  const nonTextSignature = (
    overrides: Record<string, unknown> = {},
  ) => ({
    groupMemberCount: 3,
    repeatedGroupPattern: true,
    groupPatternBucket: 'repeated-row-group',
    sharedContainerBucket: 'same-grandparent',
    alignmentBucket: 'horizontal',
    relativeOrderBucket: 'middle',
    spacingBucket: 'normal',
    shapeBucket: 'compact-group',
    layerBucket: 'html-form-layout',
    sharedDocumentLayer: false,
    metadataSignals: ['role', 'name'],
    metadataSignalCount: 2,
    metadataSignalsTruncated: false,
    ...overrides,
  });

  const attributeSignature = (
    overrides: Record<string, unknown> = {},
  ) => ({
    radioAttributeNames: ['id', 'name', 'type', 'aria-describedby'],
    radioAttributeNameCount: 4,
    radioAttributeNamesTruncated: false,
    wrapperSurfaces: [
      {
        depthBucket: 'parent',
        tagName: 'div',
        role: null,
        attributeNames: ['class', 'data-choice-kind'],
        attributeNameCount: 2,
        attributeNamesTruncated: false,
        tokenShapeBuckets: ['address-like-token', 'radio-like-token'],
        tokenShapeCount: 2,
        tokenShapesTruncated: false,
      },
    ],
    wrapperSurfacesTruncated: false,
    hasIdAttribute: true,
    hasNameAttribute: true,
    hasAriaLabel: false,
    hasAriaLabelledBy: false,
    hasAriaDescribedBy: true,
    hasDataAttributes: true,
    hasDocuSignMetadataAttributes: false,
    tokenShapeBuckets: ['address-like-token', 'radio-like-token'],
    tokenShapeCount: 2,
    tokenShapesTruncated: false,
    valueHintBuckets: ['address-like-token'],
    valueHintCount: 1,
    valueHintsTruncated: false,
    wrapperPatternBucket: 'same-wrapper-pattern',
    attributePatternBucket: 'mixed-attribute-pattern',
    ...overrides,
  });

  const proxyReferenceSignature = (
    overrides: Record<string, unknown> = {},
  ) => ({
    candidateSlot: 1,
    inputVisibilityBucket: 'visible-input',
    visibleProxyCount: 2,
    visibleProxyCountTruncated: false,
    proxyDepthBuckets: ['for-label'],
    proxyDepthCount: 1,
    proxyDepthsTruncated: false,
    proxyTagBuckets: ['label', 'button'],
    proxyTagCount: 2,
    proxyTagsTruncated: false,
    proxyRoleBuckets: ['none'],
    proxyRoleCount: 1,
    proxyRolesTruncated: false,
    hasProxyClassAttribute: true,
    hasProxyRoleAttribute: false,
    hasProxyAriaLabel: false,
    hasProxyAriaLabelledBy: false,
    hasProxyAriaDescribedBy: true,
    hasProxyAriaControls: false,
    hasProxyForAttribute: true,
    hasProxyDataAttributes: true,
    hasProxyDocuSignMetadataAttributes: false,
    hasProxyTabIndex: false,
    hasForIdReference: true,
    forReferenceTargetExists: true,
    forReferenceTargetVisible: true,
    hasAriaLabelledByReference: false,
    ariaLabelledByTargetExists: false,
    ariaLabelledByTargetVisible: false,
    hasAriaDescribedByReference: true,
    ariaDescribedByTargetExists: true,
    ariaDescribedByTargetVisible: true,
    hasAriaControlsReference: false,
    ariaControlsTargetExists: false,
    ariaControlsTargetVisible: false,
    hasDataReference: true,
    dataReferenceTargetExists: true,
    dataReferenceTargetVisible: true,
    hasDocuSignReference: false,
    docuSignReferenceTargetExists: false,
    docuSignReferenceTargetVisible: false,
    tokenShapeBuckets: ['address-like-token', 'radio-like-token'],
    tokenShapeCount: 2,
    tokenShapesTruncated: false,
    valueHintBuckets: ['address-like-token'],
    valueHintCount: 1,
    valueHintsTruncated: false,
    proxyPatternBucket: 'same-proxy-pattern',
    referencePatternBucket: 'mixed-reference-pattern',
    ...overrides,
  });

  const ownershipSourceDebugDefaults = () => ({
    ownershipSourceHarvestAttempted: true,
    ownershipSourceHarvestOutcomeCategory: 'ownership-source-safe-tokens-present',
    ownershipSourceHarvestRejectedReasons: [],
    ownershipSourceHarvestSummary: 'ownership source harvest found safe ownership/reference token buckets',
    ariaLabelledbyAttributePresentCount: 0,
    ariaDescribedbyAttributePresentCount: 0,
    sharedNamePresentCount: 0,
    sharedOwnerPresentCount: 3,
    docusignOwnerSignalPresentCount: 0,
    ownershipReferenceTargetLookupAttempted: true,
    ownershipReferenceTargetExistsCount: 3,
    ownershipReferenceTargetVisibleCount: 3,
    ownershipReferenceTargetSafeTokenCount: 1,
    ownershipEvidenceFilteredAsGeneratedOnlyCount: 0,
    ownershipEvidenceFilteredAsGenericOnlyCount: 0,
    ownershipEvidenceFilteredByRedactionCount: 0,
    ownershipEvidenceSourcesEmpty: false,
    ownershipEvidenceSourcesPresentButNoSafeTokens: false,
  });

  const radioGraphicSignature = (
    overrides: Record<string, unknown> = {},
  ) => ({
    candidateSlot: 1,
    sameWrapperChildTagBuckets: ['label', 'span', 'button'],
    sameWrapperChildTagCount: 3,
    sameWrapperChildTagsTruncated: false,
    previousSiblingTagBuckets: ['label'],
    previousSiblingTagCount: 1,
    previousSiblingTagsTruncated: false,
    nextSiblingTagBuckets: ['span'],
    nextSiblingTagCount: 1,
    nextSiblingTagsTruncated: false,
    decorativeNodeBuckets: ['pseudo-radio', 'button'],
    decorativeNodeCount: 2,
    decorativeNodesTruncated: false,
    roleBuckets: ['none'],
    roleCount: 1,
    rolesTruncated: false,
    tokenHintBuckets: ['radio-like-token'],
    tokenHintCount: 1,
    tokenHintsTruncated: false,
    hasSameChoiceCue: false,
    hasDifferentChoiceCue: false,
    hasYesChoiceCue: false,
    hasNoChoiceCue: false,
    sameWrapperCommonalityBucket: 'same-wrapper-graphic-pattern',
    directSiblingCommonalityBucket: 'same-direct-sibling-graphic-pattern',
    hasUniqueTokenHintBucket: false,
    hasSharedTokenHintBucket: true,
    ...overrides,
  });

  const layoutLabel = (
    value: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    direction: 'near-group',
    distanceBucket: 'near',
    association: 'group',
    value,
    ...overrides,
  });

  const calibratedFallbackReason = 'calibrated-business-primary-location-physical-address-option';
  const calibratedFallbackSlot = 2;
  const calibratedBusinessPrimaryLocationRadioField = (
    index: number,
    overrides: Record<string, unknown> = {},
  ) => fallbackRadioField({
    index,
    sectionName: null,
    label: null,
    resolvedLabel: null,
    groupName: 'addressOptions',
    idOrNameKey: null,
    ...overrides,
  });

  test('guarded physical address discovery fallback selects one visible radio-like control near explicit Physical Operating Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 1,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'General',
        label: 'Required',
        resolvedLabel: 'Required',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
        groupName: 'location_group',
        idOrNameKey: 'locationToggle',
        inferredType: { type: 'unknown' },
      },
    ] as any);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('locationToggle');
    expect(selection.primaryInventory.eligibleCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.visibleRadioInputCount).toBe(1);
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(selection.fallbackInventory?.entries[0].nearbyCueMatches.physicalOperatingAddress).toBe(true);
  });

  test('guarded physical address discovery fallback selects one visible role=radio control near Business Physical Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 2,
        kind: 'radio',
        type: null,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Same as primary location',
        resolvedLabel: 'Same as primary location',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Physical Address' },
        ],
        groupName: 'location_group',
        idOrNameKey: 'businessPhysicalToggle',
        inferredType: { type: 'unknown' },
      },
    ] as any);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('businessPhysicalToggle');
    expect(selection.fallbackInventory?.visibleRadioInputCount).toBe(0);
    expect(selection.fallbackInventory?.visibleRoleRadioCount).toBe(1);
    expect(selection.fallbackInventory?.entries[0].nearbyCueMatches.businessPhysicalAddress).toBe(true);
  });

  test('guarded physical address discovery fallback does not select radio-like control near Mailing Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 3,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Mailing Address',
        label: 'Required',
        resolvedLabel: 'Required',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Mailing Address' },
        ],
        groupName: 'mailing_group',
        idOrNameKey: 'mailingToggle',
        inferredType: { type: 'unknown' },
      },
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries[0].excludedReasons).toContain('matched-mailing-address');
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls match explicit physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 4,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Physical Operating Address',
        label: 'Required',
        resolvedLabel: 'Required',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
        groupName: 'physical_group',
        idOrNameKey: 'physicalToggleA',
        inferredType: { type: 'unknown' },
      },
      {
        index: 5,
        kind: 'radio',
        type: null,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Optional',
        resolvedLabel: 'Optional',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Physical Address' },
        ],
        groupName: 'physical_group',
        idOrNameKey: 'physicalToggleB',
        inferredType: { type: 'unknown' },
      },
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries).toHaveLength(2);
  });

  test('guarded physical address discovery fallback reports physical-address cue text when no radio-like controls exist', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 6,
        kind: 'textbox',
        type: 'text',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Physical Operating Address',
        label: 'Address Line 1',
        resolvedLabel: 'Address Line 1',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
        groupName: 'physical_address_section',
        idOrNameKey: 'businessMailingAddress.line1',
        inferredType: { type: 'address_line_1' },
      },
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.visibleRadioLikeCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.cueObservationCount).toBe(1);
    expect(selection.fallbackInventory?.cueObservations[0].cueMatches.physicalOperatingAddress).toBe(true);
  });

  test('guarded physical address discovery fallback inventories sibling Physical Operating Address text across three radio-like controls', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 21,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Same' },
        ],
      }),
      fallbackRadioField({
        index: 22,
        idOrNameKey: 'physicalToggle',
        label: 'Yes',
        resolvedLabel: 'Yes',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
      }),
      fallbackRadioField({
        index: 23,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Different' },
        ],
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 22);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('physicalToggle');
    expect(selection.fallbackInventory?.visibleRadioLikeCandidateCount).toBe(3);
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.siblingCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.siblingTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'preceding-text' }),
    ]));
    expect(targetEntry?.siblingTextFragments.some((entry) => entry.text.includes('Physical Operating Address'))).toBe(true);
    expect(targetEntry?.resolvedLabelFragments).toEqual(['Yes']);
    expect(targetEntry?.resolvedLabelCueMatches.yes).toBe(true);
  });

  test('guarded physical address discovery fallback inventories ancestor Business Physical Address text across three radio-like controls', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 24,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Yes' },
        ],
      }),
      fallbackRadioField({
        index: 25,
        idOrNameKey: 'businessPhysicalToggle',
        label: 'Required',
        resolvedLabel: 'Required',
        sectionName: 'Business Physical Address',
        rawCandidateLabels: [
          { source: 'described-by', value: 'Business Physical Address' },
        ],
      }),
      fallbackRadioField({
        index: 26,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        rawCandidateLabels: [
          { source: 'label-for', value: 'No' },
        ],
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 25);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('businessPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.ancestorCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.ancestorTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Business Physical Address' }),
    ]));
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 26)?.resolvedLabelFragments).toEqual(['No']);
  });

  test('guarded physical address discovery fallback refuses mailing or legal neighbor cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 27,
        idOrNameKey: 'mailingToggle',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Mailing Address' },
        ],
      }),
      fallbackRadioField({
        index: 28,
        idOrNameKey: 'legalToggle',
        rawCandidateLabels: [
          { source: 'described-by', value: 'Legal Address' },
        ],
      }),
      fallbackRadioField({
        index: 29,
        idOrNameKey: 'sameToggle',
        label: 'Same',
        resolvedLabel: 'Same',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Same' },
        ],
      }),
    ] as any);

    const mailingEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 27);
    const legalEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 28);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(mailingEntry?.siblingCueMatches.mailingAddress).toBe(true);
    expect(mailingEntry?.excludedReasons).toContain('matched-mailing-address');
    expect(legalEntry?.ancestorCueMatches.legalAddress).toBe(true);
    expect(legalEntry?.excludedReasons).toContain('matched-legal-address');
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry neighbor physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 30,
        idOrNameKey: 'physicalToggleA',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
      }),
      fallbackRadioField({
        index: 31,
        idOrNameKey: 'physicalToggleB',
        sectionName: 'Business Physical Address',
        rawCandidateLabels: [
          { source: 'described-by', value: 'Business Physical Address' },
        ],
      }),
      fallbackRadioField({
        index: 32,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Different' },
        ],
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback reports Same Different Yes and No labels but fails closed without physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 33,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Same' },
        ],
      }),
      fallbackRadioField({
        index: 34,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Different' },
        ],
      }),
      fallbackRadioField({
        index: 35,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
        rawCandidateLabels: [
          { source: 'label-for', value: 'Yes' },
        ],
      }),
      fallbackRadioField({
        index: 36,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        rawCandidateLabels: [
          { source: 'label-for', value: 'No' },
        ],
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 33)?.resolvedLabelFragments).toEqual(['Same']);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 34)?.resolvedLabelFragments).toEqual(['Different']);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 35)?.resolvedLabelFragments).toEqual(['Yes']);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 36)?.resolvedLabelFragments).toEqual(['No']);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 33)?.resolvedLabelCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 34)?.resolvedLabelCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 35)?.resolvedLabelCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 36)?.resolvedLabelCueMatches.no).toBe(true);
  });

  test('guarded physical address discovery fallback inventories container section Physical Operating Address text across three radio-like controls', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 37,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        containerContextLabels: [
          { source: 'container-parent', value: 'Same' },
        ],
      }),
      fallbackRadioField({
        index: 38,
        idOrNameKey: 'physicalContainerToggle',
        containerContextLabels: [
          { source: 'container-section', value: 'Physical Operating Address' },
        ],
      }),
      fallbackRadioField({
        index: 39,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        containerContextLabels: [
          { source: 'container-following', value: 'No' },
        ],
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 38);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('physicalContainerToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.containerSectionCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.containerSectionTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'container-section' }),
    ]));
    expect(targetEntry?.containerSectionTextFragments.some((entry) => entry.text.includes('Physical Operating Address'))).toBe(true);
  });

  test('guarded physical address discovery fallback inventories container grandparent Business Physical Address text across three radio-like controls', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 40,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
      }),
      fallbackRadioField({
        index: 41,
        idOrNameKey: 'businessPhysicalContainerToggle',
        containerContextLabels: [
          { source: 'container-grandparent', value: 'Business Physical Address' },
        ],
      }),
      fallbackRadioField({
        index: 42,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 41);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('businessPhysicalContainerToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.containerGrandparentCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.containerGrandparentTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'container-grandparent', text: 'Business Physical Address' }),
    ]));
  });

  test('guarded physical address discovery fallback selects one visible radio-like control with unique detached Physical Operating Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 53,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        layoutProximityLabels: [
          layoutLabel('Same', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 54,
        idOrNameKey: 'layoutPhysicalToggle',
        layoutProximityLabels: [
          layoutLabel('Physical Operating Address', { direction: 'below', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 55,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        layoutProximityLabels: [
          layoutLabel('Different', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 54);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('layoutPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.layoutProximityCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.layoutProximityTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'below',
        distanceBucket: 'near',
        association: 'closest-radio',
      }),
    ]));
    expect(targetEntry?.layoutProximityTextFragments.some((entry) => entry.text.includes('Physical Operating Address'))).toBe(true);
  });

  test('guarded physical address discovery fallback selects one visible radio-like control with unique detached Business Physical Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 56,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
        layoutProximityLabels: [
          layoutLabel('Yes', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 57,
        idOrNameKey: 'layoutBusinessPhysicalToggle',
        layoutProximityLabels: [
          layoutLabel('Business Physical Address', { direction: 'right', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 58,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        layoutProximityLabels: [
          layoutLabel('No', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 57);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('layoutBusinessPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.layoutProximityCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.layoutProximityTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        direction: 'right',
        distanceBucket: 'near',
        association: 'closest-radio',
        text: 'Business Physical Address',
      }),
    ]));
  });

  test('guarded physical address discovery fallback refuses detached Mailing Address or Legal Address text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 59,
        idOrNameKey: 'layoutMailingToggle',
        layoutProximityLabels: [
          layoutLabel('Mailing Address', { direction: 'below', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 60,
        idOrNameKey: 'layoutLegalToggle',
        layoutProximityLabels: [
          layoutLabel('Legal Address', { direction: 'above', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 61,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
      }),
    ] as any);

    const mailingEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 59);
    const legalEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 60);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(mailingEntry?.layoutProximityCueMatches.mailingAddress).toBe(true);
    expect(mailingEntry?.excludedReasons).toContain('matched-mailing-address');
    expect(legalEntry?.layoutProximityCueMatches.legalAddress).toBe(true);
    expect(legalEntry?.excludedReasons).toContain('matched-legal-address');
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry detached physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 62,
        idOrNameKey: 'layoutPhysicalToggleA',
        layoutProximityLabels: [
          layoutLabel('Physical Operating Address', { direction: 'below', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 63,
        idOrNameKey: 'layoutPhysicalToggleB',
        layoutProximityLabels: [
          layoutLabel('Business Physical Address', { direction: 'right', distanceBucket: 'near', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 64,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback inventories detached Same Different Yes No labels with a group-level physical prompt but stays fail-closed', () => {
    const prompt = layoutLabel('Physical Operating Address', {
      direction: 'near-group',
      distanceBucket: 'near',
      association: 'group',
    });
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 65,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        layoutProximityLabels: [
          prompt,
          layoutLabel('Same', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 66,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        layoutProximityLabels: [
          prompt,
          layoutLabel('Different', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 67,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
        layoutProximityLabels: [
          prompt,
          layoutLabel('Yes', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
      fallbackRadioField({
        index: 68,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        layoutProximityLabels: [
          prompt,
          layoutLabel('No', { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio' }),
        ],
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(4);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 65)?.layoutProximityCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 66)?.layoutProximityCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 67)?.layoutProximityCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 68)?.layoutProximityCueMatches.no).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.layoutProximityCueMatches.physicalOperatingAddress)).toBe(true);
  });

  test('guarded physical address discovery fallback keeps detached layout inventory empty and fails closed when no nearby text exists', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({ index: 69, idOrNameKey: 'toggleA' }),
      fallbackRadioField({ index: 70, idOrNameKey: 'toggleB' }),
      fallbackRadioField({ index: 71, idOrNameKey: 'toggleC' }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.layoutProximityTextFragments.length === 0)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.layoutProximityTextTruncated === false)).toBe(true);
  });

  test('guarded physical address discovery fallback inventories repeated non-text radio layout signatures without selecting anything', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 72,
        idOrNameKey: 'toggleFirst',
        nonTextLayoutSignature: nonTextSignature({ relativeOrderBucket: 'first', spacingBucket: 'tight' }),
      }),
      fallbackRadioField({
        index: 73,
        idOrNameKey: 'toggleMiddle',
        nonTextLayoutSignature: nonTextSignature({ relativeOrderBucket: 'middle', spacingBucket: 'tight' }),
      }),
      fallbackRadioField({
        index: 74,
        idOrNameKey: 'toggleLast',
        nonTextLayoutSignature: nonTextSignature({ relativeOrderBucket: 'last', spacingBucket: 'tight' }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.map((entry) => entry.nonTextLayoutSignature?.relativeOrderBucket)).toEqual([
      'first',
      'middle',
      'last',
    ]);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.nonTextLayoutSignature?.groupPatternBucket === 'repeated-row-group')).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.nonTextLayoutSignature?.spacingBucket === 'tight')).toBe(true);
  });

  test('guarded physical address discovery fallback inventories overlay-like non-text layer metadata safely', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 75,
        idOrNameKey: 'overlayToggleA',
        nonTextLayoutSignature: nonTextSignature({
          relativeOrderBucket: 'first',
          layerBucket: 'document-layer',
          sharedDocumentLayer: true,
          metadataSignals: ['role', 'name', 'data-tab-type', 'tab-guid', 'page-index', 'ordinal-on-page'],
          metadataSignalCount: 6,
        }),
      }),
      fallbackRadioField({
        index: 76,
        idOrNameKey: 'overlayToggleB',
        nonTextLayoutSignature: nonTextSignature({
          relativeOrderBucket: 'middle',
          layerBucket: 'document-layer',
          sharedDocumentLayer: true,
          metadataSignals: ['role', 'name', 'data-tab-type', 'tab-guid', 'page-index', 'ordinal-on-page'],
          metadataSignalCount: 6,
        }),
      }),
      fallbackRadioField({
        index: 77,
        idOrNameKey: 'overlayToggleC',
        nonTextLayoutSignature: nonTextSignature({
          relativeOrderBucket: 'last',
          layerBucket: 'document-layer',
          sharedDocumentLayer: true,
          metadataSignals: ['role', 'name', 'data-tab-type', 'tab-guid', 'page-index', 'ordinal-on-page'],
          metadataSignalCount: 6,
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.nonTextLayoutSignature?.layerBucket === 'document-layer')).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.nonTextLayoutSignature?.sharedDocumentLayer === true)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => (entry.nonTextLayoutSignature?.metadataSignals ?? []).includes('data-tab-type'))).toBe(true);
  });

  test('guarded physical address discovery fallback keeps non-text signatures inventory-only even for unique structural outliers', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 78,
        idOrNameKey: 'htmlToggleA',
        nonTextLayoutSignature: nonTextSignature({ relativeOrderBucket: 'first' }),
      }),
      fallbackRadioField({
        index: 79,
        idOrNameKey: 'overlayOutlierToggle',
        nonTextLayoutSignature: nonTextSignature({
          relativeOrderBucket: 'middle',
          layerBucket: 'document-layer',
          sharedDocumentLayer: true,
          metadataSignals: ['role', 'name', 'data-tab-type', 'tab-guid', 'page-index'],
          metadataSignalCount: 5,
        }),
      }),
      fallbackRadioField({
        index: 80,
        idOrNameKey: 'htmlToggleB',
        nonTextLayoutSignature: nonTextSignature({ relativeOrderBucket: 'last' }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 79)?.nonTextLayoutSignature?.layerBucket).toBe('document-layer');
  });

  test('guarded physical address discovery fallback fails closed for ambiguous non-text radio groups', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 81,
        idOrNameKey: 'ambiguousToggleA',
        nonTextLayoutSignature: nonTextSignature({ groupPatternBucket: 'mixed-group', alignmentBucket: 'mixed' }),
      }),
      fallbackRadioField({
        index: 82,
        idOrNameKey: 'ambiguousToggleB',
        nonTextLayoutSignature: nonTextSignature({ groupPatternBucket: 'mixed-group', alignmentBucket: 'mixed' }),
      }),
      fallbackRadioField({
        index: 83,
        idOrNameKey: 'ambiguousToggleC',
        nonTextLayoutSignature: nonTextSignature({ groupPatternBucket: 'mixed-group', alignmentBucket: 'mixed' }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.nonTextLayoutSignature?.groupPatternBucket === 'mixed-group')).toBe(true);
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Physical Operating Address attribute signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 84,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['same-token'],
          valueHintCount: 1,
          tokenShapeBuckets: ['radio-like-token'],
          tokenShapeCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 85,
        idOrNameKey: 'attributePhysicalToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'physical-operating-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 86,
        idOrNameKey: 'toggleDifferent',
        label: 'Different',
        resolvedLabel: 'Different',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['different-token'],
          valueHintCount: 1,
          tokenShapeBuckets: ['radio-like-token'],
          tokenShapeCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 85);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('attributePhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.attributeCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.domAttributeSignature?.valueHintBuckets).toEqual(expect.arrayContaining([
      'physical-operating-address-token',
    ]));
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Business Physical Address attribute signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 87,
        idOrNameKey: 'toggleYes',
        label: 'Yes',
        resolvedLabel: 'Yes',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['yes-token'],
          valueHintCount: 1,
          tokenShapeBuckets: ['radio-like-token'],
          tokenShapeCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 88,
        idOrNameKey: 'attributeBusinessPhysicalToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'business-physical-address-token'],
          valueHintCount: 2,
          hasDocuSignMetadataAttributes: true,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 89,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['no-token'],
          valueHintCount: 1,
          tokenShapeBuckets: ['radio-like-token'],
          tokenShapeCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 88);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('attributeBusinessPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.attributeCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.domAttributeSignature?.hasDocuSignMetadataAttributes).toBe(true);
  });

  test('guarded physical address discovery fallback refuses mailing legal or virtual attribute-token signatures', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 90,
        idOrNameKey: 'mailingAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'mailing-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 91,
        idOrNameKey: 'legalAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'legal-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 92,
        idOrNameKey: 'virtualAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'virtual-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 90)?.attributeCueMatches.mailingAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 91)?.attributeCueMatches.legalAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 92)?.attributeCueMatches.virtualAddress).toBe(true);
  });

  test('guarded physical address discovery fallback inventories same different yes and no attribute tokens but stays fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 93,
        idOrNameKey: 'sameAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['same-token'],
          valueHintCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 94,
        idOrNameKey: 'differentAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['different-token'],
          valueHintCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 95,
        idOrNameKey: 'yesAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['yes-token'],
          valueHintCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 96,
        idOrNameKey: 'noAttributeToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['no-token'],
          valueHintCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 93)?.attributeCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 94)?.attributeCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 95)?.attributeCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 96)?.attributeCueMatches.no).toBe(true);
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry attribute-based physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 97,
        idOrNameKey: 'attributePhysicalToggleA',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'physical-operating-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 98,
        idOrNameKey: 'attributePhysicalToggleB',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token', 'business-physical-address-token'],
          valueHintCount: 2,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 99,
        idOrNameKey: 'attributeNeutralToggle',
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['address-like-token'],
          valueHintCount: 1,
          attributePatternBucket: 'distinct-attribute-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback keeps generated and generic attribute signatures bounded and fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 100,
        idOrNameKey: 'genericAttributeToggleA',
        domAttributeSignature: attributeSignature({
          radioAttributeNames: ['id', 'name', 'type'],
          radioAttributeNameCount: 3,
          wrapperSurfaces: [
            {
              depthBucket: 'parent',
              tagName: 'div',
              role: null,
              attributeNames: ['class'],
              attributeNameCount: 1,
              attributeNamesTruncated: false,
              tokenShapeBuckets: ['radio-like-token', 'generated-token-pattern'],
              tokenShapeCount: 2,
              tokenShapesTruncated: false,
            },
          ],
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          attributePatternBucket: 'same-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 101,
        idOrNameKey: 'genericAttributeToggleB',
        domAttributeSignature: attributeSignature({
          radioAttributeNames: ['id', 'name', 'type'],
          radioAttributeNameCount: 3,
          wrapperSurfaces: [
            {
              depthBucket: 'parent',
              tagName: 'div',
              role: null,
              attributeNames: ['class'],
              attributeNameCount: 1,
              attributeNamesTruncated: false,
              tokenShapeBuckets: ['radio-like-token', 'generated-token-pattern'],
              tokenShapeCount: 2,
              tokenShapesTruncated: false,
            },
          ],
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          attributePatternBucket: 'same-attribute-pattern',
        }),
      }),
      fallbackRadioField({
        index: 102,
        idOrNameKey: 'genericAttributeToggleC',
        domAttributeSignature: attributeSignature({
          radioAttributeNames: ['id', 'name', 'type'],
          radioAttributeNameCount: 3,
          wrapperSurfaces: [
            {
              depthBucket: 'parent',
              tagName: 'div',
              role: null,
              attributeNames: ['class'],
              attributeNameCount: 1,
              attributeNamesTruncated: false,
              tokenShapeBuckets: ['radio-like-token', 'generated-token-pattern'],
              tokenShapeCount: 2,
              tokenShapesTruncated: false,
            },
          ],
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          attributePatternBucket: 'same-attribute-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.domAttributeSignature?.valueHintBuckets.includes('generated-token-pattern'))).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.domAttributeSignature?.wrapperSurfaces.length === 1)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.attributeCueMatches.physicalOperatingAddress === false)).toBe(true);
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Physical Operating Address proxy/reference signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 103,
        idOrNameKey: 'proxyYesToggle',
        label: 'Yes',
        resolvedLabel: 'Yes',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['yes-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 104,
        idOrNameKey: 'proxyPhysicalToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'physical-operating-address-token'],
          valueHintCount: 2,
          hasDocuSignReference: true,
          docuSignReferenceTargetExists: true,
          docuSignReferenceTargetVisible: true,
          proxyPatternBucket: 'distinct-proxy-pattern',
          referencePatternBucket: 'distinct-reference-pattern',
        }),
      }),
      fallbackRadioField({
        index: 105,
        idOrNameKey: 'proxyNoToggle',
        label: 'No',
        resolvedLabel: 'No',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['no-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 104);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('proxyPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.proxyCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.proxyReferenceSignature?.hasDocuSignReference).toBe(true);
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Business Physical Address proxy/reference signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 106,
        idOrNameKey: 'proxyNeutralToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['same-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 107,
        idOrNameKey: 'proxyBusinessPhysicalToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'business-physical-address-token'],
          valueHintCount: 2,
          hasProxyDocuSignMetadataAttributes: true,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 108,
        idOrNameKey: 'proxyNoToggle',
        label: 'No',
        resolvedLabel: 'No',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['no-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 107);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('proxyBusinessPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.proxyCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.proxyReferenceSignature?.hasProxyDocuSignMetadataAttributes).toBe(true);
  });

  test('guarded physical address discovery fallback refuses mailing legal or virtual proxy/reference signatures', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 109,
        idOrNameKey: 'mailingProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'mailing-address-token'],
          valueHintCount: 2,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 110,
        idOrNameKey: 'legalProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'legal-address-token'],
          valueHintCount: 2,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 111,
        idOrNameKey: 'virtualProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'virtual-address-token'],
          valueHintCount: 2,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 109)?.proxyCueMatches.mailingAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 110)?.proxyCueMatches.legalAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 111)?.proxyCueMatches.virtualAddress).toBe(true);
  });

  test('guarded physical address discovery fallback inventories same different yes and no proxy/reference tokens but stays fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 112,
        idOrNameKey: 'sameProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['same-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 113,
        idOrNameKey: 'differentProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['different-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 114,
        idOrNameKey: 'yesProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['yes-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 115,
        idOrNameKey: 'noProxyToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['no-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 112)?.proxyCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 113)?.proxyCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 114)?.proxyCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 115)?.proxyCueMatches.no).toBe(true);
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry proxy/reference physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 116,
        idOrNameKey: 'proxyPhysicalToggleA',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'physical-operating-address-token'],
          valueHintCount: 2,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 117,
        idOrNameKey: 'proxyPhysicalToggleB',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token', 'business-physical-address-token'],
          valueHintCount: 2,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
      fallbackRadioField({
        index: 118,
        idOrNameKey: 'proxyNeutralToggle',
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['address-like-token'],
          valueHintCount: 1,
          proxyPatternBucket: 'distinct-proxy-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback keeps generated and generic proxy/reference signatures bounded and fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 119,
        idOrNameKey: 'genericProxyToggleA',
        proxyReferenceSignature: proxyReferenceSignature({
          proxyTagBuckets: ['label'],
          proxyTagCount: 1,
          proxyRoleBuckets: ['none'],
          proxyRoleCount: 1,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          proxyPatternBucket: 'same-proxy-pattern',
          referencePatternBucket: 'same-reference-pattern',
        }),
      }),
      fallbackRadioField({
        index: 120,
        idOrNameKey: 'genericProxyToggleB',
        proxyReferenceSignature: proxyReferenceSignature({
          proxyTagBuckets: ['label'],
          proxyTagCount: 1,
          proxyRoleBuckets: ['none'],
          proxyRoleCount: 1,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          proxyPatternBucket: 'same-proxy-pattern',
          referencePatternBucket: 'same-reference-pattern',
        }),
      }),
      fallbackRadioField({
        index: 121,
        idOrNameKey: 'genericProxyToggleC',
        proxyReferenceSignature: proxyReferenceSignature({
          proxyTagBuckets: ['label'],
          proxyTagCount: 1,
          proxyRoleBuckets: ['none'],
          proxyRoleCount: 1,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
          proxyPatternBucket: 'same-proxy-pattern',
          referencePatternBucket: 'same-reference-pattern',
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.proxyReferenceSignature?.valueHintBuckets.includes('generated-token-pattern'))).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.proxyReferenceSignature?.proxyTagBuckets.length === 1)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.proxyCueMatches.physicalOperatingAddress === false)).toBe(true);
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Physical Operating Address graphic signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 122,
        idOrNameKey: 'graphicNeutralToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasUniqueTokenHintBucket: false,
        }),
      }),
      fallbackRadioField({
        index: 123,
        idOrNameKey: 'graphicPhysicalToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'selected-token', 'address-like-token', 'physical-like-token', 'operating-like-token'],
          tokenHintCount: 5,
          hasUniqueTokenHintBucket: true,
          hasSharedTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 124,
        idOrNameKey: 'graphicNoToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasNoChoiceCue: true,
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 123);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('graphicPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.graphicCueMatches.physicalOperatingAddress).toBe(true);
    expect(targetEntry?.radioGraphicSignature?.hasUniqueTokenHintBucket).toBe(true);
  });

  test('guarded physical address discovery fallback selects one radio-like control with a unique Business Physical Address graphic signature', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 125,
        idOrNameKey: 'graphicSameToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSameChoiceCue: true,
        }),
      }),
      fallbackRadioField({
        index: 126,
        idOrNameKey: 'graphicBusinessPhysicalToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'business-like-token', 'physical-like-token'],
          tokenHintCount: 4,
          hasUniqueTokenHintBucket: true,
          hasSharedTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 127,
        idOrNameKey: 'graphicNoToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasNoChoiceCue: true,
        }),
      }),
    ] as any);

    const targetEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 126);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectedField?.idOrNameKey).toBe('graphicBusinessPhysicalToggle');
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(1);
    expect(targetEntry?.graphicCueMatches.businessPhysicalAddress).toBe(true);
    expect(targetEntry?.radioGraphicSignature?.directSiblingCommonalityBucket).toBe('same-direct-sibling-graphic-pattern');
  });

  test('guarded physical address discovery fallback refuses mailing legal or virtual graphic signatures', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 128,
        idOrNameKey: 'graphicMailingToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'mailing-like-token'],
          tokenHintCount: 3,
          hasUniqueTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 129,
        idOrNameKey: 'graphicLegalToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'legal-like-token'],
          tokenHintCount: 3,
          hasUniqueTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 130,
        idOrNameKey: 'graphicVirtualToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'virtual-like-token'],
          tokenHintCount: 3,
          hasUniqueTokenHintBucket: true,
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 128)?.graphicCueMatches.mailingAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 129)?.graphicCueMatches.legalAddress).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 130)?.graphicCueMatches.virtualAddress).toBe(true);
  });

  test('guarded physical address discovery fallback inventories same different yes and no graphic cues but stays fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 131,
        idOrNameKey: 'graphicSameToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSameChoiceCue: true,
        }),
      }),
      fallbackRadioField({
        index: 132,
        idOrNameKey: 'graphicDifferentToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasDifferentChoiceCue: true,
        }),
      }),
      fallbackRadioField({
        index: 133,
        idOrNameKey: 'graphicYesToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasYesChoiceCue: true,
        }),
      }),
      fallbackRadioField({
        index: 134,
        idOrNameKey: 'graphicNoToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasNoChoiceCue: true,
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 131)?.graphicCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 132)?.graphicCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 133)?.graphicCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 134)?.graphicCueMatches.no).toBe(true);
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry graphic physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 135,
        idOrNameKey: 'graphicPhysicalToggleA',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'physical-like-token', 'operating-like-token'],
          tokenHintCount: 4,
          hasUniqueTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 136,
        idOrNameKey: 'graphicPhysicalToggleB',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'address-like-token', 'business-like-token', 'physical-like-token'],
          tokenHintCount: 4,
          hasUniqueTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 137,
        idOrNameKey: 'graphicNeutralToggle',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback keeps generated and generic graphic signatures bounded and fail-closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 138,
        idOrNameKey: 'graphicGenericToggleA',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 139,
        idOrNameKey: 'graphicGenericToggleB',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      fallbackRadioField({
        index: 140,
        idOrNameKey: 'graphicGenericToggleC',
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.radioGraphicSignature?.tokenHintBuckets.includes('generated/generic-only-token'))).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.graphicCueMatches.physicalOperatingAddress === false)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.radioGraphicSignature?.sameWrapperChildTagBuckets.length === 3)).toBe(true);
  });

  test('guarded physical address discovery calibrated fallback selects the second unlabeled radio in the exact-three business primary location layout', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(141),
      calibratedBusinessPrimaryLocationRadioField(142),
      calibratedBusinessPrimaryLocationRadioField(143),
    ] as any);

    expect(selection.selectionMode).toBe('calibrated-fallback');
    expect(selection.selectionReason).toBe(calibratedFallbackReason);
    expect(selection.selectedField?.index).toBe(142);
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      candidateCount: 3,
      eligibleCandidateCount: 3,
      targetCalibratedSlot: calibratedFallbackSlot,
      selectedCalibratedSlot: calibratedFallbackSlot,
      fallbackReason: calibratedFallbackReason,
      cueBasedFailureReason: 'no-explicit-physical-cue-match',
      allowed: true,
      addressOptionsClusterGuardPassed: true,
      addressOptionsAnchorOutcomeCategory: 'anchor-matched-label',
      candidateOrderStable: true,
      exactThreeRadioGuardPassed: true,
      conflictingCueDetected: false,
      generatedValuesOmitted: true,
    }));
    expect(selection.fallbackInventory?.entries.every((entry) => entry.resolvedLabelFragments.length === 0)).toBe(true);
  });

  test('guarded physical address discovery calibrated fallback anchor evidence reports field-key match from safe field-key buckets', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(141, { groupName: null, idOrNameKey: 'addressOptions' }),
      calibratedBusinessPrimaryLocationRadioField(142, { groupName: null, idOrNameKey: 'addressOptions' }),
      calibratedBusinessPrimaryLocationRadioField(143, { groupName: null, idOrNameKey: 'addressOptions' }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsAnchorMatched).toBe(true);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-matched-field-key');
    expect(summary.addressOptionsAnchorFieldKeyBucketsPresent).toEqual(
      expect.arrayContaining(['address-options', 'address']),
    );
    expect(summary.addressOptionsAnchorSafeTokensObserved).toContain('address-options');
  });

  test('guarded physical address discovery calibrated fallback group anchor evidence reports accessible-name match from safe buckets without raw text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(141, { groupName: 'Business Primary Location', idOrNameKey: 'addressOptions' }),
      calibratedBusinessPrimaryLocationRadioField(142, { groupName: 'Business Primary Location', idOrNameKey: 'addressOptions' }),
      calibratedBusinessPrimaryLocationRadioField(143, { groupName: 'Business Primary Location', idOrNameKey: 'addressOptions' }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-accessible-name');
    expect(summary.radioGroupAccessibleNameBucketsPresent).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(summary.addressOptionsGroupAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(serialized).not.toContain('Business Primary Location');
  });

  test('guarded physical address discovery calibrated fallback anchor evidence reports container match from safe container buckets', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(144, {
        groupName: null,
        containerContextLabels: [{ source: 'container-parent', value: 'addressOptions' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(145, {
        groupName: null,
        containerContextLabels: [{ source: 'container-parent', value: 'addressOptions' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(146, {
        groupName: null,
        containerContextLabels: [{ source: 'container-parent', value: 'addressOptions' }],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsAnchorMatched).toBe(true);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-matched-container');
    expect(summary.addressOptionsAnchorContainerBucketsPresent).toEqual(
      expect.arrayContaining(['address-options', 'address']),
    );
  });

  test('guarded physical address discovery calibrated fallback group anchor evidence reports legend match from bounded section buckets', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(144, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        containerContextLabels: [{ source: 'container-section', value: 'Registered Legal Address' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(145, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        containerContextLabels: [{ source: 'container-section', value: 'Registered Legal Address' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(146, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        containerContextLabels: [{ source: 'container-section', value: 'Registered Legal Address' }],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-legend');
    expect(summary.radioGroupLegendBucketsPresent).toEqual(expect.arrayContaining(['registered-legal-address']));
  });

  test('guarded physical address discovery calibrated fallback group anchor evidence reports question-prompt buckets without leaking raw prompt text', () => {
    const prompt = 'Is the Registered Legal Address a P.O. Box or a virtual/registered agent address?';
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(147, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        rawCandidateLabels: [{ source: 'positional-prompt', value: prompt }],
      }),
      calibratedBusinessPrimaryLocationRadioField(148, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        rawCandidateLabels: [{ source: 'positional-prompt', value: prompt }],
      }),
      calibratedBusinessPrimaryLocationRadioField(149, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        rawCandidateLabels: [{ source: 'positional-prompt', value: prompt }],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-question-prompt');
    expect(summary.radioGroupQuestionPromptBucketsPresent).toEqual(
      expect.arrayContaining(['registered-legal-address', 'po-box', 'virtual-agent']),
    );
    expect(serialized).not.toContain(prompt);
  });

  test('guarded physical address discovery calibrated fallback group anchor evidence reports section and association buckets from bounded context', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(150, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        sectionName: 'Business Primary Location',
        layoutProximityLabels: [layoutLabel('Proof of Address')],
      }),
      calibratedBusinessPrimaryLocationRadioField(151, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        sectionName: 'Business Primary Location',
        layoutProximityLabels: [layoutLabel('Proof of Address')],
      }),
      calibratedBusinessPrimaryLocationRadioField(152, {
        groupName: null,
        idOrNameKey: 'addressOptions',
        sectionName: 'Business Primary Location',
        layoutProximityLabels: [layoutLabel('Proof of Address')],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-section-header');
    expect(summary.radioGroupSectionHeaderBucketsPresent).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(summary.radioGroupAssociationBucketsPresent).toEqual(expect.arrayContaining(['proof-of-address']));
  });

  test('guarded physical address discovery calibrated fallback ownership anchor evidence reports aria-labelledby match from safe buckets without raw reference hints', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(162, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['physical-operating-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(163, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['physical-operating-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(164, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['physical-operating-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-aria-labelledby');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(summary.ariaLabelledbyAttributePresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.ownershipReferenceTargetVisibleCount).toBe(3);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBeGreaterThan(0);
    expect(summary.radioGroupAriaLabelledbyBucketsPresent).toEqual(expect.arrayContaining(['physical-operating-address']));
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual(
      expect.arrayContaining(['physical-operating-address', 'generated-reference-only']),
    );
    expect(summary.radioGroupReferenceTargetExists).toBe(true);
    expect(summary.radioGroupReferenceTargetVisible).toBe(true);
    expect(serialized).not.toContain('physical-operating-address-token');
    expect(serialized).not.toContain('generated-token-pattern');
  });

  test('guarded physical address discovery calibrated fallback ownership anchor evidence reports aria-describedby match from safe buckets without raw reference hints', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(165, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: true,
          ariaDescribedByTargetVisible: true,
          valueHintBuckets: ['legal-address-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(166, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: true,
          ariaDescribedByTargetVisible: true,
          valueHintBuckets: ['legal-address-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(167, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: true,
          ariaDescribedByTargetVisible: true,
          valueHintBuckets: ['legal-address-token'],
          valueHintCount: 1,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-aria-describedby');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(summary.ariaDescribedbyAttributePresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBeGreaterThan(0);
    expect(summary.radioGroupAriaDescribedbyBucketsPresent).toEqual(expect.arrayContaining(['registered-legal-address']));
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['registered-legal-address']));
    expect(serialized).not.toContain('legal-address-token');
  });

  test('guarded physical address discovery calibrated fallback ownership anchor evidence reports shared-name buckets without leaking raw name text', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(168, { groupName: 'Business Primary Location' }),
      calibratedBusinessPrimaryLocationRadioField(169, { groupName: 'Business Primary Location' }),
      calibratedBusinessPrimaryLocationRadioField(170, { groupName: 'Business Primary Location' }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-shared-name');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(summary.sharedNamePresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(false);
    expect(summary.radioGroupSharedNameBucketsPresent).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(summary.radioGroupCommonOwnerCategory).toBe('shared-name');
    expect(serialized).not.toContain('Business Primary Location');
  });

  test('guarded physical address discovery calibrated fallback ownership anchor evidence reports shared-owner buckets from bounded ownership hints', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(171, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['business-physical-address-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(172, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['business-physical-address-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(173, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['business-physical-address-token'],
          valueHintCount: 1,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-shared-owner');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(summary.sharedOwnerPresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.radioGroupSharedOwnerBucketsPresent).toEqual(expect.arrayContaining(['physical-operating-address']));
    expect(summary.radioGroupCommonOwnerCategory).toBe('shared-owner');
  });

  test('guarded physical address discovery calibrated fallback ownership anchor evidence reports safe DocuSign owner buckets without leaking metadata values', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(174, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          hasDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDocuSignReference: true,
          docuSignReferenceTargetExists: true,
          docuSignReferenceTargetVisible: true,
          hasProxyDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(175, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          hasDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDocuSignReference: true,
          docuSignReferenceTargetExists: true,
          docuSignReferenceTargetVisible: true,
          hasProxyDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(176, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          hasDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDocuSignReference: true,
          docuSignReferenceTargetExists: true,
          docuSignReferenceTargetVisible: true,
          hasProxyDocuSignMetadataAttributes: true,
          valueHintBuckets: ['business-physical-address-token', 'generated-token-pattern'],
          valueHintCount: 2,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-docusign-owner');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(summary.docusignOwnerSignalPresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.radioGroupDocusignOwnerBucketsPresent).toEqual(expect.arrayContaining(['physical-operating-address']));
    expect(summary.radioGroupCommonOwnerCategory).toBe('docusign-owner');
    expect(serialized).not.toContain('generated-token-pattern');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report empty sources and stay fail closed when exact three radios have no anchor evidence', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(153, { groupName: null }),
      calibratedBusinessPrimaryLocationRadioField(154, { groupName: null }),
      calibratedBusinessPrimaryLocationRadioField(155, { groupName: null }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsAnchorMatched).toBe(false);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-missing-safe-evidence-empty');
    expect(summary.addressOptionsAnchorRejectedReasons).toEqual(expect.arrayContaining(['anchor-missing', 'safe-evidence-empty']));
    expect(summary.addressOptionsAnchorSafeTokensObserved).toEqual([]);
    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-missing-safe-evidence-empty');
    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-missing-safe-evidence-empty');
    expect(summary.addressOptionsOwnershipAnchorRejectedReasons).toEqual(
      expect.arrayContaining(['ownership-anchor-missing', 'safe-evidence-empty']),
    );
    expect(summary.ownershipSourceHarvestAttempted).toBe(true);
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-empty');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['sources-empty']);
    expect(summary.ownershipSourceHarvestSummary).toBe('ownership source harvest found no ownership/reference sources');
    expect(summary.ariaLabelledbyAttributePresentCount).toBe(0);
    expect(summary.ariaDescribedbyAttributePresentCount).toBe(0);
    expect(summary.sharedNamePresentCount).toBe(0);
    expect(summary.sharedOwnerPresentCount).toBe(0);
    expect(summary.docusignOwnerSignalPresentCount).toBe(0);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(false);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(0);
    expect(summary.ownershipReferenceTargetVisibleCount).toBe(0);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBe(0);
    expect(summary.ownershipEvidenceFilteredAsGeneratedOnlyCount).toBe(0);
    expect(summary.ownershipEvidenceFilteredAsGenericOnlyCount).toBe(0);
    expect(summary.ownershipEvidenceFilteredByRedactionCount).toBe(0);
    expect(summary.ownershipEvidenceSourcesEmpty).toBe(true);
    expect(summary.ownershipEvidenceSourcesPresentButNoSafeTokens).toBe(false);
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual([]);
    expect(summary.radioGroupReferenceTargetExists).toBe(false);
    expect(summary.radioGroupReferenceTargetVisible).toBe(false);
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
  });

  test('guarded physical address discovery calibrated fallback anchor evidence reports only generic buckets without leaking raw signature tokens', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(156, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(157, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(158, {
        groupName: null,
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsAnchorMatched).toBe(false);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-missing-only-generic-evidence');
    expect(summary.addressOptionsAnchorRejectedReasons).toEqual(expect.arrayContaining(['anchor-missing', 'only-generic-evidence']));
    expect(summary.addressOptionsAnchorAttributeBucketsPresent).toEqual(expect.arrayContaining(['generic-only', 'radio-group']));
    expect(serialized).not.toContain('generated-token-pattern');
    expect(serialized).not.toContain('generated/generic-only-token');
  });

  test('guarded physical address discovery calibrated fallback group anchor evidence reports only generic buckets and still fails closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(159, {
        groupName: 'Radio Group',
        rawCandidateLabels: [{ source: 'positional-prompt', value: 'Required' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(160, {
        groupName: 'Radio Group',
        rawCandidateLabels: [{ source: 'positional-prompt', value: 'Required' }],
      }),
      calibratedBusinessPrimaryLocationRadioField(161, {
        groupName: 'Radio Group',
        rawCandidateLabels: [{ source: 'positional-prompt', value: 'Required' }],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-missing-safe-evidence-empty');
    expect(summary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-missing-only-generic-evidence');
    expect(summary.addressOptionsGroupAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['radio-group', 'generic-only']));
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report generated-only references and still fail closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(177, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(178, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(179, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-missing-only-generated-reference');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-generated-only');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['generated-only']);
    expect(summary.ownershipSourceHarvestSummary).toBe('ownership source harvest found only generated ownership/reference evidence');
    expect(summary.ariaLabelledbyAttributePresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(true);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(0);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBe(0);
    expect(summary.ownershipEvidenceFilteredAsGeneratedOnlyCount).toBeGreaterThan(0);
    expect(summary.ownershipEvidenceSourcesPresentButNoSafeTokens).toBe(true);
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['generated-reference-only']));
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
    expect(serialized).not.toContain('generated-token-pattern');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report generic-only evidence and still fail closed', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(180, {
        groupName: 'Radio Group',
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['address-like-token', 'same-token'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(181, {
        groupName: 'Radio Group',
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['address-like-token', 'same-token'],
          valueHintCount: 2,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(182, {
        groupName: 'Radio Group',
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: false,
          hasAriaDescribedByReference: false,
          hasDataReference: true,
          dataReferenceTargetExists: true,
          dataReferenceTargetVisible: true,
          valueHintBuckets: ['address-like-token', 'same-token'],
          valueHintCount: 2,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-missing-only-generic-evidence');
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-generic-only');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['generic-only']);
    expect(summary.sharedNamePresentCount).toBe(3);
    expect(summary.sharedOwnerPresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(true);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBe(0);
    expect(summary.ownershipEvidenceFilteredAsGenericOnlyCount).toBeGreaterThan(0);
    expect(summary.ownershipEvidenceSourcesPresentButNoSafeTokens).toBe(true);
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual(
      expect.arrayContaining(['address-options', 'radio-group', 'generic-only']),
    );
    expect(summary.radioGroupCommonOwnerCategory).toBe('generic-only');
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report attributes present but missing targets without leaking raw references', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(183, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: false,
          ariaDescribedByTargetVisible: false,
          hasForIdReference: false,
          hasDataReference: false,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(184, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: false,
          ariaDescribedByTargetVisible: false,
          hasForIdReference: false,
          hasDataReference: false,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(185, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: false,
          ariaLabelledByTargetVisible: false,
          hasAriaDescribedByReference: true,
          ariaDescribedByTargetExists: false,
          ariaDescribedByTargetVisible: false,
          hasForIdReference: false,
          hasDataReference: false,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.ownershipSourceHarvestAttempted).toBe(true);
    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-attributes-present-no-targets');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['reference-targets-missing']);
    expect(summary.ariaLabelledbyAttributePresentCount).toBe(3);
    expect(summary.ariaDescribedbyAttributePresentCount).toBe(3);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(true);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(0);
    expect(summary.ownershipReferenceTargetVisibleCount).toBe(0);
    expect(summary.radioGroupReferenceTargetExists).toBe(false);
    expect(summary.radioGroupReferenceTargetVisible).toBe(false);
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
    expect(serialized).not.toContain('aria-labelledby');
    expect(serialized).not.toContain('aria-describedby');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report reference targets with no safe tokens', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(186, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['address-like-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(187, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['address-like-token'],
          valueHintCount: 1,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(188, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          valueHintBuckets: ['address-like-token'],
          valueHintCount: 1,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-targets-present-no-safe-tokens');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['reference-targets-present-no-safe-tokens']);
    expect(summary.ownershipReferenceTargetLookupAttempted).toBe(true);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.ownershipReferenceTargetVisibleCount).toBe(3);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBe(0);
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['address-options']));
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
  });

  test('guarded physical address discovery calibrated fallback ownership source diagnostics report filtered ownership evidence without leaking raw values', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(189, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          tokenShapeBuckets: ['generated-token-pattern'],
          tokenShapeCount: 1,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(190, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          tokenShapeBuckets: ['generated-token-pattern'],
          tokenShapeCount: 1,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(191, {
        groupName: null,
        proxyReferenceSignature: proxyReferenceSignature({
          hasAriaLabelledByReference: true,
          ariaLabelledByTargetExists: true,
          ariaLabelledByTargetVisible: true,
          tokenShapeBuckets: ['generated-token-pattern'],
          tokenShapeCount: 1,
          valueHintBuckets: [],
          valueHintCount: 0,
        }),
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);
    const serialized = JSON.stringify(summary);

    expect(summary.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-filtered-by-redaction');
    expect(summary.ownershipSourceHarvestRejectedReasons).toEqual(['filtered-by-redaction']);
    expect(summary.ownershipEvidenceFilteredByRedactionCount).toBeGreaterThan(0);
    expect(summary.ownershipReferenceTargetExistsCount).toBe(3);
    expect(summary.ownershipReferenceTargetSafeTokenCount).toBe(0);
    expect(summary.addressOptionsOwnershipAnchorSafeTokensObserved).toEqual([]);
    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
    expect(serialized).not.toContain('tab-form-element');
    expect(serialized).not.toContain('SECRET');
  });

  test('guarded physical address discovery calibrated fallback fails closed when fewer than three unlabeled candidates are present', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(144),
      calibratedBusinessPrimaryLocationRadioField(145),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      candidateCount: 2,
      allowed: false,
      selectedCalibratedSlot: null,
      exactThreeRadioGuardPassed: false,
    }));
    expect(selection.fallbackInventory?.calibratedFallback?.rejectedReasons).toContain('candidate-count-not-exactly-three');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorOutcomeCategory).toBe('anchor-not-checked');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorRejectedReasons).toEqual(['not-checked-prior-guard-failed']);
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-not-checked');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsGroupAnchorRejectedReasons).toEqual(['not-checked-prior-guard-failed']);
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-not-checked');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsOwnershipAnchorRejectedReasons).toEqual(['not-checked-prior-guard-failed']);
    expect(selection.fallbackInventory?.calibratedFallback?.radioGroupCommonOwnerCategory).toBe('not-checked');
    expect(selection.fallbackInventory?.calibratedFallback?.ownershipSourceHarvestAttempted).toBe(false);
    expect(selection.fallbackInventory?.calibratedFallback?.ownershipSourceHarvestOutcomeCategory)
      .toBe('ownership-source-prior-guard-failed');
    expect(selection.fallbackInventory?.calibratedFallback?.ownershipSourceHarvestRejectedReasons)
      .toEqual(['prior-guard-failed']);
  });

  test('guarded physical address discovery calibrated fallback fails closed when more than three unlabeled candidates are present', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(146),
      calibratedBusinessPrimaryLocationRadioField(147),
      calibratedBusinessPrimaryLocationRadioField(148),
      calibratedBusinessPrimaryLocationRadioField(149),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      candidateCount: 4,
      allowed: false,
      selectedCalibratedSlot: null,
      exactThreeRadioGuardPassed: false,
    }));
    expect(selection.fallbackInventory?.calibratedFallback?.rejectedReasons).toContain('candidate-count-not-exactly-three');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorOutcomeCategory).toBe('anchor-not-checked');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorRejectedReasons).toEqual(['not-checked-prior-guard-failed']);
  });

  test('guarded physical address discovery calibrated fallback fails closed when candidate order is not stable', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(152),
      calibratedBusinessPrimaryLocationRadioField(151),
      calibratedBusinessPrimaryLocationRadioField(153),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      allowed: false,
      addressOptionsClusterGuardPassed: true,
      candidateOrderStable: false,
      exactThreeRadioGuardPassed: true,
    }));
    expect(selection.fallbackInventory?.calibratedFallback?.rejectedReasons).toContain('candidate-order-unstable');
  });

  test('guarded physical address discovery cue-based fallback wins over the calibrated business primary location fallback when a safe physical cue exists', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(154),
      calibratedBusinessPrimaryLocationRadioField(155, { resolvedLabel: 'Physical Operating Address' }),
      calibratedBusinessPrimaryLocationRadioField(156),
    ] as any);

    expect(selection.selectionMode).toBe('fallback');
    expect(selection.selectionReason).toBe('fallback-explicit-physical-cue');
    expect(selection.selectedField?.index).toBe(155);
    expect(selection.fallbackInventory?.calibratedFallback).toBeNull();
  });

  test('guarded physical address discovery calibrated fallback fails closed on mailing legal or virtual ambiguity', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(157, { groupName: null, resolvedLabel: 'Business Mailing Address' }),
      calibratedBusinessPrimaryLocationRadioField(158, { groupName: null, resolvedLabel: 'Legal Address' }),
      calibratedBusinessPrimaryLocationRadioField(159, { groupName: null, resolvedLabel: 'Virtual Address' }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      allowed: false,
      candidateOrderStable: true,
      exactThreeRadioGuardPassed: true,
      conflictingCueDetected: true,
    }));
    expect(selection.fallbackInventory?.calibratedFallback?.rejectedReasons).toContain('conflicting-safe-cue-surfaced');
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorMatched).toBe(false);
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorRejectedReasons).toEqual(
      expect.arrayContaining(['anchor-missing', 'conflicting-evidence']),
    );
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorSafeTokensObserved).toContain('address');
  });

  test('guarded physical address discovery calibrated fallback fails closed when same different yes or no cues appear without the exact-three-radio guard', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(160, { label: 'Same', resolvedLabel: 'Same' }),
      calibratedBusinessPrimaryLocationRadioField(161, { label: 'Different', resolvedLabel: 'Different' }),
      calibratedBusinessPrimaryLocationRadioField(162, { label: 'Yes', resolvedLabel: 'Yes' }),
      calibratedBusinessPrimaryLocationRadioField(163, { label: 'No', resolvedLabel: 'No' }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.selectionMode).toBeNull();
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      candidateCount: 4,
      allowed: false,
      exactThreeRadioGuardPassed: false,
      conflictingCueDetected: true,
      addressOptionsAnchorOutcomeCategory: 'anchor-not-checked',
    }));
    expect(selection.fallbackInventory?.calibratedFallback?.rejectedReasons).toEqual(expect.arrayContaining([
      'candidate-count-not-exactly-three',
      'conflicting-safe-cue-surfaced',
    ]));
    expect(selection.fallbackInventory?.calibratedFallback?.addressOptionsAnchorRejectedReasons).toEqual(['not-checked-prior-guard-failed']);
  });

  test('guarded physical address discovery selection summary reports primary selection won', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 170,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'addressOptions',
        label: 'Required - addressOptions - isOperatingAddress',
        resolvedLabel: 'Required - addressOptions - isOperatingAddress',
        rawCandidateLabels: [
          { source: 'section+row', value: 'Required - addressOptions - isOperatingAddress' },
        ],
        groupName: 'addressOptions_group',
        idOrNameKey: 'isOperatingAddress',
        inferredType: { type: 'address_option' },
      },
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('primary-selected');
    expect(summary.toggleSelectionStage).toBe('primary');
    expect(summary.toggleSelectionMode).toBe('primary');
    expect(summary.fallbackReason).toBeNull();
  });

  test('guarded physical address discovery selection summary reports cue-based fallback won', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 171,
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Physical Operating Address' },
        ],
      }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('cue-based-selected');
    expect(summary.toggleSelectionStage).toBe('cue-based-fallback');
    expect(summary.toggleSelectionMode).toBe('fallback');
    expect(summary.fallbackReason).toBe('fallback-explicit-physical-cue');
  });

  test('guarded physical address discovery selection summary reports calibrated fallback selected', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(172),
      calibratedBusinessPrimaryLocationRadioField(173),
      calibratedBusinessPrimaryLocationRadioField(174),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-selected');
    expect(summary.toggleSelectionStage).toBe('calibrated-fallback');
    expect(summary.toggleSelectionMode).toBe('calibrated-fallback');
    expect(summary.selectedToggleSlot).toBe(2);
    expect(summary.fallbackReason).toBe(calibratedFallbackReason);
    expect(summary.calibratedFallbackSelected).toBe(true);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-matched-label');
    expect(summary.addressOptionsAnchorEvidenceSummary).toBe('matched via label address-options bucket');
  });

  test('guarded physical address discovery selection summary reports calibrated anchor missing rejection and preserves fallback reason', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(175, { groupName: null }),
      calibratedBusinessPrimaryLocationRadioField(176, { groupName: null }),
      calibratedBusinessPrimaryLocationRadioField(177, { groupName: null }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-anchor-missing');
    expect(summary.calibratedFallbackRejectedReasons).toContain('anchor-missing');
    expect(summary.fallbackReason).toBe(calibratedFallbackReason);
    expect(summary.addressOptionsAnchorOutcomeCategory).toBe('anchor-missing-safe-evidence-empty');
    expect(summary.addressOptionsAnchorRejectedReasons).toEqual(expect.arrayContaining(['anchor-missing', 'safe-evidence-empty']));
  });

  test('guarded physical address discovery selection summary reports candidate-count rejection', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(178),
      calibratedBusinessPrimaryLocationRadioField(179),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-candidate-count');
    expect(summary.calibratedFallbackRejectedReasons).toContain('candidate-count');
    expect(summary.fallbackReason).toBe(calibratedFallbackReason);
  });

  test('guarded physical address discovery selection summary reports order-unstable rejection', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(182),
      calibratedBusinessPrimaryLocationRadioField(181),
      calibratedBusinessPrimaryLocationRadioField(183),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-order-unstable');
    expect(summary.calibratedFallbackRejectedReasons).toContain('order-unstable');
    expect(summary.fallbackReason).toBe(calibratedFallbackReason);
  });

  test('guarded physical address discovery selection summary reports conflicting-cue rejection', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(184, { resolvedLabel: 'Business Mailing Address' }),
      calibratedBusinessPrimaryLocationRadioField(185, { resolvedLabel: 'Legal Address' }),
      calibratedBusinessPrimaryLocationRadioField(186, { resolvedLabel: 'Virtual Address' }),
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('calibrated-rejected-conflicting-cue');
    expect(summary.calibratedFallbackRejectedReasons).toContain('conflicting-cue');
    expect(summary.fallbackReason).toBe(calibratedFallbackReason);
  });

  test('guarded physical address discovery selection summary reports no safe toggle selected when multiple cue matches remain', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      {
        index: 187,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Physical Operating Address',
        resolvedLabel: 'Physical Operating Address',
        rawCandidateLabels: [
          { source: 'section+row', value: 'Physical Operating Address' },
        ],
        groupName: 'addressOptions_group',
        idOrNameKey: 'isOperatingAddress',
        inferredType: { type: 'address_option' },
      },
      {
        index: 188,
        kind: 'radio',
        type: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Business Physical Address',
        resolvedLabel: 'Business Physical Address',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Physical Address' },
        ],
        groupName: 'addressOptions_group',
        idOrNameKey: 'isOperatingAddressAlternate',
        inferredType: { type: 'address_option' },
      },
    ] as any);

    const summary = buildPhysicalOperatingAddressToggleSelectionSummary(selection);

    expect(summary.toggleSelectionOutcomeCategory).toBe('no-safe-toggle-selected');
    expect(summary.toggleSelectionMode).toBeNull();
    expect(summary.selectedToggleSlot).toBeNull();
  });

  test('guarded physical address discovery UI effect summary distinguishes option 1 style state', () => {
    const summary = buildPhysicalOperatingAddressUiEffectSummary({
      before: {
        proofOfAddressUploadVisible: false,
        physicalOperatingAddressFieldsVisible: false,
      },
      after: {
        proofOfAddressUploadVisible: true,
        physicalOperatingAddressFieldsVisible: false,
      },
      selectedToggleSlot: 1,
    });

    expect(summary.uiEffectOutcomeCategory).toBe('proof-address-visible-physical-fields-hidden');
    expect(summary.proofOfAddressUploadExpectedForSelectedOption).toBe(true);
    expect(summary.physicalOperatingAddressFieldsExpectedForSelectedOption).toBe(false);
  });

  test('guarded physical address discovery UI effect summary distinguishes option 2 style state', () => {
    const summary = buildPhysicalOperatingAddressUiEffectSummary({
      before: {
        proofOfAddressUploadVisible: false,
        physicalOperatingAddressFieldsVisible: false,
      },
      after: {
        proofOfAddressUploadVisible: true,
        physicalOperatingAddressFieldsVisible: true,
      },
      selectedToggleSlot: 2,
    });

    expect(summary.uiEffectOutcomeCategory).toBe('proof-address-visible-physical-fields-visible');
    expect(summary.proofOfAddressUploadExpectedForSelectedOption).toBe(true);
    expect(summary.physicalOperatingAddressFieldsExpectedForSelectedOption).toBe(true);
  });

  test('guarded physical address discovery UI effect summary distinguishes option 3 style state', () => {
    const summary = buildPhysicalOperatingAddressUiEffectSummary({
      before: {
        proofOfAddressUploadVisible: true,
        physicalOperatingAddressFieldsVisible: true,
      },
      after: {
        proofOfAddressUploadVisible: false,
        physicalOperatingAddressFieldsVisible: false,
      },
      selectedToggleSlot: 3,
    });

    expect(summary.uiEffectOutcomeCategory).toBe('proof-address-hidden-physical-fields-hidden');
    expect(summary.proofOfAddressUploadExpectedForSelectedOption).toBe(false);
    expect(summary.physicalOperatingAddressFieldsExpectedForSelectedOption).toBe(false);
  });

  test('guarded physical address discovery calibrated fallback ignores generated and generic-only signatures as proof but still allows the exact-three guarded branch', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(164, {
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(165, {
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
      calibratedBusinessPrimaryLocationRadioField(166, {
        domAttributeSignature: attributeSignature({
          valueHintBuckets: ['generated-token-pattern', 'empty-value'],
          valueHintCount: 2,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        proxyReferenceSignature: proxyReferenceSignature({
          valueHintBuckets: ['generated-token-pattern'],
          valueHintCount: 1,
          tokenShapeBuckets: ['generated-token-pattern', 'radio-like-token'],
          tokenShapeCount: 2,
        }),
        radioGraphicSignature: radioGraphicSignature({
          tokenHintBuckets: ['radio-like-token', 'generated/generic-only-token'],
          tokenHintCount: 2,
          hasSharedTokenHintBucket: true,
        }),
      }),
    ] as any);

    expect(selection.selectionMode).toBe('calibrated-fallback');
    expect(selection.selectedField?.index).toBe(165);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.cueMatches.physicalOperatingAddress === false)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.attributeCueMatches.physicalOperatingAddress === false)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.proxyCueMatches.physicalOperatingAddress === false)).toBe(true);
    expect(selection.fallbackInventory?.entries.every((entry) => entry.graphicCueMatches.physicalOperatingAddress === false)).toBe(true);
    expect(selection.fallbackInventory?.calibratedFallback).toEqual(expect.objectContaining({
      allowed: true,
      addressOptionsClusterGuardPassed: true,
      generatedValuesOmitted: true,
      selectedCalibratedSlot: calibratedFallbackSlot,
    }));
  });

  test('guarded physical address discovery calibrated fallback diagnostics stay redacted and bounded', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      calibratedBusinessPrimaryLocationRadioField(167, {
        sectionName: 'https://demo.docusign.net/start?token=secret-token-value',
        idOrNameKey: 'tab-form-element-secret-proxy',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'hidden.person@example.test' },
          { source: 'helper-text', value: 'customer-private-value-42' },
        ],
        containerContextLabels: [
          { source: 'container-parent', value: 'class=wrapper-control-secret' },
        ],
      }),
      calibratedBusinessPrimaryLocationRadioField(168, {
        sectionName: 'https://demo.docusign.net/start?token=second-secret-token-value',
        idOrNameKey: 'tab-form-element-secret-middle',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'hidden.middle@example.test' },
          { source: 'helper-text', value: 'customer-private-value-43' },
        ],
        containerContextLabels: [
          { source: 'container-parent', value: 'class=wrapper-control-secret-middle' },
        ],
      }),
      calibratedBusinessPrimaryLocationRadioField(169, {
        sectionName: 'https://demo.docusign.net/start?token=third-secret-token-value',
        idOrNameKey: 'tab-form-element-secret-last',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'hidden.last@example.test' },
          { source: 'helper-text', value: 'customer-private-value-44' },
        ],
        containerContextLabels: [
          { source: 'container-parent', value: 'class=wrapper-control-secret-last' },
        ],
      }),
    ] as any);

    const serializedInventory = JSON.stringify(selection.fallbackInventory);
    const serializedSummary = JSON.stringify(buildPhysicalOperatingAddressToggleSelectionSummary(selection));

    expect(selection.selectionMode).toBe('calibrated-fallback');
    expect(selection.selectedField?.index).toBe(168);
    expect(serializedInventory).not.toContain('https://demo.docusign.net/start');
    expect(serializedInventory).not.toContain('hidden.person@example.test');
    expect(serializedInventory).not.toContain('hidden.middle@example.test');
    expect(serializedInventory).not.toContain('secret-token-value');
    expect(serializedInventory).not.toContain('tab-form-element-secret-proxy');
    expect(serializedInventory).not.toContain('class=wrapper-control-secret');
    expect(serializedInventory).not.toContain('customer-private-value-42');
    expect(serializedInventory).not.toContain('customer-private-value-43');
    expect(serializedInventory).toContain('[redacted:url]');
    expect(serializedInventory).toContain('[redacted:email]');
    expect(serializedInventory).toContain('[redacted:token]');
    expect(serializedInventory).toContain('[redacted:text]');
    expect(serializedSummary).not.toContain('https://demo.docusign.net/start');
    expect(serializedSummary).not.toContain('hidden.person@example.test');
    expect(serializedSummary).not.toContain('tab-form-element-secret-proxy');
    expect(serializedSummary).not.toContain('class=wrapper-control-secret');
  });

  test('guarded physical address discovery fallback refuses mailing or legal container cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 43,
        idOrNameKey: 'mailingContainerToggle',
        containerContextLabels: [
          { source: 'container-section', value: 'Mailing Address' },
        ],
      }),
      fallbackRadioField({
        index: 44,
        idOrNameKey: 'legalContainerToggle',
        containerContextLabels: [
          { source: 'container-grandparent', value: 'Legal Address' },
        ],
      }),
      fallbackRadioField({
        index: 45,
        idOrNameKey: 'toggleNo',
        label: 'No',
        resolvedLabel: 'No',
      }),
    ] as any);

    const mailingEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 43);
    const legalEntry = selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 44);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(mailingEntry?.containerSectionCueMatches.mailingAddress).toBe(true);
    expect(mailingEntry?.excludedReasons).toContain('matched-mailing-address');
    expect(legalEntry?.containerGrandparentCueMatches.legalAddress).toBe(true);
    expect(legalEntry?.excludedReasons).toContain('matched-legal-address');
  });

  test('guarded physical address discovery fallback fails closed when multiple radio-like controls carry container physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 46,
        idOrNameKey: 'physicalContainerToggleA',
        containerContextLabels: [
          { source: 'container-section', value: 'Physical Operating Address' },
        ],
      }),
      fallbackRadioField({
        index: 47,
        idOrNameKey: 'physicalContainerToggleB',
        containerContextLabels: [
          { source: 'container-grandparent', value: 'Business Physical Address' },
        ],
      }),
      fallbackRadioField({
        index: 48,
        idOrNameKey: 'toggleSame',
        label: 'Same',
        resolvedLabel: 'Same',
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(2);
    expect(selection.fallbackInventory?.entries.filter((entry) => entry.selectedByFallback)).toHaveLength(2);
  });

  test('guarded physical address discovery fallback reports Same Different Yes and No container cues but fails closed without physical cues', () => {
    const selection = explainPhysicalOperatingAddressToggleSelection([
      fallbackRadioField({
        index: 49,
        idOrNameKey: 'toggleSame',
        containerContextLabels: [
          { source: 'container-preceding', value: 'Same' },
        ],
      }),
      fallbackRadioField({
        index: 50,
        idOrNameKey: 'toggleDifferent',
        containerContextLabels: [
          { source: 'container-preceding', value: 'Different' },
        ],
      }),
      fallbackRadioField({
        index: 51,
        idOrNameKey: 'toggleYes',
        containerContextLabels: [
          { source: 'container-following', value: 'Yes' },
        ],
      }),
      fallbackRadioField({
        index: 52,
        idOrNameKey: 'toggleNo',
        containerContextLabels: [
          { source: 'container-following', value: 'No' },
        ],
      }),
    ] as any);

    expect(selection.selectedField).toBeNull();
    expect(selection.fallbackInventory?.matchingFallbackCandidateCount).toBe(0);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 49)?.containerPrecedingCueMatches.same).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 50)?.containerPrecedingCueMatches.different).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 51)?.containerFollowingCueMatches.yes).toBe(true);
    expect(selection.fallbackInventory?.entries.find((entry) => entry.fieldIndex === 52)?.containerFollowingCueMatches.no).toBe(true);
  });

  test('guarded physical address discovery fails closed when multiple operating candidates remain', async () => {
    const fields = [
      {
        index: 1,
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Physical Operating Address',
        resolvedLabel: 'Physical Operating Address',
        rawCandidateLabels: [
          { source: 'section+row', value: 'Physical Operating Address' },
        ],
        groupName: 'businessPhysicalAddress_group',
        idOrNameKey: 'isOperatingAddress',
        inferredType: { type: 'address_option' },
      },
      {
        index: 2,
        kind: 'radio',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
        sectionName: 'Business Physical Address',
        label: 'Business Physical Address',
        resolvedLabel: 'Business Physical Address',
        rawCandidateLabels: [
          { source: 'preceding-text', value: 'Business Physical Address' },
        ],
        groupName: 'businessPhysicalAddress_group',
        idOrNameKey: 'isOperatingAddressAlternate',
        inferredType: { type: 'address_option' },
      },
    ] as any;

    expect(findPhysicalOperatingAddressToggle(fields)).toBeNull();

    const expansion = await maybeExpandPhysicalOperatingAddressSection(
      null as any,
      fields,
      { SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '1' } as NodeJS.ProcessEnv,
    );

    const inventoryPrefix = 'physical-operating-address discovery toggle inventory: ';
    const inventory = JSON.parse(
      expansion.diagnostics.find((entry) => entry.startsWith(inventoryPrefix))!.slice(inventoryPrefix.length),
    );

    expect(inventory.matchingCandidateCount).toBe(2);
    expect(inventory.entries).toHaveLength(2);
    expect(inventory.entries.every((entry: any) => entry.selectedByMatcher === true)).toBe(true);
  });

  test('guarded physical address discovery fails closed with sanitized inventory when no operating candidate matches', async () => {
    const expansion = await maybeExpandPhysicalOperatingAddressSection(
      null as any,
      [
        {
          index: 11,
          kind: 'radio',
          type: 'radio',
          controlCategory: 'merchant_input',
          visible: true,
          editable: true,
          sectionName: 'Business Mailing Address',
          label: '123 Hidden Value Road Suite 500',
          resolvedLabel: '123 Hidden Value Road Suite 500',
          rawCandidateLabels: [
            { source: 'preceding-text', value: 'Business Mailing Address' },
            { source: 'section+row', value: 'hidden.person@example.test' },
            { source: 'label-for', value: 'https://demo.docusign.net/start?token=secret-token-value' },
            { source: 'preceding-text', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' },
            { source: 'preceding-text', value: 'x '.repeat(200) },
          ],
          containerContextLabels: [
            { source: 'container-parent', value: 'hidden.person@example.test' },
            { source: 'container-grandparent', value: 'https://demo.docusign.net/start?token=secret-token-value' },
            { source: 'container-section', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' },
            { source: 'container-preceding', value: 'Business Mailing Address' },
            { source: 'container-following', value: 'x '.repeat(200) },
          ],
          layoutProximityLabels: [
            { direction: 'below', distanceBucket: 'near', association: 'group', value: 'hidden.person@example.test' },
            { direction: 'right', distanceBucket: 'near', association: 'closest-radio', value: 'https://demo.docusign.net/start?token=secret-token-value' },
            { direction: 'above', distanceBucket: 'immediate', association: 'multiple-radios', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' },
            { direction: 'same-row', distanceBucket: 'immediate', association: 'closest-radio', value: 'Business Mailing Address' },
            { direction: 'left', distanceBucket: 'farther', association: 'group', value: 'x '.repeat(200) },
          ],
          nonTextLayoutSignature: {
            groupMemberCount: 3,
            repeatedGroupPattern: true,
            groupPatternBucket: 'repeated-row-group',
            sharedContainerBucket: 'same-grandparent',
            alignmentBucket: 'horizontal',
            relativeOrderBucket: 'middle',
            spacingBucket: 'normal',
            shapeBucket: 'compact-group',
            layerBucket: 'document-layer',
            sharedDocumentLayer: true,
            metadataSignals: ['role', 'name', 'data-tab-type', 'tab-guid', 'page-index'],
            metadataSignalCount: 5,
            metadataSignalsTruncated: false,
          },
          domAttributeSignature: {
            radioAttributeNames: ['id', 'name', 'type', 'aria-describedby', 'data-qa'],
            radioAttributeNameCount: 5,
            radioAttributeNamesTruncated: false,
            wrapperSurfaces: [
              {
                depthBucket: 'parent',
                tagName: 'div',
                role: null,
                attributeNames: ['class', 'data-choice-kind'],
                attributeNameCount: 2,
                attributeNamesTruncated: false,
                tokenShapeBuckets: ['address-like-token', 'radio-like-token'],
                tokenShapeCount: 2,
                tokenShapesTruncated: false,
              },
            ],
            wrapperSurfacesTruncated: false,
            hasIdAttribute: true,
            hasNameAttribute: true,
            hasAriaLabel: false,
            hasAriaLabelledBy: false,
            hasAriaDescribedBy: true,
            hasDataAttributes: true,
            hasDocuSignMetadataAttributes: true,
            tokenShapeBuckets: ['address-like-token', 'generated-token-pattern'],
            tokenShapeCount: 2,
            tokenShapesTruncated: false,
            valueHintBuckets: ['mailing-address-token', 'generated-token-pattern', 'empty-value'],
            valueHintCount: 3,
            valueHintsTruncated: false,
            wrapperPatternBucket: 'same-wrapper-pattern',
            attributePatternBucket: 'distinct-attribute-pattern',
          },
          groupName: 'businessMailingAddress_group',
          idOrNameKey: 'isMailingAddress',
          inferredType: { type: 'unknown' },
        },
      ] as any,
      { SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS: '1' } as NodeJS.ProcessEnv,
    );

    expect(expansion.expanded).toBe(false);
    expect(expansion.diagnostics).toContain(
      'physical-operating-address discovery toggle: no unique visible isOperatingAddress radio candidate found',
    );

    const inventoryPrefix = 'physical-operating-address discovery toggle inventory: ';
    const inventory = JSON.parse(
      expansion.diagnostics.find((entry) => entry.startsWith(inventoryPrefix))!.slice(inventoryPrefix.length),
    );
    const fallbackPrefix = 'physical-operating-address discovery toggle fallback inventory: ';
    const fallbackInventory = JSON.parse(
      expansion.diagnostics.find((entry) => entry.startsWith(fallbackPrefix))!.slice(fallbackPrefix.length),
    );
    const serializedInventory = JSON.stringify(inventory);
    const serializedFallbackInventory = JSON.stringify(fallbackInventory);

    expect(inventory.candidateCount).toBe(1);
    expect(inventory.matchingCandidateCount).toBe(0);
    expect(inventory.entries[0].matches.mailingAddressPattern).toBe(true);
    expect(inventory.entries[0].excludedReasons).toContain('matched-mailing-address');
    expect(fallbackInventory.visibleRadioInputCount).toBe(1);
    expect(fallbackInventory.matchingFallbackCandidateCount).toBe(0);
    expect(fallbackInventory.entries[0].excludedReasons).toContain('matched-mailing-address');
    expect(inventory.entries[0].resolvedLabelFragments).toEqual(['[redacted:text]']);
    expect(inventory.entries[0].nearbyLabelFragments.length).toBeLessThanOrEqual(4);
    expect(fallbackInventory.entries[0].ancestorTextFragments.length).toBeLessThanOrEqual(4);
    expect(fallbackInventory.entries[0].siblingTextFragments.length).toBeLessThanOrEqual(4);
    expect(fallbackInventory.entries[0].nearbyTextFragments.length).toBeLessThanOrEqual(4);
    expect(fallbackInventory.entries[0].ancestorTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:email]' }),
    ]));
    expect(fallbackInventory.entries[0].containerParentTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:email]' }),
    ]));
    expect(fallbackInventory.entries[0].containerGrandparentTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:url]' }),
    ]));
    expect(fallbackInventory.entries[0].containerSectionTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:token]' }),
    ]));
    expect(fallbackInventory.entries[0].siblingTextFragments.some((entry: any) => entry.text.includes('Business Mailing Address'))).toBe(true);
    expect(fallbackInventory.entries[0].siblingTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:url]' }),
      expect.objectContaining({ text: '[redacted:token]' }),
    ]));
    expect(fallbackInventory.entries[0].containerPrecedingTextFragments.some((entry: any) => entry.text.includes('Business Mailing Address'))).toBe(true);
    expect(fallbackInventory.entries[0].containerFollowingTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:text]' }),
    ]));
    expect(fallbackInventory.entries[0].layoutProximityTextFragments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '[redacted:email]' }),
      expect.objectContaining({ text: '[redacted:url]' }),
      expect.objectContaining({ text: '[redacted:token]' }),
    ]));
    expect(fallbackInventory.entries[0].nonTextLayoutSignature).toEqual(expect.objectContaining({
      layerBucket: 'document-layer',
      metadataSignals: expect.arrayContaining(['data-tab-type', 'tab-guid', 'page-index']),
    }));
    expect(fallbackInventory.entries[0].domAttributeSignature).toEqual(expect.objectContaining({
      valueHintBuckets: expect.arrayContaining(['mailing-address-token', 'generated-token-pattern', 'empty-value']),
      hasDocuSignMetadataAttributes: true,
    }));
    expect(fallbackInventory.entries[0].attributeCueMatches.mailingAddress).toBe(true);
    expect(fallbackInventory.entries[0].layoutProximityTextFragments.some((entry: any) => entry.text.includes('Business Mailing Address'))).toBe(true);
    expect(fallbackInventory.entries[0].layoutProximityTextTruncated).toBe(true);
    expect(fallbackInventory.entries[0].nearbyTextTruncated).toBe(true);
    expect(serializedInventory).not.toContain('123 Hidden Value Road');
    expect(serializedFallbackInventory).not.toContain('123 Hidden Value Road');
    expect(serializedInventory).not.toContain('hidden.person@example.test');
    expect(serializedFallbackInventory).not.toContain('hidden.person@example.test');
    expect(serializedInventory).not.toContain('https://demo.docusign.net/start');
    expect(serializedFallbackInventory).not.toContain('https://demo.docusign.net/start');
    expect(serializedInventory).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(serializedFallbackInventory).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(serializedFallbackInventory).not.toContain('tab-form-element-c1d2e3');
    expect(serializedFallbackInventory).not.toContain('x x x x x');
    expect(serializedInventory).toContain('[redacted:email]');
    expect(serializedFallbackInventory).toContain('[redacted:email]');
    expect(serializedInventory).toContain('[redacted:url]');
    expect(serializedFallbackInventory).toContain('[redacted:url]');
    expect(serializedInventory).toContain('[redacted:token]');
    expect(serializedFallbackInventory).toContain('[redacted:token]');
    expect(serializedFallbackInventory).toContain('generated-token-pattern');
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

  test('physical address capture-only runner command exists and stays distinct from the discovery sweep', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts[PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND]).toBe(
      `tsx ${PHYSICAL_ADDRESS_CAPTURE_ONLY_SCRIPT_PATH}`,
    );
    expect(packageJson.scripts[PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND]).not.toContain('test:discovery');
    expect(packageJson.scripts[PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND]).not.toContain('signer-discovery.spec.ts');
  });

  test('physical address capture-only runner enables guarded capture and refuses destructive mode', () => {
    expect(() => assertPhysicalOperatingAddressCaptureOnlyGuards({
      DESTRUCTIVE_VALIDATION: '1',
    } as NodeJS.ProcessEnv)).toThrow(/DESTRUCTIVE_VALIDATION/);

    const env = buildPhysicalOperatingAddressCaptureOnlyEnv({
      DOCUSIGN_SIGNING_URL: 'https://example.test/signing',
      DESTRUCTIVE_VALIDATION: '0',
      SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS: '1',
    } as NodeJS.ProcessEnv);

    expect(env.DESTRUCTIVE_VALIDATION).toBe('');
    expect(env.SAFE_DISCOVERY_EXPAND_PHYSICAL_ADDRESS).toBe('1');
    expect(env.SAFE_DISCOVERY_CAPTURE_PHYSICAL_ADDRESS).toBe('1');
    expect(env.SAFE_DISCOVERY_PROBE_PHYSICAL_ADDRESS).toBe('');
    expect(guardedPhysicalOperatingAddressDiscoveryEnabled(env)).toBe(true);
    expect(guardedPhysicalOperatingAddressPostToggleCaptureEnabled(env)).toBe(true);
    expect(guardedPhysicalOperatingAddressDomProbeEnabled(env)).toBe(false);
    expect(shouldStopAfterPhysicalAddressCaptureAttempt(PHYSICAL_ADDRESS_CAPTURE_ONLY_DISCOVERY_OPTIONS)).toBe(true);
    expect(shouldStopAfterPhysicalAddressCaptureAttempt()).toBe(false);
  });

  const createPhysicalAddressCaptureOnlyTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'physical-address-capture-only-'));

  const writePostToggleFreshnessBundle = (
    outDir: string,
    options: {
      generatedAt?: string;
      html?: string;
      jsonExtras?: Record<string, unknown>;
      mtimeIso?: string;
    } = {},
  ) => {
    const generatedAt = options.generatedAt ?? '2026-05-01T16:41:27.153Z';
    const structurePath = path.join(outDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson);
    const htmlPath = path.join(outDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(structurePath, JSON.stringify({ generatedAt, ...options.jsonExtras }, null, 2), 'utf8');
    fs.writeFileSync(htmlPath, options.html ?? '<html><body>safe preview</body></html>', 'utf8');

    if (options.mtimeIso) {
      const timestamp = new Date(options.mtimeIso);
      fs.utimesSync(structurePath, timestamp, timestamp);
      fs.utimesSync(htmlPath, timestamp, timestamp);
    }

    return { structurePath, htmlPath };
  };

  const mockCaptureReport = (overrides: Record<string, unknown> = {}) => ({
    generatedAt: '2026-05-15T08:40:00.000Z',
    anchorLabel: 'Physical Operating Address',
    anchorLeft: 12,
    anchorTop: 34,
    captureBounds: { left: 0, top: 0, width: 640, height: 320 },
    textNodes: [],
    controls: [],
    observations: ['safe bounded observation'],
    ...overrides,
  });

  const mockToggleSelectionSummary = (overrides: Record<string, unknown> = {}) => ({
    toggleSelectionOutcomeCategory: 'calibrated-selected',
    toggleSelectionStage: 'calibrated-fallback',
    toggleSelectionMode: 'calibrated-fallback',
    selectedToggleSlot: 2,
    selectedToggleReason: calibratedFallbackReason,
    fallbackReason: calibratedFallbackReason,
    calibratedFallbackConsidered: true,
    calibratedFallbackAllowed: true,
    calibratedFallbackSelected: true,
    calibratedFallbackSelectedSlot: 2,
    calibratedFallbackRejectedReasons: [],
    calibratedFallbackGuardSummary: {
      addressOptionsAnchorMatched: true,
      addressOptionsAnchorOutcomeCategory: 'anchor-matched-label',
      addressOptionsAnchorRejectedReasons: [],
      addressOptionsAnchorEvidenceSummary: 'matched via label address-options bucket',
      addressOptionsAnchorSourcesChecked: ['field-key', 'label', 'container', 'attribute-token', 'proxy-token', 'graphic-token'],
      addressOptionsAnchorSafeTokensObserved: ['address-options', 'address'],
      addressOptionsAnchorTextBucketsPresent: ['address-options', 'address'],
      addressOptionsAnchorFieldKeyBucketsPresent: [],
      addressOptionsAnchorContainerBucketsPresent: [],
      addressOptionsAnchorAttributeBucketsPresent: [],
      addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-matched-section-header',
      addressOptionsGroupAnchorRejectedReasons: [],
      addressOptionsGroupAnchorEvidenceSummary: 'matched via radio-group section-header bucket',
      addressOptionsGroupAnchorSourcesChecked: ['accessible-name', 'legend', 'question-prompt', 'section-header', 'association'],
      addressOptionsGroupAnchorSafeTokensObserved: ['business-primary-location'],
      radioGroupAccessibleNameBucketsPresent: [],
      radioGroupLegendBucketsPresent: [],
      radioGroupQuestionPromptBucketsPresent: [],
      radioGroupSectionHeaderBucketsPresent: ['business-primary-location'],
      radioGroupAssociationBucketsPresent: [],
      addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-matched-shared-owner',
      addressOptionsOwnershipAnchorRejectedReasons: [],
      addressOptionsOwnershipAnchorEvidenceSummary: 'matched via shared owner-reference bucket',
      addressOptionsOwnershipAnchorSourcesChecked: ['aria-labelledby', 'aria-describedby', 'shared-name', 'shared-owner', 'docusign-owner'],
      addressOptionsOwnershipAnchorSafeTokensObserved: ['physical-operating-address'],
      radioGroupAriaLabelledbyBucketsPresent: [],
      radioGroupAriaDescribedbyBucketsPresent: [],
      radioGroupSharedNameBucketsPresent: [],
      radioGroupSharedOwnerBucketsPresent: ['physical-operating-address'],
      radioGroupDocusignOwnerBucketsPresent: [],
      radioGroupReferenceTargetExists: true,
      radioGroupReferenceTargetVisible: true,
      radioGroupCommonOwnerCategory: 'shared-owner',
      ...ownershipSourceDebugDefaults(),
      exactThreeRadioGuardPassed: true,
      candidateOrderStable: true,
      conflictingCueDetected: false,
    },
    primarySelectionCandidateCount: 0,
    cueBasedFallbackCandidateCount: 0,
    calibratedFallbackCandidateCount: 3,
    eligibleRadioCandidateCount: 3,
    exactThreeRadioGuardPassed: true,
    addressOptionsAnchorMatched: true,
    addressOptionsAnchorOutcomeCategory: 'anchor-matched-label',
    addressOptionsAnchorRejectedReasons: [],
    addressOptionsAnchorEvidenceSummary: 'matched via label address-options bucket',
    addressOptionsAnchorSourcesChecked: ['field-key', 'label', 'container', 'attribute-token', 'proxy-token', 'graphic-token'],
    addressOptionsAnchorSafeTokensObserved: ['address-options', 'address'],
    addressOptionsAnchorTextBucketsPresent: ['address-options', 'address'],
    addressOptionsAnchorFieldKeyBucketsPresent: [],
    addressOptionsAnchorContainerBucketsPresent: [],
    addressOptionsAnchorAttributeBucketsPresent: [],
    addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-matched-section-header',
    addressOptionsGroupAnchorRejectedReasons: [],
    addressOptionsGroupAnchorEvidenceSummary: 'matched via radio-group section-header bucket',
    addressOptionsGroupAnchorSourcesChecked: ['accessible-name', 'legend', 'question-prompt', 'section-header', 'association'],
    addressOptionsGroupAnchorSafeTokensObserved: ['business-primary-location'],
    radioGroupAccessibleNameBucketsPresent: [],
    radioGroupLegendBucketsPresent: [],
    radioGroupQuestionPromptBucketsPresent: [],
    radioGroupSectionHeaderBucketsPresent: ['business-primary-location'],
    radioGroupAssociationBucketsPresent: [],
    addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-matched-shared-owner',
    addressOptionsOwnershipAnchorRejectedReasons: [],
    addressOptionsOwnershipAnchorEvidenceSummary: 'matched via shared owner-reference bucket',
    addressOptionsOwnershipAnchorSourcesChecked: ['aria-labelledby', 'aria-describedby', 'shared-name', 'shared-owner', 'docusign-owner'],
    addressOptionsOwnershipAnchorSafeTokensObserved: ['physical-operating-address'],
    radioGroupAriaLabelledbyBucketsPresent: [],
    radioGroupAriaDescribedbyBucketsPresent: [],
    radioGroupSharedNameBucketsPresent: [],
    radioGroupSharedOwnerBucketsPresent: ['physical-operating-address'],
    radioGroupDocusignOwnerBucketsPresent: [],
    radioGroupReferenceTargetExists: true,
    radioGroupReferenceTargetVisible: true,
    radioGroupCommonOwnerCategory: 'shared-owner',
    ...ownershipSourceDebugDefaults(),
    candidateOrderStable: true,
    conflictingCueDetected: false,
    ...overrides,
  });

  const mockUiEffectSummary = (overrides: Record<string, unknown> = {}) => ({
    proofOfAddressUploadVisibleBefore: false,
    proofOfAddressUploadVisibleAfter: true,
    proofOfAddressUploadVisibilityChanged: true,
    proofOfAddressUploadExpectedForSelectedOption: true,
    physicalOperatingAddressFieldsVisibleBefore: false,
    physicalOperatingAddressFieldsVisibleAfter: true,
    physicalOperatingAddressFieldsVisibilityChanged: true,
    physicalOperatingAddressFieldsExpectedForSelectedOption: true,
    uiEffectOutcomeCategory: 'proof-address-visible-physical-fields-visible',
    ...overrides,
  });

  const mockExpansionResult = (overrides: Record<string, unknown> = {}) => ({
    fields: [],
    diagnostics: ['safe expansion diagnostic'],
    expanded: true,
    probeReport: null,
    captureReport: mockCaptureReport(),
    toggleSelectionSummary: mockToggleSelectionSummary(),
    uiEffectSummary: mockUiEffectSummary(),
    expansionAttempted: true,
    expansionSkippedReason: null,
    ...overrides,
  });

  const createPhysicalAddressBootstrapCaptureReceipt = (
    overrides: Partial<PhysicalOperatingAddressCaptureOnlyReceipt> = {},
  ): PhysicalOperatingAddressCaptureOnlyReceipt => ({
    runKind: PHYSICAL_ADDRESS_CAPTURE_ONLY_RUN_KIND,
    childCommand: `npm run ${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    childExitCode: 0,
    bootstrapExitCode: null,
    signerSurfaceReached: true,
    initialFieldCount: 14,
    toggleSelectionOutcomeCategory: 'calibrated-selected',
    toggleSelectionStage: 'calibrated-fallback',
    toggleSelectionMode: 'calibrated-fallback',
    selectedToggleSlot: 2,
    selectedToggleReason: calibratedFallbackReason,
    fallbackReason: calibratedFallbackReason,
    calibratedFallbackConsidered: true,
    calibratedFallbackAllowed: true,
    calibratedFallbackSelected: true,
    calibratedFallbackSelectedSlot: 2,
    calibratedFallbackRejectedReasons: [],
    calibratedFallbackGuardSummary: {
      addressOptionsAnchorMatched: true,
      addressOptionsAnchorOutcomeCategory: 'anchor-matched-label',
      addressOptionsAnchorRejectedReasons: [],
      addressOptionsAnchorEvidenceSummary: 'matched via label address-options bucket',
      addressOptionsAnchorSourcesChecked: ['field-key', 'label', 'container', 'attribute-token', 'proxy-token', 'graphic-token'],
      addressOptionsAnchorSafeTokensObserved: ['address-options', 'address'],
      addressOptionsAnchorTextBucketsPresent: ['address-options', 'address'],
      addressOptionsAnchorFieldKeyBucketsPresent: [],
      addressOptionsAnchorContainerBucketsPresent: [],
      addressOptionsAnchorAttributeBucketsPresent: [],
      addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-matched-section-header',
      addressOptionsGroupAnchorRejectedReasons: [],
      addressOptionsGroupAnchorEvidenceSummary: 'matched via radio-group section-header bucket',
      addressOptionsGroupAnchorSourcesChecked: ['accessible-name', 'legend', 'question-prompt', 'section-header', 'association'],
      addressOptionsGroupAnchorSafeTokensObserved: ['business-primary-location'],
      radioGroupAccessibleNameBucketsPresent: [],
      radioGroupLegendBucketsPresent: [],
      radioGroupQuestionPromptBucketsPresent: [],
      radioGroupSectionHeaderBucketsPresent: ['business-primary-location'],
      radioGroupAssociationBucketsPresent: [],
      addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-matched-shared-owner',
      addressOptionsOwnershipAnchorRejectedReasons: [],
      addressOptionsOwnershipAnchorEvidenceSummary: 'matched via shared owner-reference bucket',
      addressOptionsOwnershipAnchorSourcesChecked: ['aria-labelledby', 'aria-describedby', 'shared-name', 'shared-owner', 'docusign-owner'],
      addressOptionsOwnershipAnchorSafeTokensObserved: ['physical-operating-address'],
      radioGroupAriaLabelledbyBucketsPresent: [],
      radioGroupAriaDescribedbyBucketsPresent: [],
      radioGroupSharedNameBucketsPresent: [],
      radioGroupSharedOwnerBucketsPresent: ['physical-operating-address'],
      radioGroupDocusignOwnerBucketsPresent: [],
      radioGroupReferenceTargetExists: true,
      radioGroupReferenceTargetVisible: true,
      radioGroupCommonOwnerCategory: 'shared-owner',
      ...ownershipSourceDebugDefaults(),
      exactThreeRadioGuardPassed: true,
      candidateOrderStable: true,
      conflictingCueDetected: false,
    },
    primarySelectionCandidateCount: 0,
    cueBasedFallbackCandidateCount: 0,
    calibratedFallbackCandidateCount: 3,
    eligibleRadioCandidateCount: 3,
    exactThreeRadioGuardPassed: true,
    addressOptionsAnchorMatched: true,
    addressOptionsAnchorOutcomeCategory: 'anchor-matched-label',
    addressOptionsAnchorRejectedReasons: [],
    addressOptionsAnchorEvidenceSummary: 'matched via label address-options bucket',
    addressOptionsAnchorSourcesChecked: ['field-key', 'label', 'container', 'attribute-token', 'proxy-token', 'graphic-token'],
    addressOptionsAnchorSafeTokensObserved: ['address-options', 'address'],
    addressOptionsAnchorTextBucketsPresent: ['address-options', 'address'],
    addressOptionsAnchorFieldKeyBucketsPresent: [],
    addressOptionsAnchorContainerBucketsPresent: [],
    addressOptionsAnchorAttributeBucketsPresent: [],
    addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-matched-section-header',
    addressOptionsGroupAnchorRejectedReasons: [],
    addressOptionsGroupAnchorEvidenceSummary: 'matched via radio-group section-header bucket',
    addressOptionsGroupAnchorSourcesChecked: ['accessible-name', 'legend', 'question-prompt', 'section-header', 'association'],
    addressOptionsGroupAnchorSafeTokensObserved: ['business-primary-location'],
    radioGroupAccessibleNameBucketsPresent: [],
    radioGroupLegendBucketsPresent: [],
    radioGroupQuestionPromptBucketsPresent: [],
    radioGroupSectionHeaderBucketsPresent: ['business-primary-location'],
    radioGroupAssociationBucketsPresent: [],
    addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-matched-shared-owner',
    addressOptionsOwnershipAnchorRejectedReasons: [],
    addressOptionsOwnershipAnchorEvidenceSummary: 'matched via shared owner-reference bucket',
    addressOptionsOwnershipAnchorSourcesChecked: ['aria-labelledby', 'aria-describedby', 'shared-name', 'shared-owner', 'docusign-owner'],
    addressOptionsOwnershipAnchorSafeTokensObserved: ['physical-operating-address'],
    radioGroupAriaLabelledbyBucketsPresent: [],
    radioGroupAriaDescribedbyBucketsPresent: [],
    radioGroupSharedNameBucketsPresent: [],
    radioGroupSharedOwnerBucketsPresent: ['physical-operating-address'],
    radioGroupDocusignOwnerBucketsPresent: [],
    radioGroupReferenceTargetExists: true,
    radioGroupReferenceTargetVisible: true,
    radioGroupCommonOwnerCategory: 'shared-owner',
    ...ownershipSourceDebugDefaults(),
    candidateOrderStable: true,
    conflictingCueDetected: false,
    selectionMode: 'calibrated-fallback',
    proofOfAddressUploadVisibleBefore: false,
    proofOfAddressUploadVisibleAfter: true,
    proofOfAddressUploadVisibilityChanged: true,
    proofOfAddressUploadExpectedForSelectedOption: true,
    physicalOperatingAddressFieldsVisibleBefore: false,
    physicalOperatingAddressFieldsVisibleAfter: true,
    physicalOperatingAddressFieldsVisibilityChanged: true,
    physicalOperatingAddressFieldsExpectedForSelectedOption: true,
    uiEffectOutcomeCategory: 'proof-address-visible-physical-fields-visible',
    expansionAttempted: true,
    expansionSkippedReason: null,
    expansionReturned: true,
    expansionExpanded: true,
    captureReportPresent: true,
    captureReportWritable: true,
    writerCalled: true,
    writerCompleted: true,
    artifactsFresh: true,
    artifactsRemainStale: false,
    staleArtifactsIgnored: false,
    blockedReasonCategory: null,
    reportsRefreshSkipped: false,
    findingsOpenSkipped: false,
    targetFileFreshnessSummary: [
      {
        fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson,
        existsBefore: true,
        existsAfter: true,
        mtimeChanged: true,
        generatedAtChanged: true,
        fresh: true,
        stale: false,
      },
      {
        fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml,
        existsBefore: true,
        existsAfter: true,
        mtimeChanged: true,
        generatedAtChanged: null,
        fresh: true,
        stale: false,
      },
    ],
    redactionApplied: true,
    ...overrides,
  });

  const createPhysicalAddressBootstrapCaptureSpawn = (options: {
    exitCode: number;
    stdoutLines?: string[];
    stderrLines?: string[];
  }) => () => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
    };
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();

    process.nextTick(() => {
      for (const line of options.stdoutLines ?? []) {
        child.stdout.write(`${line}\n`);
      }
      for (const line of options.stderrLines ?? []) {
        child.stderr.write(`${line}\n`);
      }
      child.stdout.end();
      child.stderr.end();
      child.emit('exit', options.exitCode);
    });

    return child as any;
  };

  const createPhysicalAddressBootstrapCaptureDependencies = (
    outDir: string,
    spawnImpl: ReturnType<typeof createPhysicalAddressBootstrapCaptureSpawn>,
    logs: string[],
  ) => ({
    artifactsDir: outDir,
    spawnImpl,
    emitChildLine: () => undefined,
    loadBeadConfig: () => ({
      baseUrl: 'https://api.example.test',
      resendMethod: 'POST',
      resendPath: '/applications/{applicationId}/resend',
      authHeaderName: 'Authorization',
      authHeaderValue: 'Bearer secret',
      applicationId: 'app-123',
    }),
    loadGmailConfig: () => ({
      address: 'merchant@example.test',
      credentialsPath: 'credentials.json',
      tokenPath: 'token.json',
      queryFrom: 'dse@docusign.net',
      querySubjectContains: 'Please DocuSign',
      pollTimeoutMs: 1000,
      pollIntervalMs: 100,
    }),
    triggerResend: async () => ({
      triggeredAt: new Date('2026-05-13T21:30:00.000Z'),
      triggeredAtEpochSec: 1_778_707_800,
      method: 'POST',
      status: 202,
      url: 'https://api.example.test/applications/app-123/resend',
    }),
    pollForSigningEmail: async () => ({
      id: 'message-123',
      internalDateMs: Date.parse('2026-05-13T21:30:05.000Z'),
      body: 'email body',
    }),
    extractSigningUrl: async () => ({
      url: 'https://na4.docusign.net/Signing/EmailStart.aspx?t=SECRET',
      via: 'direct',
      sanitized: 'https://na4.docusign.net/[redacted-path]?[redacted]',
    }),
    log: (line: string) => logs.push(line),
    env: { DESTRUCTIVE_VALIDATION: '1' } as NodeJS.ProcessEnv,
  });

  test('physical address capture-only runner reports missing captureReport and does not treat stale artifacts as fresh', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    let writerCalled = false;
    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => [],
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          captureReport: null,
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async () => {
          writerCalled = true;
          throw new Error('writer should not be called');
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    expect(writerCalled).toBe(false);
    expect(result.captureWritten).toBe(false);
    expect(result.captureReportPresent).toBe(false);
    expect(result.writerCalled).toBe(false);
    expect(result.writerCompleted).toBe(false);
    expect(result.reason).toContain('toggle expansion exercised');
    expect(result.artifactFreshness.artifactsFresh).toBe(false);
    expect(result.artifactFreshness.artifactsRemainStale).toBe(true);
    expect(result.diagnostics.some((entry) => entry.includes('capture report writable: no'))).toBe(true);
    expect(result.diagnostics.some((entry) => entry.includes('writer skipped reason: toggle expansion exercised but capture report missing'))).toBe(true);
  });

  test('physical address capture-only runner treats artifacts as fresh only when writer changes generatedAt or mtime', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => [],
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult(),
        writePhysicalOperatingAddressPostToggleArtifacts: async (_page, report, targetDir) => {
          const screenshotPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-screenshot.png');
          const htmlPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml);
          const jsonPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson);
          const mdPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-structure.md');

          fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
          fs.writeFileSync(htmlPath, '<html><body>safe fresh preview</body></html>', 'utf8');
          fs.writeFileSync(mdPath, '# safe markdown', 'utf8');
          fs.writeFileSync(screenshotPath, 'png', 'utf8');

          return { screenshotPath, htmlPath, jsonPath, mdPath };
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    expect(result.captureWritten).toBe(true);
    expect(result.writerCalled).toBe(true);
    expect(result.writerCompleted).toBe(true);
    expect(result.artifactFreshness.artifactsFresh).toBe(true);
    expect(result.artifactFreshness.structureJsonGeneratedAtChanged || result.artifactFreshness.structureJsonMtimeChanged || result.artifactFreshness.domHtmlMtimeChanged).toBe(true);
    expect(result.diagnostics.some((entry) => entry.includes('artifact freshness status: fresh'))).toBe(true);
  });

  test('physical address capture-only runner marks artifacts stale when writer completes but generatedAt and mtime do not change', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => [],
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          captureReport: mockCaptureReport({ generatedAt: '2026-05-01T16:41:27.153Z' }),
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async (_page, _report, targetDir) => {
          const screenshotPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-screenshot.png');
          const htmlPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml);
          const jsonPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson);
          const mdPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-structure.md');

          return { screenshotPath, htmlPath, jsonPath, mdPath };
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    expect(result.captureWritten).toBe(false);
    expect(result.writerCalled).toBe(true);
    expect(result.writerCompleted).toBe(true);
    expect(result.artifactFreshness.artifactsFresh).toBe(false);
    expect(result.artifactFreshness.reportsRefreshSkipped).toBe(true);
    expect(result.artifactFreshness.findingsOpenSkipped).toBe(true);
    expect(result.reason).toContain('freshness did not change');
    expect(result.diagnostics.some((entry) => entry.includes('stale artifacts intentionally ignored'))).toBe(true);
    expect(result.diagnostics.some((entry) => entry.includes('downstream reports skipped: stale post-toggle artifacts'))).toBe(true);
  });

  test('physical address capture-only runner detects an existing stale May 1 artifact bundle', () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const snapshot = readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot(outDir);
    const freshness = comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(snapshot, snapshot);

    expect(snapshot.structureJson.generatedAt).toBe('2026-05-01T16:41:27.153Z');
    expect(snapshot.structureJson.mtimeIso?.startsWith('2026-05-01T16:41:44')).toBe(true);
    expect(freshness.artifactsFresh).toBe(false);
    expect(freshness.artifactsRemainStale).toBe(true);
  });

  test('physical address capture-only artifact freshness diagnostics stay bounded and redacted', () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      jsonExtras: {
        url: 'https://demo.docusign.net/start?token=secret-token-value',
        email: 'hidden.person@example.test',
        fieldValue: '747 Conroy Camp',
        elementId: 'tab-form-element-secret-proxy',
        className: 'secret-class-name',
        dom: '<div>unsafe html</div>',
      },
      html: '<html><body>hidden.person@example.test token secret-token-value</body></html>',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const snapshot = readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot(outDir);
    const diagnostics = buildPhysicalOperatingAddressCaptureOnlyArtifactFreshnessDiagnostics(
      comparePhysicalOperatingAddressCaptureOnlyArtifactFreshness(snapshot, snapshot),
    ).join('\n');

    expect(diagnostics).not.toContain('https://demo.docusign.net/start');
    expect(diagnostics).not.toContain('hidden.person@example.test');
    expect(diagnostics).not.toContain('747 Conroy Camp');
    expect(diagnostics).not.toContain('tab-form-element-secret-proxy');
    expect(diagnostics).not.toContain('secret-class-name');
    expect(diagnostics).not.toContain('<html>');
    expect(diagnostics).not.toContain('screenshot.png');
  });

  test('physical address capture-only runner allows downstream classification only after freshness is proven', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => [],
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          captureReport: mockCaptureReport({ generatedAt: '2026-05-15T08:55:00.000Z' }),
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async (_page, report, targetDir) => {
          const screenshotPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-screenshot.png');
          const htmlPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml);
          const jsonPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson);
          const mdPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-structure.md');

          fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
          fs.writeFileSync(htmlPath, '<html><body>safe fresh preview</body></html>', 'utf8');
          fs.writeFileSync(mdPath, '# safe markdown', 'utf8');
          fs.writeFileSync(screenshotPath, 'png', 'utf8');

          return { screenshotPath, htmlPath, jsonPath, mdPath };
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    expect(result.artifactFreshness.artifactsFresh).toBe(true);
    expect(result.captureWritten).toBe(true);
    expect(result.artifactFreshness.reportsRefreshSkipped).toBe(false);
    expect(result.artifactFreshness.findingsOpenSkipped).toBe(false);
  });

  test('physical address capture-only receipt records fresh writer success', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => Array.from({ length: 14 }, () => ({} as DiscoveredField)),
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          captureReport: mockCaptureReport({ generatedAt: '2026-05-15T08:55:00.000Z' }),
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async (_page, report, targetDir) => {
          const screenshotPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-screenshot.png');
          const htmlPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml);
          const jsonPath = path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson);
          const mdPath = path.join(targetDir, 'latest-physical-operating-address-post-toggle-structure.md');

          fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
          fs.writeFileSync(htmlPath, '<html><body>safe fresh preview</body></html>', 'utf8');
          fs.writeFileSync(mdPath, '# safe markdown', 'utf8');
          fs.writeFileSync(screenshotPath, 'png', 'utf8');

          return { screenshotPath, htmlPath, jsonPath, mdPath };
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    const receipt = buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result,
      childExitCode: 0,
      artifactsDir: outDir,
    });

    expect(receipt.artifactsFresh).toBe(true);
    expect(receipt.childExitCode).toBe(0);
    expect(receipt.toggleSelectionOutcomeCategory).toBe('calibrated-selected');
    expect(receipt.selectedToggleSlot).toBe(2);
    expect(receipt.fallbackReason).toBe(calibratedFallbackReason);
    expect(receipt.addressOptionsAnchorOutcomeCategory).toBe('anchor-matched-label');
    expect(receipt.addressOptionsAnchorEvidenceSummary).toBe('matched via label address-options bucket');
    expect(receipt.uiEffectOutcomeCategory).toBe('proof-address-visible-physical-fields-visible');
    expect(receipt.selectionMode).toBe('calibrated-fallback');
    expect(receipt.calibratedFallbackSelectedSlot).toBe(2);
    expect(receipt.blockedReasonCategory).toBeNull();
  });

  test('physical address capture-only receipt records stale writer-completed blocked category and skipped downstream reports', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => Array.from({ length: 14 }, () => ({} as DiscoveredField)),
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          captureReport: mockCaptureReport({ generatedAt: '2026-05-01T16:41:27.153Z' }),
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async (_page, _report, targetDir) => ({
          screenshotPath: path.join(targetDir, 'latest-physical-operating-address-post-toggle-screenshot.png'),
          htmlPath: path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml),
          jsonPath: path.join(targetDir, PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson),
          mdPath: path.join(targetDir, 'latest-physical-operating-address-post-toggle-structure.md'),
        }),
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    const receipt = buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result,
      childExitCode: 3,
      artifactsDir: outDir,
    });

    expect(receipt.artifactsFresh).toBe(false);
    expect(receipt.artifactsRemainStale).toBe(true);
    expect(receipt.blockedReasonCategory).toBe('stale-artifact-blocked');
    expect(receipt.reportsRefreshSkipped).toBe(true);
    expect(receipt.findingsOpenSkipped).toBe(true);
  });

  test('physical address capture-only receipt records expansion skipped because no selected toggle existed', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => Array.from({ length: 14 }, () => ({} as DiscoveredField)),
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          expanded: false,
          captureReport: null,
          toggleSelectionSummary: mockToggleSelectionSummary({
            toggleSelectionOutcomeCategory: 'no-safe-toggle-selected',
            toggleSelectionStage: 'primary',
            toggleSelectionMode: null,
            selectedToggleSlot: null,
            selectedToggleReason: null,
            fallbackReason: null,
            calibratedFallbackConsidered: false,
            calibratedFallbackAllowed: null,
            calibratedFallbackSelected: false,
            calibratedFallbackSelectedSlot: null,
            calibratedFallbackRejectedReasons: [],
            calibratedFallbackGuardSummary: {
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
              addressOptionsGroupAnchorRejectedReasons: ['not-checked-prior-guard-failed'],
              addressOptionsGroupAnchorEvidenceSummary: 'group anchor check skipped because the exact-three-radio guard failed',
              addressOptionsGroupAnchorSourcesChecked: [],
              addressOptionsGroupAnchorSafeTokensObserved: [],
              radioGroupAccessibleNameBucketsPresent: [],
              radioGroupLegendBucketsPresent: [],
              radioGroupQuestionPromptBucketsPresent: [],
              radioGroupSectionHeaderBucketsPresent: [],
              radioGroupAssociationBucketsPresent: [],
              addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-not-checked',
              addressOptionsOwnershipAnchorRejectedReasons: ['not-checked-prior-guard-failed'],
              addressOptionsOwnershipAnchorEvidenceSummary:
                'ownership anchor check skipped because the exact-three-radio guard failed',
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
              exactThreeRadioGuardPassed: false,
              candidateOrderStable: false,
              conflictingCueDetected: false,
            },
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
            addressOptionsGroupAnchorOutcomeCategory: 'group-anchor-not-checked',
            addressOptionsGroupAnchorRejectedReasons: ['not-checked-prior-guard-failed'],
            addressOptionsGroupAnchorEvidenceSummary: 'group anchor check skipped because the exact-three-radio guard failed',
            addressOptionsGroupAnchorSourcesChecked: [],
            addressOptionsGroupAnchorSafeTokensObserved: [],
            radioGroupAccessibleNameBucketsPresent: [],
            radioGroupLegendBucketsPresent: [],
            radioGroupQuestionPromptBucketsPresent: [],
            radioGroupSectionHeaderBucketsPresent: [],
            radioGroupAssociationBucketsPresent: [],
            addressOptionsOwnershipAnchorOutcomeCategory: 'ownership-anchor-not-checked',
            addressOptionsOwnershipAnchorRejectedReasons: ['not-checked-prior-guard-failed'],
            addressOptionsOwnershipAnchorEvidenceSummary:
              'ownership anchor check skipped because the exact-three-radio guard failed',
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
            candidateOrderStable: false,
            conflictingCueDetected: false,
          }),
          uiEffectSummary: mockUiEffectSummary({
            proofOfAddressUploadVisibleAfter: false,
            proofOfAddressUploadVisibilityChanged: false,
            proofOfAddressUploadExpectedForSelectedOption: null,
            physicalOperatingAddressFieldsVisibleAfter: false,
            physicalOperatingAddressFieldsVisibilityChanged: false,
            physicalOperatingAddressFieldsExpectedForSelectedOption: null,
            uiEffectOutcomeCategory: 'proof-address-hidden-physical-fields-hidden',
          }),
          expansionAttempted: false,
          expansionSkippedReason: 'no-selected-toggle',
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async () => {
          throw new Error('writer should not be called');
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    const receipt = buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result,
      childExitCode: 3,
      artifactsDir: outDir,
    });

    expect(receipt.toggleSelectionOutcomeCategory).toBe('no-safe-toggle-selected');
    expect(receipt.expansionAttempted).toBe(false);
    expect(receipt.expansionSkippedReason).toBe('no-selected-toggle');
    expect(receipt.blockedReasonCategory).toBe('expansion-skipped-no-selected-toggle');
  });

  test('physical address capture-only receipt records expansion attempted but not expanded', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();

    const result = await runPhysicalOperatingAddressCaptureOnly(
      {} as any,
      {} as NodeJS.ProcessEnv,
      outDir,
      {
        openSigner: async () => ({ frame: {} as any, diagnostics: [] }),
        discoverFields: async () => Array.from({ length: 14 }, () => ({} as DiscoveredField)),
        maybeExpandPhysicalOperatingAddressSection: async () => mockExpansionResult({
          expanded: false,
          captureReport: null,
        }),
        writePhysicalOperatingAddressPostToggleArtifacts: async () => {
          throw new Error('writer should not be called');
        },
        readArtifactFreshnessSnapshot: readPhysicalOperatingAddressCaptureOnlyArtifactFreshnessSnapshot,
      },
    );

    const receipt = buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result,
      childExitCode: 3,
      artifactsDir: outDir,
    });

    expect(receipt.selectedToggleSlot).toBe(2);
    expect(receipt.expansionAttempted).toBe(true);
    expect(receipt.expansionExpanded).toBe(false);
    expect(receipt.blockedReasonCategory).toBe('expansion-attempted-not-expanded');
  });

  test('physical address capture-only receipt stays bounded and redacted', () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    writePostToggleFreshnessBundle(outDir, {
      generatedAt: '2026-05-01T16:41:27.153Z',
      jsonExtras: {
        url: 'https://demo.docusign.net/start?token=secret-token-value',
        email: 'hidden.person@example.test',
        fieldValue: '747 Conroy Camp',
        elementId: 'tab-form-element-secret-proxy',
        className: 'secret-class-name',
        dom: '<div>unsafe html</div>',
      },
      html: '<html><body>hidden.person@example.test token secret-token-value</body></html>',
      mtimeIso: '2026-05-01T16:41:44.000Z',
    });

    const receipt = buildPhysicalOperatingAddressCaptureOnlyReceipt({
      result: null,
      childExitCode: 1,
      artifactsDir: outDir,
      blockedReasonCategory: 'another bounded reason',
    });
    const serialized = JSON.stringify(receipt);

    expect(serialized).not.toContain('https://demo.docusign.net/start');
    expect(serialized).not.toContain('hidden.person@example.test');
    expect(serialized).not.toContain('747 Conroy Camp');
    expect(serialized).not.toContain('tab-form-element-secret-proxy');
    expect(serialized).not.toContain('secret-class-name');
    expect(serialized).not.toContain('<html>');
    expect(serialized).not.toContain('screenshot.png');
  });

  test('physical address bootstrap capture receipt keeps group and ownership anchor evidence bucketed and redacted', () => {
    const serialized = JSON.stringify(createPhysicalAddressBootstrapCaptureReceipt());

    expect(serialized).not.toContain('Business Primary Location');
    expect(serialized).not.toContain('Registered Legal Address');
    expect(serialized).not.toContain('Proof of Address');
    expect(serialized).not.toContain('P.O. Box');
    expect(serialized).not.toContain('physical-operating-address-token');
    expect(serialized).not.toContain('generated-token-pattern');
    expect(serialized).not.toContain('hidden.person@example.test');
    expect(serialized).not.toContain('tab-form-element');
  });

  test('physical address capture-only runner source reuses guarded capture path and avoids validation sweep logic', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', PHYSICAL_ADDRESS_CAPTURE_ONLY_SCRIPT_PATH),
      'utf8',
    );

    expect(source).toContain('openSigner(');
    expect(source).toContain('discoverFields(');
    expect(source).toContain('maybeExpandPhysicalOperatingAddressSection(');
    expect(source).toContain('writePhysicalOperatingAddressPostToggleArtifacts(');
    expect(source).not.toContain('ReportBuilder');
    expect(source).not.toContain('runCaseMatrix');
    expect(source).not.toContain('writePhysicalOperatingAddressDomProbeArtifacts');
    expect(source).not.toContain('test:discovery');
    expect(source).not.toMatch(/\bFinish\b/);
    expect(source).not.toMatch(/\bComplete\b/);
    expect(source).not.toMatch(/\bSubmit\b/);
    expect(source).not.toMatch(/\bAdopt\b/);
  });

  test('physical address capture-only runner only targets sanitized capture artifacts', () => {
    expect(PHYSICAL_ADDRESS_CAPTURE_ONLY_ARTIFACT_FILENAMES).toEqual([
      'latest-physical-operating-address-post-toggle-screenshot.png',
      'latest-physical-operating-address-post-toggle-dom.html',
      'latest-physical-operating-address-post-toggle-structure.json',
      'latest-physical-operating-address-post-toggle-structure.md',
    ]);

    const source = fs.readFileSync(
      path.resolve(__dirname, '..', PHYSICAL_ADDRESS_CAPTURE_ONLY_SCRIPT_PATH),
      'utf8',
    );
    expect(source).not.toContain('latest-validation-summary');
    expect(source).not.toContain('latest-validation-findings');
    expect(source).not.toContain('latest-validation-scorecard');
  });

  test('physical address email-bootstrap capture command exists and launches only the capture runner', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts[PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND]).toBe(
      `tsx ${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_SCRIPT_PATH}`,
    );
    expect(PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS).toEqual([
      PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND,
    ]);
    expect(PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS).not.toContain('test:smoke');
    expect(PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS).not.toContain('test:discovery');
    expect(PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS).not.toContain('test:interactive');
    expect(PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS).not.toContain('interactive:watchdog');
  });

  test('physical address bootstrap capture receipt parses a valid sentinel line', () => {
    const receipt = createPhysicalAddressBootstrapCaptureReceipt();
    const parsed = parsePhysicalOperatingAddressBootstrapCaptureReceiptLines([
      formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(receipt),
    ]);

    expect(parsed.failureReason).toBeNull();
    expect(parsed.receipt).toEqual(receipt);
  });

  test('physical address bootstrap capture receipt ignores a malformed sentinel line safely', () => {
    const parsed = parsePhysicalOperatingAddressBootstrapCaptureReceiptLines([
      'PHYSICAL_ADDRESS_CAPTURE_RECEIPT_JSON: {not-valid-json}',
    ]);

    expect(parsed.receipt).toBeNull();
    expect(parsed.failureReason).toBe('malformed-receipt-line');
  });

  test('physical address bootstrap capture receipt fails closed on multiple sentinel lines', () => {
    const parsed = parsePhysicalOperatingAddressBootstrapCaptureReceiptLines([
      formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(createPhysicalAddressBootstrapCaptureReceipt()),
      formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(createPhysicalAddressBootstrapCaptureReceipt({ childExitCode: 3 })),
    ]);

    expect(parsed.receipt).toBeNull();
    expect(parsed.failureReason).toBe('multiple-receipt-lines');
  });

  test('physical address bootstrap capture receipt preserves fresh child success and exit code', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    const logs: string[] = [];
    const childReceipt = createPhysicalAddressBootstrapCaptureReceipt();
    const result = await runPhysicalOperatingAddressBootstrapCapture(
      createPhysicalAddressBootstrapCaptureDependencies(
        outDir,
        createPhysicalAddressBootstrapCaptureSpawn({
          exitCode: 0,
          stdoutLines: [formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(childReceipt)],
        }),
        logs,
      ),
    );

    const receiptPath = buildPhysicalOperatingAddressCaptureOnlyReceiptPath(outDir);
    const receipt = readPhysicalOperatingAddressCaptureOnlyReceipt(receiptPath);

    expect(result).toEqual({ code: 0, reason: 'OK' });
    expect(receipt?.childExitCode).toBe(0);
    expect(receipt?.bootstrapExitCode).toBe(0);
    expect(receipt?.artifactsFresh).toBe(true);
    expect(receipt?.blockedReasonCategory).toBeNull();
    expect(receipt?.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-section-header');
    expect(receipt?.radioGroupSectionHeaderBucketsPresent).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(receipt?.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-shared-owner');
    expect(receipt?.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorOutcomeCategory)
      .toBe('ownership-anchor-matched-shared-owner');
    expect(receipt?.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(receipt?.calibratedFallbackGuardSummary.ownershipSourceHarvestOutcomeCategory)
      .toBe('ownership-source-safe-tokens-present');
    expect(receipt?.ownershipReferenceTargetExistsCount).toBe(3);
    expect(receipt?.ownershipReferenceTargetVisibleCount).toBe(3);
    expect(receipt?.radioGroupSharedOwnerBucketsPresent).toEqual(expect.arrayContaining(['physical-operating-address']));
    expect(receipt?.radioGroupReferenceTargetExists).toBe(true);
    expect(receipt?.radioGroupReferenceTargetVisible).toBe(true);
    expect(logs.join('\n')).not.toContain('SECRET');
  });

  test('physical address bootstrap capture receipt preserves stale blocked child outcome and nonzero exit', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    const logs: string[] = [];
    const childReceipt = createPhysicalAddressBootstrapCaptureReceipt({
      childExitCode: 3,
      artifactsFresh: false,
      artifactsRemainStale: true,
      staleArtifactsIgnored: true,
      blockedReasonCategory: 'stale-artifact-blocked',
      reportsRefreshSkipped: true,
      findingsOpenSkipped: true,
      targetFileFreshnessSummary: [
        {
          fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.structureJson,
          existsBefore: true,
          existsAfter: true,
          mtimeChanged: false,
          generatedAtChanged: false,
          fresh: false,
          stale: true,
        },
        {
          fileName: PHYSICAL_ADDRESS_CAPTURE_ONLY_FRESHNESS_FILENAMES.domHtml,
          existsBefore: true,
          existsAfter: true,
          mtimeChanged: false,
          generatedAtChanged: null,
          fresh: false,
          stale: true,
        },
      ],
    });

    const result = await runPhysicalOperatingAddressBootstrapCapture(
      createPhysicalAddressBootstrapCaptureDependencies(
        outDir,
        createPhysicalAddressBootstrapCaptureSpawn({
          exitCode: 3,
          stdoutLines: [formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(childReceipt)],
        }),
        logs,
      ),
    );

    const receipt = readPhysicalOperatingAddressCaptureOnlyReceipt(
      buildPhysicalOperatingAddressCaptureOnlyReceiptPath(outDir),
    );

    expect(result.code).toBe(3);
    expect(result.reason).toContain('stale-artifact-blocked');
    expect(receipt?.childExitCode).toBe(3);
    expect(receipt?.bootstrapExitCode).toBe(3);
    expect(receipt?.artifactsFresh).toBe(false);
    expect(receipt?.artifactsRemainStale).toBe(true);
    expect(receipt?.reportsRefreshSkipped).toBe(true);
    expect(receipt?.findingsOpenSkipped).toBe(true);
    expect(receipt?.toggleSelectionOutcomeCategory).toBe('calibrated-selected');
    expect(receipt?.addressOptionsAnchorOutcomeCategory).toBe('anchor-matched-label');
    expect(receipt?.addressOptionsAnchorSafeTokensObserved).toEqual(expect.arrayContaining(['address-options', 'address']));
    expect(receipt?.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-section-header');
    expect(receipt?.calibratedFallbackGuardSummary.addressOptionsGroupAnchorOutcomeCategory).toBe('group-anchor-matched-section-header');
    expect(receipt?.radioGroupSectionHeaderBucketsPresent).toEqual(expect.arrayContaining(['business-primary-location']));
    expect(receipt?.addressOptionsOwnershipAnchorOutcomeCategory).toBe('ownership-anchor-matched-shared-owner');
    expect(receipt?.calibratedFallbackGuardSummary.addressOptionsOwnershipAnchorOutcomeCategory)
      .toBe('ownership-anchor-matched-shared-owner');
    expect(receipt?.ownershipSourceHarvestOutcomeCategory).toBe('ownership-source-safe-tokens-present');
    expect(receipt?.calibratedFallbackGuardSummary.ownershipSourceHarvestOutcomeCategory)
      .toBe('ownership-source-safe-tokens-present');
    expect(receipt?.radioGroupSharedOwnerBucketsPresent).toEqual(expect.arrayContaining(['physical-operating-address']));
    expect(receipt?.uiEffectOutcomeCategory).toBe('proof-address-visible-physical-fields-visible');
  });

  test('physical address bootstrap capture receipt writes a bounded fallback receipt when the child exits before receipt', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    const logs: string[] = [];
    const result = await runPhysicalOperatingAddressBootstrapCapture(
      createPhysicalAddressBootstrapCaptureDependencies(
        outDir,
        createPhysicalAddressBootstrapCaptureSpawn({
          exitCode: 1,
          stderrLines: ['fatal near https://demo.docusign.net/Signing/EmailStart.aspx?t=SECRET'],
        }),
        logs,
      ),
    );

    const receiptPath = buildPhysicalOperatingAddressCaptureOnlyReceiptPath(outDir);
    const receipt = readPhysicalOperatingAddressCaptureOnlyReceipt(receiptPath);
    const serialized = fs.readFileSync(receiptPath, 'utf8');

    expect(result.code).toBe(1);
    expect(result.reason).toContain('receipt unavailable');
    expect(receipt?.bootstrapExitCode).toBe(1);
    expect(receipt?.artifactsFresh).toBe(false);
    expect(receipt?.blockedReasonCategory).toBe('another bounded reason');
    expect(serialized).not.toContain('https://demo.docusign.net/Signing/EmailStart.aspx?t=SECRET');
    expect(serialized).not.toContain('SECRET');
    expect(logs.join('\n')).not.toContain('https://demo.docusign.net/Signing/EmailStart.aspx?t=SECRET');
  });

  test('physical address bootstrap capture receipt blocks inconsistent child success when artifacts remain stale', async () => {
    const outDir = createPhysicalAddressCaptureOnlyTempDir();
    const logs: string[] = [];
    const childReceipt = createPhysicalAddressBootstrapCaptureReceipt({
      childExitCode: 0,
      artifactsFresh: false,
      artifactsRemainStale: true,
      staleArtifactsIgnored: true,
      blockedReasonCategory: 'stale-artifact-blocked',
      reportsRefreshSkipped: true,
      findingsOpenSkipped: true,
    });

    const result = await runPhysicalOperatingAddressBootstrapCapture(
      createPhysicalAddressBootstrapCaptureDependencies(
        outDir,
        createPhysicalAddressBootstrapCaptureSpawn({
          exitCode: 0,
          stdoutLines: [formatPhysicalOperatingAddressCaptureOnlyReceiptSentinel(childReceipt)],
        }),
        logs,
      ),
    );

    const receipt = readPhysicalOperatingAddressCaptureOnlyReceipt(
      buildPhysicalOperatingAddressCaptureOnlyReceiptPath(outDir),
    );

    expect(result.code).toBe(3);
    expect(result.reason).toContain('stale-artifact-blocked');
    expect(receipt?.childExitCode).toBe(0);
    expect(receipt?.bootstrapExitCode).toBe(3);
    expect(receipt?.artifactsFresh).toBe(false);
  });

  test('physical address email-bootstrap capture reuses resend, Gmail polling, and link extraction', async () => {
    const rawSignerUrl = 'https://na4.docusign.net/Signing/EmailStart.aspx?t=SECRET';
    const calls: string[] = [];
    const logs: string[] = [];
    const parentEnv = {
      DESTRUCTIVE_VALIDATION: '1',
      DOCUSIGN_SIGNING_URL: undefined,
    } as NodeJS.ProcessEnv;
    let childEnv: NodeJS.ProcessEnv | null = null;

    const result = await runBootstrapEmailScripts({
      label: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
      scripts: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
      dependencies: {
        loadBeadConfig: () => ({
          baseUrl: 'https://api.example.test',
          resendMethod: 'POST',
          resendPath: '/applications/{applicationId}/resend',
          authHeaderName: 'Authorization',
          authHeaderValue: 'Bearer secret',
          applicationId: 'app-123',
        }),
        loadGmailConfig: () => ({
          address: 'merchant@example.test',
          credentialsPath: 'credentials.json',
          tokenPath: 'token.json',
          queryFrom: 'dse@docusign.net',
          querySubjectContains: 'Please DocuSign',
          pollTimeoutMs: 1000,
          pollIntervalMs: 100,
        }),
        triggerResend: async () => {
          calls.push('resend');
          return {
            triggeredAt: new Date('2026-05-13T21:30:00.000Z'),
            triggeredAtEpochSec: 1_778_707_800,
            method: 'POST',
            status: 202,
            url: 'https://api.example.test/applications/app-123/resend',
          };
        },
        pollForSigningEmail: async (_config, afterEpochSec) => {
          calls.push(`gmail:${afterEpochSec}`);
          return {
            id: 'message-123',
            internalDateMs: Date.parse('2026-05-13T21:30:05.000Z'),
            body: 'email body',
          };
        },
        extractSigningUrl: async (body) => {
          calls.push(`extract:${body}`);
          return {
            url: rawSignerUrl,
            via: 'direct',
            sanitized: 'https://na4.docusign.net/[redacted-path]?[redacted]',
          };
        },
        runNpmScript: async (script, env) => {
          calls.push(`child:${script}`);
          childEnv = env;
          return 0;
        },
        log: (line) => logs.push(line),
        env: parentEnv,
      },
    });

    expect(result).toEqual({ code: 0, reason: 'OK' });
    expect(calls).toEqual([
      'resend',
      'gmail:1778707800',
      'extract:email body',
      `child:${PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND}`,
    ]);
    expect(childEnv?.DOCUSIGN_SIGNING_URL).toBe(rawSignerUrl);
    expect(childEnv?.DESTRUCTIVE_VALIDATION).toBe('');
    expect(parentEnv.DOCUSIGN_SIGNING_URL).toBeUndefined();
    expect(parentEnv.DESTRUCTIVE_VALIDATION).toBe('1');
    expect(logs.join('\n')).not.toContain(rawSignerUrl);
    expect(logs.join('\n')).not.toContain('SECRET');
    expect(logs.join('\n')).toContain('https://na4.docusign.net/[redacted-path]?[redacted]');
  });

  test('physical address email-bootstrap capture does not mutate .env or enable destructive validation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-bootstrap-capture-'));
    const envPath = path.join(tempDir, '.env');
    const originalEnvFile = 'DOCUSIGN_SIGNING_URL=\nDESTRUCTIVE_VALIDATION=1\n';
    fs.writeFileSync(envPath, originalEnvFile, 'utf8');

    try {
      let childEnv: NodeJS.ProcessEnv | null = null;
      const parentEnv = { DESTRUCTIVE_VALIDATION: '1' } as NodeJS.ProcessEnv;

      const result = await runBootstrapEmailScripts({
        label: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
        scripts: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
        dependencies: {
          loadBeadConfig: () => ({
            baseUrl: 'https://api.example.test',
            resendMethod: 'POST',
            resendPath: '/applications/{applicationId}/resend',
            authHeaderName: 'Authorization',
            authHeaderValue: 'Bearer secret',
            applicationId: 'app-123',
          }),
          loadGmailConfig: () => ({
            address: 'merchant@example.test',
            credentialsPath: 'credentials.json',
            tokenPath: 'token.json',
            queryFrom: 'dse@docusign.net',
            querySubjectContains: 'Please DocuSign',
            pollTimeoutMs: 1000,
            pollIntervalMs: 100,
          }),
          triggerResend: async () => ({
            triggeredAt: new Date('2026-05-13T21:30:00.000Z'),
            triggeredAtEpochSec: 1_778_707_800,
            method: 'POST',
            status: 202,
            url: 'https://api.example.test/applications/app-123/resend',
          }),
          pollForSigningEmail: async () => ({
            id: 'message-123',
            internalDateMs: Date.parse('2026-05-13T21:30:05.000Z'),
            body: 'email body',
          }),
          extractSigningUrl: async () => ({
            url: 'https://na4.docusign.net/Signing/EmailStart.aspx?t=SECRET',
            via: 'direct',
            sanitized: 'https://na4.docusign.net/[redacted-path]?[redacted]',
          }),
          runNpmScript: async (_script, env) => {
            childEnv = env;
            return 0;
          },
          log: () => undefined,
          env: parentEnv,
        },
      });

      expect(result.code).toBe(0);
      expect(fs.readFileSync(envPath, 'utf8')).toBe(originalEnvFile);
      expect(childEnv?.DESTRUCTIVE_VALIDATION).toBe('');
      expect(parentEnv.DESTRUCTIVE_VALIDATION).toBe('1');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('physical address email-bootstrap capture sanitizes URL-bearing errors', async () => {
    const rawUrl = 'https://demo.docusign.net/Signing/EmailStart.aspx?t=SECRET';
    const result = await runBootstrapEmailScripts({
      label: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
      scripts: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
      dependencies: {
        loadBeadConfig: () => ({
          baseUrl: 'https://api.example.test',
          resendMethod: 'POST',
          resendPath: '/applications/{applicationId}/resend',
          authHeaderName: 'Authorization',
          authHeaderValue: 'Bearer secret',
          applicationId: 'app-123',
        }),
        loadGmailConfig: () => ({
          address: 'merchant@example.test',
          credentialsPath: 'credentials.json',
          tokenPath: 'token.json',
          queryFrom: 'dse@docusign.net',
          querySubjectContains: 'Please DocuSign',
          pollTimeoutMs: 1000,
          pollIntervalMs: 100,
        }),
        triggerResend: async () => ({
          triggeredAt: new Date('2026-05-13T21:30:00.000Z'),
          triggeredAtEpochSec: 1_778_707_800,
          method: 'POST',
          status: 202,
          url: 'https://api.example.test/applications/app-123/resend',
        }),
        pollForSigningEmail: async () => {
          throw new Error(`timed out near ${rawUrl}`);
        },
        log: () => undefined,
      },
    });

    expect(result.code).toBe(2);
    expect(result.reason).not.toContain(rawUrl);
    expect(result.reason).not.toContain('SECRET');
    expect(result.reason).toContain('https://demo.docusign.net/[redacted-path]?[redacted]');
    expect(formatSafeError(new Error(`failed at ${rawUrl}`))).not.toContain('SECRET');
  });

  test('physical address email-bootstrap capture source avoids broader live validation paths', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_SCRIPT_PATH),
      'utf8',
    );

    expect(source).toContain('runBootstrapEmailScripts');
    expect(source).toContain('PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND');
    expect(source).not.toContain('test:smoke');
    expect(source).not.toContain('test:discovery');
    expect(source).not.toContain('test:interactive');
    expect(source).not.toContain('interactive:watchdog');
    expect(source).not.toContain('bootstrap:interactive');
    expect(source).not.toContain('signer-discovery.spec.ts');
    expect(source).not.toContain('Finish');
    expect(source).not.toContain('Complete');
    expect(source).not.toContain('Submit');
    expect(source).not.toContain('Adopt');
  });

  test('shared signer child env copy keeps signer URL child-only', () => {
    const parentEnv = { DESTRUCTIVE_VALIDATION: '1' } as NodeJS.ProcessEnv;
    const childEnv = buildSignerChildEnv('https://example.test/signing?t=SECRET', parentEnv);

    expect(childEnv.DOCUSIGN_SIGNING_URL).toBe('https://example.test/signing?t=SECRET');
    expect(childEnv.DESTRUCTIVE_VALIDATION).toBe('');
    expect(parentEnv.DOCUSIGN_SIGNING_URL).toBeUndefined();
    expect(parentEnv.DESTRUCTIVE_VALIDATION).toBe('1');
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

  test('physical address post-toggle capture refinement trims before the first non-doc-tab row', () => {
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
          ariaLabelledByText: null,
          name: null,
          dataType: 'Text',
          dataTabType: 'Text',
          elementId: 'tab-form-element-address-line-1',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(2) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(2)',
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
          elementId: 'tab-form-element-state',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(2) > select:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(2)',
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
          elementId: 'tab-form-element-city',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(3) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(3)',
          left: 233.44,
          top: 801.08,
          width: 374,
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
          tagName: 'INPUT',
          inputType: 'text',
          role: 'textbox',
          ariaLabel: null,
          ariaLabelledBy: null,
          ariaLabelledByText: null,
          name: null,
          dataType: 'Numerical',
          dataTabType: 'Text',
          elementId: 'tab-form-element-outside',
          className: 'css-2r6ro5',
          domPath: 'body > div:nth-of-type(4) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(4)',
          left: 233.44,
          top: 855.47,
          width: 165,
          height: 22,
          visible: true,
          editable: true,
          checked: null,
          withinDocTab: false,
          nearestSectionText: 'addressOptions Required - addressOptions - isOperatingAddress',
          labelText: 'Numerical',
          keywordMatches: [],
          valueShape: 'numeric',
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
          elementId: 'tab-form-element-later',
          className: 'doc-tab',
          domPath: 'body > div:nth-of-type(5) > input:nth-of-type(1)',
          parentPath: 'body > div:nth-of-type(5)',
          left: 233.44,
          top: 909.88,
          width: 251,
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
      ],
      textNodes: [
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
        {
          tagName: 'SPAN',
          domPath: 'span#late-preview-label',
          className: 'label-text',
          text: '[redacted:text_like]',
          keywords: [],
          textShape: 'text_like',
          redacted: true,
          withinDocTab: true,
          left: 992.73,
          top: 943.16,
          width: 68.7,
          height: 17,
        },
      ],
    });

    expect(refined.captureBounds.height).toBeLessThan(280);
    expect(refined.controls.every((control) => control.withinDocTab)).toBe(true);
    expect(refined.controls.some((control) => control.elementId === 'tab-form-element-outside')).toBe(false);
    expect(refined.controls.some((control) => control.elementId === 'tab-form-element-later')).toBe(false);
    expect(refined.textNodes.some((node) => node.domPath === 'span#late-preview-label')).toBe(false);
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

  test('business_type live verifier trusts the calibrated Location Details Business Type target', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-business-type-live-target-'));
    const calibrationPath = path.join(outDir, 'latest-mapping-calibration.json');
    try {
      fs.writeFileSync(calibrationPath, JSON.stringify({
        schemaVersion: 1,
        rows: [{
          concept: 'business_type',
          conceptDisplayName: 'Business Type',
          jsonKeyPath: 'merchantData.locationBusinessType',
          currentCandidateFieldIndex: 2,
          currentCandidateCoordinates: '411.52,713.6',
          selectedCandidate: '#2 Business Type Business Details p1 ord56 List shape=text_name_like editable=editable layout=Location Details > Business Type @ 411.52,713.6',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 2,
            businessSection: 'Business Details',
            layoutSectionHeader: 'Location Details',
            layoutFieldLabel: 'Business Type',
            pageIndex: 1,
            ordinalOnPage: 56,
            coordinates: '411.52,713.6',
            tabType: 'List',
          }],
        }],
      }), 'utf8');

      const report = mockValidationReport([
        mockField({
          index: 1,
          inferredType: 'legal_entity_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 11,
          tabLeft: 288,
          tabTop: 287.36,
        }),
        mockField({
          index: 2,
          inferredType: 'unknown_manual_review',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 42,
          tabLeft: 350.08,
          tabTop: 544.64,
        }),
        mockField({
          index: 3,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
      ]);
      const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
      const score = buildValidationScorecard(report, null, calibration)
        .conceptScores.find((entry) => entry.key === 'business_type')!;
      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'business_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const testCase = plan.cases[0]!;
      const liveFields = [
        mockDiscoveredField({
          index: 1,
          inferredType: 'legal_entity_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 11,
          tabLeft: 288,
          tabTop: 287.36,
        }),
        mockDiscoveredField({
          index: 2,
          inferredType: 'unknown_manual_review',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 42,
          tabLeft: 350.08,
          tabTop: 544.64,
        }),
        mockDiscoveredField({
          index: 3,
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
      ];

      const resolved = resolveInteractiveTargetField(
        testCase,
        liveFields.find((entry) => entry.index === testCase.targetField.fieldIndex)!,
        liveFields,
      );

      expect(score.identifiedWithConfidence).toBe(true);
      expect(score.mappedFields[0]).toMatchObject({
        fieldIndex: 3,
        displayName: 'Business Type',
        businessSection: 'Business Details',
        identificationConfidence: 'high',
        calibrationEvidence: {
          jsonKeyPath: 'merchantData.locationBusinessType',
          layoutSectionHeader: 'Location Details',
          layoutFieldLabel: 'Business Type',
          expectedOrdinalOnPage: 56,
          expectedDocusignFieldFamily: 'List',
        },
      });
      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases).toHaveLength(4);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 3)).toBe(true);
      expect(testCase.targetProfile).toMatchObject({
        layoutSectionHeader: 'Location Details',
        layoutFieldLabel: 'Business Type',
        jsonKeyPath: 'merchantData.locationBusinessType',
        expectedOrdinalOnPage: 56,
        expectedDocusignFieldFamily: 'List',
      });
      expect(resolved.field.ordinalOnPage).toBe(56);
      expect(resolved.selection.trusted).toBe(true);
      expect(resolved.selection.decisionReason).not.toBe('rejected_insufficient_label_proof');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('business_type Business Type outside Location Details is not trusted', () => {
    const result = selectBestMappingCandidate({
      concept: 'business_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.locationBusinessType',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 411.52,
        tabTop: 713.6,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'business-type-general',
        resolvedLabel: 'Business Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Business Type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 411.52,
        tabTop: 713.6,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_insufficient_label_proof');
    expect(result.assessments[0]!.conceptSpecificProofMatches).toBe(false);
  });

  test('business_type does not trust Legal Entity Type proof', () => {
    const result = selectBestMappingCandidate({
      concept: 'business_type',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.locationBusinessType',
        businessSection: 'Business Details',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 411.52,
        tabTop: 713.6,
        docusignFieldFamily: 'List',
      },
      candidates: [{
        id: 'legal-entity-type',
        resolvedLabel: 'Legal Entity Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Business Details',
        layoutSectionHeader: 'General',
        layoutFieldLabel: 'Legal Entity Type',
        inferredType: 'legal_entity_type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 411.52,
        tabTop: 713.6,
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_insufficient_label_proof');
    expect(result.assessments[0]!.conceptSpecificProofMatches).toBe(false);
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
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
        }),
        mockDiscoveredField({
          index: 3,
          inferredType: 'bank_account_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 64,
          tabLeft: 536.96,
          tabTop: 876.8,
        }),
      ];

      const resolved = resolveInteractiveTargetField(
        testCase,
        liveFields.find((entry) => entry.index === testCase.targetField.fieldIndex)!,
        liveFields,
      );

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

  test('bank_account_type exact calibrated proof is confident when live ordinal drifts', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-bank-scorecard-confidence-'));
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

      const report = mockValidationReport([
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
          ordinalOnPage: 61,
          tabLeft: 536.96,
          tabTop: 876.8,
        }),
      ]);
      const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'));
      const score = buildValidationScorecard(report, null, calibration)
        .conceptScores.find((entry) => entry.key === 'bank_account_type')!;
      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'bank_account_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(score.identifiedWithConfidence).toBe(true);
      expect(score.identificationConfidence).toBe('high');
      expect(score.mappedFields).toHaveLength(1);
      expect(score.mappedFields[0]).toMatchObject({
        fieldIndex: 3,
        displayName: 'Bank Account Type',
        businessSection: 'Banking',
        identificationConfidence: 'high',
        calibrationEvidence: {
          jsonKeyPath: 'merchantData.accountType',
          layoutSectionHeader: 'Bank Info',
          layoutFieldLabel: 'Account Type',
          expectedOrdinalOnPage: 64,
          expectedDocusignFieldFamily: 'List',
        },
      });
      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases).toHaveLength(4);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 3)).toBe(true);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  test('bank_account_type Account Type outside Bank Info is not confidence-uplifted', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        inferredType: 'bank_account_type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 64,
        tabLeft: 536.96,
        tabTop: 876.8,
      }),
    ]);
    const score = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [{
        concept: 'bank_account_type',
        conceptDisplayName: 'Bank Account Type',
        jsonKeyPath: 'merchantData.accountType',
        currentCandidateFieldIndex: 1,
        currentCandidateCoordinates: '536.96,876.8',
        selectedCandidate: '#1 Account Type Banking p1 ord64 List shape=text_name_like editable=editable layout=Location Details > Account Type @ 536.96,876.8',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 1,
          businessSection: 'Banking',
          layoutSectionHeader: 'Location Details',
          layoutFieldLabel: 'Account Type',
          pageIndex: 1,
          ordinalOnPage: 64,
          coordinates: '536.96,876.8',
          tabType: 'List',
        }],
      }],
    }).conceptScores.find((entry) => entry.key === 'bank_account_type')!;

    expect(score.identifiedWithConfidence).toBe(false);
    expect(score.identificationConfidence).toBe('low');
    expect(score.mappedFields.every((entry) => entry.identificationConfidence !== 'high')).toBe(true);
  });

  test('bank_account_type Proof of Bank Account Type proof is not confidence-uplifted', () => {
    const report = mockValidationReport([
      mockField({
        index: 1,
        inferredType: 'proof_of_bank_account_type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 65,
        tabLeft: 663.68,
        tabTop: 876.8,
      }),
    ]);
    const score = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [{
        concept: 'bank_account_type',
        conceptDisplayName: 'Bank Account Type',
        jsonKeyPath: 'merchantData.accountType',
        currentCandidateFieldIndex: 1,
        currentCandidateCoordinates: '663.68,876.8',
        selectedCandidate: '#1 Proof of Bank Account Type Banking p1 ord65 List shape=text_name_like editable=editable layout=Bank Info > Proof of Bank Account Type @ 663.68,876.8',
        decision: 'trust_current_mapping',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 1,
          businessSection: 'Banking',
          layoutSectionHeader: 'Bank Info',
          layoutFieldLabel: 'Proof of Bank Account Type',
          pageIndex: 1,
          ordinalOnPage: 65,
          coordinates: '663.68,876.8',
          tabType: 'List',
        }],
      }],
    }).conceptScores.find((entry) => entry.key === 'bank_account_type')!;

    expect(score.identifiedWithConfidence).toBe(false);
    expect(score.mappedFields).toEqual([]);
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

  test('interactive progress artifact retries once on EBUSY and then succeeds', () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-progress-write-'));
    const currentStep = mockWatchdogProgressState({
      concept: 'phone',
      conceptDisplayName: 'Phone',
      validationId: 'letters-rejected',
      caseName: 'letters',
      phase: 'restore-original-value',
      startedAt: '2026-05-07T12:31:31.278Z',
    });
    let renameAttempts = 0;

    try {
      const progressPath = writeInteractiveProgressArtifact(currentStep, artifactsDir, currentStep.startedAt, {
        renameSync: ((oldPath: fs.PathLike, newPath: fs.PathLike) => {
          renameAttempts += 1;
          if (renameAttempts === 1) {
            throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
          }
          fs.renameSync(oldPath, newPath);
        }) as typeof fs.renameSync,
        sleepMs: () => undefined,
        now: () => 1234,
        random: () => 0.5,
      });

      const artifact = parseJsonFile<ReturnType<typeof buildInteractiveProgressArtifact>>(progressPath);
      expect(renameAttempts).toBe(2);
      expect(artifact.concept).toBe('phone');
      expect(artifact.validationId).toBe('letters-rejected');
      expect(artifact.phase).toBe('restore-original-value');
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test('interactive progress artifact repeated EBUSY logs warning and does not block primary artifact writes', () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-progress-warning-'));
    const warnings: string[] = [];
    const currentStep = mockWatchdogProgressState({
      concept: 'phone',
      conceptDisplayName: 'Phone',
      validationId: 'letters-rejected',
      caseName: 'letters',
      phase: 'restore-original-value',
      startedAt: '2026-05-07T12:31:31.278Z',
    });

    try {
      const resultFile = buildInteractiveResultsFile({
        runStartedAt: '2026-05-07T12:30:58.000Z',
        runFinishedAt: '2026-05-07T12:31:31.278Z',
        currentStep,
        guardState: {
          INTERACTIVE_VALIDATION: true,
          DISPOSABLE_ENVELOPE: true,
        },
        plan: null,
        results: [skippedConceptToResult({
          concept: 'phone',
          conceptDisplayName: 'Phone',
          status: 'skipped',
          reason: 'mapping not trusted for test fixture',
        })],
      });

      const artifacts = writeInteractiveResultsArtifacts(resultFile, artifactsDir, {
        logWarning: (message) => warnings.push(message),
        progressWriteDependencies: {
          renameSync: (() => {
            throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
          }) as typeof fs.renameSync,
          sleepMs: () => undefined,
          now: () => 1234,
          random: () => 0.5,
        },
      });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('progress artifact write warning');
      expect(fs.existsSync(artifacts.jsonPath)).toBe(true);
      expect(fs.existsSync(artifacts.targetDiagnosticsJsonPath)).toBe(true);

      const written = parseJsonFile<InteractiveValidationResultsFile>(artifacts.jsonPath);
      expect(written.summary.total).toBe(1);
      expect(written.summary.skipped).toBe(1);
      expect(written.currentStep?.validationId).toBe('letters-rejected');
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  test('interactive progress artifact temp-file replacement preserves valid JSON shape', () => {
    const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-progress-atomic-'));

    try {
      const first = mockWatchdogProgressState({
        concept: 'phone',
        conceptDisplayName: 'Phone',
        validationId: 'valid-e164-accepted',
        caseName: 'valid-e164',
        phase: 'collect-observation',
        startedAt: '2026-05-07T12:31:00.000Z',
      });
      const second = mockWatchdogProgressState({
        concept: 'phone',
        conceptDisplayName: 'Phone',
        validationId: 'letters-rejected',
        caseName: 'letters',
        phase: 'restore-original-value',
        startedAt: '2026-05-07T12:31:31.278Z',
      });

      const progressPath = writeInteractiveProgressArtifact(first, artifactsDir, first.startedAt);
      writeInteractiveProgressArtifact(second, artifactsDir, second.startedAt);

      const artifact = parseJsonFile<ReturnType<typeof buildInteractiveProgressArtifact>>(progressPath);
      expect(artifact.validationId).toBe('letters-rejected');
      expect(artifact.phase).toBe('restore-original-value');
      expect(
        fs.readdirSync(artifactsDir).filter((name) => name.startsWith('latest-interactive-progress.json.') && name.endsWith('.tmp')),
      ).toEqual([]);
    } finally {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    }
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

  test('calibrated Batch 1 targets use live discovery field indexes for interactive plans', () => {
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
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 4)).toBe(true);
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

  test('stakeholder_first_name requires first-name proof on a stakeholder text control', () => {
    const result = selectBestMappingCandidate({
      concept: 'stakeholder_first_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].firstName',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 2,
        tabLeft: 348.16,
        tabTop: 122.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'first-name',
        resolvedLabel: 'Stakeholder First Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'First Name',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 4,
        tabLeft: 35.2,
        tabTop: 154.88,
        currentValue: 'Jordan',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'last-name',
        resolvedLabel: 'Stakeholder Last Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Last Name',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 5,
        tabLeft: 567.04,
        tabTop: 122.88,
        currentValue: 'Lee',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'job-title',
        resolvedLabel: 'Stakeholder Job Title',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Job Title',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 31,
        tabLeft: 35.2,
        tabTop: 311.04,
        currentValue: 'President',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'stakeholder-email',
        resolvedLabel: 'Stakeholder Email',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Email',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 26,
        tabLeft: 35.2,
        tabTop: 280.32,
        currentValue: 'owner@example.com',
        currentValueShape: 'email',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'stakeholder-phone',
        resolvedLabel: 'Stakeholder Phone',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Phone',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 27,
        tabLeft: 410.88,
        tabTop: 279.04,
        currentValue: '+15551234567',
        currentValueShape: 'phone',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'ownership',
        resolvedLabel: 'Ownership Percentage',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Ownership Percentage',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 8,
        tabLeft: 441.6,
        tabTop: 154.88,
        currentValue: '100',
        currentValueShape: 'numeric',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'checkbox-neighbor',
        docusignTabType: 'Checkbox',
        pageIndex: 3,
        ordinalOnPage: 1,
        tabLeft: 526.72,
        tabTop: 41.6,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'list-neighbor',
        resolvedLabel: 'Stakeholder Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Stakeholder Type',
        docusignTabType: 'List',
        pageIndex: 3,
        ordinalOnPage: 7,
        tabLeft: 257.28,
        tabTop: 154.88,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    const assessmentsById = new Map(result.assessments.map((assessment) => [assessment.candidateId, assessment]));

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('first-name');
    expect(assessmentsById.get('last-name')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('job-title')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('stakeholder-email')!.valueShapeMismatch).toBe(true);
    expect(assessmentsById.get('stakeholder-phone')!.valueShapeMismatch).toBe(true);
    expect(assessmentsById.get('ownership')!.valueShapeMismatch).toBe(true);
    expect(assessmentsById.get('checkbox-neighbor')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('list-neighbor')!.conceptSpecificProofMatches).toBe(false);
  });

  test('stakeholder_last_name requires last-name proof on a stakeholder text control', () => {
    const result = selectBestMappingCandidate({
      concept: 'stakeholder_last_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].lastName',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 1,
        tabLeft: 128.64,
        tabTop: 122.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'last-name',
        resolvedLabel: 'Stakeholder Last Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Last Name',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 4,
        tabLeft: 567.04,
        tabTop: 122.88,
        currentValue: 'Lee',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'first-name',
        resolvedLabel: 'Stakeholder First Name',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'First Name',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 5,
        tabLeft: 35.2,
        tabTop: 154.88,
        currentValue: 'Jordan',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'job-title',
        resolvedLabel: 'Stakeholder Job Title',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Job Title',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 31,
        tabLeft: 35.2,
        tabTop: 311.04,
        currentValue: 'President',
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'checkbox-neighbor',
        docusignTabType: 'Checkbox',
        pageIndex: 3,
        ordinalOnPage: 1,
        tabLeft: 526.72,
        tabTop: 41.6,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'list-neighbor',
        resolvedLabel: 'Stakeholder Type',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Stakeholder',
        layoutSectionHeader: 'Stakeholder',
        layoutFieldLabel: 'Stakeholder Type',
        docusignTabType: 'List',
        pageIndex: 3,
        ordinalOnPage: 7,
        tabLeft: 257.28,
        tabTop: 154.88,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    const assessmentsById = new Map(result.assessments.map((assessment) => [assessment.candidateId, assessment]));

    expect(result.trusted).toBe(true);
    expect(result.selectedCandidateId).toBe('last-name');
    expect(assessmentsById.get('first-name')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('job-title')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('checkbox-neighbor')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('list-neighbor')!.conceptSpecificProofMatches).toBe(false);
  });

  test('stakeholder_first_name stale checkbox and list neighbors do not outrank nearby text inputs', () => {
    const result = selectBestMappingCandidate({
      concept: 'stakeholder_first_name',
      currentCandidateId: null,
      expectedAnchor: {
        jsonKeyPath: 'merchantData.stakeholders[0].firstName',
        businessSection: 'Stakeholder',
        pageIndex: 3,
        ordinalOnPage: 2,
        tabLeft: 348.16,
        tabTop: 122.88,
        docusignFieldFamily: 'Text',
      },
      candidates: [{
        id: 'checkbox-neighbor',
        docusignTabType: 'Checkbox',
        pageIndex: 3,
        ordinalOnPage: 1,
        tabLeft: 526.72,
        tabTop: 41.6,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'text-neighbor',
        docusignTabType: 'Text',
        pageIndex: 3,
        ordinalOnPage: 4,
        tabLeft: 567.04,
        tabTop: 122.88,
        currentValueShape: 'empty',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }, {
        id: 'list-neighbor',
        docusignTabType: 'List',
        pageIndex: 3,
        ordinalOnPage: 7,
        tabLeft: 257.28,
        tabTop: 154.88,
        currentValueShape: 'text_name_like',
        controlCategory: 'merchant_input',
        visible: true,
        editable: true,
      }],
    });

    expect(result.trusted).toBe(false);
    expect(result.selectedCandidateId).toBe('text-neighbor');
    expect(result.decisionReason).toBe('rejected_stale_enrichment');
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
    const physicalOnly = selectBestMappingCandidate({
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
        id: 'physical-state',
        resolvedLabel: 'Physical Operating Address State',
        labelSource: 'layout-cell',
        labelConfidence: 'high',
        businessSection: 'Address',
        layoutSectionHeader: 'Physical Operating Address',
        layoutFieldLabel: 'State',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 50,
        tabLeft: 350.08,
        tabTop: 657.92,
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
    expect(physicalOnly.trusted).toBe(false);
    expect(wrongSection.trusted).toBe(false);
    expect(wrongSection.decisionReason).toBe('rejected_section_mismatch');
  });

  test('registered_state calibrated layout proof resolves stale field-slot drift and keeps live target trust on the registered-address list', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-registered-state-calibration-'));
    const calibrationPath = path.join(outDir, 'latest-mapping-calibration.json');
    try {
      fs.writeFileSync(calibrationPath, JSON.stringify({
        schemaVersion: 1,
        rows: [{
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          jsonKeyPath: 'merchantData.registeredLegalAddress.state',
          currentCandidateFieldIndex: 64,
          currentCandidateCoordinates: '350.08,544.64',
          selectedCandidate: '#64 Registered Legal Address State Address p1 ord42 List shape=text_name_like editable=editable layout=Registered Legal Address > State @ 350.08,544.64',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 64,
            businessSection: 'Address',
            layoutSectionHeader: 'Registered Legal Address',
            layoutFieldLabel: 'State',
            pageIndex: 1,
            ordinalOnPage: 42,
            coordinates: '350.08,544.64',
            tabType: 'List',
          }],
        }],
      }), 'utf8');

      const fields = Array.from({ length: 64 }, (_, index) => mockField({ index: index + 1 }));
      fields[2] = mockField({
        kind: 'combobox',
        index: 3,
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        labelSource: 'none',
        labelConfidence: 'none',
        inferredType: 'unknown_manual_review',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 42,
        tabLeft: 350.08,
        tabTop: 544.64,
      });
      fields[63] = mockField({
        kind: 'combobox',
        index: 64,
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        labelSource: 'enrichment-coordinate',
        labelConfidence: 'medium',
        inferredType: 'business_type',
        docusignTabType: 'List',
        pageIndex: 1,
        ordinalOnPage: 56,
        tabLeft: 411.52,
        tabTop: 713.6,
        currentValueShape: 'text_name_like',
      });

      const plan = buildInteractiveValidationPlan(mockValidationReport(fields), {
        INTERACTIVE_CONCEPTS: 'registered_state',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases).toHaveLength(4);
      expect(plan.cases.every((entry) => entry.targetField.fieldIndex === 3)).toBe(true);
      expect(plan.cases[0]!.targetProfile).toMatchObject({
        intendedFieldDisplayName: 'Registered Legal Address State',
        intendedBusinessSection: 'Address',
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'State',
        layoutEvidenceSource: 'mapping-calibration',
        inferredType: 'unknown_manual_review',
        labelSource: 'none',
        expectedOrdinalOnPage: 42,
        expectedDocusignFieldFamily: 'List',
        expectedCoordinates: {
          left: 350.08,
          top: 544.64,
        },
      });

      const liveFields = [
        mockDiscoveredField({
          index: 3,
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 42,
          tabLeft: 350.08,
          tabTop: 544.64,
          currentValue: 'NC',
          visible: true,
          editable: true,
        }),
        mockDiscoveredField({
          index: 47,
          resolvedLabel: 'Physical Operating Address State',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 50,
          tabLeft: 350.08,
          tabTop: 657.92,
          currentValue: 'NC',
          visible: true,
          editable: true,
        }),
        mockDiscoveredField({
          index: 64,
          resolvedLabel: 'Business Type',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 56,
          tabLeft: 411.52,
          tabTop: 713.6,
          currentValue: 'Physical',
          visible: true,
          editable: true,
        }),
        mockDiscoveredField({
          index: 68,
          resolvedLabel: 'Bank Address State',
          labelSource: 'layout-cell',
          labelConfidence: 'high',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 66,
          tabLeft: 410.88,
          tabTop: 936.32,
          currentValue: 'NC',
          visible: true,
          editable: true,
        }),
      ];

      const testCase = plan.cases[0]!;
      const resolved = resolveInteractiveTargetField(
        testCase,
        liveFields.find((entry) => entry.index === testCase.targetField.fieldIndex)!,
        liveFields,
      );

      expect(resolved.field.index).toBe(3);
      expect(resolved.field.ordinalOnPage).toBe(42);
      expect(resolved.selection.trusted).toBe(true);
      expect(resolved.selection.decisionReason).not.toBe('rejected_insufficient_label_proof');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
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

  test('document_type prefers the stakeholder metadata selector over upload and file-value echoes without auto-trusting it', () => {
    const result = selectBestMappingCandidate({
      concept: 'document_type',
      currentCandidateId: null,
      candidates: [
        {
          id: 'upload',
          resolvedLabel: 'Upload Identification Document',
          labelSource: 'aria-label',
          labelConfidence: 'high',
          docusignTabType: 'SignerAttachment',
          controlCategory: 'attachment_control',
          visible: true,
          editable: false,
        },
        {
          id: 'file-echo',
          docusignTabType: 'List',
          controlCategory: 'merchant_input',
          inferredType: 'document_type',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          currentValue: 'drivers-license.pdf',
          visible: true,
          editable: true,
        },
        {
          id: 'document-type',
          docusignTabType: 'List',
          controlCategory: 'merchant_input',
          inferredType: 'document_type',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
          visible: true,
          editable: true,
        },
      ],
    });

    const assessmentsById = new Map(result.assessments.map((assessment) => [assessment.candidateId, assessment]));

    expect(result.selectedCandidateId).toBe('document-type');
    expect(result.trusted).toBe(false);
    expect(result.decisionReason).toBe('rejected_insufficient_label_proof');
    expect(assessmentsById.get('document-type')!.conceptSpecificProofMatches).toBe(true);
    expect(assessmentsById.get('upload')!.conceptSpecificProofMatches).toBe(false);
    expect(assessmentsById.get('file-echo')!.conceptSpecificProofMatches).toBe(false);
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

  test('stakeholder email-phone and amount alias anchors produce offline calibration rows', () => {
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
        rows: [
          {
            jsonKeyPath: 'merchantData.stakeholders[0].email',
            jsonFieldFamily: 'Stakeholder',
            jsonValueSample: 'shape:email',
            jsonTypeHint: 'email',
            matchedTabGuid: 'guid-stakeholder-email',
            matchedRenderedValue: null,
            candidateRenderedPrompt: null,
            candidateDocuSignFieldFamily: 'Text',
            tabPageIndex: 3,
            tabOrdinalOnPage: 22,
            tabLeft: 35.2,
            tabTop: 280.32,
            layoutSectionHeader: null,
            layoutFieldLabel: null,
            layoutEvidenceSource: null,
            layoutValueShape: null,
            layoutNeighboringLabels: [],
            layoutEditability: null,
            businessSection: 'Stakeholder',
            confidence: 'high',
            matchingMethod: 'layout_cell',
            notes: 'matched stakeholder email anchor',
          },
          {
            jsonKeyPath: 'merchantData.stakeholders[0].phoneNumber',
            jsonFieldFamily: 'Stakeholder',
            jsonValueSample: 'shape:phone',
            jsonTypeHint: 'phone',
            matchedTabGuid: 'guid-stakeholder-phone',
            matchedRenderedValue: null,
            candidateRenderedPrompt: null,
            candidateDocuSignFieldFamily: 'Text',
            tabPageIndex: 3,
            tabOrdinalOnPage: 23,
            tabLeft: 410.88,
            tabTop: 279.04,
            layoutSectionHeader: null,
            layoutFieldLabel: null,
            layoutEvidenceSource: null,
            layoutValueShape: null,
            layoutNeighboringLabels: [],
            layoutEditability: null,
            businessSection: 'Stakeholder',
            confidence: 'high',
            matchingMethod: 'layout_cell',
            notes: 'matched stakeholder phone anchor',
          },
          {
            jsonKeyPath: 'merchantData.grossAnnualRevenue',
            jsonFieldFamily: 'Processing & Financials',
            jsonValueSample: 'shape:numeric',
            jsonTypeHint: 'currency',
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
            businessSection: 'Processing & Financials',
            confidence: 'none',
            matchingMethod: 'unmatched',
            notes: 'no rendered value matched any variant',
          },
          {
            jsonKeyPath: 'merchantData.averageTicketSize',
            jsonFieldFamily: 'Processing & Financials',
            jsonValueSample: 'shape:numeric',
            jsonTypeHint: 'currency',
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
            businessSection: 'Processing & Financials',
            confidence: 'none',
            matchingMethod: 'unmatched',
            notes: 'no rendered value matched any variant',
          },
          {
            jsonKeyPath: 'merchantData.maxTicketSize',
            jsonFieldFamily: 'Processing & Financials',
            jsonValueSample: 'shape:numeric',
            jsonTypeHint: 'currency',
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
            businessSection: 'Processing & Financials',
            confidence: 'none',
            matchingMethod: 'unmatched',
            notes: 'no rendered value matched any variant',
          },
        ],
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });

    expect(calibration.rows.find((entry) => entry.concept === 'stakeholder_email')).toMatchObject({
      jsonKeyPath: 'merchantData.stakeholders[0].email',
      decision: 'leave_unresolved',
    });
    expect(calibration.rows.find((entry) => entry.concept === 'stakeholder_phone')).toMatchObject({
      jsonKeyPath: 'merchantData.stakeholders[0].phoneNumber',
      decision: 'leave_unresolved',
    });
    expect(calibration.rows.find((entry) => entry.concept === 'annual_revenue')).toMatchObject({
      jsonKeyPath: 'merchantData.grossAnnualRevenue',
      decision: 'leave_unresolved',
    });
    expect(calibration.rows.find((entry) => entry.concept === 'average_ticket')).toMatchObject({
      jsonKeyPath: 'merchantData.averageTicketSize',
      decision: 'leave_unresolved',
    });
    expect(calibration.rows.find((entry) => entry.concept === 'max_ticket')).toMatchObject({
      jsonKeyPath: 'merchantData.maxTicketSize',
      decision: 'leave_unresolved',
    });
    expect(calibration.rows.filter((entry) =>
      ['stakeholder_email', 'stakeholder_phone', 'annual_revenue', 'average_ticket', 'max_ticket'].includes(entry.concept),
    ).every((entry) => entry.missingProof.length > 0)).toBe(true);
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

  test('document_type emits an unresolved calibration row from stakeholder idType fallback evidence', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          rawCandidateLabels: [{ source: 'label-for', value: 'Required - stakeholder1IdType' }],
          rejectedLabelCandidates: [{ source: 'label-for', value: 'Required - stakeholder1IdType', reason: 'docusign-stub' }],
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          docusignTabType: 'List',
          inferredType: 'document_type',
          inferredClassification: 'manual_review',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
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
        records: [],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.stakeholders[0].idType',
          jsonFieldFamily: 'Stakeholder',
          jsonValueSample: 'driverLicense',
          jsonTypeHint: 'enum',
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
          businessSection: 'Stakeholder',
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

    const row = calibration.rows.find((entry) => entry.concept === 'document_type');

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      decision: 'leave_unresolved',
      mappingDecisionReason: 'rejected_insufficient_label_proof',
    });
    expect(row!.selectedCandidate).toContain('#1');
    expect(row!.missingProof).toContain('Need a visible editable stakeholder ID Type or Document Type selector that is separate from any upload widget or uploaded file value.');
    expect(row!.humanConfirmation).toMatchObject({
      suspectedFieldLocation: '#1 (unresolved) p3 ord10 List shape=empty editable=editable @ 37.12,186.88',
      currentBlocker: 'The saved sample does not currently prove a separate editable Stakeholder Document Type / ID Type control, and the current safe-mode report only shows an unlabeled page-3 dropdown/list candidate.',
      requestedEvidence: 'Review one screenshot of the Stakeholder section around the Document Type / ID Type control and answer: what is the field-local label, is it visible, is it editable, is it a dropdown/list, and is it separate from any upload widget or uploaded file-value echo?',
      decisionImpact: 'If the screenshot confirms one visible editable Stakeholder Document Type / ID Type dropdown/list that is separate from any upload widget or uploaded file-value echo, the next calibration can trust Document Type; otherwise keep Document Type mapping-blocked and out of product-failure counts for this flow.',
    });
  });

  test('document_type trusts stakeholder idType fallback evidence once local human proof confirms the selector', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          rawCandidateLabels: [{ source: 'label-for', value: 'Required - stakeholder1IdType' }],
          rejectedLabelCandidates: [{ source: 'label-for', value: 'Required - stakeholder1IdType', reason: 'docusign-stub' }],
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          docusignTabType: 'List',
          inferredType: 'document_type',
          inferredClassification: 'manual_review',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
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
        records: [],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.stakeholders[0].idType',
          jsonFieldFamily: 'Stakeholder',
          jsonValueSample: 'driverLicense',
          jsonTypeHint: 'enum',
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
          businessSection: 'Stakeholder',
          confidence: 'none',
          matchingMethod: 'unmatched',
          notes: 'no rendered value matched any variant',
        }],
      },
      humanProof: {
        byConcept: {
          document_type: {
            status: 'confirmed_editable_dropdown',
            summary: 'Existing mock proof confirms Stakeholder > Required - stakeholder1IdType is visible and editable as a dropdown/list, separate from Attachment controls and not a file-value echo.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });

    const row = calibration.rows.find((entry) => entry.concept === 'document_type');

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      decision: 'trust_likely_better_candidate',
      mappingDecisionReason: 'trusted_by_label',
      appliedHumanProof: {
        status: 'confirmed_editable_dropdown',
      },
      humanConfirmation: null,
    });
    expect(row!.selectedCandidate).toContain('#1');
    expect(row!.missingProof).toEqual([]);
    expect(row!.explanation).toContain('Human proof: Existing mock proof confirms Stakeholder > Required - stakeholder1IdType is visible and editable as a dropdown/list, separate from Attachment controls and not a file-value echo.');
    expect(row!.explanation).toContain('Human proof plus the selected stakeholder metadata selector are strong enough to trust this field conservatively.');
  });

  test('proof_of_address_type trusts the registered legal address selector when human proof and the exact live layout target agree', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          rawCandidateLabels: [{ source: 'label-for', value: 'Required - legalAddressType' }],
          rejectedLabelCandidates: [{ source: 'label-for', value: 'Required - legalAddressType', reason: 'docusign-stub' }],
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          docusignTabType: 'List',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          pageIndex: 1,
          ordinalOnPage: 37,
          tabLeft: 663.68,
          tabTop: 512.64,
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
          tabGuid: 'guid-proof-of-address-type',
          positionalFingerprint: 'page:1|List|ord:37',
          tabLeft: 663.68,
          tabTop: 512.64,
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonTypeHint: 'enum',
          docusignFieldFamily: 'List',
          confidence: 'high',
          suggestedDisplayName: 'Proof Of Address Type',
          suggestedBusinessSection: 'Attachments',
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutValueShape: 'empty',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonValueSample: 'Utility Bill',
          jsonTypeHint: 'enum',
          matchedTabGuid: 'guid-proof-of-address-type',
          matchedRenderedValue: null,
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'List',
          tabPageIndex: 1,
          tabOrdinalOnPage: 37,
          tabLeft: 663.68,
          tabTop: 512.64,
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'empty',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
          businessSection: 'Attachments',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Registered Legal Address > Proof of Address Type)',
        }],
      },
      humanProof: {
        byConcept: {
          proof_of_address_type: {
            status: 'confirmed_editable_dropdown',
            summary: 'Existing mock proof confirms Registered Legal Address > Proof of Address Type is visible and editable as a dropdown/list, separate from the adjacent Proof of Address Document upload widget, separate from uploaded file-value echoes, and separate from stakeholder document metadata on page 3.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });

    const row = calibration.rows.find((entry) => entry.concept === 'proof_of_address_type');

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      decision: 'trust_current_mapping',
      mappingDecisionReason: 'trusted_by_label',
      appliedHumanProof: {
        status: 'confirmed_editable_dropdown',
      },
      humanConfirmation: null,
    });
    expect(row!.selectedCandidate).toContain('#1');
    expect(row!.missingProof).toEqual([]);
  });

  test('proof_of_address_type trusts high-confidence offline layout evidence when human proof exists but no live layout target matches', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          docusignTabType: 'Text',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          pageIndex: 1,
          ordinalOnPage: 37,
          tabLeft: 35.2,
          tabTop: 512.64,
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
          tabGuid: 'guid-proof-of-address-type',
          positionalFingerprint: 'page:1|List|ord:37',
          tabLeft: 663.68,
          tabTop: 512.64,
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonTypeHint: 'enum',
          docusignFieldFamily: 'List',
          confidence: 'high',
          suggestedDisplayName: 'Proof Of Address Type',
          suggestedBusinessSection: 'Attachments',
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutValueShape: 'empty',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonValueSample: 'Utility Bill',
          jsonTypeHint: 'enum',
          matchedTabGuid: 'guid-proof-of-address-type',
          matchedRenderedValue: null,
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'List',
          tabPageIndex: 1,
          tabOrdinalOnPage: 37,
          tabLeft: 663.68,
          tabTop: 512.64,
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'empty',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
          businessSection: 'Attachments',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Registered Legal Address > Proof of Address Type)',
        }],
      },
      humanProof: {
        byConcept: {
          proof_of_address_type: {
            status: 'confirmed_editable_dropdown',
            summary: 'Existing mock proof confirms Registered Legal Address > Proof of Address Type is visible and editable as a dropdown/list, separate from the adjacent Proof of Address Document upload widget, separate from uploaded file-value echoes, and separate from stakeholder document metadata on page 3.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });

    const row = calibration.rows.find((entry) => entry.concept === 'proof_of_address_type');

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      decision: 'trust_likely_better_candidate',
      mappingDecisionReason: 'trusted_by_label',
      appliedHumanProof: {
        status: 'confirmed_editable_dropdown',
      },
      humanConfirmation: null,
    });
    expect(row!.selectedCandidate).toContain('Proof Of Address Type');
    expect(row!.selectedCandidate).toContain('layout=Registered Legal Address > Proof of Address Type');
    expect(row!.missingProof).toEqual([]);
    expect(row!.explanation).toContain('Human proof plus matching local mock MHTML/PDF layout evidence are strong enough to trust this field conservatively.');
  });

  test('proof_of_address_type stays unresolved when the offline sample family is not a trusted selector', () => {
    const calibration = buildMappingCalibration({
      report: mockValidationReport([
        mockField({
          index: 1,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          docusignTabType: 'Text',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          pageIndex: 1,
          ordinalOnPage: 37,
          tabLeft: 35.2,
          tabTop: 512.64,
          currentValueShape: 'text_name_like',
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
          tabGuid: 'guid-proof-of-address-type',
          positionalFingerprint: 'page:1|Text|ord:37',
          tabLeft: 663.68,
          tabTop: 512.64,
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonTypeHint: 'enum',
          docusignFieldFamily: 'Text',
          confidence: 'high',
          suggestedDisplayName: 'Proof Of Address Type',
          suggestedBusinessSection: 'Attachments',
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutValueShape: 'text_name_like',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
        }],
      },
      alignment: {
        rows: [{
          jsonKeyPath: 'merchantData.proofOfAddressType',
          jsonFieldFamily: 'Attachments',
          jsonValueSample: 'Utility Bill',
          jsonTypeHint: 'enum',
          matchedTabGuid: 'guid-proof-of-address-type',
          matchedRenderedValue: null,
          candidateRenderedPrompt: 'Required',
          candidateDocuSignFieldFamily: 'Text',
          tabPageIndex: 1,
          tabOrdinalOnPage: 37,
          tabLeft: 663.68,
          tabTop: 512.64,
          layoutSectionHeader: 'Registered Legal Address',
          layoutFieldLabel: 'Proof of Address Type',
          layoutEvidenceSource: 'pdf-text-sequence',
          layoutValueShape: 'text_name_like',
          layoutNeighboringLabels: ['Address Line 1', 'Address Line 2', 'City', 'State', 'ZIP', 'Proof of Address Type'],
          layoutEditability: 'editable',
          businessSection: 'Attachments',
          confidence: 'high',
          matchingMethod: 'layout_cell',
          notes: 'matched using PDF/MHTML field-cell evidence (Registered Legal Address > Proof of Address Type)',
        }],
      },
      humanProof: {
        byConcept: {
          proof_of_address_type: {
            status: 'confirmed_editable_dropdown',
            summary: 'Existing mock proof confirms Registered Legal Address > Proof of Address Type is visible and editable as a dropdown/list, separate from the adjacent Proof of Address Document upload widget, separate from uploaded file-value echoes, and separate from stakeholder document metadata on page 3.',
          },
        },
        inferMissingCountryFromOtherDropdowns: false,
      },
      summaryPath: 'summary.json',
      targetDiagnosticsPath: 'diagnostics.json',
      enrichmentPath: 'enrichment.json',
      alignmentPath: 'alignment.json',
    });

    const row = calibration.rows.find((entry) => entry.concept === 'proof_of_address_type');

    expect(row).toBeDefined();
    expect(row).toMatchObject({
      decision: 'leave_unresolved',
      mappingDecisionReason: 'rejected_insufficient_label_proof',
      appliedHumanProof: {
        status: 'confirmed_editable_dropdown',
      },
      humanConfirmation: null,
    });
    expect(row!.missingProof).toContain('Layout label exists but the sample DocuSign control family is Text, not a trusted select/list/radio control.');
    expect(row!.missingProof).toContain('The saved safe-mode report still does not surface a matching field-local Registered Legal Address Proof of Address Type selector.');
  });

  test('proof_of_address_type scorecard handoff materializes the calibrated registered-address selector without changing document_type', () => {
    const report = mockValidationReport([
      mockField({
        index: 37,
        kind: 'combobox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        docusignTabType: 'List',
        inferredType: 'unknown_manual_review',
        inferredClassification: 'manual_review',
        currentValueShape: 'empty',
        pageIndex: 1,
        ordinalOnPage: 37,
        tabLeft: 663.68,
        tabTop: 512.64,
      }),
      mockField({
        index: 76,
        kind: 'combobox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
        resolvedLabel: 'Proof Of Address Type',
        label: 'Proof Of Address Type',
        labelSource: 'aria-label',
        labelConfidence: 'low',
        docusignTabType: 'List',
        inferredType: 'proof_of_address_type',
        inferredClassification: 'manual_review',
        currentValueShape: 'empty',
        helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
        pageIndex: 3,
        ordinalOnPage: 10,
        tabLeft: 37.12,
        tabTop: 186.88,
      }),
      mockField({
        index: 77,
        kind: 'combobox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
        docusignTabType: 'List',
        inferredType: 'document_type',
        inferredClassification: 'manual_review',
        currentValueShape: 'empty',
        helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
        pageIndex: 3,
        ordinalOnPage: 11,
        tabLeft: 37.12,
        tabTop: 218.88,
      }),
    ]);

    const scorecard = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: 76,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.68,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'offline_layout_target_after_safe_mode_gap',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 76,
          businessSection: 'Attachments',
          layoutSectionHeader: 'Stakeholder',
          layoutFieldLabel: 'Proof of Address Type',
          pageIndex: 3,
          ordinalOnPage: 10,
          coordinates: '37.12,186.88',
          tabType: 'List',
        }],
      }],
    });

    const proofOfAddressTypeScore = scorecard.conceptScores.find((entry) => entry.key === 'proof_of_address_type')!;
    const documentTypeScore = scorecard.conceptScores.find((entry) => entry.key === 'document_type')!;

    expect(proofOfAddressTypeScore.identifiedWithConfidence).toBe(true);
    expect(proofOfAddressTypeScore.identificationConfidence).toBe('high');
    expect(proofOfAddressTypeScore.cannotRunValidationCount).toBe(0);
    expect(proofOfAddressTypeScore.bestPracticeValidations.every((entry) => entry.status === 'not_run')).toBe(true);
    expect(proofOfAddressTypeScore.mappedFields[0]).toMatchObject({
      fieldIndex: 37,
      displayName: 'Proof Of Address Type',
      identificationConfidence: 'high',
      calibrationEvidence: {
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Proof of Address Type',
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 37,
        expectedDocusignFieldFamily: 'List',
      },
    });
    expect(documentTypeScore.identifiedWithConfidence).toBe(false);
    expect(documentTypeScore.mappedFields.every((field) => field.fieldIndex !== 37)).toBe(true);
  });

  test('proof_of_address_type interactive handoff emits controlled-choice cases from the calibrated registered-address selector', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-proof-of-address-handoff-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: 76,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.68,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'offline_layout_target_after_safe_mode_gap',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 76,
          businessSection: 'Attachments',
          layoutSectionHeader: 'Stakeholder',
          layoutFieldLabel: 'Proof of Address Type',
          pageIndex: 3,
          ordinalOnPage: 10,
          coordinates: '37.12,186.88',
          tabType: 'List',
        }],
      }],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({
          index: 37,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          docusignTabType: 'List',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'empty',
          pageIndex: 1,
          ordinalOnPage: 37,
          tabLeft: 663.68,
          tabTop: 512.64,
        }),
        mockField({
          index: 76,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          resolvedLabel: 'Proof Of Address Type',
          label: 'Proof Of Address Type',
          labelSource: 'aria-label',
          labelConfidence: 'low',
          docusignTabType: 'List',
          inferredType: 'proof_of_address_type',
          inferredClassification: 'manual_review',
          currentValueShape: 'empty',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'proof_of_address_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const proofOfAddressTypeCases = plan.cases.filter((entry) => entry.concept === 'proof_of_address_type');

      expect(plan.skippedConcepts).toEqual([]);
      expect(proofOfAddressTypeCases.map((entry) => entry.validationId)).toEqual(
        FIELD_CONCEPT_REGISTRY.proof_of_address_type.bestPracticeValidations.map((entry) => entry.id),
      );
      expect(proofOfAddressTypeCases.every((entry) => entry.targetField.fieldIndex === 37)).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.cleanupStrategy === 'restore_original_value_then_blur')).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.safetyNotes.includes('Does not exercise signature or completion flows.'))).toBe(true);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('proof_of_address_type scorecard handoff stays confident when calibration is trusted but the live summary has no direct field', () => {
    const report = mockValidationReport([
      mockField({
        index: 14,
        kind: 'textbox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        inferredType: 'unknown_manual_review',
        inferredClassification: 'manual_review',
        currentValueShape: 'text_name_like',
        pageIndex: 1,
        ordinalOnPage: 33,
        tabLeft: 35.2,
        tabTop: 433.92,
      }),
      mockField({
        index: 17,
        kind: 'textbox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        inferredType: 'phone',
        inferredClassification: 'manual_review',
        currentValueShape: 'phone',
        pageIndex: 1,
        ordinalOnPage: 36,
        tabLeft: 663.04,
        tabTop: 433.92,
      }),
      mockField({
        index: 19,
        kind: 'textbox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        inferredType: 'unknown_manual_review',
        inferredClassification: 'manual_review',
        currentValueShape: 'empty',
        pageIndex: 1,
        ordinalOnPage: 38,
        tabLeft: 348.16,
        tabTop: 512.64,
      }),
      mockField({
        index: 76,
        kind: 'combobox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
        docusignTabType: 'List',
        inferredType: 'proof_of_address_type',
        inferredClassification: 'manual_review',
        currentValueShape: 'text_name_like',
        observedValueLikeTextNearControl: '-- select -- Driver’s License Passport National ID',
        helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
        pageIndex: 3,
        ordinalOnPage: 16,
        tabLeft: 663.68,
        tabTop: 186.88,
      }),
    ]);

    const scorecard = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: null,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.6800000000001,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 17,
          businessSection: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          pageIndex: 1,
          ordinalOnPage: 36,
          coordinates: '663.04,433.92',
          tabType: 'Text',
        }],
      }],
    });

    const proofOfAddressTypeScore = scorecard.conceptScores.find((entry) => entry.key === 'proof_of_address_type')!;

    expect(proofOfAddressTypeScore.identifiedWithConfidence).toBe(true);
    expect(proofOfAddressTypeScore.cannotRunValidationCount).toBe(0);
    expect(proofOfAddressTypeScore.notRunValidationCount).toBe(4);
    expect(proofOfAddressTypeScore.mappedFields[0]).toMatchObject({
      fieldIndex: 101,
      identificationConfidence: 'high',
      calibrationEvidence: {
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Proof of Address Type',
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 37,
        expectedTabLeft: 663.6800000000001,
        expectedTabTop: 512.64,
        expectedDocusignFieldFamily: 'List',
      },
    });
  });

  test('proof_of_address_type interactive handoff seeds planned cases from nearby page-1 fields when calibration is synthetic', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-proof-of-address-synthetic-handoff-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: null,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.6800000000001,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 17,
          businessSection: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          pageIndex: 1,
          ordinalOnPage: 36,
          coordinates: '663.04,433.92',
          tabType: 'Text',
        }],
      }],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({
          index: 14,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_name_like',
          pageIndex: 1,
          ordinalOnPage: 33,
          tabLeft: 35.2,
          tabTop: 433.92,
        }),
        mockField({
          index: 17,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'phone',
          inferredClassification: 'manual_review',
          currentValueShape: 'phone',
          enrichment: {
            jsonKeyPath: 'merchantData.proofOfAddressType',
            matchedBy: 'enrichment-position',
            confidence: 'high',
            suggestedDisplayName: 'Proof Of Address Type',
            suggestedBusinessSection: 'Attachments',
            layoutSectionHeader: 'Registered Legal Address',
            layoutFieldLabel: 'Proof of Address Type',
            layoutEvidenceSource: 'mapping-calibration',
            positionalFingerprint: 'page:1|Text|ord:34',
            expectedPageIndex: 1,
            expectedOrdinalOnPage: 34,
            expectedDocusignFieldFamily: 'Text',
            expectedTabLeft: 663.04,
            expectedTabTop: 433.92,
          },
          pageIndex: 1,
          ordinalOnPage: 36,
          tabLeft: 663.04,
          tabTop: 433.92,
        }),
        mockField({
          index: 19,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'empty',
          pageIndex: 1,
          ordinalOnPage: 38,
          tabLeft: 348.16,
          tabTop: 512.64,
        }),
        mockField({
          index: 76,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          docusignTabType: 'List',
          inferredType: 'proof_of_address_type',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_name_like',
          observedValueLikeTextNearControl: '-- select -- Driver’s License Passport National ID',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          pageIndex: 3,
          ordinalOnPage: 16,
          tabLeft: 663.68,
          tabTop: 186.88,
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'proof_of_address_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const proofOfAddressTypeCases = plan.cases.filter((entry) => entry.concept === 'proof_of_address_type');

      expect(plan.skippedConcepts).toEqual([]);
      expect(proofOfAddressTypeCases.every((entry) => entry.targetField.fieldIndex === 17)).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.targetProfile.calibrationBackedSeed)).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.targetProfile.pageIndex === 1)).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.targetProfile.ordinalOnPage === 37)).toBe(true);
      expect(proofOfAddressTypeCases.every((entry) => entry.targetProfile.docusignTabType === 'List')).toBe(true);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('proof_of_address_type live resolver searches calibrated coordinates for a nearby list selector instead of trusting the text seed', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-proof-of-address-live-resolver-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: null,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.6800000000001,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 17,
          businessSection: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          pageIndex: 1,
          ordinalOnPage: 36,
          coordinates: '663.04,433.92',
          tabType: 'Text',
        }],
      }],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({
          index: 14,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_name_like',
          pageIndex: 1,
          ordinalOnPage: 33,
          tabLeft: 35.2,
          tabTop: 433.92,
        }),
        mockField({
          index: 17,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'phone',
          inferredClassification: 'manual_review',
          currentValueShape: 'phone',
          pageIndex: 1,
          ordinalOnPage: 36,
          tabLeft: 663.04,
          tabTop: 433.92,
        }),
        mockField({
          index: 19,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'empty',
          pageIndex: 1,
          ordinalOnPage: 38,
          tabLeft: 348.16,
          tabTop: 512.64,
        }),
        mockField({
          index: 76,
          kind: 'combobox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          docusignTabType: 'List',
          inferredType: 'proof_of_address_type',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_name_like',
          observedValueLikeTextNearControl: '-- select -- Driver’s License Passport National ID',
          helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
          pageIndex: 3,
          ordinalOnPage: 16,
          tabLeft: 663.68,
          tabTop: 186.88,
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'proof_of_address_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const testCase = plan.cases[0]!;
      const liveFields = [
        mockDiscoveredField({
          index: 17,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'phone',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 36,
          tabLeft: 663.04,
          tabTop: 433.92,
          currentValue: '+18039311286',
          currentValueShape: 'phone',
        }),
        mockDiscoveredField({
          index: 18,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 41,
          tabLeft: 663.68,
          tabTop: 512.64,
          currentValueShape: 'empty',
        }),
        mockDiscoveredField({
          index: 76,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
          inferredType: 'document_type',
          docusignTabType: 'List',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
          currentValueShape: 'empty',
        }),
      ];

      const resolved = resolveInteractiveTargetField(
        testCase,
        liveFields.find((entry) => entry.index === testCase.targetField.fieldIndex)!,
        liveFields,
      );

      expect(testCase.targetProfile).toMatchObject({
        calibrationBackedSeed: true,
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Proof of Address Type',
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 37,
        expectedDocusignFieldFamily: 'List',
        expectedCoordinates: {
          left: 663.6800000000001,
          top: 512.64,
        },
      });
      expect(testCase.cleanupStrategy).toBe('restore_original_value_then_blur');
      expect(testCase.safetyNotes).toContain('Does not exercise signature or completion flows.');
      expect(resolved.field.index).toBe(18);
      expect(resolved.field.docusignTabType).toBe('List');
      expect(resolved.selection.trusted).toBe(true);
      expect(resolved.selection.decisionReason).toBe('trusted_by_label');
      expect(resolved.resolutionTrace.calibrationBackedSeed).toBe(true);
      expect(resolved.resolutionTrace.expectedTarget).toMatchObject({
        layoutSectionHeader: 'Registered Legal Address',
        layoutFieldLabel: 'Proof of Address Type',
        pageIndex: 1,
        ordinalOnPage: 37,
        coordinates: {
          left: 663.6800000000001,
          top: 512.64,
        },
        docusignFieldFamily: 'List',
      });
      expect(resolved.resolutionTrace.seedField).toMatchObject({
        fieldIndex: 17,
        docusignTabType: 'Text',
      });
      expect(resolved.resolutionTrace.selectedCandidate).toMatchObject({
        fieldIndex: 18,
        docusignTabType: 'List',
        calibratedProofBacked: true,
      });
      expect(resolved.resolutionTrace.nearestListCompatibleCandidates[0]).toMatchObject({
        fieldIndex: 18,
        includedInCandidatePool: true,
      });

      const diagnostic = mockInteractiveTargetDiagnostics(testCase, {
        docusignTabType: 'Text',
        expectedDocusignTabType: 'List',
        pageIndex: 1,
        expectedPageIndex: 1,
        ordinalOnPage: 36,
        expectedOrdinalOnPage: 37,
        actualFieldSignature: 'id=seed; tag=input; type=text; tabType=Text',
        targetConfidence: 'mapping_not_confident',
        targetResolution: resolved.resolutionTrace,
      });
      const diagnosticsFile = buildInteractiveTargetDiagnosticsFile({
        schemaVersion: 1,
        runStartedAt: '2026-05-11T00:00:00.000Z',
        runFinishedAt: '2026-05-11T00:00:01.000Z',
        currentStep: null,
        guardState: { INTERACTIVE_VALIDATION: true, DISPOSABLE_ENVELOPE: true },
        sourceReport: {
          runStartedAt: '2026-05-11T00:00:00.000Z',
          runFinishedAt: '2026-05-11T00:00:01.000Z',
        },
        summary: { total: 1, passed: 0, failed: 0, warning: 0, manual_review: 0, skipped: 1 },
        outcomes: {
          passed: 0,
          product_failure: 0,
          tool_mapping_suspect: 0,
          error_ownership_suspect: 0,
          observer_ambiguous: 0,
          mapping_not_confident: 1,
        },
        targetConcepts: ['proof_of_address_type'],
        skippedConcepts: [],
        results: [{
          concept: 'proof_of_address_type',
          conceptDisplayName: 'Proof Of Address Type',
          fieldLabel: 'Proof Of Address Type',
          targetField: testCase.targetField,
          validationId: testCase.validationId,
          caseName: testCase.caseName,
          testName: testCase.testName,
          inputValue: testCase.inputValue,
          expectedBehavior: testCase.expectedBehavior,
          severity: testCase.severity,
          status: 'skipped',
          outcome: 'mapping_not_confident',
          reasonCode: 'target_mapping_not_trusted',
          observation: null,
          targetDiagnostics: diagnostic,
          evidence: 'target not trusted',
          interpretation: 'Synthetic target diagnostic test.',
          recommendation: 'Review target diagnostics.',
          cleanupStrategy: 'restore_original_value_then_blur',
          safetyNotes: testCase.safetyNotes,
          skippedReason: 'target not trusted',
        }],
      });

      expect(diagnosticsFile.rows[0]).toMatchObject({
        expectedDocusignTabType: 'List',
        expectedPageIndex: 1,
        expectedOrdinalOnPage: 37,
        actualFieldSignature: 'id=seed; tag=input; type=text; tabType=Text',
      });
      expect(diagnosticsFile.rows[0].targetResolution?.seedField.docusignTabType).toBe('Text');
      expect(diagnosticsFile.rows[0].targetResolution?.selectedCandidate?.docusignTabType).toBe('List');
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('proof_of_address_type live resolver does not let text seeds, file echoes, uploads, or stakeholder selectors satisfy the calibrated anchor', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-proof-of-address-live-rejections-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: null,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.6800000000001,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'none',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 17,
          businessSection: null,
          layoutSectionHeader: null,
          layoutFieldLabel: null,
          pageIndex: 1,
          ordinalOnPage: 36,
          coordinates: '663.04,433.92',
          tabType: 'Text',
        }],
      }],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({
          index: 14,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'text_name_like',
          pageIndex: 1,
          ordinalOnPage: 33,
          tabLeft: 35.2,
          tabTop: 433.92,
        }),
        mockField({
          index: 17,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'phone',
          inferredClassification: 'manual_review',
          currentValueShape: 'phone',
          enrichment: {
            jsonKeyPath: 'merchantData.proofOfAddressType',
            matchedBy: 'enrichment-position',
            confidence: 'high',
            suggestedDisplayName: 'Proof Of Address Type',
            suggestedBusinessSection: 'Attachments',
            layoutSectionHeader: 'Registered Legal Address',
            layoutFieldLabel: 'Proof of Address Type',
            layoutEvidenceSource: 'mapping-calibration',
            positionalFingerprint: 'page:1|Text|ord:34',
            expectedPageIndex: 1,
            expectedOrdinalOnPage: 34,
            expectedDocusignFieldFamily: 'Text',
            expectedTabLeft: 663.04,
            expectedTabTop: 433.92,
          },
          pageIndex: 1,
          ordinalOnPage: 36,
          tabLeft: 663.04,
          tabTop: 433.92,
        }),
        mockField({
          index: 19,
          kind: 'textbox',
          section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          inferredClassification: 'manual_review',
          currentValueShape: 'empty',
          pageIndex: 1,
          ordinalOnPage: 38,
          tabLeft: 348.16,
          tabTop: 512.64,
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'proof_of_address_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);
      const testCase = plan.cases[0]!;
      const liveFields = [
        mockDiscoveredField({
          index: 17,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'phone',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 36,
          tabLeft: 663.04,
          tabTop: 433.92,
          currentValue: '+18039311286',
          currentValueShape: 'phone',
        }),
        mockDiscoveredField({
          index: 18,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'Text',
          pageIndex: 1,
          ordinalOnPage: 41,
          tabLeft: 663.68,
          tabTop: 512.64,
          observedValueLikeTextNearControl: 'utility-bill.pdf',
          currentValueShape: 'text_name_like',
        }),
        mockDiscoveredField({
          index: 63,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 39,
          tabLeft: 350.08,
          tabTop: 544.64,
          currentValueShape: 'text_name_like',
        }),
        mockDiscoveredField({
          index: 95,
          sectionName: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
          inferredType: 'upload',
          docusignTabType: 'SignerAttachment',
          controlCategory: 'attachment_control',
          editable: false,
          pageIndex: 1,
          ordinalOnPage: 41,
          tabLeft: 663.68,
          tabTop: 512.64,
          currentValueShape: 'empty',
        }),
        mockDiscoveredField({
          index: 76,
          sectionName: 'Stakeholder',
          resolvedLabel: 'Document Type',
          inferredType: 'document_type',
          docusignTabType: 'List',
          pageIndex: 3,
          ordinalOnPage: 10,
          tabLeft: 37.12,
          tabTop: 186.88,
          currentValueShape: 'empty',
        }),
      ];

      const resolved = resolveInteractiveTargetField(
        testCase,
        liveFields.find((entry) => entry.index === testCase.targetField.fieldIndex)!,
        liveFields,
      );

      expect(resolved.field.index).toBe(17);
      expect(resolved.field.docusignTabType).toBe('Text');
      expect(resolved.selection.trusted).toBe(false);
      expect(resolved.selection.selectedCandidateId).toBe('3');
      expect(testCase.targetProfile.expectedCoordinates).toEqual({
        left: 663.6800000000001,
        top: 512.64,
      });
      expect(resolved.resolutionTrace.expectedTarget.docusignFieldFamily).toBe('List');
      expect(resolved.resolutionTrace.seedField.docusignTabType).toBe('Text');
      expect(resolved.resolutionTrace.nearestListCompatibleCandidates[0]).toMatchObject({
        fieldIndex: 63,
        docusignTabType: 'List',
        includedInCandidatePool: true,
        calibratedProofBacked: false,
      });
      expect(resolved.resolutionTrace.nearestTextCandidates[0]).toMatchObject({
        fieldIndex: 18,
        docusignTabType: 'Text',
        includedInCandidatePool: false,
        calibratedProofBacked: false,
      });
      expect(resolved.resolutionTrace.topCandidateAssessments[0]).toMatchObject({
        fieldIndex: 63,
        docusignTabType: 'List',
        conceptSpecificProofMatches: false,
      });
      expect(resolved.resolutionTrace.topCandidateAssessments[0]?.reasons).toContain(
        'missing Registered Legal Address Proof of Address Type layout proof',
      );
      expect(resolved.resolutionTrace.selectedCandidate).toMatchObject({
        fieldIndex: 17,
        docusignTabType: 'Text',
      });
      expect(testCase.safetyNotes).toContain('Does not exercise signature or completion flows.');
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
  });

  test('proof_of_address_type scorecard handoff does not let uploaded file echoes satisfy the calibrated selector', () => {
    const report = mockValidationReport([
      mockField({
        index: 37,
        kind: 'textbox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 1 of 4.',
        docusignTabType: 'Text',
        inferredType: 'unknown_manual_review',
        inferredClassification: 'manual_review',
        currentValueShape: 'text_name_like',
        observedValueLikeTextNearControl: 'utility-bill.pdf',
        pageIndex: 1,
        ordinalOnPage: 37,
        tabLeft: 663.68,
        tabTop: 512.64,
      }),
      mockField({
        index: 76,
        kind: 'combobox',
        section: 'Bead Onboarding Application US-02604-2.pdf Page 3 of 4.',
        resolvedLabel: 'Proof Of Address Type',
        label: 'Proof Of Address Type',
        labelSource: 'aria-label',
        labelConfidence: 'low',
        docusignTabType: 'List',
        inferredType: 'proof_of_address_type',
        inferredClassification: 'manual_review',
        currentValueShape: 'empty',
        helperText: 'Required - AttachmentRequired - Attachment - SignerAttachmentOptional',
        pageIndex: 3,
        ordinalOnPage: 10,
        tabLeft: 37.12,
        tabTop: 186.88,
      }),
    ]);

    const scorecard = buildValidationScorecard(report, null, {
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: 76,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.68,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'offline_layout_target_after_safe_mode_gap',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 76,
          businessSection: 'Attachments',
          layoutSectionHeader: 'Stakeholder',
          layoutFieldLabel: 'Proof of Address Type',
          pageIndex: 3,
          ordinalOnPage: 10,
          coordinates: '37.12,186.88',
          tabType: 'List',
        }],
      }],
    });

    const proofOfAddressTypeScore = scorecard.conceptScores.find((entry) => entry.key === 'proof_of_address_type')!;

    expect(proofOfAddressTypeScore.identifiedWithConfidence).toBe(true);
    expect(proofOfAddressTypeScore.mappedFields.some((field) => field.fieldIndex === 37)).toBe(false);
    expect(proofOfAddressTypeScore.mappedFields[0]).toMatchObject({
      fieldIndex: 101,
      identificationConfidence: 'high',
    });

    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-proof-of-address-file-echo-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        jsonKeyPath: 'merchantData.proofOfAddressType',
        currentCandidateFieldIndex: 76,
        selectedCandidate: '#101 Proof of Address Type Attachments p1 ord37 List shape=empty editable=editable layout=Registered Legal Address > Proof of Address Type @ 663.68,512.64',
        decision: 'trust_likely_better_candidate',
        calibrationReason: 'offline_layout_target_after_safe_mode_gap',
        mappingDecisionReason: 'trusted_by_label',
        missingProof: [],
        neighborWindow: [{
          fieldIndex: 76,
          businessSection: 'Attachments',
          layoutSectionHeader: 'Stakeholder',
          layoutFieldLabel: 'Proof of Address Type',
          pageIndex: 3,
          ordinalOnPage: 10,
          coordinates: '37.12,186.88',
          tabType: 'List',
        }],
      }],
    }), 'utf8');

    try {
      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'proof_of_address_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.cases).toEqual([]);
      expect(plan.skippedConcepts).toEqual([{
        concept: 'proof_of_address_type',
        conceptDisplayName: 'Proof Of Address Type',
        status: 'skipped',
        reason: 'field is not confidently mapped in the scorecard source report',
      }]);
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
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

  test('visible editable list targets stay available while protected controls remain unavailable', () => {
    expect(isAvailableInteractiveMerchantField(mockDiscoveredField({
      index: 61,
      kind: 'combobox',
      docusignTabType: 'List',
      controlCategory: 'merchant_input',
      visible: true,
      editable: true,
    }))).toBe(true);

    const unavailable = [
      mockDiscoveredField({ controlCategory: 'merchant_input', visible: false, editable: true }),
      mockDiscoveredField({ controlCategory: 'merchant_input', visible: true, editable: false }),
      mockDiscoveredField({ controlCategory: 'attachment_control', visible: true, editable: true }),
      mockDiscoveredField({ controlCategory: 'signature_widget', visible: true, editable: false }),
      mockDiscoveredField({ controlCategory: 'acknowledgement_checkbox', visible: true, editable: false }),
      mockDiscoveredField({ controlCategory: 'docusign_chrome', visible: true, editable: false, resolvedLabel: 'Complete' }),
    ];

    expect(unavailable.every((field) => !isAvailableInteractiveMerchantField(field))).toBe(true);
  });

  test('registered_state, proof_of_business_type, and federal_tax_id_type keep calibrated list targets on sparse live discovery indexes', () => {
    const calibrationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bead-live-target-availability-'));
    const calibrationPath = path.join(calibrationDir, 'latest-mapping-calibration.json');

    fs.writeFileSync(calibrationPath, JSON.stringify({
      schemaVersion: 1,
      rows: [
        {
          concept: 'registered_state',
          conceptDisplayName: 'Registered Legal Address State',
          jsonKeyPath: 'merchantData.registeredLegalAddress.state',
          currentCandidateFieldIndex: 64,
          selectedCandidate: '#64 Registered Legal Address State Address p1 ord42 List shape=text_name_like editable=editable layout=Registered Legal Address > State @ 350.08,544.64',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 64,
            businessSection: 'Address',
            layoutSectionHeader: 'Registered Legal Address',
            layoutFieldLabel: 'State',
            pageIndex: 1,
            ordinalOnPage: 42,
            coordinates: '350.08,544.64',
            tabType: 'List',
          }],
        },
        {
          concept: 'proof_of_business_type',
          conceptDisplayName: 'Proof Of Business Type',
          jsonKeyPath: 'merchantData.proofOfBusinessType',
          currentCandidateFieldIndex: 61,
          selectedCandidate: '#61 Proof of Business Type Attachments p1 ord8 List shape=text_name_like editable=editable layout=General > Proof of Business Type @ 663.68,256.64',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 61,
            businessSection: 'Attachments',
            layoutSectionHeader: 'General',
            layoutFieldLabel: 'Proof of Business Type',
            pageIndex: 1,
            ordinalOnPage: 8,
            coordinates: '663.68,256.64',
            tabType: 'List',
          }],
        },
        {
          concept: 'federal_tax_id_type',
          conceptDisplayName: 'Federal Tax ID Type',
          jsonKeyPath: 'merchantData.federalTaxIdType',
          currentCandidateFieldIndex: 62,
          selectedCandidate: '#62 Federal Tax ID Type Business Details p1 ord9 List shape=text_name_like editable=editable layout=General > Federal Tax ID Type @ 37.12,288.64',
          decision: 'trust_current_mapping',
          calibrationReason: 'none',
          mappingDecisionReason: 'trusted_by_label',
          missingProof: [],
          neighborWindow: [{
            fieldIndex: 62,
            businessSection: 'Business Details',
            layoutSectionHeader: 'General',
            layoutFieldLabel: 'Federal Tax ID Type',
            pageIndex: 1,
            ordinalOnPage: 9,
            coordinates: '37.12,288.64',
            tabType: 'List',
          }],
        },
      ],
    }), 'utf8');

    try {
      const report = mockValidationReport([
        mockField({
          index: 61,
          kind: 'combobox',
          inferredType: 'business_type',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 8,
          tabLeft: 663.68,
          tabTop: 256.64,
        }),
        mockField({
          index: 62,
          kind: 'combobox',
          inferredType: 'ein',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 9,
          tabLeft: 37.12,
          tabTop: 288.64,
        }),
        mockField({
          index: 64,
          kind: 'combobox',
          inferredType: 'unknown_manual_review',
          docusignTabType: 'List',
          pageIndex: 1,
          ordinalOnPage: 42,
          tabLeft: 350.08,
          tabTop: 544.64,
        }),
      ]);

      const plan = buildInteractiveValidationPlan(report, {
        INTERACTIVE_CONCEPTS: 'registered_state,proof_of_business_type,federal_tax_id_type',
        INTERACTIVE_MAPPING_CALIBRATION_PATH: calibrationPath,
      } as NodeJS.ProcessEnv);

      expect(plan.skippedConcepts).toEqual([]);
      expect(plan.cases.filter((entry) => entry.concept === 'registered_state').every((entry) => entry.targetField.fieldIndex === 64)).toBe(true);
      expect(plan.cases.filter((entry) => entry.concept === 'proof_of_business_type').every((entry) => entry.targetField.fieldIndex === 61)).toBe(true);
      expect(plan.cases.filter((entry) => entry.concept === 'federal_tax_id_type').every((entry) => entry.targetField.fieldIndex === 62)).toBe(true);

      const liveFields = [
        mockDiscoveredField({ index: 61, kind: 'combobox', inferredType: 'business_type', docusignTabType: 'List', pageIndex: 1, ordinalOnPage: 8, tabLeft: 663.68, tabTop: 256.64 }),
        mockDiscoveredField({ index: 62, kind: 'combobox', inferredType: 'ein', docusignTabType: 'List', pageIndex: 1, ordinalOnPage: 9, tabLeft: 37.12, tabTop: 288.64 }),
        mockDiscoveredField({ index: 64, kind: 'combobox', inferredType: 'unknown_manual_review', docusignTabType: 'List', pageIndex: 1, ordinalOnPage: 42, tabLeft: 350.08, tabTop: 544.64 }),
      ];

      for (const conceptKey of ['registered_state', 'proof_of_business_type', 'federal_tax_id_type'] as const) {
        const testCase = plan.cases.find((entry) => entry.concept === conceptKey)!;
        const liveField = findDiscoveredFieldByDiscoveryIndex(liveFields, testCase.targetField.fieldIndex);
        expect(liveField).not.toBeNull();
        expect(isAvailableInteractiveMerchantField(liveField)).toBe(true);
      }
    } finally {
      fs.rmSync(calibrationDir, { recursive: true, force: true });
    }
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
    expectedDocusignTabType: validationCase.targetProfile.expectedDocusignFieldFamily ?? validationCase.targetProfile.docusignTabType,
    pageIndex: validationCase.targetProfile.pageIndex,
    expectedPageIndex: validationCase.targetProfile.expectedPageIndex ?? validationCase.targetProfile.pageIndex,
    ordinalOnPage: validationCase.targetProfile.ordinalOnPage,
    expectedOrdinalOnPage: validationCase.targetProfile.expectedOrdinalOnPage ?? validationCase.targetProfile.ordinalOnPage,
    coordinates: {
      left: validationCase.targetProfile.coordinates.left,
      top: validationCase.targetProfile.coordinates.top,
      width: validationCase.targetProfile.coordinates.width,
      height: validationCase.targetProfile.coordinates.height,
    },
    expectedCoordinates: {
      left: validationCase.targetProfile.expectedCoordinates.left ?? validationCase.targetProfile.coordinates.left,
      top: validationCase.targetProfile.expectedCoordinates.top ?? validationCase.targetProfile.coordinates.top,
    },
    locatorStrategy: 'live-discovery-field-index:1',
    targetResolution: null,
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
