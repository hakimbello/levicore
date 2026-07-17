const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXECUTION_STATES, ExecutionSession } = require("../src/execution-session");
const { RepositoryKnowledgeGraph } = require("../src/repository-knowledge-graph");
const { CrossSessionLearningEngine, LEARNING_RECORD_TYPES } = require("../src/cross-session-learning-engine");
const { OfflineKnowledgeIndex } = require("../src/offline-knowledge-index");
const { PlanningIntelligenceEngine } = require("../src/planning-intelligence-engine");
const {
  CONTEXT_EVENTS,
  CONTEXT_EVENT_TYPES,
  CONTEXT_PACKAGE_STATUSES,
  CONTEXT_PURPOSES,
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_SOURCES,
  ContextIntelligenceEngine,
} = require("../src/context-intelligence-engine");

test("normalizes requests, context items, packages, and supports injected collectors offline", () => {
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    collectors: [{
      collect({ request }) {
        return {
          source: CONTEXT_SOURCES.PROJECT_KNOWLEDGE,
          sourceId: "collector-fact",
          projectId: request.projectId,
          purpose: request.purpose,
          title: "Collector fact",
          content: "Collector supplied context.",
          tags: ["collector"],
        };
      },
    }],
  });
  const request = engine.createRequest({
    purpose: CONTEXT_PURPOSES.USER_QUERY,
    objective: "Explain collector context",
  });
  const items = engine.collect(request);
  const pkg = engine.assemble(request);

  assert.equal(request.projectId, "project-a");
  assert.ok(items.some((item) => item.sourceId === "collector-fact"));
  assert.equal(pkg.projectId, "project-a");
  assert.equal(pkg.purpose, CONTEXT_PURPOSES.USER_QUERY);
  assert.ok(pkg.items.every((item) => item.id && item.estimatedTokens >= 0));
});

test("collects purpose-aware planning, execution, repair, security, and completion context", () => {
  const fixture = createIntegratedFixture();
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: fixture.graph,
    offlineIndex: fixture.index,
    learningEngine: fixture.learning,
    decisionRecords: [approvedDecision("decision-1", "Core engines must remain platform independent.")],
  });
  const executionSession = createExecutionSession();
  const planningPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.PLANNING,
    objective: "Update app behavior",
    plan: fixture.plan,
    userInstructions: ["Keep changes minimal."],
  });
  const executionPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.EXECUTION,
    objective: "Update app behavior",
    plan: fixture.plan,
    task: fixture.plan.tasks.find((task) => task.type === "implementation"),
    paths: ["src/app.js"],
  });
  const repairPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.REPAIR,
    objective: "Repair failing app behavior",
    task: fixture.plan.tasks.find((task) => task.type === "implementation"),
    metadata: { session: executionSession.snapshot() },
  });
  const securityPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.SECURITY_REVIEW,
    objective: "Review shell command security",
    metadata: { session: executionSession.snapshot() },
  });
  const completionPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.OBJECTIVE_COMPLETION,
    objective: "Complete app behavior",
    plan: fixture.plan,
    metadata: { session: executionSession.snapshot() },
  });

  assert.ok(planningPackage.items.some((item) => item.source === CONTEXT_SOURCES.DURABLE_DECISION));
  assert.ok(executionPackage.items.some((item) => item.path === "src/app.js"));
  assert.ok(repairPackage.items.some((item) => [CONTEXT_SOURCES.REPAIR_HISTORY, CONTEXT_SOURCES.VALIDATION_RESULT].includes(item.source)));
  assert.ok(securityPackage.items.some((item) => item.source === CONTEXT_SOURCES.SECURITY_FINDING));
  assert.ok(completionPackage.items.some((item) => item.source === CONTEXT_SOURCES.COMPLETION_EVIDENCE));
});

test("ranks by authority, current instructions, durable decisions, graph proximity, index relevance, and learning importance", () => {
  const fixture = createIntegratedFixture();
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: fixture.graph,
    offlineIndex: fixture.index,
    learningEngine: fixture.learning,
    decisionRecords: [approvedDecision("decision-2", "Use node:test for validation.")],
  });
  const request = engine.createRequest({
    purpose: CONTEXT_PURPOSES.PLANNING,
    objective: "Use node:test while updating src/app.js",
    userInstructions: ["Prefer the smallest safe change."],
    paths: ["src/app.js"],
  });
  const ranked = engine.rank(engine.collect(request), request);

  assert.equal(ranked[0].source, CONTEXT_SOURCES.USER_INSTRUCTION);
  assert.ok(ranked.findIndex((item) => item.source === CONTEXT_SOURCES.DURABLE_DECISION) < ranked.length);
  assert.ok(ranked.some((item) => item.source === CONTEXT_SOURCES.FILE && item.path === "src/app.js"));
  assert.ok(ranked.some((item) => item.source === CONTEXT_SOURCES.CROSS_SESSION_LEARNING));
});

test("enforces token budgets, preserves mandatory items, suppresses duplicates, and tracks omissions", () => {
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    bounds: {
      maximumPackageTokens: 90,
      reservedResponseTokens: 20,
      maximumItems: 4,
      perItemTokenLimit: 20,
    },
    collectors: [{
      collect({ request }) {
        return [
          longItem(request, "duplicate", "large context ".repeat(80)),
          longItem(request, "duplicate", "large context ".repeat(80)),
          longItem(request, "extra", "extra context ".repeat(80)),
        ];
      },
    }],
  });
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.PLANNING,
    objective: "Budget context",
    userInstructions: ["This instruction must remain."],
    acceptanceCriteria: ["The budget is respected."],
  });

  assert.ok(pkg.items.some((item) => item.source === CONTEXT_SOURCES.USER_INSTRUCTION));
  assert.ok(pkg.items.some((item) => item.tags.includes("acceptance-criteria")));
  assert.ok(pkg.omittedItems.some((item) => item.reason === "duplicate"));
  assert.ok(pkg.omittedItems.some((item) => item.reason === "over budget" || item.reason === "source limit exceeded"));
  assert.notEqual(pkg.status, CONTEXT_PACKAGE_STATUSES.BLOCKED);
});

test("compresses safely while preserving protected durable decisions, user instructions, acceptance criteria, failures, and targets", () => {
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    bounds: { perItemTokenLimit: 10 },
  });
  const request = engine.createRequest({
    purpose: CONTEXT_PURPOSES.EXECUTION,
    objective: "Execute target",
    userInstructions: ["Do not compress this instruction."],
    acceptanceCriteria: ["Exact acceptance criterion."],
  });
  const protectedItems = engine.collect(request);
  const fileItem = {
    source: CONTEXT_SOURCES.FILE,
    sourceId: "src/app.js",
    projectId: "project-a",
    purpose: request.purpose,
    title: "src/app.js",
    content: "line\n".repeat(200),
    path: "src/app.js",
  };
  const compressed = engine.compress([...protectedItems, fileItem], request);

  assert.ok(compressed.find((item) => item.source === CONTEXT_SOURCES.USER_INSTRUCTION).content.includes("Do not compress"));
  assert.ok(compressed.find((item) => item.tags.includes("acceptance-criteria")).content.includes("Exact acceptance"));
  assert.ok(compressed.find((item) => item.source === CONTEXT_SOURCES.FILE).estimatedTokens <= 10);
});

test("detects conflicts and stale authoritative context", () => {
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    decisionRecords: [approvedDecision("decision-conflict", "Never modify auth files.")],
    collectors: [{
      collect({ request }) {
        return {
          source: CONTEXT_SOURCES.FILE,
          sourceId: "stale-file",
          projectId: request.projectId,
          purpose: request.purpose,
          title: "src/auth.js",
          content: "stale auth file",
          path: "src/auth.js",
          authority: 0.9,
          metadata: { stale: true },
        };
      },
    }],
  });
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.PLANNING,
    objective: "Modify auth files",
    userInstructions: ["Modify auth files now."],
    paths: ["src/auth.js"],
  });

  assert.equal(pkg.status, CONTEXT_PACKAGE_STATUSES.CONFLICTED);
  assert.ok(pkg.findings.some((finding) => finding.code.includes("conflict")));
  assert.ok(pkg.findings.some((finding) => finding.code === "stale_context"));
});

test("validates packages and flags missing required execution or repair evidence", () => {
  const engine = new ContextIntelligenceEngine({ projectId: "project-a" });
  const executionPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.EXECUTION,
    objective: "Execute app change",
    paths: ["src/app.js"],
  });
  const repairPackage = engine.assemble({
    purpose: CONTEXT_PURPOSES.REPAIR,
    objective: "Repair app change",
  });

  assert.ok(engine.validatePackage(executionPackage).findings.some((finding) => finding.code === "missing_execution_target"));
  assert.ok(engine.validatePackage(repairPackage).findings.some((finding) => finding.code === "missing_failure_evidence"));
});

test("refreshes packages while preserving request identity and recording refresh reasons", () => {
  const engine = new ContextIntelligenceEngine({ projectId: "project-a" });
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.USER_QUERY,
    objective: "Refresh me",
  });
  const refreshed = engine.refresh(pkg.id, ["repository_changed"]);

  assert.equal(refreshed.id, pkg.id);
  assert.equal(refreshed.metadata.request.id, pkg.metadata.request.id);
  assert.equal(refreshed.metadata.revision, 2);
  assert.deepEqual(refreshed.metadata.refreshReasons, ["repository_changed"]);
});

test("persists, restores, migrates, and falls back to empty state on corrupted persistence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-context-"));
  const persistencePath = path.join(root, ".levi", "context-intelligence.json");
  const engine = new ContextIntelligenceEngine({ projectId: "project-a", repositoryPath: root, persistencePath });
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.USER_QUERY,
    objective: "Persist context",
  });
  assert.equal(engine.save().status, "PERSISTED");

  const restored = new ContextIntelligenceEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.equal(restored.getPackage(pkg.id).id, pkg.id);

  const manual = new ContextIntelligenceEngine();
  manual.restore(engine.snapshot());
  assert.equal(manual.getPackage(pkg.id).id, pkg.id);

  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  const corrupt = new ContextIntelligenceEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath).status, "CORRUPT");
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");

  const migrated = new ContextIntelligenceEngine({
    migrations: [(snapshot) => ({ ...snapshot, schemaVersion: CONTEXT_SCHEMA_VERSION })],
  });
  migrated.restore({ ...engine.snapshot(), schemaVersion: 0 });
  assert.equal(migrated.getPackage(pkg.id).id, pkg.id);
});

test("emits lifecycle events for collection, ranking, selection, compression, validation, refresh, persistence, restore, and corruption", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-context-events-"));
  const persistencePath = path.join(root, ".levi", "context-intelligence.json");
  const engine = new ContextIntelligenceEngine({ projectId: "project-a", repositoryPath: root, persistencePath });
  const events = collectEvents(engine);
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.USER_QUERY,
    objective: "Event context",
  });
  engine.explainSelection(pkg.id);
  engine.refresh(pkg.id, ["manual"]);
  engine.save();
  engine.restore(engine.snapshot());
  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  engine.load(persistencePath, { emptyOnCorruption: true });

  assert.ok(events.includes(CONTEXT_EVENT_TYPES.COLLECTION_STARTED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.ITEM_COLLECTED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.ITEM_RANKED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.ITEM_SELECTED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.COMPRESSION_STARTED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.PACKAGE_CREATED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.PACKAGE_VALIDATED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.PACKAGE_REFRESHED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.PERSISTED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.RESTORED));
  assert.ok(events.includes(CONTEXT_EVENT_TYPES.CORRUPTION_DETECTED));
});

test("remains compatible with LI-001 through LI-004 and AE session snapshots", () => {
  const fixture = createIntegratedFixture();
  const session = createExecutionSession();
  const engine = new ContextIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: fixture.graph,
    offlineIndex: fixture.index,
    learningEngine: fixture.learning,
  });
  const pkg = engine.assemble({
    purpose: CONTEXT_PURPOSES.OBJECTIVE_COMPLETION,
    objective: "Complete app update",
    plan: fixture.plan,
    metadata: { session: session.snapshot() },
  });

  assert.ok(fixture.graph.snapshot().nodes.length > 0);
  assert.ok(fixture.learning.snapshot().records.length > 0);
  assert.ok(fixture.index.getStats().documentCount > 0);
  assert.ok(fixture.plan.tasks.length > 0);
  assert.ok(pkg.items.length > 0);
  assert.equal(session.snapshot().sessionId, "ctx-session");
});

function createIntegratedFixture() {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root, { decisionRecords: [approvedDecision("decision-graph", "Core engines must remain platform independent.")] });
  const learning = new CrossSessionLearningEngine({ projectId: "project-a", repositoryGraph: graph });
  learning.record({
    type: LEARNING_RECORD_TYPES.SUCCESSFUL_STRATEGY,
    projectId: "project-a",
    title: "Successful app strategy",
    summary: "Update src/app.js after checking tests.",
    evidence: { source: "src/app.js", signal: "success" },
    confidence: 0.9,
    importance: 0.8,
    tags: ["app"],
  });
  learning.archive(learning.record({
    type: LEARNING_RECORD_TYPES.USER_PREFERENCE,
    projectId: "project-a",
    title: "Archived learning",
    summary: "Do not select this.",
    evidence: { source: "user", signal: "archived" },
  }).id);
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root, {
    repositoryGraph: graph,
    learningEngine: learning,
    decisionRecords: [approvedDecision("decision-index", "Use node:test for validation.")],
    projectKnowledgeFacts: [{ category: "testing", value: "node:test", evidence: { source: "package.json", signal: "test script" } }],
  });
  const planner = new PlanningIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: graph,
    offlineIndex: index,
    learningEngine: learning,
  });
  const plan = planner.createPlan("Update app behavior", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["App behavior is updated."],
    validationRequirements: ["npm test"],
  });
  return { root, graph, learning, index, planner, plan };
}

function createExecutionSession() {
  return new ExecutionSession({
    sessionId: "ctx-session",
    objective: "Repair app behavior",
    currentState: EXECUTION_STATES.VALIDATING,
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    completedSteps: ["inspect"],
    remainingSteps: ["repair"],
    metadata: {
      validationPassed: false,
      validationResult: { error: "Expected app behavior failed." },
      repairHistory: [{ attempt: 1, result: "REPAIR_FAILED", failureSummary: "Test failed." }],
      securityFindings: [{ id: "sec-1", title: "Critical token exposure", severity: "CRITICAL", status: "BLOCKED", evidence: { source: "src/app.js", signal: "token" } }],
      approvalRequest: { id: "approval-1", action: "modify configuration", reason: "Needs review." },
      completionHistory: [{ result: "INCOMPLETE", reasons: ["Validation failed."], findings: [{ source: "completion", signal: "incomplete" }] }],
    },
  });
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-context-fixture-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
  fs.writeFileSync(path.join(root, "src", "app.js"), "function run() { return true; }\nmodule.exports = { run };\n");
  fs.writeFileSync(path.join(root, "test", "app.test.js"), "const { run } = require('../src/app');\nrun();\n");
  return root;
}

function approvedDecision(id, statement) {
  return {
    id,
    projectId: "project-a",
    type: "approved-decision",
    confidenceState: "APPROVED",
    source: { kind: "project-decision", source: "ARCHITECTURE.md", signal: "approved decision" },
    value: {
      decisionId: id,
      category: "architecture",
      statement,
      evidence: [{ source: "ARCHITECTURE.md", signal: "decision" }],
    },
  };
}

function longItem(request, sourceId, content) {
  return {
    source: CONTEXT_SOURCES.PROJECT_KNOWLEDGE,
    sourceId,
    projectId: request.projectId,
    purpose: request.purpose,
    title: sourceId,
    content,
    authority: 0.4,
    relevance: 0.3,
  };
}

function collectEvents(engine) {
  const events = [];
  engine.on(CONTEXT_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}
