# Release Candidate 001 Reliability

## Purpose

RC-001 adds reliability, fault-tolerance, and recovery certification for Levi. The goal is deterministic evidence that Levi remains internally consistent when components fail, persistence is corrupted, operations are interrupted, resources are exhausted, events are duplicated or reordered, and the application restarts during active work.

This milestone does not add coding capabilities.

## Public APIs

Core module: `src/reliability-assurance-engine.js`

Runtime commands:

- `reliability.health`
- `reliability.stats`
- `reliability.scenarios`
- `reliability.run`
- `reliability.cancel`
- `reliability.report`
- `reliability.consistency`
- `reliability.recovery`
- `reliability.resources`
- `reliability.findings`
- `reliability.certify`

VS Code commands:

- `levi.showReliability`
- `levi.runReliabilitySmoke`
- `levi.runReliabilityStandard`
- `levi.runReliabilityStrict`
- `levi.runReliabilityReleaseCandidate`
- `levi.cancelReliabilityRun`
- `levi.showReliabilityReport`
- `levi.showReliabilityBlockers`
- `levi.showReliabilityConsistency`
- `levi.showReliabilityRecovery`
- `levi.showReliabilityResources`

## Normalized Models

The engine normalizes:

- `ReliabilityConfiguration`
- `FaultScenario`
- `FaultInjection`
- `ReliabilityDiagnosticRun`
- `FaultScenarioResult`
- `ReliabilityFinding`
- `ConsistencyReport`
- `RecoveryReport`
- `ResourceReport`

Every model is bounded, deterministic, frontend-safe, and compact enough for release-candidate evidence.

## Fault Categories

Fault categories include component initialization/shutdown failures, persistence failures and corruption, interrupted runtime/model/agent/multi-agent/workflow/workspace/validation/repair/source-control operations, event duplication/loss/reordering/handler failures, listener/timer/stream leaks, queue overflow/starvation, lock contention, concurrent state transitions, resource exhaustion, memory pressure, cache/graph corruption, workspace revision changes, approval expiration/scope mismatch, credential/provider failures, serialization/deserialization failures, clock skew, and unknown faults.

## Fault Phases

Fault phases cover before/during/after initialization, operation, persistence, approval, mutation, validation, shutdown, and during recovery.

## Built-In Profiles

- `SMOKE`: baseline interruption, persistence corruption, and custom smoke scenarios.
- `STANDARD`: smoke plus model, agent, event integrity, and cleanup coverage.
- `STRICT`: standard plus protected mutation, validation, workflow, multi-agent, approval, and protected-action non-resume.
- `RELEASE_CANDIDATE`: full built-in scenario set and release-blocker certification gates.

## Built-In Scenarios

Built-ins cover:

- interrupted runtime operation
- persistence corruption
- event duplication
- listener cleanup
- protected workspace mutation interruption
- validation interruption
- model request interruption
- agent turn interruption
- multi-agent assignment interruption
- workflow step interruption
- performance cache corruption
- repository graph corruption
- approval expiration
- queue overflow
- concurrent state transition

## Fault-Injection Contract

Fault injection is diagnostic-only. It is disabled during ordinary runtime use and only activated by explicit diagnostic runs. Active injections are represented as compact records, never persisted as live wrappers, and always cleared after scenario completion, cancellation, shutdown, or recovery.

## Persistence Wrapper

Default metadata path: `.levi/reliability-assurance.json`.

Persisted records:

- configuration
- scenario definitions
- diagnostic run summaries
- scenario result summaries
- finding summaries
- certification summary
- evidence references
- resource summaries
- consistency summaries
- statistics
- schema version

Never persisted:

- credentials
- authorization headers
- full source files
- raw private prompts
- private reasoning
- full provider payloads
- full command output
- process handles
- unbounded event streams
- active injected fault objects

## Event-Integrity Rules

Events have deterministic IDs, sequence numbers, type names, timestamps, and compact payloads. Terminal events for a run/scenario/certification must be unique. Listener failures are isolated and counted. Event history is bounded.

## State-Machine Rules

Reliability engine states are explicit: created, initializing, ready, degraded, running diagnostics, recovering, suspended, shutting down, stopped, failed.

Diagnostic states are explicit: created, validating, queued, running, injecting fault, observing, recovering, verifying, succeeded, partially succeeded, failed, cancelled, timed out, invalid, expired.

Terminal runs cannot keep active scenarios. Successful runs cannot contain failed scenarios. Invalid transitions produce reliability findings and fail closed when configured.

## Ownership Rules

The reliability layer does not own runtime state, workflow execution, model requests, workspace mutation, approval, validation, repair, repository intelligence, or source-control state. It observes through public APIs and reports evidence.

## Recovery Rules

Recovery preserves completed evidence, marks interrupted diagnostics incomplete, clears active injections, invalidates incomplete certification, preserves unresolved findings, verifies no diagnostic wrappers remain active, and requires explicit rerun.

## Protected-Action Rules

Protected mutation, source-control, validation, command, and approval-sensitive work must never auto-resume after recovery. The expected outcome is user retry, user approval, and revalidation.

## Idempotency Rules

Diagnostics check that duplicate runtime operations, model requests, tool calls, approval responses, mutations, commands, workflow steps, and checkpoint restores are absent or safely rejected.

## Resource-Leak Methodology

Resource checks sample listeners, timers, streams, active runs, active injections, queue depth, and deterministic memory pressure signals. Memory growth is reported as indicative unless confirmed by bounded repeated samples.

## Concurrency Methodology

Diagnostic concurrency is bounded by configuration. Exceeding the bound fails safely and does not start extra runs. Runtime/provider/workflow concurrency remains owned by existing systems.

## Corruption Methodology

Corruption tests use deterministic fake payloads and adapters for malformed JSON, truncated state, schema mismatch, invalid state, duplicate IDs, dangling references, corrupted graph/cache metadata, invalid approval linkage, invalid proposal hash, invalid checkpoint, and oversized histories.

## Health Scoring

Health domains:

- state machine
- event integrity
- persistence
- recovery
- protected actions
- idempotency
- resources
- concurrency
- corruption

Open release blockers reduce overall score and set health to `BLOCKED`.

## Release-Blocking Criteria

Certification is blocked by:

- critical reliability findings
- protected action resumed after recovery
- duplicate execution detected
- invalid state machine
- invalid event sequence
- corrupted persistence without safe fallback
- resource cleanup failure
- security/privacy/approval integrity violation
- incomplete or missing diagnostic evidence for the selected profile

## Certification Requirements

Certification levels:

- `NOT_ASSESSED`
- `BLOCKED`
- `BASELINE`
- `STANDARD`
- `STRICT`
- `RELEASE_CANDIDATE_READY`

`RELEASE_CANDIDATE_READY` requires the release-candidate profile to complete without open release blockers.

## Runtime Integration

The runtime can initialize without the reliability engine. When enabled, the engine is registered as `ReliabilityAssuranceEngine`, emits reliability events through the runtime event stream, and exposes `reliability.*` commands.

## VS Code View

The `levi.reliability` view shows health, engine state, certification, active run, run score, scenario count, findings, blockers, consistency, resource cleanup, recent runs, domains, and key statistics.

## Testing Strategy

Automated tests cover model normalization, lifecycle, scenario registry, fault isolation, persistence failures, corruption fallback, recovery, protected-action non-resume, idempotency, event integrity, listener isolation, resource cleanup, release blockers, certification, runtime integration, and VS Code monitoring.

No tests require internet, commercial API keys, live Ollama, a real Git repository, real VS Code desktop, destructive OS faults, uncontrolled process crashes, or long-duration waits.

## Manual Verification Checklist

- Launch Extension Development Host.
- Open Reliability view.
- Run SMOKE profile.
- Inspect scenario progress.
- Inspect reliability report.
- Inspect blockers.
- Simulate provider interruption.
- Simulate workflow interruption.
- Simulate corrupted persistence.
- Verify completed evidence survives.
- Verify protected operation does not resume.
- Verify stale approval is invalidated.
- Verify duplicate apply is blocked.
- Verify duplicate command is blocked.
- Verify listeners and timers return to baseline.
- Cancel an active diagnostic run.
- Reload extension.
- Verify interrupted diagnostic is not falsely completed.
- Run STANDARD profile.
- Verify no credentials or source contents appear in reports.
- Verify normal Levi operation is unaffected when fault injection is inactive.

Live desktop smoke testing remains scheduled after production hardening and product-experience work, before Marketplace release.

## Known Limitations

- Resource leak checks are deterministic diagnostic samples, not host-level heap proofs.
- Fault injection uses fake adapters and diagnostic records; destructive OS-level process faults are out of scope.
- RC-001 certifies platform reliability evidence, not marketplace readiness, cloud reliability, legal compliance, or production live traffic.

## RC-002 Readiness Criteria

RC-002 may begin when root tests, reliability tests, runtime tests, extension tests, syntax checks, package validation, manifest validation, and release-candidate reliability baseline all pass with no open release blockers.
