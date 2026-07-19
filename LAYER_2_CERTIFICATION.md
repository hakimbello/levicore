# Layer 2 Certification

## Current Result

Layer 2 is `IDE_CORE_READY` for backend integration.

It is not `CERTIFIED` for production. Production certification is intentionally stricter than passing the local test suite and would require broader operational evidence, live IDE integration evidence, long-running recovery evidence, and release-governance signoff.

## Tested Component Inventory

- LI-001 `RepositoryKnowledgeGraph`
- LI-002 `CrossSessionLearningEngine`
- LI-003 `OfflineKnowledgeIndex`
- LI-004 `PlanningIntelligenceEngine`
- LI-005 `ContextIntelligenceEngine`
- LI-006 `CodeUnderstandingEngine`
- LI-007 `ProjectIntelligenceEngine`
- LI-008 `LearningAdaptationEngine`
- LI-009 `IntelligenceIntegrationEngine`
- AE-001 `ExecutionSession`
- AE-002 `ContinueEngine`
- AE-003/AE-004/AE-005/AE-006/AE-007 `ExecutionEngine`
- AE repair, approval, security, and objective-completion engines

## Capability Inventory

The integration layer discovers capabilities from registered components and adapters, including repository scanning, repository graph querying, offline search, semantic retrieval, durable learning, planning, task decomposition, context assembly, context ranking, code entity analysis, code relationship analysis, impact analysis, architecture analysis, project assessment, release-readiness assessment, blocker detection, risk detection, learning-rule derivation, bounded adaptation, execution, validation, repair, approval gating, security gating, objective completion, persistence, recovery, event publication, and evidence explanation.

## Integration Matrix

Required integrations covered by LI-009 tests include:

- repository graph to offline index
- repository graph to code understanding
- offline index to context intelligence
- planning intelligence to context intelligence
- code understanding to project intelligence
- execution engine to continuation
- execution engine to repair
- execution engine to approval
- execution engine to security
- execution engine to objective completion
- security validator to project intelligence

Optional degraded integrations include learning adaptation to context, learning adaptation to planning, code understanding to context, and objective completion to project intelligence.

## Certification Profiles

Implemented profiles:

- `CORE_INTELLIGENCE`
- `AUTONOMOUS_EXECUTION`
- `OFFLINE_OPERATION`
- `DEGRADED_OPERATION`
- `SECURITY_INVARIANTS`
- `APPROVAL_INVARIANTS`
- `PERSISTENCE_AND_RECOVERY`
- `EVIDENCE_TRACEABILITY`
- `IDE_BACKEND_READINESS`
- `FULL_LAYER_2`

Successful local LI-009 certification reaches `IDE_CORE_READY`, not `CERTIFIED`.

## Scenario Inventory

Implemented deterministic scenarios:

- `repository_to_index`
- `repository_to_graph`
- `graph_to_code_understanding`
- `index_to_context`
- `code_understanding_to_context`
- `planning_to_context`
- `project_intelligence_synthesis`
- `learning_from_execution_outcome`
- `learning_to_context_adaptation`
- `learning_to_planning_adaptation`
- `execution_to_validation`
- `failed_execution_to_repair`
- `protected_execution_to_approval`
- `security_failure_to_release_block`
- `objective_completion_to_project_assessment`
- `project_assessment_to_next_action`
- `persistence_snapshot_restore`
- `corruption_recovery`
- `degraded_optional_component`
- `full_offline_intelligence_flow`
- `end_to_end_project_analysis`

## Test Evidence

LI-009 test coverage is in `test/intelligence-integration-engine.test.js`.

It covers normalized models, stable IDs, duplicate suppression, component/capability/integration registration, dependency discovery, optional and required missing dependencies, component adapter normalization, capability discovery, duplicate providers, contract validation, incompatible contracts through missing methods, snapshot compatibility, evidence lineage, broken/stale/duplicate/circular evidence, authority consistency, security invariants, approval invariants, lifecycle ordering, platform health, deterministic health scoring, critical caps, degraded mode, deterministic scenarios, all certification profiles, certification comparison and explanation, compatibility matrix, readiness report validation, persistence, migration hooks, corruption fallback, recertification after corruption, snapshot/restore, bounds, partial results, statistics, LI-001 through LI-008 compatibility, and AE-001 through AE-007 compatibility.

## Invariant Evidence

Security invariants tested:

- learning cannot disable security
- critical security findings block readiness
- unauthorized execution remains blocked
- prohibited commands remain blocked
- degraded mode cannot bypass security checks

Approval invariants tested:

- required approval cannot be bypassed
- learning cannot remove approval requirements
- plans cannot self-approve protected actions
- execution cannot treat missing approval as acceptance
- degraded mode cannot bypass approval gating

Authority evidence:

- component authority order is validated against Levi's shared precedence list
- conflicts are findings, not silent rewrites

Evidence lineage:

- evidence references include source component, source record, source type, authority, confidence, timestamp, and metadata
- broken, stale, duplicate, and circular references are visible findings

## Known Limitations

- Certification is deterministic and evidence-bound; it does not perform production operational certification.
- No UI, VS Code, desktop, cloud, telemetry, network, or model-provider behavior is certified by LI-009.
- Scenarios use deterministic offline fixtures and integration contracts, not live external services.
- `CERTIFIED` and `PRODUCTION_CANDIDATE` remain intentionally unclaimed.
- Optional subsystem degradation lowers confidence and completeness but does not block IDE backend readiness when invariants hold.

## IDE_CORE_READY Criteria

Layer 2 is `IDE_CORE_READY` when:

- required LI and AE component contracts pass
- required integrations are connected
- capability discovery works through descriptors
- evidence lineage is traceable
- authority, security, approval, lifecycle, persistence, and recovery gates pass
- deterministic scenarios for IDE backend access pass
- readiness report validation passes
- confidence and completeness meet configured thresholds
- no unresolved high or critical blocker prevents IDE backend use

## Production Certification Gaps

Production certification is not claimed because these criteria are not yet satisfied by this milestone:

- production operational run history
- live IDE extension integration evidence
- long-running recovery and corruption drills
- release-governance approval record
- production security review evidence
- production performance and scale evidence
- external dependency and supply-chain certification evidence
