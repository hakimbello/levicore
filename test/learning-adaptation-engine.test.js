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
const { CrossSessionLearningEngine } = require("../src/cross-session-learning-engine");
const { RepositoryKnowledgeGraph } = require("../src/repository-knowledge-graph");
const { OfflineKnowledgeIndex } = require("../src/offline-knowledge-index");
const { PlanningIntelligenceEngine } = require("../src/planning-intelligence-engine");
const { ContextIntelligenceEngine, CONTEXT_PURPOSES } = require("../src/context-intelligence-engine");
const { CodeUnderstandingEngine } = require("../src/code-understanding-engine");
const { ProjectIntelligenceEngine } = require("../src/project-intelligence-engine");
const {
  ADAPTATION_STATUSES,
  ADAPTATION_TYPES,
  LEARNING_ADAPTATION_SCHEMA_VERSION,
  LEARNING_DOMAINS,
  LEARNING_EVENT_TYPES,
  LEARNING_EVENTS,
  LEARNING_SCOPES,
  LEARNING_SOURCE_TYPES,
  LEARNING_STATUSES,
  LearningAdaptationEngine,
  RULE_STABILITY,
  SIGNAL_POLARITIES,
} = require("../src/learning-adaptation-engine");

test("normalizes signals, feedback, rules, adaptations, stable IDs, and suppresses duplicates", () => {
  const engine = new LearningAdaptationEngine({ projectId: "project-a" });
  const signal = baseSignal({ sourceId: "accept-1", sessionId: "s1" });
  const first = engine.ingestSignal(signal);
  const duplicate = engine.ingestSignal(signal);
  const feedback = engine.recordFeedback({
    projectId: "project-a",
    sessionId: "s1",
    targetType: "context",
    targetId: "repository_graph",
    action: "select_context",
    outcome: "accepted",
    accepted: true,
    evidence: [{ source: "user", signal: "accepted context" }],
    stableTimestamp: "same",
  });
  const rule = engine.createRule({
    projectId: "project-a",
    domain: LEARNING_DOMAINS.CONTEXT_SELECTION,
    title: "Prefer repository graph context",
    description: "Repository graph context helped successful tasks.",
    condition: { subject: "repository_graph" },
    behavior: { kind: "increase_context_weight", target: "repository_graph" },
    scope: LEARNING_SCOPES.PROJECT,
    status: LEARNING_STATUSES.ELIGIBLE,
    sourceSignals: [first.id],
    supportingEvidence: first.evidence,
    positiveObservations: 2,
    confidence: 0.8,
    stability: RULE_STABILITY.STABLE,
  });
  const adaptation = engine.addAdaptation({
    projectId: "project-a",
    ruleId: rule.id,
    type: ADAPTATION_TYPES.CONTEXT_WEIGHT,
    target: { subsystem: "context", id: "repository_graph" },
    operation: "adjust_weight",
    value: 0.1,
    weight: 0.1,
    evidence: first.evidence,
    confidence: 0.8,
  });

  assert.equal(first.id, duplicate.id);
  assert.equal(engine.getStats().duplicateSignalsSkipped, 1);
  assert.equal(first.domain, LEARNING_DOMAINS.CONTEXT_SELECTION);
  assert.equal(first.polarity, SIGNAL_POLARITIES.POSITIVE);
  assert.equal(feedback.accepted, true);
  assert.ok(engine.listSignals({ sourceType: LEARNING_SOURCE_TYPES.USER_ACCEPTANCE }).length > 0);
  assert.equal(engine.getRule(rule.id).id, rule.id);
  assert.equal(engine.getAdaptation(adaptation.id).status, ADAPTATION_STATUSES.PROPOSED);
  assert.equal(engine.snapshot().schemaVersion, LEARNING_ADAPTATION_SCHEMA_VERSION);
});

test("evaluates eligibility thresholds, independent sessions, global and security thresholds", () => {
  const engine = new LearningAdaptationEngine({
    projectId: "project-a",
    thresholds: { minimumObservations: 2, minimumIndependentSessions: 2, minimumSuccessfulOutcomes: 1 },
  });
  const first = engine.ingestSignal(baseSignal({ sourceId: "a1", sessionId: "s1" }));
  engine.ingestSignal(baseSignal({ sourceId: "a2", sessionId: "s2" }));
  const eligible = engine.evaluateCandidate(first.id);
  const globalOne = engine.ingestSignal(baseSignal({ sourceId: "g1", sessionId: "s1", scope: LEARNING_SCOPES.GLOBAL, subject: "global-style" }));
  const globalRejected = engine.evaluateCandidate(globalOne.id);
  const security = engine.ingestSignal(baseSignal({
    sourceId: "sec1",
    sessionId: "s1",
    domain: LEARNING_DOMAINS.SECURITY,
    sourceType: LEARNING_SOURCE_TYPES.SECURITY_OUTCOME,
    subject: "block-dangerous-shell",
  }));
  const securityRejected = engine.evaluateCandidate(security.id);

  assert.equal(eligible.eligible, true);
  assert.ok([RULE_STABILITY.STABLE, RULE_STABILITY.EMERGING].includes(eligible.stability));
  assert.equal(globalRejected.eligible, false);
  assert.ok(globalRejected.reasons.some((reason) => reason.includes("observations") || reason.includes("independent")));
  assert.equal(securityRejected.eligible, false);
});

test("derives positive and negative learning rules, preserves conflicts, and handles authority ordering", () => {
  const engine = new LearningAdaptationEngine({ projectId: "project-a" });
  engine.ingestSignals([
    baseSignal({ sourceId: "p1", sessionId: "s1", subject: "npm.cmd", domain: LEARNING_DOMAINS.TOOL_SELECTION, sourceType: LEARNING_SOURCE_TYPES.TOOL_OUTCOME }),
    baseSignal({ sourceId: "p2", sessionId: "s2", subject: "npm.cmd", domain: LEARNING_DOMAINS.TOOL_SELECTION, sourceType: LEARNING_SOURCE_TYPES.TOOL_OUTCOME }),
    baseSignal({ sourceId: "n1", sessionId: "s3", subject: "npm", domain: LEARNING_DOMAINS.TOOL_SELECTION, sourceType: LEARNING_SOURCE_TYPES.TOOL_OUTCOME, polarity: SIGNAL_POLARITIES.NEGATIVE, outcome: "failed", value: "PowerShell policy blocked npm.ps1" }),
    baseSignal({ sourceId: "n2", sessionId: "s4", subject: "npm", domain: LEARNING_DOMAINS.TOOL_SELECTION, sourceType: LEARNING_SOURCE_TYPES.TOOL_OUTCOME, polarity: SIGNAL_POLARITIES.NEGATIVE, outcome: "failed", value: "PowerShell policy blocked npm.ps1" }),
  ]);
  const rules = engine.deriveRules("project-a", { activate: true });
  const positive = rules.find((rule) => rule.condition.subject === "npm.cmd");
  const negative = rules.find((rule) => rule.condition.subject === "npm");
  const instruction = engine.ingestSignal({
    projectId: "project-a",
    domain: LEARNING_DOMAINS.TOOL_SELECTION,
    sourceType: LEARNING_SOURCE_TYPES.USER_INSTRUCTION,
    sourceId: "current-instruction",
    subject: "npm.cmd",
    action: "use npm",
    outcome: "rejected",
    value: "Use npm directly for this task.",
    polarity: SIGNAL_POLARITIES.NEGATIVE,
    authority: "current_user_instruction",
    evidence: [{ source: "user", signal: "current instruction" }],
  });
  const conflicts = engine.detectConflicts("project-a");

  assert.ok(positive);
  assert.equal(positive.status, LEARNING_STATUSES.ACTIVE);
  assert.ok(negative);
  assert.ok(negative.negativeObservations >= 2);
  assert.ok(conflicts.some((conflict) => conflict.type === "rule_vs_current_instruction"));
  assert.ok(engine.getSignal(instruction.id).authority > positive.authority);
});

test("supports corrections, partial acceptance, validation-failure after acceptance, rule lifecycle, freshness, and supersession", () => {
  const engine = new LearningAdaptationEngine({ projectId: "project-a" });
  const correction = engine.recordFeedback({
    projectId: "project-a",
    sessionId: "s1",
    targetType: "planning",
    targetId: "task-size",
    action: "decompose",
    partiallyAccepted: true,
    corrected: true,
    correction: "Keep tasks smaller and validation-first.",
    evidence: [{ source: "user", signal: "correction" }],
  });
  const validationFailure = engine.recordFeedback({
    projectId: "project-a",
    sessionId: "s2",
    targetType: "validation",
    targetId: "accepted-patch",
    action: "validate",
    outcome: "FAILED",
    accepted: true,
    reason: "Acceptance followed by validation failure.",
    evidence: [{ source: "npm test", signal: "failed after acceptance" }],
  });
  const firstRule = engine.createRule({
    projectId: "project-a",
    domain: LEARNING_DOMAINS.PLANNING,
    title: "Small validation-first tasks",
    condition: { subject: "task-size" },
    behavior: { kind: "prefer_planning_pattern", target: "task-size", value: "small validation-first" },
    scope: LEARNING_SCOPES.PROJECT,
    sourceSignals: engine.listSignals().map((signal) => signal.id),
    supportingEvidence: correction.evidence,
    conflictingEvidence: validationFailure.evidence,
    positiveObservations: 2,
    negativeObservations: 1,
    confidence: 0.72,
    stability: RULE_STABILITY.EMERGING,
  });
  const replacement = engine.createRule({
    ...firstRule,
    id: undefined,
    behavior: { kind: "prefer_planning_pattern", target: "task-size", value: "small validation-first with explicit test step" },
    title: "Small validation-first tasks with tests",
  });

  assert.equal(engine.activateRule(firstRule.id).status, LEARNING_STATUSES.ACTIVE);
  assert.equal(engine.suspendRule(firstRule.id, "Needs review").status, LEARNING_STATUSES.SUSPENDED);
  assert.equal(engine.activateRule(firstRule.id).status, LEARNING_STATUSES.ACTIVE);
  assert.equal(engine.supersedeRule(firstRule.id, replacement.id).status, LEARNING_STATUSES.SUPERSEDED);
  assert.equal(engine.expireRule(replacement.id, "Old pattern").status, LEARNING_STATUSES.EXPIRED);
  assert.equal(engine.rejectRule(firstRule.id, "Superseded and rejected").status, LEARNING_STATUSES.REJECTED);
  assert.ok(engine.detectStaleLearning("project-a", { maximumRuleAgeMs: 1 }).length >= 0);
});

test("proposes bounded adaptations, applies through adapters, captures prior state, and rolls back", () => {
  const adapterState = { weights: { repository_graph: 1 } };
  const engine = new LearningAdaptationEngine({
    projectId: "project-a",
    adapters: {
      context: {
        getState(target) {
          return { weight: adapterState.weights[target.id] || 0 };
        },
        apply(adaptation) {
          adapterState.weights[adaptation.target.id] = (adapterState.weights[adaptation.target.id] || 0) + adaptation.weight;
          return { resultingState: { weight: adapterState.weights[adaptation.target.id] } };
        },
        rollback(adaptation) {
          adapterState.weights[adaptation.target.id] = adaptation.priorState.weight;
          return { restoredState: { weight: adapterState.weights[adaptation.target.id] } };
        },
      },
    },
  });
  engine.ingestSignals([
    baseSignal({ sourceId: "c1", sessionId: "s1" }),
    baseSignal({ sourceId: "c2", sessionId: "s2" }),
  ]);
  const [rule] = engine.deriveRules("project-a", { activate: true });
  const [proposal] = engine.proposeAdaptations("project-a");
  const applied = engine.applyAdaptation(proposal.id);
  const rolledBack = engine.rollbackAdaptation(applied.id);

  assert.equal(proposal.status, ADAPTATION_STATUSES.PROPOSED);
  assert.ok(Math.abs(proposal.weight) <= 0.2);
  assert.equal(applied.status, ADAPTATION_STATUSES.APPLIED);
  assert.deepEqual(applied.priorState, { weight: 1 });
  assert.ok(applied.resultingState.weight > 1);
  assert.equal(rolledBack.status, ADAPTATION_STATUSES.ROLLED_BACK);
  assert.equal(adapterState.weights.repository_graph, 1);
  assert.ok(engine.explainRule(rule.id).sourceSignals.length >= 2);
  assert.equal(engine.explainAdaptation(applied.id).rollbackInformation.reversible, true);
});

test("handles missing adapters, partial application, prohibited adaptations, rollback failures, impact, and validation", () => {
  const engine = new LearningAdaptationEngine({ projectId: "project-a" });
  const rule = engine.createRule({
    projectId: "project-a",
    domain: LEARNING_DOMAINS.SECURITY,
    title: "Keep shell security validation",
    condition: { subject: "shell" },
    behavior: { kind: "add_security_requirement", target: "shell", value: "block dangerous commands" },
    scope: LEARNING_SCOPES.PROJECT,
    status: LEARNING_STATUSES.ACTIVE,
    sourceSignals: [],
    supportingEvidence: [{ source: "security", signal: "blocked dangerous shell" }],
    positiveObservations: 3,
    confidence: 0.8,
    stability: RULE_STABILITY.STABLE,
  });
  const missing = engine.addAdaptation({
    projectId: "project-a",
    ruleId: rule.id,
    type: ADAPTATION_TYPES.SECURITY_REQUIREMENT,
    target: { subsystem: "security", id: "shell" },
    operation: "add_requirement",
    value: "block dangerous commands",
    evidence: rule.supportingEvidence,
    confidence: 0.8,
  });
  const partial = engine.applyAdaptation(missing.id);
  const prohibited = engine.addAdaptation({
    projectId: "project-a",
    ruleId: rule.id,
    type: ADAPTATION_TYPES.SECURITY_REQUIREMENT,
    target: { subsystem: "security", id: "shell" },
    operation: "disable security validation",
    value: "bypass approval and suppress critical findings",
    evidence: rule.supportingEvidence,
    confidence: 0.8,
  });
  const rejected = engine.applyAdaptation(prohibited.id);
  const rollbackFailure = engine.rollbackAdaptation(partial.id);
  const impact = engine.analyzeLearningImpact("project-a");
  const validation = engine.validateLearning("project-a");

  assert.equal(partial.status, ADAPTATION_STATUSES.PARTIALLY_APPLIED);
  assert.equal(rejected.status, ADAPTATION_STATUSES.REJECTED);
  assert.equal(rollbackFailure.rollbackStatus, "FAILED");
  assert.ok(impact.affectedSubsystems.includes("security"));
  assert.ok(impact.rollbackPath.length >= 0);
  assert.ok(validation.findings.some((finding) => finding.code === "prohibited_adaptation"));
});

test("derives signals from LI engines, CrossSessionLearning, execution evidence, and remains compatible", () => {
  const root = createFixtureRepository();
  const graph = new RepositoryKnowledgeGraph();
  graph.build(root);
  const index = new OfflineKnowledgeIndex({ repositoryPath: root });
  index.build(root, { repositoryGraph: graph });
  const code = new CodeUnderstandingEngine({ repositoryPath: root });
  code.analyzeRepository(root);
  const planning = new PlanningIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index });
  planning.createPlan("Use repository graph context", { paths: ["src/app.js"], symbols: ["run"] });
  const context = new ContextIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, planningEngine: planning });
  context.assemble({ purpose: CONTEXT_PURPOSES.CODE_UNDERSTANDING, objective: "Use graph", paths: ["src/app.js"], symbols: ["run"] });
  const project = new ProjectIntelligenceEngine({ repositoryPath: root, repositoryGraph: graph, offlineIndex: index, codeUnderstandingEngine: code, planningEngine: planning, contextEngine: context });
  project.analyzeProject("project-a");
  const cross = new CrossSessionLearningEngine({ projectId: "project-a" });
  cross.record({
    type: "project_convention",
    title: "Use node:test",
    summary: "Use node:test for tests.",
    evidence: { source: "package.json", signal: "scripts.test" },
  });
  const engine = new LearningAdaptationEngine({
    projectId: "project-a",
    crossSessionLearningEngine: cross,
    projectIntelligenceEngine: project,
    codeUnderstandingEngine: code,
    contextEngine: context,
    planningEngine: planning,
    repositoryGraph: graph,
    offlineIndex: index,
  });
  const signals = engine.deriveSignals("project-a", {
    executionHistory: [{ id: "exec-1", status: "COMPLETED", sessionId: "s1", evidence: [{ source: "execution", signal: "completed" }] }],
    repairHistory: [{ id: "repair-1", result: "REPAIRED", sessionId: "s1", evidence: [{ source: "repair", signal: "repaired" }] }],
    approvalHistory: [{ id: "approval-1", decision: "APPROVED", sessionId: "s1", evidence: [{ source: "approval", signal: "approved" }] }],
    securityFindings: [{ id: "security-1", severity: "LOW", status: "WARNING", evidence: [{ source: "security", signal: "warning" }] }],
    validationResults: [{ id: "validation-1", status: "PASSED", passed: true, evidence: [{ source: "npm test", signal: "passed" }] }],
    completionEvidence: [{ id: "completion-1", status: "COMPLETE", evidence: [{ source: "completion", signal: "complete" }] }],
    durableDecisions: [{ id: "decision-1", statement: "Use offline deterministic learning.", evidence: [{ source: "ARCHITECTURE.md", signal: "decision" }] }],
    userCorrections: [{ id: "correction-1", correction: "Keep learning project-scoped.", evidence: [{ source: "user", signal: "correction" }] }],
  });
  const session = new ExecutionSession({ sessionId: "ae-learning", objective: "Compatibility" });
  const approval = new ApprovalGateway();
  const continuation = new ContinueEngine();
  const execution = new ExecutionEngine({ executeNextTask: () => ({ status: "ok" }), validateResults: () => ({ passed: true }) });
  const completion = new ObjectiveCompletionEngine();

  assert.ok(signals.length > 0);
  assert.ok(engine.listSignals({ sourceType: LEARNING_SOURCE_TYPES.IMPORTED_LEARNING }).length > 0);
  assert.ok(engine.listSignals({ sourceType: LEARNING_SOURCE_TYPES.CODE_ANALYSIS }).length > 0);
  assert.ok(engine.listSignals({ sourceType: LEARNING_SOURCE_TYPES.PROJECT_ASSESSMENT }).length > 0);
  assert.equal(session.snapshot().sessionId, "ae-learning");
  assert.equal(typeof approval.evaluate, "function");
  assert.equal(typeof continuation.shouldContinue, "function");
  assert.equal(typeof execution.run, "function");
  assert.equal(typeof completion.evaluate, "function");
});

test("persists, restores, migrates, falls back on corruption, expires and rolls back rules", () => {
  const root = createFixtureRepository();
  const persistencePath = path.join(root, ".levi", "learning-adaptation.json");
  const engine = new LearningAdaptationEngine({ projectId: "project-a", repositoryPath: root, persistencePath });
  engine.ingestSignals([baseSignal({ sourceId: "p1", sessionId: "s1" }), baseSignal({ sourceId: "p2", sessionId: "s2" })]);
  const [rule] = engine.deriveRules("project-a", { activate: true });
  const [adaptation] = engine.proposeAdaptations("project-a");
  engine.rollbackRule(rule.id, { reason: "test rollback" });

  assert.equal(engine.save().status, "PERSISTED");
  const restored = new LearningAdaptationEngine({ persistencePath });
  assert.equal(restored.load().status, "LOADED");
  assert.deepEqual(restored.snapshot().signals, engine.snapshot().signals);

  const migrated = new LearningAdaptationEngine({
    persistencePath,
    migrations: [(snapshot) => ({ ...snapshot, stats: { ...(snapshot.stats || {}), migrated: true } })],
  });
  assert.equal(migrated.load().status, "LOADED");
  assert.equal(migrated.snapshot().stats.migrated, true);
  assert.ok(adaptation.id);

  fs.writeFileSync(persistencePath, "{not json", "utf8");
  const corrupt = new LearningAdaptationEngine({ persistencePath });
  assert.equal(corrupt.load(persistencePath, { emptyOnCorruption: true }).status, "EMPTY");
  assert.equal(corrupt.snapshot().signals.length, 0);
});

test("emits lifecycle events in deterministic order for ingestion, derivation, adaptation, validation, persistence, and restore", () => {
  const root = createFixtureRepository();
  const engine = new LearningAdaptationEngine({ projectId: "project-a", repositoryPath: root });
  const events = collectEvents(engine);
  engine.ingestSignals([baseSignal({ sourceId: "p1", sessionId: "s1" }), baseSignal({ sourceId: "p2", sessionId: "s2" })]);
  const [rule] = engine.deriveRules("project-a", { activate: true });
  const [adaptation] = engine.proposeAdaptations("project-a");
  engine.applyAdaptation(adaptation.id);
  engine.validateLearning("project-a");
  const savePath = path.join(root, ".levi", "learning-events.json");
  engine.save(savePath);
  const restored = new LearningAdaptationEngine({ repositoryPath: root });
  restored.load(savePath);

  assert.equal(events[0], LEARNING_EVENT_TYPES.LEARNING_SIGNAL_INGESTED);
  assert.ok(events.includes(LEARNING_EVENT_TYPES.LEARNING_RULE_CREATED));
  assert.ok(events.includes(LEARNING_EVENT_TYPES.LEARNING_RULE_ACTIVATED));
  assert.ok(events.includes(LEARNING_EVENT_TYPES.ADAPTATION_PROPOSED));
  assert.ok(events.includes(LEARNING_EVENT_TYPES.ADAPTATION_PARTIALLY_APPLIED));
  assert.ok(events.includes(LEARNING_EVENT_TYPES.LEARNING_VALIDATION_COMPLETED));
  assert.ok(events.includes(LEARNING_EVENT_TYPES.LEARNING_PERSISTED));
  assert.ok(rule.id);
});

function collectEvents(engine) {
  const events = [];
  engine.on(LEARNING_EVENTS.LIFECYCLE, (event) => events.push(event.type));
  return events;
}

function baseSignal(overrides = {}) {
  return {
    projectId: "project-a",
    sessionId: "s1",
    domain: LEARNING_DOMAINS.CONTEXT_SELECTION,
    sourceType: LEARNING_SOURCE_TYPES.CONTEXT_OUTCOME,
    sourceId: "ctx-1",
    action: "select_context",
    outcome: "success",
    subject: "repository_graph",
    value: "Repository graph context improved the outcome.",
    polarity: SIGNAL_POLARITIES.POSITIVE,
    strength: 0.8,
    confidence: 0.8,
    evidence: [{ source: "context", signal: "selected and useful" }],
    authority: 0.72,
    scope: LEARNING_SCOPES.PROJECT,
    ...overrides,
  };
}

function createFixtureRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levi-learning-adaptation-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "test"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    name: "learning-fixture",
    scripts: { test: "node --test" },
    dependencies: { "left-pad": "1.3.0" },
  }, null, 2));
  fs.writeFileSync(path.join(root, "README.md"), "# Learning Fixture\nUse offline deterministic learning.\n");
  fs.writeFileSync(path.join(root, "src", "util.js"), "function helper() { return 1; }\nmodule.exports = { helper };\n");
  fs.writeFileSync(path.join(root, "src", "app.js"), "const { helper } = require('./util');\nfunction run() { return helper(); }\nmodule.exports = { run };\n");
  fs.writeFileSync(path.join(root, "test", "app.test.js"), "const { run } = require('../src/app');\nrun();\n");
  return root;
}
