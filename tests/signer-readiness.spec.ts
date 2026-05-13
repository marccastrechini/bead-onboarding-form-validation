import { expect, test } from '@playwright/test';

import { openSigner, resolveSigningFrame, waitForSafeRedirectTransition } from '../fixtures/signer-helpers';

async function withSignerUrl<T>(url: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.DOCUSIGN_SIGNING_URL;
  process.env.DOCUSIGN_SIGNING_URL = url;

  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.DOCUSIGN_SIGNING_URL;
    } else {
      process.env.DOCUSIGN_SIGNING_URL = previous;
    }
  }
}

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

  test('waitForSafeRedirectTransition detects a delayed URL transition away from safe-redirect', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div>Preparing your document...</div>
              <script>
                setTimeout(() => {
                  location.replace('https://demo.docusign.test/Signing/Sign.aspx?t=redacted');
                }, 400);
              </script>
            </body>
          </html>
        `,
      });
    });

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

    await page.goto('https://demo.docusign.test/safe-redirect?t=redacted');

    const result = await waitForSafeRedirectTransition(page, 2_500);

    expect(result.signal).toBe('url-transition');
    expect(result.diagnostics).toContain('safe-redirect landing observed: https://demo.docusign.test/safe-redirect?[redacted]');
    expect(result.diagnostics).toContain('safe-redirect transition observed: url changed to https://demo.docusign.test/Signing/Sign.aspx?[redacted]');
  });

  test('waitForSafeRedirectTransition detects a delayed signing iframe on safe-redirect', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div>Preparing your document...</div>
              <script>
                setTimeout(() => {
                  const iframe = document.createElement('iframe');
                  iframe.id = 'signing-iframe';
                  iframe.src = 'https://demo.docusign.test/embedded/signing-frame';
                  document.body.appendChild(iframe);
                }, 400);
              </script>
            </body>
          </html>
        `,
      });
    });

    await page.route('**/embedded/signing-frame', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <input aria-label="Business Name" />
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=redacted');

    const result = await waitForSafeRedirectTransition(page, 2_500);

    expect(result.signal).toBe('signing-iframe');
    expect(result.diagnostics).toContain('safe-redirect landing observed: https://demo.docusign.test/safe-redirect?[redacted]');
    expect(result.diagnostics).toContain('safe-redirect transition observed: signing iframe appeared on https://demo.docusign.test/safe-redirect?[redacted]');
  });

  test('openSigner reports a clear redacted safe-redirect timeout instead of a fragile iframe fallback failure', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div>Preparing your document...</div>
            </body>
          </html>
        `,
      });
    });

    const error = await withSignerUrl(
      'https://demo.docusign.test/safe-redirect?t=SECRET',
      async () => openSigner(page).then(() => null, (failure) => failure as Error),
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign safe-redirect did not transition to a signer surface before frame resolution.');
    expect(error?.message).toContain('Current page: https://demo.docusign.test/safe-redirect?[redacted]');
    expect(error?.message).not.toContain('FRAGILE fallback');
    expect(error?.message).not.toContain('SECRET');
  });
});