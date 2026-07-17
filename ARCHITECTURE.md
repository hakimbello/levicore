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

- Normalize model requests and responses.
- Route by task class, availability, cost class, and configured policy.
- Apply fallbacks, limits, and accounting.

Maps to LC-MVP-006.

### 7. Coding Executor

Responsibilities:

- Execute approved file changes.
- Enforce repository and file boundaries.
- Enforce step, time, and cost ceilings.
- Record exact changes.

Maps to LC-MVP-007.

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
