/**
 * Safe email-bootstrap entry point for the Physical Operating Address
 * capture-only runner.
 *
 * This reuses the same Bead resend, Gmail polling, and DocuSign link
 * extraction flow as bootstrap:live, but launches only capture:physical-address.
 * The signer URL is passed to that child process env only; .env is never
 * written and raw signer URLs are never logged.
 */

import { formatSafeError, runBootstrapEmailScripts, type ExitReason } from '../lib/bootstrap-email-runner';
import { PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND } from './capture-physical-operating-address';

export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND = 'bootstrap:capture:physical-address';
export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_SCRIPT_PATH = 'scripts/bootstrap-capture-physical-operating-address.ts';
export const PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS = [
  PHYSICAL_ADDRESS_CAPTURE_ONLY_COMMAND,
] as const;

export async function main(): Promise<ExitReason> {
  return await runBootstrapEmailScripts({
    label: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND,
    scripts: PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_CHILD_SCRIPTS,
  });
}

if (require.main === module) {
  main()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(`[${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND}] done: ${result.reason}`);
      process.exit(result.code);
    })
    .catch((error) => {
      const safe = formatSafeError(error);
      // eslint-disable-next-line no-console
      console.error(`[${PHYSICAL_ADDRESS_BOOTSTRAP_CAPTURE_COMMAND}] ERROR: ${safe}`);
      process.exit(1);
    });
}