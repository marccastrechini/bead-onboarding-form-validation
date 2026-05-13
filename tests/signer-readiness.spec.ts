import { expect, test } from '@playwright/test';

import { resolveSigningFrame } from '../fixtures/signer-helpers';

test.describe('signer readiness', () => {
  test('resolveSigningFrame treats a delayed main-page screen-reader shell as a valid signer surface', async ({ page }) => {
    await page.route('**/Signing/EmailStart.aspx**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div aria-live="polite">Please wait while we prepare your document.</div>
              <script>
                setTimeout(() => {
                  document.body.innerHTML = '<a href="#">Press enter to use the screen reader mode</a>';
                }, 150);
              </script>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/Signing/EmailStart.aspx?t=redacted');

    const { diagnostic } = await resolveSigningFrame(page, 2_000);

    expect(diagnostic).toContain('main page');
    expect(diagnostic).not.toContain('FRAGILE fallback');
  });

  test('resolveSigningFrame treats a main-page business heading as a valid signer surface', async ({ page }) => {
    await page.route('**/Signing/Sign.aspx**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <h1>1. Business Details</h1>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/Signing/Sign.aspx?t=redacted');

    const { diagnostic } = await resolveSigningFrame(page, 1_000);

    expect(diagnostic).toContain('main page');
    expect(diagnostic).not.toContain('FRAGILE fallback');
  });
});