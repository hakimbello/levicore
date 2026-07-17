const { EventEmitter } = require("node:events");
const {
  CONTINUE_STOP_REASONS,
  ContinueEngine,
} = require("./continue-engine");
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

        if (repairRequired(session, validationResult)) {
          counters.repairs += 1;
          moveSessionTo(session, EXECUTION_STATES.REPAIRING);
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

  stop(session, counters, startedAtMs, status, stopReason, error) {
    const eventType = status === "COMPLETED"
      ? EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED
      : EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_PAUSED;
    const event = this.emitLifecycle(eventType, session, counters, {
      status,
      stopReason,
      error: error ? error.message : undefined,
      runtimeMs: runtimeMs(startedAtMs, this.now),
    });

    return {
      status,
      stopReason,
      iterations: counters.iterations,
      repairs: counters.repairs,
      runtimeMs: event.runtimeMs,
      session: snapshotSession(session),
      error: error ? error.message : null,
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

function repairRequired(session, validationResult) {
  return (
    isPlainObject(validationResult) && validationResult.repairRequired === true ||
    session.metadata && session.metadata.repairRequired === true ||
    session.currentState === EXECUTION_STATES.REPAIRING
  );
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
