/**
 * Shared URL sanitizer: keeps origin + pathname, redacts query and hash
 * which typically carry the single-use DocuSign token.  Never log raw URLs.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const q = u.search ? '?[redacted]' : '';
    const h = u.hash ? '#[redacted]' : '';
    return `${u.origin}${u.pathname}${q}${h}`;
  } catch {
    return '[unparseable-url]';
  }
}
