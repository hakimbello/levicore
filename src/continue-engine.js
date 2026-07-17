const { EventEmitter } = require("node:events");
const {
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
} = require("./execution-session");

const CONTINUE_STOP_REASONS = Object.freeze({
  OBJECTIVE_COMPLETE: "OBJECTIVE_COMPLETE",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SECURITY_STOP: "SECURITY_STOP",
  COST_LIMIT: "COST_LIMIT",
  AMBIGUOUS_TASK: "AMBIGUOUS_TASK",
  USER_CANCELLED: "USER_CANCELLED",
  EXECUTION_FAILED: "EXECUTION_FAILED",
  MAX_ITERATIONS: "MAX_ITERATIONS",
  MAX_RUNTIME: "MAX_RUNTIME",
  MAX_REPAIRS: "MAX_REPAIRS",
  OBJECTIVE_BLOCKED: "OBJECTIVE_BLOCKED",
  OBJECTIVE_INCOMPLETE: "OBJECTIVE_INCOMPLETE",
  COMPLETION_REVIEW_REQUIRED: "COMPLETION_REVIEW_REQUIRED",
});

class ContinueEngine extends EventEmitter {
  shouldContinue(session) {
    const decision = createContinueDecision(session);
    emitDecisionProgress(this, session, decision);
    return decision.shouldContinue;
  }

  getStopReason(session) {
    return createContinueDecision(session).stopReason;
  }
}

function createContinueDecision(session) {
  const normalized = normalizeSession(session);

  if (userCancelled(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.USER_CANCELLED);
  }

  if (!validationPassed(normalized) || executionFailed(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.EXECUTION_FAILED);
  }

  if (approvalRequired(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.APPROVAL_REQUIRED);
  }

  if (objectiveComplete(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE);
  }

  if (securityStop(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.SECURITY_STOP);
  }

  if (costLimitExceeded(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.COST_LIMIT);
  }

  if (ambiguityDetected(normalized)) {
    return stopDecision(CONTINUE_STOP_REASONS.AMBIGUOUS_TASK);
  }

  return {
    shouldContinue: true,
    stopReason: null,
  };
}

function stopDecision(stopReason) {
  return {
    shouldContinue: false,
    stopReason,
  };
}

function emitDecisionProgress(engine, session, decision) {
  const type = progressEventTypeFor(decision);
  const eventInput = {
    shouldContinue: decision.shouldContinue,
  };

  if (decision.stopReason) {
    eventInput.stopReason = decision.stopReason;
  }

  const event = typeof session.emitProgressEvent === "function"
    ? session.emitProgressEvent(type, eventInput)
    : createStandaloneProgressEvent(session, type, eventInput);

  engine.emit(EXECUTION_PROGRESS_EVENTS.PROGRESS, event);
}

function progressEventTypeFor(decision) {
  if (decision.shouldContinue) {
    return EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE;
  }

  if (decision.stopReason === CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE) {
    return EXECUTION_PROGRESS_EVENT_TYPES.COMPLETED;
  }

  return EXECUTION_PROGRESS_EVENT_TYPES.PAUSED;
}

function createStandaloneProgressEvent(session, type, input) {
  const normalized = normalizeSession(session);

  return {
    type,
    sessionId: normalized.sessionId,
    objective: normalized.objective,
    currentState: normalized.currentState,
    startedAt: normalized.startedAt,
    updatedAt: normalized.updatedAt,
    completedSteps: [...normalized.completedSteps],
    remainingSteps: [...normalized.remainingSteps],
    approvalRequired: normalized.approvalRequired,
    errors: normalized.errors.map((error) => ({ ...error })),
    metadata: clonePlainObject(normalized.metadata),
    ...input,
  };
}

function normalizeSession(session) {
  const source = typeof session.snapshot === "function" ? session.snapshot() : session;

  if (!isPlainObject(source)) {
    throw new Error("Continue engine session is required.");
  }

  return {
    sessionId: requiredString(source.sessionId, "Continue engine sessionId is required."),
    objective: requiredString(source.objective, "Continue engine objective is required."),
    currentState: requiredString(source.currentState, "Continue engine currentState is required."),
    startedAt: requiredString(source.startedAt, "Continue engine startedAt is required."),
    updatedAt: requiredString(source.updatedAt, "Continue engine updatedAt is required."),
    completedSteps: normalizeStringArray(source.completedSteps || [], "completedSteps"),
    remainingSteps: normalizeStringArray(source.remainingSteps || [], "remainingSteps"),
    approvalRequired: source.approvalRequired === true,
    errors: normalizeErrors(source.errors || []),
    metadata: normalizeMetadata(source.metadata || {}),
  };
}

function userCancelled(session) {
  return session.currentState === EXECUTION_STATES.CANCELLED || session.metadata.userCancelled === true;
}

function validationPassed(session) {
  if (session.metadata.validationPassed === true) {
    return true;
  }

  if (["PASSED", "COMPLETED"].includes(stringValue(session.metadata.validationStatus))) {
    return true;
  }

  const validation = session.metadata.validation || session.metadata.validationResult;
  return isPlainObject(validation) && ["PASSED", "COMPLETED"].includes(stringValue(validation.status));
}

function executionFailed(session) {
  return (
    session.currentState === EXECUTION_STATES.FAILED ||
    session.metadata.executionFailed === true ||
    session.metadata.validationPassed === false ||
    ["FAILED", "ERROR"].includes(stringValue(session.metadata.validationStatus))
  );
}

function approvalRequired(session) {
  return session.approvalRequired === true || session.currentState === EXECUTION_STATES.WAITING_FOR_APPROVAL;
}

function objectiveComplete(session) {
  return (
    session.currentState === EXECUTION_STATES.COMPLETED ||
    session.metadata.objectiveComplete === true
  );
}

function securityStop(session) {
  if (session.metadata.securityStop === true) {
    return true;
  }

  const security = session.metadata.security || session.metadata.securityDecision;
  return isPlainObject(security) && ["BLOCKED", "STOP", "STOPPED"].includes(stringValue(security.status));
}

function costLimitExceeded(session) {
  if (session.metadata.costLimitExceeded === true || session.metadata.costThresholdExceeded === true) {
    return true;
  }

  const cost = session.metadata.cost || session.metadata.costDecision || session.metadata.budgetState;
  return isPlainObject(cost) && ["BLOCKED", "EXCEEDED", "LIMIT_EXCEEDED"].includes(stringValue(cost.status));
}

function ambiguityDetected(session) {
  return session.metadata.ambiguityDetected === true || session.metadata.ambiguousTask === true;
}

function normalizeStringArray(values, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`Continue engine ${fieldName} must be an array.`);
  }

  return values.map((value) => requiredString(value, `Continue engine ${fieldName} entry is required.`));
}

function normalizeErrors(errors) {
  if (!Array.isArray(errors)) {
    throw new Error("Continue engine errors must be an array.");
  }

  return errors.map((error) => {
    if (typeof error === "string") {
      return {
        message: requiredString(error, "Continue engine error message is required."),
        name: "Error",
      };
    }

    if (!isPlainObject(error)) {
      throw new Error("Continue engine error must be a string or object.");
    }

    return {
      ...error,
      message: requiredString(error.message, "Continue engine error message is required."),
      name: typeof error.name === "string" && error.name.trim() !== "" ? error.name.trim() : "Error",
    };
  });
}

function normalizeMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error("Continue engine metadata must be an object.");
  }

  return clonePlainObject(metadata);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function stringValue(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CONTINUE_STOP_REASONS,
  ContinueEngine,
};
