# Validation Coverage Ledger

Generated for the COVERAGESPRINT workstream on 2026-05-08.
Updated during ADDRESSLEDGER on 2026-05-08.
Updated during PROOFOFADDRESSLEDGER on 2026-05-12.
Updated during BANKNAMELEDGER on 2026-05-13.

## Scope And Safety

This ledger tracks cumulative validation progress across focused guarded runs. The latest scorecard percentage is latest-run scoped, so it can understate cumulative project coverage after a narrow canary overwrites the latest interactive artifacts.

No raw field values, PII, DocuSign URLs, tokens, screenshots, tax IDs, routing numbers, account numbers, or signer secrets are recorded here.

## Latest Focused Scorecard

- Latest focused run scope: `bank_name`.
- Latest scorecard coverage: 7/277 (3%), grade D.
- Latest findings summary: product findings 0; ambiguous findings 4; mapping-blocked 0; ready-for-rerun 0.
- Latest focused run added 6 trusted executed observations across 1 concept.
- Interpretation: the latest scorecard remains latest-run scoped rather than cumulative. The focused `bank_name` canary produced trusted live evidence on the Bank Name page-1 DocuSign Text control at ordinal 62 / field index 32, with 6 executed checks, 2 passed results after report refresh, 4 field-local non-product manual-review rows, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and no drift into routing number, account number, `bank_account_type`, deposit method, bank-address, phone, email, date, numeric, upload, signature, acknowledgement, or finalization controls.

## Live-Proven Concepts

The following concepts have trusted live evidence from prior completed guarded runs in this workstream:

- `legal_entity_type`
- `business_type`
- `bank_account_type`
- `bank_name`
- `proof_of_bank_account_type`
- `email`
- `phone`
- `business_name`
- `dba_name`
- `location_name`
- `contact_first_name`
- `contact_last_name`
- `business_description`
- `registration_date`
- `stakeholder_email`
- `stakeholder_phone`
- `stakeholder_job_title`
- `ownership_percentage`
- `naics`
- `merchant_category_code`
- `postal_code`
- `proof_of_business_type`
- `federal_tax_id_type`
- `registered_address_line_1`
- `registered_address_line_2`
- `registered_city`
- `proof_of_address_type`

## Live-Proven Field Families

- Controlled-choice metadata: legal entity type, business type, bank account type, proof-of-bank-account type, proof-of-business type, federal tax ID type, proof-of-address type.
- Banking text behavior: bank name.
- Contact channels: email and phone.
- Business and contact text-name fields: business name, DBA name, location name, contact first name, contact last name.
- Long/free text: business description.
- Date behavior: registration date.
- Stakeholder contact channels: stakeholder email and stakeholder phone.
- Stakeholder profile text: stakeholder job title.
- Ownership percentage.
- Numeric/code fields: NAICS and merchant category code.
- Registered legal address text behavior: address line 1, address line 2, and city.
- Registered legal ZIP/postal behavior: postal code.

## Policy-Manual-Review Areas

- Text-name very-short behavior.
- Text-name symbol-heavy behavior for location and contact names.
- Business description very-short and garbage-text behavior.
- Registration date alternate format and future-date behavior.
- Bank name very-short behavior remains a policy question; numeric-only behavior still needs stronger field-local text evidence; excessive-length truncation remains acceptable documented behavior; and special-characters behavior remains expected text leniency.
- Stakeholder job title very-short and special-character behavior: the trusted live canary left `very-short-behavior` as a policy question and `special-characters-behavior` as expected text leniency; both remain field-local non-product manual-review rows unless later policy resolves them.
- Registered legal address text punctuation and symbol-heavy behavior remains field-local non-product manual-review territory after the live batch; the open rows are two expected-text-leniency observations and three stronger-text-evidence observations.
- Proof-of-address type current/default option observation can remain field-local `observer_ambiguous` even when the target is trusted, the control is a native select/List, options are discoverable, and the mutating checks pass.

## Blocked Or Deferred Areas

- `registered_state` immediate live work until the live-discovery target is available again as a merchant input despite offline label trust.
- `business_mailing_*` and Physical Operating Address post-toggle capture.
- Amount fields until separate editable controls are proven.
- Stakeholder first and last name until field-local screenshot proof confirms the current editable text target.
- Date of birth because of sensitivity and policy constraints.
- Website because of prior product-finding history.
- Raw SSN, EIN, routing number, account number, and other tax or bank-sensitive value fields.
- Upload, signature, acknowledgement, and finalization-adjacent controls.

## Cumulative Coverage Estimate

- Current live-proven concept count: 27 concepts.
- Current live-proven behavior-family count: approximately 11 families.
- Latest focused scorecard coverage is 7/277 (3%) because it is latest-run scoped.
- Latest focused `bank_name` canary added 6 trusted executed observations, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and 4 field-local non-product manual-review rows.
- Cumulative concept coverage is tracked here rather than inferred from the latest focused scorecard alone.

## COVERAGESPRINT Candidate Plan

- Candidate batch 1: `naics`; low-risk non-sensitive numeric code field, separated from MCC by target calibration but kept singleton because of nearby same-shape numeric candidates.
- Candidate batch 2: `registered_address_line_1`, `registered_address_line_2`, `registered_city`; same registered legal address text family with field-local label proof and no Physical Operating Address dependency.
- Candidate batch 3: `registered_state`; registered legal address list field with field-local label proof, kept separate because list/control-choice behavior is higher risk.

## COVERAGESPRINT Results

- Batch 1, `naics`: completed through the operator watchdog. Result was 4/4 executed, 4/4 passed, 0 skipped, trusted target verification reached, product findings 0, ambiguous findings 0, mapping-blocked findings 0. This adds NAICS to cumulative live-proven concept coverage and strengthens the non-sensitive numeric/code behavior family.
- Candidate batch 2 (`registered_address_line_1`, `registered_address_line_2`, `registered_city`) later completed successfully as ADDRESSCOVERAGENEXT once coverage accounting confirmed that target-trusted field-local manual-review rows were acceptable. Result was 13/13 trusted executed observations, 0 skipped, product findings 0, mapping-blocked findings 0, target drift 0, and 5 field-local non-product ambiguous/manual-review rows.
- Batch 3, `registered_state`: watchdog completed, but target verification did not become trusted. Result was 0/4 executed, 4/4 skipped as mapping-not-confident, product findings 0, ambiguous findings 0. The sprint stopped here by rule with no retry. Follow-up should resolve the live verifier handoff for the registered legal state list before another live attempt.

## Post-Sprint Recovery

- STATEUNLOCK fixed the stale-slot and stale-select handoff bug for `registered_state`. Offline calibration still trusts `Registered Legal Address > State`, and the stale wrong-target drift from the first attempt is resolved.
- STATECANARY reran `registered_state` as a guarded live singleton. The wrapper completed cleanly, no stale select or wrong-target drift appeared, and no Physical Operating Address or Bank Address ambiguity appeared.
- STATECANARY still did not add trusted live evidence for `registered_state`: all 4 checks were skipped because the intended live-discovery target was not available as a merchant input, so `targetDiagnostics` stayed null and no mutating verification ran.
- `registered_state` is therefore excluded from immediate live sprint work. It is now a live-discovery target-availability resolver, not a quick coverage canary.
- TARGETAVAILABILITY resolved the shared discovery-index handoff bug non-live. Refreshed findings now classify `proof_of_business_type` and `federal_tax_id_type` as offline-trusted and ready for a guarded rerun; `registered_state` still needs one guarded confirmation run before it can re-enter the clean coverage lane.

## CLEANCHOICERERUN Results

- `proof_of_business_type`, `federal_tax_id_type`: completed through the operator watchdog as a single guarded controlled-choice metadata batch.
- Result was 8/8 trusted executed observations, 8/8 passed in refreshed findings, 0 skipped, product findings 0, ambiguous findings 0, mapping-blocked findings 0.
- Both concepts reached trusted live target verification on standalone native-select controls and stayed within the expected field-local label and section.
- No upload-widget ambiguity, non-standalone-selector ambiguity, or raw tax-value entry occurred.
- This adds `proof_of_business_type` and `federal_tax_id_type` to cumulative live-proven concept coverage and closes the previously open clean controlled-choice metadata rerun lane.

## ADDRESSCOVERAGENEXT Results

- `registered_address_line_1`, `registered_address_line_2`, `registered_city`: completed through the operator watchdog as a single guarded registered legal address text batch.
- Result was 13/13 trusted executed observations, 8 passed in refreshed findings, 3 warnings, 2 manual-review statuses, 0 skipped, product findings 0, mapping-blocked findings 0, and target drift 0.
- All three concepts reached trusted live target verification on standalone text inputs and stayed within the Registered Legal Address block; there was no drift to Physical Operating Address or bank-address fields.
- The 5 ambiguous/manual-review rows remained field-local and non-product: punctuation handling for line 1 and line 2 stayed in expected-text-leniency territory, while garbage or digits handling for line 1, line 2, and city still need stronger field-local text evidence before any product-defect claim.
- This adds `registered_address_line_1`, `registered_address_line_2`, and `registered_city` to cumulative live-proven concept coverage and establishes the registered legal address text family as trusted live evidence.

## PROOFOFADDRESSDISCOVERYCANARY Results

- `proof_of_address_type`: completed through the operator watchdog as a guarded live singleton.
- Result was 4/4 executed, 3 passed, 1 manual-review, 0 skipped, product findings 0, mapping-blocked findings 0, and ready-for-rerun 0.
- All 4 target-resolution rows were trusted and resolved to the expected Registered Legal Address > Proof of Address Type page-1 List/select control at the calibrated ord37 anchor.
- The remaining manual-review row was field-local and observational only: `current-option-documented` stayed `observer_ambiguous` because the current/default value could not be documented stably without overclaiming.
- No drift appeared into `document_type`, stakeholder selectors, upload widgets, uploaded file-value echoes, signature controls, acknowledgement controls, or finalization-adjacent controls.
- This adds `proof_of_address_type` to cumulative live-proven concept coverage and closes the prior proof-of-address discovery fallback workstream as a mapping blocker.

## STAKEHOLDERJOBTITLECANARY Results

- `stakeholder_job_title`: completed through the operator watchdog as a guarded live singleton.
- Result after report refresh was 5/5 executed, 3 passed, 2 manual-review, 0 skipped, product findings 0, mapping-blocked findings 0, and ready-for-rerun 0.
- All 5 target-resolution rows were trusted and resolved to the expected `stakeholders #0 > Job Title` page-3 DocuSign Text control at ordinal 26.
- The selected target was a visible/editable merchant input and stayed on the Stakeholder Job Title field.
- The 2 manual-review rows remained field-local and non-product: `very-short-behavior` is a policy question, and `special-characters-behavior` is expected text leniency.
- No drift appeared into stakeholder first name, stakeholder last name, stakeholder email, stakeholder phone, `date_of_birth`, ownership percentage, upload controls, signature controls, acknowledgement controls, or finalization-adjacent controls.
- This adds `stakeholder_job_title` to cumulative live-proven concept coverage and raises the cumulative live-proven concept count to 26.

## BANKNAMECANARY Results

- `bank_name`: completed through the operator watchdog as a guarded live singleton.
- Result after report refresh was 6/6 executed, 2 passed, 4 manual-review, 0 skipped, product findings 0, mapping-blocked findings 0, and ready-for-rerun 0.
- All 6 target-resolution rows were trusted and resolved to the Bank Name page-1 DocuSign Text control at ordinal 62 / field index 32.
- Target resolution stayed exclusive to Bank Name across all 6 checks.
- The selected target was a visible/editable merchant input, and mapping remained `trusted_by_anchor_and_value_shape`.
- The 4 manual-review rows remained field-local and non-product: `very-short-behavior` / `policy_question`, `numeric-only-behavior` / `observer_needs_stronger_text_evidence`, `excessive-length-behavior` / `acceptable_behavior_documented`, and `special-characters-behavior` / `expected_text_leniency`.
- No drift appeared into routing number, account number, `bank_account_type`, deposit method, bank-address, phone, email, date, numeric, upload, signature, acknowledgement, or finalization-adjacent controls.
- This adds `bank_name` to cumulative live-proven concept coverage and raises the cumulative live-proven concept count to 27.
- The 2026-05-13 ledger pass is non-live only; it confirms cumulative accounting without changing the latest-run-scoped focused scorecard.

## BANKNAMELEDGER Candidate Classification

- Clean live candidate: `document_type`; latest calibration plus existing mock proof make the stakeholder metadata dropdown on page 3 the cleanest remaining guarded singleton, but the refreshed scorecard still labels it `Needs Mapping`, so it is a plausible next singleton rather than a better immediate move than the higher-yield non-live resolver.
- Live candidate likely to produce manual-review rows: `website`; mapping is stronger again, but URL acceptance and rejection still sits in product-policy territory and is not the best immediate coverage-over-complexity move.
- Missing-proof capture unlock: `stakeholder_first_name`, `stakeholder_last_name`; both still need field-local screenshot or capture proof before any mutating run.
- Resolver work required: `business_mailing_address_line_1`, `business_mailing_city`, `business_mailing_state`, `business_mailing_postal_code`; the latest findings explicitly say the post-toggle Physical Operating Address capture still fails to isolate field-local labels.
- Product-policy or sensitivity constrained: `date_of_birth`; calibration is strong, but expanded checks are sensitivity-heavy and likely to stay policy-driven.
- Frozen/address/live-discovery blocked: `registered_state`, `registered_country`, bank-address fields, and the Physical Operating Address block until the post-toggle capture is isolated; `registered_state` still lacks live target availability even though offline label trust exists.
- Amount/capture blocker: `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket`; no separate editable controls are currently proven in this saved US flow.
- Already live-proven: the live-proven concepts listed above, now including `bank_name`. The latest scorecard still lists many of these as not-run because it is latest-run scoped; do not treat those latest-run gaps as cumulative regressions.
- Remaining high-confidence non-sensitive metadata after excluding already-live-proven and blocked or sensitive lanes: `document_type` is the best remaining singleton, but the higher-yield unlock is still the four-concept Physical Operating Address capture fix.

## Recommended Next Action

- Recommended next action: C. One non-live resolver/capture workstream for Physical Operating Address / `business_mailing_*`.
- Coverage rationale: the latest findings explicitly recommend tightening the post-toggle capture anchor, bounds, or DOM selector so the sanitized review payload isolates the Physical Operating Address block and recovers field-local labels before trusting geometry. That one non-live workstream can unlock four currently blocked concepts, which is a better coverage return than any remaining singleton.
- Why this beats `document_type` first: `document_type` is now a plausible guarded singleton, but it advances only one concept, the refreshed scorecard still treats it conservatively as `Needs Mapping`, and it does not resolve the repo's largest current blocker cluster.
- Why this beats `stakeholder_first_name` and `stakeholder_last_name` first: both still require missing-proof evidence before any guarded live attempt can be trusted.
- Why this beats `website` or `date_of_birth` first: `website` still carries product-policy ambiguity, and `date_of_birth` is sensitivity-heavy even with strong calibration.
- Why this beats stopping at reporting: the blocker is concrete, non-live, and already described by the latest findings as the next tooling task.
- Non-live resolver objective: tighten the post-toggle Physical Operating Address capture so field-local labels for line 1, city, state, and postal code are isolated in the sanitized payload, then refresh calibration and coverage accounting from those artifacts before any live rerun.
- The next prompt must use the repo AI handoff workflow and commit only eligible docs or code changes plus the two allowed handoff files.

### Exact Next Copilot Prompt

```text
CHAT ID: PHYSICALOPERATINGADDRESSRESOLVER

Use the repo AI handoff workflow. Work inside C:\Projects\bead-onboarding-form-validation.

Goal: run one strictly non-live resolver/capture workstream to isolate the Physical Operating Address block that backs `business_mailing_address_line_1`, `business_mailing_city`, `business_mailing_state`, and `business_mailing_postal_code`. Do not run live validation. Do not run bootstrap:interactive. Do not run interactive:watchdog. Do not enable DESTRUCTIVE_VALIDATION. Do not upload files or click Submit, Sign, Adopt, Finish, Complete, or any envelope-finalizing control.

Inspect the existing Physical Operating Address artifacts plus the capture fixtures/scripts that generate them. Tighten the post-toggle capture anchor, bounds, or DOM selector so the sanitized review payload isolates the Physical Operating Address block and recovers field-local labels without relying on geometry alone.

After code changes, run the relevant non-live capture/report refresh commands only, inspect the regenerated sanitized artifacts, and determine whether the four Physical Operating Address concepts can move from capture-blocked to calibration-ready. Keep unresolved concepts out of product findings if field-local proof is still missing.

Update docs/validation-coverage-ledger.md only if the non-live evidence changes the blocker classification, then update artifacts/ai-handoff/status.json and artifacts/ai-handoff/latest-copilot-result.md. Commit and push only eligible docs/code changes plus the two allowed handoff files with a message starting AI-HANDOFF: PHYSICALOPERATINGADDRESSRESOLVER ready for ChatGPT review.
```
