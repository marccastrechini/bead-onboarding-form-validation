## ChatGPT Review Summary
- What changed: RUN43 stayed source/test-only and added one new bounded group-level/association-level anchor-evidence seam for the exact-three-radio Business Primary Location block. The calibrated fallback summary, capture-only receipt, bootstrap receipt preservation path, and focused tests now expose separate group-anchor buckets for accessible-name, legend, question-prompt, section-header, and association evidence.
- Whether group-level/association-level anchor evidence was added: yes. New diagnostics-only receipt fields were added for `addressOptionsGroupAnchorOutcomeCategory`, `addressOptionsGroupAnchorRejectedReasons`, `addressOptionsGroupAnchorEvidenceSummary`, `addressOptionsGroupAnchorSourcesChecked`, `addressOptionsGroupAnchorSafeTokensObserved`, `radioGroupAccessibleNameBucketsPresent`, `radioGroupLegendBucketsPresent`, `radioGroupQuestionPromptBucketsPresent`, `radioGroupSectionHeaderBucketsPresent`, and `radioGroupAssociationBucketsPresent`.
- Whether matcher behavior stayed diagnostics-only: yes. RUN43 did not broaden matcher behavior or calibrated fallback selection criteria.
- Whether bootstrap preserves the new receipt fields: yes. The bootstrap receipt tests now preserve the new group-anchor fields from child receipt to final bootstrap receipt.
- Whether redaction was verified: yes. Focused summary/receipt tests verify the new fields remain bucketed and do not emit raw section names, prompt text, URLs, values, IDs, classes, HTML, screenshots, emails, or tokens.
- What guardrails were preserved: no live capture command was run; `npm run bootstrap:capture:physical-address` was not run; `npm run capture:physical-address` was not run; `bootstrap:interactive` was not run; `interactive:watchdog` was not run; full signer discovery was not run; `DESTRUCTIVE_VALIDATION` was not enabled; `.env` was not mutated; no uploads or finalization controls were used; no screenshot was committed or used at runtime.
- Whether the result moved us forward: yes. RUN43 closes the next diagnostic gap after RUN42 by exposing bounded group-level and association-level evidence categories that a future live receipt can inspect before any matcher broadening is considered.
- Tests/commands run and pass/fail: `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "anchor evidence"` -> 10 passed; `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` -> 87 passed; `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address capture-only"` -> 15 passed; `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address bootstrap capture receipt"` -> 8 passed; `npm run test:units` -> 359 passed.
- Remaining blocker / uncertainty: RUN43 proves the new group-anchor seam in source/tests only. It does not yet show which group-anchor buckets, if any, will be surfaced by the live exact-three-radio signer layout.
- Screenshot handling: any screenshot in the Copilot thread was treated only as visual guidance, was not OCRed, was not used at runtime, and was not committed.
- Whether another live capture is recommended next: yes. The next explicitly recommended live run is PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN44.
- Whether to continue, stop, or redirect: redirect.
- The next best Copilot prompt: execute exactly one authorized live `npm run bootstrap:capture:physical-address` run, inspect the preserved receipt for the new RUN43 group-anchor fields, and report whether the live exact-three-radio layout now yields bounded accessible-name, legend, question-prompt, section-header, or association buckets without changing matcher behavior.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN43

## Status
Ready for ChatGPT review

## Objective
Stay source/test-only and add one new bounded group-level or association-level anchor-evidence seam for the exact-three-radio Business Primary Location layout, then thread that diagnostics-only evidence through the capture-only receipt and bootstrap receipt preservation path without broadening matcher behavior.

## What Changed
- Added diagnostics-only bounded group-anchor outcome categories, source lists, rejected reasons, evidence summaries, and bucket arrays in guarded physical-address discovery.
- Derived the new group-anchor evidence from raw bounded source context around the visible radio candidates: group name, container-section/legend-like text, question-prompt text, section header text, and group-associated layout/row context.
- Threaded the new fields through the capture-only result, receipt builder, receipt validator, and bootstrap receipt preservation path at both the nested `calibratedFallbackGuardSummary` location and the receipt top level.
- Expanded focused tests for accessible-name, legend, question-prompt, section-header/association, empty-source, generic-only, prior-guard-not-checked, bootstrap preservation, and redaction behavior.

## Files Changed
- `fixtures/conditional-discovery.ts`
- `scripts/capture-physical-operating-address.ts`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/latest-copilot-result.md`
- `artifacts/ai-handoff/status.json`

## Implementation Result
- `PhysicalOperatingAddressCalibratedFallbackGuardSummary` and `PhysicalOperatingAddressToggleSelectionSummary` now expose a second diagnostics-only anchor bundle for group-level and association-level evidence.
- The new receipt fields added in RUN43 are:
	- `addressOptionsGroupAnchorOutcomeCategory`
	- `addressOptionsGroupAnchorRejectedReasons`
	- `addressOptionsGroupAnchorEvidenceSummary`
	- `addressOptionsGroupAnchorSourcesChecked`
	- `addressOptionsGroupAnchorSafeTokensObserved`
	- `radioGroupAccessibleNameBucketsPresent`
	- `radioGroupLegendBucketsPresent`
	- `radioGroupQuestionPromptBucketsPresent`
	- `radioGroupSectionHeaderBucketsPresent`
	- `radioGroupAssociationBucketsPresent`
- The new safe token buckets added in RUN43 are bounded to categories such as `business-primary-location`, `registered-legal-address`, `proof-of-address`, `physical-operating-address`, `po-box`, `virtual-agent`, `radio-group`, `question-prompt`, and `generic-only`.
- Matcher behavior is unchanged. The calibrated fallback still gates only on the existing `addressOptionsAnchorMatched` path, while the new group-anchor fields are diagnostics-only.

## Validation
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "anchor evidence"` -> 10 passed
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` -> 87 passed
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address capture-only"` -> 15 passed
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "physical address bootstrap capture receipt"` -> 8 passed
- `npm run test:units` -> 359 passed
- No new focused grep was needed for RUN43.

## Guardrails Preserved
- No live capture command was run in RUN43.
- `npm run bootstrap:capture:physical-address` was not run.
- `npm run capture:physical-address` was not run.
- `bootstrap:interactive` was not run.
- `interactive:watchdog` was not run.
- Full signer discovery was not run.
- `DESTRUCTIVE_VALIDATION` was not enabled.
- `.env` was not mutated.
- No raw signer URL was printed or committed.
- No raw field values, raw DOM, raw IDs, raw class strings, arbitrary raw attribute values, emails, tokens, screenshots, or HTML dumps were emitted in the new diagnostics.
- No uploads were performed.

## Result
- Forward progress: yes.
- RUN43 adds the next bounded receipt seam needed after RUN42: future live receipts can now distinguish whether the exact-three-radio block exposes safe group-level evidence through accessible-name, legend, question-prompt, section-header, or association channels.
- The new seam is fully covered by focused and full source/test validation before any live follow-up.

## Remaining Blocker / Uncertainty
- RUN43 does not include a new live proof step, so the actual live exact-three-radio layout has not yet been checked against the new group-anchor buckets.
- Matcher behavior remains intentionally unchanged and fail-closed until a future authorized live run proves that one of the new group-anchor sources is consistently safe enough to justify calibrated broadening.
- Business-mailing concept status remains unchanged because RUN43 gathered no fresh live artifacts.

## Recommendation
Redirect.

The next smallest step is one explicitly authorized live receipt inspection run in PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN44.

## Recommended Next Copilot Prompt
Execute exactly one authorized live `npm run bootstrap:capture:physical-address` run for PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN44, inspect the preserved receipt for `addressOptionsGroupAnchorOutcomeCategory`, `addressOptionsGroupAnchorRejectedReasons`, `addressOptionsGroupAnchorEvidenceSummary`, `addressOptionsGroupAnchorSourcesChecked`, `addressOptionsGroupAnchorSafeTokensObserved`, and the five `radioGroup*BucketsPresent` fields added in RUN43, and report whether the live exact-three-radio Business Primary Location layout now yields bounded group-level evidence strong enough to consider a later source/test-only matcher decision.

## Branch / Commit Status
- Branch: `main`
- Current HEAD before the RUN43 handoff commit: `cad8eab21d2fe4fc0de9de64913f9585cb9a7d5d`
- RUN43 handoff commit: pending at write time

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN43