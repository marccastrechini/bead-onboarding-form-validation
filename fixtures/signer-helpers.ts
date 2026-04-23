/**
 * Shared helpers for the DocuSign signer tests.
 */

import { expect, type Page, type Frame, type FrameLocator, type Locator } from '@playwright/test';

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
          url: cand.url.slice(0, 120),
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
          `textboxes=${textboxCount} comboboxes=${comboboxCount} url=${cand.url.slice(0, 100)}`,
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

/**
 * Full "open the signer session" flow.  Returns the resolved FrameLocator
 * plus diagnostics so the discovery spec can surface them in the report.
 */
export async function openSigner(page: Page): Promise<{ frame: FrameHost; diagnostics: string[] }> {
  const diagnostics: string[] = [];

  await page.goto(getSignerUrl(), { waitUntil: 'domcontentloaded' });

  // Fast-fail: DocuSign redirects expired or already-used signing URLs to
  // Error.aspx.  Detect this early so the test fails with a clear message
  // rather than timing out after 20s of frame scanning.
  const landingUrl = page.url();
  if (/Error\.aspx/i.test(landingUrl)) {
    throw new Error(
      'DocuSign signing URL is expired or already consumed.\n' +
      `Error page: ${landingUrl}\n` +
      'Generate a new signing URL and update DOCUSIGN_SIGNING_URL in .env.',
    );
  }
  diagnostics.push(`landed on: ${landingUrl.slice(0, 120)}`);

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
  }

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
