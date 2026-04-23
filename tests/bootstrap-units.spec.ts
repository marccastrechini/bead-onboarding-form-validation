/**
 * Narrow unit tests for the bootstrap pipeline.  These are pure-logic tests –
 * no browser, no network – but they live under tests/ so they run with the
 * existing `playwright test` runner.
 */

import { test, expect } from '@playwright/test';
import { buildResendUrl, normalizeResendMethod } from '../lib/bead-client';
import { buildSearchQuery, messageTargetsAddress, selectFreshestMessage } from '../lib/gmail-client';
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
