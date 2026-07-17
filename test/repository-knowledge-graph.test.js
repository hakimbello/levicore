const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ExecutionSession } = require("../src/execution-session");
const { extractProjectKnowledge } = require("../src/project-knowledge");
const { scanRepository } = require("../src/repository-scanner");
const {
  searchStructuralIndex,
  searchStructuralRelationships,
} = require("../src/structural-search");
const {
  CHANGE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  GRAPH_SCHEMA_VERSION,
  KNOWLEDGE_GRAPH_EVENTS,
  KNOWLEDGE_GRAPH_EVENT_TYPES,
  RepositoryKnowledgeGraph,
  createStructuralLanguageAnalyzer,
} = require("../src/repository-knowledge-graph");

test("builds an initial repository graph with files, directories, symbols, dependencies, tests, and decisions", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  const events = collectEvents(graph);
  const decision = approvedDecision("decision-1", "src/app.js");

  const snapshot = graph.build(root, {
    decisionRecords: [decision],
    projectKnowledgeFacts: [{
      category: "architecture",
      value: "src contains runtime code",
      evidence: { source: "src/app.js", signal: "fixture" },
      confidence: "VERIFIED",
    }],
  });

  assert.equal(snapshot.schemaVersion, GRAPH_SCHEMA_VERSION);
  assert.equal(graph.findNodes({ type: GRAPH_NODE_TYPES.REPOSITORY }).length, 1);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.DIRECTORY, path: "src" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FILE, path: "src/app.js" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.MODULE, path: "src/app.js" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.CLASS, name: "Runner" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "run" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.METHOD, name: "start" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.INTERFACE, name: "Task" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.TYPE, name: "TaskName" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.VARIABLE, name: "mode" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.TEST }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.CONFIGURATION, path: "package.json" }).length > 0);
  assert.deepEqual(graph.findNodes({ type: GRAPH_NODE_TYPES.DEPENDENCY }).map((node) => node.name), ["left-pad"]);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.DECISION, keyword: "approved-decision" }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.CONTAINS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.DEFINES }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.IMPORTS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.EXPORTS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.CALLS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.REFERENCES }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.EXTENDS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.IMPLEMENTS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.DEPENDS_ON }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.TESTS }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.CONFIGURES }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.GOVERNED_BY_DECISION }).length > 0);
  assert.equal(events[0], KNOWLEDGE_GRAPH_EVENT_TYPES.BUILD_STARTED);
  assert.equal(events.at(-1), KNOWLEDGE_GRAPH_EVENT_TYPES.BUILD_COMPLETED);
  assert.ok(events.includes(KNOWLEDGE_GRAPH_EVENT_TYPES.NODE_ADDED));
  assert.ok(events.includes(KNOWLEDGE_GRAPH_EVENT_TYPES.EDGE_ADDED));
});

test("prevents duplicate nodes and duplicate edges", () => {
  const graph = new RepositoryKnowledgeGraph();
  const events = collectEvents(graph);
  const node = {
    id: "file:src/app.js",
    type: GRAPH_NODE_TYPES.FILE,
    name: "app.js",
    path: "src/app.js",
  };
  const edge = {
    type: GRAPH_EDGE_TYPES.REFERENCES,
    sourceId: "file:src/app.js",
    targetId: "file:src/app.js",
    evidence: { source: "src/app.js", signal: "self" },
  };

  graph.addNode(node);
  graph.addNode({ ...node, metadata: { seenAgain: true } });
  graph.addEdge(edge);
  graph.addEdge(edge);

  assert.equal(graph.findNodes({ id: node.id }).length, 1);
  assert.equal(graph.findEdges({ type: GRAPH_EDGE_TYPES.REFERENCES }).length, 1);
  assert.equal(events.filter((type) => type === KNOWLEDGE_GRAPH_EVENT_TYPES.NODE_ADDED).length, 1);
  assert.equal(events.filter((type) => type === KNOWLEDGE_GRAPH_EVENT_TYPES.EDGE_ADDED).length, 1);
  assert.equal(graph.getNode(node.id).metadata.seenAgain, true);
});

test("updates modified files incrementally while preserving stable node identifiers", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const before = graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "run", path: "src/app.js" })[0];

  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "const { helper } = require('./util');",
    "function run() { return helper(); }",
    "function added() { return run(); }",
    "module.exports = { run, added };",
    "",
  ].join("\n"));

  graph.update({ type: CHANGE_TYPES.MODIFIED, path: "src/app.js" });

  const after = graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "run", path: "src/app.js" })[0];
  assert.equal(after.id, before.id);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "added" }).length > 0);
  assert.ok(graph.findEdges({ type: GRAPH_EDGE_TYPES.MODIFIES }).length > 0);
});

test("handles created, deleted, and renamed files without a full rebuild", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph({
    scanRepository: () => {
      throw new Error("scanRepository should not run during incremental update.");
    },
  });
  graph.build(root, { scanResult: scanRepository(root) });

  fs.writeFileSync(path.join(root, "src", "created.js"), "function created() { return true; }\nmodule.exports = { created };\n");
  graph.update({ type: CHANGE_TYPES.CREATED, path: "src/created.js" });
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FILE, path: "src/created.js" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "created" }).length > 0);

  graph.update({ type: CHANGE_TYPES.DELETED, path: "src/created.js" });
  assert.equal(graph.findNodes({ path: "src/created.js" }).length, 0);

  fs.renameSync(path.join(root, "src", "util.js"), path.join(root, "src", "helpers.js"));
  graph.update({ type: CHANGE_TYPES.RENAMED, oldPath: "src/util.js", newPath: "src/helpers.js" });
  assert.equal(graph.findNodes({ path: "src/util.js" }).length, 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FILE, path: "src/helpers.js" }).length > 0);
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "helper", path: "src/helpers.js" }).length > 0);
});

test("supports injected language analyzers through the analyzer contract", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph({
    languageAnalyzers: [{
      id: "markdown-analyzer",
      extensions: [".md"],
      analyzeFile(input) {
        return {
          nodes: [{
            id: `module:${input.filePath}:doc`,
            type: GRAPH_NODE_TYPES.MODULE,
            name: "doc module",
            path: input.filePath,
            language: "Markdown",
            metadata: { filePath: input.filePath },
          }],
          edges: [{
            type: GRAPH_EDGE_TYPES.DEFINES,
            sourceId: `file:${input.filePath}`,
            targetId: `module:${input.filePath}:doc`,
            evidence: { source: input.filePath, signal: "markdown heading" },
          }],
        };
      },
    }],
  });
  graph.build(root);

  fs.writeFileSync(path.join(root, "README.md"), "# Fixture\n");
  graph.update({ type: CHANGE_TYPES.CREATED, path: "README.md" });

  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.MODULE, path: "README.md", language: "Markdown" }).length > 0);
  assert.equal(typeof createStructuralLanguageAnalyzer().analyzeFile, "function");
});

test("persists, loads, snapshots, restores, and falls back when persisted state is corrupt", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "kg.json");
  const graph = new RepositoryKnowledgeGraph({ persistencePath });
  graph.build(root);
  const saveResult = graph.save();
  const restored = new RepositoryKnowledgeGraph({ persistencePath });
  const restoredEvents = collectEvents(restored);

  assert.equal(saveResult.status, "PERSISTED");
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.snapshot(), graph.snapshot());

  const snapshot = graph.snapshot();
  const manualRestore = new RepositoryKnowledgeGraph();
  manualRestore.restore(snapshot);
  assert.deepEqual(manualRestore.snapshot(), snapshot);

  fs.writeFileSync(persistencePath, "{not json", "utf8");
  const corrupt = new RepositoryKnowledgeGraph({ persistencePath });
  const result = corrupt.load(persistencePath);
  assert.equal(result.status, "REBUILD_REQUIRED");

  const rebuilt = new RepositoryKnowledgeGraph({ persistencePath, repositoryPath: root });
  const rebuildResult = rebuilt.load(persistencePath, { rebuildOnCorruption: true, repositoryPath: root });
  assert.equal(rebuildResult.status, "REBUILT");
  assert.ok(rebuilt.findNodes({ type: GRAPH_NODE_TYPES.REPOSITORY }).length > 0);
  assert.ok(restoredEvents.includes(KNOWLEDGE_GRAPH_EVENT_TYPES.RESTORED));
});

test("answers graph queries, dependency traversal, callers, callees, references, and impact analysis", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const appModule = graph.findNodes({ type: GRAPH_NODE_TYPES.MODULE, path: "src/app.js" })[0];
  const helperFunction = graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "helper" })[0];
  const runFunction = graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "run" })[0];
  const dependency = graph.findNodes({ type: GRAPH_NODE_TYPES.DEPENDENCY, name: "left-pad" })[0];

  assert.ok(graph.getNeighbors(appModule.id, { direction: "out" }).length > 0);
  assert.ok(graph.getDependencies(appModule.id).some((node) => node.path === "src/util.js"));
  assert.ok(graph.getDependents(dependency.id, { maxDepth: 2 }).some((node) => node.type === GRAPH_NODE_TYPES.REPOSITORY));
  assert.ok(graph.getReferences(appModule.id).some((node) => node.type === GRAPH_NODE_TYPES.FILE));
  assert.ok(graph.getCallers(helperFunction.id).some((node) => node.id === runFunction.id));
  assert.ok(graph.getCallees(runFunction.id).some((node) => node.id === helperFunction.id));
  assert.ok(graph.getImpactSet(helperFunction.id, { maxDepth: 3 }).some((node) => node.path === "src/app.js"));
});

test("remains compatible with project knowledge, structural search, and AE sessions", () => {
  const root = createFixtureRepository();
  const scanResult = scanRepository(root);
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root, { scanResult });

  const knowledge = extractProjectKnowledge({ repositoryPath: root, scanResult });
  const symbolSearch = searchStructuralIndex({
    structuralIndex: scanResult.structuralIndex,
    filters: { symbolNames: "run" },
  });
  const relationshipSearch = searchStructuralRelationships({
    structuralIndex: scanResult.structuralIndex,
    filters: { relationshipTypes: "function-call" },
  });
  const session = new ExecutionSession({
    sessionId: "ae-compatible",
    objective: "Confirm AE compatibility",
  });

  assert.equal(knowledge.status, "EXTRACTED");
  assert.equal(symbolSearch.status, "FOUND");
  assert.equal(relationshipSearch.status, "FOUND");
  assert.equal(session.snapshot().sessionId, "ae-compatible");
  assert.ok(graph.findNodes({ type: GRAPH_NODE_TYPES.FUNCTION, name: "run" }).length > 0);
});

function collectEvents(graph) {
  const events = [];
  graph.on(KNOWLEDGE_GRAPH_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-kg-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: { test: "node --test" },
    dependencies: { "left-pad": "1.3.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "src", "base.ts"), [
    "export interface Task { name: string }",
    "export type TaskName = string;",
    "export class BaseRunner {}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "util.js"), [
    "function helper() { return 1; }",
    "module.exports = { helper };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "const { helper } = require('./util');",
    "export function exposed() { return 'ok'; }",
    "class Runner extends BaseRunner implements Task {",
    "  start() { return run(); }",
    "}",
    "function run() {",
    "  return helper();",
    "}",
    "const mode = 'test';",
    "module.exports = { Runner, run, mode };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "test", "app.test.js"), [
    "const { run } = require('../src/app');",
    "run();",
    "",
  ].join("\n"));
  return root;
}

function approvedDecision(id, source) {
  return {
    id,
    type: "approved-decision",
    confidenceState: "APPROVED",
    source: {
      kind: "project-decision",
      source,
      signal: "approved architecture decision",
    },
    value: {
      decisionId: id,
      category: "architecture",
      statement: "Runtime code stays under src.",
      evidence: [{ source, signal: "fixture" }],
    },
  };
}
