# Levi Core MVP Scope

## Scope Status

LOCKED after owner approval.

No feature enters implementation unless it maps to a requirement below.

## Approved Requirements

### LC-MVP-001 Repository Intake

Levi accepts a local repository path and verifies the repository exists and is readable.

Acceptance criteria:

- Invalid paths return a clear error.
- Unsupported or unreadable repositories do not proceed.
- Repository metadata is recorded without modifying project files.

### LC-MVP-002 Repository Analysis

Levi scans supported source and documentation files and produces a verified project summary.

Acceptance criteria:

- Respects ignore rules and excludes secrets, generated files, dependencies, and binaries.
- Identifies languages, frameworks, package managers, entry points, tests, and major directories when evidence exists.
- Every reported fact contains a source file or deterministic signal.
- Unknown facts remain UNKNOWN.

### LC-MVP-003 Persistent Project Memory

Levi stores verified project facts, approved decisions, task outcomes, and failed attempts across sessions.

Acceptance criteria:

- Memory remains isolated by project.
- Every memory record has a type, source, timestamp, and confidence state.
- Unverified model output never becomes approved project truth.
- Users can inspect and remove stored project memory.

### LC-MVP-004 Scope Enforcement

Levi checks each requested task against approved project requirements before execution.

Acceptance criteria:

- In-scope tasks proceed to planning.
- Out-of-scope tasks stop before file modification.
- Ambiguous tasks are marked ASSUMPTION REQUIRES APPROVAL.
- New ideas are recorded separately and do not alter active scope.

### LC-MVP-005 Task Planning

Levi produces a constrained implementation plan before changing files.

Acceptance criteria:

- Plan names the requirement ID.
- Plan lists expected files, acceptance criteria, validation commands, risks, and exclusions.
- Execution does not begin until the plan is approved.

### LC-MVP-006 Model Gateway and Routing

Levi supports replaceable local or remote model providers through one internal interface.

Acceptance criteria:

- Business logic does not call provider SDKs directly.
- At least one local provider and one remote provider are supported.
- Routing records selected model, reason, estimated cost class, and fallback.
- Spending and iteration limits are enforced.

### LC-MVP-007 Coding Execution

Levi sends an approved task plan to a replaceable coding executor that can create, update, and delete project files under controlled permissions.

Acceptance criteria:

- Executor accesses only the active repository.
- Planned file boundaries are enforced.
- Destructive or irreversible actions require approval.
- Every changed file is recorded.
- Execution has time, step, and cost ceilings.

### LC-MVP-008 Validation

Levi runs approved validation commands and records actual results.

Acceptance criteria:

- Commands run from the correct repository root.
- Exit codes and relevant output are stored.
- Failed validation prevents completion status.
- Levi never fabricates test results.

### LC-MVP-009 Completion Reporting

Levi reports exact work performed and updates project state only after validation.

Acceptance criteria:

- Report contains requirement ID, exact files changed, change summary, commands run, results, known failures, and remaining work.
- Partial work is marked partial or failed.
- Verified task outcomes become project memory.

### LC-MVP-010 Primary User Interface

The first user interface is a command-line application.

Acceptance criteria:

- User can initialize a project, inspect status, request a task, approve a plan, execute, validate, and review results.
- CLI communicates only through Levi Core interfaces.
- Interface errors do not corrupt project state.

## Explicitly Out of Scope

- VS Code extension.
- Standalone IDE.
- Autocomplete.
- Team collaboration.
- Cloud memory synchronization.
- Autonomous deployment.
- Marketplace integrations.
- Mobile applications.
- Voice control.
- Automatic feature invention.
- Autonomous execution without approval.
- Business lifecycle modules beyond the approved software engineering workflow.

## MVP Completion Formula

MVP progress equals passed requirements divided by ten.

A requirement counts as complete only after all acceptance criteria and required tests pass.
