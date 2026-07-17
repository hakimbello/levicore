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
