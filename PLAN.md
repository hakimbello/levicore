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

### M1-001 Repository Intake

Requirement ID: LC-MVP-001

Objective: Implement repository intake.

Expected files:

- package.json
- bin/levi.js
- src/repository-intake.js

Behavior:

- Command: levi scan <repository-path>
- Verify the path exists.
- Verify the path is a directory.
- Return success for a valid directory.
- Return a clear error for a missing path.
- Return a clear error for a regular file.
- Return a nonzero exit code on failure.
- Do not modify the target repository.

Constraints:

- Node.js built-ins only.
- No scanning.
- No parsing.
- No AI.
- No memory.
- No external dependencies.
- No additional commands.

Status: COMPLETE

### M1-002 Repository Scanner

Requirement ID: LC-MVP-002

Objective: Scan supported source and documentation files while respecting exclusions.

Expected files:

- bin/levi.js
- src/repository-scanner.js

Acceptance criteria:

- Scans the repository path accepted by repository intake.
- Excludes secrets, generated files, dependencies, binaries, and ignored directories.
- Records discovered file paths without modifying project files.
- Reports unsupported or unreadable files as skipped.
- Does not parse file contents.

Status: NOT STARTED

### M1-003 Framework Detection

Requirement ID: LC-MVP-002

Objective: Detect languages, frameworks, package managers, entry points, and tests from deterministic repository signals.

Expected files:

- src/framework-detection.js
- src/repository-scanner.js

Acceptance criteria:

- Identifies languages only when supported file extensions or config files provide evidence.
- Identifies frameworks only from deterministic files or manifest contents.
- Identifies package managers only from lockfiles or package manifests.
- Identifies entry points and tests only when evidence exists.
- Reports unknown facts as UNKNOWN.

Status: NOT STARTED

### M1-004 Dependency Analysis

Requirement ID: LC-MVP-002

Objective: Analyze project dependency manifests without installing dependencies.

Expected files:

- src/dependency-analysis.js

Acceptance criteria:

- Reads supported dependency manifest files only.
- Reports declared dependencies with source file evidence.
- Does not install, update, execute, or fetch dependencies.
- Reports unsupported dependency formats as UNKNOWN.
- Handles invalid manifest files with a clear error.

Status: NOT STARTED

### M1-005 Project Summary

Requirement ID: LC-MVP-002

Objective: Produce a verified project summary from repository analysis results.

Expected files:

- bin/levi.js
- src/project-summary.js
- src/repository-scanner.js
- src/framework-detection.js
- src/dependency-analysis.js

Acceptance criteria:

- Produces a project summary containing only cited facts or UNKNOWN values.
- Includes languages, frameworks, package managers, entry points, tests, major directories, and dependencies when evidence exists.
- Includes source file evidence for every reported fact.
- Does not include uncited model output or assumptions.
- Does not modify project files.

Status: NOT STARTED

No other implementation is approved during M1.
