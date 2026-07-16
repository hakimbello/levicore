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

## Phase 5: Release 0.3 Certification

Status: NOT STARTED

Purpose: Certify Release 0.3 before Release 0.4 planning begins.

### M27-001 Release 0.3 End-to-End Audit

Task ID: M27-001

Requirement ID: POST_MVP until approved by the owner

Objective: Audit the complete Release 0.3 workflow from local readiness through task intake, planning, context, cost, approval, controlled provider routing, safe patching, validation, completion reporting, memory persistence, and restore.

Expected files:

- No implementation files expected unless an audit finding is approved as a separate task.

Acceptance criteria:

- Audit runs against a temporary repository outside LeviCore.
- Audit covers local setup readiness, prompt-free intake, intent classification, context preview, context budget, context cache, cost estimation, budget guardrails, approval summary, destructive confirmation, provider health, fallback diagnostics, safe patching, validation, completion reporting, memory persistence, and restore.
- Audit includes approved success paths and failure paths for unsafe, ambiguous, out-of-scope, provider failure, malformed output, validation failure, and restore failure cases.
- Audit records exact commands, working directories, exit codes, results, changed files, known failures, and remaining work.
- Audit does not modify implementation files unless a separate fix task is approved.

Status: NOT STARTED

### M27-FIX-001 Intake-To-Plan Handoff

Task ID: M27-FIX-001

Requirement ID: POST_MVP until approved by owner

Objective: Carry the validated plain-language intake through scope checking and task planning without replacing it with a canned requirement or objective.

Expected files:

- src/task-intake.js
- src/intent-classifier.js
- src/scope-checker.js
- src/task-planner.js
- src/cli-workflow.js

Acceptance criteria:

- Original request remains preserved.
- Normalized objective drives the task plan.
- Task type drives relevant planning behavior.
- No hard-coded LC-MVP requirement replaces post-MVP intake.
- Missing information blocks planning with clear questions.
- Ambiguous and rejected intake cannot proceed.
- Plan contains no canned marker objective.

Status: NOT STARTED

### M27-FIX-002 Real Plan Generation

Task ID: M27-FIX-002

Requirement ID: POST_MVP until approved by owner

Objective: Generate a real approved implementation plan from the validated intake and repository evidence.

Expected files:

- src/task-planner.js
- src/project-summary.js
- src/repository-scanner.js
- src/scope-checker.js
- src/cli-workflow.js

Acceptance criteria:

- Plan describes the requested product or feature.
- Expected files come from repository evidence and task needs.
- Acceptance criteria reflect the actual request.
- Validation commands reflect the target project.
- No UNKNOWN placeholders when evidence exists.
- No hard-coded index.html or canned marker operation.
- Plan remains bounded and requires approval.

Status: NOT STARTED

### M27-FIX-003 Public Provider Consistency

Task ID: M27-FIX-003

Requirement ID: POST_MVP until approved by owner

Objective: Make public readiness, routing, and execution use the same registered provider configuration.

Expected files:

- src/model-gateway.js
- src/model-provider-interface.js
- src/provider-health.js
- src/local-readiness-check.js
- src/code-generation-pipeline.js
- src/cli-workflow.js

Acceptance criteria:

- No hidden structured provider is used when readiness reports no provider.
- Controlled providers are allowed only in explicit test mode.
- Public execution fails clearly when no usable provider exists.
- Readiness and execution report the same provider state.
- Local-first routing remains preserved.

Status: NOT STARTED

### M27-FIX-004 Real Public Execution

Task ID: M27-FIX-004

Requirement ID: POST_MVP until approved by owner

Objective: Connect the approved real task plan to context, prompt, provider, operation validation, safe patch, validation, reporting, and memory through the public CLI.

Expected files:

- bin/levi.js
- src/cli-workflow.js
- src/context-builder.js
- src/prompt-engine.js
- src/model-gateway.js
- src/code-generation-pipeline.js
- src/coding-executor.js
- src/safe-patch.js
- src/validation-runner.js
- src/completion-reporter.js
- src/memory-store.js

Acceptance criteria:

- The requested website or feature drives generated operations.
- Execution no longer appends a canned marker.
- Actual planned files are created or updated.
- Provider output is treated as untrusted.
- Safe patch boundaries remain enforced.
- Failed generation or validation prevents completion.
- Completion report describes actual work.

Status: NOT STARTED

### M27-FIX-005 Public Cost Decision Enforcement

Task ID: M27-FIX-005

Requirement ID: POST_MVP until approved by owner

Objective: Require a valid public pre-execution cost decision.

Expected files:

- src/cost-estimator.js
- src/budget-guardrails.js
- src/approval-summary.js
- src/model-gateway.js
- src/code-generation-pipeline.js
- src/cli-workflow.js

Acceptance criteria:

- FREE local tasks proceed according to policy.
- Known remote cost uses budget guardrails.
- UNKNOWN cost requires explicit approval.
- BLOCKED cost cannot execute.
- Approval summary and execution use the same cost decision.
- No hidden bypass exists.

Status: NOT STARTED

### M27-FIX-006 Internal Metadata Exclusion

Task ID: M27-FIX-006

Requirement ID: POST_MVP until approved by owner

Objective: Exclude Levi runtime metadata from repository scanning, context, project facts, and model input.

Expected files:

- src/repository-scanner.js
- src/project-summary.js
- src/context-builder.js
- src/context-preview.js
- src/context-cache.js
- src/prompt-engine.js

Acceptance criteria:

- .levi directory is ignored by scanner.
- .levi/state.json and .levi/memory.json never enter context.
- Runtime metadata remains available to Levi internally.
- Existing secret and generated-file exclusions remain intact.

Status: NOT STARTED

### M27-FIX-007 Exact Restore Identity

Task ID: M27-FIX-007

Requirement ID: POST_MVP until approved by owner

Objective: Return the target repository to its exact pre-task state after restore.

Expected files:

- src/restore-points.js
- src/coding-executor.js
- src/safe-patch.js
- src/cli-workflow.js

Acceptance criteria:

- Tracked files match pre-change state.
- Files created by Levi are removed.
- Files deleted by Levi are recreated.
- Runtime metadata created solely for the task is cleaned or restored to its prior state.
- Pre-existing .levi state is preserved.
- Exact directory identity check passes for the approved test fixture.
- No unrelated files are removed.

Status: NOT STARTED

### M27-REAUDIT-001 Release 0.3 Certification Reaudit

Task ID: M27-REAUDIT-001

Requirement ID: POST_MVP until approved by owner

Objective: Repeat the full real website-building certification audit after all fixes.

Expected files:

- No implementation files expected unless a reaudit finding is approved as a separate task.

Acceptance criteria:

- Full real website-building certification audit is repeated after all M27 fix tasks.
- Final verdict is recorded as RELEASE_0_3_CERTIFIED or BLOCKED.

Final verdict:

- RELEASE_0_3_CERTIFIED
- BLOCKED

Status: NOT STARTED

### M27-002 Dogfooding Readiness Review

Task ID: M27-002

Requirement ID: POST_MVP until approved by the owner

Objective: Review whether Release 0.3 is ready for personal dogfooding by a solo builder without manual prompt, context, routing, patch, pricing, cache, or restore configuration.

Expected files:

- No implementation files expected unless a review finding is approved as a separate task.

Acceptance criteria:

- Review confirms a normal user can start with local-first setup and plain-language task intake.
- Review confirms users do not manually configure prompts, context selection, routing, patch schemas, pricing internals, cache behavior, or restore internals.
- Review confirms approval, destructive confirmation, validation, completion reporting, and restore behavior remain understandable and safe.
- Review confirms real website-building work is credible for personal dogfooding or lists exact blockers.
- Review records exact evidence, commands, results, blockers, and owner recommendation.

Status: NOT STARTED

### M27-003 Release 0.3 Certification

Task ID: M27-003

Requirement ID: POST_MVP until approved by the owner

Objective: Certify Release 0.3 completion status after the end-to-end audit and dogfooding readiness review are complete.

Expected files:

- No implementation files expected unless a certification blocker is approved as a separate task.

Acceptance criteria:

- Certification reviews M27-001 and M27-002 results.
- Certification confirms all Release 0.3 blockers are resolved or explicitly records BLOCKED.
- Certification confirms no Release 0.4 planning begins before Release 0.3 certification.
- Certification records final verdict as RELEASE_0_3_CERTIFIED or BLOCKED.
- Certification records exact validation commands and results.

Status: NOT STARTED

## Phase 6: Release 0.4A Daily-Use Foundation

Status: NOT STARTED

Purpose: Make Levi reliable for daily personal use by adding durable project knowledge, durable decisions, structural search, project health, and a simple UI while preserving Release 0.3 safety, cost, evidence, validation, and restore behavior.

Release 0.4A implementation rules:

- Planning output from this phase remains implementation guidance, not code approval.
- One task is implemented at a time.
- Each implementation task requires task-specific owner approval before code changes.
- Preserve Levi Core module boundaries and Levi-owned interfaces.
- Levi Core retains business logic; UI work remains a thin interface over Levi Core.
- Do not add prompt-engineering-first workflows, exposed patch schemas, primary-workflow provider configuration, standalone IDE parity, autocomplete parity, marketplace behavior, autonomous deployment, or team collaboration features.
- No external dependency is approved without OSS evaluation.

## M28 Project Knowledge

Status: NOT STARTED

Purpose: Build durable, evidence-backed understanding of project architecture, conventions, commands, dependencies, and business rules.

### M28-001 Project Knowledge Extraction

Task ID: M28-001

Requirement ID: POST_MVP until approved by owner

Objective: Extract evidence-backed project knowledge from repository structure, source files, documentation, manifests, and existing Levi facts without treating inference as approved truth.

Expected files:

- src/project-knowledge.js
- src/project-summary.js
- src/repository-scanner.js
- src/framework-detection.js
- src/dependency-analysis.js

Acceptance criteria:

- Extracts architecture, conventions, commands, dependencies, and business rules only from repository evidence.
- Preserves source evidence for every extracted fact.
- Marks absent or unclear knowledge as UNKNOWN.
- Excludes secrets, generated files, dependencies, binaries, runtime metadata, and unverified model output.
- Does not modify project files or execute providers.

Status: NOT STARTED

### M28-002 Project Knowledge Approval And Storage

Task ID: M28-002

Requirement ID: POST_MVP until approved by owner

Objective: Let the user review extracted project knowledge and store only approved or verified records for future planning.

Expected files:

- src/project-knowledge.js
- src/memory-store.js
- src/cli-workflow.js

Acceptance criteria:

- Extracted knowledge remains pending until approved or verified.
- Approved knowledge records include source evidence, confidence state, timestamp, and project identity.
- Rejected knowledge does not affect planning, context, execution, or memory retrieval.
- Stored project knowledge remains isolated to the active project.
- Approval and storage do not modify user project files.

Status: NOT STARTED

### M28-003 Project Knowledge Retrieval

Task ID: M28-003

Requirement ID: POST_MVP until approved by owner

Objective: Retrieve relevant approved project knowledge for planning, context preview, and task review without requiring manual context selection.

Expected files:

- src/project-knowledge.js
- src/memory-store.js
- src/context-builder.js
- src/context-preview.js
- src/task-planner.js

Acceptance criteria:

- Retrieves only approved or verified project knowledge for the active project.
- Returns relevant knowledge with evidence references and confidence state.
- Does not include rejected, stale, unverified, secret, generated, dependency, binary, or runtime metadata records.
- Planning uses retrieved project knowledge only through approved evidence.
- Retrieval is deterministic for the same repository state, task input, and memory state.

Status: NOT STARTED

### M28-004 Project Knowledge Validation

Task ID: M28-004

Requirement ID: POST_MVP until approved by owner

Objective: Validate project knowledge extraction, approval, storage, and retrieval across supported and failure cases.

Expected files:

- src/project-knowledge.js
- src/memory-store.js
- src/context-builder.js
- src/context-preview.js
- src/task-planner.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers architecture facts, conventions, commands, dependencies, business rules, UNKNOWN values, rejected records, and stale evidence.
- Validation confirms project knowledge affects planning only after approval or verification.
- Validation confirms secrets, generated files, dependencies, binaries, runtime metadata, and unverified model output are excluded.
- Validation confirms project isolation and deterministic repeated output.
- Existing Release 0.3 scan, intake, planning, context, execution, validation, memory, and restore behavior does not regress.

Status: NOT STARTED

## M29 Durable Project Decisions

Status: NOT STARTED

Purpose: Preserve approved project rules such as framework choices, coding standards, protected systems, and validation requirements.

### M29-001 Decision Record

Task ID: M29-001

Requirement ID: POST_MVP until approved by owner

Objective: Record durable project decisions with approval evidence, scope, status, and source references.

Expected files:

- src/project-decisions.js
- src/memory-store.js
- src/cli-workflow.js

Acceptance criteria:

- Records approved project decisions for framework choices, coding standards, protected systems, validation requirements, and business rules.
- Each decision includes approval evidence, source, scope, timestamp, status, and project identity.
- Decisions begin in a non-enforcing state until explicitly approved.
- Rejected or incomplete decision records cannot affect planning or execution.
- Decision records remain isolated to the active project.

Status: NOT STARTED

### M29-002 Decision Enforcement

Task ID: M29-002

Requirement ID: POST_MVP until approved by owner

Objective: Apply active approved project decisions during scope checking and task planning so plans respect durable project rules.

Expected files:

- src/project-decisions.js
- src/scope-checker.js
- src/task-planner.js
- src/context-builder.js
- src/approval-summary.js

Acceptance criteria:

- Active approved decisions are included as planning constraints with evidence.
- Plans that conflict with approved decisions are blocked or require explicit user review before execution.
- Rejected, removed, expired, incomplete, or unapproved decisions do not affect planning.
- Decision enforcement does not bypass normal task approval, cost approval, destructive confirmation, or safe patch boundaries.
- Decision enforcement remains deterministic and explainable in the plan or approval summary.

Status: NOT STARTED

### M29-003 Decision Review And Removal

Task ID: M29-003

Requirement ID: POST_MVP until approved by owner

Objective: Let users inspect, review, deactivate, and remove durable project decisions without corrupting project memory.

Expected files:

- src/project-decisions.js
- src/memory-store.js
- src/cli-workflow.js

Acceptance criteria:

- Users can list active, inactive, rejected, and removed project decisions.
- Decision removal or deactivation requires explicit user approval.
- Removed or inactive decisions stop affecting future planning.
- Decision history preserves enough evidence to explain prior planning behavior.
- Removing a decision does not remove unrelated project knowledge, memory, task outcomes, or runtime metadata.

Status: NOT STARTED

### M29-004 Decision Validation

Task ID: M29-004

Requirement ID: POST_MVP until approved by owner

Objective: Validate durable decision recording, enforcement, review, deactivation, removal, and project isolation.

Expected files:

- src/project-decisions.js
- src/memory-store.js
- src/scope-checker.js
- src/task-planner.js
- src/context-builder.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers approved, rejected, incomplete, conflicting, inactive, removed, and stale decisions.
- Validation confirms active approved decisions affect planning only through approved evidence.
- Validation confirms removed or rejected decisions do not affect future plans.
- Validation confirms normal approval, cost, destructive confirmation, safe patch, validation, and restore behavior remain intact.
- Validation records exact commands and results.

Status: NOT STARTED

## M30 Structural Code Search

Status: NOT STARTED

Purpose: Find functions, classes, modules, imports, routes, and related code using deterministic repository structure rather than text matching alone.

### M30-001 Symbol Index

Task ID: M30-001

Requirement ID: POST_MVP until approved by owner

Objective: Build a deterministic symbol index for supported source files using repository evidence and safe parsing.

Expected files:

- src/structural-index.js
- src/repository-scanner.js
- src/project-summary.js

Acceptance criteria:

- Indexes supported functions, classes, modules, imports, exports, routes, and entry points when evidence exists.
- Marks unsupported languages or parse failures as UNKNOWN without inventing structure.
- Excludes secrets, generated files, dependencies, binaries, runtime metadata, and ignored directories.
- Does not execute project code or providers.
- Index output is deterministic for the same repository state.

Status: NOT STARTED

### M30-002 Structural Search

Task ID: M30-002

Requirement ID: POST_MVP until approved by owner

Objective: Provide deterministic structural search for symbols, modules, imports, routes, and files without relying on text matching alone.

Expected files:

- src/structural-search.js
- src/structural-index.js
- src/cli-workflow.js

Acceptance criteria:

- Searches by symbol name, symbol kind, module path, import, export, route, and file relationship where indexed evidence exists.
- Returns source locations, evidence, and UNKNOWN values for unsupported or absent structure.
- Does not return secret, generated, dependency, binary, runtime metadata, or ignored-directory content.
- Search results are deterministic and bounded.
- Search does not modify files, execute providers, or run project code.

Status: NOT STARTED

### M30-003 Relationship Search

Task ID: M30-003

Requirement ID: POST_MVP until approved by owner

Objective: Find deterministic relationships between symbols, imports, modules, routes, entry points, tests, and related files.

Expected files:

- src/structural-search.js
- src/structural-index.js
- src/project-summary.js
- src/context-builder.js

Acceptance criteria:

- Reports relationships only when repository evidence supports them.
- Shows callers, imports, exports, route handlers, related tests, and likely entry points when available.
- Marks ambiguous or unsupported relationships as UNKNOWN.
- Relationship search can support task planning and context selection without exposing prompt configuration.
- Relationship results remain isolated to the active repository.

Status: NOT STARTED

### M30-004 Structural Search Validation

Task ID: M30-004

Requirement ID: POST_MVP until approved by owner

Objective: Validate symbol indexing, structural search, relationship search, exclusions, deterministic output, and failure handling.

Expected files:

- src/structural-index.js
- src/structural-search.js
- src/repository-scanner.js
- src/context-builder.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers functions, classes, modules, imports, exports, routes, entry points, tests, unsupported files, parse failures, and UNKNOWN results.
- Validation confirms secret, generated, dependency, binary, runtime metadata, and ignored-directory exclusions remain intact.
- Validation confirms structural search can answer real repository questions with cited evidence.
- Validation confirms repeated searches produce deterministic output.
- Existing Release 0.3 scan, planning, context, execution, validation, memory, and restore behavior does not regress.

Status: NOT STARTED

## M31 Project Health

Status: NOT STARTED

Purpose: Provide one plain-language view of build status, tests, provider readiness, project knowledge, context quality, restore readiness, and known problems.

### M31-001 Project Health Signals

Task ID: M31-001

Requirement ID: POST_MVP until approved by owner

Objective: Collect deterministic project health signals from existing Levi modules without executing unsafe work or providers.

Expected files:

- src/project-health.js
- src/project-summary.js
- src/local-readiness-check.js
- src/provider-health.js
- src/context-preview.js
- src/restore-points.js
- src/validation-runner.js

Acceptance criteria:

- Collects build status, test signals, provider readiness, project knowledge state, context quality, restore readiness, and known problems when evidence exists.
- Marks missing or unavailable signals as UNKNOWN.
- Does not run unapproved validation commands, providers, prompts, patches, or project code.
- Does not expose secrets or runtime metadata content.
- Signal collection is deterministic for the same repository and Levi state.

Status: NOT STARTED

### M31-002 Project Health Summary

Task ID: M31-002

Requirement ID: POST_MVP until approved by owner

Objective: Present collected health signals as one concise plain-language project health summary.

Expected files:

- src/project-health.js
- src/cli-workflow.js
- src/completion-reporter.js

Acceptance criteria:

- Summary shows clear status for build, tests, provider readiness, project knowledge, context quality, restore readiness, and known problems.
- Summary separates verified evidence, approved knowledge, warnings, blockers, and UNKNOWN values.
- Summary is concise enough for daily use.
- Summary does not expose prompt internals, patch schemas, provider secrets, or runtime metadata internals.
- Existing status, scan, readiness, review, and validation commands remain functional.

Status: NOT STARTED

### M31-003 Health Recommendations

Task ID: M31-003

Requirement ID: POST_MVP until approved by owner

Objective: Provide plain-language next-step recommendations from project health signals without approving or executing work.

Expected files:

- src/project-health.js
- src/task-planner.js
- src/cli-workflow.js

Acceptance criteria:

- Recommendations are based only on verified signals, approved project knowledge, approved decisions, or UNKNOWN gaps.
- Recommendations do not create tasks, approve plans, execute providers, apply patches, or run validation.
- Recommendations prioritize blockers, safety issues, cost risks, restore readiness, and missing evidence.
- User-facing wording remains short and plain.
- Recommendations preserve scope enforcement and do not add unapproved features.

Status: NOT STARTED

### M31-004 Project Health Validation

Task ID: M31-004

Requirement ID: POST_MVP until approved by owner

Objective: Validate project health signals, summaries, recommendations, exclusions, deterministic output, and Release 0.3 regressions.

Expected files:

- src/project-health.js
- src/project-summary.js
- src/local-readiness-check.js
- src/provider-health.js
- src/context-preview.js
- src/restore-points.js
- src/validation-runner.js
- src/cli-workflow.js

Acceptance criteria:

- Validation covers healthy, warning, blocked, UNKNOWN, missing provider, missing validation, missing restore, incomplete knowledge, and known-problem states.
- Validation confirms summaries and recommendations are evidence-backed and concise.
- Validation confirms project health does not execute providers, prompts, patches, or unapproved validation commands.
- Validation confirms secret, runtime metadata, generated-file, dependency, and binary exclusions remain intact.
- Existing Release 0.3 scan, intake, planning, cost, approval, execution, validation, memory, and restore behavior does not regress.

Status: NOT STARTED

## M32 Simple User Interface

Status: NOT STARTED

Purpose: Provide a beautiful, calm, fast, and easy-to-navigate user interface for the daily Levi workflow while keeping Levi Core as the business-logic owner.

UI principles:

- Apple-inspired simplicity without copying Apple assets or layouts.
- One primary action per screen.
- Plain language.
- Progressive disclosure.
- Advanced controls hidden by default.
- Light and dark appearance.
- Strong typography and spacing.
- Clear status, cost, safety, restore, and evidence information.
- No prompt-engineering interface.
- No exposed patch schemas.
- No provider configuration on the primary workflow.
- Beautiful, calm, fast, and easy to navigate.
- Levi Core retains all business logic.
- UI remains a thin interface over Levi Core.

### M32-001 UI Product Requirements

Task ID: M32-001

Requirement ID: POST_MVP until approved by owner

Objective: Define the simple UI product requirements, primary user journey, screen inventory, accessibility expectations, and explicit exclusions.

Expected files:

- UI_PRODUCT_REQUIREMENTS.md
- PLAN.md only if owner-approved follow-up task details must be refined

Acceptance criteria:

- Defines the primary daily-use journey: open project, submit request, review plan, approve, observe execution, inspect results, and restore.
- Documents one primary action per screen and progressive disclosure behavior.
- Explicitly excludes prompt-engineering UI, exposed patch schemas, provider configuration in the primary workflow, standalone IDE behavior, autocomplete, marketplace, autonomous deployment, and team collaboration.
- Defines light, dark, responsive, accessibility, evidence, cost, safety, restore, and status expectations.
- Does not modify implementation files.

Status: NOT STARTED

### M32-002 UI Architecture

Task ID: M32-002

Requirement ID: POST_MVP until approved by owner

Objective: Define a thin UI architecture over Levi Core with clear boundaries, screen routing, state flow, and validation strategy.

Expected files:

- UI_ARCHITECTURE.md
- src/ui-bridge.js
- src/ui-server.js
- ui/index.html
- ui/app.js
- ui/styles.css

Acceptance criteria:

- UI architecture keeps all business logic inside Levi Core modules.
- UI communicates through a thin adapter or bridge that calls existing Levi Core workflows.
- UI state does not become a second source of truth for task state, memory, cost, restore, provider routing, or validation.
- Architecture defines responsive and accessible screen structure without copying Apple assets or layouts.
- Architecture does not approve external dependencies without OSS evaluation.

Status: NOT STARTED

### M32-003 Home And Task Intake Screen

Task ID: M32-003

Requirement ID: POST_MVP until approved by owner

Objective: Build the home and task intake screen so a new user understands the primary action and can submit a plain-language request.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/index.html
- ui/app.js
- ui/styles.css

Acceptance criteria:

- A new user can identify the primary action without documentation.
- User can open or select a project and submit a plain-language request.
- Intake preserves the exact original request and passes through existing Levi Core intake and classification.
- Screen shows clear project, readiness, evidence, and safety status without prompt-engineering controls.
- Light, dark, responsive, keyboard, and screen-reader behavior meet the approved UI requirements.

Status: NOT STARTED

### M32-004 Plan And Approval Screen

Task ID: M32-004

Requirement ID: POST_MVP until approved by owner

Objective: Build the plan and approval screen so users can review a real bounded plan, evidence, cost, safety, and required approvals.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Screen displays objective, expected files, acceptance criteria, validation commands, evidence, cost decision, risks, and destructive confirmation state.
- User can approve or reject a plan through existing Levi Core approval workflow.
- Cost approval does not substitute for normal task approval.
- Destructive confirmation remains separate from normal approval.
- Screen does not expose prompt internals, patch schemas, provider routing configuration, or manual context selection.

Status: NOT STARTED

### M32-005 Execution And Completion Screen

Task ID: M32-005

Requirement ID: POST_MVP until approved by owner

Objective: Build the execution and completion screen so users can observe progress, validation, changed files, completion status, and remaining work.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Screen shows task state, provider readiness state, safe patch progress, validation results, changed files, completion report, and remaining work.
- Failed generation, patching, validation, or completion prevents a completed UI state.
- Completion report reflects actual changed files and actual commands from Levi Core.
- Provider output remains untrusted and hidden behind validated Levi Core results.
- Screen remains calm, readable, responsive, and accessible during long-running work.

Status: NOT STARTED

### M32-006 Project Health Screen

Task ID: M32-006

Requirement ID: POST_MVP until approved by owner

Objective: Build the project health screen for concise daily status, readiness, known problems, and next-step recommendations.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Screen displays build status, tests, provider readiness, project knowledge, context quality, restore readiness, and known problems.
- Health recommendations are concise, evidence-backed, and non-executing.
- UNKNOWN values are visible without implying false completion.
- Screen does not expose provider secrets, runtime metadata internals, prompt controls, or patch schemas.
- Existing CLI health and status behavior remains functional.

Status: NOT STARTED

### M32-007 Restore And History Screen

Task ID: M32-007

Requirement ID: POST_MVP until approved by owner

Objective: Build the restore and history screen so users can inspect task history, completion reports, memory outcomes, and restore points safely.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Screen lists task history, completion reports, changed files, validation results, verified memory outcomes, and restore points.
- User can inspect a restore point before restoring.
- Restore requires explicit confirmation and uses existing Levi Core restore workflow.
- Restore results show exact restored files and runtime metadata state at a safe summary level.
- No unrelated files, memory, or runtime history are removed through the UI.

Status: NOT STARTED

### M32-008 Advanced Settings

Task ID: M32-008

Requirement ID: POST_MVP until approved by owner

Objective: Provide optional advanced settings for diagnostics and preferences without cluttering or controlling the primary workflow.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Advanced settings are hidden by default and not required for the primary workflow.
- Settings can display diagnostics, project paths, provider readiness details, budget preferences, and restore/history controls only where approved.
- Settings do not expose prompt-engineering interfaces, patch schemas, primary-workflow provider routing configuration, or secret values.
- Changes that affect cost, destructive behavior, credentials, external communication, or restore require explicit confirmation.
- Defaults preserve local-first, safe, low-configuration Release 0.3 behavior.

Status: NOT STARTED

### M32-009 Accessibility And Responsive Validation

Task ID: M32-009

Requirement ID: POST_MVP until approved by owner

Objective: Validate the UI for accessibility, responsive layout, light and dark appearance, keyboard navigation, plain language, and screen clarity.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/index.html
- ui/app.js
- ui/styles.css

Acceptance criteria:

- Validation covers desktop, tablet, and mobile viewport sizes.
- Validation covers keyboard navigation, focus states, contrast, labels, semantic structure, and screen-reader names.
- Validation confirms light and dark appearance remain readable and calm.
- Validation confirms each screen has one primary action and progressive disclosure works.
- Validation confirms text does not overflow, overlap, or hide status, cost, safety, restore, or evidence information.

Status: NOT STARTED

### M32-010 UI End-to-End Certification

Task ID: M32-010

Requirement ID: POST_MVP until approved by owner

Objective: Certify the UI end-to-end workflow through the public interface without regressing Levi Core behavior.

Expected files:

- src/ui-bridge.js
- src/ui-server.js
- ui/index.html
- ui/app.js
- ui/styles.css

Acceptance criteria:

- A user can open a project, submit a request, review a plan, approve it, observe execution, inspect results, and restore changes through the UI.
- UI uses existing Levi Core scan, readiness, intake, planning, context, cost, approval, execution, validation, completion, memory, and restore workflows.
- UI does not duplicate business logic from Levi Core.
- UI does not expose prompt-engineering controls, patch schemas, or primary-workflow provider configuration.
- Existing Release 0.3 CLI functionality does not regress.

Certification result:

- BLOCKED

Blocker:

- Public UI workflow reached approved execution, but the selected local provider did not return Levi-compatible structured operations, so no real file-changing task, completion report, verified memory, history, or exact restore could be certified.

Status: BLOCKED

### M32-FIX-001 Local Provider Structured Output Reliability

Task ID: M32-FIX-001

Requirement ID: POST_MVP until approved by owner

Purpose: Make approved local providers return Levi-compatible structured operations without weakening Core validation or allowing malformed model output to reach Safe Patch.

Expected files:

- src/providers/ollama-provider.js
- src/providers/remote-provider.js
- src/model-provider-interface.js
- src/model-gateway.js
- src/prompt-engine.js
- src/code-generation-pipeline.js
- src/safe-patch.js

Acceptance criteria:

- Preserve strict Core operation validation.
- Preserve untrusted-provider boundaries.
- Do not accept prose as executable operations.
- Do not silently guess missing operations.
- Support Ollama local provider execution.
- Use provider-native structured-output controls when supported.
- Use deterministic extraction only when one unambiguous JSON object exists.
- Reject multiple, incomplete, contradictory, or malformed payloads.
- Return a short actionable error when the selected model cannot produce the required structure.
- Permit one bounded corrective retry only if approved by existing iteration and cost limits.
- Corrective retry must include the validation failure and required schema without exposing hidden prompts to the UI.
- No direct file writes.
- No Safe Patch bypass.
- No approval bypass.
- No cost bypass.
- No hidden provider.
- No fabricated operations.
- Test explicit test providers only under test mode.
- Validate qwen2.5-coder:7b or mark model compatibility honestly if it remains unable to satisfy the contract.
- Existing remote providers and gateway behavior must not regress.

Status: NOT STARTED

### M32-REAUDIT-001 UI End-to-End Certification Reaudit

Task ID: M32-REAUDIT-001

Requirement ID: POST_MVP until approved by owner

Purpose: Repeat the blocked M32-010 workflow after M32-FIX-001.

Expected files:

- No implementation files expected unless a reaudit finding is approved as a separate task.

Acceptance criteria:

- Complete the public UI workflow through a real file-changing task.
- Build a responsive three-page business website.
- Confirm completion reporting.
- Confirm verified memory.
- Confirm history.
- Confirm exact restore.
- Confirm provider consistency.
- Confirm malformed output still blocks safely.
- Final verdict must be M32_UI_CERTIFIED or BLOCKED.

Status: NOT STARTED

### M32-011 Release 0.4A Certification

Task ID: M32-011

Requirement ID: POST_MVP until approved by owner

Objective: Certify Release 0.4A Daily-Use Foundation after project knowledge, durable decisions, structural search, project health, and UI tasks are complete.

Expected files:

- No implementation files expected unless a certification blocker is approved as a separate task.

Acceptance criteria:

- A new user opens Levi and understands the primary action without documentation.
- A user can open a project, submit a request, review a plan, approve it, observe execution, inspect results, and restore changes.
- Project Knowledge and Durable Decisions affect planning only through approved evidence.
- Structural Search supports real repository questions.
- Project Health presents concise actionable information.
- Advanced settings remain optional.
- Existing Release 0.3 functionality does not regress.
- Final verdict is either RELEASE_0_4A_CERTIFIED or BLOCKED.

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
