const assert = require("node:assert/strict");
const test = require("node:test");
const {
  REPAIR_RESULTS,
  RepairEngine,
} = require("../src/repair-engine");

test("reports whether a context can be repaired", () => {
  const engine = new RepairEngine({
    canRepair: (context) => context.metadata.kind === "syntax",
  });

  assert.equal(engine.canRepair(createContext({
    metadata: {
      kind: "syntax",
    },
  })), true);
  assert.equal(engine.canRepair(createContext({
    metadata: {
      kind: "security",
    },
  })), false);
});

test("creates repair plans through an injected callback", () => {
  const engine = new RepairEngine({
    canRepair: () => true,
    createRepairPlan: (context) => ({
      action: `repair ${context.failureDetails.summary}`,
      metadata: {
        attempt: context.currentRepairCount + 1,
      },
    }),
  });

  assert.deepEqual(engine.createRepairPlan(createContext()), {
    action: "repair Syntax check failed.",
    metadata: {
      attempt: 1,
    },
  });
});

test("normalizes repair callback results", async () => {
  const engine = new RepairEngine({
    canRepair: () => true,
    repair: () => ({
      result: REPAIR_RESULTS.RETRY_VALIDATION,
      action: "patched semicolon",
      metadata: {
        file: "src/app.js",
      },
    }),
  });

  assert.deepEqual(await engine.repair(createContext()), {
    result: REPAIR_RESULTS.RETRY_VALIDATION,
    action: "patched semicolon",
    metadata: {
      file: "src/app.js",
    },
    failureSummary: undefined,
  });
});

function createContext(input = {}) {
  return {
    session: {
      sessionId: "session-1",
    },
    validationResult: {
      validationPassed: false,
    },
    failureDetails: {
      summary: "Syntax check failed.",
    },
    failedTask: {
      id: "task-1",
    },
    currentRepairCount: 0,
    metadata: {},
    ...input,
  };
}
