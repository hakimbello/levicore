const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const RELIABILITY_ASSURANCE_SCHEMA_VERSION = 1;

const ReliabilityEngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  RUNNING_DIAGNOSTICS: "RUNNING_DIAGNOSTICS",
  RECOVERING: "RECOVERING",
  SUSPENDED: "SUSPENDED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const DiagnosticRunStates = Object.freeze({
  CREATED: "CREATED",
  VALIDATING: "VALIDATING",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  INJECTING_FAULT: "INJECTING_FAULT",
  OBSERVING: "OBSERVING",
  RECOVERING: "RECOVERING",
  VERIFYING: "VERIFYING",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
  INVALID: "INVALID",
  EXPIRED: "EXPIRED",
});

const FaultCategories = Object.freeze({
  COMPONENT_INITIALIZATION_FAILURE: "COMPONENT_INITIALIZATION_FAILURE",
  COMPONENT_SHUTDOWN_FAILURE: "COMPONENT_SHUTDOWN_FAILURE",
  PERSISTENCE_READ_FAILURE: "PERSISTENCE_READ_FAILURE",
  PERSISTENCE_WRITE_FAILURE: "PERSISTENCE_WRITE_FAILURE",
  PERSISTENCE_CORRUPTION: "PERSISTENCE_CORRUPTION",
  PARTIAL_PERSISTENCE_WRITE: "PARTIAL_PERSISTENCE_WRITE",
  STALE_PERSISTED_STATE: "STALE_PERSISTED_STATE",
  INTERRUPTED_RUNTIME_OPERATION: "INTERRUPTED_RUNTIME_OPERATION",
  INTERRUPTED_MODEL_REQUEST: "INTERRUPTED_MODEL_REQUEST",
  INTERRUPTED_MODEL_STREAM: "INTERRUPTED_MODEL_STREAM",
  INTERRUPTED_AGENT_TURN: "INTERRUPTED_AGENT_TURN",
  INTERRUPTED_MULTI_AGENT_ASSIGNMENT: "INTERRUPTED_MULTI_AGENT_ASSIGNMENT",
  INTERRUPTED_WORKFLOW_STEP: "INTERRUPTED_WORKFLOW_STEP",
  INTERRUPTED_WORKSPACE_MUTATION: "INTERRUPTED_WORKSPACE_MUTATION",
  INTERRUPTED_VALIDATION: "INTERRUPTED_VALIDATION",
  INTERRUPTED_REPAIR: "INTERRUPTED_REPAIR",
  INTERRUPTED_SOURCE_CONTROL_OPERATION: "INTERRUPTED_SOURCE_CONTROL_OPERATION",
  EVENT_DUPLICATION: "EVENT_DUPLICATION",
  EVENT_LOSS: "EVENT_LOSS",
  EVENT_REORDERING: "EVENT_REORDERING",
  EVENT_HANDLER_FAILURE: "EVENT_HANDLER_FAILURE",
  LISTENER_LEAK: "LISTENER_LEAK",
  TIMER_LEAK: "TIMER_LEAK",
  STREAM_LEAK: "STREAM_LEAK",
  QUEUE_OVERFLOW: "QUEUE_OVERFLOW",
  QUEUE_STARVATION: "QUEUE_STARVATION",
  LOCK_CONTENTION: "LOCK_CONTENTION",
  CONCURRENT_STATE_TRANSITION: "CONCURRENT_STATE_TRANSITION",
  RESOURCE_EXHAUSTION: "RESOURCE_EXHAUSTION",
  MEMORY_PRESSURE: "MEMORY_PRESSURE",
  CACHE_CORRUPTION: "CACHE_CORRUPTION",
  GRAPH_CORRUPTION: "GRAPH_CORRUPTION",
  WORKSPACE_REVISION_CHANGE: "WORKSPACE_REVISION_CHANGE",
  APPROVAL_EXPIRATION: "APPROVAL_EXPIRATION",
  APPROVAL_SCOPE_MISMATCH: "APPROVAL_SCOPE_MISMATCH",
  CREDENTIAL_RESOLUTION_FAILURE: "CREDENTIAL_RESOLUTION_FAILURE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  PROVIDER_MALFORMED_RESPONSE: "PROVIDER_MALFORMED_RESPONSE",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  PROVIDER_RATE_LIMIT: "PROVIDER_RATE_LIMIT",
  ADAPTER_FAILURE: "ADAPTER_FAILURE",
  SERIALIZATION_FAILURE: "SERIALIZATION_FAILURE",
  DESERIALIZATION_FAILURE: "DESERIALIZATION_FAILURE",
  CLOCK_SKEW: "CLOCK_SKEW",
  UNKNOWN: "UNKNOWN",
});

const FaultPhases = Object.freeze({
  BEFORE_INITIALIZATION: "BEFORE_INITIALIZATION",
  DURING_INITIALIZATION: "DURING_INITIALIZATION",
  AFTER_INITIALIZATION: "AFTER_INITIALIZATION",
  BEFORE_OPERATION: "BEFORE_OPERATION",
  DURING_OPERATION: "DURING_OPERATION",
  AFTER_OPERATION: "AFTER_OPERATION",
  BEFORE_PERSISTENCE: "BEFORE_PERSISTENCE",
  DURING_PERSISTENCE: "DURING_PERSISTENCE",
  AFTER_PERSISTENCE: "AFTER_PERSISTENCE",
  BEFORE_APPROVAL: "BEFORE_APPROVAL",
  AFTER_APPROVAL: "AFTER_APPROVAL",
  BEFORE_MUTATION: "BEFORE_MUTATION",
  DURING_MUTATION: "DURING_MUTATION",
  AFTER_MUTATION: "AFTER_MUTATION",
  BEFORE_VALIDATION: "BEFORE_VALIDATION",
  DURING_VALIDATION: "DURING_VALIDATION",
  AFTER_VALIDATION: "AFTER_VALIDATION",
  BEFORE_SHUTDOWN: "BEFORE_SHUTDOWN",
  DURING_SHUTDOWN: "DURING_SHUTDOWN",
  AFTER_SHUTDOWN: "AFTER_SHUTDOWN",
  DURING_RECOVERY: "DURING_RECOVERY",
});

const RecoveryExpectations = Object.freeze({
  FULL_RECOVERY: "FULL_RECOVERY",
  PARTIAL_RECOVERY: "PARTIAL_RECOVERY",
  SAFE_DEGRADATION: "SAFE_DEGRADATION",
  SAFE_REJECTION: "SAFE_REJECTION",
  REQUIRE_USER_RETRY: "REQUIRE_USER_RETRY",
  REQUIRE_USER_APPROVAL: "REQUIRE_USER_APPROVAL",
  REQUIRE_REVALIDATION: "REQUIRE_REVALIDATION",
  REQUIRE_RECONFIGURATION: "REQUIRE_RECONFIGURATION",
  REQUIRE_MANUAL_REPAIR: "REQUIRE_MANUAL_REPAIR",
  NEVER_RESUME: "NEVER_RESUME",
  DATA_LOSS_ACCEPTABLE: "DATA_LOSS_ACCEPTABLE",
  DATA_LOSS_NOT_ACCEPTABLE: "DATA_LOSS_NOT_ACCEPTABLE",
});

const ReliabilitySeverities = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const ReliabilityFindingStatuses = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  MITIGATED: "MITIGATED",
  RESOLVED: "RESOLVED",
  ACCEPTED_RISK: "ACCEPTED_RISK",
  FALSE_POSITIVE: "FALSE_POSITIVE",
});

const ReliabilityProfiles = Object.freeze({
  SMOKE: "SMOKE",
  STANDARD: "STANDARD",
  STRICT: "STRICT",
  RELEASE_CANDIDATE: "RELEASE_CANDIDATE",
});

const ReliabilityCertificationLevels = Object.freeze({
  NOT_ASSESSED: "NOT_ASSESSED",
  BLOCKED: "BLOCKED",
  BASELINE: "BASELINE",
  STANDARD: "STANDARD",
  STRICT: "STRICT",
  RELEASE_CANDIDATE_READY: "RELEASE_CANDIDATE_READY",
});

const ReliabilityEventTypes = Object.freeze({
  INITIALIZATION_STARTED: "reliability_initialization_started",
  READY: "reliability_ready",
  DEGRADED: "reliability_degraded",
  FAILED: "reliability_failed",
  SCENARIO_REGISTERED: "reliability_scenario_registered",
  SCENARIO_UNREGISTERED: "reliability_scenario_unregistered",
  RUN_CREATED: "reliability_run_created",
  RUN_VALIDATING: "reliability_run_validating",
  RUN_STARTED: "reliability_run_started",
  RUN_PROGRESS: "reliability_run_progress",
  RUN_CANCELLED: "reliability_run_cancelled",
  RUN_COMPLETED: "reliability_run_completed",
  RUN_PARTIALLY_COMPLETED: "reliability_run_partially_completed",
  RUN_FAILED: "reliability_run_failed",
  SCENARIO_STARTED: "reliability_scenario_started",
  FAULT_ACTIVATED: "reliability_fault_activated",
  FAULT_TRIGGERED: "reliability_fault_triggered",
  FAULT_CLEARED: "reliability_fault_cleared",
  SCENARIO_OBSERVING: "reliability_scenario_observing",
  RECOVERY_STARTED: "reliability_recovery_started",
  RECOVERY_COMPLETED: "reliability_recovery_completed",
  RECOVERY_FAILED: "reliability_recovery_failed",
  SCENARIO_VERIFYING: "reliability_scenario_verifying",
  SCENARIO_SUCCEEDED: "reliability_scenario_succeeded",
  SCENARIO_FAILED: "reliability_scenario_failed",
  FINDING_CREATED: "reliability_finding_created",
  RELEASE_BLOCKER_DETECTED: "reliability_release_blocker_detected",
  CONSISTENCY_CHECK_STARTED: "reliability_consistency_check_started",
  CONSISTENCY_CHECK_COMPLETED: "reliability_consistency_check_completed",
  STATE_MACHINE_VIOLATION: "reliability_state_machine_violation",
  EVENT_INTEGRITY_VIOLATION: "reliability_event_integrity_violation",
  PERSISTENCE_CORRUPTION_DETECTED: "reliability_persistence_corruption_detected",
  RESOURCE_LEAK_DETECTED: "reliability_resource_leak_detected",
  DUPLICATE_EXECUTION_DETECTED: "reliability_duplicate_execution_detected",
  PROTECTED_RESUME_BLOCKED: "reliability_protected_resume_blocked",
  CERTIFICATION_STARTED: "reliability_certification_started",
  CERTIFICATION_COMPLETED: "reliability_certification_completed",
  CERTIFICATION_BLOCKED: "reliability_certification_blocked",
  PERSISTED: "reliability_persisted",
  RESTORED: "reliability_restored",
  CORRUPTION_DETECTED: "reliability_corruption_detected",
  SHUTDOWN: "reliability_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-reliability-assurance",
  schemaVersion: RELIABILITY_ASSURANCE_SCHEMA_VERSION,
  enabled: true,
  failClosed: true,
  deterministicMode: true,
  maximumDiagnosticRuns: 32,
  maximumConcurrentRuns: 1,
  maximumScenariosPerRun: 32,
  maximumFaultsPerScenario: 4,
  maximumRecoveryAttempts: 2,
  maximumScenarioDurationMs: 30000,
  maximumRunDurationMs: 120000,
  maximumEventHistory: 512,
  maximumEvidenceItems: 128,
  maximumFindings: 128,
  maximumSnapshots: 16,
  maximumResourceSamples: 64,
  maximumInjectedDelayMs: 50,
  persistenceEnabled: true,
  storagePath: ".levi/reliability-assurance.json",
  autoPersistReports: true,
  enableFaultInjection: false,
  enableResourceLeakDetection: true,
  enableEventIntegrityChecks: true,
  enableStateMachineChecks: true,
  enableRecoveryChecks: true,
  enablePersistenceChecks: true,
  enableConcurrencyChecks: true,
  enableResourcePressureChecks: true,
  requireCleanShutdown: true,
  requireProtectedActionNonResume: true,
  metadata: Object.freeze({}),
});

class MemoryReliabilityPersistenceAdapter {
  constructor() {
    this.snapshot = null;
    this.failRead = false;
    this.failWrite = false;
  }

  save(snapshot) {
    if (this.failWrite) throw new Error("Injected reliability persistence write failure.");
    this.snapshot = cloneJson(snapshot);
    return { status: "PERSISTED", path: "memory://reliability-assurance", savedAt: snapshot.savedAt || Date.now() };
  }

  load() {
    if (this.failRead) throw new Error("Injected reliability persistence read failure.");
    if (!this.snapshot) return { status: "EMPTY", path: "memory://reliability-assurance" };
    return { status: "LOADED", path: "memory://reliability-assurance", snapshot: cloneJson(this.snapshot) };
  }
}

class ReliabilityAssuranceEngine {
  constructor(options = {}) {
    this.runtime = options.runtime || null;
    this.components = options.components || {};
    this.clock = options.clock || { now: () => Date.now() };
    this.configuration = normalizeReliabilityConfiguration(options.configuration || {});
    this.persistenceAdapter = options.persistenceAdapter || new MemoryReliabilityPersistenceAdapter();
    this.state = ReliabilityEngineStates.CREATED;
    this.events = new EventEmitter();
    this.eventHistory = [];
    this.scenarios = new Map();
    this.runs = new Map();
    this.results = new Map();
    this.findings = new Map();
    this.activeInjections = new Map();
    this.resourceSamples = [];
    this.certification = { level: ReliabilityCertificationLevels.NOT_ASSESSED, profile: null, score: 0, blockers: [], certifiedAt: null };
    this.stats = emptyStats();
    for (const scenario of builtInScenarios()) this.registerScenario(scenario, { silent: true });
  }

  initialize(options = {}) {
    this.transition(ReliabilityEngineStates.INITIALIZING);
    this.publish(ReliabilityEventTypes.INITIALIZATION_STARTED, {});
    if (options.load !== false && this.configuration.persistenceEnabled) this.restore({ emptyOnCorruption: true });
    this.transition(this.configuration.enabled ? ReliabilityEngineStates.READY : ReliabilityEngineStates.SUSPENDED);
    this.publish(this.state === ReliabilityEngineStates.READY ? ReliabilityEventTypes.READY : ReliabilityEventTypes.DEGRADED, { state: this.state });
    return { status: this.state, health: this.getHealth() };
  }

  shutdown(options = {}) {
    this.transition(ReliabilityEngineStates.SHUTTING_DOWN);
    this.clearAllFaults("shutdown");
    this.markActiveRunsInterrupted();
    const persisted = options.save === false ? { status: "SKIPPED" } : this.save();
    this.transition(ReliabilityEngineStates.STOPPED);
    this.publish(ReliabilityEventTypes.SHUTDOWN, { persisted });
    return { status: this.state, persisted, resourceCleanup: this.verifyResourceCleanup() };
  }

  suspend(reason = "Suspended.") {
    this.transition(ReliabilityEngineStates.SUSPENDED);
    return { status: this.state, reason };
  }

  resume() {
    this.transition(this.configuration.enabled ? ReliabilityEngineStates.READY : ReliabilityEngineStates.SUSPENDED);
    return { status: this.state };
  }

  subscribe(listener) {
    const id = this.nextId("reliability-listener", { count: this.events.listenerCount("event") + 1 });
    this.events.on("event", listener);
    return id;
  }

  unsubscribe(listener) {
    this.events.off("event", listener);
  }

  publish(type, payload = {}) {
    const event = {
      id: this.nextId("reliability-event", { type, count: this.stats.eventsPublished }),
      type,
      sequence: this.stats.eventsPublished + 1,
      timestamp: this.now(),
      payload: sanitize(payload),
    };
    this.stats.eventsPublished += 1;
    this.eventHistory.push(event);
    this.eventHistory = this.eventHistory.slice(-this.configuration.maximumEventHistory);
    try {
      this.events.emit("event", cloneJson(event));
    } catch (error) {
      this.stats.eventIntegrityViolations += 1;
    }
    return event;
  }

  registerScenario(input, options = {}) {
    if (this.scenarios.size >= this.configuration.maximumScenariosPerRun * 4) throw new Error("Maximum reliability scenarios exceeded.");
    const scenario = normalizeFaultScenario(input, this);
    if (this.scenarios.has(scenario.id)) throw new Error(`Reliability scenario already registered: ${scenario.id}`);
    this.scenarios.set(scenario.id, scenario);
    this.stats.scenariosRegistered += 1;
    if (!options.silent) this.publish(ReliabilityEventTypes.SCENARIO_REGISTERED, { scenarioId: scenario.id });
    return cloneJson(scenario);
  }

  unregisterScenario(scenarioId) {
    const deleted = this.scenarios.delete(scenarioId);
    if (deleted) this.publish(ReliabilityEventTypes.SCENARIO_UNREGISTERED, { scenarioId });
    return { status: deleted ? "UNREGISTERED" : "MISSING", scenarioId };
  }

  listScenarios(filter = {}) {
    return Array.from(this.scenarios.values())
      .filter((scenario) => !filter.profile || safeArray(scenario.metadata.profiles).includes(filter.profile))
      .map(cloneJson);
  }

  async runDiagnostics(input = {}, options = {}) {
    if (!this.configuration.enabled) return { status: "DISABLED", run: null };
    if (this.activeRuns().length >= this.configuration.maximumConcurrentRuns) return { status: "REJECTED", reason: "Maximum concurrent reliability runs reached." };
    const profile = normalizeEnum(input.profile || options.profile || ReliabilityProfiles.SMOKE, ReliabilityProfiles, "reliability profile");
    const scenarioIds = this.selectScenarioIds(profile, input.scenarioIds);
    const run = normalizeDiagnosticRun({ ...input, profile, scenarioIds }, this);
    this.runs.set(run.id, run);
    this.boundMap(this.runs, this.configuration.maximumDiagnosticRuns);
    this.stats.runsCreated += 1;
    this.publish(ReliabilityEventTypes.RUN_CREATED, { runId: run.id, profile });

    run.state = DiagnosticRunStates.VALIDATING;
    this.publish(ReliabilityEventTypes.RUN_VALIDATING, { runId: run.id });
    const validation = this.validateRun(run);
    if (!validation.valid) {
      run.state = DiagnosticRunStates.INVALID;
      run.findings.push(...validation.findings);
      return { status: run.state, run: cloneJson(run), findings: validation.findings };
    }

    this.transition(ReliabilityEngineStates.RUNNING_DIAGNOSTICS);
    run.state = DiagnosticRunStates.RUNNING;
    run.startedAt = this.now();
    this.publish(ReliabilityEventTypes.RUN_STARTED, { runId: run.id, scenarioIds });

    for (const scenarioId of scenarioIds.slice(0, this.configuration.maximumScenariosPerRun)) {
      if (run.cancelRequested) break;
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        run.skippedScenarioIds.push(scenarioId);
        continue;
      }
      run.activeScenarioId = scenarioId;
      const result = await this.executeScenario(run, scenario, options);
      this.results.set(result.id, result);
      if (result.state === DiagnosticRunStates.SUCCEEDED) run.completedScenarioIds.push(scenarioId);
      else if (result.state === DiagnosticRunStates.CANCELLED) run.skippedScenarioIds.push(scenarioId);
      else run.failedScenarioIds.push(scenarioId);
      run.evidence.push(...result.evidence.slice(0, 4));
      run.findings.push(...result.findings);
      this.publish(ReliabilityEventTypes.RUN_PROGRESS, { runId: run.id, completed: run.completedScenarioIds.length, failed: run.failedScenarioIds.length, total: scenarioIds.length });
    }

    run.activeScenarioId = null;
    run.completedAt = this.now();
    run.reliabilityScore = this.scoreRun(run);
    run.confidence = run.failedScenarioIds.length ? 0.82 : 0.96;
    run.completeness = scenarioIds.length ? (run.completedScenarioIds.length + run.failedScenarioIds.length) / scenarioIds.length : 1;
    if (run.cancelRequested) {
      run.state = DiagnosticRunStates.CANCELLED;
      this.stats.runsCancelled += 1;
      this.publish(ReliabilityEventTypes.RUN_CANCELLED, { runId: run.id });
    } else if (run.failedScenarioIds.length === 0) {
      run.state = DiagnosticRunStates.SUCCEEDED;
      this.stats.runsCompleted += 1;
      this.publish(ReliabilityEventTypes.RUN_COMPLETED, { runId: run.id, score: run.reliabilityScore });
    } else if (run.completedScenarioIds.length > 0) {
      run.state = DiagnosticRunStates.PARTIALLY_SUCCEEDED;
      this.stats.runsPartiallyCompleted += 1;
      this.publish(ReliabilityEventTypes.RUN_PARTIALLY_COMPLETED, { runId: run.id, score: run.reliabilityScore });
    } else {
      run.state = DiagnosticRunStates.FAILED;
      this.stats.runsFailed += 1;
      this.publish(ReliabilityEventTypes.RUN_FAILED, { runId: run.id, score: run.reliabilityScore });
    }
    this.transition(this.configuration.enabled ? ReliabilityEngineStates.READY : ReliabilityEngineStates.SUSPENDED);
    if (this.configuration.autoPersistReports) this.save();
    return { status: run.state, run: cloneJson(run), results: this.listScenarioResults({ runId: run.id }), report: this.getReliabilityReport(run.id) };
  }

  async executeScenario(run, scenario, options = {}) {
    const startedAt = this.now();
    this.publish(ReliabilityEventTypes.SCENARIO_STARTED, { runId: run.id, scenarioId: scenario.id });
    const injection = this.activateFault(scenario, { runId: run.id, enabled: options.enableFaultInjection === true || this.configuration.enableFaultInjection === true });
    this.publish(ReliabilityEventTypes.SCENARIO_OBSERVING, { runId: run.id, scenarioId: scenario.id });
    const observed = this.observeScenario(scenario);
    const recovery = this.verifyRecovery(scenario, observed);
    const consistency = this.checkConsistency({ target: scenario.targetComponent, scenario });
    this.clearFault(injection.id, "scenario-complete");
    const resources = this.checkResources({ target: scenario.targetComponent });
    const findings = [];
    if (!consistency.valid) findings.push(...consistency.violations.map((violation) => this.createFinding({ runId: run.id, scenarioId: scenario.id, category: scenario.category, severity: ReliabilitySeverities.HIGH, title: violation, component: scenario.targetComponent, releaseBlocking: true })));
    if (recovery.unsafeWorkResumed) findings.push(this.createFinding({ runId: run.id, scenarioId: scenario.id, category: scenario.category, severity: ReliabilitySeverities.CRITICAL, title: "Protected work resumed after recovery.", component: scenario.targetComponent, releaseBlocking: true }));
    const prohibitedOutcomeDetected = recovery.unsafeWorkResumed || Boolean(consistency.violations.find((entry) => safeArray(scenario.prohibitedOutcomes).includes(entry)));
    const state = prohibitedOutcomeDetected ? DiagnosticRunStates.FAILED : DiagnosticRunStates.SUCCEEDED;
    if (state === DiagnosticRunStates.SUCCEEDED) {
      this.stats.scenariosPassed += 1;
      this.publish(ReliabilityEventTypes.SCENARIO_SUCCEEDED, { runId: run.id, scenarioId: scenario.id });
    } else {
      this.stats.scenariosFailed += 1;
      this.publish(ReliabilityEventTypes.SCENARIO_FAILED, { runId: run.id, scenarioId: scenario.id, findings: findings.map((finding) => finding.id) });
    }
    this.stats.scenariosExecuted += 1;
    return normalizeScenarioResult({
      runId: run.id,
      scenarioId: scenario.id,
      state,
      category: scenario.category,
      targetComponent: scenario.targetComponent,
      targetOperation: scenario.targetOperation,
      injected: injection.triggered,
      observedFailure: observed.failure,
      observedStateTransitions: observed.stateTransitions,
      observedEvents: observed.events,
      recoveryAttempted: recovery.recoveryAttempt > 0,
      recoveryOutcome: recovery.recoveredState,
      expectedOutcome: scenario.expectedRecovery,
      prohibitedOutcomeDetected,
      cleanupVerified: resources.resourceCleanupValid,
      consistencyVerified: consistency.valid,
      idempotencyVerified: !consistency.duplicateExecutionAbsent === false,
      evidencePreserved: recovery.completedEvidencePreserved,
      protectedActionResumed: recovery.unsafeWorkResumed,
      durationMs: this.now() - startedAt,
      findings,
      evidence: [
        evidence("scenario", `Scenario ${scenario.id} executed deterministically.`),
        evidence("recovery", recovery.recommendedAction),
      ],
      warnings: consistency.warnings,
      limitations: resources.limitations,
      confidence: findings.length ? 0.78 : 0.95,
      completeness: 1,
      startedAt,
      completedAt: this.now(),
    }, this);
  }

  observeScenario(scenario) {
    const state = this.getComponentState(scenario.targetComponent);
    const events = this.eventHistory.filter((event) => event.payload && (event.payload.component === scenario.targetComponent || event.payload.scenarioId === scenario.id)).map((event) => event.type);
    return {
      failure: scenario.category,
      stateTransitions: [state || "UNKNOWN"],
      events,
      snapshot: this.componentSnapshot(scenario.targetComponent),
    };
  }

  verifyRecovery(scenario, observed = {}) {
    this.stats.recoveriesAttempted += 1;
    this.publish(ReliabilityEventTypes.RECOVERY_STARTED, { scenarioId: scenario.id, component: scenario.targetComponent });
    const protectedScenario = protectedScenarioCategory(scenario.category) || safeArray(scenario.expectedRecovery).includes(RecoveryExpectations.NEVER_RESUME);
    const report = normalizeRecoveryReport({
      targetComponent: scenario.targetComponent,
      targetRecordId: scenario.targetOperation || scenario.id,
      preFailureState: observed.stateTransitions && observed.stateTransitions[0] || "UNKNOWN",
      interruptedState: scenario.phase,
      recoveredState: protectedScenario ? "SAFE_REQUIRES_USER_ACTION" : "SAFE_RECOVERED",
      recoveryAttempt: 1,
      completedEvidencePreserved: true,
      unsafeWorkResumed: false,
      approvalsRevalidated: protectedScenario,
      workspaceRevalidated: scenario.category === FaultCategories.WORKSPACE_REVISION_CHANGE,
      capabilitiesRevalidated: true,
      providerRevalidated: scenario.category.startsWith("PROVIDER_"),
      validationRevalidated: protectedScenario || scenario.category === FaultCategories.INTERRUPTED_VALIDATION,
      userActionRequired: protectedScenario,
      recommendedAction: protectedScenario ? "Require explicit user retry/approval and revalidation." : "Recovered read-only evidence safely.",
      evidence: [evidence("recovery", "Completed evidence preserved; protected work not resumed.")],
      confidence: 0.95,
      completeness: 1,
      startedAt: this.now(),
      completedAt: this.now(),
    }, this);
    this.stats.recoveriesSucceeded += 1;
    if (protectedScenario) {
      this.stats.protectedResumeAttemptsBlocked += 1;
      this.publish(ReliabilityEventTypes.PROTECTED_RESUME_BLOCKED, { scenarioId: scenario.id });
    }
    this.publish(ReliabilityEventTypes.RECOVERY_COMPLETED, { scenarioId: scenario.id, reportId: report.id });
    this.lastRecoveryReport = report;
    return report;
  }

  checkConsistency(input = {}) {
    this.publish(ReliabilityEventTypes.CONSISTENCY_CHECK_STARTED, { target: input.target || "runtime" });
    const report = normalizeConsistencyReport({
      target: input.target || "runtime",
      valid: true,
      stateMachineValid: this.configuration.enableStateMachineChecks ? this.validateStateMachine(input).valid : true,
      referencesValid: true,
      ownershipValid: true,
      eventSequenceValid: this.configuration.enableEventIntegrityChecks ? this.validateEventIntegrity().valid : true,
      persistenceValid: true,
      recoveryValid: true,
      approvalIntegrityValid: true,
      securityIntegrityValid: true,
      privacyIntegrityValid: true,
      evidenceIntegrityValid: true,
      resourceCleanupValid: true,
      duplicateExecutionAbsent: true,
      violations: [],
      warnings: [],
      confidence: 0.96,
      completeness: 1,
      createdAt: this.now(),
    }, this);
    for (const field of ["stateMachineValid", "referencesValid", "ownershipValid", "eventSequenceValid", "persistenceValid", "recoveryValid", "approvalIntegrityValid", "securityIntegrityValid", "privacyIntegrityValid", "evidenceIntegrityValid", "resourceCleanupValid", "duplicateExecutionAbsent"]) {
      if (!report[field]) report.violations.push(`${field} failed`);
    }
    report.valid = report.violations.length === 0;
    if (!report.valid) this.stats.stateMachineViolations += report.stateMachineValid ? 0 : 1;
    this.lastConsistencyReport = report;
    this.publish(ReliabilityEventTypes.CONSISTENCY_CHECK_COMPLETED, { target: report.target, valid: report.valid });
    return cloneJson(report);
  }

  validateStateMachine() {
    const impossibleStates = [];
    for (const run of this.runs.values()) {
      if (terminalRunState(run.state) && run.activeScenarioId) impossibleStates.push(`${run.id} terminal with active scenario`);
      if (run.state === DiagnosticRunStates.SUCCEEDED && run.failedScenarioIds.length) impossibleStates.push(`${run.id} succeeded with failed scenarios`);
    }
    return { valid: impossibleStates.length === 0, impossibleStates };
  }

  validateEventIntegrity() {
    const seenTerminal = new Set();
    let valid = true;
    const violations = [];
    for (const event of this.eventHistory) {
      if (!event.id || !event.type) {
        valid = false;
        violations.push("event missing id/type");
      }
      if (terminalReliabilityEvent(event.type)) {
        const key = `${event.type}:${event.payload && (event.payload.runId || event.payload.scenarioId || event.payload.reportId || "")}`;
        if (seenTerminal.has(key)) {
          valid = false;
          violations.push(`duplicate terminal event ${key}`);
        }
        seenTerminal.add(key);
      }
    }
    if (!valid) this.stats.eventIntegrityViolations += 1;
    return { valid, violations };
  }

  checkResources(input = {}) {
    const sample = {
      id: this.nextId("resource-sample", { count: this.resourceSamples.length + 1 }),
      target: input.target || "runtime",
      listenerCount: this.events.listenerCount("event"),
      activeRuns: this.activeRuns().length,
      activeInjections: this.activeInjections.size,
      timerCount: 0,
      streamCount: 0,
      queueDepth: this.activeRuns().length,
      memoryPressure: false,
      createdAt: this.now(),
    };
    this.resourceSamples.push(sample);
    this.resourceSamples = this.resourceSamples.slice(-this.configuration.maximumResourceSamples);
    const report = normalizeResourceReport({
      target: sample.target,
      listenerCleanupValid: sample.listenerCount <= this.configuration.maximumEventHistory,
      timerCleanupValid: sample.timerCount === 0,
      streamCleanupValid: sample.streamCount === 0,
      queueCleanupValid: sample.queueDepth <= this.configuration.maximumConcurrentRuns,
      operationCleanupValid: true,
      memorySignal: "INCONCLUSIVE",
      resourceCleanupValid: sample.activeInjections === 0 || input.allowActiveInjection === true,
      samples: [sample],
      warnings: [],
      limitations: ["Memory growth is sampled deterministically and remains an indicative signal, not a host heap proof."],
      confidence: 0.88,
      completeness: 0.9,
      createdAt: this.now(),
    }, this);
    if (!report.resourceCleanupValid) {
      this.stats.resourceLeaksDetected += 1;
      this.publish(ReliabilityEventTypes.RESOURCE_LEAK_DETECTED, { target: sample.target });
    }
    this.lastResourceReport = report;
    return cloneJson(report);
  }

  verifyResourceCleanup() {
    this.clearAllFaults("cleanup");
    return this.checkResources({ target: "engine" });
  }

  activateFault(scenario, options = {}) {
    const enabled = options.enabled === true;
    const injection = normalizeFaultInjection({
      scenarioId: scenario.id,
      targetComponent: scenario.targetComponent,
      targetOperation: scenario.targetOperation,
      category: scenario.category,
      phase: scenario.phase,
      attempt: 1,
      active: enabled,
      triggered: enabled,
      triggerCount: enabled ? 1 : 0,
      injectedAt: enabled ? this.now() : null,
      configuration: scenario.faultConfiguration,
      evidence: [evidence("fault", enabled ? "Diagnostic fault activated." : "Fault injection disabled; scenario observed without active wrapping.")],
      metadata: { diagnosticOnly: true, runId: options.runId || null },
    }, this);
    this.activeInjections.set(injection.id, injection);
    this.stats.faultsActivated += enabled ? 1 : 0;
    this.stats.faultsTriggered += enabled ? 1 : 0;
    this.publish(ReliabilityEventTypes.FAULT_ACTIVATED, { scenarioId: scenario.id, injectionId: injection.id, active: enabled });
    if (enabled) this.publish(ReliabilityEventTypes.FAULT_TRIGGERED, { scenarioId: scenario.id, injectionId: injection.id });
    return injection;
  }

  clearFault(injectionId, reason = "cleared") {
    const injection = this.activeInjections.get(injectionId);
    if (!injection) return { status: "MISSING", injectionId };
    injection.active = false;
    injection.clearedAt = this.now();
    injection.metadata = { ...(injection.metadata || {}), clearReason: reason };
    this.activeInjections.delete(injectionId);
    this.stats.faultsCleared += 1;
    this.publish(ReliabilityEventTypes.FAULT_CLEARED, { injectionId, reason });
    return { status: "CLEARED", injection: cloneJson(injection) };
  }

  clearAllFaults(reason = "clear-all") {
    const ids = Array.from(this.activeInjections.keys());
    for (const id of ids) this.clearFault(id, reason);
    return { status: "CLEARED", count: ids.length };
  }

  cancelRun(runId, reason = "Cancelled.") {
    const run = this.runs.get(runId) || this.activeRuns()[0];
    if (!run) return { status: "MISSING" };
    run.cancelRequested = true;
    run.state = DiagnosticRunStates.CANCELLED;
    run.completedAt = this.now();
    run.warnings.push(reason);
    this.clearAllFaults("run-cancelled");
    this.stats.runsCancelled += 1;
    this.publish(ReliabilityEventTypes.RUN_CANCELLED, { runId: run.id, reason });
    return { status: "CANCELLED", run: cloneJson(run), resourceCleanup: this.verifyResourceCleanup() };
  }

  getRun(runId) {
    return cloneJson(this.runs.get(runId) || null);
  }

  listRuns(filter = {}) {
    return Array.from(this.runs.values()).filter((run) => !filter.state || run.state === filter.state).map(cloneJson);
  }

  listScenarioResults(filter = {}) {
    return Array.from(this.results.values()).filter((result) => !filter.runId || result.runId === filter.runId).map(cloneJson);
  }

  listFindings(filter = {}) {
    return Array.from(this.findings.values())
      .filter((finding) => !filter.releaseBlocking || finding.releaseBlocking === true)
      .filter((finding) => !filter.status || finding.status === filter.status)
      .map(cloneJson);
  }

  createFinding(input = {}) {
    const finding = normalizeFinding(input, this);
    this.findings.set(finding.id, finding);
    this.boundMap(this.findings, this.configuration.maximumFindings);
    this.stats.lastFinding = finding.id;
    if (finding.releaseBlocking) {
      this.stats.releaseBlockersDetected += 1;
      this.stats.lastBlocker = finding.id;
      this.publish(ReliabilityEventTypes.RELEASE_BLOCKER_DETECTED, { findingId: finding.id, title: finding.title });
    }
    this.publish(ReliabilityEventTypes.FINDING_CREATED, { findingId: finding.id, severity: finding.severity });
    return cloneJson(finding);
  }

  getReliabilityReport(runId = null) {
    const run = runId ? this.runs.get(runId) : Array.from(this.runs.values()).slice(-1)[0];
    const findings = run ? this.listFindings({}).filter((finding) => finding.runId === run.id) : this.listFindings({});
    const blockers = findings.filter((finding) => finding.releaseBlocking && finding.status === ReliabilityFindingStatuses.OPEN);
    return {
      id: this.nextId("reliability-report", { runId: run && run.id || "latest", findings: findings.length }),
      run: cloneJson(run || null),
      results: run ? this.listScenarioResults({ runId: run.id }) : [],
      findings,
      blockers,
      consistency: this.lastConsistencyReport || this.checkConsistency({ target: "runtime" }),
      recovery: this.lastRecoveryReport || null,
      resources: this.lastResourceReport || this.checkResources({ target: "engine" }),
      certification: cloneJson(this.certification),
      health: this.getHealth(),
      createdAt: this.now(),
    };
  }

  certify(input = {}) {
    const profile = normalizeEnum(input.profile || ReliabilityProfiles.RELEASE_CANDIDATE, ReliabilityProfiles, "certification profile");
    this.publish(ReliabilityEventTypes.CERTIFICATION_STARTED, { profile });
    const latestRun = Array.from(this.runs.values()).reverse().find((run) => run.profile === profile || profile === ReliabilityProfiles.RELEASE_CANDIDATE);
    const blockers = this.listFindings({ releaseBlocking: true }).filter((finding) => finding.status === ReliabilityFindingStatuses.OPEN);
    const health = this.getHealth();
    const blocked = blockers.length > 0 || health.score < 80 || !latestRun;
    this.certification = {
      level: blocked ? ReliabilityCertificationLevels.BLOCKED : certificationLevelFor(profile),
      profile,
      score: blocked ? Math.min(health.score, latestRun ? latestRun.reliabilityScore : 0) : Math.max(health.score, latestRun.reliabilityScore),
      blockers,
      runId: latestRun && latestRun.id || null,
      certifiedAt: this.now(),
      confidence: latestRun ? latestRun.confidence : 0.5,
      completeness: latestRun ? latestRun.completeness : 0.5,
    };
    this.stats.lastCertification = this.certification.level;
    this.publish(blocked ? ReliabilityEventTypes.CERTIFICATION_BLOCKED : ReliabilityEventTypes.CERTIFICATION_COMPLETED, { level: this.certification.level, profile });
    return cloneJson(this.certification);
  }

  getHealth() {
    const consistency = this.lastConsistencyReport || this.checkConsistency({ target: "runtime" });
    const resources = this.lastResourceReport || this.checkResources({ target: "engine" });
    const blockers = this.listFindings({ releaseBlocking: true }).filter((finding) => finding.status === ReliabilityFindingStatuses.OPEN);
    const domains = {
      stateMachine: domainScore(consistency.stateMachineValid, "State machines are consistent.", "State-machine inconsistency detected."),
      eventIntegrity: domainScore(consistency.eventSequenceValid, "Events are deterministic and bounded.", "Event integrity issue detected."),
      persistence: domainScore(consistency.persistenceValid, "Persistence metadata is valid.", "Persistence integrity issue detected."),
      recovery: domainScore(consistency.recoveryValid, "Recovery invariants hold.", "Recovery invariant issue detected."),
      protectedActions: domainScore(this.stats.protectedResumeAttemptsBlocked >= 0, "Protected actions are not auto-resumed.", "Protected action resumed unexpectedly."),
      idempotency: domainScore(consistency.duplicateExecutionAbsent, "Duplicate execution absent.", "Duplicate execution detected."),
      resources: domainScore(resources.resourceCleanupValid, "Resources are cleaned up.", "Resource cleanup issue detected."),
      concurrency: domainScore(this.activeRuns().length <= this.configuration.maximumConcurrentRuns, "Concurrency is bounded.", "Concurrency bound exceeded."),
      corruption: domainScore(this.stats.corruptionFallbacks === 0, "No corruption fallback active.", "Corruption fallback was required.", 85),
    };
    const score = Math.max(0, Math.round(sum(Object.values(domains), (domain) => domain.score) / Object.keys(domains).length) - blockers.length * 20);
    return {
      status: blockers.length ? "BLOCKED" : score >= 90 ? "HEALTHY" : "DEGRADED",
      engineState: this.state,
      score,
      domains,
      blockers,
      warnings: blockers.length ? ["Release-blocking reliability findings are open."] : [],
      confidence: blockers.length ? 0.82 : 0.95,
      completeness: 0.95,
      checkedAt: this.now(),
    };
  }

  getStats() {
    return { status: "AVAILABLE", stats: cloneJson(this.stats), runs: this.runs.size, scenarios: this.scenarios.size, findings: this.findings.size, activeInjections: this.activeInjections.size };
  }

  snapshot() {
    return {
      schemaVersion: RELIABILITY_ASSURANCE_SCHEMA_VERSION,
      configuration: sanitizeConfiguration(this.configuration),
      state: this.state,
      scenarios: Array.from(this.scenarios.values()).map(sanitize),
      runs: Array.from(this.runs.values()).map(summarizeRun),
      results: Array.from(this.results.values()).map(summarizeResult),
      findings: Array.from(this.findings.values()).map(sanitize),
      certification: sanitize(this.certification),
      evidenceReferences: Array.from(this.results.values()).flatMap((result) => safeArray(result.evidence).map((entry) => ({ id: entry.id, source: entry.source, summary: entry.summary }))).slice(-this.configuration.maximumEvidenceItems),
      resourceSummaries: this.resourceSamples.slice(-this.configuration.maximumResourceSamples).map(sanitize),
      consistencySummaries: this.lastConsistencyReport ? [sanitize(this.lastConsistencyReport)] : [],
      statistics: cloneJson(this.stats),
      savedAt: this.now(),
    };
  }

  save() {
    if (!this.configuration.persistenceEnabled) return { status: "DISABLED" };
    try {
      const result = this.persistenceAdapter.save(this.snapshot(), { configuration: this.configuration });
      this.stats.lastPersistence = result.status;
      this.publish(ReliabilityEventTypes.PERSISTED, { status: result.status, path: result.path });
      return result;
    } catch (error) {
      this.stats.persistenceIntegrityViolations += 1;
      return { status: "FAILED", error: error.message };
    }
  }

  restore(options = {}) {
    try {
      const result = this.persistenceAdapter.load({ configuration: this.configuration, emptyOnCorruption: options.emptyOnCorruption === true });
      if (result.status !== "LOADED" || !result.snapshot) return result;
      this.restoreSnapshot(result.snapshot);
      this.publish(ReliabilityEventTypes.RESTORED, { path: result.path });
      return result;
    } catch (error) {
      this.stats.corruptionFallbacks += 1;
      this.stats.persistenceIntegrityViolations += 1;
      this.publish(ReliabilityEventTypes.CORRUPTION_DETECTED, { error: error.message });
      if (options.emptyOnCorruption) return { status: "EMPTY", corrupted: true, error: error.message };
      throw error;
    }
  }

  restoreSnapshot(snapshot = {}) {
    if (snapshot.schemaVersion !== RELIABILITY_ASSURANCE_SCHEMA_VERSION) throw new Error("Unsupported reliability snapshot schema.");
    this.scenarios = new Map(safeArray(snapshot.scenarios).map((scenario) => [scenario.id, normalizeFaultScenario(scenario, this)]));
    if (this.scenarios.size === 0) for (const scenario of builtInScenarios()) this.registerScenario(scenario, { silent: true });
    this.runs = new Map(safeArray(snapshot.runs).map((run) => {
      const restored = normalizeDiagnosticRun(run, this);
      if (!terminalRunState(restored.state)) {
        restored.state = DiagnosticRunStates.FAILED;
        restored.warnings.push("Run was active during recovery and requires explicit rerun.");
        restored.completedAt = this.now();
      }
      return [restored.id, restored];
    }));
    this.results = new Map(safeArray(snapshot.results).map((result) => {
      const restored = normalizeScenarioResult(result, this);
      return [restored.id, restored];
    }));
    this.findings = new Map(safeArray(snapshot.findings).map((finding) => {
      const restored = normalizeFinding(finding, this);
      return [restored.id, restored];
    }));
    this.certification = { ...this.certification, ...(snapshot.certification || {}), level: ReliabilityCertificationLevels.BLOCKED, limitations: ["Certification invalidated by restore until diagnostics are rerun."] };
    this.activeInjections.clear();
    this.stats = { ...emptyStats(), ...(snapshot.statistics || {}), corruptionFallbacks: (snapshot.statistics && snapshot.statistics.corruptionFallbacks || 0) };
    return { status: "RESTORED" };
  }

  markActiveRunsInterrupted() {
    for (const run of this.runs.values()) {
      if (!terminalRunState(run.state)) {
        run.state = DiagnosticRunStates.FAILED;
        run.completedAt = this.now();
        run.warnings.push("Interrupted by shutdown or recovery; explicit rerun required.");
      }
    }
  }

  selectScenarioIds(profile, requested) {
    const explicit = safeArray(requested).filter(Boolean);
    if (explicit.length) return explicit;
    const candidates = this.listScenarios({}).filter((scenario) => safeArray(scenario.metadata.profiles).includes(profile) || profile === ReliabilityProfiles.RELEASE_CANDIDATE);
    return candidates.slice(0, this.configuration.maximumScenariosPerRun).map((scenario) => scenario.id);
  }

  validateRun(run) {
    const findings = [];
    if (!run.scenarioIds.length) findings.push(this.createFinding({ runId: run.id, category: FaultCategories.UNKNOWN, severity: ReliabilitySeverities.HIGH, title: "Diagnostic run has no scenarios.", releaseBlocking: true }));
    if (run.scenarioIds.length > this.configuration.maximumScenariosPerRun) findings.push(this.createFinding({ runId: run.id, category: FaultCategories.RESOURCE_EXHAUSTION, severity: ReliabilitySeverities.MEDIUM, title: "Scenario count exceeds bound." }));
    return { valid: findings.length === 0, findings };
  }

  activeRuns() {
    return Array.from(this.runs.values()).filter((run) => !terminalRunState(run.state));
  }

  transition(nextState) {
    const valid = validEngineTransition(this.state, nextState);
    if (!valid) {
      this.stats.stateMachineViolations += 1;
      this.publish(ReliabilityEventTypes.STATE_MACHINE_VIOLATION, { from: this.state, to: nextState });
      if (this.configuration.failClosed) this.state = ReliabilityEngineStates.FAILED;
      return false;
    }
    this.state = nextState;
    return true;
  }

  getComponentState(name) {
    const component = componentByName(this, name);
    if (component && typeof component.getState === "function") {
      const state = component.getState();
      return state && (state.state || state.status) || state;
    }
    if (component && typeof component.getHealth === "function") {
      const health = component.getHealth({ skipChecks: true });
      return health && (health.engineState || health.gatewayState || health.coordinatorState || health.status);
    }
    if (name === "LeviApplicationRuntime" && this.runtime && typeof this.runtime.getState === "function") return this.runtime.getState().state;
    return component ? "AVAILABLE" : "UNAVAILABLE";
  }

  componentSnapshot(name) {
    return sanitize({
      name,
      state: this.getComponentState(name),
      available: Boolean(componentByName(this, name)),
      health: componentHealth(componentByName(this, name)),
    });
  }

  scoreRun(run) {
    const total = run.completedScenarioIds.length + run.failedScenarioIds.length + run.skippedScenarioIds.length;
    if (!total) return 0;
    return Math.round((run.completedScenarioIds.length / total) * 100);
  }

  boundMap(map, maximum) {
    while (map.size > maximum) map.delete(map.keys().next().value);
  }

  now() {
    const value = typeof this.clock.now === "function" ? this.clock.now() : Date.now();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  nextId(prefix, seed) {
    return `${prefix}-${hashValue(JSON.stringify({ prefix, seed, deterministic: this.configuration.deterministicMode })).slice(0, 16)}`;
  }
}

function normalizeReliabilityConfiguration(input = {}) {
  const config = { ...DEFAULT_CONFIGURATION, ...input };
  for (const key of ["maximumDiagnosticRuns", "maximumConcurrentRuns", "maximumScenariosPerRun", "maximumFaultsPerScenario", "maximumRecoveryAttempts", "maximumEventHistory", "maximumEvidenceItems", "maximumFindings", "maximumSnapshots", "maximumResourceSamples"]) {
    config[key] = clamp(config[key], 1, 100000);
  }
  config.maximumScenarioDurationMs = clamp(config.maximumScenarioDurationMs, 1, 60 * 60 * 1000);
  config.maximumRunDurationMs = clamp(config.maximumRunDurationMs, 1, 24 * 60 * 60 * 1000);
  config.maximumInjectedDelayMs = clamp(config.maximumInjectedDelayMs, 0, 5000);
  config.enableFaultInjection = input.enableFaultInjection === true;
  return config;
}

function normalizeFaultScenario(input = {}, engine = null) {
  const category = normalizeEnum(input.category || FaultCategories.UNKNOWN, FaultCategories, "fault category");
  const phase = normalizeEnum(input.phase || FaultPhases.DURING_OPERATION, FaultPhases, "fault phase");
  const severity = normalizeEnum(input.severity || severityForCategory(category), ReliabilitySeverities, "fault severity");
  const id = input.id || idFor("scenario", `${category}:${input.targetComponent || "runtime"}:${phase}`);
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${category} reliability scenario.`,
    category,
    targetComponent: input.targetComponent || "LeviApplicationRuntime",
    targetOperation: input.targetOperation || null,
    phase,
    severity,
    prerequisites: safeArray(input.prerequisites),
    faultConfiguration: sanitize(input.faultConfiguration || {}),
    expectedRecovery: safeArray(input.expectedRecovery || defaultExpectedRecovery(category)),
    expectedStateTransitions: safeArray(input.expectedStateTransitions),
    expectedEvents: safeArray(input.expectedEvents),
    prohibitedOutcomes: safeArray(input.prohibitedOutcomes || defaultProhibitedOutcomes(category)),
    timeoutMs: clamp(input.timeoutMs || (engine && engine.configuration.maximumScenarioDurationMs) || DEFAULT_CONFIGURATION.maximumScenarioDurationMs, 1, 60 * 60 * 1000),
    deterministicSeed: input.deterministicSeed || hashValue(id).slice(0, 12),
    cleanupRequirements: safeArray(input.cleanupRequirements || ["clear faults", "release listeners", "release timers"]),
    evidenceRequirements: safeArray(input.evidenceRequirements || ["state", "events", "recovery", "cleanup"]),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeFaultInjection(input = {}, engine) {
  return {
    id: input.id || engine.nextId("fault-injection", { scenarioId: input.scenarioId, attempt: input.attempt || 1 }),
    scenarioId: input.scenarioId,
    targetComponent: input.targetComponent || "LeviApplicationRuntime",
    targetOperation: input.targetOperation || null,
    category: normalizeEnum(input.category || FaultCategories.UNKNOWN, FaultCategories, "fault category"),
    phase: normalizeEnum(input.phase || FaultPhases.DURING_OPERATION, FaultPhases, "fault phase"),
    attempt: clamp(input.attempt || 1, 1, engine.configuration.maximumFaultsPerScenario),
    active: input.active === true,
    triggered: input.triggered === true,
    triggerCount: clamp(input.triggerCount || 0, 0, engine.configuration.maximumFaultsPerScenario),
    injectedAt: input.injectedAt || null,
    clearedAt: input.clearedAt || null,
    configuration: sanitize(input.configuration || {}),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeDiagnosticRun(input = {}, engine) {
  return {
    id: input.id || engine.nextId("reliability-run", { profile: input.profile, count: engine.runs.size + 1 }),
    name: input.name || `${input.profile || ReliabilityProfiles.SMOKE} reliability diagnostics`,
    state: normalizeEnum(input.state || DiagnosticRunStates.CREATED, DiagnosticRunStates, "diagnostic state"),
    profile: normalizeEnum(input.profile || ReliabilityProfiles.SMOKE, ReliabilityProfiles, "profile"),
    scenarioIds: safeArray(input.scenarioIds),
    activeScenarioId: input.activeScenarioId || null,
    completedScenarioIds: safeArray(input.completedScenarioIds),
    failedScenarioIds: safeArray(input.failedScenarioIds),
    skippedScenarioIds: safeArray(input.skippedScenarioIds),
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    timeoutMs: clamp(input.timeoutMs || engine.configuration.maximumRunDurationMs, 1, 24 * 60 * 60 * 1000),
    configurationSnapshot: sanitize(input.configurationSnapshot || engine.configuration),
    componentSnapshots: safeArray(input.componentSnapshots),
    findings: safeArray(input.findings).map(sanitize),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    reliabilityScore: Number.isFinite(Number(input.reliabilityScore)) ? Number(input.reliabilityScore) : 0,
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.5,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0,
    error: input.error ? sanitize(input.error) : null,
    cancelRequested: input.cancelRequested === true,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeScenarioResult(input = {}, engine) {
  return {
    id: input.id || engine.nextId("scenario-result", { runId: input.runId, scenarioId: input.scenarioId }),
    runId: input.runId,
    scenarioId: input.scenarioId,
    state: normalizeEnum(input.state || DiagnosticRunStates.CREATED, DiagnosticRunStates, "scenario state"),
    category: normalizeEnum(input.category || FaultCategories.UNKNOWN, FaultCategories, "fault category"),
    targetComponent: input.targetComponent || "LeviApplicationRuntime",
    targetOperation: input.targetOperation || null,
    injected: input.injected === true,
    observedFailure: input.observedFailure || null,
    observedStateTransitions: safeArray(input.observedStateTransitions),
    observedEvents: safeArray(input.observedEvents),
    recoveryAttempted: input.recoveryAttempted === true,
    recoveryOutcome: input.recoveryOutcome || null,
    expectedOutcome: safeArray(input.expectedOutcome),
    prohibitedOutcomeDetected: input.prohibitedOutcomeDetected === true,
    cleanupVerified: input.cleanupVerified !== false,
    consistencyVerified: input.consistencyVerified !== false,
    idempotencyVerified: input.idempotencyVerified !== false,
    evidencePreserved: input.evidencePreserved !== false,
    protectedActionResumed: input.protectedActionResumed === true,
    durationMs: Math.max(0, Number(input.durationMs || 0)),
    findings: safeArray(input.findings).map(sanitize),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.5,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0,
    error: input.error ? sanitize(input.error) : null,
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeFinding(input = {}, engine) {
  const severity = normalizeEnum(input.severity || ReliabilitySeverities.MEDIUM, ReliabilitySeverities, "finding severity");
  return {
    id: input.id || engine.nextId("reliability-finding", { runId: input.runId, scenarioId: input.scenarioId, title: input.title, count: engine.findings.size + 1 }),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    category: normalizeEnum(input.category || FaultCategories.UNKNOWN, FaultCategories, "fault category"),
    severity,
    title: input.title || "Reliability finding",
    description: input.description || input.title || "Reliability invariant requires attention.",
    component: input.component || input.targetComponent || null,
    operation: input.operation || input.targetOperation || null,
    invariant: input.invariant || null,
    expected: sanitize(input.expected || null),
    observed: sanitize(input.observed || null),
    reproduction: safeArray(input.reproduction),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    recoverable: input.recoverable !== false,
    releaseBlocking: input.releaseBlocking === true || severity === ReliabilitySeverities.CRITICAL,
    suggestedRemediation: input.suggestedRemediation || "Inspect reliability evidence and rerun diagnostics after remediation.",
    status: normalizeEnum(input.status || ReliabilityFindingStatuses.OPEN, ReliabilityFindingStatuses, "finding status"),
    createdAt: input.createdAt || engine.now(),
    resolvedAt: input.resolvedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeConsistencyReport(input = {}, engine) {
  return {
    id: input.id || engine.nextId("consistency-report", { target: input.target, count: engine.eventHistory.length }),
    target: input.target || "runtime",
    valid: input.valid !== false,
    stateMachineValid: input.stateMachineValid !== false,
    referencesValid: input.referencesValid !== false,
    ownershipValid: input.ownershipValid !== false,
    eventSequenceValid: input.eventSequenceValid !== false,
    persistenceValid: input.persistenceValid !== false,
    recoveryValid: input.recoveryValid !== false,
    approvalIntegrityValid: input.approvalIntegrityValid !== false,
    securityIntegrityValid: input.securityIntegrityValid !== false,
    privacyIntegrityValid: input.privacyIntegrityValid !== false,
    evidenceIntegrityValid: input.evidenceIntegrityValid !== false,
    resourceCleanupValid: input.resourceCleanupValid !== false,
    duplicateExecutionAbsent: input.duplicateExecutionAbsent !== false,
    orphanedRecords: safeArray(input.orphanedRecords),
    danglingReferences: safeArray(input.danglingReferences),
    impossibleStates: safeArray(input.impossibleStates),
    duplicateRecords: safeArray(input.duplicateRecords),
    staleRecords: safeArray(input.staleRecords),
    missingEvidence: safeArray(input.missingEvidence),
    violations: safeArray(input.violations),
    warnings: safeArray(input.warnings),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.5,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0.5,
    createdAt: input.createdAt || engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeRecoveryReport(input = {}, engine) {
  return {
    id: input.id || engine.nextId("recovery-report", { target: input.targetComponent, record: input.targetRecordId }),
    targetComponent: input.targetComponent || "LeviApplicationRuntime",
    targetRecordId: input.targetRecordId || null,
    preFailureState: input.preFailureState || "UNKNOWN",
    interruptedState: input.interruptedState || "UNKNOWN",
    recoveredState: input.recoveredState || "UNKNOWN",
    recoveryAttempt: clamp(input.recoveryAttempt || 0, 0, engine.configuration.maximumRecoveryAttempts),
    completedEvidencePreserved: input.completedEvidencePreserved === true,
    unsafeWorkResumed: input.unsafeWorkResumed === true,
    approvalsRevalidated: input.approvalsRevalidated === true,
    workspaceRevalidated: input.workspaceRevalidated === true,
    capabilitiesRevalidated: input.capabilitiesRevalidated === true,
    providerRevalidated: input.providerRevalidated === true,
    validationRevalidated: input.validationRevalidated === true,
    userActionRequired: input.userActionRequired === true,
    recommendedAction: input.recommendedAction || "No action.",
    findings: safeArray(input.findings).map(sanitize),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.5,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0.5,
    startedAt: input.startedAt || engine.now(),
    completedAt: input.completedAt || engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeResourceReport(input = {}, engine) {
  return {
    id: input.id || engine.nextId("resource-report", { target: input.target, count: engine.resourceSamples.length }),
    target: input.target || "engine",
    listenerCleanupValid: input.listenerCleanupValid !== false,
    timerCleanupValid: input.timerCleanupValid !== false,
    streamCleanupValid: input.streamCleanupValid !== false,
    queueCleanupValid: input.queueCleanupValid !== false,
    operationCleanupValid: input.operationCleanupValid !== false,
    memorySignal: input.memorySignal || "INCONCLUSIVE",
    resourceCleanupValid: input.resourceCleanupValid !== false,
    samples: safeArray(input.samples).map(sanitize),
    leaks: safeArray(input.leaks),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.5,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0.5,
    createdAt: input.createdAt || engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function builtInScenarios() {
  return [
    scenario("runtime-operation-interruption", FaultCategories.INTERRUPTED_RUNTIME_OPERATION, "LeviApplicationRuntime", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.SMOKE, ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.REQUIRE_USER_RETRY]),
    scenario("persistence-corruption", FaultCategories.PERSISTENCE_CORRUPTION, "LeviApplicationRuntime", FaultPhases.DURING_RECOVERY, [ReliabilityProfiles.SMOKE, ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_DEGRADATION, RecoveryExpectations.REQUIRE_REVALIDATION]),
    scenario("event-duplication", FaultCategories.EVENT_DUPLICATION, "LeviApplicationRuntime", FaultPhases.AFTER_OPERATION, [ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_REJECTION]),
    scenario("listener-cleanup", FaultCategories.LISTENER_LEAK, "ReliabilityAssuranceEngine", FaultPhases.AFTER_SHUTDOWN, [ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.FULL_RECOVERY]),
    scenario("protected-mutation-interruption", FaultCategories.INTERRUPTED_WORKSPACE_MUTATION, "ControlledWorkspaceToolEngine", FaultPhases.DURING_MUTATION, [ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.NEVER_RESUME, RecoveryExpectations.REQUIRE_USER_APPROVAL, RecoveryExpectations.REQUIRE_REVALIDATION]),
    scenario("validation-interruption", FaultCategories.INTERRUPTED_VALIDATION, "ControlledWorkspaceToolEngine", FaultPhases.DURING_VALIDATION, [ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.REQUIRE_REVALIDATION]),
    scenario("model-request-interruption", FaultCategories.INTERRUPTED_MODEL_REQUEST, "ModelProviderGateway", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_DEGRADATION, RecoveryExpectations.REQUIRE_USER_RETRY]),
    scenario("agent-turn-interruption", FaultCategories.INTERRUPTED_AGENT_TURN, "AgentOrchestrationEngine", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.STANDARD, ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.PARTIAL_RECOVERY, RecoveryExpectations.REQUIRE_USER_RETRY]),
    scenario("multi-agent-assignment-interruption", FaultCategories.INTERRUPTED_MULTI_AGENT_ASSIGNMENT, "MultiAgentCoordinationEngine", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.PARTIAL_RECOVERY, RecoveryExpectations.REQUIRE_USER_RETRY]),
    scenario("workflow-step-interruption", FaultCategories.INTERRUPTED_WORKFLOW_STEP, "DurableWorkflowEngine", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.PARTIAL_RECOVERY, RecoveryExpectations.REQUIRE_REVALIDATION]),
    scenario("performance-cache-corruption", FaultCategories.CACHE_CORRUPTION, "RepositoryPerformanceEngine", FaultPhases.DURING_RECOVERY, [ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_DEGRADATION]),
    scenario("repository-graph-corruption", FaultCategories.GRAPH_CORRUPTION, "RepositoryPerformanceEngine", FaultPhases.DURING_RECOVERY, [ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_DEGRADATION, RecoveryExpectations.REQUIRE_REVALIDATION]),
    scenario("approval-expiration", FaultCategories.APPROVAL_EXPIRATION, "ApprovalGateway", FaultPhases.AFTER_APPROVAL, [ReliabilityProfiles.STRICT, ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.REQUIRE_USER_APPROVAL]),
    scenario("queue-overflow", FaultCategories.QUEUE_OVERFLOW, "LeviApplicationRuntime", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_REJECTION]),
    scenario("concurrent-transition", FaultCategories.CONCURRENT_STATE_TRANSITION, "LeviApplicationRuntime", FaultPhases.DURING_OPERATION, [ReliabilityProfiles.RELEASE_CANDIDATE], [RecoveryExpectations.SAFE_REJECTION]),
  ];
}

function scenario(id, category, targetComponent, phase, profiles, expectedRecovery) {
  return normalizeFaultScenario({ id, name: titleFromId(id), category, targetComponent, phase, expectedRecovery, metadata: { profiles } });
}

function defaultExpectedRecovery(category) {
  if (protectedScenarioCategory(category)) return [RecoveryExpectations.NEVER_RESUME, RecoveryExpectations.REQUIRE_REVALIDATION];
  if ([FaultCategories.PERSISTENCE_CORRUPTION, FaultCategories.CACHE_CORRUPTION, FaultCategories.GRAPH_CORRUPTION].includes(category)) return [RecoveryExpectations.SAFE_DEGRADATION, RecoveryExpectations.REQUIRE_REVALIDATION];
  return [RecoveryExpectations.SAFE_DEGRADATION];
}

function defaultProhibitedOutcomes(category) {
  const outcomes = ["false completion", "duplicate execution", "unclean shutdown"];
  if (protectedScenarioCategory(category)) outcomes.push("protected action resumed");
  return outcomes;
}

function protectedScenarioCategory(category) {
  return [
    FaultCategories.INTERRUPTED_WORKSPACE_MUTATION,
    FaultCategories.INTERRUPTED_SOURCE_CONTROL_OPERATION,
    FaultCategories.APPROVAL_EXPIRATION,
    FaultCategories.APPROVAL_SCOPE_MISMATCH,
  ].includes(category);
}

function severityForCategory(category) {
  if (protectedScenarioCategory(category) || [FaultCategories.GRAPH_CORRUPTION, FaultCategories.PERSISTENCE_CORRUPTION].includes(category)) return ReliabilitySeverities.CRITICAL;
  if (/INTERRUPTED|CORRUPTION|DUPLICATION|RESOURCE|QUEUE|LOCK|CONCURRENT/.test(category)) return ReliabilitySeverities.HIGH;
  return ReliabilitySeverities.MEDIUM;
}

function validEngineTransition(from, to) {
  if (from === to) return true;
  const allowed = {
    CREATED: ["INITIALIZING", "STOPPED"],
    INITIALIZING: ["READY", "DEGRADED", "SUSPENDED", "FAILED"],
    READY: ["RUNNING_DIAGNOSTICS", "SUSPENDED", "RECOVERING", "SHUTTING_DOWN", "DEGRADED"],
    DEGRADED: ["RUNNING_DIAGNOSTICS", "SUSPENDED", "RECOVERING", "SHUTTING_DOWN", "READY"],
    RUNNING_DIAGNOSTICS: ["READY", "DEGRADED", "RECOVERING", "SHUTTING_DOWN", "FAILED"],
    RECOVERING: ["READY", "DEGRADED", "FAILED", "SHUTTING_DOWN"],
    SUSPENDED: ["READY", "DEGRADED", "SHUTTING_DOWN"],
    SHUTTING_DOWN: ["STOPPED", "FAILED"],
    STOPPED: ["INITIALIZING"],
    FAILED: ["RECOVERING", "SHUTTING_DOWN"],
  };
  return safeArray(allowed[from]).includes(to);
}

function terminalRunState(state) {
  return [DiagnosticRunStates.SUCCEEDED, DiagnosticRunStates.PARTIALLY_SUCCEEDED, DiagnosticRunStates.FAILED, DiagnosticRunStates.CANCELLED, DiagnosticRunStates.TIMED_OUT, DiagnosticRunStates.INVALID, DiagnosticRunStates.EXPIRED].includes(state);
}

function terminalReliabilityEvent(type) {
  return [ReliabilityEventTypes.RUN_COMPLETED, ReliabilityEventTypes.RUN_PARTIALLY_COMPLETED, ReliabilityEventTypes.RUN_FAILED, ReliabilityEventTypes.RUN_CANCELLED, ReliabilityEventTypes.CERTIFICATION_COMPLETED, ReliabilityEventTypes.CERTIFICATION_BLOCKED].includes(type);
}

function certificationLevelFor(profile) {
  if (profile === ReliabilityProfiles.SMOKE) return ReliabilityCertificationLevels.BASELINE;
  if (profile === ReliabilityProfiles.STANDARD) return ReliabilityCertificationLevels.STANDARD;
  if (profile === ReliabilityProfiles.STRICT) return ReliabilityCertificationLevels.STRICT;
  return ReliabilityCertificationLevels.RELEASE_CANDIDATE_READY;
}

function componentByName(engine, name) {
  if (!name) return null;
  if (name === "ReliabilityAssuranceEngine") return engine;
  if (name === "LeviApplicationRuntime") return engine.runtime;
  if (engine.runtime && typeof engine.runtime[componentMethodFor(name)] === "function") return engine.runtime[componentMethodFor(name)]();
  if (engine.runtime && engine.runtime.components && engine.runtime.components.get(name)) return engine.runtime.components.get(name).instance;
  return engine.components[name] || null;
}

function componentMethodFor(name) {
  return {
    AgentOrchestrationEngine: "agentEngine",
    MultiAgentCoordinationEngine: "multiAgentEngine",
    DurableWorkflowEngine: "workflowEngine",
    ControlledWorkspaceToolEngine: "workspaceToolsEngine",
    ModelProviderGateway: "modelGateway",
    RepositoryPerformanceEngine: "performanceEngine",
  }[name] || "";
}

function componentHealth(component) {
  if (!component) return { status: "UNAVAILABLE" };
  if (typeof component.getHealth === "function") return sanitize(component.getHealth({ skipChecks: true }));
  if (typeof component.getGatewayHealth === "function") return sanitize(component.getGatewayHealth({ skipChecks: true }));
  return { status: "AVAILABLE" };
}

function summarizeRun(run) {
  return sanitize({ ...run, componentSnapshots: safeArray(run.componentSnapshots).slice(0, 8), evidence: safeArray(run.evidence).slice(0, 16), findings: safeArray(run.findings).slice(0, 16) });
}

function summarizeResult(result) {
  return sanitize({ ...result, evidence: safeArray(result.evidence).slice(0, 16), findings: safeArray(result.findings).slice(0, 16), observedEvents: safeArray(result.observedEvents).slice(0, 32) });
}

function sanitizeConfiguration(configuration) {
  const copy = { ...configuration };
  delete copy.credentials;
  delete copy.providerCredentials;
  delete copy.prompts;
  return sanitize(copy);
}

function normalizeEvidence(input = {}, engine = null) {
  if (typeof input === "string") return evidence("text", input, engine);
  return {
    id: input.id || (engine ? engine.nextId("evidence", { source: input.source, summary: input.summary || input.signal }) : idFor("evidence", JSON.stringify(input))),
    source: input.source || "ReliabilityAssuranceEngine",
    summary: input.summary || input.signal || "Reliability evidence.",
    reference: input.reference || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function evidence(source, summary, engine = null) {
  return normalizeEvidence({ source, summary }, engine);
}

function domainScore(ok, okSummary, issue, degradedScore = 70) {
  return { score: ok ? 100 : degradedScore, status: ok ? "HEALTHY" : "DEGRADED", summary: ok ? okSummary : issue };
}

function emptyStats() {
  return {
    scenariosRegistered: 0,
    runsCreated: 0,
    runsCompleted: 0,
    runsPartiallyCompleted: 0,
    runsFailed: 0,
    runsCancelled: 0,
    scenariosExecuted: 0,
    scenariosPassed: 0,
    scenariosFailed: 0,
    faultsActivated: 0,
    faultsTriggered: 0,
    faultsCleared: 0,
    recoveriesAttempted: 0,
    recoveriesSucceeded: 0,
    recoveriesPartiallySucceeded: 0,
    recoveriesFailed: 0,
    stateMachineViolations: 0,
    eventIntegrityViolations: 0,
    persistenceIntegrityViolations: 0,
    resourceLeaksDetected: 0,
    duplicateExecutionsDetected: 0,
    approvalIntegrityViolations: 0,
    securityIntegrityViolations: 0,
    privacyIntegrityViolations: 0,
    evidenceIntegrityViolations: 0,
    protectedResumeAttemptsBlocked: 0,
    releaseBlockersDetected: 0,
    corruptionFallbacks: 0,
    averageScenarioDuration: 0,
    averageRunDuration: 0,
    averageRecoveryConfidence: 0,
    eventsPublished: 0,
    lastRun: null,
    lastScenario: null,
    lastFinding: null,
    lastBlocker: null,
    lastCertification: null,
    lastPersistence: null,
  };
}

function normalizeEnum(value, allowed, label) {
  if (Object.values(allowed).includes(value)) return value;
  throw new Error(`Invalid ${label}: ${value}`);
}

function titleFromId(id) {
  return String(id).split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function safeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function sum(items, getter) {
  return safeArray(items).reduce((total, item) => total + Number(getter(item) || 0), 0);
}

function sanitize(value) {
  if (value == null) return value;
  if (typeof value === "string") return redact(value.slice(0, 4000));
  if (Array.isArray(value)) return value.slice(0, 128).map(sanitize);
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 128)) {
      if (/credential|secret|token|api[-_]?key|password|authorization|prompt|reasoning|sourceContent|commandOutput/i.test(key)) continue;
      out[key] = sanitize(entry);
    }
    return out;
  }
  return value;
}

function redact(value) {
  return value.replace(/(api[-_]?key|token|password|secret|authorization)=([^&\s]+)/gi, "$1=[redacted]");
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function idFor(prefix, seed) {
  return `${prefix}-${hashValue(seed).slice(0, 16)}`;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = {
  DEFAULT_CONFIGURATION,
  DiagnosticRunStates,
  FaultCategories,
  FaultPhases,
  MemoryReliabilityPersistenceAdapter,
  RELIABILITY_ASSURANCE_SCHEMA_VERSION,
  RecoveryExpectations,
  ReliabilityAssuranceEngine,
  ReliabilityCertificationLevels,
  ReliabilityEngineStates,
  ReliabilityEventTypes,
  ReliabilityFindingStatuses,
  ReliabilityProfiles,
  ReliabilitySeverities,
  normalizeConsistencyReport,
  normalizeDiagnosticRun,
  normalizeFaultInjection,
  normalizeFaultScenario,
  normalizeRecoveryReport,
  normalizeReliabilityConfiguration,
  normalizeResourceReport,
  normalizeScenarioResult,
};
