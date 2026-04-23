/**
 * Live end-to-end bootstrap orchestrator (SAFE MODE).
 *
 *   1. Call the configured Bead resend/resubmit onboarding endpoint for the configured
 *      applicationId.
 *   2. Poll Gmail for the resulting DocuSign invitation email.
 *   3. Extract a fresh signing URL from the email body.
 *   4. Spawn the existing Playwright smoke test, then the discovery test,
 *      injecting DOCUSIGN_SIGNING_URL only into the child process env.
 *
 * This script NEVER submits, signs, finishes, adopts, or otherwise finalizes
 * the DocuSign envelope.  DESTRUCTIVE_VALIDATION is explicitly stripped from
 * the spawned env so the existing non-submitting harness behavior is
 * preserved.  Raw signer URLs are never logged – only sanitized forms.
 */

import { spawn } from 'node:child_process';
import { loadBeadConfig, loadGmailConfig } from '../lib/config';
import { triggerResend } from '../lib/bead-client';
import { pollForSigningEmail } from '../lib/gmail-client';
import { extractSigningUrl } from '../lib/link-extractor';
import { redactUrl } from '../lib/url-sanitize';

type ExitReason = { code: number; reason: string };

async function runNpmScript(script: string, extraEnv: NodeJS.ProcessEnv): Promise<number> {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', script] : ['run', script];
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  return await new Promise<number>((resolve) => {
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main(): Promise<ExitReason> {
  const bead = loadBeadConfig();
  const gmail = loadGmailConfig();

  // 1) Trigger resend
  const resend = await triggerResend(bead);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] resend OK (method=${resend.method}, status=${resend.status}) at ${resend.triggeredAt.toISOString()}`);

  // 2) Poll Gmail
  let msg;
  try {
    msg = await pollForSigningEmail(gmail, resend.triggeredAtEpochSec);
  } catch (err) {
    return {
      code: 2,
      reason:
        `BLOCKED: Gmail polling failed/timed out. ` +
        (err instanceof Error ? err.message : String(err)),
    };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] email found id=${msg.id} (internalDate=${new Date(msg.internalDateMs).toISOString()})`);

  // 3) Extract signing URL
  const extracted = await extractSigningUrl(msg.body);
  if (!extracted) {
    return { code: 3, reason: 'BLOCKED: no DocuSign signing URL found in email body.' };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] signing URL extracted via=${extracted.via} target=${extracted.sanitized}`);

  // 4) Hand off to Playwright.  Strip DESTRUCTIVE_VALIDATION to be safe.
  const childEnv: NodeJS.ProcessEnv = {
    DOCUSIGN_SIGNING_URL: extracted.url,
    DESTRUCTIVE_VALIDATION: '',
  };

  // eslint-disable-next-line no-console
  console.log(`[bootstrap] launching: npm run test:smoke (SAFE MODE)`);
  const smokeCode = await runNpmScript('test:smoke', childEnv);
  if (smokeCode !== 0) {
    return { code: smokeCode, reason: `smoke test exited with code ${smokeCode} (see Playwright output above)` };
  }

  // eslint-disable-next-line no-console
  console.log(`[bootstrap] launching: npm run test:discovery (SAFE MODE)`);
  const discoveryCode = await runNpmScript('test:discovery', childEnv);
  if (discoveryCode !== 0) {
    return { code: discoveryCode, reason: `discovery test exited with code ${discoveryCode}` };
  }

  return { code: 0, reason: 'OK' };
}

main()
  .then((r) => {
    // eslint-disable-next-line no-console
    console.log(`[bootstrap] done: ${r.reason}`);
    process.exit(r.code);
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    // Sanitize anything that looks like a URL in the error message.
    const safe = msg.replace(/https?:\/\/\S+/g, (u) => redactUrl(u));
    // eslint-disable-next-line no-console
    console.error(`[bootstrap] ERROR: ${safe}`);
    process.exit(1);
  });
