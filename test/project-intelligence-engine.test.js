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
const { PlanningIntelligenceEngine, TASK_STATUSES } = require("../src/planning-intelligence-engine");
const { RepositoryKnowledgeGraph } = require("../src/repository-knowledge-graph");
const { ContextIntelligenceEngine, CONTEXT_PURPOSES } = require("../src/context-intelligence-engine");
const { CrossSessionLearningEngine } = require("../src/cross-session-learning-engine");
const { CodeUnderstandingEngine, CODE_ENTITY_TYPES } = require("../src/code-understanding-engine");
const {
  PROJECT_ASSESSMENT_STATUSES,
  PROJECT_BLOCKER_CATEGORIES,
  PROJECT_CLASSIFICATIONS,
  PROJECT_DEBT_CATEGORIES,
  PROJECT_FEATURE_STATES,
  PROJECT_FINDING_SEVERITIES,
  PROJECT_INTELLIGENCE_DOMAINS,
  PROJECT_INTELLIGENCE_EVENTS,
  PROJECT_INTELLIGENCE_EVENT_TYPES,
  PROJECT_INTELLIGENCE_SCHEMA_VERSION,
  PROJECT_LIFECYCLE_STAGES,
  PROJECT_READINESS_LEVELS,
  PROJECT_SCORE_DOMAINS,
  ProjectIntelligenceEngine,
} = require("../src/project-intelligence-engine");

test("creates normalized project profiles with deterministic identity, classification, objectives, and architecture", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({
    repositoryPath: root,
    repositoryGraph: graph,
    offlineIndex: index,
    codeUnderstandingEngine: code,
    planningEngine: planning,
    contextEngine: context,
    learningEngine: learning,
  });

  const profile = engine.createProfile("levi-project", {
    currentInstructions: ["Ship autonomous project intelligence"],
    durableDecisions: [decision("decision-ai-platform", "Levi remains an offline-first AI platform.")],
  });

  assert.equal(profile.projectId, "levi-project");
  assert.equal(profile.name, "levi-fixture");
  assert.equal(profile.classification.primary, PROJECT_CLASSIFICATIONS.IDE_EXTENSION);
  assert.ok(profile.classification.secondary.includes(PROJECT_CLASSIFICATIONS.AI_AGENT));
  assert.ok(profile.classification.secondary.includes(PROJECT_CLASSIFICATIONS.AI_PLATFORM));
  assert.ok(profile.classification.secondary.includes(PROJECT_CLASSIFICATIONS.CLI));
  assert.ok([PROJECT_LIFECYCLE_STAGES.MVP_BUILD, PROJECT_LIFECYCLE_STAGES.HARDENING, PROJECT_LIFECYCLE_STAGES.RELEASE_CANDIDATE].includes(profile.lifecycleStage));
  assert.ok(profile.objectives.some((objective) => objective.state === "active"));
  assert.ok(profile.languages.includes("JavaScript"));
  assert.ok(profile.frameworks.length > 0);
  assert.ok(profile.packages.includes("left-pad"));
  assert.ok(profile.entryPoints.length > 0);
  assert.ok(profile.modules.length > 0);
  assert.ok(profile.externalIntegrations.length > 0);
  assert.ok(profile.constraints.some((constraint) => constraint.includes("offline")));
  assert.ok(profile.decisions.length > 0);
  assert.ok(profile.metadata.classificationEvidence.length > 0);
});

test("assesses project state, distinguishing implemented and validated capabilities", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });
  const validationResults = [{ id: "validation-pass", status: "PASSED", passed: true, evidence: [{ source: "npm test", signal: "tests passed" }] }];
  const completionEvidence = [{ id: "completion-1", objective: "Complete validated feature", completedTaskIds: ["task-complete"], evidence: [{ source: "completion", signal: "objective complete" }] }];

  const assessment = engine.assessProject("levi-project", { validationResults, completionEvidence });

  assert.equal(assessment.projectId, "levi-project");
  assert.ok(assessment.completedCapabilities.some((feature) => feature.state === PROJECT_FEATURE_STATES.VALIDATED));
  assert.ok(assessment.completedCapabilities.some((feature) => feature.state === PROJECT_FEATURE_STATES.IMPLEMENTED || feature.state === PROJECT_FEATURE_STATES.VALIDATED));
  assert.ok(assessment.incompleteCapabilities.some((feature) => [PROJECT_FEATURE_STATES.PLANNED, PROJECT_FEATURE_STATES.READY, PROJECT_FEATURE_STATES.BLOCKED].includes(feature.state)));
  assert.ok(assessment.currentState.intended.length > 0);
  assert.ok(assessment.currentState.implemented.length > 0);
  assert.ok(assessment.summary.includes("Release readiness"));
  assert.ok(assessment.confidence >= 0 && assessment.confidence <= 1);
  assert.ok(assessment.completeness >= 0 && assessment.completeness <= 1);
});

test("detects blockers, risks, technical debt, conflicts, and readiness caps from evidence", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });

  const assessment = engine.assessProject("levi-project", {
    validationResults: [{ id: "validation-fail", status: "FAILED", passed: false, evidence: [{ source: "npm test", signal: "failed tests" }] }],
    securityFindings: [{ id: "sec-critical", severity: "CRITICAL", status: "OPEN", title: "Secret exposure", evidence: [{ source: "src/app.js", signal: "critical security" }] }],
    executionHistory: [{ id: "exec-fail", status: "FAILED", stopReason: "EXECUTION_FAILED", evidence: [{ source: "execution", signal: "failed" }] }],
    approvalHistory: [{ id: "approval-1", decision: "REQUIRES_APPROVAL", evidence: [{ source: "approval", signal: "pending" }] }],
    completionEvidence: [{ id: "completion-conflict", objective: "Release", evidence: [{ source: "completion", signal: "claimed complete" }] }],
  });

  assert.equal(assessment.releaseReadiness.level, PROJECT_READINESS_LEVELS.NOT_READY);
  assert.ok(assessment.blockers.some((blocker) => blocker.category === PROJECT_BLOCKER_CATEGORIES.SECURITY_CRITICAL));
  assert.ok(assessment.blockers.some((blocker) => blocker.category === PROJECT_BLOCKER_CATEGORIES.FAILED_VALIDATION));
  assert.ok(assessment.risks.some((risk) => risk.category === "SECURITY"));
  assert.ok(assessment.technicalDebt.some((debt) => debt.category === PROJECT_DEBT_CATEGORIES.DEAD_CODE_CANDIDATE || debt.category === PROJECT_DEBT_CATEGORIES.UNRESOLVED_SYMBOL));
  assert.ok(assessment.findings.some((finding) => finding.code === "validation_vs_completion_claim"));
  assert.ok(assessment.findings.some((finding) => finding.code === "release_claim_vs_security_state"));
  assert.ok(assessment.scores.securityPosture.value < 70);
  assert.ok(assessment.scores.releaseReadiness.value < 70);
  assert.ok(assessment.scores.overallHealth.value <= 45);
  assert.ok([PROJECT_ASSESSMENT_STATUSES.BLOCKED, PROJECT_ASSESSMENT_STATUSES.CONFLICTED].includes(assessment.status));
});

test("calculates deterministic scores, score explanations, release readiness, summaries, and ranked next actions", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });
  const first = engine.analyzeProject("levi-project", {
    validationResults: [{ id: "validation-pass", status: "PASSED", passed: true, evidence: [{ source: "npm test", signal: "passed" }] }],
  }).assessment;
  const second = engine.refreshAssessment("levi-project", {
    validationResults: [{ id: "validation-fail", status: "FAILED", passed: false, evidence: [{ source: "npm test", signal: "failed" }] }],
  });

  for (const domain of Object.keys(PROJECT_SCORE_DOMAINS)) {
    assert.ok(first.scores[domain].value >= 0 && first.scores[domain].value <= 100);
    assert.ok(first.scores[domain].evidence.length > 0);
  }
  assert.ok(engine.explainScore("levi-project", "testingHealth").deductions);
  assert.ok(engine.getReleaseReadiness("levi-project").level);
  assert.ok(engine.getProjectSummary("levi-project").identity.includes("levi-fixture"));
  assert.ok(engine.getNextActions("levi-project")[0].evidence.length > 0);
  assert.ok(engine.getNextActions("levi-project")[0].whyPrioritized.includes("prioritized"));
  const comparison = engine.compareAssessments("levi-project", first.id, second.id);
  assert.ok(comparison.scoreChanges.testingHealth.delta < 0);
  assert.notEqual(comparison.readinessChange.from, undefined);
});

test("exposes domain assessment APIs and validates assessment consistency", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });
  const assessment = engine.assessProject("levi-project", {
    securityFindings: [{ id: "sec-high", severity: "HIGH", status: "OPEN", title: "Auth weakness", evidence: [{ source: "security", signal: "high" }] }],
  });

  assert.ok(engine.getArchitectureAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.ARCHITECTURE);
  assert.ok(engine.getFeatureAssessment("levi-project").completedCapabilities.length >= 0);
  assert.ok(engine.getExecutionAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.EXECUTION);
  assert.ok(engine.getQualityAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.QUALITY);
  assert.ok(engine.getTestingAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.TESTING);
  assert.ok(engine.getSecurityAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.SECURITY);
  assert.ok(engine.getDocumentationAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.DOCUMENTATION);
  assert.ok(engine.getDependencyAssessment("levi-project").domain === PROJECT_INTELLIGENCE_DOMAINS.DEPENDENCIES);
  assert.ok(engine.getTechnicalDebtAssessment("levi-project").technicalDebt.length >= 0);
  assert.ok(engine.getBlockers("levi-project").length >= 0);
  assert.ok(engine.getRisks("levi-project").length > 0);
  assert.equal(engine.validateAssessment("levi-project", assessment.id).status, "VALID");
  assert.ok(engine.explainConclusion("levi-project", "risk_security") || engine.explainConclusion("levi-project", PROJECT_READINESS_LEVELS.NOT_READY) || engine.explainConclusion("levi-project", assessment.findings[0].id));
});

test("handles partial collectors, missing evidence, bounds, lifecycle events, and statistics", () => {
  const root = createFixtureRepository();
  const engine = new ProjectIntelligenceEngine({
    repositoryPath: root,
    bounds: { maximumCollectedRecords: 2, maximumFindings: 20, maximumRecommendations: 5 },
  });
  const events = collectEvents(engine);

  const result = engine.analyzeProject("partial-project", {
    collectors: [{
      collect() {
        return {
          source: "custom",
          records: [{ type: "custom_record", value: { name: "custom" }, evidence: [{ source: "custom", signal: "collector" }] }],
          findings: [{ domain: PROJECT_INTELLIGENCE_DOMAINS.CONFIDENCE, code: "custom_finding", severity: PROJECT_FINDING_SEVERITIES.INFO, title: "Custom", description: "Custom finding.", evidence: [{ source: "custom", signal: "finding" }] }],
          confidence: 0.5,
        };
      },
    }],
  });

  assert.ok(result.assessment.findings.some((finding) => finding.code === "partial_collection" || finding.code === "insufficient_collectors"));
  assert.ok(result.assessment.completeness < 1);
  assert.ok(events[0] === PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_STARTED);
  assert.ok(events.includes(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_PROFILE_CREATED));
  assert.ok(events.includes(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_COMPLETED));
  assert.ok(events.includes(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_COMPLETED));
  assert.ok(engine.getStats().projectsAnalyzed >= 1);
  assert.ok(engine.getStats().partialAnalyses >= 1 || engine.getStats().insufficientAnalyses >= 1);
});

test("persists, restores, migrates, falls back on corruption, and preserves snapshots", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "project-intelligence.json");
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const engine = new ProjectIntelligenceEngine({ repositoryPath: root, persistencePath, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });
  engine.analyzeProject("levi-project");

  assert.equal(engine.save().status, "PERSISTED");
  const restored = new ProjectIntelligenceEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.snapshot().profiles, engine.snapshot().profiles);

  const migrated = new ProjectIntelligenceEngine({
    persistencePath,
    migrations: [(snapshot) => ({ ...snapshot, stats: { ...(snapshot.stats || {}), migrated: true } })],
  });
  assert.equal(migrated.load().status, "LOADED");
  assert.equal(migrated.snapshot().stats.migrated, true);

  fs.writeFileSync(persistencePath, "{not json", "utf8");
  const corrupt = new ProjectIntelligenceEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");
  assert.equal(corrupt.snapshot().profiles.length, 0);
});

test("remains compatible with LI-001 through LI-006 and AE-001 through AE-007 surfaces", () => {
  const root = createFixtureRepository();
  const { graph, index, code, planning, context, learning } = buildEngines(root);
  const project = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context, learningEngine: learning });
  const result = project.analyzeProject("levi-project");
  const session = new ExecutionSession({ sessionId: "ae-project", objective: "Compatibility" });
  const approval = new ApprovalGateway();
  const continuation = new ContinueEngine();
  const execution = new ExecutionEngine({ executeNextTask: () => ({ status: "ok" }), validateResults: () => ({ passed: true }) });
  const completion = new ObjectiveCompletionEngine();

  assert.ok(graph.snapshot().nodes.length > 0);
  assert.ok(index.search("Levi", { limit: 5 }).length > 0);
  assert.ok(code.listEntities({ type: CODE_ENTITY_TYPES.FUNCTION }).length > 0);
  assert.ok(planning.listPlans().length > 0);
  assert.ok(context.snapshot().packages.length > 0);
  assert.ok(learning.snapshot().records.length >= 0);
  assert.equal(session.snapshot().sessionId, "ae-project");
  assert.equal(typeof approval.evaluate, "function");
  assert.equal(typeof continuation.shouldContinue, "function");
  assert.equal(typeof execution.run, "function");
  assert.equal(typeof completion.evaluate, "function");
  assert.ok(result.assessment.scores.overallHealth.value >= 0);
});

function collectEvents(engine) {
  const events = [];
  engine.on(PROJECT_INTELLIGENCE_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function buildEngines(root) {
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const index = new OfflineKnowledgeIndex({ repositoryPath: root });
  index.build(root, { repositoryGraph: graph });
  const code = new CodeUnderstandingEngine({ repositoryPath: root });
  code.analyzeRepository(root);
  const planning = new PlanningIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index });
  const plan = planning.createPlan("Implement project intelligence release readiness", {
    paths: ["src/app.js"],
    symbols: ["run"],
    acceptanceCriteria: ["Validated feature is complete"],
  });
  planning.updateTask(plan.id, plan.tasks[0].id, { status: TASK_STATUSES.COMPLETED });
  planning.updateTask(plan.id, plan.tasks[1].id, { status: TASK_STATUSES.READY });
  planning.updateTask(plan.id, plan.tasks[2].id, { status: TASK_STATUSES.BLOCKED });
  const context = new ContextIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, planningEngine: planning });
  context.assemble({
    purpose: CONTEXT_PURPOSES.CODE_UNDERSTANDING,
    objective: "Understand project intelligence",
    paths: ["src/app.js"],
    symbols: ["run"],
  });
  const learning = new CrossSessionLearningEngine({ repositoryPath: root, repositoryGraph: graph });
  return { graph, index, code, planning, context, learning };
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-project-intelligence-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "pages"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "levi-fixture",
    description: "Offline-first autonomous AI platform and VS Code extension.",
    version: "0.5.0",
    bin: { levi: "bin/levi.js" },
    engines: { vscode: "^1.90.0" },
    scripts: { test: "node --test", build: "node --check src/app.js" },
    dependencies: { express: "4.18.0", "left-pad": "1.3.0" },
    devDependencies: { "@types/vscode": "1.90.0", react: "18.0.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "README.md"), [
    "# Levi Fixture",
    "Purpose: provide offline autonomous project intelligence for developers.",
    "Objective: make release readiness visible with evidence.",
    "Users: developers and AI agents.",
    "The platform must remain offline by default.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "ARCHITECTURE.md"), [
    "# Architecture",
    "Layered architecture with repository, code understanding, planning, context, and project intelligence.",
    "Release requires validation evidence.",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "pages", "index.js"), "export default function Home() { return null; }\n");
  fs.writeFileSync(path.join(root, "src", "util.js"), [
    "function helper() { return 1; }",
    "function unusedLocal() { return 2; }",
    "module.exports = { helper };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "src", "app.js"), [
    "const express = require('express');",
    "const { helper } = require('./util');",
    "function handler() { return run(); }",
    "function run() { missingRuntime(); return helper(); }",
    "const app = express();",
    "app.get('/health', handler);",
    "module.exports = { run };",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(root, "test", "app.test.js"), [
    "const { run } = require('../src/app');",
    "run();",
    "",
  ].join("\n"));
  return root;
}

function decision(id, statement) {
  return {
    id,
    type: "approved-decision",
    confidenceState: "APPROVED",
    value: { statement, evidence: [{ source: "ARCHITECTURE.md", signal: "approved decision" }] },
    source: { kind: "project-decision", source: "ARCHITECTURE.md", signal: "decision" },
  };
}
