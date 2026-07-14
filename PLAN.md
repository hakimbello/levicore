# Levi Core Build Plan

## Current Milestone

M0: Product and Scope Lock

Status: COMPLETE

## Completion Rules

- One task at a time.
- Every task maps to an approved requirement or M0 foundation deliverable.
- No implementation begins before M0 approval.
- A task is complete only after its acceptance criteria pass.
- Failed or partial tasks do not increase progress.

## M0 Product and Scope Lock

### M0-001 Initialize Repository

Objective: Create repository and foundation entry point.

Files:

- README.md

Acceptance criteria:

- Repository has a main branch.
- README identifies current milestone and source-of-truth files.

Status: COMPLETE

### M0-002 Establish Constitution

Objective: Lock scope, evidence, assumption, external-component, and completion rules.

Files:

- LEVI_CONSTITUTION.md

Acceptance criteria:

- No-feature-expansion rule exists.
- No-silent-assumption rule exists.
- Evidence-before-claims rule exists.
- 100-percent completion standard exists.

Status: COMPLETE

### M0-003 Define Product

Objective: Define Levi Core, its user, problem, goal, constraints, and non-goals.

Files:

- PRD.md

Acceptance criteria:

- Product definition is specific.
- Primary user is specific.
- Core problem is documented.
- Non-goals are explicit.

Status: COMPLETE

### M0-004 Lock MVP Requirements

Objective: Define numbered MVP requirements and acceptance criteria.

Files:

- MVP_SCOPE.md

Acceptance criteria:

- Every MVP function has a requirement ID.
- Every requirement has testable acceptance criteria.
- Out-of-scope features are explicit.
- Completion formula is explicit.

Status: COMPLETE

### M0-005 Define Architecture

Objective: Map approved requirements to modules, interfaces, state, and trust boundaries.

Files:

- ARCHITECTURE.md

Acceptance criteria:

- Each module maps to a requirement.
- External components use adapters.
- Task state machine is explicit.
- Model output and repository content are treated as untrusted.

Status: COMPLETE, AWAITING OWNER APPROVAL

### M0-006 Define AI Rules

Objective: Bind every coding agent to the approved workflow.

Files:

- AI_RULES.md

Acceptance criteria:

- Agent reads controlling documents first.
- Agent rejects out-of-scope work.
- Agent does not invent facts or validation.
- Required pre-task and post-task reports are defined.

Status: COMPLETE, AWAITING OWNER APPROVAL

### M0-007 Evaluate Open-Source Foundations

Objective: Evaluate candidate repositories without integrating them.

Files:

- OSS_EVALUATION.md

Acceptance criteria:

- Candidates are scored for license, maintenance, security, architecture fit, integration effort, and replacement difficulty.
- Adopt, study, and reject decisions are explicit.
- No integration occurs during evaluation.

Status: COMPLETE

### M0-008 Owner Scope Approval

Objective: Owner reviews and approves M0 documents.

Acceptance criteria:

- Constitution approved.
- PRD approved.
- MVP scope approved.
- Architecture approved.
- Build plan approved.
- AI rules approved.
- OSS decisions approved.

Status: COMPLETE

## M1 Repository Intake and Analysis

Begins only after M0-008 is complete.

Planned requirement order:

1. LC-MVP-001 Repository Intake.
2. LC-MVP-002 Repository Analysis.

No other implementation is approved during M1.
