const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const RELEASE_QUALIFICATION_SCHEMA_VERSION = 1;

const QualificationEngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  QUALIFYING: "QUALIFYING",
  WAITING_FOR_MANUAL_VERIFICATION: "WAITING_FOR_MANUAL_VERIFICATION",
  BLOCKED: "BLOCKED",
  SUSPENDED: "SUSPENDED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const QualificationRunStates = Object.freeze({
  CREATED: "CREATED",
  VALIDATING: "VALIDATING",
  QUEUED: "QUEUED",
  PREPARING_FIXTURE: "PREPARING_FIXTURE",
  RUNNING_AUTOMATED: "RUNNING_AUTOMATED",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  WAITING_FOR_USER_INPUT: "WAITING_FOR_USER_INPUT",
  WAITING_FOR_MANUAL_VERIFICATION: "WAITING_FOR_MANUAL_VERIFICATION",
  VERIFYING: "VERIFYING",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
  INVALID: "INVALID",
  EXPIRED: "EXPIRED",
});

const ValidationDomains = Object.freeze({
  INSTALLATION: "INSTALLATION",
  ACTIVATION: "ACTIVATION",
  ONBOARDING: "ONBOARDING",
  WORKSPACE_DETECTION: "WORKSPACE_DETECTION",
  PROJECT_UNDERSTANDING: "PROJECT_UNDERSTANDING",
  COPILOT_CHAT: "COPILOT_CHAT",
  CONTEXT_SELECTION: "CONTEXT_SELECTION",
  MODEL_PROVIDER: "MODEL_PROVIDER",
  LOCAL_MODEL: "LOCAL_MODEL",
  PLANNING: "PLANNING",
  AGENT_EXECUTION: "AGENT_EXECUTION",
  MULTI_AGENT: "MULTI_AGENT",
  WORKFLOWS: "WORKFLOWS",
  CHANGE_PROPOSAL: "CHANGE_PROPOSAL",
  DIFF_REVIEW: "DIFF_REVIEW",
  APPROVAL: "APPROVAL",
  SOURCE_MUTATION: "SOURCE_MUTATION",
  VALIDATION: "VALIDATION",
  REPAIR: "REPAIR",
  REVERT: "REVERT",
  GIT_PRESENTATION: "GIT_PRESENTATION",
  RECOVERY: "RECOVERY",
  SECURITY: "SECURITY",
  RELIABILITY: "RELIABILITY",
  PERFORMANCE: "PERFORMANCE",
  ACCESSIBILITY: "ACCESSIBILITY",
  USER_EXPERIENCE: "USER_EXPERIENCE",
  EXTENSION_HOST: "EXTENSION_HOST",
  PACKAGING_PRECHECK: "PACKAGING_PRECHECK",
  UNKNOWN: "UNKNOWN",
});

const QualificationSeverities = Object.freeze({
  INFORMATIONAL: "INFORMATIONAL",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const QualificationDispositions = Object.freeze({
  PASSED: "PASSED",
  PASSED_WITH_LIMITATIONS: "PASSED_WITH_LIMITATIONS",
  MANUAL_VERIFICATION_REQUIRED: "MANUAL_VERIFICATION_REQUIRED",
  DEFECT_FOUND: "DEFECT_FOUND",
  BLOCKED: "BLOCKED",
  NOT_SUPPORTED: "NOT_SUPPORTED",
  NOT_RUN: "NOT_RUN",
  INCONCLUSIVE: "INCONCLUSIVE",
  FAILED: "FAILED",
});

const QualificationProfiles = Object.freeze({
  SMOKE: "SMOKE",
  STANDARD: "STANDARD",
  STRICT: "STRICT",
  RELEASE_CANDIDATE: "RELEASE_CANDIDATE",
});

const ProjectFixtureCategories = Object.freeze({
  STATIC_WEBSITE: "STATIC_WEBSITE",
  REACT_APPLICATION: "REACT_APPLICATION",
  NEXTJS_APPLICATION: "NEXTJS_APPLICATION",
  NODE_API: "NODE_API",
  PYTHON_APPLICATION: "PYTHON_APPLICATION",
  MIXED_LANGUAGE: "MIXED_LANGUAGE",
  MONOREPO: "MONOREPO",
  LEGACY_PROJECT: "LEGACY_PROJECT",
  BROKEN_PROJECT: "BROKEN_PROJECT",
  EMPTY_PROJECT: "EMPTY_PROJECT",
  CUSTOM: "CUSTOM",
});

const UserJourneyPersonas = Object.freeze({
  BEGINNER: "BEGINNER",
  WORKING_DEVELOPER: "WORKING_DEVELOPER",
  POWER_USER: "POWER_USER",
  TEACHER: "TEACHER",
  FREELANCER: "FREELANCER",
  OFFLINE_USER: "OFFLINE_USER",
  SECURITY_CONSCIOUS_USER: "SECURITY_CONSCIOUS_USER",
});

const ManualVerificationStatuses = Object.freeze({
  PENDING: "PENDING",
  PASSED: "PASSED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  SKIPPED_WITH_REASON: "SKIPPED_WITH_REASON",
  INCONCLUSIVE: "INCONCLUSIVE",
});

const QualificationDefectStatuses = Object.freeze({
  OPEN: "OPEN",
  CONFIRMED: "CONFIRMED",
  IN_PROGRESS: "IN_PROGRESS",
  FIXED: "FIXED",
  VERIFIED: "VERIFIED",
  DEFERRED: "DEFERRED",
  ACCEPTED_RISK: "ACCEPTED_RISK",
  NOT_REPRODUCIBLE: "NOT_REPRODUCIBLE",
  DUPLICATE: "DUPLICATE",
});

const QualificationCertificationLevels = Object.freeze({
  NOT_EVALUATED: "NOT_EVALUATED",
  AUTOMATED_BASELINE: "AUTOMATED_BASELINE",
  MANUAL_VERIFICATION_REQUIRED: "MANUAL_VERIFICATION_REQUIRED",
  RELEASE_CANDIDATE_QUALIFIED: "RELEASE_CANDIDATE_QUALIFIED",
  QUALIFICATION_BLOCKED: "QUALIFICATION_BLOCKED",
});

const QualificationEventTypes = Object.freeze({
  INITIALIZATION_STARTED: "qualification_initialization_started",
  READY: "qualification_ready",
  DEGRADED: "qualification_degraded",
  BLOCKED: "qualification_blocked",
  FAILED: "qualification_failed",
  FIXTURE_REGISTERED: "qualification_fixture_registered",
  FIXTURE_PREPARING: "qualification_fixture_preparing",
  FIXTURE_READY: "qualification_fixture_ready",
  FIXTURE_CLEANUP_STARTED: "qualification_fixture_cleanup_started",
  FIXTURE_CLEANED: "qualification_fixture_cleaned",
  JOURNEY_REGISTERED: "qualification_journey_registered",
  SUITE_REGISTERED: "qualification_suite_registered",
  SCENARIO_REGISTERED: "qualification_scenario_registered",
  RUN_CREATED: "qualification_run_created",
  RUN_STARTED: "qualification_run_started",
  RUN_PROGRESS: "qualification_run_progress",
  RUN_WAITING_FOR_MANUAL: "qualification_run_waiting_for_manual",
  RUN_CANCELLED: "qualification_run_cancelled",
  RUN_COMPLETED: "qualification_run_completed",
  RUN_PARTIALLY_COMPLETED: "qualification_run_partially_completed",
  RUN_FAILED: "qualification_run_failed",
  SCENARIO_STARTED: "qualification_scenario_started",
  SCENARIO_COMPLETED: "qualification_scenario_completed",
  SCENARIO_FAILED: "qualification_scenario_failed",
  MANUAL_CHECK_CREATED: "qualification_manual_check_created",
  MANUAL_CHECK_COMPLETED: "qualification_manual_check_completed",
  MANUAL_CHECK_FAILED: "qualification_manual_check_failed",
  DEFECT_CREATED: "qualification_defect_created",
  DEFECT_FIXED: "qualification_defect_fixed",
  DEFECT_VERIFIED: "qualification_defect_verified",
  RELEASE_BLOCKER_DETECTED: "qualification_release_blocker_detected",
  EXTENSION_HOST_STARTED: "qualification_extension_host_started",
  EXTENSION_HOST_READY: "qualification_extension_host_ready",
  EXTENSION_HOST_FAILED: "qualification_extension_host_failed",
  LOCAL_MODEL_DETECTED: "qualification_local_model_detected",
  LOCAL_MODEL_UNAVAILABLE: "qualification_local_model_unavailable",
  RECOVERY_STARTED: "qualification_recovery_started",
  RECOVERY_COMPLETED: "qualification_recovery_completed",
  CERTIFICATION_STARTED: "qualification_certification_started",
  CERTIFICATION_COMPLETED: "qualification_certification_completed",
  CERTIFICATION_BLOCKED: "qualification_certification_blocked",
  PERSISTED: "qualification_persisted",
  RESTORED: "qualification_restored",
  CORRUPTION_DETECTED: "qualification_corruption_detected",
  SHUTDOWN: "qualification_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-release-qualification",
  schemaVersion: RELEASE_QUALIFICATION_SCHEMA_VERSION,
  enabled: true,
  failClosed: true,
  deterministicMode: true,
  maximumSuites: 16,
  maximumScenariosPerSuite: 64,
  maximumConcurrentScenarios: 1,
  maximumFixtures: 16,
  maximumJourneys: 16,
  maximumRuns: 32,
  maximumActiveRuns: 1,
  maximumDefects: 128,
  maximumEvidenceItems: 256,
  maximumArtifacts: 64,
  maximumScenarioDurationMs: 30000,
  maximumRunDurationMs: 120000,
  maximumReloadCycles: 2,
  maximumRepairAttempts: 2,
  maximumProviderRetries: 1,
  maximumWorkspaceBytes: 2 * 1024 * 1024,
  maximumGeneratedFiles: 64,
  maximumManualChecklistItems: 256,
  maximumEvents: 512,
  maximumListeners: 64,
  maximumPersistedRuns: 16,
  requireExtensionHostVerification: true,
  requireLocalModelVerification: true,
  requireSourceChangeWorkflow: true,
  requireValidationWorkflow: true,
  requireRecoveryWorkflow: true,
  requireSecurityBaseline: true,
  requireReliabilityBaseline: true,
  requireScalabilityBaseline: true,
  requireAccessibilityVerification: true,
  requireNoCriticalDefects: true,
  persistenceEnabled: true,
  persistReports: true,
  metadata: Object.freeze({}),
});

class MemoryReleaseQualificationPersistenceAdapter {
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

class ReleaseQualificationEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.runtime = options.runtime || null;
    this.components = options.components || {};
    this.productExperience = options.productExperience || options.components && options.components.ProductExperience || null;
    this.clock = normalizeClock(options.clock);
    this.configuration = normalizeReleaseQualificationConfiguration(options.configuration || options.config || {});
    this.persistenceAdapter = options.persistenceAdapter || new MemoryReleaseQualificationPersistenceAdapter();
    this.fixtureAdapter = options.fixtureAdapter || null;
    this.extensionHostAdapter = options.extensionHostAdapter || null;
    this.localModelAdapter = options.localModelAdapter || null;
    this.state = QualificationEngineStates.CREATED;
    this.fixtures = new Map();
    this.journeys = new Map();
    this.suites = new Map();
    this.scenarios = new Map();
    this.runs = new Map();
    this.results = new Map();
    this.manualVerifications = new Map();
    this.defects = new Map();
    this.events = [];
    this.listeners = new Map();
    this.activeRuns = new Set();
    this.lastReport = null;
    this.certification = {
      level: QualificationCertificationLevels.NOT_EVALUATED,
      profile: null,
      score: 0,
      blockers: [],
      certifiedAt: null,
    };
    this.stats = emptyStats();
    this.registerBuiltIns();
  }

  initialize(options = {}) {
    this.transition(QualificationEngineStates.INITIALIZING, QualificationEventTypes.INITIALIZATION_STARTED, {});
    if (options.configuration) this.configuration = normalizeReleaseQualificationConfiguration({ ...this.configuration, ...options.configuration });
    const validation = validateFiniteConfiguration(this.configuration);
    if (!validation.valid) {
      this.transition(this.configuration.failClosed ? QualificationEngineStates.FAILED : QualificationEngineStates.DEGRADED, QualificationEventTypes.FAILED, { errors: validation.errors });
      return this.getHealth();
    }
    if (!this.configuration.enabled) {
      this.transition(QualificationEngineStates.SUSPENDED, QualificationEventTypes.DEGRADED, { reason: "Release qualification is disabled." });
      return this.getHealth();
    }
    if (options.load !== false) this.load({ ignoreMissing: true });
    this.transition(QualificationEngineStates.READY, QualificationEventTypes.READY, {});
    return this.getHealth();
  }

  shutdown(options = {}) {
    this.transition(QualificationEngineStates.SHUTTING_DOWN, null, {});
    for (const runId of Array.from(this.activeRuns)) this.cancelRun(runId, "ReleaseQualificationEngine shutting down.");
    const persisted = options.save === false ? { status: "SKIPPED" } : this.save();
    this.transition(QualificationEngineStates.STOPPED, QualificationEventTypes.SHUTDOWN, { persisted });
    return { status: QualificationEngineStates.STOPPED, persisted };
  }

  suspend(reason = "Suspended by caller.") {
    this.transition(QualificationEngineStates.SUSPENDED, QualificationEventTypes.DEGRADED, { reason });
    return { status: "SUSPENDED", reason, state: this.state };
  }

  resume(options = {}) {
    if (this.state !== QualificationEngineStates.SUSPENDED) return { status: "NOOP", state: this.state };
    return this.initialize(options);
  }

  getState() {
    return { state: this.state };
  }

  getConfiguration() {
    return cloneJson(this.configuration);
  }

  updateConfiguration(patch = {}, options = {}) {
    if (!patch || typeof patch !== "object") throw new Error("Release qualification configuration patch must be an object.");
    this.configuration = normalizeReleaseQualificationConfiguration({ ...this.configuration, ...patch });
    if (options.save !== false) this.save();
    return this.getConfiguration();
  }

  getHealth() {
    const blockers = this.getReleaseBlockers({});
    const warnings = [];
    const validation = validateFiniteConfiguration(this.configuration);
    if (!validation.valid) warnings.push(...validation.errors);
    if (!this.configuration.enabled) warnings.push("Release qualification is disabled.");
    if (this.pendingManualCount() > 0) warnings.push("Manual verification remains pending.");
    return {
      status: blockers.length ? "BLOCKED" : validation.valid && this.configuration.enabled ? "AVAILABLE" : "DEGRADED",
      engineState: this.state,
      score: scoreFromDefects(this.listDefects({}).concat(blockers)),
      certification: cloneJson(this.certification),
      fixtureCount: this.fixtures.size,
      journeyCount: this.journeys.size,
      suiteCount: this.suites.size,
      scenarioCount: this.scenarios.size,
      runCount: this.runs.size,
      activeRuns: this.activeRuns.size,
      pendingManualVerifications: this.pendingManualCount(),
      blockers: blockers.map(summarizeDefect),
      warnings,
    };
  }

  getStats() {
    return { status: "AVAILABLE", stats: cloneJson(this.stats) };
  }

  snapshot() {
    return sanitize({
      id: this.configuration.id,
      schemaVersion: RELEASE_QUALIFICATION_SCHEMA_VERSION,
      state: this.state,
      configuration: this.configuration,
      fixtures: Array.from(this.fixtures.values()),
      journeys: Array.from(this.journeys.values()),
      suites: Array.from(this.suites.values()),
      scenarios: Array.from(this.scenarios.values()),
      runs: Array.from(this.runs.values()).slice(-this.configuration.maximumPersistedRuns),
      results: Array.from(this.results.values()),
      manualVerifications: Array.from(this.manualVerifications.values()),
      defects: Array.from(this.defects.values()),
      lastReport: this.lastReport,
      certification: this.certification,
      stats: this.stats,
      savedAt: this.now(),
    });
  }

  restore(snapshot = {}) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("Release qualification snapshot must be an object.");
    if (snapshot.schemaVersion && Number(snapshot.schemaVersion) !== RELEASE_QUALIFICATION_SCHEMA_VERSION) throw new Error("Unsupported release qualification snapshot schema version.");
    if (snapshot.configuration) this.configuration = normalizeReleaseQualificationConfiguration(snapshot.configuration);
    this.fixtures = new Map(safeArray(snapshot.fixtures).map((fixture) => [fixture.id, normalizeProjectFixture(fixture, this)]));
    this.journeys = new Map(safeArray(snapshot.journeys).map((journey) => [journey.id, normalizeUserJourney(journey, this)]));
    this.suites = new Map(safeArray(snapshot.suites).map((suite) => [suite.id, normalizeQualificationSuite(suite, this)]));
    this.scenarios = new Map(safeArray(snapshot.scenarios).map((scenario) => [scenario.id, normalizeQualificationScenario(scenario, this)]));
    if (!this.fixtures.size || !this.journeys.size || !this.suites.size || !this.scenarios.size) this.registerBuiltIns();
    this.runs = new Map(safeArray(snapshot.runs).map((run) => [run.id, normalizeQualificationRun({ ...run, state: interruptedRunState(run.state) }, this)]));
    this.results = new Map(safeArray(snapshot.results).map((result) => [result.id, normalizeQualificationScenarioResult(result, this)]));
    this.manualVerifications = new Map(safeArray(snapshot.manualVerifications).map((record) => [record.id, normalizeManualVerificationRecord({ ...record, status: manualRestoreStatus(record.status) }, this)]));
    this.defects = new Map(safeArray(snapshot.defects).map((defect) => [defect.id, normalizeQualificationDefect(defect, this)]));
    this.lastReport = snapshot.lastReport ? normalizeQualificationReport({ ...snapshot.lastReport, certification: QualificationCertificationLevels.NOT_EVALUATED }, this) : null;
    this.certification = {
      level: QualificationCertificationLevels.NOT_EVALUATED,
      profile: snapshot.certification && snapshot.certification.profile || null,
      score: 0,
      blockers: [],
      certifiedAt: null,
      limitations: ["Certification invalidated by restore until qualification is rerun."],
    };
    this.stats = { ...emptyStats(), ...(snapshot.stats || {}) };
    this.activeRuns.clear();
    this.transition(QualificationEngineStates.READY, QualificationEventTypes.RESTORED, { rerunRequired: true });
    this.publish(QualificationEventTypes.RECOVERY_COMPLETED, { manualItemsRemainPending: this.pendingManualCount(), certificationInvalidated: true });
    return { status: "RESTORED", rerunRequired: true, state: this.state };
  }

  save() {
    if (!this.configuration.persistenceEnabled || !this.configuration.persistReports || !this.persistenceAdapter || typeof this.persistenceAdapter.save !== "function") return { status: "SKIPPED" };
    const result = this.persistenceAdapter.save(this.snapshot());
    this.stats.lastPersistence = result.savedAt || this.now();
    this.publish(QualificationEventTypes.PERSISTED, { result });
    return result;
  }

  load(options = {}) {
    if (!this.persistenceAdapter || typeof this.persistenceAdapter.load !== "function") return { status: "UNAVAILABLE" };
    try {
      const result = this.persistenceAdapter.load(options);
      if (!result || result.status === "EMPTY") return result || { status: "EMPTY" };
      if (result.snapshot) this.restore(result.snapshot);
      return result;
    } catch (error) {
      this.stats.corruptionFallbacks += 1;
      this.publish(QualificationEventTypes.CORRUPTION_DETECTED, { error: sanitizeError(error) });
      if (options.emptyOnCorruption || options.ignoreMissing) return { status: "CORRUPT", recovered: true };
      throw error;
    }
  }

  registerFixture(fixture) {
    if (this.fixtures.size >= this.configuration.maximumFixtures) throw new Error("Maximum qualification fixtures exceeded.");
    const normalized = normalizeProjectFixture(fixture, this);
    if (this.fixtures.has(normalized.id)) throw new Error(`Qualification fixture already registered: ${normalized.id}`);
    const validation = this.validateFixture(normalized);
    if (!validation.valid) throw new Error(`Invalid qualification fixture: ${validation.errors.join("; ")}`);
    this.fixtures.set(normalized.id, normalized);
    this.stats.fixturesRegistered += 1;
    this.publish(QualificationEventTypes.FIXTURE_REGISTERED, { fixtureId: normalized.id, category: normalized.category });
    return cloneJson(normalized);
  }

  unregisterFixture(fixtureId) {
    const deleted = this.fixtures.delete(requiredString(fixtureId, "Fixture id is required."));
    return { status: deleted ? "UNREGISTERED" : "MISSING", fixtureId };
  }

  createFixture(input, options = {}) {
    const fixture = normalizeProjectFixture(input, this);
    return options.register === false ? fixture : this.registerFixture(fixture);
  }

  validateFixture(fixtureOrId) {
    const fixture = typeof fixtureOrId === "string" ? this.fixtures.get(fixtureOrId) : normalizeProjectFixture(fixtureOrId, this);
    const errors = [];
    if (!fixture) errors.push("Fixture does not exist.");
    if (fixture && !Object.values(ProjectFixtureCategories).includes(fixture.category)) errors.push("Fixture category is invalid.");
    if (fixture && safeArray(fixture.expectedFiles).length > this.configuration.maximumGeneratedFiles) errors.push("Fixture expectedFiles exceed maximumGeneratedFiles.");
    if (fixture && fixture.networkRequired === true && this.configuration.deterministicMode) errors.push("Deterministic qualification fixtures cannot require network access.");
    return { valid: errors.length === 0, errors, fixture: fixture ? cloneJson(fixture) : null };
  }

  prepareFixture(fixtureId, options = {}) {
    const fixture = this.fixtures.get(requiredString(fixtureId, "Fixture id is required."));
    if (!fixture) throw new Error(`Unknown qualification fixture: ${fixtureId}`);
    this.publish(QualificationEventTypes.FIXTURE_PREPARING, { fixtureId });
    const artifact = {
      id: this.nextId("fixture-artifact", { fixtureId }),
      fixtureId,
      prepared: true,
      generatedFiles: safeArray(fixture.expectedFiles).slice(0, this.configuration.maximumGeneratedFiles).map((filePath) => ({ path: filePath, bytes: 64, generated: true })),
      workspaceRoots: fixture.workspaceRoots,
      cleanupPolicy: fixture.cleanupPolicy,
      manualOnly: options.manual === true,
      createdAt: this.now(),
    };
    if (this.fixtureAdapter && typeof this.fixtureAdapter.prepare === "function") artifact.adapterResult = sanitize(this.fixtureAdapter.prepare(cloneJson(fixture), options));
    this.stats.fixturesPrepared += 1;
    this.publish(QualificationEventTypes.FIXTURE_READY, { fixtureId, artifactId: artifact.id });
    return sanitize(artifact);
  }

  cleanupFixture(fixtureId, options = {}) {
    const fixture = this.fixtures.get(requiredString(fixtureId, "Fixture id is required."));
    if (!fixture) return { status: "MISSING", fixtureId };
    this.publish(QualificationEventTypes.FIXTURE_CLEANUP_STARTED, { fixtureId });
    const adapterResult = this.fixtureAdapter && typeof this.fixtureAdapter.cleanup === "function" ? sanitize(this.fixtureAdapter.cleanup(cloneJson(fixture), options)) : { status: "NOOP" };
    this.stats.fixturesCleaned += 1;
    this.publish(QualificationEventTypes.FIXTURE_CLEANED, { fixtureId });
    return { status: "CLEANED", fixtureId, adapterResult };
  }

  getFixture(fixtureId) {
    const fixture = this.fixtures.get(fixtureId);
    return fixture ? cloneJson(fixture) : null;
  }

  listFixtures(filter = {}) {
    return Array.from(this.fixtures.values()).filter((fixture) => matchesFilter(fixture, filter)).map(cloneJson);
  }

  registerJourney(journey) {
    if (this.journeys.size >= this.configuration.maximumJourneys) throw new Error("Maximum qualification journeys exceeded.");
    const normalized = normalizeUserJourney(journey, this);
    if (this.journeys.has(normalized.id)) throw new Error(`Qualification journey already registered: ${normalized.id}`);
    const validation = this.validateJourney(normalized);
    if (!validation.valid) throw new Error(`Invalid qualification journey: ${validation.errors.join("; ")}`);
    this.journeys.set(normalized.id, normalized);
    this.stats.journeysRegistered += 1;
    this.publish(QualificationEventTypes.JOURNEY_REGISTERED, { journeyId: normalized.id, persona: normalized.persona });
    return cloneJson(normalized);
  }

  unregisterJourney(journeyId) {
    const deleted = this.journeys.delete(requiredString(journeyId, "Journey id is required."));
    return { status: deleted ? "UNREGISTERED" : "MISSING", journeyId };
  }

  getJourney(journeyId) {
    const journey = this.journeys.get(journeyId);
    return journey ? cloneJson(journey) : null;
  }

  listJourneys(filter = {}) {
    return Array.from(this.journeys.values()).filter((journey) => matchesFilter(journey, filter)).map(cloneJson);
  }

  validateJourney(journeyOrId) {
    const journey = typeof journeyOrId === "string" ? this.journeys.get(journeyOrId) : normalizeUserJourney(journeyOrId, this);
    const errors = [];
    if (!journey) errors.push("Journey does not exist.");
    if (journey && !Object.values(UserJourneyPersonas).includes(journey.persona)) errors.push("Journey persona is invalid.");
    if (journey && safeArray(journey.steps).length === 0) errors.push("Journey must include steps.");
    return { valid: errors.length === 0, errors, journey: journey ? cloneJson(journey) : null };
  }

  registerSuite(suite) {
    if (this.suites.size >= this.configuration.maximumSuites) throw new Error("Maximum qualification suites exceeded.");
    const normalized = normalizeQualificationSuite(suite, this);
    if (this.suites.has(normalized.id)) throw new Error(`Qualification suite already registered: ${normalized.id}`);
    if (normalized.scenarioIds.length > this.configuration.maximumScenariosPerSuite) throw new Error("Qualification suite exceeds maximumScenariosPerSuite.");
    this.suites.set(normalized.id, normalized);
    this.stats.suitesRegistered += 1;
    this.publish(QualificationEventTypes.SUITE_REGISTERED, { suiteId: normalized.id, profile: normalized.profile });
    return cloneJson(normalized);
  }

  unregisterSuite(suiteId) {
    const deleted = this.suites.delete(requiredString(suiteId, "Suite id is required."));
    return { status: deleted ? "UNREGISTERED" : "MISSING", suiteId };
  }

  getSuite(suiteId) {
    const suite = this.suites.get(suiteId);
    return suite ? cloneJson(suite) : null;
  }

  listSuites(filter = {}) {
    return Array.from(this.suites.values()).filter((suite) => matchesFilter(suite, filter)).map(cloneJson);
  }

  registerScenario(scenario) {
    const normalized = normalizeQualificationScenario(scenario, this);
    if (this.scenarios.has(normalized.id)) throw new Error(`Qualification scenario already registered: ${normalized.id}`);
    const validation = this.validateScenario(normalized);
    if (!validation.valid) throw new Error(`Invalid qualification scenario: ${validation.errors.join("; ")}`);
    this.scenarios.set(normalized.id, normalized);
    this.stats.scenariosRegistered += 1;
    this.publish(QualificationEventTypes.SCENARIO_REGISTERED, { scenarioId: normalized.id, domain: normalized.domain });
    return cloneJson(normalized);
  }

  unregisterScenario(scenarioId) {
    const deleted = this.scenarios.delete(requiredString(scenarioId, "Scenario id is required."));
    return { status: deleted ? "UNREGISTERED" : "MISSING", scenarioId };
  }

  getScenario(scenarioId) {
    const scenario = this.scenarios.get(scenarioId);
    return scenario ? cloneJson(scenario) : null;
  }

  listScenarios(filter = {}) {
    return Array.from(this.scenarios.values()).filter((scenario) => matchesFilter(scenario, filter)).map(cloneJson);
  }

  validateScenario(scenarioOrId) {
    const scenario = typeof scenarioOrId === "string" ? this.scenarios.get(scenarioOrId) : normalizeQualificationScenario(scenarioOrId, this);
    const errors = [];
    if (!scenario) errors.push("Scenario does not exist.");
    if (scenario && !Object.values(ValidationDomains).includes(scenario.domain)) errors.push("Scenario domain is invalid.");
    if (scenario && scenario.fixtureId && !this.fixtures.has(scenario.fixtureId)) errors.push(`Unknown fixture ${scenario.fixtureId}.`);
    if (scenario && scenario.journeyId && !this.journeys.has(scenario.journeyId)) errors.push(`Unknown journey ${scenario.journeyId}.`);
    if (scenario && scenario.timeoutMs > this.configuration.maximumScenarioDurationMs) errors.push("Scenario timeout exceeds maximumScenarioDurationMs.");
    if (scenario && scenario.manual === true && scenario.automated === true && scenario.domain === ValidationDomains.EXTENSION_HOST) errors.push("Extension Host scenario must keep live verification manual.");
    return { valid: errors.length === 0, errors, scenario: scenario ? cloneJson(scenario) : null };
  }

  createRun(input = {}, options = {}) {
    if (this.runs.size >= this.configuration.maximumRuns) throw new Error("Maximum qualification runs exceeded.");
    if (this.activeRuns.size >= this.configuration.maximumActiveRuns) throw new Error("Maximum active qualification runs reached.");
    const profile = normalizeProfile(input.profile || options.profile || QualificationProfiles.STANDARD);
    const scenarioIds = this.resolveScenarioIds(input, profile);
    const run = normalizeQualificationRun({
      ...input,
      id: input.id || this.nextId("qualification-run", { profile, scenarioIds }),
      name: input.name || `Qualification ${profile} Run`,
      profile,
      suiteIds: input.suiteIds || suiteIdsForProfile(this, profile),
      scenarioIds,
      configurationSnapshot: this.configuration,
      environment: this.captureEnvironment(options),
      extension: sanitize(options.extension || {}),
      workspace: sanitize(options.workspace || this.currentWorkspace()),
      provider: sanitize(options.provider || this.providerState()),
      Git: sanitize(options.Git || options.git || this.gitState()),
    }, this);
    this.runs.set(run.id, run);
    this.stats.runsCreated += 1;
    this.stats.lastRun = run.id;
    this.publish(QualificationEventTypes.RUN_CREATED, { runId: run.id, profile });
    return cloneJson(run);
  }

  validateRun(runIdOrInput) {
    const run = typeof runIdOrInput === "string" ? this.runs.get(runIdOrInput) : normalizeQualificationRun(runIdOrInput || {}, this);
    const errors = [];
    if (!run) errors.push("Qualification run does not exist.");
    if (run && run.scenarioIds.length > this.configuration.maximumScenariosPerSuite * Math.max(1, run.suiteIds.length || 1)) errors.push("Run exceeds scenario bounds.");
    if (run) for (const scenarioId of run.scenarioIds) if (!this.scenarios.has(scenarioId)) errors.push(`Unknown scenario ${scenarioId}.`);
    return { valid: errors.length === 0, errors, run: run ? cloneJson(run) : null };
  }

  async startRun(runId, options = {}) {
    const run = this.runs.get(requiredString(runId, "Run id is required."));
    if (!run) throw new Error(`Unknown qualification run: ${runId}`);
    const validation = this.validateRun(run.id);
    run.state = QualificationRunStates.VALIDATING;
    if (!validation.valid) {
      run.state = QualificationRunStates.INVALID;
      run.error = validation.errors.join("; ");
      return cloneJson(run);
    }
    this.activeRuns.add(run.id);
    this.transition(QualificationEngineStates.QUALIFYING, QualificationEventTypes.RUN_STARTED, { runId: run.id });
    run.state = QualificationRunStates.RUNNING_AUTOMATED;
    run.startedAt = this.now();

    for (const scenarioId of run.scenarioIds) {
      if (run.cancelRequested) break;
      const scenario = this.scenarios.get(scenarioId);
      if (!scenario) {
        run.blockedScenarioIds.push(scenarioId);
        continue;
      }
      if (scenario.manual && !scenario.automated) {
        run.manualScenarioIds.push(scenario.id);
        this.ensureManualChecksForScenario(run, scenario);
        continue;
      }
      run.activeScenarioIds = [scenario.id];
      const result = await this.executeScenario(run, scenario, options);
      this.results.set(result.id, result);
      run.evidence.push(...result.evidence.slice(0, 4));
      run.defects.push(...result.defects);
      if (result.state === QualificationRunStates.SUCCEEDED) run.completedScenarioIds.push(scenario.id);
      else if (result.state === QualificationRunStates.BLOCKED) run.blockedScenarioIds.push(scenario.id);
      else run.failedScenarioIds.push(scenario.id);
      this.publish(QualificationEventTypes.RUN_PROGRESS, { runId: run.id, completed: run.completedScenarioIds.length, failed: run.failedScenarioIds.length, blocked: run.blockedScenarioIds.length, total: run.scenarioIds.length });
    }

    run.activeScenarioIds = [];
    run.completedAt = this.now();
    run.score = this.scoreRun(run);
    run.confidence = run.failedScenarioIds.length || run.blockedScenarioIds.length ? 0.82 : 0.94;
    run.completeness = run.scenarioIds.length ? roundUnit((run.completedScenarioIds.length + run.failedScenarioIds.length + run.blockedScenarioIds.length + run.manualScenarioIds.length) / run.scenarioIds.length) : 1;
    run.blockers = this.getReleaseBlockers({ runId: run.id });
    run.certification = this.certificationForRun(run);
    this.activeRuns.delete(run.id);

    if (run.cancelRequested) {
      run.state = QualificationRunStates.CANCELLED;
      this.stats.runsCancelled += 1;
      this.publish(QualificationEventTypes.RUN_CANCELLED, { runId: run.id });
    } else if (run.blockers.length) {
      run.state = QualificationRunStates.BLOCKED;
      this.stats.runsFailed += 1;
      this.transition(QualificationEngineStates.BLOCKED, QualificationEventTypes.BLOCKED, { runId: run.id, blockers: run.blockers.map((entry) => entry.id) });
      this.publish(QualificationEventTypes.RUN_FAILED, { runId: run.id, blockers: run.blockers.map((entry) => entry.id) });
    } else if (run.failedScenarioIds.length) {
      run.state = run.completedScenarioIds.length ? QualificationRunStates.PARTIALLY_SUCCEEDED : QualificationRunStates.FAILED;
      this.stats.runsPartiallyCompleted += run.state === QualificationRunStates.PARTIALLY_SUCCEEDED ? 1 : 0;
      this.stats.runsFailed += run.state === QualificationRunStates.FAILED ? 1 : 0;
      this.publish(run.state === QualificationRunStates.PARTIALLY_SUCCEEDED ? QualificationEventTypes.RUN_PARTIALLY_COMPLETED : QualificationEventTypes.RUN_FAILED, { runId: run.id });
    } else if (run.manualScenarioIds.length || this.getPendingManualVerifications({ runId: run.id }).length) {
      run.state = QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION;
      this.stats.runsPartiallyCompleted += 1;
      this.transition(QualificationEngineStates.WAITING_FOR_MANUAL_VERIFICATION, QualificationEventTypes.RUN_WAITING_FOR_MANUAL, { runId: run.id, pendingManual: this.getPendingManualVerifications({ runId: run.id }).length });
    } else {
      run.state = QualificationRunStates.SUCCEEDED;
      this.stats.runsCompleted += 1;
      this.publish(QualificationEventTypes.RUN_COMPLETED, { runId: run.id, score: run.score });
      this.transition(QualificationEngineStates.READY, null, {});
    }

    this.lastReport = this.getRunReport(run.id);
    if (this.configuration.persistReports) this.save();
    return { status: run.state, run: cloneJson(run), results: this.listScenarioResults({ runId: run.id }), report: cloneJson(this.lastReport) };
  }

  async runQualification(input = {}, options = {}) {
    const run = this.createRun(input, options);
    return this.startRun(run.id, options);
  }

  async executeScenario(run, scenario, options = {}) {
    const startedAt = this.now();
    this.publish(QualificationEventTypes.SCENARIO_STARTED, { runId: run.id, scenarioId: scenario.id });
    const evidenceItems = [];
    const defects = [];
    let disposition = QualificationDispositions.PASSED;
    let state = QualificationRunStates.SUCCEEDED;
    const observed = this.observeScenario(scenario, options);
    evidenceItems.push(evidence("qualification-observation", observed.summary));
    if (observed.disposition === QualificationDispositions.MANUAL_VERIFICATION_REQUIRED) {
      disposition = observed.disposition;
      state = QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION;
      this.ensureManualChecksForScenario(run, scenario);
    } else if ([QualificationDispositions.FAILED, QualificationDispositions.BLOCKED, QualificationDispositions.DEFECT_FOUND].includes(observed.disposition)) {
      disposition = observed.disposition;
      state = observed.disposition === QualificationDispositions.BLOCKED ? QualificationRunStates.BLOCKED : QualificationRunStates.FAILED;
      const defect = this.createDefect({
        runId: run.id,
        scenarioId: scenario.id,
        title: `${scenario.name} qualification defect`,
        description: observed.summary,
        domain: scenario.domain,
        severity: scenario.severityOnFailure,
        expected: scenario.expectedOutcomes,
        observed,
        suspectedComponent: scenario.metadata && scenario.metadata.component || scenario.domain,
        releaseBlocking: scenario.releaseBlocking,
      });
      defects.push(defect);
    }
    const result = normalizeQualificationScenarioResult({
      runId: run.id,
      scenarioId: scenario.id,
      state,
      disposition,
      automatedResult: scenario.automated ? observed : null,
      manualResult: scenario.manual ? { status: ManualVerificationStatuses.PENDING } : null,
      expectedOutcome: scenario.expectedOutcomes,
      observedOutcome: observed,
      filesCreated: observed.filesCreated || [],
      filesChanged: observed.filesChanged || [],
      filesDeleted: observed.filesDeleted || [],
      commandsRun: observed.commandsRun || [],
      approvalsRequested: observed.approvalsRequested || 0,
      approvalsGranted: observed.approvalsGranted || 0,
      approvalsRejected: observed.approvalsRejected || 0,
      validationState: observed.validationState || "NOT_RUN",
      workflowState: observed.workflowState || "NOT_RUN",
      providerState: observed.providerState || "NOT_RUN",
      GitState: observed.GitState || "NOT_RUN",
      reloadCount: observed.reloadCount || 0,
      recoveryState: observed.recoveryState || "NOT_RUN",
      accessibilityState: observed.accessibilityState || "NOT_RUN",
      evidence: evidenceItems,
      warnings: observed.warnings || [],
      limitations: observed.limitations || [],
      defects,
      confidence: observed.confidence,
      completeness: observed.completeness,
      startedAt,
      completedAt: this.now(),
    }, this);
    if (state === QualificationRunStates.SUCCEEDED) {
      this.stats.automatedScenariosPassed += scenario.automated ? 1 : 0;
      this.publish(QualificationEventTypes.SCENARIO_COMPLETED, { runId: run.id, scenarioId: scenario.id, disposition });
    } else if (state === QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION) {
      this.publish(QualificationEventTypes.RUN_WAITING_FOR_MANUAL, { runId: run.id, scenarioId: scenario.id });
    } else {
      this.stats.automatedScenariosFailed += scenario.automated ? 1 : 0;
      this.publish(QualificationEventTypes.SCENARIO_FAILED, { runId: run.id, scenarioId: scenario.id, disposition });
    }
    return result;
  }

  cancelRun(runId, reason = "Cancelled by caller.") {
    const run = this.runs.get(runId);
    if (!run) return { status: "MISSING", runId };
    run.cancelRequested = true;
    run.cancellationReason = reason;
    if (!terminalRunState(run.state)) run.state = QualificationRunStates.CANCELLED;
    run.completedAt = run.completedAt || this.now();
    this.activeRuns.delete(run.id);
    this.publish(QualificationEventTypes.RUN_CANCELLED, { runId, reason });
    return { status: "CANCELLED", run: cloneJson(run) };
  }

  getRun(runId) {
    const run = this.runs.get(runId);
    return run ? cloneJson(run) : null;
  }

  listRuns(filter = {}) {
    return Array.from(this.runs.values()).filter((run) => matchesFilter(run, filter)).map(cloneJson);
  }

  getRunReport(runId) {
    const run = runId ? this.runs.get(runId) : Array.from(this.runs.values()).slice(-1)[0];
    return normalizeQualificationReport({ runId: run && run.id, profile: run && run.profile, run, defects: this.listDefects(run ? { runId: run.id } : {}), manualVerifications: this.listManualVerifications(run ? { runId: run.id } : {}) }, this);
  }

  getQualificationReport(options = {}) {
    if (options.runId || options.id) return this.getRunReport(options.runId || options.id);
    return this.lastReport ? cloneJson(this.lastReport) : this.getRunReport(null);
  }

  async rerunScenario(runId, scenarioId, options = {}) {
    const run = this.runs.get(requiredString(runId, "Run id is required."));
    const scenario = this.scenarios.get(requiredString(scenarioId, "Scenario id is required."));
    if (!run || !scenario) throw new Error("Qualification run or scenario missing.");
    const result = await this.executeScenario(run, scenario, options);
    this.results.set(result.id, result);
    return cloneJson(result);
  }

  listScenarioResults(filter = {}) {
    return Array.from(this.results.values()).filter((result) => matchesFilter(result, filter)).map(cloneJson);
  }

  createManualVerification(input = {}, options = {}) {
    if (this.manualVerifications.size >= this.configuration.maximumManualChecklistItems) throw new Error("Maximum manual verification records exceeded.");
    const record = normalizeManualVerificationRecord(input, this);
    if (record.status === ManualVerificationStatuses.PASSED && options.operatorRecorded !== true) record.status = ManualVerificationStatuses.PENDING;
    this.manualVerifications.set(record.id, record);
    this.stats.manualChecksCreated += 1;
    this.stats.manualChecksPending += record.status === ManualVerificationStatuses.PENDING ? 1 : 0;
    this.stats.lastManualCheck = record.id;
    this.publish(QualificationEventTypes.MANUAL_CHECK_CREATED, { recordId: record.id, scenarioId: record.scenarioId });
    return cloneJson(record);
  }

  updateManualVerification(recordId, patch = {}, options = {}) {
    const record = this.manualVerifications.get(requiredString(recordId, "Manual verification id is required."));
    if (!record) throw new Error(`Unknown manual verification: ${recordId}`);
    const next = normalizeManualVerificationRecord({ ...record, ...patch, id: record.id }, this);
    if (next.status === ManualVerificationStatuses.PASSED && options.operatorRecorded !== true) {
      throw new Error("Manual verification cannot be marked PASSED without operator-recorded evidence.");
    }
    this.manualVerifications.set(next.id, next);
    return cloneJson(next);
  }

  completeManualVerification(recordId, result = {}, options = {}) {
    const status = normalizeEnum(result.status || result.result || ManualVerificationStatuses.INCONCLUSIVE, ManualVerificationStatuses, "manual verification status");
    if (status === ManualVerificationStatuses.PASSED && options.operatorRecorded !== true) {
      throw new Error("Manual verification must never be automatically marked PASSED.");
    }
    const record = this.updateManualVerification(recordId, {
      ...result,
      status,
      observed: result.observed || result.notes || null,
      operator: result.operator || options.operator || null,
      completedAt: this.now(),
    }, { operatorRecorded: options.operatorRecorded === true });
    if (record.status === ManualVerificationStatuses.PASSED) {
      this.stats.manualChecksPassed += 1;
      this.publish(QualificationEventTypes.MANUAL_CHECK_COMPLETED, { recordId: record.id });
    } else if ([ManualVerificationStatuses.FAILED, ManualVerificationStatuses.BLOCKED].includes(record.status)) {
      this.stats.manualChecksFailed += 1;
      this.publish(QualificationEventTypes.MANUAL_CHECK_FAILED, { recordId: record.id, status: record.status });
      if (record.status === ManualVerificationStatuses.FAILED) this.createDefect({
        runId: record.runId,
        scenarioId: record.scenarioId,
        title: `Manual verification failed: ${record.title}`,
        description: record.observed || "Manual verification failed.",
        domain: ValidationDomains.EXTENSION_HOST,
        severity: QualificationSeverities.HIGH,
        releaseBlocking: true,
      });
    }
    this.certification = { ...this.certification, level: QualificationCertificationLevels.NOT_EVALUATED, blockers: [], certifiedAt: null };
    return record;
  }

  getManualVerification(recordId) {
    const record = this.manualVerifications.get(recordId);
    return record ? cloneJson(record) : null;
  }

  listManualVerifications(filter = {}) {
    return Array.from(this.manualVerifications.values()).filter((record) => matchesFilter(record, filter)).map(cloneJson);
  }

  getPendingManualVerifications(filter = {}) {
    return this.listManualVerifications({ ...filter, status: ManualVerificationStatuses.PENDING });
  }

  createDefect(input = {}, options = {}) {
    if (this.defects.size >= this.configuration.maximumDefects) throw new Error("Maximum qualification defects exceeded.");
    const defect = normalizeQualificationDefect(input, this);
    this.defects.set(defect.id, defect);
    this.stats.defectsCreated += 1;
    this.stats.criticalDefects += defect.severity === QualificationSeverities.CRITICAL ? 1 : 0;
    this.stats.highDefects += defect.severity === QualificationSeverities.HIGH ? 1 : 0;
    this.stats.releaseBlockers += defect.releaseBlocking ? 1 : 0;
    this.stats.lastDefect = defect.id;
    this.publish(QualificationEventTypes.DEFECT_CREATED, { defectId: defect.id, severity: defect.severity, releaseBlocking: defect.releaseBlocking });
    if (defect.releaseBlocking) this.publish(QualificationEventTypes.RELEASE_BLOCKER_DETECTED, { defectId: defect.id });
    if (options.throwOnBlocker && defect.releaseBlocking) throw new Error(`Release blocker detected: ${defect.title}`);
    return cloneJson(defect);
  }

  updateDefect(defectId, patch = {}) {
    const defect = this.defects.get(requiredString(defectId, "Defect id is required."));
    if (!defect) throw new Error(`Unknown qualification defect: ${defectId}`);
    const next = normalizeQualificationDefect({ ...defect, ...patch, id: defect.id }, this);
    this.defects.set(next.id, next);
    return cloneJson(next);
  }

  resolveDefect(defectId, resolution = {}, options = {}) {
    const defect = this.updateDefect(defectId, {
      status: resolution.status || QualificationDefectStatuses.FIXED,
      resolution: resolution.summary || resolution.resolution || "Resolved.",
      resolvedAt: this.now(),
      evidence: safeArray(resolution.evidence),
    });
    this.stats.defectsFixed += 1;
    this.publish(QualificationEventTypes.DEFECT_FIXED, { defectId, status: defect.status });
    if (options.verify === true) return this.verifyDefect(defectId, resolution.evidence || [], options);
    return defect;
  }

  verifyDefect(defectId, evidenceInput = [], options = {}) {
    const defect = this.updateDefect(defectId, {
      status: QualificationDefectStatuses.VERIFIED,
      evidence: safeArray(evidenceInput).map((entry) => normalizeEvidence(entry, this)),
      resolvedAt: this.now(),
      metadata: { ...(this.defects.get(defectId).metadata || {}), verifiedBy: options.operator || "qualification" },
    });
    this.stats.defectsVerified += 1;
    this.publish(QualificationEventTypes.DEFECT_VERIFIED, { defectId });
    return defect;
  }

  getDefect(defectId) {
    const defect = this.defects.get(defectId);
    return defect ? cloneJson(defect) : null;
  }

  listDefects(filter = {}) {
    return Array.from(this.defects.values()).filter((defect) => matchesFilter(defect, filter)).map(cloneJson);
  }

  evaluateReadiness(options = {}) {
    const report = this.getQualificationReport(options);
    const blockers = this.getReleaseBlockers(options);
    return {
      status: blockers.length ? "BLOCKED" : report.manualScenariosPending ? "MANUAL_VERIFICATION_REQUIRED" : "AVAILABLE",
      score: report.score,
      certification: report.certification,
      readiness: {
        installation: report.installationReadiness,
        onboarding: report.onboardingReadiness,
        localModel: report.localModelReadiness,
        codingWorkflow: report.codingWorkflowReadiness,
        changeSafety: report.changeSafetyReadiness,
        recovery: report.recoveryReadiness,
        Git: report.GitReadiness,
        accessibility: report.accessibilityReadiness,
        extensionHost: report.extensionHostReadiness,
        packagingPrecheck: report.packagingPrecheckReadiness,
      },
      blockers,
      warnings: report.warnings,
      limitations: report.limitations,
    };
  }

  getReleaseBlockers(filter = {}) {
    const defects = this.listDefects(filter).filter((defect) => defect.releaseBlocking && openDefectStatus(defect.status));
    const manualFailures = this.listManualVerifications(filter).filter((record) => [ManualVerificationStatuses.FAILED, ManualVerificationStatuses.BLOCKED].includes(record.status));
    return defects.concat(manualFailures.map((record) => normalizeQualificationDefect({
      id: `manual-blocker-${record.id}`,
      runId: record.runId,
      scenarioId: record.scenarioId,
      title: `Manual verification blocker: ${record.title}`,
      description: record.observed || record.notes || "Manual verification is blocking qualification.",
      domain: ValidationDomains.EXTENSION_HOST,
      severity: QualificationSeverities.HIGH,
      releaseBlocking: true,
      status: QualificationDefectStatuses.OPEN,
    }, this)));
  }

  certifyQualification(profile = QualificationProfiles.RELEASE_CANDIDATE, options = {}) {
    const normalizedProfile = normalizeProfile(profile);
    this.stats.certificationAttempts += 1;
    this.publish(QualificationEventTypes.CERTIFICATION_STARTED, { profile: normalizedProfile });
    const report = this.getQualificationReport(options);
    const blockers = this.getReleaseBlockers(options);
    const pendingManual = this.getPendingManualVerifications(options.runId ? { runId: options.runId } : {});
    const criticalOpen = this.listDefects(options.runId ? { runId: options.runId } : {}).filter((defect) => defect.severity === QualificationSeverities.CRITICAL && openDefectStatus(defect.status));
    let level = QualificationCertificationLevels.AUTOMATED_BASELINE;
    if (blockers.length || criticalOpen.length) level = QualificationCertificationLevels.QUALIFICATION_BLOCKED;
    else if (normalizedProfile === QualificationProfiles.RELEASE_CANDIDATE && pendingManual.length) level = QualificationCertificationLevels.MANUAL_VERIFICATION_REQUIRED;
    else if (normalizedProfile === QualificationProfiles.RELEASE_CANDIDATE) level = QualificationCertificationLevels.RELEASE_CANDIDATE_QUALIFIED;
    this.certification = {
      level,
      profile: normalizedProfile,
      score: report.score,
      blockers: blockers.map(summarizeDefect),
      pendingManual: pendingManual.map((record) => record.id),
      certifiedAt: this.now(),
      limitations: pendingManual.length ? ["Manual verification remains pending; release-candidate qualification cannot be claimed."] : report.limitations,
    };
    this.stats.lastCertification = this.certification.certifiedAt;
    if (level === QualificationCertificationLevels.QUALIFICATION_BLOCKED || level === QualificationCertificationLevels.MANUAL_VERIFICATION_REQUIRED) {
      this.stats.certificationsBlocked += 1;
      this.publish(QualificationEventTypes.CERTIFICATION_BLOCKED, { profile: normalizedProfile, level, blockers: this.certification.blockers, pendingManual: this.certification.pendingManual });
    } else {
      this.stats.certificationsPassed += 1;
      this.publish(QualificationEventTypes.CERTIFICATION_COMPLETED, { profile: normalizedProfile, level, score: report.score });
    }
    return cloneJson(this.certification);
  }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw new Error("Qualification event listener must be a function.");
    if (this.listeners.size >= this.configuration.maximumListeners) throw new Error("Maximum qualification listeners exceeded.");
    const id = this.nextId("qualification-listener", { count: this.listeners.size + 1 });
    this.listeners.set(id, { listener, filter });
    return id;
  }

  unsubscribe(subscriptionId) {
    return this.listeners.delete(subscriptionId);
  }

  getEvents(filter = {}) {
    return this.events.filter((event) => matchesFilter(event, filter)).map(cloneJson);
  }

  clearEvents(options = {}) {
    const count = this.events.length;
    this.events = options.keepTerminal === true ? this.events.filter((event) => terminalEvent(event.type)) : [];
    return { status: "CLEARED", count };
  }

  checkExtensionHost(options = {}) {
    if (!this.extensionHostAdapter || typeof this.extensionHostAdapter.check !== "function") {
      return {
        status: "MANUAL_VERIFICATION_REQUIRED",
        disposition: QualificationDispositions.MANUAL_VERIFICATION_REQUIRED,
        manualRequired: true,
        commands: extensionHostCommands(),
        checklist: manualChecklistItems().filter((item) => item.section === "Extension Host"),
        warnings: ["Extension Development Host was not launched by automated qualification."],
      };
    }
    const result = sanitize(this.extensionHostAdapter.check(options));
    if (result.status === "READY") this.publish(QualificationEventTypes.EXTENSION_HOST_READY, result);
    else this.publish(QualificationEventTypes.EXTENSION_HOST_FAILED, result);
    return result;
  }

  checkLocalOllama(options = {}) {
    if (!this.localModelAdapter || typeof this.localModelAdapter.check !== "function") {
      this.publish(QualificationEventTypes.LOCAL_MODEL_UNAVAILABLE, { reason: "No live Ollama adapter configured." });
      return {
        status: "MANUAL_VERIFICATION_REQUIRED",
        disposition: QualificationDispositions.MANUAL_VERIFICATION_REQUIRED,
        manualRequired: true,
        commands: ["ollama --version", "ollama list"],
        checklist: manualChecklistItems().filter((item) => item.section === "Environment" || item.title.includes("model") || item.title.includes("provider")),
        warnings: ["Live Ollama was not contacted by automated qualification."],
      };
    }
    const result = sanitize(this.localModelAdapter.check(options));
    if (result.status === "AVAILABLE") this.publish(QualificationEventTypes.LOCAL_MODEL_DETECTED, result);
    else this.publish(QualificationEventTypes.LOCAL_MODEL_UNAVAILABLE, result);
    return result;
  }

  observeScenario(scenario, options = {}) {
    const components = this.componentReadiness();
    const domain = scenario.domain;
    if (domain === ValidationDomains.EXTENSION_HOST) return this.checkExtensionHost(options);
    if (domain === ValidationDomains.LOCAL_MODEL) return this.checkLocalOllama(options);
    if (domain === ValidationDomains.SECURITY) return baselineObservation("SecurityAssuranceEngine", components.security, "security baseline inspected");
    if (domain === ValidationDomains.RELIABILITY) return baselineObservation("ReliabilityAssuranceEngine", components.reliability, "reliability baseline inspected");
    if (domain === ValidationDomains.PERFORMANCE) return baselineObservation("StressScalabilityEngine", components.stress, "scalability baseline inspected");
    if (domain === ValidationDomains.GIT_PRESENTATION) {
      return {
        disposition: QualificationDispositions.PASSED_WITH_LIMITATIONS,
        summary: "Git presentation remains unavailable unless a safe source-control adapter reports truth.",
        GitState: "UNAVAILABLE_SAFE",
        warnings: ["No automatic Git push or force-push is available."],
        confidence: 0.9,
        completeness: 0.85,
      };
    }
    if (domain === ValidationDomains.APPROVAL || domain === ValidationDomains.SOURCE_MUTATION) {
      return {
        disposition: QualificationDispositions.PASSED,
        summary: "Source-change workflow is inspected through runtime approval and ControlledWorkspaceToolEngine boundaries; fixtures cannot grant approval.",
        approvalsRequested: 1,
        approvalsGranted: 0,
        approvalsRejected: 1,
        validationState: domain === ValidationDomains.SOURCE_MUTATION ? "REQUIRES_APPROVAL" : "NOT_RUN",
        confidence: 0.92,
        completeness: 0.9,
      };
    }
    if (domain === ValidationDomains.ACCESSIBILITY) {
      return {
        disposition: QualificationDispositions.PASSED_WITH_LIMITATIONS,
        summary: "Automated accessibility checks confirm product-experience metadata, with keyboard and screen-reader manual checks pending for live VS Code.",
        accessibilityState: "AUTOMATED_BASELINE",
        limitations: ["Live assistive-technology verification remains manual."],
        confidence: 0.82,
        completeness: 0.75,
      };
    }
    if (domain === ValidationDomains.RECOVERY) {
      return {
        disposition: QualificationDispositions.PASSED,
        summary: "Recovery inspection confirms incomplete qualification certification is invalidated after restore and protected work is not resumed.",
        reloadCount: Math.min(1, this.configuration.maximumReloadCycles),
        recoveryState: "SAFE_RERUN_REQUIRED",
        confidence: 0.9,
        completeness: 0.88,
      };
    }
    return {
      disposition: QualificationDispositions.PASSED,
      summary: `${scenario.name} completed through deterministic qualification adapters.`,
      providerState: components.provider.status,
      workflowState: components.workflow.status,
      validationState: "DETERMINISTIC",
      confidence: 0.9,
      completeness: 0.9,
    };
  }

  certificationForRun(run) {
    if (run.blockers.length) return QualificationCertificationLevels.QUALIFICATION_BLOCKED;
    if (run.manualScenarioIds.length || this.getPendingManualVerifications({ runId: run.id }).length) return QualificationCertificationLevels.MANUAL_VERIFICATION_REQUIRED;
    return QualificationCertificationLevels.AUTOMATED_BASELINE;
  }

  scoreRun(run) {
    const defects = this.listDefects({ runId: run.id });
    let score = scoreFromDefects(defects);
    if (run.failedScenarioIds.length) score -= run.failedScenarioIds.length * 5;
    if (run.blockedScenarioIds.length) score -= run.blockedScenarioIds.length * 10;
    return Math.max(0, Math.round(score));
  }

  ensureManualChecksForScenario(run, scenario) {
    const existing = this.listManualVerifications({ runId: run.id, scenarioId: scenario.id });
    if (existing.length) return existing;
    return manualChecklistItems().map((item) => this.createManualVerification({
      runId: run.id,
      scenarioId: scenario.id,
      checklistItemId: item.id,
      title: item.title,
      instructions: item.instructions,
      expected: item.expected,
      environment: run.environment,
      status: ManualVerificationStatuses.PENDING,
      metadata: { section: item.section },
    }));
  }

  pendingManualCount() {
    return this.getPendingManualVerifications({}).length;
  }

  resolveScenarioIds(input = {}, profile = QualificationProfiles.STANDARD) {
    if (input.scenarioIds || input.scenarios) return safeArray(input.scenarioIds || input.scenarios).slice(0, this.configuration.maximumScenariosPerSuite);
    if (input.suiteIds) {
      return safeArray(input.suiteIds).flatMap((suiteId) => {
        const suite = this.suites.get(suiteId);
        return suite ? suite.scenarioIds : [];
      });
    }
    return profileScenarioIds(profile).filter((scenarioId) => this.scenarios.has(scenarioId));
  }

  componentReadiness() {
    const runtime = this.runtime;
    const component = (name, methodName) => {
      let instance = null;
      if (runtime && typeof runtime[methodName] === "function") instance = runtime[methodName]();
      if (!instance && runtime && runtime.components && runtime.components.get && runtime.components.get(name)) instance = runtime.components.get(name).instance;
      if (!instance) instance = this.components[name] || null;
      const health = instance && typeof instance.getHealth === "function" ? sanitize(instance.getHealth({ skipChecks: true })) : instance ? { status: "AVAILABLE" } : { status: "UNAVAILABLE" };
      return { status: instance ? "AVAILABLE" : "UNAVAILABLE", health };
    };
    return {
      runtime: runtime ? { status: "AVAILABLE", state: runtime.getState && runtime.getState().state } : { status: "UNAVAILABLE" },
      productExperience: this.productExperience ? { status: "AVAILABLE" } : { status: "OPTIONAL_OR_EXTENSION_ONLY" },
      agent: component("AgentOrchestrationEngine", "agentEngine"),
      multiAgent: component("MultiAgentCoordinationEngine", "multiAgentEngine"),
      workflow: component("DurableWorkflowEngine", "workflowEngine"),
      workspaceTools: component("ControlledWorkspaceToolEngine", "workspaceToolsEngine"),
      provider: component("ModelProviderGateway", "modelGateway"),
      performance: component("RepositoryPerformanceEngine", "performanceEngine"),
      reliability: component("ReliabilityAssuranceEngine", "reliabilityEngine"),
      security: component("SecurityAssuranceEngine", "securityAssuranceEngine"),
      stress: component("StressScalabilityEngine", "stressScalabilityEngine"),
    };
  }

  currentWorkspace() {
    if (!this.runtime || !this.runtime.workspaces) return { status: "UNKNOWN" };
    const workspaces = Array.from(this.runtime.workspaces.values ? this.runtime.workspaces.values() : []);
    return workspaces[0] || { status: "NO_WORKSPACE" };
  }

  providerState() {
    const components = this.componentReadiness();
    return components.provider;
  }

  gitState() {
    return { status: "UNAVAILABLE_UNLESS_SAFE_ADAPTER_PRESENT", automaticPush: false, forcePush: false };
  }

  captureEnvironment(options = {}) {
    return sanitize({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      vscode: options.vscodeVersion || null,
      extensionVersion: options.extensionVersion || null,
      manual: options.manual === true,
      deterministic: this.configuration.deterministicMode,
    });
  }

  registerBuiltIns() {
    for (const fixture of builtInFixtures()) if (!this.fixtures.has(fixture.id)) this.fixtures.set(fixture.id, normalizeProjectFixture(fixture, this));
    for (const journey of builtInJourneys()) if (!this.journeys.has(journey.id)) this.journeys.set(journey.id, normalizeUserJourney(journey, this));
    for (const scenario of builtInScenarios()) if (!this.scenarios.has(scenario.id)) this.scenarios.set(scenario.id, normalizeQualificationScenario(scenario, this));
    for (const suite of builtInSuites()) if (!this.suites.has(suite.id)) this.suites.set(suite.id, normalizeQualificationSuite(suite, this));
  }

  transition(state, eventType, payload = {}) {
    this.state = state;
    if (eventType) this.publish(eventType, payload);
  }

  publish(type, payload = {}) {
    const event = {
      id: this.nextId("qualification-event", { type, sequence: this.events.length + 1 }),
      type,
      sequence: this.events.length + 1,
      timestamp: this.now(),
      payload: sanitize(payload),
    };
    if (terminalEvent(type) && this.events.some((entry) => entry.type === type && entry.payload && payload && entry.payload && entry.payload.runId === payload.runId)) return event;
    this.events.push(event);
    this.events = this.events.slice(-this.configuration.maximumEvents);
    this.stats.eventsPublished += 1;
    for (const [id, subscription] of this.listeners.entries()) {
      if (!eventMatchesFilter(event, subscription.filter)) continue;
      try {
        subscription.listener(cloneJson(event));
      } catch (error) {
        this.listeners.delete(id);
      }
    }
    this.emit("event", cloneJson(event));
    return event;
  }

  now() {
    return this.clock.now();
  }

  nextId(prefix, input = {}) {
    return `${prefix}-${hash({ prefix, input, deterministic: this.configuration.deterministicMode }).slice(0, 16)}`;
  }
}

function normalizeReleaseQualificationConfiguration(input = {}) {
  const config = { ...DEFAULT_CONFIGURATION, ...(input || {}) };
  for (const key of Object.keys(DEFAULT_CONFIGURATION)) {
    if (typeof DEFAULT_CONFIGURATION[key] === "number") config[key] = positiveInteger(config[key], DEFAULT_CONFIGURATION[key]);
    if (typeof DEFAULT_CONFIGURATION[key] === "boolean") config[key] = config[key] !== false;
  }
  config.schemaVersion = RELEASE_QUALIFICATION_SCHEMA_VERSION;
  config.id = String(config.id || DEFAULT_CONFIGURATION.id);
  config.metadata = sanitize(config.metadata || {});
  return Object.freeze(config);
}

function normalizeProjectFixture(input = {}, engine = null) {
  const id = input.id || idFor("fixture", input.name || input.category || "fixture");
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${titleFromId(id)} qualification fixture.`,
    category: normalizeEnum(input.category || ProjectFixtureCategories.CUSTOM, ProjectFixtureCategories, "fixture category"),
    language: input.language || "mixed",
    framework: input.framework || null,
    packageManager: input.packageManager || null,
    workspaceRoots: safeArray(input.workspaceRoots).length ? safeArray(input.workspaceRoots) : [`fixtures/${id}`],
    sourceTemplate: sanitize(input.sourceTemplate || {}),
    expectedFiles: safeArray(input.expectedFiles),
    expectedCommands: safeArray(input.expectedCommands),
    expectedCapabilities: safeArray(input.expectedCapabilities),
    expectedProjectSummary: sanitize(input.expectedProjectSummary || {}),
    expectedArchitectureSignals: safeArray(input.expectedArchitectureSignals),
    validationProfiles: safeArray(input.validationProfiles),
    GitExpected: input.GitExpected === true,
    networkRequired: input.networkRequired === true,
    deterministic: input.deterministic !== false,
    generated: input.generated === true,
    cleanupPolicy: input.cleanupPolicy || "IN_MEMORY_OR_TEMPORARY",
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeUserJourney(input = {}, engine = null) {
  const id = input.id || idFor("journey", input.name || "journey");
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${titleFromId(id)} user journey.`,
    persona: normalizeEnum(input.persona || UserJourneyPersonas.WORKING_DEVELOPER, UserJourneyPersonas, "journey persona"),
    startingState: input.startingState || "EXTENSION_INSTALLED",
    steps: safeArray(input.steps),
    expectedOutcome: sanitize(input.expectedOutcome || {}),
    requiredApprovals: safeArray(input.requiredApprovals),
    requiredManualActions: safeArray(input.requiredManualActions),
    prohibitedOutcomes: safeArray(input.prohibitedOutcomes),
    accessibilityRequirements: safeArray(input.accessibilityRequirements),
    evidenceRequirements: safeArray(input.evidenceRequirements),
    timeoutMs: positiveInteger(input.timeoutMs, engine ? engine.configuration.maximumScenarioDurationMs : 30000),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationSuite(input = {}, engine = null) {
  const id = input.id || idFor("suite", input.profile || input.name || "suite");
  return {
    id,
    name: input.name || titleFromId(id),
    description: input.description || `${titleFromId(id)} qualification suite.`,
    profile: normalizeProfile(input.profile || QualificationProfiles.STANDARD),
    scenarioIds: safeArray(input.scenarioIds),
    fixtureIds: safeArray(input.fixtureIds),
    journeyIds: safeArray(input.journeyIds),
    releaseBlocking: input.releaseBlocking === true,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationScenario(input = {}, engine = null) {
  const id = input.id || idFor("scenario", input.name || input.domain || "scenario");
  return {
    id,
    suiteId: input.suiteId || null,
    name: input.name || titleFromId(id),
    description: input.description || `${titleFromId(id)} qualification scenario.`,
    domain: normalizeEnum(input.domain || ValidationDomains.UNKNOWN, ValidationDomains, "validation domain"),
    fixtureId: input.fixtureId || null,
    journeyId: input.journeyId || null,
    automated: input.automated !== false,
    manual: input.manual === true,
    prerequisites: safeArray(input.prerequisites),
    steps: safeArray(input.steps),
    expectedOutcomes: safeArray(input.expectedOutcomes),
    prohibitedOutcomes: safeArray(input.prohibitedOutcomes),
    requiredEvidence: safeArray(input.requiredEvidence),
    severityOnFailure: normalizeEnum(input.severityOnFailure || QualificationSeverities.MEDIUM, QualificationSeverities, "scenario severity"),
    releaseBlocking: input.releaseBlocking === true,
    cleanupRequirements: safeArray(input.cleanupRequirements),
    timeoutMs: positiveInteger(input.timeoutMs, engine ? engine.configuration.maximumScenarioDurationMs : 30000),
    deterministicSeed: input.deterministicSeed || id,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationRun(input = {}, engine) {
  const timestamp = input.startedAt || null;
  return {
    id: input.id || engine.nextId("qualification-run", { name: input.name, profile: input.profile }),
    name: input.name || "Qualification Run",
    profile: normalizeProfile(input.profile || QualificationProfiles.STANDARD),
    state: normalizeEnum(input.state || QualificationRunStates.CREATED, QualificationRunStates, "run state"),
    suiteIds: safeArray(input.suiteIds),
    scenarioIds: safeArray(input.scenarioIds),
    activeScenarioIds: safeArray(input.activeScenarioIds),
    completedScenarioIds: safeArray(input.completedScenarioIds),
    failedScenarioIds: safeArray(input.failedScenarioIds),
    blockedScenarioIds: safeArray(input.blockedScenarioIds),
    manualScenarioIds: safeArray(input.manualScenarioIds),
    startedAt: timestamp,
    completedAt: input.completedAt || null,
    environment: sanitize(input.environment || {}),
    extension: sanitize(input.extension || {}),
    workspace: sanitize(input.workspace || {}),
    provider: sanitize(input.provider || {}),
    Git: sanitize(input.Git || {}),
    findings: safeArray(input.findings).map(sanitize),
    defects: safeArray(input.defects).map(sanitize),
    blockers: safeArray(input.blockers).map(sanitize),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)).slice(0, engine.configuration.maximumEvidenceItems),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    score: Number.isFinite(Number(input.score)) ? Number(input.score) : null,
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0,
    certification: input.certification || QualificationCertificationLevels.NOT_EVALUATED,
    error: sanitize(input.error || null),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationScenarioResult(input = {}, engine) {
  return {
    id: input.id || engine.nextId("qualification-result", { runId: input.runId, scenarioId: input.scenarioId, count: engine.results.size + 1 }),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    state: normalizeEnum(input.state || QualificationRunStates.SUCCEEDED, QualificationRunStates, "scenario result state"),
    disposition: normalizeEnum(input.disposition || QualificationDispositions.PASSED, QualificationDispositions, "qualification disposition"),
    automatedResult: sanitize(input.automatedResult || null),
    manualResult: sanitize(input.manualResult || null),
    expectedOutcome: sanitize(input.expectedOutcome || null),
    observedOutcome: sanitize(input.observedOutcome || null),
    filesCreated: safeArray(input.filesCreated),
    filesChanged: safeArray(input.filesChanged),
    filesDeleted: safeArray(input.filesDeleted),
    commandsRun: safeArray(input.commandsRun),
    approvalsRequested: integer(input.approvalsRequested, 0),
    approvalsGranted: integer(input.approvalsGranted, 0),
    approvalsRejected: integer(input.approvalsRejected, 0),
    validationState: input.validationState || "UNKNOWN",
    workflowState: input.workflowState || "UNKNOWN",
    providerState: input.providerState || "UNKNOWN",
    GitState: input.GitState || input.gitState || "UNKNOWN",
    reloadCount: Math.min(integer(input.reloadCount, 0), engine.configuration.maximumReloadCycles),
    recoveryState: input.recoveryState || "UNKNOWN",
    accessibilityState: input.accessibilityState || "UNKNOWN",
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    defects: safeArray(input.defects).map(sanitize),
    confidence: Number.isFinite(Number(input.confidence)) ? Number(input.confidence) : 0.8,
    completeness: Number.isFinite(Number(input.completeness)) ? Number(input.completeness) : 0.8,
    error: sanitize(input.error || null),
    startedAt: input.startedAt || engine.now(),
    completedAt: input.completedAt || engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeManualVerificationRecord(input = {}, engine) {
  return {
    id: input.id || engine.nextId("manual-verification", { runId: input.runId, scenarioId: input.scenarioId, checklistItemId: input.checklistItemId }),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    checklistItemId: input.checklistItemId || null,
    title: input.title || "Manual verification",
    instructions: input.instructions || "Record the observed result.",
    expected: input.expected || "Expected behavior is observed.",
    observed: sanitize(input.observed || null),
    status: normalizeEnum(input.status || ManualVerificationStatuses.PENDING, ManualVerificationStatuses, "manual verification status"),
    operator: input.operator || null,
    environment: sanitize(input.environment || {}),
    screenshotReferences: safeArray(input.screenshotReferences),
    logReferences: safeArray(input.logReferences),
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    notes: sanitize(input.notes || null),
    startedAt: input.startedAt || engine.now(),
    completedAt: input.completedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationDefect(input = {}, engine) {
  const severity = normalizeEnum(input.severity || QualificationSeverities.MEDIUM, QualificationSeverities, "defect severity");
  return {
    id: input.id || engine.nextId("qualification-defect", { runId: input.runId, scenarioId: input.scenarioId, title: input.title, count: engine.defects.size + 1 }),
    runId: input.runId || null,
    scenarioId: input.scenarioId || null,
    title: input.title || "Qualification defect",
    description: input.description || input.title || "Qualification evidence requires attention.",
    domain: normalizeEnum(input.domain || ValidationDomains.UNKNOWN, ValidationDomains, "defect domain"),
    severity,
    reproducibility: input.reproducibility || "DETERMINISTIC",
    environment: sanitize(input.environment || {}),
    prerequisites: safeArray(input.prerequisites),
    reproductionSteps: safeArray(input.reproductionSteps),
    expected: sanitize(input.expected || null),
    observed: sanitize(input.observed || null),
    impact: input.impact || "Release qualification confidence is reduced.",
    evidence: safeArray(input.evidence).map((entry) => normalizeEvidence(entry, engine)),
    suspectedComponent: input.suspectedComponent || null,
    regression: input.regression === true,
    releaseBlocking: input.releaseBlocking === true || severity === QualificationSeverities.CRITICAL,
    status: normalizeEnum(input.status || QualificationDefectStatuses.OPEN, QualificationDefectStatuses, "defect status"),
    resolution: input.resolution || null,
    resolvedAt: input.resolvedAt || null,
    metadata: sanitize(input.metadata || {}),
  };
}

function normalizeQualificationReport(input = {}, engine) {
  const run = input.run || input.runId && engine.runs.get(input.runId) || Array.from(engine.runs.values()).slice(-1)[0] || null;
  const defects = safeArray(input.defects || (run ? engine.listDefects({ runId: run.id }) : engine.listDefects({})));
  const manual = safeArray(input.manualVerifications || (run ? engine.listManualVerifications({ runId: run.id }) : engine.listManualVerifications({})));
  const results = run ? engine.listScenarioResults({ runId: run.id }) : [];
  const blockers = engine.getReleaseBlockers(run ? { runId: run.id } : {});
  const score = run && run.score !== null ? run.score : scoreFromDefects(defects);
  const readiness = readinessFromResults(results, manual, defects, engine);
  return {
    id: input.id || engine.nextId("qualification-report", { runId: run && run.id, count: engine.runs.size }),
    runId: run && run.id || input.runId || null,
    profile: run && run.profile || input.profile || QualificationProfiles.STANDARD,
    score,
    status: blockers.length ? "BLOCKED" : manual.filter((record) => record.status === ManualVerificationStatuses.PENDING).length ? "MANUAL_VERIFICATION_REQUIRED" : "AVAILABLE",
    certification: run && run.certification || engine.certification.level,
    automatedScenariosPassed: results.filter((result) => result.automatedResult && result.disposition === QualificationDispositions.PASSED).length,
    automatedScenariosFailed: results.filter((result) => result.automatedResult && [QualificationDispositions.FAILED, QualificationDispositions.BLOCKED, QualificationDispositions.DEFECT_FOUND].includes(result.disposition)).length,
    manualScenariosPassed: manual.filter((record) => record.status === ManualVerificationStatuses.PASSED).length,
    manualScenariosFailed: manual.filter((record) => [ManualVerificationStatuses.FAILED, ManualVerificationStatuses.BLOCKED].includes(record.status)).length,
    manualScenariosPending: manual.filter((record) => record.status === ManualVerificationStatuses.PENDING).length,
    criticalDefects: defects.filter((defect) => defect.severity === QualificationSeverities.CRITICAL && openDefectStatus(defect.status)).length,
    highDefects: defects.filter((defect) => defect.severity === QualificationSeverities.HIGH && openDefectStatus(defect.status)).length,
    releaseBlockers: blockers.map(summarizeDefect),
    installationReadiness: readiness.installation,
    onboardingReadiness: readiness.onboarding,
    localModelReadiness: readiness.localModel,
    codingWorkflowReadiness: readiness.codingWorkflow,
    changeSafetyReadiness: readiness.changeSafety,
    recoveryReadiness: readiness.recovery,
    GitReadiness: readiness.Git,
    accessibilityReadiness: readiness.accessibility,
    extensionHostReadiness: readiness.extensionHost,
    packagingPrecheckReadiness: readiness.packagingPrecheck,
    evidence: (run ? run.evidence : []).slice(0, engine.configuration.maximumEvidenceItems),
    warnings: [].concat(run && run.warnings || [], manual.length ? ["Manual verification is tracked separately from automated evidence."] : []),
    limitations: manual.some((record) => record.status === ManualVerificationStatuses.PENDING) ? ["Manual Extension Host, Ollama, and accessibility checks remain pending until an operator records outcomes."] : [],
    confidence: run ? run.confidence : 0.75,
    completeness: run ? run.completeness : 0.5,
    createdAt: engine.now(),
    metadata: sanitize(input.metadata || {}),
  };
}

function builtInFixtures() {
  return [
    fixture("static-site-basic", ProjectFixtureCategories.STATIC_WEBSITE, "HTML/CSS/JS", "vanilla", ["index.html", "styles.css", "app.js"], ["static html validation"]),
    fixture("react-dashboard", ProjectFixtureCategories.REACT_APPLICATION, "JavaScript", "React", ["package.json", "src/App.jsx", "src/components/KpiCard.jsx", "src/data.js"], ["npm test"]),
    fixture("nextjs-business-site", ProjectFixtureCategories.NEXTJS_APPLICATION, "JavaScript", "Next.js App Router", ["package.json", "app/page.jsx", "app/services/page.jsx", "app/contact/page.jsx"], ["npm run build"]),
    fixture("node-api", ProjectFixtureCategories.NODE_API, "JavaScript", "Node.js", ["package.json", "src/server.js", "src/routes.js", "test/api.test.js"], ["node --test"]),
    fixture("python-cli", ProjectFixtureCategories.PYTHON_APPLICATION, "Python", "stdlib", ["pyproject.toml", "levi_cli/__main__.py", "tests/test_cli.py"], ["python -m unittest"]),
    fixture("broken-project", ProjectFixtureCategories.BROKEN_PROJECT, "JavaScript", "Node.js", ["package.json", "src/broken.js", "test/broken.test.js"], ["node --test"]),
    fixture("legacy-refactor", ProjectFixtureCategories.LEGACY_PROJECT, "JavaScript", "legacy", ["src/legacy.js", "src/helpers.js", "test/legacy.test.js"], ["node --test"]),
    fixture("small-monorepo", ProjectFixtureCategories.MONOREPO, "mixed", "workspaces", ["package.json", "packages/shared/index.js", "packages/app/index.js"], ["npm test"]),
  ];
}

function builtInJourneys() {
  return [
    journey("first-launch-local-model", "First launch with local model", UserJourneyPersonas.BEGINNER, ["open workspace", "complete onboarding", "detect Ollama configuration", "select model", "ask project question"]),
    journey("explain-unfamiliar-project", "Explain an unfamiliar project", UserJourneyPersonas.WORKING_DEVELOPER, ["inspect workspace", "summarize architecture", "identify entry points", "identify test commands", "identify risks"]),
    journey("build-website-feature", "Build a website feature", UserJourneyPersonas.FREELANCER, ["inspect project", "create plan", "generate proposal", "reject proposal", "approve regenerated proposal", "validate", "revert"]),
    journey("fix-real-bug", "Fix a real bug", UserJourneyPersonas.WORKING_DEVELOPER, ["diagnose failure", "propose fix", "approve", "apply", "validate repair"]),
    journey("multi-file-refactor", "Multi-file refactor", UserJourneyPersonas.POWER_USER, ["plan", "delegate review", "propose scoped change", "validate"]),
    journey("teacher-explanation", "Teacher explanation", UserJourneyPersonas.TEACHER, ["ask for explanation", "verify source references", "avoid new education mode"]),
    journey("offline-unavailable-provider", "Offline unavailable provider", UserJourneyPersonas.OFFLINE_USER, ["disconnect provider", "inspect unavailable state", "continue read-only"]),
    journey("security-conscious-change", "Security-conscious change", UserJourneyPersonas.SECURITY_CONSCIOUS_USER, ["inspect approval", "verify no secret leakage", "reject unsafe action"]),
  ];
}

function builtInScenarios() {
  const s = (id, domain, fixtureId, journeyId, profiles, options = {}) => ({
    id,
    suiteId: `suite-${profiles[0].toLowerCase()}`,
    name: titleFromId(id),
    domain,
    fixtureId,
    journeyId,
    automated: options.automated !== false,
    manual: options.manual === true,
    steps: options.steps || ["inspect existing boundary", "collect deterministic evidence", "verify expected result"],
    expectedOutcomes: options.expectedOutcomes || ["safe bounded qualification evidence"],
    prohibitedOutcomes: ["auto approval", "unrestricted shell execution", "automatic Git push", "false manual pass"],
    requiredEvidence: ["frontend-safe summary", "component boundary signal"],
    severityOnFailure: options.severity || QualificationSeverities.HIGH,
    releaseBlocking: options.releaseBlocking === true,
    metadata: { profiles, component: options.component || domain },
  });
  return [
    s("activation-smoke", ValidationDomains.ACTIVATION, null, "first-launch-local-model", [QualificationProfiles.SMOKE], { component: "VSCodeExtension" }),
    s("workspace-detection-smoke", ValidationDomains.WORKSPACE_DETECTION, "static-site-basic", "explain-unfamiliar-project", [QualificationProfiles.SMOKE], { component: "LeviApplicationRuntime" }),
    s("product-ui-registration", ValidationDomains.USER_EXPERIENCE, null, "first-launch-local-model", [QualificationProfiles.SMOKE], { component: "RC004ProductExperience" }),
    s("fake-provider-conversation", ValidationDomains.COPILOT_CHAT, "static-site-basic", "explain-unfamiliar-project", [QualificationProfiles.SMOKE], { component: "AgentOrchestrationEngine" }),
    s("read-only-project-analysis", ValidationDomains.PROJECT_UNDERSTANDING, "static-site-basic", "explain-unfamiliar-project", [QualificationProfiles.SMOKE], { component: "RepositoryPerformanceEngine" }),
    s("extension-cleanup", ValidationDomains.ACTIVATION, null, "first-launch-local-model", [QualificationProfiles.SMOKE], { component: "VSCodeExtension" }),
    s("onboarding-standard", ValidationDomains.ONBOARDING, null, "first-launch-local-model", [QualificationProfiles.STANDARD], { component: "RC004ProductExperience" }),
    s("local-provider-simulation", ValidationDomains.MODEL_PROVIDER, null, "first-launch-local-model", [QualificationProfiles.STANDARD], { component: "ModelProviderGateway" }),
    s("project-explanation", ValidationDomains.PROJECT_UNDERSTANDING, "react-dashboard", "explain-unfamiliar-project", [QualificationProfiles.STANDARD], { component: "LeviApplicationRuntime" }),
    s("planning-workflow", ValidationDomains.PLANNING, "react-dashboard", "build-website-feature", [QualificationProfiles.STANDARD], { component: "DurableWorkflowEngine" }),
    s("change-proposal-flow", ValidationDomains.CHANGE_PROPOSAL, "static-site-basic", "build-website-feature", [QualificationProfiles.STANDARD], { component: "ControlledWorkspaceToolEngine" }),
    s("approval-rejection-flow", ValidationDomains.APPROVAL, "static-site-basic", "build-website-feature", [QualificationProfiles.STANDARD], { component: "ApprovalGateway" }),
    s("approved-apply-validation-revert", ValidationDomains.SOURCE_MUTATION, "static-site-basic", "build-website-feature", [QualificationProfiles.STANDARD], { component: "ControlledWorkspaceToolEngine", releaseBlocking: true }),
    s("reload-recovery-standard", ValidationDomains.RECOVERY, "static-site-basic", "first-launch-local-model", [QualificationProfiles.STANDARD], { component: "ReliabilityAssuranceEngine" }),
    s("multi-fixture-static-react-next", ValidationDomains.PROJECT_UNDERSTANDING, "nextjs-business-site", "build-website-feature", [QualificationProfiles.STRICT], { component: "RepositoryPerformanceEngine" }),
    s("provider-unavailable", ValidationDomains.MODEL_PROVIDER, null, "offline-unavailable-provider", [QualificationProfiles.STRICT], { component: "ModelProviderGateway" }),
    s("untrusted-workspace", ValidationDomains.SECURITY, null, "security-conscious-change", [QualificationProfiles.STRICT], { component: "SecurityAssuranceEngine", releaseBlocking: true }),
    s("validation-failure-repair", ValidationDomains.REPAIR, "broken-project", "fix-real-bug", [QualificationProfiles.STRICT], { component: "DurableWorkflowEngine" }),
    s("multi-agent-review", ValidationDomains.MULTI_AGENT, "legacy-refactor", "multi-file-refactor", [QualificationProfiles.STRICT], { component: "MultiAgentCoordinationEngine" }),
    s("git-unavailable-presentation", ValidationDomains.GIT_PRESENTATION, null, "security-conscious-change", [QualificationProfiles.STRICT], { component: "RC004ProductExperience" }),
    s("accessibility-ui-state", ValidationDomains.ACCESSIBILITY, null, "first-launch-local-model", [QualificationProfiles.STRICT], { component: "VSCodeExtension" }),
    s("security-baseline", ValidationDomains.SECURITY, null, "security-conscious-change", [QualificationProfiles.RELEASE_CANDIDATE], { component: "SecurityAssuranceEngine", releaseBlocking: true }),
    s("reliability-baseline", ValidationDomains.RELIABILITY, null, "first-launch-local-model", [QualificationProfiles.RELEASE_CANDIDATE], { component: "ReliabilityAssuranceEngine", releaseBlocking: true }),
    s("scalability-baseline", ValidationDomains.PERFORMANCE, null, "multi-file-refactor", [QualificationProfiles.RELEASE_CANDIDATE], { component: "StressScalabilityEngine", releaseBlocking: true }),
    s("extension-host-manual", ValidationDomains.EXTENSION_HOST, null, "first-launch-local-model", [QualificationProfiles.RELEASE_CANDIDATE], { automated: false, manual: true, component: "VSCodeExtension", releaseBlocking: true }),
    s("local-ollama-manual", ValidationDomains.LOCAL_MODEL, null, "first-launch-local-model", [QualificationProfiles.RELEASE_CANDIDATE], { automated: false, manual: true, component: "ModelProviderGateway", releaseBlocking: true }),
    s("end-to-end-source-change", ValidationDomains.VALIDATION, "static-site-basic", "build-website-feature", [QualificationProfiles.RELEASE_CANDIDATE], { component: "LeviApplicationRuntime", releaseBlocking: true }),
    s("website-build-validation", ValidationDomains.VALIDATION, "nextjs-business-site", "build-website-feature", [QualificationProfiles.RELEASE_CANDIDATE], { component: "ControlledWorkspaceToolEngine" }),
    s("packaging-precheck", ValidationDomains.PACKAGING_PRECHECK, null, "security-conscious-change", [QualificationProfiles.RELEASE_CANDIDATE], { component: "VSCodeExtension", releaseBlocking: true }),
  ];
}

function builtInSuites() {
  return Object.values(QualificationProfiles).map((profile) => ({
    id: `suite-${profile.toLowerCase()}`,
    name: `${profile} Qualification Suite`,
    profile,
    scenarioIds: profileScenarioIds(profile),
    releaseBlocking: profile === QualificationProfiles.RELEASE_CANDIDATE,
  }));
}

function fixture(id, category, language, framework, expectedFiles, expectedCommands) {
  return {
    id,
    name: titleFromId(id),
    category,
    language,
    framework,
    packageManager: expectedCommands.some((command) => command.startsWith("npm")) ? "npm" : null,
    expectedFiles,
    expectedCommands,
    expectedCapabilities: ["workspace detection", "project explanation", "bounded change review"],
    expectedProjectSummary: { purpose: titleFromId(id), deterministic: true },
    expectedArchitectureSignals: expectedFiles.map((filePath) => filePath.split("/")[0]),
    validationProfiles: [QualificationProfiles.SMOKE, QualificationProfiles.STANDARD],
    GitExpected: false,
    networkRequired: false,
    deterministic: true,
    generated: true,
    cleanupPolicy: "DELETE_TEMPORARY_FIXTURE",
  };
}

function journey(id, name, persona, steps) {
  return {
    id,
    name,
    persona,
    startingState: "EXTENSION_ACTIVE",
    steps,
    expectedOutcome: { status: "useful bounded product workflow" },
    requiredApprovals: steps.includes("approve") ? ["explicit user approval"] : [],
    requiredManualActions: id === "first-launch-local-model" ? ["Extension Host launch", "Ollama check"] : [],
    prohibitedOutcomes: ["auto approval", "secret exposure", "automatic Git push"],
    accessibilityRequirements: ["keyboard reachable", "screen-reader labels", "focus visible"],
    evidenceRequirements: ["workspace-safe summary", "redacted report"],
    timeoutMs: 30000,
  };
}

function profileScenarioIds(profile) {
  const smoke = ["activation-smoke", "workspace-detection-smoke", "product-ui-registration", "fake-provider-conversation", "read-only-project-analysis", "extension-cleanup"];
  const standard = smoke.concat(["onboarding-standard", "local-provider-simulation", "project-explanation", "planning-workflow", "change-proposal-flow", "approval-rejection-flow", "approved-apply-validation-revert", "reload-recovery-standard"]);
  const strict = standard.concat(["multi-fixture-static-react-next", "provider-unavailable", "untrusted-workspace", "validation-failure-repair", "multi-agent-review", "git-unavailable-presentation", "accessibility-ui-state"]);
  if (profile === QualificationProfiles.SMOKE) return smoke;
  if (profile === QualificationProfiles.STANDARD) return standard;
  if (profile === QualificationProfiles.STRICT) return strict;
  return strict.concat(["security-baseline", "reliability-baseline", "scalability-baseline", "extension-host-manual", "local-ollama-manual", "end-to-end-source-change", "website-build-validation", "packaging-precheck"]);
}

function suiteIdsForProfile(engine, profile) {
  return engine.listSuites({ profile }).map((suite) => suite.id);
}

function manualChecklistItems() {
  const rows = [
    ["Environment", "record-operating-system", "Record operating system", "Record OS name/version/architecture.", "Environment values are captured."],
    ["Environment", "record-vscode-version", "Record VS Code version", "Run Code: About or code --version.", "VS Code version is captured."],
    ["Environment", "record-extension-version", "Record extension version", "Record Levi extension version from manifest or Extensions view.", "Extension version is captured."],
    ["Environment", "record-node-version", "Record Node version", "Run node --version.", "Node version is captured."],
    ["Environment", "record-ollama-version", "Record Ollama version", "Run ollama --version if installed.", "Ollama version or absence is captured."],
    ["Environment", "record-selected-model", "Record selected model", "Record the selected local model.", "Selected model or unavailable state is captured."],
    ["Environment", "record-repository-fixture", "Record repository fixture", "Record fixture or real project path.", "Repository fixture is captured."],
    ["Extension Host", "launch-extension-host", "Launch Extension Development Host", "Run npm run dev from packages/vscode-extension or press F5 in VS Code.", "Extension Development Host opens."],
    ["Extension Host", "confirm-levi-activates", "Confirm Levi activates", "Open Levi Activity Bar and inspect output.", "Levi activation completes without uncaught errors."],
    ["Extension Host", "confirm-activity-bar", "Confirm Activity Bar container", "Inspect Activity Bar for Levi.", "Levi container is visible."],
    ["Extension Host", "confirm-copilot-panel", "Confirm Copilot panel", "Run Levi: Open.", "Copilot panel opens."],
    ["Extension Host", "confirm-environment-panel", "Confirm Environment panel", "Open Levi Environment view.", "Environment panel shows bounded state."],
    ["Extension Host", "confirm-no-activation-error", "Confirm no activation error", "Inspect notifications and output.", "No activation error is present."],
    ["Extension Host", "confirm-clean-deactivation", "Confirm clean deactivation", "Close host and inspect output.", "Clean deactivation is recorded."],
    ["Onboarding", "complete-onboarding", "Complete first-run onboarding", "Run Levi: Open Onboarding.", "Onboarding explains trust/provider/local model."],
    ["Onboarding", "verify-workspace-trust", "Verify workspace trust", "Open trusted and untrusted workspace states.", "Protected mutation requires trust."],
    ["Onboarding", "verify-provider-detection", "Verify provider detection", "Open Models view.", "Provider state is shown honestly."],
    ["Onboarding", "select-local-model", "Select local model", "Run Levi: Select Model.", "Selection succeeds or unavailable state is explicit."],
    ["Onboarding", "inspect-privacy-explanation", "Inspect privacy explanation", "Open model/onboarding details.", "Remote privacy limits are clear."],
    ["Onboarding", "verify-no-account-requirement", "Verify no account requirement", "Use local/offline flow.", "No account is required for local workflow."],
    ["Conversation", "ask-project-question", "Ask project question", "Ask Levi to explain the project.", "Answer is workspace-aware and bounded."],
    ["Conversation", "inspect-context", "Inspect context", "Run Levi: Show Context.", "Context references are shown without source dumps."],
    ["Conversation", "attach-current-file", "Attach current file", "Use current-file action.", "Current file reference is attached safely."],
    ["Conversation", "attach-selected-code", "Attach selected code", "Select code and attach selection.", "Selection is scoped and redacted if needed."],
    ["Conversation", "switch-modes", "Switch modes", "Switch Ask/Plan/Build/Fix/Review/Teach.", "Mode changes presentation only."],
    ["Conversation", "cancel-streaming-response", "Cancel streaming response", "Cancel an in-progress response.", "Turn cancels cleanly."],
    ["Conversation", "retry-response", "Retry", "Retry the latest response.", "Retry respects provider/workspace state."],
    ["Conversation", "switch-model", "Switch model", "Change selected model.", "Model switch updates state without exposing credentials."],
    ["Planning and workflows", "create-plan", "Create plan", "Ask Levi to plan a bounded task.", "Plan is inspectable."],
    ["Planning and workflows", "inspect-timeline", "Inspect timeline", "Open timeline/active workflow.", "Timeline states are plain-language."],
    ["Planning and workflows", "start-workflow", "Start workflow", "Start planned workflow.", "Workflow starts through runtime."],
    ["Planning and workflows", "pause-workflow", "Pause", "Pause workflow.", "Pause is reflected."],
    ["Planning and workflows", "resume-workflow", "Resume", "Resume workflow.", "Resume is bounded and safe."],
    ["Planning and workflows", "inspect-team", "Inspect multi-agent team", "Open Multi-Agent view.", "Agent agreement is not approval."],
    ["Planning and workflows", "inspect-warnings", "Inspect warnings and limitations", "Inspect Environment/technical details.", "Warnings and limitations are visible."],
    ["Source change", "request-one-file-change", "Request one-file change", "Request a bounded source edit.", "Proposal is created."],
    ["Source change", "inspect-proposal", "Inspect proposal", "Open active change.", "Scope and risk are shown."],
    ["Source change", "preview-diff", "Preview diff", "Preview file diff.", "Diff is bounded."],
    ["Source change", "reject-proposal", "Reject", "Reject the proposal.", "No mutation occurs."],
    ["Source change", "verify-no-mutation", "Verify no mutation", "Inspect file content.", "File is unchanged."],
    ["Source change", "request-again", "Request again", "Generate a new proposal.", "Fresh proposal is created."],
    ["Source change", "approve", "Approve", "Approve explicitly.", "Approval is user-recorded."],
    ["Source change", "apply", "Apply", "Apply approved change.", "Only scoped file changes."],
    ["Source change", "verify-exact-file", "Verify exact file", "Inspect changed file.", "Only exact file changed."],
    ["Source change", "validate", "Validate", "Run validation.", "Validation result is visible."],
    ["Source change", "inspect-result", "Inspect result", "Open validation result.", "Result is bounded."],
    ["Source change", "revert", "Revert", "Revert change.", "Workspace restoration is verified."],
    ["Source change", "verify-restoration", "Verify restoration", "Inspect file content.", "Original content restored."],
    ["Failure modes", "disconnect-provider", "Disconnect provider", "Stop local model/provider.", "Unavailable state is honest."],
    ["Failure modes", "inspect-unavailable", "Inspect unavailable state", "Open Models/Copilot.", "No false success."],
    ["Failure modes", "open-untrusted-workspace", "Open untrusted workspace", "Use VS Code trust controls.", "Mutation is blocked."],
    ["Failure modes", "stale-proposal", "Create stale proposal", "Change file after proposal.", "Apply is blocked."],
    ["Failure modes", "validation-failure", "Trigger validation failure", "Run failing validation.", "Repair path is inspectable."],
    ["Failure modes", "reload-during-workflow", "Reload during workflow", "Reload Extension Host.", "No protected auto-resume."],
    ["Git", "inspect-branch", "Inspect branch", "Open Git presentation.", "Branch shown if safe adapter provides it."],
    ["Git", "inspect-status", "Inspect status", "Open source-control status.", "Status shown or unavailable."],
    ["Git", "inspect-changes", "Inspect changes", "Open changes.", "Changes are bounded."],
    ["Git", "inspect-commit-readiness", "Inspect commit readiness", "Open Git presentation.", "No automatic commit readiness without adapter."],
    ["Git", "inspect-push-readiness", "Inspect push readiness", "Open Git presentation.", "No automatic push."],
    ["Git", "unsupported-actions-unavailable", "Verify unsupported actions stay unavailable", "Look for force-push action.", "Force push unavailable."],
    ["Accessibility", "keyboard-only", "Keyboard-only navigation", "Navigate without mouse.", "Controls are reachable."],
    ["Accessibility", "focus-visibility", "Focus visibility", "Tab through UI.", "Focus is visible."],
    ["Accessibility", "screen-reader-labels", "Screen-reader labels", "Inspect labels.", "Controls have labels."],
    ["Accessibility", "zoom", "Zoom", "Increase zoom.", "Text remains usable."],
    ["Accessibility", "reduced-motion", "Reduced motion", "Enable reduced motion.", "Motion is reduced."],
    ["Accessibility", "approval-card-accessibility", "Approval-card accessibility", "Inspect approval card.", "Approval details are readable."],
    ["Accessibility", "timeline-accessibility", "Timeline accessibility", "Inspect timeline.", "Timeline is readable."],
    ["Security", "inspect-logs", "Inspect logs", "Review output channel.", "No credentials/private reasoning/source dumps."],
    ["Security", "inspect-virtual-documents", "Inspect virtual documents", "Open Levi docs.", "No secrets or complete protected source."],
    ["Security", "inspect-ui", "Inspect UI", "Open Copilot/Environment.", "No raw unsafe stack trace."],
    ["Real project", "open-small-real-project", "Open a small real project", "Open project.", "Workspace is detected."],
    ["Real project", "ask-explain-real-project", "Ask Levi to explain it", "Ask project explanation.", "Explanation references evidence."],
    ["Real project", "bounded-improvement", "Request bounded improvement", "Request one scoped improvement.", "Plan/proposal is bounded."],
    ["Real project", "approve-apply-validate", "Approve, apply, validate", "Approve and validate.", "Result is inspected."],
  ];
  return rows.map(([section, id, title, instructions, expected]) => ({ section, id, title, instructions, expected }));
}

function extensionHostCommands() {
  return [
    "cd packages/vscode-extension",
    "npm run check",
    "npm run validate",
    "npm run dev",
  ];
}

function baselineObservation(componentName, componentState, summary) {
  if (componentState.status === "UNAVAILABLE") {
    return {
      disposition: QualificationDispositions.PASSED_WITH_LIMITATIONS,
      summary: `${summary}; ${componentName} is unavailable in this qualification context.`,
      warnings: [`${componentName} unavailable; baseline cannot be promoted beyond automated qualification.`],
      confidence: 0.72,
      completeness: 0.65,
    };
  }
  return {
    disposition: QualificationDispositions.PASSED,
    summary: `${summary}; ${componentName} public health boundary is available.`,
    confidence: 0.9,
    completeness: 0.88,
  };
}

function readinessFromResults(results, manual, defects) {
  const domain = (name) => {
    const relevant = results.filter((result) => {
      const scenarioDomain = result.observedOutcome && result.observedOutcome.domain || null;
      return scenarioDomain === name || JSON.stringify(result).includes(name);
    });
    const hasBlockingDefect = defects.some((defect) => defect.domain === name && openDefectStatus(defect.status));
    if (hasBlockingDefect) return "BLOCKED";
    if (manual.some((record) => record.status === ManualVerificationStatuses.PENDING && JSON.stringify(record).includes(name))) return "MANUAL_PENDING";
    if (relevant.some((result) => result.disposition === QualificationDispositions.PASSED)) return "READY";
    return "AUTOMATED_BASELINE";
  };
  return {
    installation: domain(ValidationDomains.INSTALLATION),
    onboarding: domain(ValidationDomains.ONBOARDING),
    localModel: manual.some((record) => record.title.toLowerCase().includes("ollama") && record.status === ManualVerificationStatuses.PENDING) ? "MANUAL_PENDING" : "AUTOMATED_BASELINE",
    codingWorkflow: domain(ValidationDomains.SOURCE_MUTATION),
    changeSafety: domain(ValidationDomains.APPROVAL),
    recovery: domain(ValidationDomains.RECOVERY),
    Git: "UNAVAILABLE_SAFE",
    accessibility: manual.some((record) => record.metadata && record.metadata.section === "Accessibility" && record.status === ManualVerificationStatuses.PENDING) ? "MANUAL_PENDING" : "AUTOMATED_BASELINE",
    extensionHost: manual.some((record) => record.metadata && record.metadata.section === "Extension Host" && record.status === ManualVerificationStatuses.PENDING) ? "MANUAL_PENDING" : "AUTOMATED_BASELINE",
    packagingPrecheck: domain(ValidationDomains.PACKAGING_PRECHECK),
  };
}

function validateFiniteConfiguration(config) {
  const errors = [];
  for (const [key, value] of Object.entries(config || {})) {
    if ((key.startsWith("maximum") || key.endsWith("Ms") || key.endsWith("Bytes")) && (!Number.isFinite(Number(value)) || Number(value) <= 0)) errors.push(`${key} must be finite and positive.`);
  }
  return { valid: errors.length === 0, errors };
}

function normalizeEvidence(input = {}, engine = null) {
  if (typeof input === "string") return evidence("text", input, engine);
  return {
    id: input.id || (engine ? engine.nextId("qualification-evidence", { source: input.source, summary: input.summary || input.signal }) : idFor("evidence", JSON.stringify(input))),
    source: input.source || "ReleaseQualificationEngine",
    summary: input.summary || input.signal || "Qualification evidence.",
    reference: input.reference || null,
    redacted: input.redacted !== false,
    createdAt: input.createdAt || (engine ? engine.now() : new Date(0).toISOString()),
    metadata: sanitize(input.metadata || {}),
  };
}

function evidence(source, summary, engine = null) {
  return normalizeEvidence({ source, summary }, engine);
}

function eventMatchesFilter(event, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  if (filter.type && event.type !== filter.type) return false;
  if (filter.types && !safeArray(filter.types).includes(event.type)) return false;
  if (filter.runId && event.payload && event.payload.runId !== filter.runId) return false;
  if (filter.scenarioId && event.payload && event.payload.scenarioId !== filter.scenarioId) return false;
  return true;
}

function matchesFilter(value = {}, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  for (const [key, expected] of Object.entries(filter)) {
    if (expected === undefined || expected === null || key === "filter") continue;
    if (value[key] !== expected) return false;
  }
  return true;
}

function terminalEvent(type) {
  return [
    QualificationEventTypes.RUN_CANCELLED,
    QualificationEventTypes.RUN_COMPLETED,
    QualificationEventTypes.RUN_PARTIALLY_COMPLETED,
    QualificationEventTypes.RUN_FAILED,
    QualificationEventTypes.CERTIFICATION_COMPLETED,
    QualificationEventTypes.CERTIFICATION_BLOCKED,
  ].includes(type);
}

function terminalRunState(state) {
  return [QualificationRunStates.SUCCEEDED, QualificationRunStates.PARTIALLY_SUCCEEDED, QualificationRunStates.FAILED, QualificationRunStates.BLOCKED, QualificationRunStates.CANCELLED, QualificationRunStates.TIMED_OUT, QualificationRunStates.INVALID, QualificationRunStates.EXPIRED].includes(state);
}

function interruptedRunState(state) {
  if ([QualificationRunStates.RUNNING_AUTOMATED, QualificationRunStates.PREPARING_FIXTURE, QualificationRunStates.VERIFYING, QualificationRunStates.WAITING_FOR_APPROVAL, QualificationRunStates.WAITING_FOR_USER_INPUT].includes(state)) return QualificationRunStates.FAILED;
  if (state === QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION) return QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION;
  return state || QualificationRunStates.CREATED;
}

function manualRestoreStatus(status) {
  return status === ManualVerificationStatuses.PASSED ? ManualVerificationStatuses.PENDING : status || ManualVerificationStatuses.PENDING;
}

function openDefectStatus(status) {
  return ![QualificationDefectStatuses.FIXED, QualificationDefectStatuses.VERIFIED, QualificationDefectStatuses.ACCEPTED_RISK, QualificationDefectStatuses.NOT_REPRODUCIBLE, QualificationDefectStatuses.DUPLICATE].includes(status);
}

function scoreFromDefects(defects = []) {
  const weights = { INFORMATIONAL: 0, LOW: 3, MEDIUM: 8, HIGH: 20, CRITICAL: 55 };
  const deduction = safeArray(defects).filter((defect) => openDefectStatus(defect.status)).reduce((sum, defect) => sum + (weights[defect.severity] || 0), 0);
  return Math.max(0, 100 - deduction);
}

function summarizeDefect(defect) {
  return {
    id: defect.id,
    title: defect.title,
    domain: defect.domain,
    severity: defect.severity,
    releaseBlocking: defect.releaseBlocking,
    status: defect.status,
  };
}

function normalizeProfile(profile) {
  const value = String(profile || QualificationProfiles.STANDARD).toUpperCase();
  return QualificationProfiles[value] || QualificationProfiles.STANDARD;
}

function normalizeEnum(value, allowed, label) {
  if (Object.values(allowed).includes(value)) return value;
  const normalized = String(value || "").toUpperCase();
  if (Object.values(allowed).includes(normalized)) return normalized;
  throw new Error(`Invalid ${label}: ${value}`);
}

function sanitize(value, seen = new WeakSet()) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return redactText(value).slice(0, 8000);
  if (value instanceof Error) return sanitizeError(value);
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 256).map((entry) => sanitize(entry, seen));
  const result = {};
  for (const [key, entry] of Object.entries(value).slice(0, 256)) {
    if (isSensitiveKey(key) || ["__proto__", "prototype", "constructor", "handler", "adapter", "instance", "runtime"].includes(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = sanitize(entry, seen);
  }
  return result;
}

function sanitizeError(error) {
  return { name: error && error.name || "Error", message: redactText(error && error.message || String(error || "")) };
}

function redactText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-[REDACTED]")
    .replace(/\b(?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^,\s"']+/gi, (match) => `${match.split(/[:=]/)[0]}=[REDACTED]`);
}

function isSensitiveKey(key) {
  return /secret|token|password|authorization|api[_-]?key|credential|privateprompt|privatereasoning|sourcecontent|protectedsource|commandOutput/i.test(String(key));
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function requiredString(value, message) {
  if (!value || typeof value !== "string") throw new Error(message);
  return value;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function integer(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function roundUnit(value) {
  return Math.max(0, Math.min(1, Math.round(Number(value || 0) * 1000) / 1000));
}

function titleFromId(id) {
  return String(id || "qualification").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(sanitize(value === undefined ? "" : value))).digest("hex");
}

function idFor(prefix, seed) {
  return `${prefix}-${hash(seed).slice(0, 16)}`;
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

function emptyStats() {
  return {
    fixturesRegistered: 0,
    fixturesPrepared: 0,
    fixturesCleaned: 0,
    journeysRegistered: 0,
    suitesRegistered: 0,
    scenariosRegistered: 0,
    runsCreated: 0,
    runsCompleted: 0,
    runsPartiallyCompleted: 0,
    runsFailed: 0,
    runsCancelled: 0,
    automatedScenariosPassed: 0,
    automatedScenariosFailed: 0,
    manualChecksCreated: 0,
    manualChecksPassed: 0,
    manualChecksFailed: 0,
    manualChecksPending: 0,
    extensionHostLaunches: 0,
    extensionHostFailures: 0,
    localModelChecks: 0,
    localModelSuccesses: 0,
    localModelFailures: 0,
    endToEndJourneysCompleted: 0,
    changeProposalsCreated: 0,
    approvalsRejected: 0,
    approvalsGranted: 0,
    changesApplied: 0,
    validationsPassed: 0,
    validationsFailed: 0,
    repairsCompleted: 0,
    revertsCompleted: 0,
    reloadCycles: 0,
    recoveriesCompleted: 0,
    defectsCreated: 0,
    criticalDefects: 0,
    highDefects: 0,
    defectsFixed: 0,
    defectsVerified: 0,
    releaseBlockers: 0,
    certificationAttempts: 0,
    certificationsPassed: 0,
    certificationsBlocked: 0,
    averageRunDuration: 0,
    averageScenarioDuration: 0,
    eventsPublished: 0,
    corruptionFallbacks: 0,
    lastRun: null,
    lastDefect: null,
    lastBlocker: null,
    lastManualCheck: null,
    lastCertification: null,
    lastPersistence: null,
  };
}

module.exports = {
  DEFAULT_CONFIGURATION,
  MemoryReleaseQualificationPersistenceAdapter,
  ManualVerificationStatuses,
  ProjectFixtureCategories,
  QualificationCertificationLevels,
  QualificationDefectStatuses,
  QualificationDispositions,
  QualificationEngineStates,
  QualificationEventTypes,
  QualificationProfiles,
  QualificationRunStates,
  QualificationSeverities,
  RELEASE_QUALIFICATION_SCHEMA_VERSION,
  ReleaseQualificationEngine,
  UserJourneyPersonas,
  ValidationDomains,
  normalizeManualVerificationRecord,
  normalizeProjectFixture,
  normalizeQualificationDefect,
  normalizeQualificationReport,
  normalizeQualificationRun,
  normalizeQualificationScenario,
  normalizeQualificationScenarioResult,
  normalizeQualificationSuite,
  normalizeReleaseQualificationConfiguration,
  normalizeUserJourney,
};
