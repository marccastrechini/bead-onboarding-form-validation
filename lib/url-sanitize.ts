/**
 * Shared URL sanitizer: keeps only the origin and whether path/query/hash were
 * present.  Never log raw path segments because they can contain application
 * ids, envelope ids, or single-use signing tokens.
 */
export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const p = u.pathname && u.pathname !== '/' ? '/[redacted-path]' : '/';
    const q = u.search ? '?[redacted]' : '';
    const h = u.hash ? '#[redacted]' : '';
    return `${u.origin}${p}${q}${h}`;
  } catch {
    return '[unparseable-url]';
  }
}
