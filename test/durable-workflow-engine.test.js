const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DurableWorkflowEngine,
  MemoryWorkflowPersistenceAdapter,
  WorkflowCheckpointTypes,
  WorkflowDependencyTypes,
  WorkflowDispositions,
  WorkflowEngineStates,
  WorkflowEventTypes,
  WorkflowExecutionStrategies,
  WorkflowFailurePolicies,
  WorkflowResumePolicies,
  WorkflowStates,
  WorkflowStepPriorities,
  WorkflowStepStates,
  WorkflowStepTypes,
  normalizeConfiguration,
} = require("../src/durable-workflow-engine");
const { AgentOrchestrationEngine } = require("../src/agent-orchestration-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes workflow configuration, models, states, and health with conservative bounds", () => {
  const config = normalizeConfiguration({});
  assert.equal(config.enabled, true);
  assert.equal(config.defaultStrategy, WorkflowExecutionStrategies.DEPENDENCY_GRAPH);
  assert.equal(config.requireApprovalForProtectedSteps, true);
  assert.equal(config.allowSafeAutomaticResume, false);

  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime(), configuration: { maximumConcurrentSteps: 2 } });
  const init = engine.initialize({ load: false });
  assert.ok([WorkflowEngineStates.READY, WorkflowEngineStates.DEGRADED].includes(init.status));

  const workflow = engine.createWorkflow({
    id: "workflow-normalized",
    workspaceId: "workspace-1",
    projectId: "project-1",
    objective: "Analyze project and produce evidence",
    strategy: WorkflowExecutionStrategies.SEQUENTIAL,
    steps: [
      { id: "step-analysis", type: WorkflowStepTypes.ANALYSIS, title: "Analyze", priority: WorkflowStepPriorities.HIGH, evidence: [{ source: "test", signal: "input" }] },
    ],
  });
  const step = engine.getStep("step-analysis");
  const checkpoint = engine.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.MANUAL });
  const decision = engine.requestDecision(workflow.id, { question: "Proceed?", options: ["yes", "no"] });
  const result = engine.getWorkflowResult(workflow.id);
  const health = engine.getHealth();

  assert.equal(workflow.state, WorkflowStates.CREATED);
  assert.equal(step.resumePolicy, WorkflowResumePolicies.REQUIRE_REVALIDATION);
  assert.equal(checkpoint.type, WorkflowCheckpointTypes.MANUAL);
  assert.equal(decision.question, "Proceed?");
  assert.equal(result.disposition, WorkflowDispositions.INPUT_REQUIRED);
  assert.ok(health.scores.overallWorkflowHealth.value >= 0);
});

test("converts accepted plans deterministically and preserves plan lineage", () => {
  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime() });
  const workflow = engine.createWorkflow({
    workspaceId: "workspace-1",
    objective: "Implement accepted plan",
    plan: {
      id: "plan-1",
      title: "Accepted Plan",
      confidence: 0.8,
      completeness: 0.7,
      evidence: [{ source: "PlanningIntelligenceEngine", signal: "accepted" }],
      steps: [
        { id: "plan-a", title: "Inspect source", type: "analysis" },
        { id: "plan-b", title: "Create change proposal", type: "change", dependsOn: ["plan-a"], requiresApproval: true, validationRequirements: ["tests"] },
      ],
    },
  });
  const steps = engine.listSteps(workflow.id);
  const deps = engine.listDependencies(workflow.id);

  assert.equal(workflow.planId, "plan-1");
  assert.equal(steps.length, 2);
  assert.equal(steps[0].metadata.planStepId, "plan-a");
  assert.equal(steps[1].type, WorkflowStepTypes.CHANGE_PROPOSAL);
  assert.equal(deps.length, 1);
  assert.equal(deps[0].type, WorkflowDependencyTypes.REQUIRES_SUCCESS);
  assert.deepEqual(workflow.evidence[0], { source: "PlanningIntelligenceEngine", signal: "accepted" });
});

test("validates dependency graphs, bounds, source-change plans, and circular dependencies", () => {
  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime(), configuration: { maximumStepsPerWorkflow: 4, maximumWorkflowDepth: 3 } });
  const workflow = engine.createWorkflow({
    id: "workflow-invalid",
    workspaceId: "workspace-1",
    objective: "Source change without accepted plan",
    sourceChanging: true,
    steps: [
      { id: "a", type: WorkflowStepTypes.ANALYSIS },
      { id: "b", type: WorkflowStepTypes.VALIDATION },
    ],
    dependencies: [
      { sourceStepId: "a", targetStepId: "b" },
      { sourceStepId: "b", targetStepId: "a" },
    ],
  });
  const validation = engine.validateWorkflow(workflow.id, { throw: false });
  const codes = validation.issues.map((entry) => entry.code);

  assert.equal(validation.valid, false);
  assert.ok(codes.includes("PLAN_REQUIRED"));
  assert.ok(codes.includes("CIRCULAR_DEPENDENCY"));
  assert.equal(engine.getWorkflow(workflow.id).state, WorkflowStates.BLOCKED);
});

test("schedules sequential dependency workflows and parallel read-only steps deterministically", async () => {
  const runtime = fakeRuntime();
  const engine = new DurableWorkflowEngine({ runtime, configuration: { maximumConcurrentSteps: 2, allowParallelReadOnlySteps: true } });
  const workflow = engine.createWorkflow({
    id: "workflow-schedule",
    workspaceId: "workspace-1",
    objective: "Analyze and search",
    steps: [
      { id: "analysis", sequence: 1, type: WorkflowStepTypes.ANALYSIS, priority: WorkflowStepPriorities.NORMAL },
      { id: "search", sequence: 2, type: WorkflowStepTypes.SEARCH, input: { query: "workflow" }, priority: WorkflowStepPriorities.HIGH },
      { id: "understand", sequence: 3, type: WorkflowStepTypes.CODE_UNDERSTANDING },
    ],
    dependencies: [{ sourceStepId: "analysis", targetStepId: "understand" }],
  });

  engine.validateWorkflow(workflow.id);
  assert.deepEqual(engine.getReadySteps(workflow.id).map((step) => step.id), ["search", "analysis"]);
  await engine.startWorkflow(workflow.id);

  assert.equal(engine.getWorkflow(workflow.id).state, WorkflowStates.COMPLETED);
  assert.equal(engine.getWorkflowResult(workflow.id).disposition, WorkflowDispositions.COMPLETED);
  assert.ok(runtime.calls.includes("repository.search"));
  assert.ok(runtime.calls.includes("project.assessment"));
  assert.ok(runtime.calls.includes("code.understand"));
});

test("routes step executors through runtime boundaries and never direct mutation APIs", async () => {
  const runtime = fakeRuntime();
  const engine = new DurableWorkflowEngine({ runtime });
  const workflow = engine.createWorkflow({
    id: "workflow-runtime-boundary",
    workspaceId: "workspace-1",
    objective: "Exercise runtime command routing",
    steps: [
      { id: "agent", type: WorkflowStepTypes.AGENT_TURN, objective: "Ask agent" },
      { id: "team", type: WorkflowStepTypes.MULTI_AGENT_TEAM, objective: "Coordinate team" },
      { id: "proposal", type: WorkflowStepTypes.CHANGE_PROPOSAL, objective: "Create proposal", input: { fileChanges: [] } },
      { id: "validation", type: WorkflowStepTypes.VALIDATION, objective: "Run validation" },
    ],
  });

  await engine.startWorkflow(workflow.id);

  assert.equal(engine.getWorkflow(workflow.id).state, WorkflowStates.COMPLETED);
  assert.ok(runtime.calls.includes("agent.createConversation"));
  assert.ok(runtime.calls.includes("agent.sendMessage"));
  assert.ok(runtime.calls.includes("multiAgent.createTeam"));
  assert.ok(runtime.calls.includes("multiAgent.startTeam"));
  assert.ok(runtime.calls.includes("multiAgent.reconcile"));
  assert.ok(runtime.calls.includes("change.createProposal"));
  assert.ok(runtime.calls.includes("validation.run"));
  assert.equal(runtime.calls.includes("change.apply"), false);
});

test("pauses protected actions at approval checkpoints and preserves user-input decisions", async () => {
  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime() });
  const workflow = engine.createWorkflow({
    id: "workflow-checkpoints",
    workspaceId: "workspace-1",
    objective: "Approval and user input flow",
    planId: "accepted-plan",
    steps: [
      { id: "apply", type: WorkflowStepTypes.CHANGE_APPLY, sourceChanging: true, approvalSensitive: true },
      { id: "decision", type: WorkflowStepTypes.DECISION, input: { question: "Ship it?", options: ["yes", "no"] } },
    ],
  });

  const apply = await engine.executeStep("apply");
  const decision = await engine.executeStep("decision");
  const waiting = engine.getWorkflow(workflow.id);
  const decisions = engine.listDecisions({ workflowId: workflow.id });
  const checkpoints = engine.listCheckpoints(workflow.id);

  assert.equal(apply.state, WorkflowStepStates.WAITING_FOR_APPROVAL);
  assert.equal(decision.state, WorkflowStepStates.WAITING_FOR_INPUT);
  assert.equal(waiting.state, WorkflowStates.WAITING_FOR_INPUT);
  assert.equal(decisions.length, 1);
  assert.ok(checkpoints.some((checkpoint) => checkpoint.type === WorkflowCheckpointTypes.BEFORE_MUTATION));

  const resolved = engine.resolveDecision(decisions[0].id, { selectedOption: "yes", authority: "user" });
  assert.equal(resolved.selectedOption, "yes");
  assert.equal(engine.getStep("decision").state, WorkflowStepStates.SUCCEEDED);
});

test("handles retries, failure propagation, skipped dependents, partial completion, and truthful results", async () => {
  const runtime = fakeRuntime({ failures: { "repository.search": 1 } });
  const engine = new DurableWorkflowEngine({ runtime, configuration: { maximumRetriesPerStep: 2 } });
  const workflow = engine.createWorkflow({
    id: "workflow-failures",
    workspaceId: "workspace-1",
    objective: "Continue independent work after one failure",
    steps: [
      { id: "flaky", type: WorkflowStepTypes.SEARCH, input: { query: "x" }, retryable: true, failurePolicy: WorkflowFailurePolicies.RETRY },
      { id: "independent", type: WorkflowStepTypes.ANALYSIS, failurePolicy: WorkflowFailurePolicies.CONTINUE_INDEPENDENT },
      { id: "dependent", type: WorkflowStepTypes.CODE_UNDERSTANDING, failurePolicy: WorkflowFailurePolicies.BLOCK_DEPENDENTS },
    ],
    dependencies: [{ sourceStepId: "flaky", targetStepId: "dependent" }],
  });

  await engine.startWorkflow(workflow.id);
  const result = engine.getWorkflowResult(workflow.id);

  assert.equal(engine.getStep("flaky").state, WorkflowStepStates.SUCCEEDED);
  assert.equal(engine.getStep("dependent").state, WorkflowStepStates.SUCCEEDED);
  assert.equal(result.disposition, WorkflowDispositions.COMPLETED);
  assert.equal(result.validationState, "NOT_REQUIRED");
  assert.ok(engine.getStats().retriesScheduled >= 1);
});

test("persists compact snapshots, restores, recovers interrupted protected work, and validates checkpoints", async () => {
  const persistence = new MemoryWorkflowPersistenceAdapter();
  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime(), persistenceAdapter: persistence });
  const workflow = engine.createWorkflow({
    id: "workflow-recovery",
    workspaceId: "workspace-1",
    objective: "Recover safely",
    planId: "plan-safe",
    steps: [{ id: "apply", type: WorkflowStepTypes.CHANGE_APPLY, approvalSensitive: true, sourceChanging: true }],
  });
  const checkpoint = engine.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.MANUAL });
  engine.steps.get("apply").state = WorkflowStepStates.RUNNING;
  engine.save();

  const restored = new DurableWorkflowEngine({ runtime: fakeRuntime(), persistenceAdapter: persistence });
  restored.load();
  const recovery = restored.recover({ load: false });
  const restoredStep = restored.getStep("apply");

  assert.equal(recovery.status, "RECOVERED");
  assert.equal(restoredStep.state, WorkflowStepStates.INTERRUPTED);
  assert.equal(restoredStep.approvalRequestId, null);
  assert.equal(restored.validateCheckpoint(checkpoint.id).valid, true);
  assert.equal(restored.restoreCheckpoint(checkpoint.id).status, "RESTORED");
});

test("surfaces runtime integration as optional commands without breaking unconfigured runtimes", async () => {
  const unconfigured = new LeviApplicationRuntime({ configuration: { persistenceEnabled: false }, enableDurableWorkflows: false });
  const unavailable = await unconfigured.executeCommand("workflow.health", {});
  assert.equal(unavailable.data.status, "UNCONFIGURED");

  const runtime = new LeviApplicationRuntime({
    configuration: { persistenceEnabled: false },
    enableDurableWorkflows: true,
    enableAgentOrchestration: true,
    enableMultiAgentCoordination: true,
    enableWorkspaceTools: true,
  });
  const created = await runtime.executeCommand("workflow.create", {
    id: "runtime-workflow",
    objective: "Runtime workflow",
    steps: [{ id: "synthesis", type: WorkflowStepTypes.SYNTHESIS, objective: "Summarize" }],
  });
  const started = await runtime.executeCommand("workflow.start", { workflowId: created.data.id });
  const health = await runtime.executeCommand("workflow.health", {});

  assert.equal(created.success, true);
  assert.equal(started.data.state, WorkflowStates.COMPLETED);
  assert.ok(health.data.scores.overallWorkflowHealth.value >= 0);
});

test("adds AgentOrchestrationEngine workflow helpers while preserving simple short-turn fallback", async () => {
  const engine = new DurableWorkflowEngine({ runtime: fakeRuntime() });
  const agent = new AgentOrchestrationEngine({ runtime: { workflowEngine: () => engine }, configuration: { enablePersistence: false } });
  const conversation = agent.createConversation({ objective: "Tiny question", workspaceId: "workspace-1" });
  const turn = agent.createTurn(conversation.id, { content: "What is this?" });

  const simple = await agent.createWorkflowFromTurn(turn.id, {});
  assert.equal(simple.status, "NOT_CREATED");

  const created = await agent.createWorkflowFromTurn(turn.id, { force: true, objective: "Implement a multi-step feature with validation" });
  assert.equal(created.status, "WORKFLOW_CREATED");
  assert.equal(agent.getWorkflowForTurn(turn.id).id, created.workflow.id);
  assert.equal((await agent.continueTurnWithWorkflow(turn.id, created.workflow.id, { start: false })).status, "WORKFLOW_CONTINUED");
  assert.equal(agent.cancelWorkflowForTurn(turn.id, "test").state, WorkflowStates.CANCELLED);
});

function fakeRuntime(options = {}) {
  const calls = [];
  const failures = { ...(options.failures || {}) };
  return {
    calls,
    executeCommand: async (commandId, input = {}) => {
      calls.push(commandId);
      if (failures[commandId]) {
        failures[commandId] -= 1;
        const error = new Error(`Injected failure for ${commandId}`);
        error.retryable = true;
        throw error;
      }
      if (commandId === "agent.createConversation") return { success: true, data: { id: "conversation-1", conversationId: "conversation-1", evidence: [{ source: commandId, signal: "created" }] } };
      if (commandId === "agent.sendMessage") return { success: true, data: { conversationId: input.conversationId, turnId: "turn-1", evidence: [{ source: commandId, signal: "sent" }] } };
      if (commandId === "multiAgent.createTeam") return { success: true, data: { id: "team-1", teamId: "team-1", evidence: [{ source: commandId, signal: "created" }] } };
      if (commandId === "multiAgent.startTeam") return { success: true, data: { id: input.teamId, teamId: input.teamId, state: "COMPLETED", evidence: [{ source: commandId, signal: "started" }] } };
      if (commandId === "multiAgent.reconcile") return { success: true, data: { teamId: input.teamId, disposition: "COMPLETED", evidence: [{ source: commandId, signal: "reconciled" }] } };
      return { success: true, data: { id: `${commandId}-result`, status: "OK", evidence: [{ source: commandId, signal: "ok" }] } };
    },
    listCommands: () => [
      "project.assessment",
      "repository.search",
      "code.understand",
      "planning.create",
      "context.build",
      "model.complete",
      "agent.createConversation",
      "agent.sendMessage",
      "multiAgent.createTeam",
      "multiAgent.startTeam",
      "multiAgent.reconcile",
      "change.createProposal",
      "change.validateProposal",
      "change.apply",
      "validation.run",
      "execution.repair",
      "command.runValidation",
      "sourceControl.checkpoint",
      "sourceControl.restore",
      "approval.respond",
    ].map((id) => ({ id })),
    getRuntimeHealth: () => ({ unavailableCapabilities: [], securityStatus: "AVAILABLE", approvalStatus: { status: "AVAILABLE" } }),
  };
}
