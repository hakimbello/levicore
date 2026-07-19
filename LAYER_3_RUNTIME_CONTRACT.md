# Layer 3 Runtime Contract

## Scope

`src/levi-application-runtime.js` implements L3-001 `LeviApplicationRuntime`, the stable application-facing boundary over Levi's Layer 2 intelligence and autonomous-execution systems.

The runtime is for future VS Code, desktop IDE, CLI, test harness, and embedded callers. It is not a frontend, editor extension, model provider, network client, shell executor, Git layer, repository scanner, indexer, graph store, planner, context assembler, code-understanding engine, project-intelligence engine, learning engine, validator, repair engine, security engine, approval engine, or certification engine.

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
- `getRuntimeHealth(options)`
- `getRuntimeStats()`
- `snapshot()`
- `restore(snapshot)`
- `save()`
- `load(options)`

Workspace:

- `openWorkspace(input, options)`
- `closeWorkspace(workspaceId, options)`
- `refreshWorkspace(workspaceId, options)`
- `getWorkspace(workspaceId)`
- `listWorkspaces(filter)`
- `getWorkspaceHealth(workspaceId, options)`
- `getWorkspaceCapabilities(workspaceId, options)`
- `analyzeWorkspace(workspaceId, options)`

Session:

- `createSession(input, options)`
- `startSession(sessionId, options)`
- `pauseSession(sessionId, reason)`
- `resumeSession(sessionId, options)`
- `cancelSession(sessionId, reason)`
- `completeSession(sessionId, result)`
- `failSession(sessionId, error)`
- `getSession(sessionId)`
- `listSessions(filter)`

Operation:

- `submitOperation(input, options)`
- `executeOperation(input, options)`
- `cancelOperation(operationId, reason)`
- `pauseOperation(operationId, reason)`
- `resumeOperation(operationId, options)`
- `retryOperation(operationId, options)`
- `getOperation(operationId)`
- `listOperations(filter)`
- `waitForOperation(operationId, options)`
- `getOperationResult(operationId)`
- `getOperationProgress(operationId)`

Command:

- `registerCommand(command)`
- `unregisterCommand(commandId)`
- `executeCommand(commandId, input, options)`
- `listCommands(filter)`
- `getCommand(commandId)`

Query:

- `query(input, options)`
- `getProjectSummary(workspaceId, options)`
- `getArchitectureState(workspaceId, options)`
- `getProjectAssessment(workspaceId, options)`
- `getReleaseReadiness(workspaceId, options)`
- `getProjectBlockers(workspaceId, options)`
- `getProjectRisks(workspaceId, options)`
- `getNextActions(workspaceId, options)`
- `searchWorkspace(workspaceId, query, options)`
- `queryRepositoryGraph(workspaceId, query, options)`
- `getCodeUnderstanding(workspaceId, input, options)`
- `getContextPackage(workspaceId, input, options)`
- `getPlan(workspaceId, planId, options)`
- `getLearningState(workspaceId, options)`
- `getCertificationState(options)`

Events:

- `subscribe(listener, filter)`
- `unsubscribe(subscriptionId)`
- `publish(event)`
- `getEvents(filter)`
- `clearEvents(options)`

## Normalized Models

Runtime states are `CREATED`, `INITIALIZING`, `READY`, `DEGRADED`, `RECOVERING`, `SUSPENDED`, `SHUTTING_DOWN`, `STOPPED`, and `FAILED`.

Workspace states are `CLOSED`, `OPENING`, `OPEN`, `INDEXING`, `ANALYZING`, `READY`, `DEGRADED`, `CLOSING`, and `FAILED`.

Session states are `CREATED`, `ACTIVE`, `WAITING_FOR_APPROVAL`, `WAITING_FOR_INPUT`, `PAUSED`, `CANCELLING`, `CANCELLED`, `COMPLETED`, `FAILED`, and `EXPIRED`.

Operation states are `QUEUED`, `STARTING`, `RUNNING`, `WAITING`, `WAITING_FOR_APPROVAL`, `PAUSED`, `CANCELLING`, `CANCELLED`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, `FAILED`, and `TIMED_OUT`.

Operation types include runtime lifecycle, workspace lifecycle, project analysis/search/query, graph query, code understanding, project assessment, project summary, planning, context building, execution, validation, repair, approval response, security status, release readiness, next actions, learning, adaptation, certification, save/restore, and `CUSTOM`.

Operation priorities are `LOW`, `NORMAL`, `HIGH`, and `CRITICAL`. Critical priority changes ordering only; it does not bypass security, approval, validation, cancellation, timeout, or bounds.

Runtime configuration fields are `id`, `version`, `schemaVersion`, `storageRoot`, `workspaceStorageRoot`, `offlineMode`, `strictSecurity`, `approvalPolicy`, `defaultTimeoutMs`, `shutdownTimeoutMs`, `maximumConcurrentOperations`, `maximumQueuedOperations`, `maximumSessions`, `maximumWorkspaces`, `maximumEventHistory`, `maximumOperationHistory`, `maximumResultSize`, `eventBufferSize`, `persistenceEnabled`, `autoSaveEnabled`, `autoSaveIntervalMs`, `recoveryEnabled`, `diagnosticsEnabled`, `featureFlags`, and `metadata`.

Workspace descriptors include `id`, `uri`, `name`, `rootPath`, `projectId`, `state`, `revision`, `repositoryType`, `openedAt`, `lastAnalyzedAt`, `capabilities`, `limitations`, `health`, and `metadata`.

Runtime sessions include `id`, `workspaceId`, `projectId`, `type`, `state`, `objective`, `currentOperationId`, `operationIds`, `approvalRequestIds`, `securityDecisionIds`, `contextPackageIds`, `planIds`, `executionIds`, `evidence`, `metadata`, `createdAt`, `updatedAt`, and `expiresAt`.

Runtime operations include `id`, `sessionId`, `workspaceId`, `projectId`, `type`, `command`, `state`, `priority`, `input`, `output`, `progress`, `currentStage`, `stages`, `result`, `error`, `cancellation`, `approval`, `security`, `evidence`, `childOperationIds`, `parentOperationId`, `startedAt`, `completedAt`, `createdAt`, `updatedAt`, and `metadata`.

Progress includes `operationId`, `stage`, `message`, `current`, `total`, `percentage`, `indeterminate`, `cancellable`, `metadata`, and `timestamp`. Percentages are bounded 0-100 and monotonic within normal stage updates.

Results include `id`, `operationId`, `success`, `partial`, `status`, `data`, `warnings`, `limitations`, `evidence`, `confidence`, `completeness`, `error`, `metadata`, and `createdAt`.

Errors include `id`, `code`, `category`, `message`, `userMessage`, `operationId`, `sessionId`, `workspaceId`, `retryable`, `recoverable`, `severity`, `cause`, `details`, `evidence`, `suggestedActions`, `metadata`, and `createdAt`. Categories are configuration, initialization, workspace, session, command, capability, engine, adapter, validation, security, approval, execution, cancellation, timeout, persistence, recovery, resource limit, contract, and unknown. Severities are `INFO`, `WARNING`, `ERROR`, and `CRITICAL`.

Events include `id`, `sequence`, `type`, `source`, `runtimeId`, `workspaceId`, `projectId`, `sessionId`, `operationId`, `payload`, `evidence`, `timestamp`, and `metadata`.

Approval requests include `id`, `sessionId`, `operationId`, `workspaceId`, `projectId`, `type`, `title`, `description`, `requestedAction`, `risks`, `scope`, `evidence`, `status`, `decision`, `requestedAt`, `expiresAt`, `resolvedAt`, and `metadata`. Statuses are `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`, `CANCELLED`, and `FAILED`.

## Command Contract

Runtime commands normalize:

- `id`
- `name`
- `description`
- `domain`
- `version`
- `inputSchema`
- `outputSchema`
- `requiredCapabilities`
- `requiredWorkspaceState`
- `requiresSession`
- `securitySensitive`
- `approvalSensitive`
- `cancellable`
- `timeoutMs`
- `handler`
- `metadata`

The registry rejects duplicate IDs, protects built-ins from frontend replacement by default, preserves deterministic ordering, validates command shape, exposes capability requirements, and supports aliases only when unambiguous.

Built-in inventory:

- `runtime.health`
- `runtime.capabilities`
- `runtime.certification`
- `workspace.open`
- `workspace.close`
- `workspace.refresh`
- `workspace.analyze`
- `project.summary`
- `project.assessment`
- `project.architecture`
- `project.blockers`
- `project.risks`
- `project.nextActions`
- `project.releaseReadiness`
- `repository.search`
- `repository.graphQuery`
- `code.understand`
- `planning.create`
- `planning.validate`
- `context.build`
- `execution.executeObjective`
- `execution.validate`
- `execution.repair`
- `approval.respond`
- `security.status`
- `learning.status`
- `learning.applyAdaptation`
- `learning.rollbackAdaptation`
- `persistence.save`
- `persistence.restore`

Commands with missing capabilities fail with normalized `CAPABILITY` errors. Capability discovery comes from `IntelligenceIntegrationEngine`; the runtime does not infer engine readiness from filenames.

## Workspace Adapter Contract

Workspace adapters support:

- `normalizeUri(input)`
- `validateWorkspace(input)`
- `openWorkspace(input, options)`
- `closeWorkspace(workspace, options)`
- `getWorkspaceMetadata(workspace)`
- `getWorkspaceRevision(workspace)`
- `listFiles(workspace, options)`
- `readFile(workspace, uri, options)`
- `stat(workspace, uri, options)`
- `watchWorkspace(workspace, listener, options)`
- `unwatchWorkspace(subscriptionId)`
- `resolvePath(workspace, input)`

The default `UriWorkspaceAdapter` is metadata-only and accepts URI-like workspace IDs. It intentionally does not read files. Local file access belongs in an injected adapter.

## Event Contract

Lifecycle events include runtime creation, initialization, configuration validation, component registration/unavailability, capability discovery, ready/degraded/suspended/resumed/shutdown/stopped/failed/recovery events, workspace open/validate/analyze/ready/degraded/close/fail events, session lifecycle events, operation submit/queue/start/progress/wait/approval/resume/cancel/succeed/partial/fail/timeout events, approval events, command events, runtime health checks, persistence, restore, corruption, and partial analysis.

Subscriptions can filter by event type, workspace, session, or operation. Listener failures are counted in stats and never crash the runtime.

## Security And Approval

Security-sensitive commands fail closed when `SecurityValidator` is absent or returns `BLOCKED` or `REQUIRES_REVIEW`. Security decisions are recorded and attached to operations.

Approval-sensitive commands create a normalized pending approval request through `ApprovalGateway`. The runtime never treats missing approval as acceptance and never fabricates user approval. `approval.respond` records explicit approval or rejection. Approved requests become traceable evidence; rejected requests fail the waiting operation.

## Cancellation

Cancellation is idempotent, preserves operation history, propagates to child operations, cancels queued operations immediately, records cooperative cancellation for running operations, and never reports cancellation as success.

## Frontend Serialization

Runtime results are frontend-safe. Serialization removes functions, internal runtime/adapter/handler/instance references, raw stacks, circular references, and secret-like keys. It enforces configured result-size bounds and preserves IDs, structured errors, evidence references, confidence, completeness, and ISO timestamps.

## Health And Degraded Mode

Health includes runtime state, configuration validity, component inventory, available and unavailable capabilities, integration health, certification state, workspaces, sessions, queued/running/failed operations, persistence status, event status, security status, approval status, warnings, blockers, confidence, completeness, and deterministic domain scores.

Scoring domains are initialization, configuration, component availability, capability coverage, workspace readiness, operation reliability, event reliability, persistence reliability, security integrity, approval integrity, integration certification, and overall runtime health.

Critical caps keep missing security, missing approval, incompatible contracts, failed configuration, failed workspace validation, corrupted state, and certification below `IDE_CORE_READY` visible. DEGRADED means usable with limitations; FAILED means core invariants are not enforceable.

## Persistence And Recovery

Default persistence target is `.levi/application-runtime.json`. The runtime stores compact coordination state: configuration, workspace descriptors, session summaries, operation summaries, command metadata, approval summaries, event checkpoints, health history, statistics, and schema version.

It does not store repository contents, full engine stores, full execution transcripts, complete context packages, source code, or secrets. Engine-owned records remain referenced, not duplicated.

Recovery validates runtime snapshots, marks in-flight operations interrupted, restores safe descriptors, expires approvals, preserves failure evidence, re-evaluates health/certification, and requires explicit retry for interrupted protected operations.

## Future Integration Guidance

VS Code extension:

- Treat the runtime as the extension backend boundary.
- Implement a VS Code workspace adapter for URI normalization, file listing, file reads, and watchers.
- Convert runtime events into extension UI updates.
- Use command IDs as stable extension commands.
- Submit approvals through `approval.respond`; do not self-approve.

Desktop IDE:

- Use the same runtime APIs as the VS Code shell.
- Inject desktop persistence/workspace/event adapters.
- Render only frontend-safe envelopes.
- Keep editor mutation, terminal execution, Git, and model-provider behavior behind future adapters and approval/security gates.

## Explicit Non-Goals For L3-001

- No VS Code extension.
- No desktop UI.
- No browser UI.
- No model-provider SDKs.
- No networking requirement.
- No direct repository scanning/indexing/graph replacement.
- No source-writing workspace adapter requirement.
- No shell, Git, package-install, or command-execution runtime feature.
- No production certification claim.

## Known Limitations

Approval response records explicit decisions but does not automatically re-run protected command handlers after approval. Callers retry or resubmit with approval evidence when future source-changing adapters are introduced.

The default workspace adapter is intentionally URI-only. Real repository reads must be supplied by an adapter.

The runtime is ready for a VS Code extension shell as a stable backend boundary, but L3-002 must still provide the editor adapter, UI surface, extension command bindings, and explicit approval UX.
