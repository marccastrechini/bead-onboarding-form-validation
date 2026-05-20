# DocuSign Coverage Next Plan

Run ID: DOCUSIGNCOVERAGEDEFERPHYSICALADDRESS-20260520-RUN63

Generated: 2026-05-20

Scope: source/test-only planning update. RUN63 does not run live capture, does not change matcher logic, does not add radio/toggle diagnostics, does not change calibrated slot-2 behavior, and does not delete the Physical Operating Address work.

Decision summary: treat the Physical Operating Address lane as a known deferred blocker for planning. This is a reporting and prioritization decision, not a validation success. The four `business_mailing_*` concepts remain blocked/deferred, remain uncovered, remain not calibration-ready, and still cannot rely on the stale May 1 post-toggle artifacts.

## Coverage Views

| View | Numerator / denominator | Percent | What it means |
|---|---:|---:|---|
| Inclusive tracked-concept coverage | 27 / 59 | 45.8% | The full current baseline, including the four deferred `business_mailing_*` concepts. |
| Excluding known-deferred Physical Operating Address from the planning denominator | 27 / 55 | 49.1% | Planning-only view. The four deferred concepts are removed from the near-term denominator, but they are still blocked and still uncovered. |
| Inclusive direct stale/missing-artifact dependence | 11 / 59 | 18.6% | Four capture-blocked concepts plus seven missing-proof concepts. |
| Excluding known-deferred Physical Operating Address from the planning denominator | 7 / 55 | 12.7% | Planning-only view after removing the four deferred `business_mailing_*` concepts from the denominator and blocker count. |

Notes:

- The inclusive live-flow baseline remains `63%`. RUN63 does not recompute a Physical Operating Address-excluded live-flow percentage because the current stage denominator is a broad live-path estimate, not a concept-only denominator.
- The inclusive unresolved backlog is `32` concepts (`59 - 27`).
- The non-deferred unresolved backlog is `28` concepts (`55 - 27`).
- The immediate next-focus backlog named in this run is `12` concepts: `registered_state`, the four amount fields, and the seven missing field-local proof concepts.

## 1. What Are We Skipping?

RUN63 intentionally skips the Physical Operating Address radio/toggle lane as the next required blocker. That includes:

- additional radio/toggle debugging
- new Physical Operating Address diagnostics
- non-live Physical Operating Address capture-isolation work
- any live Physical Operating Address capture commands
- any attempt to promote the four `business_mailing_*` concepts to covered or calibration-ready status
- any reliance on the stale May 1 post-toggle structure or DOM artifacts as current proof

## 2. Why Are We Skipping It?

We are skipping it because the repo already has a bounded baseline for that lane, and continuing to treat it as the default next blocker is slowing broader coverage planning.

- The blocker is real, but it is late-stage and already well described.
- The current baseline already proves the live flow reaches signer surface, field discovery, deep guarded expansion, and preserved field inventory.
- The post-toggle artifacts are stale, so repeated planning that points back to the same lane does not improve the evidence base unless someone explicitly chooses to resume that resolver.
- Broader coverage can still move forward on other unresolved concepts without pretending that Physical Operating Address is solved.

## 3. What Coverage Looks Like Including It

This is the conservative full baseline view.

- Tracked concept coverage stays `27 / 59 = 45.8%`.
- Direct stale/missing-artifact dependence stays `11 / 59 = 18.6%`.
- The four `business_mailing_*` concepts remain visible in the blocker set.
- The known live-flow estimate remains `63%` inclusive.
- Physical Operating Address remains a blocked/deferred planning lane, not a success case.

## 4. What Coverage Looks Like Excluding It

This is a planning-only denominator adjustment so broader work can continue without pretending the deferred lane is done.

- Tracked concept coverage becomes `27 / 55 = 49.1%`.
- Direct stale/missing-artifact dependence becomes `7 / 55 = 12.7%`.
- The four `business_mailing_*` concepts are still explicitly listed as blocked/deferred; they are not removed from the record, only from the near-term planning denominator.
- This exclusion is not a validation win, not a calibration promotion, and not permission to use stale artifacts.

## 5. What We Should Work On Next Instead

### First Priority: `registered_state` Resolver / Target Availability

- Goal: recover a meaningful target-availability story for `registered_state` without reopening the Physical Operating Address lane.
- Why first: it is already called out as a resolver-required concept, and it is independent of the deferred Physical Operating Address blocker.
- Detailed RUN64 analysis: see `artifacts/ai-handoff/registered-state-target-availability.md`.

### Second Priority: Amount Fields

Target concepts:

- `annual_revenue`
- `highest_monthly_volume`
- `average_ticket`
- `max_ticket`

Focus:

- prove whether separate editable controls actually exist in this saved flow
- avoid overclaiming validation coverage until control availability is proven

### Third Priority: Missing Field-Local Proof Concepts

Target concepts:

- `stakeholder_first_name`
- `stakeholder_last_name`
- `bank_address_line_1`
- `bank_city`
- `bank_state`
- `bank_postal_code`
- `bank_country`

Focus:

- gather or recover stronger field-local proof
- keep these concepts blocked until the proof is good enough to support trusted mapping or guarded validation work

## Guardrails For Future Coverage Planning

- Keep Physical Operating Address marked as `known deferred blocker` until a future run explicitly resumes that lane.
- Keep all four `business_mailing_*` concepts visible as blocked/deferred.
- Do not mark them covered.
- Do not mark them calibration-ready.
- Do not rely on the stale May 1 artifacts.
- Do not treat the excluding-deferred coverage view as product or validation success.