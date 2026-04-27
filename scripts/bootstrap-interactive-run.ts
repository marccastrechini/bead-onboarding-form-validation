/**
 * Guarded bootstrap orchestrator for disposable-envelope field validation.
 *
 * Requires INTERACTIVE_VALIDATION=1 and DISPOSABLE_ENVELOPE=1 before any
 * Bead/Gmail/DocuSign side effect occurs. The script fetches a fresh signer
 * URL, injects it only into the child test process, and relies on the spec to
 * mutate fields, observe validation, and restore values.
 */

import { spawn } from 'node:child_process';
import { loadBeadConfig, loadGmailConfig } from '../lib/config';
import { triggerResend } from '../lib/bead-client';
import { pollForSigningEmail } from '../lib/gmail-client';
import { extractSigningUrl } from '../lib/link-extractor';
import { redactUrl } from '../lib/url-sanitize';
import { assertInteractiveValidationGuards } from '../fixtures/interactive-validation';

type ExitReason = { code: number; reason: string };

async function runNpmScript(script: string, extraEnv: NodeJS.ProcessEnv): Promise<number> {
  const isWin = process.platform === 'win32';
  const command = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', script] : ['run', script];
  const child = spawn(command, args, {
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
  assertInteractiveValidationGuards();

  const bead = loadBeadConfig();
  const gmail = loadGmailConfig();

  const resend = await triggerResend(bead);
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] resend OK (method=${resend.method}, status=${resend.status}) at ${resend.triggeredAt.toISOString()}`);

  let message;
  try {
    message = await pollForSigningEmail(gmail, resend.triggeredAtEpochSec);
  } catch (error) {
    return {
      code: 2,
      reason:
        'BLOCKED: Gmail polling failed/timed out. ' +
        (error instanceof Error ? error.message : String(error)),
    };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] email found id=${message.id} (internalDate=${new Date(message.internalDateMs).toISOString()})`);

  const extracted = await extractSigningUrl(message.body);
  if (!extracted) {
    return { code: 3, reason: 'BLOCKED: no DocuSign signing URL found in email body.' };
  }
  // eslint-disable-next-line no-console
  console.log(`[bootstrap:interactive] signing URL extracted via=${extracted.via} target=${extracted.sanitized}`);

  const childEnv: NodeJS.ProcessEnv = {
    DOCUSIGN_SIGNING_URL: extracted.url,
    DESTRUCTIVE_VALIDATION: '',
  };

  // eslint-disable-next-line no-console
  console.log('[bootstrap:interactive] launching: npm run test:interactive');
  const code = await runNpmScript('test:interactive', childEnv);
  if (code !== 0) {
    return { code, reason: `interactive validation exited with code ${code}` };
  }

  return { code: 0, reason: 'OK' };
}

main()
  .then((result) => {
    // eslint-disable-next-line no-console
    console.log(`[bootstrap:interactive] done: ${result.reason}`);
    process.exit(result.code);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    const safe = message.replace(/https?:\/\/\S+/g, (url) => redactUrl(url));
    // eslint-disable-next-line no-console
    console.error(`[bootstrap:interactive] ERROR: ${safe}`);
    process.exit(1);
  });