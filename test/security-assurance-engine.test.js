const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AttackOrigins,
  AttackOutcomes,
  AuditStates,
  MemorySecurityAssurancePersistenceAdapter,
  SecurityAssuranceEngine,
  SecurityCertificationLevels,
  SecurityDispositions,
  SecurityDomains,
  SecurityEngineStates,
  SecurityFindingStatuses,
  SecurityProfiles,
  SecuritySeverities,
  ThreatCategories,
  normalizeSecurityConfiguration,
} = require("../src/security-assurance-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes conservative security configuration and exposes frozen RC-002 constants", () => {
  const config = normalizeSecurityConfiguration({
    id: "fixture-security",
    failClosed: false,
    maximumAuditRuns: 0,
    maximumScenariosPerRun: 2,
  });

  assert.equal(config.id, "fixture-security");
  assert.equal(config.schemaVersion, 1);
  assert.equal(config.failClosed, false);
  assert.equal(config.maximumAuditRuns, 32);
  assert.equal(config.maximumScenariosPerRun, 2);
  assert.equal(config.maximumAttacksPerScenario, 8);
  assert.equal(config.enableApprovalTests, true);
  assert.equal(config.enableProviderTests, true);
  assert.equal(config.enableDependencyTests, true);
  assert.equal(config.enableSupplyChainTests, true);
  assert.equal(Object.isFrozen(SecurityEngineStates), true);
  assert.equal(Object.isFrozen(AuditStates), true);
  assert.equal(Object.isFrozen(SecurityDomains), true);
  assert.equal(Object.isFrozen(AttackOrigins), true);
  assert.equal(Object.isFrozen(SecurityDispositions), true);
  assert.equal(SecurityEngineStates.BLOCKED, "BLOCKED");
  assert.equal(AuditStates.BLOCKED, "BLOCKED");
  assert.equal(SecuritySeverities.INFORMATIONAL, "INFORMATIONAL");
  assert.equal(ThreatCategories.APPROVAL_BYPASS, ThreatCategories.APPROVAL_FORGERY);
  assert.equal(ThreatCategories.DIRECT_PROMPT_INJECTION, "DIRECT_PROMPT_INJECTION");
  assert.equal(AttackOutcomes.EXPLOITED, "EXPLOITED");
});

test("initializes, suspends, resumes, shuts down, and provides built-in security scenarios", () => {
  const engine = new SecurityAssuranceEngine({ persistenceAdapter: new MemorySecurityAssurancePersistenceAdapter() });

  assert.equal(engine.initialize({ load: false }).engineState, SecurityEngineStates.READY);
  assert.equal(engine.suspend("maintenance").status, SecurityEngineStates.SUSPENDED);
  assert.equal(engine.resume({ load: false }).engineState, SecurityEngineStates.READY);
  assert.ok(engine.listScenarios({ category: ThreatCategories.PROMPT_INJECTION }).length >= 1);
  assert.ok(engine.listScenarios({ category: ThreatCategories.REPOSITORY_INSTRUCTION_INJECTION }).length >= 1);
  assert.ok(engine.listScenarios().some((scenario) => scenario.id === "webview-script-injection"));
  assert.equal(engine.shutdown({ save: false }).status, SecurityEngineStates.STOPPED);
});

test("exposes normalized RC-002 threat model, assets, trust boundaries, and policy decisions", () => {
  const engine = new SecurityAssuranceEngine({ configuration: { persistenceEnabled: false } });
  const model = engine.getThreatModel();
  const assets = engine.listAssets();
  const boundaries = engine.listTrustBoundaries();
  const decision = engine.evaluatePolicy({
    domain: SecurityDomains.APPROVAL,
    category: ThreatCategories.APPROVAL_REPLAY,
    origin: AttackOrigins.MODEL_OUTPUT,
    target: { proposalHash: "hash-fixture", token: "sk-test-secret-value" },
  });

  assert.equal(model.product, "Levi Platform");
  assert.ok(model.threats.includes(ThreatCategories.APPROVAL_REPLAY));
  assert.ok(assets.some((asset) => asset.id === "repository-source"));
  assert.ok(assets.some((asset) => asset.id === "secret-storage-values"));
  assert.ok(assets.some((asset) => asset.id === "extension-configuration"));
  assert.ok(boundaries.some((boundary) => boundary.id === "provider-boundary"));
  assert.equal(decision.diagnosticOnly, true);
  assert.equal(decision.approvalGranted, false);
  assert.equal(JSON.stringify(decision).includes("sk-test-secret-value"), false);
});

test("registers and validates normalized threat scenarios without exposing raw hostile payloads", () => {
  const engine = new SecurityAssuranceEngine({ configuration: { persistenceEnabled: false } });
  const registered = engine.registerScenario({
    id: "custom-secret-leak",
    name: "Custom Secret Leak",
    category: ThreatCategories.CREDENTIAL_LEAKAGE,
    severity: SecuritySeverities.CRITICAL,
    attackPayload: "authorization: Bearer sk-test-secret-value",
    expectedOutcome: AttackOutcomes.SANITIZED,
  });

  assert.equal(registered.id, "custom-secret-leak");
  assert.equal(registered.attackPayload.redacted, true);
  assert.equal(JSON.stringify(registered).includes("sk-test-secret-value"), false);
  assert.equal(engine.validateScenario("custom-secret-leak").valid, true);
});

test("executes smoke and release-candidate audits across authority, approval, path, command, and secret checks", async () => {
  const engine = new SecurityAssuranceEngine({ configuration: { persistenceEnabled: false } });
  engine.initialize({ load: false });

  const smoke = await engine.runAudit({ profile: SecurityProfiles.SMOKE });
  const releaseCandidate = await engine.runAudit({ profile: SecurityProfiles.RELEASE_CANDIDATE });

  assert.equal(smoke.status, "COMPLETED");
  assert.equal(smoke.run.state, AuditStates.SUCCEEDED);
  assert.equal(smoke.report.releaseBlockers.length, 0);
  assert.equal(releaseCandidate.report.certificationLevel, SecurityCertificationLevels.RELEASE_CANDIDATE_SECURITY);
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("approval-bypass-model-output"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("webview-script-injection"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("secret-content-transmission"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("unsafe-force-push"));
  assert.ok(releaseCandidate.run.completedScenarioIds.includes("packaging-secret-leak"));
  assert.ok(releaseCandidate.run.completedScenarioIds.length >= 80);
});

test("verifies every required security domain through checkAll", async () => {
  const engine = new SecurityAssuranceEngine({ configuration: { persistenceEnabled: false } });
  const all = await engine.checkAll({ target: { command: "npm test; curl secret" } });

  assert.equal(all.status, "PASSED");
  assert.equal(all.checks.authorityIntegrity.status, "PASSED");
  assert.equal(all.checks.approvalIntegrity.status, "PASSED");
  assert.equal(all.checks.privacyIntegrity.status, "PASSED");
  assert.equal(all.checks.workspaceIsolation.status, "PASSED");
  assert.equal(all.checks.pathSafety.status, "PASSED");
  assert.equal(all.checks.commandSafety.status, "PASSED");
  assert.equal(all.checks.credentialSafety.status, "PASSED");
  assert.equal(all.checks.persistenceSafety.status, "PASSED");
  assert.equal(all.checks.providerSafety.status, "PASSED");
  assert.equal(all.checks.webviewSafety.status, "PASSED");
  assert.equal(all.checks.serializationSafety.status, "PASSED");
  assert.equal(all.checks.dependencySafety.status, "PASSED");
  assert.equal(all.checks.sourceControlSafety.status, "PASSED");
  assert.equal(all.checks.promptInjectionSafety.status, "PASSED");
  assert.equal(all.checks.secretHandlingSafety.status, "PASSED");
  assert.equal(all.checks.supplyChainSafety.status, "PASSED");
  assert.equal(all.checks.resourceAbuseSafety.status, "PASSED");
});

test("redacts credentials, private prompts, source content, and prototype-pollution keys from snapshots", () => {
  const adapter = new MemorySecurityAssurancePersistenceAdapter();
  const engine = new SecurityAssuranceEngine({ persistenceAdapter: adapter });
  engine.registerScenario({
    id: "redaction-fixture",
    category: ThreatCategories.CREDENTIAL_LEAKAGE,
    severity: SecuritySeverities.HIGH,
    attackPayload: {
      token: "sk-test-secret-value",
      privatePrompt: "hidden prompt",
      protectedSource: "complete source",
      "__proto__": { polluted: true },
    },
    expectedOutcome: AttackOutcomes.SANITIZED,
  });
  const saved = engine.save();
  const serialized = JSON.stringify(adapter.snapshot);

  assert.equal(saved.status, "PERSISTED");
  assert.equal(serialized.includes("sk-test-secret-value"), false);
  assert.equal(serialized.includes("hidden prompt"), false);
  assert.equal(serialized.includes("complete source"), false);
  assert.equal(serialized.includes("polluted"), false);
});

test("creates release blockers and blocks security certification when critical finding remains open", () => {
  const engine = new SecurityAssuranceEngine({ configuration: { persistenceEnabled: false } });
  const finding = engine.createFinding({
    category: ThreatCategories.APPROVAL_BYPASS,
    severity: SecuritySeverities.CRITICAL,
    title: "Approval bypass fixture",
    description: "A protected action appeared to run without ApprovalGateway evidence.",
    releaseBlocking: true,
  });
  const certification = engine.certifySecurity(SecurityProfiles.RELEASE_CANDIDATE);

  assert.equal(finding.status, SecurityFindingStatuses.OPEN);
  assert.equal(certification.level, SecurityCertificationLevels.SECURITY_BLOCKED);
  assert.equal(engine.getReleaseBlockers().length, 1);
});

test("integrates with LeviApplicationRuntime as optional RC-002 security commands", async () => {
  const unconfigured = new LeviApplicationRuntime({});
  assert.equal((await unconfigured.executeCommand("securityAssurance.health", {})).data.status, "UNCONFIGURED");

  const runtime = new LeviApplicationRuntime({
    enableSecurityAssurance: true,
    securityAssuranceConfiguration: { persistenceEnabled: false, maximumScenariosPerRun: 8 },
    enableReliabilityAssurance: true,
    reliabilityConfiguration: { persistenceEnabled: false, maximumScenariosPerRun: 4 },
    enableRepositoryPerformance: true,
    performanceConfiguration: { persistenceEnabled: false },
  });
  const commands = runtime.listCommands().map((command) => command.id);

  assert.ok(commands.includes("securityAssurance.run"));
  assert.ok(commands.includes("securityAssurance.certify"));
  assert.ok(commands.includes("security.threatModel"));
  assert.ok(commands.includes("security.checkSourceControl"));
  assert.ok(runtime.securityAssuranceEngine());

  const health = await runtime.executeCommand("securityAssurance.health", {});
  const run = await runtime.executeCommand("securityAssurance.run", { profile: SecurityProfiles.SMOKE });
  const report = await runtime.executeCommand("securityAssurance.report", { runId: run.data.run.id });
  const checks = await runtime.executeCommand("securityAssurance.check", {});
  const threatModel = await runtime.executeCommand("security.threatModel", {});
  const sourceControl = await runtime.executeCommand("security.checkSourceControl", {});
  const blockers = await runtime.executeCommand("security.blockers", {});
  const certification = await runtime.executeCommand("securityAssurance.certify", { profile: SecurityProfiles.RELEASE_CANDIDATE });

  assert.equal(health.success, true);
  assert.equal(run.data.status, "COMPLETED");
  assert.equal(report.data.releaseBlockers.length, 0);
  assert.equal(checks.data.status, "PASSED");
  assert.equal(threatModel.data.threatModel.product, "Levi Platform");
  assert.equal(sourceControl.data.status, "PASSED");
  assert.equal(blockers.data.blockers.length, 0);
  assert.equal(certification.data.level, SecurityCertificationLevels.RELEASE_CANDIDATE_SECURITY);
});
