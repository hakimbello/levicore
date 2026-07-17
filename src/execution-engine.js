const { EventEmitter } = require("node:events");
const {
  APPROVAL_DECISIONS,
  ApprovalGateway,
} = require("./approval-gateway");
const {
  CONTINUE_STOP_REASONS,
  ContinueEngine,
} = require("./continue-engine");
const {
  REPAIR_RESULTS,
  RepairEngine,
} = require("./repair-engine");
const {
  EXECUTION_STATES,
  canTransition,
} = require("./execution-session");

const EXECUTION_ENGINE_EVENT_TYPES = Object.freeze({
  EXECUTION_STARTED: "execution_started",
  ITERATION_STARTED: "iteration_started",
  ITERATION_COMPLETED: "iteration_completed",
  VALIDATION_STARTED: "validation_started",
  VALIDATION_COMPLETED: "validation_completed",
  REPAIR_STARTED: "repair_started",
  REPAIR_PLAN_CREATED: "repair_plan_created",
  REPAIR_ATTEMPTED: "repair_attempted",
  REPAIR_COMPLETED: "repair_completed",
  REPAIR_FAILED: "repair_failed",
  RESTORE_REQUIRED: "restore_required",
  EXECUTION_PAUSED: "execution_paused",
  EXECUTION_COMPLETED: "execution_completed",
});

const EXECUTION_ENGINE_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const DEFAULT_LIMITS = Object.freeze({
  maxIterations: 10,
  maxRuntimeMs: 60000,
  maxRepairs: 3,
});

class ExecutionEngine extends EventEmitter {
  constructor(options) {
    super();
    validateOptions(options);

    this.executeNextTask = options.executeNextTask;
    this.validateResults = options.validateResults;
    this.continueEngine = options.continueEngine || new ContinueEngine();
    this.repairEngine = options.repairEngine || new RepairEngine();
    this.approvalGateway = options.approvalGateway || new ApprovalGateway();
    this.getPendingActions = options.getPendingActions || pendingActionsFromSession;
    this.limits = normalizeLimits(options.limits || {});
    this.now = typeof options.now === "function" ? options.now : Date.now;
  }

  async run(session) {
    validateSession(session);

    const startedAtMs = nowMs(this.now);
    const counters = {
      iterations: 0,
      repairs: 0,
    };

    this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_STARTED, session, counters, {
      runtimeMs: 0,
    });

    while (true) {
      const preLimit = exceededLimit(this.limits, counters, runtimeMs(startedAtMs, this.now), {
        checkIterations: true,
      });

      if (preLimit) {
        return this.stop(session, counters, startedAtMs, "PAUSED", preLimit);
      }

      counters.iterations += 1;
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED, session, counters);

      try {
        moveSessionTo(session, EXECUTION_STATES.PLANNING);
        const approval = this.evaluateApproval(session, counters);

        if (approval.decision === APPROVAL_DECISIONS.REQUIRES_APPROVAL) {
          markSessionWaitingForApproval(session, approval.request, approval.action);
          return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.APPROVAL_REQUIRED, null, {
            approvalRequest: approval.request,
          });
        }

        if (approval.decision === APPROVAL_DECISIONS.DENIED) {
          markSessionApprovalDenied(session, approval.action);
          return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.SECURITY_STOP, null, {
            approvalDecision: APPROVAL_DECISIONS.DENIED,
          });
        }

        moveSessionTo(session, EXECUTION_STATES.EXECUTING);
        applySessionUpdate(session, await this.executeNextTask({
          session,
          iteration: counters.iterations,
          repairs: counters.repairs,
        }));

        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED, session, counters);
        moveSessionTo(session, EXECUTION_STATES.VALIDATING);
        const validationResult = await this.validateResults({
          session,
          iteration: counters.iterations,
          repairs: counters.repairs,
        });

        applyValidationResult(session, validationResult);
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED, session, counters, {
          validation: normalizeResultForEvent(validationResult),
        });

        if (!validationPassed(session)) {
          const repairStop = await this.repairValidationFailure(session, counters, startedAtMs, validationResult);

          if (repairStop) {
            return repairStop;
          }
        }

        if (validationPassed(session) && objectiveComplete(session)) {
          moveSessionTo(session, EXECUTION_STATES.COMPLETED);
        }

        const postLimit = exceededLimit(this.limits, counters, runtimeMs(startedAtMs, this.now), {
          checkIterations: false,
        });

        if (postLimit) {
          this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED, session, counters, {
            shouldContinue: false,
            stopReason: postLimit,
          });
          return this.stop(session, counters, startedAtMs, "PAUSED", postLimit);
        }

        moveSessionTo(session, EXECUTION_STATES.VALIDATING);

        const shouldContinue = this.continueEngine.shouldContinue(session);
        const stopReason = shouldContinue ? null : this.continueEngine.getStopReason(session);

        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED, session, counters, {
          shouldContinue,
          stopReason,
        });

        if (!shouldContinue) {
          return this.stop(
            session,
            counters,
            startedAtMs,
            stopReason === CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE ? "COMPLETED" : "PAUSED",
            stopReason,
          );
        }
      } catch (error) {
        markSessionFailed(session, error);
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED, session, counters, {
          shouldContinue: false,
          stopReason: CONTINUE_STOP_REASONS.EXECUTION_FAILED,
          error: error.message,
        });
        return this.stop(
          session,
          counters,
          startedAtMs,
          "PAUSED",
          CONTINUE_STOP_REASONS.EXECUTION_FAILED,
          error,
        );
      }
    }
  }

  async resume(session) {
    validateSession(session);

    const request = session.metadata && session.metadata.approvalRequest;

    if (request) {
      if (!this.approvalGateway.isApproved(request.id)) {
        throw new Error("Execution engine cannot resume until the approval request is approved.");
      }

      clearSessionApproval(session, request.id);
    }

    return this.run(session);
  }

  async repairValidationFailure(session, counters, startedAtMs, validationResult) {
    let currentValidationResult = validationResult;

    while (!validationPassed(session)) {
      if (counters.repairs >= this.limits.maxRepairs) {
        return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.MAX_REPAIRS);
      }

      const context = createRepairContext(session, currentValidationResult, counters);

      if (!this.repairEngine.canRepair(context)) {
        const repairResult = {
          result: REPAIR_RESULTS.CANNOT_REPAIR,
          action: "Repair engine declined repair.",
          metadata: {},
        };

        this.recordRepairHistory(session, counters.repairs + 1, context, repairResult);
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_FAILED, session, counters, {
          repairResult: repairResult.result,
        });
        return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.EXECUTION_FAILED, null, {
          repairResult: repairResult.result,
        });
      }

      counters.repairs += 1;
      moveSessionTo(session, EXECUTION_STATES.REPAIRING);
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_STARTED, session, counters);

      const repairPlan = this.repairEngine.createRepairPlan({
        ...context,
        currentRepairCount: counters.repairs,
      });
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_PLAN_CREATED, session, counters, {
        repairPlan,
      });

      const repairResult = await this.repairEngine.repair({
        ...context,
        currentRepairCount: counters.repairs,
        metadata: {
          ...context.metadata,
          repairPlan,
        },
      });

      this.recordRepairHistory(session, counters.repairs, context, repairResult);
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_ATTEMPTED, session, counters, {
        repairResult: repairResult.result,
        repairAction: repairResult.action,
      });

      if (repairResult.result === REPAIR_RESULTS.RESTORE_REQUIRED) {
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.RESTORE_REQUIRED, session, counters, {
          repairResult: repairResult.result,
          repairAction: repairResult.action,
        });
        return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.EXECUTION_FAILED, null, {
          repairResult: repairResult.result,
        });
      }

      if (repairResult.result === REPAIR_RESULTS.CANNOT_REPAIR) {
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_FAILED, session, counters, {
          repairResult: repairResult.result,
          repairAction: repairResult.action,
        });
        return this.stop(session, counters, startedAtMs, "PAUSED", CONTINUE_STOP_REASONS.EXECUTION_FAILED, null, {
          repairResult: repairResult.result,
        });
      }

      if (repairResult.result === REPAIR_RESULTS.REPAIR_FAILED) {
        this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_FAILED, session, counters, {
          repairResult: repairResult.result,
          repairAction: repairResult.action,
        });
        continue;
      }

      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_COMPLETED, session, counters, {
        repairResult: repairResult.result,
        repairAction: repairResult.action,
      });
      moveSessionTo(session, EXECUTION_STATES.VALIDATING);
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED, session, counters);
      currentValidationResult = await this.validateResults({
        session,
        iteration: counters.iterations,
        repairs: counters.repairs,
      });
      applyValidationResult(session, currentValidationResult);
      this.emitLifecycle(EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED, session, counters, {
        validation: normalizeResultForEvent(currentValidationResult),
      });
    }

    return null;
  }

  recordRepairHistory(session, attempt, context, repairResult) {
    const existing = session.metadata && Array.isArray(session.metadata.repairHistory)
      ? session.metadata.repairHistory
      : [];
    const entry = {
      attempt,
      failureSummary: repairResult.failureSummary || failureSummaryFor(context),
      repairAction: repairResult.action,
      result: repairResult.result,
      timestamp: timestampIso(this.now),
      metadata: repairResult.metadata || {},
    };

    mergeSessionMetadata(session, {
      repairHistory: [...existing, entry],
    });
  }

  evaluateApproval(session, counters) {
    const pendingActions = this.getPendingActions({
      session,
      iteration: counters.iterations,
      repairs: counters.repairs,
    });

    if (!Array.isArray(pendingActions) || pendingActions.length === 0) {
      return {
        decision: APPROVAL_DECISIONS.APPROVED,
        request: null,
        action: null,
      };
    }

    const approvedRequestIds = new Set(
      session.metadata && Array.isArray(session.metadata.approvedApprovalRequestIds)
        ? session.metadata.approvedApprovalRequestIds
        : [],
    );
    const unevaluatedActions = pendingActions.filter((action) => {
      const requestId = action && action.approvalRequestId;
      return !(typeof requestId === "string" && approvedRequestIds.has(requestId));
    });

    if (unevaluatedActions.length === 0) {
      return {
        decision: APPROVAL_DECISIONS.APPROVED,
        request: null,
        action: null,
      };
    }

    const result = this.approvalGateway.evaluateActions(unevaluatedActions, {
      metadata: {
        sessionId: session.sessionId,
        iteration: counters.iterations,
      },
      timestamp: timestampIso(this.now),
    });

    if (result.request) {
      return {
        ...result,
        action: unevaluatedActions[0],
      };
    }

    return {
      ...result,
      action: unevaluatedActions[0],
    };
  }

  stop(session, counters, startedAtMs, status, stopReason, error, extra = {}) {
    const eventType = status === "COMPLETED"
      ? EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED
      : EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_PAUSED;
    const event = this.emitLifecycle(eventType, session, counters, {
      status,
      stopReason,
      error: error ? error.message : undefined,
      runtimeMs: runtimeMs(startedAtMs, this.now),
      ...extra,
    });

    return {
      status,
      stopReason,
      iterations: counters.iterations,
      repairs: counters.repairs,
      runtimeMs: event.runtimeMs,
      session: snapshotSession(session),
      error: error ? error.message : null,
      ...extra,
    };
  }

  emitLifecycle(type, session, counters, input = {}) {
    const event = {
      type,
      sessionId: session.sessionId,
      objective: session.objective,
      currentState: session.currentState,
      iteration: counters.iterations,
      repairs: counters.repairs,
      timestamp: timestampIso(this.now),
      ...withoutUndefined(input),
    };

    this.emit(EXECUTION_ENGINE_EVENTS.LIFECYCLE, event);
    this.emit(type, event);
    return event;
  }
}

function exceededLimit(limits, counters, elapsedMs, options) {
  if (options.checkIterations && counters.iterations >= limits.maxIterations) {
    return CONTINUE_STOP_REASONS.MAX_ITERATIONS;
  }

  if (elapsedMs > limits.maxRuntimeMs) {
    return CONTINUE_STOP_REASONS.MAX_RUNTIME;
  }

  if (counters.repairs > limits.maxRepairs) {
    return CONTINUE_STOP_REASONS.MAX_REPAIRS;
  }

  return null;
}

function moveSessionTo(session, state) {
  if (session.currentState === state) {
    return;
  }

  if (typeof session.transitionTo === "function" && canTransition(session.currentState, state)) {
    session.transitionTo(state);
  }
}

function applySessionUpdate(session, result) {
  if (!isPlainObject(result)) {
    return;
  }

  if (result.completedStep !== undefined && typeof session.markStepCompleted === "function") {
    session.markStepCompleted(result.completedStep);
  }

  if (result.completedSteps !== undefined) {
    session.completedSteps = normalizeStringArray(result.completedSteps, "completedSteps");
  }

  if (result.remainingSteps !== undefined) {
    session.remainingSteps = normalizeStringArray(result.remainingSteps, "remainingSteps");
  }

  if (result.approvalRequired !== undefined) {
    session.approvalRequired = result.approvalRequired === true;
  }

  if (result.metadata !== undefined) {
    mergeSessionMetadata(session, result.metadata);
  }
}

function applyValidationResult(session, result) {
  applySessionUpdate(session, result);
  const metadata = {};

  if (isPlainObject(result)) {
    if (result.validationPassed !== undefined) {
      metadata.validationPassed = result.validationPassed === true;
    } else if (typeof result.status === "string") {
      metadata.validationPassed = ["PASSED", "COMPLETED"].includes(result.status.trim().toUpperCase());
    }

    if (result.objectiveComplete !== undefined) {
      metadata.objectiveComplete = result.objectiveComplete === true;
    }

    if (result.repairRequired !== undefined) {
      metadata.repairRequired = result.repairRequired === true;
    }

    if (Object.keys(metadata).length > 0) {
      mergeSessionMetadata(session, metadata);
    }
    return;
  }

  mergeSessionMetadata(session, {
    validationPassed: false,
  });
}

function mergeSessionMetadata(session, metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error("Execution engine metadata must be an object.");
  }

  session.metadata = {
    ...(isPlainObject(session.metadata) ? session.metadata : {}),
    ...clonePlainObject(metadata),
  };
}

function validationPassed(session) {
  return session.metadata && session.metadata.validationPassed === true;
}

function objectiveComplete(session) {
  return (
    session.currentState === EXECUTION_STATES.COMPLETED ||
    session.metadata && session.metadata.objectiveComplete === true ||
    Array.isArray(session.remainingSteps) && session.remainingSteps.length === 0
  );
}

function markSessionFailed(session, error) {
  if (typeof session.fail === "function") {
    session.fail(error);
    return;
  }

  session.currentState = EXECUTION_STATES.FAILED;
}

function normalizeResultForEvent(result) {
  if (!isPlainObject(result)) {
    return null;
  }

  return clonePlainObject(result);
}

function snapshotSession(session) {
  return typeof session.snapshot === "function" ? session.snapshot() : clonePlainObject(session);
}

function normalizeLimits(limits) {
  if (!isPlainObject(limits)) {
    throw new Error("Execution engine limits must be an object.");
  }

  return {
    maxIterations: normalizePositiveInteger(
      limits.maxIterations === undefined ? DEFAULT_LIMITS.maxIterations : limits.maxIterations,
      "maxIterations",
    ),
    maxRuntimeMs: normalizePositiveInteger(
      limits.maxRuntimeMs === undefined ? DEFAULT_LIMITS.maxRuntimeMs : limits.maxRuntimeMs,
      "maxRuntimeMs",
    ),
    maxRepairs: normalizeNonnegativeInteger(
      limits.maxRepairs === undefined ? DEFAULT_LIMITS.maxRepairs : limits.maxRepairs,
      "maxRepairs",
    ),
  };
}

function normalizePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Execution engine ${fieldName} must be a positive integer.`);
  }

  return value;
}

function normalizeNonnegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Execution engine ${fieldName} must be a nonnegative integer.`);
  }

  return value;
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Execution engine options are required.");
  }

  if (typeof options.executeNextTask !== "function") {
    throw new Error("Execution engine executeNextTask callback is required.");
  }

  if (typeof options.validateResults !== "function") {
    throw new Error("Execution engine validateResults callback is required.");
  }

  if (options.continueEngine !== undefined && typeof options.continueEngine.shouldContinue !== "function") {
    throw new Error("Execution engine continueEngine must expose shouldContinue.");
  }

  if (options.repairEngine !== undefined) {
    for (const methodName of ["canRepair", "createRepairPlan", "repair"]) {
      if (typeof options.repairEngine[methodName] !== "function") {
        throw new Error(`Execution engine repairEngine must expose ${methodName}.`);
      }
    }
  }

  if (options.approvalGateway !== undefined && typeof options.approvalGateway.evaluateActions !== "function") {
    throw new Error("Execution engine approvalGateway must expose evaluateActions.");
  }

  if (options.getPendingActions !== undefined && typeof options.getPendingActions !== "function") {
    throw new Error("Execution engine getPendingActions must be a function.");
  }
}

function validateSession(session) {
  if (!isPlainObject(session)) {
    throw new Error("Execution engine session is required.");
  }

  for (const fieldName of ["sessionId", "objective", "currentState"]) {
    if (typeof session[fieldName] !== "string" || session[fieldName].trim() === "") {
      throw new Error(`Execution engine session ${fieldName} is required.`);
    }
  }
}

function runtimeMs(startedAtMs, now) {
  return Math.max(0, nowMs(now) - startedAtMs);
}

function timestampIso(now) {
  return new Date(nowMs(now)).toISOString();
}

function nowMs(now) {
  const value = now();

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    return Date.parse(value);
  }

  if (!Number.isFinite(value)) {
    throw new Error("Execution engine now() must return a timestamp.");
  }

  return value;
}

function normalizeStringArray(values, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`Execution engine ${fieldName} must be an array.`);
  }

  return values.map((value) => {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Execution engine ${fieldName} entry is required.`);
    }

    return value.trim();
  });
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

function pendingActionsFromSession({ session }) {
  return session.metadata && Array.isArray(session.metadata.pendingActions)
    ? session.metadata.pendingActions
    : [];
}

function markSessionWaitingForApproval(session, request, action) {
  session.approvalRequired = true;
  const pendingActions = session.metadata && Array.isArray(session.metadata.pendingActions)
    ? session.metadata.pendingActions.map((pendingAction) => {
        if (pendingAction === action || actionsMatch(pendingAction, action)) {
          return {
            ...pendingAction,
            approvalRequestId: request.id,
          };
        }

        return pendingAction;
      })
    : undefined;
  mergeSessionMetadata(session, {
    approvalRequest: request,
    ...(pendingActions ? { pendingActions } : {}),
  });
  moveSessionTo(session, EXECUTION_STATES.WAITING_FOR_APPROVAL);
}

function markSessionApprovalDenied(session, action) {
  mergeSessionMetadata(session, {
    approvalDecision: APPROVAL_DECISIONS.DENIED,
    deniedAction: action || null,
    securityStop: true,
  });
}

function clearSessionApproval(session, requestId) {
  const metadata = isPlainObject(session.metadata) ? clonePlainObject(session.metadata) : {};
  const approvedApprovalRequestIds = new Set(Array.isArray(metadata.approvedApprovalRequestIds)
    ? metadata.approvedApprovalRequestIds
    : []);

  approvedApprovalRequestIds.add(requestId);
  delete metadata.approvalRequest;
  metadata.approvedApprovalRequestIds = Array.from(approvedApprovalRequestIds).sort();
  session.metadata = metadata;
  session.approvalRequired = false;
}

function actionsMatch(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  return (left.action || left.type) === (right.action || right.type) &&
    JSON.stringify(left.metadata || {}) === JSON.stringify(right.metadata || {});
}

function createRepairContext(session, validationResult, counters) {
  return {
    session,
    validationResult,
    failureDetails: failureDetailsFor(validationResult, session),
    failedTask: session.metadata && (session.metadata.failedTask || session.metadata.failedAction) || null,
    currentRepairCount: counters.repairs,
    metadata: {
      sessionId: session.sessionId,
      iteration: counters.iterations,
      repairHistory: session.metadata && Array.isArray(session.metadata.repairHistory)
        ? session.metadata.repairHistory
        : [],
      repairContext: session.metadata && isPlainObject(session.metadata.repairContext)
        ? session.metadata.repairContext
        : {},
    },
  };
}

function failureDetailsFor(validationResult, session) {
  if (isPlainObject(validationResult) && validationResult.failureDetails !== undefined) {
    return validationResult.failureDetails;
  }

  if (isPlainObject(validationResult) && typeof validationResult.error === "string") {
    return {
      summary: validationResult.error,
    };
  }

  if (Array.isArray(session.errors) && session.errors.length > 0) {
    return {
      summary: session.errors[session.errors.length - 1].message,
    };
  }

  return {
    summary: "Validation failed.",
  };
}

function failureSummaryFor(context) {
  if (isPlainObject(context.failureDetails) && typeof context.failureDetails.summary === "string") {
    return context.failureDetails.summary;
  }

  if (typeof context.failureDetails === "string" && context.failureDetails.trim() !== "") {
    return context.failureDetails.trim();
  }

  if (isPlainObject(context.validationResult) && typeof context.validationResult.error === "string") {
    return context.validationResult.error;
  }

  return "Validation failed.";
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  DEFAULT_LIMITS,
  EXECUTION_ENGINE_EVENTS,
  EXECUTION_ENGINE_EVENT_TYPES,
  ExecutionEngine,
};
