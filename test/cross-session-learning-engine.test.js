const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXECUTION_STATES, ExecutionSession } = require("../src/execution-session");
const {
  GRAPH_NODE_TYPES,
  RepositoryKnowledgeGraph,
} = require("../src/repository-knowledge-graph");
const {
  CROSS_SESSION_LEARNING_EVENTS,
  CROSS_SESSION_LEARNING_EVENT_TYPES,
  CrossSessionLearningEngine,
  LEARNING_CONFLICT_STATUSES,
  LEARNING_RECORD_TYPES,
  LEARNING_SCHEMA_VERSION,
  LEARNING_STATUSES,
} = require("../src/cross-session-learning-engine");

test("creates and normalizes learning records", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const events = collectEvents(engine);

  const record = engine.record({
    type: LEARNING_RECORD_TYPES.PROJECT_CONVENTION,
    title: "Use node:test",
    summary: "Tests in this project use the built-in node:test runner.",
    evidence: { source: "package.json", signal: "scripts.test" },
    tags: ["Testing", "Node"],
  });

  assert.equal(record.schemaVersion, undefined);
  assert.equal(record.projectId, "project-a");
  assert.equal(record.status, LEARNING_STATUSES.ACTIVE);
  assert.deepEqual(record.tags, ["node", "testing"]);
  assert.equal(record.useCount, 0);
  assert.equal(record.lastUsedAt, null);
  assert.equal(engine.get(record.id).id, record.id);
  assert.deepEqual(events, [CROSS_SESSION_LEARNING_EVENT_TYPES.RECORDED]);
});

test("suppresses duplicates and raises confidence with repeated confirming evidence", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const first = engine.record(baseRecord({
    title: "Prefer small modules",
    confidence: 0.5,
    evidence: { source: "src/a.js", signal: "small module" },
  }));
  const second = engine.record(baseRecord({
    title: "Prefer small modules",
    confidence: 0.55,
    evidence: { source: "src/b.js", signal: "small module" },
  }));

  assert.equal(first.id, second.id);
  assert.equal(engine.list().length, 1);
  assert.equal(second.evidence.length, 2);
  assert.ok(second.confidence > first.confidence);
});

test("detects contradictory evidence and resolves conflicts without overwriting durable decisions", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const durable = engine.record({
    type: LEARNING_RECORD_TYPES.DURABLE_DECISION,
    title: "Runtime code lives in src",
    summary: "All runtime code must stay under src.",
    evidence: { source: "ARCHITECTURE.md", signal: "approved decision" },
    source: { kind: "project-decision", recordId: "decision-1" },
  });
  const contradictory = engine.record({
    type: LEARNING_RECORD_TYPES.DURABLE_DECISION,
    title: "Runtime code lives in src",
    summary: "Runtime code may live anywhere.",
    evidence: { source: "user", signal: "contradiction" },
    metadata: {
      contradictsRecordId: durable.id,
    },
  });

  const conflicts = engine.snapshot().conflicts;
  assert.equal(conflicts.length, 1);
  assert.equal(engine.get(durable.id).status, LEARNING_STATUSES.ACTIVE);
  assert.equal(contradictory.status, LEARNING_STATUSES.CONFLICTED);
  assert.ok(engine.get(durable.id).confidence < durable.confidence);

  const resolved = engine.resolveConflict(conflicts[0].id, { winningRecordId: durable.id, reason: "Approved decision remains authoritative." });
  assert.equal(resolved.status, LEARNING_CONFLICT_STATUSES.RESOLVED);
  assert.equal(engine.get(durable.id).status, LEARNING_STATUSES.ACTIVE);
  assert.equal(engine.get(contradictory.id).status, LEARNING_STATUSES.SUPERSEDED);
});

test("supersedes, archives, deletes, and tracks usefulness", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const current = engine.record(baseRecord({ title: "Old repair tactic", tags: ["repair"] }));
  const used = engine.markUsed(current.id, { timestamp: "2026-07-17T00:00:00.000Z" });

  assert.equal(used.useCount, 1);
  assert.equal(used.lastUsedAt, "2026-07-17T00:00:00.000Z");

  const superseded = engine.supersede(current.id, baseRecord({
    title: "New repair tactic",
    summary: "Prefer targeted validation before broader repair.",
    tags: ["repair"],
  }));
  assert.equal(superseded.record.status, LEARNING_STATUSES.SUPERSEDED);
  assert.equal(engine.get(superseded.replacement.id).metadata.supersedes, current.id);

  const archived = engine.archive(superseded.replacement.id);
  assert.equal(archived.status, LEARNING_STATUSES.ARCHIVED);
  assert.equal(engine.delete(archived.id), true);
  assert.equal(engine.get(archived.id), null);
});

test("learns from successful and failed execution sessions without promoting raw history", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const successful = createSession({
    currentState: EXECUTION_STATES.COMPLETED,
    completedSteps: ["plan", "edit"],
    metadata: {
      validationPassed: true,
      objectiveComplete: true,
      projectId: "project-a",
    },
  });
  const failed = createSession({
    currentState: EXECUTION_STATES.FAILED,
    errors: [{ message: "Validation command failed twice." }],
    metadata: {
      validationPassed: false,
      projectId: "project-a",
    },
  });

  const successfulRecords = engine.learnFromSession(successful);
  const failedRecords = engine.learnFromSession(failed);
  const ignored = engine.learnFromSession(createSession({
    metadata: { projectId: "project-a" },
  }), {
    extractors: [],
  });

  assert.ok(successfulRecords.some((record) => record.type === LEARNING_RECORD_TYPES.SUCCESSFUL_STRATEGY));
  assert.ok(successfulRecords.some((record) => record.type === LEARNING_RECORD_TYPES.VALIDATION_LESSON));
  assert.ok(failedRecords.some((record) => record.type === LEARNING_RECORD_TYPES.FAILED_STRATEGY));
  assert.equal(ignored.length, 0);
});

test("learns from repairs, approvals, security findings, and completion history", () => {
  const engine = new CrossSessionLearningEngine({ projectId: "project-a" });
  const records = engine.learnFromSession(createSession({
    currentState: EXECUTION_STATES.COMPLETED,
    completedSteps: ["patch"],
    metadata: {
      projectId: "project-a",
      validationPassed: true,
      repairHistory: [{
        attempt: 1,
        failureSummary: "Syntax error",
        repairAction: "patched parser",
        result: "REPAIRED",
      }],
      approvalRequest: {
        id: "approval-1",
        action: "modify configuration",
        reason: "Config change required review.",
      },
      deniedActions: [{
        action: "delete files",
        reason: "Too destructive.",
      }],
      securityFindings: [{
        id: "finding-1",
        ruleId: "dangerous-shell",
        title: "Dangerous shell command",
        description: "Shell command was blocked.",
        severity: "CRITICAL",
        status: "BLOCKED",
        evidence: { source: "execution", signal: "rm -rf" },
      }],
      completionHistory: [{
        result: "COMPLETE",
        reasons: ["All acceptance criteria passed."],
        findings: [{ source: "completion", signal: "complete" }],
      }],
    },
  }));

  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.REPAIR_OUTCOME));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.APPROVAL_PATTERN && record.tags.includes("denied")));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.SECURITY_LESSON));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.COMPLETION_LESSON));
});

test("supports durable decisions, repository changes, user corrections, and injected extractors", () => {
  const engine = new CrossSessionLearningEngine({
    projectId: "project-a",
    extractors: [{
      extract() {
        return {
          type: LEARNING_RECORD_TYPES.ARCHITECTURE_PATTERN,
          title: "Adapters stay platform independent",
          summary: "Adapter contracts should keep platform details outside core logic.",
          evidence: { source: "extractor", signal: "architecture pattern" },
          confidence: 0.88,
          importance: 0.8,
          tags: ["architecture"],
          metadata: { promotionReason: "durable architectural consequence" },
        };
      },
    }],
  });
  const records = engine.learnFromSession(createSession({ metadata: { projectId: "project-a" } }), {
    projectId: "project-a",
    decisionRecords: [approvedDecision("decision-1")],
    repositoryChanges: [{ type: "modified", path: "src/app.js" }],
    userCorrections: [{ title: "Prefer npm.cmd", summary: "Use npm.cmd on Windows when npm.ps1 is blocked." }],
  });

  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.DURABLE_DECISION));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.REPOSITORY_FACT));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.USER_PREFERENCE));
  assert.ok(records.some((record) => record.type === LEARNING_RECORD_TYPES.ARCHITECTURE_PATTERN));
});

test("links learning records to repository graph nodes and uses ranking signals", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root, { decisionRecords: [approvedDecision("decision-graph")] });
  const appFile = graph.findNodes({ type: GRAPH_NODE_TYPES.FILE, path: "src/app.js" })[0];
  const engine = new CrossSessionLearningEngine({
    projectId: "project-a",
    repositoryGraph: graph,
  });

  const convention = engine.record({
    type: LEARNING_RECORD_TYPES.PROJECT_CONVENTION,
    title: "App file convention",
    summary: "Keep app entry behavior in src/app.js.",
    evidence: { source: "src/app.js", signal: "entry behavior" },
    confidence: 0.7,
    importance: 0.6,
    tags: ["entry"],
  });
  const decision = engine.record({
    type: LEARNING_RECORD_TYPES.DURABLE_DECISION,
    title: "App entry decision",
    summary: "src/app.js remains the entry module.",
    evidence: { source: "src/app.js", signal: "decision" },
    tags: ["entry"],
  });
  engine.markUsed(convention.id);

  const retrieved = engine.retrieve({
    projectId: "project-a",
    tags: ["entry"],
    graphNodeIds: [appFile.id],
    limit: 2,
  });

  assert.ok(convention.metadata.graphNodeIds.includes(appFile.id));
  assert.equal(retrieved[0].id, decision.id);
  assert.ok(retrieved[0].score > retrieved[1].score);
});

test("persists, restores, migrates, and falls back to empty state for corrupt files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-learning-"));
  const persistencePath = path.join(root, ".levi", "cross-session-learning.json");
  const engine = new CrossSessionLearningEngine({ projectId: "project-a", repositoryPath: root, persistencePath });
  const record = engine.record(baseRecord({ title: "Persisted lesson" }));
  const saved = engine.save();

  assert.equal(saved.status, "PERSISTED");

  const restored = new CrossSessionLearningEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.get(record.id), engine.get(record.id));

  const snapshot = engine.snapshot();
  const manual = new CrossSessionLearningEngine();
  manual.restore(snapshot);
  assert.deepEqual(manual.snapshot(), snapshot);

  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  const corrupt = new CrossSessionLearningEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath).status, "CORRUPT");
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");
  assert.equal(corrupt.list().length, 0);

  const migrated = new CrossSessionLearningEngine({
    migrations: [(input) => ({ ...input, schemaVersion: LEARNING_SCHEMA_VERSION })],
  });
  const oldSnapshot = { ...snapshot, schemaVersion: 0 };
  migrated.restore(oldSnapshot);
  assert.equal(migrated.get(record.id).id, record.id);
});

test("emits lifecycle events in extraction, retrieval, usage, persistence, and conflict order", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-learning-events-"));
  const engine = new CrossSessionLearningEngine({ projectId: "project-a", repositoryPath: root });
  const events = collectEvents(engine);
  const record = engine.record(baseRecord({ title: "Event lesson" }));
  engine.record(baseRecord({
    title: "Event lesson",
    summary: "Conflicting event lesson.",
    metadata: { contradictsRecordId: record.id },
  }));
  const conflict = engine.snapshot().conflicts[0];
  engine.resolveConflict(conflict.id, { winningRecordId: record.id });
  engine.learnFromSession(createSession({
    currentState: EXECUTION_STATES.COMPLETED,
    metadata: { projectId: "project-a", validationPassed: true, objectiveComplete: true },
  }));
  engine.retrieve({ projectId: "project-a" });
  engine.markUsed(record.id);
  engine.archive(record.id);
  engine.save();

  assert.deepEqual(events.slice(0, 4), [
    CROSS_SESSION_LEARNING_EVENT_TYPES.RECORDED,
    CROSS_SESSION_LEARNING_EVENT_TYPES.CONFLICT_DETECTED,
    CROSS_SESSION_LEARNING_EVENT_TYPES.UPDATED,
    CROSS_SESSION_LEARNING_EVENT_TYPES.RECORDED,
  ]);
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.CONFLICT_RESOLVED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.EXTRACTION_STARTED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.EXTRACTION_COMPLETED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.RETRIEVED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.USED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.ARCHIVED));
  assert.ok(events.includes(CROSS_SESSION_LEARNING_EVENT_TYPES.PERSISTED));
});

test("remains compatible with LI-001 graph snapshots and AE session snapshots", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const graphSnapshot = graph.snapshot();
  const session = new ExecutionSession({
    sessionId: "ae-session",
    objective: "Use learning",
    currentState: EXECUTION_STATES.COMPLETED,
    completedSteps: ["done"],
    metadata: {
      projectId: "project-a",
      validationPassed: true,
      objectiveComplete: true,
    },
  });
  const engine = new CrossSessionLearningEngine({ projectId: "project-a", repositoryGraph: graph });
  const records = engine.learnFromSession(session, {
    repositoryChanges: [{ type: "modified", path: "src/app.js" }],
  });

  assert.equal(graphSnapshot.schemaVersion, 1);
  assert.ok(records.length > 0);
  assert.equal(session.snapshot().sessionId, "ae-session");
});

function baseRecord(input = {}) {
  return {
    type: input.type || LEARNING_RECORD_TYPES.PROJECT_CONVENTION,
    projectId: input.projectId,
    title: input.title || "Prefer focused tests",
    summary: input.summary || "Use focused node:test cases for behavior changes.",
    evidence: input.evidence || { source: "test/example.test.js", signal: "test convention" },
    confidence: input.confidence,
    importance: input.importance,
    tags: input.tags || ["test"],
    metadata: input.metadata || {},
  };
}

function createSession(input = {}) {
  return new ExecutionSession({
    sessionId: input.sessionId || `session-${Math.random().toString(16).slice(2)}`,
    objective: input.objective || "Implement feature",
    currentState: input.currentState || EXECUTION_STATES.IDLE,
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    completedSteps: input.completedSteps || [],
    remainingSteps: input.remainingSteps || [],
    approvalRequired: input.approvalRequired === true,
    errors: input.errors || [],
    metadata: input.metadata || {},
  });
}

function collectEvents(engine) {
  const events = [];
  engine.on(CROSS_SESSION_LEARNING_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function approvedDecision(id) {
  return {
    id,
    projectId: "project-a",
    type: "approved-decision",
    confidenceState: "APPROVED",
    source: {
      kind: "project-decision",
      source: "ARCHITECTURE.md",
      signal: "approved decision",
    },
    value: {
      decisionId: id,
      category: "architecture",
      scope: "project",
      statement: "Core engines remain platform independent.",
      evidence: [{ source: "src/app.js", signal: "decision evidence" }],
    },
  };
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-learning-graph-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    dependencies: { "left-pad": "1.3.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "function run() { return true; }",
    "module.exports = { run };",
    "",
  ].join("\n"));
  return root;
}
