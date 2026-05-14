## ChatGPT Review Summary
- What changed: RUN17 added a bounded fallback inventory for visible discovered radio-like controls and cue-only physical-address fragments in `fixtures/conditional-discovery.ts` when no eligible `address_option` toggle candidates exist, and safely broadened selection only for exactly one visible editable radio-like control near explicit `Physical Operating Address` or `Business Physical Address` cues with no mailing/legal/virtual ambiguity. Focused coverage was expanded in `tests/bootstrap-units.spec.ts`. No live bootstrap/capture command was run in RUN17.
- Whether fallback radio-like inventory was added: yes. The new fallback inventory reports bounded visible-radio counts, role=radio counts, bounded radio-like entries, cue-only observations, truncation counts, redacted label/group/nearby fragments, cue-match flags, and exclusion reasons.
- Whether the matcher was broadened or inventory-only: broadened, but only for the locally proven safe case where zero eligible `address_option` candidates exist and exactly one visible editable radio-like control sits near explicit `Physical Operating Address` or `Business Physical Address` cues with no mailing/legal/virtual ambiguity.
- What guardrails were preserved: no live signer URL was consumed; the capture-only safety model stayed intact; the fallback path still fails closed on mailing, legal, virtual, multiple-match, and no-control cases; diagnostics remain bounded and redacted; no uploads, destructive validation, broader discovery, `.env` changes, or finalization actions were introduced.
- Whether the result moved us forward: yes. RUN16's empty bounded inventory is now locally characterized with a second-tier radio-like view, and the matcher can safely recover a uniquely identifiable explicit physical-address radio-like control if discovery misses `address_option` typing.
- Tests/commands run and pass/fail: `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` passed (10/10); `npm run test:units` passed (263/263).
- Remaining blocker / uncertainty: the fallback inventory and safe fallback selection are still locally validated only. A future authorized live rerun is still needed to determine whether the signer page exposes a discoverable radio-like control, or whether a deeper control-type/DOM association gap remains.
- Continue / stop / redirect: continue.
- Another live capture recommended next: yes, but only if explicitly authorized. Exact next run ID: `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN18`.

# Copilot Handoff Result

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN17

## Status
Ready for ChatGPT review

## Objective
Do not run another live capture. Add a source/test-only fallback inventory for visible radio-like controls and safe nearby physical-address cues when the operating-address candidate set is empty, then validate it locally.

## What Changed
- Added a bounded fallback inventory in `fixtures/conditional-discovery.ts` when no eligible `address_option` toggle candidates exist.
- The fallback inventory now reports:
  - visible radio input count
  - visible role=radio count
  - visible radio-like candidate count
  - eligible and matching fallback-candidate counts
  - bounded radio-like entries with safe field key, kind, role, input type, control category, visibility/editability, inferred type, redacted label/group/nearby fragments, cue-match flags, and exclusion reasons
  - bounded cue-only observations for non-radio discovered controls that still carry physical-address cue fragments
  - truncation counts for both radio-like entries and cue-only observations
- Safely broadened selection so the guarded matcher can pick exactly one visible editable radio-like control when:
  - no eligible `address_option` candidates exist
  - the control is a merchant-input radio-like field
  - nearby/group cues explicitly indicate `Physical Operating Address` or `Business Physical Address`
  - no mailing, legal, or virtual cue ambiguity is present
- Expanded focused unit-style coverage in `tests/bootstrap-units.spec.ts` for:
  - explicit `Physical Operating Address` fallback selection
  - `Business Physical Address` role=radio fallback selection
  - mailing exclusion under fallback
  - multiple radio-like physical-cue candidates failing closed
  - cue-only observations when no radio-like controls exist
  - fallback-inventory redaction of URLs, emails, tokens, and arbitrary text values

## Guardrails Preserved
- No live bootstrap/capture command was run.
- `bootstrap:interactive` was not run.
- `interactive:watchdog` was not run.
- Full signer discovery was not run.
- `DESTRUCTIVE_VALIDATION` was not enabled.
- No uploads were performed.
- No Finish, Complete, Submit, Sign, Adopt, or finalization controls were clicked.
- No raw signer URL was printed or committed.
- `.env` was not mutated.
- Generated artifacts were not staged or committed.
- Mailing, legal, virtual, ambiguous, and no-control fallback cases still fail closed.

## Files Changed
- `fixtures/conditional-discovery.ts`
- `tests/bootstrap-units.spec.ts`
- `artifacts/ai-handoff/status.json`
- `artifacts/ai-handoff/latest-copilot-result.md`

## Validation
- `npx playwright test tests/bootstrap-units.spec.ts --project=chromium -g "guarded physical address discovery"` -> passed (10 passed)
- `npm run test:units` -> passed (263 passed)
- `npm run bootstrap:capture:physical-address` was not run in RUN17 by design

## Result
- Forward progress: yes.
- RUN17 characterizes RUN16's empty candidate set more completely with a fallback radio-like inventory and cue-only observations.
- The matcher now recovers the smallest safe explicit physical-address radio-like case without broad guessing.
- Fail-closed behavior remains intact when fallback conditions are not uniquely safe.

## Remaining Blocker / Uncertainty
- The fallback inventory and safe fallback selection are still validated only through focused and unit-style tests.
- A fresh live signer landing is still needed to confirm whether the page exposes a discoverable radio-like control that the fallback path can recover.
- If the next live run still fails, the new fallback inventory should clarify whether the remaining gap is missing controls, missing cue association, or a non-radio control type.

## Recommendation
Continue.

Another live capture is recommended next only if explicitly authorized, using:
`PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN18`

## Recommended Next Copilot Prompt
Run `PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN18`: execute exactly one authorized `npm run bootstrap:capture:physical-address`, keep the current safety constraints, verify whether the fallback radio-like inventory or safe fallback selection now surfaces exactly one live operating-address control and fresh post-toggle artifacts, and if it still fails, capture the bounded fallback inventory outcome without committing generated artifacts.

## Branch / Commit Status
- Branch: `main`
- Pre-RUN17 commit: `6de3e0c9edb9c3f37f01b9309006da3e3875e7a1`
- RUN17 handoff commit: pending at write time

## Commit Scope
- Stage and commit:
  - `fixtures/conditional-discovery.ts`
  - `tests/bootstrap-units.spec.ts`
  - `artifacts/ai-handoff/status.json`
  - `artifacts/ai-handoff/latest-copilot-result.md`
- Do not commit:
  - `artifacts/latest-*`
  - `artifacts/latest-physical-operating-address-*`
  - `artifacts/playwright*`
  - `.env`
  - `samples/private/**`

CHAT ID: PHYSICALADDRESSCAPTUREEMAILRUNNER-20260513-RUN17