---
description: "Use when: running a substantial repo task that must finish with an AI handoff for ChatGPT review"
agent: "agent"
argument-hint: "RUN_ID=... OBJECTIVE=... FOCUS_AREA=... TEST_COMMANDS=... EXPECTED_OUTPUT=..."
---

# AI Handoff Run

Use this prompt to complete a substantial agent-mode task and leave a concise handoff for ChatGPT review through the GitHub repository.

## Inputs

- `RUN_ID`: `<RUN_ID>`
- `OBJECTIVE`: `<OBJECTIVE>`
- `FOCUS_AREA`: `<FOCUS_AREA>`
- `TEST_COMMANDS`: `<TEST_COMMANDS>`
- `EXPECTED_OUTPUT`: `<EXPECTED_OUTPUT>`

## Workflow

1. Restate the objective in chat before making changes.
2. Inspect the repository structure, existing instructions, relevant source files, package scripts, and current git status before changing files.
3. Make the smallest safe changes needed for `OBJECTIVE`, focused on `FOCUS_AREA`.
4. Run the relevant tests from `TEST_COMMANDS`; if the listed commands are not appropriate, explain why and run the closest safe sanity check.
5. Update `artifacts/ai-handoff/latest-copilot-result.md` with the objective, files changed, tests run, results, blockers, uncertainty, coverage movement, artifacts, branch/commit status, and a recommended next Copilot prompt.
6. Update `artifacts/ai-handoff/status.json` with the run status, run id, branch, commit when available, completion time, summary file path, and ChatGPT review flag.
7. Commit and push unless blocked. Use a commit message beginning with `AI-HANDOFF: <RUN_ID> ready for ChatGPT review` unless the user provided a more specific message.
8. End with a short chat summary that includes the test result, commit/push result, and where the handoff was written.

## Expected Output

`<EXPECTED_OUTPUT>`