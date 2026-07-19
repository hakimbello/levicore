# Layer 3 Durable Workflows

Release 0.6 L3-007 adds `DurableWorkflowEngine` in `src/durable-workflow-engine.js`.

## Scope

The engine coordinates large coding objectives across sessions with compact workflow state, dependency scheduling, checkpoints, approval/input waits, retries, repair orchestration, recovery, progress, and truthful completion evidence.

It does not replace planning, runtime operation scheduling, agent execution, multi-agent coordination, workspace tools, approval, validation, repair, model routing, persistence, security, privacy, or source-control systems. It calls those systems through `LeviApplicationRuntime` commands.

## Public APIs

Lifecycle:

- `initialize(options)`
- `shutdown(options)`
- `suspend(reason)`
- `resume(options)`
- `recover(options)`
- `getState()`
- `getConfiguration()`
- `updateConfiguration(patch, options)`
- `getHealth(options)`
- `getStats()`
- `snapshot()`
- `restore(snapshot)`
- `save()`
- `load()`

Workflow:

- `createWorkflow(input, options)`
- `validateWorkflow(workflowIdOrInput, options)`
- `startWorkflow(workflowId, options)`
- `pauseWorkflow(workflowId, reason)`
- `resumeWorkflow(workflowId, options)`
- `suspendWorkflow(workflowId, reason)`
- `cancelWorkflow(workflowId, reason)`
- `retryWorkflow(workflowId, options)`
- `expireWorkflow(workflowId, reason)`
- `archiveWorkflow(workflowId, options)`
- `getWorkflow(workflowId)`
- `listWorkflows(filter)`
- `explainWorkflow(workflowId)`
- `getWorkflowResult(workflowId)`

Steps:

- `createStep(workflowId, input, options)`
- `updateStep(stepId, patch, options)`
- `validateStep(stepIdOrInput, options)`
- `queueStep(stepId, options)`
- `executeStep(stepId, options)`
- `pauseStep(stepId, reason)`
- `resumeStep(stepId, options)`
- `cancelStep(stepId, reason)`
- `retryStep(stepId, options)`
- `skipStep(stepId, reason, options)`
- `blockStep(stepId, reason, options)`
- `getStep(stepId)`
- `listSteps(workflowId, filter)`
- `getReadySteps(workflowId, options)`
- `explainStep(stepId)`

Dependencies:

- `addDependency(workflowId, dependency, options)`
- `removeDependency(dependencyId)`
- `validateDependencies(workflowId, options)`
- `evaluateDependencies(stepId, options)`
- `getDependency(dependencyId)`
- `listDependencies(workflowId, filter)`
- `getDependencyGraph(workflowId)`

Checkpoints:

- `createCheckpoint(workflowId, input, options)`
- `restoreCheckpoint(checkpointId, options)`
- `validateCheckpoint(checkpointId, options)`
- `getCheckpoint(checkpointId)`
- `listCheckpoints(workflowId, filter)`
- `compareCheckpoints(firstId, secondId)`

Decisions:

- `requestDecision(workflowId, input, options)`
- `resolveDecision(decisionId, input, options)`
- `cancelDecision(decisionId, reason)`
- `getDecision(decisionId)`
- `listDecisions(filter)`

Scheduler:

- `scheduleWorkflow(workflowId, options)`
- `scheduleReadySteps(workflowId, options)`
- `tick(options)`
- `drain(options)`
- `getSchedule(workflowId)`
- `getRunningSteps(filter)`
- `getQueuedSteps(filter)`

Events:

- `subscribe(listener, filter)`
- `unsubscribe(subscriptionId)`
- `getEvents(filter)`
- `clearEvents(options)`

## Normalized Models

`WorkflowConfiguration` includes conservative bounds and policy fields for enablement, strategy, maximum workflow/step/dependency/concurrency/retry/repair/validation/model/tool counts, duration/idle/pause limits, event/checkpoint history, checkpoint interval, persistence, recovery, plan requirements, approval requirements, validation after mutation, checkpoint before mutation, safe resume, read-only parallelism, archival, storage path, and metadata.

`DurableWorkflow` records identity, workspace/project/session/conversation/team references, objective/title/description, strategy/state, plan id, root/active/completed/failed/blocked/skipped step ids, dependency graph, checkpoint/approval/operation/proposal/validation/repair references, evidence, warnings, limitations, confidence, completeness, timestamps, expiration, progress, and metadata.

`WorkflowStep` records identity, workflow/parent, sequence, type, title/description/objective, state, priority, dependency/dependent ids, dependency/failure/resume policies, capabilities, workspace state, privacy, security/approval/source/command flags, reversibility/idempotency/retry/validation/repair policy, input/output, operation/conversation/turn/team/assignment/proposal/approval/validation/repair/checkpoint refs, attempts, progress, evidence, warnings, limitations, error, timestamps, expiration, and metadata.

`WorkflowDependency` records source/target step ids, type, required flag, condition, satisfaction state, satisfied-by reference, evidence, creation time, and metadata.

`WorkflowCheckpoint` records workflow/step id, type, workflow state, workspace revision, workflow revision, compact step states, active/completed/failed step ids, approval/operation/proposal/validation references, recovery metadata, evidence, confidence, completeness, creation time, and metadata.

`WorkflowAttempt` records workflow/step id, attempt number, reason, state, operation id, input hash, workspace revision, start/completion times, result, error, evidence, and metadata.

`WorkflowDecision` records workflow/step id, question, options, selected option, rationale, authority, request/resolution times, evidence, and metadata.

`WorkflowResult` records disposition, objective, summary, completed/partial/failed/blocked/skipped steps, applied/proposed changes, validation/repair/approval state, unresolved decisions/conflicts, evidence, warnings, limitations, confidence, completeness, creation time, and metadata.

## States And Types

Engine states: `CREATED`, `INITIALIZING`, `READY`, `DEGRADED`, `SUSPENDED`, `RECOVERING`, `SHUTTING_DOWN`, `STOPPED`, `FAILED`.

Workflow states: `CREATED`, `VALIDATING`, `READY`, `QUEUED`, `RUNNING`, `WAITING`, `WAITING_FOR_APPROVAL`, `WAITING_FOR_INPUT`, `WAITING_FOR_DEPENDENCY`, `PAUSED`, `SUSPENDED`, `RECOVERING`, `CANCELLING`, `CANCELLED`, `COMPLETED`, `PARTIALLY_COMPLETED`, `BLOCKED`, `FAILED`, `EXPIRED`, `ARCHIVED`.

Step states: `CREATED`, `BLOCKED`, `READY`, `QUEUED`, `STARTING`, `RUNNING`, `WAITING`, `WAITING_FOR_APPROVAL`, `WAITING_FOR_INPUT`, `WAITING_FOR_DEPENDENCY`, `VALIDATING`, `REPAIRING`, `RETRYING`, `PAUSED`, `SUSPENDED`, `CANCELLING`, `CANCELLED`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, `SKIPPED`, `BLOCKED_BY_DEPENDENCY`, `FAILED`, `TIMED_OUT`, `EXPIRED`, `INTERRUPTED`.

Step types: `ANALYSIS`, `SEARCH`, `CODE_UNDERSTANDING`, `PROJECT_ASSESSMENT`, `PLANNING`, `CONTEXT_BUILD`, `MODEL_INFERENCE`, `AGENT_TURN`, `MULTI_AGENT_TEAM`, `CHANGE_PROPOSAL`, `CHANGE_REVIEW`, `APPROVAL_GATE`, `CHANGE_APPLY`, `VALIDATION`, `REPAIR`, `COMMAND`, `SOURCE_CONTROL_CHECKPOINT`, `SOURCE_CONTROL_RESTORE`, `USER_INPUT`, `DECISION`, `CHECKPOINT`, `SYNTHESIS`, `RELEASE_ASSESSMENT`, `DOCUMENTATION`, `CUSTOM`.

Dependency types: `REQUIRES_SUCCESS`, `REQUIRES_COMPLETION`, `REQUIRES_OUTPUT`, `REQUIRES_APPROVAL`, `REQUIRES_VALIDATION`, `REQUIRES_DECISION`, `SOFT_DEPENDENCY`, `OPTIONAL`, `MUTEX`, `UNKNOWN`.

Execution strategies: `SEQUENTIAL`, `DEPENDENCY_GRAPH`, `PARALLEL_SAFE`, `ADAPTIVE_BOUNDED`, `APPROVAL_DRIVEN`, `RECOVERY_FIRST`.

Failure policies: `FAIL_WORKFLOW`, `BLOCK_DEPENDENTS`, `SKIP_DEPENDENTS`, `CONTINUE_INDEPENDENT`, `RETRY`, `REPAIR_THEN_RETRY`, `REQUIRE_USER_DECISION`, `ROLLBACK_AND_FAIL`, `PARTIAL_COMPLETION`, `CUSTOM`.

Resume policies: `MANUAL_ONLY`, `SAFE_AUTOMATIC`, `REQUIRE_REVALIDATION`, `REQUIRE_APPROVAL_RECONFIRMATION`, `NEVER_RESUME`, `CUSTOM`.

Dispositions: `COMPLETED`, `PARTIALLY_COMPLETED`, `PROPOSAL_READY`, `APPROVAL_REQUIRED`, `INPUT_REQUIRED`, `VALIDATION_FAILED`, `REPAIR_EXHAUSTED`, `BLOCKED`, `CAPABILITY_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `CANCELLED`, `TIMED_OUT`, `FAILED`.

## Workflow Creation And Plan Conversion

Workflow creation accepts accepted project plans, accepted agent plans, accepted multi-agent results, user-authored workflow definitions, repair workflows, release-readiness remediation plans, and recovery plans.

Plan conversion preserves:

- Plan id
- Plan-step ids
- Dependencies
- Risks
- Validation requirements
- Approval requirements
- Evidence
- Confidence and completeness
- Unsupported plan element metadata

Plan steps map deterministically into workflow steps by step id, sequence, type/name/title signals, and dependency references.

## Graph Validation

Workflow validation checks identity, workspace/project references, accepted plan requirements for source changes, step types, dependency references, cycles, orphan/missing steps, duplicates, state impossibilities, required capabilities, workspace state, security, approval, privacy, mutation/command/validation/repair/retry/checkpoint/resume policies, bounds, serializability, and evidence references.

Dependency validation detects self-dependencies, direct/indirect cycles, duplicate dependencies, missing or unrelated step references, required dependency on optional source steps, dependency on expired steps, impossible approval/validation dependencies, mutex hazards, and depth beyond bounds.

## Scheduling And Concurrency

Scheduling order is:

1. Workflow eligibility
2. Dependency satisfaction
3. Security and approval eligibility
4. Priority
5. Stable workflow sequence
6. Stable step sequence

Safe concurrency is allowed only when steps are dependency-ready, read-only or non-overlapping, command scopes do not conflict, provider/runtime capacity and configuration permit it, and cancellation can propagate safely.

## Runtime Execution

All step execution goes through `LeviApplicationRuntime` commands:

- Analysis/project assessment: `project.assessment`
- Search: `repository.search`
- Code understanding: `code.understand`
- Planning: `planning.create`
- Context: `context.build`
- Model inference: `model.complete`
- Agent turn: `agent.createConversation`, `agent.sendMessage`
- Multi-agent team: `multiAgent.createTeam`, `multiAgent.startTeam`, `multiAgent.reconcile`
- Change proposal/review/apply: `change.createProposal`, `change.validateProposal`, `change.apply`
- Validation: `validation.run`
- Repair: `execution.repair`
- Command: `command.runValidation`
- Source control: `sourceControl.checkpoint`, `sourceControl.restore`

No workflow step calls direct file, shell, provider, source-control, approval, validation, or repair internals when a runtime boundary exists.

## Approval Behavior

Protected steps wait at approval checkpoints. The approval binding includes workflow id, step id, objective, protected action, workspace revision where known, proposal or command identity, scope, risks, expiration, and evidence.

Approval is invalidated when the protected step changes, proposal/command identity changes, command arguments change, workspace revision becomes stale, approval expires, protected scope changes, or recovery detects stale evidence.

Retries, time passing, model agreement, reviewer acceptance, prior successful validation, and safe-looking output are never approval.

## User Input Behavior

`USER_INPUT` and `DECISION` steps create explicit `WorkflowDecision` records. Decisions include a clear question, bounded options when available, selected option, rationale, authority, evidence, and resumable timestamps. Levi never fabricates or defaults a user answer unless the workflow definition explicitly encodes a non-action default.

## Checkpoint Behavior

Checkpoints are compact and reference-based. They are created after workflow creation/validation, before and after protected actions, before and after mutation/command steps, after validation, after repair, on suspension/recovery/manual request, during periodic persistence when enabled, and before completion.

Checkpoints do not duplicate repository contents, adapter instances, credentials, complete source files, full context packages, private prompts, provider reasoning, or unbounded command/model output.

## Workspace Revision Behavior

Workspace revisions are recorded at workflow creation, step start, approval waits, checkpoint creation, mutation application, validation, recovery, and resume when runtime/workspace adapters expose them.

Material stale revisions block stale protected mutations, invalidate approvals, require affected step revalidation, lower confidence and completeness, and preserve unaffected completed evidence.

## Retry And Repair

Retries are bounded and deterministic. Retry metadata records attempt number, input hash, workspace revision, reason, and deterministic backoff delay. Unit tests do not require real long waits.

Retries are blocked for rejected approval, privacy-policy violation, prohibited command, invalid patch, stale protected mutation without regeneration, explicit cancellation, unsupported capability, and identical deterministic failures without changed evidence.

Repair steps call existing repair capabilities through runtime, preserve original objective and failed-step reference, receive bounded failure evidence, create new repair lineage, avoid identical loops, require renewed approval if protected scope changes, and trigger revalidation.

## Failure Propagation

Failure policies control whether failed steps fail the workflow, block dependents, skip dependents, continue independent branches, retry, repair then retry, require user decision, rollback and fail, or report partial completion.

Dependent steps are blocked or skipped when prerequisites fail. Independent branches may continue only when the failure policy permits it.

## Pause, Resume, Shutdown, And Recovery

Pause and suspend create compact checkpoints and stop scheduling new steps. Shutdown suspends active workflows and persists when enabled.

Recovery loads compact state, marks in-flight work interrupted or paused, clears stale protected approvals, lowers confidence where evidence may be stale, preserves completed evidence, and requires revalidation before resume.

Protected mutation, command, and source-control restore steps never auto-resume after restart.

## Idempotency And Progress

Read-only idempotent steps may reuse evidence after revalidation. Source-changing and command steps require explicit protected flow references and do not duplicate mutation or command execution.

Progress is calculated from terminal/successful step counts and exposed in workflow summaries. Completion evidence is result-based, not optimism-based.

## Runtime Commands

The runtime exposes:

- `workflow.health`
- `workflow.create`
- `workflow.validate`
- `workflow.start`
- `workflow.pause`
- `workflow.resume`
- `workflow.cancel`
- `workflow.retry`
- `workflow.get`
- `workflow.list`
- `workflow.explain`
- `workflow.getResult`
- `workflow.listSteps`
- `workflow.getStep`
- `workflow.retryStep`
- `workflow.skipStep`
- `workflow.getReadySteps`
- `workflow.createCheckpoint`
- `workflow.listCheckpoints`
- `workflow.restoreCheckpoint`
- `workflow.resolveDecision`
- `workflow.tick`

If `DurableWorkflowEngine` is absent, workflow commands return an unconfigured response.

## VS Code Commands And View

VS Code contributes the `levi.workflows` TreeView and commands:

- `levi.showWorkflows`
- `levi.createWorkflow`
- `levi.startWorkflow`
- `levi.pauseWorkflow`
- `levi.resumeWorkflow`
- `levi.cancelWorkflow`
- `levi.retryWorkflow`
- `levi.showWorkflow`
- `levi.showWorkflowResult`
- `levi.showWorkflowSteps`
- `levi.retryWorkflowStep`
- `levi.skipWorkflowStep`
- `levi.showWorkflowCheckpoints`
- `levi.createWorkflowCheckpoint`
- `levi.restoreWorkflowCheckpoint`
- `levi.resolveWorkflowDecision`

The view shows workflow title, objective, state, progress, current/active/ready/blocked/failed steps, waiting approvals, waiting decisions, last checkpoint, workspace revision, warnings, and limitations.

Step detail presentation includes type, state, priority, dependencies, attempt count, progress, approval state, validation state, error summary, evidence count, and next allowed action through virtual workflow documents.

## Persistence Boundaries

Default storage path is `.levi/durable-workflows.json`, but the platform-independent core uses an injected persistence adapter and defaults to in-memory storage.

Persisted records are compact summaries only. They exclude credentials, complete source files, full context packages, raw private prompts, private provider reasoning, chain-of-thought, unbounded command output, unbounded model output, process handles, adapters, runtime instances, and circular references.

Corruption handling emits `workflow_corruption_detected`, preserves safe error details, falls back safely when configured, invalidates recovered `READY` claims, requires revalidation, and avoids protected auto-resume.

## Security Model

The workflow engine cannot:

- Approve work
- Weaken approval/security/privacy policy
- Mutate files directly
- Execute arbitrary commands directly
- Bypass workspace trust
- Access provider credentials
- Persist or expose private reasoning
- Treat time, retries, model agreement, or reviewer acceptance as approval

Health scoring caps readiness for approval/security/privacy failures, circular graphs, corrupted unrecoverable state, stale proposals, interrupted protected work, unlimited retries/concurrency, invalid checkpoint restore, and unresolved required decisions.

## Manual Verification Checklist

- Launch Extension Development Host.
- Create a workflow from a multi-step objective.
- Inspect converted workflow graph.
- Inspect dependencies.
- Start workflow.
- Observe sequential steps.
- Observe safe parallel read-only steps.
- Pause workflow.
- Resume workflow.
- Trigger approval checkpoint.
- Reject approval and verify protected step does not execute.
- Recreate or retry protected step.
- Approve and verify normal controlled-tool flow.
- Trigger validation.
- Trigger validation failure.
- Inspect repair step.
- Create manual checkpoint.
- Reload extension.
- Recover workflow.
- Verify protected interrupted work does not auto-resume.
- Resolve a user-input decision.
- Cancel workflow.
- Inspect partial workflow result.
- Confirm no credentials, complete source files, private reasoning, or unrestricted command output appear in logs.
- Confirm workflow bounds remain enforced.

Manual verification remains documented but is not required before L3-008. Full live smoke testing remains scheduled after production hardening and before Marketplace release.

## Known Limitations

- Default core persistence is memory-backed unless a host injects durable storage.
- VS Code workflow monitoring uses TreeView plus virtual JSON documents rather than a richer dashboard.
- Provider-unavailable or capability-unavailable environments may yield blocked or reference-only workflow results.
- Checkpoint restore restores compact workflow state; external source-control restore remains delegated to runtime/source-control commands.
- Validation and repair are only as strong as the existing runtime validation/repair capabilities available in the current environment.

## L3-008 Readiness Criteria

L3-007 is ready for L3-008 when:

- Core durable workflow tests pass.
- Runtime initializes with and without the workflow engine.
- Workflow commands return frontend-safe data.
- Agent, multi-agent, workspace-tool, model-provider, runtime, and VS Code integration tests remain green.
- Manifest validation passes.
- Syntax checks pass.
- Security, privacy, approval, persistence, recovery, evidence, and workspace-trust invariants are preserved.
- No real blocker remains for the next Layer 3 milestone.
