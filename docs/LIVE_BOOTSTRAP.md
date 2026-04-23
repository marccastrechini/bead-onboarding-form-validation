# Live Bootstrap Flow (SAFE MODE)

End-to-end helper that prepares a fresh DocuSign signing link and hands it
to the existing non-submitting Playwright suites.  The flow never clicks
**Finish / Complete / Sign / Adopt / Submit** – `DESTRUCTIVE_VALIDATION` is
explicitly stripped before spawning Playwright.

```
Bead resend  →  Gmail poll  →  Extract link  →  smoke  →  discovery
```

## One-time setup

### 1. Gmail API credentials

1. Go to the Google Cloud Console → APIs & Services → **Enable** "Gmail API".
2. OAuth consent screen → configure as **External** / **Testing** and add
   your Gmail address as a test user.
3. Credentials → Create Credentials → **OAuth client ID** → Application
   type = **Desktop app** → Download JSON.
4. Save that JSON somewhere outside git (e.g. `./.secrets/gmail-credentials.json`)
   and point `GMAIL_CREDENTIALS_PATH` at it in `.env`.
5. Create the token:
   ```powershell
   npm run bootstrap:gmail-auth
   ```
   Open the printed URL, complete consent, paste the code back in.  A
   refresh token is written to `GMAIL_TOKEN_PATH` (default `./.secrets/gmail-token.json`).

### 2. Environment

Copy `.env.example` → `.env` and fill in:

| Var | Purpose |
|---|---|
| `BEAD_API_BASE_URL` | Bead REST host, e.g. `https://api.bead.example.com` |
| `BEAD_ONBOARDING_RESEND_PATH` | Path template; must contain `{applicationId}` |
| `BEAD_AUTH_HEADER_NAME` | e.g. `Authorization` or `x-api-key` |
| `BEAD_AUTH_HEADER_VALUE` | header value (e.g. `Bearer …`) |
| `BEAD_APPLICATION_ID` | applicationId to resend |
| `BEAD_GMAIL_ADDRESS` | inbox that receives the DocuSign invite |
| `GMAIL_CREDENTIALS_PATH` | path to downloaded `credentials.json` |
| `GMAIL_TOKEN_PATH` | where the refresh token is stored |
| `GMAIL_QUERY_FROM` | default `dse@docusign.net` |
| `GMAIL_QUERY_SUBJECT_CONTAINS` | default `Please DocuSign` |
| `GMAIL_POLL_TIMEOUT_MS` | default `180000` |
| `GMAIL_POLL_INTERVAL_MS` | default `5000` |

> The public Bead docs and the uploaded OpenAPI spec do not agree on the
> resend endpoint.  That is why path and auth header name are both env-
> driven rather than hard-coded.

## Run the live flow

```powershell
npm run bootstrap:live
```

What it does:

1. POSTs the configured resend endpoint.
2. Polls Gmail (using `after:<epoch>`) for messages newer than the POST.
3. Extracts a DocuSign URL from the body – direct `*.docusign.net` links
   first, click-tracker redirect resolution as a fallback.
4. Spawns `npm run test:smoke`, then `npm run test:discovery`, passing
   `DOCUSIGN_SIGNING_URL` **only via the child `env`** – `.env` is not
   mutated.
5. If Gmail times out the flow fails fast with a clear `BLOCKED:` reason
   and does NOT launch Playwright.
6. If the fetched link is already consumed/expired the existing
   `guardSignerSession` in `fixtures/signer-helpers.ts` blocks the run
   with the standard `blocked` annotation.

## Unit tests

```powershell
npm run test:units
```

Covers resend URL construction, Gmail query building, freshest-message
selection, DocuSign link extraction, and URL redaction.

## Safety guarantees

- `DESTRUCTIVE_VALIDATION` is cleared in the spawned env.
- No raw signer URL is ever logged – only `redactUrl()` output.
- `.env` is never written to.
- Credentials/token paths are loaded from env, never committed.
- Error messages are scrubbed of full URLs before being printed.
