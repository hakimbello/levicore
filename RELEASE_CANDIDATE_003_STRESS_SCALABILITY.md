# RC-003 Stress, Scalability, and Sustained-Load Certification

## Scope

RC-003 adds deterministic stress-assurance diagnostics for Levi Platform release-candidate hardening. The implementation is centered on `src/stress-scalability-engine.js` and integrated through `LeviApplicationRuntime` and the VS Code extension shell.

The layer is diagnostic only. It does not create a second scheduler, performance engine, repository indexer, provider gateway, workflow engine, approval system, security engine, persistence system, or workspace mutation path.

## Stress Package Structure

- Engine: `src/stress-scalability-engine.js`
- Runtime boundary: `LeviApplicationRuntime` optional `StressScalabilityEngine` component and protected `stress.*` commands
- VS Code presentation: `levi.stressScalability` TreeView, virtual documents, command bindings, and conservative settings
- Tests: `test/stress-scalability-engine.test.js`, extension shell tests, and manifest validation
- Architecture notes: `ARCHITECTURE.md`

## Built-In Profiles

- `SMOKE`: core repository, cache, workflow, agent, provider, and presentation checks
- `STANDARD`: normal release-candidate regression pressure
- `STRICT`: expanded repository, provider, workflow, queue, event, memory, recovery, and serialization coverage
- `RELEASE_CANDIDATE`: every release-blocking scalability scenario within finite configured bounds

## Synthetic Repository Scales

- `TINY`: 25 files, 100 symbols
- `SMALL`: 500 files, 3,000 symbols
- `MEDIUM`: 5,000 files, 40,000 symbols
- `LARGE`: 25,000 files, 200,000 symbols
- `VERY_LARGE`: 100,000 files, 1,000,000 symbols
- `MONOREPO`: 50 packages, 30,000 files

All scales are virtual descriptors. The engine does not create large physical repositories during certification.

## Built-In Scenario Coverage

Coverage includes repository cold/warm indexing, very-large virtual repositories, monorepo boundaries, graph-query bursts, context-package bursts, provider latency, provider throttling, stream interruption, long agent conversations, agent cancellation, multi-agent team pressure, conflict pressure, deep/wide workflow graphs, workflow cancellation storms, workspace reads, large change proposals, large patch previews, validation concurrency, persistence cycles, recovery cycles, event floods, listener pressure, queue fill/drain, cache pressure, memory pressure, presentation pressure, and serialization pressure.

## Metrics

The report normalizes latency, throughput, queue, memory, cache, event, persistence, recovery, cancellation, cleanup, and presentation-pressure metrics. Evidence remains compact, deterministic, and redacted.

## Certification Gates

`RELEASE_CANDIDATE_SCALABILITY` requires no unresolved release-blocking findings. Blockers include critical scalability findings, uncontrolled memory growth, unbounded queues, starvation, uncapped concurrency, event loss, failed recovery, failed cancellation, provider throttling collapse, protected-path mutation pressure, and component integration regressions.

Certification levels are `NOT_ASSESSED`, `STRESS_BASELINE`, `SCALABILITY_CONFIDENCE`, `RELEASE_CANDIDATE_SCALABILITY`, and `SCALABILITY_BLOCKED`.

## Boundaries Preserved

- Runtime remains the public integration boundary.
- Reliability, security, performance, agent, multi-agent, workflow, provider, and workspace-tool components remain authoritative for their domains.
- No model output, reviewer output, workflow output, or agent output can approve work.
- No source mutation occurs outside `ControlledWorkspaceToolEngine`.
- No unrestricted shell execution or arbitrary command strings are introduced.
- VS Code-specific behavior stays under `packages/vscode-extension`.
- Offline functionality is preserved.

## Known Limitations

RC-003 provides deterministic release-candidate scalability evidence. It is not a production capacity claim, hardware benchmark, Marketplace readiness claim, provider SLA validation, network load test, or external performance audit.
