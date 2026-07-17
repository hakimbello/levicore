const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const PLANNING_SCHEMA_VERSION = 1;

const PLAN_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  READY: "READY",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  REPLANNING: "REPLANNING",
  COMPLETED: "COMPLETED",
  BLOCKED: "BLOCKED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
});

const TASK_STATUSES = Object.freeze({
  PENDING: "PENDING",
  READY: "READY",
  RUNNING: "RUNNING",
  WAITING: "WAITING",
  BLOCKED: "BLOCKED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
  CANCELLED: "CANCELLED",
});

const PLANNING_FINDING_CODES = Object.freeze({
  CIRCULAR_DEPENDENCY: "circular_dependency",
  MISSING_DEPENDENCY: "missing_dependency",
  DECISION_CONFLICT: "decision_conflict",
  UNSUPPORTED_OBJECTIVE: "unsupported_objective",
  EXCESSIVE_SCOPE: "excessive_scope",
  INSUFFICIENT_ACCEPTANCE_CRITERIA: "insufficient_acceptance_criteria",
  UNRESOLVED_ASSUMPTION: "unresolved_assumption",
  SECURITY_SENSITIVE_WORK: "security_sensitive_work",
  NO_EXECUTABLE_PATH: "no_executable_path",
  REPLAN_LIMIT_REACHED: "replan_limit_reached",
});

const PLANNING_FINDING_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const REPLAN_TRIGGERS = Object.freeze({
  TASK_FAILED: "task_failed",
  TASK_BLOCKED: "task_blocked",
  VALIDATION_FAILED: "validation_failed",
  SECURITY_BLOCKED: "security_blocked",
  APPROVAL_REJECTED: "approval_rejected",
  REPAIR_FAILED: "repair_failed",
  REPOSITORY_CHANGED: "repository_changed",
  ASSUMPTION_INVALIDATED: "assumption_invalidated",
  ACCEPTANCE_CRITERIA_CHANGED: "acceptance_criteria_changed",
  NEW_DEPENDENCY_DISCOVERED: "new_dependency_discovered",
  USER_CORRECTION: "user_correction",
});

const PLANNING_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const PLANNING_EVENT_TYPES = Object.freeze({
  PLANNING_STARTED: "planning_started",
  PLANNING_COMPLETED: "planning_completed",
  PLAN_CREATED: "plan_created",
  PLAN_VALIDATED: "plan_validated",
  PLAN_ACTIVATED: "plan_activated",
  PLAN_PAUSED: "plan_paused",
  PLAN_RESUMED: "plan_resumed",
  TASK_ADDED: "task_added",
  TASK_UPDATED: "task_updated",
  TASK_READY: "task_ready",
  TASK_STARTED: "task_started",
  TASK_COMPLETED: "task_completed",
  TASK_FAILED: "task_failed",
  TASK_BLOCKED: "task_blocked",
  REPLANNING_STARTED: "replanning_started",
  REPLANNING_COMPLETED: "replanning_completed",
  PLAN_BLOCKED: "plan_blocked",
  PLAN_COMPLETED: "plan_completed",
  PERSISTED: "planning_persisted",
  RESTORED: "planning_restored",
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumTasks: 50,
  maximumDependencyDepth: 12,
  maximumReplans: 3,
  maximumExecutionWaves: 20,
  maximumTaskComplexity: 10,
});

const TERMINAL_TASK_STATUSES = new Set([
  TASK_STATUSES.COMPLETED,
  TASK_STATUSES.FAILED,
  TASK_STATUSES.SKIPPED,
  TASK_STATUSES.CANCELLED,
]);

class PlanningIntelligenceEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.plans = new Map();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.decompositionAdapters = normalizeAdapters(options.decompositionAdapters || []);
    this.repositoryGraph = options.repositoryGraph || null;
    this.learningEngine = options.learningEngine || null;
    this.offlineIndex = options.offlineIndex || null;
    this.decisionRecords = Array.isArray(options.decisionRecords) ? options.decisionRecords.slice() : [];
    this.bounds = normalizeBounds(options.bounds || {});
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
  }

  createPlan(objective, context = {}, options = {}) {
    const normalizedObjective = requiredString(objective, "Planning objective is required.");
    const projectId = options.projectId || context.projectId || this.projectId || "default";
    this.emitLifecycle(PLANNING_EVENT_TYPES.PLANNING_STARTED, { objective: normalizedObjective, projectId });

    const decomposed = this.decompose(normalizedObjective, context, options);
    const timestamp = normalizeTimestamp(options.timestamp);
    const plan = normalizePlan({
      id: options.planId || `plan:${stableHash({ projectId, objective: normalizedObjective, timestamp })}`,
      projectId,
      objective: normalizedObjective,
      summary: decomposed.summary || `Plan for ${normalizedObjective}`,
      status: PLAN_STATUSES.DRAFT,
      tasks: decomposed.tasks,
      assumptions: decomposed.assumptions || context.assumptions || [],
      constraints: uniqueSorted([
        ...asArray(context.constraints),
        ...decisionConstraintText(options.decisionRecords || context.decisionRecords || this.decisionRecords),
      ]),
      acceptanceCriteria: asArray(context.acceptanceCriteria || decomposed.acceptanceCriteria),
      risks: decomposed.risks || [],
      metadata: {
        ...clonePlainObject(decomposed.metadata || {}),
        planningEvidence: this.planningEvidence(normalizedObjective, context, options),
        replans: [],
      },
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    this.recalculateDependents(plan);
    this.enrichPlan(plan, context, options);
    this.refreshReadiness(plan);
    const validation = this.validatePlanObject(plan, context, options);
    plan.metadata.validation = validation;
    plan.status = validation.blocked ? PLAN_STATUSES.BLOCKED : PLAN_STATUSES.READY;
    this.plans.set(plan.id, plan);

    this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_CREATED, { plan: clonePlainObject(plan) });
    this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_VALIDATED, { planId: plan.id, validation });
    if (plan.status === PLAN_STATUSES.BLOCKED) {
      this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_BLOCKED, { planId: plan.id, findings: validation.findings });
    }
    this.emitLifecycle(PLANNING_EVENT_TYPES.PLANNING_COMPLETED, { planId: plan.id, status: plan.status });
    return clonePlainObject(plan);
  }

  decompose(objective, context = {}, options = {}) {
    for (const adapter of [...asArray(options.decompositionAdapters), ...this.decompositionAdapters]) {
      const result = adapter.decompose({ objective, context: clonePlainObject(context), options: clonePlainObject(options) });
      if (result && Array.isArray(result.tasks)) {
        return normalizeDecompositionOutput(result);
      }
    }
    return defaultDecomposition(objective, context);
  }

  addTask(planId, task) {
    const plan = this.requirePlan(planId);
    const normalized = normalizeTask({ ...task, planId: plan.id }, plan);
    const duplicate = plan.tasks.find((candidate) => taskIdentity(candidate) === taskIdentity(normalized));
    if (duplicate) {
      return clonePlainObject(duplicate);
    }
    plan.tasks.push(normalized);
    this.recalculateDependents(plan);
    this.refreshReadiness(plan);
    touchPlan(plan);
    this.emitLifecycle(PLANNING_EVENT_TYPES.TASK_ADDED, { planId: plan.id, task: clonePlainObject(normalized) });
    return clonePlainObject(normalized);
  }

  updateTask(planId, taskId, changes) {
    const plan = this.requirePlan(planId);
    const index = taskIndex(plan, taskId);
    const current = plan.tasks[index];
    if (current.status === TASK_STATUSES.COMPLETED && changes.status && changes.status !== TASK_STATUSES.COMPLETED) {
      throw new Error("Completed tasks cannot be reopened without an explicit replan.");
    }
    const updated = normalizeTask({
      ...current,
      ...clonePlainObject(changes),
      id: current.id,
      planId: plan.id,
      updatedAt: normalizeTimestamp(changes.updatedAt),
    }, plan);
    plan.tasks[index] = updated;
    this.recalculateDependents(plan);
    this.refreshReadiness(plan);
    touchPlan(plan);
    this.emitLifecycle(eventForTaskUpdate(updated), { planId: plan.id, task: clonePlainObject(updated) });
    if (updated.status === TASK_STATUSES.READY) {
      this.emitLifecycle(PLANNING_EVENT_TYPES.TASK_READY, { planId: plan.id, task: clonePlainObject(updated) });
    }
    return clonePlainObject(updated);
  }

  removeTask(planId, taskId) {
    const plan = this.requirePlan(planId);
    const before = plan.tasks.length;
    plan.tasks = plan.tasks.filter((task) => task.id !== taskId);
    for (const task of plan.tasks) {
      task.dependencies = task.dependencies.filter((dependency) => dependency !== taskId);
    }
    this.recalculateDependents(plan);
    this.refreshReadiness(plan);
    touchPlan(plan);
    return before !== plan.tasks.length;
  }

  getPlan(planId) {
    const plan = this.plans.get(planId);
    return plan ? clonePlainObject(plan) : null;
  }

  listPlans(filter = {}) {
    const filters = normalizePlanFilter(filter);
    return Array.from(this.plans.values())
      .filter((plan) => matchesPlanFilter(plan, filters))
      .sort(comparePlans)
      .map(clonePlainObject);
  }

  getTask(planId, taskId) {
    const plan = this.requirePlan(planId);
    const task = plan.tasks.find((candidate) => candidate.id === taskId);
    return task ? clonePlainObject(task) : null;
  }

  getReadyTasks(planId, context = {}) {
    const plan = this.requirePlan(planId);
    this.refreshReadiness(plan, context);
    return plan.tasks.filter((task) => task.status === TASK_STATUSES.READY).sort(compareTasks).map(clonePlainObject);
  }

  getBlockedTasks(planId) {
    const plan = this.requirePlan(planId);
    return plan.tasks.filter((task) => task.status === TASK_STATUSES.BLOCKED).sort(compareTasks).map(clonePlainObject);
  }

  getCriticalPath(planId) {
    const plan = this.requirePlan(planId);
    return criticalPath(plan).map(clonePlainObject);
  }

  getExecutionWaves(planId) {
    const plan = this.requirePlan(planId);
    return executionWaves(plan).map((wave) => wave.map(clonePlainObject));
  }

  prioritize(planId, context = {}) {
    const plan = this.requirePlan(planId);
    const criticalIds = new Set(this.getCriticalPath(planId).map((task) => task.id));
    const successLessons = learningRecords(context.learningEngine || this.learningEngine, context)
      .filter((record) => record.type === "successful_strategy");
    const failedLessons = learningRecords(context.learningEngine || this.learningEngine, context)
      .filter((record) => record.type === "failed_strategy");
    return plan.tasks
      .filter((task) => !TERMINAL_TASK_STATUSES.has(task.status))
      .map((task) => ({
        ...clonePlainObject(task),
        priorityScore: priorityScore(task, {
          objective: plan.objective,
          criticalIds,
          successLessons,
          failedLessons,
        }),
      }))
      .sort((left, right) => right.priorityScore - left.priorityScore || compareTasks(left, right));
  }

  validatePlan(planId, context = {}) {
    const plan = this.requirePlan(planId);
    const validation = this.validatePlanObject(plan, context, {});
    plan.metadata.validation = validation;
    this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_VALIDATED, { planId: plan.id, validation });
    return clonePlainObject(validation);
  }

  activate(planId) {
    return this.transitionPlan(planId, PLAN_STATUSES.ACTIVE, PLANNING_EVENT_TYPES.PLAN_ACTIVATED);
  }

  pause(planId) {
    return this.transitionPlan(planId, PLAN_STATUSES.PAUSED, PLANNING_EVENT_TYPES.PLAN_PAUSED);
  }

  resume(planId) {
    return this.transitionPlan(planId, PLAN_STATUSES.ACTIVE, PLANNING_EVENT_TYPES.PLAN_RESUMED);
  }

  replan(planId, trigger, context = {}) {
    const plan = this.requirePlan(planId);
    const normalizedTrigger = normalizeReplanTrigger(trigger);
    const replans = Array.isArray(plan.metadata.replans) ? plan.metadata.replans : [];
    this.emitLifecycle(PLANNING_EVENT_TYPES.REPLANNING_STARTED, { planId: plan.id, trigger: normalizedTrigger });
    if (replans.length >= this.bounds.maximumReplans) {
      const finding = planningFinding({
        code: PLANNING_FINDING_CODES.REPLAN_LIMIT_REACHED,
        severity: PLANNING_FINDING_SEVERITIES.HIGH,
        title: "Replan limit reached",
        description: "The plan reached the configured maximum number of replans.",
        taskIds: [],
        evidence: [{ source: plan.id, signal: normalizedTrigger }],
      });
      plan.status = PLAN_STATUSES.BLOCKED;
      plan.metadata.validation = { status: "BLOCKED", blocked: true, findings: [finding] };
      this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_BLOCKED, { planId: plan.id, findings: [finding] });
      return clonePlainObject(plan);
    }

    plan.status = PLAN_STATUSES.REPLANNING;
    const timestamp = new Date().toISOString();
    const replacementTasks = replacementTasksFor(plan, normalizedTrigger, context, timestamp)
      .filter((task) => !plan.tasks.some((candidate) => taskIdentity(candidate) === taskIdentity(task)));
    for (const task of replacementTasks) {
      plan.tasks.push(normalizeTask(task, plan));
    }
    plan.version += 1;
    plan.metadata.replans = [
      ...replans,
      {
        trigger: normalizedTrigger,
        rationale: context.rationale || rationaleForTrigger(normalizedTrigger),
        createdAt: timestamp,
      },
    ];
    this.recalculateDependents(plan);
    this.refreshReadiness(plan);
    const validation = this.validatePlanObject(plan, context, {});
    plan.metadata.validation = validation;
    plan.status = validation.blocked ? PLAN_STATUSES.BLOCKED : PLAN_STATUSES.READY;
    touchPlan(plan);
    this.emitLifecycle(PLANNING_EVENT_TYPES.REPLANNING_COMPLETED, { planId: plan.id, trigger: normalizedTrigger, version: plan.version });
    return clonePlainObject(plan);
  }

  completeTask(planId, taskId, result = {}) {
    const task = this.updateTask(planId, taskId, {
      status: TASK_STATUSES.COMPLETED,
      outputs: result.outputs || [],
      metadata: {
        result: clonePlainObject(result),
      },
    });
    const plan = this.requirePlan(planId);
    if (plan.tasks.every((candidate) => [TASK_STATUSES.COMPLETED, TASK_STATUSES.SKIPPED].includes(candidate.status))) {
      plan.status = PLAN_STATUSES.COMPLETED;
      plan.metadata.completionEvidence = completionEvidenceFor(plan);
      this.emitLifecycle(PLANNING_EVENT_TYPES.PLAN_COMPLETED, { planId: plan.id, completionEvidence: plan.metadata.completionEvidence });
    }
    return task;
  }

  failTask(planId, taskId, failure = {}) {
    return this.updateTask(planId, taskId, {
      status: TASK_STATUSES.FAILED,
      metadata: {
        failure: clonePlainObject(failure),
      },
    });
  }

  blockTask(planId, taskId, blocker = {}) {
    return this.updateTask(planId, taskId, {
      status: TASK_STATUSES.BLOCKED,
      metadata: {
        blocker: clonePlainObject(blocker),
      },
    });
  }

  snapshot() {
    return {
      schemaVersion: PLANNING_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      bounds: clonePlainObject(this.bounds),
      plans: Array.from(this.plans.values()).sort(comparePlans).map(clonePlainObject),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.plans.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    this.bounds = normalizeBounds(migrated.bounds || this.bounds);
    for (const plan of migrated.plans) {
      const normalized = normalizePlan(plan);
      this.recalculateDependents(normalized);
      this.plans.set(normalized.id, normalized);
    }
    this.emitLifecycle(PLANNING_EVENT_TYPES.RESTORED, { planCount: this.plans.size });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.persistencePath = targetPath;
    this.emitLifecycle(PLANNING_EVENT_TYPES.PERSISTED, { path: targetPath });
    return { status: "PERSISTED", path: targetPath, schemaVersion: PLANNING_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      this.restore(JSON.parse(fs.readFileSync(targetPath, "utf8")));
      this.persistencePath = targetPath;
      return { status: "LOADED", path: targetPath, schemaVersion: PLANNING_SCHEMA_VERSION };
    } catch (error) {
      if (options.emptyOnCorruption === true) {
        this.plans.clear();
        this.emitLifecycle(PLANNING_EVENT_TYPES.RESTORED, { planCount: 0, reason: error.message });
        return { status: "EMPTY", path: targetPath, error: error.message };
      }
      return { status: "CORRUPT", path: targetPath, error: error.message };
    }
  }

  transitionPlan(planId, status, eventType) {
    const plan = this.requirePlan(planId);
    plan.status = status;
    touchPlan(plan);
    this.emitLifecycle(eventType, { planId: plan.id, status });
    return clonePlainObject(plan);
  }

  validatePlanObject(plan, context = {}, options = {}) {
    const findings = [];
    if (!plan.objective) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.UNSUPPORTED_OBJECTIVE, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Objective missing", description: "A plan requires an objective." }));
    }
    const ids = new Set();
    for (const task of plan.tasks) {
      if (ids.has(task.id)) {
        findings.push(planningFinding({ code: "duplicate_task", severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Duplicate task", description: `Duplicate task ID ${task.id}.`, taskIds: [task.id] }));
      }
      ids.add(task.id);
      for (const dependency of task.dependencies) {
        if (!plan.tasks.some((candidate) => candidate.id === dependency)) {
          findings.push(planningFinding({ code: PLANNING_FINDING_CODES.MISSING_DEPENDENCY, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Missing dependency", description: `Task ${task.id} depends on missing task ${dependency}.`, taskIds: [task.id], evidence: [{ source: task.id, signal: dependency }] }));
        }
      }
      if ((context.requireAcceptanceCriteria === true || options.requireAcceptanceCriteria === true) && task.acceptanceCriteria.length === 0) {
        findings.push(planningFinding({ code: PLANNING_FINDING_CODES.INSUFFICIENT_ACCEPTANCE_CRITERIA, severity: PLANNING_FINDING_SEVERITIES.MEDIUM, title: "Acceptance criteria missing", description: `Task ${task.id} lacks acceptance criteria.`, taskIds: [task.id] }));
      }
      if (task.estimatedComplexity > this.bounds.maximumTaskComplexity) {
        findings.push(planningFinding({ code: PLANNING_FINDING_CODES.EXCESSIVE_SCOPE, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Task complexity exceeds bounds", description: `Task ${task.id} exceeds the maximum task complexity.`, taskIds: [task.id] }));
      }
      if (securitySensitiveTask(task)) {
        findings.push(planningFinding({ code: PLANNING_FINDING_CODES.SECURITY_SENSITIVE_WORK, severity: PLANNING_FINDING_SEVERITIES.MEDIUM, title: "Security-sensitive task", description: `Task ${task.id} requires security attention.`, taskIds: [task.id] }));
      }
    }
    if (plan.tasks.length > this.bounds.maximumTasks) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.EXCESSIVE_SCOPE, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Plan exceeds task bound", description: "The plan contains more tasks than allowed." }));
    }
    const cycle = detectCycle(plan);
    if (cycle.length > 0) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.CIRCULAR_DEPENDENCY, severity: PLANNING_FINDING_SEVERITIES.CRITICAL, title: "Circular dependency", description: "The task graph contains a dependency cycle.", taskIds: cycle }));
    }
    const waves = executionWaves(plan);
    const remainingExecutableCandidates = plan.tasks.filter((task) => ![TASK_STATUSES.COMPLETED, TASK_STATUSES.SKIPPED, TASK_STATUSES.CANCELLED].includes(task.status));
    if (waves.length === 0 && remainingExecutableCandidates.length > 0) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.NO_EXECUTABLE_PATH, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "No executable path", description: "No task can be executed from the current plan state." }));
    }
    if (waves.length > this.bounds.maximumExecutionWaves) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.EXCESSIVE_SCOPE, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Too many execution waves", description: "The plan exceeds the configured execution wave bound." }));
    }
    if (maxDependencyDepth(plan) > this.bounds.maximumDependencyDepth) {
      findings.push(planningFinding({ code: PLANNING_FINDING_CODES.EXCESSIVE_SCOPE, severity: PLANNING_FINDING_SEVERITIES.HIGH, title: "Dependency depth exceeded", description: "The dependency chain exceeds the configured bound." }));
    }
    findings.push(...decisionConflictFindings(plan, context.decisionRecords || this.decisionRecords));
    const blocked = findings.some((finding) => ["HIGH", "CRITICAL"].includes(finding.severity));
    return {
      status: blocked ? "BLOCKED" : findings.length > 0 ? "REVIEW_REQUIRED" : "VALID",
      blocked,
      findings,
      orderedTaskIds: topologicalOrder(plan).map((task) => task.id),
      executionWaves: waves.map((wave) => wave.map((task) => task.id)),
    };
  }

  enrichPlan(plan, context = {}, options = {}) {
    const graphSnapshot = graphSnapshotFor(options.repositoryGraph || context.repositoryGraph || this.repositoryGraph);
    const index = options.offlineIndex || context.offlineIndex || this.offlineIndex;
    const learning = options.learningEngine || context.learningEngine || this.learningEngine;
    const graphNodes = relevantGraphNodes(graphSnapshot, plan.objective);
    const evidence = indexEvidence(index, plan.objective);
    const lessons = learningRecords(learning, context);
    for (const task of plan.tasks) {
      const taskGraphNodes = relevantGraphNodes(graphSnapshot, `${task.title} ${task.description}`);
      const mergedGraphNodes = uniqueSorted([...graphNodes, ...taskGraphNodes].map((node) => node.id));
      task.contextRequirements = uniqueSorted([...task.contextRequirements, ...evidence.map((entry) => entry.id)]);
      task.metadata = {
        ...task.metadata,
        graphNodeIds: mergedGraphNodes,
        repositoryImpact: mergedGraphNodes.length,
        planningEvidence: evidence.slice(0, 10),
        successfulStrategies: lessons.filter((record) => record.type === "successful_strategy").map((record) => record.id).slice(0, 5),
        failedStrategiesToAvoid: lessons.filter((record) => record.type === "failed_strategy").map((record) => record.id).slice(0, 5),
      };
      if (task.metadata.failedStrategiesToAvoid.length > 0) {
        task.risk = "medium";
        task.confidence = Math.max(0.1, task.confidence - 0.1);
      }
      if (task.metadata.successfulStrategies.length > 0) {
        task.confidence = Math.min(1, task.confidence + 0.05);
      }
    }
  }

  recalculateDependents(plan) {
    for (const task of plan.tasks) {
      task.dependents = [];
    }
    for (const task of plan.tasks) {
      for (const dependency of task.dependencies) {
        const dependencyTask = plan.tasks.find((candidate) => candidate.id === dependency);
        if (dependencyTask && !dependencyTask.dependents.includes(task.id)) {
          dependencyTask.dependents.push(task.id);
        }
      }
    }
    for (const task of plan.tasks) {
      task.dependents = uniqueSorted(task.dependents);
    }
  }

  refreshReadiness(plan) {
    for (const task of plan.tasks) {
      if (task.status !== TASK_STATUSES.PENDING && task.status !== TASK_STATUSES.WAITING && task.status !== TASK_STATUSES.READY) {
        continue;
      }
      const dependenciesComplete = task.dependencies.every((dependency) => {
        const dependencyTask = plan.tasks.find((candidate) => candidate.id === dependency);
        return dependencyTask && dependencyTask.status === TASK_STATUSES.COMPLETED;
      });
      task.status = dependenciesComplete ? TASK_STATUSES.READY : TASK_STATUSES.WAITING;
    }
  }

  planningEvidence(objective, context = {}, options = {}) {
    return indexEvidence(options.offlineIndex || context.offlineIndex || this.offlineIndex, objective);
  }

  requirePlan(planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error("Planning intelligence plan was not found.");
    }
    return plan;
  }

  emitLifecycle(type, payload = {}) {
    this.emit(PLANNING_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: PLANNING_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function defaultDecomposition(objective, context = {}) {
  const acceptanceCriteria = asArray(context.acceptanceCriteria);
  const expectedFiles = asArray(context.expectedFiles || context.files);
  const validationRequirements = asArray(context.validationRequirements || context.validationCommands);
  const tasks = [];
  const inspectId = "task:inspect";
  tasks.push({
    id: inspectId,
    title: "Inspect relevant context",
    description: `Inspect repository context for: ${objective}`,
    type: "analysis",
    priority: 80,
    dependencies: [],
    acceptanceCriteria: ["Relevant files, constraints, and risks are identified."],
    validationRequirements: [],
    outputs: expectedFiles,
    estimatedComplexity: 2,
    estimatedEffort: 1,
    confidence: 0.8,
  });
  const implementationIds = [];
  const scopedTargets = expectedFiles.length > 0 ? expectedFiles : ["requested objective"];
  scopedTargets.forEach((target, index) => {
    const id = `task:implement:${stableHash(target)}`;
    implementationIds.push(id);
    tasks.push({
      id,
      title: `Implement ${target}`,
      description: `Apply the requested change for ${target}.`,
      type: "implementation",
      priority: 70 - index,
      dependencies: [inspectId],
      inputs: [target],
      outputs: [target],
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [`${target} satisfies the objective.`],
      validationRequirements,
      securityRequirements: securityRequirementsFor(objective, target),
      estimatedComplexity: complexityFor(objective, target),
      estimatedEffort: 2,
      confidence: 0.7,
      executionStrategy: "Make the smallest scoped change that satisfies acceptance criteria.",
    });
  });
  tasks.push({
    id: "task:validate",
    title: "Validate objective evidence",
    description: "Run or inspect validation evidence before considering the plan complete.",
    type: "validation",
    priority: 60,
    dependencies: implementationIds,
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : ["Validation evidence confirms the requested behavior."],
    validationRequirements,
    securityRequirements: [],
    estimatedComplexity: 2,
    estimatedEffort: 1,
    confidence: 0.75,
  });
  return {
    summary: `Dependency-aware plan for ${objective}`,
    tasks,
    acceptanceCriteria,
    risks: risksForObjective(objective),
    assumptions: asArray(context.assumptions),
  };
}

function normalizeDecompositionOutput(output) {
  return {
    summary: output.summary || "",
    tasks: output.tasks,
    assumptions: asArray(output.assumptions),
    constraints: asArray(output.constraints),
    acceptanceCriteria: asArray(output.acceptanceCriteria),
    risks: asArray(output.risks),
    metadata: clonePlainObject(output.metadata || {}),
  };
}

function normalizePlan(input) {
  if (!isPlainObject(input)) {
    throw new Error("Planning intelligence plan must be an object.");
  }
  const plan = {
    id: requiredString(input.id, "Planning plan id is required."),
    projectId: requiredString(input.projectId, "Planning projectId is required."),
    objective: requiredString(input.objective, "Planning objective is required."),
    summary: requiredString(input.summary || input.objective, "Planning summary is required."),
    status: normalizePlanStatus(input.status || PLAN_STATUSES.DRAFT),
    tasks: [],
    assumptions: normalizeStringArray(input.assumptions || []),
    constraints: normalizeStringArray(input.constraints || []),
    acceptanceCriteria: normalizeStringArray(input.acceptanceCriteria || []),
    risks: normalizeStringArray(input.risks || []),
    metadata: clonePlainObject(input.metadata || {}),
    version: normalizePositiveInteger(input.version, 1),
    createdAt: normalizeTimestamp(input.createdAt),
    updatedAt: normalizeTimestamp(input.updatedAt || input.createdAt),
  };
  plan.tasks = asArray(input.tasks).map((task) => normalizeTask({ ...task, planId: plan.id }, plan));
  return plan;
}

function normalizeTask(input, plan) {
  if (!isPlainObject(input)) {
    throw new Error("Planning task must be an object.");
  }
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt);
  return {
    id: input.id || `task:${stableHash(taskIdentityInput(input))}`,
    planId: requiredString(input.planId || plan.id, "Planning task planId is required."),
    title: requiredString(input.title, "Planning task title is required."),
    description: requiredString(input.description || input.title, "Planning task description is required."),
    type: requiredString(input.type || "implementation", "Planning task type is required."),
    status: normalizeTaskStatus(input.status || TASK_STATUSES.PENDING),
    priority: normalizeNumber(input.priority, 50),
    dependencies: normalizeStringArray(input.dependencies || []),
    dependents: normalizeStringArray(input.dependents || []),
    inputs: normalizeStringArray(input.inputs || []),
    outputs: normalizeStringArray(input.outputs || []),
    acceptanceCriteria: normalizeStringArray(input.acceptanceCriteria || []),
    validationRequirements: normalizeStringArray(input.validationRequirements || []),
    securityRequirements: normalizeStringArray(input.securityRequirements || []),
    estimatedComplexity: normalizeNumber(input.estimatedComplexity, 3),
    estimatedEffort: normalizeNumber(input.estimatedEffort, 1),
    confidence: normalizeScore(input.confidence, 0.6),
    executionStrategy: requiredString(input.executionStrategy || "Execute deterministically with validation evidence.", "Planning task executionStrategy is required."),
    contextRequirements: normalizeStringArray(input.contextRequirements || []),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function topologicalOrder(plan) {
  const tasks = plan.tasks.slice().sort(compareTasks);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const inDegree = new Map(tasks.map((task) => [task.id, 0]));
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (byId.has(dependency)) {
        inDegree.set(task.id, inDegree.get(task.id) + 1);
      }
    }
  }
  const queue = tasks.filter((task) => inDegree.get(task.id) === 0);
  const ordered = [];
  while (queue.length > 0) {
    const task = queue.shift();
    ordered.push(task);
    for (const dependent of task.dependents) {
      if (!inDegree.has(dependent)) {
        continue;
      }
      inDegree.set(dependent, inDegree.get(dependent) - 1);
      if (inDegree.get(dependent) === 0) {
        queue.push(byId.get(dependent));
        queue.sort(compareTasks);
      }
    }
  }
  return ordered;
}

function executionWaves(plan) {
  const remaining = new Map(plan.tasks
    .filter((task) => ![TASK_STATUSES.CANCELLED, TASK_STATUSES.SKIPPED, TASK_STATUSES.BLOCKED, TASK_STATUSES.FAILED, TASK_STATUSES.COMPLETED].includes(task.status))
    .map((task) => [task.id, task]));
  const completed = new Set(plan.tasks.filter((task) => task.status === TASK_STATUSES.COMPLETED).map((task) => task.id));
  const waves = [];
  while (remaining.size > 0) {
    const ready = Array.from(remaining.values())
      .filter((task) => task.dependencies.every((dependency) => {
        const dependencyTask = plan.tasks.find((candidate) => candidate.id === dependency);
        return !dependencyTask || completed.has(dependency);
      }))
      .sort(compareTasks);
    if (ready.length === 0) {
      break;
    }
    waves.push(ready);
    for (const task of ready) {
      remaining.delete(task.id);
      completed.add(task.id);
    }
  }
  return waves;
}

function criticalPath(plan) {
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const memo = new Map();
  function bestFrom(task, visiting = new Set()) {
    if (memo.has(task.id)) {
      return memo.get(task.id);
    }
    if (visiting.has(task.id)) {
      return { weight: 0, tasks: [] };
    }
    visiting.add(task.id);
    const dependents = task.dependents.map((id) => byId.get(id)).filter(Boolean);
    const childPaths = dependents.map((dependent) => bestFrom(dependent, new Set(visiting)));
    const bestChild = childPaths.sort((left, right) => right.weight - left.weight)[0] || { weight: 0, tasks: [] };
    const result = {
      weight: taskWeight(task) + bestChild.weight,
      tasks: [task, ...bestChild.tasks],
    };
    memo.set(task.id, result);
    return result;
  }
  return plan.tasks.map((task) => bestFrom(task)).sort((left, right) => right.weight - left.weight)[0]?.tasks || [];
}

function detectCycle(plan) {
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const stack = [];
  function visit(task) {
    if (visiting.has(task.id)) {
      return stack.slice(stack.indexOf(task.id));
    }
    if (visited.has(task.id)) {
      return [];
    }
    visiting.add(task.id);
    stack.push(task.id);
    for (const dependency of task.dependencies) {
      const dependencyTask = byId.get(dependency);
      if (!dependencyTask) {
        continue;
      }
      const cycle = visit(dependencyTask);
      if (cycle.length > 0) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(task.id);
    visited.add(task.id);
    return [];
  }
  for (const task of plan.tasks) {
    const cycle = visit(task);
    if (cycle.length > 0) {
      return cycle;
    }
  }
  return [];
}

function maxDependencyDepth(plan) {
  const byId = new Map(plan.tasks.map((task) => [task.id, task]));
  const memo = new Map();
  function depth(task, visiting = new Set()) {
    if (memo.has(task.id)) {
      return memo.get(task.id);
    }
    if (visiting.has(task.id)) {
      return 0;
    }
    visiting.add(task.id);
    const value = task.dependencies.length === 0
      ? 1
      : 1 + Math.max(...task.dependencies.map((id) => byId.get(id)).filter(Boolean).map((dependency) => depth(dependency, new Set(visiting))), 0);
    memo.set(task.id, value);
    return value;
  }
  return Math.max(0, ...plan.tasks.map((task) => depth(task)));
}

function decisionConflictFindings(plan, decisionRecords) {
  const findings = [];
  for (const decision of asArray(decisionRecords).filter((record) => record && record.type === "approved-decision")) {
    const statement = String(decision.value && decision.value.statement || "").toLowerCase();
    if (!/\b(no|never|must not|forbid|forbidden|block)\b/.test(statement)) {
      continue;
    }
    for (const task of plan.tasks) {
      const text = `${task.title} ${task.description} ${task.outputs.join(" ")}`.toLowerCase();
      const tokens = meaningfulTokens(statement);
      if (tokens.some((token) => text.includes(token))) {
        findings.push(planningFinding({
          code: PLANNING_FINDING_CODES.DECISION_CONFLICT,
          severity: PLANNING_FINDING_SEVERITIES.HIGH,
          title: "Durable decision conflict",
          description: `Task ${task.id} conflicts with durable decision ${decision.id}.`,
          taskIds: [task.id],
          evidence: [{ source: decision.id, signal: decision.value.statement }],
          metadata: { decisionId: decision.id },
        }));
      }
    }
  }
  return findings;
}

function replacementTasksFor(plan, trigger, context, timestamp) {
  const affectedTaskId = context.taskId || context.failedTaskId || context.blockedTaskId;
  const affectedTask = plan.tasks.find((task) => task.id === affectedTaskId) || plan.tasks.find((task) => [TASK_STATUSES.FAILED, TASK_STATUSES.BLOCKED].includes(task.status));
  const dependency = affectedTask && affectedTask.status === TASK_STATUSES.COMPLETED ? [] : affectedTask ? affectedTask.dependencies.filter((id) => plan.tasks.some((task) => task.id === id && task.status === TASK_STATUSES.COMPLETED)) : [];
  return [{
    id: `task:replan:${stableHash({ planId: plan.id, trigger, taskId: affectedTask && affectedTask.id, version: plan.version + 1 })}`,
    planId: plan.id,
    title: `Replan response for ${trigger}`,
    description: context.rationale || rationaleForTrigger(trigger),
    type: "replan",
    status: TASK_STATUSES.PENDING,
    priority: 90,
    dependencies: dependency,
    inputs: affectedTask ? [affectedTask.id] : [],
    outputs: asArray(context.outputs),
    acceptanceCriteria: asArray(context.acceptanceCriteria).length > 0 ? asArray(context.acceptanceCriteria) : [`The ${trigger} condition is addressed without reopening completed work.`],
    validationRequirements: asArray(context.validationRequirements),
    securityRequirements: trigger === REPLAN_TRIGGERS.SECURITY_BLOCKED ? ["Security blocked condition is resolved or escalated."] : [],
    estimatedComplexity: 3,
    estimatedEffort: 1,
    confidence: 0.65,
    executionStrategy: "Adjust the remaining plan while preserving completed work.",
    metadata: { trigger, replacementFor: affectedTask && affectedTask.id },
    createdAt: timestamp,
    updatedAt: timestamp,
  }];
}

function priorityScore(task, context) {
  let score = task.priority;
  if (task.status === TASK_STATUSES.READY) score += 20;
  score += task.dependents.length * 5;
  if (context.criticalIds.has(task.id)) score += 18;
  score -= task.estimatedComplexity * 2;
  score += task.confidence * 10;
  score += Number(task.metadata.repositoryImpact || 0);
  if (task.securityRequirements.length > 0) score -= 5;
  if (context.successLessons.some((record) => overlaps(record.summary, task.title))) score += 8;
  if (context.failedLessons.some((record) => overlaps(record.summary, task.title))) score -= 8;
  return Number(score.toFixed(3));
}

function relevantGraphNodes(graphSnapshot, text) {
  if (!graphSnapshot || !Array.isArray(graphSnapshot.nodes)) return [];
  const tokens = tokenize(text);
  return graphSnapshot.nodes
    .filter((node) => tokens.some((token) => String(node.name || "").toLowerCase().includes(token) || String(node.path || "").toLowerCase().includes(token)))
    .slice(0, 20);
}

function indexEvidence(index, objective) {
  if (!index || typeof index.search !== "function") return [];
  return index.search(objective, { limit: 8 }).map((document) => ({
    id: document.id,
    type: document.type,
    path: document.path,
    title: document.title,
    score: document.score,
  }));
}

function learningRecords(learning, context = {}) {
  if (!learning) return asArray(context.learningRecords);
  if (typeof learning.retrieve === "function") return learning.retrieve({ projectId: context.projectId, limit: 20 });
  if (typeof learning.list === "function") return learning.list({ status: "ACTIVE" });
  if (typeof learning.snapshot === "function") return asArray(learning.snapshot().records).filter((record) => record.status === "ACTIVE");
  return asArray(learning);
}

function graphSnapshotFor(graph) {
  if (!graph) return null;
  if (typeof graph.snapshot === "function") return graph.snapshot();
  return graph;
}

function completionEvidenceFor(plan) {
  return {
    planId: plan.id,
    version: plan.version,
    completedTaskIds: plan.tasks.filter((task) => task.status === TASK_STATUSES.COMPLETED).map((task) => task.id),
    acceptanceCriteria: plan.acceptanceCriteria,
    validationRequirements: uniqueSorted(plan.tasks.flatMap((task) => task.validationRequirements)),
  };
}

function planningFinding(input) {
  const createdAt = normalizeTimestamp(input.createdAt);
  return {
    id: input.id || `planning-finding:${stableHash({ code: input.code, title: input.title, taskIds: input.taskIds || [], evidence: input.evidence || [] })}`,
    code: requiredString(input.code, "Planning finding code is required."),
    severity: input.severity || PLANNING_FINDING_SEVERITIES.MEDIUM,
    title: requiredString(input.title, "Planning finding title is required."),
    description: requiredString(input.description, "Planning finding description is required."),
    taskIds: normalizeStringArray(input.taskIds || []),
    evidence: asArray(input.evidence).map(clonePlainObject),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt,
  };
}

function normalizePlanStatus(status) {
  if (!Object.values(PLAN_STATUSES).includes(status)) throw new Error("Planning plan status is invalid.");
  return status;
}

function normalizeTaskStatus(status) {
  if (!Object.values(TASK_STATUSES).includes(status)) throw new Error("Planning task status is invalid.");
  return status;
}

function normalizeReplanTrigger(trigger) {
  if (!Object.values(REPLAN_TRIGGERS).includes(trigger)) throw new Error("Planning replan trigger is invalid.");
  return trigger;
}

function normalizeBounds(input) {
  return {
    ...DEFAULT_BOUNDS,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => Number.isInteger(value) && value > 0)),
  };
}

function normalizeAdapters(adapters) {
  return asArray(adapters).filter(Boolean).map((adapter) => {
    if (!adapter || typeof adapter.decompose !== "function") throw new Error("Planning decomposition adapter requires decompose.");
    return adapter;
  });
}

function taskIdentity(task) {
  return stableSerialize(taskIdentityInput(task));
}

function taskIdentityInput(task) {
  return {
    title: normalizeSemanticText(task.title),
    type: task.type || "implementation",
    outputs: normalizeStringArray(task.outputs || task.inputs || []),
    acceptanceCriteria: normalizeStringArray(task.acceptanceCriteria || []),
  };
}

function eventForTaskUpdate(task) {
  if (task.status === TASK_STATUSES.RUNNING) return PLANNING_EVENT_TYPES.TASK_STARTED;
  if (task.status === TASK_STATUSES.COMPLETED) return PLANNING_EVENT_TYPES.TASK_COMPLETED;
  if (task.status === TASK_STATUSES.FAILED) return PLANNING_EVENT_TYPES.TASK_FAILED;
  if (task.status === TASK_STATUSES.BLOCKED) return PLANNING_EVENT_TYPES.TASK_BLOCKED;
  return PLANNING_EVENT_TYPES.TASK_UPDATED;
}

function securitySensitiveTask(task) {
  const text = `${task.title} ${task.description} ${task.securityRequirements.join(" ")}`.toLowerCase();
  return /\b(auth|permission|secret|token|credential|security|delete|shell|network)\b/.test(text);
}

function complexityFor(objective, target) {
  return Math.min(10, Math.max(2, tokenize(`${objective} ${target}`).length / 3));
}

function securityRequirementsFor(objective, target) {
  return /\b(delete|shell|network|auth|security|permission|secret|token)\b/i.test(`${objective} ${target}`)
    ? ["Security-sensitive work must be reviewed before execution."]
    : [];
}

function risksForObjective(objective) {
  return /\b(delete|security|auth|network|database)\b/i.test(objective) ? ["Security-sensitive objective requires review."] : [];
}

function rationaleForTrigger(trigger) {
  return `Dynamic replanning was triggered by ${trigger}.`;
}

function decisionConstraintText(records) {
  return asArray(records).filter((record) => record && record.type === "approved-decision").map((record) => record.value && record.value.statement).filter(Boolean);
}

function meaningfulTokens(value) {
  return tokenize(value).filter((token) => !["must", "not", "never", "with", "from", "code", "task"].includes(token));
}

function overlaps(left, right) {
  const rightTokens = new Set(tokenize(right));
  return tokenize(left).some((token) => rightTokens.has(token));
}

function touchPlan(plan) {
  plan.updatedAt = new Date().toISOString();
}

function taskIndex(plan, taskId) {
  const index = plan.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) throw new Error("Planning task was not found.");
  return index;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Planning snapshot must be an object.");
  if (snapshot.schemaVersion !== PLANNING_SCHEMA_VERSION) throw new Error("Planning snapshot schema version is unsupported.");
  if (!Array.isArray(snapshot.plans)) throw new Error("Planning snapshot requires plans.");
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) {
    if (typeof migration === "function") current = migration(current);
  }
  return current;
}

function normalizePlanFilter(filter) {
  return {
    ids: normalizeStringSet(filter.ids || filter.id),
    projectIds: normalizeStringSet(filter.projectIds || filter.projectId),
    statuses: normalizeStringSet(filter.statuses || filter.status),
  };
}

function matchesPlanFilter(plan, filter) {
  return setMatches(filter.ids, plan.id) && setMatches(filter.projectIds, plan.projectId) && setMatches(filter.statuses, plan.status);
}

function setMatches(filters, value) {
  if (filters.size === 0) return true;
  const normalized = String(value || "").toLowerCase();
  return Array.from(filters).some((filter) => normalized === filter.toLowerCase());
}

function normalizeStringSet(value) {
  return new Set(normalizeStringArray(value));
}

function normalizeStringArray(value) {
  return uniqueSorted(asArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function tokenize(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9_$.-]+/i).filter((token) => token.length > 1);
}

function normalizeSemanticText(value) {
  return String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Planning timestamp must be valid.");
  return timestamp;
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) throw new Error("Planning persistence requires a repository path or file path.");
  return path.join(repositoryPath, ".levi", "planning-intelligence.json");
}

function comparePlans(left, right) {
  return left.projectId.localeCompare(right.projectId) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function compareTasks(left, right) {
  return right.priority - left.priority || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function taskWeight(task) {
  return task.estimatedComplexity + task.estimatedEffort + task.dependents.length + (task.securityRequirements.length > 0 ? 2 : 0);
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  PLAN_STATUSES,
  PLANNING_EVENT_TYPES,
  PLANNING_EVENTS,
  PLANNING_FINDING_CODES,
  PLANNING_FINDING_SEVERITIES,
  PLANNING_SCHEMA_VERSION,
  PlanningIntelligenceEngine,
  REPLAN_TRIGGERS,
  TASK_STATUSES,
};
