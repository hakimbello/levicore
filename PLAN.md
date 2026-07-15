# Levi Core Build Plan

## Current Milestone

Phase 2: Real AI Integration

Status: NOT STARTED

## Release 0.3.0 Implementation Milestones

Status: NOT STARTED

This section replaces the single Release 0.3 roadmap with executable implementation milestones.

Release 0.3 implementation rules:

- Planning output from M18 remains evidence, not implementation approval.
- One task is implemented at a time.
- Each implementation task requires task-specific owner approval before code changes.
- Do not duplicate Phase 2 provider, context, fallback, or safety work already approved in PLAN.md.
- Do not add standalone IDE, autocomplete, marketplace, team collaboration, autonomous deployment, or prompt-engineering-first workflows.
- Preserve CLI-first architecture and Levi-owned interfaces.
- No external dependency is approved without OSS evaluation.

## M19 One-Minute Local Setup

Status: NOT STARTED

### M19-001 Local Model Discovery

Task ID: M19-001

Requirement ID: POST_MVP until approved by the owner

Objective: Discover locally available model providers and configured local models without requiring remote credentials or installing software.

Expected files:

- src/local-model-discovery.js
- src/model-gateway.js
- src/providers/ollama-provider.js

Acceptance criteria:

- Detects whether supported local provider configuration is present.
- Detects whether a configured local model is available when the provider can report it.
- Reports missing local provider, unavailable model, and unsupported provider states clearly.
- Does not install, download, start services, or make remote calls.
- Does not expose secrets in output, logs, memory, or reports.
- Returns UNKNOWN when availability cannot be determined from local evidence.

Status: NOT STARTED

### M19-002 One-Minute Readiness Check

Task ID: M19-002

Requirement ID: POST_MVP until approved by the owner

Objective: Provide a simple local-first readiness result that tells the user whether Levi can run with a local model and what minimal action is needed if not.

Expected files:

- bin/levi.js
- src/cli-workflow.js
- src/local-model-discovery.js
- src/local-readiness-check.js

Acceptance criteria:

- User can run one CLI command to see local readiness.
- Readiness output uses plain language and does not expose provider internals unless needed for action.
- Readiness distinguishes ready, not configured, unavailable, unsupported, and UNKNOWN states.
- Readiness prefers local execution before remote fallback.
- Readiness does not require prompt engineering, YAML editing, or remote credentials.
- Existing scan, status, request, approve, execute, validate, and review commands remain functional.

Status: NOT STARTED

### M19-003 Local Setup Validation

Task ID: M19-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate local model discovery and readiness behavior without requiring a real local model service.

Expected files:

- src/local-model-discovery.js
- src/local-readiness-check.js
- src/model-gateway.js

Acceptance criteria:

- Validation covers ready, missing provider, unavailable model, unsupported provider, and UNKNOWN cases.
- Validation confirms no remote calls occur during local readiness checks.
- Validation confirms missing local setup returns clear next-step guidance.
- Validation confirms existing Model Gateway limits and provider boundaries remain intact.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M20 Cost Preview

Status: NOT STARTED

### M20-001 Cost Estimation

Task ID: M20-001

Requirement ID: POST_MVP until approved by the owner

Objective: Estimate task cost class from approved task, selected provider, selected model, and bounded context before execution.

Expected files:

- src/cost-estimator.js
- src/model-gateway.js
- src/task-planner.js

Acceptance criteria:

- Produces a plain-language cost class before model execution.
- Preserves existing Model Gateway spending and iteration limits.
- Marks exact cost UNKNOWN when provider pricing or usage cannot be determined.
- Does not call provider billing APIs unless separately approved.
- Does not expose credentials, tokens, or sensitive provider metadata.
- Does not block free/local model routing when a configured local model is available.

Status: NOT STARTED

### M20-002 Budget Guardrails

Task ID: M20-002

Requirement ID: POST_MVP until approved by the owner

Objective: Add user-visible budget guardrails that prevent accidental high-cost model execution while preserving existing Model Gateway control.

Expected files:

- src/budget-guardrails.js
- src/model-gateway.js
- src/task-planner.js

Acceptance criteria:

- Planned model execution includes budget state before execution.
- Tasks exceeding configured budget limits are blocked before provider calls.
- UNKNOWN cost tasks require explicit approval before remote model execution.
- Local/free-model-first routing remains available when configured.
- Guardrail failures return clear messages without exposing secrets.
- Existing spending and iteration limits remain enforced by Model Gateway.

Status: NOT STARTED

### M20-003 Cost Validation

Task ID: M20-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate cost estimation and budget guardrails across local, remote, fallback, over-budget, and UNKNOWN-cost scenarios.

Expected files:

- src/cost-estimator.js
- src/budget-guardrails.js
- src/model-gateway.js

Acceptance criteria:

- Validation covers local/free, remote low-cost, remote high-cost, fallback, over-budget, and UNKNOWN-cost cases.
- Validation confirms blocked tasks do not call providers.
- Validation confirms cost estimates appear in task planning or execution reports before model calls.
- Validation confirms no secrets are written to output, logs, memory, or reports.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M21 Safe Approval Summary

Status: NOT STARTED

### M21-001 Approval Summary

Task ID: M21-001

Requirement ID: POST_MVP until approved by the owner

Objective: Summarize planned actions, expected files, validation commands, cost class, and risk before the user approves execution.

Expected files:

- src/approval-summary.js
- src/task-planner.js
- src/cli-workflow.js

Acceptance criteria:

- Approval summary is generated from the approved task plan and cited context only.
- Summary lists objective, expected files, planned operations, validation commands, cost class, and risks.
- Summary avoids prompt-engineering instructions and internal provider details.
- Execution still requires explicit plan approval.
- Existing task planning behavior remains functional.

Status: NOT STARTED

### M21-002 Destructive Action Highlighting

Task ID: M21-002

Requirement ID: POST_MVP until approved by the owner

Objective: Highlight destructive or irreversible planned actions before approval and require explicit confirmation for them.

Expected files:

- src/approval-summary.js
- src/coding-executor.js
- src/safe-patch.js

Acceptance criteria:

- Delete, overwrite, broad file rewrite, shell commands with destructive risk, and irreversible operations are highlighted.
- Destructive or irreversible operations require explicit approval separate from normal approval.
- No YOLO, bypass, or unattended destructive mode is added.
- Highlighting uses structured planned operations, not ad hoc model text.
- Rejected destructive approvals prevent execution and preserve existing state.

Status: NOT STARTED

### M21-003 Approval Validation

Task ID: M21-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate approval summaries and destructive action highlighting without weakening existing approval enforcement.

Expected files:

- src/approval-summary.js
- src/cli-workflow.js
- src/coding-executor.js
- src/safe-patch.js

Acceptance criteria:

- Validation covers normal changes, destructive changes, rejected approvals, missing approvals, and approved destructive actions.
- Validation confirms execution is blocked without required approvals.
- Validation confirms destructive highlights are visible before execution.
- Validation confirms existing approval state remains uncorrupted after rejection.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M22 Restore Points

Status: NOT STARTED

### M22-001 Restore Point Creation

Task ID: M22-001

Requirement ID: POST_MVP until approved by the owner

Objective: Create low-overhead restore points before approved file changes are applied.

Expected files:

- src/restore-points.js
- src/coding-executor.js
- src/safe-patch.js

Acceptance criteria:

- Restore point is created before applying approved structured operations.
- Restore point records exact files and pre-change content needed for rollback.
- Restore point creation stays inside the active repository boundary.
- Restore point creation excludes secrets, generated files, dependencies, binaries, and unplanned files.
- Failure to create a required restore point blocks file modification.
- Restore point metadata does not expose secrets.

Status: NOT STARTED

### M22-002 Restore Workflow

Task ID: M22-002

Requirement ID: POST_MVP until approved by the owner

Objective: Provide a controlled workflow to inspect and restore the latest Levi-managed restore point.

Expected files:

- bin/levi.js
- src/cli-workflow.js
- src/restore-points.js

Acceptance criteria:

- User can inspect available restore point metadata.
- User can restore files changed by the latest Levi-managed operation.
- Restore applies only inside the active repository.
- Restore does not affect unrelated files.
- Restore requires explicit confirmation before changing files.
- Restore result is reported with exact files changed.

Status: NOT STARTED

### M22-003 Restore Validation

Task ID: M22-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate restore point creation and restore workflow across success, rejection, and failure cases.

Expected files:

- src/restore-points.js
- src/coding-executor.js
- src/safe-patch.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers create, inspect, restore, missing restore point, corrupted restore point, and out-of-bound restore attempts.
- Validation confirms restore does not modify unrelated files.
- Validation confirms failed restore does not produce COMPLETED status.
- Validation confirms restored files are reported exactly.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M23 Evidence-Cited Context Preview

Status: NOT STARTED

### M23-001 Context Preview

Task ID: M23-001

Requirement ID: POST_MVP until approved by the owner

Objective: Show the bounded project context Levi will use before model execution.

Expected files:

- src/context-preview.js
- src/context-builder.js
- src/cli-workflow.js

Acceptance criteria:

- Preview includes only APPROVED or VERIFIED memory records and cited repository facts.
- Preview preserves source references for every included fact.
- Preview excludes secrets, generated files, dependencies, binaries, rejected records, and unverified model output.
- Preview does not require users to write prompts or configure context manually.
- Preview marks UNKNOWN context gaps as UNKNOWN.

Status: NOT STARTED

### M23-002 Evidence Display

Task ID: M23-002

Requirement ID: POST_MVP until approved by the owner

Objective: Display evidence sources for context facts in a concise, readable format.

Expected files:

- src/context-preview.js
- src/project-summary.js
- src/memory-store.js

Acceptance criteria:

- Evidence display shows source file, deterministic signal, memory source, or UNKNOWN for each context fact.
- Evidence display separates approved facts, verified facts, and UNKNOWN values.
- Evidence display does not expose secret content.
- Evidence display remains concise enough for CLI review.
- Evidence display does not alter memory records or repository files.

Status: NOT STARTED

### M23-003 Context Validation

Task ID: M23-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate context preview and evidence display against approved, verified, rejected, unverified, secret, and UNKNOWN records.

Expected files:

- src/context-preview.js
- src/context-builder.js
- src/memory-store.js
- src/project-summary.js

Acceptance criteria:

- Validation confirms rejected and unverified records are excluded.
- Validation confirms secrets, generated files, dependencies, and binaries are excluded.
- Validation confirms every displayed fact has evidence or UNKNOWN.
- Validation confirms context remains isolated to the active project.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M24 Provider Health

Status: NOT STARTED

### M24-001 Provider Health Checks

Task ID: M24-001

Requirement ID: POST_MVP until approved by the owner

Objective: Check configured provider availability and configuration completeness without executing a task.

Expected files:

- src/provider-health.js
- src/model-gateway.js
- src/model-provider-interface.js

Acceptance criteria:

- Health check reports configured, missing configuration, unavailable, unsupported, and UNKNOWN states.
- Health check validates required local and remote provider configuration before model calls.
- Health check does not expose credentials or secret configuration values.
- Health check does not modify files or call task execution.
- Provider-specific details remain behind Levi-owned provider interfaces.

Status: NOT STARTED

### M24-002 Fallback Diagnostics

Task ID: M24-002

Requirement ID: POST_MVP until approved by the owner

Objective: Report primary provider failure and fallback readiness clearly without adding provider-specific logic to the pipeline.

Expected files:

- src/provider-health.js
- src/model-gateway.js
- src/code-generation-pipeline.js

Acceptance criteria:

- Diagnostics preserve primary provider failure details without exposing secrets.
- Diagnostics report whether fallback provider is configured and available.
- Diagnostics do not execute fallback outside the existing Model Gateway flow.
- Diagnostics preserve spending and iteration limits.
- If both primary and fallback are unavailable, output explains the failure clearly.

Status: NOT STARTED

### M24-003 Provider Validation

Task ID: M24-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate provider health and fallback diagnostics across configured, missing, unavailable, failed-primary, and failed-fallback cases.

Expected files:

- src/provider-health.js
- src/model-gateway.js
- src/code-generation-pipeline.js

Acceptance criteria:

- Validation covers local provider health, remote provider health, missing credentials, missing model, unavailable provider, primary failure, and fallback failure.
- Validation confirms no secrets appear in outputs, logs, memory, or reports.
- Validation confirms no provider-specific logic enters domain workflow modules.
- Validation confirms failed providers return clear failure information.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M25 Context Performance

Status: NOT STARTED

### M25-001 Context Budget

Task ID: M25-001

Requirement ID: POST_MVP until approved by the owner

Objective: Bound context size automatically so model requests remain understandable, low-cost, and predictable.

Expected files:

- src/context-budget.js
- src/context-builder.js
- src/prompt-engine.js

Acceptance criteria:

- Context budget applies automatically without requiring user tuning.
- Budgeting preserves approved requirements, task plan boundaries, validation commands, risks, and explicit exclusions.
- Budgeting preserves source evidence for included facts.
- Excluded context is reported as omitted with reason, not silently hidden.
- Budgeting does not include secrets, rejected records, or unverified model output.

Status: NOT STARTED

### M25-002 Context Cache

Task ID: M25-002

Requirement ID: POST_MVP until approved by the owner

Objective: Cache deterministic context assembly results where safe to reduce repeated context-building overhead.

Expected files:

- src/context-cache.js
- src/context-builder.js
- src/memory-store.js

Acceptance criteria:

- Cache stores only safe deterministic context metadata and cited facts.
- Cache remains isolated by project.
- Cache invalidates when relevant repository facts, memory records, or task plan inputs change.
- Cache excludes secrets, generated files, dependencies, binaries, rejected records, and unverified output.
- Cache miss or invalidation falls back to deterministic context building.

Status: NOT STARTED

### M25-003 Performance Validation

Task ID: M25-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate context budgeting and caching for correctness, invalidation, and bounded performance behavior.

Expected files:

- src/context-budget.js
- src/context-cache.js
- src/context-builder.js

Acceptance criteria:

- Validation covers budget inclusion, budget omission, cache hit, cache miss, cache invalidation, and UNKNOWN context values.
- Validation confirms source evidence is preserved after budgeting and caching.
- Validation confirms excluded unsafe records do not enter cache or context.
- Validation records timing or operation-count evidence sufficient to verify bounded behavior.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

## M26 Prompt-Free Task Intake

Status: NOT STARTED

### M26-001 Natural Language Task Intake

Task ID: M26-001

Requirement ID: POST_MVP until approved by the owner

Objective: Accept natural-language task requests and convert them into structured intake data without requiring prompt templates from the user.

Expected files:

- src/task-intake.js
- src/cli-workflow.js
- bin/levi.js

Acceptance criteria:

- Intake captures user objective, repository path, task text, and requested action class.
- Intake does not require prompt engineering, YAML configuration, or manual context selection.
- Intake preserves the original user request exactly.
- Intake does not modify files or execute tasks.
- Intake passes structured data to scope checking and planning only.

Status: NOT STARTED

### M26-002 Intent Classification

Task ID: M26-002

Requirement ID: POST_MVP until approved by the owner

Objective: Classify task intent into supported Levi workflow categories before planning.

Expected files:

- src/intent-classifier.js
- src/task-intake.js
- src/scope-checker.js
- src/task-planner.js

Acceptance criteria:

- Classifies requests as implementation, analysis, validation, review, planning, or UNKNOWN.
- Out-of-scope or ambiguous requests are routed through existing Scope Service behavior.
- UNKNOWN intent is marked UNKNOWN and does not proceed silently.
- Classification does not approve work or execute changes.
- Classification preserves the original user request for review.

Status: NOT STARTED

### M26-003 Intake Validation

Task ID: M26-003

Requirement ID: POST_MVP until approved by the owner

Objective: Validate natural-language intake and intent classification without adding prompt-engineering requirements.

Expected files:

- src/task-intake.js
- src/intent-classifier.js
- src/scope-checker.js
- src/task-planner.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers implementation, analysis, validation, review, planning, ambiguous, out-of-scope, and UNKNOWN requests.
- Validation confirms intake does not modify files or execute commands.
- Validation confirms out-of-scope work stops before file modification.
- Validation confirms ambiguous work is marked ASSUMPTION REQUIRES APPROVAL.
- Validation commands and results are recorded exactly.

Status: NOT STARTED

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

Status: COMPLETE

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

Status: COMPLETE

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

Status: COMPLETE

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

Status: COMPLETE

No other implementation is approved during M1.

## M2 Persistent Project Memory

Begins only after M1 is complete.

Planned requirement order:

1. LC-MVP-003 Persistent Project Memory.

### M2-001 Memory Store

Requirement ID: LC-MVP-003

Objective: Store verified project facts, approved decisions, task outcomes, and failed attempts across sessions.

Expected files:

- src/memory-store.js

Acceptance criteria:

- Memory remains isolated by project.
- Every memory record has a type, source, timestamp, and confidence state.
- Unverified model output never becomes approved project truth.
- Users can inspect and remove stored project memory.

Status: COMPLETE

## M3 Scope Enforcement

Begins only after M2 is complete.

Planned requirement order:

1. LC-MVP-004 Scope Enforcement.

### M3-001 Scope Checker

Requirement ID: LC-MVP-004

Objective: Check each requested task against approved project requirements before execution.

Expected files:

- src/scope-checker.js

Acceptance criteria:

- In-scope tasks proceed to planning.
- Out-of-scope tasks stop before file modification.
- Ambiguous tasks are marked ASSUMPTION REQUIRES APPROVAL.
- New ideas are recorded separately and do not alter active scope.

Status: COMPLETE

## M4 Task Planning

Begins only after M3 is complete.

Planned requirement order:

1. LC-MVP-005 Task Planning.

### M4-001 Task Planner

Requirement ID: LC-MVP-005

Objective: Produce a constrained implementation plan before changing files.

Expected files:

- src/task-planner.js

Acceptance criteria:

- Plan names the requirement ID.
- Plan lists expected files, acceptance criteria, validation commands, risks, and exclusions.
- Execution does not begin until the plan is approved.

Status: COMPLETE

## M5 Model Gateway and Routing

Begins only after M4 is complete.

Planned requirement order:

1. LC-MVP-006 Model Gateway and Routing.

### M5-001 Model Gateway

Requirement ID: LC-MVP-006

Objective: Support replaceable local or remote model providers through one internal interface.

Expected files:

- src/model-gateway.js

Acceptance criteria:

- Business logic does not call provider SDKs directly.
- At least one local provider and one remote provider are supported.
- Routing records selected model, reason, estimated cost class, and fallback.
- Spending and iteration limits are enforced.

Status: COMPLETE

## M6 Coding Execution

Begins only after M5 is complete.

Planned requirement order:

1. LC-MVP-007 Coding Execution.

### M6-001 Coding Executor

Requirement ID: LC-MVP-007

Objective: Send an approved task plan to a replaceable coding executor that can create, update, and delete project files under controlled permissions.

Expected files:

- src/coding-executor.js

Acceptance criteria:

- Executor accesses only the active repository.
- Planned file boundaries are enforced.
- Destructive or irreversible actions require approval.
- Every changed file is recorded.
- Execution has time, step, and cost ceilings.

Status: COMPLETE

## M7 Validation

Begins only after M6 is complete.

Planned requirement order:

1. LC-MVP-008 Validation.

### M7-001 Validation Runner

Requirement ID: LC-MVP-008

Objective: Run approved validation commands and record actual results.

Expected files:

- src/validation-runner.js

Acceptance criteria:

- Commands run from the correct repository root.
- Exit codes and relevant output are stored.
- Failed validation prevents completion status.
- Levi never fabricates test results.

Status: COMPLETE

## M8 Completion Reporting

Begins only after M7 is complete.

Planned requirement order:

1. LC-MVP-009 Completion Reporting.

### M8-001 Completion Reporter

Requirement ID: LC-MVP-009

Objective: Report exact work performed and update project state only after validation.

Expected files:

- src/completion-reporter.js

Acceptance criteria:

- Report contains requirement ID, exact files changed, change summary, commands run, results, known failures, and remaining work.
- Partial work is marked partial or failed.
- Verified task outcomes become project memory.

Status: COMPLETE

## M9 Primary User Interface

Begins only after M8 is complete.

Planned requirement order:

1. LC-MVP-010 Primary User Interface.

### M9-001 CLI Workflow

Requirement ID: LC-MVP-010

Objective: Provide the first user interface as a command-line application.

Expected files:

- bin/levi.js

Acceptance criteria:

- User can initialize a project, inspect status, request a task, approve a plan, execute, validate, and review results.
- CLI communicates only through Levi Core interfaces.
- Interface errors do not corrupt project state.

Status: COMPLETE

### M9-FIX-001 CLI Architecture Compliance

Requirement ID: LC-MVP-010

Objective: Move workflow and state business logic out of the CLI entry point.

Expected files:

- bin/levi.js
- src/cli-workflow.js

Acceptance criteria:

- bin/levi.js is limited to argument parsing, command dispatch, output formatting, exit codes, and calls into Levi Core modules.
- Workflow and state business logic live in src/cli-workflow.js.
- Existing CLI behavior is preserved.
- No new features or dependencies are added.

Status: COMPLETE

## Phase 2 Real AI Integration

Begins only after M9 is complete.

Planned requirement order:

1. LC-MVP-006 Model Gateway and Routing.
2. LC-MVP-003 Persistent Project Memory.
3. LC-MVP-007 Coding Execution.
4. LC-MVP-008 Validation.
5. LC-MVP-009 Completion Reporting.

Phase 2 product principles:

- Apple-level simplicity.
- One-minute setup.
- Free-model-first philosophy.
- Safe execution.
- Lowest possible friction.
- Competitive with Cursor, Claude Code, Cline, GitHub Copilot, and similar tools.
- No unnecessary complexity.
- No feature creep.

### M10-001 Provider Interface

Task ID: M10-001

Requirement ID: LC-MVP-006

Objective: Define the Levi-owned provider interface used by Model Gateway so local and remote providers expose the same request, response, cost, routing, and error behavior.

Expected files:

- src/model-gateway.js
- src/model-provider-interface.js

Acceptance criteria:

- Provider request and response shapes are enforced before provider calls.
- Local and remote providers can be registered behind the same Levi-owned interface.
- Business logic does not call provider SDKs or provider endpoints directly.
- Routing metadata still records selected model, reason, estimated cost class, and fallback.
- Spending and iteration limits remain enforced by Model Gateway.

Status: NOT STARTED

### M11-001 Ollama Provider

Task ID: M11-001

Requirement ID: LC-MVP-006

Objective: Add a local Ollama provider behind the Levi-owned provider interface.

Expected files:

- src/model-gateway.js
- src/model-provider-interface.js
- src/providers/ollama-provider.js

Acceptance criteria:

- Ollama is accessed only through the provider interface.
- Missing or unavailable Ollama returns a clear provider-unavailable error.
- Local provider setup does not require remote credentials.
- The provider supports free-model-first routing when a configured local model is available.
- Provider responses include enough metadata for routing, usage, and completion reporting without logging secrets.

Status: NOT STARTED

### M12-001 Remote Provider

Task ID: M12-001

Requirement ID: LC-MVP-006

Objective: Add a replaceable remote model provider behind the Levi-owned provider interface.

Expected files:

- src/model-gateway.js
- src/model-provider-interface.js
- src/providers/remote-provider.js

Acceptance criteria:

- Remote model calls are made only through the provider interface.
- Missing endpoint, model, or credential configuration fails before any remote call.
- Remote provider configuration remains replaceable and does not enter domain logic.
- Provider errors return clear failure information without exposing secrets.
- Estimated cost class and fallback behavior are recorded by Model Gateway.

Status: NOT STARTED

### M13-001 Prompt Engine

Task ID: M13-001

Requirement ID: LC-MVP-006

Objective: Build approved model prompts from Levi-controlled task, scope, context, and safety inputs.

Expected files:

- src/prompt-engine.js
- src/model-gateway.js

Acceptance criteria:

- Prompts are built only from approved task plans, approved requirements, cited repository facts, and verified project memory.
- Prompt sections include objective, scope boundaries, expected files, validation commands, risks, and explicit exclusions.
- UNKNOWN values remain marked UNKNOWN.
- Secrets, rejected records, and unverified model output are excluded from control instructions.
- Prompt output is deterministic for the same approved inputs.

Status: NOT STARTED

### M14-001 Context Builder

Task ID: M14-001

Requirement ID: LC-MVP-003

Objective: Assemble bounded project context for AI requests from verified memory, approved decisions, repository summaries, and the active task plan.

Expected files:

- src/context-builder.js
- src/memory-store.js
- src/project-summary.js

Acceptance criteria:

- Context includes only APPROVED or VERIFIED memory records and cited repository facts.
- Context remains isolated to the active project.
- Every included fact preserves its source or deterministic signal.
- UNKNOWN facts remain UNKNOWN.
- Secret, generated, dependency, binary, rejected, and unverified records are excluded.

Status: NOT STARTED

### M15-001 Code Generation Pipeline

Task ID: M15-001

Requirement ID: LC-MVP-007

Objective: Connect approved task plans, bounded context, prompt generation, model routing, and proposed code operations into one controlled coding pipeline.

Expected files:

- src/code-generation-pipeline.js
- src/coding-executor.js
- src/context-builder.js
- src/model-gateway.js
- src/prompt-engine.js

Acceptance criteria:

- Pipeline runs only after a task plan is approved.
- Model requests go through Model Gateway.
- Generated output is converted into structured proposed operations before file writes.
- Planned file boundaries are checked before execution.
- Model routing and usage metadata are recorded without exposing secrets.

Status: NOT STARTED

### M16-001 Safe Patch Application

Task ID: M16-001

Requirement ID: LC-MVP-007

Objective: Apply AI-proposed file changes safely through the existing coding executor boundary.

Expected files:

- src/coding-executor.js
- src/safe-patch.js

Acceptance criteria:

- Only structured operations for planned files inside the active repository can be applied.
- Path traversal, malformed patches, binary writes, and unplanned files are rejected.
- Destructive or irreversible operations require explicit approval.
- Every changed file is recorded exactly.
- Failed patch attempts do not produce COMPLETED status.

Status: NOT STARTED

### M17-001 Functional Assistant Audit

Task ID: M17-001

Requirement ID: LC-MVP-009

Objective: Audit the real AI workflow from approved task request through provider routing, code generation, safe patch application, validation, and completion reporting.

Expected files:

- No implementation files expected unless an audit finding is approved as a separate task.

Acceptance criteria:

- Audit uses an approved in-scope task and does not expand product scope.
- Audit verifies local-first routing, remote fallback behavior, safe execution, validation blocking, and exact completion reporting.
- Audit records commands run, exit codes, changed files, known failures, and remaining work.
- Any defect discovered is documented for a separate approved fix task.
- No feature creep or architecture changes are introduced during the audit.

Status: NOT STARTED

### M17-FIX-001 Remote Fallback Execution

Task ID: M17-FIX-001

Requirement ID: LC-MVP-006

Objective: When the selected provider fails, execute the approved fallback provider through the existing Model Gateway flow.

Expected files:

- src/code-generation-pipeline.js
- src/model-gateway.js only if required by the existing architecture

Acceptance criteria:

- Primary provider failure is detected.
- Approved fallback provider is invoked.
- Routing record preserves primary and fallback details.
- Spending and iteration limits remain enforced.
- If fallback also fails, return a clear failure.
- No provider-specific logic enters the pipeline.

Status: NOT STARTED

### M17-FIX-002 Binary Write Rejection

Task ID: M17-FIX-002

Requirement ID: LC-MVP-007

Objective: Reject binary-like create or update content before Safe Patch writes files.

Expected files:

- src/safe-patch.js

Acceptance criteria:

- NUL-byte content is rejected.
- Binary-like content is rejected before any file change.
- Text content remains accepted.
- Stop-on-first-failure remains intact.
- No partial write occurs.

Status: NOT STARTED

### M17-FIX-003 Approval Enforcement

Task ID: M17-FIX-003

Requirement ID: LC-MVP-005

Objective: Prevent execution unless the current task plan has explicit APPROVED state.

Expected files:

- src/cli-workflow.js

Acceptance criteria:

- Requested but unapproved plans cannot execute.
- Approved plans can execute.
- Missing plans fail clearly.
- Existing state remains uncorrupted after rejection.

Status: NOT STARTED

### M17-FIX-004 Real CLI Pipeline Integration

Task ID: M17-FIX-004

Requirement ID: LC-MVP-010

Objective: Connect the public CLI workflow to the real internal assistant pipeline.

Required flow:

request
-> real task plan
-> approve
-> context builder
-> prompt engine
-> model gateway
-> provider response
-> code generation pipeline
-> safe patch
-> validation runner
-> completion reporter
-> verified memory

Expected files:

- src/cli-workflow.js
- bin/levi.js only if command dispatch changes are required
- Existing Phase 2 modules only where integration requires it

Acceptance criteria:

- request no longer stores UNKNOWN placeholder plan fields.
- execute no longer only updates .levi/state.json.
- CLI uses existing Levi Core modules.
- User does not manually configure prompts, context, routing, or patch schemas.
- File changes require approved plan boundaries.
- Failed generation, patching, or validation prevents COMPLETED.
- Completion report reflects actual changed files and actual validation results.
- Verified outcomes persist to memory.
- Existing scan, status, and review commands remain functional.

Status: NOT STARTED

### M17-REAUDIT-001 Functional Assistant Reaudit

Task ID: M17-REAUDIT-001

Requirement ID: LC-MVP-009

Objective: Repeat the full functional assistant audit and bug sweep.

Acceptance criteria:

- Full functional assistant audit is repeated after M17 fix tasks.
- Bug sweep is repeated after M17 fix tasks.
- Final verdict is FUNCTIONAL_INTERNAL_ASSISTANT_100_PERCENT or BLOCKED.

Status: NOT STARTED

## Release 0.3.0 Competitive Analysis

Status: NOT STARTED

Planning-only milestone for post-MVP competitive research and release planning. No implementation is approved by this milestone.

### M18-001 Competitive Analysis

Task ID: M18-001

Requirement ID: POST_MVP until approved by the owner

Objective: Research the selected coding assistant competitors and document evidence-backed findings for installation experience, first-time user experience, project understanding, context management, model support, local model support, remote model support, editing workflow, safety features, approval workflow, rollback capability, performance, cost, offline capability, extensibility, user complaints, most requested features, and biggest bottlenecks.

Expected files:

- COMPETITOR_ANALYSIS.md

Acceptance criteria:

- Covers Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Roo Code, Continue, and Windsurf.
- Every recommendation is backed by cited evidence.
- Findings separate verified evidence from UNKNOWN items.
- Analysis preserves Levi's philosophy: Apple simplicity, local-first operation, safety, low cost, trust, and minimal configuration.
- No implementation files are modified.

Status: NOT STARTED

### M18-002 Feature Matrix

Task ID: M18-002

Requirement ID: POST_MVP until approved by the owner

Objective: Create a competitor feature matrix that compares the researched tools against Levi's target philosophy and identifies must-have and nice-to-have capabilities for Release 0.3.0 consideration.

Expected files:

- FEATURE_MATRIX.md

Acceptance criteria:

- Matrix includes all competitors from M18-001.
- Matrix evaluates installation, onboarding, context, model support, local model support, remote model support, editing, safety, approvals, rollback, performance, cost, offline capability, and extensibility.
- Must-have items are clearly separated from nice-to-have items.
- Each must-have recommendation includes evidence from M18-001 or is marked UNKNOWN.
- No implementation files are modified.

Status: NOT STARTED

### M18-003 Bottleneck Analysis

Task ID: M18-003

Requirement ID: POST_MVP until approved by the owner

Objective: Identify the biggest bottlenecks, user complaints, and repeated friction points across competitor tools, then map opportunities where Levi can clearly differentiate.

Expected files:

- BOTTLENECK_ANALYSIS.md

Acceptance criteria:

- Lists the top cross-competitor bottlenecks with cited evidence.
- Separates common user complaints from inferred product risks.
- Highlights opportunities aligned with Levi's philosophy.
- Does not add roadmap items without evidence and justification.
- No implementation files are modified.

Status: NOT STARTED

### M18-004 Release 0.3 Roadmap

Task ID: M18-004

Requirement ID: POST_MVP until approved by the owner

Objective: Propose an evidence-backed Release 0.3.0 roadmap based on the competitive analysis, feature matrix, and bottleneck analysis.

Expected files:

- RELEASE_0_3_PLAN.md

Acceptance criteria:

- Roadmap separates must-have items from nice-to-have items.
- Every roadmap item cites supporting evidence from M18-001, M18-002, or M18-003.
- Roadmap highlights Levi differentiation opportunities.
- Roadmap does not change MVP scope or architecture.
- No implementation files are modified.

Status: NOT STARTED

### M18-005 Release Approval Review

Task ID: M18-005

Requirement ID: POST_MVP until approved by the owner

Objective: Review the Release 0.3.0 planning documents for evidence quality, scope discipline, Levi philosophy alignment, and owner approval readiness.

Expected files:

- COMPETITOR_ANALYSIS.md
- FEATURE_MATRIX.md
- BOTTLENECK_ANALYSIS.md
- RELEASE_0_3_PLAN.md

Acceptance criteria:

- Confirms all recommendations are evidence-backed or explicitly marked UNKNOWN.
- Confirms must-have and nice-to-have items are separated.
- Confirms no implementation work was performed.
- Confirms no controlling documents other than PLAN.md were changed during M18 planning approval.
- Produces an owner approval recommendation of APPROVE, REVISE, or BLOCKED.

Status: NOT STARTED
