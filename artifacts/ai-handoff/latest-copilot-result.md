## ChatGPT Review Summary
- What changed: added `npm run bootstrap:capture:physical-address`, backed by a shared email-bootstrap runner that reuses Bead resend, Gmail polling, and DocuSign link extraction before launching only `npm run capture:physical-address`.
- Safety posture: the signer URL is passed only through the child process environment, `.env` is not mutated, raw URLs are redacted in logs/errors, and `DESTRUCTIVE_VALIDATION` is cleared for child execution.
- Live execution status: no live/email capture command was run in this implementation prompt; the new path was validated through mocked unit coverage only.
- Tests/commands run and results: `npm run test:units` passed with 255 tests; `npm run reports:refresh` passed; `npm run findings:open` passed and showed 0 product findings, 4 ambiguous observations, coverage 0/277.
- Exact recommended next step: run a new guarded execution prompt for `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN02` that executes `npm run bootstrap:capture:physical-address` exactly once, then inspects the refreshed Physical Operating Address artifacts if the capture succeeds.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN01

## Status
Implemented

## Objective
Add a safe bootstrap capture command that obtains a fresh DocuSign signing URL through the existing Bead resend plus Gmail polling flow, then runs the already-validated Physical Operating Address capture-only runner with `DOCUSIGN_SIGNING_URL` passed only through child environment.

## Command Added
- `npm run bootstrap:capture:physical-address`
- Script path: `scripts/bootstrap-capture-physical-operating-address.ts`

## How It Reuses Email Monitoring
- Added `lib/bootstrap-email-runner.ts` to centralize the existing live bootstrap mechanics: `loadBeadConfig`, `loadGmailConfig`, `triggerResend`, `pollForSigningEmail`, `extractSigningUrl`, redacted logging, and child npm script execution.
- Refactored `scripts/bootstrap-live-run.ts` to use the shared runner with `test:smoke` and `test:discovery` as its child scripts.
- Added `scripts/bootstrap-capture-physical-operating-address.ts` to use the same shared runner with only `capture:physical-address` as its child script.

## How It Avoids Pasted URLs
- The new command does not require or read a manually pasted signer URL.
- It acquires the signer URL from the fresh email flow and passes it to the capture child process as `DOCUSIGN_SIGNING_URL`.
- `.env` is not written or mutated.

## Safety Details
- Raw DocuSign URLs are not printed; logs use the existing sanitized form.
- URL-bearing error messages are scrubbed through `formatSafeError`.
- `DESTRUCTIVE_VALIDATION` is set to an empty value for the child process.
- The capture bootstrap script launches only `capture:physical-address`; it does not run smoke, discovery, interactive validation, watchdog, full signer discovery, or full validation.
- No Finish, Complete, Submit, Sign, Adopt, upload, or finalization control is used by this implementation path.

## Files Changed
- `lib/bootstrap-email-runner.ts`
- `scripts/bootstrap-live-run.ts`
- `scripts/bootstrap-capture-physical-operating-address.ts`
- `package.json`
- `docs/LIVE_BOOTSTRAP.md`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/status.json`
- `artifacts/ai-handoff/latest-copilot-result.md`

## Tests And Commands Run
- `git status --short` before edits: clean.
- Repo-owned process scan: no matching live automation process output.
- Environment residue check: `DOCUSIGN_SIGNING_URL`, `DESTRUCTIVE_VALIDATION`, and Physical Address safe-discovery flags were not present in the active shell.
- `npm run test:units`: passed, 255 tests.
- `npm run reports:refresh`: passed; regenerated mapping calibration, scorecard, and findings artifacts.
- `npm run findings:open`: passed; findings output reported 0 likely product findings, 4 ambiguous observations, coverage 0/277.

## Live/Email Capture Run Status
- Not run.
- Reason: the prompt explicitly prohibited running live capture unless an existing safe mocked/test path was available; validation used mocked unit tests only.

## Generated Artifacts
- `npm run reports:refresh` may rewrite generated `artifacts/latest-*` outputs, but those are intentionally excluded from staging.
- No generated capture artifacts, Playwright report artifacts, `.env`, raw proof files, or `samples/private/**` files are intended for staging.

## Commit And Push Status
- Branch: `main`
- Base commit before this work: `b349a46af447834d236825ba26adaa0e514d3007`
- Commit hash: pending at handoff write time.
- Push result: pending at handoff write time.

## Uncertainty
- The live Gmail/resend/capture flow itself was not executed in this prompt, so this run proves wiring and safety behavior through tests but does not prove current Gmail credentials, Bead resend config, or a fresh DocuSign invite are available.

## Recommended Next Copilot Prompt
Run `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN02`: use the repo AI handoff workflow, do not run bootstrap:interactive, interactive:watchdog, full signer discovery, destructive validation, uploads, or finalization controls, then run exactly once `npm run bootstrap:capture:physical-address`. If it succeeds, inspect `artifacts/latest-physical-operating-address-post-toggle-structure.json` and `artifacts/latest-physical-operating-address-post-toggle-dom.html` for Address Line 1, City, State, ZIP, and Postal Code field-local labels, run `npm run reports:refresh` and `npm run findings:open`, and commit only the AI handoff files plus no generated artifacts.

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN01