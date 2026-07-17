const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { EXECUTION_STATES, ExecutionSession } = require("../src/execution-session");
const {
  RepositoryKnowledgeGraph,
} = require("../src/repository-knowledge-graph");
const {
  CrossSessionLearningEngine,
  LEARNING_RECORD_TYPES,
} = require("../src/cross-session-learning-engine");
const {
  CHANGE_TYPES,
  OFFLINE_INDEX_DOCUMENT_TYPES,
  OFFLINE_INDEX_EVENTS,
  OFFLINE_INDEX_EVENT_TYPES,
  OFFLINE_INDEX_SCHEMA_VERSION,
  OfflineKnowledgeIndex,
} = require("../src/offline-knowledge-index");

test("builds an initial offline index for repository files, symbols, relationships, dependencies, decisions, learning, and graph nodes", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root, { decisionRecords: [approvedDecision("decision-1")] });
  const learning = new CrossSessionLearningEngine({ projectId: "project-a", repositoryGraph: graph });
  const learningRecord = learning.record({
    type: LEARNING_RECORD_TYPES.PROJECT_CONVENTION,
    projectId: "project-a",
    title: "Keep app entry in src/app.js",
    summary: "src/app.js owns entry behavior.",
    evidence: { source: "src/app.js", signal: "entry behavior" },
    tags: ["entry"],
  });
  learning.archive(learning.record({
    type: LEARNING_RECORD_TYPES.USER_PREFERENCE,
    projectId: "project-a",
    title: "Archived preference",
    summary: "Should not be indexed by default.",
    evidence: { source: "user", signal: "archived" },
  }).id);
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  const events = collectEvents(index);

  const snapshot = index.build(root, {
    repositoryGraph: graph,
    learningEngine: learning,
    projectKnowledgeFacts: [{
      category: "testing",
      value: "node:test is used",
      evidence: { source: "package.json", signal: "scripts.test" },
    }],
    decisionRecords: [approvedDecision("decision-1")],
  });

  assert.equal(snapshot.schemaVersion, OFFLINE_INDEX_SCHEMA_VERSION);
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.REPOSITORY }).length > 0);
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.DIRECTORY, path: "src" }).length > 0);
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.FILE, path: "src/app.js" }).length > 0);
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.CONFIGURATION, path: "package.json" }).length > 0);
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.TEST, path: "test/app.test.js" }).length > 0);
  assert.ok(index.searchSymbols("run")[0].symbols.includes("run"));
  assert.ok(index.searchSymbols("Runner").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.CLASS));
  assert.ok(index.searchSymbols("Task").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.INTERFACE));
  assert.ok(index.searchReferences("util").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.IMPORT));
  assert.ok(index.searchReferences("helper").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.REFERENCE));
  assert.ok(index.search("left-pad").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.DEPENDENCY));
  assert.ok(index.search("node:test").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.PROJECT_KNOWLEDGE));
  assert.ok(index.search("platform independent").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.DURABLE_DECISION));
  assert.ok(index.search("entry behavior").some((document) => document.id === `learning-record:${learningRecord.id}`));
  assert.ok(index.list({ type: OFFLINE_INDEX_DOCUMENT_TYPES.GRAPH_NODE }).length > 0);
  assert.ok(index.search("Archived preference").length === 0);
  assert.deepEqual(events.slice(0, 1), [OFFLINE_INDEX_EVENT_TYPES.BUILD_STARTED]);
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.BUILD_COMPLETED));
});

test("ranks exact symbols, exact paths, phrases, field weights, filters, graph proximity, and durable decisions", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root, { decisionRecords: [approvedDecision("decision-2")] });
  const appGraphNode = graph.findNodes({ path: "src/app.js" })[0];
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root, {
    repositoryGraph: graph,
    decisionRecords: [approvedDecision("decision-2")],
    learningRecords: [{
      id: "learning-1",
      type: "project_convention",
      projectId: "project-a",
      title: "App entry learning",
      summary: "App entry lives in src/app.js",
      evidence: [{ source: "src/app.js", signal: "entry" }],
      confidence: 0.8,
      importance: 0.9,
      status: "ACTIVE",
      tags: ["entry"],
      metadata: { graphNodeIds: [appGraphNode.id] },
    }],
  });

  assert.equal(index.searchSymbols("run")[0].symbols[0], "run");
  assert.equal(index.searchPaths("src/app.js")[0].path, "src/app.js");
  assert.ok(index.search("\"not used\"").length >= 0);
  assert.equal(index.search("core engines", { filters: { type: OFFLINE_INDEX_DOCUMENT_TYPES.DURABLE_DECISION } })[0].type, OFFLINE_INDEX_DOCUMENT_TYPES.DURABLE_DECISION);
  assert.ok(index.search("entry", { filters: { tags: ["entry"] } }).every((document) => document.tags.includes("entry")));
  assert.ok(index.search("entry", { filters: { graphNodeIds: [appGraphNode.id] } }).every((document) => document.references.includes(appGraphNode.id)));
  assert.equal(index.search("run", { filters: { language: "JavaScript" } })[0].language, "JavaScript");
});

test("supports created, modified, deleted, renamed, unchanged, and duplicate document updates", () => {
  const root = createFixtureRepository();
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root);
  const before = index.findFileDocumentByPath("src/app.js");

  index.update({ type: CHANGE_TYPES.MODIFIED, path: "src/app.js" });
  assert.equal(index.getStats().skippedUnchangedFiles, 1);
  assert.equal(index.findFileDocumentByPath("src/app.js").contentHash, before.contentHash);

  fs.writeFileSync(path.join(root, "src", "created.js"), "function created() { return true; }\nmodule.exports = { created };\n");
  index.update({ type: CHANGE_TYPES.CREATED, path: "src/created.js" });
  assert.ok(index.searchSymbols("created").length > 0);

  fs.appendFileSync(path.join(root, "src", "app.js"), "\nfunction changed() { return run(); }\n");
  index.update({ type: CHANGE_TYPES.MODIFIED, path: "src/app.js" });
  assert.notEqual(index.findFileDocumentByPath("src/app.js").contentHash, before.contentHash);
  assert.ok(index.searchSymbols("changed").length > 0);

  index.update({ type: CHANGE_TYPES.DELETED, path: "src/created.js" });
  assert.equal(index.list({ path: "src/created.js" }).length, 0);

  fs.renameSync(path.join(root, "src", "util.js"), path.join(root, "src", "helpers.js"));
  index.update({ type: CHANGE_TYPES.RENAMED, oldPath: "src/util.js", newPath: "src/helpers.js" });
  assert.equal(index.list({ path: "src/util.js" }).length, 0);
  assert.ok(index.list({ path: "src/helpers.js" }).length > 0);

  const manual = index.indexDocument({
    id: "manual-doc",
    type: OFFLINE_INDEX_DOCUMENT_TYPES.FILE,
    projectId: "project-a",
    path: "README.md",
    title: "Manual",
    content: "manual content",
  });
  const duplicate = index.indexDocument({
    id: "manual-doc",
    type: OFFLINE_INDEX_DOCUMENT_TYPES.FILE,
    projectId: "project-a",
    path: "README.md",
    title: "Manual",
    content: "manual content updated",
  });
  assert.equal(index.list({ id: "manual-doc" }).length, 1);
  assert.notEqual(manual.contentHash, duplicate.contentHash);
});

test("respects ignore rules, binary exclusion, oversized exclusion, and custom ignores during incremental indexing", () => {
  const root = createFixtureRepository();
  const index = new OfflineKnowledgeIndex({
    projectId: "project-a",
    maxFileBytes: 20,
    ignorePatterns: [/^ignored\//],
  });
  index.build(root);
  fs.mkdirSync(path.join(root, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "pkg", "index.js"), "function ignored() {}\n");
  fs.mkdirSync(path.join(root, "ignored"), { recursive: true });
  fs.writeFileSync(path.join(root, "ignored", "file.js"), "function ignoredCustom() {}\n");
  fs.writeFileSync(path.join(root, "src", "large.js"), "x".repeat(100));
  fs.writeFileSync(path.join(root, "src", "binary.js"), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(root, "src", ".env"), "SECRET=1\n");

  index.update([
    { type: CHANGE_TYPES.CREATED, path: "node_modules/pkg/index.js" },
    { type: CHANGE_TYPES.CREATED, path: "ignored/file.js" },
    { type: CHANGE_TYPES.CREATED, path: "src/large.js" },
    { type: CHANGE_TYPES.CREATED, path: "src/binary.js" },
    { type: CHANGE_TYPES.CREATED, path: "src/.env" },
  ]);

  assert.equal(index.search("ignoredCustom").length, 0);
  assert.equal(index.search("ignored").length, 0);
  assert.equal(index.list({ path: "src/large.js" }).length, 0);
  assert.equal(index.list({ path: "src/binary.js" }).length, 0);
  assert.equal(index.list({ path: "src/.env" }).length, 0);
  assert.ok(index.getStats().ignoredFiles >= 5);
});

test("persists, restores, falls back on corruption, rebuilds, snapshots, and compacts", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "offline-knowledge-index.json");
  const index = new OfflineKnowledgeIndex({ projectId: "project-a", repositoryPath: root, persistencePath });
  index.build(root);
  const saved = index.save();
  assert.equal(saved.status, "PERSISTED");

  const restored = new OfflineKnowledgeIndex({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.snapshot(), index.snapshot());

  const manual = new OfflineKnowledgeIndex();
  manual.restore(index.snapshot());
  assert.deepEqual(manual.snapshot(), index.snapshot());

  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  const corrupt = new OfflineKnowledgeIndex({ projectId: "project-a", repositoryPath: root, persistencePath });
  assert.equal(corrupt.load(persistencePath).status, "CORRUPT");
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");
  assert.equal(corrupt.getStats().documentCount, 0);

  const rebuilt = new OfflineKnowledgeIndex({ projectId: "project-a", repositoryPath: root, persistencePath });
  assert.equal(rebuilt.load(persistencePath, { rebuildOnCorruption: true, repositoryPath: root }).status, "REBUILT");
  assert.ok(rebuilt.getStats().documentCount > 0);

  const migrated = new OfflineKnowledgeIndex({
    migrations: [(snapshot) => ({ ...snapshot, schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION })],
  });
  const oldSnapshot = { ...index.snapshot(), schemaVersion: 0 };
  migrated.restore(oldSnapshot);
  assert.equal(migrated.getStats().documentCount, index.getStats().documentCount);
  migrated.compact();
  assert.equal(migrated.getStats().documentCount, index.getStats().documentCount);
});

test("reports statistics and emits lifecycle events for build, update, search, persistence, restore, corruption, rebuild, and compaction", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "offline-knowledge-index.json");
  const index = new OfflineKnowledgeIndex({ projectId: "project-a", repositoryPath: root, persistencePath });
  const events = collectEvents(index);
  index.build(root);
  index.search("run");
  index.update({ type: CHANGE_TYPES.MODIFIED, path: "src/app.js" });
  index.save();
  index.restore(index.snapshot());
  fs.writeFileSync(persistencePath, "{bad json", "utf8");
  index.load(persistencePath, { emptyOnCorruption: true });
  index.compact();
  const stats = index.getStats();

  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.BUILD_STARTED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.BUILD_COMPLETED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.SEARCH_STARTED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.SEARCH_COMPLETED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.UPDATE_STARTED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.UPDATE_COMPLETED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_SKIPPED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.PERSISTED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.RESTORED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.CORRUPTION_DETECTED));
  assert.ok(events.includes(OFFLINE_INDEX_EVENT_TYPES.COMPACTED));
  assert.equal(stats.documentCount, 0);
  assert.ok(index.snapshot().stats.documentTypes);
});

test("supports optional semantic adapters without requiring them", () => {
  const root = createFixtureRepository();
  const index = new OfflineKnowledgeIndex({
    projectId: "project-a",
    semanticAdapters: [{
      rank(results) {
        return results.slice().reverse();
      },
    }],
  });
  index.build(root);
  const adapted = index.search("run");
  assert.ok(adapted.length > 0);
});

test("remains compatible with LI-001, LI-002, and AE session snapshots", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const learning = new CrossSessionLearningEngine({ projectId: "project-a", repositoryGraph: graph });
  learning.learnFromSession(new ExecutionSession({
    sessionId: "ae-session",
    objective: "Index completed work",
    currentState: EXECUTION_STATES.COMPLETED,
    startedAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    completedSteps: ["indexed"],
    metadata: {
      projectId: "project-a",
      validationPassed: true,
      objectiveComplete: true,
    },
  }));
  const index = new OfflineKnowledgeIndex({ projectId: "project-a" });
  index.build(root, {
    repositoryGraph: graph.snapshot(),
    learningSnapshot: learning.snapshot(),
  });

  assert.equal(graph.snapshot().schemaVersion, 1);
  assert.ok(learning.snapshot().records.length > 0);
  assert.ok(index.search("completed").some((document) => document.type === OFFLINE_INDEX_DOCUMENT_TYPES.LEARNING_RECORD));
});

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-offline-index-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: { test: "node --test" },
    dependencies: { "left-pad": "1.3.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "src", "base.ts"), [
    "export interface Task { name: string }",
    "export class BaseRunner {}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "util.js"), [
    "function helper() { return 'help'; }",
    "module.exports = { helper };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "const { helper } = require('./util');",
    "class Runner extends BaseRunner implements Task {",
    "  start() { return run(); }",
    "}",
    "function run() {",
    "  return helper();",
    "}",
    "module.exports = { Runner, run };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "test", "app.test.js"), [
    "const { run } = require('../src/app');",
    "run();",
    "",
  ].join("\n"));
  return root;
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

function collectEvents(index) {
  const events = [];
  index.on(OFFLINE_INDEX_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}
