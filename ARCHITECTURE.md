# Levi Core Architecture

## Architecture Status

PROPOSED for M0 approval. No implementation begins before approval.

## Design Principles

- Levi Core owns workflow, policy, state, and interfaces.
- External projects remain replaceable adapters.
- Deterministic inspection precedes model interpretation.
- Approved project truth remains separate from inferred memory.
- One task moves through an explicit state machine.
- Local-first operation is preferred where sufficient.

## Initial Technology Direction

- Language: TypeScript on Node.js.
- Primary interface: CLI.
- Structured state: SQLite.
- Approved project truth: repository Markdown documents.
- Source parsing: Tree-sitter adapter.
- Semantic retrieval: vector store adapter, candidate to be selected through OSS review.
- Conversational memory: memory adapter, candidate to be selected through OSS review.
- Model access: model gateway adapter, candidate to be selected through OSS review.
- Coding execution: coding executor adapter, candidate to be selected through OSS review.

No external repository is approved for integration until documented evaluation is complete.

## Core Modules

### 1. Project Registry

Responsibilities:

- Register repository paths.
- Assign stable project IDs.
- Store project metadata.
- Enforce repository boundaries.

Maps to LC-MVP-001.

### 2. Repository Analyzer

Responsibilities:

- Walk repository files safely.
- Apply ignore and secret-exclusion rules.
- Parse deterministic repository signals.
- Produce cited project facts.

Maps to LC-MVP-002.

### 3. Memory Service

Responsibilities:

- Store verified facts, approved decisions, task outcomes, and failed attempts.
- Separate approved, verified, inferred, and rejected records.
- Retrieve relevant project context.
- Support inspection and deletion.

Maps to LC-MVP-003.

### 4. Scope Service

Responsibilities:

- Load approved requirements.
- Match task requests to requirement IDs.
- Reject unsupported work.
- Mark ambiguity for approval.

Maps to LC-MVP-004.

### 5. Planning Service

Responsibilities:

- Produce bounded task plans.
- List expected files, risks, validation, and exclusions.
- Store plan approval state.

Maps to LC-MVP-005.

### 6. Model Gateway

Responsibilities:

- Normalize provider configurations, model descriptors, model requests, responses, stream events, usage records, and provider errors through `src/model-provider-gateway.js`.
- Register provider packages through a provider-neutral adapter contract. Built-in packages currently include `src/providers/ollama-provider-adapter.js` for local Ollama and `src/providers/openai-compatible-provider-adapter.js` for remote OpenAI-compatible HTTP APIs.
- Isolate HTTP/network behavior behind `src/transports/http-transport.js`; the gateway core does not import provider SDKs or make network calls directly.
- Resolve credentials through references using `src/credential-resolver.js` or host-specific resolvers. Credential values are not persisted in gateway snapshots, runtime envelopes, virtual documents, or extension output.
- Route by explicit model, local-first, remote-first, privacy-first, cost, capability, latency, balanced, or fallback-chain strategy while enforcing privacy classifications and context bounds before dispatch.
- Support chat, text, structured generation, tool calls, streaming, cancellation, retry, fallback, provider health, model discovery, token estimation, cost accounting, snapshot/restore, corruption handling, and bounded histories.
- Expose the gateway to Layer 3 through `LeviApplicationRuntime` commands: `model.providers`, `model.models`, `model.health`, `model.routingPreview`, `model.complete`, `model.cancel`, and `model.usage`.
- Surface provider state in the VS Code shell through the Models view, model status bar, provider/model/health/usage commands, local Ollama settings, remote OpenAI-compatible settings, and VS Code secret storage.

Maps to LC-MVP-006.

### 7. Coding Executor

Responsibilities:

- Execute approved file changes.
- Enforce repository and file boundaries.
- Enforce step, time, and cost ceilings.
- Record exact changes.

Maps to LC-MVP-007.

Layer 3 controlled workspace tools are implemented in `src/controlled-workspace-tool-engine.js` and documented in `LAYER_3_WORKSPACE_TOOLS.md`. This engine is the approval-bound mutation and validation boundary for IDE/runtime/agent workflows. It is platform-independent and reaches files, commands, and source control only through host adapters.

Runtime integration exposes `workspaceTools.*`, `change.*`, `validation.*`, `command.*`, and `sourceControl.*` commands. Agent integration registers these as runtime-command tools, so source-changing or command-executing agent actions remain approval-gated and adapter-mediated. VS Code integration provides the `levi.changes` Change Review view and conservative settings that keep source changes and command execution disabled by default.

## Agent Orchestration

`src/agent-orchestration-engine.js` provides the Layer 3 coding-session controller. It is platform-independent and depends on `LeviApplicationRuntime` and `ModelProviderGateway` through public APIs only. It does not import VS Code, browser, Electron, provider SDKs, shell APIs, or LI/AE internals.

The orchestrator owns agent lifecycle state, conversation state, turn state, deterministic request classification, capability resolution, context coordination, planning coordination, provider request construction, tool-call normalization, approval gating, validation/repair coordination, response synthesis, compact persistence, recovery, health scoring, events, and statistics.

Runtime boundary:

- Agent tool execution goes through `LeviApplicationRuntime.executeCommand`.
- Context uses `context.build`.
- Planning uses `planning.create` and `planning.validate`.
- Runtime/project/code/search/model/health tools are registered as read-only runtime-command tools.
- Protected tools remain unavailable or approval-gated; the orchestrator does not perform direct source mutation or unrestricted shell execution.

Provider boundary:

- Model dispatch uses `ModelProviderGateway` when registered, or runtime `model.*` commands.
- Provider requests carry privacy classification and bounded context only.
- No raw engine instances, adapters, authorization headers, credentials, full source files, private reasoning, or circular objects are sent or persisted.

Conversation lifecycle:

1. Create or recover conversation.
2. Receive user message.
3. Classify request.
4. Resolve capabilities.
5. Build bounded context.
6. Create or reuse plan when required.
7. Propose deterministic or model tool calls.
8. Execute safe read-only tools through runtime.
9. Request model synthesis when provider policy allows.
10. Validate and repair when execution evidence requires it.
11. Synthesize an evidence-backed final response.
12. Persist compact summaries.

Turn lifecycle follows explicit states from CREATED through classification, context, planning, model request, tool proposal/execution, validation, repair, synthesis, and terminal states. Final responses distinguish completed, partially completed, provider unavailable, approval required, validation failed, blocked, cancelled, and timed out outcomes.

Learning integration is event/signal based. The orchestrator records compact learning signals for successful context patterns, tool sequences, model selection outcomes, validation/repair outcomes, rejected tool proposals, and user corrections. Adaptations may influence context, planning, provider preference, tool ordering, response format, and validation emphasis, but never override user instructions, project instructions, privacy, security, approval, verified repository state, or validation evidence.

Persistence writes compact summaries to `.levi/agent-orchestration.json` by default. It stores configuration, conversation summaries, turn summaries, message summaries, tool-call summaries, plan/context references, operation references, approval references, evidence references, usage summaries, events, and statistics. It does not persist credentials, authorization headers, complete source files, complete prompts, complete provider responses, private reasoning, or secret content.

Recovery validates persisted state, marks in-flight turns failed/interrupted, pauses active conversations, preserves completed evidence, lowers confidence for stale context, and never auto-resumes protected operations.

VS Code Agent UI:

- The extension contributes `levi.agent` and a bounded webview panel opened by `levi.openAgent`.
- The webview uses a restrictive Content Security Policy, nonce-based scripts/styles, no external resources, message-schema validation, command allowlisting, bounded messages, and frontend-safe serialized state.
- Agent commands include create conversation, send message, cancel turn, retry turn, show context, show plan, show tools, and clear conversation.

Authoritative provider implementation:

- `src/model-provider-gateway.js` is authoritative for Layer 3 runtime, agent, and VS Code model integration.
- `src/providers/ollama-provider-adapter.js` and `src/providers/openai-compatible-provider-adapter.js` are the authoritative L3 provider packages.
- Legacy experimental files `src/model-gateway.js`, `src/model-provider-interface.js`, `src/providers/ollama-provider.js`, and `src/providers/remote-provider.js` remain only for older CLI/readiness flows that still import them.
- Runtime and VS Code extension code must not import legacy provider implementations. Automated tests protect this boundary.
- Legacy removal is safe only after CLI/readiness flows migrate to `ModelProviderGateway`.

## Multi-Agent Coordination

`src/multi-agent-coordination-engine.js` provides the Layer 3 bounded delegation coordinator. It is platform-independent and depends on `LeviApplicationRuntime`, `AgentOrchestrationEngine`, `ControlledWorkspaceToolEngine`, and `ModelProviderGateway` through public boundaries only.

The coordinator owns delegation eligibility, delegation scoring, minimal team composition, role definitions, team lifecycle, assignment lifecycle, role-specific context requests, deterministic scheduling, dependency-aware concurrency, result normalization, duplicate-work detection, conflict detection, conflict resolution, independent review enforcement, reconciliation, compact persistence, recovery, health scoring, events, and statistics.

Coordinator authority:

- Owns the original objective, bounded plan, assignment scopes, reconciliation, and final team result.
- Cannot grant user approval.
- Cannot bypass security, privacy, validation, or approval gates.
- Cannot apply source changes directly.
- Cannot execute arbitrary commands directly.
- Cannot claim validation, security review, approval, or file mutation without evidence.

Role model:

- Roles include coordinator, planner, architect, code analyst, implementer, reviewer, tester, security reviewer, performance reviewer, documentation reviewer, release reviewer, repair specialist, and custom.
- Levi selects the smallest useful role set and does not create an uncontrolled swarm.
- Each assignment receives bounded scope, allowed tools, prohibited tools, privacy classification, context request, output contract, dependency references, and operation bounds.
- Assignments do not receive full conversation history, full repositories, credentials, unrelated files, private reasoning, or unrestricted runtime access.

Delegation eligibility and scoring consider objective complexity, file and subsystem breadth, domain diversity, source-change risk, security sensitivity, validation complexity, uncertainty, independence of subtasks, available capabilities, model capacity, and coordination overhead. Simple questions and single read-only queries remain single-agent.

Planning and context:

- Delegation plans reference existing project/runtime planning boundaries instead of creating a second project planning system.
- Role-specific context is requested through runtime `context.build`.
- The multi-agent coordinator does not scan the repository independently.
- The strictest privacy classification governs each assignment independently.

Execution and concurrency:

- Assignment execution uses runtime `agent.createConversation` and `agent.sendMessage`; provider request construction remains in `AgentOrchestrationEngine` and `ModelProviderGateway`.
- Parallel execution is allowed only for dependency-ready, non-conflicting assignments within configured concurrency bounds.
- Critical priority never bypasses dependencies, security, privacy, approval, scope, or concurrency limits.

Workspace, approval, validation, and repair:

- Specialized agents may create, validate, and preview proposals through runtime workspace-tool commands.
- Source mutation remains exclusive to the normal `ControlledWorkspaceToolEngine` approval/apply path.
- Validation execution flows through runtime command allowlists and approval requirements.
- Repair assignments receive failure evidence and original objective, remain bounded, and require renewed review/approval when scope changes.

Evidence and conflict handling:

- All outputs normalize into `AgentResult` with findings, proposals, risks, assumptions, unresolved questions, evidence, confidence, completeness, warnings, and limitations.
- Unsupported claims are marked insufficient evidence or hypothesis.
- Duplicate assignments, duplicate findings, duplicate proposals, overlapping changes, contradictory findings, authority conflicts, validation conflicts, and security conflicts are detected.
- Critical security conflicts, approval-policy conflicts, incompatible protected changes, and actual/proposed scope conflicts are not silently resolved.
- Resolution can use evidence priority, authority priority, validation result, revision request, accept-one, merge-compatible, escalate-to-user, reject-all, or defer.

Persistence and recovery:

- Compact summaries persist by default to `.levi/multi-agent-coordination.json` through an injected adapter.
- Recovery marks in-flight assignments interrupted, avoids auto-resuming protected actions, preserves completed results and unresolved conflicts, invalidates stale context, lowers confidence where evidence is incomplete, and requires explicit retry.

VS Code monitoring:

- The extension contributes `levi.multiAgent`, a TreeView for teams, assignments, conflicts, review state, validation state, proposed changes, warnings, and limitations.
- Commands preview delegation, start/cancel delegated teams, show/retry/revise assignments, show/resolve conflicts, and reconcile results.
- No new large frontend framework is introduced.

Known limitations:

- Default core persistence is in-memory unless a host injects durable storage.
- Same-provider/model review is allowed by configuration but surfaced as a limitation and never treated as validation.
- Proposal merging is conservative; actual file mutation remains in workspace-tool apply.

## Durable Workflow Engine

`src/durable-workflow-engine.js` provides the Layer 3 durable objective coordinator. It is platform-independent and depends on `LeviApplicationRuntime`, `AgentOrchestrationEngine`, `MultiAgentCoordinationEngine`, `ControlledWorkspaceToolEngine`, and `ModelProviderGateway` only through public boundaries. It does not import VS Code, Electron, browser APIs, provider SDKs, shell APIs, filesystem APIs, source-control APIs, or LI/AE internals.

The workflow engine owns durable workflow state, normalized workflow graphs, dependency validation, deterministic scheduling, bounded step execution, checkpoints, decisions, retries, repair orchestration, recovery, compact persistence, health scoring, statistics, and truthful workflow results. It does not own project planning, direct execution, source mutation, command execution, approval, validation, repair internals, model routing, or workspace trust.

Workflow boundary:

- Large objectives enter as an accepted plan, accepted agent plan, accepted multi-agent result, user-authored workflow definition, repair workflow, release remediation plan, or recovery plan.
- Accepted plans are converted into workflow graphs while preserving plan id, plan-step ids, dependencies, risks, validation requirements, approval requirements, evidence, confidence, and completeness.
- The engine does not create a second planning system; plan creation and validation remain runtime `planning.*` operations.
- Step execution is always routed through `LeviApplicationRuntime` commands, which in turn route to the authoritative engines.

Workflow lifecycle:

- Workflows move through created, validating, ready, queued, running, waiting, approval/input/dependency waits, paused, suspended, recovering, cancelling, cancelled, completed, partially completed, blocked, failed, expired, and archived states.
- Workflow state is derived from required step terminality, unresolved approvals, unresolved decisions, dependency blocks, validation/repair outcomes, and cancellation.
- Partial completion is explicit when independent branches succeed while other required branches fail, block, skip, or wait.
- Completion is never claimed while required steps remain blocked, while protected approvals are unresolved, while validation evidence is missing for required validation, or while user decisions remain unresolved.

Step lifecycle and types:

- Steps move through created, blocked, ready, queued, starting, running, waiting, approval/input/dependency waits, validating, repairing, retrying, paused, suspended, cancelling, cancelled, succeeded, partially succeeded, skipped, blocked-by-dependency, failed, timed-out, expired, and interrupted states.
- Step types include analysis, search, code understanding, project assessment, planning, context build, model inference, agent turn, multi-agent team, change proposal, change review, approval gate, change apply, validation, repair, command, source-control checkpoint/restore, user input, decision, checkpoint, synthesis, release assessment, documentation, and custom.
- Critical priority affects ordering only; it never bypasses dependencies, security, approval, privacy, workspace trust, validation, or resource bounds.

Dependency graph:

- Dependencies support success, completion, output, approval, validation, decision, soft, optional, mutex, and unknown relationships.
- Validation detects direct and indirect cycles, self-dependencies, duplicate dependencies, missing step references, unrelated-workflow references, dependency depth over bounds, expired required dependencies, and mutually exclusive scheduling risks.
- Ready steps are selected only after workflow eligibility, dependency satisfaction, security/approval eligibility, priority, workflow sequence, and step sequence.

Scheduling and safe concurrency:

- The workflow scheduler is a coordinator over runtime operation scheduling, not a replacement for it.
- `scheduleWorkflow`, `scheduleReadySteps`, `tick`, and `drain` select bounded ready steps and execute them through runtime commands.
- Parallel read-only execution is allowed only when dependencies are satisfied, scopes do not overlap, commands do not conflict, runtime/provider capacity allows it, configured concurrency allows it, and cancellation can be propagated safely.
- Source-changing and command-executing steps serialize conservatively.

Execution adapters:

- Analysis and project assessment use runtime project commands.
- Search uses runtime repository search.
- Code understanding uses runtime code commands.
- Planning and context use runtime planning/context commands.
- Model inference uses `ModelProviderGateway` through runtime.
- Agent turns use `AgentOrchestrationEngine` through runtime.
- Multi-agent steps use `MultiAgentCoordinationEngine` through runtime and preserve team ids/results/conflicts.
- Change proposals, reviews, applies, validation, commands, repair, and source-control checkpoints/restore use runtime workspace-tool, validation, repair, and source-control commands.
- No workflow step directly mutates files or executes arbitrary commands.

Approval and user-input checkpoints:

- Protected mutation, command, source-control restore, and approval-sensitive steps wait at approval checkpoints.
- Approval binding references workflow id, step id, objective, protected action, workspace revision when available, proposal/command identity, scope, risks, expiration, and evidence.
- Approvals are invalidated when protected step shape changes, proposal/command identity changes, workspace revision becomes stale, scope changes, approval expires, or recovery detects stale evidence.
- Time passing, retries, model agreement, reviewer acceptance, or prior successful steps are never approval.
- User-input and decision steps create explicit decisions with bounded options, consequences, authority, evidence, and resumable state; Levi never fabricates a user response.

Checkpointing and workspace revision:

- Checkpoints are compact, reference-based records. They store workflow/step states, active/completed/failed step ids, operation/proposal/approval/validation references, recovery metadata, evidence, confidence, and completeness.
- Checkpoints are created at workflow creation, plan acceptance, validation, before/after protected actions, before/after mutation, before/after command, after repair, manual requests, recovery, suspension, and completion.
- Workspace revisions are recorded where provided by runtime/workspace adapters. Material revision changes invalidate stale protected assumptions, block stale mutations, require revalidation, lower confidence/completeness, and preserve unaffected evidence.

Retries, repair, and failure propagation:

- Retries require retryable steps, retryable errors, remaining attempt bounds, non-cancelled workflow state, valid security/privacy posture, valid approval where appropriate, changed evidence after deterministic repeated failure, and remaining time budget.
- Rejected approval, privacy violations, prohibited commands, invalid patches, stale protected mutations, explicit cancellation, unsupported capability, and identical deterministic failures are not retried.
- Repair uses existing repair capabilities through runtime with bounded failure evidence, original objective, failed-step reference, lineage, attempt bounds, approval renewal when protected scope changes, and revalidation.
- Failure policies can fail the workflow, block dependents, skip dependents, continue independent branches, retry, repair then retry, require user decision, rollback and fail, or report partial completion.

Shutdown and recovery:

- Shutdown creates a compact checkpoint and suspends active workflows.
- Recovery marks interrupted in-flight steps paused or interrupted, clears stale approval bindings for protected steps, avoids auto-resuming protected work, preserves completed evidence, marks affected workflows recovering/suspended, lowers confidence, and requires revalidation before resume.
- Safe automatic resume is disabled by default and never covers protected mutations or commands.

Idempotency and duplicate prevention:

- Steps record attempts, input hashes, operation references, proposal references, validation references, repair references, and evidence lineage.
- Idempotent read-only steps can reuse evidence after revalidation.
- Duplicate mutation, command, and approval execution are prevented by step identity, protected checkpointing, approval invalidation, and runtime/workspace-tool boundaries.

Progress and truthful result:

- Progress is calculated from terminal and successful step counts under configured bounds.
- Workflow results include disposition, completed/partial/failed/blocked/skipped steps, applied/proposed changes, validation state, repair state, approval state, unresolved decisions/conflicts, evidence, warnings, limitations, confidence, and completeness.
- The engine does not report validation pass without validation evidence, source changes without proposal/application references, repaired outcome without revalidation, rollback success without verification, or independent review when none occurred.

Persistence:

- Default storage path is `.levi/durable-workflows.json`, but the core uses an injected persistence adapter and defaults to memory for platform independence.
- Persisted records are compact: configuration, workflow summaries, step summaries, dependency graph, checkpoint summaries, attempt summaries, decision summaries, operation/proposal/approval/validation/repair/evidence references, statistics, and schema version.
- Credentials, complete source files, full context packages, raw private prompts, provider reasoning, unbounded model output, unbounded command output, process handles, and adapter instances are not persisted.
- Corruption emits an event, preserves safe error details, falls back safely when configured, invalidates recovered ready claims, requires revalidation, and never resumes protected work.

Runtime and VS Code integration:

- Runtime commands are exposed as `workflow.health`, `workflow.create`, `workflow.validate`, `workflow.start`, `workflow.pause`, `workflow.resume`, `workflow.cancel`, `workflow.retry`, `workflow.get`, `workflow.list`, `workflow.explain`, `workflow.getResult`, `workflow.listSteps`, `workflow.getStep`, `workflow.retryStep`, `workflow.skipStep`, `workflow.getReadySteps`, `workflow.createCheckpoint`, `workflow.listCheckpoints`, `workflow.restoreCheckpoint`, `workflow.resolveDecision`, and `workflow.tick`.
- The runtime initializes without `DurableWorkflowEngine`; workflow commands return an unconfigured response when the component is absent.
- Runtime bridges workflow events back through the normal frontend-safe event stream.
- `AgentOrchestrationEngine` has optional workflow helpers for creating, looking up, continuing, and cancelling workflows from turns. Simple short-turn flow remains the default when workflows are unavailable or unnecessary.
- VS Code contributes `levi.workflows`, a TreeView for health, objective, state, progress, current/active/ready/blocked/failed steps, waiting approvals/decisions, last checkpoint, workspace revision, warnings, and limitations.
- VS Code commands create/start/pause/resume/cancel/retry workflows, show workflows/results/steps/checkpoints, retry/skip steps, create/restore checkpoints, and resolve decisions. No command implies approval.

Security and privacy boundaries:

- The workflow engine cannot approve actions, weaken security/privacy, mutate source, execute commands, bypass workspace trust, access provider credentials, expose private reasoning, or convert model/reviewer agreement into approval.
- Health scoring caps protected workflow readiness when approval, security, privacy, dependency integrity, checkpoint restore, persistence, retry/concurrency bounds, stale proposal handling, or required decisions are unsafe.

Known limitations:

- Default core persistence is in-memory unless a host injects durable storage.
- VS Code monitoring is TreeView/virtual-document based.
- Provider-unavailable paths may produce reference-only or blocked workflow results.
- Checkpoint restore restores workflow metadata/state; external source-control restore remains delegated to runtime/source-control commands.

## Repository Performance Engine

`src/repository-performance-engine.js` provides the Layer 3 repository intelligence performance coordinator. It does not replace `OfflineKnowledgeIndex`, `RepositoryKnowledgeGraph`, `ContextIntelligenceEngine`, planning, workflows, multi-agent coordination, or provider routing. It coordinates their reusable metadata through runtime boundaries and keeps repository understanding owned by the existing intelligence systems.

Performance responsibilities:

- Track incremental file snapshots, workspace revisions, dependency versions, cache generations, and compact repository metrics.
- Detect created, modified, deleted, renamed, and unchanged file records from stable path/hash/timestamp/size metadata.
- Invalidate only affected files, dependents, graph handles, context packages, plans, workflows, provider summaries, or all metadata depending on explicit invalidation scope.
- Register lazy repository graph handles and load them through `repository.graphQuery` when runtime integration is available.
- Reuse bounded context packages and token summaries only when workspace revision, dependency version, graph version, plan id, token budget, and affected paths match.
- Enforce LRU/TTL/generation cache policy and memory budgets while preserving protected validation, approval, and active workflow evidence.
- Run deterministic repository benchmark scenarios for cold/warm indexing, incremental indexing, rebuild, graph query, context reuse, workflow create/resume, and provider reuse.
- Persist compact metadata and statistics only.

Persistence boundary:

- Default storage path is `.levi/repository-performance.json`.
- Snapshots contain schema, configuration, stats, workspace revisions, dependency versions, file hashes/metadata, dependency lists, cache metadata/summaries, graph handle metadata, and benchmark summaries.
- Snapshots do not contain complete source files, raw prompts, credentials, authorization headers, provider private reasoning, full model outputs, process handles, adapter instances, or unbounded context packages.

Runtime integration:

- Runtime commands are exposed as `performance.health`, `performance.stats`, `performance.cache`, `performance.invalidate`, `performance.rebuild`, `performance.benchmark`, `performance.memory`, `performance.contextReuse`, and `performance.graph`.
- Commands return unconfigured responses when `RepositoryPerformanceEngine` is absent.

## Release Qualification Engine

`src/release-qualification-engine.js` provides the RC-005 release qualification layer. It is diagnostic, orchestration-oriented, and evidence-oriented. It does not create a second approval system, security engine, provider gateway, workspace mutation path, validation system, persistence system, or shell execution path.

The engine reuses `LeviApplicationRuntime` and the existing public boundaries for security assurance, reliability assurance, stress/scalability, agent orchestration, multi-agent coordination, durable workflows, controlled workspace tools, model providers, repository performance, and product experience. Repository fixtures, model output, workflow output, reviewer output, and qualification output remain data and cannot grant approval.

Responsibilities:

- Register deterministic project fixtures, user journeys, qualification suites, and scenarios.
- Run bounded automated qualification through controlled adapters and existing runtime/component APIs.
- Track manual verification records separately from automated evidence.
- Refuse automatic `PASSED` status for manual checks unless operator-recorded evidence is explicitly supplied.
- Normalize runs, scenario results, defects, reports, blockers, readiness, and certification evidence.
- Preserve conservative restore behavior by invalidating certification and keeping manual checks pending after restore.
- Redact credentials, authorization headers, secret-like keys, private prompts, private reasoning, complete protected source content, handlers, adapters, runtime instances, and circular objects from reports and events.

Built-in profiles:

- `SMOKE`
- `STANDARD`
- `STRICT`
- `RELEASE_CANDIDATE`

Runtime integration:

- Commands are exposed as `qualification.health`, `qualification.stats`, `qualification.fixtures`, `qualification.journeys`, `qualification.suites`, `qualification.scenarios`, `qualification.createRun`, `qualification.startRun`, `qualification.run`, `qualification.cancel`, `qualification.report`, `qualification.blockers`, `qualification.manual`, `qualification.defects`, `qualification.extensionHost`, `qualification.localOllama`, and `qualification.certify`.
- Commands return an unconfigured response when `ReleaseQualificationEngine` is absent.
- The runtime bridges qualification events through the normal frontend-safe event stream.

VS Code integration:

- The extension contributes `levi.qualification`, a TreeView for health, state, certification, fixtures, journeys, scenarios, active run, report, pending manual checks, defects, blockers, Extension Development Host readiness, and local Ollama readiness.
- Commands show qualification reports, blockers, manual checks, defects, fixtures, journeys, Extension Host status, local Ollama status, and run SMOKE/STANDARD/STRICT/RELEASE_CANDIDATE profiles.
- High-volume qualification scenario events use throttled view refreshes so long runs do not rebuild reports synchronously for every scenario event.

Certification:

- Levels are `NOT_EVALUATED`, `AUTOMATED_BASELINE`, `MANUAL_VERIFICATION_REQUIRED`, `RELEASE_CANDIDATE_QUALIFIED`, and `QUALIFICATION_BLOCKED`.
- RC qualification cannot be claimed while mandatory Extension Development Host, local Ollama, source-change, recovery, accessibility, or other manual checks remain pending.
- The engine does not claim production-ready or Marketplace-ready certification.

Manual verification:

- Manual Extension Development Host and live local Ollama verification remain pending unless an operator records evidence.
- `RELEASE_CANDIDATE_005_REAL_WORLD_VALIDATION.md` and `RC_005_MANUAL_VALIDATION_CHECKLIST.md` define the manual qualification package.
- Rebuild and lazy graph loading coordinate through runtime repository commands when available; they do not directly scan or reinterpret repository contents.
- Runtime bridges performance events through the normal event stream.

Health and safety:

- Health domains are cache, indexing, graph, context reuse, memory, runtime, workflow, provider, and persistence.
- Critical failures include corrupted graph/cache poisoning, invalid dependency graph, and memory exhaustion.
- Overall health is 0-100 and is capped by critical failures.
- Safe parallel analysis is represented by bounded parallelism and dependency-aware invalidation; source-changing and protected runtime behavior remains owned by existing approval and workspace-tool systems.

VS Code integration:

- VS Code contributes `levi.performance`, a TreeView for health, cache entries/hit rate, indexed files, dependency edges, graph handles, memory budget, context/token reuse, benchmarks, domain status, and critical failures.
- VS Code commands show performance, clear cache, run benchmark, rebuild repository graph, and show memory usage.

## Reliability Assurance Engine

`src/reliability-assurance-engine.js` provides RC-001 reliability, fault-tolerance, and recovery certification. It is a diagnostic coordinator over existing Layer 3 systems. It does not own runtime state, workflow execution, model requests, workspace mutation, approval decisions, validation truth, repair truth, repository intelligence, source-control state, persistence truth, event truth, or security truth.

Diagnostic-only boundary:

- Reliability diagnostics inspect components through `LeviApplicationRuntime` and public component APIs.
- Fault injection is disabled during ordinary runtime use and is active only for explicit diagnostic runs.
- Fault activation creates bounded diagnostic records; active injections are cleared after each scenario, cancellation, shutdown, and recovery.
- The engine never introduces source mutation, unrestricted shell execution, automatic approval, provider credential access, or protected-operation auto-resume.

Verification areas:

- State-machine verification checks impossible terminal/active combinations and false success states.
- Event-integrity verification checks deterministic event identity, terminal event uniqueness, bounded history, and listener failure isolation.
- Reference and ownership checks keep runtime, workflow, workspace, approval, validation, repair, provider, and repository systems authoritative for their own records.
- Persistence-integrity checks preserve compact metadata only and invalidate certification after restore or corruption fallback.
- Recovery-integrity checks preserve completed evidence, distinguish interrupted/failed/cancelled/timed-out/stale/corrupted outcomes, and require explicit user retry, approval, or revalidation for protected work.
- Idempotency checks verify duplicate execution remains absent for operations, model requests, tool calls, approvals, mutations, commands, workflow steps, and checkpoint restores.
- Resource cleanup checks listeners, timers, streams, queues, operations, active injections, and bounded memory/resource samples.
- Concurrency checks enforce bounded diagnostic runs and safe rejection when limits are reached.
- Corruption handling covers malformed, truncated, stale, oversized, invalid-schema, duplicate-ID, dangling-reference, corrupted cache, corrupted graph, invalid approval, invalid proposal, and invalid checkpoint signals through deterministic fake fixtures.

Reliability profiles:

- `SMOKE` validates the smallest release-candidate baseline.
- `STANDARD` adds model, agent, event, and resource diagnostics.
- `STRICT` adds protected mutation, validation, workflow, and multi-agent interruption diagnostics.
- `RELEASE_CANDIDATE` includes the full built-in scenario set and release-blocker certification gates.

Runtime and VS Code integration:

- Runtime commands are `reliability.health`, `reliability.stats`, `reliability.scenarios`, `reliability.run`, `reliability.cancel`, `reliability.report`, `reliability.consistency`, `reliability.recovery`, `reliability.resources`, `reliability.findings`, and `reliability.certify`.
- Commands return unconfigured responses when `ReliabilityAssuranceEngine` is absent.
- Runtime bridges reliability events through the normal event stream.
- VS Code contributes `levi.reliability`, a diagnostics TreeView for health, certification, active run, blockers, consistency, resources, recent runs, domains, and statistics.
- VS Code commands show reliability state, run smoke/standard/strict/release-candidate profiles, cancel a run, and open report/blocker/consistency/recovery/resource virtual documents.

Persistence boundary:

- Default metadata path is `.levi/reliability-assurance.json`.
- Persisted records are compact summaries: configuration, scenario definitions, diagnostic run summaries, scenario result summaries, finding summaries, certification summary, evidence references, resource summaries, consistency summaries, statistics, and schema version.
- Credentials, authorization headers, full source files, raw private prompts, private reasoning, full provider payloads, full command output, process handles, unbounded event streams, and active injected fault objects are not persisted.

Release blockers and certification:

- Critical reliability findings and explicit release-blocking findings block certification.
- Certification levels are `NOT_ASSESSED`, `BLOCKED`, `BASELINE`, `STANDARD`, `STRICT`, and `RELEASE_CANDIDATE_READY`.
- RC-001 certification does not certify live desktop, marketplace, cloud reliability, legal compliance, or destructive operating-system fault tolerance.

## Security Assurance Engine

`src/security-assurance-engine.js` provides RC-002 security hardening and threat-certification evidence. It is diagnostic and policy-oriented only. It does not replace `SecurityValidator`, `ApprovalGateway`, `ControlledWorkspaceToolEngine`, `ModelProviderGateway`, workspace trust checks, provider privacy rules, credential resolution, persistence ownership, serialization utilities, runtime state, agent orchestration, multi-agent coordination, durable workflows, or reliability assurance.

Diagnostic-only boundary:

- Threat scenarios are normalized inputs to audit checks, not executable instructions.
- Repository files, README text, comments, package metadata, issue text, documentation, generated files, tool results, model responses, workflow outputs, and multi-agent findings are treated as data.
- Model, agent, workflow, and reviewer output can never grant approval or validation.
- Source mutation remains delegated to `ControlledWorkspaceToolEngine`; security assurance never writes source, never runs shell commands, and never interprets arbitrary command strings as executable work.
- Credential-like keys and secret-shaped values are redacted before events, evidence, reports, snapshots, and VS Code presentation.
- The built-in threat model records protected assets, trust boundaries, actors, entry points, data flows, attack surfaces, mitigations, residual risks, and deterministic evidence.

Verification areas:

- Authority integrity verifies that hostile repository or generated content cannot override system, user, project, security, approval, or runtime authority.
- Approval integrity verifies that only explicit user/approval-gateway decisions can satisfy protected operations.
- Privacy and provider safety verify remote source-code, sensitive-content, and secret-transmission policies without transmitting payloads.
- Workspace isolation verifies workspace, project, session, conversation, workflow, and provider boundary separation.
- Path safety verifies traversal, URI scheme abuse, symlink escape, case-collision, and working-directory escape probes.
- Command safety verifies arbitrary command strings, shell metacharacters, and argument-injection probes remain blocked or approval-gated by existing workspace-tool policy.
- Webview safety verifies VS Code message and script-injection threats at the extension boundary.
- Persistence and serialization safety verify redacted snapshots, bounded evidence, malformed tool-call handling, serialization attacks, and prototype-pollution rejection.
- Source-control safety verifies unsafe restore, push, force-push, and Git-operation probes remain protected and approval-gated outside the security-assurance layer.
- Secret-handling safety verifies prompts, logs, events, reports, persistence, virtual documents, UI output, errors, and extension packages do not expose credentials, authorization headers, private prompts, private reasoning, or complete protected source content.
- Dependency and supply-chain safety are offline posture checks; they perform no install, network lookup, package execution, or new dependency recommendation.
- Resource-abuse safety verifies bounded payloads, tool arguments, event rates, queues, agent depth, workflow steps, and provider-cost abuse surfaces.

Security profiles:

- `SMOKE` checks core authority, approval, privacy, path, command, and secret-leak behavior.
- `STANDARD` adds prompt injection, workspace trust, tool/agent/workflow authority, cross-workspace, provider, patch, serialization, webview, and persistence coverage.
- `STRICT` expands multi-agent, URI/symlink/case/cwd, argument/shell, environment/log/event, cross-session/conversation, sensitive content, malformed tool-call, and prototype-pollution diagnostics.
- `RELEASE_CANDIDATE` includes every release-blocking built-in scenario, including repository/source/comment/documentation/terminal/tool/model/cross-agent injection, approval replay/scope/workspace/expiration/recovery bypass, protected paths, arbitrary commands, source-control hazards, provider response hazards, webview origin/command/CSP hazards, secret leakage surfaces, persistence tampering, supply-chain, packaging, and resource-abuse checks.

Runtime and VS Code integration:

- Runtime commands include legacy `securityAssurance.*` commands and RC-facing `security.*` commands for health, stats, threat model, assets, trust boundaries, scenarios, audit creation/start/cancel/list, reports, findings, blockers, focused checks, and certification.
- Commands return unconfigured responses when `SecurityAssuranceEngine` is absent.
- Runtime bridges security-assurance events through the normal event stream.
- VS Code contributes `levi.securityAssurance`, a diagnostics TreeView for health, certification, active audit, blockers, recent audits, checks, domains, and statistics.
- VS Code commands show security assurance state, threat model, approval security, workspace isolation, prompt-injection report, secret-handling report, dependency security, supply-chain security, run smoke/standard/strict/release-candidate audits, cancel an audit, and open report/blocker/finding/check virtual documents.

Persistence boundary:

- Persisted records are compact redacted summaries: configuration, scenario metadata, audit run summaries, scenario result summaries, findings, reports, certification summary, evidence references, statistics, and schema version.
- Attack payloads are persisted only as hashes and byte counts.
- Credentials, authorization headers, secret environment variables, raw private prompts, private reasoning, complete protected source content, full provider payloads, unbounded events, and executable handles are not persisted.

Release blockers and certification:

- Unresolved critical findings, approval bypass, secret leakage, cross-workspace leakage, remote secret transmission, arbitrary command execution, webview code-injection paths, and protected-path traversal block release-candidate certification.
- Certification levels are `NOT_EVALUATED`, `AUDIT_AVAILABLE`, `SECURITY_BASELINE`, `RELEASE_CANDIDATE_SECURITY`, and `SECURITY_BLOCKED`.
- RC-002 certification does not claim production-ready, marketplace-ready, legal/compliance, live cloud, or external penetration-test certification.

## Stress Scalability Engine

`src/stress-scalability-engine.js` provides RC-003 stress, scalability, sustained-load, and performance-degradation certification evidence. It is a diagnostic coordinator over existing runtime, reliability, security, repository-performance, agent, multi-agent, workflow, provider, workspace-tool, persistence, event, cache, and presentation boundaries. It does not replace scheduling, execution, repository indexing, model dispatch, workflow execution, approval, security, persistence, or source mutation.

Diagnostic-only boundary:

- Stress diagnostics use deterministic synthetic load and virtual repository descriptors instead of generating massive physical repositories or invoking provider/network traffic.
- Source mutation remains exclusive to `ControlledWorkspaceToolEngine`; RC-003 never adds command execution, shell access, package installation, provider calls, or approval decisions.
- Runtime, reliability, security, performance, agent, multi-agent, workflow, provider, and VS Code integration are observed through public commands and component APIs.
- Unlimited or non-finite numeric configuration is release-blocking for readiness; normalized configuration falls back to conservative finite bounds and records the invalid source setting.
- Evidence is compact and redacted: metrics, thresholds, scenario IDs, component snapshots, finding summaries, and bounded event references only.

Stress coverage:

- Built-in profiles are `SMOKE`, `STANDARD`, `STRICT`, and `RELEASE_CANDIDATE`.
- Built-in synthetic repositories cover `TINY`, `SMALL`, `MEDIUM`, `LARGE`, `VERY_LARGE`, and `MONOREPO` virtual scales.
- Built-in scenarios cover cold/warm repository indexing, virtual very-large repositories, monorepo boundaries, graph and context bursts, provider latency/throttling/stream interruption, long agent conversations, cancellation, multi-agent pressure and conflicts, deep/wide workflow graphs, workflow cancellation storms, workspace reads, large proposals and patch previews, validation concurrency, persistence/recovery cycles, event floods, listener pressure, queue fill/drain, cache pressure, memory pressure, presentation pressure, and serialization pressure.
- Metrics normalize latency, throughput, queues, memory, cache, events, persistence, recovery, cancellation, cleanup, and presentation pressure.

Runtime and VS Code integration:

- Runtime commands include `stress.health`, `stress.stats`, `stress.profiles`, `stress.repositories`, `stress.scenarios`, `stress.createRun`, `stress.startRun`, `stress.run`, `stress.cancel`, `stress.listRuns`, `stress.report`, `stress.findings`, `stress.blockers`, focused domain checks, `stress.cleanup`, and `stress.certify`.
- Commands return unconfigured responses when `StressScalabilityEngine` is absent.
- Runtime bridges stress events through the normal event stream.
- VS Code contributes `levi.stressScalability`, a diagnostics TreeView for health, certification, active run, score, profiles, repositories, scenarios, blockers, recent runs, metrics, domains, and statistics.
- VS Code commands show stress state, run smoke/standard/strict/release-candidate profiles, cancel a run, and open report/blocker/finding/domain metric virtual documents.

Persistence, blockers, and certification:

- Default metadata path is `.levi/stress-scalability.json` when persistence is enabled.
- Persisted state is compact: configuration, profiles, synthetic repository descriptors, scenario definitions, run summaries, result summaries, findings, certification summary, events, and statistics.
- Recovery marks in-flight runs failed/interrupted and never resumes protected source-changing operations.
- Critical findings, release-blocking findings, uncontrolled memory growth, unbounded queue growth, starvation, uncapped concurrency, event loss, recovery failure, cancellation failure, provider throttling collapse, protected-path mutation pressure, and component integration regressions block release-candidate scalability.
- Certification levels are `NOT_ASSESSED`, `STRESS_BASELINE`, `SCALABILITY_CONFIDENCE`, `RELEASE_CANDIDATE_SCALABILITY`, and `SCALABILITY_BLOCKED`.
- RC-003 certification does not claim production capacity, marketplace readiness, live cloud scale, provider SLA validation, hardware benchmarking, or external load-test certification.

### 8. Validation Runner

Responsibilities:

- Run approved commands.
- Capture exit codes and output.
- Block false completion.

Maps to LC-MVP-008.

### 9. Reporting Service

Responsibilities:

- Produce exact task reports.
- Update verified project state.
- Calculate requirement completion.

Maps to LC-MVP-009.

### 10. CLI

Responsibilities:

- Initialize, inspect, request, approve, execute, validate, and report.
- Contain no business logic.

Maps to LC-MVP-010.

## Required Internal Interfaces

- ProjectStore
- RepositoryScanner
- SourceParser
- MemoryStore
- ScopeChecker
- TaskPlanner
- ModelGateway
- CodingExecutor
- ValidationRunner
- TaskReporter

## Task State Machine

Autonomous execution sessions use `src/execution-session.js` as the deterministic transition authority.

1. IDLE
2. PLANNING
3. WAITING_FOR_APPROVAL
4. EXECUTING
5. VALIDATING
6. REPAIRING
7. COMPLETED
8. FAILED
9. RESTORED
10. CANCELLED

Transitions must be explicit, rejected when invalid, and emitted as typed progress events when state changes.

`src/continue-engine.js` decides whether a validated execution session may continue automatically. It continues only after passed validation when approval, completion, security, cost, ambiguity, cancellation, and failure guards are all clear. Stop reasons are explicit constants: OBJECTIVE_COMPLETE, APPROVAL_REQUIRED, SECURITY_STOP, COST_LIMIT, AMBIGUOUS_TASK, USER_CANCELLED, and EXECUTION_FAILED.

`src/execution-engine.js` runs the bounded autonomous execution loop. It executes the next task, validates results, asks the continuation engine whether automatic continuation is safe, and stops immediately when continuation is denied or a configured limit is exceeded. The loop is independent of UI and editor APIs, emits lifecycle events for execution and iteration boundaries, and uses explicit stop reasons for MAX_ITERATIONS, MAX_RUNTIME, and MAX_REPAIRS.

`src/approval-gateway.js` evaluates pending actions before execution using NEVER, SAFE_ONLY, DESTRUCTIVE_ONLY, ALWAYS, or CUSTOM policies. It returns APPROVED, REQUIRES_APPROVAL, or DENIED; approval pauses preserve session state with an ApprovalRequest so `ExecutionEngine.resume(session)` can continue only after approval is recorded.

`src/repair-engine.js` coordinates self-repair through injected callbacks for repair eligibility, repair-plan creation, and repair execution. When validation fails, `ExecutionEngine` enters the AE-001 `REPAIRING` state, records bounded repair attempts in session metadata, emits repair lifecycle events, retries validation after REPAIRED or RETRY_VALIDATION results, and stops gracefully at MAX_REPAIRS. CANNOT_REPAIR and RESTORE_REQUIRED results stop execution without inventing editor or provider dependencies; RESTORE_REQUIRED emits a restore_required lifecycle event so a restore workflow can take over.

`src/security-validator.js` evaluates pending actions, execution results, validation results, pre-continuation state, and pre-completion state for security risks. It records deduplicated SecurityFinding entries in `session.metadata.securityFindings`, emits security validation lifecycle events, lets WARNING findings continue, escalates REQUIRES_REVIEW findings through the approval gateway, and stops BLOCKED findings immediately with SECURITY_STOP. Security validation wraps repair and continuation so repaired work and automatic continuation cannot bypass the same safety layer.

`src/objective-completion-engine.js` evaluates whether the user's objective is actually complete before `ExecutionEngine` can transition a session to COMPLETED. Completion gates include objective presence, planned and required steps, remaining executable work, validation state, repair history, approval requests, high-severity security findings, cancellation, restore requirements, blockers, and injected completion rules. COMPLETE permits the final AE-001 transition to COMPLETED, INCOMPLETE continues only when executable work remains or pauses with OBJECTIVE_INCOMPLETE, REQUIRES_REVIEW escalates through the approval gateway, and BLOCKED stops with OBJECTIVE_BLOCKED. Each evaluation is recorded in `session.metadata.completionHistory`.

## Repository Knowledge Graph

`src/repository-knowledge-graph.js` provides the Layer 2 structural knowledge graph. It is platform-independent and depends only on Levi-owned scanner, structural index, project summary, memory, and decision interfaces. It has no VS Code, UI, model-provider, or language-specific hard dependency.

Graph nodes use normalized fields: `id`, `type`, `name`, `path`, `language`, `range`, `metadata`, `createdAt`, and `updatedAt`. Supported node types include repository, directory, file, module, class, function, method, interface, type, variable, test, configuration, dependency, and decision.

Graph edges use normalized fields: `id`, `type`, `sourceId`, `targetId`, `evidence`, `confidence`, `metadata`, `createdAt`, and `updatedAt`. Supported relationship types include contains, imports, exports, calls, references, extends, implements, depends_on, tests, configures, defines, modifies, related_to, and governed_by_decision.

The graph builds from `scanRepository`, reuses the existing `buildStructuralIndex` symbol and relationship output, imports dependency data through project summaries, and can attach approved durable decisions or approved project-knowledge facts through injected records or memory-store adapters. Structural relationship edges keep their precise type and also provide normalized reference edges for higher-level traversal and impact queries.

Language analysis is adapter-driven. A language analyzer exposes `analyzeFile({ repositoryRoot, filePath, content, language, graph, options })` and returns graph nodes and edges. The built-in lightweight path reuses Levi's structural index for JavaScript, TypeScript, and Python files, while future analyzers can parse Java, Go, Rust, or other languages without changing the graph core.

Incremental updates accept created, modified, deleted, and renamed files. Changed file nodes and their file-owned symbols are replaced without requiring a full repository rebuild, while deterministic IDs preserve stable identities for unchanged paths and symbol names. Update events record modifications and preserve query compatibility for existing consumers.

Persistence writes a schema-versioned snapshot to `.levi/repository-knowledge-graph.json` by default. Loading validates the snapshot, emits `knowledge_graph_restored` on success, emits `knowledge_graph_rebuild_required` on corrupt or incompatible data, and can rebuild from the repository path when `rebuildOnCorruption` is enabled.

The public graph API supports `build`, `update`, node and edge mutation, neighbor lookups, typed node and edge searches, dependency and dependent traversal, reference/call queries, impact analysis, `snapshot`, `restore`, `save`, and `load`. Lifecycle events cover build, update, node/edge changes, persistence, restore, and rebuild-required states.

## Cross-Session Learning

`src/cross-session-learning-engine.js` provides Layer 2 cross-session learning. It is platform-independent and consumes session snapshots, execution metadata, repository graph context, memory records, and durable decisions through plain objects or injected adapters rather than depending on UI, VS Code, model providers, or a specific language runtime.

Learning records use normalized fields: `id`, `type`, `projectId`, `title`, `summary`, `evidence`, `confidence`, `importance`, `source`, `scope`, `status`, `tags`, `metadata`, `createdAt`, `updatedAt`, `lastUsedAt`, and `useCount`. Supported record types include project conventions, user preferences, architecture patterns, durable decisions, successful and failed strategies, repair outcomes, approval patterns, security lessons, validation lessons, completion lessons, and repository facts. Status values are ACTIVE, SUPERSEDED, CONFLICTED, REJECTED, and ARCHIVED.

The extraction flow starts from `learnFromSession(session, context)`. The engine reads completed or stopped execution snapshots, repair history, approval history, security findings, validation state, completion history, user corrections, durable decision records, and repository changes. Raw history is not automatically promoted; candidates must meet promotion criteria such as explicit user decision, repeated or confirming evidence, high-confidence success, high-severity failure, or durable architectural consequence. Injected extractors can add specialized candidates without modifying the core engine.

Confidence and importance evolve over time. Repeated confirming evidence deduplicates into the same semantic lesson and increases confidence. Contradictory evidence reduces confidence and creates a conflict instead of silently overwriting an active lesson. Durable project decisions are authoritative: learning records may reference them, but contradictions are flagged as conflicts and do not replace the approved decision.

Conflicts store conflicting record IDs, reason, evidence, status, creation and resolution timestamps, and resolution metadata. `resolveConflict` can mark a winning record active while superseding alternatives. Records can also be marked used, superseded, archived, deleted, snapshotted, and restored.

Retrieval ranking considers project and scope match, recency, confidence, importance, prior usefulness, tag relevance, repository graph proximity, and durable-decision authority. Repository graph integration links learning records to files, modules, symbols, dependencies, and decision nodes when evidence or metadata paths match graph nodes.

Persistence writes schema-versioned state to `.levi/cross-session-learning.json` by default. Loading supports schema validation, migration hooks, corrupt-file reporting, and an explicit empty fallback for recovery.

## Offline Knowledge Index

`src/offline-knowledge-index.js` provides LI-003 local retrieval. It is platform-independent and uses deterministic lexical scoring only; it has no dependency on VS Code, UI code, model providers, network access, operating-system-specific APIs, embeddings, or a single language parser.

Index documents use normalized fields: `id`, `type`, `projectId`, `path`, `language`, `title`, `content`, `tokens`, `symbols`, `tags`, `references`, `metadata`, `contentHash`, `indexedAt`, and `updatedAt`. Document types cover repositories, directories, files, symbols, imports, exports, references, functions, methods, classes, interfaces, configuration files, tests, dependencies, project knowledge facts, durable decisions, cross-session learning records, and repository graph nodes.

The build flow reuses `scanRepository`, `buildStructuralIndex`, project summaries, LI-001 graph snapshots, LI-002 learning snapshots, durable decision records, and project-knowledge facts. The full build inherits repository scanner ignore behavior; incremental updates apply matching guards for `.git`, dependency directories, build output, generated files, binary content, oversized files, custom ignore patterns, and secret-like names.

Lexical ranking is field-aware. Scores consider exact symbol matches, exact path matches, title hits, phrase hits, token overlap, path/symbol/tag/reference matches, document type, project and language filters, recency, repository graph proximity, learning-record importance, and durable-decision authority. Optional semantic adapters may rerank results, but the core works fully offline without embeddings.

Incremental indexing handles created, modified, deleted, and renamed files. File content hashes prevent unchanged files from being reindexed, while stable IDs and normalized paths prevent duplicate documents. Query APIs include general search, symbol search, path search, reference search, direct lookup, filtering, statistics, compaction, snapshot/restore, save, and load.

Persistence writes atomically where practical to `.levi/offline-knowledge-index.json`. Loading supports schema validation, migration hooks, corrupt-file detection, empty fallback, and rebuild fallback from the repository path. Index statistics report document counts, file counts, symbol counts, indexed bytes, languages, document types, last full build, last incremental update, skipped unchanged files, and ignored files.

## Planning Intelligence

`src/planning-intelligence-engine.js` provides LI-004 planning intelligence. It converts objectives into normalized dependency-aware plans without depending on UI code, VS Code APIs, model-provider SDKs, operating-system-specific APIs, or a single language/framework parser.

Plans contain `id`, `projectId`, `objective`, `summary`, `status`, `tasks`, `assumptions`, `constraints`, `acceptanceCriteria`, `risks`, `metadata`, `version`, `createdAt`, and `updatedAt`. Plan statuses are DRAFT, READY, ACTIVE, PAUSED, REPLANNING, COMPLETED, BLOCKED, CANCELLED, and FAILED. Tasks contain normalized dependency, context, validation, security, effort, complexity, confidence, strategy, and metadata fields; task statuses are PENDING, READY, RUNNING, WAITING, BLOCKED, COMPLETED, FAILED, SKIPPED, and CANCELLED.

Decomposition is adapter-driven. A decomposition adapter exposes `decompose({ objective, context, options })` and returns compact plan evidence plus tasks. The default deterministic path creates inspection, implementation, and validation tasks from structured objectives, expected files, validation requirements, and acceptance criteria; no LLM is required.

The planner validates dependency references, missing dependencies, cycles, executable paths, acceptance criteria, durable-decision conflicts, security-sensitive work, and planning bounds. It calculates dependents, readiness, topological order, critical path, and parallel execution waves. Prioritization considers readiness, explicit priority, blocker-removal value, critical-path position, risk, confidence, complexity, repository impact, security sensitivity, and successful or failed strategy lessons.

Integration is snapshot/adapter based. Repository graph snapshots enrich tasks with affected files, symbols, modules, and dependency references. Cross-session learning records adjust confidence and risk by reusing successful strategies and avoiding failed ones. Offline index search supplies compact planning evidence for relevant files, tests, docs, project knowledge, decisions, and prior lessons. Durable project decisions are authoritative planning constraints; conflicts are findings, not silently overwritten tasks.

Dynamic replanning supports task failure, blockers, validation failure, security blocks, rejected approval, failed repair, repository change, invalidated assumptions, acceptance-criteria changes, new dependencies, and user corrections. Replanning preserves completed tasks, keeps valid task IDs where possible, adds bounded replacement tasks, recalculates readiness/dependencies, increments plan version, and records trigger rationale. Plan completion exposes completion evidence for `ObjectiveCompletionEngine`, but does not itself mark the user objective complete.

Planning state persists to `.levi/planning-intelligence.json` with schema versioning, migrations, snapshot/restore, corrupt-file reporting, and empty fallback.

## Context Intelligence

`src/context-intelligence-engine.js` provides LI-005 context intelligence. It builds the smallest sufficient context package for planning, execution, repair, validation, security review, approval review, objective completion, code understanding, search, and user-query purposes without depending on UI, VS Code, model-provider SDKs, network access, provider tokenizers, or embeddings.

Context requests normalize project, purpose, objective, plan, task, user instructions, acceptance criteria, paths, symbols, and metadata. Context items normalize source, source ID, title, content, summary, path, symbol, language, tags, authority, relevance, confidence, freshness, risk, estimated tokens, metadata, and timestamps. Packages store selected items, omitted items, findings, token budget, estimated tokens, status, compact metadata, and selection explanations.

Collection is adapter-driven. Collectors expose `collect({ request, options, engine })`, while built-in collectors consume objectives, plans, tasks, repository graph snapshots, offline index search, project knowledge facts, durable decisions, active cross-session learning, execution snapshots, repair history, approval history, security findings, validation results, and completion evidence.

Ranking is deterministic and purpose-aware. It considers direct task and objective relevance, source authority, durable-decision authority, path and symbol matches, graph proximity, offline-index lexical scores, learning confidence and importance, recency, prior usefulness, security sensitivity, stale risk, duplication, and estimated token cost. Source authority rules preserve current user instructions above historical preferences, durable decisions above inferred learning, current repository/index evidence above stale history, validated results above assumptions, and explicit acceptance criteria above inferred criteria.

Selection preserves mandatory user instructions, relevant durable decisions, acceptance criteria, critical security findings, and direct execution targets while suppressing duplicates and omitting low-authority, irrelevant, stale, over-budget, inactive, or source-limit-exceeded items with explicit omission records. Token budgets support package, response-reserve, per-source, per-item, item-count, file-count, symbol-count, and history-count limits using deterministic character-based token estimates unless an adapter is injected.

Compression is deterministic and safe. It trims repeated whitespace, reduces metadata, truncates lower-priority content to item limits, and preserves protected content without lossy compression: durable decisions, current user instructions, acceptance criteria, critical security findings, repair failure evidence, and direct execution targets.

The engine detects conflicts such as user instructions versus durable decisions, task requests versus durable decisions, stale authoritative context, and contradictory acceptance criteria. Refresh recollects the original request, reranks and reselects context, preserves mandatory authoritative items, increments package revision, and records refresh reasons. Persistence writes compact package metadata, item references/content excerpts, findings, omission records, and selection explanations to `.levi/context-intelligence.json` with schema versioning, migrations, snapshot/restore, corrupt-file reporting, and empty fallback.

## Code Understanding

`src/code-understanding-engine.js` provides LI-006 code understanding. It is platform-independent and depends only on Levi-owned scanner, structural index, project summary, and optional adapters for repository graph, offline index, context, planning, language analysis, and deterministic summary enrichment. It has no VS Code, UI, model-provider, network, OS-specific, or single-language parser dependency.

Code entities normalize repository, directory, file, module, package, namespace, class, interface, type, enum, function, method, constructor, property, variable, constant, parameter, import, export, dependency, test, configuration, route, endpoint, database model, database migration, documentation, and unknown records. Each entity stores stable identity, project, type, name, qualified name, path, language, range, signature, visibility, modifiers, parameters, return type, documentation, summary, tags, metadata, content hash, and timestamps.

Relationships normalize contains, declares, imports, exports, references, calls, called_by, extends, implements, overrides, depends_on, used_by, tests, tested_by, configures, reads, writes, routes_to, creates, updates, deletes, documents, and related_to edges. Each relationship stores stable identity, project, source, target, path, range, confidence, evidence, metadata, and timestamps. Duplicate entities, relationships, and findings are suppressed by deterministic fingerprints.

Repository analysis reuses `scanRepository`, `buildStructuralIndex`, project summaries, file classification, dependency extraction, route detection, test detection, configuration detection, and existing structural JavaScript, TypeScript, and Python support. The engine consumes or enriches `RepositoryKnowledgeGraph` through adapters instead of creating a second persisted graph, and it can publish compact documents into `OfflineKnowledgeIndex` without copying full repository contents.

Language analysis is injected through a stable analyzer contract: `analyze({ content, language, path, projectId, engine, options })` returns entities, relationships, imports, exports, calls, references, definitions, diagnostics, and metadata. When no analyzer is available, deterministic fallback extraction records file role, probable language, imports, exports, function-like declarations, class-like declarations, references, configuration roles, tests, and documentation with reduced confidence and incomplete-analysis findings.

Stable symbol identity uses project, normalized path, entity type, qualified name, and signature, preserving IDs across ordinary line movement. Incremental updates support created, modified, deleted, and renamed files, skip unchanged content hashes, remove stale file-owned entities and relationships, and emit deterministic lifecycle events for changed entities, relationships, skipped files, findings, persistence, restore, architecture views, and impact analysis.

IDE-facing APIs expose repository, file, and content analysis; entity lookup and filtering; definitions, references, callers, callees, dependency traces, lightweight data-flow traces, architecture views, file summaries, symbol summaries, code explanation, change-impact analysis, dead-code candidates, unresolved symbols, boundary violations, stats, snapshots, restore, save, and load. Context integration exposes compact records for execution targets, affected symbols, callers and callees, dependencies, relevant tests, boundaries, summaries, and impact evidence. Planning integration exposes affected files, symbols, dependency order, test scope, architecture constraints, repository impact, prerequisites, and likely validation scope.

Architecture views report modules, packages, entry points, dependency layers, public interfaces, test boundaries, configuration boundaries, persistence boundaries, external integrations, detected cycles, and cross-boundary violations only when evidence exists. Change-impact analysis returns directly affected entities, transitive dependents, callers, callees, related tests, configuration impact, likely validation scope, boundaries crossed, confidence, and evidence under configurable traversal and result bounds.

Data-flow tracing is intentionally lightweight. It follows local relationship evidence for reads, writes, calls, and route-to-handler paths, and marks incomplete or heuristic traces with reduced confidence rather than claiming full static-analysis precision.

Findings are normalized for unresolved symbols, ambiguous definitions, circular dependencies, dead-code candidates, missing test relationships, architecture boundary violations, stale analysis, unsupported language, incomplete analysis, and excessive impact scope. Dead-code detection is conservative and labels candidates only when known inbound references, exports, entry-point tags, framework conventions, configuration references, tests, and runtime-registration evidence do not protect the symbol. Unresolved-symbol detection avoids broad claims and records only locally evidenced unresolved references.

Analysis bounds cover maximum files, file bytes, entities, relationships, traversal depth, impact results, analysis time, ignored paths, and ignored languages. Bound hits produce partial results and findings rather than unbounded work. Persistence writes schema-versioned state to `.levi/code-understanding.json`, supports migration hooks, corruption detection, empty fallback, snapshot, and restore without duplicating repository file contents unnecessarily.

## Project Intelligence

`src/project-intelligence-engine.js` provides LI-007 project intelligence. It is a synthesis layer: it consumes repository graph, offline index, code understanding, planning, context, learning, project knowledge, durable decisions, execution history, repair history, approval history, security findings, validation results, objective-completion evidence, manifests, documentation, test configuration, CI/deployment configuration, and injected collector records through snapshots and adapters. It does not replace graph, search, planning, context, learning, or code-analysis responsibilities.

Project profiles normalize project identity, description, classification, lifecycle stage, intended and active objectives, users, domains, languages, frameworks, packages, entry points, architecture style, modules, integrations, persistence systems, deployment targets, constraints, conventions, decisions, metadata, and timestamps. Project classifications include library, CLI, IDE extension, desktop, web, mobile, API/backend service, monorepo, multi-service, automation, AI agent/platform, data pipeline, infrastructure, documentation project, and unknown. Lifecycle stages include idea, discovery, planning, prototype, MVP build, hardening, release candidate, production, maintenance, deprecated, and unknown.

Assessments normalize summary, current state, completed and incomplete capabilities, blockers, risks, technical debt, findings, recommendations, next actions, evidence-derived scores, release readiness, confidence, completeness, status, metadata, and timestamps. Assessment statuses are READY, PARTIAL, BLOCKED, CONFLICTED, INSUFFICIENT_EVIDENCE, STALE, and FAILED.

Evidence collection is adapter-driven. A project intelligence collector exposes `collect({ projectId, repositoryPath, options, engine })` and returns source, project ID, records, findings, version, timestamp, confidence, and metadata. Missing collectors reduce confidence and completeness and can create partial or insufficient-evidence findings; missing evidence does not crash analysis.

Authority rules are explicit. Current user instruction outranks durable accepted decisions, explicit project specifications, verified repository state, validated execution evidence, accepted plans, project documentation, cross-session learning, inferred conventions, and heuristic classification. Repository evidence controls implemented state, while explicit intent can describe planned purpose; the assessment keeps intended, active, completed, blocked, abandoned, inferred, and implemented states visible instead of merging them.

Architecture synthesis consumes CodeUnderstandingEngine architecture views and RepositoryKnowledgeGraph snapshots to report modules, packages, entry points, service/dependency layers, public interfaces, test/configuration/persistence boundaries, external integrations, cycles, boundary violations, style, and confidence only where evidence exists. Feature-state synthesis distinguishes PLANNED, READY, IN_PROGRESS, IMPLEMENTED, VALIDATED, BLOCKED, FAILED, DEFERRED, REMOVED, and UNKNOWN; code existence can mark a feature implemented, but validation evidence is required for validated.

Blockers cover missing capability, failed validation, critical security, unresolved dependency, architecture conflict, blocked plans, execution failure, approval required, missing evidence, stale state, resource bounds, and unknown. Risks cover architecture, security, quality, testing, dependency, performance, data, release, maintainability, execution, documentation, operations, cost, compliance, and unknown. Technical debt covers duplication, complexity, oversized modules, weak boundaries, cycles, missing tests/docs, stale dependencies, dead-code candidates, unresolved symbols, inconsistent conventions, temporary workarounds, known defects, deferred refactors, and unknown with qualitative effort only: SMALL, MEDIUM, LARGE, or UNKNOWN.

Scores are deterministic and evidence-derived. Each domain score starts from a documented baseline, applies additions and deductions with supporting evidence, exposes confidence and explanations, and remains within 0-100. Domains include architecture health, code health, testing health, security posture, documentation health, maintainability, dependency health, execution reliability, planning health, context quality, technical-debt health, release readiness, and overall health. Overall health uses configurable weights and critical caps so positive evidence cannot erase open critical security issues, failed required validation, insufficient evidence, or conflicted conclusions.

Release readiness levels are NOT_READY, EARLY, MVP_CANDIDATE, RELEASE_CANDIDATE, READY_WITH_RISK, READY, and UNKNOWN. Readiness considers objectives, acceptance criteria, feature completion, validation, tests, security, blockers, risks, documentation, deployment evidence, recovery evidence where available, and objective-completion evidence. READY is blocked by open critical security findings, unmet required criteria, failing required validations, critical blockers, materially stale evidence, or confidence below the configured minimum.

Next-action recommendations are generated from blockers, security findings, failed validation, dependency/order evidence, objective priority, plan readiness, impact, confidence, effort category, and release criticality. Action types include fixing blockers, resolving security findings, repairing failures, completing tasks, adding validation/tests, updating documentation, resolving conflicts, reducing technical debt, refreshing analysis, requesting approval, preparing release, and no action. Each action records why it was prioritized and the evidence behind it.

Conflict handling preserves documentation-vs-repository, objective-vs-execution, durable-decision-vs-plan, learning-vs-current-instruction, feature-state, validation-vs-completion, release-vs-security, architecture-description-vs-graph, stale-source, and duplicated-identity conflicts as findings. Stale-evidence checks use timestamps and available versions/content metadata; stale sources reduce confidence instead of silently overriding current repository state.

The engine exposes compact project context records and planning evidence through optional adapters without mutating plans unless an explicit adapter is provided. Public APIs support profile and assessment creation/refresh, domain assessments, summaries, blockers, risks, next actions, release readiness, assessment comparison, score/conclusion explanations, validation, statistics, snapshot/restore, save, and load.

Bounds cover collected records, findings, features, objectives, risks, blockers, technical-debt items, recommendations, evidence per conclusion, analysis time, and historical assessments. Bound hits produce partial results and lifecycle events. Persistence writes schema-versioned state to `.levi/project-intelligence.json`, supports migrations, corruption detection, empty fallback, snapshot, and restore, and stores evidence references rather than duplicate repository contents.

Known limitation: Project Intelligence is deterministic and evidence-bound. It does not perform legal/compliance certification, production certification, full static analysis, or model-assisted inference unless future adapters provide explicit evidence.

## Learning And Adaptation

`src/learning-adaptation-engine.js` provides LI-008 learning and adaptation intelligence. It is a normalization, eligibility, policy, feedback-analysis, application, and rollback layer around `CrossSessionLearningEngine`; it does not replace cross-session learning persistence, repository indexing, context ranking, planning, code understanding, project intelligence, or execution-history storage.

Learning signals normalize project, session, domain, source type, action, outcome, subject, value, polarity, strength, confidence, evidence, authority, scope, timestamp, content hash, metadata, and creation time. Source types include current instructions, corrections, acceptances, rejections, durable decisions, plans, tasks, execution, repair, approval, validation, security, context, tools, code analysis, project assessment, repository evidence, documentation, imported learning, heuristics, and unknown. Scopes range from session/task/file/symbol through project/repository/language/framework/user/global; global learning requires stronger evidence.

Feedback records capture target, action, outcome, full or partial acceptance, rejection, correction, reason, evidence, confidence, timestamp, and metadata. Corrections have high authority but preserve exact scope and remain reversible. Acceptance, partial acceptance, rejection, rollback after acceptance, validation failure after acceptance, and security/scope/correctness rejection reasons are represented as traceable signals rather than collapsed into a single preference.

Learning rules normalize domain, condition, behavior, scope, status, authority, source signals, supporting and conflicting evidence, observations, confidence, stability, freshness, applicability, version, supersession, expiration, metadata, and timestamps. Stable rule identity uses project, domain, scope, normalized condition, and normalized behavior, not timestamps. Stability values are VOLATILE, EMERGING, STABLE, ESTABLISHED, DISPUTED, and UNKNOWN.

Eligibility is threshold-based and deterministic. It considers authority, supporting observations, independent sessions, successful outcomes, recency, consistency, validation strength, scope, reversibility, conflict ratio, user acceptance/correction, and project applicability. One successful tool call, one accepted patch, one completed plan, one heuristic, or lack of rejection is insufficient by itself. Security and approval learning require stronger thresholds, and optional explicit approval can be required.

Positive learning can increase bounded preference for repeatedly successful context sources, tools, validation sequences, decomposition patterns, repair strategies, conventions, or workflows. Negative learning can reduce weight or create bounded avoidance for rejected patch patterns, recurring tool failures, irrelevant context sources, regressive repair strategies, or failing decompositions. Negative learning never permanently bans a tool, source, or strategy from an isolated failure.

Authority ordering is explicit: current user instruction, current project instruction, durable accepted decision, security policy, validated repository state, validated execution evidence, accepted approval decision, accepted plan, active project learning, active user learning, historical cross-session learning, inferred convention, and heuristic. Learning never silently overrides a higher-authority source; conflicts remain visible.

Conflict detection covers rule-vs-current-instruction, project instruction, durable decision, security policy, repository state, validated execution, rule-vs-rule, user preference-vs-project convention, old learning-vs-recent feedback, global-vs-project rule, accepted pattern-vs-failed validation, and documentation rule-vs-code evidence. Freshness and deterministic decay mark rules stale or reduce influence when evidence ages out, repository/code/project evidence changes, durable decisions change, current instructions conflict, or recent outcomes disagree. Stale learning is not physically deleted by default.

Adaptations are proposed only from eligible active rules. They normalize rule, type, target subsystem, operation, value, weight, bounds, rationale, evidence, confidence, status, prior/resulting state, reversibility, timestamps, and metadata. Supported types include context weights/exclusions/priorities, planning preferences, task decomposition, tool preferences/avoidance, validation/test/security requirements, repair strategies, approval policy hints, coding/architecture/documentation conventions, recommendation weights, workflow patterns, cost/performance preferences, and no adaptation.

Adaptation is bounded and adapter-based. Target adapters may apply changes to context, planning, project intelligence, execution policy, validation policy, repair policy, recommendation ranking, or tool-selection policy. Without an adapter, the result is proposed or partially applied; no hidden mutation occurs. Prohibited adaptations cannot disable security validation, bypass approval, suppress critical findings, reduce mandatory tests, permit unauthorized execution, exceed configured bounds, alter immutable architecture constants, or modify source code directly.

Every applied adaptation captures prior state, resulting state, adapter response, application history, and rollback path. Rollback requires an adapter and records failures explicitly. Adaptations can expire or require reevaluation when rules expire, evidence becomes stale, project/repository/adapter versions change, higher-authority conflicts appear, or reevaluation intervals pass.

Integration is reference-based. Context integration can tune source weights, exclusions, freshness preference, authority boosts, convention priority, and historical context patterns while preserving budgets and authority rules. Planning integration can prefer decomposition granularity, validation placement, test sequencing, risk-first ordering, successful patterns, module conventions, and checkpoint frequency without removing required validation or security steps. Project Intelligence consumes active, disputed, stale, and adaptation-history evidence for project-level synthesis. Code Understanding scopes and invalidates learning by modules, files, symbols, languages, frameworks, structural changes, and removed or renamed symbols. CrossSessionLearningEngine records can be imported by reference and reinforced, superseded, rejected, stale, or exported without circular synchronization.

Learning impact analysis reports affected subsystems, projects, modules, plans, context and validation policies, possible behavior changes, risk level, confidence, rollback paths, and evidence. Explanation APIs expose source signals, authority ordering, evidence, eligibility, confidence/stability calculations, freshness, scope, derived adaptations, prior/resulting state, bounds, application results, rollback information, risks, and limitations.

Bounds cover signals, derivation batch size, feedback records, rules, adaptations, evidence per rule, conflicts, historical versions, rollback history, collector records, processing time, weight changes, cumulative changes, rule age, and heuristic influence. Bound hits produce partial analysis events and visible results. Persistence writes schema-versioned compact state to `.levi/learning-adaptation.json`, including normalized signals, feedback, rule references/versions, evaluations, adaptations, application and rollback history, conflicts, and statistics without duplicating full files, transcripts, or existing cross-session learning records.

Known limitation: Learning Adaptation is correlation-aware, not causal proof. It does not train models, infer sensitive personal attributes, create irreversible preferences, or mutate code/plans/context without explicit adapters.

## Intelligence Integration

`src/intelligence-integration-engine.js` provides LI-009 integration and certification for Layer 2. It is an offline, platform-independent orchestrator over the existing LI-001 through LI-008 and AE-001 through AE-007 systems. It does not replace repository scanning, graph storage, indexing, planning, context assembly, code understanding, project synthesis, learning, execution, approval, security, repair, completion, or persistence. It normalizes those systems into descriptors, adapters, evidence references, health reports, scenarios, compatibility matrices, readiness reports, and certification results.

Component descriptors record identity, type, version, schema version, capabilities, required and optional dependencies, adapters, collectors, produced and consumed events, persistence support, authority rules, health metadata, limitations, and timestamps. The integration layer uses normalization wrappers and runtime adapters rather than requiring engines to inherit from a shared base class. Default adapters register the existing repository graph, cross-session learning, offline index, planning, context, code understanding, project intelligence, learning adaptation, execution session, continuation, execution engine, repair, approval, security, objective completion, and the integration engine itself.

Capability discovery derives from registered components and adapters. Capabilities are normalized with provider, domain, inputs, outputs, prerequisites, guarantees, limitations, deterministic/offline flags, reversibility, security sensitivity, approval sensitivity, and status. Duplicate capability providers remain visible as findings rather than being hidden.

Integration descriptors connect source and target components by domain, adapter, contract version, required status, capabilities, evidence flows, authority constraints, security constraints, approval constraints, limitations, and metadata. Dependency discovery distinguishes required dependency failures from optional degraded operation. Missing optional systems lower confidence and completeness; missing required systems block affected certification profiles.

Contract validation checks actual runtime methods, schema versions, stable identifiers, statuses, snapshot compatibility, persistence compatibility, event payload expectations, evidence-reference compatibility, authority metadata, and confidence/completeness bounds. Contract failures become traceable findings and are included in health reports and certification results.

Evidence lineage uses compact evidence references with source component, source record, source type, project, session, revision, version, content hash, authority, confidence, timestamp, and metadata. The validator detects missing source components, missing authority, invalid confidence, duplicate references, stale evidence markers, and circular self-references. It avoids copying repository files, transcripts, or engine stores into the integration state.

Authority consistency validates participating component authority orders against Levi's platform order: current user instruction, current project instruction, durable accepted decision, security policy, verified repository state, validated execution evidence, accepted approval decision, accepted plan, active project learning, active user learning, historical learning, documentation, inferred convention, and heuristic. The integration engine reports conflicts without silently rewriting component policy.

Security and approval invariants are explicit certification gates. Security validation verifies that learning cannot disable security, critical security findings block readiness, unauthorized execution remains blocked, prohibited commands remain blocked, failures stay visible, and degraded mode does not bypass security. Approval validation verifies that required approval cannot be bypassed, learning cannot remove approval requirements, plans cannot self-approve protected actions, execution cannot treat missing approval as acceptance, and degraded mode does not bypass approval gating.

Lifecycle ordering validation inspects bounded event logs for prerequisite ordering, duplicate or impossible terminal behavior, and scoped terminal-event contamination. It compares terminal and active events only within explicit session, certification, or scenario scope so independent certifications do not invalidate each other.

Platform health reports combine component health, integration health, capability availability, degraded and unavailable capabilities, missing dependencies, persistence status, event-system status, invariant status, blockers, findings, confidence, completeness, and deterministic health scores. Health scoring covers component availability, contract compatibility, integration coverage, capability coverage, evidence traceability, authority consistency, security integrity, approval integrity, lifecycle integrity, persistence reliability, recovery readiness, degraded-mode readiness, test evidence, and overall integration health. Scores expose baseline, deductions, caps, evidence, and confidence. Critical caps prevent positive evidence from erasing failed security invariants, approval invariants, required contracts, broken evidence lineage, failed persistence recovery, low confidence, or material staleness.

Degraded operation is validated through optional-component and unavailable-persistence scenarios. Degraded mode preserves security and approval invariants, reduces confidence and completeness, exposes limitations, disables only affected capabilities, and avoids crashing unrelated capabilities.

Deterministic integration scenarios model repository-to-index, repository-to-graph, graph-to-code-understanding, index/code/planning-to-context, project intelligence synthesis, learning flows, execution-to-validation, repair, approval, security-to-release-block, objective-completion-to-project-assessment, persistence recovery, degraded optional components, full offline intelligence flow, and end-to-end project analysis. Scenario results include steps, passed/failed/skipped steps, outputs, events, evidence, findings, duration metadata, confidence, and completeness.

Certification profiles cover CORE_INTELLIGENCE, AUTONOMOUS_EXECUTION, OFFLINE_OPERATION, DEGRADED_OPERATION, SECURITY_INVARIANTS, APPROVAL_INVARIANTS, PERSISTENCE_AND_RECOVERY, EVIDENCE_TRACEABILITY, IDE_BACKEND_READINESS, and FULL_LAYER_2. Certification levels are NOT_ASSESSED, INSUFFICIENT_EVIDENCE, FAILED, DEVELOPMENT, INTEGRATION_READY, IDE_CORE_READY, PRODUCTION_CANDIDATE, and CERTIFIED. The implementation does not mark the platform CERTIFIED merely because tests pass; current successful full-layer certification reaches IDE_CORE_READY when required checks, scenarios, evidence, and invariant gates pass.

Deterministic rerun verification compares stable certification probes twice with identical fixtures, excluding timestamps and runtime metadata. Compatibility matrices list each component with version, schema version, required and optional dependencies, compatibility, limitations, tested scenarios, certification profiles, and findings.

Readiness reports include a deterministic executive summary, current certification level, profile results, available/degraded/unavailable capabilities, component and integration health, invariant status, evidence status, persistence and recovery status, blockers, warnings, limitations, required actions, IDE backend readiness, confidence, completeness, and compatibility matrix. Readiness validation checks traceable conclusions, score consistency, certification consistency, blocker visibility, capability accuracy, unsupported readiness claims, evidence references, and confidence/completeness bounds.

Persistence writes schema-versioned integration state to `.levi/intelligence-integration.json`. It stores descriptors, capabilities, integrations, health reports, certification results, findings, evidence references, compatibility matrices, scenario summaries, readiness reports, event logs, statistics, and metadata without duplicating repository contents or engine stores. Corruption handling emits an event, records a finding, preserves runtime registrations, clears prior certifications, marks restored state incomplete, and requires recertification.

Bounds cover registered components, capabilities, integrations, findings, evidence references, health checks, scenarios, scenario steps, certifications, historical results, inspected events, adapter records, processing time, recovery attempts, and minimum certification confidence/completeness. Bound hits produce partial-analysis events and explicit findings.

Known limitation: LI-009 certifies integration contracts and deterministic offline readiness evidence. It is not a production operational certification, legal/compliance attestation, live IDE UI test, cloud reliability test, or model-provider certification.

## Levi Application Runtime

`src/levi-application-runtime.js` provides L3-001, the application-facing boundary for Release 0.6. Frontends, CLIs, test harnesses, embedded callers, future VS Code integration, and future desktop IDE code interact with `LeviApplicationRuntime` instead of directly touching intelligence engines, autonomous execution engines, approval, security, persistence, or workspace-specific APIs.

The runtime is platform-independent and deterministic offline by default. It has no VS Code, Electron, browser, model-provider SDK, network, Git, shell, or operating-system-specific dependency in the runtime contract. Platform behavior enters through dependency injection: workspace adapters, persistence adapters, event adapters, clock adapters, ID adapters, and injected LI/AE components. The default workspace adapter accepts URI-like workspace identifiers and does not read files; the default persistence adapter owns Node filesystem writes to `.levi/application-runtime.json`.

The runtime state model is explicit and frozen: CREATED, INITIALIZING, READY, DEGRADED, RECOVERING, SUSPENDED, SHUTTING_DOWN, STOPPED, and FAILED. Workspace states are CLOSED, OPENING, OPEN, INDEXING, ANALYZING, READY, DEGRADED, CLOSING, and FAILED. Session states are CREATED, ACTIVE, WAITING_FOR_APPROVAL, WAITING_FOR_INPUT, PAUSED, CANCELLING, CANCELLED, COMPLETED, FAILED, and EXPIRED. Operation states are QUEUED, STARTING, RUNNING, WAITING, WAITING_FOR_APPROVAL, PAUSED, CANCELLING, CANCELLED, SUCCEEDED, PARTIALLY_SUCCEEDED, FAILED, and TIMED_OUT. State transitions are validated before mutation.

Runtime lifecycle APIs cover initialize, shutdown, suspend, resume, recover, state and configuration access, configuration patching, runtime health, statistics, snapshot, restore, save, and load. Initialization validates configuration, registers components, discovers capabilities through `IntelligenceIntegrationEngine`, evaluates health, and enters READY, DEGRADED, or FAILED. It enters FAILED when critical security, approval, configuration, contract, or resource-limit caps block safe operation. DEGRADED remains usable but exposes warnings, missing capabilities, and lower confidence.

Workspace lifecycle APIs cover open, close, refresh, inspect, list, workspace health, workspace capabilities, and analysis. Opening a workspace follows a deterministic flow: validate workspace, normalize URI, resolve project identity, load available persisted state, inspect integration health, discover capabilities, initialize repository knowledge, refresh offline index, refresh graph, refresh code understanding, refresh project intelligence, update health, and emit ready or degraded events. Each stage records progress and evidence; unavailable optional systems produce limitations rather than replacement engines.

Session lifecycle APIs normalize application sessions with workspace/project identity, objective, current operation, operation IDs, approval requests, security decisions, context package references, plan references, execution references, evidence, metadata, and expiry. Sessions can be started, paused, resumed, cancelled, completed, failed, listed, and inspected. Cancellation is idempotent and propagates to associated operations.

Operation lifecycle APIs normalize submitted work with type, command, state, priority, input, output, progress, result, error, cancellation, approval, security, evidence, child and parent operation IDs, timestamps, and metadata. Scheduling is deterministic FIFO within equal priority, honors LOW, NORMAL, HIGH, and CRITICAL priorities, enforces queue and concurrency bounds, supports parent and child operations, and uses cooperative cancellation and timeouts. Critical priority does not bypass approval, security, validation, or resource bounds.

The command registry implements the stable `RuntimeCommand` contract: id, name, description, domain, version, schemas, capability requirements, workspace-state requirements, session requirement, security sensitivity, approval sensitivity, cancellation support, timeout, handler, and metadata. Duplicate IDs are rejected. Protected built-ins cannot be replaced or unregistered unless explicitly configured. Aliases are supported only when unambiguous. Built-ins cover runtime health/capabilities/certification, workspace open/close/refresh/analyze, project summary/assessment/architecture/blockers/risks/next actions/release readiness, repository search/graph query, code understanding, planning, context building, execution, validation, repair, approval response, security status, learning status/adaptation/rollback, and persistence save/restore. Commands remain frontend-safe and return normalized result envelopes.

Query routing is command-backed. Project summary, architecture state, project assessment, release readiness, blockers, risks, next actions, repository search, graph query, code understanding, context packages, plans, learning state, and certification state route to injected LI engines when available. The runtime never fabricates intelligence, scans repositories directly, indexes data directly, or replaces LI/AE systems.

`IntelligenceIntegrationEngine` is the certified capability and health-discovery source. The runtime uses it for component availability, capability discovery, integration health, certification state, degraded-mode information, contract compatibility, readiness information, and platform limitations. The runtime does not hard-code engine availability from filenames.

Events are normalized with id, sequence, type, source, runtime, workspace, project, session, operation, payload, evidence, timestamp, and metadata. Subscriptions support global, workspace, session, operation, and event-type filters. Listener failures are counted and do not crash the runtime. Lifecycle events cover runtime creation/init/ready/degraded/suspend/resume/shutdown/recovery, workspace open/analyze/ready/degraded/close/fail, session changes, operation submit/queue/start/progress/wait/approval/resume/cancel/succeed/partial/fail/timeout, approval request/resolve/expire, command register/unregister/execute, health checks, persistence, restore, corruption, and partial analysis.

Frontend-safe serialization strips functions, internal adapter and runtime instances, raw stacks, secrets, circular references, and oversized payloads while preserving IDs, structured errors, evidence references, confidence, completeness, and ISO timestamps. Results use normalized runtime envelopes; errors include code, category, message, user message, retry/recovery flags, severity, details, evidence, suggested actions, metadata, and creation time.

Security-sensitive commands fail closed when `SecurityValidator` is unavailable. Before execution, the runtime resolves command policy, validates the security state, records security decisions, preserves evidence, blocks prohibited outcomes, and keeps critical findings visible. Approval-sensitive commands create normalized `ApprovalRequest` records and wait for explicit approval or rejection. Pending, approved, rejected, expired, cancelled, and failed states are traceable; the runtime never fabricates user approval.

Runtime health includes runtime state, configuration validity, registered components, available and unavailable capabilities, integration health, certification state, workspaces, sessions, queued/running/failed operations, persistence status, event status, security status, approval status, warnings, blockers, confidence, completeness, and deterministic scores. Required domains are initialization, configuration, component availability, capability coverage, workspace readiness, operation reliability, event reliability, persistence reliability, security integrity, approval integrity, integration certification, and overall runtime health. Critical caps prevent missing security, missing approval, incompatible contracts, failed validation, corrupted recovery, or certification below `IDE_CORE_READY` from being hidden by positive evidence.

Persistence stores compact runtime coordination state only: configuration, workspace descriptors, session summaries, operation summaries, command metadata, approval-request summaries, event checkpoints, runtime health history, statistics, and schema version. It does not duplicate repository contents, engine stores, source code, transcripts, context packages, execution logs, or secrets. Recovery validates persisted state, marks in-flight operations interrupted, restores safe workspace/session descriptors, revalidates certification, expires approvals, preserves failed-operation evidence, and does not automatically resume protected source-changing operations.

Bounds cover registered components, commands, workspaces, sessions, operations, queued/running operations, child operations, operation depth, event history, listeners, result size, warnings, evidence references, persisted operation/session history, recovery attempts, initialization time, operation time, and shutdown time. Bound violations produce explicit errors or partial results, emit events, and preserve runtime stability.

Known limitations for L3-001: the runtime does not implement a VS Code extension, desktop UI, browser UI, provider SDK, networking, Git mutation, shell execution, repository writing, model routing, or a replacement engine. Workspace file reads are adapter-owned; the default URI adapter is intentionally metadata-only. Approval resumption records explicit decisions but does not automatically re-run protected command handlers after approval; callers retry or submit the operation again with approval evidence when source-changing behavior is introduced.

## VS Code Extension Shell

`packages/vscode-extension` provides L3-002, the first functional IDE shell for Levi. It is an isolated CommonJS VS Code extension package with its own manifest, entry point, source modules, tests, icon, and package validation. The extension imports only `LeviApplicationRuntime` from the core runtime boundary; it does not directly import or call repository graph, offline index, planning, context, code understanding, project intelligence, learning, execution internals, security internals, approval internals, or certification internals.

The extension boundary depends on VS Code APIs, runtime public APIs, normalized runtime models, runtime command contracts, and runtime event contracts. All VS Code-specific behavior lives under `packages/vscode-extension/src`. Runtime-independent core files remain in `src`.

Activation creates the Levi output channel, status bar item, `VSCodeWorkspaceAdapter`, virtual document provider, tree view providers, runtime event subscription, command registrations, workspace/configuration listeners, and `LeviApplicationRuntime`. It configures runtime storage from extension storage paths, initializes the runtime with lightweight startup checks, records activation health, opens the active workspace when configured, and surfaces READY, DEGRADED, or FAILED states visibly. Full certification is exposed as an explicit command instead of blocking extension startup.

Deactivation unsubscribes runtime events, disposes file watchers, saves compact runtime state, shuts down `LeviApplicationRuntime`, disposes commands/views/documents/status/output resources, and avoids leaving operations permanently active.

`VSCodeWorkspaceAdapter` satisfies the L3-001 workspace adapter contract with VS Code APIs: URI normalization, validation, open/close, metadata, deterministic revision evidence, bounded file listing through `workspace.findFiles`, bounded reads through `workspace.fs.readFile`, stats through `workspace.fs.stat`, file watching through `createFileSystemWatcher`, unwatching, and workspace-relative path resolution. It supports file, remote, virtual, single-root, multi-root, and untitled workspace identities. It uses configurable exclusions for `.git`, `.levi`, `node_modules`, build outputs, coverage, caches, vendor directories, generated/minified artifacts, and maps. File reads enforce maximum bytes, binary-file skipping, cancellation checks, inaccessible-file reporting, and partial-result limitations.

Command bindings are thin adapters from VS Code commands to runtime APIs. They validate prerequisites, resolve the active workspace, invoke runtime lifecycle/workspace/query/command APIs, use VS Code progress, support cancellation when an operation ID is known, preserve operation IDs, show partial results and limitations, update views, and route errors through normalized error presentation. Commands include dashboard, initialize, workspace open/refresh/analyze, project summary, architecture, assessment, blockers, risks, next actions, release readiness, workspace search, capabilities, runtime health, certification show/run, operations, cancellation, approvals, approval response, state save/restore, and current-file understanding.

The Levi Activity Bar contributes Overview, Project, Operations, Approvals, and Diagnostics views. These are TreeView providers over deterministic presentation models derived from runtime results. The Overview view shows runtime state, health score, certification, workspace state, project identity, capabilities, active operations, pending approvals, blockers, and warnings. The Project view shows runtime query results only; it does not synthesize independent project conclusions. The Operations and Approvals views group normalized operation and approval records by state/status.

Read-only `levi:` virtual documents present project summaries, architecture, assessments, search results, runtime health, capabilities, operations, approvals, certification, and code-understanding results. They are generated from frontend-safe runtime data and do not masquerade as repository files.

The runtime event bridge maps runtime lifecycle, workspace lifecycle, operation lifecycle/progress, approval, health, persistence, recovery, failure, degraded, and certification events to bounded output-channel records, view refreshes, progress updates, status bar state, notifications, and diagnostics presentation. Progress events are coalesced and throttled; terminal events refresh immediately. The extension keeps only a bounded presentation cache and does not duplicate runtime event history into runtime state.

Approval UX requires direct user action. The user selects the exact pending request, sees requested action, risks, and scope, optionally enters a reason, and then the extension calls the runtime `approval.respond` command. Closing the view or ignoring a prompt does not approve anything, and blanket approval is not implemented.

The status bar shows compact states such as `Levi: Ready`, `Levi: Analyzing`, `Levi: Waiting for Approval`, `Levi: Degraded`, and `Levi: Failed`. It opens the Levi Activity Bar container and uses a tooltip with runtime/workspace health context.

The output channel logs activation, initialization, workspace opening, operation starts/completions, degraded states, normalized warnings/errors, certification outcomes, persistence, recovery, and deactivation. It truncates oversized messages and filters secrets, raw stacks, internal instances, handlers, adapters, and credentials by default. Diagnostic mode permits safe additional metadata only after serialization.

Configuration contributions include enablement, auto-initialize, auto-analyze, offline mode, strict security, persistence, workspace file/byte bounds, exclusions, notifications, progress location, and diagnostics. Configuration changes update adapter/runtime configuration where safe, preserve strict security, refresh presentation state, and avoid unnecessary runtime restarts.

Workspace lifecycle integration handles initial windows, no-folder windows, workspace-folder changes, remote URIs, reload/restart persistence, and stale-state marking. File watchers mark the presentation state stale and recommend refresh; they do not run expensive analysis on every file change.

Security boundary: source mutation, unrestricted terminal execution, Git mutation, package installation, cloud services, network requirements, and model-provider SDKs remain absent. Current-file understanding and workspace search are read-only runtime queries. Extension UI never bypasses `LeviApplicationRuntime` to call internal engines.

Known limitations for L3-002: the shell is intentionally tree-view and virtual-document based, not a chat UI or custom frontend framework. Manual Extension Development Host verification is still required outside automated Node tests. The shell proves runtime contract integration but does not yet implement L3-003 richer IDE workflows or source-changing actions.

## Product Experience Layer

`packages/vscode-extension/src/product-experience` provides RC-004/L4-001: the cohesive Levi product experience for VS Code. It is presentation-only and host-specific. It consumes the extension's frontend-safe presentation cache, runtime commands, and runtime events; it does not import core engine internals, create a second runtime, create another approval/workflow/provider/Git/security/persistence system, or mutate source.

Package structure:

- `product-experience-controller.js` owns Copilot panel lifecycle, command wrappers, safe preference loading, and allowlisted webview messages.
- `copilot-view-provider.js` renders the secure Levi Copilot webview panel with a compact header, composer, action cards, approval summary, timeline, and response area.
- `environment-view-provider.js` renders the Environment TreeView from normalized product state.
- `product-experience-state.js` aggregates the existing runtime presentation cache into plain-language product state.
- `product-experience-serializer.js` redacts credentials, private prompts, private reasoning, handlers, adapters, stacks, and unsafe internals.
- `approval-card-presentation.js`, `change-review-presentation.js`, `timeline-presentation.js`, `model-picker-controller.js`, `onboarding-controller.js`, `git-presentation.js`, and `context-presentation.js` provide bounded product cards and sections.
- `product-experience-constants.js` defines modes, stages, commands, sections, and UI bounds.

Copilot panel:

- Opened by `levi.open`; existing `levi.openAgent` remains for backward compatibility.
- Composer modes are `Ask`, `Plan`, `Build`, `Fix`, `Review`, and `Teach`. They are presentation presets only and route to `AgentOrchestrationEngine` through existing extension/runtime command methods.
- Composer messages support bounded multiline input, context scope, current-file attachment, selected-code attachment, model selection, cancellation, retry, and keyboard submit/cancel.
- Webview messages are schema checked and allowlisted. No arbitrary VS Code command IDs, shell commands, host command strings, or model-provided HTML are accepted.

Environment panel:

- Contributed as `levi.environment`.
- Sections are Workspace, Git, Changes, Workflow, Agents, Models, Validation, Approvals, Performance, Reliability, Security, and Context.
- The view answers current product status at a glance while older specialized TreeViews remain available for technical drill-in.

Plain-language status mapping:

- Internal runtime, operation, workflow, turn, approval, and change states map to `Understanding`, `Gathering Context`, `Planning`, `Preparing Changes`, `Reviewing`, `Waiting for Approval`, `Applying`, `Testing`, `Repairing`, `Complete`, `Needs Attention`, and `Cancelled`.
- Raw state-machine names are kept out of the default product presentation; technical details remain available through `levi.showTechnicalDetails`.

Approval cards and change review:

- Approval cards show action, reason, exact scope, risk, workspace, branch when known, diff summary, validation plan, rollback availability, expiration, warnings, limitations, and actions.
- Approval cards never imply approval before runtime confirmation; approve/reject still flow through existing `approval.respond`.
- Change review presents proposal summary, file list, operation badges, additions/deletions, risk indicators, stale status, protected-path warnings, diff navigation, approval/application state, validation result, and revert eligibility.

Workflow, multi-agent, model, Git, and context presentation:

- Workflow timelines show completed, active, waiting, blocked, failed, and upcoming stages without exposing the entire dependency graph unless technical details are requested.
- Multi-agent work is summarized by coordinator/planner/implementer/reviewer/tester/security reviewer roles, state, assignment, progress, findings, limitations, and conflicts. Agent agreement is explicitly not approval.
- Model presentation shows provider/model status, local/remote routing, privacy policy, availability, and selector actions without exposing credential values.
- Git presentation uses source-control/runtime adapter evidence when available. Commit and push are shown unavailable unless safe approved operations exist; force push remains unavailable.
- Context presentation summarizes workspace, current-file, selected-code, project, workflow, plan, approval, change, and evidence references within bounds.

Onboarding, accessibility, persistence, and recovery:

- Onboarding covers workspace, trust, local model, model selection, Git availability, and safe read-only checks. Cloud setup is optional.
- Webview controls use labels, aria labels, keyboard submit/cancel, non-color status text, and reduced-motion handling.
- Persistence is limited to compact UI preferences such as selected mode, collapsed sections, onboarding state, and advanced-detail preference in VS Code mementos. Credentials, complete source, raw prompts, private reasoning, unbounded responses, approval authority, unsafe HTML, and provider payloads are not persisted.
- Recovery presentation reports interrupted workflows, stale approvals, stale proposals, and preserved state; mutation, commands, commit, and push never auto-resume.

Performance strategy:

- Product state is bounded, serialized, cached in the existing presentation cache, refreshed through the extension's throttled refresh path, and rendered incrementally in a single webview state message.
- Long lists are summarized, technical details are lazy through virtual documents, and specialized TreeViews remain available for deeper inspection.

Known limitations for RC-004: automated tests validate the panel, state, manifest, webview security, command wiring, and presentation contracts. Live Extension Development Host validation, visual inspection, and hands-on keyboard/screen-reader verification are deferred to RC-005.

## Trust Boundaries

- Repository files are untrusted input.
- Retrieved memory is untrusted until its state is checked.
- Model output is untrusted.
- Shell commands require an approved plan.
- File operations remain restricted to the active repository.
- Secrets must never enter prompts, logs, memory, or reports.

## Data Separation

Project truth categories:

- APPROVED
- VERIFIED
- INFERRED
- REJECTED

Only APPROVED and VERIFIED records control execution.

## Replacement Rule

No external dependency appears directly in domain logic. Every external tool or repository connects through an adapter implementing a Levi-owned interface.

## Deferred Decisions

The following remain UNKNOWN until OSS evaluation:

- Exact memory repository.
- Exact vector store.
- Exact model gateway.
- Exact coding executor.

These decisions do not expand MVP scope.
