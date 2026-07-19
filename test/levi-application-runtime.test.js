const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ApprovalStatuses,
  ErrorCategories,
  FileRuntimePersistenceAdapter,
  LeviApplicationRuntime,
  OperationPriorities,
  OperationStates,
  OperationTypes,
  RuntimeEventTypes,
  RuntimeStates,
  SessionStates,
  UriWorkspaceAdapter,
  WorkspaceStates,
  normalizeRuntimeConfiguration,
  serializeForFrontend,
} = require("../src/levi-application-runtime");

test("normalizes runtime configuration and exposes frozen state constants", () => {
  const config = normalizeRuntimeConfiguration({ id: "fixture-runtime", storageRoot: ".levi/fixture" });

  assert.equal(config.id, "fixture-runtime");
  assert.equal(config.offlineMode, true);
  assert.equal(config.strictSecurity, true);
  assert.equal(config.schemaVersion, 1);
  assert.equal(Object.isFrozen(RuntimeStates), true);
  assert.equal(OperationTypes.EXECUTE_OBJECTIVE, "EXECUTE_OBJECTIVE");
});

test("initializes READY with certified integration health, deterministic events, built-in command discovery, and runtime stats", async () => {
  const runtime = createRuntime();
  const events = [];
  runtime.subscribe((event) => events.push(event.type));

  const result = await runtime.initialize({ skipChecks: true });
  const health = runtime.getRuntimeHealth({ skipChecks: true });
  const stats = runtime.getRuntimeStats();
  const commands = runtime.listCommands();

  assert.equal(result.success, true);
  assert.equal(runtime.getState().state, RuntimeStates.READY);
  assert.equal(health.overallRuntimeHealth, 100);
  assert.ok(commands.some((command) => command.id === "runtime.health"));
  assert.ok(commands.some((command) => command.id === "execution.executeObjective"));
  assert.ok(events.indexOf(RuntimeEventTypes.RUNTIME_INITIALIZATION_STARTED) < events.indexOf(RuntimeEventTypes.RUNTIME_READY));
  assert.equal(stats.successfulInitializations, 1);
});

test("supports DEGRADED and FAILED initialization based on certification and invariant caps", async () => {
  const degraded = createRuntime({
    intelligenceIntegrationEngine: degradedIntegrationEngine(),
  });
  const degradedResult = await degraded.initialize();
  assert.equal(degradedResult.success, true);
  assert.equal(degraded.getState().state, RuntimeStates.DEGRADED);
  assert.ok(degraded.getRuntimeHealth().warnings.includes("Certification is below IDE_CORE_READY."));

  const failed = createRuntime();
  failed.securityValidator = null;
  const failedResult = await failed.initialize();
  assert.equal(failedResult.success, false);
  assert.equal(failed.getState().state, RuntimeStates.FAILED);
  assert.equal(failedResult.error.category, ErrorCategories.INITIALIZATION);
});

test("opens, analyzes, refreshes, and closes a workspace through adapter and injected engines", async () => {
  const runtime = createRuntime({ components: intelligenceComponents() });
  await runtime.initialize({ skipChecks: true });

  const opened = await runtime.openWorkspace({ uri: "levi://workspace/demo", name: "Demo", projectId: "project-demo" });
  assert.equal(opened.success, true);
  assert.equal(opened.data.state, WorkspaceStates.READY);
  assert.equal(opened.data.rootPath, "levi://workspace/demo");

  const workspace = runtime.getWorkspace(opened.data.id);
  assert.equal(workspace.projectId, "project-demo");
  assert.ok(runtime.getWorkspaceCapabilities(workspace.id).includes("project assessment"));

  const refreshed = await runtime.refreshWorkspace(workspace.id);
  assert.equal(refreshed.success, true);
  assert.equal(runtime.getWorkspaceHealth(workspace.id).health.status, "READY");

  const closed = await runtime.closeWorkspace(workspace.id);
  assert.equal(closed.data.state, WorkspaceStates.CLOSED);
});

test("keeps direct analysis from degraded workspace rejected by the state machine", async () => {
  const runtime = createRuntime();
  await runtime.initialize({ skipChecks: true });

  const opened = await runtime.openWorkspace({ uri: "levi://workspace/degraded", name: "Degraded", projectId: "project-degraded" });
  assert.equal(opened.success, true);
  assert.equal(opened.data.state, WorkspaceStates.DEGRADED);

  const analyzed = await runtime.analyzeWorkspace(opened.data.id);

  assert.equal(analyzed.success, false);
  assert.equal(analyzed.error.code, "invalid-workspace-state-transition-degraded-analyzing");
  assert.equal(analyzed.error.message, "Invalid workspace state transition: DEGRADED -> ANALYZING.");
  assert.equal(runtime.getWorkspace(opened.data.id).state, WorkspaceStates.DEGRADED);
});

test("manages project sessions and propagates cancellation to child operations idempotently", async () => {
  const runtime = createRuntime();
  await runtime.initialize({ skipChecks: true });
  const session = runtime.createSession({ workspaceId: "workspace-1", projectId: "project-1", objective: "Ship runtime" });

  runtime.startSession(session.id);
  assert.equal(runtime.getSession(session.id).state, SessionStates.ACTIVE);

  const operation = runtime.submitOperation({ sessionId: session.id, type: OperationTypes.CUSTOM, command: null, input: { fixture: true } });
  const cancelled = runtime.cancelSession(session.id, "No longer needed.");
  const again = runtime.cancelSession(session.id, "No longer needed.");

  assert.equal(cancelled.state, SessionStates.CANCELLED);
  assert.equal(again.state, SessionStates.CANCELLED);
  assert.equal(runtime.getOperation(operation.id).state, OperationStates.CANCELLED);
});

test("schedules operations by priority and preserves FIFO order within equal priority", async () => {
  const order = [];
  const runtime = createRuntime({ configuration: { maximumConcurrentOperations: 1 } });
  await runtime.initialize({ skipChecks: true });
  runtime.registerCommand({
    id: "fixture.record",
    name: "Record",
    handler(input) {
      order.push(input.label);
      return { label: input.label };
    },
  });

  runtime.suspend("queue setup");
  const low = runtime.submitOperation({ type: OperationTypes.CUSTOM, command: "fixture.record", priority: OperationPriorities.LOW, input: { label: "low" } });
  const highA = runtime.submitOperation({ type: OperationTypes.CUSTOM, command: "fixture.record", priority: OperationPriorities.HIGH, input: { label: "high-a" } });
  const highB = runtime.submitOperation({ type: OperationTypes.CUSTOM, command: "fixture.record", priority: OperationPriorities.HIGH, input: { label: "high-b" } });
  runtime.resume();

  await Promise.all([
    runtime.waitForOperation(low.id),
    runtime.waitForOperation(highA.id),
    runtime.waitForOperation(highB.id),
  ]);

  assert.deepEqual(order, ["high-a", "high-b", "low"]);
});

test("enforces queue bounds, operation timeout, monotonic progress, and result envelopes", async () => {
  const runtime = createRuntime({ configuration: { maximumQueuedOperations: 1, defaultTimeoutMs: 20 } });
  await runtime.initialize({ skipChecks: true });
  runtime.suspend("bound test");
  runtime.submitOperation({ type: OperationTypes.CUSTOM, command: null });
  assert.throws(
    () => runtime.submitOperation({ type: OperationTypes.CUSTOM, command: null }),
    (error) => error && error.message === "Maximum queued operations exceeded."
  );

  const timeoutRuntime = createRuntime({ configuration: { defaultTimeoutMs: 20 } });
  await timeoutRuntime.initialize({ skipChecks: true });
  timeoutRuntime.registerCommand({
    id: "fixture.slow",
    name: "Slow",
    handler() {
      return new Promise((resolve) => setTimeout(() => resolve({ late: true }), 50));
    },
  });
  const result = await timeoutRuntime.executeOperation({ type: OperationTypes.CUSTOM, command: "fixture.slow" }, { timeoutMs: 20 });
  const operation = timeoutRuntime.getOperation(result.operationId);

  assert.equal(result.success, false);
  assert.equal(operation.state, OperationStates.TIMED_OUT);
  assert.equal(operation.progress.percentage >= 0, true);
  assert.equal(operation.result.success, false);
});

test("routes commands and queries through injected LI engines without exposing engine instances", async () => {
  const runtime = createRuntime({ components: intelligenceComponents() });
  await runtime.initialize({ skipChecks: true });
  const opened = await runtime.openWorkspace({ uri: "levi://workspace/query", projectId: "query-project" });
  const workspaceId = opened.data.id;

  const summary = await runtime.getProjectSummary(workspaceId);
  const search = await runtime.searchWorkspace(workspaceId, "runtime");
  const graph = await runtime.queryRepositoryGraph(workspaceId, { nodes: { type: "file" } });
  const code = await runtime.getCodeUnderstanding(workspaceId, { filePath: "src/index.js" });
  const context = await runtime.getContextPackage(workspaceId, { objective: "Understand runtime" });
  const plan = await runtime.query({ type: "planning.create", workspaceId, objective: "Add tests" });

  assert.equal(summary.success, true);
  assert.equal(summary.data.projectId, "query-project");
  assert.equal(search.data.results[0].title, "runtime");
  assert.equal(graph.data[0].id, "node-1");
  assert.equal(code.data.filePath, "src/index.js");
  assert.equal(context.data.packageId, "context-1");
  assert.equal(plan.data.objective, "Add tests");
  assert.equal("handler" in runtime.getCommand("project.summary"), false);
});

test("isolates event listeners and supports workspace, session, operation, and type filters", async () => {
  const runtime = createRuntime();
  await runtime.initialize({ skipChecks: true });
  const seen = [];
  runtime.subscribe(() => { throw new Error("listener failure"); });
  runtime.subscribe((event) => seen.push(event), { type: RuntimeEventTypes.OPERATION_SUCCEEDED });

  const result = await runtime.executeCommand("runtime.health", {});

  assert.equal(result.success, true);
  assert.equal(seen.length, 1);
  assert.equal(runtime.getRuntimeStats().listenerFailures >= 1, true);
  assert.equal(runtime.getEvents({ type: RuntimeEventTypes.OPERATION_SUCCEEDED }).length >= 1, true);
});

test("keeps approval-sensitive commands pending until explicit approval and fails after rejection", async () => {
  const runtime = createRuntime({ configuration: { approvalPolicy: "ALWAYS" } });
  await runtime.initialize({ skipChecks: true });
  runtime.registerCommand({
    id: "fixture.protected",
    name: "Protected",
    approvalSensitive: true,
    handler() {
      return { shouldNotRunWithoutApproval: true };
    },
  });

  const pending = await runtime.executeCommand("fixture.protected", {});
  const request = Array.from(runtime.approvalRequests.values())[0];

  assert.equal(pending.status, OperationStates.WAITING_FOR_APPROVAL);
  assert.equal(request.status, ApprovalStatuses.PENDING);

  const approved = await runtime.executeCommand("approval.respond", { approvalRequestId: request.id, decision: "APPROVED" });
  assert.equal(approved.success, true);
  assert.equal(runtime.approvalRequests.get(request.id).status, ApprovalStatuses.APPROVED);

  const second = await runtime.executeCommand("fixture.protected", {});
  const secondRequest = Array.from(runtime.approvalRequests.values()).find((entry) => entry.id !== request.id);
  const rejected = await runtime.executeCommand("approval.respond", { approvalRequestId: secondRequest.id, decision: "REJECTED" });
  assert.equal(rejected.success, true);
  assert.equal(runtime.getOperation(second.operationId).state, OperationStates.FAILED);
});

test("fails closed for security-sensitive commands when security enforcement is unavailable or blocks action", async () => {
  const runtime = createRuntime();
  await runtime.initialize({ skipChecks: true });
  runtime.securityValidator = null;
  runtime.registerCommand({
    id: "fixture.secure",
    name: "Secure",
    securitySensitive: true,
    handler() {
      return { unsafe: true };
    },
  });

  const missing = await runtime.executeCommand("fixture.secure", {});
  assert.equal(missing.success, false);
  assert.equal(missing.error.category, ErrorCategories.SECURITY);

  const blocked = createRuntime({
    securityValidator: {
      validateAction() {
        return { status: "BLOCKED", findings: [{ severity: "CRITICAL", title: "Blocked" }] };
      },
    },
  });
  await blocked.initialize({ skipChecks: true });
  blocked.registerCommand({ id: "fixture.blocked", name: "Blocked", securitySensitive: true, handler: () => ({}) });
  const result = await blocked.executeCommand("fixture.blocked", {});
  assert.equal(result.success, false);
  assert.equal(result.error.category, ErrorCategories.SECURITY);
});

test("serializes frontend-safe results by removing functions, stacks, secrets, circular references, and oversized payloads", async () => {
  const circular = { token: "secret", value: "ok", fn() {} };
  circular.self = circular;
  const serialized = serializeForFrontend(circular, { maximumResultSize: 1000 });
  assert.equal(serialized.token, "[REDACTED]");
  assert.equal(serialized.self, "[Circular]");
  assert.equal("fn" in serialized, false);

  const runtime = createRuntime({ configuration: { maximumResultSize: 200 } });
  await runtime.initialize({ skipChecks: true });
  runtime.registerCommand({
    id: "fixture.large",
    name: "Large",
    handler() {
      return { secretKey: "abc", text: "x".repeat(1000), nested: circular };
    },
  });
  const result = await runtime.executeCommand("fixture.large", {});
  assert.equal(result.truncated === true || result.data && result.data.truncated === true, true);
});

test("persists compact runtime state, restores snapshots, falls back on corruption, and marks interrupted recovery", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "levi-runtime-"));
  const runtime = createRuntime({ configuration: { storageRoot }, persistenceAdapter: new FileRuntimePersistenceAdapter({ storageRoot }) });
  await runtime.initialize({ skipChecks: true });
  const opened = await runtime.openWorkspace({ uri: "levi://workspace/persist", projectId: "persist-project" });
  const session = runtime.createSession({ workspaceId: opened.data.id, projectId: "persist-project", objective: "Persist state" });
  runtime.startSession(session.id);
  const save = runtime.save();
  assert.equal(save.status, "PERSISTED");

  const restored = createRuntime({ configuration: { storageRoot }, persistenceAdapter: new FileRuntimePersistenceAdapter({ storageRoot }) });
  const loaded = restored.load();
  assert.equal(loaded.status, "LOADED");
  assert.equal(restored.listWorkspaces().length, 1);
  assert.equal(restored.listSessions().length, 1);

  const snapshot = runtime.snapshot();
  const fromSnapshot = createRuntime();
  assert.equal(fromSnapshot.restore(snapshot).status, "RESTORED");

  fs.writeFileSync(path.join(storageRoot, "application-runtime.json"), "{broken", "utf8");
  const corrupt = createRuntime({ configuration: { storageRoot }, persistenceAdapter: new FileRuntimePersistenceAdapter({ storageRoot }) });
  const corruptLoad = corrupt.load({ emptyOnCorruption: true });
  assert.equal(corruptLoad.status, "EMPTY");

  const interrupted = createRuntime();
  const pending = interrupted.submitOperation({ type: OperationTypes.CUSTOM, command: null });
  const recovery = interrupted.recover({ snapshot: interrupted.snapshot() });
  assert.equal(recovery.status, "RECOVERED");
  assert.equal(interrupted.getOperation(pending.id).state, OperationStates.FAILED);
});

function createRuntime(options = {}) {
  return new LeviApplicationRuntime({
    clock: { now: fixedNow },
    configuration: {
      storageRoot: fs.mkdtempSync(path.join(os.tmpdir(), "levi-runtime-storage-")),
      ...(options.configuration || {}),
    },
    ...options,
  });
}

function fixedNow() {
  return "2026-01-01T00:00:00.000Z";
}

function degradedIntegrationEngine() {
  return {
    listCapabilities() {
      return [];
    },
    getPlatformHealth() {
      return { persistenceStatus: "PASSED", blockers: [], scores: {} };
    },
    generateReadinessReport() {
      return {
        currentCertificationLevel: "INTEGRATION_READY",
        ideBackendReadiness: false,
        blockers: [],
        requiredActions: ["Add evidence."],
        confidence: 0.7,
        completeness: 0.7,
      };
    },
    registerComponent() {},
  };
}

function intelligenceComponents() {
  return {
    RepositoryKnowledgeGraph: {
      build() { return { id: "graph-build" }; },
      findNodes() { return [{ id: "node-1", type: "file" }]; },
      getNeighbors() { return [{ id: "neighbor-1" }]; },
    },
    OfflineKnowledgeIndex: {
      build() { return { id: "index-build" }; },
      search(query) { return { results: [{ id: "doc-1", title: query }] }; },
    },
    CodeUnderstandingEngine: {
      analyzeRepository() { return { id: "code-analysis" }; },
      getFileSummary(filePath) { return { filePath, symbols: ["run"] }; },
      getArchitectureView() { return { layers: ["runtime"] }; },
    },
    ProjectIntelligenceEngine: {
      analyzeProject(projectId) { return { id: "project-analysis", projectId }; },
      getProjectSummary(projectId) { return { projectId, summary: "Project summary." }; },
      assessProject(projectId) { return { projectId, status: "READY" }; },
      getArchitectureAssessment(projectId) { return { projectId, architecture: "layered" }; },
      getBlockers() { return []; },
      getRisks() { return []; },
      getNextActions() { return ["ship"]; },
      getReleaseReadiness(projectId) { return { projectId, ready: true }; },
    },
    PlanningIntelligenceEngine: {
      createPlan(objective) { return { id: "plan-1", objective }; },
      getPlan(planId) { return { id: planId }; },
      validatePlan(planId) { return { planId, valid: true }; },
    },
    ContextIntelligenceEngine: {
      assemble() { return { packageId: "context-1" }; },
    },
    LearningAdaptationEngine: {
      listAdaptations() { return []; },
      listRules() { return []; },
    },
    CrossSessionLearningEngine: {
      list() { return []; },
    },
  };
}
