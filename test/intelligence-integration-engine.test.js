const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CERTIFICATION_LEVELS,
  CERTIFICATION_PROFILES,
  COMPONENT_STATUSES,
  COMPONENT_TYPES,
  FINDING_CODES,
  INTEGRATION_DOMAINS,
  INTEGRATION_EVENTS,
  INTEGRATION_EVENT_TYPES,
  INTEGRATION_FINDING_SEVERITIES,
  INTEGRATION_STATUSES,
  INTELLIGENCE_INTEGRATION_SCHEMA_VERSION,
  IntelligenceIntegrationEngine,
} = require("../src/intelligence-integration-engine");

test("normalizes components, capabilities, integrations, health reports, findings, stable ids, and duplicate findings", () => {
  const engine = new IntelligenceIntegrationEngine({ autoDiscover: false, now: fixedNow });
  const events = collectEvents(engine);

  const component = engine.registerComponent({
    id: "component:fixture",
    name: "FixtureEngine",
    type: COMPONENT_TYPES.ENGINE,
    schemaVersion: 1,
    capabilities: ["fixture capability"],
    persistence: { supported: true },
    metadata: { domain: INTEGRATION_DOMAINS.CAPABILITIES, requiredMethods: ["snapshot"] },
    instance: { snapshot() { return {}; } },
  });
  const capability = engine.registerCapability({
    name: "fixture capability",
    providerId: component.id,
    domain: INTEGRATION_DOMAINS.CAPABILITIES,
  });
  const integration = engine.registerIntegration({
    sourceComponentId: "component:intelligence-integration",
    targetComponentId: component.id,
    domain: INTEGRATION_DOMAINS.CAPABILITIES,
    required: true,
  });
  const finding = engine.createFinding({
    domain: INTEGRATION_DOMAINS.CAPABILITIES,
    code: FINDING_CODES.UNKNOWN,
    severity: INTEGRATION_FINDING_SEVERITIES.INFO,
    title: "Fixture finding",
    description: "A deterministic finding.",
    componentIds: [component.id],
  });
  const duplicate = engine.createFinding({
    domain: INTEGRATION_DOMAINS.CAPABILITIES,
    code: FINDING_CODES.UNKNOWN,
    severity: INTEGRATION_FINDING_SEVERITIES.INFO,
    title: "Fixture finding",
    description: "A deterministic finding.",
    componentIds: [component.id],
  });
  const health = engine.getComponentHealth(component.id);

  assert.equal(component.status, COMPONENT_STATUSES.AVAILABLE);
  assert.equal(capability.providerId, component.id);
  assert.equal(integration.status, INTEGRATION_STATUSES.UNVERIFIED);
  assert.equal(finding.id, duplicate.id);
  assert.equal(health.status, COMPONENT_STATUSES.HEALTHY);
  assert.equal(engine.snapshot().schemaVersion, INTELLIGENCE_INTEGRATION_SCHEMA_VERSION);
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.COMPONENT_REGISTERED));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.CAPABILITY_REGISTERED));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.INTEGRATION_REGISTERED));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.FINDING_CREATED));
});

test("discovers default LI and AE components, capabilities, integrations, dependencies, duplicate providers, and compatible contracts", () => {
  const engine = new IntelligenceIntegrationEngine({ repositoryPath: createTempDir(), now: fixedNow });

  const components = engine.discoverComponents();
  const capabilities = engine.discoverCapabilities();
  engine.wire();
  const integrations = engine.listIntegrations();
  const contracts = engine.validateContracts();
  const integrationValidation = engine.validateIntegrations();

  assert.ok(components.some((component) => component.id === "component:code-understanding"));
  assert.ok(capabilities.some((capability) => capability.name === "code entity analysis"));
  assert.ok(integrations.some((integration) => integration.required));
  assert.equal(contracts.status, "PASSED");
  assert.equal(integrationValidation.status, "PASSED");
  assert.ok(engine.listCapabilities({ domain: INTEGRATION_DOMAINS.EXECUTION }).length > 0);
  assert.ok(engine.listIntegrations({ required: true }).length > 0);

  engine.registerCapability({
    id: "capability:duplicate-one",
    name: "offline search",
    providerId: "component:intelligence-integration",
    domain: INTEGRATION_DOMAINS.OFFLINE_INDEX,
  });
  engine.detectDuplicateCapabilityProviders();
  assert.ok(engine.snapshot().findings.some((finding) => finding.code === FINDING_CODES.DUPLICATE_CAPABILITY_PROVIDER));

  const partial = new IntelligenceIntegrationEngine({ autoDiscover: false, now: fixedNow });
  partial.registerComponent({
    id: "component:needs-required",
    name: "NeedsRequired",
    type: COMPONENT_TYPES.ENGINE,
    requiredDependencies: ["component:missing-required"],
    optionalDependencies: ["component:missing-optional"],
    metadata: { requiredMethods: ["snapshot"] },
    instance: { snapshot() { return {}; } },
  });
  partial.registerIntegration({
    sourceComponentId: "component:needs-required",
    targetComponentId: "component:missing-required",
    domain: INTEGRATION_DOMAINS.CERTIFICATION,
    required: true,
  });
  const validation = partial.validateIntegrations();
  assert.equal(validation.status, "PARTIAL");
  assert.ok(validation.findings.some((finding) => finding.code === FINDING_CODES.MISSING_COMPONENT));
});

test("validates evidence lineage including broken, stale, duplicate, circular, authority, and confidence failures", () => {
  const engine = new IntelligenceIntegrationEngine({ autoDiscover: false, now: fixedNow });
  const stale = {
    id: "evidence:stale",
    sourceComponentId: "component:intelligence-integration",
    sourceRecordId: "stale-record",
    sourceType: "fixture",
    authority: "verified_repository_state",
    confidence: 0.8,
    metadata: { stale: true },
  };
  engine.addEvidenceReference(stale);
  engine.addEvidenceReference({ ...stale, id: "evidence:duplicate" });
  engine.addEvidenceReference({
    id: "evidence:broken",
    sourceComponentId: "component:missing",
    sourceRecordId: "missing-record",
    sourceType: "fixture",
    authority: "",
    confidence: 2,
  });
  engine.addEvidenceReference({
    id: "evidence:circular",
    sourceComponentId: "component:intelligence-integration",
    sourceRecordId: "circular",
    sourceType: "fixture",
    authority: "verified_repository_state",
    confidence: 0.7,
    metadata: { references: ["evidence:circular"] },
  });

  const result = engine.validateEvidenceTraceability();

  assert.equal(result.status, "FAILED");
  assert.ok(result.findings.some((finding) => finding.code === FINDING_CODES.STALE_EVIDENCE));
  assert.ok(result.findings.some((finding) => finding.code === FINDING_CODES.BROKEN_EVIDENCE_LINEAGE));
  assert.ok(result.checks.some((check) => check.failures.includes("duplicate evidence reference")));
  assert.ok(result.checks.some((check) => check.failures.includes("circular evidence reference")));
});

test("enforces authority, security, approval, lifecycle, and critical certification caps", () => {
  const engine = new IntelligenceIntegrationEngine({ now: fixedNow });
  engine.registerComponent({
    id: "component:bad-authority",
    name: "BadAuthority",
    type: COMPONENT_TYPES.ENGINE,
    authorityRules: { order: ["heuristic", "current_user_instruction"] },
    metadata: { requiredMethods: [] },
    instance: {},
  });
  const authority = engine.validateAuthorityConsistency();
  const security = engine.validateSecurityInvariants({
    learningCanDisableSecurity: true,
    securityFindings: [{ severity: "CRITICAL", status: "OPEN", title: "Critical" }],
  });
  const approval = engine.validateApprovalInvariants({ learningCanRemoveApproval: true, missingApprovalAccepted: true });
  const lifecycle = engine.validateLifecycleOrdering({
    events: [{ type: "execution_completed", sessionId: "s1" }, { type: "iteration_started", sessionId: "s1" }],
  });
  const certification = engine.runCertification(CERTIFICATION_PROFILES.SECURITY_INVARIANTS, {
    learningCanDisableSecurity: true,
    securityFindings: [{ severity: "CRITICAL", status: "OPEN", title: "Critical" }],
  });

  assert.equal(authority.status, "FAILED");
  assert.equal(security.status, "FAILED");
  assert.equal(approval.status, "FAILED");
  assert.equal(lifecycle.status, "FAILED");
  assert.equal(certification.level, CERTIFICATION_LEVELS.FAILED);
  assert.ok(certification.blockers.some((finding) => finding.code === FINDING_CODES.SECURITY_INVARIANT_FAILURE));
});

test("reports platform health, deterministic scoring, degraded mode, compatibility matrix, and statistics", () => {
  const engine = new IntelligenceIntegrationEngine({ now: fixedNow });
  engine.unregisterComponent("component:learning-adaptation");
  const health = engine.getPlatformHealth({ persistenceUnavailable: true });
  const matrix = engine.generateCompatibilityMatrix();
  const stats = engine.getStats();

  assert.ok(health.scores.overallIntegrationHealth.value >= 0);
  assert.ok(health.scores.overallIntegrationHealth.value <= 100);
  assert.ok(health.scores.securityIntegrity.value >= 0);
  assert.ok(health.findings.some((finding) => finding.code === FINDING_CODES.DEGRADED_CAPABILITY || finding.code === FINDING_CODES.MISSING_COMPONENT));
  assert.ok(matrix.some((entry) => entry.component === "component:intelligence-integration"));
  assert.ok(stats.componentsRegistered > 0);
  assert.ok(stats.healthChecks > 0);
  assert.ok(stats.partialIntegrations >= 0);
});

test("executes deterministic integration scenarios with expected events, evidence, invariants, and failures", () => {
  const engine = new IntelligenceIntegrationEngine({ now: fixedNow });
  const events = collectEvents(engine);

  const passed = engine.executeScenario("repository_to_index");
  const failed = engine.executeScenario({
    id: "missing-component-scenario",
    description: "Missing component fixture.",
    prerequisites: ["component:not-here"],
    steps: [{ id: "missing", componentId: "component:not-here", event: "fixture_missing" }],
    expectedEvents: ["fixture_missing"],
    expectedEvidenceLineage: [{ sourceComponentId: "component:not-here" }],
    requiredInvariants: ["security"],
  });

  assert.equal(passed.status, "PASSED");
  assert.ok(passed.passedSteps.length > 0);
  assert.ok(passed.events.length > 0);
  assert.ok(passed.evidence.every((reference) => reference.authority));
  assert.equal(failed.status, "FAILED");
  assert.ok(failed.findings.some((finding) => finding.code === FINDING_CODES.MISSING_COMPONENT));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.SCENARIO_STARTED));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.SCENARIO_COMPLETED));
  assert.ok(events.includes(INTEGRATION_EVENT_TYPES.SCENARIO_FAILED));
});

test("runs certifications, deterministic reruns, comparisons, explanations, readiness reports, and validation", () => {
  const engine = new IntelligenceIntegrationEngine({ now: fixedNow });
  const core = engine.runCertification(CERTIFICATION_PROFILES.CORE_INTELLIGENCE);
  const ae = engine.runCertification(CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION);
  const offline = engine.runCertification(CERTIFICATION_PROFILES.OFFLINE_OPERATION);
  const degraded = engine.runCertification(CERTIFICATION_PROFILES.DEGRADED_OPERATION);
  const security = engine.runCertification(CERTIFICATION_PROFILES.SECURITY_INVARIANTS);
  const approval = engine.runCertification(CERTIFICATION_PROFILES.APPROVAL_INVARIANTS);
  const persistence = engine.runCertification(CERTIFICATION_PROFILES.PERSISTENCE_AND_RECOVERY);
  const evidence = engine.runCertification(CERTIFICATION_PROFILES.EVIDENCE_TRACEABILITY);
  const ide = engine.runCertification(CERTIFICATION_PROFILES.IDE_BACKEND_READINESS);
  const full = engine.runCertification(CERTIFICATION_PROFILES.FULL_LAYER_2);
  const comparison = engine.compareCertifications(core.id, full.id);
  const explanation = engine.explainCertification(full.id);
  const report = engine.generateReadinessReport({ verifyDeterminism: false });
  const reportValidation = engine.validateReadinessReport(report);

  for (const result of [core, ae, offline, degraded, security, approval, persistence, evidence, ide, full]) {
    assert.notEqual(result.level, CERTIFICATION_LEVELS.CERTIFIED);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
    assert.ok(result.completeness >= 0 && result.completeness <= 1);
    assert.ok(result.evidence.length > 0);
  }
  assert.equal(ide.level, CERTIFICATION_LEVELS.IDE_CORE_READY);
  assert.equal(full.level, CERTIFICATION_LEVELS.IDE_CORE_READY);
  assert.equal(comparison.firstId, core.id);
  assert.match(explanation.summary, /FULL_LAYER_2/);
  assert.equal(report.currentCertificationLevel, CERTIFICATION_LEVELS.IDE_CORE_READY);
  assert.equal(report.ideBackendReadiness, true);
  assert.equal(reportValidation.status, "PASSED");
});

test("persists, loads, migrates, snapshots, restores, and recovers from corrupted persistence requiring recertification", () => {
  const root = createTempDir();
  const persistencePath = path.join(root, ".levi", "intelligence-integration.json");
  const engine = new IntelligenceIntegrationEngine({ repositoryPath: root, persistencePath, now: fixedNow });
  const certification = engine.runCertification(CERTIFICATION_PROFILES.IDE_BACKEND_READINESS);

  assert.equal(engine.save().status, "PERSISTED");
  const loaded = new IntelligenceIntegrationEngine({ autoDiscover: false, persistencePath, now: fixedNow });
  assert.equal(loaded.load().status, "LOADED");
  assert.ok(loaded.getCertification(certification.id));

  const snapshot = engine.snapshot();
  const restored = new IntelligenceIntegrationEngine({ autoDiscover: false, now: fixedNow });
  restored.restore(snapshot);
  assert.equal(restored.snapshot().components.length, snapshot.components.length);

  const migrated = new IntelligenceIntegrationEngine({
    autoDiscover: false,
    persistencePath,
    now: fixedNow,
    migrations: [(input) => ({ ...input, metadata: { ...(input.metadata || {}), migrated: true } })],
  });
  assert.equal(migrated.load().status, "LOADED");
  assert.equal(migrated.snapshot().metadata.migrated, true);

  fs.writeFileSync(persistencePath, "{not json", "utf8");
  const corrupt = new IntelligenceIntegrationEngine({ persistencePath, now: fixedNow });
  const result = corrupt.load(persistencePath, { emptyOnCorruption: true });
  assert.equal(result.status, "EMPTY");
  assert.equal(result.recertificationRequired, true);
  assert.equal(corrupt.listCertifications().length, 0);
  assert.equal(corrupt.snapshot().metadata.restoredStateIncomplete, true);
});

test("supports bounds, partial results, model validation, filters, and LI/AE compatibility discovery", () => {
  assert.throws(() => new IntelligenceIntegrationEngine({ autoDiscover: false }).registerComponent({
    id: "bad",
    name: "Bad",
    type: "NOPE",
  }), /Invalid component type/);

  const bounded = new IntelligenceIntegrationEngine({
    autoDiscover: false,
    bounds: { maximumRegisteredComponents: 1, maximumCapabilities: 1, maximumIntegrations: 1, maximumEvidenceReferences: 1 },
    now: fixedNow,
  });
  const componentBound = bounded.registerComponent({ id: "component:extra", name: "Extra", type: COMPONENT_TYPES.ENGINE });
  bounded.addEvidenceReference({
    sourceComponentId: "component:intelligence-integration",
    sourceRecordId: "one",
    sourceType: "fixture",
    authority: "verified_repository_state",
  });
  const evidenceBound = bounded.addEvidenceReference({
    sourceComponentId: "component:intelligence-integration",
    sourceRecordId: "two",
    sourceType: "fixture",
    authority: "verified_repository_state",
  });

  assert.equal(componentBound.code, FINDING_CODES.BOUNDS_EXCEEDED);
  assert.equal(evidenceBound.code, FINDING_CODES.BOUNDS_EXCEEDED);
  assert.ok(bounded.getStats().partialAnalyses >= 1);

  const engine = new IntelligenceIntegrationEngine({ now: fixedNow });
  const capability = engine.getCapability("objective completion");
  const integration = engine.listIntegrations({ domain: INTEGRATION_DOMAINS.SECURITY })[0];
  const certifications = engine.runCertifications([
    CERTIFICATION_PROFILES.CORE_INTELLIGENCE,
    CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION,
  ]);

  assert.ok(capability);
  assert.ok(integration);
  assert.equal(engine.getIntegration(integration.id).id, integration.id);
  assert.equal(certifications.length, 2);
  assert.ok(engine.listCertifications({ profile: CERTIFICATION_PROFILES.CORE_INTELLIGENCE }).length > 0);
  assert.equal(engine.validateContracts().status, "PASSED");
});

function collectEvents(engine) {
  const events = [];
  engine.on(INTEGRATION_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function fixedNow() {
  return "2026-01-01T00:00:00.000Z";
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "levi-integration-"));
}
