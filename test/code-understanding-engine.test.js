const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ExecutionSession } = require("../src/execution-session");
const { ApprovalGateway } = require("../src/approval-gateway");
const { ContinueEngine } = require("../src/continue-engine");
const { ExecutionEngine } = require("../src/execution-engine");
const { ObjectiveCompletionEngine } = require("../src/objective-completion-engine");
const { OfflineKnowledgeIndex } = require("../src/offline-knowledge-index");
const { PlanningIntelligenceEngine } = require("../src/planning-intelligence-engine");
const { RepositoryKnowledgeGraph } = require("../src/repository-knowledge-graph");
const { ContextIntelligenceEngine, CONTEXT_PURPOSES } = require("../src/context-intelligence-engine");
const {
  CHANGE_TYPES,
  CODE_ENTITY_TYPES,
  CODE_FINDING_CODES,
  CODE_RELATIONSHIP_TYPES,
  CODE_UNDERSTANDING_EVENTS,
  CODE_UNDERSTANDING_EVENT_TYPES,
  CODE_UNDERSTANDING_SCHEMA_VERSION,
  CodeUnderstandingEngine,
} = require("../src/code-understanding-engine");

test("analyzes a repository into normalized entities, relationships, findings, summaries, and stats", () => {
  const root = createFixtureRepository();
  const engine = new CodeUnderstandingEngine();
  const events = collectEvents(engine);

  const result = engine.analyzeRepository(root);

  assert.equal(result.projectId, engine.projectId);
  assert.equal(engine.snapshot().schemaVersion, CODE_UNDERSTANDING_SCHEMA_VERSION);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.REPOSITORY }).length === 1);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.DIRECTORY, path: "src" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.FILE, path: "src/app.js" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.MODULE, path: "src/app.js" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.CLASS, name: "Runner" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.INTERFACE, name: "Task" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.TYPE, name: "TaskName" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.ENUM, name: "Mode" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.FUNCTION, name: "run" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.METHOD, name: "start" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.CONSTANT, name: "mode" }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.ROUTE }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.ENDPOINT }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.TEST }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.CONFIGURATION }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.DATABASE_MODEL }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.DATABASE_MIGRATION }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.DOCUMENTATION }).length > 0);
  assert.ok(engine.listEntities({ type: CODE_ENTITY_TYPES.DEPENDENCY, name: "left-pad" }).length > 0);
  assert.ok(engine.getRelationships(engine.listEntities({ type: CODE_ENTITY_TYPES.FILE, path: "src/app.js" })[0].id, { direction: "out", type: CODE_RELATIONSHIP_TYPES.DECLARES }).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.IMPORTS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.EXPORTS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.CALLS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.CALLED_BY]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.EXTENDS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.IMPLEMENTS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.DEPENDS_ON]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.TESTS]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.TESTED_BY]).length > 0);
  assert.ok(engine.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.CONFIGURES]).length > 0);
  assert.match(engine.getFileSummary("src/app.js").summary, /declarations/);
  assert.match(engine.getSymbolSummary(engine.findDefinitions("run")[0].id).summary, /relationships/);
  assert.equal(engine.getStats().repositoriesAnalyzed, 1);
  assert.ok(engine.getStats().filesAnalyzed > 0);
  assert.equal(events[0], CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_STARTED);
  assert.equal(events.at(-1), CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_COMPLETED);
  assert.ok(events.includes(CODE_UNDERSTANDING_EVENT_TYPES.ENTITY_DISCOVERED));
  assert.ok(events.includes(CODE_UNDERSTANDING_EVENT_TYPES.RELATIONSHIP_DISCOVERED));
});

test("supports definitions, references, callers, callees, dependency tracing, data flow, and explanations", () => {
  const engine = new CodeUnderstandingEngine();
  engine.analyzeRepository(createFixtureRepository());
  const run = engine.findDefinitions({ name: "run" })[0];
  const helper = engine.findDefinitions("helper")[0];
  const appModule = engine.findEntity({ name: "src/app", type: CODE_ENTITY_TYPES.MODULE })[0];

  assert.ok(run);
  assert.ok(helper);
  assert.ok(engine.findReferences(run.id).length > 0);
  assert.ok(engine.findCallers(helper.id).some((entity) => entity.name === "run"));
  assert.ok(engine.findCallees(run.id).some((entity) => entity.name === "helper"));
  assert.ok(engine.traceDependency(appModule.id).entities.some((entity) => entity.path === "src/util.js"));
  assert.ok(engine.traceDataFlow(run.id).limitations.length > 0);
  assert.match(engine.explainCode(run.id).summary.summary, /run/);
  assert.match(engine.explainCode({ path: "src/app.js" }).summary.summary, /src\/app\.js/);
});

test("supports injected analyzers and deterministic fallback analysis with reduced confidence", () => {
  const engine = new CodeUnderstandingEngine({
    languageAnalyzers: [{
      id: "fixture-language",
      extensions: [".fixture"],
      analyze(input) {
        return {
          entities: [{
            type: CODE_ENTITY_TYPES.FUNCTION,
            name: "fixtureSymbol",
            qualifiedName: `${input.path}:fixtureSymbol`,
            path: input.path,
            language: "FixtureLang",
          }],
          relationships: [],
          diagnostics: [],
        };
      },
    }],
  });

  const injected = engine.analyzeContent("call fixtureSymbol", "FixtureLang", { path: "src/sample.fixture" });
  const fallback = engine.analyzeContent("function loose() { return missingThing(); }", "LooseLang", { path: "src/loose.loose" });

  assert.ok(injected.entities.some((entity) => entity.name === "fixtureSymbol"));
  assert.ok(fallback.entities.some((entity) => entity.name === "loose"));
  assert.ok(fallback.findings.some((finding) => finding.code === CODE_FINDING_CODES.INCOMPLETE_ANALYSIS));
  assert.ok(fallback.entities.some((entity) => entity.metadata.reducedConfidence === true));
  assert.ok(fallback.confidence < 0.9);
});

test("produces architecture views, circular-dependency findings, boundary violations, and impact analysis", () => {
  const engine = new CodeUnderstandingEngine();
  engine.analyzeRepository(createFixtureRepository());
  const appModule = engine.findEntity({ name: "src/app", type: CODE_ENTITY_TYPES.MODULE })[0];
  const utilModule = engine.findEntity({ name: "src/util", type: CODE_ENTITY_TYPES.MODULE })[0];
  engine.addRelationship({
    type: CODE_RELATIONSHIP_TYPES.DEPENDS_ON,
    sourceId: utilModule.id,
    targetId: appModule.id,
    path: "src/util.js",
    evidence: { source: "src/util.js", signal: "fixture cycle" },
  });

  const view = engine.getArchitectureView({
    boundaryRules: [{
      id: "test-to-src-import",
      from: "^test/",
      to: "^src/",
      relationshipType: CODE_RELATIONSHIP_TYPES.IMPORTS,
      title: "Fixture boundary",
    }],
  });
  const impact = engine.analyzeChangeImpact({ path: "src/util.js" });

  assert.ok(view.modules.length > 0);
  assert.ok(view.publicInterfaces.length > 0);
  assert.ok(view.persistenceBoundaries.length > 0);
  assert.ok(view.detectedCycles.length > 0);
  assert.ok(engine.snapshot().findings.some((finding) => finding.code === CODE_FINDING_CODES.CIRCULAR_DEPENDENCY));
  assert.ok(engine.snapshot().findings.some((finding) => finding.code === CODE_FINDING_CODES.ARCHITECTURE_BOUNDARY_VIOLATION));
  assert.ok(impact.directlyAffectedEntities.some((entity) => entity.path === "src/util.js"));
  assert.ok(impact.relatedTests.some((entity) => entity.path === "test/app.test.js"));
  assert.ok(impact.likelyValidationScope.includes("targeted tests"));
});

test("detects unresolved symbols and conservative dead-code candidates without duplicate findings", () => {
  const engine = new CodeUnderstandingEngine();
  engine.analyzeRepository(createFixtureRepository());
  const before = engine.snapshot().findings.length;

  const unresolved = engine.detectUnresolvedSymbols();
  const dead = engine.detectDeadCode();
  engine.detectDeadCode();

  assert.ok(unresolved.some((finding) => finding.code === CODE_FINDING_CODES.UNRESOLVED_SYMBOL));
  assert.ok(dead.some((entity) => entity.name === "unusedLocal"));
  assert.equal(
    engine.snapshot().findings.filter((finding) => finding.code === CODE_FINDING_CODES.DEAD_CODE_CANDIDATE && finding.title === "Dead code candidate").length,
    new Set(engine.snapshot().findings.filter((finding) => finding.code === CODE_FINDING_CODES.DEAD_CODE_CANDIDATE).map((finding) => finding.id)).size,
  );
  assert.ok(engine.snapshot().findings.length >= before);
});

test("handles incremental create, modify, delete, rename, unchanged skipping, and stable symbol IDs", () => {
  const root = createFixtureRepository();
  const engine = new CodeUnderstandingEngine({ repositoryPath: root });
  engine.analyzeRepository(root);
  const beforeRun = engine.findDefinitions("run")[0];

  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "",
    "const { helper } = require('./util');",
    "function run() { return helper(); }",
    "function added() { return run(); }",
    "module.exports = { run, added };",
    "",
  ].join("\n"));
  engine.update({ type: CHANGE_TYPES.MODIFIED, path: "src/app.js" });
  const afterRun = engine.findDefinitions({ name: "run", path: "src/app.js" })[0];
  assert.equal(afterRun.id, beforeRun.id);
  assert.ok(engine.findDefinitions("added").length > 0);

  const skipped = engine.analyzeFile("src/app.js");
  assert.equal(skipped.metadata.skipped, true);

  fs.writeFileSync(path.join(root, "src", "created.js"), "function created() { return true; }\n");
  engine.update({ type: CHANGE_TYPES.CREATED, path: "src/created.js" });
  assert.ok(engine.listEntities({ path: "src/created.js" }).length > 0);

  engine.update({ type: CHANGE_TYPES.DELETED, path: "src/created.js" });
  assert.equal(engine.listEntities({ path: "src/created.js" }).length, 0);

  fs.renameSync(path.join(root, "src", "util.js"), path.join(root, "src", "helpers.js"));
  engine.update({ type: CHANGE_TYPES.RENAMED, oldPath: "src/util.js", newPath: "src/helpers.js" });
  assert.equal(engine.listEntities({ path: "src/util.js" }).length, 0);
  assert.ok(engine.listEntities({ path: "src/helpers.js" }).length > 0);
  assert.ok(engine.getStats().lastIncrementalUpdate);
});

test("applies analysis bounds, emits partial-result findings, and persists with corruption fallback", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "code-understanding.json");
  const engine = new CodeUnderstandingEngine({
    persistencePath,
    bounds: { maximumFiles: 2, maximumEntities: 100, maximumRelationships: 100 },
  });
  const events = collectEvents(engine);
  engine.analyzeRepository(root);

  assert.ok(engine.getStats().filesSkipped > 0);
  assert.ok(engine.snapshot().findings.some((finding) => finding.code === CODE_FINDING_CODES.INCOMPLETE_ANALYSIS));
  assert.equal(engine.save().status, "PERSISTED");

  const restored = new CodeUnderstandingEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.snapshot().entities, engine.snapshot().entities);

  fs.writeFileSync(persistencePath, "{not json", "utf8");
  const corrupt = new CodeUnderstandingEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");
  assert.equal(corrupt.snapshot().entities.length, 0);
  assert.ok(events.includes(CODE_UNDERSTANDING_EVENT_TYPES.CODE_UNDERSTANDING_PERSISTED));
});

test("remains compatible with LI-001 through LI-005 adapters and AE-001 through AE-007 surfaces", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const offlineIndex = new OfflineKnowledgeIndex({ repositoryPath: root });
  offlineIndex.build(root, { repositoryGraph: graph });
  const contextEngine = new ContextIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex });
  const planningEngine = new PlanningIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex });
  const code = new CodeUnderstandingEngine({
    repositoryPath: root,
    repositoryGraph: graph,
    offlineIndex,
    contextEngine,
    planningEngine,
  });
  code.analyzeRepository(root);

  const contextPackage = contextEngine.assemble({
    purpose: CONTEXT_PURPOSES.CODE_UNDERSTANDING,
    objective: "Understand run behavior",
    paths: ["src/app.js"],
    symbols: ["run"],
  });
  const plan = planningEngine.createPlan("Update run behavior", {
    paths: ["src/app.js"],
    symbols: ["run"],
    repositoryGraph: graph,
  });
  const session = new ExecutionSession({ sessionId: "ae-compat", objective: "Compatibility" });
  const approval = new ApprovalGateway();
  const continuation = new ContinueEngine();
  const execution = new ExecutionEngine({
    executeNextTask: () => ({ status: "ok" }),
    validateResults: () => ({ passed: true }),
  });
  const completion = new ObjectiveCompletionEngine();

  assert.ok(offlineIndex.search("run", { limit: 5 }).length > 0);
  assert.ok(contextPackage.items.length > 0);
  assert.ok(plan.tasks.length > 0);
  assert.equal(session.snapshot().sessionId, "ae-compat");
  assert.equal(typeof approval.evaluate, "function");
  assert.equal(typeof continuation.shouldContinue, "function");
  assert.equal(typeof execution.run, "function");
  assert.equal(typeof completion.evaluate, "function");
  assert.ok(code.getStats().entities > 0);
});

function collectEvents(engine) {
  const events = [];
  engine.on(CODE_UNDERSTANDING_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-code-understanding-"));
  fs.mkdirSync(path.join(root, "migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "pages"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "models"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    scripts: { test: "node --test" },
    dependencies: { "left-pad": "1.3.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "README.md"), "# Fixture\nDocuments the runtime.\n");
  fs.writeFileSync(path.join(root, "migrations", "001_init.js"), "function migrate() { return true; }\n");
  fs.writeFileSync(path.join(root, "pages", "about.js"), "export default function About() { return null; }\n");
  fs.writeFileSync(path.join(root, "src", "base.ts"), [
    "export interface Task { name: string }",
    "export type TaskName = string;",
    "export enum Mode { Test = 'test' }",
    "export class BaseRunner {}",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "util.js"), [
    "function helper() { return 1; }",
    "function unusedLocal() { return 2; }",
    "module.exports = { helper };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "models", "user-model.js"), [
    "class UserModel {",
    "  save() { return true; }",
    "}",
    "module.exports = { UserModel };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "const { helper } = require('./util');",
    "import { BaseRunner } from './base';",
    "export function exposed() { return 'ok'; }",
    "class Runner extends BaseRunner implements Task {",
    "  start() { return run(); }",
    "}",
    "function handler() { return run(); }",
    "function run() {",
    "  missingRuntime();",
    "  return helper();",
    "}",
    "const mode = 'test';",
    "app.get('/health', handler);",
    "module.exports = { Runner, run, mode };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "service.py"), [
    "import os",
    "def py_helper():",
    "    return os.getcwd()",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "test", "app.test.js"), [
    "const { run } = require('../src/app');",
    "run();",
    "",
  ].join("\n"));
  return root;
}
