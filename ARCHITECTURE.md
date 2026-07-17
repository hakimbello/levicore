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
