const assert = require("node:assert/strict");
const test = require("node:test");

const {
  LoadDomains,
  LoadPatterns,
  MemoryStressScalabilityPersistenceAdapter,
  PressureLevels,
  ScalabilitySeverities,
  StressCertificationLevels,
  StressEngineStates,
  StressProfiles,
  StressRunStates,
  StressScalabilityEngine,
  normalizeLatencyMetrics,
  normalizeStressConfiguration,
} = require("../src/stress-scalability-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes conservative stress configuration and exposes frozen RC-003 constants", () => {
  const config = normalizeStressConfiguration({ id: "fixture", maximumConcurrentOperations: 0, maximumQueueDepth: Number.POSITIVE_INFINITY });

  assert.equal(config.id, "fixture");
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.maximumConcurrentOperations, 16);
  assert.equal(config.maximumQueueDepth, 256);
  assert.equal(config.failClosed, true);
  assert.equal(config.metadata.configurationErrors.length, 2);
  assert.equal(new StressScalabilityEngine({ configuration: { maximumQueueDepth: Number.POSITIVE_INFINITY } }).initialize({ load: false }).engineState, StressEngineStates.FAILED);
  assert.equal(Object.isFrozen(StressEngineStates), true);
  assert.equal(Object.isFrozen(StressRunStates), true);
  assert.equal(Object.isFrozen(LoadDomains), true);
  assert.equal(Object.isFrozen(LoadPatterns), true);
  assert.equal(Object.isFrozen(PressureLevels), true);
  assert.equal(ScalabilitySeverities.CRITICAL, "CRITICAL");
});

test("initializes, suspends, resumes, shuts down, and exposes built-in profiles and virtual repositories", () => {
  const engine = new StressScalabilityEngine({ persistenceAdapter: new MemoryStressScalabilityPersistenceAdapter() });

  assert.equal(engine.initialize({ load: false }).engineState, StressEngineStates.READY);
  assert.equal(engine.suspend("maintenance").status, "SUSPENDED");
  assert.equal(engine.resume({ load: false }).engineState, StressEngineStates.READY);
  assert.ok(engine.listProfiles().some((profile) => profile.id === StressProfiles.RELEASE_CANDIDATE));
  assert.equal(engine.getSyntheticRepository("VERY_LARGE").fileCount, 100000);
  assert.equal(engine.getSyntheticRepository("VERY_LARGE").metadata.virtual, true);
  assert.equal(engine.getSyntheticRepository("MONOREPO").monorepoPackageCount, 50);
  assert.equal(engine.shutdown({ save: false }).status, StressEngineStates.STOPPED);
});

test("calculates deterministic latency percentiles", () => {
  const metrics = normalizeLatencyMetrics([10, 20, 30, 40, 50], 1);

  assert.equal(metrics.count, 5);
  assert.equal(metrics.minimumMs, 10);
  assert.equal(metrics.maximumMs, 50);
  assert.equal(metrics.p50Ms, 30);
  assert.equal(metrics.p95Ms, 50);
  assert.equal(metrics.timedOutCount, 1);
});

test("registers and validates bounded load profiles and stress scenarios", () => {
  const engine = new StressScalabilityEngine({ configuration: { persistReports: false } });
  const profile = engine.registerProfile({ id: "CUSTOM", pressureLevel: PressureLevels.LOW, targetConcurrency: 2, durationMs: 100 });
  const scenario = engine.registerScenario({
    id: "custom-queue",
    domain: LoadDomains.QUEUES,
    pattern: LoadPatterns.SAWTOOTH,
    pressureLevel: PressureLevels.LOW,
    loadProfileId: profile.id,
    timeoutMs: 100,
  });

  assert.equal(profile.id, "CUSTOM");
  assert.equal(scenario.id, "custom-queue");
  assert.equal(engine.validateProfile("CUSTOM").valid, true);
  assert.equal(engine.validateScenario("custom-queue").valid, true);
});

test("executes smoke and release-candidate stress runs with bounded synthetic evidence", async () => {
  const engine = new StressScalabilityEngine({ configuration: { persistReports: false } });
  engine.initialize({ load: false });

  const smoke = await engine.runStress({ profile: StressProfiles.SMOKE });
  const releaseCandidate = await engine.runStress({ profile: StressProfiles.RELEASE_CANDIDATE });

  assert.equal(smoke.status, "COMPLETED");
  assert.equal(smoke.run.state, StressRunStates.SUCCEEDED);
  assert.equal(smoke.report.releaseBlockers.length, 0);
  assert.equal(releaseCandidate.report.certificationLevel, StressCertificationLevels.RELEASE_CANDIDATE_SCALABILITY);
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("repository-very-large-virtual"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("queue-fill-drain"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("presentation-pressure"));
  assert.equal(releaseCandidate.report.memoryStability, true);
  assert.equal(releaseCandidate.report.eventStability, true);
});

test("verifies required stress domains through checkAll", async () => {
  const engine = new StressScalabilityEngine({ configuration: { persistReports: false } });
  const all = await engine.checkAll({ profile: StressProfiles.SMOKE });

  assert.equal(all.status, "PASSED");
  assert.equal(all.checks.repositoryStress.status, "COMPLETED");
  assert.equal(all.checks.concurrency.status, "COMPLETED");
  assert.equal(all.checks.agentStress.status, "COMPLETED");
  assert.equal(all.checks.multiAgentStress.status, "COMPLETED");
  assert.equal(all.checks.workflowStress.status, "COMPLETED");
  assert.equal(all.checks.providerStress.status, "COMPLETED");
  assert.equal(all.checks.queueStability.status, "COMPLETED");
  assert.equal(all.checks.memoryStability.status, "COMPLETED");
  assert.equal(all.checks.cacheEfficiency.status, "COMPLETED");
  assert.equal(all.checks.eventStability.status, "COMPLETED");
  assert.equal(all.checks.persistenceRecovery.status, "COMPLETED");
  assert.equal(all.checks.cancellation.status, "COMPLETED");
  assert.equal(all.checks.presentationPressure.status, "COMPLETED");
  assert.equal(all.checks.cleanup.status, "PASSED");
});

test("persists, restores, invalidates certification, and never resumes protected operations", async () => {
  const adapter = new MemoryStressScalabilityPersistenceAdapter();
  const engine = new StressScalabilityEngine({ persistenceAdapter: adapter });
  await engine.runStress({ profile: StressProfiles.SMOKE });
  const certified = engine.certifyScalability(StressProfiles.RELEASE_CANDIDATE);
  const saved = engine.save();
  const restored = new StressScalabilityEngine({ persistenceAdapter: adapter });
  const loaded = restored.load();
  const recovery = restored.recover();

  assert.equal(certified.level, StressCertificationLevels.RELEASE_CANDIDATE_SCALABILITY);
  assert.equal(saved.status, "PERSISTED");
  assert.equal(loaded.status, "LOADED");
  assert.equal(restored.certification.level, StressCertificationLevels.NOT_EVALUATED);
  assert.equal(recovery.protectedOperationsResumed, false);
});

test("creates release blockers and blocks scalability certification when critical finding remains open", () => {
  const engine = new StressScalabilityEngine({ configuration: { persistReports: false } });
  const finding = engine.createFinding({
    domain: LoadDomains.MEMORY,
    category: "UNBOUNDED_MEMORY",
    severity: ScalabilitySeverities.CRITICAL,
    title: "Critical memory fixture",
    releaseBlocking: true,
  });
  const certification = engine.certifyScalability(StressProfiles.RELEASE_CANDIDATE);

  assert.equal(finding.status, "OPEN");
  assert.equal(certification.level, StressCertificationLevels.SCALABILITY_BLOCKED);
  assert.equal(engine.getReleaseBlockers().length, 1);
});

test("integrates with LeviApplicationRuntime as optional RC-003 stress commands", async () => {
  const unconfigured = new LeviApplicationRuntime({});
  assert.equal((await unconfigured.executeCommand("stress.health", {})).data.status, "UNCONFIGURED");

  const runtime = new LeviApplicationRuntime({
    enableStressScalability: true,
    stressScalabilityConfiguration: { persistReports: false, maximumScenariosPerRun: 8 },
    enableReliabilityAssurance: true,
    reliabilityConfiguration: { persistenceEnabled: false, maximumScenariosPerRun: 4 },
    enableSecurityAssurance: true,
    securityAssuranceConfiguration: { persistenceEnabled: false, maximumScenariosPerRun: 4 },
    enableRepositoryPerformance: true,
    performanceConfiguration: { persistenceEnabled: false },
  });
  const commands = runtime.listCommands().map((command) => command.id);

  assert.ok(commands.includes("stress.run"));
  assert.ok(commands.includes("stress.certify"));
  assert.ok(runtime.stressScalabilityEngine());

  const health = await runtime.executeCommand("stress.health", {});
  const repositories = await runtime.executeCommand("stress.repositories", {});
  const run = await runtime.executeCommand("stress.run", { profile: StressProfiles.SMOKE });
  const report = await runtime.executeCommand("stress.report", { runId: run.data.run.id });
  const checks = await runtime.executeCommand("stress.check", { profile: StressProfiles.SMOKE });
  const certification = await runtime.executeCommand("stress.certify", { profile: StressProfiles.RELEASE_CANDIDATE });

  assert.equal(health.success, true);
  assert.equal(repositories.data.repositories.some((repository) => repository.id === "VERY_LARGE"), true);
  assert.equal(run.data.status, "COMPLETED");
  assert.equal(report.data.releaseBlockers.length, 0);
  assert.equal(checks.data.status, "PASSED");
  assert.equal(certification.data.level, StressCertificationLevels.RELEASE_CANDIDATE_SCALABILITY);
});
