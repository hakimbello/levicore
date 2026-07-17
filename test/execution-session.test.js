const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
  ExecutionSession,
  canTransition,
  validateTransition,
} = require("../src/execution-session");

const BASE_TIME = "2026-07-17T00:00:00.000Z";

test("allows valid execution transitions", () => {
  assert.equal(canTransition(EXECUTION_STATES.IDLE, EXECUTION_STATES.PLANNING), true);
  assert.equal(canTransition(EXECUTION_STATES.PLANNING, EXECUTION_STATES.EXECUTING), true);
  assert.equal(canTransition(EXECUTION_STATES.PLANNING, EXECUTION_STATES.WAITING_FOR_APPROVAL), true);
  assert.equal(canTransition(EXECUTION_STATES.WAITING_FOR_APPROVAL, EXECUTION_STATES.EXECUTING), true);
  assert.equal(canTransition(EXECUTION_STATES.EXECUTING, EXECUTION_STATES.VALIDATING), true);
  assert.equal(canTransition(EXECUTION_STATES.VALIDATING, EXECUTION_STATES.EXECUTING), true);
  assert.equal(canTransition(EXECUTION_STATES.VALIDATING, EXECUTION_STATES.REPAIRING), true);
  assert.equal(canTransition(EXECUTION_STATES.REPAIRING, EXECUTION_STATES.VALIDATING), true);
  assert.equal(canTransition(EXECUTION_STATES.VALIDATING, EXECUTION_STATES.COMPLETED), true);
});

test("rejects invalid execution transitions", () => {
  assert.equal(canTransition(EXECUTION_STATES.IDLE, EXECUTION_STATES.EXECUTING), false);
  assert.equal(canTransition(EXECUTION_STATES.EXECUTING, EXECUTION_STATES.COMPLETED), false);
  assert.equal(canTransition(EXECUTION_STATES.COMPLETED, EXECUTION_STATES.RESTORED), false);
  assert.throws(
    () => validateTransition(EXECUTION_STATES.IDLE, EXECUTION_STATES.COMPLETED),
    /Invalid execution state transition: IDLE -> COMPLETED/,
  );
});

test("emits strongly typed progress events when state changes", () => {
  const session = createSession({
    remainingSteps: ["plan", "execute"],
  });
  const events = [];
  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => events.push(event));

  const event = session.transitionTo(EXECUTION_STATES.PLANNING, {
    completedStep: "plan",
    metadata: {
      phase: "planning",
    },
    timestamp: "2026-07-17T00:01:00.000Z",
  });

  assert.equal(event.type, EXECUTION_PROGRESS_EVENT_TYPES.STATE_CHANGED);
  assert.equal(event.sessionId, "session-1");
  assert.equal(event.previousState, EXECUTION_STATES.IDLE);
  assert.equal(event.currentState, EXECUTION_STATES.PLANNING);
  assert.deepEqual(event.completedSteps, ["plan"]);
  assert.deepEqual(event.remainingSteps, ["execute"]);
  assert.deepEqual(event.metadata, { phase: "planning" });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], event);
});

test("supports cancellation from any state", () => {
  const session = createSession();
  session.transitionTo(EXECUTION_STATES.PLANNING, {
    timestamp: "2026-07-17T00:01:00.000Z",
  });

  const event = session.cancel("User cancelled execution.", {
    timestamp: "2026-07-17T00:02:00.000Z",
  });

  assert.equal(session.currentState, EXECUTION_STATES.CANCELLED);
  assert.equal(event.currentState, EXECUTION_STATES.CANCELLED);
  assert.deepEqual(session.errors, [
    {
      message: "User cancelled execution.",
      name: "Error",
    },
  ]);
});

test("supports restore from repairing", () => {
  const session = createSession({
    currentState: EXECUTION_STATES.REPAIRING,
  });

  const event = session.transitionTo(EXECUTION_STATES.RESTORED, {
    timestamp: "2026-07-17T00:03:00.000Z",
  });

  assert.equal(event.previousState, EXECUTION_STATES.REPAIRING);
  assert.equal(event.currentState, EXECUTION_STATES.RESTORED);
  assert.equal(session.currentState, EXECUTION_STATES.RESTORED);
});

test("supports repair loop back into validation", () => {
  const session = createSession({
    currentState: EXECUTION_STATES.VALIDATING,
  });

  session.transitionTo(EXECUTION_STATES.REPAIRING, {
    timestamp: "2026-07-17T00:04:00.000Z",
  });
  session.transitionTo(EXECUTION_STATES.VALIDATING, {
    completedStep: "repair validation failure",
    timestamp: "2026-07-17T00:05:00.000Z",
  });

  assert.equal(session.currentState, EXECUTION_STATES.VALIDATING);
  assert.deepEqual(session.completedSteps, ["repair validation failure"]);
});

test("supports completion after validation", () => {
  const session = createSession({
    currentState: EXECUTION_STATES.VALIDATING,
    remainingSteps: ["complete"],
  });

  const event = session.transitionTo(EXECUTION_STATES.COMPLETED, {
    completedStep: "complete",
    timestamp: "2026-07-17T00:06:00.000Z",
  });

  assert.equal(session.currentState, EXECUTION_STATES.COMPLETED);
  assert.equal(event.currentState, EXECUTION_STATES.COMPLETED);
  assert.deepEqual(session.completedSteps, ["complete"]);
  assert.deepEqual(session.remainingSteps, []);
});

function createSession(input = {}) {
  return new ExecutionSession({
    sessionId: "session-1",
    objective: "Implement autonomous execution.",
    startedAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...input,
  });
}
