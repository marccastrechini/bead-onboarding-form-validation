# DocuSign / Form Validation Coverage Baseline

Run ID: DOCUSIGNCOVERAGEBASELINE-20260520-RUN62

Generated: 2026-05-20

Scope: reporting-only baseline. RUN62 does not run live capture, does not change matcher logic, does not add diagnostics, and does not change calibrated fallback behavior.

Primary evidence used:

- Fresh RUN61 receipt: `artifacts/latest-physical-operating-address-capture-receipt.json` written 2026-05-20 07:50:59 local.
- RUN61 handoff and status in `artifacts/ai-handoff/latest-copilot-result.md` and `artifacts/ai-handoff/status.json`.
- Cumulative ledger in `docs/validation-coverage-ledger.md` updated 2026-05-13.
- Latest scorecard/findings artifacts from 2026-05-13, treated as latest-run scoped rather than cumulative.
- Artifact freshness timestamps for the Physical Operating Address post-toggle bundle.
- RUN62 safe unit test run: `npm run test:units` passed with 417 passed, 0 failed, 0 skipped in about 16.3 seconds.

## 1. Executive Summary

The live DocuSign flow currently gets through bootstrap/resend, Gmail invite detection, signing-link extraction, signer open, signer-surface reach, field discovery, and deep guarded-expansion setup. The freshest live receipt proves the runner reached the signer surface, completed field discovery, and preserved an initial visible field count of 126. The current live blocker is late and localized: the Physical Operating Address radio path reaches candidate inventory, selection summary, calibrated evaluation, anchorless evaluation, and click telemetry, but it does not finish UI validation, does not select a toggle slot, does not produce fresh post-toggle artifacts, and therefore does not produce fresh field-local proof for the four `business_mailing_*` concepts. Overall, the repo is closer to 50% than 75% coverage: the front half of the live flow is working reliably, but cumulative concept coverage is still below half and a stale May 1 post-toggle artifact bundle continues to block one four-concept cluster.

| Metric | Value | Denominator / Notes |
|---|---:|---|
| Estimated live flow coverage | 63% | Estimated as 7.5 of 12 high-level flow stages covered, with partial stages counted as 0.5. |
| Tracked concept coverage | 46% | 27 of 59 tracked concepts have cumulative trusted live evidence in the coverage ledger. |
| Estimated evidence confidence | 60% | Estimated from 5 baseline evidence pillars: fresh RUN61 receipt, cumulative ledger, RUN62 safe unit tests, latest-run scorecard/findings, and post-toggle artifacts. Three are current/reliable; two remain stale or scope-limited. |
| Concepts directly gated by stale or missing artifacts | 19% | 11 of 59 tracked concepts: 4 still capture-blocked concepts plus 7 concepts still missing field-local proof. This is 34% of the 32 unresolved concepts. |

## 2. Coverage Dashboard

| Area | Status | Evidence | Coverage estimate | Blocker | Next action |
|---|---|---|---:|---|---|
| Bootstrap/resend | passing | RUN61 receipt: `bootstrapResendAttempted=true`, `bootstrapResendSucceeded=true` | 100% | None in current baseline | Keep as known-good baseline entry point |
| Gmail invite detection | passing | RUN61 receipt: `gmailPollAttempted=true`, `gmailInviteFound=true` | 100% | None in current baseline | No action needed for baseline |
| Signing link extraction | passing | RUN61 receipt: `gmailSigningLinkExtracted=true` | 100% | None in current baseline | No action needed for baseline |
| Signer open / external warning handling | passing | RUN61 receipt: `openSignerAttempted=true`, `openSignerReachedSignerSurface=true`; external warning path not exercised in this receipt | 90% | External-warning subpath is unexercised, not failing | Revisit only if an external-warning interstitial returns |
| Signer surface reached | passing | RUN61 receipt: `signerSurfaceReached=true` | 100% | None | No action needed for baseline |
| Field discovery | passing | RUN61 receipt: `fieldDiscoveryAttempted=true`, `fieldDiscoveryCompleted=true` | 100% | None | No action needed for baseline |
| Field count / visible field inventory | passing | RUN61 receipt: `initialFieldCount=126`, `guardedExpansionInputFieldCount=126` | 100% | None | Preserve as current inventory baseline |
| Physical Operating Address toggle | partially passing | RUN61 receipt shows candidate inventory, selection summary, calibrated evaluation, anchorless evaluation, and click all attempted/completed, but `selectedToggleSlot=null` | 50% | Guarded-expansion setup / UI-validation path never yields a bounded selected-slot result | Stop the debug loop here for baseline purposes |
| Post-toggle artifact capture | stale evidence | RUN61 receipt: `artifactsFresh=false`, `captureReportPresent=false`; May 1 post-toggle files unchanged | 0% current | No fresh structure or DOM artifact was produced | Do not treat the May 1 bundle as current proof |
| Field-local proof extraction | blocked | Latest findings say the Physical Operating Address capture still does not isolate field-local labels | 0% for current Physical Operating Address proof | Capture anchor / bounds / DOM selector still too broad | Highest-value non-live resolver if work resumes |
| `business_mailing_*` concepts | blocked | RUN61 handoff/status classify all four as still capture-blocked | 0 of 4 concepts | No fresh field-local proof | Keep blocked in the baseline |
| Reports/findings refresh | stale evidence | RUN61 skipped `reports:refresh` and `findings:open`; latest generated findings are still May 13 and latest-run scoped | 0% freshness | Refresh intentionally skipped after fail-closed live receipt | Use the cumulative ledger, not latest-run scorecard/findings, for the overall baseline |
| Overall test suite health | passing | RUN62 safe `npm run test:units` passed with 417 passed, 0 failed, 0 skipped in about 16.3 seconds | 100% for the safe unit slice | None in the unit suite from this run | Keep this as the current non-live health check |

## 3. Flow-Stage Coverage

This section classifies the current live path by stage, using the freshest RUN61 receipt plus the latest cumulative ledger.

| Stage | Classification | Plain-English baseline |
|---|---|---|
| Bootstrap email resend | passing | Bootstrap can resend and proceed into the child capture path. |
| Gmail polling and invite detection | passing | The invite is found reliably enough to continue. |
| Signing-link extraction | passing | The signing link is extracted and handed to the child runner. |
| Signer open | passing | The signer is opened and the run reaches the signer surface. |
| External-warning handling | unknown | The latest receipt did not need this branch, so it is not currently disproven but also not freshly exercised. |
| Signer-surface wait | passing | The signer surface resolves without timing out. |
| Field discovery | passing | Discovery starts and completes successfully. |
| Initial visible-field inventory | passing | The baseline preserves `initialFieldCount=126`. |
| Guarded-expansion setup | blocked | The outer receipt classifies `guarded-expansion-setup-failed`. |
| Candidate inventory | passing | Candidate inventory was attempted and built before the late failure. |
| Selection summary | passing | Selection summary was attempted and completed. |
| Calibrated evaluation | passing | Calibrated evaluation was attempted and completed. |
| Anchorless evaluation | passing | Anchorless evaluation was attempted and completed. |
| Click path | passing | Click telemetry was attempted and completed. |
| UI validation after the click path | partially passing | UI validation was attempted but not completed. |
| Toggle-slot resolution | blocked | `selectedToggleSlot` remains null, so the run never proves a bounded selected option. |
| Post-click UI effect validation | not reached | The receipt says `postClickUiEffectValidationOutcome=not-required`, which means the run did not reach a state that required fresh visible-after proof. |
| Post-toggle artifact write | stale evidence | No fresh post-toggle structure or DOM artifact was written. |
| Findings / scorecard refresh after the run | stale evidence | Refresh was intentionally skipped, so the latest generated reports are older and scope-limited. |

## 4. Concept Coverage

The concept denominator is explicit: `fixtures/field-concepts.ts` tracks 59 concepts. The latest generated scorecard is not the right cumulative denominator source because it is latest-run scoped. For overall coverage, the cumulative ledger is the source of truth.

### 4.1 Classification Counts

| Classification | Count | Percent of 59 | Notes |
|---|---:|---:|---|
| Already live-proven | 27 | 45.8% | Trusted cumulative live evidence exists in the ledger. |
| Calibration-ready | 1 | 1.7% | `document_type` is the cleanest remaining guarded singleton. |
| Resolver-required | 5 | 8.5% | `registered_state` plus the four amount fields need a resolver or stronger target proof before meaningful live validation. |
| Missing field-local proof | 7 | 11.9% | Stakeholder first/last name and the five bank-address concepts still need stronger field-local proof. |
| Still capture-blocked | 4 | 6.8% | All four `business_mailing_*` concepts remain blocked by the Physical Operating Address post-toggle capture gap. |
| Unsafe / deferred | 10 | 16.9% | Policy-sensitive, omitted-in-flow, sensitive-value, or finalization-adjacent concepts. |
| Unknown / unclassified | 5 | 8.5% | Generic fallback address concepts are tracked, but the current cumulative evidence is section-specific rather than generic. |

### 4.2 Live-Proven Concepts

The cumulative ledger lists these 27 concepts as live-proven: `legal_entity_type`, `business_type`, `bank_account_type`, `bank_name`, `proof_of_bank_account_type`, `email`, `phone`, `business_name`, `dba_name`, `location_name`, `contact_first_name`, `contact_last_name`, `business_description`, `registration_date`, `stakeholder_email`, `stakeholder_phone`, `stakeholder_job_title`, `ownership_percentage`, `naics`, `merchant_category_code`, `postal_code`, `proof_of_business_type`, `federal_tax_id_type`, `registered_address_line_1`, `registered_address_line_2`, `registered_city`, and `proof_of_address_type`.

### 4.3 Remaining Concepts By Bucket

| Classification | Concepts |
|---|---|
| Calibration-ready | `document_type` |
| Resolver-required | `registered_state`, `annual_revenue`, `highest_monthly_volume`, `average_ticket`, `max_ticket` |
| Missing field-local proof | `stakeholder_first_name`, `stakeholder_last_name`, `bank_address_line_1`, `bank_city`, `bank_state`, `bank_postal_code`, `bank_country` |
| Still capture-blocked | `business_mailing_address_line_1`, `business_mailing_city`, `business_mailing_state`, `business_mailing_postal_code` |
| Unsafe / deferred | `website`, `date_of_birth`, `ein`, `ssn`, `routing_number`, `account_number`, `upload`, `acknowledgement_checkbox`, `signature`, `registered_country` |
| Unknown / unclassified | `address_line_1`, `address_line_2`, `city`, `state`, `country` |

### 4.4 Denominator Notes

- The denominator is known: 59 tracked concepts.
- The cumulative live-proven numerator is known: 27 concepts.
- The latest scorecard and findings are still useful for current blocker language, but they are latest-run scoped and should not be treated as cumulative regressions.
- The generic `address_line_1`, `address_line_2`, `city`, `state`, and `country` concepts remain conservatively unclassified because current cumulative evidence is section-specific and the generic fallback concepts do not yet have a clean baseline status in the ledger.

## 5. Physical Operating Address Status

### What We Know

- The live path reaches the signer surface and completes field discovery.
- The freshest receipt preserves `initialFieldCount=126`.
- Guarded expansion enters deeply enough that candidate inventory, selection summary, calibrated evaluation, anchorless evaluation, and click telemetry all reach attempted/completed states.
- UI validation is attempted but not completed.
- `selectedToggleSlot` remains null.
- No fresh post-toggle structure or DOM artifact is written.

### What Works

- Pre-toggle bootstrap and signer-open plumbing are working.
- The run can reach and inventory the field surface.
- Telemetry is deep enough to show that the blocker is no longer at discovery start-up.

### What Is Blocked

- The toggle path never produces a bounded selected-slot result.
- The receipt still carries an outer `postSignerFailureCategory=guarded-expansion-setup-failed` while the inner guarded-expansion failure cluster stays at `no-guarded-expansion-failure`.
- The post-toggle artifact pair is still the stale May 1 bundle.
- Without fresh field-local proof, all four `business_mailing_*` concepts remain blocked.

### Why This Blocker Matters

- It is the single biggest unresolved multi-concept cluster.
- One successful non-live resolver here can unlock four concepts at once.
- It is the clearest current gap between how far the live flow gets and how much of the form can be claimed as covered.

### Why It Should Not Obscure The Rest Of The Baseline

- The blocker is late in the flow, not at bootstrap or signer entry.
- It does not invalidate the known-good pre-toggle stages.
- It also does not erase the 27 concepts already recorded as cumulative live-proven coverage.
- The correct baseline conclusion is not "nothing works"; it is "the flow gets deep into the signer surface, but the Physical Operating Address proof lane is still the limiting step."

## 6. Artifact Freshness

| Artifact | Last write (local) | Freshness | Baseline interpretation |
|---|---|---|---|
| `artifacts/latest-physical-operating-address-capture-receipt.json` | 2026-05-20 07:50:59 | fresh | Fresh bounded receipt from RUN61; safe to use for current live-flow status. |
| `artifacts/latest-physical-operating-address-post-toggle-structure.json` | 2026-05-01 12:41:44 | stale | This is still the stale May 1 structure artifact and should not be treated as current proof. |
| `artifacts/latest-physical-operating-address-post-toggle-dom.html` | 2026-05-01 12:41:44 | stale | This is still the stale May 1 DOM artifact and should not be treated as current proof. |
| `artifacts/latest-validation-summary.md` | 2026-05-13 14:25:16 | stale / scope-limited | Safe-mode zero-control summary; not a reliable cumulative coverage baseline. |
| `artifacts/latest-validation-scorecard.md` | 2026-05-13 17:48:49 | scope-limited | Latest-run scoped. Useful for the most recent focused run, not for cumulative coverage. |
| `artifacts/latest-validation-findings.md` | 2026-05-13 17:48:50 | scope-limited | Latest-run scoped. Useful for current blocker language, not cumulative coverage totals. |

## 7. Test Health

- Safe non-live test required by this run: `npm run test:units`
- Result: passed
- Summary: 417 passed, 0 failed, 0 skipped, approximately 16.3 seconds
- Other safe reporting commands: not run in RUN62 because the existing artifacts were sufficient for the reporting baseline and there was no need to risk overwriting latest-run-scoped summaries.
- Prohibited live or interactive commands were not run in RUN62.

## 8. Baseline Recommendation

Stop here and use this as the current baseline.

No broken baseline/reporting script was found. The main uncertainty is already narrow and explicit: fresh live evidence reliably reaches the signer surface and discovery, but the Physical Operating Address proof lane still fails before fresh post-toggle artifacts exist. That is enough to establish a clean baseline without doing more source work in this run.

### Top Blockers

1. Physical Operating Address post-toggle proof is still blocked by stale or missing artifacts for four concepts.
2. `registered_state` still needs target-availability resolution before a meaningful guarded live rerun.
3. Stakeholder first/last name and bank-address concepts still need stronger field-local proof.
4. Amount fields still need proof that separate editable controls are actually available in this saved flow.

### What Would Move Coverage Most

1. A non-live Physical Operating Address capture-isolation fix that produces fresh, field-local post-toggle proof for the four `business_mailing_*` concepts.
2. A clean target-availability resolver for `registered_state`.
3. Focused proof capture for the seven concepts still blocked by missing field-local proof.

## 9. Next-Step Options

1. Baseline accepted: archive this report and pause, using 46% tracked-concept coverage and about 63% live-flow coverage as the current repo baseline.
2. Targeted fix: resume with a single non-live Physical Operating Address resolver so the stale May 1 post-toggle bundle is replaced by fresh, field-local proof for the four `business_mailing_*` concepts.
3. Full E2E validation: only do this after the Physical Operating Address post-toggle artifacts are fresh, `reports:refresh` is meaningful again, `registered_state` target availability is resolved, and the unresolved missing-proof concepts have stronger field-local evidence.