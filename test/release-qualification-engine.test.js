const assert = require("node:assert/strict");
const test = require("node:test");

const { LeviApplicationRuntime } = require("../src/levi-application-runtime");
const {
  ManualVerificationStatuses,
  ProjectFixtureCategories,
  QualificationCertificationLevels,
  QualificationDefectStatuses,
  QualificationDispositions,
  QualificationEngineStates,
  QualificationProfiles,
  QualificationRunStates,
  QualificationSeverities,
  ReleaseQualificationEngine,
  ValidationDomains,
  normalizeProjectFixture,
  normalizeQualificationScenario,
  normalizeReleaseQualificationConfiguration,
  normalizeUserJourney,
} = require("../src/release-qualification-engine");

test("normalizes restrictive finite configuration, fixtures, journeys, and scenarios", () => {
  const configuration = normalizeReleaseQualificationConfiguration({ maximumRuns: 0, failClosed: false, metadata: { token: "secret=abc123" } });
  const fixture = normalizeProjectFixture({ id: "site", category: ProjectFixtureCategories.STATIC_WEBSITE, expectedFiles: ["index.html"] });
  const journey = normalizeUserJourney({ id: "teach", persona: "TEACHER", steps: ["explain"] });
  const scenario = normalizeQualificationScenario({ id: "activation", domain: ValidationDomains.ACTIVATION });

  assert.equal(configuration.failClosed, false);
  assert.equal(configuration.maximumRuns, 32);
  assert.equal(configuration.metadata.token, "[REDACTED]");
  assert.equal(fixture.category, ProjectFixtureCategories.STATIC_WEBSITE);
  assert.equal(journey.persona, "TEACHER");
  assert.equal(scenario.domain, ValidationDomains.ACTIVATION);
});

test("registers built-in profiles, compact fixtures, journeys, suites, and scenarios", () => {
  const engine = new ReleaseQualificationEngine();
  const health = engine.initialize({ load: false });

  assert.equal(health.status, "AVAILABLE");
  assert.equal(engine.getState().state, QualificationEngineStates.READY);
  assert.equal(engine.listFixtures().length, 8);
  assert.ok(engine.listFixtures().some((fixture) => fixture.id === "nextjs-business-site"));
  assert.equal(engine.listJourneys().length, 8);
  assert.equal(engine.listSuites().length, 4);
  assert.ok(engine.listScenarios().some((scenario) => scenario.id === "extension-host-manual"));
});

test("runs deterministic smoke and keeps host/Ollama manual checks separate", async () => {
  const engine = new ReleaseQualificationEngine();
  engine.initialize({ load: false });

  const smoke = await engine.runQualification({ profile: QualificationProfiles.SMOKE });
  const rc = await engine.runQualification({ profile: QualificationProfiles.RELEASE_CANDIDATE });
  const certification = engine.certifyQualification(QualificationProfiles.RELEASE_CANDIDATE, { runId: rc.run.id });

  assert.equal(smoke.status, QualificationRunStates.SUCCEEDED);
  assert.equal(smoke.report.score, 100);
  assert.equal(rc.status, QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION);
  assert.ok(rc.report.manualScenariosPending > 0);
  assert.equal(certification.level, QualificationCertificationLevels.MANUAL_VERIFICATION_REQUIRED);
  assert.ok(engine.getPendingManualVerifications({ runId: rc.run.id }).every((record) => record.status === ManualVerificationStatuses.PENDING));
});

test("manual verification cannot be auto-passed and failed manual records create blockers", async () => {
  const engine = new ReleaseQualificationEngine();
  engine.initialize({ load: false });
  const rc = await engine.runQualification({ profile: QualificationProfiles.RELEASE_CANDIDATE });
  const manual = engine.getPendingManualVerifications({ runId: rc.run.id })[0];

  assert.throws(() => engine.completeManualVerification(manual.id, { status: ManualVerificationStatuses.PASSED }), /automatically marked PASSED/);
  const failed = engine.completeManualVerification(manual.id, { status: ManualVerificationStatuses.FAILED, observed: "Host activation failed." }, { operatorRecorded: true, operator: "tester" });

  assert.equal(failed.status, ManualVerificationStatuses.FAILED);
  assert.ok(engine.getReleaseBlockers({ runId: rc.run.id }).length >= 1);
});

test("tracks defects, resolves, verifies, and updates qualification blockers", () => {
  const engine = new ReleaseQualificationEngine();
  engine.initialize({ load: false });
  const defect = engine.createDefect({
    title: "Critical validation defect",
    domain: ValidationDomains.VALIDATION,
    severity: QualificationSeverities.CRITICAL,
    releaseBlocking: true,
  });

  assert.equal(engine.getReleaseBlockers({}).length, 1);
  engine.resolveDefect(defect.id, { summary: "Fixed with deterministic regression." });
  const verified = engine.verifyDefect(defect.id, ["Regression passed."], { operator: "test" });

  assert.equal(verified.status, QualificationDefectStatuses.VERIFIED);
  assert.equal(engine.getReleaseBlockers({}).length, 0);
});

test("snapshot and restore preserve evidence, leave manual items pending, and invalidate certification", async () => {
  const engine = new ReleaseQualificationEngine();
  engine.initialize({ load: false });
  const rc = await engine.runQualification({ profile: QualificationProfiles.RELEASE_CANDIDATE });
  engine.certifyQualification(QualificationProfiles.RELEASE_CANDIDATE, { runId: rc.run.id });

  const restored = new ReleaseQualificationEngine();
  restored.restore(engine.snapshot());

  assert.equal(restored.certification.level, QualificationCertificationLevels.NOT_EVALUATED);
  assert.ok(restored.getPendingManualVerifications({ runId: rc.run.id }).length > 0);
  assert.equal(restored.getRun(rc.run.id).state, QualificationRunStates.WAITING_FOR_MANUAL_VERIFICATION);
});

test("uses runtime public boundary without granting approval or mutating source", async () => {
  const runtime = new LeviApplicationRuntime({
    enableReleaseQualification: true,
    enableSecurityAssurance: true,
    enableReliabilityAssurance: true,
    enableStressScalability: true,
  });
  await runtime.initialize({ skipChecks: true });

  const result = await runtime.executeCommand("qualification.run", { profile: QualificationProfiles.SMOKE });
  const host = await runtime.executeCommand("qualification.extensionHost", {});

  assert.equal(result.success, true);
  assert.equal(result.data.status, QualificationRunStates.SUCCEEDED);
  assert.equal(host.success, true);
  assert.equal(host.data.disposition, QualificationDispositions.MANUAL_VERIFICATION_REQUIRED);
  assert.equal(runtime.approvalRequests.size, 0);
});
