/**
 * Bead onboarding resend/resubmit client.
 *
 * The exact REST path and auth header name/value are **not** hard-coded –
 * the public Bead docs and the uploaded OpenAPI spec do not agree on the
 * onboarding resend endpoint, so both path and auth header name are
 * environment-configurable.  See README.md for the supported shapes.
 */

import { loadBeadConfig, type BeadConfig } from './config';
import { redactUrl } from './url-sanitize';

export type ResendResult = {
  triggeredAt: Date;
  /** Unix seconds – convenient for Gmail `after:` query. */
  triggeredAtEpochSec: number;
  method: string;
  status: number;
  url: string;
};

export function buildResendUrl(cfg: Pick<BeadConfig, 'baseUrl' | 'resendPath' | 'applicationId'>): string {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const pathWithId = cfg.resendPath.replace('{applicationId}', encodeURIComponent(cfg.applicationId));
  const joiner = pathWithId.startsWith('/') ? '' : '/';
  return `${base}${joiner}${pathWithId}`;
}

export function normalizeResendMethod(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) {
    throw new Error('BEAD_ONBOARDING_RESEND_METHOD must not be empty');
  }
  if (!['POST', 'PUT', 'PATCH'].includes(normalized)) {
    throw new Error(`Unsupported BEAD_ONBOARDING_RESEND_METHOD: ${normalized}`);
  }
  return normalized;
}

export async function triggerResend(cfg: BeadConfig = loadBeadConfig()): Promise<ResendResult> {
  const url = buildResendUrl(cfg);
  const method = normalizeResendMethod(cfg.resendMethod);
  const triggeredAt = new Date();

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    [cfg.authHeaderName]: cfg.authHeaderValue,
  };

  // eslint-disable-next-line no-console
  console.log(`[bead] ${method} ${redactUrl(url)} (auth header: ${cfg.authHeaderName})`);

  const res = await fetch(url, {
    method,
    headers,
    body: JSON.stringify({ applicationId: cfg.applicationId }),
  });

  if (!res.ok) {
    // Read at most a short body snippet so we never dump large responses.
    const snippet = (await res.text().catch(() => '')).slice(0, 500);
    throw new Error(
      `Bead resend failed: ${res.status} ${res.statusText} @ ${redactUrl(url)}\n` +
        `Response snippet: ${snippet}`,
    );
  }

  return {
    triggeredAt,
    triggeredAtEpochSec: Math.floor(triggeredAt.getTime() / 1000),
    method,
    status: res.status,
    url,
  };
}
