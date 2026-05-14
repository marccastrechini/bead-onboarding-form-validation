## ChatGPT Review Summary
- What changed: RUN27 added a bounded DOM wrapper and safe attribute-signature inventory in `fixtures/field-discovery.ts` for radio-like controls, including safe attribute names, presence booleans, token-shape buckets, value-hint buckets, wrapper depth surfaces, and wrapper or attribute commonality buckets. `fixtures/conditional-discovery.ts` now inventories that signature for guarded fallback radio-like candidates and reuses only explicit safe attribute-token hints in the existing fail-closed cue matcher. `tests/bootstrap-units.spec.ts` now covers DOM attribute-signature discovery, safe attribute-based physical and business-physical selection, mailing or legal or virtual and same or different or yes or no fail-closed cases, generated or generic attribute signatures, and attribute inventory redaction.
- Whether bounded DOM wrapper or safe attribute-signature inventory was added: yes.
- Whether the matcher was broadened or inventory-only: broadened narrowly. RUN27 allows selection only when exactly one visible editable radio-like control has an explicit safe Physical Operating Address or Business Physical Address attribute token signature; mailing or legal or virtual ambiguity, same or different or yes or no-only signatures, multiple matches, and generated or generic signatures still fail closed.
- What guardrails were preserved: no live capture, no `bootstrap:interactive`, no `interactive:watchdog`, no full signer discovery, no destructive validation, no uploads, no `.env` mutation, no raw signer URLs, no finalization controls, and no generated artifact commits.
- Whether the result moved us forward: yes. RUN27 creates the next live seam needed to test whether the three radios expose a differentiating safe attribute or wrapper signature after all current text, layout, and coarse structural inventories stayed empty live.
- Tests/commands run and pass/fail: `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` passed (42/42); `npm run test:units` passed (295/295).
- Remaining blocker or uncertainty: RUN27 is still local-only. A future authorized live rerun is required to see whether the three live radios actually expose useful safe attribute or wrapper signals, or remain uniform even under this new inventory.
- Whether a screenshot is still needed, and if so, what exact area to capture: optional but still useful. Capture only the physical-address toggle block after the signer surface loads and before any clicks, including the three radios and their immediate visible row, wrapper, card, or prompt context.
- Whether to continue, stop, or redirect: continue.
- Whether another live capture is recommended next, and only if so, the exact next run ID: yes, but only if explicitly authorized. Exact next run ID: `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN28`.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN27

## Status
Ready for ChatGPT review

## Objective
Do not run another live capture. Add a source/test-only bounded DOM wrapper and safe attribute-signature inventory around the three visible radio-like candidates so guarded diagnostics can determine whether any non-text differentiator exists beyond the current empty text and non-text seams.

## What Changed
- Added a bounded DOM wrapper and safe attribute-signature seam in `fixtures/field-discovery.ts` for radio-like controls.
- The new seam reports only safe bounded metadata:
  - safe attribute names present on the radio itself
  - safe attribute names present on the nearest bounded wrappers
  - bounded wrapper depth surfaces (`parent`, `grandparent`, `form-row`)
  - presence booleans for `id`, `name`, `aria-label`, `aria-labelledby`, `aria-describedby`, `data-*`, and DocuSign-like metadata
  - safe token-shape buckets only
  - safe attribute value-hint buckets only
  - wrapper-pattern and attribute-pattern commonality buckets across the radio group
- Extended `fixtures/conditional-discovery.ts` to inventory the new `domAttributeSignature` separately for guarded fallback radio-like candidates.
- Narrowly broadened matcher behavior by reusing only explicit safe attribute-token hints through the existing cue pipeline:
  - unique `physical-operating-address-token` or `business-physical-address-token` may select
  - mailing or legal or virtual ambiguity still fails closed
  - same or different or yes or no-only signatures do not select
  - multiple possible candidates still fail closed
  - generated or generic signatures stay inventory-only and fail closed
- Expanded focused tests in `tests/bootstrap-units.spec.ts` to cover:
  - bounded DOM attribute-signature discovery from actual radio wrappers
  - omission of raw attribute values from the new signature
  - unique safe Physical Operating Address attribute selection
  - unique safe Business Physical Address attribute selection
  - mailing or legal or virtual attribute fail-closed behavior
  - same or different or yes or no-only attribute fail-closed behavior
  - multiple attribute-based matches failing closed
  - generated or generic attribute signatures staying bounded and fail-closed

## Guardrails Preserved
- No live bootstrap or capture command was run.
- `bootstrap:interactive` was not run.
- `interactive:watchdog` was not run.
- Full signer discovery was not run.
- `DESTRUCTIVE_VALIDATION` was not enabled.
- No uploads were performed.
- No Finish, Complete, Submit, Sign, Adopt, or finalization controls were clicked.
- No raw signer URL was printed or committed.
- `.env` was not mutated.
- Generated artifacts were not staged or committed.

## Files Changed
- `fixtures/field-discovery.ts`
- `fixtures/conditional-discovery.ts`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/status.json`
- `artifacts/ai-handoff/latest-copilot-result.md`

## Validation
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` -> passed (42 passed)
- `npm run test:units` -> passed (295 passed)
- `npm run bootstrap:capture:physical-address` was not run in RUN27 by design

## Result
- Forward progress: yes.
- RUN27 widens the safe observable surface around the fallback radio-like candidates beyond text, container, layout, and coarse non-text structure by adding bounded DOM wrapper and safe attribute signatures.
- The guarded matcher is no longer inventory-only for this seam, but the broadening is deliberately narrow and validated under fail-closed guardrails.
- The next authorized live rerun can now answer whether the three radios expose any safe attribute or wrapper differentiator that was previously invisible to all earlier seams.
- Because RUN27 did not run a live capture, the `business_mailing_*` classifications from RUN26 were not reevaluated and remain unchanged until fresh post-toggle artifacts exist.

## Remaining Blocker / Uncertainty
- The new DOM wrapper and attribute-signature seam is locally validated only; a future authorized live rerun is still required to see how the three live radios populate the new buckets.
- If the next live run still yields no differentiating attribute or wrapper signature, the remaining gap likely lies beyond the current safe text, layout, non-text, and bounded attribute discovery surfaces.

## Screenshot Helpfulness
- A screenshot would help: optional but useful.
- Exact area to capture: the physical-address toggle block after the signer surface loads and before any interaction, including the three radios and their immediate visible row, card, wrapper, or prompt context.
- A full-page screenshot is not necessary.

## Recommendation
Continue.

Another live capture is recommended next only if explicitly authorized, using:
`PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN28`

## Recommended Next Copilot Prompt
Run `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN28`: execute exactly one authorized `npm run bootstrap:capture:physical-address`, keep the current safety constraints, inspect the new bounded DOM wrapper and safe attribute-signature fallback inventory for the three visible radios, and determine whether the live controls expose any unique safe attribute or wrapper signature that narrows the blocker.

## Branch / Commit Status
- Branch: `main`
- Pre-RUN27 commit: `4543971439a8df0b1834a0c563efd45577340806`
- RUN27 handoff commit: pending at write time

## Commit Scope
- Stage and commit:
  - `fixtures/field-discovery.ts`
  - `fixtures/conditional-discovery.ts`
  - `tests/bootstrap-units.spec.ts`
  - `artifacts/ai-handoff/status.json`
  - `artifacts/ai-handoff/latest-copilot-result.md`
- Do not commit:
  - `artifacts/latest-*`
  - `artifacts/latest-physical-operating-address-*`
  - `artifacts/playwright*`
  - `.env`
  - `samples/private/**`

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN27