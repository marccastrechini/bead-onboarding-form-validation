# Validation Coverage Ledger

Generated for the COVERAGESPRINT workstream on 2026-05-08.
Updated during ADDRESSLEDGER on 2026-05-08.
Updated during PROOFOFADDRESSLEDGER on 2026-05-12.

## Scope And Safety

This ledger tracks cumulative validation progress across focused guarded runs. The latest scorecard percentage is latest-run scoped, so it can understate cumulative project coverage after a narrow canary overwrites the latest interactive artifacts.

No raw field values, PII, DocuSign URLs, tokens, screenshots, tax IDs, routing numbers, account numbers, or signer secrets are recorded here.

## Latest Focused Scorecard

- Latest focused run scope: `stakeholder_job_title`.
- Latest scorecard coverage: 6/277 (2%), grade D.
- Latest findings summary: product findings 0; ambiguous findings 2; mapping-blocked 0; ready-for-rerun 0.
- Latest focused run added 5 trusted executed observations across 1 concept.
- Interpretation: the latest scorecard remains latest-run scoped rather than cumulative. The focused `stakeholder_job_title` canary produced trusted live evidence on the `stakeholders #0 > Job Title` text control, with 5 executed checks, 3 passed results after report refresh, 2 field-local non-product manual-review rows, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and no drift into stakeholder first name, last name, email, phone, `date_of_birth`, ownership percentage, upload controls, signature controls, acknowledgement controls, or finalization controls.

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

- Current live-proven concept count: 26 concepts.
- Current live-proven behavior-family count: approximately 10 families.
- Latest focused scorecard coverage is 6/277 (2%) because it is latest-run scoped.
- Latest focused `stakeholder_job_title` canary added 5 trusted executed observations, 0 product findings, 0 mapping-blocked findings, 0 ready-for-rerun findings, and 2 field-local non-product manual-review rows.
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

## STAKEHOLDERJOBTITLELEDGER Candidate Classification

- Clean live candidate: no safe multi-concept batch remains. `bank_name` is high-confidence and non-sensitive as a label concept, but because it sits in the Banking section next to routing/account/deposit controls, it should be run only as a guarded singleton with strict drift stops.
- Live candidate likely to produce manual-review rows: `bank_name`; expected name/text behavior may leave field-local manual-review rows, and any such rows are acceptable only if target-trusted, non-product, and not mapping drift.
- Missing-proof capture unlock: `stakeholder_first_name`, `stakeholder_last_name`.
- Resolver work required: `document_type`.
- Product-policy decision required: `website`.
- Sensitive/defer: `date_of_birth`, raw SSN/EIN/tax-value fields, routing number, account number, bank-value fields, upload/signature/acknowledgement controls, and finalization-adjacent controls.
- Frozen/address/live-discovery blocked: `registered_state`, `registered_country`, `business_mailing_*`, bank-address fields, and Physical Operating Address post-toggle capture.
- Amount/capture blocker: `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket`.
- Already live-proven: the live-proven concepts listed above, now including `stakeholder_job_title`, `proof_of_address_type`, `proof_of_business_type`, `federal_tax_id_type`, `registered_address_line_1`, `registered_address_line_2`, `registered_city`, `naics`, `merchant_category_code`, and `postal_code`. The latest scorecard still lists many of these as not-run because it is latest-run scoped; do not treat those latest-run gaps as cumulative regressions.
- Remaining high-confidence non-sensitive metadata after excluding already-live-proven and policy/sensitive lanes: `bank_name` is the best immediate coverage singleton, but it is not suitable for a batch because of Banking-section adjacency risk.

## Recommended Next Action

- Recommended next action: B. One guarded live singleton for `bank_name`.
- Coverage rationale: there is still no remaining safe multi-concept live batch, and `stakeholder_job_title` is now closed as live-proven. The best coverage-over-complexity move is the next high-confidence, non-sensitive singleton. `bank_name` can expand coverage if and only if the verifier stays on the Bank Name text target and does not drift into nearby sensitive banking controls.
- Why this beats `document_type` first: `document_type` remains resolver work in attachment metadata territory and does not yet offer a cleaner or higher-yield live lane.
- Why this beats `stakeholder_first_name` and `stakeholder_last_name` first: both remain unresolved in calibration and still need missing-proof/capture unlock work before a guarded live attempt.
- Why this beats `website` or `date_of_birth` first: `website` remains product-policy territory, and `date_of_birth` is sensitive even though calibration is strong.
- Why not a batch: Banking adjacency makes `bank_name` unsafe to batch with routing number, account number, bank account type, bank address, deposit-method controls, or any other Banking-section field.
- Why not `registered_state`, bank-address fields, or `business_mailing_*` first: they remain blocked by live-discovery availability or field-local address-capture issues, so they are less efficient for immediate cumulative coverage expansion.
- Exact next watchdog command: `npm run interactive:watchdog -- -Concepts bank_name -TimeoutSeconds 240 -PollSeconds 15`.
- Hard stop conditions for that next prompt: stop with no retry if target verification is not trusted, target resolves outside Bank Name, target drifts to routing number, account number, bank account type, deposit method, bank address, phone/email/date/numeric controls, upload/signature/acknowledgement/finalization controls, any product finding appears, any mapping-blocked output appears, the run times out, artifacts look partial, or any raw bank value/PII exposure risk appears.
- The next prompt must use the repo AI handoff workflow and commit only allowed handoff files plus any explicitly eligible docs/source/test changes.

### Exact Next Copilot Prompt

```text
CHAT ID: BANKNAMECANARY

Use the repo AI handoff workflow. Work inside C:\Projects\bead-onboarding-form-validation.

Goal: run exactly one guarded live singleton for bank_name to determine whether it can be added to cumulative live-proven coverage. Do not run a full batch. Do not include any concept outside bank_name. Do not enable DESTRUCTIVE_VALIDATION. Do not upload files or click Submit, Sign, Adopt, Finish, Complete, or any envelope-finalizing control. Do not expose raw DocuSign URLs, tokens, raw values, IDs, screenshots, raw bank values, account numbers, routing numbers, or PII.

Preflight: run git status --short, the repo-owned process scan, and the live env cleanup check from the ledger workflow. Stop and write a blocked handoff if live-related residue or dirty unrelated changes are present.

Run exactly:
npm run interactive:watchdog -- -Concepts bank_name -TimeoutSeconds 240 -PollSeconds 15

Do not retry. If the wrapper completes, run npm run reports:refresh and npm run findings:open. Inspect only the allowed summary, target diagnostics, validation results, findings, scorecard, and mapping calibration JSON artifacts. Determine whether bank_name reached trusted live target verification, whether any manual-review rows are field-local and non-product, whether product findings or mapping-blocked rows appeared, and whether the target stayed separate from routing number, account number, bank account type, deposit method, bank address, phone/email/date/numeric controls, upload, signature, acknowledgement, and finalization controls.

Hard stop with no retry if target verification is not trusted, target drifts outside Bank Name, product findings appear, mapping-blocked output appears, the run times out, artifacts look partial, or any raw bank value/PII exposure risk appears.

Update artifacts/ai-handoff/status.json and artifacts/ai-handoff/latest-copilot-result.md, then commit and push only the allowed handoff files with a message starting AI-HANDOFF: BANKNAMECANARY ready for ChatGPT review.
```
