/**
 * Extract a fresh DocuSign signing URL from an email body.
 *
 * Strategy:
 *   1. Scan HTML + plain text for direct docusign.net signing URLs.
 *   2. If none, collect candidate tracking/redirect URLs and resolve the
 *      most recent one by following HTTP redirects until we land on a
 *      docusign.net URL.
 *
 * The extractor never prints the raw URL – only a sanitized summary.
 */

import { redactUrl } from './url-sanitize';

const DOCUSIGN_DIRECT_RE =
  /https?:\/\/[a-z0-9.-]*docusign\.(?:net|com)\/[^\s"'<>)]+/gi;

const GENERIC_LINK_RE = /https?:\/\/[^\s"'<>)]+/gi;

export type ExtractResult = {
  url: string;
  via: 'direct' | 'redirect';
  sanitized: string;
};

export function findDirectDocusignUrls(body: string): string[] {
  const matches = body.match(DOCUSIGN_DIRECT_RE) ?? [];
  // De-duplicate while preserving order; filter to URLs that look like
  // a signing entry point (contain "Signing" or a token param).  Fall
  // back to all matches if the filter is too strict.
  const unique = Array.from(new Set(matches));
  const signingLike = unique.filter((u) => /signing|t=|ti=/i.test(u));
  return signingLike.length > 0 ? signingLike : unique;
}

export function findCandidateRedirectUrls(body: string): string[] {
  const all = body.match(GENERIC_LINK_RE) ?? [];
  const unique = Array.from(new Set(all));
  // Prefer known tracker/redirector hosts.
  return unique.filter((u) => /click|track|redirect|link\.|sg\./i.test(u));
}

/**
 * Follow HTTP redirects manually up to `maxHops` and return the first URL
 * that lands on docusign.  Uses HEAD first and falls back to GET on 405.
 */
export async function resolveRedirectToDocusign(
  candidate: string,
  maxHops = 6,
): Promise<string | null> {
  let current = candidate;
  for (let i = 0; i < maxHops; i++) {
    if (/docusign\.(?:net|com)/i.test(current)) return current;

    let res: Response;
    try {
      res = await fetch(current, { method: 'HEAD', redirect: 'manual' });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(current, { method: 'GET', redirect: 'manual' });
      }
    } catch {
      return null;
    }

    const loc = res.headers.get('location');
    if (!loc) return null;
    current = new URL(loc, current).toString();
  }
  return /docusign\.(?:net|com)/i.test(current) ? current : null;
}

export async function extractSigningUrl(body: string): Promise<ExtractResult | null> {
  const direct = findDirectDocusignUrls(body);
  if (direct.length > 0) {
    // Freshest == last occurrence in body (signing emails typically put
    // the primary CTA near the end after the preheader preview).
    const url = direct[direct.length - 1];
    return { url, via: 'direct', sanitized: redactUrl(url) };
  }

  const candidates = findCandidateRedirectUrls(body);
  for (const c of candidates.reverse()) {
    const resolved = await resolveRedirectToDocusign(c);
    if (resolved) {
      return { url: resolved, via: 'redirect', sanitized: redactUrl(resolved) };
    }
  }

  return null;
}
