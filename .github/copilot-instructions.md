## AI Handoff Protocol

- For any substantial agent-mode implementation, test, refactor, coverage, automation, or documentation task, finish by updating the AI handoff files.
- Do not use the handoff for tiny one-off Q&A unless explicitly requested.
- At the end of the run, update:
  - `artifacts/ai-handoff/latest-copilot-result.md`
  - `artifacts/ai-handoff/status.json`
- The handoff must be concise, factual, and useful for ChatGPT review.
- Include objective, files changed, tests run, results, blockers, uncertainty, and recommended next prompt.
- If tests fail, still write the handoff and clearly mark the failure.
- If no commit/push was possible, explain why in the handoff.
- Use commit messages starting with:
  `AI-HANDOFF: <run_id> ready for ChatGPT review`