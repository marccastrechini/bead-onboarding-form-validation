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
  test('waitForSafeRedirectTransition clicks a safe host-matching anchor without blocking on click-time navigation when navigation completes slowly', async ({ page }) => {
    await page.route('https://api.test.devs.beadpay.io/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div>Forwarding you to the Bead signing session.</div>
            </body>
          </html>
        `,
      });
    });

    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <a href="https://api.test.devs.beadpay.io/session/start?token=SECRET" onclick="event.preventDefault(); setTimeout(() => location.assign(this.href), 600);">Bead test destination</a>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=redacted');

    const result = await waitForSafeRedirectTransition(page, 2_500);

    expect(result.signal).toBe('url-transition');
    expect(result.diagnostics).toContain('safe-redirect landing observed: https://demo.docusign.test/safe-redirect?[redacted]');
    expect(result.diagnostics).toContain('safe-redirect external-site warning detected: title="You\'re being redirected to an external site" destination-host=api.test.devs.beadpay.io');
    expect(result.diagnostics).toContain('safe-redirect external-site control inventory: [{"kind":"link","label":"Bead test destination","navigationTarget":"https://api.test.devs.beadpay.io/session/start?[redacted]","targetHost":"api.test.devs.beadpay.io","matchesExpectedHost":true,"proceedStyle":false}]');
    expect(result.diagnostics).toContain('safe-redirect external-site warning clicked: link "Bead test destination" -> https://api.test.devs.beadpay.io/session/start?[redacted]');
    expect(result.diagnostics).toContain('safe-redirect transition observed: url changed to https://api.test.devs.beadpay.io/session/start?[redacted]');
    expect(result.diagnostics.join(' ')).not.toContain('SECRET');
  });

  test('waitForSafeRedirectTransition times out cleanly after clicking a safe host-matching anchor when no post-click transition appears', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <a href="https://api.test.devs.beadpay.io/session/start?token=SECRET" onclick="event.preventDefault(); return false;">Bead test destination</a>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 700).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign safe-redirect did not transition to a signer surface before frame resolution.');
    expect(error?.message).toContain('Current page: https://demo.docusign.test/safe-redirect?[redacted].');
    expect(error?.message).toContain('Page title: "You\'re being redirected to an external site".');
    expect(error?.message).toContain('Visible text fragments: ["You\'re being redirected to an external site","The external website you\'re being directed to is not part of the Docusign platform","https://api.test.devs.beadpay.io/session/start?[redacted]","Bead test destination"]');
    expect(error?.message).not.toContain('locator.click');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('t=SECRET');
  });

  test('waitForSafeRedirectTransition blocks a DocuSign external-site interstitial with a uniquely visible outbound candidate on the wrong host', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://unexpected.example.test/session/start?token=SECRET</p>
              <p>Contact test.user@example.com if this looks wrong.</p>
              <a href="https://unexpected.example.test/session/start?token=SECRET">Continue to website</a>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 2_500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(error?.message).toContain('Destination host did not match the expected Bead test host.');
    expect(error?.message).toContain('Observed destination host: unexpected.example.test.');
    expect(error?.message).toContain('Expected destination host: api.test.devs.beadpay.io.');
    expect(error?.message).toContain('Warning-page control inventory: [{"kind":"link","tagName":"a","role":"","label":"Continue to website","navigationTarget":"https://unexpected.example.test/session/start?[redacted]","targetHost":"unexpected.example.test","matchesExpectedHost":false,"proceedStyle":true}]');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('t=SECRET');
    expect(error?.message).not.toContain('test.user@example.com');
  });

  test('waitForSafeRedirectTransition blocks a DocuSign external-site interstitial with zero safe outbound candidates and inventories visible controls', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <a href="/safe-redirect/back">Back to previous page</a>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 2_500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(error?.message).toContain('No uniquely target-host-matching outbound warning-page candidate was found.');
    expect(error?.message).toContain('Observed destination host: api.test.devs.beadpay.io.');
    expect(error?.message).toContain('Warning-page control inventory: [{"kind":"link","tagName":"a","role":"","label":"Back to previous page","navigationTarget":"https://demo.docusign.test/safe-redirect/back","targetHost":"demo.docusign.test","matchesExpectedHost":false,"proceedStyle":false}]');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('t=SECRET');
  });

  test('waitForSafeRedirectTransition blocks a DocuSign external-site interstitial with multiple target-host-matching outbound candidates', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <a href="https://api.test.devs.beadpay.io/session/start?token=SECRET">Primary destination</a>
              <button data-url="https://api.test.devs.beadpay.io/session/fallback?token=SECRET">Alternative destination</button>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 2_500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(error?.message).toContain('Multiple target-host-matching outbound warning-page candidates were found, so the interstitial was treated as ambiguous.');
    expect(error?.message).toContain('"label":"Primary destination"');
    expect(error?.message).toContain('"label":"Alternative destination"');
    expect(error?.message).toContain('"matchesExpectedHost":true');
    expect(error?.message).not.toContain('token=SECRET');
  });

  test('waitForSafeRedirectTransition inventories onclick navigation candidates and blocks wrong-host targets safely', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <div role="button" aria-label="Open destination" onclick="window.location='https://unexpected.example.test/session/start?token=SECRET'">Open destination</div>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 2_500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(error?.message).toContain('Warning-page control inventory: [{"kind":"onclick","tagName":"div","role":"button","label":"Open destination","navigationTarget":"https://unexpected.example.test/session/start?[redacted]","targetHost":"unexpected.example.test","matchesExpectedHost":false,"proceedStyle":true}]');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('t=SECRET');
  });

  test('waitForSafeRedirectTransition blocks a DocuSign external-site interstitial with an unparseable outbound candidate target', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>You're being redirected to an external site</title>
            </head>
            <body>
              <h1>You're being redirected to an external site</h1>
              <p>The external website you're being directed to is not part of the Docusign platform</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <button data-url="http://[invalid">Broken destination</button>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 2_500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(error?.message).toContain('No uniquely target-host-matching outbound warning-page candidate was found.');
    expect(error?.message).toContain('"label":"Broken destination"');
    expect(error?.message).toContain('"navigationTarget":"http://[invalid"');
    expect(error?.message).toContain('"matchesExpectedHost":false');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('t=SECRET');
  });

  test('waitForSafeRedirectTransition does not act on a non-interstitial safe-redirect page', async ({ page }) => {
    await page.route('https://api.test.devs.beadpay.io/**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <body>
              <div>Unexpected navigation target.</div>
            </body>
          </html>
        `,
      });
    });

    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>Preparing your document</title>
            </head>
            <body>
              <p>Preparing your document...</p>
              <p>https://api.test.devs.beadpay.io/session/start?token=SECRET</p>
              <a href="https://api.test.devs.beadpay.io/session/start?token=SECRET">Continue to website</a>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=SECRET');

    const error = await waitForSafeRedirectTransition(page, 500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign safe-redirect did not transition to a signer surface before frame resolution.');
    expect(error?.message).not.toContain('DocuSign external-site warning did not pass guarded click-through checks.');
    expect(page.url()).toContain('/safe-redirect');
  });

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

    expect(['url-transition', 'business-details-shell']).toContain(result.signal);
    expect(result.diagnostics).toContain('safe-redirect landing observed: https://demo.docusign.test/safe-redirect?[redacted]');
    expect(result.diagnostics.some((diagnostic) =>
      diagnostic === 'safe-redirect transition observed: url changed to https://demo.docusign.test/Signing/Sign.aspx?[redacted]' ||
      diagnostic === 'safe-redirect transition observed: Business Details heading appeared on https://demo.docusign.test/Signing/Sign.aspx?[redacted]',
    )).toBe(true);
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

  test('waitForSafeRedirectTransition timeout includes sanitized title, text fragments, and iframe inventory', async ({ page }) => {
    await page.route('**/safe-redirect**', async (route) => {
      await route.fulfill({
        contentType: 'text/html',
        body: `
          <!doctype html>
          <html>
            <head>
              <title>DocuSign Redirect Waiting Room</title>
            </head>
            <body>
              <div>Preparing your document for secure review.</div>
              <div>Please wait while we redirect you to the signing ceremony.</div>
              <div>Tracking link https://demo.docusign.test/path?token=SECRET</div>
              <iframe id="marketing-shell" name="marketing" title="Marketing Shell" src="https://safe-shell.example.test/frame-one?token=SECRET#frag"></iframe>
              <iframe title="Secondary Helper" src="/frame-two?code=SECRET"></iframe>
            </body>
          </html>
        `,
      });
    });

    await page.goto('https://demo.docusign.test/safe-redirect?t=redacted');

    const error = await waitForSafeRedirectTransition(page, 500).then(
      () => null,
      (failure) => failure as Error,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('DocuSign safe-redirect did not transition to a signer surface before frame resolution.');
    expect(error?.message).toContain('Page title: "DocuSign Redirect Waiting Room".');
    expect(error?.message).toContain('Visible text fragments: ["Preparing your document for secure review.","Please wait while we redirect you to the signing ceremony.","Tracking link https://demo.docusign.test/path?[redacted]"]');
    expect(error?.message).toContain('Iframe inventory: [{"id":"marketing-shell","name":"marketing","title":"Marketing Shell","url":"https://safe-shell.example.test/frame-one?[redacted]#[redacted]"},{"id":"","name":"","title":"Secondary Helper","url":"https://demo.docusign.test/frame-two?[redacted]"}]');
    expect(error?.message).toContain('Observed signals: {"url-transition":false,"signing-iframe":false,"screen-reader-shell":false,"business-details-shell":false}.');
    expect(error?.message).not.toContain('token=SECRET');
    expect(error?.message).not.toContain('code=SECRET');
    expect(error?.message).not.toContain('t=redacted');
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
    expect(error?.message).toContain('Current page: https://demo.docusign.test/safe-redirect?[redacted].');
    expect(error?.message).toContain('Observed signals: {"url-transition":false,"signing-iframe":false,"screen-reader-shell":false,"business-details-shell":false}.');
    expect(error?.message).not.toContain('FRAGILE fallback');
    expect(error?.message).not.toContain('SECRET');
  });
});