const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DiagnosticRunStates,
  FaultCategories,
  FaultPhases,
  MemoryReliabilityPersistenceAdapter,
  RecoveryExpectations,
  ReliabilityAssuranceEngine,
  ReliabilityCertificationLevels,
  ReliabilityEngineStates,
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
} = require("../src/reliability-assurance-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes reliability configuration and all public RC-001 models", () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter() });
  const config = normalizeReliabilityConfiguration({ maximumDiagnosticRuns: 0, maximumConcurrentRuns: 99, enableFaultInjection: true });
  assert.equal(config.maximumDiagnosticRuns, 1);
  assert.equal(config.maximumConcurrentRuns, 99);
  assert.equal(config.enableFaultInjection, true);

  const scenario = normalizeFaultScenario({
    id: "scenario-test",
    category: FaultCategories.INTERRUPTED_WORKSPACE_MUTATION,
    phase: FaultPhases.DURING_MUTATION,
    targetComponent: "ControlledWorkspaceToolEngine",
  }, engine);
  const injection = normalizeFaultInjection({ scenarioId: scenario.id, category: scenario.category, phase: scenario.phase }, engine);
  const run = normalizeDiagnosticRun({ profile: ReliabilityProfiles.SMOKE, scenarioIds: [scenario.id] }, engine);
  const result = normalizeScenarioResult({ runId: run.id, scenarioId: scenario.id, category: scenario.category, state: DiagnosticRunStates.SUCCEEDED }, engine);
  const consistency = normalizeConsistencyReport({ target: "runtime" }, engine);
  const recovery = normalizeRecoveryReport({ targetComponent: "runtime", completedEvidencePreserved: true }, engine);
  const resources = normalizeResourceReport({ target: "engine" }, engine);

  assert.deepEqual(scenario.expectedRecovery.includes(RecoveryExpectations.NEVER_RESUME), true);
  assert.equal(injection.active, false);
  assert.equal(run.state, DiagnosticRunStates.CREATED);
  assert.equal(result.cleanupVerified, true);
  assert.equal(consistency.valid, true);
  assert.equal(recovery.completedEvidencePreserved, true);
  assert.equal(resources.resourceCleanupValid, true);
});

test("initializes, suspends, resumes, shuts down cleanly, and keeps fault injection diagnostic-only", () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter() });
  assert.equal(engine.initialize({ load: false }).status, ReliabilityEngineStates.READY);
  assert.equal(engine.suspend().status, ReliabilityEngineStates.SUSPENDED);
  assert.equal(engine.resume().status, ReliabilityEngineStates.READY);
  const scenario = engine.listScenarios().find((entry) => entry.category === FaultCategories.INTERRUPTED_RUNTIME_OPERATION);
  const injection = engine.activateFault(scenario, { enabled: false });
  assert.equal(injection.active, false);
  assert.equal(engine.activeInjections.size, 1);
  const shutdown = engine.shutdown({ save: false });
  assert.equal(shutdown.status, ReliabilityEngineStates.STOPPED);
  assert.equal(engine.activeInjections.size, 0);
  assert.equal(shutdown.resourceCleanup.resourceCleanupValid, true);
});

test("registers scenarios, rejects duplicates, validates runs, and executes built-in profiles", async () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter(), configuration: { maximumScenariosPerRun: 8 } });
  engine.initialize({ load: false });
  const custom = engine.registerScenario({
    id: "custom-provider-timeout",
    category: FaultCategories.PROVIDER_TIMEOUT,
    targetComponent: "ModelProviderGateway",
    phase: FaultPhases.DURING_OPERATION,
    metadata: { profiles: [ReliabilityProfiles.SMOKE] },
  });
  assert.throws(() => engine.registerScenario(custom), /already registered/);

  const run = await engine.runDiagnostics({ profile: ReliabilityProfiles.SMOKE });
  const report = engine.getReliabilityReport(run.run.id);

  assert.equal(run.status, DiagnosticRunStates.SUCCEEDED);
  assert.ok(run.results.length >= 1);
  assert.equal(report.blockers.length, 0);
  assert.equal(report.consistency.valid, true);
});

test("verifies protected-action non-resume, idempotency, and completed evidence preservation", async () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter() });
  engine.initialize({ load: false });
  const run = await engine.runDiagnostics({ profile: ReliabilityProfiles.STRICT, scenarioIds: ["protected-mutation-interruption"] }, { enableFaultInjection: true });
  const result = run.results[0];
  const recovery = engine.lastRecoveryReport;

  assert.equal(result.protectedActionResumed, false);
  assert.equal(result.idempotencyVerified, true);
  assert.equal(result.evidencePreserved, true);
  assert.equal(recovery.unsafeWorkResumed, false);
  assert.equal(recovery.userActionRequired, true);
  assert.equal(engine.getStats().stats.protectedResumeAttemptsBlocked >= 1, true);
});

test("detects duplicate terminal events and isolates listener failures", async () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter() });
  engine.initialize({ load: false });
  engine.subscribe(() => { throw new Error("listener boom"); });
  await engine.runDiagnostics({ profile: ReliabilityProfiles.SMOKE, scenarioIds: ["runtime-operation-interruption"] });
  const completed = engine.eventHistory.find((event) => event.type === "reliability_run_completed");
  engine.eventHistory.push({ ...completed, id: "duplicate-terminal" });
  const integrity = engine.validateEventIntegrity();

  assert.equal(integrity.valid, false);
  assert.ok(integrity.violations.some((entry) => entry.includes("duplicate terminal event")));
});

test("handles persistence write/read failures, corruption fallback, and invalidates certification after restore", async () => {
  const adapter = new MemoryReliabilityPersistenceAdapter();
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: adapter });
  engine.initialize({ load: false });
  await engine.runDiagnostics({ profile: ReliabilityProfiles.SMOKE });
  engine.certify({ profile: ReliabilityProfiles.SMOKE });
  assert.equal(engine.save().status, "PERSISTED");

  adapter.failWrite = true;
  assert.equal(engine.save().status, "FAILED");
  adapter.failWrite = false;

  const restored = new ReliabilityAssuranceEngine({ persistenceAdapter: adapter });
  assert.equal(restored.restore().status, "LOADED");
  assert.equal(restored.certification.level, ReliabilityCertificationLevels.BLOCKED);

  adapter.failRead = true;
  const fallback = restored.restore({ emptyOnCorruption: true });
  assert.equal(fallback.status, "EMPTY");
  assert.equal(fallback.corrupted, true);
});

test("creates release blockers and blocks certification when critical reliability finding is open", () => {
  const engine = new ReliabilityAssuranceEngine({ persistenceAdapter: new MemoryReliabilityPersistenceAdapter() });
  engine.initialize({ load: false });
  const finding = engine.createFinding({
    category: FaultCategories.CONCURRENT_STATE_TRANSITION,
    severity: ReliabilitySeverities.CRITICAL,
    title: "Concurrent state transition violated runtime invariant.",
  });
  const certification = engine.certify({ profile: ReliabilityProfiles.RELEASE_CANDIDATE });

  assert.equal(finding.status, ReliabilityFindingStatuses.OPEN);
  assert.equal(finding.releaseBlocking, true);
  assert.equal(certification.level, ReliabilityCertificationLevels.BLOCKED);
  assert.equal(engine.getHealth().status, "BLOCKED");
});

test("integrates with LeviApplicationRuntime as optional RC diagnostics commands", async () => {
  const unconfigured = new LeviApplicationRuntime({});
  assert.equal((await unconfigured.executeCommand("reliability.health", {})).data.status, "UNCONFIGURED");

  const runtime = new LeviApplicationRuntime({
    enableReliabilityAssurance: true,
    reliabilityConfiguration: { persistenceEnabled: false, maximumScenariosPerRun: 4 },
    enableRepositoryPerformance: true,
    performanceConfiguration: { persistenceEnabled: false },
  });
  const commands = runtime.listCommands().map((command) => command.id);
  assert.ok(commands.includes("reliability.run"));
  assert.ok(commands.includes("reliability.certify"));
  assert.ok(runtime.reliabilityEngine());

  const health = await runtime.executeCommand("reliability.health", {});
  const run = await runtime.executeCommand("reliability.run", { profile: ReliabilityProfiles.SMOKE });
  const report = await runtime.executeCommand("reliability.report", { runId: run.data.run.id });
  const certification = await runtime.executeCommand("reliability.certify", { profile: ReliabilityProfiles.SMOKE });

  assert.equal(health.success, true);
  assert.equal(run.data.status, DiagnosticRunStates.SUCCEEDED);
  assert.equal(report.data.blockers.length, 0);
  assert.ok([ReliabilityCertificationLevels.BASELINE, ReliabilityCertificationLevels.BLOCKED].includes(certification.data.level));
});
