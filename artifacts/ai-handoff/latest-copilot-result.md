## ChatGPT Review Summary
- What changed: RUN33 added a strict calibrated last-resort fallback in `fixtures/conditional-discovery.ts` and focused coverage in `tests/bootstrap-units.spec.ts`. The new branch selects slot 2 only for the neutral `addressOptions` radio cluster when primary selection and cue-based fallback both find zero matches, exactly three visible editable radio inputs remain, the order is stable, and all safe cue surfaces stay empty.
- Whether a calibrated Business Primary Location fallback was added: yes. The selection path now emits `selectionMode: calibrated-fallback` with reason `calibrated-business-primary-location-physical-address-option`.
- Whether the matcher was broadened and under what strict guards: yes, but only under strict guards. The calibrated branch requires zero primary eligible candidates, zero cue-based fallback matches, the `addressOptions` cluster anchor, exactly three visible editable radio inputs, stable slot order, and no physical/business/mailing/legal/virtual/same/different/yes/no cue signal. Generated or generic-only signatures remain neutral only and cannot prove the match.
- Why the second radio is the calibrated target: the known three-option cluster is visually documented in the completed-PDF / screenshot guidance, and the middle radio is the Physical or Business Physical Address option in that cluster. The code records slot 2 only for that cluster and never generalizes to an arbitrary middle-radio rule.
- What guardrails were preserved: RUN33 stayed source/test-only, did not run another live capture, did not mutate `.env`, did not enable destructive validation, did not upload anything, did not click any finalization controls, and kept diagnostics bounded and redacted.
- Whether the result moved us forward: yes. There is now a narrow, auditable fallback path ready for live validation instead of another broad exploration pass.
- Tests/commands run and pass/fail: `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` passed with 67 tests. `npm run test:units` passed with 320 tests.
- Remaining blocker / uncertainty: RUN33 did not spend another live signer URL, so the new fallback is still unverified against the live all-null three-radio cluster. If the live cluster does not expose the neutral `addressOptions` anchor under the same normalized discovery path, the matcher will still fail closed.
- Whether a screenshot was used only as visual guidance: yes. The screenshot/PDF guidance was used only to calibrate the target slot; no screenshot was committed and no image-derived text was injected into discovery.
- Whether another live capture is recommended next, and the exact next run ID: yes, if authorized. The next live validation should be exactly one capture-only run as `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN34`.
- Whether to continue, stop, or redirect: continue only with that single authorized live validation run; otherwise stop source edits because RUN33 is complete.
- The next best Copilot prompt: execute exactly one authorized live capture-only RUN34 to verify whether the new strict `addressOptions` calibrated fallback selects slot 2, expands the Physical Operating Address section, and produces fresh sanitized post-toggle artifacts without widening beyond the known three-radio cluster.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN33

## Status
Ready for ChatGPT review

## Objective
Do not run another live capture. Stay source/test-only and add a strict calibrated fallback strategy for the specific three-radio Business Primary Location layout after every safe DOM, text, layout, attribute, proxy/reference, and graphic cue path returned empty or null live.

## What Changed
- Added a strict calibrated fallback branch in `fixtures/conditional-discovery.ts`.
- Added an explicit fallback reason, `selectionMode: calibrated-fallback`, and bounded calibrated diagnostics on the fallback inventory.
- Anchored the calibrated branch to the neutral `addressOptions` cluster and fixed the neutral `addressOptions` regex so camel-case normalization still matches `address Options`.
- Added focused RUN33 tests in `tests/bootstrap-units.spec.ts` for slot-2 selection, exact-three guards, stable-order guards, cue precedence, ambiguity rejection, generated/generic-only neutrality, and redaction-safe diagnostics.
- Updated the AI handoff files for RUN33.

## Calibrated Fallback Design
- The branch only runs after primary selection finds zero eligible candidates and cue-based fallback finds zero explicit physical or business-physical matches.
- The branch only considers the neutral `addressOptions` radio cluster.
- The branch requires exactly three visible editable radio inputs and stable slot order.
- The branch rejects any surfaced physical/business/mailing/legal/virtual/same/different/yes/no cue.
- The branch records `calibrated-business-primary-location-physical-address-option` as the auditable reason.
- The branch targets slot 2 only.
- Generated or generic-only attribute, proxy/reference, and graphic signatures do not count as proof and do not override the strict guards.

## Why Slot 2
- The completed-PDF / screenshot guidance shows a known three-option cluster above the Physical Operating Address section.
- Within that known cluster, the middle radio is the Physical Operating Address or Business Physical Address choice.
- RUN33 keeps this as a calibrated last resort for that cluster only; it does not infer that a middle radio is generally correct elsewhere.

## Guardrails Preserved
- No live capture command was run.
- `bootstrap:interactive` was not run.
- `interactive:watchdog` was not run.
- `.env` was not mutated.
- `DESTRUCTIVE_VALIDATION` was not enabled.
- No uploads were performed.
- No Finish, Complete, Submit, Sign, Adopt, or other finalization controls were clicked.
- Diagnostics remain bounded and redacted.

## Files Changed
- `fixtures/conditional-discovery.ts`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/status.json`
- `artifacts/ai-handoff/latest-copilot-result.md`

## Validation
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` -> passed (67 tests)
- `npm run test:units` -> passed (320 tests)

## Result
- Forward progress: yes.
- RUN33 converted the prior screenshot-guided hypothesis into a narrow, auditable, fail-closed implementation with passing coverage.
- The guarded matcher is still not broadly widened: generic three-radio groups continue to fail closed, and only the known `addressOptions` cluster can reach the calibrated slot-2 branch.

## Remaining Blocker / Uncertainty
- RUN33 did not perform live validation, so the new branch is not yet proven against the live all-null three-radio cluster.
- If the live cluster does not surface the neutral `addressOptions` anchor under the same normalized discovery path, the new branch will still fail closed.
- The second-slot calibration still depends on screenshot/PDF-only visual guidance rather than on a newly recovered live DOM cue.

## Screenshot Guidance
- Screenshot/PDF evidence was used only as visual guidance to calibrate the slot-2 target.
- No screenshot was committed.
- No image-derived text was injected into discovery or diagnostics.

## Recommendation
Continue only if one new live step is authorized.

The next live step should be exactly one capture-only validation run as `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN34` to verify that the new strict calibrated fallback selects slot 2, expands the Physical Operating Address section, and produces fresh sanitized artifacts.

## Recommended Next Copilot Prompt
Execute exactly one authorized live capture-only RUN34 to verify whether the new strict `addressOptions` calibrated fallback selects slot 2, expands the Physical Operating Address section, and produces fresh sanitized post-toggle artifacts without widening beyond the known three-radio cluster.

## Branch / Commit Status
- Branch: `main`
- Current HEAD before any new commit: `d88017757d4121a77794e256ed151da9ebcf4b17`
- No commit or push was created in RUN33 because no commit or push was requested.
- Suggested commit message if needed: `AI-HANDOFF: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN33 ready for ChatGPT review`

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN33