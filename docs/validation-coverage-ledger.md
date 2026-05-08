# Validation Coverage Ledger

Generated for the COVERAGESPRINT workstream on 2026-05-08.
Updated during COVERAGENEXT on 2026-05-08.

## Scope And Safety

This ledger tracks cumulative validation progress across focused guarded runs. The latest scorecard percentage is latest-run scoped, so it can understate cumulative project coverage after a narrow canary overwrites the latest interactive artifacts.

No raw field values, PII, DocuSign URLs, tokens, screenshots, tax IDs, routing numbers, account numbers, or signer secrets are recorded here.

## Latest Focused Scorecard

- Latest focused run scope: `registered_state`.
- Latest scorecard coverage: 1/277 (0%), grade D.
- Latest findings summary: product findings 0; ambiguous findings 0; mapping-blocked 0; ready-for-rerun 4.
- Interpretation: the latest scorecard reflects the most recent focused run artifacts, not the cumulative set of concepts validated across the project. The latest focused run was a registered-state singleton whose wrapper completed, but all checks were skipped before mutation because the intended live-discovery target was not available as a merchant input.

## Live-Proven Concepts

The following concepts have trusted live evidence from prior completed guarded runs in this workstream:

- `legal_entity_type`
- `business_type`
- `bank_account_type`
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
- `ownership_percentage`
- `naics`
- `merchant_category_code`
- `postal_code`

## Live-Proven Field Families

- Controlled-choice metadata: legal entity type, business type, bank account type, proof-of-bank-account type.
- Contact channels: email and phone.
- Business and contact text-name fields: business name, DBA name, location name, contact first name, contact last name.
- Long/free text: business description.
- Date behavior: registration date.
- Stakeholder contact channels: stakeholder email and stakeholder phone.
- Ownership percentage.
- Numeric/code fields: NAICS and merchant category code.
- Registered legal ZIP/postal behavior: postal code.

## Policy-Manual-Review Areas

- Text-name very-short behavior.
- Text-name symbol-heavy behavior for location and contact names.
- Business description very-short and garbage-text behavior.
- Registration date alternate format and future-date behavior.
- Stakeholder job title very-short and special-character behavior unless later policy resolves it.
- Registered legal address text punctuation and symbol-heavy behavior unless the batch is intentionally run as manual-review coverage.

## Blocked Or Deferred Areas

- `registered_state` immediate live work until the live-discovery target is available again as a merchant input.
- `business_mailing_*` and Physical Operating Address post-toggle capture.
- Amount fields until separate editable controls are proven.
- Stakeholder first and last name until field-local screenshot proof confirms the current editable text target.
- Date of birth because of sensitivity and policy constraints.
- Website because of prior product-finding history.
- Raw SSN, EIN, routing number, account number, and other tax or bank-sensitive value fields.
- Upload, signature, acknowledgement, and finalization-adjacent controls.

## Cumulative Coverage Estimate

- Current live-proven concept count: 19 concepts.
- Current live-proven behavior-family count: approximately 9 families.
- Latest focused scorecard coverage is 1/277 (0%) because it is latest-run scoped.
- Cumulative concept coverage is tracked here rather than inferred from the latest focused scorecard alone.

## COVERAGESPRINT Candidate Plan

- Candidate batch 1: `naics`; low-risk non-sensitive numeric code field, separated from MCC by target calibration but kept singleton because of nearby same-shape numeric candidates.
- Candidate batch 2: `registered_address_line_1`, `registered_address_line_2`, `registered_city`; same registered legal address text family with field-local label proof and no Physical Operating Address dependency.
- Candidate batch 3: `registered_state`; registered legal address list field with field-local label proof, kept separate because list/control-choice behavior is higher risk.

## COVERAGESPRINT Results

- Batch 1, `naics`: completed through the operator watchdog. Result was 4/4 executed, 4/4 passed, 0 skipped, trusted target verification reached, product findings 0, ambiguous findings 0, mapping-blocked findings 0. This adds NAICS to cumulative live-proven concept coverage and strengthens the non-sensitive numeric/code behavior family.
- Candidate batch 2 (`registered_address_line_1`, `registered_address_line_2`, `registered_city`) was deferred before live execution because current address-text policy intentionally keeps punctuation/symbol-heavy behavior in manual-review territory. Running it would likely conflict with this sprint's clean-coverage stop conditions.
- Batch 2, `registered_state`: watchdog completed, but target verification did not become trusted. Result was 0/4 executed, 4/4 skipped as mapping-not-confident, product findings 0, ambiguous findings 0. The sprint stopped here by rule with no retry. Follow-up should resolve the live verifier handoff for the registered legal state list before another live attempt.

## Post-Sprint Recovery

- STATEUNLOCK fixed the stale-slot and stale-select handoff bug for `registered_state`. Offline calibration still trusts `Registered Legal Address > State`, and the stale wrong-target drift from the first attempt is resolved.
- STATECANARY reran `registered_state` as a guarded live singleton. The wrapper completed cleanly, no stale select or wrong-target drift appeared, and no Physical Operating Address or Bank Address ambiguity appeared.
- STATECANARY still did not add trusted live evidence for `registered_state`: all 4 checks were skipped because the intended live-discovery target was not available as a merchant input, so `targetDiagnostics` stayed null and no mutating verification ran.
- `registered_state` is therefore excluded from immediate live sprint work. It is now a live-discovery target-availability resolver, not a quick coverage canary.
- TARGETAVAILABILITY resolved the shared discovery-index handoff bug non-live. Refreshed findings now classify `proof_of_business_type` and `federal_tax_id_type` as offline-trusted and ready for a guarded rerun; `registered_state` still needs one guarded confirmation run before it can re-enter the clean coverage lane.

## COVERAGENEXT Candidate Classification

- Clean live candidate: `proof_of_business_type`, `federal_tax_id_type`.
- Live candidate with expected policy/manual-review rows but useful trusted targeting coverage: `registered_address_line_1`, `registered_address_line_2`, `registered_city`, `stakeholder_job_title`.
- Missing-proof capture unlock: `stakeholder_first_name`, `stakeholder_last_name`, `proof_of_address_type`, `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket`.
- Resolver work required now: none ahead of the next batch; current unresolved work is proof, capture, policy, or live-discovery bound rather than a mapping-logic bug.
- Product-policy decision required before reuse: `website`.
- Sensitive/defer: `date_of_birth`, raw tax or bank-value fields, and upload or signature-adjacent controls.
- Address/live-discovery blocker: `registered_state`, `registered_country`, `business_mailing_*`, and Physical Operating Address post-toggle capture.
- Already proven / do not rerun: the live-proven concepts listed above, including `naics`, `merchant_category_code`, `postal_code`, `bank_account_type`, and `proof_of_bank_account_type`.

## Recommended Next Action

- Recommended next action: run a guarded live batch for `proof_of_business_type` and `federal_tax_id_type`.
- Coverage rationale: this is the highest-confidence remaining same-family batch. Both concepts are mapped with `trust_current_mapping` / `trusted_by_label`, have no missing-proof blocker, are absent from current interactive history, and extend the already-proven controlled-choice metadata family without touching raw tax or bank values.
- Why not stakeholder-name capture first: it is still the smallest remaining proof unlock after this batch, but it does not itself add trusted live coverage and is slower than the remaining clean controlled-choice lane.
- Why not the address or stakeholder-job-title batch first: those concepts are viable only if the batch intentionally accepts policy/manual-review rows. They are useful fallback coverage, but they are no longer the fastest clean expansion path.
- Why not website or DOB first: `website` still carries prior product-finding history that needs an explicit policy decision before reuse, and `date_of_birth` remains sensitivity-bound.
- Fallback order if the clean batch stops early: `proof_of_address_type` proof capture if upload-adjacent ambiguity is the blocker; otherwise stakeholder-name screenshot proof; only then reopen the registered-address text family as an intentional manual-review batch.