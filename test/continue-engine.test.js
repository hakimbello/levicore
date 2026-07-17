const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CONTINUE_STOP_REASONS,
  ContinueEngine,
} = require("../src/continue-engine");
const {
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
  ExecutionSession,
} = require("../src/execution-session");

const BASE_TIME = "2026-07-17T00:00:00.000Z";

test("continues when every continuation guard passes", () => {
  const engine = new ContinueEngine();
  const session = createValidatedSession();
  const sessionEvents = [];
  const engineEvents = [];

  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => sessionEvents.push(event));
  engine.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => engineEvents.push(event));

  assert.equal(engine.shouldContinue(session), true);
  assert.equal(engine.getStopReason(session), null);
  assert.equal(sessionEvents.length, 1);
  assert.equal(engineEvents.length, 1);
  assert.equal(sessionEvents[0].type, EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE);
  assert.equal(engineEvents[0].type, EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE);
  assert.equal(sessionEvents[0].shouldContinue, true);
});

test("stops when objective is complete", () => {
  assertStopReason(
    createValidatedSession({
      currentState: EXECUTION_STATES.COMPLETED,
      remainingSteps: ["unused"],
    }),
    CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE,
    EXECUTION_PROGRESS_EVENT_TYPES.COMPLETED,
  );
});

test("stops when approval is required", () => {
  assertStopReason(
    createValidatedSession({
      approvalRequired: true,
    }),
    CONTINUE_STOP_REASONS.APPROVAL_REQUIRED,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when a security stop is active", () => {
  assertStopReason(
    createValidatedSession({
      metadata: {
        validationPassed: true,
        securityStop: true,
      },
    }),
    CONTINUE_STOP_REASONS.SECURITY_STOP,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when the cost threshold is exceeded", () => {
  assertStopReason(
    createValidatedSession({
      metadata: {
        validationPassed: true,
        costThresholdExceeded: true,
      },
    }),
    CONTINUE_STOP_REASONS.COST_LIMIT,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when ambiguity is detected", () => {
  assertStopReason(
    createValidatedSession({
      metadata: {
        validationPassed: true,
        ambiguityDetected: true,
      },
    }),
    CONTINUE_STOP_REASONS.AMBIGUOUS_TASK,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when the user has cancelled", () => {
  assertStopReason(
    createValidatedSession({
      currentState: EXECUTION_STATES.CANCELLED,
      remainingSteps: ["next"],
    }),
    CONTINUE_STOP_REASONS.USER_CANCELLED,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when validation has not passed", () => {
  assertStopReason(
    createSession({
      currentState: EXECUTION_STATES.VALIDATING,
      remainingSteps: ["next"],
      metadata: {
        validationPassed: false,
      },
    }),
    CONTINUE_STOP_REASONS.EXECUTION_FAILED,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("stops when execution has failed", () => {
  assertStopReason(
    createValidatedSession({
      currentState: EXECUTION_STATES.FAILED,
      remainingSteps: ["next"],
    }),
    CONTINUE_STOP_REASONS.EXECUTION_FAILED,
    EXECUTION_PROGRESS_EVENT_TYPES.PAUSED,
  );
});

test("supports snapshots without requiring a live ExecutionSession", () => {
  const engine = new ContinueEngine();
  const snapshot = createValidatedSession().snapshot();
  const events = [];

  engine.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => events.push(event));

  assert.equal(engine.shouldContinue(snapshot), true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE);
  assert.equal(events[0].sessionId, "session-1");
});

function assertStopReason(session, expectedStopReason, expectedEventType) {
  const engine = new ContinueEngine();
  const events = [];

  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => events.push(event));

  assert.equal(engine.shouldContinue(session), false);
  assert.equal(engine.getStopReason(session), expectedStopReason);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, expectedEventType);
  assert.equal(events[0].shouldContinue, false);
  assert.equal(events[0].stopReason, expectedStopReason);
}

function createValidatedSession(input = {}) {
  return createSession({
    currentState: EXECUTION_STATES.VALIDATING,
    remainingSteps: ["next task"],
    metadata: {
      validationPassed: true,
    },
    ...input,
  });
}

function createSession(input = {}) {
  return new ExecutionSession({
    sessionId: "session-1",
    objective: "Implement autonomous execution.",
    startedAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...input,
  });
}
