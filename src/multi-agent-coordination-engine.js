const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const MULTI_AGENT_COORDINATION_SCHEMA_VERSION = 1;

const CoordinationStates = Object.freeze({
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

const TeamStates = Object.freeze({
  CREATED: "CREATED",
  PLANNING: "PLANNING",
  ACTIVE: "ACTIVE",
  WAITING: "WAITING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  RECONCILING: "RECONCILING",
  VALIDATING: "VALIDATING",
  REPAIRING: "REPAIRING",
  PAUSED: "PAUSED",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
});

const AssignmentStates = Object.freeze({
  CREATED: "CREATED",
  QUEUED: "QUEUED",
  GATHERING_CONTEXT: "GATHERING_CONTEXT",
  WAITING_FOR_MODEL: "WAITING_FOR_MODEL",
  RUNNING: "RUNNING",
  STREAMING: "STREAMING",
  WAITING_FOR_DEPENDENCY: "WAITING_FOR_DEPENDENCY",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  SUBMITTED: "SUBMITTED",
  VALIDATING: "VALIDATING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  CONFLICTED: "CONFLICTED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
  EXPIRED: "EXPIRED",
});

const AgentRoles = Object.freeze({
  COORDINATOR: "COORDINATOR",
  PLANNER: "PLANNER",
  ARCHITECT: "ARCHITECT",
  CODE_ANALYST: "CODE_ANALYST",
  IMPLEMENTER: "IMPLEMENTER",
  REVIEWER: "REVIEWER",
  TESTER: "TESTER",
  SECURITY_REVIEWER: "SECURITY_REVIEWER",
  PERFORMANCE_REVIEWER: "PERFORMANCE_REVIEWER",
  DOCUMENTATION_REVIEWER: "DOCUMENTATION_REVIEWER",
  RELEASE_REVIEWER: "RELEASE_REVIEWER",
  REPAIR_SPECIALIST: "REPAIR_SPECIALIST",
  CUSTOM: "CUSTOM",
});

const DelegationStrategies = Object.freeze({
  NONE: "NONE",
  SEQUENTIAL: "SEQUENTIAL",
  PARALLEL_INDEPENDENT: "PARALLEL_INDEPENDENT",
  PARALLEL_REVIEW: "PARALLEL_REVIEW",
  PIPELINE: "PIPELINE",
  REVIEW_BOARD: "REVIEW_BOARD",
  ADAPTIVE_BOUNDED: "ADAPTIVE_BOUNDED",
});

const AssignmentTypes = Object.freeze({
  ANALYSIS: "ANALYSIS",
  PLANNING: "PLANNING",
  ARCHITECTURE_REVIEW: "ARCHITECTURE_REVIEW",
  CODE_UNDERSTANDING: "CODE_UNDERSTANDING",
  CHANGE_PROPOSAL: "CHANGE_PROPOSAL",
  CHANGE_REVIEW: "CHANGE_REVIEW",
  TEST_DESIGN: "TEST_DESIGN",
  VALIDATION_REVIEW: "VALIDATION_REVIEW",
  SECURITY_REVIEW: "SECURITY_REVIEW",
  PERFORMANCE_REVIEW: "PERFORMANCE_REVIEW",
  DOCUMENTATION_REVIEW: "DOCUMENTATION_REVIEW",
  RELEASE_REVIEW: "RELEASE_REVIEW",
  REPAIR_PROPOSAL: "REPAIR_PROPOSAL",
  SYNTHESIS: "SYNTHESIS",
  CUSTOM: "CUSTOM",
});

const OutputDispositions = Object.freeze({
  ACCEPTED: "ACCEPTED",
  PARTIALLY_ACCEPTED: "PARTIALLY_ACCEPTED",
  REJECTED: "REJECTED",
  NEEDS_REVISION: "NEEDS_REVISION",
  CONFLICTED: "CONFLICTED",
  DUPLICATE: "DUPLICATE",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  BLOCKED: "BLOCKED",
});

const ConflictCategories = Object.freeze({
  CONTRADICTORY_FINDING: "CONTRADICTORY_FINDING",
  CONTRADICTORY_RECOMMENDATION: "CONTRADICTORY_RECOMMENDATION",
  OVERLAPPING_CHANGE: "OVERLAPPING_CHANGE",
  INCOMPATIBLE_CHANGE: "INCOMPATIBLE_CHANGE",
  DUPLICATE_WORK: "DUPLICATE_WORK",
  AUTHORITY_CONFLICT: "AUTHORITY_CONFLICT",
  EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
  SCOPE_CONFLICT: "SCOPE_CONFLICT",
  VALIDATION_CONFLICT: "VALIDATION_CONFLICT",
  SECURITY_CONFLICT: "SECURITY_CONFLICT",
  UNKNOWN: "UNKNOWN",
});

const ConflictSeverities = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const ConflictResolutionMethods = Object.freeze({
  EVIDENCE_PRIORITY: "EVIDENCE_PRIORITY",
  AUTHORITY_PRIORITY: "AUTHORITY_PRIORITY",
  VALIDATION_RESULT: "VALIDATION_RESULT",
  REQUEST_REVISION: "REQUEST_REVISION",
  ACCEPT_ONE: "ACCEPT_ONE",
  MERGE_COMPATIBLE: "MERGE_COMPATIBLE",
  ESCALATE_TO_USER: "ESCALATE_TO_USER",
  REJECT_ALL: "REJECT_ALL",
  DEFER: "DEFER",
});

const AssignmentPriorities = Object.freeze({
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const TeamDispositions = Object.freeze({
  COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  PROPOSAL_READY: "PROPOSAL_READY",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  BLOCKED: "BLOCKED",
  CONFLICTED: "CONFLICTED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CAPABILITY_UNAVAILABLE: "CAPABILITY_UNAVAILABLE",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
});

const MultiAgentEventTypes = Object.freeze({
  INITIALIZATION_STARTED: "multi_agent_initialization_started",
  READY: "multi_agent_ready",
  DEGRADED: "multi_agent_degraded",
  FAILED: "multi_agent_failed",
  ROLE_REGISTERED: "agent_role_registered",
  ROLE_UNREGISTERED: "agent_role_unregistered",
  DELEGATION_EVALUATION_STARTED: "delegation_evaluation_started",
  DELEGATION_EVALUATION_COMPLETED: "delegation_evaluation_completed",
  PLAN_CREATED: "delegation_plan_created",
  PLAN_VALIDATED: "delegation_plan_validated",
  PLAN_REJECTED: "delegation_plan_rejected",
  TEAM_CREATED: "agent_team_created",
  TEAM_STARTED: "agent_team_started",
  TEAM_PAUSED: "agent_team_paused",
  TEAM_RESUMED: "agent_team_resumed",
  TEAM_WAITING: "agent_team_waiting",
  TEAM_WAITING_FOR_APPROVAL: "agent_team_waiting_for_approval",
  TEAM_RECONCILING: "agent_team_reconciling",
  TEAM_COMPLETED: "agent_team_completed",
  TEAM_PARTIALLY_COMPLETED: "agent_team_partially_completed",
  TEAM_CANCELLED: "agent_team_cancelled",
  TEAM_FAILED: "agent_team_failed",
  ASSIGNMENT_CREATED: "agent_assignment_created",
  ASSIGNMENT_QUEUED: "agent_assignment_queued",
  ASSIGNMENT_STARTED: "agent_assignment_started",
  ASSIGNMENT_PROGRESS: "agent_assignment_progress",
  ASSIGNMENT_WAITING: "agent_assignment_waiting",
  ASSIGNMENT_SUBMITTED: "agent_assignment_submitted",
  ASSIGNMENT_COMPLETED: "agent_assignment_completed",
  ASSIGNMENT_FAILED: "agent_assignment_failed",
  ASSIGNMENT_CANCELLED: "agent_assignment_cancelled",
  ASSIGNMENT_TIMED_OUT: "agent_assignment_timed_out",
  ASSIGNMENT_REVISION_REQUESTED: "agent_assignment_revision_requested",
  RESULT_CREATED: "agent_result_created",
  RESULT_ACCEPTED: "agent_result_accepted",
  RESULT_REJECTED: "agent_result_rejected",
  CONFLICT_DETECTED: "agent_conflict_detected",
  CONFLICT_RESOLVED: "agent_conflict_resolved",
  CONFLICT_ESCALATED: "agent_conflict_escalated",
  RECONCILIATION_STARTED: "agent_reconciliation_started",
  RECONCILIATION_COMPLETED: "agent_reconciliation_completed",
  PERSISTED: "multi_agent_persisted",
  RESTORED: "multi_agent_restored",
  CORRUPTION_DETECTED: "multi_agent_corruption_detected",
  SHUTDOWN: "multi_agent_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-multi-agent-coordination",
  schemaVersion: MULTI_AGENT_COORDINATION_SCHEMA_VERSION,
  enabled: true,
  defaultStrategy: DelegationStrategies.ADAPTIVE_BOUNDED,
  maximumAgentsPerTeam: 4,
  maximumConcurrentAssignments: 2,
  maximumAssignmentsPerTeam: 8,
  maximumAssignmentDepth: 2,
  maximumDelegationRounds: 2,
  maximumReviewRounds: 2,
  maximumRevisionRounds: 1,
  maximumContextPackagesPerAssignment: 3,
  maximumContextTokensPerAssignment: 3000,
  maximumModelRequestsPerAssignment: 1,
  maximumToolCallsPerAssignment: 4,
  maximumTotalModelRequests: 8,
  maximumTotalToolCalls: 24,
  maximumTeamDurationMs: 120000,
  maximumAssignmentDurationMs: 45000,
  requireEvidence: true,
  requireIndependentReviewForSourceChanges: true,
  requireIndependentReviewForSecurityChanges: true,
  requireCoordinatorReconciliation: true,
  allowSameModelForReview: true,
  allowSameProviderForReview: true,
  enableParallelism: true,
  enablePersistence: true,
  storagePath: ".levi/multi-agent-coordination.json",
  metadata: Object.freeze({}),
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumRoles: 32,
  maximumTeams: 64,
  maximumActiveTeams: 2,
  maximumAgentsPerTeam: DEFAULT_CONFIGURATION.maximumAgentsPerTeam,
  maximumAssignmentsPerTeam: DEFAULT_CONFIGURATION.maximumAssignmentsPerTeam,
  maximumActiveAssignments: DEFAULT_CONFIGURATION.maximumConcurrentAssignments,
  maximumAssignmentDepth: DEFAULT_CONFIGURATION.maximumAssignmentDepth,
  maximumDelegationRounds: DEFAULT_CONFIGURATION.maximumDelegationRounds,
  maximumRevisionRounds: DEFAULT_CONFIGURATION.maximumRevisionRounds,
  maximumReviewRounds: DEFAULT_CONFIGURATION.maximumReviewRounds,
  maximumDependenciesPerAssignment: 8,
  maximumContextReferences: 32,
  maximumModelRequests: DEFAULT_CONFIGURATION.maximumTotalModelRequests,
  maximumToolCalls: DEFAULT_CONFIGURATION.maximumTotalToolCalls,
  maximumFindings: 128,
  maximumConflicts: 64,
  maximumDecisions: 128,
  maximumEventHistory: 1000,
  maximumListeners: 128,
  maximumPersistedTeams: 24,
  maximumTeamDurationMs: DEFAULT_CONFIGURATION.maximumTeamDurationMs,
  maximumAssignmentDurationMs: DEFAULT_CONFIGURATION.maximumAssignmentDurationMs,
  maximumUiItems: 100,
});

const ROLE_PRESETS = Object.freeze([
  rolePreset(AgentRoles.COORDINATOR, "Coordinator", ["delegation", "reconciliation", "evidence"], ["approval", "direct mutation", "direct command execution"]),
  rolePreset(AgentRoles.PLANNER, "Planner", ["planning", "task decomposition"], ["approval", "source mutation"]),
  rolePreset(AgentRoles.ARCHITECT, "Architect", ["architecture review", "boundary review"], ["approval", "source mutation"]),
  rolePreset(AgentRoles.CODE_ANALYST, "Code Analyst", ["code understanding", "scope analysis"], ["approval", "source mutation"]),
  rolePreset(AgentRoles.IMPLEMENTER, "Implementer", ["change proposal", "repair proposal"], ["approval", "self review", "direct mutation"]),
  rolePreset(AgentRoles.REVIEWER, "Reviewer", ["change review", "scope compliance"], ["approval", "direct mutation"]),
  rolePreset(AgentRoles.TESTER, "Tester", ["test design", "validation interpretation"], ["approval", "unallowlisted command execution"]),
  rolePreset(AgentRoles.SECURITY_REVIEWER, "Security Reviewer", ["security review", "policy review"], ["approval", "direct mutation"]),
  rolePreset(AgentRoles.PERFORMANCE_REVIEWER, "Performance Reviewer", ["performance review"], ["approval"]),
  rolePreset(AgentRoles.DOCUMENTATION_REVIEWER, "Documentation Reviewer", ["documentation review"], ["approval"]),
  rolePreset(AgentRoles.RELEASE_REVIEWER, "Release Reviewer", ["release review"], ["approval"]),
  rolePreset(AgentRoles.REPAIR_SPECIALIST, "Repair Specialist", ["repair proposal"], ["approval", "direct mutation"]),
]);

class MultiAgentCoordinationEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.runtime = options.runtime || null;
    this.agentOrchestrator = options.agentOrchestrator || options.agent || null;
    this.modelGateway = options.modelGateway || null;
    this.workspaceTools = options.workspaceTools || null;
    this.configuration = normalizeConfiguration(options.configuration || options.config || {});
    this.bounds = normalizeBounds({ ...options.bounds, ...boundsFromConfiguration(this.configuration) });
    this.clock = normalizeClock(options.clock);
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.persistenceAdapter = options.persistenceAdapter || new MemoryMultiAgentPersistenceAdapter();
    this.state = CoordinationStates.CREATED;
    this.roles = new Map();
    this.teams = new Map();
    this.assignments = new Map();
    this.results = new Map();
    this.conflicts = new Map();
    this.decisions = new Map();
    this.events = [];
    this.listeners = new Map();
    this.stats = emptyStats();
    for (const role of ROLE_PRESETS) this.registerRole(role, { silent: true });
    for (const role of safeArray(options.roles)) this.registerRole(role, { silent: true });
  }

  initialize(options = {}) {
    this.state = CoordinationStates.INITIALIZING;
    this.emitEvent(MultiAgentEventTypes.INITIALIZATION_STARTED, {});
    try {
      validateConfiguration(this.configuration, this.bounds);
      if (options.restore !== false && this.configuration.enablePersistence && options.load !== false) this.load({ emptyOnCorruption: true });
      const health = this.getHealth({ skipChecks: true });
      this.state = !this.configuration.enabled || health.blockers.length || health.warnings.length ? CoordinationStates.DEGRADED : CoordinationStates.READY;
      this.emitEvent(this.state === CoordinationStates.READY ? MultiAgentEventTypes.READY : MultiAgentEventTypes.DEGRADED, health);
      return { status: this.state, health };
    } catch (error) {
      this.state = CoordinationStates.FAILED;
      this.stats.lastFailure = normalizeError(error);
      this.emitEvent(MultiAgentEventTypes.FAILED, { error: this.stats.lastFailure });
      return { status: CoordinationStates.FAILED, error: this.stats.lastFailure };
    }
  }

  shutdown(options = {}) {
    this.state = CoordinationStates.SHUTTING_DOWN;
    if (options.save !== false && this.configuration.enablePersistence) this.save();
    this.state = CoordinationStates.STOPPED;
    this.emitEvent(MultiAgentEventTypes.SHUTDOWN, {});
    return { status: this.state };
  }

  suspend(reason = "Suspended.") {
    this.state = CoordinationStates.SUSPENDED;
    return { status: this.state, reason };
  }

  resume(options = {}) {
    const health = this.getHealth(options);
    this.state = health.blockers.length ? CoordinationStates.DEGRADED : CoordinationStates.READY;
    return { status: this.state, health };
  }

  recover(options = {}) {
    this.state = CoordinationStates.RECOVERING;
    if (options.snapshot) this.restore(options.snapshot, { recovery: true });
    for (const assignment of this.assignments.values()) {
      if ([AssignmentStates.QUEUED, AssignmentStates.GATHERING_CONTEXT, AssignmentStates.WAITING_FOR_MODEL, AssignmentStates.RUNNING, AssignmentStates.STREAMING, AssignmentStates.WAITING_FOR_APPROVAL].includes(assignment.state)) {
        assignment.state = AssignmentStates.FAILED;
        assignment.error = { message: "Assignment interrupted during recovery.", recoverable: true };
        assignment.limitations = unique(assignment.limitations.concat("Context may be stale after recovery."));
        assignment.updatedAt = this.now();
      }
    }
    for (const team of this.teams.values()) {
      if ([TeamStates.ACTIVE, TeamStates.WAITING, TeamStates.WAITING_FOR_APPROVAL, TeamStates.RECONCILING, TeamStates.VALIDATING, TeamStates.REPAIRING].includes(team.state)) {
        team.state = TeamStates.PAUSED;
        team.limitations = unique(team.limitations.concat("Team paused during recovery; protected actions were not auto-resumed."));
        team.confidence = Math.min(team.confidence, 0.6);
        team.updatedAt = this.now();
      }
    }
    this.state = CoordinationStates.DEGRADED;
    return { status: "RECOVERED", teamCount: this.teams.size, assignmentCount: this.assignments.size };
  }

  getState() {
    return { state: this.state, schemaVersion: MULTI_AGENT_COORDINATION_SCHEMA_VERSION, enabled: this.configuration.enabled };
  }

  getConfiguration() {
    return clone({ ...this.configuration, bounds: this.bounds });
  }

  updateConfiguration(patch = {}, options = {}) {
    const next = normalizeConfiguration(deepMerge(this.configuration, patch));
    validateConfiguration(next, this.bounds);
    this.configuration = next;
    if (options.revalidate !== false) this.resume({});
    return this.getConfiguration();
  }

  getHealth(options = {}) {
    const blockers = [];
    const warnings = [];
    if (!this.configuration.enabled) warnings.push("Multi-agent coordination is disabled.");
    if (!this.roles.has(AgentRoles.COORDINATOR)) blockers.push("Coordinator role is missing.");
    if (this.configuration.maximumAgentsPerTeam > this.bounds.maximumAgentsPerTeam) blockers.push("Maximum agents per team exceeds configured bounds.");
    if (this.configuration.maximumConcurrentAssignments > this.bounds.maximumActiveAssignments) blockers.push("Maximum concurrent assignments exceeds bounds.");
    const runtimeAvailable = !!this.runtime && typeof this.runtime.executeCommand === "function";
    const agentAvailable = !!this.agentOrchestrator || runtimeAvailable;
    const workspaceToolAvailable = !!this.workspaceTools || runtimeAvailable;
    const modelGatewayAvailable = !!this.modelGateway || runtimeAvailable;
    if (!runtimeAvailable) warnings.push("LeviApplicationRuntime is unavailable; assignments run in deterministic proposal-only mode.");
    if (!agentAvailable) warnings.push("AgentOrchestrationEngine is unavailable; assignment execution is deterministic only.");
    if (!workspaceToolAvailable) warnings.push("ControlledWorkspaceToolEngine is unavailable through direct reference; runtime command boundary will be used when possible.");
    if (!modelGatewayAvailable) warnings.push("ModelProviderGateway is unavailable; model diversity is limited.");
    const activeTeams = Array.from(this.teams.values()).filter((team) => [TeamStates.ACTIVE, TeamStates.WAITING, TeamStates.RECONCILING, TeamStates.VALIDATING].includes(team.state)).length;
    const criticalConflicts = Array.from(this.conflicts.values()).filter((conflict) => conflict.severity === ConflictSeverities.CRITICAL && conflict.resolutionStatus !== "RESOLVED").length;
    if (criticalConflicts) blockers.push("Unresolved critical conflict blocks completion.");
    const scores = {
      configuration: score(blockers.filter((entry) => /configuration|Maximum/.test(entry)).length, warnings.length),
      runtimeAvailability: runtimeAvailable ? 100 : 70,
      agentOrchestratorAvailability: agentAvailable ? 100 : 70,
      modelGatewayAvailability: modelGatewayAvailable ? 100 : 75,
      roleAvailability: this.roles.has(AgentRoles.COORDINATOR) ? 100 : 0,
      delegationReliability: boundedScore(95 - this.stats.teamsFailed * 5),
      assignmentReliability: boundedScore(95 - this.stats.assignmentsFailed * 3),
      concurrencyControl: this.configuration.maximumConcurrentAssignments <= this.bounds.maximumActiveAssignments ? 100 : 0,
      contextIsolation: 100,
      privacyIntegrity: 100,
      securityIntegrity: 100,
      approvalIntegrity: 100,
      evidenceIntegrity: this.configuration.requireEvidence ? 100 : 80,
      reviewIntegrity: this.configuration.requireIndependentReviewForSourceChanges ? 100 : 85,
      conflictResolution: criticalConflicts ? 40 : 100,
      persistenceReliability: this.persistenceAdapter ? 100 : 70,
    };
    scores.overallMultiAgentHealth = Math.round(Object.values(scores).reduce((sumValue, value) => sumValue + value, 0) / Object.values(scores).length);
    return {
      coordinatorState: this.state,
      scores,
      blockers,
      warnings,
      activeTeams,
      roleCount: this.roles.size,
      teamCount: this.teams.size,
      assignmentCount: this.assignments.size,
      conflictCount: this.conflicts.size,
      stats: clone(this.stats),
      invariants: {
        runtimeBoundary: "ASSIGNMENTS_USE_RUNTIME_COMMANDS",
        approvalBoundary: "COORDINATOR_CANNOT_APPROVE_PROTECTED_ACTIONS",
        workspaceMutationBoundary: "CONTROLLED_WORKSPACE_TOOLS_ONLY",
        evidenceRequired: this.configuration.requireEvidence,
      },
    };
  }

  getStats() {
    return clone(this.stats);
  }

  snapshot() {
    return {
      schemaVersion: MULTI_AGENT_COORDINATION_SCHEMA_VERSION,
      configuration: this.configuration,
      roles: Array.from(this.roles.values()),
      teams: Array.from(this.teams.values()).slice(-this.bounds.maximumPersistedTeams).map(summarizeTeam),
      assignments: Array.from(this.assignments.values()).map(summarizeAssignment),
      results: Array.from(this.results.values()).map(summarizeResult),
      conflicts: Array.from(this.conflicts.values()),
      decisions: Array.from(this.decisions.values()),
      events: this.events.slice(-Math.min(50, this.bounds.maximumEventHistory)),
      stats: this.stats,
      savedAt: this.now(),
    };
  }

  restore(snapshot, options = {}) {
    const normalized = normalizeSnapshot(snapshot);
    this.configuration = normalizeConfiguration(normalized.configuration);
    this.roles = new Map(normalized.roles.map((role) => [role.id, normalizeRoleDefinition(role, this)]));
    this.teams = new Map(normalized.teams.map((team) => [team.id, normalizeTeam(team, this)]));
    this.assignments = new Map(normalized.assignments.map((assignment) => [assignment.id, normalizeAssignment(assignment, this)]));
    this.results = new Map(normalized.results.map((result) => [result.id, normalizeResult(result, this)]));
    this.conflicts = new Map(normalized.conflicts.map((conflict) => [conflict.id, normalizeConflict(conflict, this)]));
    this.decisions = new Map(normalized.decisions.map((decision) => [decision.id, normalizeDecision(decision, this)]));
    this.stats = { ...emptyStats(), ...normalized.stats };
    if (options.recovery) this.recover({});
    this.emitEvent(MultiAgentEventTypes.RESTORED, { teamCount: this.teams.size });
    return { status: "RESTORED", teamCount: this.teams.size, assignmentCount: this.assignments.size };
  }

  save() {
    if (!this.configuration.enablePersistence) return { status: "DISABLED" };
    const result = this.persistenceAdapter.save(this.snapshot(), { configuration: this.configuration });
    this.stats.lastPersistence = { status: result.status || "PERSISTED", timestamp: this.now() };
    this.emitEvent(MultiAgentEventTypes.PERSISTED, result);
    return result;
  }

  load(options = {}) {
    try {
      const result = this.persistenceAdapter.load({ configuration: this.configuration, emptyOnCorruption: options.emptyOnCorruption });
      if (!result || !result.snapshot) return result || { status: "EMPTY" };
      this.restore(result.snapshot);
      return { status: "LOADED", teamCount: this.teams.size, assignmentCount: this.assignments.size };
    } catch (error) {
      if (options.emptyOnCorruption) {
        this.emitEvent(MultiAgentEventTypes.CORRUPTION_DETECTED, { error: error.message });
        return { status: "EMPTY", corrupted: true, error: error.message };
      }
      throw error;
    }
  }

  registerRole(roleDefinition, options = {}) {
    if (this.roles.size >= this.bounds.maximumRoles && !this.roles.has(roleDefinition.id || roleDefinition.role)) throw new Error("Maximum multi-agent roles exceeded.");
    const role = normalizeRoleDefinition(roleDefinition, this);
    const existing = this.roles.get(role.id);
    if (existing && options.replace !== true && !options.silent) throw new Error(`Duplicate role: ${role.id}.`);
    this.validateRole(role);
    this.roles.set(role.id, role);
    if (!options.silent) this.emitEvent(MultiAgentEventTypes.ROLE_REGISTERED, { roleId: role.id, role: role.role });
    return clone(role);
  }

  unregisterRole(roleId) {
    const id = this.resolveRoleId(roleId);
    if (id === AgentRoles.COORDINATOR) throw new Error("Coordinator role cannot be unregistered.");
    const removed = this.roles.delete(id);
    if (removed) this.emitEvent(MultiAgentEventTypes.ROLE_UNREGISTERED, { roleId: id });
    return removed;
  }

  getRole(roleIdOrRole) {
    return clone(this.roles.get(this.resolveRoleId(roleIdOrRole)) || null);
  }

  listRoles(filter = {}) {
    return Array.from(this.roles.values()).filter((role) => matches(role, filter)).sort(byId).map(clone);
  }

  validateRole(roleDefinition) {
    const role = normalizeRoleDefinition(roleDefinition, this);
    if (role.role !== AgentRoles.CUSTOM && role.id !== role.role) throw new Error("Built-in role ids must match the role name.");
    if (role.allowedTools.some((tool) => role.prohibitedTools.includes(tool))) throw new Error(`Role ${role.id} has a tool both allowed and prohibited.`);
    if (role.maximumContextTokens > this.configuration.maximumContextTokensPerAssignment) throw new Error(`Role ${role.id} exceeds assignment context bounds.`);
    return { valid: true, roleId: role.id };
  }

  getAvailableRoles(options = {}) {
    const capabilities = new Set(safeArray(options.capabilities || this.availableCapabilities()));
    return this.listRoles().map((role) => ({
      ...role,
      available: role.requiredCapabilities.every((capability) => capabilities.has(capability) || capabilities.size === 0),
      missingCapabilities: role.requiredCapabilities.filter((capability) => capabilities.size && !capabilities.has(capability)),
    }));
  }

  createTeam(input = {}, options = {}) {
    if (this.teams.size >= this.bounds.maximumTeams) throw new Error("Maximum teams exceeded.");
    const activeTeams = this.listTeams({ active: true }).length;
    if (activeTeams >= this.bounds.maximumActiveTeams) throw new Error("Maximum active teams exceeded.");
    const plan = input.plan || input.delegationPlan || this.createDelegationPlan(input, { ...options, persist: false });
    const validation = this.validateDelegationPlan(plan, options);
    if (!validation.valid) throw new Error(`Invalid delegation plan: ${validation.findings.map((finding) => finding.message).join("; ")}`);
    const team = normalizeTeam({
      workspaceId: input.workspaceId || plan.workspaceId,
      projectId: input.projectId || plan.projectId,
      sessionId: input.sessionId || null,
      conversationId: input.conversationId || null,
      turnId: input.turnId || null,
      objective: input.objective || plan.objective,
      strategy: plan.strategy,
      state: TeamStates.CREATED,
      dependencyGraph: { assignments: {}, edges: safeArray(plan.dependencies) },
      evidence: plan.evidence,
      warnings: plan.warnings,
      limitations: plan.limitations,
      metadata: { planId: plan.id, ...(input.metadata || {}) },
    }, this);
    this.teams.set(team.id, team);
    const coordinator = this.createAssignment(team.id, {
      role: AgentRoles.COORDINATOR,
      type: AssignmentTypes.SYNTHESIS,
      objective: `Coordinate and reconcile: ${team.objective}`,
      scope: { workspaceId: team.workspaceId, projectId: team.projectId, readOnly: true },
      expectedOutput: "Unified evidence-backed team result.",
      priority: AssignmentPriorities.CRITICAL,
    }, { coordinator: true });
    team.coordinatorAssignmentId = coordinator.id;
    for (const assignment of plan.assignments) this.createAssignment(team.id, assignment, { fromPlan: true });
    this.stats.teamsCreated += 1;
    this.updateAverages(team);
    this.emitEvent(MultiAgentEventTypes.TEAM_CREATED, { teamId: team.id, strategy: team.strategy });
    return clone(team);
  }

  async startTeam(teamId, options = {}) {
    const team = this.requireTeam(teamId);
    if ([TeamStates.CANCELLED, TeamStates.COMPLETED, TeamStates.FAILED].includes(team.state)) return clone(team);
    team.state = TeamStates.ACTIVE;
    team.updatedAt = this.now();
    this.emitEvent(MultiAgentEventTypes.TEAM_STARTED, { teamId: team.id });
    if (options.execute === false) return clone(team);
    await this.executeDelegationPlan(team.id, options);
    return this.getTeam(team.id);
  }

  pauseTeam(teamId, reason = "Paused.") {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.PAUSED;
    team.limitations = unique(team.limitations.concat(reason));
    team.updatedAt = this.now();
    this.emitEvent(MultiAgentEventTypes.TEAM_PAUSED, { teamId: team.id, reason });
    return clone(team);
  }

  resumeTeam(teamId, options = {}) {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.ACTIVE;
    team.updatedAt = this.now();
    this.emitEvent(MultiAgentEventTypes.TEAM_RESUMED, { teamId: team.id });
    return options.execute === false ? clone(team) : this.startTeam(team.id, options);
  }

  cancelTeam(teamId, reason = "Cancelled.") {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.CANCELLING;
    for (const id of team.assignmentIds) {
      const assignment = this.assignments.get(id);
      if (!assignment) continue;
      if ([AssignmentStates.CREATED, AssignmentStates.QUEUED, AssignmentStates.WAITING_FOR_DEPENDENCY].includes(assignment.state)) this.cancelAssignment(id, reason);
      if ([AssignmentStates.GATHERING_CONTEXT, AssignmentStates.WAITING_FOR_MODEL, AssignmentStates.RUNNING, AssignmentStates.STREAMING].includes(assignment.state)) this.cancelAssignment(id, reason);
    }
    team.state = TeamStates.CANCELLED;
    team.completedAt = this.now();
    team.updatedAt = this.now();
    this.stats.teamsCancelled += 1;
    this.emitEvent(MultiAgentEventTypes.TEAM_CANCELLED, { teamId: team.id, reason });
    return clone(team);
  }

  completeTeam(teamId, result = {}) {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.COMPLETED;
    team.completedAt = this.now();
    team.updatedAt = this.now();
    team.metadata.result = clone(result);
    this.stats.teamsCompleted += 1;
    this.emitEvent(MultiAgentEventTypes.TEAM_COMPLETED, { teamId: team.id, result });
    return clone(team);
  }

  failTeam(teamId, error) {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.FAILED;
    team.completedAt = this.now();
    team.updatedAt = this.now();
    team.limitations = unique(team.limitations.concat(normalizeError(error).message));
    this.stats.teamsFailed += 1;
    this.stats.lastFailure = normalizeError(error);
    this.emitEvent(MultiAgentEventTypes.TEAM_FAILED, { teamId: team.id, error: this.stats.lastFailure });
    return clone(team);
  }

  getTeam(teamId) {
    return clone(this.teams.get(requiredString(teamId, "Team id is required.")) || null);
  }

  listTeams(filter = {}) {
    return Array.from(this.teams.values()).filter((team) => {
      if (filter.active) return [TeamStates.ACTIVE, TeamStates.WAITING, TeamStates.RECONCILING, TeamStates.VALIDATING].includes(team.state);
      return matches(team, filter);
    }).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))).map(clone);
  }

  explainTeam(teamId) {
    const team = this.requireTeam(teamId);
    return {
      id: team.id,
      state: team.state,
      objective: team.objective,
      strategy: team.strategy,
      assignments: team.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean).map(summarizeAssignment),
      conflicts: team.conflictIds.map((id) => this.conflicts.get(id)).filter(Boolean),
      decisions: team.decisionIds.map((id) => this.decisions.get(id)).filter(Boolean),
      warnings: team.warnings,
      limitations: team.limitations,
    };
  }

  createAssignment(teamId, input = {}, options = {}) {
    const team = this.requireTeam(teamId);
    if (team.assignmentIds.length >= this.bounds.maximumAssignmentsPerTeam) throw new Error("Maximum assignments per team exceeded.");
    const assignment = normalizeAssignment({
      teamId: team.id,
      id: input.id,
      parentAssignmentId: input.parentAssignmentId || null,
      role: input.role,
      type: input.type,
      objective: input.objective,
      scope: normalizeScope({ workspaceId: team.workspaceId, projectId: team.projectId, ...(input.scope || {}) }, this),
      expectedOutput: input.expectedOutput,
      requiredCapabilities: input.requiredCapabilities,
      allowedTools: input.allowedTools,
      prohibitedTools: input.prohibitedTools,
      dependencyIds: input.dependencyIds || input.dependencies,
      privacyClassification: input.privacyClassification,
      contextRequest: input.contextRequest,
      modelPreference: input.modelPreference,
      priority: input.priority,
      metadata: input.metadata,
    }, this);
    assignment.signature = assignmentSignature(assignment);
    const duplicate = team.assignmentIds.map((id) => this.assignments.get(id)).find((existing) => existing && existing.signature === assignment.signature);
    if (duplicate && !options.allowDuplicate) {
      this.stats.duplicateAssignmentsPrevented += 1;
      throw new Error(`Duplicate assignment prevented: ${assignment.objective}.`);
    }
    this.assignments.set(assignment.id, assignment);
    team.assignmentIds.push(assignment.id);
    if (!options.coordinator) team.dependencyGraph.assignments[assignment.id] = assignment.dependencyIds.slice();
    team.updatedAt = this.now();
    this.stats.assignmentsCreated += 1;
    this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_CREATED, { teamId: team.id, assignmentId: assignment.id, role: assignment.role });
    return clone(assignment);
  }

  startAssignment(assignmentId, options = {}) {
    const assignment = this.requireAssignment(assignmentId);
    const team = this.requireTeam(assignment.teamId);
    const unresolved = assignment.dependencyIds.filter((id) => {
      const dependency = this.assignments.get(id);
      return dependency && ![AssignmentStates.ACCEPTED, AssignmentStates.SUBMITTED].includes(dependency.state);
    });
    if (unresolved.length) {
      assignment.state = AssignmentStates.WAITING_FOR_DEPENDENCY;
      assignment.updatedAt = this.now();
      this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_WAITING, { teamId: team.id, assignmentId: assignment.id, dependencies: unresolved });
      return clone(assignment);
    }
    assignment.state = AssignmentStates.RUNNING;
    assignment.startedAt = assignment.startedAt || this.now();
    assignment.updatedAt = this.now();
    team.activeAssignmentIds = unique(team.activeAssignmentIds.concat(assignment.id));
    this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_STARTED, { teamId: team.id, assignmentId: assignment.id });
    if (options.execute === false) return clone(assignment);
    return this.executeAssignment(assignment.id, options);
  }

  async executeAssignment(assignmentId, options = {}) {
    const assignment = this.requireAssignment(assignmentId);
    const team = this.requireTeam(assignment.teamId);
    try {
      assignment.state = AssignmentStates.GATHERING_CONTEXT;
      assignment.updatedAt = this.now();
      const context = await this.buildAssignmentContext(assignment, options);
      assignment.contextPackageIds = safeArray(context.contextPackageIds || context.id || []);
      assignment.state = AssignmentStates.RUNNING;
      assignment.updatedAt = this.now();
      const raw = await this.runAssignmentThroughAgent(assignment, context, options);
      const result = this.createResult(assignment, raw, { context });
      assignment.resultId = result.id;
      assignment.state = result.status === OutputDispositions.ACCEPTED || result.status === OutputDispositions.PARTIALLY_ACCEPTED ? AssignmentStates.SUBMITTED : AssignmentStates.FAILED;
      assignment.completedAt = this.now();
      assignment.updatedAt = this.now();
      team.activeAssignmentIds = team.activeAssignmentIds.filter((id) => id !== assignment.id);
      team.completedAssignmentIds = unique(team.completedAssignmentIds.concat(assignment.id));
      this.stats.assignmentsCompleted += 1;
      this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_SUBMITTED, { teamId: team.id, assignmentId: assignment.id, resultId: result.id });
      this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_COMPLETED, { teamId: team.id, assignmentId: assignment.id });
      return clone(result);
    } catch (error) {
      assignment.state = AssignmentStates.FAILED;
      assignment.error = normalizeError(error);
      assignment.completedAt = this.now();
      assignment.updatedAt = this.now();
      team.activeAssignmentIds = team.activeAssignmentIds.filter((id) => id !== assignment.id);
      team.failedAssignmentIds = unique(team.failedAssignmentIds.concat(assignment.id));
      this.stats.assignmentsFailed += 1;
      this.stats.lastFailure = assignment.error;
      this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_FAILED, { teamId: team.id, assignmentId: assignment.id, error: assignment.error });
      return clone(assignment);
    }
  }

  pauseAssignment(assignmentId, reason = "Paused.") {
    const assignment = this.requireAssignment(assignmentId);
    assignment.state = AssignmentStates.WAITING_FOR_DEPENDENCY;
    assignment.limitations = unique(assignment.limitations.concat(reason));
    assignment.updatedAt = this.now();
    return clone(assignment);
  }

  resumeAssignment(assignmentId, options = {}) {
    const assignment = this.requireAssignment(assignmentId);
    assignment.state = AssignmentStates.QUEUED;
    assignment.updatedAt = this.now();
    return options.execute === false ? clone(assignment) : this.startAssignment(assignment.id, options);
  }

  cancelAssignment(assignmentId, reason = "Cancelled.") {
    const assignment = this.requireAssignment(assignmentId);
    assignment.state = AssignmentStates.CANCELLED;
    assignment.completedAt = this.now();
    assignment.updatedAt = this.now();
    assignment.limitations = unique(assignment.limitations.concat(reason));
    this.stats.assignmentsCancelled += 1;
    this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_CANCELLED, { teamId: assignment.teamId, assignmentId: assignment.id, reason });
    return clone(assignment);
  }

  retryAssignment(assignmentId, options = {}) {
    const assignment = this.requireAssignment(assignmentId);
    if (assignment.revision >= this.configuration.maximumRevisionRounds) throw new Error("Maximum assignment revisions exceeded.");
    assignment.revision += 1;
    assignment.state = AssignmentStates.QUEUED;
    assignment.error = null;
    assignment.updatedAt = this.now();
    this.stats.assignmentsRevised += 1;
    return options.execute === false ? clone(assignment) : this.startAssignment(assignment.id, options);
  }

  reviseAssignment(assignmentId, input = {}, options = {}) {
    const assignment = this.requireAssignment(assignmentId);
    if (assignment.revision >= this.configuration.maximumRevisionRounds) throw new Error("Maximum assignment revisions exceeded.");
    assignment.revision += 1;
    assignment.objective = input.objective || assignment.objective;
    assignment.scope = normalizeScope({ ...assignment.scope, ...(input.scope || {}) }, this);
    assignment.expectedOutput = input.expectedOutput || assignment.expectedOutput;
    assignment.state = AssignmentStates.QUEUED;
    assignment.updatedAt = this.now();
    this.stats.assignmentsRevised += 1;
    this.emitEvent(MultiAgentEventTypes.ASSIGNMENT_REVISION_REQUESTED, { assignmentId: assignment.id, instructions: input.instructions || null });
    return options.execute === false ? clone(assignment) : this.startAssignment(assignment.id, options);
  }

  getAssignment(assignmentId) {
    return clone(this.assignments.get(requiredString(assignmentId, "Assignment id is required.")) || null);
  }

  listAssignments(teamId, filter = {}) {
    const team = teamId ? this.requireTeam(teamId) : null;
    const values = team ? team.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean) : Array.from(this.assignments.values());
    return values.filter((assignment) => matches(assignment, filter)).sort(scheduleOrder).map(clone);
  }

  getAssignmentResult(assignmentId) {
    const assignment = this.requireAssignment(assignmentId);
    return assignment.resultId ? clone(this.results.get(assignment.resultId) || null) : null;
  }

  explainAssignment(assignmentId) {
    const assignment = this.requireAssignment(assignmentId);
    return {
      assignment: clone(assignment),
      role: this.getRole(assignment.role),
      dependencies: assignment.dependencyIds.map((id) => this.assignments.get(id)).filter(Boolean).map(summarizeAssignment),
      result: assignment.resultId ? this.results.get(assignment.resultId) : null,
    };
  }

  shouldDelegate(input = {}, options = {}) {
    this.stats.delegationEvaluations += 1;
    this.emitEvent(MultiAgentEventTypes.DELEGATION_EVALUATION_STARTED, { objective: input.objective || input.message || "" });
    const scoreResult = this.scoreDelegation(input, options);
    const threshold = Number(options.threshold || 40);
    const accepted = this.configuration.enabled !== false && scoreResult.score >= threshold && !scoreResult.limitations.some((entry) => /cannot be safely partitioned|required capabilities unavailable/i.test(entry));
    if (accepted) this.stats.delegationAccepted += 1;
    else this.stats.delegationRejected += 1;
    const result = {
      delegate: accepted,
      score: scoreResult.score,
      threshold,
      evidence: scoreResult.evidence,
      selectedStrategy: accepted ? scoreResult.selectedStrategy : DelegationStrategies.NONE,
      selectedRoles: accepted ? scoreResult.selectedRoles : [],
      rejectedRoles: scoreResult.rejectedRoles,
      limitations: accepted ? scoreResult.limitations : unique(scoreResult.limitations.concat("Delegation overhead exceeds expected value or task is simple.")),
    };
    this.emitEvent(MultiAgentEventTypes.DELEGATION_EVALUATION_COMPLETED, result);
    return result;
  }

  createDelegationPlan(input = {}, options = {}) {
    const eligibility = input.eligibility || this.shouldDelegate(input, options);
    const objective = input.objective || input.message || "Coordinate objective";
    const roles = eligibility.delegate ? eligibility.selectedRoles : [AgentRoles.COORDINATOR];
    const assignments = roles.filter((role) => role !== AgentRoles.COORDINATOR).map((role, index) => assignmentForRole(role, input, this, index));
    const plan = normalizeDelegationPlan({
      objective,
      workspaceId: input.workspaceId || input.scope && input.scope.workspaceId || null,
      projectId: input.projectId || input.scope && input.scope.projectId || null,
      strategy: eligibility.selectedStrategy || DelegationStrategies.NONE,
      roles,
      assignments,
      dependencies: dependenciesFor(assignments),
      parallelGroups: parallelGroupsFor(assignments, eligibility.selectedStrategy),
      reviewRequirements: reviewRequirementsFor(input, roles, this.configuration),
      reconciliationRules: ["Coordinator owns final result.", "Do not mutate during reconciliation.", "Do not treat model agreement as validation."],
      validationRequirements: validationRequirementsFor(input),
      approvalRequirements: ["Protected actions require LeviApplicationRuntime approval.", "Role reviews are not user approval."],
      securityRequirements: securityRequirementsFor(input, roles),
      privacyRequirements: ["Strictest assignment privacy classification governs model eligibility."],
      bounds: this.planBounds(),
      evidence: eligibility.evidence,
      confidence: eligibility.delegate ? 0.78 : 0.6,
      completeness: assignments.length ? 0.8 : 0.5,
      warnings: eligibility.delegate ? [] : ["Delegation not warranted; coordinator-only plan."],
      limitations: eligibility.limitations,
      metadata: { eligibilityScore: eligibility.score, threshold: eligibility.threshold },
    }, this);
    if (options.persist !== false) this.emitEvent(MultiAgentEventTypes.PLAN_CREATED, { planId: plan.id, strategy: plan.strategy });
    return clone(plan);
  }

  validateDelegationPlan(plan, options = {}) {
    const normalized = normalizeDelegationPlan(plan, this);
    const findings = [];
    if (!normalized.roles.includes(AgentRoles.COORDINATOR)) findings.push(issue("MISSING_COORDINATOR", "Delegation plan requires a coordinator."));
    if (this.configuration.requireCoordinatorReconciliation && !normalized.reconciliationRules.length) findings.push(issue("MISSING_RECONCILIATION", "Delegation plan requires reconciliation rules."));
    if (normalized.assignments.length > this.bounds.maximumAssignmentsPerTeam) findings.push(issue("EXCESSIVE_ASSIGNMENTS", "Delegation plan exceeds assignment bounds."));
    if (normalized.roles.length > this.configuration.maximumAgentsPerTeam) findings.push(issue("EXCESSIVE_ROLES", "Delegation plan exceeds maximum agents per team."));
    if (hasCycle(normalized.assignments, normalized.dependencies)) findings.push(issue("CIRCULAR_DEPENDENCY", "Delegation plan contains circular dependencies."));
    const signatures = new Set();
    for (const assignment of normalized.assignments) {
      const sig = assignmentSignature(normalizeAssignment({ ...assignment, teamId: "plan" }, this));
      if (signatures.has(sig)) findings.push(issue("DUPLICATE_ASSIGNMENT", `Duplicate assignment: ${assignment.objective}.`));
      signatures.add(sig);
      if (!this.roles.has(assignment.role)) findings.push(issue("UNSUPPORTED_ROLE", `Role unavailable: ${assignment.role}.`));
      if (assignment.scope && assignment.scope.sourceChanging && assignment.role !== AgentRoles.IMPLEMENTER && assignment.role !== AgentRoles.REPAIR_SPECIALIST) findings.push(issue("SCOPE_CONFLICT", `Source-changing scope assigned to non-implementer role ${assignment.role}.`));
      if (assignment.allowedTools && assignment.prohibitedTools && assignment.allowedTools.some((tool) => assignment.prohibitedTools.includes(tool))) findings.push(issue("PROHIBITED_TOOL", `Assignment both allows and prohibits a tool: ${assignment.objective}.`));
    }
    const sourceChanging = normalized.assignments.some((assignment) => assignment.scope && assignment.scope.sourceChanging);
    if (sourceChanging && this.configuration.requireIndependentReviewForSourceChanges && !normalized.roles.includes(AgentRoles.REVIEWER) && !normalized.roles.includes(AgentRoles.SECURITY_REVIEWER)) findings.push(issue("MISSING_INDEPENDENT_REVIEW", "Source-changing delegation requires independent review."));
    const securitySensitive = looksSecuritySensitive(normalized.objective) || normalized.assignments.some((assignment) => assignment.type === AssignmentTypes.SECURITY_REVIEW);
    if (securitySensitive && this.configuration.requireIndependentReviewForSecurityChanges && !normalized.roles.includes(AgentRoles.SECURITY_REVIEWER)) findings.push(issue("MISSING_SECURITY_REVIEW", "Security-sensitive delegation requires security review when available."));
    const validation = { valid: findings.length === 0, findings, warnings: [], checkedAt: this.now(), planId: normalized.id };
    this.emitEvent(validation.valid ? MultiAgentEventTypes.PLAN_VALIDATED : MultiAgentEventTypes.PLAN_REJECTED, validation);
    return validation;
  }

  async executeDelegationPlan(planOrTeamId, options = {}) {
    const team = typeof planOrTeamId === "string" && this.teams.has(planOrTeamId)
      ? this.requireTeam(planOrTeamId)
      : this.createTeam({ plan: planOrTeamId, objective: planOrTeamId.objective, workspaceId: planOrTeamId.workspaceId, projectId: planOrTeamId.projectId }, { ...options, persist: false });
    team.state = TeamStates.ACTIVE;
    const pending = () => team.assignmentIds.map((id) => this.assignments.get(id)).filter((assignment) => assignment && ![AssignmentStates.SUBMITTED, AssignmentStates.ACCEPTED, AssignmentStates.REJECTED, AssignmentStates.CANCELLED, AssignmentStates.FAILED].includes(assignment.state) && assignment.role !== AgentRoles.COORDINATOR);
    let guard = 0;
    while (pending().length && guard < this.bounds.maximumAssignmentsPerTeam) {
      guard += 1;
      const ready = pending().filter((assignment) => assignment.dependencyIds.every((id) => {
        const dependency = this.assignments.get(id);
        return !dependency || [AssignmentStates.SUBMITTED, AssignmentStates.ACCEPTED].includes(dependency.state);
      })).sort(scheduleOrder).slice(0, this.configuration.enableParallelism ? this.configuration.maximumConcurrentAssignments : 1);
      if (!ready.length) {
        team.state = TeamStates.WAITING;
        this.emitEvent(MultiAgentEventTypes.TEAM_WAITING, { teamId: team.id });
        break;
      }
      if (ready.length > 1) this.stats.parallelAssignments += ready.length;
      else this.stats.sequentialAssignments += 1;
      await Promise.all(ready.map((assignment) => this.startAssignment(assignment.id, options)));
    }
    this.detectConflicts(team.id, options);
    return this.reconcileTeam(team.id, options);
  }

  async reconcileTeam(teamId, options = {}) {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.RECONCILING;
    team.updatedAt = this.now();
    this.emitEvent(MultiAgentEventTypes.RECONCILIATION_STARTED, { teamId: team.id });
    const conflicts = this.detectConflicts(team.id, options);
    const results = team.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean).map((assignment) => assignment.resultId && this.results.get(assignment.resultId)).filter(Boolean);
    const openCritical = conflicts.filter((conflict) => conflict.resolutionStatus !== "RESOLVED" && conflict.severity === ConflictSeverities.CRITICAL);
    const openHigh = conflicts.filter((conflict) => conflict.resolutionStatus !== "RESOLVED" && conflict.severity === ConflictSeverities.HIGH);
    const accepted = results.filter((result) => [OutputDispositions.ACCEPTED, OutputDispositions.PARTIALLY_ACCEPTED].includes(result.status));
    const disposition = team.state === TeamStates.CANCELLED ? TeamDispositions.CANCELLED
      : openCritical.length ? TeamDispositions.BLOCKED
      : openHigh.length ? TeamDispositions.CONFLICTED
      : accepted.some((result) => result.proposals.length) ? TeamDispositions.PROPOSAL_READY
      : accepted.length === results.length && results.length ? TeamDispositions.COMPLETED
      : accepted.length ? TeamDispositions.PARTIALLY_COMPLETED
      : TeamDispositions.CAPABILITY_UNAVAILABLE;
    const teamResult = {
      id: this.idAdapter.next("team-result", { teamId: team.id, count: this.decisions.size + 1 }),
      teamId: team.id,
      objective: team.objective,
      disposition,
      acceptedResultIds: accepted.map((result) => result.id),
      rejectedResultIds: results.filter((result) => !accepted.includes(result)).map((result) => result.id),
      unresolvedConflicts: conflicts.filter((conflict) => conflict.resolutionStatus !== "RESOLVED").map((conflict) => conflict.id),
      proposedChanges: accepted.flatMap((result) => result.proposals),
      appliedChanges: accepted.flatMap((result) => safeArray(result.metadata.appliedChanges)),
      validationState: validationStateFor(accepted),
      securityReviewState: securityReviewStateFor(accepted, team),
      testState: testStateFor(accepted),
      evidence: uniqueById(accepted.flatMap((result) => result.evidence).concat(team.evidence)),
      warnings: unique(team.warnings.concat(accepted.flatMap((result) => result.warnings))),
      limitations: unique(team.limitations.concat(accepted.flatMap((result) => result.limitations))),
      confidence: average(accepted.map((result) => result.confidence), accepted.length ? 0.7 : 0.35),
      completeness: average(accepted.map((result) => result.completeness), accepted.length ? 0.65 : 0.3),
      recommendedNextAction: recommendedNextAction(disposition),
      createdAt: this.now(),
    };
    const decision = this.createDecision(team.id, {
      assignmentIds: team.assignmentIds,
      type: "FINAL_RECONCILIATION",
      decision: disposition,
      rationale: "Coordinator reconciled normalized assignment results using evidence, conflict state, and approval/validation boundaries.",
      acceptedResultIds: teamResult.acceptedResultIds,
      rejectedResultIds: teamResult.rejectedResultIds,
      evidence: teamResult.evidence,
      authority: AgentRoles.COORDINATOR,
      confidence: teamResult.confidence,
      metadata: { teamResult },
    });
    team.decisionIds = unique(team.decisionIds.concat(decision.id));
    team.metadata.result = teamResult;
    team.confidence = teamResult.confidence;
    team.completeness = teamResult.completeness;
    team.state = disposition === TeamDispositions.COMPLETED || disposition === TeamDispositions.PROPOSAL_READY ? TeamStates.COMPLETED
      : disposition === TeamDispositions.PARTIALLY_COMPLETED ? TeamStates.PARTIALLY_COMPLETED
      : disposition === TeamDispositions.CANCELLED ? TeamStates.CANCELLED
      : TeamStates.FAILED;
    team.completedAt = this.now();
    team.updatedAt = this.now();
    if (team.state === TeamStates.COMPLETED) this.stats.teamsCompleted += 1;
    if (team.state === TeamStates.PARTIALLY_COMPLETED) this.stats.teamsPartiallyCompleted += 1;
    if (team.state === TeamStates.FAILED) this.stats.teamsFailed += 1;
    this.emitEvent(MultiAgentEventTypes.RECONCILIATION_COMPLETED, { teamId: team.id, disposition });
    this.emitEvent(team.state === TeamStates.COMPLETED ? MultiAgentEventTypes.TEAM_COMPLETED : team.state === TeamStates.PARTIALLY_COMPLETED ? MultiAgentEventTypes.TEAM_PARTIALLY_COMPLETED : MultiAgentEventTypes.TEAM_FAILED, { teamId: team.id, disposition });
    return clone(teamResult);
  }

  async validateTeamResult(teamId, options = {}) {
    const team = this.requireTeam(teamId);
    team.state = TeamStates.VALIDATING;
    const result = team.metadata.result || await this.reconcileTeam(team.id, options);
    if (result.proposedChanges && result.proposedChanges.length && this.runtime && typeof this.runtime.executeCommand === "function") {
      const validations = [];
      for (const proposal of result.proposedChanges) {
        if (proposal.id || proposal.proposalId) {
          try { validations.push(await this.runtime.executeCommand("change.validateProposal", { proposalId: proposal.id || proposal.proposalId })); } catch (error) { validations.push({ success: false, error: normalizeError(error) }); }
        }
      }
      result.validationState = validations.every((entry) => entry.success !== false) ? "PROPOSAL_VALIDATED" : "VALIDATION_FAILED";
      result.validationEvidence = validations.map((entry) => ({ source: "LeviApplicationRuntime", command: "change.validateProposal", success: entry.success !== false, operationId: entry.operationId || null }));
    }
    team.metadata.result = result;
    team.updatedAt = this.now();
    return clone(result);
  }

  getDelegationPreview(input = {}, options = {}) {
    const eligibility = this.shouldDelegate(input, options);
    const plan = this.createDelegationPlan(input, { ...options, eligibility, persist: false });
    const validation = this.validateDelegationPlan(plan, options);
    return { eligibility, plan, validation, health: this.getHealth({ skipChecks: true }) };
  }

  detectConflicts(teamId, options = {}) {
    const team = this.requireTeam(teamId);
    const results = team.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean).map((assignment) => assignment.resultId && this.results.get(assignment.resultId)).filter(Boolean);
    const conflicts = [];
    const proposalClaims = [];
    for (const result of results) {
      for (const proposal of result.proposals) {
        for (const file of proposal.fileChanges || proposal.files || []) proposalClaims.push({ result, proposal, file: file.uri || file.path || file.relativePath, hash: proposal.proposalHash || stableHash(proposal) });
      }
    }
    const byFile = groupBy(proposalClaims, (claim) => claim.file);
    for (const [file, claims] of Object.entries(byFile)) {
      const hashes = unique(claims.map((claim) => claim.hash));
      if (claims.length > 1 && hashes.length > 1) conflicts.push(this.createConflict(team, {
        assignmentIds: unique(claims.map((claim) => claim.result.assignmentId)),
        category: ConflictCategories.OVERLAPPING_CHANGE,
        severity: ConflictSeverities.HIGH,
        description: `Multiple proposals touch ${file} with different proposal hashes.`,
        conflictingProposals: claims.map((claim) => ({ proposalId: claim.proposal.id || claim.proposal.proposalId || null, file, hash: claim.hash })),
        evidence: claims.flatMap((claim) => claim.result.evidence),
      }));
      if (claims.length > 1 && hashes.length === 1) conflicts.push(this.createConflict(team, {
        assignmentIds: unique(claims.map((claim) => claim.result.assignmentId)),
        category: ConflictCategories.DUPLICATE_WORK,
        severity: ConflictSeverities.LOW,
        description: `Duplicate proposal work detected for ${file}.`,
        conflictingProposals: claims.map((claim) => ({ proposalId: claim.proposal.id || claim.proposal.proposalId || null, file, hash: claim.hash })),
        evidence: claims.flatMap((claim) => claim.result.evidence),
      }));
    }
    const findings = results.flatMap((result) => result.findings.map((finding) => ({ result, finding })));
    const groupedFindings = groupBy(findings, (entry) => normalizeToken(entry.finding.title || entry.finding.description));
    for (const entries of Object.values(groupedFindings)) {
      const statuses = unique(entries.map((entry) => String(entry.finding.status || "").toUpperCase()).filter(Boolean));
      if (entries.length > 1 && statuses.length > 1) conflicts.push(this.createConflict(team, {
        assignmentIds: unique(entries.map((entry) => entry.result.assignmentId)),
        category: ConflictCategories.CONTRADICTORY_FINDING,
        severity: entries.some((entry) => entry.finding.severity === ConflictSeverities.CRITICAL) ? ConflictSeverities.CRITICAL : ConflictSeverities.MEDIUM,
        description: "Assignments produced contradictory findings.",
        conflictingClaims: entries.map((entry) => ({ findingId: entry.finding.id, status: entry.finding.status, title: entry.finding.title })),
        evidence: entries.flatMap((entry) => entry.finding.evidence || []),
      }));
    }
    team.conflictIds = unique(team.conflictIds.concat(conflicts.map((conflict) => conflict.id)));
    this.stats.conflictsDetected += conflicts.length;
    this.stats.criticalConflicts += conflicts.filter((conflict) => conflict.severity === ConflictSeverities.CRITICAL).length;
    return conflicts.map(clone);
  }

  getConflict(conflictId) {
    return clone(this.conflicts.get(requiredString(conflictId, "Conflict id is required.")) || null);
  }

  listConflicts(filter = {}) {
    return Array.from(this.conflicts.values()).filter((conflict) => matches(conflict, filter)).sort(byId).map(clone);
  }

  resolveConflict(conflictId, resolution, options = {}) {
    const conflict = this.requireConflict(conflictId);
    const method = normalizeEnum(resolution.method || resolution.type || ConflictResolutionMethods.DEFER, ConflictResolutionMethods);
    if ([ConflictSeverities.CRITICAL].includes(conflict.severity) && ![ConflictResolutionMethods.ESCALATE_TO_USER, ConflictResolutionMethods.REJECT_ALL, ConflictResolutionMethods.DEFER].includes(method) && options.force !== true) {
      throw new Error("Critical conflicts require rejection, deferral, or user escalation.");
    }
    conflict.resolutionStatus = method === ConflictResolutionMethods.ESCALATE_TO_USER ? "ESCALATED" : method === ConflictResolutionMethods.DEFER ? "DEFERRED" : "RESOLVED";
    conflict.resolution = { method, rationale: resolution.rationale || "", acceptedResultIds: safeArray(resolution.acceptedResultIds), rejectedResultIds: safeArray(resolution.rejectedResultIds) };
    conflict.resolvedBy = resolution.resolvedBy || AgentRoles.COORDINATOR;
    conflict.resolvedAt = this.now();
    if (conflict.resolutionStatus === "RESOLVED") this.stats.conflictsResolved += 1;
    if (conflict.resolutionStatus === "ESCALATED") this.stats.conflictsEscalated += 1;
    this.emitEvent(conflict.resolutionStatus === "ESCALATED" ? MultiAgentEventTypes.CONFLICT_ESCALATED : MultiAgentEventTypes.CONFLICT_RESOLVED, { conflictId: conflict.id, resolutionStatus: conflict.resolutionStatus });
    return clone(conflict);
  }

  explainConflict(conflictId) {
    const conflict = this.requireConflict(conflictId);
    return {
      conflict: clone(conflict),
      assignments: conflict.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean).map(summarizeAssignment),
      safeResolutionMethods: conflict.severity === ConflictSeverities.CRITICAL
        ? [ConflictResolutionMethods.ESCALATE_TO_USER, ConflictResolutionMethods.REJECT_ALL, ConflictResolutionMethods.DEFER]
        : Object.values(ConflictResolutionMethods),
    };
  }

  requestReview(input = {}, options = {}) {
    const team = this.requireTeam(input.teamId);
    const source = input.assignmentId && this.requireAssignment(input.assignmentId);
    if (source && source.role === AgentRoles.REVIEWER) throw new Error("A reviewer cannot self-review.");
    return this.createAssignment(team.id, {
      role: input.role || (looksSecuritySensitive(input.objective || team.objective) ? AgentRoles.SECURITY_REVIEWER : AgentRoles.REVIEWER),
      type: input.type || AssignmentTypes.CHANGE_REVIEW,
      objective: input.objective || `Review result ${input.resultId || source && source.resultId || ""}`.trim(),
      scope: { ...(input.scope || {}), proposalIds: safeArray(input.proposalId || input.proposalIds), readOnly: true },
      expectedOutput: "Independent review findings with evidence and limitations.",
      dependencyIds: safeArray(input.assignmentId),
    }, options);
  }

  reviewResult(resultId, options = {}) {
    const result = this.requireResult(resultId);
    return {
      resultId,
      accepted: result.evidence.length > 0 || this.configuration.requireEvidence === false,
      limitations: result.evidence.length ? result.limitations : unique(result.limitations.concat("Result has insufficient evidence.")),
      sameModelLimitation: sameModelLimitation(result, options),
    };
  }

  acceptResult(resultId, options = {}) {
    const result = this.requireResult(resultId);
    if (this.configuration.requireEvidence && !result.evidence.length) throw new Error("Cannot accept result without evidence.");
    result.status = OutputDispositions.ACCEPTED;
    result.metadata.acceptedBy = options.acceptedBy || AgentRoles.COORDINATOR;
    result.metadata.acceptedAt = this.now();
    this.stats.resultsAccepted += 1;
    this.emitEvent(MultiAgentEventTypes.RESULT_ACCEPTED, { resultId });
    return clone(result);
  }

  rejectResult(resultId, reason = "Rejected.", options = {}) {
    const result = this.requireResult(resultId);
    result.status = OutputDispositions.REJECTED;
    result.limitations = unique(result.limitations.concat(reason));
    result.metadata.rejectedBy = options.rejectedBy || AgentRoles.COORDINATOR;
    result.metadata.rejectedAt = this.now();
    this.stats.resultsRejected += 1;
    this.emitEvent(MultiAgentEventTypes.RESULT_REJECTED, { resultId, reason });
    return clone(result);
  }

  requestRevision(resultId, instructions, options = {}) {
    const result = this.requireResult(resultId);
    const assignment = this.requireAssignment(result.assignmentId);
    result.status = OutputDispositions.NEEDS_REVISION;
    return this.reviseAssignment(assignment.id, { instructions, objective: `${assignment.objective}\nRevision: ${instructions}` }, options);
  }

  getDecision(decisionId) {
    return clone(this.decisions.get(requiredString(decisionId, "Decision id is required.")) || null);
  }

  listDecisions(filter = {}) {
    return Array.from(this.decisions.values()).filter((decision) => matches(decision, filter)).sort(byId).map(clone);
  }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw new Error("Listener must be a function.");
    if (this.listeners.size >= this.bounds.maximumListeners) throw new Error("Maximum listeners exceeded.");
    const id = this.idAdapter.next("multi-agent-subscription", { count: this.listeners.size + 1 });
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
    const before = this.events.length;
    this.events = options.keepLast ? this.events.slice(-Number(options.keepLast)) : [];
    return { cleared: before - this.events.length, remaining: this.events.length };
  }

  async buildAssignmentContext(assignment, options = {}) {
    const request = {
      workspaceId: assignment.scope.workspaceId,
      projectId: assignment.scope.projectId,
      purpose: assignment.type,
      objective: assignment.objective,
      scope: clone(assignment.scope),
      maximumTokens: assignment.contextRequest.maximumTokens || assignment.maximumContextTokens || this.configuration.maximumContextTokensPerAssignment,
      privacyClassification: assignment.privacyClassification,
    };
    if (this.runtime && typeof this.runtime.executeCommand === "function") {
      try {
        const response = await this.runtime.executeCommand("context.build", request, { timeoutMs: this.configuration.maximumAssignmentDurationMs });
        return {
          id: response.data && response.data.id || response.operationId || this.idAdapter.next("context", { assignmentId: assignment.id }),
          status: response.success === false ? "UNAVAILABLE" : "AVAILABLE",
          response,
          evidence: [{ source: "LeviApplicationRuntime", command: "context.build", operationId: response.operationId || null }],
          contextPackageIds: [response.data && response.data.id || response.operationId || request.purpose].filter(Boolean),
        };
      } catch (error) {
        assignment.limitations = unique(assignment.limitations.concat(`Context build unavailable: ${error.message}`));
      }
    }
    return {
      id: this.idAdapter.next("context", { assignmentId: assignment.id }),
      status: "DETERMINISTIC_STUB",
      evidence: [{ source: "MultiAgentCoordinationEngine", signal: "bounded fallback context", assignmentId: assignment.id }],
      contextPackageIds: [`context:${assignment.id}`],
    };
  }

  async runAssignmentThroughAgent(assignment, context, options = {}) {
    const evidence = safeArray(context.evidence).concat({ source: "MultiAgentCoordinationEngine", signal: "assignment normalized", assignmentId: assignment.id, role: assignment.role });
    if (this.runtime && typeof this.runtime.executeCommand === "function" && options.skipAgent !== true) {
      try {
        const conversation = await this.runtime.executeCommand("agent.createConversation", {
          objective: assignment.objective,
          workspaceId: assignment.scope.workspaceId,
          projectId: assignment.scope.projectId,
          mode: "PROPOSAL_ONLY",
          metadata: { teamId: assignment.teamId, assignmentId: assignment.id, role: assignment.role },
        }, { timeoutMs: this.configuration.maximumAssignmentDurationMs });
        const conversationId = conversation.data && conversation.data.id;
        const message = await this.runtime.executeCommand("agent.sendMessage", {
          conversationId,
          message: {
            content: assignmentPrompt(assignment, context),
            metadata: { teamId: assignment.teamId, assignmentId: assignment.id },
          },
          options: { skipModel: options.skipModel === true },
        }, { timeoutMs: this.configuration.maximumAssignmentDurationMs });
        evidence.push({ source: "LeviApplicationRuntime", command: "agent.createConversation", operationId: conversation.operationId || null });
        evidence.push({ source: "LeviApplicationRuntime", command: "agent.sendMessage", operationId: message.operationId || null });
        return normalizeRawAssignmentOutput(assignment, {
          summary: message.data && message.data.response && message.data.response.content || `${assignment.role} completed bounded assignment.`,
          evidence,
          warnings: safeArray(message.warnings),
          limitations: safeArray(message.limitations),
          metadata: { conversationId, turnId: message.data && message.data.turn && message.data.turn.id || null },
        }, this);
      } catch (error) {
        evidence.push({ source: "LeviApplicationRuntime", signal: "agent command unavailable", error: error.message });
      }
    }
    return normalizeRawAssignmentOutput(assignment, deterministicRoleOutput(assignment, evidence), this);
  }

  createResult(assignment, raw, options = {}) {
    const result = normalizeResult({
      assignmentId: assignment.id,
      teamId: assignment.teamId,
      role: assignment.role,
      status: raw.status,
      summary: raw.summary,
      findings: raw.findings,
      recommendations: raw.recommendations,
      proposals: raw.proposals,
      testCases: raw.testCases,
      validationInterpretation: raw.validationInterpretation,
      risks: raw.risks,
      assumptions: raw.assumptions,
      unresolvedQuestions: raw.unresolvedQuestions,
      evidence: raw.evidence,
      confidence: raw.confidence,
      completeness: raw.completeness,
      warnings: raw.warnings,
      limitations: raw.limitations,
      usage: raw.usage,
      modelReferences: raw.modelReferences,
      metadata: { ...(raw.metadata || {}), contextPackageIds: options.context && options.context.contextPackageIds || [] },
    }, this);
    if (this.configuration.requireEvidence) {
      for (const finding of result.findings) {
        if (!finding.evidence.length) {
          finding.status = "INSUFFICIENT_EVIDENCE";
          result.limitations = unique(result.limitations.concat(`Finding lacks evidence: ${finding.title}.`));
        }
      }
      if (!result.evidence.length) result.status = OutputDispositions.INSUFFICIENT_EVIDENCE;
    }
    this.results.set(result.id, result);
    this.stats.resultsAccepted += [OutputDispositions.ACCEPTED, OutputDispositions.PARTIALLY_ACCEPTED].includes(result.status) ? 1 : 0;
    this.emitEvent(MultiAgentEventTypes.RESULT_CREATED, { resultId: result.id, assignmentId: assignment.id });
    return clone(result);
  }

  createConflict(team, input = {}) {
    const conflict = normalizeConflict({
      teamId: team.id,
      ...input,
    }, this);
    if (!this.conflicts.has(conflict.id)) {
      this.conflicts.set(conflict.id, conflict);
      this.emitEvent(MultiAgentEventTypes.CONFLICT_DETECTED, { teamId: team.id, conflictId: conflict.id, severity: conflict.severity });
    }
    return this.conflicts.get(conflict.id);
  }

  createDecision(teamId, input = {}) {
    const decision = normalizeDecision({ teamId, ...input }, this);
    this.decisions.set(decision.id, decision);
    return clone(decision);
  }

  scoreDelegation(input = {}, options = {}) {
    const objective = `${input.objective || input.message || ""} ${JSON.stringify(input.scope || {})}`.toLowerCase();
    const fileCount = safeArray(input.fileUris || input.files || input.scope && input.scope.fileUris).length;
    const subsystems = safeArray(input.subsystems || input.directories || input.scope && input.scope.directories).length;
    const explicit = /\b(multiple perspectives|delegate|agents|parallel|review board|specialists)\b/.test(objective);
    const sourceChanging = input.sourceChanging === true || /\b(implement|edit|change|modify|patch|refactor|fix|create|delete|rename)\b/.test(objective);
    const security = input.securitySensitive === true || looksSecuritySensitive(objective);
    const validation = /\b(test|validate|failing|failure|ci|lint|typecheck)\b/.test(objective);
    const architecture = /\b(architecture|design|boundary|subsystem)\b/.test(objective);
    const release = /\b(release|readiness|ship|milestone)\b/.test(objective);
    const simpleQuestion = /\?$/.test((input.objective || input.message || "").trim()) && !sourceChanging && !validation && fileCount <= 1;
    const evidence = [];
    let scoreValue = 0;
    const add = (points, reason) => { scoreValue += points; evidence.push({ source: "MultiAgentCoordinationEngine", signal: reason, points }); };
    if (explicit) add(25, "user explicitly requested multiple perspectives or delegation");
    if (fileCount > 1) add(Math.min(20, fileCount * 5), "multiple files in scope");
    if (/\b(multi[- ]file|multiple files|several files)\b/.test(objective)) add(15, "objective names multi-file scope");
    if (subsystems > 1) add(15, "multiple subsystems in scope");
    if (sourceChanging) add(18, "source-changing work benefits from independent review");
    if (sourceChanging && (fileCount > 1 || /\b(multi[- ]file|multiple files|several files)\b/.test(objective))) add(22, "source-changing work spans multiple files");
    if (security) add(18, "security-sensitive work benefits from security review");
    if (validation) add(12, "validation interpretation may need tester/reviewer");
    if (architecture) add(10, "architecture and implementation concerns can separate");
    if (release) add(25, "release assessment spans multiple domains");
    if (objective.length > 220) add(8, "objective complexity");
    if (simpleQuestion) scoreValue -= 35;
    const roles = selectRoles({ sourceChanging, security, validation, architecture, release, explicit, fileCount, simpleQuestion }, this);
    const strategy = selectStrategy({ sourceChanging, security, validation, architecture, release, fileCount, subsystems, roles }, this.configuration);
    const rejectedRoles = Object.values(AgentRoles).filter((role) => !roles.includes(role) && role !== AgentRoles.CUSTOM).map((role) => ({ role, reason: "Not required for bounded objective." }));
    const limitations = [];
    if (simpleQuestion) limitations.push("Simple question can use single-agent fallback.");
    if (roles.length > this.configuration.maximumAgentsPerTeam) limitations.push("Selected roles exceed team bounds.");
    if (!this.configuration.enabled) limitations.push("Multi-agent coordination is disabled.");
    return {
      score: Math.max(0, Math.min(100, scoreValue)),
      evidence,
      selectedStrategy: strategy,
      selectedRoles: roles.slice(0, this.configuration.maximumAgentsPerTeam),
      rejectedRoles,
      limitations,
    };
  }

  planBounds() {
    return {
      maximumAgentsPerTeam: this.configuration.maximumAgentsPerTeam,
      maximumConcurrentAssignments: this.configuration.maximumConcurrentAssignments,
      maximumAssignmentsPerTeam: this.configuration.maximumAssignmentsPerTeam,
      maximumAssignmentDepth: this.configuration.maximumAssignmentDepth,
      maximumDelegationRounds: this.configuration.maximumDelegationRounds,
      maximumContextTokensPerAssignment: this.configuration.maximumContextTokensPerAssignment,
      maximumModelRequestsPerAssignment: this.configuration.maximumModelRequestsPerAssignment,
      maximumToolCallsPerAssignment: this.configuration.maximumToolCallsPerAssignment,
    };
  }

  availableCapabilities() {
    if (!this.runtime || typeof this.runtime.discoverRuntimeCapabilities !== "function") return [];
    try { return safeArray(this.runtime.discoverRuntimeCapabilities({ source: "MultiAgentCoordinationEngine" }).availableCapabilities); } catch (_) { return []; }
  }

  resolveRoleId(roleIdOrRole) {
    const value = requiredString(roleIdOrRole, "Role id is required.").toUpperCase();
    if (this.roles.has(value)) return value;
    const match = Array.from(this.roles.values()).find((role) => role.role === value || role.name.toUpperCase() === value);
    return match ? match.id : value;
  }

  requireTeam(teamId) {
    const team = this.teams.get(requiredString(teamId, "Team id is required."));
    if (!team) throw new Error(`Team does not exist: ${teamId}.`);
    return team;
  }

  requireAssignment(assignmentId) {
    const assignment = this.assignments.get(requiredString(assignmentId, "Assignment id is required."));
    if (!assignment) throw new Error(`Assignment does not exist: ${assignmentId}.`);
    return assignment;
  }

  requireResult(resultId) {
    const result = this.results.get(requiredString(resultId, "Result id is required."));
    if (!result) throw new Error(`Result does not exist: ${resultId}.`);
    return result;
  }

  requireConflict(conflictId) {
    const conflict = this.conflicts.get(requiredString(conflictId, "Conflict id is required."));
    if (!conflict) throw new Error(`Conflict does not exist: ${conflictId}.`);
    return conflict;
  }

  emitEvent(type, payload = {}) {
    const event = { id: this.idAdapter.next("multi-agent-event", { type, sequence: this.events.length + 1 }), type, payload: clone(payload), timestamp: this.now(), sequence: this.events.length + 1 };
    this.events.push(event);
    while (this.events.length > this.bounds.maximumEventHistory) this.events.shift();
    this.emit("multi_agent_event", clone(event));
    for (const subscription of this.listeners.values()) {
      if (!eventMatches(event, subscription.filter)) continue;
      try { subscription.listener(clone(event)); } catch (_) { /* listeners are isolated */ }
    }
    return event;
  }

  now() {
    const value = this.clock.now();
    return typeof value === "string" ? new Date(value).toISOString() : new Date(value).toISOString();
  }

  updateAverages(team) {
    this.stats.averageAgentsPerTeam = runningAverage(this.stats.averageAgentsPerTeam, this.stats.teamsCreated, team.assignmentIds.length ? unique(team.assignmentIds.map((id) => this.assignments.get(id)).filter(Boolean).map((assignment) => assignment.role)).length : 0);
    this.stats.averageAssignmentsPerTeam = runningAverage(this.stats.averageAssignmentsPerTeam, this.stats.teamsCreated, team.assignmentIds.length);
  }
}

class MemoryMultiAgentPersistenceAdapter {
  constructor() {
    this.snapshot = null;
  }
  save(snapshot) {
    this.snapshot = clone(snapshot);
    return { status: "PERSISTED", inMemory: true };
  }
  load() {
    return this.snapshot ? { status: "LOADED", snapshot: clone(this.snapshot) } : { status: "EMPTY" };
  }
  status() {
    return { status: "AVAILABLE", inMemory: true };
  }
}

function rolePreset(role, name, responsibilities, prohibitedResponsibilities) {
  return {
    id: role,
    role,
    name,
    description: `${name} role for bounded Levi delegation.`,
    responsibilities,
    prohibitedResponsibilities,
    requiredCapabilities: [],
    optionalCapabilities: [],
    allowedTools: defaultToolsForRole(role),
    prohibitedTools: ["change.applyApproved", "command.runValidation"].concat(role === AgentRoles.REVIEWER || role === AgentRoles.SECURITY_REVIEWER ? [] : ["change.revert"]),
    defaultPrivacyClassification: "USER_CONTENT",
    maximumContextTokens: 2500,
    maximumModelRequests: 1,
    maximumToolCalls: 4,
    outputSchema: { type: "AgentResult" },
    reviewRequirements: reviewRequirementsForRole(role),
    metadata: {},
  };
}

function defaultToolsForRole(role) {
  const readTools = ["runtime.health", "project.summary", "project.architecture", "repository.search", "code.understand", "context.build"];
  if (role === AgentRoles.IMPLEMENTER || role === AgentRoles.REPAIR_SPECIALIST) return readTools.concat(["change.createProposal", "change.validateProposal", "change.previewDiff"]);
  if (role === AgentRoles.REVIEWER || role === AgentRoles.SECURITY_REVIEWER || role === AgentRoles.TESTER) return readTools.concat(["change.validateProposal", "change.previewDiff", "command.listAllowed", "sourceControl.diff"]);
  return readTools;
}

function reviewRequirementsForRole(role) {
  if (role === AgentRoles.IMPLEMENTER || role === AgentRoles.REPAIR_SPECIALIST) return ["independent review before apply"];
  if (role === AgentRoles.SECURITY_REVIEWER) return ["security evidence required", "review is not approval"];
  return [];
}

function normalizeConfiguration(input = {}) {
  const merged = { ...DEFAULT_CONFIGURATION, ...clone(input), metadata: clone(input.metadata || {}) };
  return {
    id: requiredString(merged.id, "Multi-agent configuration id is required."),
    schemaVersion: Number(merged.schemaVersion || MULTI_AGENT_COORDINATION_SCHEMA_VERSION),
    enabled: merged.enabled !== false,
    defaultStrategy: normalizeEnum(merged.defaultStrategy || DelegationStrategies.ADAPTIVE_BOUNDED, DelegationStrategies),
    maximumAgentsPerTeam: positive(merged.maximumAgentsPerTeam, DEFAULT_CONFIGURATION.maximumAgentsPerTeam),
    maximumConcurrentAssignments: positive(merged.maximumConcurrentAssignments, DEFAULT_CONFIGURATION.maximumConcurrentAssignments),
    maximumAssignmentsPerTeam: positive(merged.maximumAssignmentsPerTeam, DEFAULT_CONFIGURATION.maximumAssignmentsPerTeam),
    maximumAssignmentDepth: positive(merged.maximumAssignmentDepth, DEFAULT_CONFIGURATION.maximumAssignmentDepth),
    maximumDelegationRounds: positive(merged.maximumDelegationRounds, DEFAULT_CONFIGURATION.maximumDelegationRounds),
    maximumReviewRounds: positive(merged.maximumReviewRounds, DEFAULT_CONFIGURATION.maximumReviewRounds),
    maximumRevisionRounds: positive(merged.maximumRevisionRounds, DEFAULT_CONFIGURATION.maximumRevisionRounds),
    maximumContextPackagesPerAssignment: positive(merged.maximumContextPackagesPerAssignment, DEFAULT_CONFIGURATION.maximumContextPackagesPerAssignment),
    maximumContextTokensPerAssignment: positive(merged.maximumContextTokensPerAssignment, DEFAULT_CONFIGURATION.maximumContextTokensPerAssignment),
    maximumModelRequestsPerAssignment: positive(merged.maximumModelRequestsPerAssignment, DEFAULT_CONFIGURATION.maximumModelRequestsPerAssignment),
    maximumToolCallsPerAssignment: positive(merged.maximumToolCallsPerAssignment, DEFAULT_CONFIGURATION.maximumToolCallsPerAssignment),
    maximumTotalModelRequests: positive(merged.maximumTotalModelRequests, DEFAULT_CONFIGURATION.maximumTotalModelRequests),
    maximumTotalToolCalls: positive(merged.maximumTotalToolCalls, DEFAULT_CONFIGURATION.maximumTotalToolCalls),
    maximumTeamDurationMs: positive(merged.maximumTeamDurationMs, DEFAULT_CONFIGURATION.maximumTeamDurationMs),
    maximumAssignmentDurationMs: positive(merged.maximumAssignmentDurationMs, DEFAULT_CONFIGURATION.maximumAssignmentDurationMs),
    requireEvidence: merged.requireEvidence !== false,
    requireIndependentReviewForSourceChanges: merged.requireIndependentReviewForSourceChanges !== false,
    requireIndependentReviewForSecurityChanges: merged.requireIndependentReviewForSecurityChanges !== false,
    requireCoordinatorReconciliation: merged.requireCoordinatorReconciliation !== false,
    allowSameModelForReview: merged.allowSameModelForReview !== false,
    allowSameProviderForReview: merged.allowSameProviderForReview !== false,
    enableParallelism: merged.enableParallelism !== false,
    enablePersistence: merged.enablePersistence !== false,
    storagePath: merged.storagePath || DEFAULT_CONFIGURATION.storagePath,
    metadata: clone(merged.metadata || {}),
  };
}

function normalizeBounds(input = {}) {
  return Object.fromEntries(Object.entries({ ...DEFAULT_BOUNDS, ...input }).map(([key, value]) => [key, positive(value, DEFAULT_BOUNDS[key] || 1)]));
}

function boundsFromConfiguration(config) {
  return {
    maximumAgentsPerTeam: config.maximumAgentsPerTeam,
    maximumAssignmentsPerTeam: config.maximumAssignmentsPerTeam,
    maximumActiveAssignments: config.maximumConcurrentAssignments,
    maximumAssignmentDepth: config.maximumAssignmentDepth,
    maximumDelegationRounds: config.maximumDelegationRounds,
    maximumRevisionRounds: config.maximumRevisionRounds,
    maximumReviewRounds: config.maximumReviewRounds,
    maximumModelRequests: config.maximumTotalModelRequests,
    maximumToolCalls: config.maximumTotalToolCalls,
    maximumTeamDurationMs: config.maximumTeamDurationMs,
    maximumAssignmentDurationMs: config.maximumAssignmentDurationMs,
  };
}

function validateConfiguration(config, bounds) {
  if (config.schemaVersion !== MULTI_AGENT_COORDINATION_SCHEMA_VERSION) throw new Error("Unsupported multi-agent schema version.");
  if (config.maximumAgentsPerTeam > bounds.maximumAgentsPerTeam) throw new Error("Unbounded team configuration.");
  if (config.maximumConcurrentAssignments > bounds.maximumActiveAssignments) throw new Error("Unbounded concurrency configuration.");
  return true;
}

function normalizeRoleDefinition(input = {}, engine) {
  const role = normalizeEnum(input.role || input.id || AgentRoles.CUSTOM, AgentRoles);
  const id = input.id || role;
  return {
    id,
    role,
    name: input.name || titleCase(role),
    description: input.description || "",
    responsibilities: safeArray(input.responsibilities),
    prohibitedResponsibilities: safeArray(input.prohibitedResponsibilities),
    requiredCapabilities: safeArray(input.requiredCapabilities),
    optionalCapabilities: safeArray(input.optionalCapabilities),
    allowedTools: safeArray(input.allowedTools),
    prohibitedTools: safeArray(input.prohibitedTools),
    defaultPrivacyClassification: input.defaultPrivacyClassification || "USER_CONTENT",
    maximumContextTokens: positive(input.maximumContextTokens, engine.configuration.maximumContextTokensPerAssignment),
    maximumModelRequests: positive(input.maximumModelRequests, engine.configuration.maximumModelRequestsPerAssignment),
    maximumToolCalls: positive(input.maximumToolCalls, engine.configuration.maximumToolCallsPerAssignment),
    outputSchema: clone(input.outputSchema || { type: "AgentResult" }),
    reviewRequirements: safeArray(input.reviewRequirements),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeTeam(input = {}, engine) {
  const now = engine.now();
  return {
    id: input.id || engine.idAdapter.next("agent-team", { objective: input.objective, count: engine.teams.size + 1 }),
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    sessionId: input.sessionId || null,
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    objective: requiredString(input.objective, "Team objective is required."),
    strategy: normalizeEnum(input.strategy || engine.configuration.defaultStrategy, DelegationStrategies),
    state: normalizeEnum(input.state || TeamStates.CREATED, TeamStates),
    coordinatorAssignmentId: input.coordinatorAssignmentId || null,
    assignmentIds: safeArray(input.assignmentIds),
    dependencyGraph: clone(input.dependencyGraph || { assignments: {}, edges: [] }),
    activeAssignmentIds: safeArray(input.activeAssignmentIds),
    completedAssignmentIds: safeArray(input.completedAssignmentIds),
    failedAssignmentIds: safeArray(input.failedAssignmentIds),
    conflictIds: safeArray(input.conflictIds),
    decisionIds: safeArray(input.decisionIds),
    evidence: safeArray(input.evidence),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: confidence(input.confidence, 0.5),
    completeness: confidence(input.completeness, 0.1),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    completedAt: input.completedAt || null,
    expiresAt: input.expiresAt || null,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeAssignment(input = {}, engine) {
  const now = engine.now();
  const role = normalizeEnum(input.role || AgentRoles.CODE_ANALYST, AgentRoles);
  const type = normalizeEnum(input.type || typeForRole(role), AssignmentTypes);
  const scope = normalizeScope(input.scope || {}, engine);
  return {
    id: input.id || engine.idAdapter.next("agent-assignment", { teamId: input.teamId, role, objective: input.objective }),
    teamId: requiredString(input.teamId, "Assignment teamId is required."),
    parentAssignmentId: input.parentAssignmentId || null,
    role,
    type,
    objective: requiredString(input.objective || `${titleCase(role)} assignment`, "Assignment objective is required."),
    scope,
    expectedOutput: input.expectedOutput || "Normalized AgentResult with evidence and limitations.",
    requiredCapabilities: safeArray(input.requiredCapabilities),
    allowedTools: safeArray(input.allowedTools),
    prohibitedTools: safeArray(input.prohibitedTools),
    privacyClassification: input.privacyClassification || "USER_CONTENT",
    contextRequest: clone(input.contextRequest || { maximumTokens: engine.configuration.maximumContextTokensPerAssignment }),
    contextPackageIds: safeArray(input.contextPackageIds),
    dependencyIds: safeArray(input.dependencyIds),
    dependentIds: safeArray(input.dependentIds),
    modelPreference: clone(input.modelPreference || {}),
    state: normalizeEnum(input.state || AssignmentStates.QUEUED, AssignmentStates),
    resultId: input.resultId || null,
    revision: Number(input.revision || 0),
    priority: normalizeEnum(input.priority || AssignmentPriorities.NORMAL, AssignmentPriorities),
    signature: input.signature || null,
    evidence: safeArray(input.evidence),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    error: input.error || null,
    createdAt: input.createdAt || now,
    startedAt: input.startedAt || null,
    updatedAt: input.updatedAt || now,
    completedAt: input.completedAt || null,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeScope(input = {}, engine) {
  const files = safeArray(input.fileUris || input.files).map(String).slice(0, positive(input.maximumFiles, 32));
  return {
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    fileUris: files,
    symbols: safeArray(input.symbols).map(String),
    directories: safeArray(input.directories).map(String),
    planStepIds: safeArray(input.planStepIds),
    proposalIds: safeArray(input.proposalIds || input.proposalId),
    validationIds: safeArray(input.validationIds),
    question: input.question || null,
    exclusions: safeArray(input.exclusions),
    maximumFiles: positive(input.maximumFiles, 32),
    maximumBytes: positive(input.maximumBytes, 262144),
    readOnly: input.readOnly !== false && input.sourceChanging !== true && input.commandExecuting !== true,
    sourceChanging: input.sourceChanging === true,
    commandExecuting: input.commandExecuting === true,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeResult(input = {}, engine) {
  const now = engine.now();
  const assignmentId = requiredString(input.assignmentId, "Result assignmentId is required.");
  const findings = safeArray(input.findings).slice(0, engine.bounds.maximumFindings).map((findingInput) => normalizeFinding({ assignmentId, teamId: input.teamId, ...findingInput }, engine));
  return {
    id: input.id || engine.idAdapter.next("agent-result", { assignmentId, count: engine.results.size + 1 }),
    assignmentId,
    teamId: requiredString(input.teamId, "Result teamId is required."),
    role: normalizeEnum(input.role || AgentRoles.CUSTOM, AgentRoles),
    status: normalizeEnum(input.status || OutputDispositions.ACCEPTED, OutputDispositions),
    summary: input.summary || "",
    findings,
    recommendations: safeArray(input.recommendations),
    proposals: safeArray(input.proposals),
    testCases: safeArray(input.testCases),
    validationInterpretation: clone(input.validationInterpretation || {}),
    risks: safeArray(input.risks),
    assumptions: safeArray(input.assumptions),
    unresolvedQuestions: safeArray(input.unresolvedQuestions),
    evidence: safeArray(input.evidence),
    confidence: confidence(input.confidence, 0.65),
    completeness: confidence(input.completeness, 0.65),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    usage: clone(input.usage || {}),
    modelReferences: safeArray(input.modelReferences),
    createdAt: input.createdAt || now,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeFinding(input = {}, engine) {
  return {
    id: input.id || engine.idAdapter.next("agent-finding", { assignmentId: input.assignmentId, title: input.title || input.description }),
    assignmentId: requiredString(input.assignmentId, "Finding assignmentId is required."),
    teamId: requiredString(input.teamId, "Finding teamId is required."),
    category: input.category || "GENERAL",
    severity: normalizeEnum(input.severity || ConflictSeverities.LOW, ConflictSeverities),
    title: input.title || input.description || "Finding",
    description: input.description || input.title || "",
    location: clone(input.location || null),
    symbols: safeArray(input.symbols),
    proposalId: input.proposalId || null,
    evidence: safeArray(input.evidence),
    confidence: confidence(input.confidence, 0.6),
    status: input.status || (safeArray(input.evidence).length ? "SUPPORTED" : "HYPOTHESIS"),
    recommendation: input.recommendation || null,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeConflict(input = {}, engine) {
  const id = input.id || engine.idAdapter.next("agent-conflict", {
    teamId: input.teamId,
    assignmentIds: safeArray(input.assignmentIds).sort(),
    category: input.category,
    claims: input.conflictingClaims || input.conflictingProposals || input.description,
  });
  return {
    id,
    teamId: requiredString(input.teamId, "Conflict teamId is required."),
    assignmentIds: safeArray(input.assignmentIds),
    category: normalizeEnum(input.category || ConflictCategories.UNKNOWN, ConflictCategories),
    severity: normalizeEnum(input.severity || ConflictSeverities.MEDIUM, ConflictSeverities),
    description: input.description || "",
    conflictingClaims: safeArray(input.conflictingClaims),
    conflictingProposals: safeArray(input.conflictingProposals),
    evidence: safeArray(input.evidence),
    resolutionStatus: input.resolutionStatus || "UNRESOLVED",
    resolution: input.resolution || null,
    resolvedBy: input.resolvedBy || null,
    confidence: confidence(input.confidence, 0.7),
    createdAt: input.createdAt || engine.now(),
    resolvedAt: input.resolvedAt || null,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeDecision(input = {}, engine) {
  return {
    id: input.id || engine.idAdapter.next("coordination-decision", { teamId: input.teamId, type: input.type, count: engine.decisions.size + 1 }),
    teamId: requiredString(input.teamId, "Decision teamId is required."),
    assignmentIds: safeArray(input.assignmentIds),
    type: input.type || "COORDINATION",
    decision: input.decision || "",
    rationale: input.rationale || "",
    acceptedResultIds: safeArray(input.acceptedResultIds),
    rejectedResultIds: safeArray(input.rejectedResultIds),
    evidence: safeArray(input.evidence),
    authority: input.authority || AgentRoles.COORDINATOR,
    confidence: confidence(input.confidence, 0.6),
    createdAt: input.createdAt || engine.now(),
    metadata: clone(input.metadata || {}),
  };
}

function normalizeDelegationPlan(input = {}, engine) {
  const now = engine.now();
  return {
    id: input.id || engine.idAdapter.next("delegation-plan", { objective: input.objective, strategy: input.strategy }),
    objective: requiredString(input.objective, "Delegation plan objective is required."),
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    strategy: normalizeEnum(input.strategy || DelegationStrategies.NONE, DelegationStrategies),
    roles: unique(safeArray(input.roles).map((role) => normalizeEnum(role, AgentRoles))),
    assignments: safeArray(input.assignments).map((assignment) => ({ ...assignment, role: normalizeEnum(assignment.role, AgentRoles), type: normalizeEnum(assignment.type || typeForRole(assignment.role), AssignmentTypes), scope: normalizeScope(assignment.scope || {}, engine) })),
    dependencies: safeArray(input.dependencies),
    parallelGroups: safeArray(input.parallelGroups),
    reviewRequirements: safeArray(input.reviewRequirements),
    reconciliationRules: safeArray(input.reconciliationRules),
    validationRequirements: safeArray(input.validationRequirements),
    approvalRequirements: safeArray(input.approvalRequirements),
    securityRequirements: safeArray(input.securityRequirements),
    privacyRequirements: safeArray(input.privacyRequirements),
    bounds: clone(input.bounds || engine.planBounds()),
    evidence: safeArray(input.evidence),
    confidence: confidence(input.confidence, 0.5),
    completeness: confidence(input.completeness, 0.5),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    createdAt: input.createdAt || now,
    metadata: clone(input.metadata || {}),
  };
}

function normalizeRawAssignmentOutput(assignment, input = {}, engine) {
  return {
    status: input.status || OutputDispositions.ACCEPTED,
    summary: input.summary || `${assignment.role} produced a bounded result.`,
    findings: safeArray(input.findings),
    recommendations: safeArray(input.recommendations),
    proposals: safeArray(input.proposals),
    testCases: safeArray(input.testCases),
    validationInterpretation: clone(input.validationInterpretation || {}),
    risks: safeArray(input.risks),
    assumptions: safeArray(input.assumptions),
    unresolvedQuestions: safeArray(input.unresolvedQuestions),
    evidence: safeArray(input.evidence),
    confidence: confidence(input.confidence, 0.65),
    completeness: confidence(input.completeness, 0.65),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    usage: clone(input.usage || {}),
    modelReferences: safeArray(input.modelReferences),
    metadata: clone(input.metadata || {}),
  };
}

function deterministicRoleOutput(assignment, evidence) {
  const finding = {
    category: assignment.type,
    severity: ConflictSeverities.LOW,
    title: `${titleCase(assignment.role)} bounded observation`,
    description: `${assignment.role} reviewed scoped objective without direct mutation or direct command execution.`,
    evidence,
    status: "SUPPORTED",
    recommendation: assignment.scope.sourceChanging ? "Create or review a ControlledWorkspaceToolEngine proposal through runtime commands." : "Proceed through coordinator reconciliation.",
  };
  return {
    status: OutputDispositions.ACCEPTED,
    summary: `${assignment.role} completed bounded ${assignment.type.toLowerCase()} assignment.`,
    findings: [finding],
    recommendations: [finding.recommendation],
    evidence,
    confidence: 0.66,
    completeness: 0.62,
    limitations: ["No model diversity is claimed unless model references prove it."],
  };
}

function assignmentForRole(role, input, engine, index) {
  const sourceChanging = input.sourceChanging === true || /\b(implement|edit|change|modify|patch|refactor|fix|create|delete|rename)\b/i.test(input.objective || input.message || "");
  const commandExecuting = /\b(test|validate|lint|typecheck|build)\b/i.test(input.objective || input.message || "");
  const scope = normalizeScope({
    workspaceId: input.workspaceId || input.scope && input.scope.workspaceId || null,
    projectId: input.projectId || input.scope && input.scope.projectId || null,
    fileUris: input.fileUris || input.files || input.scope && input.scope.fileUris,
    directories: input.directories || input.scope && input.scope.directories,
    readOnly: role !== AgentRoles.IMPLEMENTER && role !== AgentRoles.REPAIR_SPECIALIST,
    sourceChanging: (role === AgentRoles.IMPLEMENTER || role === AgentRoles.REPAIR_SPECIALIST) && sourceChanging,
    commandExecuting: role === AgentRoles.TESTER && commandExecuting,
  }, engine);
  return {
    role,
    type: typeForRole(role, input),
    objective: objectiveForRole(role, input.objective || input.message || "Coordinate objective"),
    scope,
    expectedOutput: expectedForRole(role),
    requiredCapabilities: [],
    allowedTools: defaultToolsForRole(role),
    prohibitedTools: ["change.applyApproved", "command.runValidation"],
    privacyClassification: input.privacyClassification || "USER_CONTENT",
    dependencyIds: [],
    priority: role === AgentRoles.SECURITY_REVIEWER ? AssignmentPriorities.HIGH : AssignmentPriorities.NORMAL,
    metadata: { planIndex: index },
  };
}

function typeForRole(role, input = {}) {
  const normalized = String(role || "").toUpperCase();
  if (normalized === AgentRoles.PLANNER) return AssignmentTypes.PLANNING;
  if (normalized === AgentRoles.ARCHITECT) return AssignmentTypes.ARCHITECTURE_REVIEW;
  if (normalized === AgentRoles.CODE_ANALYST) return AssignmentTypes.CODE_UNDERSTANDING;
  if (normalized === AgentRoles.IMPLEMENTER) return AssignmentTypes.CHANGE_PROPOSAL;
  if (normalized === AgentRoles.REVIEWER) return AssignmentTypes.CHANGE_REVIEW;
  if (normalized === AgentRoles.TESTER) return AssignmentTypes.VALIDATION_REVIEW;
  if (normalized === AgentRoles.SECURITY_REVIEWER) return AssignmentTypes.SECURITY_REVIEW;
  if (normalized === AgentRoles.PERFORMANCE_REVIEWER) return AssignmentTypes.PERFORMANCE_REVIEW;
  if (normalized === AgentRoles.DOCUMENTATION_REVIEWER) return AssignmentTypes.DOCUMENTATION_REVIEW;
  if (normalized === AgentRoles.RELEASE_REVIEWER) return AssignmentTypes.RELEASE_REVIEW;
  if (normalized === AgentRoles.REPAIR_SPECIALIST) return AssignmentTypes.REPAIR_PROPOSAL;
  if (normalized === AgentRoles.COORDINATOR) return AssignmentTypes.SYNTHESIS;
  return AssignmentTypes.ANALYSIS;
}

function objectiveForRole(role, objective) {
  const prefix = {
    [AgentRoles.PLANNER]: "Plan bounded work for",
    [AgentRoles.ARCHITECT]: "Review architecture impact of",
    [AgentRoles.CODE_ANALYST]: "Analyze relevant code for",
    [AgentRoles.IMPLEMENTER]: "Prepare a workspace-tool proposal for",
    [AgentRoles.REVIEWER]: "Independently review proposal and evidence for",
    [AgentRoles.TESTER]: "Design and interpret validation for",
    [AgentRoles.SECURITY_REVIEWER]: "Review security implications of",
    [AgentRoles.RELEASE_REVIEWER]: "Assess release readiness for",
    [AgentRoles.REPAIR_SPECIALIST]: "Prepare bounded repair proposal for",
  }[role] || "Evaluate";
  return `${prefix}: ${objective}`;
}

function expectedForRole(role) {
  if (role === AgentRoles.IMPLEMENTER || role === AgentRoles.REPAIR_SPECIALIST) return "Proposal references only; no direct mutation.";
  if (role === AgentRoles.REVIEWER || role === AgentRoles.SECURITY_REVIEWER) return "Review findings with evidence, limitations, and no approval grant.";
  if (role === AgentRoles.TESTER) return "Validation interpretation with evidence; no claim of pass without runtime validation.";
  return "Bounded findings and recommendations with evidence.";
}

function selectRoles(signals, engine) {
  if (signals.simpleQuestion) return [AgentRoles.COORDINATOR];
  const roles = [AgentRoles.COORDINATOR];
  if (signals.release) roles.push(AgentRoles.RELEASE_REVIEWER, AgentRoles.SECURITY_REVIEWER, AgentRoles.TESTER);
  else if (signals.architecture && !signals.sourceChanging) roles.push(AgentRoles.ARCHITECT, AgentRoles.REVIEWER);
  else if (signals.validation && !signals.sourceChanging) roles.push(AgentRoles.TESTER, AgentRoles.REPAIR_SPECIALIST, AgentRoles.REVIEWER);
  else if (signals.security && signals.sourceChanging) roles.push(AgentRoles.PLANNER, AgentRoles.IMPLEMENTER, AgentRoles.SECURITY_REVIEWER, AgentRoles.TESTER);
  else if (signals.sourceChanging) roles.push(AgentRoles.PLANNER, AgentRoles.IMPLEMENTER, AgentRoles.REVIEWER);
  else roles.push(signals.fileCount > 1 ? AgentRoles.CODE_ANALYST : AgentRoles.REVIEWER);
  return unique(roles).filter((role) => engine.roles.has(role)).slice(0, engine.configuration.maximumAgentsPerTeam);
}

function selectStrategy(signals, config) {
  if (!config.enableParallelism) return DelegationStrategies.SEQUENTIAL;
  if (signals.security && signals.sourceChanging) return DelegationStrategies.PIPELINE;
  if (signals.release) return DelegationStrategies.REVIEW_BOARD;
  if (signals.architecture && !signals.sourceChanging) return DelegationStrategies.PARALLEL_REVIEW;
  if (signals.fileCount > 2 || signals.subsystems > 1) return DelegationStrategies.PARALLEL_INDEPENDENT;
  if (signals.sourceChanging) return DelegationStrategies.PIPELINE;
  return DelegationStrategies.ADAPTIVE_BOUNDED;
}

function dependenciesFor(assignments) {
  const deps = [];
  const implementer = assignments.find((assignment) => assignment.role === AgentRoles.IMPLEMENTER || assignment.role === AgentRoles.REPAIR_SPECIALIST);
  for (const assignment of assignments) {
    if (implementer && assignment !== implementer && [AgentRoles.REVIEWER, AgentRoles.SECURITY_REVIEWER, AgentRoles.TESTER].includes(assignment.role)) {
      assignment.dependencyIds = [implementer.id || stableHash(implementer.objective).slice(0, 8)];
      deps.push({ from: implementer.id || implementer.objective, to: assignment.id || assignment.objective });
    }
  }
  return deps;
}

function parallelGroupsFor(assignments, strategy) {
  if (![DelegationStrategies.PARALLEL_INDEPENDENT, DelegationStrategies.PARALLEL_REVIEW, DelegationStrategies.REVIEW_BOARD].includes(strategy)) return [];
  return [assignments.filter((assignment) => !assignment.dependencyIds || !assignment.dependencyIds.length).map((assignment) => assignment.id || assignment.objective)];
}

function reviewRequirementsFor(input, roles, config) {
  const requirements = [];
  if (config.requireIndependentReviewForSourceChanges && roles.includes(AgentRoles.IMPLEMENTER)) requirements.push("Implementer cannot be sole reviewer.");
  if (config.requireIndependentReviewForSecurityChanges && looksSecuritySensitive(input.objective || input.message || "")) requirements.push("Security reviewer required when available.");
  return requirements;
}

function validationRequirementsFor(input) {
  return /\b(test|validate|lint|typecheck|build)\b/i.test(input.objective || input.message || "") ? ["Runtime validation evidence required before claiming validation passed."] : [];
}

function securityRequirementsFor(input, roles) {
  return looksSecuritySensitive(input.objective || input.message || "") || roles.includes(AgentRoles.SECURITY_REVIEWER) ? ["Security findings require evidence and unresolved critical conflicts block completion."] : [];
}

function assignmentPrompt(assignment, context) {
  return [
    `Role: ${assignment.role}`,
    `Objective: ${assignment.objective}`,
    `Scope: ${JSON.stringify(assignment.scope)}`,
    `Expected output: ${assignment.expectedOutput}`,
    `Allowed tools: ${assignment.allowedTools.join(", ")}`,
    `Prohibited tools: ${assignment.prohibitedTools.join(", ")}`,
    `Context references: ${safeArray(context.contextPackageIds).join(", ")}`,
    "Return normalized findings, proposals, risks, assumptions, evidence, warnings, and limitations. Do not approve protected actions.",
  ].join("\n");
}

function assignmentSignature(assignment) {
  return stableHash({
    type: assignment.type,
    scope: assignment.scope,
    objective: normalizeToken(assignment.objective),
    expectedOutput: assignment.expectedOutput,
    dependencies: assignment.dependencyIds,
  });
}

function hasCycle(assignments, dependencies) {
  const graph = new Map();
  for (const assignment of assignments) graph.set(assignment.id || assignment.objective, []);
  for (const dep of dependencies) {
    const from = dep.from || dep.source || dep.dependencyId;
    const to = dep.to || dep.target || dep.assignmentId;
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) || []) if (visit(next)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return Array.from(graph.keys()).some(visit);
}

function validationStateFor(results) {
  const validations = results.map((result) => result.validationInterpretation).filter((entry) => entry && Object.keys(entry).length);
  if (!validations.length) return "NOT_RUN";
  if (validations.some((entry) => /fail/i.test(entry.status || entry.outcome || ""))) return "FAILED";
  return "EVIDENCE_PRESENT";
}

function securityReviewStateFor(results, team) {
  const security = results.filter((result) => result.role === AgentRoles.SECURITY_REVIEWER);
  if (!security.length && looksSecuritySensitive(team.objective)) return "UNAVAILABLE";
  if (security.some((result) => result.findings.some((finding) => finding.severity === ConflictSeverities.CRITICAL))) return "CRITICAL_FINDINGS";
  return security.length ? "REVIEWED" : "NOT_REQUIRED";
}

function testStateFor(results) {
  const tester = results.find((result) => result.role === AgentRoles.TESTER);
  if (!tester) return "NOT_RUN";
  if (tester.validationInterpretation && /pass/i.test(tester.validationInterpretation.status || "")) return "PASSED_WITH_EVIDENCE";
  return "DESIGNED_OR_INTERPRETED";
}

function recommendedNextAction(disposition) {
  return {
    [TeamDispositions.PROPOSAL_READY]: "Review proposed changes, then use normal runtime approval/apply flow.",
    [TeamDispositions.APPROVAL_REQUIRED]: "Respond to runtime approval request.",
    [TeamDispositions.CONFLICTED]: "Resolve high-severity conflicts before applying proposals.",
    [TeamDispositions.BLOCKED]: "Escalate or reject unresolved critical conflicts.",
    [TeamDispositions.VALIDATION_FAILED]: "Create bounded repair assignment with validation evidence.",
    [TeamDispositions.CAPABILITY_UNAVAILABLE]: "Use single-agent fallback or configure missing capabilities.",
  }[disposition] || "Proceed with coordinator result.";
}

function sameModelLimitation(result, options) {
  const refs = safeArray(result.modelReferences);
  if (!refs.length || options.comparisonModelReferences === undefined) return null;
  const other = safeArray(options.comparisonModelReferences);
  const same = refs.some((ref) => other.some((entry) => entry.providerId === ref.providerId && entry.modelId === ref.modelId));
  return same ? "Review used the same provider/model; do not treat model agreement as independent validation." : null;
}

function summarizeTeam(team) {
  const copy = clone(team);
  copy.evidence = safeArray(copy.evidence).slice(0, 24);
  return copy;
}

function summarizeAssignment(assignment) {
  const copy = clone(assignment);
  copy.contextRequest = { maximumTokens: copy.contextRequest && copy.contextRequest.maximumTokens || null };
  return copy;
}

function summarizeResult(result) {
  const copy = clone(result);
  copy.evidence = safeArray(copy.evidence).slice(0, 24);
  copy.proposals = safeArray(copy.proposals).map((proposal) => ({ id: proposal.id || proposal.proposalId || null, proposalHash: proposal.proposalHash || null, fileCount: safeArray(proposal.fileChanges || proposal.files).length }));
  return copy;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") throw new Error("Multi-agent snapshot must be an object.");
  if (Number(snapshot.schemaVersion) !== MULTI_AGENT_COORDINATION_SCHEMA_VERSION) throw new Error("Unsupported multi-agent snapshot schema version.");
  return {
    configuration: snapshot.configuration || {},
    roles: safeArray(snapshot.roles),
    teams: safeArray(snapshot.teams),
    assignments: safeArray(snapshot.assignments),
    results: safeArray(snapshot.results),
    conflicts: safeArray(snapshot.conflicts),
    decisions: safeArray(snapshot.decisions),
    stats: snapshot.stats || {},
  };
}

function issue(code, message) {
  return { code, message, severity: "ERROR" };
}

function score(blockerCount, warningCount) {
  return boundedScore(100 - blockerCount * 40 - warningCount * 5);
}

function boundedScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function emptyStats() {
  return {
    teamsCreated: 0,
    teamsCompleted: 0,
    teamsPartiallyCompleted: 0,
    teamsCancelled: 0,
    teamsFailed: 0,
    assignmentsCreated: 0,
    assignmentsCompleted: 0,
    assignmentsFailed: 0,
    assignmentsCancelled: 0,
    assignmentsTimedOut: 0,
    assignmentsRevised: 0,
    delegationEvaluations: 0,
    delegationAccepted: 0,
    delegationRejected: 0,
    rolesSelected: 0,
    parallelAssignments: 0,
    sequentialAssignments: 0,
    resultsAccepted: 0,
    resultsRejected: 0,
    duplicateAssignmentsPrevented: 0,
    duplicateFindingsPrevented: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    conflictsEscalated: 0,
    criticalConflicts: 0,
    reviewsRequested: 0,
    reviewsAccepted: 0,
    reviewsRejected: 0,
    validationRequests: 0,
    repairAssignments: 0,
    providerFailures: 0,
    privacyBlocks: 0,
    securityBlocks: 0,
    approvalWaits: 0,
    averageAgentsPerTeam: 0,
    averageAssignmentsPerTeam: 0,
    averageTeamDuration: 0,
    averageAssignmentDuration: 0,
    averageConfidence: 0,
    averageCompleteness: 0,
    lastTeam: null,
    lastAssignment: null,
    lastConflict: null,
    lastFailure: null,
    lastPersistence: null,
  };
}

function normalizeClock(input) {
  if (input && typeof input.now === "function") return input;
  return { now: () => new Date().toISOString() };
}

function normalizeIdAdapter(input) {
  if (input && typeof input.next === "function") return input;
  return { next: (prefix, seed = {}) => stableId(prefix, { ...seed, nonce: crypto.randomBytes(8).toString("hex") }) };
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

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clone(value) {
  if (value === undefined || value === null) return value === undefined ? undefined : null;
  return JSON.parse(JSON.stringify(value));
}

function requiredString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value.trim();
}

function normalizeEnum(value, choices) {
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(choices).includes(normalized)) throw new Error(`Invalid enum value: ${value}.`);
  return normalized;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function confidence(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeError(error) {
  return { message: error && error.message || String(error), name: error && error.name || "Error", recoverable: true };
}

function matches(value, filter = {}) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    if (expected === undefined || expected === null || key === "active") return true;
    return value[key] === expected;
  });
}

function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function scheduleOrder(left, right) {
  const priority = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  return (priority[left.priority] || 2) - (priority[right.priority] || 2) || String(left.createdAt).localeCompare(String(right.createdAt)) || String(left.id).localeCompare(String(right.id));
}

function eventMatches(event, filter = {}) {
  if (filter.types && !safeArray(filter.types).includes(event.type)) return false;
  if (filter.teamId && event.payload && event.payload.teamId !== filter.teamId) return false;
  return true;
}

function deepMerge(base, patch) {
  const output = clone(base || {});
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && output[key] && typeof output[key] === "object" && !Array.isArray(output[key])) output[key] = deepMerge(output[key], value);
    else output[key] = clone(value);
  }
  return output;
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

function groupBy(values, keyFn) {
  const result = {};
  for (const value of values || []) {
    const key = keyFn(value) || "unknown";
    if (!result[key]) result[key] = [];
    result[key].push(value);
  }
  return result;
}

function average(values, fallback) {
  const numbers = safeArray(values).map(Number).filter(Number.isFinite);
  if (!numbers.length) return fallback;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function runningAverage(current, count, value) {
  if (!count) return value;
  return ((current || 0) * Math.max(0, count - 1) + value) / count;
}

function titleCase(value) {
  return String(value || "").toLowerCase().replace(/(^|_)([a-z])/g, (_, space, char) => `${space ? " " : ""}${char.toUpperCase()}`);
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function looksSecuritySensitive(value) {
  return /\b(security|auth|token|secret|credential|permission|sandbox|approval|privacy|encrypt|decrypt|csrf|xss|injection)\b/i.test(String(value || ""));
}

module.exports = {
  AgentRoles,
  AssignmentPriorities,
  AssignmentStates,
  AssignmentTypes,
  ConflictCategories,
  ConflictResolutionMethods,
  ConflictSeverities,
  CoordinationStates,
  DEFAULT_BOUNDS,
  DEFAULT_CONFIGURATION,
  DelegationStrategies,
  MemoryMultiAgentPersistenceAdapter,
  MultiAgentCoordinationEngine,
  MultiAgentEventTypes,
  MULTI_AGENT_COORDINATION_SCHEMA_VERSION,
  OutputDispositions,
  TeamDispositions,
  TeamStates,
  normalizeConfiguration,
  stableHash,
};
