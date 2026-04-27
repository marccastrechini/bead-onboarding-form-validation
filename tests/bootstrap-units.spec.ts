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
  skippedConceptToResult,
  type InteractiveValidationResultsFile,
} from '../fixtures/interactive-validation';
import { buildSearchQuery, messageTargetsAddress, selectFreshestMessage, selectMailboxMessage } from '../lib/gmail-client';
import { loadEnrichment } from '../lib/enrichment-loader';
import {
  findDirectDocusignUrls,
  findCandidateRedirectUrls,
  extractSigningUrl,
} from '../lib/link-extractor';
import { redactUrl } from '../lib/url-sanitize';

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
});

test.describe('interactive validation safety', () => {
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
        source: 'field-wrapper-error',
        text: 'Required | AttachmentRequired | Attachment | SignerAttachmentOptional',
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
        source: 'field-wrapper-error',
        text: 'Merchant Category Code must be exactly 4 digits | Required | AttachmentRequired | Attachment | SignerAttachmentOptional',
      },
    ], {
      ariaInvalid: 'true',
      inputValue: 'ABCD',
      observedValue: 'ABCD',
    });

    expect(diagnostics.fieldLocalTexts).toContain('Merchant Category Code must be exactly 4 digits');
    expect(diagnostics.docusignLocalTexts).toContain('Merchant Category Code must be exactly 4 digits');
    expect(diagnostics.fieldLocalTexts).not.toContain('AttachmentRequired');
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

function mockInteractiveResults(
  result: Pick<InteractiveValidationResultsFile['results'][number],
    'concept' | 'conceptDisplayName' | 'fieldLabel' | 'validationId' | 'caseName' | 'testName' | 'status' | 'evidence'>,
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
      observation: {
        ariaInvalid: null,
        validationMessage: null,
        nearbyErrorText: null,
        docusignValidationText: [],
        observedValue: 'qa.signerexample.com',
        normalizedOrReformatted: false,
        inputPrevented: false,
      },
      recommendation: 'Block this value or show a validation error on blur.',
      cleanupStrategy: 'restore_original_value_then_blur',
      safetyNotes: ['Uses disposable test input values.'],
    }],
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
