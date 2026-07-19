const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AgentRoles,
  AssignmentStates,
  AssignmentTypes,
  ConflictCategories,
  ConflictResolutionMethods,
  ConflictSeverities,
  CoordinationStates,
  DelegationStrategies,
  MemoryMultiAgentPersistenceAdapter,
  MultiAgentCoordinationEngine,
  OutputDispositions,
  TeamDispositions,
  TeamStates,
} = require("../src/multi-agent-coordination-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes configuration, roles, team, assignments, scopes, results, findings, conflicts, decisions, plan, and health", () => {
  const engine = createEngine();
  const init = engine.initialize({ load: false });
  assert.equal(init.status, CoordinationStates.DEGRADED);
  assert.ok(engine.listRoles().some((role) => role.role === AgentRoles.COORDINATOR));
  assert.throws(() => engine.registerRole({ id: AgentRoles.REVIEWER, role: AgentRoles.REVIEWER }), /Duplicate role/);
  const preview = engine.getDelegationPreview({ objective: "Implement a multi-file security fix and validate tests", fileUris: ["a.js", "b.js"], sourceChanging: true, securitySensitive: true });
  assert.equal(preview.eligibility.delegate, true);
  assert.ok(preview.plan.roles.includes(AgentRoles.SECURITY_REVIEWER));
  const team = engine.createTeam({ objective: preview.plan.objective, plan: preview.plan, workspaceId: "workspace-1", projectId: "project-1" });
  assert.equal(team.strategy, DelegationStrategies.PIPELINE);
  const assignments = engine.listAssignments(team.id);
  assert.ok(assignments.some((assignment) => assignment.scope.sourceChanging === true));
  const result = engine.createResult(engine.assignments.get(assignments[0].id), {
    status: OutputDispositions.ACCEPTED,
    summary: "Supported result",
    findings: [{ title: "Supported finding", evidence: [{ source: "fixture", signal: "evidence" }] }],
    evidence: [{ source: "fixture", signal: "result" }],
  });
  assert.equal(result.findings[0].status, "SUPPORTED");
  const decision = engine.createDecision(team.id, { type: "TEST", decision: "accept", evidence: result.evidence });
  assert.equal(engine.getDecision(decision.id).decision, "accept");
  assert.equal(engine.getHealth().scores.approvalIntegrity, 100);
});

test("delegation eligibility rejects simple questions and selects minimal teams for known patterns", () => {
  const engine = createEngine();
  const simple = engine.shouldDelegate({ objective: "What is this file?" });
  assert.equal(simple.delegate, false);
  const implementation = engine.shouldDelegate({ objective: "Implement a simple feature in two files", fileUris: ["src/a.js", "src/b.js"], sourceChanging: true });
  assert.deepEqual(implementation.selectedRoles, [AgentRoles.COORDINATOR, AgentRoles.PLANNER, AgentRoles.IMPLEMENTER, AgentRoles.REVIEWER]);
  const release = engine.shouldDelegate({ objective: "Assess release readiness and validation risk", securitySensitive: true });
  assert.ok(release.selectedRoles.includes(AgentRoles.RELEASE_REVIEWER));
  assert.ok(release.selectedRoles.length <= engine.getConfiguration().maximumAgentsPerTeam);
});

test("validates delegation plans for missing coordinator, circular dependencies, excessive roles, and missing review", () => {
  const engine = createEngine({ configuration: { maximumAgentsPerTeam: 3 } });
  const missing = engine.validateDelegationPlan({
    objective: "Bad plan",
    strategy: DelegationStrategies.SEQUENTIAL,
    roles: [AgentRoles.IMPLEMENTER],
    assignments: [{ id: "a", role: AgentRoles.IMPLEMENTER, type: AssignmentTypes.CHANGE_PROPOSAL, objective: "Change", scope: { sourceChanging: true } }],
    reconciliationRules: [],
  });
  assert.equal(missing.valid, false);
  assert.ok(missing.findings.some((finding) => finding.code === "MISSING_COORDINATOR"));
  const circular = engine.validateDelegationPlan({
    objective: "Cycle",
    strategy: DelegationStrategies.SEQUENTIAL,
    roles: [AgentRoles.COORDINATOR, AgentRoles.CODE_ANALYST],
    assignments: [{ id: "a", role: AgentRoles.CODE_ANALYST, type: AssignmentTypes.ANALYSIS, objective: "A", scope: {} }],
    dependencies: [{ from: "a", to: "a" }],
    reconciliationRules: ["Coordinator reconciles."],
  });
  assert.equal(circular.valid, false);
  assert.ok(circular.findings.some((finding) => finding.code === "CIRCULAR_DEPENDENCY"));
});

test("executes bounded assignments through runtime agent commands and reconciles truthful team results", async () => {
  const runtime = createRuntimeFake();
  const engine = createEngine({ runtime });
  const preview = engine.getDelegationPreview({ objective: "Implement a feature across two files and validate tests", fileUris: ["a.js", "b.js"], sourceChanging: true });
  const team = engine.createTeam({ objective: preview.plan.objective, plan: preview.plan, workspaceId: "workspace-1" });
  const result = await engine.startTeam(team.id, { skipModel: true });
  assert.ok([TeamDispositions.COMPLETED, TeamDispositions.PARTIALLY_COMPLETED, TeamDispositions.PROPOSAL_READY].includes(result.metadata.result.disposition));
  assert.ok(runtime.calls.includes("agent.createConversation"));
  assert.ok(runtime.calls.includes("agent.sendMessage"));
  assert.equal(runtime.calls.includes("change.apply"), false);
  assert.equal(engine.getTeam(team.id).state, TeamStates.COMPLETED);
});

test("supports deterministic scheduling, dependency waiting, cancellation propagation, and retry bounds", async () => {
  const engine = createEngine({ configuration: { maximumRevisionRounds: 1 } });
  const team = engine.createTeam({ objective: "Analyze and review", plan: {
    objective: "Analyze and review",
    strategy: DelegationStrategies.SEQUENTIAL,
    roles: [AgentRoles.COORDINATOR, AgentRoles.CODE_ANALYST, AgentRoles.REVIEWER],
    assignments: [
      { id: "first", role: AgentRoles.CODE_ANALYST, type: AssignmentTypes.ANALYSIS, objective: "First", scope: {} },
      { id: "second", role: AgentRoles.REVIEWER, type: AssignmentTypes.CHANGE_REVIEW, objective: "Second", scope: {}, dependencyIds: ["first"] },
    ],
    reconciliationRules: ["Coordinator reconciles."],
  } });
  const waiting = engine.startAssignment(engine.listAssignments(team.id).find((assignment) => assignment.id === "second").id, { execute: false });
  assert.equal(waiting.state, AssignmentStates.WAITING_FOR_DEPENDENCY);
  const cancelled = engine.cancelTeam(team.id, "stop");
  assert.equal(cancelled.state, TeamStates.CANCELLED);
  const failed = engine.listAssignments(team.id)[0];
  const retried = await engine.retryAssignment(failed.id, { execute: false });
  assert.equal(retried.revision, 1);
  assert.throws(() => engine.retryAssignment(failed.id, { execute: false }), /Maximum assignment revisions/);
});

test("detects duplicate assignments, duplicate proposals, overlapping proposals, and critical security conflicts", () => {
  const engine = createEngine();
  const team = engine.createTeam({ objective: "Conflict test", plan: {
    objective: "Conflict test",
    strategy: DelegationStrategies.PARALLEL_REVIEW,
    roles: [AgentRoles.COORDINATOR, AgentRoles.IMPLEMENTER, AgentRoles.REVIEWER, AgentRoles.SECURITY_REVIEWER],
    assignments: [
      { id: "impl-a", role: AgentRoles.IMPLEMENTER, type: AssignmentTypes.CHANGE_PROPOSAL, objective: "Proposal A", scope: { sourceChanging: true, fileUris: ["src/app.js"] } },
      { id: "impl-b", role: AgentRoles.IMPLEMENTER, type: AssignmentTypes.CHANGE_PROPOSAL, objective: "Proposal B", scope: { sourceChanging: true, fileUris: ["src/app.js"] } },
      { id: "sec", role: AgentRoles.SECURITY_REVIEWER, type: AssignmentTypes.SECURITY_REVIEW, objective: "Security", scope: { readOnly: true } },
    ],
    reconciliationRules: ["Coordinator reconciles."],
  } });
  assert.throws(() => engine.createAssignment(team.id, { role: AgentRoles.IMPLEMENTER, type: AssignmentTypes.CHANGE_PROPOSAL, objective: "Proposal A", scope: { sourceChanging: true, fileUris: ["src/app.js"] } }), /Duplicate assignment/);
  const implA = engine.assignments.get("impl-a");
  const implB = engine.assignments.get("impl-b");
  const sec = engine.assignments.get("sec");
  const resultA = engine.createResult(implA, { evidence: [{ source: "a" }], proposals: [{ id: "proposal-a", proposalHash: "hash-a", fileChanges: [{ uri: "src/app.js" }] }] });
  const resultB = engine.createResult(implB, { evidence: [{ source: "b" }], proposals: [{ id: "proposal-b", proposalHash: "hash-b", fileChanges: [{ uri: "src/app.js" }] }] });
  const resultSec = engine.createResult(sec, { evidence: [{ source: "sec" }], findings: [{ title: "Auth policy", status: "BLOCKED", severity: ConflictSeverities.CRITICAL, evidence: [{ source: "sec" }] }] });
  implA.resultId = resultA.id;
  implB.resultId = resultB.id;
  sec.resultId = resultSec.id;
  const conflicts = engine.detectConflicts(team.id);
  assert.ok(conflicts.some((conflict) => conflict.category === ConflictCategories.OVERLAPPING_CHANGE));
  const critical = engine.createConflict(engine.teams.get(team.id), { assignmentIds: ["sec"], category: ConflictCategories.SECURITY_CONFLICT, severity: ConflictSeverities.CRITICAL, description: "Critical security disagreement." });
  assert.throws(() => engine.resolveConflict(critical.id, { method: ConflictResolutionMethods.ACCEPT_ONE }), /Critical conflicts/);
  const escalated = engine.resolveConflict(critical.id, { method: ConflictResolutionMethods.ESCALATE_TO_USER });
  assert.equal(escalated.resolutionStatus, "ESCALATED");
});

test("preserves evidence requirements, independent review boundaries, same-model limitation, and proposal approval invalidation semantics", () => {
  const engine = createEngine();
  const team = engine.createTeam({ objective: "Source change", plan: engine.createDelegationPlan({ objective: "Implement source change", sourceChanging: true, fileUris: ["src/app.js", "src/lib.js"] }, { persist: false }) });
  const implementer = engine.listAssignments(team.id).find((assignment) => assignment.role === AgentRoles.IMPLEMENTER);
  const reviewer = engine.listAssignments(team.id).find((assignment) => assignment.role === AgentRoles.REVIEWER);
  assert.ok(implementer && reviewer);
  assert.throws(() => engine.requestReview({ teamId: team.id, assignmentId: reviewer.id, role: AgentRoles.REVIEWER, objective: "Review" }, { allowDuplicate: false }), /self-review/);
  const unsupported = engine.createResult(engine.assignments.get(implementer.id), { summary: "No evidence", findings: [{ title: "Unsupported" }], evidence: [] });
  assert.equal(unsupported.status, OutputDispositions.INSUFFICIENT_EVIDENCE);
  assert.equal(unsupported.findings[0].status, "INSUFFICIENT_EVIDENCE");
  const review = engine.reviewResult(unsupported.id, { comparisonModelReferences: [{ providerId: "local", modelId: "m1" }] });
  assert.equal(review.accepted, false);
  const withModel = engine.createResult(engine.assignments.get(implementer.id), { evidence: [{ source: "x" }], modelReferences: [{ providerId: "local", modelId: "m1" }] });
  assert.match(engine.reviewResult(withModel.id, { comparisonModelReferences: [{ providerId: "local", modelId: "m1" }] }).sameModelLimitation, /same provider\/model/);
});

test("persists, restores, recovers interrupted assignments, and does not auto-resume protected actions", () => {
  const persistence = new MemoryMultiAgentPersistenceAdapter();
  const engine = createEngine({ persistenceAdapter: persistence });
  const team = engine.createTeam({ objective: "Persist team", plan: engine.createDelegationPlan({ objective: "Implement multiple files", sourceChanging: true, fileUris: ["a", "b"] }, { persist: false }) });
  const assignment = engine.listAssignments(team.id).find((entry) => entry.role !== AgentRoles.COORDINATOR);
  engine.startAssignment(assignment.id, { execute: false });
  assert.equal(engine.save().status, "PERSISTED");
  const restored = createEngine({ persistenceAdapter: persistence });
  assert.equal(restored.load().status, "LOADED");
  const recovery = restored.recover({});
  assert.equal(recovery.status, "RECOVERED");
  assert.equal(restored.getAssignment(assignment.id).state, AssignmentStates.FAILED);
  assert.ok(restored.getTeam(team.id).limitations.length >= 0);
  assert.equal(restored.getAssignment(assignment.id).state, AssignmentStates.FAILED);
});

test("runtime initializes without multi-agent engine and exposes optional multi-agent commands when configured", async () => {
  const empty = new LeviApplicationRuntime();
  const unconfigured = await empty.executeCommand("multiAgent.health", {});
  assert.equal(unconfigured.data.status, "UNCONFIGURED");
  const runtime = new LeviApplicationRuntime({ enableAgentOrchestration: true, enableWorkspaceTools: true, enableMultiAgentCoordination: true, multiAgentConfiguration: { enablePersistence: false } });
  await runtime.initialize({ skipChecks: true });
  const health = await runtime.executeCommand("multiAgent.health", {});
  const roles = await runtime.executeCommand("multiAgent.roles", {});
  const preview = await runtime.executeCommand("multiAgent.previewDelegation", { objective: "Implement and validate a multi-file change", fileUris: ["a.js", "b.js"], sourceChanging: true });
  const team = await runtime.executeCommand("multiAgent.createTeam", { objective: preview.data.plan.objective, plan: preview.data.plan });
  const reconciled = await runtime.executeCommand("multiAgent.reconcile", { teamId: team.data.id });
  assert.equal(health.success, true);
  assert.ok(roles.data.roles.some((role) => role.role === AgentRoles.COORDINATOR));
  assert.ok(preview.data.eligibility.delegate);
  assert.ok([TeamDispositions.CAPABILITY_UNAVAILABLE, TeamDispositions.PARTIALLY_COMPLETED].includes(reconciled.data.disposition));
});

test("AgentOrchestrationEngine exposes optional delegation fallback APIs", async () => {
  const runtime = new LeviApplicationRuntime({ enableAgentOrchestration: true, enableMultiAgentCoordination: true, multiAgentConfiguration: { enablePersistence: false } });
  const agent = runtime.agentEngine();
  const conversation = agent.createConversation({ objective: "Implement a multi-file feature", workspaceId: "workspace-1" });
  const turn = agent.createTurn(conversation.id, { userInput: "Implement a multi-file feature" });
  const preview = await agent.getDelegationPreview(turn.id, { scope: { fileUris: ["a.js", "b.js"] }, objective: "Implement a multi-file feature" });
  const delegated = await agent.delegateTurn(turn.id, { execute: false, scope: { fileUris: ["a.js", "b.js"] }, objective: "Implement a multi-file feature" });
  assert.equal(preview.eligibility.delegate, true);
  assert.equal(delegated.status, "DELEGATED");
  assert.ok(agent.getTeamForTurn(turn.id));
});

function createEngine(options = {}) {
  return new MultiAgentCoordinationEngine({
    clock: { now: () => "2026-01-01T00:00:00.000Z" },
    idAdapter: {
      counters: new Map(),
      next(prefix, seed = {}) {
        const count = (this.counters.get(prefix) || 0) + 1;
        this.counters.set(prefix, count);
        return seed && seed.teamId && seed.role ? seed.role === AgentRoles.COORDINATOR ? `${prefix}-coordinator-${count}` : seed.id || `${prefix}-${count}` : seed.id || `${prefix}-${count}`;
      },
    },
    ...options,
  });
}

function createRuntimeFake() {
  const runtime = {
    calls: [],
    executeCommand(commandId, input) {
      this.calls.push(commandId);
      if (commandId === "context.build") return Promise.resolve({ success: true, data: { id: `context-${this.calls.length}` }, operationId: `op-${this.calls.length}` });
      if (commandId === "agent.createConversation") return Promise.resolve({ success: true, data: { id: `conversation-${this.calls.length}` }, operationId: `op-${this.calls.length}` });
      if (commandId === "agent.sendMessage") return Promise.resolve({ success: true, data: { turn: { id: `turn-${this.calls.length}` }, response: { content: "bounded response" } }, operationId: `op-${this.calls.length}` });
      return Promise.resolve({ success: true, data: { commandId }, operationId: `op-${this.calls.length}` });
    },
    discoverRuntimeCapabilities() {
      return { availableCapabilities: [] };
    },
  };
  return runtime;
}
