## ChatGPT Review Summary
- What changed: RUN56 stayed source/test-only and added bounded pre-signer/bootstrap failure classification into the Physical Operating Address capture receipt path. The bootstrap wrapper now classifies resend, Gmail, link-extraction, child-launch, and missing/malformed child-receipt failures into bounded receipt fields, while the child runner classifies missing-signer-url and `openSigner` pre-signer failures before `signerSurfaceReached`.
- Whether bounded pre-signer failure classification was added: yes.
- Which receipt fields were added: `preSignerFailureSummaryPresent`, `preSignerFailureCategory`, `preSignerFailureStage`, `preSignerFailureReason`, `preSignerFailureSummary`, `bootstrapResendAttempted`, `bootstrapResendSucceeded`, `gmailPollAttempted`, `gmailInviteFound`, `gmailSigningLinkExtracted`, `childRunnerLaunched`, `childRunnerReceivedSignerUrl`, `childRunnerStartedCapture`, `openSignerAttempted`, `openSignerExternalWarningHandled`, `openSignerReachedSignerSurface`, `signerSurfaceWaitAttempted`, `signerSurfaceWaitTimedOut`, `preSignerFailureBeforeChildLaunch`, `preSignerFailureInChildRunner`, and `preSignerFailureReceiptPreserved`.
- Whether bootstrap preserves child pre-signer categories: yes. When a bounded child receipt exists, bootstrap now preserves the child category/stage/reason/summary and overlays only the bootstrap resend/Gmail/link-launch facts plus `preSignerFailureReceiptPreserved=true` when the child receipt itself carried the pre-signer failure.
- Whether fallback bootstrap receipt creation remains bounded: yes. Bootstrap now writes a bounded fallback receipt for resend failure, Gmail timeout/no-invite classification, link-extraction failure, child-runner launch failure, and missing/malformed child-receipt preservation failure instead of throwing out without a preserved receipt.
- Whether calibrated slot-2 behavior was left unchanged: yes. No matcher behavior changed, no calibrated fallback was broadened, and no slot-selection logic changed.
- What guardrails were preserved: no live capture ran; no `bootstrap:interactive`; no `interactive:watchdog`; no full signer discovery; no destructive validation; no uploads; no `.env` mutation; no raw signer URLs, raw Gmail content, raw links, tokens, raw stdout/stderr dumps, raw DOM/HTML, or screenshots in receipts.
- Tests/commands run and pass/fail:
  - `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "pre-signer"` -> 11 passed
  - `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address capture-only"` -> 22 passed
  - `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address bootstrap capture receipt"` -> 7 passed
  - `npm run test:units` -> 394 passed
- Remaining blocker / uncertainty: the new pre-signer fields are source/test validated only. A future authorized live capture is still required to observe which bounded category the current real `signerSurfaceReached=false` failure lands in.
- Whether another live capture is recommended next, and only if so, the exact next run ID: yes. `PHYSICALADDRESSCALIBRATEDPIVOT-20260519-RUN57`.
- Whether to continue, stop, or redirect: redirect.
- The next best Copilot prompt: for `PHYSICALADDRESSCALIBRATEDPIVOT-20260519-RUN57`, execute exactly one authorized live `npm run bootstrap:capture:physical-address`, do not retry it, inspect the new `preSignerFailure*`, resend/Gmail/link, child-launch, and `openSigner*` receipt fields, and refresh/open downstream reports only if fresh post-toggle artifacts were actually produced.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCALIBRATEDPIVOT-20260519-RUN56

## Status
Ready for ChatGPT review

## Objective
Stay source/test-only and add bounded pre-signer/bootstrap failure classification into the preserved Physical Operating Address capture receipt so a future authorized live run can distinguish why `signerSurfaceReached=false` without changing any matcher behavior.

## What Changed
- Added bounded pre-signer failure fields and type guards to `scripts/capture-physical-operating-address.ts`.
- Added bounded child-side classification for missing signer URL and `openSigner`-phase failures before the signer surface is reached.
- Added bootstrap-side classification for resend failure, Gmail polling failure, link-extraction failure, child-runner launch failure, and missing/malformed child-receipt preservation failure.
- Bootstrap now catches bootstrap-stage exceptions, preserves a bounded fallback receipt, and merges bootstrap resend/Gmail facts into preserved child receipts without overwriting a more precise child pre-signer category.
- Left calibrated exact-three / slot-2 behavior unchanged.
- Added focused pre-signer receipt coverage in `tests/bootstrap-units.spec.ts`.
- Updated the AI handoff files.

## Files Changed
- `scripts/capture-physical-operating-address.ts`
- `scripts/bootstrap-capture-physical-operating-address.ts`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/latest-copilot-result.md`
- `artifacts/ai-handoff/status.json`

## Receipt Fields Added
- `preSignerFailureSummaryPresent`
- `preSignerFailureCategory`
- `preSignerFailureStage`
- `preSignerFailureReason`
- `preSignerFailureSummary`
- `bootstrapResendAttempted`
- `bootstrapResendSucceeded`
- `gmailPollAttempted`
- `gmailInviteFound`
- `gmailSigningLinkExtracted`
- `childRunnerLaunched`
- `childRunnerReceivedSignerUrl`
- `childRunnerStartedCapture`
- `openSignerAttempted`
- `openSignerExternalWarningHandled`
- `openSignerReachedSignerSurface`
- `signerSurfaceWaitAttempted`
- `signerSurfaceWaitTimedOut`
- `preSignerFailureBeforeChildLaunch`
- `preSignerFailureInChildRunner`
- `preSignerFailureReceiptPreserved`

## Bounded Categories Added
- `no-pre-signer-failure`
- `resend-failed`
- `gmail-poll-timeout`
- `gmail-invite-not-found`
- `gmail-link-extraction-failed`
- `child-runner-not-launched`
- `child-runner-missing-signer-url`
- `child-runner-exited-before-open-signer`
- `open-signer-navigation-failed`
- `external-warning-handling-failed`
- `signer-surface-timeout`
- `signer-surface-not-reached`
- `malformed-child-receipt`
- `missing-child-receipt`
- `another-bounded-pre-signer-failure`

## Bootstrap Preservation Behavior
- If the child receipt exists and already contains a more precise child pre-signer category, bootstrap preserves that child category/stage/reason/summary.
- Bootstrap still overlays bounded resend, Gmail, and link-extraction facts onto the final receipt.
- `preSignerFailureReceiptPreserved=true` is now set when bootstrap preserved a child-side pre-signer failure receipt.
- If no valid child receipt exists, bootstrap creates a bounded fallback receipt rather than leaving the run without a preserved receipt.

## Child-Side Classification Behavior
- Missing `DOCUSIGN_SIGNING_URL` now records `preSignerFailureCategory=child-runner-missing-signer-url`.
- `openSigner`-phase failures are bounded into `external-warning-handling-failed`, `signer-surface-timeout`, `open-signer-navigation-failed`, or `signer-surface-not-reached` based on safe error text only.
- If the signer surface is reached, the receipt records `preSignerFailureCategory=no-pre-signer-failure` even when later non-pre-signer failures still block the run.

## Matcher Scope
- Calibrated slot-2 behavior was left unchanged.
- No matcher behavior changed.
- No calibrated fallback was broadened.
- No live command behavior changed beyond bounded receipt instrumentation and preserving a bounded fallback receipt on bootstrap-stage exceptions.

## Guardrails Preserved
- No live capture command ran in RUN56.
- `bootstrap:interactive` was not run.
- `interactive:watchdog` was not run.
- Full signer discovery was not run.
- `DESTRUCTIVE_VALIDATION` was not enabled.
- `.env` was not mutated.
- No uploads were performed.
- No finalization controls were invoked.
- No raw signer URL, Gmail message id, raw email text, raw link, token, credential, raw stdout/stderr dump, raw DOM/HTML, or screenshot content was written into the new receipt fields.
- Screenshot handling was not needed for this task.

## Tests / Commands Run
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "pre-signer"` -> 11 passed
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address capture-only"` -> 22 passed
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address bootstrap capture receipt"` -> 7 passed
- `npm run test:units` -> 394 passed

## Result
- Forward progress: yes.
- RUN56 closed the bounded-classification gap from RUN55. The next authorized live capture can now identify whether `signerSurfaceReached=false` came from resend, Gmail polling, link extraction, child launch, missing signer URL, `openSigner` navigation, external warning handling, signer-surface timeout, or child-receipt preservation failure.

## Remaining Blocker / Uncertainty
- The new pre-signer categories are validated only in source/test mode so far.
- A future authorized live run is still required to confirm which bounded pre-signer category the current real-world failure takes.
- `gmail-invite-not-found` remains classifier-driven for non-timeout Gmail failures and was not exercised by the default Gmail client path during unit tests.

## Recommendation
Redirect.

The next smallest move is a single authorized live RUN57 capture-only validation so the preserved receipt can reveal the actual bounded pre-signer stage on the live signer path without changing scope again.

## Recommended Next Copilot Prompt
For `PHYSICALADDRESSCALIBRATEDPIVOT-20260519-RUN57`, execute exactly one authorized live `npm run bootstrap:capture:physical-address`, do not retry it, inspect `artifacts/latest-physical-operating-address-capture-receipt.json` for `preSignerFailureCategory`, `preSignerFailureStage`, `preSignerFailureSummary`, resend/Gmail/link fields, child-launch fields, `openSigner*` fields, and `preSignerFailureReceiptPreserved`, and only inspect downstream artifacts or run report refresh/findings open if fresh post-toggle artifacts were actually produced.

## Branch / Commit Status
- Branch: `main`
- Current HEAD before the RUN56 handoff commit: `6c6b204d03a76112da7fc2e0d6bb26d4bbe3a143`
- RUN56 handoff commit: pending at write time

CHAT ID: PHYSICALADDRESSCALIBRATEDPIVOT-20260519-RUN56