const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CONTINUE_STOP_REASONS,
} = require("../src/continue-engine");
const {
  EXECUTION_ENGINE_EVENTS,
  EXECUTION_ENGINE_EVENT_TYPES,
  ExecutionEngine,
} = require("../src/execution-engine");
const {
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
  ExecutionSession,
} = require("../src/execution-session");

const BASE_TIME = "2026-07-17T00:00:00.000Z";
const BASE_MS = Date.parse(BASE_TIME);

test("completes a session after successful execution and validation", async () => {
  const session = createSession({
    remainingSteps: ["task-1"],
  });
  const lifecycleEvents = [];
  const progressEvents = [];
  const engine = createEngine({
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));
  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => progressEvents.push(event.type));

  const result = await engine.run(session);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE);
  assert.equal(result.iterations, 1);
  assert.equal(result.session.currentState, EXECUTION_STATES.COMPLETED);
  assert.deepEqual(lifecycleEvents, [
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED,
  ]);
  assert.equal(progressEvents.includes(EXECUTION_PROGRESS_EVENT_TYPES.COMPLETED), true);
});

test("continues automatically while ContinueEngine allows it", async () => {
  const session = createSession({
    remainingSteps: ["task-1", "task-2"],
  });
  const progressEvents = [];
  const engine = createEngine({
    executeNextTask: ({ iteration }) => ({
      completedStep: `task-${iteration}`,
      remainingSteps: iteration === 1 ? ["task-2"] : [],
    }),
    validateResults: ({ iteration }) => ({
      validationPassed: true,
      objectiveComplete: iteration === 2,
    }),
  });

  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => progressEvents.push(event.type));

  const result = await engine.run(session);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.iterations, 2);
  assert.deepEqual(result.session.completedSteps, ["task-1", "task-2"]);
  assert.deepEqual(
    progressEvents.filter((type) => type === EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE),
    [EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE],
  );
});

test("stops gracefully when maxIterations prevents another loop", async () => {
  const engine = createEngine({
    limits: {
      maxIterations: 1,
    },
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: false,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_ITERATIONS);
  assert.equal(result.iterations, 1);
});

test("stops gracefully when maxRuntimeMs is exceeded", async () => {
  let currentMs = BASE_MS;
  const engine = createEngine({
    limits: {
      maxRuntimeMs: 10,
    },
    now: () => currentMs,
    executeNextTask: () => {
      currentMs = BASE_MS + 5;
      return {
        completedStep: "task-1",
        remainingSteps: ["task-2"],
      };
    },
    validateResults: () => {
      currentMs = BASE_MS + 11;
      return {
        validationPassed: true,
        objectiveComplete: false,
      };
    },
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_RUNTIME);
  assert.equal(result.runtimeMs, 11);
});

test("stops gracefully when maxRepairs is exceeded", async () => {
  const engine = createEngine({
    limits: {
      maxRepairs: 0,
    },
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      repairRequired: true,
      objectiveComplete: false,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_REPAIRS);
  assert.equal(result.repairs, 1);
  assert.equal(result.session.currentState, EXECUTION_STATES.REPAIRING);
});

test("stops immediately when ContinueEngine returns false", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: false,
      approvalRequired: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.APPROVAL_REQUIRED);
  assert.equal(result.iterations, 1);
  assert.deepEqual(lifecycleEvents.slice(-2), [
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_PAUSED,
  ]);
});

test("handles execution errors as graceful execution_failed stops", async () => {
  const engine = createEngine({
    executeNextTask: () => {
      throw new Error("executor failed");
    },
    validateResults: () => ({
      validationPassed: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.EXECUTION_FAILED);
  assert.equal(result.error, "executor failed");
  assert.equal(result.session.currentState, EXECUTION_STATES.FAILED);
});

test("emits lifecycle events in deterministic order across a continue loop", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    executeNextTask: ({ iteration }) => ({
      completedStep: `task-${iteration}`,
      remainingSteps: iteration === 1 ? ["task-2"] : [],
    }),
    validateResults: ({ iteration }) => ({
      validationPassed: true,
      objectiveComplete: iteration === 2,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.deepEqual(lifecycleEvents, [
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED,
  ]);
});

function createEngine(options) {
  return new ExecutionEngine({
    now: options.now || (() => BASE_MS),
    limits: {
      maxIterations: 5,
      maxRuntimeMs: 1000,
      maxRepairs: 2,
      ...(options.limits || {}),
    },
    executeNextTask: options.executeNextTask,
    validateResults: options.validateResults,
    continueEngine: options.continueEngine,
  });
}

function createSession(input = {}) {
  return new ExecutionSession({
    sessionId: "session-1",
    objective: "Implement bounded execution.",
    currentState: EXECUTION_STATES.IDLE,
    startedAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...input,
  });
}
