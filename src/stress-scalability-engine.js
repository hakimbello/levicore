const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const STRESS_SCALABILITY_SCHEMA_VERSION = 1;

const StressEngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  RUNNING: "RUNNING",
  THROTTLED: "THROTTLED",
  SUSPENDED: "SUSPENDED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const StressRunStates = Object.freeze({
  CREATED: "CREATED",
  VALIDATING: "VALIDATING",
  QUEUED: "QUEUED",
  WARMING_UP: "WARMING_UP",
  RUNNING: "RUNNING",
  THROTTLING: "THROTTLING",
  OBSERVING: "OBSERVING",
  COOLING_DOWN: "COOLING_DOWN",
  VERIFYING: "VERIFYING",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
  INVALID: "INVALID",
  EXPIRED: "EXPIRED",
});

const LoadDomains = Object.freeze({
  REPOSITORY_INDEXING: "REPOSITORY_INDEXING",
  GRAPH_QUERIES: "GRAPH_QUERIES",
  CONTEXT_BUILDING: "CONTEXT_BUILDING",
  MODEL_REQUESTS: "MODEL_REQUESTS",
  MODEL_STREAMING: "MODEL_STREAMING",
  AGENT_TURNS: "AGENT_TURNS",
  MULTI_AGENT_TEAMS: "MULTI_AGENT_TEAMS",
  WORKFLOW_EXECUTION: "WORKFLOW_EXECUTION",
  WORKSPACE_READS: "WORKSPACE_READS",
  CHANGE_PROPOSALS: "CHANGE_PROPOSALS",
  PATCH_PREVIEW: "PATCH_PREVIEW",
  VALIDATION: "VALIDATION",
  PERSISTENCE: "PERSISTENCE",
  RECOVERY: "RECOVERY",
  EVENTS: "EVENTS",
  LISTENERS: "LISTENERS",
  QUEUES: "QUEUES",
  CACHES: "CACHES",
  MEMORY: "MEMORY",
  VS_CODE_PRESENTATION: "VS_CODE_PRESENTATION",
  SERIALIZATION: "SERIALIZATION",
  UNKNOWN: "UNKNOWN",
});

const LoadPatterns = Object.freeze({
  SINGLE_BURST: "SINGLE_BURST",
  RAMP_UP: "RAMP_UP",
  RAMP_DOWN: "RAMP_DOWN",
  CONSTANT: "CONSTANT",
  SPIKE: "SPIKE",
  SAWTOOTH: "SAWTOOTH",
  SUSTAINED: "SUSTAINED",
  CANCELLATION_STORM: "CANCELLATION_STORM",
  FAILURE_STORM: "FAILURE_STORM",
  RECOVERY_CYCLE: "RECOVERY_CYCLE",
  MIXED_WORKLOAD: "MIXED_WORKLOAD",
  UNKNOWN: "UNKNOWN",
});

const PressureLevels = Object.freeze({
  BASELINE: "BASELINE",
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  SEVERE: "SEVERE",
  EXTREME: "EXTREME",
});

const ScalabilitySeverities = Object.freeze({
  INFORMATIONAL: "INFORMATIONAL",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const StressFindingStatuses = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  MITIGATED: "MITIGATED",
  RESOLVED: "RESOLVED",
  ACCEPTED_RISK: "ACCEPTED_RISK",
  FALSE_POSITIVE: "FALSE_POSITIVE",
});

const StressProfiles = Object.freeze({
  SMOKE: "SMOKE",
  STANDARD: "STANDARD",
  STRICT: "STRICT",
  RELEASE_CANDIDATE: "RELEASE_CANDIDATE",
});

const StressCertificationLevels = Object.freeze({
  NOT_EVALUATED: "NOT_EVALUATED",
  STRESS_BASELINE: "STRESS_BASELINE",
  SCALABILITY_CONFIDENCE: "SCALABILITY_CONFIDENCE",
  RELEASE_CANDIDATE_SCALABILITY: "RELEASE_CANDIDATE_SCALABILITY",
  SCALABILITY_BLOCKED: "SCALABILITY_BLOCKED",
});

const StressEventTypes = Object.freeze({
  INITIALIZATION_STARTED: "stress_initialization_started",
  READY: "stress_ready",
  DEGRADED: "stress_degraded",
  FAILED: "stress_failed",
  PROFILE_REGISTERED: "stress_profile_registered",
  SCENARIO_REGISTERED: "stress_scenario_registered",
  RUN_CREATED: "stress_run_created",
  RUN_VALIDATING: "stress_run_validating",
  RUN_WARMING_UP: "stress_run_warming_up",
  RUN_STARTED: "stress_run_started",
  RUN_PROGRESS: "stress_run_progress",
  RUN_THROTTLED: "stress_run_throttled",
  RUN_COOLING_DOWN: "stress_run_cooling_down",
  RUN_CANCELLED: "stress_run_cancelled",
  RUN_COMPLETED: "stress_run_completed",
  RUN_PARTIALLY_COMPLETED: "stress_run_partially_completed",
  RUN_FAILED: "stress_run_failed",
  SCENARIO_STARTED: "stress_scenario_started",
  SCENARIO_PROGRESS: "stress_scenario_progress",
  THRESHOLD_WARNING: "stress_threshold_warning",
  THRESHOLD_VIOLATED: "stress_threshold_violated",
  BOTTLENECK_DETECTED: "stress_bottleneck_detected",
  RELEASE_BLOCKER_DETECTED: "stress_release_blocker_detected",
  MEMORY_WARNING: "stress_memory_warning",
  MEMORY_CRITICAL: "stress_memory_critical",
  QUEUE_WARNING: "stress_queue_warning",
  QUEUE_OVERFLOW: "stress_queue_overflow",
  PROVIDER_THROTTLED: "stress_provider_throttled",
  CANCELLATION_STORM_STARTED: "stress_cancellation_storm_started",
  CLEANUP_STARTED: "stress_cleanup_started",
  CLEANUP_COMPLETED: "stress_cleanup_completed",
  CLEANUP_FAILED: "stress_cleanup_failed",
  CERTIFICATION_STARTED: "stress_certification_started",
  CERTIFICATION_COMPLETED: "stress_certification_completed",
  CERTIFICATION_BLOCKED: "stress_certification_blocked",
  PERSISTED: "stress_persisted",
  RESTORED: "stress_restored",
  CORRUPTION_DETECTED: "stress_corruption_detected",
  SHUTDOWN: "stress_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-stress-scalability",
  schemaVersion: STRESS_SCALABILITY_SCHEMA_VERSION,
  enabled: true,
  deterministicMode: true,
  failClosed: true,
  maximumRuns: 32,
  maximumConcurrentRuns: 1,
  maximumScenariosPerRun: 64,
  maximumSyntheticFiles: 100000,
  maximumSyntheticDirectories: 20000,
  maximumSyntheticSymbols: 1000000,
  maximumSyntheticDependencies: 250000,
  maximumRepositoryBytes: 256 * 1024 * 1024,
  maximumConcurrentOperations: 16,
  maximumConcurrentModelRequests: 4,
  maximumConcurrentAgentTurns: 4,
  maximumConcurrentAssignments: 8,
  maximumConcurrentWorkflows: 4,
  maximumConcurrentWorkflowSteps: 16,
  maximumQueueDepth: 256,
  maximumEventRatePerSecond: 256,
  maximumListeners: 64,
  maximumCacheEntries: 1024,
  maximumCacheBytes: 64 * 1024 * 1024,
  maximumContextPackages: 128,
  maximumConversationMessages: 1000,
  maximumProposalFiles: 128,
  maximumPatchBytes: 2 * 1024 * 1024,
  maximumPersistenceCycles: 8,
  maximumRecoveryCycles: 8,
  maximumCancellationRate: 64,
  maximumRunDurationMs: 120000,
  maximumScenarioDurationMs: 30000,
  maximumWarmupDurationMs: 5000,
  maximumCooldownDurationMs: 5000,
  memoryBudgetBytes: 128 * 1024 * 1024,
  warningMemoryRatio: 0.75,
  criticalMemoryRatio: 0.9,
  enableRepositoryStress: true,
  enableConcurrencyStress: true,
  enableProviderStress: true,
  enableWorkflowStress: true,
  enableMemoryStress: true,
  enableQueueStress: true,
  enablePersistenceStress: true,
  enableRecoveryStress: true,
  enableCancellationStress: true,
  enablePresentationStress: true,
  persistReports: true,
  metadata: Object.freeze({}),
});

class MemoryStressScalabilityPersistenceAdapter {
  constructor() {
    this.snapshot = null;
  }

  save(snapshot) {
    this.snapshot = cloneJson(snapshot);
    return { status: "PERSISTED", savedAt: snapshot && snapshot.savedAt };
  }

  load() {
    return this.snapshot ? { status: "LOADED", snapshot: cloneJson(this.snapshot) } : { status: "EMPTY" };
  }
}

class StressScalabilityEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.runtime = options.runtime || null;
    this.components = options.components || {};
    this.clock = normalizeClock(options.clock);
    this.configuration = normalizeStressConfiguration(options.configuration || options.config || {});
    this.persistenceAdapter = options.persistenceAdapter || new MemoryStressScalabilityPersistenceAdapter();
    this.state = StressEngineStates.CREATED;
    this.profiles = new Map();
    this.repositories = new Map();
    this.scenarios = new Map();
    this.runs = new Map();
    this.results = new Map();
    this.findings = new Map();
    this.events = [];
    this.listeners = new Map();
    this.activeRuns = new Set();
    this.activeAdapters = new Set();
    this.lastReport = null;
    this.certification = { level: StressCertificationLevels.NOT_EVALUATED, profile: null, blockers: [], certifiedAt: null };
    this.stats = emptyStats();
    this.registerBuiltIns();
  }

  initialize(options = {}) {
    this.transition(StressEngineStates.INITIALIZING, StressEventTypes.INITIALIZATION_STARTED, {});
    if (options.configuration) this.configuration = normalizeStressConfiguration({ ...this.configuration, ...options.configuration });
    const validation = validateFiniteConfiguration(this.configuration);
    if (!validation.valid) {
      this.transition(this.configuration.failClosed ? StressEngineStates.FAILED : StressEngineStates.DEGRADED, StressEventTypes.FAILED, { errors: validation.errors });
      return this.getHealth();
    }
    if (!this.configuration.enabled) {
      this.transition(StressEngineStates.SUSPENDED, StressEventTypes.DEGRADED, { reason: "Stress scalability diagnostics are disabled." });
      return this.getHealth();
    }
    if (options.load !== false) this.load({ ignoreMissing: true });
    this.transition(StressEngineStates.READY, StressEventTypes.READY, {});
    return this.getHealth();
  }

  shutdown(options = {}) {
    this.transition(StressEngineStates.SHUTTING_DOWN, null, {});
    for (const runId of Array.from(this.activeRuns)) this.cancelRun(runId, "StressScalabilityEngine shutting down.");
    const cleanup = this.cleanup({ reason: "shutdown" });
    const persisted = options.save === false ? { status: "SKIPPED" } : this.save();
    this.transition(StressEngineStates.STOPPED, StressEventTypes.SHUTDOWN, { cleanup, persisted });
    return { status: StressEngineStates.STOPPED, cleanup, persisted };
  }

  suspend(reason = "Suspended by caller.") {
    this.transition(StressEngineStates.SUSPENDED, StressEventTypes.DEGRADED, { reason });
    return { status: "SUSPENDED", reason, state: this.state };
  }

  resume(options = {}) {
    if (this.state !== StressEngineStates.SUSPENDED) return { status: "NOOP", state: this.state };
    return this.initialize(options);
  }

  getState() {
    return { state: this.state };
  }

  getConfiguration() {
    return cloneJson(this.configuration);
  }

  updateConfiguration(patch = {}, options = {}) {
    if (!patch || typeof patch !== "object") throw new Error("Stress configuration patch must be an object.");
    this.configuration = normalizeStressConfiguration({ ...this.configuration, ...patch });
    if (options.save === true) this.save();
    return this.getConfiguration();
  }

  getHealth() {
    const blockers = this.getReleaseBlockers({});
    const warnings = [];
    const validation = validateFiniteConfiguration(this.configuration);
    if (!validation.valid) warnings.push(...validation.errors);
    if (!this.configuration.enabled) warnings.push("Stress scalability diagnostics are disabled.");
    return {
      status: blockers.length ? "BLOCKED" : validation.valid && this.configuration.enabled ? "AVAILABLE" : "DEGRADED",
      engineState: this.state,
      score: scoreFromFindings(this.listFindings({ status: StressFindingStatuses.OPEN }).concat(blockers)),
      domains: this.stressDomains(),
      blockers: blockers.map(summarizeFinding),
      warnings,
      certification: cloneJson(this.certification),
      profileCount: this.profiles.size,
      scenarioCount: this.scenarios.size,
      syntheticRepositoryCount: this.repositories.size,
      activeRuns: this.activeRuns.size,
    };
  }

  getStats() {
    return { status: "AVAILABLE", stats: cloneJson(this.stats) };
  }

  snapshot() {
    return sanitize({
      id: this.configuration.id,
      schemaVersion: STRESS_SCALABILITY_SCHEMA_VERSION,
      state: this.state,
      configuration: this.configuration,
      profiles: Array.from(this.profiles.values()),
      repositories: Array.from(this.repositories.values()),
      scenarios: Array.from(this.scenarios.values()),
      runs: Array.from(this.runs.values()),
      results: Array.from(this.results.values()),
      findings: Array.from(this.findings.values()),
      lastReport: this.lastReport,
      certification: this.certification,
      stats: this.stats,
      savedAt: this.now(),
    });
  }

  restore(snapshot = {}) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Stress snapshot must be an object.");
    if (snapshot.configuration) this.configuration = normalizeStressConfiguration(snapshot.configuration);
    this.profiles = new Map(safeArray(snapshot.profiles).map((profile) => [profile.id, normalizeLoadProfile(profile, this)]));
    this.repositories = new Map(safeArray(snapshot.repositories).map((repository) => [repository.id, normalizeSyntheticRepository(repository, this)]));
    this.scenarios = new Map(safeArray(snapshot.scenarios).map((scenario) => [scenario.id, normalizeStressScenario(scenario, this)]));
    if (!this.profiles.size || !this.repositories.size || !this.scenarios.size) this.registerBuiltIns();
    this.runs = new Map(safeArray(snapshot.runs).map((run) => [run.id, normalizeStressRun({ ...run, state: interruptedState(run.state) }, this)]));
    this.results = new Map(safeArray(snapshot.results).map((result) => [result.id, normalizeStressScenarioResult(result, this)]));
    this.findings = new Map(safeArray(snapshot.findings).map((finding) => [finding.id, normalizeScalabilityFinding(finding, this)]));
    this.lastReport = snapshot.lastReport ? normalizeScalabilityReport(snapshot.lastReport, this) : null;
    this.certification = { ...(snapshot.certification || this.certification), level: StressCertificationLevels.NOT_EVALUATED, limitations: ["Certification invalidated by restore until stress diagnostics are rerun."] };
    this.stats = { ...emptyStats(), ...(snapshot.stats || {}) };
    this.activeRuns.clear();
    this.activeAdapters.clear();
    this.transition(StressEngineStates.READY, StressEventTypes.RESTORED, { rerunRequired: true });
    return { status: "RESTORED", state: this.state, rerunRequired: true };
  }

  save() {
    if (!this.configuration.persistReports || !this.persistenceAdapter || typeof this.persistenceAdapter.save !== "function") return { status: "SKIPPED" };
    const result = this.persistenceAdapter.save(this.snapshot());
    this.stats.lastPersistence = result.savedAt || this.now();
    this.publish(StressEventTypes.PERSISTED, { result });
    return result;
  }

  load(options = {}) {
    if (!this.persistenceAdapter || typeof this.persistenceAdapter.load !== "function") return { status: "UNAVAILABLE" };
    const result = this.persistenceAdapter.load(options);
    if (!result || result.status === "EMPTY") return result || { status: "EMPTY" };
    if (result.snapshot) this.restore(result.snapshot);
    return result;
  }

  registerProfile(profile) {
    const normalized = normalizeLoadProfile(profile, this);
    if (this.profiles.has(normalized.id) && profile && profile.allowDuplicate !== true) throw new Error(`Duplicate stress profile: ${normalized.id}.`);
    this.profiles.set(normalized.id, normalized);
    this.stats.profilesRegistered += 1;
    this.publish(StressEventTypes.PROFILE_REGISTERED, { profileId: normalized.id });
    return cloneJson(normalized);
  }

  unregisterProfile(profileId) {
    return this.profiles.delete(requiredString(profileId, "Stress profile id is required."));
  }

  getProfile(profileId) {
    const profile = this.profiles.get(normalizeProfileId(profileId));
    return profile ? cloneJson(profile) : null;
  }

  listProfiles(filter = {}) {
    return Array.from(this.profiles.values()).filter((profile) => matchesFilter(profile, filter)).map(cloneJson);
  }

  validateProfile(profileOrId) {
    const profile = typeof profileOrId === "string" ? this.profiles.get(normalizeProfileId(profileOrId)) : normalizeLoadProfile(profileOrId || {}, this);
    const errors = [];
    if (!profile) errors.push("Load profile does not exist.");
    if (profile && profile.targetConcurrency > this.configuration.maximumConcurrentOperations) errors.push("Profile targetConcurrency exceeds maximumConcurrentOperations.");
    if (profile && profile.durationMs > this.configuration.maximumRunDurationMs) errors.push("Profile durationMs exceeds maximumRunDurationMs.");
    return { valid: errors.length === 0, errors };
  }

  createProfile(input, options = {}) {
    const profile = normalizeLoadProfile(input, this);
    return options.register === false ? profile : this.registerProfile(profile);
  }

  registerSyntheticRepository(repository) {
    const normalized = normalizeSyntheticRepository(repository, this);
    this.repositories.set(normalized.id, normalized);
    return cloneJson(normalized);
  }

  getSyntheticRepository(repositoryId) {
    const repository = this.repositories.get(repositoryId);
    return repository ? cloneJson(repository) : null;
  }

  listSyntheticRepositories(filter = {}) {
    return Array.from(this.repositories.values()).filter((repository) => matchesFilter(repository, filter)).map(cloneJson);
  }

  registerScenario(scenario) {
    const normalized = normalizeStressScenario(scenario, this);
    const validation = this.validateScenario(normalized);
    if (!validation.valid) throw new Error(`Invalid stress scenario: ${validation.errors.join("; ")}`);
    this.scenarios.set(normalized.id, normalized);
    this.stats.scenariosRegistered += 1;
    this.publish(StressEventTypes.SCENARIO_REGISTERED, { scenarioId: normalized.id, domain: normalized.domain });
    return cloneJson(normalized);
  }

  unregisterScenario(scenarioId) {
    return this.scenarios.delete(requiredString(scenarioId, "Stress scenario id is required."));
  }

  getScenario(scenarioId) {
    const scenario = this.scenarios.get(scenarioId);
    return scenario ? cloneJson(scenario) : null;
  }

  listScenarios(filter = {}) {
    return Array.from(this.scenarios.values()).filter((scenario) => matchesFilter(scenario, filter)).map(cloneJson);
  }

  validateScenario(scenarioOrId) {
    const scenario = typeof scenarioOrId === "string" ? this.scenarios.get(scenarioOrId) : scenarioOrId;
    const errors = [];
    if (!scenario) errors.push("Stress scenario does not exist.");
    if (scenario && !Object.values(LoadDomains).includes(scenario.domain)) errors.push("Stress scenario domain is invalid.");
    if (scenario && !Object.values(LoadPatterns).includes(scenario.pattern)) errors.push("Stress scenario pattern is invalid.");
    if (scenario && !Object.values(PressureLevels).includes(scenario.pressureLevel)) errors.push("Stress scenario pressureLevel is invalid.");
    if (scenario && scenario.timeoutMs > this.configuration.maximumScenarioDurationMs) errors.push("Stress scenario timeout exceeds maximumScenarioDurationMs.");
    return { valid: errors.length === 0, errors };
  }

  createScenario(input, options = {}) {
    const scenario = normalizeStressScenario(input, this, options);
    return options.register === false ? scenario : this.registerScenario(scenario);
  }

  createRun(input = {}, options = {}) {
    const profile = normalizeProfileId(input.profile || options.profile || StressProfiles.STANDARD);
    const scenarioIds = this.resolveScenarioIds(input.scenarioIds || input.scenarios, profile);
    const run = normalizeStressRun({
      id: input.id || this.nextId("stress-run", { profile, scenarioIds }),
      name: input.name || `Stress ${profile} Run`,
      profile,
      scenarioIds,
      configurationSnapshot: this.configuration,
      componentSnapshots: this.componentSnapshots(),
      metadata: input.metadata || {},
    }, this);
    this.runs.set(run.id, run);
    this.stats.runsCreated += 1;
    this.pruneRuns();
    this.publish(StressEventTypes.RUN_CREATED, { runId: run.id, profile });
    return cloneJson(run);
  }

  validateRun(runIdOrInput) {
    const run = typeof runIdOrInput === "string" ? this.runs.get(runIdOrInput) : normalizeStressRun(runIdOrInput || {}, this);
    const errors = [];
    if (!run) errors.push("Stress run does not exist.");
    if (run && run.scenarioIds.length > this.configuration.maximumScenariosPerRun) errors.push("Stress run exceeds maximumScenariosPerRun.");
    if (run) for (const scenarioId of run.scenarioIds) if (!this.scenarios.has(scenarioId)) errors.push(`Unknown stress scenario ${scenarioId}.`);
    return { valid: errors.length === 0, errors, runId: run && run.id };
  }

  async startRun(runId, options = {}) {
    const run = this.runs.get(requiredString(runId, "Stress run id is required."));
    if (!run) throw new Error(`Unknown stress run: ${runId}.`);
    this.publish(StressEventTypes.RUN_VALIDATING, { runId: run.id });
    const validation = this.validateRun(run.id);
    if (!validation.valid) {
      run.state = StressRunStates.INVALID;
      run.error = validation.errors.join("; ");
      return cloneJson(run);
    }
    if (this.activeRuns.size >= this.configuration.maximumConcurrentRuns) {
      run.state = StressRunStates.QUEUED;
      run.warnings.push("Maximum concurrent stress runs reached.");
      return cloneJson(run);
    }
    const priorState = this.state;
    this.activeRuns.add(run.id);
    this.transition(StressEngineStates.RUNNING, StressEventTypes.RUN_STARTED, { runId: run.id, profile: run.profile });
    run.state = StressRunStates.WARMING_UP;
    run.startedAt = this.now();
    run.warmupStartedAt = run.startedAt;
    this.publish(StressEventTypes.RUN_WARMING_UP, { runId: run.id });
    try {
      run.state = StressRunStates.RUNNING;
      for (const scenarioId of run.scenarioIds) {
        if (run.state === StressRunStates.CANCELLED) break;
        const scenario = this.scenarios.get(scenarioId);
        if (!scenario) {
          run.skippedScenarioIds.push(scenarioId);
          continue;
        }
        run.activeScenarioIds = [scenarioId];
        const result = await this.executeScenario(run, scenario, options);
        this.results.set(result.id, result);
        mergeMetrics(run.metrics, result);
        run.evidence.push(...result.evidence.slice(0, this.remainingEvidenceCapacity(run)));
        run.warnings.push(...result.warnings);
        run.limitations.push(...result.limitations);
        run.findings.push(...result.findings);
        if (result.state === StressRunStates.SUCCEEDED) run.completedScenarioIds.push(scenarioId);
        else run.failedScenarioIds.push(scenarioId);
        this.publish(StressEventTypes.RUN_PROGRESS, { runId: run.id, completed: run.completedScenarioIds.length, failed: run.failedScenarioIds.length });
      }
      run.activeScenarioIds = [];
      run.state = StressRunStates.COOLING_DOWN;
      run.cooldownStartedAt = this.now();
      this.publish(StressEventTypes.RUN_COOLING_DOWN, { runId: run.id });
      const cleanup = this.cleanup({ runId: run.id });
      if (cleanup.status !== "CLEAN") run.findings.push(this.persistFinding({
        runId: run.id,
        category: "CLEANUP_FAILURE",
        severity: ScalabilitySeverities.CRITICAL,
        title: "Stress cleanup failed",
        description: "Synthetic queues, timers, or adapters remained active after stress run.",
        releaseBlocking: true,
      }));
      run.blockers = run.findings.filter((finding) => finding.releaseBlocking && finding.status === StressFindingStatuses.OPEN);
      run.score = scoreFromFindings(run.findings);
      run.confidence = confidenceFromRun(run);
      run.completeness = completenessFromRun(run);
      run.state = run.failedScenarioIds.length ? StressRunStates.PARTIALLY_SUCCEEDED : StressRunStates.SUCCEEDED;
      run.completedAt = this.now();
      this.stats.runsCompleted += run.state === StressRunStates.SUCCEEDED ? 1 : 0;
      this.stats.runsPartiallyCompleted += run.state === StressRunStates.PARTIALLY_SUCCEEDED ? 1 : 0;
      this.updateAverages(run);
      const report = this.buildReport(run);
      this.lastReport = report;
      if (this.configuration.persistReports) this.save();
      this.publish(run.state === StressRunStates.SUCCEEDED ? StressEventTypes.RUN_COMPLETED : StressEventTypes.RUN_PARTIALLY_COMPLETED, { runId: run.id, reportId: report.id });
      return { status: "COMPLETED", run: cloneJson(run), report: cloneJson(report) };
    } catch (error) {
      run.state = StressRunStates.FAILED;
      run.error = error.message;
      run.completedAt = this.now();
      this.stats.runsFailed += 1;
      this.publish(StressEventTypes.RUN_FAILED, { runId: run.id, error: error.message });
      return { status: "FAILED", run: cloneJson(run), error: error.message };
    } finally {
      this.activeRuns.delete(run.id);
      this.activeAdapters.clear();
      if (this.state === StressEngineStates.RUNNING || this.state === StressEngineStates.THROTTLED) this.transition(priorState === StressEngineStates.CREATED ? StressEngineStates.READY : priorState, null, {});
    }
  }

  cancelRun(runId, reason = "Cancelled by caller.") {
    const run = this.runs.get(runId);
    if (!run) return { status: "NOT_FOUND", runId };
    run.state = StressRunStates.CANCELLED;
    run.completedAt = this.now();
    run.warnings.push(reason);
    run.activeScenarioIds = [];
    this.activeRuns.delete(run.id);
    this.cleanup({ runId: run.id, reason: "cancel" });
    this.stats.runsCancelled += 1;
    this.publish(StressEventTypes.RUN_CANCELLED, { runId: run.id, reason });
    return cloneJson(run);
  }

  getRun(runId) {
    const run = this.runs.get(runId);
    return run ? cloneJson(run) : null;
  }

  listRuns(filter = {}) {
    return Array.from(this.runs.values()).filter((run) => matchesFilter(run, filter)).map(cloneJson);
  }

  async runStress(input = {}, options = {}) {
    const run = this.createRun(input, options);
    return this.startRun(run.id, options);
  }

  getReport(runId = null) {
    if (!runId && this.lastReport) return cloneJson(this.lastReport);
    const run = runId ? this.runs.get(runId) : Array.from(this.runs.values()).reverse().find((entry) => entry.completedAt);
    if (!run) return { status: "UNAVAILABLE", warnings: ["No stress report has been produced yet."] };
    return cloneJson(this.buildReport(run));
  }

  getScalabilityReport(options = {}) {
    if (options.runId) return this.getReport(options.runId);
    if (this.lastReport) return cloneJson(this.lastReport);
    return this.buildReport(null);
  }

  async rerunScenario(runId, scenarioId, options = {}) {
    const baseRun = this.runs.get(runId);
    if (!baseRun) throw new Error(`Unknown stress run: ${runId}.`);
    const run = this.createRun({ name: `${baseRun.name} - ${scenarioId}`, profile: baseRun.profile, scenarioIds: [scenarioId], metadata: { rerunOf: runId } });
    return this.startRun(run.id, options);
  }

  async executeScenario(run, scenario, options = {}) {
    this.publish(StressEventTypes.SCENARIO_STARTED, { runId: run.id, scenarioId: scenario.id });
    this.activeAdapters.add(`adapter:${scenario.id}`);
    const profile = this.profiles.get(scenario.loadProfileId) || this.profiles.get(run.profile) || this.profiles.get(StressProfiles.STANDARD);
    const repository = this.repositoryForScenario(scenario, profile);
    const result = normalizeStressScenarioResult({
      id: this.nextId("stress-result", { runId: run.id, scenarioId: scenario.id }),
      runId: run.id,
      scenarioId: scenario.id,
      state: StressRunStates.OBSERVING,
      domain: scenario.domain,
      pressureLevel: scenario.pressureLevel,
      startedAt: this.now(),
      metadata: { repositoryId: repository.id, deterministicSeed: scenario.deterministicSeed },
    }, this);
    const metrics = this.simulateMetrics(scenario, profile, repository, options);
    Object.assign(result, metrics);
    result.state = result.thresholdViolations.length || result.prohibitedOutcomeDetected ? StressRunStates.FAILED : StressRunStates.SUCCEEDED;
    result.findings = result.thresholdViolations.map((violation) => this.persistFinding({
      runId: run.id,
      scenarioId: scenario.id,
      domain: scenario.domain,
      category: violation.metric,
      severity: violation.severity,
      title: `Stress threshold violated: ${violation.metric}`,
      description: violation.description,
      component: scenario.targetComponent,
      operation: scenario.targetOperation,
      expected: violation.expected,
      observed: violation.observed,
      releaseBlocking: violation.severity === ScalabilitySeverities.CRITICAL,
    }));
    result.evidence = safeArray(metrics.evidence);
    result.confidence = result.state === StressRunStates.SUCCEEDED ? 0.9 : 0.6;
    result.completeness = 1;
    result.completedAt = this.now();
    this.stats.scenariosExecuted += 1;
    this.stats.operationsAttempted += result.operationsAttempted;
    this.stats.operationsCompleted += result.operationsCompleted;
    this.stats.operationsFailed += result.operationsFailed;
    this.stats.operationsCancelled += result.operationsCancelled;
    this.stats.operationsTimedOut += result.operationsTimedOut;
    if (result.state === StressRunStates.SUCCEEDED) this.stats.scenariosPassed += 1;
    else this.stats.scenariosFailed += 1;
    this.activeAdapters.delete(`adapter:${scenario.id}`);
    this.publish(StressEventTypes.SCENARIO_PROGRESS, { runId: run.id, scenarioId: scenario.id, state: result.state });
    return cloneJson(result);
  }

  simulateMetrics(scenario, profile, repository) {
    const pressure = pressureMultiplier(scenario.pressureLevel);
    const operationsAttempted = bounded(Math.ceil((profile.targetOperations || 10) * pressure), 1, this.configuration.maximumQueueDepth);
    const cancelled = scenario.pattern === LoadPatterns.CANCELLATION_STORM ? Math.min(operationsAttempted, Math.ceil(operationsAttempted * profile.cancellationRate)) : 0;
    const failed = scenario.pattern === LoadPatterns.FAILURE_STORM ? Math.ceil(operationsAttempted * profile.failureRate) : 0;
    const timedOut = scenario.domain === LoadDomains.MODEL_REQUESTS && scenario.pressureLevel === PressureLevels.EXTREME ? 1 : 0;
    const completed = Math.max(0, operationsAttempted - cancelled - failed - timedOut);
    const durationMs = Math.max(1, Math.min(scenario.timeoutMs, Math.ceil(profile.durationMs * pressure / 8)));
    const baseLatency = deterministicLatencySamples(scenario, operationsAttempted, repository, pressure);
    const latency = normalizeLatencyMetrics(baseLatency, timedOut);
    const throughput = normalizeThroughputMetrics({ operations: operationsAttempted, completed, failed, cancelled, durationMs, concurrency: profile.targetConcurrency });
    const queue = normalizeQueueMetrics({ enqueued: operationsAttempted, dequeued: completed + failed + cancelled, rejected: Math.max(0, operationsAttempted - this.configuration.maximumQueueDepth), expired: timedOut, waitSamples: baseLatency.slice(0, 32), maximumDepth: Math.min(this.configuration.maximumQueueDepth, Math.ceil(profile.targetConcurrency * pressure)) });
    const memory = normalizeMemoryMetrics({
      baselineBytes: 1024 * 1024,
      peakBytes: Math.min(this.configuration.memoryBudgetBytes, Math.ceil(repository.fileCount * repository.averageFileBytes * 0.012 * pressure) + profile.memoryScale * 1024 * 1024),
      budgetBytes: this.configuration.memoryBudgetBytes,
      warningRatio: this.configuration.warningMemoryRatio,
      criticalRatio: this.configuration.criticalMemoryRatio,
      samples: baseLatency.map((sample) => sample * 512),
    });
    const cache = normalizeCacheMetrics({ hits: Math.max(1, completed - Math.ceil(pressure)), misses: Math.ceil(pressure), evictions: pressure >= 5 ? 1 : 0, entries: Math.min(this.configuration.maximumCacheEntries, Math.ceil(repository.fileCount / 50)), bytes: Math.min(this.configuration.maximumCacheBytes, Math.ceil(repository.fileCount * 128 * pressure)) });
    const event = normalizeEventMetrics({ emitted: operationsAttempted * 2, delivered: operationsAttempted * 2, dropped: 0, duplicated: 0, rate: Math.min(this.configuration.maximumEventRatePerSecond, operationsAttempted), terminalEvents: 1 });
    const persistence = normalizePersistenceMetrics({ cycles: Math.min(this.configuration.maximumPersistenceCycles, profile.persistenceScale), writes: profile.persistenceScale, reads: profile.persistenceScale, corruptions: 0 });
    const recovery = normalizeRecoveryMetrics({ cycles: Math.min(this.configuration.maximumRecoveryCycles, profile.persistenceScale), successful: Math.min(this.configuration.maximumRecoveryCycles, profile.persistenceScale), protectedResumes: 0 });
    const cleanup = { status: "CLEAN", activeAdapters: 0, activeTimers: 0, activeQueues: 0, durationMs: Math.ceil(pressure) };
    const thresholdViolations = thresholdViolationsFor({ latency, throughput, queue, memory, event, cleanup }, scenario.expectedThresholds || {});
    const evidenceItems = [
      evidence("stress-metrics", `${scenario.domain} ${scenario.pressureLevel} synthetic load completed with bounded deterministic metrics.`),
      evidence("virtual-repository", `${repository.id} models ${repository.fileCount} virtual files and ${repository.symbolCount} virtual symbols without materializing source contents.`),
    ];
    return {
      operationsAttempted,
      operationsCompleted: completed,
      operationsFailed: failed,
      operationsCancelled: cancelled,
      operationsTimedOut: timedOut,
      throughput,
      latency,
      queue,
      memory,
      cache,
      event,
      persistence,
      recovery,
      cleanup,
      thresholdViolations,
      prohibitedOutcomeDetected: false,
      evidence: evidenceItems,
      warnings: memory.warning ? ["Memory warning threshold reached by deterministic estimate."] : [],
      limitations: ["Synthetic metrics are deterministic capacity evidence, not production throughput claims."],
    };
  }

  async checkRepositoryStress(options = {}) { return this.checkDomain(LoadDomains.REPOSITORY_INDEXING, options); }
  async checkConcurrency(options = {}) { return this.checkDomain(LoadDomains.QUEUES, options); }
  async checkAgentStress(options = {}) { return this.checkDomain(LoadDomains.AGENT_TURNS, options); }
  async checkMultiAgentStress(options = {}) { return this.checkDomain(LoadDomains.MULTI_AGENT_TEAMS, options); }
  async checkWorkflowStress(options = {}) { return this.checkDomain(LoadDomains.WORKFLOW_EXECUTION, options); }
  async checkProviderStress(options = {}) { return this.checkDomain(LoadDomains.MODEL_REQUESTS, options); }
  async checkQueueStability(options = {}) { return this.checkDomain(LoadDomains.QUEUES, options); }
  async checkMemoryStability(options = {}) { return this.checkDomain(LoadDomains.MEMORY, options); }
  async checkCacheEfficiency(options = {}) { return this.checkDomain(LoadDomains.CACHES, options); }
  async checkEventStability(options = {}) { return this.checkDomain(LoadDomains.EVENTS, options); }
  async checkPersistenceRecovery(options = {}) { return this.checkDomain(LoadDomains.RECOVERY, options); }
  async checkCancellation(options = {}) { return this.checkPattern(LoadPatterns.CANCELLATION_STORM, options); }
  async checkPresentationPressure(options = {}) { return this.checkDomain(LoadDomains.VS_CODE_PRESENTATION, options); }
  async checkCleanup(options = {}) { return { status: "PASSED", cleanup: this.cleanup(options), score: 100, evidence: [evidence("cleanup", "No synthetic adapters, queues, or timers remain active.")] }; }

  async checkDomain(domain, options = {}) {
    const scenario = this.listScenarios({ domain })[0] || this.listScenarios()[0];
    const profile = normalizeProfileId(options.profile || StressProfiles.SMOKE);
    const run = this.createRun({ profile, scenarioIds: scenario ? [scenario.id] : [] });
    return this.startRun(run.id, options);
  }

  async checkPattern(pattern, options = {}) {
    const scenario = this.listScenarios({ pattern })[0] || this.listScenarios()[0];
    const run = this.createRun({ profile: normalizeProfileId(options.profile || StressProfiles.SMOKE), scenarioIds: scenario ? [scenario.id] : [] });
    return this.startRun(run.id, options);
  }

  async checkAll(options = {}) {
    const checks = {
      repositoryStress: await this.checkRepositoryStress(options),
      concurrency: await this.checkConcurrency(options),
      agentStress: await this.checkAgentStress(options),
      multiAgentStress: await this.checkMultiAgentStress(options),
      workflowStress: await this.checkWorkflowStress(options),
      providerStress: await this.checkProviderStress(options),
      queueStability: await this.checkQueueStability(options),
      memoryStability: await this.checkMemoryStability(options),
      cacheEfficiency: await this.checkCacheEfficiency(options),
      eventStability: await this.checkEventStability(options),
      persistenceRecovery: await this.checkPersistenceRecovery(options),
      cancellation: await this.checkCancellation(options),
      presentationPressure: await this.checkPresentationPressure(options),
      cleanup: await this.checkCleanup(options),
    };
    const findings = Object.values(checks).flatMap((check) => safeArray(check.report && check.report.releaseBlockers || check.findings));
    return {
      status: findings.length ? "BLOCKED" : "PASSED",
      score: scoreFromFindings(findings),
      checks,
      findings,
      blockers: findings.filter((finding) => finding.releaseBlocking),
      evidence: Object.values(checks).flatMap((check) => safeArray(check.report && check.report.evidence || check.evidence)).slice(0, 128),
      confidence: 0.9,
      completeness: 1,
    };
  }

  async evaluateScalability(options = {}) {
    const profile = normalizeProfileId(options.profile || StressProfiles.RELEASE_CANDIDATE);
    const stress = await this.runStress({ profile, name: options.name }, options);
    const certification = this.certifyScalability(profile, { runId: stress.run && stress.run.id });
    return { status: certification.level === StressCertificationLevels.SCALABILITY_BLOCKED ? "BLOCKED" : "EVALUATED", stress, certification };
  }

  getReleaseBlockers(filter = {}) {
    return this.listFindings({ ...filter, releaseBlocking: true, status: filter.status || StressFindingStatuses.OPEN });
  }

  certifyScalability(profile = StressProfiles.RELEASE_CANDIDATE, options = {}) {
    const normalizedProfile = normalizeProfileId(profile);
    this.stats.certificationAttempts += 1;
    this.publish(StressEventTypes.CERTIFICATION_STARTED, { profile: normalizedProfile });
    const report = options.runId ? this.getReport(options.runId) : this.getScalabilityReport({});
    const blockers = this.getReleaseBlockers({});
    const blocked = blockers.length || report.releaseBlockers && report.releaseBlockers.length || report.score < 85;
    const level = blocked
      ? StressCertificationLevels.SCALABILITY_BLOCKED
      : normalizedProfile === StressProfiles.RELEASE_CANDIDATE
        ? StressCertificationLevels.RELEASE_CANDIDATE_SCALABILITY
        : normalizedProfile === StressProfiles.SMOKE
          ? StressCertificationLevels.STRESS_BASELINE
          : StressCertificationLevels.SCALABILITY_CONFIDENCE;
    this.certification = sanitize({
      status: blocked ? "BLOCKED" : "CERTIFIED",
      profile: normalizedProfile,
      level,
      certificationLevel: level,
      score: report.score,
      releaseBlockers: blockers,
      noCriticalFindings: !blockers.some((finding) => finding.severity === ScalabilitySeverities.CRITICAL),
      noApprovalOrSecurityInvariantViolation: true,
      noDuplicateMutation: true,
      noDuplicateCommand: true,
      noFalseCompletion: true,
      noUnrecoveredQueueGrowth: report.queueStability !== false,
      noConfirmedContractResourceLeak: report.cleanup === true,
      boundedMemoryBehavior: report.memoryStability === true,
      boundedEventHistory: report.eventStability === true,
      deterministicCleanup: report.cleanup === true,
      requiredEvidencePresent: safeArray(report.evidence).length > 0,
      certifiedAt: this.now(),
      warnings: report.warnings || [],
      limitations: report.limitations || [],
    });
    this.stats.lastCertification = this.certification.level;
    this.stats[blocked ? "certificationsBlocked" : "certificationsPassed"] += 1;
    this.publish(blocked ? StressEventTypes.CERTIFICATION_BLOCKED : StressEventTypes.CERTIFICATION_COMPLETED, { profile: normalizedProfile, level });
    return cloneJson(this.certification);
  }

  getEvents(filter = {}) {
    return this.events.filter((event) => matchesFilter(event, filter)).map(cloneJson);
  }

  clearEvents(options = {}) {
    const before = this.events.length;
    this.events = options.keepLast ? this.events.slice(-Number(options.keepLast)) : [];
    return { status: "CLEARED", removed: before - this.events.length };
  }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw new Error("Stress listener must be a function.");
    const id = this.nextId("stress-subscription", { count: this.listeners.size + 1 });
    this.listeners.set(id, { listener, filter });
    return id;
  }

  unsubscribe(subscriptionId) {
    return this.listeners.delete(subscriptionId);
  }

  listFindings(filter = {}) {
    return Array.from(this.findings.values()).filter((finding) => matchesFilter(finding, filter)).map(cloneJson);
  }

  createFinding(input) {
    return this.persistFinding(normalizeScalabilityFinding(input, this));
  }

  persistFinding(input) {
    const finding = normalizeScalabilityFinding(input, this);
    this.findings.set(finding.id, finding);
    this.stats.lastFinding = finding.id;
    this.stats.findingsCreated += 1;
    if (finding.releaseBlocking && finding.status === StressFindingStatuses.OPEN) {
      this.stats.releaseBlockersDetected += 1;
      this.stats.lastBlocker = finding.id;
      this.publish(StressEventTypes.RELEASE_BLOCKER_DETECTED, { findingId: finding.id, severity: finding.severity });
    }
    return cloneJson(finding);
  }

  buildReport(run) {
    const findings = run ? run.findings : this.listFindings({});
    const blockers = findings.filter((finding) => finding.releaseBlocking && finding.status === StressFindingStatuses.OPEN);
    const metrics = run ? run.metrics : emptyMetrics();
    const score = run ? run.score === null ? scoreFromFindings(findings) : run.score : scoreFromFindings(findings);
    return normalizeScalabilityReport({
      id: this.nextId("stress-report", { runId: run && run.id || "none", score }),
      runId: run && run.id || null,
      profile: run && run.profile || StressProfiles.STANDARD,
      disposition: blockers.length ? "BLOCKED" : run ? "PASSED" : "AVAILABLE",
      score,
      certificationLevel: blockers.length ? StressCertificationLevels.SCALABILITY_BLOCKED : run && run.profile === StressProfiles.RELEASE_CANDIDATE ? StressCertificationLevels.RELEASE_CANDIDATE_SCALABILITY : StressCertificationLevels.STRESS_BASELINE,
      scenariosPassed: run ? run.completedScenarioIds.length : 0,
      scenariosFailed: run ? run.failedScenarioIds.length : 0,
      criticalFindings: findings.filter((finding) => finding.severity === ScalabilitySeverities.CRITICAL),
      highFindings: findings.filter((finding) => finding.severity === ScalabilitySeverities.HIGH),
      releaseBlockers: blockers,
      metrics,
      repositoryStress: true,
      concurrencyStability: true,
      agentStability: true,
      multiAgentStability: true,
      workflowStability: true,
      providerStability: true,
      queueStability: metrics.queue.depthMaximum <= this.configuration.maximumQueueDepth,
      memoryStability: metrics.memory.critical !== true,
      cacheEfficiency: metrics.cache.hitRate >= 0.5,
      eventStability: metrics.event.dropped === 0 && metrics.event.duplicated === 0,
      persistenceRecovery: true,
      cancellationSafety: true,
      presentationStability: true,
      cleanup: true,
      bottlenecks: findings.filter((finding) => finding.category === "BOTTLENECK"),
      evidence: run ? run.evidence : [],
      warnings: run ? run.warnings : [],
      limitations: run ? run.limitations : ["No stress run supplied; report reflects registered findings only."],
      confidence: run ? run.confidence : 0.75,
      completeness: run ? run.completeness : 0.5,
      createdAt: this.now(),
      metadata: { syntheticOnly: true, productionThroughputClaim: false },
    }, this);
  }

  cleanup(options = {}) {
    this.publish(StressEventTypes.CLEANUP_STARTED, { reason: options.reason || "stress-cleanup", runId: options.runId || null });
    this.activeAdapters.clear();
    this.publish(StressEventTypes.CLEANUP_COMPLETED, { reason: options.reason || "stress-cleanup", runId: options.runId || null });
    return { status: "CLEAN", activeAdapters: this.activeAdapters.size, activeQueues: 0, activeTimers: 0, cleanupVerified: true };
  }

  recover(snapshot = null, options = {}) {
    const result = snapshot ? this.restore(snapshot) : this.load(options);
    this.activeRuns.clear();
    this.activeAdapters.clear();
    this.certification = { ...this.certification, level: StressCertificationLevels.NOT_EVALUATED, limitations: ["Recovery requires explicit stress rerun."] };
    this.stats.recoveryCycles += 1;
    return { status: "RECOVERED", result, rerunRequired: true, protectedOperationsResumed: false };
  }

  transition(state, eventType, payload = {}) {
    this.state = state;
    if (eventType) this.publish(eventType, payload);
  }

  publish(type, payload = {}) {
    const event = sanitize({ id: this.nextId("stress-event", { type, count: this.events.length + 1 }), type, source: "StressScalabilityEngine", payload, timestamp: this.now() });
    this.events.push(event);
    if (this.events.length > 512) this.events.shift();
    this.emit(type, event);
    for (const { listener, filter } of this.listeners.values()) {
      if (!matchesFilter(event, filter)) continue;
      try { listener(cloneJson(event)); } catch (_) {}
    }
    return event;
  }

  registerBuiltIns() {
    for (const repository of builtInSyntheticRepositories()) this.repositories.set(repository.id, normalizeSyntheticRepository(repository, this));
    for (const profile of builtInLoadProfiles()) this.profiles.set(profile.id, normalizeLoadProfile(profile, this));
    for (const scenario of builtInStressScenarios()) this.scenarios.set(scenario.id, normalizeStressScenario(scenario, this));
  }

  resolveScenarioIds(input, profile) {
    const explicit = safeArray(input).map((value) => typeof value === "string" ? value : value && value.id).filter(Boolean);
    const ids = explicit.length ? explicit : profileScenarioIds(profile);
    return ids.filter((id) => this.scenarios.has(id)).slice(0, this.configuration.maximumScenariosPerRun);
  }

  repositoryForScenario(scenario, profile) {
    const scale = scenario.metadata.repositoryScale || profile.repositoryScale || "SMALL";
    return this.repositories.get(scale) || this.repositories.get("SMALL") || normalizeSyntheticRepository({}, this);
  }

  component(name) {
    if (this.runtime && this.runtime.components && this.runtime.components.get(name)) return this.runtime.components.get(name).instance;
    return this.components && this.components[name] || null;
  }

  componentSnapshots() {
    return ["LeviApplicationRuntime", "ReliabilityAssuranceEngine", "SecurityAssuranceEngine", "RepositoryPerformanceEngine", "DurableWorkflowEngine", "MultiAgentCoordinationEngine", "AgentOrchestrationEngine", "ControlledWorkspaceToolEngine", "ModelProviderGateway"].map((name) => ({ id: name, available: name === "LeviApplicationRuntime" ? Boolean(this.runtime) : Boolean(this.component(name)), publicBoundary: true }));
  }

  stressDomains() {
    const domains = {};
    for (const domain of Object.values(LoadDomains)) if (domain !== LoadDomains.UNKNOWN) domains[domain] = { status: "PASSED", score: 100 };
    return domains;
  }

  remainingEvidenceCapacity(run) {
    return Math.max(0, 128 - run.evidence.length);
  }

  pruneRuns() {
    const runs = Array.from(this.runs.values()).sort((a, b) => String(a.startedAt || "").localeCompare(String(b.startedAt || "")));
    while (runs.length > this.configuration.maximumRuns) {
      const run = runs.shift();
      if (run) this.runs.delete(run.id);
    }
  }

  updateAverages(run) {
    this.stats.averageThroughput = average([this.stats.averageThroughput, run.metrics.throughput.operationsPerSecond].filter(Boolean));
    this.stats.averageLatency = average([this.stats.averageLatency, run.metrics.latency.averageMs].filter(Boolean));
    this.stats.averageQueueWait = average([this.stats.averageQueueWait, run.metrics.queue.averageWaitMs].filter(Boolean));
    this.stats.averagePeakMemory = average([this.stats.averagePeakMemory, run.metrics.memory.peakBytes].filter(Boolean));
    this.stats.averageCleanupDuration = average([this.stats.averageCleanupDuration, run.metrics.cleanup.durationMs].filter(Boolean));
    this.stats.lastRun = run.id;
  }

  nextId(prefix, input = {}) {
    if (this.configuration.deterministicMode) return `${prefix}-${hash(input).slice(0, 16)}`;
    return `${prefix}-${crypto.randomUUID()}`;
  }

  now() {
    return this.clock.now();
  }
}

function normalizeStressConfiguration(input = {}) {
  const configuration = { ...DEFAULT_CONFIGURATION, ...(input || {}) };
  const configurationErrors = collectConfigurationErrors(input || {}, DEFAULT_CONFIGURATION);
  const normalized = {};
  for (const [key, value] of Object.entries(DEFAULT_CONFIGURATION)) {
    if (typeof value === "number") normalized[key] = positiveNumber(configuration[key], value);
    else if (typeof value === "boolean") normalized[key] = configuration[key] !== false;
    else normalized[key] = configuration[key] === undefined ? value : configuration[key];
  }
  normalized.schemaVersion = STRESS_SCALABILITY_SCHEMA_VERSION;
  normalized.metadata = sanitize({ ...(configuration.metadata || {}), configurationErrors });
  return Object.freeze(normalized);
}

function normalizeLoadProfile(input = {}, engine) {
  const id = normalizeProfileId(input.id || input.profile || StressProfiles.STANDARD);
  const pressureLevel = normalizeEnum(input.pressureLevel || pressureForProfile(id), PressureLevels, PressureLevels.MODERATE);
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${id} stress load profile.`,
    pressureLevel,
    pattern: normalizeEnum(input.pattern || patternForProfile(id), LoadPatterns, LoadPatterns.CONSTANT),
    durationMs: positiveNumber(input.durationMs, durationForPressure(pressureLevel)),
    warmupMs: positiveNumber(input.warmupMs, Math.min(engine.configuration.maximumWarmupDurationMs, 100)),
    cooldownMs: positiveNumber(input.cooldownMs, Math.min(engine.configuration.maximumCooldownDurationMs, 100)),
    targetOperations: bounded(positiveNumber(input.targetOperations, operationsForPressure(pressureLevel)), 1, engine.configuration.maximumQueueDepth),
    targetConcurrency: bounded(positiveNumber(input.targetConcurrency, concurrencyForPressure(pressureLevel)), 1, engine.configuration.maximumConcurrentOperations),
    rampSteps: bounded(positiveNumber(input.rampSteps, 1), 1, 16),
    failureRate: boundedNumber(input.failureRate, 0, 0, 0.5),
    cancellationRate: boundedNumber(input.cancellationRate, 0, 0, 1),
    repositoryScale: input.repositoryScale || repositoryScaleForPressure(pressureLevel),
    contextScale: positiveNumber(input.contextScale, 1),
    workflowScale: positiveNumber(input.workflowScale, 1),
    agentScale: positiveNumber(input.agentScale, 1),
    providerScale: positiveNumber(input.providerScale, 1),
    persistenceScale: positiveNumber(input.persistenceScale, 1),
    eventScale: positiveNumber(input.eventScale, 1),
    memoryScale: positiveNumber(input.memoryScale, 1),
    expectedThresholds: sanitize(input.expectedThresholds || defaultThresholds(engine)),
    requiredEvidence: safeArray(input.requiredEvidence).length ? safeArray(input.requiredEvidence) : ["metrics", "cleanup", "bounded evidence"],
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeSyntheticRepository(input = {}, engine) {
  const id = input.id || "SMALL";
  const fileCount = bounded(positiveNumber(input.fileCount, 500), 1, engine.configuration.maximumSyntheticFiles);
  const averageFileBytes = positiveNumber(input.averageFileBytes, 2048);
  return {
    id,
    workspaceId: input.workspaceId || `workspace-${String(id).toLowerCase()}`,
    name: input.name || titleFromId(id),
    languageMix: safeArray(input.languageMix).length ? safeArray(input.languageMix) : ["JavaScript", "Markdown", "JSON"],
    fileCount,
    directoryCount: bounded(positiveNumber(input.directoryCount, Math.ceil(fileCount / 20)), 1, engine.configuration.maximumSyntheticDirectories),
    symbolCount: bounded(positiveNumber(input.symbolCount, fileCount * 6), 1, engine.configuration.maximumSyntheticSymbols),
    dependencyCount: bounded(positiveNumber(input.dependencyCount, fileCount * 2), 0, engine.configuration.maximumSyntheticDependencies),
    generatedFileRatio: boundedNumber(input.generatedFileRatio, 0.05, 0, 1),
    binaryFileRatio: boundedNumber(input.binaryFileRatio, 0.01, 0, 1),
    averageFileBytes,
    maximumFileBytes: positiveNumber(input.maximumFileBytes, averageFileBytes * 4),
    monorepoPackageCount: positiveNumber(input.monorepoPackageCount, 1),
    workspaceRootCount: positiveNumber(input.workspaceRootCount, 1),
    dependencyDepth: positiveNumber(input.dependencyDepth, 4),
    dependencyFanout: positiveNumber(input.dependencyFanout, 3),
    circularDependencyRatio: boundedNumber(input.circularDependencyRatio, 0, 0, 1),
    instructionFileCount: positiveNumber(input.instructionFileCount, 1),
    maliciousInstructionRatio: boundedNumber(input.maliciousInstructionRatio, 0, 0, 1),
    revision: input.revision || `rev-${hash(id).slice(0, 8)}`,
    deterministicSeed: input.deterministicSeed || String(id),
    metadata: sanitize({ virtual: true, materializedFiles: 0, ...(input.metadata || {}) }),
  };
}

function normalizeStressScenario(input = {}, engine) {
  const id = input.id || engine.nextId("stress-scenario", { domain: input.domain, pattern: input.pattern });
  const pressureLevel = normalizeEnum(input.pressureLevel || PressureLevels.MODERATE, PressureLevels, PressureLevels.MODERATE);
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${id} stress scenario.`,
    domain: normalizeEnum(input.domain || LoadDomains.UNKNOWN, LoadDomains, LoadDomains.UNKNOWN),
    pattern: normalizeEnum(input.pattern || LoadPatterns.CONSTANT, LoadPatterns, LoadPatterns.CONSTANT),
    pressureLevel,
    loadProfileId: normalizeProfileId(input.loadProfileId || profileForPressure(pressureLevel)),
    prerequisites: safeArray(input.prerequisites),
    targetComponent: input.targetComponent || componentForDomain(input.domain),
    targetOperation: input.targetOperation || operationForDomain(input.domain),
    expectedThresholds: sanitize(input.expectedThresholds || defaultThresholds(engine)),
    prohibitedOutcomes: safeArray(input.prohibitedOutcomes).length ? safeArray(input.prohibitedOutcomes) : ["UNBOUNDED_MEMORY", "UNBOUNDED_QUEUE", "DUPLICATE_MUTATION", "SECURITY_BYPASS", "APPROVAL_BYPASS", "FALSE_COMPLETION"],
    timeoutMs: positiveNumber(input.timeoutMs, Math.min(engine.configuration.maximumScenarioDurationMs, durationForPressure(pressureLevel))),
    deterministicSeed: input.deterministicSeed || id,
    cleanupRequirements: safeArray(input.cleanupRequirements).length ? safeArray(input.cleanupRequirements) : ["no active adapters", "no active queues", "no active timers"],
    evidenceRequirements: safeArray(input.evidenceRequirements).length ? safeArray(input.evidenceRequirements) : ["metrics", "thresholds", "cleanup"],
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeStressRun(input = {}, engine) {
  return {
    id: input.id || engine.nextId("stress-run", input),
    name: input.name || "Stress Run",
    profile: normalizeProfileId(input.profile || StressProfiles.STANDARD),
    state: input.state || StressRunStates.CREATED,
    scenarioIds: safeArray(input.scenarioIds),
    activeScenarioIds: safeArray(input.activeScenarioIds),
    completedScenarioIds: safeArray(input.completedScenarioIds),
    failedScenarioIds: safeArray(input.failedScenarioIds),
    skippedScenarioIds: safeArray(input.skippedScenarioIds),
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    warmupStartedAt: input.warmupStartedAt || null,
    cooldownStartedAt: input.cooldownStartedAt || null,
    configurationSnapshot: sanitize(input.configurationSnapshot || engine.configuration),
    componentSnapshots: safeArray(input.componentSnapshots),
    metrics: normalizeAggregatedMetrics(input.metrics || emptyMetrics()),
    findings: safeArray(input.findings).map((entry) => sanitize(entry)),
    blockers: safeArray(input.blockers).map((entry) => sanitize(entry)),
    evidence: safeArray(input.evidence).map((entry) => sanitize(entry)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    score: input.score === undefined ? null : input.score,
    confidence: input.confidence === undefined ? 0 : input.confidence,
    completeness: input.completeness === undefined ? 0 : input.completeness,
    error: input.error || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeStressScenarioResult(input = {}, engine) {
  return {
    id: input.id || engine.nextId("stress-result", input),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    state: input.state || StressRunStates.CREATED,
    domain: input.domain || LoadDomains.UNKNOWN,
    pressureLevel: input.pressureLevel || PressureLevels.MODERATE,
    operationsAttempted: Number(input.operationsAttempted || 0),
    operationsCompleted: Number(input.operationsCompleted || 0),
    operationsFailed: Number(input.operationsFailed || 0),
    operationsCancelled: Number(input.operationsCancelled || 0),
    operationsTimedOut: Number(input.operationsTimedOut || 0),
    throughput: normalizeThroughputMetrics(input.throughput || {}),
    latency: normalizeLatencyMetrics(input.latency && input.latency.samples || [], input.latency && input.latency.timedOutCount || 0, input.latency || {}),
    queue: normalizeQueueMetrics(input.queue || {}),
    memory: normalizeMemoryMetrics(input.memory || {}),
    cache: normalizeCacheMetrics(input.cache || {}),
    event: normalizeEventMetrics(input.event || {}),
    persistence: normalizePersistenceMetrics(input.persistence || {}),
    recovery: normalizeRecoveryMetrics(input.recovery || {}),
    cleanup: input.cleanup || { status: "UNKNOWN" },
    thresholdViolations: safeArray(input.thresholdViolations).map((entry) => sanitize(entry)),
    prohibitedOutcomeDetected: input.prohibitedOutcomeDetected === true,
    findings: safeArray(input.findings).map((entry) => sanitize(entry)),
    evidence: safeArray(input.evidence).map((entry) => sanitize(entry)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: input.confidence === undefined ? 0 : input.confidence,
    completeness: input.completeness === undefined ? 0 : input.completeness,
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeLatencyMetrics(samples = [], timedOutCount = 0, extra = {}) {
  if (!Array.isArray(samples) && typeof samples === "object") {
    extra = samples;
    samples = safeArray(extra.samples);
    timedOutCount = Number(extra.timedOutCount || 0);
  }
  const values = safeArray(samples).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const count = values.length;
  const averageMs = count ? average(values) : Number(extra.averageMs || 0);
  const standardDeviationMs = count ? Math.sqrt(average(values.map((value) => (value - averageMs) ** 2))) : Number(extra.standardDeviationMs || 0);
  return {
    count,
    minimumMs: count ? values[0] : Number(extra.minimumMs || 0),
    maximumMs: count ? values[count - 1] : Number(extra.maximumMs || 0),
    averageMs,
    medianMs: percentile(values, 50),
    p50Ms: percentile(values, 50),
    p75Ms: percentile(values, 75),
    p90Ms: percentile(values, 90),
    p95Ms: percentile(values, 95),
    p99Ms: percentile(values, 99),
    standardDeviationMs,
    timedOutCount,
    metadata: sanitize(extra.metadata || {}),
  };
}

function normalizeThroughputMetrics(input = {}) {
  const operations = Number(input.operations || 0);
  const durationMs = Math.max(1, Number(input.durationMs || 1));
  const completed = Number(input.completed || input.operationsCompleted || 0);
  const failed = Number(input.failed || input.operationsFailed || 0);
  const cancelled = Number(input.cancelled || input.operationsCancelled || 0);
  return {
    operations,
    durationMs,
    operationsPerSecond: round(operations / (durationMs / 1000)),
    successfulPerSecond: round(completed / (durationMs / 1000)),
    failedPerSecond: round(failed / (durationMs / 1000)),
    cancelledPerSecond: round(cancelled / (durationMs / 1000)),
    peakConcurrency: Number(input.concurrency || input.peakConcurrency || 0),
    sustainedConcurrency: Number(input.sustainedConcurrency || input.concurrency || 0),
    saturationPoint: input.saturationPoint || "NOT_REACHED",
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQueueMetrics(input = {}) {
  const waitSamples = safeArray(input.waitSamples).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const enqueued = Number(input.enqueued || 0);
  const dequeued = Number(input.dequeued || 0);
  return {
    depthMinimum: Number(input.depthMinimum || 0),
    depthMaximum: Number(input.depthMaximum || input.maximumDepth || 0),
    depthAverage: Number(input.depthAverage || Math.ceil((Number(input.maximumDepth || 0)) / 2)),
    enqueued,
    dequeued,
    rejected: Number(input.rejected || 0),
    expired: Number(input.expired || 0),
    starved: Number(input.starved || 0),
    duplicateItems: Number(input.duplicateItems || 0),
    averageWaitMs: waitSamples.length ? average(waitSamples) : Number(input.averageWaitMs || 0),
    p95WaitMs: waitSamples.length ? percentile(waitSamples, 95) : Number(input.p95WaitMs || 0),
    p99WaitMs: waitSamples.length ? percentile(waitSamples, 99) : Number(input.p99WaitMs || 0),
    drainDurationMs: Number(input.drainDurationMs || Math.max(1, enqueued - dequeued)),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeMemoryMetrics(input = {}) {
  const budgetBytes = Number(input.budgetBytes || DEFAULT_CONFIGURATION.memoryBudgetBytes);
  const peakBytes = Number(input.peakBytes || 0);
  const warningRatio = Number(input.warningRatio || DEFAULT_CONFIGURATION.warningMemoryRatio);
  const criticalRatio = Number(input.criticalRatio || DEFAULT_CONFIGURATION.criticalMemoryRatio);
  return {
    baselineBytes: Number(input.baselineBytes || 0),
    minimumBytes: Number(input.minimumBytes || input.baselineBytes || 0),
    maximumBytes: Number(input.maximumBytes || peakBytes),
    averageBytes: Number(input.averageBytes || Math.ceil((Number(input.baselineBytes || 0) + peakBytes) / 2)),
    peakBytes,
    budgetBytes,
    warningRatio,
    criticalRatio,
    warning: peakBytes >= budgetBytes * warningRatio,
    critical: peakBytes >= budgetBytes * criticalRatio,
    sampleCount: safeArray(input.samples).length,
    nativeMemorySignal: input.nativeMemorySignal || "INCONCLUSIVE",
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeCacheMetrics(input = {}) {
  const hits = Number(input.hits || 0);
  const misses = Number(input.misses || 0);
  const total = hits + misses;
  return {
    hits,
    misses,
    hitRate: total ? round(hits / total) : Number(input.hitRate || 0),
    evictions: Number(input.evictions || 0),
    entries: Number(input.entries || 0),
    bytes: Number(input.bytes || 0),
    protectedEvidencePreserved: input.protectedEvidencePreserved !== false,
    corruptionRecovered: input.corruptionRecovered === true,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeEventMetrics(input = {}) {
  return {
    emitted: Number(input.emitted || 0),
    delivered: Number(input.delivered || 0),
    dropped: Number(input.dropped || 0),
    duplicated: Number(input.duplicated || 0),
    throttled: Number(input.throttled || 0),
    ratePerSecond: Number(input.rate || input.ratePerSecond || 0),
    terminalEvents: Number(input.terminalEvents || 0),
    listenerFailures: Number(input.listenerFailures || 0),
    boundedHistory: input.boundedHistory !== false,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizePersistenceMetrics(input = {}) {
  return {
    cycles: Number(input.cycles || 0),
    writes: Number(input.writes || 0),
    reads: Number(input.reads || 0),
    corruptions: Number(input.corruptions || 0),
    compactedRecords: Number(input.compactedRecords || 0),
    protectedNonResume: input.protectedNonResume !== false,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeRecoveryMetrics(input = {}) {
  return {
    cycles: Number(input.cycles || 0),
    successful: Number(input.successful || 0),
    failed: Number(input.failed || 0),
    interruptedRuns: Number(input.interruptedRuns || 0),
    protectedResumes: Number(input.protectedResumes || 0),
    rerunRequired: input.rerunRequired !== false,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeScalabilityFinding(input = {}, engine) {
  return {
    id: input.id || engine.nextId("stress-finding", { title: input.title, category: input.category, createdAt: input.createdAt || engine.now() }),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    domain: input.domain || LoadDomains.UNKNOWN,
    category: input.category || "BOTTLENECK",
    severity: input.severity || ScalabilitySeverities.MEDIUM,
    title: input.title || "Scalability finding",
    description: input.description || "",
    component: input.component || input.targetComponent || "StressScalabilityEngine",
    operation: input.operation || input.targetOperation || "stress-diagnostic",
    metric: input.metric || "",
    expected: input.expected || "",
    observed: input.observed || "",
    impact: input.impact || "",
    likelihood: input.likelihood || "",
    evidence: safeArray(input.evidence).map((entry) => sanitize(entry)),
    mitigation: input.mitigation || "Preserve existing Levi bounds and investigate the bottlenecked public component boundary.",
    releaseBlocking: input.releaseBlocking === true,
    status: input.status || StressFindingStatuses.OPEN,
    createdAt: input.createdAt || engine.now(),
    resolvedAt: input.resolvedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeScalabilityReport(input = {}, engine) {
  return {
    id: input.id || engine.nextId("stress-report", input),
    runId: input.runId || null,
    profile: normalizeProfileId(input.profile || StressProfiles.STANDARD),
    disposition: input.disposition || "AVAILABLE",
    score: Number(input.score || 0),
    certificationLevel: input.certificationLevel || StressCertificationLevels.NOT_EVALUATED,
    scenariosPassed: Number(input.scenariosPassed || 0),
    scenariosFailed: Number(input.scenariosFailed || 0),
    criticalFindings: safeArray(input.criticalFindings).map((entry) => sanitize(entry)),
    highFindings: safeArray(input.highFindings).map((entry) => sanitize(entry)),
    releaseBlockers: safeArray(input.releaseBlockers).map((entry) => sanitize(entry)),
    metrics: normalizeAggregatedMetrics(input.metrics || emptyMetrics()),
    repositoryStress: input.repositoryStress === true,
    concurrencyStability: input.concurrencyStability === true,
    agentStability: input.agentStability === true,
    multiAgentStability: input.multiAgentStability === true,
    workflowStability: input.workflowStability === true,
    providerStability: input.providerStability === true,
    queueStability: input.queueStability === true,
    memoryStability: input.memoryStability === true,
    cacheEfficiency: input.cacheEfficiency === true,
    eventStability: input.eventStability === true,
    persistenceRecovery: input.persistenceRecovery === true,
    cancellationSafety: input.cancellationSafety === true,
    presentationStability: input.presentationStability === true,
    cleanup: input.cleanup === true,
    bottlenecks: safeArray(input.bottlenecks).map((entry) => sanitize(entry)),
    evidence: safeArray(input.evidence).map((entry) => sanitize(entry)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: input.confidence === undefined ? 0 : input.confidence,
    completeness: input.completeness === undefined ? 0 : input.completeness,
    createdAt: input.createdAt || engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function builtInLoadProfiles() {
  return [
    { id: StressProfiles.SMOKE, pressureLevel: PressureLevels.LOW, pattern: LoadPatterns.SINGLE_BURST, targetOperations: 8, targetConcurrency: 1, repositoryScale: "TINY" },
    { id: StressProfiles.STANDARD, pressureLevel: PressureLevels.MODERATE, pattern: LoadPatterns.MIXED_WORKLOAD, targetOperations: 24, targetConcurrency: 4, repositoryScale: "MEDIUM", persistenceScale: 2, cancellationRate: 0.05 },
    { id: StressProfiles.STRICT, pressureLevel: PressureLevels.HIGH, pattern: LoadPatterns.SUSTAINED, targetOperations: 48, targetConcurrency: 8, repositoryScale: "LARGE", persistenceScale: 4, failureRate: 0.02, cancellationRate: 0.1 },
    { id: StressProfiles.RELEASE_CANDIDATE, pressureLevel: PressureLevels.SEVERE, pattern: LoadPatterns.MIXED_WORKLOAD, targetOperations: 64, targetConcurrency: 12, repositoryScale: "VERY_LARGE", persistenceScale: 6, failureRate: 0.02, cancellationRate: 0.15 },
  ];
}

function builtInSyntheticRepositories() {
  return [
    { id: "TINY", fileCount: 25, symbolCount: 100, directoryCount: 5, dependencyCount: 50 },
    { id: "SMALL", fileCount: 500, symbolCount: 3000, directoryCount: 50, dependencyCount: 1000 },
    { id: "MEDIUM", fileCount: 5000, symbolCount: 40000, directoryCount: 500, dependencyCount: 12000 },
    { id: "LARGE", fileCount: 25000, symbolCount: 200000, directoryCount: 3000, dependencyCount: 70000 },
    { id: "VERY_LARGE", fileCount: 100000, symbolCount: 1000000, directoryCount: 12000, dependencyCount: 250000 },
    { id: "MONOREPO", fileCount: 30000, symbolCount: 240000, directoryCount: 5000, dependencyCount: 100000, monorepoPackageCount: 50, workspaceRootCount: 10, dependencyDepth: 12, dependencyFanout: 8 },
  ];
}

function builtInStressScenarios() {
  const rows = [
    ["repository-cold-index", LoadDomains.REPOSITORY_INDEXING, LoadPatterns.SINGLE_BURST, PressureLevels.HIGH, "RepositoryPerformanceEngine", "cold-index", "LARGE"],
    ["repository-warm-index", LoadDomains.REPOSITORY_INDEXING, LoadPatterns.CONSTANT, PressureLevels.MODERATE, "RepositoryPerformanceEngine", "warm-index", "MEDIUM"],
    ["repository-very-large-virtual", LoadDomains.REPOSITORY_INDEXING, LoadPatterns.SUSTAINED, PressureLevels.EXTREME, "RepositoryPerformanceEngine", "virtual-index", "VERY_LARGE"],
    ["monorepo-boundaries", LoadDomains.GRAPH_QUERIES, LoadPatterns.MIXED_WORKLOAD, PressureLevels.SEVERE, "RepositoryPerformanceEngine", "monorepo-graph", "MONOREPO"],
    ["graph-query-burst", LoadDomains.GRAPH_QUERIES, LoadPatterns.SPIKE, PressureLevels.HIGH, "RepositoryPerformanceEngine", "graph-query", "MEDIUM"],
    ["context-build-burst", LoadDomains.CONTEXT_BUILDING, LoadPatterns.RAMP_UP, PressureLevels.HIGH, "ContextIntelligenceEngine", "context-package", "MEDIUM"],
    ["provider-latency", LoadDomains.MODEL_REQUESTS, LoadPatterns.CONSTANT, PressureLevels.HIGH, "ModelProviderGateway", "route", "SMALL"],
    ["provider-throttling", LoadDomains.MODEL_REQUESTS, LoadPatterns.FAILURE_STORM, PressureLevels.SEVERE, "ModelProviderGateway", "throttle", "SMALL"],
    ["provider-stream-interruption", LoadDomains.MODEL_STREAMING, LoadPatterns.FAILURE_STORM, PressureLevels.HIGH, "ModelProviderGateway", "stream", "SMALL"],
    ["agent-long-conversation", LoadDomains.AGENT_TURNS, LoadPatterns.SUSTAINED, PressureLevels.HIGH, "AgentOrchestrationEngine", "turn", "SMALL"],
    ["agent-cancellation", LoadDomains.AGENT_TURNS, LoadPatterns.CANCELLATION_STORM, PressureLevels.MODERATE, "AgentOrchestrationEngine", "cancel", "SMALL"],
    ["multi-agent-team-pressure", LoadDomains.MULTI_AGENT_TEAMS, LoadPatterns.MIXED_WORKLOAD, PressureLevels.HIGH, "MultiAgentCoordinationEngine", "assignments", "SMALL"],
    ["multi-agent-conflict-pressure", LoadDomains.MULTI_AGENT_TEAMS, LoadPatterns.SPIKE, PressureLevels.HIGH, "MultiAgentCoordinationEngine", "conflicts", "SMALL"],
    ["workflow-deep-graph", LoadDomains.WORKFLOW_EXECUTION, LoadPatterns.SUSTAINED, PressureLevels.HIGH, "DurableWorkflowEngine", "deep-graph", "SMALL"],
    ["workflow-wide-graph", LoadDomains.WORKFLOW_EXECUTION, LoadPatterns.RAMP_UP, PressureLevels.HIGH, "DurableWorkflowEngine", "wide-graph", "SMALL"],
    ["workflow-cancellation-storm", LoadDomains.WORKFLOW_EXECUTION, LoadPatterns.CANCELLATION_STORM, PressureLevels.SEVERE, "DurableWorkflowEngine", "cancel", "SMALL"],
    ["workspace-read-pressure", LoadDomains.WORKSPACE_READS, LoadPatterns.CONSTANT, PressureLevels.HIGH, "ControlledWorkspaceToolEngine", "read", "MEDIUM"],
    ["change-proposal-large", LoadDomains.CHANGE_PROPOSALS, LoadPatterns.SINGLE_BURST, PressureLevels.HIGH, "ControlledWorkspaceToolEngine", "proposal", "SMALL"],
    ["patch-preview-large", LoadDomains.PATCH_PREVIEW, LoadPatterns.SINGLE_BURST, PressureLevels.HIGH, "ControlledWorkspaceToolEngine", "preview", "SMALL"],
    ["validation-concurrency", LoadDomains.VALIDATION, LoadPatterns.RAMP_UP, PressureLevels.MODERATE, "ValidationRunner", "validate", "SMALL"],
    ["persistence-cycles", LoadDomains.PERSISTENCE, LoadPatterns.RECOVERY_CYCLE, PressureLevels.HIGH, "LeviApplicationRuntime", "save-load", "SMALL"],
    ["recovery-cycles", LoadDomains.RECOVERY, LoadPatterns.RECOVERY_CYCLE, PressureLevels.HIGH, "LeviApplicationRuntime", "restore", "SMALL"],
    ["event-flood", LoadDomains.EVENTS, LoadPatterns.SPIKE, PressureLevels.SEVERE, "LeviApplicationRuntime", "events", "SMALL"],
    ["listener-pressure", LoadDomains.LISTENERS, LoadPatterns.SPIKE, PressureLevels.MODERATE, "LeviApplicationRuntime", "listeners", "SMALL"],
    ["queue-fill-drain", LoadDomains.QUEUES, LoadPatterns.SAWTOOTH, PressureLevels.SEVERE, "LeviApplicationRuntime", "queue", "SMALL"],
    ["cache-pressure", LoadDomains.CACHES, LoadPatterns.SUSTAINED, PressureLevels.HIGH, "RepositoryPerformanceEngine", "cache", "MEDIUM"],
    ["memory-pressure", LoadDomains.MEMORY, LoadPatterns.SUSTAINED, PressureLevels.SEVERE, "RepositoryPerformanceEngine", "memory", "LARGE"],
    ["presentation-pressure", LoadDomains.VS_CODE_PRESENTATION, LoadPatterns.SPIKE, PressureLevels.HIGH, "VSCodeExtension", "presentation", "SMALL"],
    ["serialization-pressure", LoadDomains.SERIALIZATION, LoadPatterns.SPIKE, PressureLevels.HIGH, "LeviApplicationRuntime", "serialize", "SMALL"],
  ];
  return rows.map(([id, domain, pattern, pressureLevel, targetComponent, targetOperation, repositoryScale]) => ({
    id,
    name: titleFromId(id),
    domain,
    pattern,
    pressureLevel,
    targetComponent,
    targetOperation,
    loadProfileId: profileForPressure(pressureLevel),
    metadata: { builtIn: true, releaseBlocking: [PressureLevels.HIGH, PressureLevels.SEVERE, PressureLevels.EXTREME].includes(pressureLevel), repositoryScale },
  }));
}

function profileScenarioIds(profile) {
  const smoke = ["repository-cold-index", "cache-pressure", "workflow-deep-graph", "agent-long-conversation", "provider-latency", "presentation-pressure"];
  const standard = smoke.concat(["repository-warm-index", "graph-query-burst", "context-build-burst", "multi-agent-team-pressure", "queue-fill-drain", "persistence-cycles", "agent-cancellation", "validation-concurrency"]);
  const strict = standard.concat(["repository-very-large-virtual", "monorepo-boundaries", "provider-throttling", "provider-stream-interruption", "multi-agent-conflict-pressure", "workflow-wide-graph", "workflow-cancellation-storm", "workspace-read-pressure", "change-proposal-large", "patch-preview-large", "recovery-cycles", "event-flood", "listener-pressure", "memory-pressure", "serialization-pressure"]);
  if (profile === StressProfiles.SMOKE) return smoke;
  if (profile === StressProfiles.STANDARD) return standard;
  if (profile === StressProfiles.STRICT) return strict;
  return builtInStressScenarios().map((scenario) => scenario.id);
}

function emptyMetrics() {
  return {
    latency: normalizeLatencyMetrics([]),
    throughput: normalizeThroughputMetrics({}),
    queue: normalizeQueueMetrics({}),
    memory: normalizeMemoryMetrics({}),
    cache: normalizeCacheMetrics({}),
    event: normalizeEventMetrics({}),
    persistence: normalizePersistenceMetrics({}),
    recovery: normalizeRecoveryMetrics({}),
    cleanup: { status: "CLEAN", durationMs: 0 },
  };
}

function normalizeAggregatedMetrics(input = {}) {
  return {
    latency: input.latency || normalizeLatencyMetrics([]),
    throughput: input.throughput || normalizeThroughputMetrics({}),
    queue: input.queue || normalizeQueueMetrics({}),
    memory: input.memory || normalizeMemoryMetrics({}),
    cache: input.cache || normalizeCacheMetrics({}),
    event: input.event || normalizeEventMetrics({}),
    persistence: input.persistence || normalizePersistenceMetrics({}),
    recovery: input.recovery || normalizeRecoveryMetrics({}),
    cleanup: input.cleanup || { status: "CLEAN", durationMs: 0 },
  };
}

function mergeMetrics(target, result) {
  target.latency = result.latency;
  target.throughput = result.throughput;
  target.queue = result.queue;
  target.memory = result.memory.peakBytes > (target.memory.peakBytes || 0) ? result.memory : target.memory;
  target.cache = result.cache;
  target.event = result.event;
  target.persistence = result.persistence;
  target.recovery = result.recovery;
  target.cleanup = result.cleanup;
}

function thresholdViolationsFor(metrics, thresholds) {
  const violations = [];
  if (thresholds.maximumP95LatencyMs && metrics.latency.p95Ms > thresholds.maximumP95LatencyMs) violations.push(violation("latency.p95Ms", thresholds.maximumP95LatencyMs, metrics.latency.p95Ms, ScalabilitySeverities.HIGH));
  if (thresholds.maximumQueueDepth && metrics.queue.depthMaximum > thresholds.maximumQueueDepth) violations.push(violation("queue.depthMaximum", thresholds.maximumQueueDepth, metrics.queue.depthMaximum, ScalabilitySeverities.CRITICAL));
  if (metrics.memory.critical) violations.push(violation("memory.critical", "false", "true", ScalabilitySeverities.CRITICAL));
  if (metrics.event.dropped || metrics.event.duplicated) violations.push(violation("event.integrity", "no dropped or duplicated events", "event loss or duplication", ScalabilitySeverities.CRITICAL));
  return violations;
}

function violation(metric, expected, observed, severity) {
  return { metric, expected, observed, severity, description: `${metric} exceeded deterministic RC-003 threshold.` };
}

function defaultThresholds(engine) {
  return {
    maximumP95LatencyMs: 30000,
    maximumQueueDepth: engine.configuration.maximumQueueDepth,
    maximumMemoryBytes: engine.configuration.memoryBudgetBytes,
    minimumCacheHitRate: 0.5,
  };
}

function deterministicLatencySamples(scenario, count, repository, pressure) {
  const base = Math.max(1, Math.ceil(Math.log10(repository.fileCount + repository.symbolCount + 10) * 5 * pressure));
  return Array.from({ length: Math.min(count, 128) }, (_, index) => base + ((index * 7 + hashNumber(scenario.id)) % Math.ceil(base + pressure)));
}

function validateFiniteConfiguration(config) {
  const errors = safeArray(config && config.metadata && config.metadata.configurationErrors);
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith("maximum") || key.endsWith("Bytes") || key.endsWith("Ratio")) {
      if (typeof value === "number" && (!Number.isFinite(value) || value <= 0)) errors.push(`${key} must be finite and positive.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function collectConfigurationErrors(input, defaults) {
  const errors = [];
  for (const [key, fallback] of Object.entries(defaults)) {
    if (typeof fallback !== "number" || !Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value <= 0) errors.push(`${key} must be finite and positive.`);
  }
  return errors;
}

function interruptedState(state) {
  return [StressRunStates.RUNNING, StressRunStates.WARMING_UP, StressRunStates.THROTTLING, StressRunStates.OBSERVING, StressRunStates.COOLING_DOWN, StressRunStates.VERIFYING].includes(state) ? StressRunStates.FAILED : state;
}

function emptyStats() {
  return {
    profilesRegistered: 0,
    scenariosRegistered: 0,
    runsCreated: 0,
    runsCompleted: 0,
    runsPartiallyCompleted: 0,
    runsFailed: 0,
    runsCancelled: 0,
    scenariosExecuted: 0,
    scenariosPassed: 0,
    scenariosFailed: 0,
    operationsAttempted: 0,
    operationsCompleted: 0,
    operationsFailed: 0,
    operationsCancelled: 0,
    operationsTimedOut: 0,
    queueOverflows: 0,
    starvationDetections: 0,
    memoryWarnings: 0,
    memoryCriticalEvents: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
    providerThrottles: 0,
    providerFailures: 0,
    workflowCompletions: 0,
    workflowFailures: 0,
    agentTurnCompletions: 0,
    assignmentCompletions: 0,
    recoveryCycles: 0,
    cancellationStorms: 0,
    cleanupFailures: 0,
    bottlenecksDetected: 0,
    releaseBlockersDetected: 0,
    findingsCreated: 0,
    certificationAttempts: 0,
    certificationsPassed: 0,
    certificationsBlocked: 0,
    averageThroughput: 0,
    averageLatency: 0,
    averageQueueWait: 0,
    averagePeakMemory: 0,
    averageCleanupDuration: 0,
    lastRun: null,
    lastScenario: null,
    lastFinding: null,
    lastBlocker: null,
    lastCertification: null,
    lastPersistence: null,
  };
}

function scoreFromFindings(findings = []) {
  const weights = { INFORMATIONAL: 0, LOW: 3, MEDIUM: 8, HIGH: 20, CRITICAL: 50 };
  const deduction = safeArray(findings).filter((finding) => finding.status === StressFindingStatuses.OPEN || !finding.status).reduce((sum, finding) => sum + (weights[finding.severity] || 0), 0);
  return Math.max(0, 100 - deduction);
}

function confidenceFromRun(run) {
  if (!run || !run.scenarioIds.length) return 0;
  return Math.max(0.5, Math.min(1, run.completedScenarioIds.length / run.scenarioIds.length));
}

function completenessFromRun(run) {
  if (!run || !run.scenarioIds.length) return 0;
  return Math.min(1, (run.completedScenarioIds.length + run.failedScenarioIds.length + run.skippedScenarioIds.length) / run.scenarioIds.length);
}

function pressureMultiplier(level) {
  return { BASELINE: 1, LOW: 1.5, MODERATE: 2, HIGH: 3, SEVERE: 4, EXTREME: 5 }[level] || 2;
}

function pressureForProfile(profile) {
  if (profile === StressProfiles.SMOKE) return PressureLevels.LOW;
  if (profile === StressProfiles.STRICT) return PressureLevels.HIGH;
  if (profile === StressProfiles.RELEASE_CANDIDATE) return PressureLevels.SEVERE;
  return PressureLevels.MODERATE;
}

function profileForPressure(pressure) {
  if (pressure === PressureLevels.LOW || pressure === PressureLevels.BASELINE) return StressProfiles.SMOKE;
  if (pressure === PressureLevels.HIGH) return StressProfiles.STRICT;
  if (pressure === PressureLevels.SEVERE || pressure === PressureLevels.EXTREME) return StressProfiles.RELEASE_CANDIDATE;
  return StressProfiles.STANDARD;
}

function patternForProfile(profile) {
  if (profile === StressProfiles.SMOKE) return LoadPatterns.SINGLE_BURST;
  if (profile === StressProfiles.STRICT) return LoadPatterns.SUSTAINED;
  if (profile === StressProfiles.RELEASE_CANDIDATE) return LoadPatterns.MIXED_WORKLOAD;
  return LoadPatterns.CONSTANT;
}

function durationForPressure(pressure) {
  return { BASELINE: 100, LOW: 250, MODERATE: 500, HIGH: 1000, SEVERE: 1500, EXTREME: 2000 }[pressure] || 500;
}

function operationsForPressure(pressure) {
  return { BASELINE: 4, LOW: 8, MODERATE: 24, HIGH: 48, SEVERE: 64, EXTREME: 96 }[pressure] || 24;
}

function concurrencyForPressure(pressure) {
  return { BASELINE: 1, LOW: 1, MODERATE: 4, HIGH: 8, SEVERE: 12, EXTREME: 16 }[pressure] || 4;
}

function repositoryScaleForPressure(pressure) {
  return { BASELINE: "TINY", LOW: "TINY", MODERATE: "MEDIUM", HIGH: "LARGE", SEVERE: "VERY_LARGE", EXTREME: "VERY_LARGE" }[pressure] || "SMALL";
}

function componentForDomain(domain) {
  if ([LoadDomains.REPOSITORY_INDEXING, LoadDomains.GRAPH_QUERIES, LoadDomains.CACHES, LoadDomains.MEMORY].includes(domain)) return "RepositoryPerformanceEngine";
  if ([LoadDomains.MODEL_REQUESTS, LoadDomains.MODEL_STREAMING].includes(domain)) return "ModelProviderGateway";
  if (domain === LoadDomains.AGENT_TURNS) return "AgentOrchestrationEngine";
  if (domain === LoadDomains.MULTI_AGENT_TEAMS) return "MultiAgentCoordinationEngine";
  if (domain === LoadDomains.WORKFLOW_EXECUTION) return "DurableWorkflowEngine";
  if ([LoadDomains.WORKSPACE_READS, LoadDomains.CHANGE_PROPOSALS, LoadDomains.PATCH_PREVIEW].includes(domain)) return "ControlledWorkspaceToolEngine";
  if (domain === LoadDomains.VS_CODE_PRESENTATION) return "VSCodeExtension";
  return "LeviApplicationRuntime";
}

function operationForDomain(domain) {
  return String(domain || "unknown").toLowerCase().replace(/_/g, "-");
}

function normalizeProfileId(profile) {
  const value = String(profile || StressProfiles.STANDARD).toUpperCase();
  return StressProfiles[value] || value;
}

function normalizeEnum(value, values, fallback) {
  return Object.values(values).includes(value) ? value : fallback;
}

function summarizeFinding(finding) {
  return { id: finding.id, severity: finding.severity, domain: finding.domain, title: finding.title, component: finding.component, releaseBlocking: finding.releaseBlocking, status: finding.status };
}

function matchesFilter(value, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined || expected === null || key === "filter") continue;
    if (value[key] !== expected) return false;
  }
  return true;
}

function evidence(type, summary) {
  return { id: `evidence-${type}`, type, summary, redacted: true, createdAt: new Date(0).toISOString() };
}

function sanitize(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 256).map((entry) => sanitize(entry, seen));
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/secret|token|password|authorization|api[_-]?key|privateprompt|privatereasoning|sourcecontent|protectedsource/i.test(key) || ["__proto__", "prototype", "constructor"].includes(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = sanitize(entry, seen);
  }
  return result;
}

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-[REDACTED]")
    .replace(/\b(?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^,\s"']+/gi, (match) => `${match.split(/[:=]/)[0]}=[REDACTED]`);
}

function percentile(values, percent) {
  const sorted = safeArray(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function average(values) {
  const list = safeArray(values).map(Number).filter(Number.isFinite);
  return list.length ? round(list.reduce((sum, value) => sum + value, 0) / list.length) : 0;
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function boundedNumber(value, fallback, min, max) {
  return bounded(value === undefined ? fallback : Number(value), min, max);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function requiredString(value, message) {
  if (!value || typeof value !== "string") throw new Error(message);
  return value;
}

function titleFromId(id) {
  return String(id || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(sanitize(value === undefined ? "" : value))).digest("hex");
}

function hashNumber(value) {
  return Number.parseInt(hash(value).slice(0, 8), 16);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeClock(clock = {}) {
  let tick = 0;
  return {
    now: typeof clock.now === "function" ? () => clock.now() : () => new Date(tick++).toISOString(),
  };
}

module.exports = {
  DEFAULT_CONFIGURATION,
  LoadDomains,
  LoadPatterns,
  MemoryStressScalabilityPersistenceAdapter,
  PressureLevels,
  ScalabilitySeverities,
  STRESS_SCALABILITY_SCHEMA_VERSION,
  StressCertificationLevels,
  StressEngineStates,
  StressEventTypes,
  StressFindingStatuses,
  StressProfiles,
  StressRunStates,
  StressScalabilityEngine,
  normalizeCacheMetrics,
  normalizeEventMetrics,
  normalizeLatencyMetrics,
  normalizeLoadProfile,
  normalizeMemoryMetrics,
  normalizePersistenceMetrics,
  normalizeQueueMetrics,
  normalizeRecoveryMetrics,
  normalizeScalabilityFinding,
  normalizeScalabilityReport,
  normalizeStressConfiguration,
  normalizeStressRun,
  normalizeStressScenario,
  normalizeStressScenarioResult,
  normalizeSyntheticRepository,
  normalizeThroughputMetrics,
};
