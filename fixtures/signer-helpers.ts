/**
 * Shared helpers for the DocuSign signer tests.
 */

import { expect, test, type Page, type Frame, type FrameLocator, type Locator, type TestInfo } from '@playwright/test';

/**
 * A "frame host" covers both FrameLocator (iframe-embedded forms) and Page
 * (main-page-embedded forms, which is how modern DocuSign renders signing tabs).
 * Both Page and FrameLocator expose identical locator-composition methods so
 * downstream helpers work unchanged against either surface.
 */
export type FrameHost = Pick<Page, 'locator' | 'getByLabel' | 'getByRole' | 'getByText' | 'getByTestId'>;

/** Per-frame metadata gathered during signing-frame discovery. */
export type FrameDiagnostic = {
  name: string;
  url: string;
  iframeId: string;
  iframeTitle: string;
  hasBusinessDetails: boolean;
  excluded: boolean;
};

/**
 * Iframe id / name patterns that are known UI-chrome frames, not the signing
 * document.  Frames whose id OR name matches this pattern are excluded from
 * all scoring passes.
 */
const EXCLUDE_FRAME_RE = /comment|sidebar|auxiliary|notification|chat|toolbar|header|footer|panel/i;

type SignerGuardStage = 'after-goto' | 'after-start-click' | 'before-frame-resolution';

type ExpiredSignerLinkEvidence = {
  stage: SignerGuardStage;
  currentUrl: string;
  urlMatched: boolean;
  expiredTextVisible: boolean;
  sendNewLinkVisible: boolean;
  logInVisible: boolean;
};

function redactUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const search = parsed.search ? '?[redacted]' : '';
    const hash = parsed.hash ? '#[redacted]' : '';
    return `${parsed.origin}${parsed.pathname}${search}${hash}`;
  } catch {
    return rawUrl;
  }
}

async function isQuicklyVisible(locator: Locator, timeout = 500): Promise<boolean> {
  return locator.first().isVisible({ timeout }).catch(() => false);
}

async function hasNamedAction(page: Page, name: RegExp): Promise<boolean> {
  if (await isQuicklyVisible(page.getByRole('button', { name }), 400)) return true;
  if (await isQuicklyVisible(page.getByRole('link', { name }), 400)) return true;
  return false;
}

async function detectExpiredSignerLink(
  page: Page,
  stage: SignerGuardStage,
): Promise<ExpiredSignerLinkEvidence | null> {
  const currentUrl = page.url();
  const urlMatched = /\/Signing\/Error\.aspx/i.test(currentUrl);
  const expiredTextVisible = await isQuicklyVisible(
    page.getByText(/This link from your email has expired/i),
    500,
  );
  const sendNewLinkVisible = await hasNamedAction(page, /^Send New Link$/i);
  const logInVisible = await hasNamedAction(page, /^Log In$/i);

  if (!urlMatched && !expiredTextVisible && !(sendNewLinkVisible && logInVisible)) {
    return null;
  }

  return {
    stage,
    currentUrl,
    urlMatched,
    expiredTextVisible,
    sendNewLinkVisible,
    logInVisible,
  };
}

async function blockExpiredSignerRun(
  page: Page,
  testInfo: TestInfo | undefined,
  evidence: ExpiredSignerLinkEvidence,
): Promise<never> {
  const reason = 'DocuSign signing URL is expired or already consumed.';
  const context = {
    blocked: true,
    blockedReason: 'expired_or_consumed_signer_link',
    stage: evidence.stage,
    safeMode: process.env.DESTRUCTIVE_VALIDATION !== '1',
    currentUrl: redactUrl(evidence.currentUrl),
    signals: {
      urlMatched: evidence.urlMatched,
      expiredTextVisible: evidence.expiredTextVisible,
      sendNewLinkVisible: evidence.sendNewLinkVisible,
      logInVisible: evidence.logInVisible,
    },
    observedAt: new Date().toISOString(),
  };
  const description = `${reason} Blocked in ${evidence.stage}. Refresh DOCUSIGN_SIGNING_URL in .env.`;

  if (testInfo) {
    testInfo.annotations.push({ type: 'blocked', description });

    const screenshot = await page.screenshot({ fullPage: true }).catch(() => null);
    if (screenshot) {
      await testInfo.attach(`expired-link-${evidence.stage}.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }

    await testInfo.attach(`expired-link-${evidence.stage}.json`, {
      body: Buffer.from(JSON.stringify(context, null, 2)),
      contentType: 'application/json',
    });

    test.skip(true, description);
  }

  throw new Error(
    `${reason}\n` +
      `Blocked in ${evidence.stage}.\n` +
      `Current page: ${context.currentUrl}\n` +
      'Refresh DOCUSIGN_SIGNING_URL in .env.',
  );
}

async function guardSignerSession(
  page: Page,
  testInfo: TestInfo | undefined,
  stage: SignerGuardStage,
): Promise<void> {
  const evidence = await detectExpiredSignerLink(page, stage);
  if (evidence) {
    await blockExpiredSignerRun(page, testInfo, evidence);
  }
}

export function hasSignerUrl(): boolean {
  return Boolean(process.env.DOCUSIGN_SIGNING_URL?.trim());
}

/**
 * Read the signer URL from the environment.  Throws a readable error if
 * missing so the test fails with a clear reason.
 */
export function getSignerUrl(): string {
  const url = process.env.DOCUSIGN_SIGNING_URL ?? '';
  if (!url) {
    throw new Error(
      'DOCUSIGN_SIGNING_URL is not set.\n' +
        'Copy .env.example → .env and paste a fresh signer URL.',
    );
  }
  return url;
}

/**
 * Resolve the DocuSign signing iframe (or main page) at runtime.
 *
 * Strategy:
 *   Enumerate every Playwright frame including the main page.  Score each
 *   candidate using Playwright's CDP-based ARIA-aware APIs which work
 *   cross-origin AND handle non-standard input types and custom role
 *   elements (e.g. <div role="textbox">) that CSS type-selectors miss:
 *
 *     textboxCount × 5  – getByRole('textbox').count() in that frame
 *     comboboxCount × 2 – getByRole('combobox').count() in that frame
 *     + 100  – (non-main only) frame URL contains "signing" or "docusign"
 *     + 80   – (non-main only) iframe element id/title/name matches keyword
 *     + 150  – DocuSign accessibility link visible ("Press enter to use…")
 *     + 200  – "1. Business Details" heading visible (fill-mode only)
 *
 *   The highest-scoring candidate wins and is returned directly as a
 *   FrameHost (Page, Frame, or FrameLocator – all satisfy the interface).
 *   Frames whose id/name match EXCLUDE_FRAME_RE are skipped.
 *
 *   FRAGILE :is() fallback used only when the loop exhausts its timeout.
 */
export async function resolveSigningFrame(
  page: Page,
  timeoutMs = 20_000,
): Promise<{ frame: FrameHost; diagnostic: string; frameDiagnostics: FrameDiagnostic[] }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const frameDiagnostics: FrameDiagnostic[] = [];

    type ScoredCandidate = {
      host: FrameHost;
      isMain: boolean;
      iframeId: string;
      iframeTitle: string;
      name: string;
      url: string;
      score: number;
      textboxCount: number;
    };
    const scored: ScoredCandidate[] = [];

    // Build candidate list: all sub-frames first, then main page as a
    // fallback candidate (scored without URL/attribute bonuses).
    type FrameCandidate = {
      host: FrameHost;
      isMain: boolean;
      name: string;
      url: string;
      frame: Frame | null;
    };
    const subFrames: Frame[] = page.frames().filter(f => f !== page.mainFrame());
    const allCandidates: FrameCandidate[] = [
      ...subFrames.map(f => ({ host: f as unknown as FrameHost, isMain: false, name: f.name(), url: f.url(), frame: f })),
      { host: page as unknown as FrameHost, isMain: true, name: '(main)', url: page.url(), frame: null },
    ];

    for (const cand of allCandidates) {
      let iframeId = '';
      let iframeTitle = '';

      if (!cand.isMain) {
        try {
          if (cand.frame) {
            const el = await cand.frame.frameElement();
            iframeId = (await el.getAttribute('id')) ?? '';
            iframeTitle = (await el.getAttribute('title')) ?? '';
          }
        } catch {
          /* detached – skip */
        }

        const excluded =
          EXCLUDE_FRAME_RE.test(iframeId) || EXCLUDE_FRAME_RE.test(cand.name);

        frameDiagnostics.push({
          name: cand.name,
          url: redactUrl(cand.url),
          iframeId,
          iframeTitle,
          hasBusinessDetails: false,
          excluded,
        });

        if (excluded) continue;
      }

      // ARIA-aware role counting with includeHidden:true so that DocuSign's
      // disabled/CSS-hidden form fields (shown in review mode as read-only
      // overlays but kept in the DOM with visibility:hidden) are still counted.
      const textboxCount = await cand.host.getByRole('textbox', { includeHidden: true }).count().catch(() => 0);
      const comboboxCount = await cand.host.getByRole('combobox', { includeHidden: true }).count().catch(() => 0);

      // Diagnostic: log every candidate (first iteration only to avoid noise).
      if (Date.now() - (deadline - timeoutMs) < 1_500) {
        console.log(
          `[frame-scan] ${cand.isMain ? 'MAIN' : 'sub'} name="${cand.name}" ` +
          `textboxes=${textboxCount} comboboxes=${comboboxCount} url=${redactUrl(cand.url)}`,
        );
      }

      const hasSigningLink = await cand.host
        .getByText('Press enter to use the screen reader')
        .first()
        .isVisible({ timeout: 300 })
        .catch(() => false);

      const hasBusinessDetails = await cand.host
        .getByText('1. Business Details')
        .first()
        .isVisible({ timeout: 200 })
        .catch(() => false);

      if (!cand.isMain) {
        // Update the last pushed frameDiagnostic with the content signals.
        const last = frameDiagnostics[frameDiagnostics.length - 1];
        if (last) last.hasBusinessDetails = hasBusinessDetails;
      }

      let score = 0;
      if (!cand.isMain) {
        if (/signing|docusign/i.test(cand.url)) score += 100;
        if (/signing|tacticframe|docusign/i.test(`${iframeId} ${iframeTitle} ${cand.name}`)) score += 80;
        if (hasSigningLink) score += 150;
        if (hasBusinessDetails) score += 200;
      }
      score += textboxCount * 5;
      score += comboboxCount * 2;

      if (score > 0) {
        scored.push({
          host: cand.host,
          isMain: cand.isMain,
          iframeId,
          iframeTitle,
          name: cand.name,
          url: cand.url,
          score,
          textboxCount,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best = scored[0];
      const tag = best.isMain
        ? 'main page'
        : `iframe id="${best.iframeId}" name="${best.name}"`;
      return {
        frame: best.host,
        diagnostic:
          `signing frame resolved – ${tag}` +
          ` (score=${best.score}, textboxes=${best.textboxCount})`,
        frameDiagnostics,
      };
    }

    await page.waitForTimeout(500);
  }

  // FRAGILE fallback – inspect the signing iframe in DevTools to harden.
  const fallback =
    'iframe:is([id*="signing"], [id*="tactic"], [title*="DocuSign"], [title*="Signing"], [name*="signing"], [src*="docusign"])';
  return {
    frame: page.frameLocator(fallback) as unknown as FrameHost,
    diagnostic: `FRAGILE fallback iframe selector in use – inspect in DevTools: ${fallback}`,
    frameDiagnostics: [],
  };
}

function escapeAttr(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Legacy non-diagnostic helper kept for callers that don't care about the
 * diagnostic string.
 */
export function signingFrame(page: Page): FrameLocator {
  return page.frameLocator(
    'iframe:is([id*="signing"], [id*="tactic"], [title*="DocuSign"], [name*="signing"], [src*="docusign"])',
  );
}

/**
 * Click a locator only if it becomes visible within the timeout.
 */
export async function clickIfPresent(locator: Locator, timeout = 8_000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

/**
 * Broader Start/Continue detection.  Tries role=button, then role=link, then
 * data-qa / data-testid / aria-label attribute match.  Returns a label of
 * the strategy that succeeded (or 'none') so the spec can record it.
 */
export async function clickStartIfPresent(page: Page, timeout = 8_000): Promise<string> {
  const patternRe = /^(start|start\s*signing|continue|begin|go|get\s*started|next)$/i;

  const strategies: Array<{ label: string; locator: Locator }> = [
    { label: 'role=button', locator: page.getByRole('button', { name: patternRe }) },
    { label: 'role=link', locator: page.getByRole('link', { name: patternRe }) },
    {
      label: 'data-qa|testid|aria-label',
      locator: page.locator(
        '[data-qa*="start" i], [data-testid*="start" i], [aria-label*="start" i]',
      ),
    },
  ];

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    for (const s of strategies) {
      const candidate = s.locator.first();
      try {
        if (await candidate.isVisible({ timeout: 250 })) {
          await candidate.click({ timeout: 1_000 });
          return s.label;
        }
      } catch {
        // Keep polling until the overall timeout expires.
      }
    }

    await page.waitForTimeout(250);
  }

  return 'none';
}

async function handleDisclosureIfPresent(
  page: Page,
  phase: 'after-goto' | 'after-start-click',
  timeout = 10_000,
): Promise<string[]> {
  const diagnostics: string[] = [];
  const prefix = `disclosure ${phase}`;
  const heading = page.getByText(/Electronic Record and Signature Disclosure/i).first();
  const disclosureText = page.getByText(/I agree to use electronic records and signatures/i).first();
  const consentCheckbox = page
    .getByRole('checkbox', { name: /I agree to use electronic records and signatures/i })
    .first();
  const continueButton = page.getByRole('button', { name: /^Continue$/i }).first();

  const detected =
    await isQuicklyVisible(heading, 750) ||
    await isQuicklyVisible(disclosureText, 750);

  diagnostics.push(`${prefix} detected: ${detected ? 'yes' : 'no'}`);
  if (!detected) return diagnostics;

  let checkboxChecked = false;
  let continueClicked = false;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (!checkboxChecked && await isQuicklyVisible(consentCheckbox, 250)) {
      const alreadyChecked = await consentCheckbox.isChecked().catch(() => false);
      if (!alreadyChecked) {
        await consentCheckbox.check({ timeout: 2_000, force: true });
      }
      checkboxChecked = true;
      diagnostics.push(`${prefix} checkbox checked: yes`);
    }

    if (await isQuicklyVisible(continueButton, 250)) {
      const enabled = await continueButton.isEnabled().catch(() => false);
      if (enabled) {
        await continueButton.click({ timeout: 2_000 });
        continueClicked = true;
        diagnostics.push(`${prefix} Continue clicked: yes`);
        break;
      }
    }

    await page.waitForTimeout(250);
  }

  if (!checkboxChecked) {
    diagnostics.push(`${prefix} checkbox checked: no`);
  }
  if (!continueClicked) {
    diagnostics.push(`${prefix} Continue clicked: no`);
    return diagnostics;
  }

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 15_000 });
  } catch {
    /* continue below – modal dismissal can settle without navigation */
  }

  let settled = false;
  try {
    await continueButton.waitFor({ state: 'hidden', timeout: 10_000 });
    settled = true;
  } catch {
    try {
      await heading.waitFor({ state: 'hidden', timeout: 2_000 });
      settled = true;
    } catch {
      /* fall through to diagnostic */
    }
  }

  diagnostics.push(
    settled
      ? `${prefix} post-continue surface settled`
      : `${prefix} post-continue settle wait timed out (proceeding)`,
  );

  return diagnostics;
}

/**
 * Full "open the signer session" flow.  Returns the resolved FrameHost plus
 * diagnostics so the specs can surface them in the report.
 */
export async function openSigner(
  page: Page,
  testInfo?: TestInfo,
): Promise<{ frame: FrameHost; diagnostics: string[] }> {
  const diagnostics: string[] = [];

  await page.goto(getSignerUrl(), { waitUntil: 'domcontentloaded' });
  await guardSignerSession(page, testInfo, 'after-goto');

  const landingUrl = page.url();
  diagnostics.push(`landed on: ${redactUrl(landingUrl)}`);

  diagnostics.push(...await handleDisclosureIfPresent(page, 'after-goto'));

  // The initial disclosure/start surface can render a few seconds after the
  // auth redirect settles, so poll for one safe entry control before falling
  // through to frame discovery.
  const startStrategy = await clickStartIfPresent(page, 10_000);
  diagnostics.push(`start-button strategy: ${startStrategy}`);

  // Clicking Start triggers a page navigation to the signing page (Sign.aspx).
  // Wait for that page to reach domcontentloaded before scanning for iframes.
  if (startStrategy !== 'none') {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 20_000 });
      diagnostics.push('post-start navigation settled');
    } catch {
      diagnostics.push('post-start navigation wait timed out (proceeding)');
    }

    await guardSignerSession(page, testInfo, 'after-start-click');
  }

  diagnostics.push(...await handleDisclosureIfPresent(page, 'after-start-click'));

  await guardSignerSession(page, testInfo, 'before-frame-resolution');

  const { frame, diagnostic, frameDiagnostics } = await resolveSigningFrame(page);
  diagnostics.push(diagnostic);

  // Emit one diagnostic line per discovered frame so the HTML report shows
  // the full frame inventory for debugging.
  for (const fd of frameDiagnostics) {
    const flag = fd.excluded ? ' [EXCLUDED]' : fd.hasBusinessDetails ? ' [MATCH]' : '';
    diagnostics.push(
      `frame-scan: id="${fd.iframeId}" name="${fd.name}" title="${fd.iframeTitle}" url="${fd.url}"${flag}`,
    );
  }

  // Readiness gate: wait for at least one enabled (not disabled) form control
  // to be visible.  We use a CSS selector here because enabled controls ARE
  // visible in the signing form regardless of the mode (fill vs review).
  await expect(
    frame.locator('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])').first(),
  ).toBeVisible({ timeout: 20_000 });
  diagnostics.push('signer-form readiness: first enabled input/select/textarea is visible');

  return { frame, diagnostics };
}
