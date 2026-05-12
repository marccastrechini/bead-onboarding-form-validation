# Validation Coverage Ledger

Generated for the COVERAGESPRINT workstream on 2026-05-08.
Updated during ADDRESSLEDGER on 2026-05-08.
Updated during PROOFOFADDRESSLEDGER on 2026-05-12.

## Scope And Safety

This ledger tracks cumulative validation progress across focused guarded runs. The latest scorecard percentage is latest-run scoped, so it can understate cumulative project coverage after a narrow canary overwrites the latest interactive artifacts.

No raw field values, PII, DocuSign URLs, tokens, screenshots, tax IDs, routing numbers, account numbers, or signer secrets are recorded here.

## Latest Focused Scorecard

- Latest focused run scope: `proof_of_address_type`.
- Latest scorecard coverage: 5/277 (2%), grade D.
- Latest findings summary: product findings 0; ambiguous findings 1; mapping-blocked 0; ready-for-rerun 0.
- Latest focused run added 4 trusted executed observations across 1 concept.
- Interpretation: the latest scorecard remains latest-run scoped rather than cumulative. The focused `proof_of_address_type` canary produced trusted live evidence on the Registered Legal Address proof-of-address selector, with 4 executed checks, 3 passed results, 1 field-local observational manual-review row, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and no drift into `document_type`, stakeholder selectors, upload widgets, or file-value echoes.

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
- `proof_of_business_type`
- `federal_tax_id_type`
- `registered_address_line_1`
- `registered_address_line_2`
- `registered_city`
- `proof_of_address_type`

## Live-Proven Field Families

- Controlled-choice metadata: legal entity type, business type, bank account type, proof-of-bank-account type, proof-of-business type, federal tax ID type, proof-of-address type.
- Contact channels: email and phone.
- Business and contact text-name fields: business name, DBA name, location name, contact first name, contact last name.
- Long/free text: business description.
- Date behavior: registration date.
- Stakeholder contact channels: stakeholder email and stakeholder phone.
- Ownership percentage.
- Numeric/code fields: NAICS and merchant category code.
- Registered legal address text behavior: address line 1, address line 2, and city.
- Registered legal ZIP/postal behavior: postal code.

## Policy-Manual-Review Areas

- Text-name very-short behavior.
- Text-name symbol-heavy behavior for location and contact names.
- Business description very-short and garbage-text behavior.
- Registration date alternate format and future-date behavior.
- Stakeholder job title very-short and special-character behavior unless later policy resolves it.
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

- Current live-proven concept count: 25 concepts.
- Current live-proven behavior-family count: approximately 10 families.
- Latest focused scorecard coverage is 5/277 (2%) because it is latest-run scoped.
- Latest focused `proof_of_address_type` canary added 4 trusted executed observations, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and 1 field-local observational manual-review row.
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

## COVERAGEACCOUNTING Candidate Classification

- Clean live candidate: none remaining. No remaining non-sensitive multi-concept batch currently meets the clean trusted-target expansion bar without first resolving proof, policy, or live-discovery blockers.
- Live candidate likely to produce manual-review rows: `stakeholder_job_title`.
- Missing-proof capture unlock: `stakeholder_first_name`, `stakeholder_last_name`.
- Resolver work required: `document_type`.
- Product-policy decision required: `website`.
- Sensitive/defer: `date_of_birth`, raw SSN/EIN/tax-value fields, routing number, account number, bank-value fields, upload/signature/acknowledgement controls, and finalization-adjacent controls.
- Frozen/address/live-discovery blocked: `registered_state`, `registered_country`, `business_mailing_*`, bank-address fields, and Physical Operating Address post-toggle capture.
- Amount/capture blocker: `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket`.
- Already live-proven: the live-proven concepts listed above, now including `proof_of_address_type`, `proof_of_business_type`, `federal_tax_id_type`, `registered_address_line_1`, `registered_address_line_2`, `registered_city`, `naics`, `merchant_category_code`, and `postal_code`.

## Recommended Next Action

- Recommended next action: run one guarded live singleton for `stakeholder_job_title`.
- Coverage rationale: there is still no remaining clean multi-concept live batch, but `proof_of_address_type` is now closed as live-proven. The best coverage-over-complexity move is the next non-sensitive singleton whose expected outcome can tolerate field-local manual-review rows as long as the target stays trusted and no mapping drift appears.
- Why this beats `document_type` first: `document_type` still sits in page-3 metadata resolver territory and does not yet offer a clearly lower-risk or higher-yield path than a single job-title canary.
- Why this beats `stakeholder_first_name` and `stakeholder_last_name` first: both remain unresolved in calibration and still depend on stale page-3 neighbor collapse or missing field-local proof.
- Why not `website` or `date_of_birth` first: `website` still sits in product-policy territory, and `date_of_birth` is sensitive even though calibration is strong.
- Why not `registered_state`, bank-address fields, or `business_mailing_*` first: they remain blocked by live-discovery availability or field-local address-capture issues, so they are less efficient for immediate cumulative coverage expansion.