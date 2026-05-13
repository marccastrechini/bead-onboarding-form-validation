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
 * the DocuSign envelope. DESTRUCTIVE_VALIDATION is explicitly stripped from
 * the spawned env so the existing non-submitting harness behavior is
 * preserved. Raw signer URLs are never logged, only sanitized forms.
 */

import { formatSafeError, runBootstrapEmailScripts, type ExitReason } from '../lib/bootstrap-email-runner';

export const BOOTSTRAP_LIVE_CHILD_SCRIPTS = ['test:smoke', 'test:discovery'] as const;

export async function main(): Promise<ExitReason> {
  return await runBootstrapEmailScripts({
    label: 'bootstrap',
    scripts: BOOTSTRAP_LIVE_CHILD_SCRIPTS,
  });
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[bootstrap] done: ${result.reason}`);
      process.exit(result.code);
    })
    .catch((error) => {
      const safe = formatSafeError(error);
      // eslint-disable-next-line no-console
      console.error(`[bootstrap] ERROR: ${safe}`);
      process.exit(1);
    });
}
