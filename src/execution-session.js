const { EventEmitter } = require("node:events");

const EXECUTION_STATES = Object.freeze({
  IDLE: "IDLE",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  VALIDATING: "VALIDATING",
  REPAIRING: "REPAIRING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  RESTORED: "RESTORED",
  CANCELLED: "CANCELLED",
});

const EXECUTION_PROGRESS_EVENT_TYPES = Object.freeze({
  STATE_CHANGED: "STATE_CHANGED",
  CONTINUE: "continue",
  PAUSED: "paused",
  COMPLETED: "completed",
});

const EXECUTION_PROGRESS_EVENTS = Object.freeze({
  PROGRESS: "progress",
});

const TERMINAL_TRANSITIONS = new Set([
  EXECUTION_STATES.FAILED,
  EXECUTION_STATES.CANCELLED,
]);

const VALID_TRANSITIONS = freezeTransitionMap({
  [EXECUTION_STATES.IDLE]: [
    EXECUTION_STATES.PLANNING,
  ],
  [EXECUTION_STATES.PLANNING]: [
    EXECUTION_STATES.WAITING_FOR_APPROVAL,
    EXECUTION_STATES.EXECUTING,
  ],
  [EXECUTION_STATES.WAITING_FOR_APPROVAL]: [
    EXECUTION_STATES.EXECUTING,
  ],
  [EXECUTION_STATES.EXECUTING]: [
    EXECUTION_STATES.VALIDATING,
    EXECUTION_STATES.WAITING_FOR_APPROVAL,
  ],
  [EXECUTION_STATES.VALIDATING]: [
    EXECUTION_STATES.EXECUTING,
    EXECUTION_STATES.REPAIRING,
    EXECUTION_STATES.COMPLETED,
  ],
  [EXECUTION_STATES.REPAIRING]: [
    EXECUTION_STATES.VALIDATING,
    EXECUTION_STATES.RESTORED,
  ],
  [EXECUTION_STATES.COMPLETED]: [],
  [EXECUTION_STATES.FAILED]: [],
  [EXECUTION_STATES.RESTORED]: [],
  [EXECUTION_STATES.CANCELLED]: [],
});

class ExecutionSession extends EventEmitter {
  constructor(input) {
    super();
    validateSessionInput(input);

    this.sessionId = requiredString(input.sessionId, "Execution session sessionId is required.");
    this.objective = requiredString(input.objective, "Execution session objective is required.");
    this.currentState = normalizeState(input.currentState || EXECUTION_STATES.IDLE, "currentState");
    this.startedAt = normalizeTimestamp(input.startedAt || nowIso(input.now), "startedAt");
    this.updatedAt = normalizeTimestamp(input.updatedAt || this.startedAt, "updatedAt");
    this.completedSteps = normalizeStringArray(input.completedSteps || [], "completedSteps");
    this.remainingSteps = normalizeStringArray(input.remainingSteps || [], "remainingSteps");
    this.approvalRequired = input.approvalRequired === true;
    this.errors = normalizeErrors(input.errors || []);
    this.metadata = normalizeMetadata(input.metadata || {});
    this.now = typeof input.now === "function" ? input.now : null;
  }

  transitionTo(nextState, input = {}) {
    const targetState = normalizeState(nextState, "nextState");
    validateTransition(this.currentState, targetState);

    const previousState = this.currentState;
    const timestamp = normalizeTimestamp(input.timestamp || nowIso(this.now), "timestamp");

    this.currentState = targetState;
    this.updatedAt = timestamp;

    if (input.completedStep !== undefined) {
      this.markStepCompleted(input.completedStep);
    }

    if (input.completedSteps !== undefined) {
      this.completedSteps = normalizeStringArray(input.completedSteps, "completedSteps");
    }

    if (input.remainingSteps !== undefined) {
      this.remainingSteps = normalizeStringArray(input.remainingSteps, "remainingSteps");
    }

    if (input.approvalRequired !== undefined) {
      this.approvalRequired = input.approvalRequired === true;
    } else {
      this.approvalRequired = targetState === EXECUTION_STATES.WAITING_FOR_APPROVAL;
    }

    if (input.error !== undefined) {
      this.errors.push(normalizeError(input.error));
    }

    if (input.errors !== undefined) {
      this.errors = normalizeErrors(input.errors);
    }

    if (input.metadata !== undefined) {
      this.metadata = {
        ...this.metadata,
        ...normalizeMetadata(input.metadata),
      };
    }

    const event = this.createStateChangedEvent(previousState, targetState, timestamp);
    this.emit(EXECUTION_PROGRESS_EVENTS.PROGRESS, event);
    return event;
  }

  cancel(reason, input = {}) {
    return this.transitionTo(EXECUTION_STATES.CANCELLED, {
      ...input,
      error: reason,
    });
  }

  fail(error, input = {}) {
    return this.transitionTo(EXECUTION_STATES.FAILED, {
      ...input,
      error,
    });
  }

  emitProgressEvent(type, input = {}) {
    const eventType = normalizeProgressEventType(type);
    const timestamp = normalizeTimestamp(input.timestamp || nowIso(this.now), "timestamp");
    const event = this.createProgressEvent(eventType, timestamp, input);

    this.emit(EXECUTION_PROGRESS_EVENTS.PROGRESS, event);
    return event;
  }

  markStepCompleted(step) {
    const normalizedStep = requiredString(step, "Execution session completed step is required.");

    if (!this.completedSteps.includes(normalizedStep)) {
      this.completedSteps.push(normalizedStep);
    }

    this.remainingSteps = this.remainingSteps.filter((remainingStep) => remainingStep !== normalizedStep);
  }

  snapshot() {
    return {
      sessionId: this.sessionId,
      objective: this.objective,
      currentState: this.currentState,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      completedSteps: [...this.completedSteps],
      remainingSteps: [...this.remainingSteps],
      approvalRequired: this.approvalRequired,
      errors: this.errors.map((error) => ({ ...error })),
      metadata: clonePlainObject(this.metadata),
    };
  }

  createStateChangedEvent(previousState, currentState, timestamp) {
    return {
      type: EXECUTION_PROGRESS_EVENT_TYPES.STATE_CHANGED,
      sessionId: this.sessionId,
      objective: this.objective,
      previousState,
      currentState,
      startedAt: this.startedAt,
      updatedAt: timestamp,
      completedSteps: [...this.completedSteps],
      remainingSteps: [...this.remainingSteps],
      approvalRequired: this.approvalRequired,
      errors: this.errors.map((error) => ({ ...error })),
      metadata: clonePlainObject(this.metadata),
    };
  }

  createProgressEvent(type, timestamp, input) {
    const event = {
      type,
      sessionId: this.sessionId,
      objective: this.objective,
      currentState: this.currentState,
      startedAt: this.startedAt,
      updatedAt: timestamp,
      completedSteps: [...this.completedSteps],
      remainingSteps: [...this.remainingSteps],
      approvalRequired: this.approvalRequired,
      errors: this.errors.map((error) => ({ ...error })),
      metadata: clonePlainObject(this.metadata),
    };

    if (input.stopReason !== undefined) {
      event.stopReason = requiredString(input.stopReason, "Execution session stopReason is required.");
    }

    if (input.shouldContinue !== undefined) {
      event.shouldContinue = input.shouldContinue === true;
    }

    return event;
  }
}

function canTransition(fromState, toState) {
  const sourceState = normalizeState(fromState, "fromState");
  const targetState = normalizeState(toState, "toState");

  if (sourceState === targetState) {
    return false;
  }

  if (TERMINAL_TRANSITIONS.has(targetState)) {
    return true;
  }

  return VALID_TRANSITIONS[sourceState].includes(targetState);
}

function validateTransition(fromState, toState) {
  if (!canTransition(fromState, toState)) {
    throw new Error(`Invalid execution state transition: ${fromState} -> ${toState}`);
  }
}

function freezeTransitionMap(transitions) {
  const normalized = {};

  for (const state of Object.values(EXECUTION_STATES)) {
    normalized[state] = Object.freeze([...(transitions[state] || [])]);
  }

  return Object.freeze(normalized);
}

function validateSessionInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Execution session input must be an object.");
  }
}

function normalizeState(state, fieldName) {
  if (!Object.values(EXECUTION_STATES).includes(state)) {
    throw new Error(`Execution session ${fieldName} is invalid.`);
  }

  return state;
}

function normalizeProgressEventType(type) {
  if (!Object.values(EXECUTION_PROGRESS_EVENT_TYPES).includes(type)) {
    throw new Error("Execution session progress event type is invalid.");
  }

  return type;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = requiredString(value, `Execution session ${fieldName} is required.`);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Execution session ${fieldName} must be an ISO timestamp.`);
  }

  return timestamp;
}

function nowIso(now) {
  const value = typeof now === "function" ? now() : new Date().toISOString();
  return typeof value === "string" ? value : new Date(value).toISOString();
}

function normalizeStringArray(values, fieldName) {
  if (!Array.isArray(values)) {
    throw new Error(`Execution session ${fieldName} must be an array.`);
  }

  return values.map((value) => requiredString(value, `Execution session ${fieldName} entry is required.`));
}

function normalizeErrors(errors) {
  if (!Array.isArray(errors)) {
    throw new Error("Execution session errors must be an array.");
  }

  return errors.map(normalizeError);
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      message: requiredString(error.message, "Execution session error message is required."),
      name: error.name || "Error",
    };
  }

  if (typeof error === "string") {
    return {
      message: requiredString(error, "Execution session error message is required."),
      name: "Error",
    };
  }

  if (isPlainObject(error)) {
    return {
      ...error,
      message: requiredString(error.message, "Execution session error message is required."),
      name: typeof error.name === "string" && error.name.trim() !== "" ? error.name.trim() : "Error",
    };
  }

  throw new Error("Execution session error must be a string, Error, or object.");
}

function normalizeMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error("Execution session metadata must be an object.");
  }

  return clonePlainObject(metadata);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
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
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
  VALID_TRANSITIONS,
  ExecutionSession,
  canTransition,
  validateTransition,
};
