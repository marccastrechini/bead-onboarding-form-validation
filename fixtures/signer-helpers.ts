/**
 * Shared helpers for the DocuSign signer tests.
 */

import { expect, type Page, type FrameLocator, type Locator } from '@playwright/test';

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
 * Resolve the DocuSign signing iframe at runtime.
 *
 * Strategy:
 *   1. Enumerate every iframe in the page.
 *   2. Score each by name/id/title/src match against known DocuSign patterns
 *      (ids `tacticframe`, `ds-signing-iframe`, `signing-frame`, titles
 *      containing "DocuSign", src containing "docusign") PLUS the number of
 *      form controls inside the frame (read via same-origin contentDocument
 *      when available – same-origin DocuSign iframes expose this).
 *   3. Pick the highest-scoring frame and return a FrameLocator with an
 *      exact-attribute CSS match (not the fuzzy :is() pattern).
 *   4. If scoring fails, fall back to the broad :is() pattern and record a
 *      diagnostic so the run surfaces the fallback in the report.
 *
 * This runtime detection is materially more resilient than a single hard-
 * coded id because it adapts to whichever signing-frame id DocuSign returns
 * for this account / template.
 */
export async function resolveSigningFrame(
  page: Page,
  timeoutMs = 20_000,
): Promise<{ frame: FrameLocator; diagnostic: string }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const chosen = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('iframe'));
      type Info = { id: string; title: string; name: string; src: string; score: number };
      const infos: Info[] = all.map((f) => {
        const id = f.id || '';
        const title = f.getAttribute('title') || '';
        const name = f.getAttribute('name') || '';
        const src = f.getAttribute('src') || '';
        const sig = `${id} ${title} ${name} ${src}`;
        let score = 0;
        if (/signing|tacticframe|docusign/i.test(sig)) score += 100;

        let inner: Document | null = null;
        try {
          inner = f.contentDocument;
        } catch {
          inner = null;
        }
        if (inner) {
          score += inner.querySelectorAll('input, textarea, select, button').length;
        }
        return { id, title, name, src, score };
      });

      infos.sort((a, b) => b.score - a.score);
      return infos[0] ?? null;
    });

    if (chosen && chosen.score > 0) {
      let selector = 'iframe';
      if (chosen.id) selector = `iframe[id="${escapeAttr(chosen.id)}"]`;
      else if (chosen.title) selector = `iframe[title="${escapeAttr(chosen.title)}"]`;
      else if (chosen.name) selector = `iframe[name="${escapeAttr(chosen.name)}"]`;
      return {
        frame: page.frameLocator(selector),
        diagnostic: `iframe auto-detected: ${selector} (score=${chosen.score})`,
      };
    }
    await page.waitForTimeout(500);
  }

  const fallback =
    'iframe:is([id*="signing"], [id*="tactic"], [title*="DocuSign"], [title*="Signing"], [name*="signing"], [src*="docusign"])';
  return {
    frame: page.frameLocator(fallback),
    diagnostic: `FRAGILE fallback iframe selector in use: ${fallback}`,
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

  for (const s of strategies) {
    if (await clickIfPresent(s.locator.first(), timeout)) return s.label;
  }
  return 'none';
}

/**
 * Full "open the signer session" flow.  Returns the resolved FrameLocator
 * plus diagnostics so the discovery spec can surface them in the report.
 */
export async function openSigner(page: Page): Promise<{ frame: FrameLocator; diagnostics: string[] }> {
  const diagnostics: string[] = [];

  await page.goto(getSignerUrl(), { waitUntil: 'domcontentloaded' });

  const startStrategy = await clickStartIfPresent(page);
  diagnostics.push(`start-button strategy: ${startStrategy}`);

  const { frame, diagnostic } = await resolveSigningFrame(page);
  diagnostics.push(diagnostic);

  // Prefer a real form-control readiness check over template-specific heading
  // text. The live signer DOM can expose the onboarding fields without
  // rendering a literal "1. Business Details" heading in the accessibility
  // tree, which made the previous readiness gate fail on valid sessions.
  await expect(
    frame.locator('input:not([type="hidden"]), textarea, select').first(),
  ).toBeVisible({ timeout: 20_000 });
  diagnostics.push('signer-form readiness: first input/textarea/select is visible');

  return { frame, diagnostics };
}
