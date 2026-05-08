# Validation Coverage Ledger

Generated for the COVERAGESPRINT workstream on 2026-05-08.
Updated during SPRINTRECOVER on 2026-05-08.

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

## Blocked Or Deferred Areas

- `registered_state` immediate live work until the live-discovery target is available again as a merchant input.
- Registered legal address text family remains frozen for clean-coverage work; only `postal_code` is currently live-proven in that family.
- `business_mailing_*` and Physical Operating Address post-toggle capture.
- Amount fields until separate editable controls are proven.
- Stakeholder first and last name until resolver work is done.
- Date of birth because of sensitivity and policy constraints.
- Website because of prior product-finding history.
- SSN, EIN, routing number, account number, and other tax or bank-sensitive fields.
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

## SPRINTRECOVER Candidate Classification

- Candidate for small live batch now: none.
- Candidate for live singleton now: none.
- High-value non-live resolver unlock: `stakeholder_first_name`, `stakeholder_last_name`.
- Policy-only blocker: `stakeholder_job_title`; a policy-accepted manual-review batch is not favored for clean-coverage expansion.
- Sensitive/defer: `website`, `date_of_birth`, `federal_tax_id_type`, tax and bank-sensitive value fields, and upload or signature-adjacent controls.
- Address/live-discovery blocker: `registered_state`, `registered_address_line_1`, `registered_address_line_2`, `registered_city`, `registered_country`, `business_mailing_*`, and Physical Operating Address fields.
- Amount/capture blocker: `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket`.
- Already proven / do not rerun: the live-proven concepts listed above, including `naics` and `postal_code`.

## Recommended Next Action

- Recommended next action: non-live resolver work for `stakeholder_first_name` and `stakeholder_last_name`.
- Coverage rationale: this is the fastest remaining path to a meaningful non-sensitive live batch after excluding `registered_state`, frozen address work, website, DOB, amount captures, and already-proven concepts.
- Why not amounts first: all four amount concepts remain `Not Found` with no sample PDF or MHTML proof of separate editable controls, so they need capture or screenshot proof before they become a practical sprint candidate.
- Why not a policy-manual-review batch: it would likely create ambiguous or policy-bound evidence rather than clean trusted live coverage, which conflicts with the current recovery goal.