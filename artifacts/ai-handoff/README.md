# AI Handoff

This directory is the shared bridge between VS Code Copilot agent-mode work and ChatGPT review through the GitHub repository.

Copilot should update these files at the end of any substantial implementation, test, refactor, coverage, automation, or documentation task:

- `latest-copilot-result.md`: concise human-readable result for review.
- `status.json`: machine-readable status pointer to the latest handoff.

Each handoff should state the objective, files changed, tests run, results, blockers or uncertainty, coverage movement when relevant, artifacts created, commit or branch status, and the recommended next Copilot prompt.

ChatGPT should review the latest committed handoff by reading `status.json`, then opening `latest-copilot-result.md` and checking the referenced files, tests, artifacts, and unresolved uncertainty.

Only this directory is intended to be committed from `artifacts/`; unrelated generated artifacts should remain ignored.