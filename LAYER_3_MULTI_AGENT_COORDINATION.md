# Layer 3 Multi-Agent Coordination

`src/multi-agent-coordination-engine.js` implements bounded multi-agent coordination for Levi Release 0.6. It keeps one authoritative coordinator, one runtime boundary, one approval path, and one evidence graph.

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

Roles:

- `registerRole(roleDefinition)`
- `unregisterRole(roleId)`
- `getRole(roleIdOrRole)`
- `listRoles(filter)`
- `validateRole(roleDefinition)`
- `getAvailableRoles(options)`

Teams and assignments:

- `createTeam(input, options)`
- `startTeam(teamId, options)`
- `pauseTeam(teamId, reason)`
- `resumeTeam(teamId, options)`
- `cancelTeam(teamId, reason)`
- `completeTeam(teamId, result)`
- `failTeam(teamId, error)`
- `getTeam(teamId)`
- `listTeams(filter)`
- `explainTeam(teamId)`
- `createAssignment(teamId, input, options)`
- `startAssignment(assignmentId, options)`
- `executeAssignment(assignmentId, options)`
- `pauseAssignment(assignmentId, reason)`
- `resumeAssignment(assignmentId, options)`
- `cancelAssignment(assignmentId, reason)`
- `retryAssignment(assignmentId, options)`
- `reviseAssignment(assignmentId, input, options)`
- `getAssignment(assignmentId)`
- `listAssignments(teamId, filter)`
- `getAssignmentResult(assignmentId)`
- `explainAssignment(assignmentId)`

Delegation, conflicts, review, and events:

- `shouldDelegate(input, options)`
- `createDelegationPlan(input, options)`
- `validateDelegationPlan(plan, options)`
- `executeDelegationPlan(planOrTeamId, options)`
- `reconcileTeam(teamId, options)`
- `validateTeamResult(teamId, options)`
- `getDelegationPreview(input, options)`
- `detectConflicts(teamId, options)`
- `getConflict(conflictId)`
- `listConflicts(filter)`
- `resolveConflict(conflictId, resolution, options)`
- `explainConflict(conflictId)`
- `requestReview(input, options)`
- `reviewResult(resultId, options)`
- `acceptResult(resultId, options)`
- `rejectResult(resultId, reason, options)`
- `requestRevision(resultId, instructions, options)`
- `getDecision(decisionId)`
- `listDecisions(filter)`
- `subscribe(listener, filter)`
- `unsubscribe(subscriptionId)`
- `getEvents(filter)`
- `clearEvents(options)`

## Normalized Models

The engine normalizes:

- `MultiAgentConfiguration`
- `AgentRoleDefinition`
- `AgentTeam`
- `AgentAssignment`
- `AssignmentScope`
- `AgentResult`
- `AgentFinding`
- `AgentConflict`
- `CoordinationDecision`
- `DelegationPlan`

All persisted and runtime-returned records are JSON-safe summaries. They store evidence references, operation IDs, proposal IDs, validation IDs, usage summaries, warnings, and limitations. They do not store credentials, full source files, raw prompts, private reasoning, or unbounded command/model output.

## Roles And Strategies

Frozen roles:

- COORDINATOR
- PLANNER
- ARCHITECT
- CODE_ANALYST
- IMPLEMENTER
- REVIEWER
- TESTER
- SECURITY_REVIEWER
- PERFORMANCE_REVIEWER
- DOCUMENTATION_REVIEWER
- RELEASE_REVIEWER
- REPAIR_SPECIALIST
- CUSTOM

Frozen strategies:

- NONE
- SEQUENTIAL
- PARALLEL_INDEPENDENT
- PARALLEL_REVIEW
- PIPELINE
- REVIEW_BOARD
- ADAPTIVE_BOUNDED

Levi does not instantiate every role automatically. The coordinator chooses the smallest useful role set within `maximumAgentsPerTeam`.

## Team Lifecycle

Team states are CREATED, PLANNING, ACTIVE, WAITING, WAITING_FOR_APPROVAL, RECONCILING, VALIDATING, REPAIRING, PAUSED, CANCELLING, CANCELLED, COMPLETED, PARTIALLY_COMPLETED, FAILED, and EXPIRED.

Assignment states are CREATED, QUEUED, GATHERING_CONTEXT, WAITING_FOR_MODEL, RUNNING, STREAMING, WAITING_FOR_DEPENDENCY, WAITING_FOR_APPROVAL, SUBMITTED, VALIDATING, ACCEPTED, REJECTED, CONFLICTED, CANCELLED, FAILED, TIMED_OUT, and EXPIRED.

## Delegation Scoring

Delegation is scored using task complexity, file/subsystem breadth, domain diversity, source-change risk, security sensitivity, validation complexity, uncertainty, independence, available runtime capability, model capacity, and coordination overhead.

Delegation is usually rejected for simple questions, single read-only queries, incomplete context, unsafe partitioning, unavailable capabilities, or excessive overhead.

## Team Composition

Examples:

- Simple source-changing implementation: COORDINATOR, PLANNER, IMPLEMENTER, REVIEWER.
- Security-sensitive implementation: COORDINATOR, PLANNER, IMPLEMENTER, SECURITY_REVIEWER, bounded by configured role count.
- Architecture-only request: COORDINATOR, ARCHITECT, REVIEWER.
- Validation failure: COORDINATOR, TESTER, REPAIR_SPECIALIST, REVIEWER.
- Release assessment: COORDINATOR, RELEASE_REVIEWER, SECURITY_REVIEWER, TESTER.

The coordinator owns scope, assignment creation, bounds, conflict detection, reconciliation, and the final result. The coordinator cannot approve protected actions.

## Context Isolation

Assignments receive bounded role-specific objectives, scopes, allowed tools, prohibited tools, privacy classification, context request, expected output, dependencies, and evidence references.

The engine builds context through `LeviApplicationRuntime.executeCommand("context.build", ...)` when available. It does not scan the repository independently and does not provide full conversation history, full repositories, credentials, unrelated files, or private reasoning.

The strictest privacy classification for the assignment governs remote model eligibility. Same-model review is allowed by default but is surfaced as a limitation and is not treated as independent validation.

## Model Usage

Assignment execution uses `AgentOrchestrationEngine` through runtime commands `agent.createConversation` and `agent.sendMessage`. The coordinator does not duplicate provider request construction and does not call provider SDKs. `ModelProviderGateway` remains the provider boundary.

## Allowed Tools

Roles are configured with narrow allowed/prohibited tool lists. Implementers and repair specialists may create, validate, and preview workspace-tool proposals. Reviewers and testers may inspect proposals, diffs, allowed commands, and source-control status. No role may directly apply a proposal or execute arbitrary commands.

## Evidence Contract

Every material result is normalized into `AgentResult`. Findings without evidence are marked `INSUFFICIENT_EVIDENCE` or `HYPOTHESIS`. A result cannot be accepted when evidence is required and missing.

The team result never claims:

- Files changed without verified application evidence.
- Validation passed without validation evidence.
- Security passed without security-review evidence.
- Review was independent when a role reviewed itself.
- Approval occurred without runtime approval evidence.
- Conflicts were resolved when they remain open.

## Review Contract

Source-changing work requires independent review when configured. Implementers cannot be the sole reviewer. Security-sensitive work requires a security reviewer when available. Reviewer acceptance is not user approval.

Review findings distinguish correctness, architecture fit, security, maintainability, performance, test adequacy, scope compliance, stale evidence, unsupported claims, and approval readiness.

## Conflict Contract

Conflict categories include contradictory findings, contradictory recommendations, overlapping changes, incompatible changes, duplicate work, authority conflicts, evidence conflicts, scope conflicts, validation conflicts, security conflicts, and unknown conflicts.

Severities are INFO, LOW, MEDIUM, HIGH, and CRITICAL.

Resolution methods are EVIDENCE_PRIORITY, AUTHORITY_PRIORITY, VALIDATION_RESULT, REQUEST_REVISION, ACCEPT_ONE, MERGE_COMPATIBLE, ESCALATE_TO_USER, REJECT_ALL, and DEFER.

Critical security conflicts, approval-policy conflicts, incompatible protected changes, and unresolved actual-versus-proposed scope conflicts are not silently resolved. They require rejection, deferral, or user escalation.

## Reconciliation Behavior

The coordinator reconciles accepted/rejected results, unresolved conflicts, proposed changes, applied changes, validation state, security-review state, test state, evidence, warnings, limitations, confidence, completeness, and recommended next action into a team result.

Proposal reconciliation preserves individual proposals, detects overlapping file changes, invalidates previous approval assumptions, and routes any resulting proposal back through `ControlledWorkspaceToolEngine` validation and normal runtime approval.

## Runtime Commands

`LeviApplicationRuntime` exposes:

- `multiAgent.health`
- `multiAgent.roles`
- `multiAgent.previewDelegation`
- `multiAgent.createTeam`
- `multiAgent.startTeam`
- `multiAgent.cancelTeam`
- `multiAgent.getTeam`
- `multiAgent.listTeams`
- `multiAgent.getAssignment`
- `multiAgent.listAssignments`
- `multiAgent.retryAssignment`
- `multiAgent.requestRevision`
- `multiAgent.getConflicts`
- `multiAgent.resolveConflict`
- `multiAgent.reconcile`

Runtime initializes without the multi-agent component and returns `UNCONFIGURED` for multi-agent commands when absent.

## Agent Integration

`AgentOrchestrationEngine` has optional delegation helpers:

- `delegateTurn(turnId, options)`
- `getTeamForTurn(turnId)`
- `getDelegationPreview(turnIdOrInput, options)`
- `cancelDelegation(teamId, reason)`
- `reconcileDelegation(teamId, options)`

Single-agent flow remains unchanged when the coordinator is disabled, unavailable, unnecessary, or provider capacity is limited.

## VS Code View And Commands

The extension contributes `levi.multiAgent` and commands:

- `levi.showMultiAgentTeam`
- `levi.previewDelegation`
- `levi.startDelegatedTask`
- `levi.cancelDelegatedTask`
- `levi.showAssignment`
- `levi.retryAssignment`
- `levi.requestAssignmentRevision`
- `levi.showAgentConflicts`
- `levi.resolveAgentConflict`
- `levi.reconcileAgentResults`

Settings:

- `levi.multiAgent.enabled`
- `levi.multiAgent.defaultStrategy`
- `levi.multiAgent.maximumAgents`
- `levi.multiAgent.maximumConcurrentAssignments`
- `levi.multiAgent.maximumDelegationRounds`
- `levi.multiAgent.requireIndependentChangeReview`
- `levi.multiAgent.requireSecurityReviewForSensitiveChanges`
- `levi.multiAgent.allowSameModelForReview`
- `levi.multiAgent.persistTeamSummaries`

No auto-approval, unlimited agents, unlimited concurrency, or silent background teams were added.

## Persistence And Recovery

Default storage path is `.levi/multi-agent-coordination.json`. The core uses an injected persistence adapter and defaults to in-memory persistence to remain platform-independent.

Recovery marks in-flight assignments interrupted, preserves completed results and unresolved conflicts, avoids auto-resuming protected actions, invalidates stale context via limitations, lowers confidence, and requires explicit retry.

## Security And Privacy Model

The engine does not import VS Code, Electron, browser APIs, provider SDKs, direct filesystem APIs, direct shell APIs, direct source-control APIs, or specific model providers.

Protected actions flow through `LeviApplicationRuntime`. Source changes flow through `ControlledWorkspaceToolEngine`. Validation execution flows through runtime command allowlists and approval gates. No specialized agent can approve another agent's protected action.

## Manual Verification Checklist

- Launch Extension Development Host.
- Enable multi-agent mode.
- Preview delegation for a simple question and confirm no unnecessary team is created.
- Preview delegation for a multi-file task and inspect selected roles.
- Start team and inspect assignment states.
- Observe parallel independent assignments where safe.
- Inspect role-specific context summaries and findings.
- Trigger conflicting recommendations and inspect conflict state.
- Resolve or escalate conflict.
- Request a source-changing proposal and verify independent review.
- Verify reviewer cannot approve.
- Verify apply still uses normal approval flow.
- Trigger validation failure and inspect repair assignment.
- Cancel active team.
- Reload extension and inspect recovered team summary.
- Confirm no credentials, complete source files, or private reasoning appear in logs.
- Confirm agent count and concurrency remain bounded.

Manual verification is documented but not required before L3-007. Full live smoke testing remains scheduled after production hardening and before Marketplace release.

## Known Limitations

- The default core persistence adapter is in-memory unless a host injects durable storage.
- Assignment execution is bounded and can fall back to deterministic outputs when the runtime agent/model path is unavailable.
- Native VS Code conflict-resolution UX is command/TreeView based; no separate large frontend was added.
- Proposal merge is conservative and review-oriented; actual mutation remains a workspace-tool approval/apply operation.

## L3-007 Readiness Criteria

L3-007 may proceed when the full test suite, multi-agent tests, agent tests, workspace-tool tests, model-provider tests, extension tests, syntax checks, and manifest validation pass with no regression, and when no unresolved critical security/privacy/approval boundary gaps remain.
