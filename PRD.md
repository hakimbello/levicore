# Levi Core Product Requirements Document

## Product Definition

Levi Core is a model-independent AI software engineering operating system for solo builders. It helps a user understand a repository, preserve project decisions, plan approved work, execute code changes, validate results, and finish projects without scope drift.

## Primary User

A solo builder who uses AI coding tools to build production software and needs stronger project memory, scope control, validation, and cost control.

## Core Problem

Current coding assistants help modify code but often lose project context, invent assumptions, expand scope, repeat failed work, and report completion without sufficient evidence. Users must coordinate planning, memory, coding, testing, and model selection across separate tools.

## Product Goal

Provide one controlled workflow where the user issues coding commands and Levi:

1. Reads approved project requirements.
2. Understands the repository.
3. Retrieves relevant project memory.
4. Checks task scope.
5. Plans the change.
6. Executes approved code work.
7. Validates the result.
8. Records verified project state.

## Jobs To Be Done

- Understand an unfamiliar or returning codebase.
- Continue work without repeatedly explaining the project.
- Prevent unapproved feature expansion.
- Select an appropriate model without vendor lock-in.
- Modify code through direct commands.
- Verify work before marking it complete.
- Track exact project progress.

## MVP Success Criteria

- A user opens a supported repository and receives a verified project summary.
- Levi stores and retrieves approved project decisions across sessions.
- Every coding task maps to an approved requirement.
- Levi produces a task plan before file changes.
- Levi executes approved code edits through a coding executor.
- Levi runs configured validation and reports exact results.
- Levi records exact files changed and remaining work.
- The user can complete a real project task through the full workflow.

## Constraints

- Solo-founder budget.
- Open-source foundations are preferred.
- Model providers must remain replaceable.
- Local operation is preferred where practical.
- Scope remains frozen until MVP completion.

## Non-Goals

The MVP does not include:

- A standalone IDE.
- Autocomplete.
- Team collaboration.
- Cloud project synchronization.
- Autonomous deployment.
- Marketplace integrations.
- Mobile applications.
- Voice control.
- Business management features outside software delivery.

## Product Risks

- Excessive scope.
- Unreliable project memory.
- Incorrect repository interpretation.
- Unsafe code execution.
- Model cost overruns.
- External dependency lock-in.
- False completion reports.

## Launch Gate

The MVP is launch-ready only when all requirements in MVP_SCOPE.md pass their acceptance criteria and all mandatory validation in PLAN.md succeeds.
