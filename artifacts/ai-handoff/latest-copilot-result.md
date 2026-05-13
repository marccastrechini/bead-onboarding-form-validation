# Copilot Handoff Result

## Status
Completed

## CHAT ID
PHYSICALOPERATINGADDRESSRESOLVER

## ChatGPT Review Summary
- What changed: tightened the Physical Operating Address post-toggle capture refinement in `fixtures/physical-address-post-toggle-capture.ts` and added a regression in `tests/bootstrap-units.spec.ts` for the saved spillover pattern.
- Coverage moved forward: no; refreshed non-live outputs still leave all four `business_mailing_*` concepts unresolved.
- Tests/commands run: `npm run test:units` passed (245 passed); `npm run reports:refresh` passed; `npm run findings:open` passed.
- Remaining blocker: the saved sanitized post-toggle capture still exposes generic controls instead of field-local `Address Line 1` / `City` / `State` / `ZIP` labels, so geometry-only matching remains unsafe.
- Exact recommended next step: run one fresh guarded non-finalizing Physical Operating Address post-toggle capture using the tightened refinement and inspect whether field-local labels now surface in the sanitized artifact.

## Objective
Run one strictly non-live resolver/capture workstream to isolate the Physical Operating Address block that backs `business_mailing_address_line_1`, `business_mailing_city`, `business_mailing_state`, and `business_mailing_postal_code`, determine why post-toggle capture does not isolate field-local labels, and refresh the AI handoff.

## Preflight Status
- `git status --short` showed only task-related edits in the Physical Operating Address fixture, unit test, and AI handoff files.
- Repo-owned process scan found no active live, bootstrap, watchdog, or interactive residue.
- Interactive/destructive env-var cleanup check found no residue.

## Evidence Inspected
- `docs/validation-coverage-ledger.md`
- `docs/LIVE_BOOTSTRAP.md`
- `artifacts/latest-validation-summary.json`
- `artifacts/latest-validation-scorecard.json`
- `artifacts/latest-validation-findings.json`
- `artifacts/latest-mapping-calibration.json`
- `artifacts/latest-physical-operating-address-dom-probe.json`
- `artifacts/latest-physical-operating-address-post-toggle-structure.json`
- `artifacts/latest-physical-operating-address-post-toggle-dom.html`
- No `scripts/physical-address-dom-probe.ts` or `scripts/physical-address-post-toggle-capture.ts` files exist; the owning implementation is under `fixtures/`.
- `fixtures/field-discovery.ts`
- `fixtures/validation-report.ts`
- `fixtures/validation-scorecard.ts`
- `fixtures/interactive-validation.ts`
- `lib/mapping-calibration.ts`
- `tests/bootstrap-units.spec.ts`

## Root Cause
- Confirmed `2. Capture bounds are too broad or too narrow.` The saved post-toggle structure artifact still showed pre-anchor spillover and later non-`.doc-tab` spillover in the captured region.
- Confirmed `4. Geometry-only matching causes sibling/neighbor confusion.` Because field-local labels were absent in the saved sanitized capture, calibration kept drifting toward nearby `addressOptions` radio neighbors and other generic controls.
- Not primary in the current saved evidence: `5. Fields exist but are hidden/read-only.` Human proof and saved controls indicate the expected Physical Operating Address controls are visible/editable, but not isolated with field-local proof.
- Not primary in the current saved evidence: `6. Enrichment is not attached to discovered fields.` Sample layout evidence exists and still points to the right block; the missing piece is live field-local proof.
- Not primary in the current saved evidence: `7. Calibration rules are too strict despite adequate proof.` The current rules are correctly refusing to trust generic neighboring radios/textboxes.
- Secondary current limitation: `8. Existing artifacts are stale and need a non-live refresh path.` The code fix only affects future guarded captures; refreshed reports still consume the older saved sanitized capture artifact.

## Fix Made
- Tightened `refinePhysicalOperatingAddressPostToggleCaptureRegion()` so capture refinement now:
	- rejects partial top-overlap spillover,
	- ignores non-`.doc-tab` controls in the refined result,
	- trims before the first visible non-`.doc-tab` row below the `isOperatingAddress` anchor,
	- recomputes compact bounds from the filtered Physical Operating Address rows.

## Tests Added Or Updated
- Added a focused regression proving the refined post-toggle capture stops before the first non-`.doc-tab` row.
- Existing capture-refinement tests continue to prove page-scale wrappers and pre-anchor rows are excluded.

## Unit Test Status
- `npm run test:units` -> passed (`245 passed`).

## Report Refresh Status
- `npm run reports:refresh` -> passed.
- Refreshed outputs remained effectively unchanged for the four `business_mailing_*` concepts: scorecard coverage stayed `7/277 (3%)`, grade `D`; findings stayed `product 0`, `ambiguous 4`, `mapping-blocked 0`, `ready-for-rerun 0`.

## Findings Open Status
- `npm run findings:open` -> passed.
- Findings still say the guarded post-toggle structure capture runs after `isOperatingAddress` but does not yet isolate field-local Physical Operating Address labels.

## Refreshed `business_mailing_*` Classification
- `business_mailing_address_line_1`: scorecard confidence `none / Not Found`; calibration `leave_unresolved`; selected candidate `#93 addressOptions › Required - addressOptions - isLegalAddress`; source proof missing `no`; field-local label proof missing `yes`; control state `present/editable but not isolated`; blocker `capture -> calibration`.
- `business_mailing_city`: scorecard confidence `none / Not Found`; calibration `leave_unresolved`; selected candidate `#94 addressOptions › Required - addressOptions - isOperatingAddress`; source proof missing `no`; field-local label proof missing `yes`; control state `present/editable but not isolated`; blocker `capture -> calibration`.
- `business_mailing_state`: scorecard confidence `none / Not Found`; calibration `leave_unresolved`; selected candidate `#93 addressOptions › Required - addressOptions - isLegalAddress`; source proof missing `no`; field-local label proof missing `yes`; control state `present/editable dropdown/list expected, but not isolated`; blocker `capture -> calibration`.
- `business_mailing_postal_code`: scorecard confidence `none / Not Found`; calibration `leave_unresolved`; selected candidate `#94 addressOptions › Required - addressOptions - isOperatingAddress`; source proof missing `no`; field-local label proof missing `yes`; control state `present/editable but not isolated`; blocker `capture -> calibration`.
- `document_type` remains separate and was not changed by this workstream.

## Docs/Source/Test Changes Made
- Changed: `fixtures/physical-address-post-toggle-capture.ts`
- Changed: `tests/bootstrap-units.spec.ts`
- Changed: `artifacts/ai-handoff/status.json`
- Changed: `artifacts/ai-handoff/latest-copilot-result.md`
- Unchanged: `docs/validation-coverage-ledger.md` because blocker classification stayed `still capture-blocked / resolver-required` rather than moving to calibration-ready.

## Commit Hash And Push Result
- Branch at handoff write time: `main`
- Pre-commit HEAD at handoff write time: `3dd0301ed5c03a15321373c3c898f48ca13216be`
- Commit and push were still pending at handoff write time so the handoff could be committed in a single eligible change set.

## Safety Confirmations
- No `artifacts/**` files other than the two allowed AI handoff files are intended for staging.
- No `samples/private/**` files are intended for staging.
- No live bootstrap, watchdog, or DocuSign validation was run.
- No submit, sign, adopt, finish, or complete action was taken.

## Recommended Next Workstream
- Use the tightened refinement during one fresh guarded non-finalizing Physical Operating Address post-toggle capture.
- If the refreshed sanitized artifact still shows only generic controls, treat the remaining blocker as missing DOM label proof rather than capture-bounds drift.

CHAT ID: PHYSICALOPERATINGADDRESSRESOLVER