/**
 * One-time Gmail OAuth2 token creator.
 *
 * Run: npm run bootstrap:gmail-auth
 *
 * Requires GMAIL_CREDENTIALS_PATH to point at a downloaded credentials.json
 * for an OAuth client ID of type "Desktop app".  Writes a refresh token to
 * GMAIL_TOKEN_PATH which is then reused by the live bootstrap.
 */

import { runInteractiveAuth } from '../lib/gmail-client';

runInteractiveAuth().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`[gmail-auth] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
