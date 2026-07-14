# Levi Core AI Rules

## Required Reading Order

Before any task, read:

1. LEVI_CONSTITUTION.md
2. PRD.md
3. MVP_SCOPE.md
4. ARCHITECTURE.md
5. PLAN.md
6. AI_RULES.md

## Scope Enforcement

- Every task must map to one approved requirement ID or active M0 task.
- If no mapping exists, stop with REJECTED_OUT_OF_SCOPE.
- Do not suggest, add, or implement new features during the locked build.
- Do not perform opportunistic cleanup.
- Do not expand the task because a related improvement appears useful.

## Truth and Assumptions

- Inspect before stating facts.
- Mark missing information UNKNOWN.
- Mark unresolved assumptions ASSUMPTION REQUIRES APPROVAL.
- Never invent repository structure, files, APIs, schemas, dependencies, commands, outputs, tests, or completion.
- Model output is not project truth.
- Only approved requirements and verified evidence control execution.

## Before Implementation

Return this task contract:

- Task ID
- Requirement ID
- Objective
- Evidence used
- Expected files to change
- Files that must not change
- Acceptance criteria
- Validation commands
- Security and regression risks
- Explicit exclusions
- Approval state

Do not modify files before approval.

## Implementation Rules

- Implement only the approved task.
- Use the smallest safe change.
- Restrict file access to the active repository.
- Do not introduce a dependency without approved OSS evaluation.
- Do not alter architecture without approval.
- Do not expose secrets to prompts, logs, memory, tests, or reports.
- Require approval for deletion, external communication, deployment, purchases, credential changes, and other irreversible actions.
- Stop when the approved task is complete.

## Validation Rules

- Run only approved validation commands.
- Record the exact command, working directory, exit code, and result.
- Never report a test as passed unless it ran successfully.
- Failed validation blocks COMPLETED status.
- Missing tooling or environment access must be reported as NOT RUN, with the reason.

## Required Completion Report

Return:

| Field | Required value |
|---|---|
| Task ID | Exact task |
| Requirement ID | Exact approved requirement |
| Root cause | One sentence when fixing a defect |
| Files changed | Exact paths |
| What changed | Specific summary |
| Out-of-scope changes | Must be none |
| Validation | Exact commands and results |
| Security impact | None or specific impact |
| Regression risk | None, low, medium, or high with reason |
| Status | COMPLETED, PARTIAL, FAILED, or REJECTED_OUT_OF_SCOPE |
| Remaining work | Exact unfinished approved work |

## Memory Rules

- Store verified facts with sources.
- Store approved decisions with approval evidence.
- Store failed attempts to prevent repetition.
- Do not convert inferred model output into approved memory.
- Never store secrets.
- Keep memory isolated by project.

## External Repository Rules

- Do not copy or integrate external code before OSS evaluation approval.
- Verify license compatibility.
- Record the exact upstream repository and version or commit.
- Place external integrations behind Levi-owned interfaces.
- Avoid modifying vendored code when an adapter is sufficient.

## Forbidden Behavior

- Feature invention.
- Silent requirement changes.
- Stealth refactors.
- Fake validation.
- Fake progress.
- Unbounded agent loops.
- Unapproved provider lock-in.
- Unapproved production deployment.
- Touching unrelated files.
