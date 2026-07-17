const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXECUTION_STATES, ExecutionSession } = require("../src/execution-session");
const { ObjectiveCompletionEngine } = require("../src/objective-completion-engine");
const { RepositoryKnowledgeGraph } = require("../src/repository-knowledge-graph");
const { CrossSessionLearningEngine, LEARNING_RECORD_TYPES } = require("../src/cross-session-learning-engine");
const { OfflineKnowledgeIndex } = require("../src/offline-knowledge-index");
const {
  PLAN_STATUSES,
  PLANNING_EVENT_TYPES,
  PLANNING_EVENTS,
  PLANNING_FINDING_CODES,
  PLANNING_SCHEMA_VERSION,
  PlanningIntelligenceEngine,
  REPLAN_TRIGGERS,
  TASK_STATUSES,
} = require("../src/planning-intelligence-engine");

test("deterministically decomposes objectives into normalized dependency-aware plans and tasks", () => {
  const engine = new PlanningIntelligenceEngine({ projectId: "project-a" });
  const events = collectEvents(engine);
  const plan = engine.createPlan("Implement login form", {
    expectedFiles: ["src/login.js"],
    acceptanceCriteria: ["Login form validates required fields."],
    validationRequirements: ["npm test"],
  });

  assert.equal(plan.schemaVersion, undefined);
  assert.equal(plan.projectId, "project-a");
  assert.equal(plan.status, PLAN_STATUSES.READY);
  assert.equal(plan.version, 1);
  assert.ok(plan.tasks.length >= 3);
  assert.ok(plan.tasks.every((task) => task.planId === plan.id));
  assert.ok(plan.tasks.every((task) => Array.isArray(task.acceptanceCriteria)));
  assert.deepEqual(engine.getReadyTasks(plan.id).map((task) => task.id), ["task:inspect"]);
  assert.deepEqual(engine.getExecutionWaves(plan.id).map((wave) => wave.map((task) => task.id)), [
    ["task:inspect"],
    [plan.tasks.find((task) => task.type === "implementation").id],
    ["task:validate"],
  ]);
  assert.deepEqual(events.slice(0, 3), [
    PLANNING_EVENT_TYPES.PLANNING_STARTED,
    PLANNING_EVENT_TYPES.PLAN_CREATED,
    PLANNING_EVENT_TYPES.PLAN_VALIDATED,
  ]);
  assert.equal(events.at(-1), PLANNING_EVENT_TYPES.PLANNING_COMPLETED);
});

test("uses injected decomposition adapters without requiring a model provider", () => {
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    decompositionAdapters: [{
      decompose() {
        return {
          summary: "Adapter plan",
          tasks: [
            { id: "a", title: "Adapter task A", description: "First", type: "analysis", acceptanceCriteria: ["A done"] },
            { id: "b", title: "Adapter task B", description: "Second", type: "implementation", dependencies: ["a"], acceptanceCriteria: ["B done"] },
          ],
        };
      },
    }],
  });

  const plan = engine.createPlan("Adapter objective", {});

  assert.equal(plan.summary, "Adapter plan");
  assert.deepEqual(plan.tasks.map((task) => task.id), ["a", "b"]);
  assert.equal(engine.getTask(plan.id, "b").status, TASK_STATUSES.WAITING);
});

test("validates missing dependencies, cycles, topological order, dependents, critical path, and execution waves", () => {
  const engine = new PlanningIntelligenceEngine({ projectId: "project-a" });
  const plan = engine.createPlan("Manual graph", {
    acceptanceCriteria: ["Manual graph works."],
  });
  engine.addTask(plan.id, {
    id: "missing",
    title: "Missing dependency task",
    description: "Has a missing dependency",
    type: "implementation",
    dependencies: ["does-not-exist"],
    acceptanceCriteria: ["Missing dependency is reported."],
  });
  engine.addTask(plan.id, {
    id: "cycle-a",
    title: "Cycle A",
    description: "Cycle A",
    type: "implementation",
    dependencies: ["cycle-b"],
    acceptanceCriteria: ["Cycle is reported."],
  });
  engine.addTask(plan.id, {
    id: "cycle-b",
    title: "Cycle B",
    description: "Cycle B",
    type: "implementation",
    dependencies: ["cycle-a"],
    acceptanceCriteria: ["Cycle is reported."],
  });

  const validation = engine.validatePlan(plan.id);
  const codes = validation.findings.map((finding) => finding.code);

  assert.ok(codes.includes(PLANNING_FINDING_CODES.MISSING_DEPENDENCY));
  assert.ok(codes.includes(PLANNING_FINDING_CODES.CIRCULAR_DEPENDENCY));
  assert.ok(engine.getTask(plan.id, "cycle-a").dependents.includes("cycle-b"));
  assert.ok(engine.getCriticalPath(plan.id).length > 0);
  assert.ok(engine.getExecutionWaves(plan.id).length > 0);
});

test("prioritizes using readiness, critical path, graph impact, and learning records", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root, { repositoryGraph: graph });
  const learning = new CrossSessionLearningEngine({ projectId: "project-a" });
  learning.record({
    type: LEARNING_RECORD_TYPES.SUCCESSFUL_STRATEGY,
    projectId: "project-a",
    title: "Successful app strategy",
    summary: "Implement app changes after inspection.",
    evidence: { source: "session", signal: "success" },
    tags: ["app"],
  });
  learning.record({
    type: LEARNING_RECORD_TYPES.FAILED_STRATEGY,
    projectId: "project-a",
    title: "Failed dependency strategy",
    summary: "Avoid broad dependency changes.",
    evidence: { source: "session", signal: "failure" },
    tags: ["dependency"],
  });
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: graph,
    offlineIndex: index,
    learningEngine: learning,
  });
  const plan = engine.createPlan("Update app behavior", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["App behavior changes."],
  });

  const ranked = engine.prioritize(plan.id, { projectId: "project-a" });
  const implementation = ranked.find((task) => task.type === "implementation");

  assert.ok(implementation.metadata.graphNodeIds.length > 0);
  assert.ok(implementation.metadata.planningEvidence.length > 0);
  assert.ok(implementation.metadata.successfulStrategies.length > 0);
  assert.ok(ranked[0].priorityScore >= ranked.at(-1).priorityScore);
});

test("flags durable-decision conflicts instead of silently producing contradictory tasks", () => {
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    decisionRecords: [approvedDecision("decision-conflict", "Never modify auth files.")],
  });
  const plan = engine.createPlan("Modify auth files", {
    expectedFiles: ["src/auth.js"],
    acceptanceCriteria: ["Auth behavior changes."],
  });

  assert.equal(plan.status, PLAN_STATUSES.BLOCKED);
  assert.ok(plan.metadata.validation.findings.some((finding) => finding.code === PLANNING_FINDING_CODES.DECISION_CONFLICT));
});

test("consumes execution results and exposes plan completion evidence without claiming objective completion", () => {
  const engine = new PlanningIntelligenceEngine({ projectId: "project-a" });
  const plan = engine.createPlan("Complete plan", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["Plan tasks complete."],
  });
  engine.activate(plan.id);
  const ordered = engine.validatePlan(plan.id).orderedTaskIds;
  for (const taskId of ordered) {
    engine.completeTask(plan.id, taskId, { outputs: [`${taskId}:done`] });
  }
  const completed = engine.getPlan(plan.id);
  const completion = new ObjectiveCompletionEngine().evaluate(new ExecutionSession({
    sessionId: "objective-check",
    objective: "Complete plan",
    currentState: EXECUTION_STATES.VALIDATING,
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    completedSteps: completed.metadata.completionEvidence.completedTaskIds,
    remainingSteps: [],
    metadata: {
      validationPassed: false,
      objectiveComplete: false,
      completionContext: {
        planCompletionEvidence: completed.metadata.completionEvidence,
      },
    },
  }));

  assert.equal(completed.status, PLAN_STATUSES.COMPLETED);
  assert.ok(completed.metadata.completionEvidence.completedTaskIds.length > 0);
  assert.notEqual(completion.result, "COMPLETE");
});

test("supports task failure, blocking, dynamic replanning, repository changes, user corrections, and replan limits", () => {
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    bounds: { maximumReplans: 2 },
  });
  const plan = engine.createPlan("Repair failing feature", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["Feature works."],
  });
  engine.completeTask(plan.id, "task:inspect");
  const implementation = engine.getPlan(plan.id).tasks.find((task) => task.type === "implementation");
  engine.failTask(plan.id, implementation.id, { reason: "test failed" });
  const replanned = engine.replan(plan.id, REPLAN_TRIGGERS.TASK_FAILED, {
    taskId: implementation.id,
    rationale: "Add recovery task after failed implementation.",
  });

  assert.equal(replanned.version, 2);
  assert.equal(replanned.tasks.find((task) => task.id === "task:inspect").status, TASK_STATUSES.COMPLETED);
  assert.ok(replanned.tasks.some((task) => task.type === "replan"));

  engine.blockTask(plan.id, "task:validate", { reason: "needs approval" });
  engine.replan(plan.id, REPLAN_TRIGGERS.REPOSITORY_CHANGED, { rationale: "Repository changed." });
  const limited = engine.replan(plan.id, REPLAN_TRIGGERS.USER_CORRECTION, { rationale: "User corrected scope." });
  assert.equal(limited.status, PLAN_STATUSES.BLOCKED);
  assert.ok(limited.metadata.validation.findings.some((finding) => finding.code === PLANNING_FINDING_CODES.REPLAN_LIMIT_REACHED));
});

test("enforces planning bounds, no executable path, duplicate suppression, and validation rules", () => {
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    bounds: { maximumTasks: 2, maximumTaskComplexity: 2 },
  });
  const plan = engine.createPlan("Large objective", {
    expectedFiles: ["src/a.js", "src/b.js"],
    acceptanceCriteria: ["Large objective works."],
  });
  const duplicate = engine.addTask(plan.id, {
    title: "Inspect relevant context",
    description: "Duplicate",
    type: "analysis",
    outputs: ["src/a.js", "src/b.js"],
    acceptanceCriteria: ["Relevant files, constraints, and risks are identified."],
  });
  engine.blockTask(plan.id, "task:inspect", { reason: "blocked" });
  const validation = engine.validatePlan(plan.id, { requireAcceptanceCriteria: true });

  assert.equal(duplicate.id, "task:inspect");
  assert.ok(validation.findings.some((finding) => finding.code === PLANNING_FINDING_CODES.EXCESSIVE_SCOPE));
  assert.ok(validation.findings.some((finding) => finding.code === PLANNING_FINDING_CODES.NO_EXECUTABLE_PATH));
});

test("persists, restores, migrates, and falls back to empty state for corrupted persistence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-planning-"));
  const persistencePath = path.join(root, ".levi", "planning-intelligence.json");
  const engine = new PlanningIntelligenceEngine({ projectId: "project-a", repositoryPath: root, persistencePath });
  const plan = engine.createPlan("Persist plan", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["Persists."],
  });
  assert.equal(engine.save().status, "PERSISTED");

  const restored = new PlanningIntelligenceEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.getPlan(plan.id), engine.getPlan(plan.id));

  const manual = new PlanningIntelligenceEngine();
  manual.restore(engine.snapshot());
  assert.deepEqual(manual.snapshot(), engine.snapshot());

  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  const corrupt = new PlanningIntelligenceEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath).status, "CORRUPT");
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");

  const migrated = new PlanningIntelligenceEngine({
    migrations: [(snapshot) => ({ ...snapshot, schemaVersion: PLANNING_SCHEMA_VERSION })],
  });
  migrated.restore({ ...engine.snapshot(), schemaVersion: 0 });
  assert.equal(migrated.getPlan(plan.id).id, plan.id);
});

test("emits lifecycle events for planning, activation, pause/resume, task updates, replanning, completion, and persistence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-planning-events-"));
  const engine = new PlanningIntelligenceEngine({ projectId: "project-a", repositoryPath: root });
  const events = collectEvents(engine);
  const plan = engine.createPlan("Event plan", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["Events fire."],
  });
  engine.activate(plan.id);
  engine.pause(plan.id);
  engine.resume(plan.id);
  engine.updateTask(plan.id, "task:inspect", { status: TASK_STATUSES.RUNNING });
  engine.completeTask(plan.id, "task:inspect", {});
  const implementation = engine.getPlan(plan.id).tasks.find((task) => task.type === "implementation");
  engine.failTask(plan.id, implementation.id, {});
  engine.replan(plan.id, REPLAN_TRIGGERS.TASK_FAILED, { taskId: implementation.id });
  engine.save();

  assert.ok(events.includes(PLANNING_EVENT_TYPES.PLANNING_STARTED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.PLAN_CREATED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.PLAN_ACTIVATED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.PLAN_PAUSED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.PLAN_RESUMED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.TASK_STARTED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.TASK_COMPLETED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.TASK_FAILED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.REPLANNING_STARTED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.REPLANNING_COMPLETED));
  assert.ok(events.includes(PLANNING_EVENT_TYPES.PERSISTED));
});

test("remains compatible with LI-001, LI-002, LI-003, and AE session snapshots", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const learning = new CrossSessionLearningEngine({ projectId: "project-a", repositoryGraph: graph });
  learning.learnFromSession(new ExecutionSession({
    sessionId: "ae-compatible",
    objective: "Plan compatible work",
    currentState: EXECUTION_STATES.COMPLETED,
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    completedSteps: ["done"],
    metadata: {
      projectId: "project-a",
      validationPassed: true,
      objectiveComplete: true,
    },
  }));
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root, { repositoryGraph: graph, learningEngine: learning });
  const engine = new PlanningIntelligenceEngine({
    projectId: "project-a",
    repositoryGraph: graph,
    learningEngine: learning,
    offlineIndex: index,
  });
  const plan = engine.createPlan("Update app", {
    expectedFiles: ["src/app.js"],
    acceptanceCriteria: ["App updates."],
  });

  assert.equal(graph.snapshot().schemaVersion, 1);
  assert.ok(learning.snapshot().records.length > 0);
  assert.ok(index.getStats().documentCount > 0);
  assert.deepEqual(engine.getPlan(plan.id).tasks.map((task) => task.title), plan.tasks.map((task) => task.title));
});

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-planning-fixture-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }, null, 2));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "function run() { return true; }",
    "module.exports = { run };",
    "",
  ].join("\n"));
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
      scope: "project",
      statement,
      evidence: [{ source: "ARCHITECTURE.md", signal: "decision" }],
    },
  };
}

function collectEvents(engine) {
  const events = [];
  engine.on(PLANNING_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}
