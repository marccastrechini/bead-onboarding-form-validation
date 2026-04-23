/**
 * Bead Onboarding – DocuSign Signer Smoke Test
 *
 * Validates the live interactive Bead onboarding form rendered inside the
 * DocuSign signing experience.  The system under test is the browser signing
 * flow, not the downloaded PDF.
 *
 * Signer URL is read from DOCUSIGN_SIGNING_URL in your local .env file.
 * Never commit a real signer URL – they are single-use tokens.
 */

import { test, expect, type Locator } from '@playwright/test';
import { hasSignerUrl, openSigner, type FrameHost } from '../fixtures/signer-helpers';

// Candidate labels for the first Business Details field, in order of
// likelihood.  Each is tried in turn; the first visible match wins.  This
// is strictly better than getByRole('textbox').first() because it uses a
// user-facing label when one is present, and it falls back safely when not.
const BUSINESS_NAME_LABEL_CANDIDATES = [
  /^legal\s*business\s*name$/i,
  /^business\s*name$/i,
  /^company\s*name$/i,
  /^entity\s*name$/i,
  /^dba\b/i,
];

const EDITABLE_FIELD_FALLBACK_SELECTORS = [
  'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
];

async function firstVisibleEditable(locator: Locator, maxScan = 20): Promise<Locator | null> {
  const count = Math.min(await locator.count().catch(() => 0), maxScan);
  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    if (
      await candidate.isVisible().catch(() => false) &&
      await candidate.isEditable().catch(() => false)
    ) {
      return candidate;
    }
  }
  return null;
}

async function resolveFirstBusinessField(frame: FrameHost): Promise<{ locator: Locator; strategy: string }> {
  for (const re of BUSINESS_NAME_LABEL_CANDIDATES) {
    const cand = frame.getByLabel(re).first();
    if (
      await cand.isVisible().catch(() => false) &&
      await cand.isEditable().catch(() => false)
    ) {
      return { locator: cand, strategy: `getByLabel(${re})` };
    }
  }

  for (const selector of EDITABLE_FIELD_FALLBACK_SELECTORS) {
    const candidate = await firstVisibleEditable(frame.locator(selector));
    if (candidate) {
      return { locator: candidate, strategy: `locator(${selector}) first visible editable [FRAGILE]` };
    }
  }

  return {
    locator: frame.locator('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])').first(),
    strategy: 'locator(first enabled native control) [FRAGILE]',
  };
}

test.describe('Bead Onboarding – Signer Smoke', () => {
  test('signing experience loads and Business Details is visible and editable', async ({ page }, testInfo) => {
    test.skip(!hasSignerUrl(), 'DOCUSIGN_SIGNING_URL is not set; skipping live signer smoke in safe mode.');

    const { frame, diagnostics } = await openSigner(page, testInfo);
    for (const d of diagnostics) testInfo.annotations.push({ type: 'diagnostic', description: d });

    const { locator, strategy } = await resolveFirstBusinessField(frame);
    testInfo.annotations.push({ type: 'first-field-strategy', description: strategy });

    await expect(locator).toBeVisible();
    await expect(locator).toBeEditable();
    await locator.scrollIntoViewIfNeeded();
    await locator.click();
    await expect(locator).toBeFocused();
  });

  // -------------------------------------------------------------------------
  // TODO: Required-field validation
  //
  // Confirm the exact field label and error message text in the live session
  // before uncommenting.
  //
  // test('Business Name shows inline error when left blank', async ({ page }) => {
  //   await page.goto(signerUrl, { waitUntil: 'domcontentloaded' });
  //   await clickIfPresent(page.getByRole('button', { name: /^(start|continue)$/i }));
  //   const frame = signingFrame(page);
  //   const field = frame.getByLabel('Legal Business Name'); // confirm label
  //   await field.focus();
  //   await field.blur();
  //   await expect(frame.getByText(/this field is required/i)).toBeVisible();
  // });

  // -------------------------------------------------------------------------
  // TODO: Masked-field validation (EIN / SSN)
  //
  // Confirm field label and expected mask pattern before uncommenting.
  //
  // test('EIN field displays masked value after entry', async ({ page }) => {
  //   await page.goto(signerUrl, { waitUntil: 'domcontentloaded' });
  //   await clickIfPresent(page.getByRole('button', { name: /^(start|continue)$/i }));
  //   const frame = signingFrame(page);
  //   const einField = frame.getByLabel('EIN'); // confirm label
  //   await einField.fill('12-3456789');
  //   await einField.blur();
  //   await expect(einField).toHaveValue(/\*+/); // stored value must not leak into DOM
  // });

  // -------------------------------------------------------------------------
  // TODO: Acknowledgement checkbox
  //
  // Confirm checkbox label text before uncommenting.
  //
  // test('acknowledgement checkbox can be checked', async ({ page }) => {
  //   await page.goto(signerUrl, { waitUntil: 'domcontentloaded' });
  //   await clickIfPresent(page.getByRole('button', { name: /^(start|continue)$/i }));
  //   const frame = signingFrame(page);
  //   const ack = frame.getByRole('checkbox', { name: /i acknowledge/i }); // confirm label
  //   await expect(ack).not.toBeChecked();
  //   await ack.check();
  //   await expect(ack).toBeChecked();
  // });

  // -------------------------------------------------------------------------
  // TODO: Tooltip / help text
  //
  // Confirm help icon role and tooltip text before uncommenting.
  //
  // test('help icon shows tooltip text on hover', async ({ page }) => {
  //   await page.goto(signerUrl, { waitUntil: 'domcontentloaded' });
  //   await clickIfPresent(page.getByRole('button', { name: /^(start|continue)$/i }));
  //   const frame = signingFrame(page);
  //   await frame.getByRole('button', { name: /help|info|\?/i }).first().hover();
  //   await expect(frame.getByRole('tooltip')).toBeVisible();
  // });

  // -------------------------------------------------------------------------
  // TODO: File upload
  //
  // Add a sample PDF to fixtures/ and confirm the upload input selector
  // before uncommenting.
  //
  // test('file upload field accepts a PDF attachment', async ({ page }) => {
  //   await page.goto(signerUrl, { waitUntil: 'domcontentloaded' });
  //   await clickIfPresent(page.getByRole('button', { name: /^(start|continue)$/i }));
  //   const frame = signingFrame(page);
  //   // FRAGILE: input[type="file"] – confirm selector; DocuSign may hide the
  //   // native input and use a custom upload trigger button instead.
  //   const uploadInput = frame.locator('input[type="file"]');
  //   await uploadInput.setInputFiles('fixtures/sample.pdf');
  //   await expect(frame.getByText(/uploaded successfully/i)).toBeVisible();
  // });
});
