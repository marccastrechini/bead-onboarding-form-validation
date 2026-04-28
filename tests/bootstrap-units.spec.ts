/**
 * Narrow unit tests for the bootstrap pipeline.  These are pure-logic tests –
 * no browser, no network – but they live under tests/ so they run with the
 * existing `playwright test` runner.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildResendUrl, normalizeResendMethod } from '../lib/bead-client';
import { ReportBuilder } from '../fixtures/validation-report';
import type { FieldRecord, ValidationReport } from '../fixtures/validation-report';
import { FIELD_CONCEPT_REGISTRY } from '../fixtures/field-concepts';
import {
  buildValidationScorecard,
  renderScorecardMarkdown,
  writeScorecardArtifacts,
} from '../fixtures/validation-scorecard';
import {
  assertInteractiveValidationGuards,
  buildInteractiveValidationPlan,
  extractFieldLocalValidationDiagnostics,
  INTERACTIVE_TARGET_CONCEPTS,
  resolveInteractiveTargetConcepts,
  skippedConceptToResult,
  type InteractiveResultOutcome,
  type InteractiveResultStatus,
  type InteractiveTargetConfidence,
  type InteractiveValidationResultsFile,
} from '../fixtures/interactive-validation';
import { buildSearchQuery, messageTargetsAddress, selectFreshestMessage, selectMailboxMessage } from '../lib/gmail-client';
import { loadEnrichment } from '../lib/enrichment-loader';
import {
  findDirectDocusignUrls,
  findCandidateRedirectUrls,
  extractSigningUrl,
} from '../lib/link-extractor';
import {
  detectValueShape,
  expectedValueShapesForConcept,
  resolveMappingClaims,
  selectBestMappingCandidate,
} from '../lib/mapping-calibration';
import {
  isRedactedSampleValue,
  normalizeSampleApplication,
  resolveSampleInputs,
} from '../lib/sample-inputs';
import { buildSourceFieldInventory } from '../lib/sample-alignment';
import { buildSampleIngestionReview } from '../lib/sample-ingestion';
import { redactUrl } from '../lib/url-sanitize';
import {
  buildValidationFindingsReport,
  writeValidationFindingsArtifacts,
} from '../scripts/generate-validation-findings';

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

test.describe('field validation scorecard', () => {
  test('concept registry includes required concepts and validation expectations', () => {
    for (const key of ['business_name', 'date_of_birth', 'phone', 'ein', 'email', 'routing_number', 'signature'] as const) {
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

  test('INTERACTIVE_CONCEPTS filters the interactive target set', () => {
    expect(resolveInteractiveTargetConcepts({
      INTERACTIVE_CONCEPTS: 'website,email,phone,bank_name,date_of_birth',
    } as NodeJS.ProcessEnv)).toEqual([
      'website',
      'email',
      'phone',
      'bank_name',
      'date_of_birth',
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
}): InteractiveValidationResultsFile['results'][number] {
  return {
    concept: input.concept,
    conceptDisplayName: input.conceptDisplayName,
    fieldLabel: input.conceptDisplayName,
    validationId: input.validationId,
    caseName: input.validationId,
    testName: input.testName,
    status: input.status,
    outcome: input.outcome,
    evidence: `${input.testName} evidence`,
    targetField: {
      primary: 'live-discovery-field-index',
      fieldIndex: 1,
      displayName: input.conceptDisplayName,
      inferredType: input.concept,
      confidence: 'high',
      fallback: 'skip-if-field-does-not-resolve-visible-editable-merchant-input',
    },
    inputValue: 'synthetic-value',
    expectedBehavior: 'Synthetic expected behavior.',
    severity: 'major',
    reasonCode: interactiveReasonCodeFor(input.outcome),
    observation: {
      ariaInvalid: null,
      validationMessage: null,
      nearbyErrorText: null,
      docusignValidationText: [],
      invalidIndicators: [],
      ignoredDiagnostics: [],
      ownershipSuspectText: [],
      evidenceItems: [],
      observedValue: 'synthetic-value',
      normalizedOrReformatted: false,
      inputPrevented: false,
    },
    targetDiagnostics: {
      targetConfidence: input.targetConfidence,
      mappingDecisionReason: input.mappingDecisionReason ?? (input.targetConfidence === 'trusted' ? 'trusted_by_value_shape' : 'not_trusted_by_value_shape'),
      mappingShiftReason: input.mappingShiftReason ?? null,
      activeCandidate: null,
      selectedCandidate: null,
      neighborCandidates: [],
    } as InteractiveValidationResultsFile['results'][number]['targetDiagnostics'],
    interpretation: `Synthetic ${input.outcome} interpretation.`,
    recommendation: 'Review the observed behavior.',
    cleanupStrategy: 'restore_original_value_then_blur',
    safetyNotes: ['Synthetic offline fixture.'],
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
        decision: concept === 'bank_name' ? 'trust_likely_better_candidate' : 'trust_current_mapping',
        calibrationReason: concept === 'bank_name' ? 'page1_anchor_drift_after_website' : 'none',
        mappingDecisionReason: concept === 'bank_name' ? 'rejected_value_shape_mismatch' : 'trusted_by_value_shape',
      })),
    },
    generatedAt: '2026-04-27T00:00:02.000Z',
  } as Parameters<typeof buildValidationFindingsReport>[0];
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
