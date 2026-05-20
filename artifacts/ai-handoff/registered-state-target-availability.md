# Registered State Target Availability

Run ID: REGISTEREDSTATETARGETAVAILABILITY-20260520-RUN64

Generated: 2026-05-20

Scope: source/test-only resolver planning. RUN64 does not run live capture, does not reopen Physical Operating Address, does not add Physical Operating Address diagnostics, does not modify calibrated slot-2 logic, and does not rely on stale May 1 Physical Operating Address artifacts.

## Current Classification

Current `registered_state` classification: resolver-required.

This run does not promote `registered_state` to calibration-ready.

## Why It Is Resolver-Required

The current blocker is target availability, not current list-control logic.

- The concept registry already treats `registered_state` as a Registered Legal Address list/select concept.
- The latest mapping calibration row still ends as `leave_unresolved` with `calibrationReason=no_unclaimed_neighbor_with_expected_shape` and `mappingDecisionReason=rejected_insufficient_label_proof`.
- The latest calibration evidence says:
  - sample layout evidence points to `Registered Legal Address > State`
  - no live field in the saved safe-mode report matched that sample anchor
  - the field was not found in the safe-mode report
- The coverage ledger records that the stale-slot and stale-select handoff bug was already fixed and that the later guarded rerun still skipped all four checks because the intended live-discovery target was not available as a merchant input.
- Unit tests already cover section-specific list anchoring and sparse-index target preservation for `registered_state`, which means the current blocker is not simply “state dropdowns are unsupported.”

## Blocker Classification

| Candidate blocker type | Verdict | Why |
|---|---|---|
| No distinct field target | yes, primary | The current saved/latest scoped evidence does not surface a visible editable Registered Legal Address State merchant-input target. |
| Ambiguous target | no, not primary | The section-specific Registered Legal Address list-target logic already exists, and prior stale wrong-target drift was resolved in STATEUNLOCK/STATECANARY. |
| Section/context ambiguity | no, not primary | The intended section is already bounded as `Registered Legal Address > State`; the issue is absence, not unresolved section competition. |
| Select/dropdown handling | no, not primary | `registered_state` is already modeled and tested as a list/select family concept. |
| State value normalization | no evidence | The current blocker happens before value mutation or value-shape evaluation. |
| Stale/latest-run-scoped evidence | yes, contributing | The latest generated findings/scorecard are latest-run scoped and do not represent cumulative progress, but the stronger blocker is still that the saved safe-mode evidence does not expose the target as available. |
| Another bounded reason | yes | Offline anchor trust exists, but live target availability as a visible/editable merchant input is still not demonstrated in the current evidence set. |

## What Existing Non-Live Evidence Already Proves

- `registered_state` should be treated as a Registered Legal Address list/select control, not a text field.
- Section-specific proof is required; Physical Operating Address and Bank Address state controls are not interchangeable.
- Sparse discovery-index handoff is already covered by unit tests.
- The current unresolved state does not imply that select/list handling is broken.

## What Existing Non-Live Evidence Does Not Yet Prove

- That the current saved/latest scoped flow actually exposes the intended Registered Legal Address State control as a visible editable merchant input.
- That the live target diagnostics will become non-null on the next guarded attempt.
- That `registered_state` is ready to be promoted from resolver-required to calibration-ready.

## Smallest Source/Test-Only Resolver Plan

1. Keep Physical Operating Address deferred and unchanged.
2. Treat `registered_state` as a target-availability resolver, not as a generic dropdown-handling problem.
3. Use the existing unit-tested list-target logic as the baseline assumption and do not reopen stale-slot or stale-select debugging unless new evidence contradicts it.
4. If a future source/test-only change is needed, prefer a bounded reporting/classification improvement that distinguishes “offline anchor trust exists but live target unavailable” from generic human-proof-needed states.
5. Only after that planning work is explicit should a future guarded live confirmation run be considered.

## Recommended Next Work Instead Of A Live Rerun In This Run

- Preserve the current classification: `registered_state` stays resolver-required.
- Do not claim target availability is solved.
- Do not promote `registered_state` to calibration-ready.
- Keep the next run source/test-only if possible and focus on sharpening target-availability reporting or guarded-run entry criteria.

## RUN64 Conclusion

`registered_state` is resolver-required because the intended Registered Legal Address State list control is not currently surfacing as an available merchant-input target in the saved/latest scoped evidence. The best current interpretation is: offline anchor trust exists, section-specific list handling exists, but target availability is still not proven.