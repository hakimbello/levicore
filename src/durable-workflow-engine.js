const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const DURABLE_WORKFLOW_SCHEMA_VERSION = 1;

const WorkflowEngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  SUSPENDED: "SUSPENDED",
  RECOVERING: "RECOVERING",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const WorkflowStates = Object.freeze({
  CREATED: "CREATED",
  VALIDATING: "VALIDATING",
  READY: "READY",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  WAITING: "WAITING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  WAITING_FOR_INPUT: "WAITING_FOR_INPUT",
  WAITING_FOR_DEPENDENCY: "WAITING_FOR_DEPENDENCY",
  PAUSED: "PAUSED",
  SUSPENDED: "SUSPENDED",
  RECOVERING: "RECOVERING",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
  ARCHIVED: "ARCHIVED",
});

const WorkflowStepStates = Object.freeze({
  CREATED: "CREATED",
  BLOCKED: "BLOCKED",
  READY: "READY",
  QUEUED: "QUEUED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  WAITING: "WAITING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  WAITING_FOR_INPUT: "WAITING_FOR_INPUT",
  WAITING_FOR_DEPENDENCY: "WAITING_FOR_DEPENDENCY",
  VALIDATING: "VALIDATING",
  REPAIRING: "REPAIRING",
  RETRYING: "RETRYING",
  PAUSED: "PAUSED",
  SUSPENDED: "SUSPENDED",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  SKIPPED: "SKIPPED",
  BLOCKED_BY_DEPENDENCY: "BLOCKED_BY_DEPENDENCY",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
  EXPIRED: "EXPIRED",
  INTERRUPTED: "INTERRUPTED",
});

const WorkflowStepTypes = Object.freeze({
  ANALYSIS: "ANALYSIS",
  SEARCH: "SEARCH",
  CODE_UNDERSTANDING: "CODE_UNDERSTANDING",
  PROJECT_ASSESSMENT: "PROJECT_ASSESSMENT",
  PLANNING: "PLANNING",
  CONTEXT_BUILD: "CONTEXT_BUILD",
  MODEL_INFERENCE: "MODEL_INFERENCE",
  AGENT_TURN: "AGENT_TURN",
  MULTI_AGENT_TEAM: "MULTI_AGENT_TEAM",
  CHANGE_PROPOSAL: "CHANGE_PROPOSAL",
  CHANGE_REVIEW: "CHANGE_REVIEW",
  APPROVAL_GATE: "APPROVAL_GATE",
  CHANGE_APPLY: "CHANGE_APPLY",
  VALIDATION: "VALIDATION",
  REPAIR: "REPAIR",
  COMMAND: "COMMAND",
  SOURCE_CONTROL_CHECKPOINT: "SOURCE_CONTROL_CHECKPOINT",
  SOURCE_CONTROL_RESTORE: "SOURCE_CONTROL_RESTORE",
  USER_INPUT: "USER_INPUT",
  DECISION: "DECISION",
  CHECKPOINT: "CHECKPOINT",
  SYNTHESIS: "SYNTHESIS",
  RELEASE_ASSESSMENT: "RELEASE_ASSESSMENT",
  DOCUMENTATION: "DOCUMENTATION",
  CUSTOM: "CUSTOM",
});

const WorkflowDependencyTypes = Object.freeze({
  REQUIRES_SUCCESS: "REQUIRES_SUCCESS",
  REQUIRES_COMPLETION: "REQUIRES_COMPLETION",
  REQUIRES_OUTPUT: "REQUIRES_OUTPUT",
  REQUIRES_APPROVAL: "REQUIRES_APPROVAL",
  REQUIRES_VALIDATION: "REQUIRES_VALIDATION",
  REQUIRES_DECISION: "REQUIRES_DECISION",
  SOFT_DEPENDENCY: "SOFT_DEPENDENCY",
  OPTIONAL: "OPTIONAL",
  MUTEX: "MUTEX",
  UNKNOWN: "UNKNOWN",
});

const WorkflowExecutionStrategies = Object.freeze({
  SEQUENTIAL: "SEQUENTIAL",
  DEPENDENCY_GRAPH: "DEPENDENCY_GRAPH",
  PARALLEL_SAFE: "PARALLEL_SAFE",
  ADAPTIVE_BOUNDED: "ADAPTIVE_BOUNDED",
  APPROVAL_DRIVEN: "APPROVAL_DRIVEN",
  RECOVERY_FIRST: "RECOVERY_FIRST",
});

const WorkflowCheckpointTypes = Object.freeze({
  WORKFLOW_CREATED: "WORKFLOW_CREATED",
  PLAN_ACCEPTED: "PLAN_ACCEPTED",
  BEFORE_PROTECTED_ACTION: "BEFORE_PROTECTED_ACTION",
  AFTER_PROTECTED_ACTION: "AFTER_PROTECTED_ACTION",
  BEFORE_MUTATION: "BEFORE_MUTATION",
  AFTER_MUTATION: "AFTER_MUTATION",
  BEFORE_COMMAND: "BEFORE_COMMAND",
  AFTER_COMMAND: "AFTER_COMMAND",
  VALIDATION_COMPLETE: "VALIDATION_COMPLETE",
  REPAIR_COMPLETE: "REPAIR_COMPLETE",
  USER_DECISION: "USER_DECISION",
  PERIODIC: "PERIODIC",
  MANUAL: "MANUAL",
  RECOVERY: "RECOVERY",
  COMPLETION: "COMPLETION",
});

const WorkflowFailurePolicies = Object.freeze({
  FAIL_WORKFLOW: "FAIL_WORKFLOW",
  BLOCK_DEPENDENTS: "BLOCK_DEPENDENTS",
  SKIP_DEPENDENTS: "SKIP_DEPENDENTS",
  CONTINUE_INDEPENDENT: "CONTINUE_INDEPENDENT",
  RETRY: "RETRY",
  REPAIR_THEN_RETRY: "REPAIR_THEN_RETRY",
  REQUIRE_USER_DECISION: "REQUIRE_USER_DECISION",
  ROLLBACK_AND_FAIL: "ROLLBACK_AND_FAIL",
  PARTIAL_COMPLETION: "PARTIAL_COMPLETION",
  CUSTOM: "CUSTOM",
});

const WorkflowResumePolicies = Object.freeze({
  MANUAL_ONLY: "MANUAL_ONLY",
  SAFE_AUTOMATIC: "SAFE_AUTOMATIC",
  REQUIRE_REVALIDATION: "REQUIRE_REVALIDATION",
  REQUIRE_APPROVAL_RECONFIRMATION: "REQUIRE_APPROVAL_RECONFIRMATION",
  NEVER_RESUME: "NEVER_RESUME",
  CUSTOM: "CUSTOM",
});

const WorkflowDispositions = Object.freeze({
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  PROPOSAL_READY: "PROPOSAL_READY",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  INPUT_REQUIRED: "INPUT_REQUIRED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  REPAIR_EXHAUSTED: "REPAIR_EXHAUSTED",
  BLOCKED: "BLOCKED",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  CANCELLED: "CANCELLED",
  TIMED_OUT: "TIMED_OUT",
  FAILED: "FAILED",
});

const WorkflowStepPriorities = Object.freeze({
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const WorkflowEventTypes = Object.freeze({
  ENGINE_INITIALIZATION_STARTED: "workflow_engine_initialization_started",
  ENGINE_READY: "workflow_engine_ready",
  ENGINE_DEGRADED: "workflow_engine_degraded",
  ENGINE_FAILED: "workflow_engine_failed",
  WORKFLOW_CREATED: "workflow_created",
  WORKFLOW_VALIDATION_STARTED: "workflow_validation_started",
  WORKFLOW_VALIDATED: "workflow_validated",
  WORKFLOW_INVALID: "workflow_invalid",
  WORKFLOW_QUEUED: "workflow_queued",
  WORKFLOW_STARTED: "workflow_started",
  WORKFLOW_WAITING: "workflow_waiting",
  WORKFLOW_WAITING_FOR_APPROVAL: "workflow_waiting_for_approval",
  WORKFLOW_WAITING_FOR_INPUT: "workflow_waiting_for_input",
  WORKFLOW_PAUSED: "workflow_paused",
  WORKFLOW_RESUMED: "workflow_resumed",
  WORKFLOW_SUSPENDED: "workflow_suspended",
  WORKFLOW_CANCELLATION_REQUESTED: "workflow_cancellation_requested",
  WORKFLOW_CANCELLED: "workflow_cancelled",
  WORKFLOW_PARTIALLY_COMPLETED: "workflow_partially_completed",
  WORKFLOW_COMPLETED: "workflow_completed",
  WORKFLOW_BLOCKED: "workflow_blocked",
  WORKFLOW_FAILED: "workflow_failed",
  WORKFLOW_EXPIRED: "workflow_expired",
  WORKFLOW_ARCHIVED: "workflow_archived",
  STEP_CREATED: "workflow_step_created",
  STEP_READY: "workflow_step_ready",
  STEP_QUEUED: "workflow_step_queued",
  STEP_STARTED: "workflow_step_started",
  STEP_PROGRESS: "workflow_step_progress",
  STEP_WAITING: "workflow_step_waiting",
  STEP_WAITING_FOR_APPROVAL: "workflow_step_waiting_for_approval",
  STEP_WAITING_FOR_INPUT: "workflow_step_waiting_for_input",
  STEP_VALIDATING: "workflow_step_validating",
  STEP_REPAIRING: "workflow_step_repairing",
  STEP_RETRYING: "workflow_step_retrying",
  STEP_SUCCEEDED: "workflow_step_succeeded",
  STEP_PARTIALLY_SUCCEEDED: "workflow_step_partially_succeeded",
  STEP_SKIPPED: "workflow_step_skipped",
  STEP_BLOCKED: "workflow_step_blocked",
  STEP_CANCELLED: "workflow_step_cancelled",
  STEP_FAILED: "workflow_step_failed",
  STEP_TIMED_OUT: "workflow_step_timed_out",
  DEPENDENCY_SATISFIED: "workflow_dependency_satisfied",
  DEPENDENCY_BLOCKED: "workflow_dependency_blocked",
  CHECKPOINT_CREATED: "workflow_checkpoint_created",
  CHECKPOINT_VALIDATED: "workflow_checkpoint_validated",
  CHECKPOINT_RESTORE_STARTED: "workflow_checkpoint_restore_started",
  CHECKPOINT_RESTORED: "workflow_checkpoint_restored",
  CHECKPOINT_RESTORE_FAILED: "workflow_checkpoint_restore_failed",
  DECISION_REQUESTED: "workflow_decision_requested",
  DECISION_RESOLVED: "workflow_decision_resolved",
  RETRY_SCHEDULED: "workflow_retry_scheduled",
  RECOVERY_STARTED: "workflow_recovery_started",
  RECOVERY_COMPLETED: "workflow_recovery_completed",
  RECOVERY_FAILED: "workflow_recovery_failed",
  WORKSPACE_STALE: "workflow_workspace_stale",
  APPROVAL_INVALIDATED: "workflow_approval_invalidated",
  PERSISTED: "workflow_persisted",
  RESTORED: "workflow_restored",
  CORRUPTION_DETECTED: "workflow_corruption_detected",
  ENGINE_SHUTDOWN: "workflow_engine_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-durable-workflows",
  schemaVersion: DURABLE_WORKFLOW_SCHEMA_VERSION,
  enabled: true,
  defaultStrategy: WorkflowExecutionStrategies.DEPENDENCY_GRAPH,
  maximumWorkflows: 64,
  maximumActiveWorkflows: 2,
  maximumStepsPerWorkflow: 64,
  maximumDependenciesPerStep: 8,
  maximumConcurrentSteps: 2,
  maximumConcurrentStepsPerWorkspace: 2,
  maximumWorkflowDepth: 8,
  maximumRetriesPerStep: 2,
  maximumRepairAttemptsPerStep: 1,
  maximumValidationAttemptsPerStep: 2,
  maximumModelRequestsPerStep: 2,
  maximumToolCallsPerStep: 8,
  maximumWorkflowDurationMs: 30 * 60 * 1000,
  maximumStepDurationMs: 2 * 60 * 1000,
  maximumIdleDurationMs: 10 * 60 * 1000,
  maximumPauseDurationMs: 24 * 60 * 60 * 1000,
  maximumEventHistory: 1000,
  maximumCheckpointHistory: 128,
  checkpointIntervalMs: 60000,
  persistenceEnabled: true,
  autoCheckpointEnabled: true,
  recoveryEnabled: true,
  requirePlanForSourceChanges: true,
  requireApprovalForProtectedSteps: true,
  requireValidationAfterMutation: true,
  requireCheckpointBeforeMutation: true,
  allowSafeAutomaticResume: false,
  allowParallelReadOnlySteps: true,
  archiveCompletedWorkflows: false,
  storagePath: ".levi/durable-workflows.json",
  metadata: Object.freeze({}),
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumWorkflows: DEFAULT_CONFIGURATION.maximumWorkflows,
  maximumActiveWorkflows: DEFAULT_CONFIGURATION.maximumActiveWorkflows,
  maximumArchivedWorkflows: 128,
  maximumStepsPerWorkflow: DEFAULT_CONFIGURATION.maximumStepsPerWorkflow,
  maximumActiveSteps: DEFAULT_CONFIGURATION.maximumConcurrentSteps,
  maximumQueuedSteps: 128,
  maximumDependenciesPerStep: DEFAULT_CONFIGURATION.maximumDependenciesPerStep,
  maximumWorkflowDepth: DEFAULT_CONFIGURATION.maximumWorkflowDepth,
  maximumRetriesPerStep: DEFAULT_CONFIGURATION.maximumRetriesPerStep,
  maximumRepairsPerStep: DEFAULT_CONFIGURATION.maximumRepairAttemptsPerStep,
  maximumValidationsPerStep: DEFAULT_CONFIGURATION.maximumValidationAttemptsPerStep,
  maximumModelRequestsPerStep: DEFAULT_CONFIGURATION.maximumModelRequestsPerStep,
  maximumToolCallsPerStep: DEFAULT_CONFIGURATION.maximumToolCallsPerStep,
  maximumDecisions: 128,
  maximumCheckpoints: DEFAULT_CONFIGURATION.maximumCheckpointHistory,
  maximumAttempts: 256,
  maximumEventHistory: DEFAULT_CONFIGURATION.maximumEventHistory,
  maximumListeners: 128,
  maximumPersistedWorkflows: 32,
  maximumWorkflowDurationMs: DEFAULT_CONFIGURATION.maximumWorkflowDurationMs,
  maximumStepDurationMs: DEFAULT_CONFIGURATION.maximumStepDurationMs,
  maximumIdleDurationMs: DEFAULT_CONFIGURATION.maximumIdleDurationMs,
  maximumPauseDurationMs: DEFAULT_CONFIGURATION.maximumPauseDurationMs,
  maximumUiItems: 100,
});

const TERMINAL_STEP_STATES = Object.freeze([
  WorkflowStepStates.SUCCEEDED,
  WorkflowStepStates.PARTIALLY_SUCCEEDED,
  WorkflowStepStates.SKIPPED,
  WorkflowStepStates.BLOCKED_BY_DEPENDENCY,
  WorkflowStepStates.CANCELLED,
  WorkflowStepStates.FAILED,
  WorkflowStepStates.TIMED_OUT,
  WorkflowStepStates.EXPIRED,
  WorkflowStepStates.INTERRUPTED,
]);

const TERMINAL_WORKFLOW_STATES = Object.freeze([
  WorkflowStates.CANCELLED,
  WorkflowStates.COMPLETED,
  WorkflowStates.PARTIALLY_COMPLETED,
  WorkflowStates.BLOCKED,
  WorkflowStates.FAILED,
  WorkflowStates.EXPIRED,
  WorkflowStates.ARCHIVED,
]);

const PRIORITY_ORDER = Object.freeze({
  [WorkflowStepPriorities.CRITICAL]: 0,
  [WorkflowStepPriorities.HIGH]: 1,
  [WorkflowStepPriorities.NORMAL]: 2,
  [WorkflowStepPriorities.LOW]: 3,
});

class DurableWorkflowEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.runtime = options.runtime || null;
    this.agentOrchestrator = options.agentOrchestrator || options.agent || null;
    this.multiAgentCoordinator = options.multiAgentCoordinator || options.multiAgent || null;
    this.workspaceTools = options.workspaceTools || null;
    this.modelGateway = options.modelGateway || null;
    this.intelligenceIntegrationEngine = options.intelligenceIntegrationEngine || null;
    this.configuration = normalizeConfiguration(options.configuration || options.config || {});
    this.bounds = normalizeBounds({ ...options.bounds, ...boundsFromConfiguration(this.configuration) });
    this.clock = normalizeClock(options.clock);
    this.timer = options.timer || { setTimeout: () => null, clearTimeout: () => undefined };
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.persistenceAdapter = options.persistenceAdapter || new MemoryWorkflowPersistenceAdapter();
    this.state = WorkflowEngineStates.CREATED;
    this.workflows = new Map();
    this.steps = new Map();
    this.dependencies = new Map();
    this.checkpoints = new Map();
    this.attempts = new Map();
    this.decisions = new Map();
    this.results = new Map();
    this.events = [];
    this.listeners = new Map();
    this.runningSteps = new Set();
    this.queuedSteps = [];
    this.stats = emptyStats();
  }

  initialize(options = {}) {
    this.state = WorkflowEngineStates.INITIALIZING;
    this.emitEvent(WorkflowEventTypes.ENGINE_INITIALIZATION_STARTED, {});
    try {
      validateConfiguration(this.configuration, this.bounds);
      if (options.restore !== false && this.configuration.persistenceEnabled && options.load !== false) this.load({ emptyOnCorruption: true });
      const health = this.getHealth({ skipChecks: true });
      this.state = !this.configuration.enabled || health.blockers.length || health.warnings.length ? WorkflowEngineStates.DEGRADED : WorkflowEngineStates.READY;
      this.emitEvent(this.state === WorkflowEngineStates.READY ? WorkflowEventTypes.ENGINE_READY : WorkflowEventTypes.ENGINE_DEGRADED, health);
      return { status: this.state, health };
    } catch (error) {
      this.state = WorkflowEngineStates.FAILED;
      this.stats.lastFailure = normalizeError(error, this);
      this.emitEvent(WorkflowEventTypes.ENGINE_FAILED, { error: this.stats.lastFailure });
      return { status: WorkflowEngineStates.FAILED, error: this.stats.lastFailure };
    }
  }

  shutdown(options = {}) {
    this.state = WorkflowEngineStates.SHUTTING_DOWN;
    for (const workflow of this.workflows.values()) {
      if ([WorkflowStates.RUNNING, WorkflowStates.QUEUED, WorkflowStates.WAITING].includes(workflow.state)) {
        this.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.MANUAL, recoveryMetadata: { reason: "Application shutdown." } }, { silent: true });
        workflow.state = WorkflowStates.SUSPENDED;
        workflow.pausedAt = this.now();
        workflow.warnings = unique(workflow.warnings.concat("Workflow suspended during shutdown; protected work will not auto-resume."));
        workflow.updatedAt = this.now();
      }
    }
    if (options.save !== false && this.configuration.persistenceEnabled) this.save();
    this.state = WorkflowEngineStates.STOPPED;
    this.emitEvent(WorkflowEventTypes.ENGINE_SHUTDOWN, {});
    return { status: this.state };
  }

  suspend(reason = "Suspended.") {
    this.state = WorkflowEngineStates.SUSPENDED;
    for (const workflow of this.workflows.values()) if (isActiveWorkflow(workflow.state)) this.suspendWorkflow(workflow.id, reason);
    return { status: this.state, reason };
  }

  resume(options = {}) {
    const health = this.getHealth(options);
    this.state = health.blockers.length ? WorkflowEngineStates.DEGRADED : WorkflowEngineStates.READY;
    return { status: this.state, health };
  }

  recover(options = {}) {
    this.state = WorkflowEngineStates.RECOVERING;
    this.emitEvent(WorkflowEventTypes.RECOVERY_STARTED, {});
    try {
      if (options.snapshot) this.restore(options.snapshot, { recovery: true });
      else if (this.configuration.persistenceEnabled && options.load !== false) this.load({ emptyOnCorruption: true, recovery: true });
      for (const step of this.steps.values()) {
        if ([WorkflowStepStates.STARTING, WorkflowStepStates.RUNNING, WorkflowStepStates.VALIDATING, WorkflowStepStates.REPAIRING, WorkflowStepStates.RETRYING, WorkflowStepStates.QUEUED].includes(step.state)) {
          step.state = step.sourceChanging || step.commandExecuting || step.approvalSensitive ? WorkflowStepStates.INTERRUPTED : WorkflowStepStates.PAUSED;
          step.error = normalizeError(new Error("Step interrupted during recovery; explicit retry or revalidation required."), this, { retryable: step.retryable && !step.approvalSensitive });
          step.limitations = unique(step.limitations.concat("Recovered steps do not auto-resume protected actions."));
          step.confidence = Math.min(step.confidence || 1, 0.65);
          step.updatedAt = this.now();
        }
      }
      for (const workflow of this.workflows.values()) {
        if ([WorkflowStates.RUNNING, WorkflowStates.QUEUED, WorkflowStates.WAITING, WorkflowStates.WAITING_FOR_APPROVAL].includes(workflow.state)) {
          workflow.state = WorkflowStates.RECOVERING;
          workflow.limitations = unique(workflow.limitations.concat("Workflow recovered in a non-running state; revalidation is required before resume."));
          workflow.confidence = Math.min(workflow.confidence, 0.65);
          workflow.updatedAt = this.now();
          this.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.RECOVERY, recoveryMetadata: { protectedAutoResume: false } }, { silent: true });
        }
      }
      this.state = WorkflowEngineStates.DEGRADED;
      this.stats.workflowsRecovered += 1;
      this.stats.lastRecovery = this.now();
      this.emitEvent(WorkflowEventTypes.RECOVERY_COMPLETED, { workflowCount: this.workflows.size });
      return { status: "RECOVERED", workflowCount: this.workflows.size, protectedAutoResume: false };
    } catch (error) {
      this.state = WorkflowEngineStates.DEGRADED;
      this.emitEvent(WorkflowEventTypes.RECOVERY_FAILED, { error: normalizeError(error, this) });
      return { status: "RECOVERY_FAILED", error: normalizeError(error, this) };
    }
  }

  getState() {
    return { state: this.state, schemaVersion: DURABLE_WORKFLOW_SCHEMA_VERSION, enabled: this.configuration.enabled };
  }

  getConfiguration() {
    return clone({ ...this.configuration, bounds: this.bounds });
  }

  updateConfiguration(patch = {}, options = {}) {
    const next = normalizeConfiguration(deepMerge(this.configuration, sanitizeConfigurationPatch(patch)));
    validateConfiguration(next, this.bounds);
    this.configuration = options.replace === true ? next : { ...this.configuration, ...next };
    this.bounds = normalizeBounds({ ...this.bounds, ...boundsFromConfiguration(this.configuration) });
    return this.getConfiguration();
  }

  getHealth(options = {}) {
    const runtimeAvailable = !!this.runtime && typeof this.runtime.executeCommand === "function";
    const commandIds = runtimeAvailable && typeof this.runtime.listCommands === "function" ? this.runtime.listCommands({}).map((command) => command.id) : [];
    const has = (id) => commandIds.includes(id);
    const blockers = [];
    const warnings = [];
    if (!this.configuration.enabled) warnings.push("Durable workflows are disabled.");
    if (!runtimeAvailable) blockers.push("LeviApplicationRuntime is unavailable.");
    if (this.configuration.maximumRetriesPerStep > this.bounds.maximumRetriesPerStep) blockers.push("Unlimited or excessive retry configuration blocks READY.");
    if (this.configuration.maximumConcurrentSteps > this.bounds.maximumActiveSteps) blockers.push("Unlimited or excessive concurrency configuration blocks READY.");
    if (this.configuration.requireApprovalForProtectedSteps && !has("approval.respond") && runtimeAvailable) warnings.push("Approval response command is unavailable; protected steps will wait.");
    if (this.stats.corruptedLoads) warnings.push("A corrupted workflow load was detected; recovered workflows require revalidation.");
    const cycles = Array.from(this.workflows.values()).filter((workflow) => this.validateDependencies(workflow.id, { throw: false }).valid === false).length;
    if (cycles) blockers.push("At least one workflow has an invalid dependency graph.");
    const scores = {
      configuration: score("configuration", blockers.some((entry) => /retry|concurrency/.test(entry)) ? 30 : 100),
      runtimeAvailability: score("runtimeAvailability", runtimeAvailable ? 100 : 0),
      planningAvailability: score("planningAvailability", has("planning.create") || has("planning.validate") ? 100 : 75),
      agentAvailability: score("agentAvailability", this.agentEngine() ? 100 : has("agent.sendMessage") ? 100 : 70),
      multiAgentAvailability: score("multiAgentAvailability", this.multiAgentEngine() ? 100 : has("multiAgent.createTeam") ? 100 : 75),
      workspaceToolAvailability: score("workspaceToolAvailability", this.workspaceToolEngine() ? 100 : has("change.createProposal") ? 100 : 75),
      modelGatewayAvailability: score("modelGatewayAvailability", this.modelGatewayEngine() ? 100 : has("model.complete") ? 100 : 70),
      schedulerReliability: score("schedulerReliability", this.queuedSteps.length <= this.bounds.maximumQueuedSteps ? 100 : 40),
      dependencyIntegrity: score("dependencyIntegrity", cycles ? 20 : 100),
      checkpointReliability: score("checkpointReliability", this.checkpoints.size <= this.bounds.maximumCheckpoints ? 100 : 80),
      recoveryReadiness: score("recoveryReadiness", this.configuration.recoveryEnabled ? 100 : 80),
      approvalIntegrity: score("approvalIntegrity", this.configuration.requireApprovalForProtectedSteps ? 100 : 85),
      securityIntegrity: score("securityIntegrity", runtimeAvailable ? 100 : 40),
      privacyIntegrity: score("privacyIntegrity", 100),
      validationAvailability: score("validationAvailability", has("validation.run") || has("execution.validate") ? 100 : 75),
      repairAvailability: score("repairAvailability", has("execution.repair") ? 100 : 75),
      persistenceReliability: score("persistenceReliability", this.persistenceAdapter ? this.stats.corruptedLoads ? 60 : 100 : 70),
      workflowReliability: score("workflowReliability", reliabilityScore(this.stats.workflowsCompleted + this.stats.workflowsPartiallyCompleted, this.stats.workflowsFailed + this.stats.workflowsBlocked)),
    };
    scores.overallWorkflowHealth = score("overallWorkflowHealth", blockers.length ? Math.min(50, averageScores(scores)) : warnings.length ? Math.min(90, averageScores(scores)) : averageScores(scores));
    return {
      engineState: this.state,
      workflowCount: this.workflows.size,
      stepCount: this.steps.size,
      checkpointCount: this.checkpoints.size,
      activeWorkflows: this.listWorkflows({ active: true }).length,
      runningSteps: this.runningSteps.size,
      queuedSteps: this.queuedSteps.length,
      blockers,
      warnings,
      scores,
      stats: clone(this.stats),
      invariants: {
        runtimeBoundary: "WORKFLOW_STEPS_USE_RUNTIME_COMMANDS",
        mutationBoundary: "CONTROLLED_WORKSPACE_TOOLS_ONLY",
        approvalBoundary: "USER_APPROVAL_REQUIRED_FOR_PROTECTED_STEPS",
        protectedAutoResume: false,
        privateReasoningPersistence: "NEVER",
      },
    };
  }

  getStats() {
    return clone({
      ...this.stats,
      averageStepsPerWorkflow: this.workflows.size ? this.steps.size / this.workflows.size : 0,
    });
  }

  snapshot() {
    return {
      schemaVersion: DURABLE_WORKFLOW_SCHEMA_VERSION,
      configuration: this.configuration,
      workflows: Array.from(this.workflows.values()).slice(-this.bounds.maximumPersistedWorkflows).map(summarizeWorkflow),
      steps: Array.from(this.steps.values()).map(summarizeStep),
      dependencies: Array.from(this.dependencies.values()),
      checkpoints: Array.from(this.checkpoints.values()).slice(-this.bounds.maximumCheckpoints).map(summarizeCheckpoint),
      attempts: Array.from(this.attempts.values()).slice(-this.bounds.maximumAttempts).map(summarizeAttempt),
      decisions: Array.from(this.decisions.values()).slice(-this.bounds.maximumDecisions || 128).map(clone),
      results: Array.from(this.results.values()).map(clone),
      events: this.events.slice(-this.bounds.maximumEventHistory).map(summarizeEvent),
      statistics: clone(this.stats),
    };
  }

  restore(snapshot, options = {}) {
    const normalized = normalizeSnapshot(snapshot);
    this.configuration = normalizeConfiguration({ ...this.configuration, ...normalized.configuration });
    this.workflows = new Map(normalized.workflows.map((workflow) => [workflow.id, normalizeWorkflow(workflow, this, { restored: true })]));
    this.steps = new Map(normalized.steps.map((step) => [step.id, normalizeStep(step.workflowId, step, this, { restored: true })]));
    this.dependencies = new Map(normalized.dependencies.map((dependency) => [dependency.id, normalizeDependency(dependency.workflowId, dependency, this)]));
    this.checkpoints = new Map(normalized.checkpoints.map((checkpoint) => [checkpoint.id, normalizeCheckpoint(checkpoint.workflowId, checkpoint, this)]));
    this.attempts = new Map(normalized.attempts.map((attempt) => [attempt.id, normalizeAttempt(attempt.workflowId, attempt.stepId, attempt, this)]));
    this.decisions = new Map(normalized.decisions.map((decision) => [decision.id, normalizeDecision(decision.workflowId, decision, this)]));
    this.results = new Map(normalized.results.map((result) => [result.workflowId, normalizeWorkflowResult(result.workflowId, result, this)]));
    this.stats = { ...emptyStats(), ...(normalized.statistics || {}) };
    for (const step of this.steps.values()) {
      if ([WorkflowStepStates.RUNNING, WorkflowStepStates.STARTING, WorkflowStepStates.QUEUED].includes(step.state)) step.state = WorkflowStepStates.INTERRUPTED;
      if (step.approvalSensitive) step.approvalRequestId = null;
    }
    for (const workflow of this.workflows.values()) {
      if ([WorkflowStates.RUNNING, WorkflowStates.QUEUED, WorkflowStates.READY].includes(workflow.state)) {
        workflow.state = options.recovery ? WorkflowStates.RECOVERING : WorkflowStates.SUSPENDED;
        workflow.confidence = Math.min(workflow.confidence, 0.7);
        workflow.limitations = unique(workflow.limitations.concat("Restored workflow requires revalidation before protected work resumes."));
      }
    }
    this.emitEvent(WorkflowEventTypes.RESTORED, { workflowCount: this.workflows.size });
    return { status: "RESTORED", workflowCount: this.workflows.size };
  }

  save() {
    if (!this.persistenceAdapter || typeof this.persistenceAdapter.save !== "function") return { status: "UNAVAILABLE" };
    const result = this.persistenceAdapter.save(this.snapshot(), { configuration: this.configuration });
    this.stats.lastPersistence = this.now();
    this.emitEvent(WorkflowEventTypes.PERSISTED, { result: safePersistResult(result) });
    return result;
  }

  load(options = {}) {
    if (!this.persistenceAdapter || typeof this.persistenceAdapter.load !== "function") return { status: "UNAVAILABLE" };
    const result = this.persistenceAdapter.load({ configuration: this.configuration });
    if (!result || result.status === "EMPTY" || !result.snapshot) return result || { status: "EMPTY" };
    try {
      const restored = this.restore(result.snapshot, options);
      return { ...result, ...restored };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.emitEvent(WorkflowEventTypes.CORRUPTION_DETECTED, { error: normalizeError(error, this) });
      if (options.emptyOnCorruption) return { status: "EMPTY", corrupted: true, error: error.message };
      throw error;
    }
  }

  createWorkflow(input = {}, options = {}) {
    if (!this.configuration.enabled) return this.disabledResult();
    if (this.workflows.size >= this.configuration.maximumWorkflows) throw new Error("Maximum workflows exceeded.");
    const converted = input.plan || input.acceptedPlan ? this.convertPlanToWorkflow(input.plan || input.acceptedPlan, input) : input;
    const workflow = normalizeWorkflow(converted, this, options);
    this.workflows.set(workflow.id, workflow);
    this.stats.workflowsCreated += 1;
    this.stats.lastWorkflow = workflow.id;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_CREATED, { workflowId: workflow.id });
    for (const stepInput of safeArray(converted.steps || converted.workflowSteps)) this.createStep(workflow.id, stepInput, { ...options, silent: true });
    if (!this.listSteps(workflow.id).length && converted.objective) {
      this.createStep(workflow.id, { type: WorkflowStepTypes.ANALYSIS, title: "Assess objective", objective: converted.objective }, { silent: true });
    }
    for (const dep of safeArray(converted.dependencies)) this.addDependency(workflow.id, dep, { silent: true });
    this.rebuildWorkflowIndexes(workflow.id);
    this.createCheckpoint(workflow.id, { type: workflow.planId ? WorkflowCheckpointTypes.PLAN_ACCEPTED : WorkflowCheckpointTypes.WORKFLOW_CREATED }, { silent: true });
    return clone(workflow);
  }

  convertPlanToWorkflow(plan = {}, input = {}) {
    const planId = plan.id || plan.planId || input.planId || stableId("plan", plan);
    const planSteps = safeArray(plan.steps || plan.planSteps || plan.items);
    const stepIds = new Map();
    const steps = planSteps.map((step, index) => {
      const sourceId = step.id || step.stepId || `plan-step-${index + 1}`;
      const id = stableId("workflow-step", { planId, sourceId, sequence: index + 1 });
      stepIds.set(sourceId, id);
      return {
        id,
        planStepId: sourceId,
        sequence: Number(step.sequence || index + 1),
        type: mapPlanStepType(step),
        title: step.title || step.name || `Plan step ${index + 1}`,
        description: step.description || step.summary || "",
        objective: step.objective || step.description || step.title || input.objective || plan.objective,
        dependencyIds: [],
        sourceChanging: step.sourceChanging === true || looksSourceChanging(step),
        commandExecuting: step.commandExecuting === true || looksCommandExecuting(step),
        approvalSensitive: step.approvalSensitive === true || step.requiresApproval === true || looksSourceChanging(step),
        validationRequired: step.validationRequired === true || step.requiresValidation === true || safeArray(step.validationRequirements).length > 0,
        requiredCapabilities: safeArray(step.requiredCapabilities || step.capabilities),
        evidence: safeArray(step.evidence),
        warnings: safeArray(step.risks).map((risk) => typeof risk === "string" ? risk : risk.message || risk.title || JSON.stringify(risk)),
        confidence: unit(step.confidence, unit(plan.confidence, 0.75)),
        completeness: unit(step.completeness, unit(plan.completeness, 0.75)),
        metadata: { planId, planStepId: sourceId, risks: safeArray(step.risks), validationRequirements: safeArray(step.validationRequirements) },
      };
    });
    const dependencies = [];
    for (const step of planSteps) {
      const sourceId = step.id || step.stepId;
      const targetStepId = stepIds.get(sourceId);
      for (const dep of safeArray(step.dependencies || step.dependsOn || step.dependencyIds)) {
        const depSource = typeof dep === "string" ? dep : dep.sourceStepId || dep.stepId || dep.id;
        if (stepIds.has(depSource) && targetStepId) dependencies.push({
          sourceStepId: stepIds.get(depSource),
          targetStepId,
          type: typeof dep === "object" ? dep.type : WorkflowDependencyTypes.REQUIRES_SUCCESS,
          required: typeof dep === "object" ? dep.required !== false : true,
          evidence: typeof dep === "object" ? safeArray(dep.evidence) : [],
        });
      }
    }
    for (const dep of safeArray(plan.dependencies)) {
      const source = stepIds.get(dep.sourceStepId || dep.source || dep.from);
      const target = stepIds.get(dep.targetStepId || dep.target || dep.to);
      if (source && target) dependencies.push({ ...dep, sourceStepId: source, targetStepId: target });
    }
    return {
      ...input,
      objective: input.objective || plan.objective || plan.title || "Execute accepted plan.",
      title: input.title || plan.title || "Durable workflow",
      planId,
      steps,
      dependencies,
      evidence: safeArray(plan.evidence).concat({ source: "PlanningIntelligenceEngine", planId }),
      confidence: unit(plan.confidence, 0.75),
      completeness: unit(plan.completeness, 0.75),
      metadata: { ...(input.metadata || {}), source: "accepted-plan", unsupportedPlanElements: unsupportedPlanElements(plan) },
    };
  }

  validateWorkflow(workflowIdOrInput, options = {}) {
    const workflow = typeof workflowIdOrInput === "string" ? this.requireWorkflow(workflowIdOrInput) : normalizeWorkflow(workflowIdOrInput, this, { transient: true });
    if (this.workflows.has(workflow.id)) this.workflows.get(workflow.id).state = WorkflowStates.VALIDATING;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_VALIDATION_STARTED, { workflowId: workflow.id });
    const issues = [];
    if (!workflow.id) issues.push(issue("WORKFLOW_ID", "Workflow identity is required."));
    if (!workflow.workspaceId) issues.push(issue("WORKSPACE_ID", "Workspace identity is missing.", "WARNING"));
    const steps = this.listSteps(workflow.id);
    if (steps.length > this.configuration.maximumStepsPerWorkflow) issues.push(issue("STEP_BOUND", "Workflow exceeds maximum steps per workflow."));
    if (workflow.sourceChanging && this.configuration.requirePlanForSourceChanges && !workflow.planId) issues.push(issue("PLAN_REQUIRED", "Source-changing workflows require an accepted plan."));
    const dependencyValidation = this.validateDependencies(workflow.id, { throw: false });
    issues.push(...dependencyValidation.issues);
    const duplicateSteps = duplicates(steps.map((step) => step.id));
    if (duplicateSteps.length) issues.push(issue("DUPLICATE_STEP", "Duplicate step ids detected."));
    for (const step of steps) {
      try { this.validateStep(step.id, { throw: true }); } catch (error) { issues.push(issue("INVALID_STEP", error.message)); }
      if (step.sourceChanging && this.configuration.requireValidationAfterMutation && !step.validationRequired && step.type !== WorkflowStepTypes.CHANGE_PROPOSAL) issues.push(issue("VALIDATION_REQUIRED", `Source-changing step ${step.id} requires validation.`, "WARNING"));
      if ((step.sourceChanging || step.commandExecuting || step.approvalSensitive) && this.configuration.requireApprovalForProtectedSteps && !step.approvalSensitive && ![WorkflowStepTypes.CHANGE_PROPOSAL, WorkflowStepTypes.VALIDATION].includes(step.type)) issues.push(issue("APPROVAL_REQUIRED", `Protected step ${step.id} must be approval-sensitive.`));
    }
    const valid = !issues.some((entry) => entry.severity !== "WARNING");
    const stored = this.workflows.get(workflow.id);
    if (stored) {
      stored.state = valid ? WorkflowStates.READY : WorkflowStates.BLOCKED;
      stored.warnings = unique(stored.warnings.concat(issues.filter((entry) => entry.severity === "WARNING").map((entry) => entry.message)));
      stored.limitations = unique(stored.limitations.concat(issues.filter((entry) => entry.severity !== "WARNING").map((entry) => entry.message)));
      stored.updatedAt = this.now();
      this.recalculateProgress(stored.id);
      if (valid) {
        this.stats.workflowsValidated += 1;
        this.createCheckpoint(stored.id, { type: WorkflowCheckpointTypes.PERIODIC, evidence: [{ source: "DurableWorkflowEngine", signal: "workflow validated" }] }, { silent: true });
      } else this.stats.workflowsInvalid += 1;
    }
    this.emitEvent(valid ? WorkflowEventTypes.WORKFLOW_VALIDATED : WorkflowEventTypes.WORKFLOW_INVALID, { workflowId: workflow.id, issues });
    return { workflowId: workflow.id, valid, issues, warnings: issues.filter((entry) => entry.severity === "WARNING"), evidence: [{ source: "DurableWorkflowEngine", signal: "workflow validation" }] };
  }

  async startWorkflow(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (TERMINAL_WORKFLOW_STATES.includes(workflow.state)) return clone(workflow);
    const validation = this.validateWorkflow(workflowId, { throw: false });
    if (!validation.valid) return this.blockWorkflow(workflow, validation.issues.map((entry) => entry.message).join("; "));
    workflow.state = WorkflowStates.RUNNING;
    workflow.startedAt = workflow.startedAt || this.now();
    workflow.updatedAt = this.now();
    this.stats.workflowsStarted += 1;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_STARTED, { workflowId });
    await this.scheduleWorkflow(workflowId, options);
    await this.drain({ workflowId, ...options });
    return this.finalizeWorkflow(workflowId);
  }

  pauseWorkflow(workflowId, reason = "Paused.") {
    const workflow = this.requireWorkflow(workflowId);
    workflow.state = WorkflowStates.PAUSED;
    workflow.pausedAt = this.now();
    workflow.warnings = unique(workflow.warnings.concat(reason));
    workflow.updatedAt = this.now();
    for (const step of this.listSteps(workflow.id)) if (!TERMINAL_STEP_STATES.includes(step.state)) this.pauseStep(step.id, reason);
    this.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.MANUAL, recoveryMetadata: { reason } }, { silent: true });
    this.emitEvent(WorkflowEventTypes.WORKFLOW_PAUSED, { workflowId, reason });
    return clone(workflow);
  }

  resumeWorkflow(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    const validation = this.validateWorkflow(workflowId, { throw: false });
    if (!validation.valid) return this.blockWorkflow(workflow, "Workflow failed revalidation before resume.");
    const blockedProtected = this.listSteps(workflowId).filter((step) => step.approvalSensitive && [WorkflowStepStates.INTERRUPTED, WorkflowStepStates.WAITING_FOR_APPROVAL].includes(step.state));
    if (blockedProtected.length && !options.reconfirmApproval) {
      workflow.state = WorkflowStates.WAITING_FOR_APPROVAL;
      workflow.limitations = unique(workflow.limitations.concat("Protected interrupted steps require renewed approval before resume."));
      this.emitEvent(WorkflowEventTypes.WORKFLOW_WAITING_FOR_APPROVAL, { workflowId, stepIds: blockedProtected.map((step) => step.id) });
      return clone(workflow);
    }
    workflow.state = WorkflowStates.RUNNING;
    workflow.updatedAt = this.now();
    this.emitEvent(WorkflowEventTypes.WORKFLOW_RESUMED, { workflowId });
    return clone(workflow);
  }

  suspendWorkflow(workflowId, reason = "Suspended.") {
    const workflow = this.requireWorkflow(workflowId);
    workflow.state = WorkflowStates.SUSPENDED;
    workflow.pausedAt = this.now();
    workflow.limitations = unique(workflow.limitations.concat(reason));
    workflow.updatedAt = this.now();
    this.createCheckpoint(workflow.id, { type: WorkflowCheckpointTypes.MANUAL, recoveryMetadata: { reason } }, { silent: true });
    this.emitEvent(WorkflowEventTypes.WORKFLOW_SUSPENDED, { workflowId, reason });
    return clone(workflow);
  }

  cancelWorkflow(workflowId, reason = "Cancelled.") {
    const workflow = this.requireWorkflow(workflowId);
    workflow.state = WorkflowStates.CANCELLING;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_CANCELLATION_REQUESTED, { workflowId, reason });
    for (const step of this.listSteps(workflow.id)) if (!TERMINAL_STEP_STATES.includes(step.state)) this.cancelStep(step.id, reason);
    workflow.state = WorkflowStates.CANCELLED;
    workflow.completedAt = this.now();
    workflow.updatedAt = this.now();
    workflow.limitations = unique(workflow.limitations.concat(reason));
    this.stats.workflowsCancelled += 1;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_CANCELLED, { workflowId, reason });
    this.results.set(workflowId, this.buildWorkflowResult(workflowId, WorkflowDispositions.CANCELLED));
    return clone(workflow);
  }

  async retryWorkflow(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    for (const step of this.listSteps(workflowId).filter((step) => [WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT, WorkflowStepStates.INTERRUPTED].includes(step.state))) {
      await this.retryStep(step.id, options);
    }
    workflow.state = WorkflowStates.RUNNING;
    return this.startWorkflow(workflowId, options);
  }

  expireWorkflow(workflowId, reason = "Expired.") {
    const workflow = this.requireWorkflow(workflowId);
    workflow.state = WorkflowStates.EXPIRED;
    workflow.completedAt = this.now();
    workflow.limitations = unique(workflow.limitations.concat(reason));
    workflow.updatedAt = this.now();
    this.stats.workflowsExpired += 1;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_EXPIRED, { workflowId, reason });
    this.results.set(workflowId, this.buildWorkflowResult(workflowId, WorkflowDispositions.TIMED_OUT));
    return clone(workflow);
  }

  archiveWorkflow(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (!TERMINAL_WORKFLOW_STATES.includes(workflow.state) && options.force !== true) throw new Error("Only terminal workflows can be archived unless force is true.");
    workflow.state = WorkflowStates.ARCHIVED;
    workflow.updatedAt = this.now();
    this.emitEvent(WorkflowEventTypes.WORKFLOW_ARCHIVED, { workflowId });
    return clone(workflow);
  }

  getWorkflow(workflowId) {
    return clone(this.workflows.get(requiredString(workflowId, "Workflow id is required.")) || null);
  }

  listWorkflows(filter = {}) {
    return Array.from(this.workflows.values()).filter((workflow) => matchesRecord(workflow, filter) && (filter.active !== true || isActiveWorkflow(workflow.state))).sort(compareWorkflow).map(clone);
  }

  explainWorkflow(workflowId) {
    const workflow = this.requireWorkflow(workflowId);
    const steps = this.listSteps(workflowId);
    return {
      workflow: clone(workflow),
      progress: workflow.progress,
      readySteps: this.getReadySteps(workflowId).map((step) => step.id),
      blockedSteps: steps.filter((step) => [WorkflowStepStates.BLOCKED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY].includes(step.state)).map((step) => ({ id: step.id, reason: step.error && step.error.message })),
      dependencies: this.getDependencyGraph(workflowId),
      nextAllowedActions: nextWorkflowActions(workflow),
      evidence: workflow.evidence,
    };
  }

  getWorkflowResult(workflowId) {
    const result = this.results.get(requiredString(workflowId, "Workflow id is required."));
    return clone(result || this.buildWorkflowResult(workflowId));
  }

  createStep(workflowId, input = {}, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (this.listSteps(workflowId).length >= this.configuration.maximumStepsPerWorkflow) throw new Error("Maximum steps per workflow exceeded.");
    const step = normalizeStep(workflowId, input, this, options);
    this.steps.set(step.id, step);
    workflow.stepIds = unique(workflow.stepIds.concat(step.id));
    if (!step.parentStepId) workflow.rootStepIds = unique(workflow.rootStepIds.concat(step.id));
    workflow.updatedAt = this.now();
    this.stats.stepsCreated += 1;
    this.stats.lastStep = step.id;
    if (!options.silent) this.emitEvent(WorkflowEventTypes.STEP_CREATED, { workflowId, stepId: step.id });
    return clone(step);
  }

  updateStep(stepId, patch = {}, options = {}) {
    const step = this.requireStep(stepId);
    const immutable = new Set(["id", "workflowId"]);
    for (const [key, value] of Object.entries(patch || {})) if (!immutable.has(key)) step[key] = clone(value);
    step.updatedAt = this.now();
    if (step.approvalRequestId && protectedShapeChanged(patch)) {
      step.approvalRequestId = null;
      step.state = WorkflowStepStates.WAITING_FOR_APPROVAL;
      this.emitEvent(WorkflowEventTypes.APPROVAL_INVALIDATED, { workflowId: step.workflowId, stepId });
    }
    if (options.revalidate !== false) this.validateStep(stepId, { throw: false });
    return clone(step);
  }

  validateStep(stepIdOrInput, options = {}) {
    const step = typeof stepIdOrInput === "string" ? this.requireStep(stepIdOrInput) : normalizeStep(stepIdOrInput.workflowId || "transient", stepIdOrInput, this, { transient: true });
    const issues = [];
    if (!Object.values(WorkflowStepTypes).includes(step.type)) issues.push("Invalid step type.");
    if (step.dependencyIds.length > this.configuration.maximumDependenciesPerStep) issues.push("Step exceeds dependency bound.");
    if (step.maximumAttempts > this.configuration.maximumRetriesPerStep + 1) issues.push("Step maximum attempts exceeds retry bound.");
    if (step.sourceChanging && !step.approvalSensitive && step.type !== WorkflowStepTypes.CHANGE_PROPOSAL && this.configuration.requireApprovalForProtectedSteps) issues.push("Source-changing steps must be approval-sensitive.");
    if (step.commandExecuting && !step.approvalSensitive && step.type !== WorkflowStepTypes.VALIDATION && this.configuration.requireApprovalForProtectedSteps) issues.push("Command-executing steps must be approval-sensitive.");
    if (step.privacyClassification === "PROHIBITED_REMOTE" && [WorkflowStepTypes.MODEL_INFERENCE, WorkflowStepTypes.AGENT_TURN, WorkflowStepTypes.MULTI_AGENT_TEAM].includes(step.type)) issues.push("Privacy policy blocks model-assisted step.");
    try { JSON.stringify(step); } catch (_) { issues.push("Step is not serializable."); }
    if (issues.length && options.throw !== false) throw new Error(issues.join(" "));
    return { stepId: step.id, valid: issues.length === 0, issues: issues.map((message) => issue("STEP_VALIDATION", message)) };
  }

  queueStep(stepId, options = {}) {
    const step = this.requireStep(stepId);
    if (!this.canQueueStep(step)) return this.blockStep(stepId, "Step is not ready to queue.", { dependency: true });
    step.state = WorkflowStepStates.QUEUED;
    step.updatedAt = this.now();
    this.queuedSteps = unique(this.queuedSteps.concat(step.id)).slice(0, this.bounds.maximumQueuedSteps);
    this.stats.stepsQueued += 1;
    this.emitEvent(WorkflowEventTypes.STEP_QUEUED, { workflowId: step.workflowId, stepId });
    return clone(step);
  }

  async executeStep(stepId, options = {}) {
    const step = this.requireStep(stepId);
    const workflow = this.requireWorkflow(step.workflowId);
    if (TERMINAL_STEP_STATES.includes(step.state)) return clone(step);
    if (!this.capabilitiesAvailable(step).available) return this.blockStep(stepId, "Required capability is unavailable.", { capability: true });
    if (step.approvalSensitive && this.configuration.requireApprovalForProtectedSteps && !options.approvalRequestId && !step.approvalRequestId && ![WorkflowStepTypes.APPROVAL_GATE, WorkflowStepTypes.CHANGE_PROPOSAL].includes(step.type)) {
      return this.waitForApproval(step, options);
    }
    if (step.type === WorkflowStepTypes.USER_INPUT || step.type === WorkflowStepTypes.DECISION) return this.requestInputForStep(step, options);
    step.state = WorkflowStepStates.RUNNING;
    step.startedAt = step.startedAt || this.now();
    step.updatedAt = this.now();
    step.attempt += 1;
    this.runningSteps.add(step.id);
    this.queuedSteps = this.queuedSteps.filter((id) => id !== step.id);
    const attempt = normalizeAttempt(workflow.id, step.id, { attempt: step.attempt, reason: options.reason || "execute", state: step.state, inputHash: stableHash(step.input), workspaceRevision: await this.workspaceRevision(workflow, step) }, this);
    this.attempts.set(attempt.id, attempt);
    this.stats.stepsStarted += 1;
    this.emitEvent(WorkflowEventTypes.STEP_STARTED, { workflowId: workflow.id, stepId });
    try {
      if (step.sourceChanging && this.configuration.requireCheckpointBeforeMutation) this.createCheckpoint(workflow.id, { stepId, type: WorkflowCheckpointTypes.BEFORE_MUTATION });
      if (step.commandExecuting) this.createCheckpoint(workflow.id, { stepId, type: WorkflowCheckpointTypes.BEFORE_COMMAND });
      const output = await this.executeStepThroughRuntime(step, options);
      step.output = safeOutput(output);
      step.operationId = output && output.operationId || step.operationId;
      step.conversationId = output && output.conversationId || output && output.conversation && output.conversation.id || step.conversationId;
      step.turnId = output && output.turnId || output && output.turn && output.turn.id || step.turnId;
      step.teamId = output && output.teamId || output && output.team && output.team.id || step.teamId;
      step.proposalId = output && (output.proposalId || output.id && step.type === WorkflowStepTypes.CHANGE_PROPOSAL && output.id) || step.proposalId;
      step.validationId = output && (output.validationId || output.id && step.type === WorkflowStepTypes.VALIDATION && output.id) || step.validationId;
      step.state = output && output.partial ? WorkflowStepStates.PARTIALLY_SUCCEEDED : WorkflowStepStates.SUCCEEDED;
      step.progress = { completed: true, percentage: 100, stage: "completed" };
      step.completedAt = this.now();
      step.updatedAt = this.now();
      step.evidence = uniqueById(step.evidence.concat(evidenceFromOutput(output, step)));
      attempt.state = step.state;
      attempt.completedAt = this.now();
      attempt.result = safeOutput(output);
      attempt.evidence = step.evidence;
      this.runningSteps.delete(step.id);
      this.stats.stepsSucceeded += step.state === WorkflowStepStates.SUCCEEDED ? 1 : 0;
      this.stats.stepsPartiallySucceeded += step.state === WorkflowStepStates.PARTIALLY_SUCCEEDED ? 1 : 0;
      if (step.sourceChanging) this.createCheckpoint(workflow.id, { stepId, type: WorkflowCheckpointTypes.AFTER_MUTATION });
      if (step.commandExecuting) this.createCheckpoint(workflow.id, { stepId, type: WorkflowCheckpointTypes.AFTER_COMMAND });
      if (step.validationRequired || step.type === WorkflowStepTypes.VALIDATION) this.createCheckpoint(workflow.id, { stepId, type: WorkflowCheckpointTypes.VALIDATION_COMPLETE });
      this.satisfyDependenciesFrom(step.id);
      this.emitEvent(step.state === WorkflowStepStates.SUCCEEDED ? WorkflowEventTypes.STEP_SUCCEEDED : WorkflowEventTypes.STEP_PARTIALLY_SUCCEEDED, { workflowId: workflow.id, stepId });
      return clone(step);
    } catch (error) {
      this.runningSteps.delete(step.id);
      attempt.state = WorkflowStepStates.FAILED;
      attempt.completedAt = this.now();
      attempt.error = normalizeError(error, this);
      step.error = normalizeError(error, this);
      step.updatedAt = this.now();
      return this.handleStepFailure(step, error, options);
    }
  }

  pauseStep(stepId, reason = "Paused.") {
    const step = this.requireStep(stepId);
    if (!TERMINAL_STEP_STATES.includes(step.state)) step.state = WorkflowStepStates.PAUSED;
    step.warnings = unique(step.warnings.concat(reason));
    step.updatedAt = this.now();
    this.runningSteps.delete(step.id);
    this.queuedSteps = this.queuedSteps.filter((id) => id !== step.id);
    return clone(step);
  }

  resumeStep(stepId, options = {}) {
    const step = this.requireStep(stepId);
    if (step.approvalSensitive && [WorkflowStepStates.INTERRUPTED, WorkflowStepStates.WAITING_FOR_APPROVAL].includes(step.state) && !options.reconfirmApproval) return clone(step);
    step.state = this.evaluateDependencies(stepId).satisfied ? WorkflowStepStates.READY : WorkflowStepStates.WAITING_FOR_DEPENDENCY;
    step.updatedAt = this.now();
    return clone(step);
  }

  cancelStep(stepId, reason = "Cancelled.") {
    const step = this.requireStep(stepId);
    step.state = WorkflowStepStates.CANCELLED;
    step.completedAt = this.now();
    step.updatedAt = this.now();
    step.limitations = unique(step.limitations.concat(reason));
    this.runningSteps.delete(step.id);
    this.queuedSteps = this.queuedSteps.filter((id) => id !== step.id);
    this.stats.stepsCancelled += 1;
    this.emitEvent(WorkflowEventTypes.STEP_CANCELLED, { workflowId: step.workflowId, stepId, reason });
    return clone(step);
  }

  async retryStep(stepId, options = {}) {
    const step = this.requireStep(stepId);
    if (!this.retryAllowed(step, options)) return clone(step);
    step.state = WorkflowStepStates.RETRYING;
    step.error = null;
    step.updatedAt = this.now();
    this.stats.retriesScheduled += 1;
    this.emitEvent(WorkflowEventTypes.RETRY_SCHEDULED, { workflowId: step.workflowId, stepId, delayMs: deterministicBackoff(step.attempt) });
    return options.execute === false ? clone(step) : this.executeStep(stepId, { ...options, reason: "retry" });
  }

  skipStep(stepId, reason = "Skipped.", options = {}) {
    const step = this.requireStep(stepId);
    step.state = WorkflowStepStates.SKIPPED;
    step.completedAt = this.now();
    step.limitations = unique(step.limitations.concat(reason));
    step.updatedAt = this.now();
    this.stats.stepsSkipped += 1;
    if (options.blockDependents) for (const dep of this.listDependencies(step.workflowId, { sourceStepId: step.id })) this.blockStep(dep.targetStepId, `Prerequisite skipped: ${step.id}.`, { dependency: true });
    this.emitEvent(WorkflowEventTypes.STEP_SKIPPED, { workflowId: step.workflowId, stepId, reason });
    return clone(step);
  }

  blockStep(stepId, reason = "Blocked.", options = {}) {
    const step = this.requireStep(stepId);
    step.state = options.dependency ? WorkflowStepStates.BLOCKED_BY_DEPENDENCY : WorkflowStepStates.BLOCKED;
    step.error = normalizeError(new Error(reason), this, { recoverable: true });
    step.updatedAt = this.now();
    this.stats.stepsBlocked += 1;
    this.emitEvent(WorkflowEventTypes.STEP_BLOCKED, { workflowId: step.workflowId, stepId, reason });
    return clone(step);
  }

  getStep(stepId) {
    return clone(this.steps.get(requiredString(stepId, "Step id is required.")) || null);
  }

  listSteps(workflowId, filter = {}) {
    return Array.from(this.steps.values()).filter((step) => step.workflowId === workflowId && matchesRecord(step, filter)).sort(compareStep).map(clone);
  }

  getReadySteps(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (![WorkflowStates.READY, WorkflowStates.RUNNING, WorkflowStates.QUEUED, WorkflowStates.WAITING_FOR_DEPENDENCY].includes(workflow.state)) return [];
    return this.listSteps(workflowId).filter((step) => !TERMINAL_STEP_STATES.includes(step.state) && this.canQueueStep(step)).sort(scheduleOrder).slice(0, options.limit || this.configuration.maximumConcurrentSteps);
  }

  explainStep(stepId) {
    const step = this.requireStep(stepId);
    return {
      step: clone(step),
      dependencies: this.listDependencies(step.workflowId, { targetStepId: step.id }),
      dependents: this.listDependencies(step.workflowId, { sourceStepId: step.id }),
      dependencyState: this.evaluateDependencies(step.id),
      capabilityState: this.capabilitiesAvailable(step),
      nextAllowedActions: nextStepActions(step),
    };
  }

  addDependency(workflowId, dependency = {}, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    const dep = normalizeDependency(workflow.id, dependency, this);
    if (this.listDependencies(workflowId, { targetStepId: dep.targetStepId }).length >= this.configuration.maximumDependenciesPerStep) throw new Error("Maximum dependencies per step exceeded.");
    this.dependencies.set(dep.id, dep);
    const target = this.steps.get(dep.targetStepId);
    const source = this.steps.get(dep.sourceStepId);
    if (target) target.dependencyIds = unique(target.dependencyIds.concat(dep.id));
    if (source) source.dependentIds = unique(source.dependentIds.concat(dep.id));
    this.rebuildWorkflowIndexes(workflowId);
    return clone(dep);
  }

  removeDependency(dependencyId) {
    const dep = this.requireDependency(dependencyId);
    this.dependencies.delete(dep.id);
    for (const step of this.steps.values()) {
      step.dependencyIds = step.dependencyIds.filter((id) => id !== dep.id);
      step.dependentIds = step.dependentIds.filter((id) => id !== dep.id);
    }
    return true;
  }

  validateDependencies(workflowId, options = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { valid: false, issues: [issue("WORKFLOW_MISSING", "Workflow does not exist.")] };
    const issues = [];
    const steps = new Set(this.listSteps(workflowId).map((step) => step.id));
    const deps = this.listDependencies(workflowId);
    const seen = new Set();
    for (const dep of deps) {
      if (dep.sourceStepId === dep.targetStepId) issues.push(issue("SELF_DEPENDENCY", "Step depends on itself."));
      if (!steps.has(dep.sourceStepId) || !steps.has(dep.targetStepId)) issues.push(issue("UNRELATED_DEPENDENCY", "Dependency references a missing or unrelated step."));
      const sig = `${dep.sourceStepId}->${dep.targetStepId}:${dep.type}`;
      if (seen.has(sig)) issues.push(issue("DUPLICATE_DEPENDENCY", "Duplicate dependency detected."));
      seen.add(sig);
      const source = this.steps.get(dep.sourceStepId);
      if (source && source.state === WorkflowStepStates.EXPIRED && dep.required) issues.push(issue("EXPIRED_DEPENDENCY", "Required dependency points at an expired step."));
      if (source && source.metadata && source.metadata.optional === true && dep.required) issues.push(issue("OPTIONAL_REQUIRED", "Required dependency points at optional step.", "WARNING"));
    }
    if (hasCycle(Array.from(steps), deps)) issues.push(issue("CIRCULAR_DEPENDENCY", "Workflow dependency graph contains a cycle."));
    const depth = graphDepth(Array.from(steps), deps);
    if (depth > this.configuration.maximumWorkflowDepth) issues.push(issue("EXCESSIVE_DEPTH", "Workflow dependency depth exceeds bounds."));
    const valid = !issues.some((entry) => entry.severity !== "WARNING");
    if (!valid && options.throw) throw new Error(issues.map((entry) => entry.message).join(" "));
    return { workflowId, valid, issues, depth };
  }

  evaluateDependencies(stepId, options = {}) {
    const step = this.requireStep(stepId);
    const deps = this.listDependencies(step.workflowId, { targetStepId: step.id });
    const blocked = [];
    const satisfied = [];
    for (const dep of deps) {
      const source = this.steps.get(dep.sourceStepId);
      const ok = dependencySatisfied(dep, source, this);
      dep.satisfied = ok;
      dep.satisfiedBy = ok ? source && source.id || null : null;
      if (ok) {
        satisfied.push(dep.id);
        this.emitEvent(WorkflowEventTypes.DEPENDENCY_SATISFIED, { workflowId: step.workflowId, dependencyId: dep.id });
      } else if (dep.required) {
        blocked.push(dep.id);
        if (source && [WorkflowStepStates.FAILED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY, WorkflowStepStates.CANCELLED, WorkflowStepStates.EXPIRED].includes(source.state)) this.emitEvent(WorkflowEventTypes.DEPENDENCY_BLOCKED, { workflowId: step.workflowId, dependencyId: dep.id });
      }
    }
    return { stepId, satisfied: blocked.length === 0, satisfiedDependencies: satisfied, blockedDependencies: blocked };
  }

  getDependency(dependencyId) {
    return clone(this.dependencies.get(requiredString(dependencyId, "Dependency id is required.")) || null);
  }

  listDependencies(workflowId, filter = {}) {
    return Array.from(this.dependencies.values()).filter((dep) => dep.workflowId === workflowId && matchesRecord(dep, filter)).sort(compareId).map(clone);
  }

  getDependencyGraph(workflowId) {
    return {
      workflowId,
      nodes: this.listSteps(workflowId).map((step) => ({ id: step.id, state: step.state, type: step.type, sequence: step.sequence })),
      edges: this.listDependencies(workflowId).map((dep) => ({ id: dep.id, from: dep.sourceStepId, to: dep.targetStepId, type: dep.type, satisfied: dep.satisfied })),
    };
  }

  createCheckpoint(workflowId, input = {}, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (this.checkpoints.size >= this.bounds.maximumCheckpoints) trimOldestMap(this.checkpoints, this.bounds.maximumCheckpoints - 1);
    const checkpoint = normalizeCheckpoint(workflowId, input, this);
    this.checkpoints.set(checkpoint.id, checkpoint);
    workflow.currentCheckpointId = checkpoint.id;
    workflow.checkpointIds = unique(workflow.checkpointIds.concat(checkpoint.id)).slice(-this.configuration.maximumCheckpointHistory);
    workflow.updatedAt = this.now();
    this.stats.checkpointsCreated += 1;
    this.stats.lastCheckpoint = checkpoint.id;
    if (!options.silent) this.emitEvent(WorkflowEventTypes.CHECKPOINT_CREATED, { workflowId, checkpointId: checkpoint.id });
    return clone(checkpoint);
  }

  restoreCheckpoint(checkpointId, options = {}) {
    const checkpoint = this.requireCheckpoint(checkpointId);
    this.emitEvent(WorkflowEventTypes.CHECKPOINT_RESTORE_STARTED, { workflowId: checkpoint.workflowId, checkpointId });
    try {
      const workflow = this.requireWorkflow(checkpoint.workflowId);
      for (const [stepId, state] of Object.entries(checkpoint.stepStates || {})) {
        const step = this.steps.get(stepId);
        if (step) {
          step.state = state;
          step.updatedAt = this.now();
          if (step.approvalSensitive && options.rebindApprovals !== true) step.approvalRequestId = null;
        }
      }
      workflow.activeStepIds = safeArray(checkpoint.activeStepIds);
      workflow.completedStepIds = safeArray(checkpoint.completedStepIds);
      workflow.failedStepIds = safeArray(checkpoint.failedStepIds);
      workflow.currentCheckpointId = checkpoint.id;
      workflow.state = WorkflowStates.SUSPENDED;
      workflow.confidence = Math.min(workflow.confidence, checkpoint.confidence || workflow.confidence);
      workflow.completeness = Math.min(workflow.completeness, checkpoint.completeness || workflow.completeness);
      workflow.updatedAt = this.now();
      this.stats.checkpointsRestored += 1;
      this.emitEvent(WorkflowEventTypes.CHECKPOINT_RESTORED, { workflowId: workflow.id, checkpointId });
      return { status: "RESTORED", checkpoint: clone(checkpoint), workflow: clone(workflow) };
    } catch (error) {
      this.stats.checkpointRestoreFailures += 1;
      this.emitEvent(WorkflowEventTypes.CHECKPOINT_RESTORE_FAILED, { checkpointId, error: normalizeError(error, this) });
      throw error;
    }
  }

  validateCheckpoint(checkpointId, options = {}) {
    const checkpoint = this.requireCheckpoint(checkpointId);
    const workflow = this.workflows.get(checkpoint.workflowId);
    const issues = [];
    if (!workflow) issues.push(issue("WORKFLOW_MISSING", "Checkpoint workflow is missing."));
    for (const stepId of Object.keys(checkpoint.stepStates || {})) if (!this.steps.has(stepId)) issues.push(issue("STEP_MISSING", `Checkpoint references missing step ${stepId}.`));
    const valid = issues.length === 0;
    this.emitEvent(WorkflowEventTypes.CHECKPOINT_VALIDATED, { workflowId: checkpoint.workflowId, checkpointId, valid });
    if (!valid && options.throw) throw new Error(issues.map((entry) => entry.message).join(" "));
    return { checkpointId, valid, issues };
  }

  getCheckpoint(checkpointId) {
    return clone(this.checkpoints.get(requiredString(checkpointId, "Checkpoint id is required.")) || null);
  }

  listCheckpoints(workflowId, filter = {}) {
    return Array.from(this.checkpoints.values()).filter((checkpoint) => checkpoint.workflowId === workflowId && matchesRecord(checkpoint, filter)).sort(compareCreated).map(clone);
  }

  compareCheckpoints(firstId, secondId) {
    const first = this.requireCheckpoint(firstId);
    const second = this.requireCheckpoint(secondId);
    return {
      firstId,
      secondId,
      sameWorkflow: first.workflowId === second.workflowId,
      stateChanges: diffObjects(first.stepStates, second.stepStates),
      activeStepChanges: diffArrays(first.activeStepIds, second.activeStepIds),
      completedStepChanges: diffArrays(first.completedStepIds, second.completedStepIds),
      confidenceDelta: Number(((second.confidence || 0) - (first.confidence || 0)).toFixed(6)),
      completenessDelta: Number(((second.completeness || 0) - (first.completeness || 0)).toFixed(6)),
    };
  }

  requestDecision(workflowId, input = {}, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (this.decisions.size >= this.bounds.maximumDecisions) throw new Error("Maximum decisions exceeded.");
    const decision = normalizeDecision(workflowId, input, this);
    this.decisions.set(decision.id, decision);
    workflow.state = WorkflowStates.WAITING_FOR_INPUT;
    workflow.updatedAt = this.now();
    this.stats.decisionsRequested += 1;
    this.emitEvent(WorkflowEventTypes.DECISION_REQUESTED, { workflowId, decisionId: decision.id });
    this.emitEvent(WorkflowEventTypes.WORKFLOW_WAITING_FOR_INPUT, { workflowId, decisionId: decision.id });
    return clone(decision);
  }

  resolveDecision(decisionId, input = {}, options = {}) {
    const decision = this.requireDecision(decisionId);
    if (decision.resolvedAt) return clone(decision);
    decision.selectedOption = input.selectedOption || input.option || null;
    decision.rationale = input.rationale || input.reason || null;
    decision.authority = input.authority || input.decidedBy || "user";
    decision.resolvedAt = this.now();
    decision.evidence = uniqueById(decision.evidence.concat(safeArray(input.evidence)));
    this.stats.decisionsResolved += 1;
    const step = decision.stepId && this.steps.get(decision.stepId);
    if (step) {
      step.output = { decisionId: decision.id, selectedOption: decision.selectedOption, authority: decision.authority };
      step.state = WorkflowStepStates.SUCCEEDED;
      step.completedAt = this.now();
      step.updatedAt = this.now();
    }
    const workflow = this.workflows.get(decision.workflowId);
    if (workflow && workflow.state === WorkflowStates.WAITING_FOR_INPUT) workflow.state = WorkflowStates.READY;
    this.createCheckpoint(decision.workflowId, { stepId: decision.stepId, type: WorkflowCheckpointTypes.USER_DECISION, evidence: decision.evidence }, { silent: true });
    this.emitEvent(WorkflowEventTypes.DECISION_RESOLVED, { workflowId: decision.workflowId, decisionId: decision.id });
    return clone(decision);
  }

  cancelDecision(decisionId, reason = "Cancelled.") {
    const decision = this.requireDecision(decisionId);
    decision.cancelledAt = this.now();
    decision.rationale = reason;
    return clone(decision);
  }

  getDecision(decisionId) {
    return clone(this.decisions.get(requiredString(decisionId, "Decision id is required.")) || null);
  }

  listDecisions(filter = {}) {
    return Array.from(this.decisions.values()).filter((decision) => matchesRecord(decision, filter)).sort(compareCreated).map(clone);
  }

  async scheduleWorkflow(workflowId, options = {}) {
    const workflow = this.requireWorkflow(workflowId);
    if (workflow.state === WorkflowStates.READY) workflow.state = WorkflowStates.QUEUED;
    this.emitEvent(WorkflowEventTypes.WORKFLOW_QUEUED, { workflowId });
    return this.scheduleReadySteps(workflowId, options);
  }

  async scheduleReadySteps(workflowId, options = {}) {
    const ready = this.getReadySteps(workflowId, options);
    for (const step of ready) this.queueStep(step.id, options);
    return { workflowId, queuedStepIds: ready.map((step) => step.id) };
  }

  async tick(options = {}) {
    const workflowIds = options.workflowId ? [options.workflowId] : this.listWorkflows({ active: true }).map((workflow) => workflow.id);
    const results = [];
    for (const workflowId of workflowIds) {
      await this.scheduleReadySteps(workflowId, options);
      const queued = this.queuedSteps.map((id) => this.steps.get(id)).filter((step) => step && step.workflowId === workflowId).sort(scheduleOrder);
      for (const step of queued) {
        if (this.runningSteps.size >= this.configuration.maximumConcurrentSteps) break;
        if (!this.safeToRunConcurrently(step)) continue;
        results.push(await this.executeStep(step.id, options));
      }
      this.finalizeWorkflow(workflowId);
    }
    return { status: "TICKED", results: results.map((step) => step.id) };
  }

  async drain(options = {}) {
    let ticks = 0;
    const maxTicks = options.maximumTicks || this.configuration.maximumStepsPerWorkflow * 2;
    while (ticks < maxTicks) {
      ticks += 1;
      const before = this.queuedSteps.length + this.runningSteps.size + this.readyCount(options.workflowId);
      await this.tick(options);
      const after = this.queuedSteps.length + this.runningSteps.size + this.readyCount(options.workflowId);
      const waiting = options.workflowId && [WorkflowStates.WAITING_FOR_APPROVAL, WorkflowStates.WAITING_FOR_INPUT, WorkflowStates.PAUSED, WorkflowStates.BLOCKED].includes(this.requireWorkflow(options.workflowId).state);
      if (waiting || (after === 0 && before === 0) || TERMINAL_WORKFLOW_STATES.includes(options.workflowId && this.requireWorkflow(options.workflowId).state)) break;
    }
    return { status: "DRAINED", ticks };
  }

  getSchedule(workflowId) {
    return {
      workflowId,
      ready: this.getReadySteps(workflowId).map((step) => step.id),
      queued: this.getQueuedSteps({ workflowId }).map((step) => step.id),
      running: this.getRunningSteps({ workflowId }).map((step) => step.id),
      graph: this.getDependencyGraph(workflowId),
    };
  }

  getRunningSteps(filter = {}) {
    return Array.from(this.runningSteps).map((id) => this.steps.get(id)).filter(Boolean).filter((step) => matchesRecord(step, filter)).map(clone);
  }

  getQueuedSteps(filter = {}) {
    return this.queuedSteps.map((id) => this.steps.get(id)).filter(Boolean).filter((step) => matchesRecord(step, filter)).map(clone);
  }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw new Error("Workflow event listener must be a function.");
    if (this.listeners.size >= this.bounds.maximumListeners) throw new Error("Maximum workflow listeners exceeded.");
    const id = this.nextId("workflow-subscription", { filter, count: this.listeners.size + 1 });
    this.listeners.set(id, { id, listener, filter: clone(filter || {}) });
    return id;
  }

  unsubscribe(subscriptionId) {
    return this.listeners.delete(requiredString(subscriptionId, "Subscription id is required."));
  }

  getEvents(filter = {}) {
    return this.events.filter((event) => eventMatches(event, filter)).map(clone);
  }

  clearEvents(options = {}) {
    if (options.keepCritical) this.events = this.events.filter((event) => /failed|blocked|approval|corruption|recovery/.test(event.type));
    else this.events = [];
    return { status: "CLEARED", count: this.events.length };
  }

  runtimeCommand(commandId, input = {}, options = {}) {
    if (!this.runtime || typeof this.runtime.executeCommand !== "function") return Promise.resolve({ status: "UNCONFIGURED", commandId });
    return this.runtime.executeCommand(commandId, input, options);
  }

  agentEngine() {
    if (this.agentOrchestrator) return this.agentOrchestrator;
    if (this.runtime && typeof this.runtime.agentEngine === "function") return this.runtime.agentEngine();
    return null;
  }

  multiAgentEngine() {
    if (this.multiAgentCoordinator) return this.multiAgentCoordinator;
    if (this.runtime && typeof this.runtime.multiAgentEngine === "function") return this.runtime.multiAgentEngine();
    return null;
  }

  workspaceToolEngine() {
    if (this.workspaceTools) return this.workspaceTools;
    if (this.runtime && typeof this.runtime.workspaceToolsEngine === "function") return this.runtime.workspaceToolsEngine();
    return null;
  }

  modelGatewayEngine() {
    if (this.modelGateway) return this.modelGateway;
    const descriptor = this.runtime && this.runtime.components && this.runtime.components.get("ModelProviderGateway");
    return descriptor && descriptor.instance || null;
  }

  disabledResult() {
    return { status: "DISABLED", workflowAvailable: false, warnings: ["DurableWorkflowEngine is disabled."] };
  }

  requireWorkflow(workflowId) {
    const workflow = this.workflows.get(requiredString(workflowId, "Workflow id is required."));
    if (!workflow) throw new Error(`Workflow does not exist: ${workflowId}.`);
    return workflow;
  }

  requireStep(stepId) {
    const step = this.steps.get(requiredString(stepId, "Step id is required."));
    if (!step) throw new Error(`Workflow step does not exist: ${stepId}.`);
    return step;
  }

  requireDependency(dependencyId) {
    const dep = this.dependencies.get(requiredString(dependencyId, "Dependency id is required."));
    if (!dep) throw new Error(`Workflow dependency does not exist: ${dependencyId}.`);
    return dep;
  }

  requireCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.get(requiredString(checkpointId, "Checkpoint id is required."));
    if (!checkpoint) throw new Error(`Workflow checkpoint does not exist: ${checkpointId}.`);
    return checkpoint;
  }

  requireDecision(decisionId) {
    const decision = this.decisions.get(requiredString(decisionId, "Decision id is required."));
    if (!decision) throw new Error(`Workflow decision does not exist: ${decisionId}.`);
    return decision;
  }

  canQueueStep(step) {
    if (TERMINAL_STEP_STATES.includes(step.state)) return false;
    if ([WorkflowStepStates.QUEUED, WorkflowStepStates.RUNNING, WorkflowStepStates.WAITING_FOR_APPROVAL, WorkflowStepStates.WAITING_FOR_INPUT, WorkflowStepStates.PAUSED, WorkflowStepStates.BLOCKED].includes(step.state)) return false;
    return this.evaluateDependencies(step.id).satisfied && this.capabilitiesAvailable(step).available;
  }

  safeToRunConcurrently(step) {
    if (this.runningSteps.size >= this.configuration.maximumConcurrentSteps) return false;
    const running = this.getRunningSteps({ workflowId: step.workflowId });
    if (step.sourceChanging || step.commandExecuting) return running.length === 0;
    if (!this.configuration.allowParallelReadOnlySteps) return running.length === 0;
    const overlap = running.some((other) => scopesOverlap(step.requiredWorkspaceState, other.requiredWorkspaceState) || (step.sourceChanging && other.sourceChanging) || (step.commandExecuting && other.commandExecuting));
    return !overlap;
  }

  capabilitiesAvailable(step) {
    const runtimeAvailable = !!this.runtime && typeof this.runtime.executeCommand === "function";
    if (!runtimeAvailable) return { available: false, unavailable: ["LeviApplicationRuntime"] };
    const commands = typeof this.runtime.listCommands === "function" ? this.runtime.listCommands({}).map((command) => command.id) : [];
    const requiredCommand = commandForStep(step);
    const unavailable = [];
    if (requiredCommand && !commands.includes(requiredCommand)) unavailable.push(requiredCommand);
    for (const capability of step.requiredCapabilities) {
      const health = this.runtime.getRuntimeHealth && this.runtime.getRuntimeHealth({ skipChecks: true });
      if (health && safeArray(health.unavailableCapabilities).includes(capability)) unavailable.push(capability);
    }
    return { available: unavailable.length === 0, unavailable, requiredCommand };
  }

  async executeStepThroughRuntime(step, options = {}) {
    const input = { ...clone(step.input || {}), workflowId: step.workflowId, stepId: step.id, objective: step.objective, workspaceId: step.input && step.input.workspaceId || this.workflows.get(step.workflowId).workspaceId, projectId: this.workflows.get(step.workflowId).projectId };
    if (step.type === WorkflowStepTypes.ANALYSIS || step.type === WorkflowStepTypes.PROJECT_ASSESSMENT) return unwrapRuntimeResult(await this.runtimeCommand("project.assessment", input, options));
    if (step.type === WorkflowStepTypes.SEARCH) return unwrapRuntimeResult(await this.runtimeCommand("repository.search", { ...input, query: input.query || step.objective }, options));
    if (step.type === WorkflowStepTypes.CODE_UNDERSTANDING) return unwrapRuntimeResult(await this.runtimeCommand("code.understand", input, options));
    if (step.type === WorkflowStepTypes.PLANNING) return unwrapRuntimeResult(await this.runtimeCommand("planning.create", input, options));
    if (step.type === WorkflowStepTypes.CONTEXT_BUILD) return unwrapRuntimeResult(await this.runtimeCommand("context.build", input, options));
    if (step.type === WorkflowStepTypes.MODEL_INFERENCE) return unwrapRuntimeResult(await this.runtimeCommand("model.complete", input, options));
    if (step.type === WorkflowStepTypes.AGENT_TURN) return this.executeAgentStep(step, input, options);
    if (step.type === WorkflowStepTypes.MULTI_AGENT_TEAM) return unwrapRuntimeResult(await this.runtimeCommand("multiAgent.createTeam", input, options)).id
      ? this.executeMultiAgentStep(step, input, options)
      : unwrapRuntimeResult(await this.runtimeCommand("multiAgent.startTeam", input, options));
    if (step.type === WorkflowStepTypes.CHANGE_PROPOSAL) return unwrapRuntimeResult(await this.runtimeCommand("change.createProposal", input, options));
    if (step.type === WorkflowStepTypes.CHANGE_REVIEW) return unwrapRuntimeResult(await this.runtimeCommand("change.validateProposal", input, options));
    if (step.type === WorkflowStepTypes.CHANGE_APPLY) return unwrapRuntimeResult(await this.runtimeCommand("change.apply", { ...input, approvalRequestId: options.approvalRequestId || step.approvalRequestId }, options));
    if (step.type === WorkflowStepTypes.VALIDATION) return unwrapRuntimeResult(await this.runtimeCommand("validation.run", input, options));
    if (step.type === WorkflowStepTypes.REPAIR) return unwrapRuntimeResult(await this.runtimeCommand("execution.repair", input, options));
    if (step.type === WorkflowStepTypes.COMMAND) return unwrapRuntimeResult(await this.runtimeCommand("command.runValidation", input, options));
    if (step.type === WorkflowStepTypes.SOURCE_CONTROL_CHECKPOINT) return unwrapRuntimeResult(await this.runtimeCommand("sourceControl.checkpoint", input, options));
    if (step.type === WorkflowStepTypes.SOURCE_CONTROL_RESTORE) return unwrapRuntimeResult(await this.runtimeCommand("sourceControl.restore", input, options));
    if (step.type === WorkflowStepTypes.CHECKPOINT) return this.createCheckpoint(step.workflowId, { stepId: step.id, type: WorkflowCheckpointTypes.MANUAL, evidence: step.evidence });
    if (step.type === WorkflowStepTypes.SYNTHESIS || step.type === WorkflowStepTypes.DOCUMENTATION || step.type === WorkflowStepTypes.RELEASE_ASSESSMENT || step.type === WorkflowStepTypes.CUSTOM) return { status: "REFERENCE_ONLY", summary: step.objective, evidence: step.evidence };
    return { status: "NO_EXECUTOR", type: step.type, evidence: [{ source: "DurableWorkflowEngine", signal: "no direct executor" }] };
  }

  async executeAgentStep(step, input, options) {
    const created = unwrapRuntimeResult(await this.runtimeCommand("agent.createConversation", { ...input, title: step.title }, options));
    const conversationId = input.conversationId || created.id || created.conversationId || created.conversation && created.conversation.id;
    const sent = unwrapRuntimeResult(await this.runtimeCommand("agent.sendMessage", { ...input, conversationId, message: step.objective }, options));
    return { ...sent, conversationId, turnId: sent.turnId || sent.turn && sent.turn.id };
  }

  async executeMultiAgentStep(step, input, options) {
    const created = unwrapRuntimeResult(await this.runtimeCommand("multiAgent.createTeam", input, options));
    const teamId = created.id || created.teamId;
    const started = unwrapRuntimeResult(await this.runtimeCommand("multiAgent.startTeam", { teamId, options: input.options || {} }, options));
    const result = unwrapRuntimeResult(await this.runtimeCommand("multiAgent.reconcile", { teamId }, options));
    return { ...result, teamId, team: started };
  }

  waitForApproval(step, options = {}) {
    step.state = WorkflowStepStates.WAITING_FOR_APPROVAL;
    step.approvalRequestId = step.approvalRequestId || this.nextId("workflow-approval", { workflowId: step.workflowId, stepId: step.id });
    step.checkpointId = this.createCheckpoint(step.workflowId, {
      stepId: step.id,
      type: step.sourceChanging ? WorkflowCheckpointTypes.BEFORE_MUTATION : step.commandExecuting ? WorkflowCheckpointTypes.BEFORE_COMMAND : WorkflowCheckpointTypes.BEFORE_PROTECTED_ACTION,
      approvalReferences: [step.approvalRequestId],
      recoveryMetadata: {
        protectedAction: step.type,
        objective: step.objective,
        approvalExpiresAt: options.approvalExpiresAt || null,
        protectedAutoResume: false,
      },
    }).id;
    const workflow = this.requireWorkflow(step.workflowId);
    workflow.state = WorkflowStates.WAITING_FOR_APPROVAL;
    workflow.approvalRequestIds = unique(workflow.approvalRequestIds.concat(step.approvalRequestId));
    this.stats.approvalsRequested += 1;
    this.emitEvent(WorkflowEventTypes.STEP_WAITING_FOR_APPROVAL, { workflowId: step.workflowId, stepId: step.id, approvalRequestId: step.approvalRequestId });
    this.emitEvent(WorkflowEventTypes.WORKFLOW_WAITING_FOR_APPROVAL, { workflowId: step.workflowId, stepId: step.id, approvalRequestId: step.approvalRequestId });
    return clone(step);
  }

  requestInputForStep(step, options = {}) {
    step.state = WorkflowStepStates.WAITING_FOR_INPUT;
    const decision = this.requestDecision(step.workflowId, {
      stepId: step.id,
      type: step.type,
      question: step.input && step.input.question || step.objective || "User input required.",
      options: safeArray(step.input && step.input.options),
      evidence: step.evidence,
    }, options);
    step.metadata = { ...step.metadata, decisionId: decision.id };
    this.emitEvent(WorkflowEventTypes.STEP_WAITING_FOR_INPUT, { workflowId: step.workflowId, stepId: step.id, decisionId: decision.id });
    return clone(step);
  }

  retryAllowed(step, options = {}) {
    if (!step.retryable) return false;
    if (step.attempt >= step.maximumAttempts) return false;
    if (step.approvalSensitive && !options.reconfirmApproval && !options.approvalRequestId) return false;
    if (step.error && /approval rejected|privacy|prohibited|invalid patch|stale protected|cancel/i.test(step.error.message || "")) return false;
    const lastFailures = Array.from(this.attempts.values()).filter((attempt) => attempt.stepId === step.id && attempt.error).slice(-2);
    if (lastFailures.length >= 2 && lastFailures.every((attempt) => attempt.inputHash === stableHash(step.input)) && !options.changedEvidence) return false;
    return true;
  }

  async handleStepFailure(step, error, options = {}) {
    const workflow = this.requireWorkflow(step.workflowId);
    const normalized = normalizeError(error, this);
    step.error = normalized;
    if (this.retryAllowed(step, options) && [WorkflowFailurePolicies.RETRY, WorkflowFailurePolicies.REPAIR_THEN_RETRY].includes(step.failurePolicy)) {
      this.stats.retriesScheduled += 1;
      step.state = WorkflowStepStates.RETRYING;
      this.emitEvent(WorkflowEventTypes.STEP_RETRYING, { workflowId: step.workflowId, stepId: step.id });
      return this.retryStep(step.id, { ...options, changedEvidence: true });
    }
    if (step.repairAllowed && step.failurePolicy === WorkflowFailurePolicies.REPAIR_THEN_RETRY && step.metadata.repairAttempts < this.configuration.maximumRepairAttemptsPerStep) {
      step.state = WorkflowStepStates.REPAIRING;
      step.metadata.repairAttempts += 1;
      this.stats.repairsStarted += 1;
      this.emitEvent(WorkflowEventTypes.STEP_REPAIRING, { workflowId: step.workflowId, stepId: step.id });
      const repairStep = this.createStep(workflow.id, {
        type: WorkflowStepTypes.REPAIR,
        title: `Repair ${step.title}`,
        objective: `Repair failed step ${step.id}: ${step.objective}`,
        input: { failedStepId: step.id, error: normalized, originalObjective: step.objective },
        dependencyIds: [],
        repairAllowed: false,
      }, { silent: true });
      this.addDependency(workflow.id, { sourceStepId: step.id, targetStepId: repairStep.id, type: WorkflowDependencyTypes.SOFT_DEPENDENCY, required: false }, { silent: true });
      return clone(step);
    }
    step.state = normalized.category === "TIMEOUT" ? WorkflowStepStates.TIMED_OUT : WorkflowStepStates.FAILED;
    step.completedAt = this.now();
    this.stats.stepsFailed += 1;
    this.applyFailurePolicy(step);
    this.recalculateProgress(workflow.id);
    this.emitEvent(step.state === WorkflowStepStates.TIMED_OUT ? WorkflowEventTypes.STEP_TIMED_OUT : WorkflowEventTypes.STEP_FAILED, { workflowId: step.workflowId, stepId: step.id, error: normalized });
    return clone(step);
  }

  applyFailurePolicy(step) {
    const workflow = this.requireWorkflow(step.workflowId);
    if (step.failurePolicy === WorkflowFailurePolicies.FAIL_WORKFLOW) {
      workflow.state = WorkflowStates.FAILED;
      this.stats.workflowsFailed += 1;
      this.emitEvent(WorkflowEventTypes.WORKFLOW_FAILED, { workflowId: workflow.id, stepId: step.id });
      return;
    }
    if (step.failurePolicy === WorkflowFailurePolicies.SKIP_DEPENDENTS) {
      for (const dep of this.listDependencies(workflow.id, { sourceStepId: step.id })) this.skipStep(dep.targetStepId, `Prerequisite failed: ${step.id}.`);
      return;
    }
    if (step.failurePolicy === WorkflowFailurePolicies.CONTINUE_INDEPENDENT || step.failurePolicy === WorkflowFailurePolicies.PARTIAL_COMPLETION) return;
    for (const dep of this.listDependencies(workflow.id, { sourceStepId: step.id }).filter((entry) => entry.required)) this.blockStep(dep.targetStepId, `Prerequisite failed: ${step.id}.`, { dependency: true });
  }

  satisfyDependenciesFrom(stepId) {
    const step = this.requireStep(stepId);
    for (const dep of this.listDependencies(step.workflowId, { sourceStepId: stepId })) {
      this.evaluateDependencies(dep.targetStepId);
      const target = this.steps.get(dep.targetStepId);
      if (target && this.canQueueStep(target)) {
        target.state = WorkflowStepStates.READY;
        this.emitEvent(WorkflowEventTypes.STEP_READY, { workflowId: step.workflowId, stepId: target.id });
      }
    }
  }

  blockWorkflow(workflow, reason) {
    workflow.state = WorkflowStates.BLOCKED;
    workflow.limitations = unique(workflow.limitations.concat(reason));
    workflow.completedAt = this.now();
    workflow.updatedAt = this.now();
    this.stats.workflowsBlocked += 1;
    this.results.set(workflow.id, this.buildWorkflowResult(workflow.id, WorkflowDispositions.BLOCKED));
    this.emitEvent(WorkflowEventTypes.WORKFLOW_BLOCKED, { workflowId: workflow.id, reason });
    return clone(workflow);
  }

  finalizeWorkflow(workflowId) {
    const workflow = this.requireWorkflow(workflowId);
    if (TERMINAL_WORKFLOW_STATES.includes(workflow.state)) return clone(workflow);
    const steps = this.listSteps(workflowId);
    const required = steps.filter((step) => step.metadata.optional !== true);
    const terminal = required.every((step) => TERMINAL_STEP_STATES.includes(step.state));
    const waitingApproval = steps.some((step) => step.state === WorkflowStepStates.WAITING_FOR_APPROVAL);
    const waitingInput = steps.some((step) => step.state === WorkflowStepStates.WAITING_FOR_INPUT);
    if (waitingApproval) workflow.state = WorkflowStates.WAITING_FOR_APPROVAL;
    else if (waitingInput) workflow.state = WorkflowStates.WAITING_FOR_INPUT;
    else if (required.some((step) => [WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT].includes(step.state)) && terminal) workflow.state = required.some((step) => step.state === WorkflowStepStates.SUCCEEDED) ? WorkflowStates.PARTIALLY_COMPLETED : WorkflowStates.FAILED;
    else if (required.some((step) => [WorkflowStepStates.BLOCKED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY].includes(step.state)) && terminal) workflow.state = WorkflowStates.BLOCKED;
    else if (terminal) workflow.state = steps.some((step) => step.state === WorkflowStepStates.PARTIALLY_SUCCEEDED || step.state === WorkflowStepStates.SKIPPED) ? WorkflowStates.PARTIALLY_COMPLETED : WorkflowStates.COMPLETED;
    else if (this.readyCount(workflowId) === 0 && this.getQueuedSteps({ workflowId }).length === 0 && this.getRunningSteps({ workflowId }).length === 0) workflow.state = WorkflowStates.WAITING_FOR_DEPENDENCY;
    this.recalculateProgress(workflowId);
    if ([WorkflowStates.COMPLETED, WorkflowStates.PARTIALLY_COMPLETED, WorkflowStates.FAILED, WorkflowStates.BLOCKED].includes(workflow.state)) {
      workflow.completedAt = workflow.completedAt || this.now();
      const disposition = dispositionForWorkflow(workflow, steps);
      this.results.set(workflowId, this.buildWorkflowResult(workflowId, disposition));
      this.createCheckpoint(workflowId, { type: WorkflowCheckpointTypes.COMPLETION }, { silent: true });
      if (workflow.state === WorkflowStates.COMPLETED) {
        this.stats.workflowsCompleted += 1;
        this.emitEvent(WorkflowEventTypes.WORKFLOW_COMPLETED, { workflowId });
      } else if (workflow.state === WorkflowStates.PARTIALLY_COMPLETED) {
        this.stats.workflowsPartiallyCompleted += 1;
        this.emitEvent(WorkflowEventTypes.WORKFLOW_PARTIALLY_COMPLETED, { workflowId });
      }
      if (this.configuration.archiveCompletedWorkflows && [WorkflowStates.COMPLETED, WorkflowStates.PARTIALLY_COMPLETED].includes(workflow.state)) this.archiveWorkflow(workflowId, { force: true });
    }
    workflow.updatedAt = this.now();
    return clone(workflow);
  }

  buildWorkflowResult(workflowId, disposition = null) {
    const workflow = this.requireWorkflow(workflowId);
    const steps = this.listSteps(workflowId);
    const completed = steps.filter((step) => step.state === WorkflowStepStates.SUCCEEDED).map((step) => step.id);
    const partial = steps.filter((step) => step.state === WorkflowStepStates.PARTIALLY_SUCCEEDED).map((step) => step.id);
    const failed = steps.filter((step) => [WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT].includes(step.state)).map((step) => step.id);
    const blocked = steps.filter((step) => [WorkflowStepStates.BLOCKED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY].includes(step.state)).map((step) => step.id);
    const skipped = steps.filter((step) => step.state === WorkflowStepStates.SKIPPED).map((step) => step.id);
    const unresolvedDecisions = this.listDecisions({ workflowId }).filter((decision) => !decision.resolvedAt).map((decision) => decision.id);
    return normalizeWorkflowResult(workflowId, {
      disposition: disposition || dispositionForWorkflow(workflow, steps),
      objective: workflow.objective,
      summary: summaryForResult(workflow, steps),
      completedSteps: completed,
      partiallyCompletedSteps: partial,
      failedSteps: failed,
      blockedSteps: blocked,
      skippedSteps: skipped,
      appliedChanges: steps.filter((step) => step.type === WorkflowStepTypes.CHANGE_APPLY && step.state === WorkflowStepStates.SUCCEEDED).map((step) => step.output),
      proposedChanges: steps.filter((step) => step.proposalId || step.type === WorkflowStepTypes.CHANGE_PROPOSAL).map((step) => step.proposalId || step.output && step.output.id).filter(Boolean),
      validationState: validationStateFor(steps),
      repairState: repairStateFor(steps),
      approvalState: approvalStateFor(steps),
      unresolvedDecisions,
      unresolvedConflicts: safeArray(workflow.metadata.unresolvedConflicts),
      evidence: uniqueById(workflow.evidence.concat(steps.flatMap((step) => step.evidence))),
      warnings: unique(workflow.warnings.concat(steps.flatMap((step) => step.warnings))),
      limitations: unique(workflow.limitations.concat(steps.flatMap((step) => step.limitations))),
      confidence: confidenceFor(steps, workflow.confidence),
      completeness: workflow.completeness,
    }, this);
  }

  recalculateProgress(workflowId) {
    const workflow = this.requireWorkflow(workflowId);
    const steps = this.listSteps(workflowId);
    const terminal = steps.filter((step) => TERMINAL_STEP_STATES.includes(step.state)).length;
    const success = steps.filter((step) => [WorkflowStepStates.SUCCEEDED, WorkflowStepStates.PARTIALLY_SUCCEEDED, WorkflowStepStates.SKIPPED].includes(step.state)).length;
    const total = Math.max(1, steps.length);
    workflow.activeStepIds = steps.filter((step) => [WorkflowStepStates.QUEUED, WorkflowStepStates.STARTING, WorkflowStepStates.RUNNING, WorkflowStepStates.VALIDATING, WorkflowStepStates.REPAIRING, WorkflowStepStates.RETRYING].includes(step.state)).map((step) => step.id);
    workflow.completedStepIds = steps.filter((step) => [WorkflowStepStates.SUCCEEDED, WorkflowStepStates.PARTIALLY_SUCCEEDED].includes(step.state)).map((step) => step.id);
    workflow.failedStepIds = steps.filter((step) => [WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT, WorkflowStepStates.INTERRUPTED].includes(step.state)).map((step) => step.id);
    workflow.blockedStepIds = steps.filter((step) => [WorkflowStepStates.BLOCKED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY].includes(step.state)).map((step) => step.id);
    workflow.skippedStepIds = steps.filter((step) => step.state === WorkflowStepStates.SKIPPED).map((step) => step.id);
    workflow.progress = { totalSteps: steps.length, terminalSteps: terminal, successfulSteps: success, percentage: Math.round(success / total * 100) };
    workflow.completeness = unit(success / total, workflow.completeness);
    return workflow.progress;
  }

  rebuildWorkflowIndexes(workflowId) {
    const workflow = this.requireWorkflow(workflowId);
    const steps = this.listSteps(workflowId);
    workflow.stepIds = steps.map((step) => step.id);
    workflow.rootStepIds = steps.filter((step) => !this.listDependencies(workflowId, { targetStepId: step.id }).length).map((step) => step.id);
    workflow.dependencyGraph = this.getDependencyGraph(workflowId);
    return workflow;
  }

  readyCount(workflowId) {
    return (workflowId ? [workflowId] : this.listWorkflows({ active: true }).map((workflow) => workflow.id)).reduce((sum, id) => sum + this.getReadySteps(id).length, 0);
  }

  async workspaceRevision(workflow, step) {
    if (step.input && step.input.workspaceRevision) return step.input.workspaceRevision;
    if (this.runtime && typeof this.runtime.safeWorkspaceRevision === "function" && workflow.workspaceId && this.runtime.getWorkspace) {
      const workspace = this.runtime.getWorkspace(workflow.workspaceId);
      if (workspace) return this.runtime.safeWorkspaceRevision(workspace);
    }
    return workflow.metadata.workspaceRevision || null;
  }

  nextId(prefix, input = {}) {
    return this.idAdapter.next(prefix, { ...input, engineId: this.configuration.id });
  }

  now() {
    const value = this.clock.now();
    return typeof value === "string" ? new Date(value).toISOString() : new Date(value).toISOString();
  }

  emitEvent(type, payload = {}) {
    const event = {
      id: this.nextId("workflow-event", { type, count: this.events.length + 1 }),
      type,
      payload: safeOutput(payload),
      timestamp: this.now(),
      sequence: (this.events[this.events.length - 1] && this.events[this.events.length - 1].sequence || 0) + 1,
    };
    this.events.push(event);
    trimArray(this.events, this.bounds.maximumEventHistory);
    this.emit("workflow_event", clone(event));
    for (const subscription of this.listeners.values()) {
      if (!eventMatches(event, subscription.filter)) continue;
      try { subscription.listener(clone(event)); } catch (_) { /* listener failures should not affect workflows */ }
    }
    return event;
  }
}

class MemoryWorkflowPersistenceAdapter {
  constructor() {
    this.snapshotValue = null;
  }
  save(snapshot) {
    this.snapshotValue = clone(snapshot);
    return { status: "PERSISTED", inMemory: true };
  }
  load() {
    return this.snapshotValue ? { status: "LOADED", snapshot: clone(this.snapshotValue) } : { status: "EMPTY" };
  }
  status() {
    return { status: "AVAILABLE", inMemory: true };
  }
}

function normalizeConfiguration(input = {}) {
  const merged = deepMerge(DEFAULT_CONFIGURATION, input);
  return {
    ...merged,
    id: requiredString(merged.id, "Workflow configuration id is required."),
    schemaVersion: Number(merged.schemaVersion || DURABLE_WORKFLOW_SCHEMA_VERSION),
    enabled: merged.enabled !== false,
    defaultStrategy: normalizeEnum(merged.defaultStrategy || DEFAULT_CONFIGURATION.defaultStrategy, WorkflowExecutionStrategies),
    maximumWorkflows: positive(merged.maximumWorkflows, DEFAULT_CONFIGURATION.maximumWorkflows),
    maximumActiveWorkflows: positive(merged.maximumActiveWorkflows, DEFAULT_CONFIGURATION.maximumActiveWorkflows),
    maximumStepsPerWorkflow: positive(merged.maximumStepsPerWorkflow, DEFAULT_CONFIGURATION.maximumStepsPerWorkflow),
    maximumDependenciesPerStep: positive(merged.maximumDependenciesPerStep, DEFAULT_CONFIGURATION.maximumDependenciesPerStep),
    maximumConcurrentSteps: positive(merged.maximumConcurrentSteps, DEFAULT_CONFIGURATION.maximumConcurrentSteps),
    maximumConcurrentStepsPerWorkspace: positive(merged.maximumConcurrentStepsPerWorkspace, DEFAULT_CONFIGURATION.maximumConcurrentStepsPerWorkspace),
    maximumWorkflowDepth: positive(merged.maximumWorkflowDepth, DEFAULT_CONFIGURATION.maximumWorkflowDepth),
    maximumRetriesPerStep: positive(merged.maximumRetriesPerStep, DEFAULT_CONFIGURATION.maximumRetriesPerStep),
    maximumRepairAttemptsPerStep: positive(merged.maximumRepairAttemptsPerStep || merged.maximumRepairAttempts, DEFAULT_CONFIGURATION.maximumRepairAttemptsPerStep),
    maximumValidationAttemptsPerStep: positive(merged.maximumValidationAttemptsPerStep, DEFAULT_CONFIGURATION.maximumValidationAttemptsPerStep),
    maximumModelRequestsPerStep: positive(merged.maximumModelRequestsPerStep, DEFAULT_CONFIGURATION.maximumModelRequestsPerStep),
    maximumToolCallsPerStep: positive(merged.maximumToolCallsPerStep, DEFAULT_CONFIGURATION.maximumToolCallsPerStep),
    maximumWorkflowDurationMs: positive(merged.maximumWorkflowDurationMs, DEFAULT_CONFIGURATION.maximumWorkflowDurationMs),
    maximumStepDurationMs: positive(merged.maximumStepDurationMs, DEFAULT_CONFIGURATION.maximumStepDurationMs),
    maximumIdleDurationMs: positive(merged.maximumIdleDurationMs, DEFAULT_CONFIGURATION.maximumIdleDurationMs),
    maximumPauseDurationMs: positive(merged.maximumPauseDurationMs, DEFAULT_CONFIGURATION.maximumPauseDurationMs),
    maximumEventHistory: positive(merged.maximumEventHistory, DEFAULT_CONFIGURATION.maximumEventHistory),
    maximumCheckpointHistory: positive(merged.maximumCheckpointHistory, DEFAULT_CONFIGURATION.maximumCheckpointHistory),
    checkpointIntervalMs: positive(merged.checkpointIntervalMs, DEFAULT_CONFIGURATION.checkpointIntervalMs),
    persistenceEnabled: merged.persistenceEnabled !== false,
    autoCheckpointEnabled: merged.autoCheckpointEnabled !== false && merged.autoCheckpoint !== false,
    recoveryEnabled: merged.recoveryEnabled !== false,
    requirePlanForSourceChanges: merged.requirePlanForSourceChanges !== false,
    requireApprovalForProtectedSteps: merged.requireApprovalForProtectedSteps !== false,
    requireValidationAfterMutation: merged.requireValidationAfterMutation !== false,
    requireCheckpointBeforeMutation: merged.requireCheckpointBeforeMutation !== false,
    allowSafeAutomaticResume: merged.allowSafeAutomaticResume === true,
    allowParallelReadOnlySteps: merged.allowParallelReadOnlySteps !== false,
    archiveCompletedWorkflows: merged.archiveCompletedWorkflows === true || merged.archiveCompleted === true,
    storagePath: merged.storagePath || DEFAULT_CONFIGURATION.storagePath,
    metadata: clone(merged.metadata || {}),
  };
}

function validateConfiguration(config, bounds) {
  if (config.schemaVersion !== DURABLE_WORKFLOW_SCHEMA_VERSION) throw new Error("Unsupported workflow schema version.");
  if (config.maximumConcurrentSteps > bounds.maximumActiveSteps) throw new Error("Configured workflow concurrency exceeds bounds.");
  if (config.maximumRetriesPerStep > bounds.maximumRetriesPerStep) throw new Error("Configured workflow retry count exceeds bounds.");
  if (config.maximumStepsPerWorkflow > bounds.maximumStepsPerWorkflow) throw new Error("Configured steps per workflow exceeds bounds.");
  if (config.maximumWorkflows > bounds.maximumWorkflows) throw new Error("Configured workflow count exceeds bounds.");
  return true;
}

function normalizeBounds(input = {}) {
  const result = { ...DEFAULT_BOUNDS };
  for (const [key, value] of Object.entries(input || {})) result[key] = positive(value, result[key] || 1);
  return result;
}

function boundsFromConfiguration(config) {
  return {
    maximumWorkflows: config.maximumWorkflows,
    maximumActiveWorkflows: config.maximumActiveWorkflows,
    maximumStepsPerWorkflow: config.maximumStepsPerWorkflow,
    maximumActiveSteps: config.maximumConcurrentSteps,
    maximumDependenciesPerStep: config.maximumDependenciesPerStep,
    maximumWorkflowDepth: config.maximumWorkflowDepth,
    maximumRetriesPerStep: config.maximumRetriesPerStep,
    maximumRepairsPerStep: config.maximumRepairAttemptsPerStep,
    maximumValidationsPerStep: config.maximumValidationAttemptsPerStep,
    maximumEventHistory: config.maximumEventHistory,
    maximumCheckpoints: config.maximumCheckpointHistory,
  };
}

function normalizeWorkflow(input = {}, engine, options = {}) {
  const now = input.createdAt || engine.now();
  return {
    id: input.id || stableId("workflow", { objective: input.objective || input.title, planId: input.planId, workspaceId: input.workspaceId, createdAt: options.deterministic ? null : now }),
    workspaceId: input.workspaceId || input.workspace && input.workspace.id || null,
    projectId: input.projectId || null,
    sessionId: input.sessionId || null,
    conversationId: input.conversationId || null,
    teamId: input.teamId || null,
    objective: requiredString(input.objective || input.title || "Durable workflow objective", "Workflow objective is required."),
    title: input.title || titleFrom(input.objective || "Durable workflow"),
    description: input.description || "",
    strategy: normalizeEnum(input.strategy || engine.configuration.defaultStrategy, WorkflowExecutionStrategies),
    state: normalizeEnum(input.state || WorkflowStates.CREATED, WorkflowStates),
    planId: input.planId || null,
    rootStepIds: safeArray(input.rootStepIds),
    stepIds: safeArray(input.stepIds),
    activeStepIds: safeArray(input.activeStepIds),
    completedStepIds: safeArray(input.completedStepIds),
    failedStepIds: safeArray(input.failedStepIds),
    blockedStepIds: safeArray(input.blockedStepIds),
    skippedStepIds: safeArray(input.skippedStepIds),
    dependencyGraph: clone(input.dependencyGraph || { nodes: [], edges: [] }),
    currentCheckpointId: input.currentCheckpointId || null,
    checkpointIds: safeArray(input.checkpointIds),
    approvalRequestIds: safeArray(input.approvalRequestIds),
    operationIds: safeArray(input.operationIds),
    proposalIds: safeArray(input.proposalIds),
    validationIds: safeArray(input.validationIds),
    repairIds: safeArray(input.repairIds),
    evidence: safeArray(input.evidence).slice(0, 64),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: unit(input.confidence, 0.75),
    completeness: unit(input.completeness, 0),
    progress: clone(input.progress || { totalSteps: 0, terminalSteps: 0, successfulSteps: 0, percentage: 0 }),
    sourceChanging: input.sourceChanging === true,
    createdAt: now,
    startedAt: input.startedAt || null,
    updatedAt: input.updatedAt || now,
    pausedAt: input.pausedAt || null,
    completedAt: input.completedAt || null,
    expiresAt: input.expiresAt || null,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeStep(workflowId, input = {}, engine, options = {}) {
  const sequence = Number(input.sequence || 0) || (engine.listSteps && engine.workflows.has(workflowId) ? engine.listSteps(workflowId).length + 1 : 1);
  const type = normalizeEnum(input.type || WorkflowStepTypes.CUSTOM, WorkflowStepTypes);
  const sourceChanging = input.sourceChanging === true || [WorkflowStepTypes.CHANGE_PROPOSAL, WorkflowStepTypes.CHANGE_APPLY, WorkflowStepTypes.SOURCE_CONTROL_RESTORE].includes(type);
  const commandExecuting = input.commandExecuting === true || [WorkflowStepTypes.COMMAND, WorkflowStepTypes.VALIDATION].includes(type);
  const approvalSensitive = input.approvalSensitive === true || [WorkflowStepTypes.CHANGE_APPLY, WorkflowStepTypes.COMMAND, WorkflowStepTypes.SOURCE_CONTROL_RESTORE].includes(type) || sourceChanging && type !== WorkflowStepTypes.CHANGE_PROPOSAL;
  const now = input.createdAt || engine.now();
  return {
    id: input.id || stableId("workflow-step", { workflowId, sequence, type, title: input.title, objective: input.objective }),
    workflowId,
    parentStepId: input.parentStepId || null,
    sequence,
    type,
    title: input.title || titleFrom(input.objective || type),
    description: input.description || "",
    objective: input.objective || input.description || input.title || type,
    state: normalizeEnum(input.state || WorkflowStepStates.CREATED, WorkflowStepStates),
    priority: normalizeEnum(input.priority || WorkflowStepPriorities.NORMAL, WorkflowStepPriorities),
    dependencyIds: safeArray(input.dependencyIds),
    dependentIds: safeArray(input.dependentIds),
    dependencyPolicy: normalizeEnum(input.dependencyPolicy || WorkflowDependencyTypes.REQUIRES_SUCCESS, WorkflowDependencyTypes),
    failurePolicy: normalizeEnum(input.failurePolicy || (input.retryable === false ? WorkflowFailurePolicies.BLOCK_DEPENDENTS : WorkflowFailurePolicies.RETRY), WorkflowFailurePolicies),
    resumePolicy: normalizeEnum(input.resumePolicy || (approvalSensitive ? WorkflowResumePolicies.REQUIRE_APPROVAL_RECONFIRMATION : WorkflowResumePolicies.REQUIRE_REVALIDATION), WorkflowResumePolicies),
    requiredCapabilities: safeArray(input.requiredCapabilities),
    requiredWorkspaceState: safeArray(input.requiredWorkspaceState),
    privacyClassification: input.privacyClassification || "USER_CONTENT",
    securitySensitive: input.securitySensitive === true || approvalSensitive,
    approvalSensitive,
    sourceChanging,
    commandExecuting,
    reversible: input.reversible === true,
    idempotent: input.idempotent !== false && !sourceChanging,
    retryable: input.retryable !== false && !approvalSensitive,
    validationRequired: input.validationRequired === true || sourceChanging,
    repairAllowed: input.repairAllowed !== false && type !== WorkflowStepTypes.REPAIR,
    input: clone(input.input || {}),
    output: clone(input.output || null),
    operationId: input.operationId || null,
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    teamId: input.teamId || null,
    assignmentId: input.assignmentId || null,
    proposalId: input.proposalId || null,
    approvalRequestId: input.approvalRequestId || null,
    validationId: input.validationId || null,
    repairId: input.repairId || null,
    checkpointId: input.checkpointId || null,
    attempt: Number(input.attempt || 0),
    maximumAttempts: positive(input.maximumAttempts, engine.configuration.maximumRetriesPerStep + 1),
    progress: clone(input.progress || { percentage: 0, stage: "created" }),
    evidence: safeArray(input.evidence).slice(0, 64),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    error: clone(input.error || null),
    confidence: unit(input.confidence, 0.75),
    completeness: unit(input.completeness, 0),
    createdAt: now,
    startedAt: input.startedAt || null,
    updatedAt: input.updatedAt || now,
    completedAt: input.completedAt || null,
    expiresAt: input.expiresAt || null,
    metadata: clone({ repairAttempts: 0, validationAttempts: 0, ...(input.metadata || {}) }),
  };
}

function normalizeDependency(workflowId, input = {}, engine) {
  return {
    id: input.id || stableId("workflow-dependency", { workflowId, sourceStepId: input.sourceStepId || input.source, targetStepId: input.targetStepId || input.target, type: input.type }),
    workflowId,
    sourceStepId: requiredString(input.sourceStepId || input.source || input.from, "Dependency sourceStepId is required."),
    targetStepId: requiredString(input.targetStepId || input.target || input.to, "Dependency targetStepId is required."),
    type: normalizeEnum(input.type || WorkflowDependencyTypes.REQUIRES_SUCCESS, WorkflowDependencyTypes),
    required: input.required !== false,
    condition: clone(input.condition || null),
    satisfied: input.satisfied === true,
    satisfiedBy: input.satisfiedBy || null,
    evidence: safeArray(input.evidence),
    createdAt: input.createdAt || engine.now(),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeCheckpoint(workflowId, input = {}, engine) {
  const workflow = engine.workflows.get(workflowId) || {};
  const steps = engine.listSteps ? engine.listSteps(workflowId) : [];
  return {
    id: input.id || engine.nextId("workflow-checkpoint", { workflowId, type: input.type, stepId: input.stepId, count: engine.checkpoints.size + 1 }),
    workflowId,
    stepId: input.stepId || null,
    type: normalizeEnum(input.type || WorkflowCheckpointTypes.PERIODIC, WorkflowCheckpointTypes),
    state: workflow.state || WorkflowStates.CREATED,
    workspaceRevision: input.workspaceRevision || workflow.metadata && workflow.metadata.workspaceRevision || null,
    workflowRevision: input.workflowRevision || stableHash(summarizeWorkflow(workflow)),
    stepStates: clone(input.stepStates || Object.fromEntries(steps.map((step) => [step.id, step.state]))),
    activeStepIds: safeArray(input.activeStepIds || workflow.activeStepIds),
    completedStepIds: safeArray(input.completedStepIds || workflow.completedStepIds),
    failedStepIds: safeArray(input.failedStepIds || workflow.failedStepIds),
    approvalReferences: safeArray(input.approvalReferences || workflow.approvalRequestIds),
    operationReferences: safeArray(input.operationReferences || workflow.operationIds),
    proposalReferences: safeArray(input.proposalReferences || workflow.proposalIds),
    validationReferences: safeArray(input.validationReferences || workflow.validationIds),
    recoveryMetadata: clone(input.recoveryMetadata || {}),
    evidence: safeArray(input.evidence),
    confidence: unit(input.confidence, workflow.confidence || 0.75),
    completeness: unit(input.completeness, workflow.completeness || 0),
    createdAt: input.createdAt || engine.now(),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeAttempt(workflowId, stepId, input = {}, engine) {
  return {
    id: input.id || engine.nextId("workflow-attempt", { workflowId, stepId, attempt: input.attempt || 1 }),
    workflowId,
    stepId,
    attempt: Number(input.attempt || 1),
    reason: input.reason || "execute",
    state: input.state || WorkflowStepStates.RUNNING,
    operationId: input.operationId || null,
    inputHash: input.inputHash || null,
    workspaceRevision: input.workspaceRevision || null,
    startedAt: input.startedAt || engine.now(),
    completedAt: input.completedAt || null,
    result: safeOutput(input.result || null),
    error: clone(input.error || null),
    evidence: safeArray(input.evidence),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeDecision(workflowId, input = {}, engine) {
  return {
    id: input.id || engine.nextId("workflow-decision", { workflowId, stepId: input.stepId, question: input.question }),
    workflowId,
    stepId: input.stepId || null,
    type: input.type || "USER_INPUT",
    question: requiredString(input.question || "User decision required.", "Decision question is required."),
    options: safeArray(input.options).slice(0, 8),
    selectedOption: input.selectedOption || null,
    rationale: input.rationale || null,
    authority: input.authority || "user",
    requestedAt: input.requestedAt || engine.now(),
    resolvedAt: input.resolvedAt || null,
    evidence: safeArray(input.evidence),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeWorkflowResult(workflowId, input = {}, engine) {
  return {
    id: input.id || engine.nextId("workflow-result", { workflowId, disposition: input.disposition }),
    workflowId,
    disposition: normalizeEnum(input.disposition || WorkflowDispositions.FAILED, WorkflowDispositions),
    objective: input.objective || "",
    summary: input.summary || "",
    completedSteps: safeArray(input.completedSteps),
    partiallyCompletedSteps: safeArray(input.partiallyCompletedSteps),
    failedSteps: safeArray(input.failedSteps),
    blockedSteps: safeArray(input.blockedSteps),
    skippedSteps: safeArray(input.skippedSteps),
    appliedChanges: safeArray(input.appliedChanges),
    proposedChanges: safeArray(input.proposedChanges),
    validationState: input.validationState || "NOT_RUN",
    repairState: input.repairState || "NOT_RUN",
    approvalState: input.approvalState || "NOT_REQUIRED",
    unresolvedDecisions: safeArray(input.unresolvedDecisions),
    unresolvedConflicts: safeArray(input.unresolvedConflicts),
    evidence: safeArray(input.evidence).slice(0, 128),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: unit(input.confidence, 0.75),
    completeness: unit(input.completeness, 0),
    createdAt: input.createdAt || engine.now(),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Workflow snapshot must be an object.");
  if (Number(snapshot.schemaVersion) !== DURABLE_WORKFLOW_SCHEMA_VERSION) throw new Error("Unsupported durable workflow snapshot schema version.");
  return {
    configuration: snapshot.configuration || {},
    workflows: safeArray(snapshot.workflows),
    steps: safeArray(snapshot.steps),
    dependencies: safeArray(snapshot.dependencies),
    checkpoints: safeArray(snapshot.checkpoints),
    attempts: safeArray(snapshot.attempts),
    decisions: safeArray(snapshot.decisions),
    results: safeArray(snapshot.results),
    statistics: snapshot.statistics || snapshot.stats || {},
  };
}

function commandForStep(step) {
  return {
    [WorkflowStepTypes.ANALYSIS]: "project.assessment",
    [WorkflowStepTypes.PROJECT_ASSESSMENT]: "project.assessment",
    [WorkflowStepTypes.SEARCH]: "repository.search",
    [WorkflowStepTypes.CODE_UNDERSTANDING]: "code.understand",
    [WorkflowStepTypes.PLANNING]: "planning.create",
    [WorkflowStepTypes.CONTEXT_BUILD]: "context.build",
    [WorkflowStepTypes.MODEL_INFERENCE]: "model.complete",
    [WorkflowStepTypes.AGENT_TURN]: "agent.sendMessage",
    [WorkflowStepTypes.MULTI_AGENT_TEAM]: "multiAgent.startTeam",
    [WorkflowStepTypes.CHANGE_PROPOSAL]: "change.createProposal",
    [WorkflowStepTypes.CHANGE_REVIEW]: "change.validateProposal",
    [WorkflowStepTypes.CHANGE_APPLY]: "change.apply",
    [WorkflowStepTypes.VALIDATION]: "validation.run",
    [WorkflowStepTypes.REPAIR]: "execution.repair",
    [WorkflowStepTypes.COMMAND]: "command.runValidation",
    [WorkflowStepTypes.SOURCE_CONTROL_CHECKPOINT]: "sourceControl.checkpoint",
    [WorkflowStepTypes.SOURCE_CONTROL_RESTORE]: "sourceControl.restore",
  }[step.type] || null;
}

function dependencySatisfied(dep, source) {
  if (!source) return false;
  if (dep.type === WorkflowDependencyTypes.OPTIONAL || dep.type === WorkflowDependencyTypes.SOFT_DEPENDENCY) return ![WorkflowStepStates.RUNNING, WorkflowStepStates.QUEUED].includes(source.state);
  if (dep.type === WorkflowDependencyTypes.REQUIRES_COMPLETION) return TERMINAL_STEP_STATES.includes(source.state);
  if (dep.type === WorkflowDependencyTypes.REQUIRES_OUTPUT) return Boolean(source.output);
  if (dep.type === WorkflowDependencyTypes.REQUIRES_APPROVAL) return Boolean(source.approvalRequestId || source.output && source.output.approval);
  if (dep.type === WorkflowDependencyTypes.REQUIRES_VALIDATION) return Boolean(source.validationId || source.type === WorkflowStepTypes.VALIDATION && source.state === WorkflowStepStates.SUCCEEDED);
  if (dep.type === WorkflowDependencyTypes.MUTEX) return ![WorkflowStepStates.RUNNING, WorkflowStepStates.QUEUED].includes(source.state);
  return [WorkflowStepStates.SUCCEEDED, WorkflowStepStates.PARTIALLY_SUCCEEDED].includes(source.state);
}

function mapPlanStepType(step = {}) {
  const value = `${step.type || ""} ${step.title || ""} ${step.description || ""}`.toLowerCase();
  if (/search/.test(value)) return WorkflowStepTypes.SEARCH;
  if (/understand|inspect|analy/.test(value)) return WorkflowStepTypes.CODE_UNDERSTANDING;
  if (/plan/.test(value)) return WorkflowStepTypes.PLANNING;
  if (/context/.test(value)) return WorkflowStepTypes.CONTEXT_BUILD;
  if (/agent/.test(value)) return WorkflowStepTypes.AGENT_TURN;
  if (/team|review board|multi/.test(value)) return WorkflowStepTypes.MULTI_AGENT_TEAM;
  if (/proposal|patch|change/.test(value) && !/apply/.test(value)) return WorkflowStepTypes.CHANGE_PROPOSAL;
  if (/apply|mutat/.test(value)) return WorkflowStepTypes.CHANGE_APPLY;
  if (/validat|test|lint|build/.test(value)) return WorkflowStepTypes.VALIDATION;
  if (/repair|fix/.test(value)) return WorkflowStepTypes.REPAIR;
  if (/document/.test(value)) return WorkflowStepTypes.DOCUMENTATION;
  return WorkflowStepTypes.ANALYSIS;
}

function unsupportedPlanElements(plan = {}) {
  return Object.keys(plan).filter((key) => !["id", "planId", "title", "objective", "description", "steps", "planSteps", "dependencies", "evidence", "confidence", "completeness", "metadata"].includes(key));
}

function dispositionForWorkflow(workflow, steps) {
  if (workflow.state === WorkflowStates.CANCELLED) return WorkflowDispositions.CANCELLED;
  if (workflow.state === WorkflowStates.COMPLETED) return WorkflowDispositions.COMPLETED;
  if (workflow.state === WorkflowStates.WAITING_FOR_APPROVAL) return WorkflowDispositions.APPROVAL_REQUIRED;
  if (workflow.state === WorkflowStates.WAITING_FOR_INPUT) return WorkflowDispositions.INPUT_REQUIRED;
  if (workflow.state === WorkflowStates.BLOCKED) return WorkflowDispositions.BLOCKED;
  if (steps.some((step) => step.type === WorkflowStepTypes.VALIDATION && step.state === WorkflowStepStates.FAILED)) return WorkflowDispositions.VALIDATION_FAILED;
  if (workflow.state === WorkflowStates.PARTIALLY_COMPLETED) return WorkflowDispositions.PARTIALLY_COMPLETED;
  if (workflow.state === WorkflowStates.EXPIRED) return WorkflowDispositions.TIMED_OUT;
  return WorkflowDispositions.FAILED;
}

function validationStateFor(steps) {
  const validations = steps.filter((step) => step.type === WorkflowStepTypes.VALIDATION);
  if (!validations.length) return steps.some((step) => step.sourceChanging) ? "REQUIRED_NOT_RUN" : "NOT_REQUIRED";
  if (validations.some((step) => step.state === WorkflowStepStates.FAILED)) return "FAILED";
  if (validations.some((step) => step.state === WorkflowStepStates.SUCCEEDED)) return "PASSED_WITH_EVIDENCE";
  return "PENDING";
}

function repairStateFor(steps) {
  const repairs = steps.filter((step) => step.type === WorkflowStepTypes.REPAIR);
  if (!repairs.length) return "NOT_RUN";
  if (repairs.some((step) => step.state === WorkflowStepStates.FAILED)) return "FAILED";
  if (repairs.some((step) => step.state === WorkflowStepStates.SUCCEEDED)) return "REPAIRED";
  return "PENDING";
}

function approvalStateFor(steps) {
  if (steps.some((step) => step.state === WorkflowStepStates.WAITING_FOR_APPROVAL)) return "PENDING";
  if (steps.some((step) => step.approvalSensitive && !step.approvalRequestId && !TERMINAL_STEP_STATES.includes(step.state))) return "REQUIRED";
  if (steps.some((step) => step.approvalSensitive)) return "BOUND_OR_NOT_REQUIRED_FOR_PROPOSAL";
  return "NOT_REQUIRED";
}

function evidenceFromOutput(output, step) {
  const evidence = safeArray(output && output.evidence);
  evidence.push({ source: "DurableWorkflowEngine", workflowId: step.workflowId, stepId: step.id, type: step.type, signal: "step completed" });
  return evidence;
}

function summaryForResult(workflow, steps) {
  const completed = steps.filter((step) => [WorkflowStepStates.SUCCEEDED, WorkflowStepStates.PARTIALLY_SUCCEEDED].includes(step.state)).length;
  const failed = steps.filter((step) => [WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT].includes(step.state)).length;
  const blocked = steps.filter((step) => [WorkflowStepStates.BLOCKED, WorkflowStepStates.BLOCKED_BY_DEPENDENCY].includes(step.state)).length;
  return `${workflow.title}: ${completed}/${steps.length} step(s) completed, ${failed} failed, ${blocked} blocked.`;
}

function confidenceFor(steps, fallback) {
  const values = steps.map((step) => step.confidence).filter(Number.isFinite);
  if (!values.length) return fallback;
  return unit(values.reduce((sum, value) => sum + value, 0) / values.length, fallback);
}

function isActiveWorkflow(state) {
  return [WorkflowStates.READY, WorkflowStates.QUEUED, WorkflowStates.RUNNING, WorkflowStates.WAITING, WorkflowStates.WAITING_FOR_APPROVAL, WorkflowStates.WAITING_FOR_INPUT, WorkflowStates.WAITING_FOR_DEPENDENCY, WorkflowStates.PAUSED, WorkflowStates.SUSPENDED, WorkflowStates.RECOVERING, WorkflowStates.CANCELLING].includes(state);
}

function nextWorkflowActions(workflow) {
  if (workflow.state === WorkflowStates.CREATED) return ["validateWorkflow"];
  if (workflow.state === WorkflowStates.READY) return ["startWorkflow", "createCheckpoint"];
  if (workflow.state === WorkflowStates.RUNNING) return ["pauseWorkflow", "cancelWorkflow", "tick"];
  if (workflow.state === WorkflowStates.WAITING_FOR_APPROVAL) return ["resolve approval externally", "cancelWorkflow"];
  if (workflow.state === WorkflowStates.WAITING_FOR_INPUT) return ["resolveDecision", "cancelWorkflow"];
  if ([WorkflowStates.PAUSED, WorkflowStates.SUSPENDED, WorkflowStates.RECOVERING].includes(workflow.state)) return ["resumeWorkflow", "cancelWorkflow", "restoreCheckpoint"];
  return ["explainWorkflow", "getWorkflowResult"];
}

function nextStepActions(step) {
  if (step.state === WorkflowStepStates.CREATED || step.state === WorkflowStepStates.READY) return ["queueStep", "executeStep", "skipStep"];
  if (step.state === WorkflowStepStates.WAITING_FOR_APPROVAL) return ["provide approvalRequestId", "cancelStep"];
  if (step.state === WorkflowStepStates.WAITING_FOR_INPUT) return ["resolveDecision", "cancelStep"];
  if ([WorkflowStepStates.FAILED, WorkflowStepStates.TIMED_OUT, WorkflowStepStates.INTERRUPTED].includes(step.state)) return step.retryable ? ["retryStep", "skipStep"] : ["skipStep", "blockStep"];
  return ["explainStep"];
}

function unwrapRuntimeResult(result) {
  if (!result) return result;
  if (result.success === false) throw new Error(result.error && (result.error.userMessage || result.error.message) || "Runtime command failed.");
  if (result.status === "WAITING_FOR_APPROVAL" || result.partial === true) return { partial: true, ...(result.data || result) };
  return result.data !== undefined ? result.data : result;
}

function safeOutput(value) {
  return sanitize(value);
}

function sanitize(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value instanceof Error) return { name: value.name, message: value.message, category: value.category || "UNKNOWN" };
  if (value === null || typeof value !== "object") return typeof value === "string" && looksSecret(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen)).filter((entry) => entry !== undefined).slice(0, 128);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (["adapter", "handler", "instance", "runtime", "transport", "stack", "headers", "authorization", "completeSource", "prompt", "privateReasoning", "chainOfThought"].includes(key) || looksSecret(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitize(value[key], seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  const text = JSON.stringify(output);
  if (text.length > 32000) return { truncated: true, originalSize: text.length, preview: text.slice(0, 8000) };
  return output;
}

function summarizeWorkflow(workflow = {}) {
  return {
    id: workflow.id,
    workspaceId: workflow.workspaceId,
    projectId: workflow.projectId,
    sessionId: workflow.sessionId,
    conversationId: workflow.conversationId,
    teamId: workflow.teamId,
    objective: workflow.objective,
    title: workflow.title,
    strategy: workflow.strategy,
    state: workflow.state,
    planId: workflow.planId,
    rootStepIds: workflow.rootStepIds,
    stepIds: workflow.stepIds,
    activeStepIds: workflow.activeStepIds,
    completedStepIds: workflow.completedStepIds,
    failedStepIds: workflow.failedStepIds,
    blockedStepIds: workflow.blockedStepIds,
    skippedStepIds: workflow.skippedStepIds,
    dependencyGraph: workflow.dependencyGraph,
    currentCheckpointId: workflow.currentCheckpointId,
    checkpointIds: workflow.checkpointIds,
    approvalRequestIds: workflow.approvalRequestIds,
    operationIds: workflow.operationIds,
    proposalIds: workflow.proposalIds,
    validationIds: workflow.validationIds,
    repairIds: workflow.repairIds,
    evidence: safeArray(workflow.evidence).slice(0, 32),
    warnings: safeArray(workflow.warnings).slice(0, 32),
    limitations: safeArray(workflow.limitations).slice(0, 32),
    confidence: workflow.confidence,
    completeness: workflow.completeness,
    progress: workflow.progress,
    createdAt: workflow.createdAt,
    startedAt: workflow.startedAt,
    updatedAt: workflow.updatedAt,
    pausedAt: workflow.pausedAt,
    completedAt: workflow.completedAt,
    expiresAt: workflow.expiresAt,
    metadata: workflow.metadata,
  };
}

function summarizeStep(step = {}) {
  return {
    ...clone(step),
    input: sanitize(step.input),
    output: sanitize(step.output),
    evidence: safeArray(step.evidence).slice(0, 32),
    warnings: safeArray(step.warnings).slice(0, 32),
    limitations: safeArray(step.limitations).slice(0, 32),
  };
}

function summarizeCheckpoint(checkpoint = {}) {
  return {
    ...clone(checkpoint),
    evidence: safeArray(checkpoint.evidence).slice(0, 24),
  };
}

function summarizeAttempt(attempt = {}) {
  return {
    ...clone(attempt),
    result: sanitize(attempt.result),
    evidence: safeArray(attempt.evidence).slice(0, 16),
  };
}

function summarizeEvent(event = {}) {
  return { id: event.id, type: event.type, sequence: event.sequence, timestamp: event.timestamp, workflowId: event.payload && event.payload.workflowId, stepId: event.payload && event.payload.stepId };
}

function safePersistResult(result) {
  return result ? sanitize(result) : null;
}

function issue(code, message, severity = "ERROR") {
  return { code, message, severity };
}

function normalizeError(error, engine, extra = {}) {
  const message = error && error.message || String(error || "Workflow error.");
  return {
    id: engine && engine.nextId ? engine.nextId("workflow-error", { message }) : stableId("workflow-error", message),
    message,
    category: extra.category || error && error.category || "WORKFLOW",
    retryable: extra.retryable === true || error && error.retryable === true,
    recoverable: extra.recoverable !== false,
    createdAt: engine && engine.now ? engine.now() : new Date().toISOString(),
  };
}

function deterministicBackoff(attempt) {
  return Math.min(30000, Math.max(0, Number(attempt || 0)) * 1000);
}

function hasCycle(stepIds, deps) {
  const graph = new Map(stepIds.map((id) => [id, []]));
  for (const dep of deps) if (graph.has(dep.sourceStepId)) graph.get(dep.sourceStepId).push(dep.targetStepId);
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return stepIds.some(visit);
}

function graphDepth(stepIds, deps) {
  const graph = new Map(stepIds.map((id) => [id, []]));
  for (const dep of deps) if (graph.has(dep.sourceStepId)) graph.get(dep.sourceStepId).push(dep.targetStepId);
  const visit = (id, seen = new Set()) => {
    if (seen.has(id)) return Infinity;
    const next = graph.get(id) || [];
    if (!next.length) return 1;
    const nextSeen = new Set(seen);
    nextSeen.add(id);
    return 1 + Math.max(...next.map((entry) => visit(entry, nextSeen)));
  };
  return Math.max(0, ...stepIds.map((id) => visit(id)));
}

function looksSourceChanging(value) {
  const text = typeof value === "object" ? `${value.type || ""} ${value.title || ""} ${value.description || ""}` : String(value || "");
  return /\b(change|apply|mutate|edit|patch|create|delete|rename|modify|refactor|fix)\b/i.test(text);
}

function looksCommandExecuting(value) {
  const text = typeof value === "object" ? `${value.type || ""} ${value.title || ""} ${value.description || ""}` : String(value || "");
  return /\b(command|test|validate|lint|build|typecheck)\b/i.test(text);
}

function protectedShapeChanged(patch = {}) {
  return ["input", "objective", "sourceChanging", "commandExecuting", "approvalSensitive", "proposalId"].some((key) => Object.prototype.hasOwnProperty.call(patch, key));
}

function scopesOverlap(left, right) {
  const l = safeArray(left);
  const r = safeArray(right);
  if (!l.length || !r.length) return false;
  return l.some((entry) => r.includes(entry));
}

function eventMatches(event, filter = {}) {
  if (filter.type && event.type !== filter.type) return false;
  if (filter.types && !safeArray(filter.types).includes(event.type)) return false;
  if (filter.workflowId && event.payload && event.payload.workflowId !== filter.workflowId) return false;
  if (filter.stepId && event.payload && event.payload.stepId !== filter.stepId) return false;
  return true;
}

function matchesRecord(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => value === undefined || value === null || key === "active" || record[key] === value);
}

function compareId(left, right) { return String(left.id).localeCompare(String(right.id)); }
function compareCreated(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || compareId(left, right); }
function compareStep(left, right) { return Number(left.sequence || 0) - Number(right.sequence || 0) || compareCreated(left, right); }
function compareWorkflow(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || compareId(left, right); }
function scheduleOrder(left, right) { return (PRIORITY_ORDER[left.priority] || 2) - (PRIORITY_ORDER[right.priority] || 2) || Number(left.sequence || 0) - Number(right.sequence || 0) || compareId(left, right); }

function diffArrays(left, right) {
  const l = new Set(safeArray(left));
  const r = new Set(safeArray(right));
  return { added: Array.from(r).filter((entry) => !l.has(entry)), removed: Array.from(l).filter((entry) => !r.has(entry)) };
}

function diffObjects(left = {}, right = {}) {
  const keys = unique(Object.keys(left || {}).concat(Object.keys(right || {})));
  return keys.filter((key) => JSON.stringify(left && left[key]) !== JSON.stringify(right && right[key])).map((key) => ({ key, before: left && left[key], after: right && right[key] }));
}

function trimOldestMap(map, maximum) {
  while (map.size > maximum) map.delete(map.keys().next().value);
}

function trimArray(values, maximum) {
  if (values.length > maximum) values.splice(0, values.length - maximum);
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return Array.from(dupes);
}

function unique(values) {
  return Array.from(new Set(safeArray(values).filter((value) => value !== undefined && value !== null).map((value) => typeof value === "string" ? value : JSON.stringify(value)))).map((value) => {
    try { return JSON.parse(value); } catch (_) { return value; }
  });
}

function uniqueById(values) {
  const seen = new Set();
  const result = [];
  for (const value of safeArray(values)) {
    const key = value && (value.id || value.source && value.signal && `${value.source}:${value.signal}`) || JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clone(value) {
  if (value === undefined || value === null) return value === undefined ? undefined : null;
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  const output = clone(base || {});
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) output[key] = deepMerge(output[key], value);
    else output[key] = clone(value);
  }
  return output;
}

function normalizeEnum(value, choices) {
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(choices).includes(normalized)) throw new Error(`Invalid enum value: ${value}.`);
  return normalized;
}

function requiredString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function unit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeClock(input) {
  if (input && typeof input.now === "function") return input;
  return { now: () => new Date().toISOString() };
}

function normalizeIdAdapter(input) {
  if (input && typeof input.next === "function") return input;
  return { next: (prefix, seed = {}) => stableId(prefix, seed) };
}

function stableId(prefix, value) {
  return `${prefix}-${stableHash(value).slice(0, 16)}`;
}

function stableHash(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, stableKeys);
  return crypto.createHash("sha256").update(text || "").digest("hex");
}

function stableKeys(key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((entry) => [entry, value[entry]]));
}

function titleFrom(value) {
  return String(value || "Durable Workflow").replace(/\s+/g, " ").trim().slice(0, 80);
}

function averageScores(scores) {
  const values = Object.values(scores).map((entry) => entry.value).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function reliabilityScore(successes, failures) {
  const total = Number(successes || 0) + Number(failures || 0);
  return total ? Number(successes || 0) / total * 100 : 100;
}

function score(label, value) {
  const bounded = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return { value: bounded, deductions: bounded < 100 ? [{ reason: label, value: 100 - bounded }] : [], evidence: [{ source: "DurableWorkflowEngine", signal: label }] };
}

function sanitizeConfigurationPatch(patch = {}) {
  const allowed = new Set(Object.keys(DEFAULT_CONFIGURATION));
  return Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.has(key)));
}

function looksSecret(value) {
  return /secret|token|password|credential|api[-_]?key|authorization/i.test(String(value || ""));
}

function emptyStats() {
  return {
    workflowsCreated: 0,
    workflowsValidated: 0,
    workflowsInvalid: 0,
    workflowsStarted: 0,
    workflowsCompleted: 0,
    workflowsPartiallyCompleted: 0,
    workflowsCancelled: 0,
    workflowsBlocked: 0,
    workflowsFailed: 0,
    workflowsExpired: 0,
    workflowsRecovered: 0,
    stepsCreated: 0,
    stepsQueued: 0,
    stepsStarted: 0,
    stepsSucceeded: 0,
    stepsPartiallySucceeded: 0,
    stepsSkipped: 0,
    stepsBlocked: 0,
    stepsFailed: 0,
    stepsCancelled: 0,
    stepsTimedOut: 0,
    retriesScheduled: 0,
    retriesSucceeded: 0,
    retriesFailed: 0,
    repairsStarted: 0,
    repairsSucceeded: 0,
    repairsFailed: 0,
    approvalsRequested: 0,
    approvalsInvalidated: 0,
    decisionsRequested: 0,
    decisionsResolved: 0,
    checkpointsCreated: 0,
    checkpointsRestored: 0,
    checkpointRestoreFailures: 0,
    dependencyBlocks: 0,
    staleWorkspaceDetections: 0,
    providerFailures: 0,
    capabilityBlocks: 0,
    securityBlocks: 0,
    privacyBlocks: 0,
    validationFailures: 0,
    corruptedLoads: 0,
    averageStepsPerWorkflow: 0,
    averageWorkflowDuration: 0,
    averageStepDuration: 0,
    averageRetriesPerStep: 0,
    averageConfidence: 0,
    averageCompleteness: 0,
    lastWorkflow: null,
    lastStep: null,
    lastCheckpoint: null,
    lastRecovery: null,
    lastFailure: null,
    lastPersistence: null,
  };
}

module.exports = {
  DEFAULT_BOUNDS,
  DEFAULT_CONFIGURATION,
  DURABLE_WORKFLOW_SCHEMA_VERSION,
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
  stableHash,
};
