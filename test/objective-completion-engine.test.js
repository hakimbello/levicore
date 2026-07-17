const assert = require("node:assert/strict");
const test = require("node:test");
const {
  COMPLETION_RESULTS,
  ObjectiveCompletionEngine,
} = require("../src/objective-completion-engine");

const BASE_TIME = "2026-07-17T00:00:00.000Z";

test("evaluates a fully completed objective", () => {
  const engine = createEngine();
  const result = engine.evaluate(createSession());

  assert.equal(result.result, COMPLETION_RESULTS.COMPLETE);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.findings, []);
  assert.equal(result.timestamp, BASE_TIME);
});

test("reports failed validation as incomplete even with no remaining steps", () => {
  const engine = createEngine();
  const result = engine.evaluate(createSession({
    metadata: {
      validationPassed: false,
    },
  }));

  assert.equal(result.result, COMPLETION_RESULTS.INCOMPLETE);
  assert.equal(result.findings.some((finding) => finding.code === "VALIDATION_NOT_PASSED"), true);
});

test("reports unresolved repair attempts as blocked", () => {
  const engine = createEngine();
  const result = engine.evaluate(createSession({
    metadata: {
      validationPassed: true,
      repairHistory: [{
        result: "REPAIR_FAILED",
      }],
    },
  }));

  assert.equal(result.result, COMPLETION_RESULTS.BLOCKED);
  assert.equal(result.findings.some((finding) => finding.code === "UNRESOLVED_REPAIR"), true);
});

test("reports pending approval requests as review-required", () => {
  const engine = createEngine();
  const result = engine.evaluate(createSession({
    metadata: {
      validationPassed: true,
      approvalRequest: {
        id: "approval-1",
        action: {
          action: "completion_review",
        },
      },
    },
  }));

  assert.equal(result.result, COMPLETION_RESULTS.REQUIRES_REVIEW);
  assert.equal(result.findings.some((finding) => finding.code === "PENDING_APPROVAL"), true);
});

test("reports high or critical security findings", () => {
  const engine = createEngine();
  const result = engine.evaluate(createSession({
    metadata: {
      validationPassed: true,
      securityFindings: [{
        id: "security-1",
        ruleId: "secret",
        title: "Secret exposed",
        severity: "CRITICAL",
        status: "BLOCKED",
        evidence: {},
      }],
    },
  }));

  assert.equal(result.result, COMPLETION_RESULTS.BLOCKED);
  assert.equal(result.findings.some((finding) => finding.code === "UNRESOLVED_SECURITY_FINDING"), true);
});

test("supports custom completion rules", () => {
  const engine = createEngine({
    rules: [() => ({
      code: "DOCS_MISSING",
      title: "Documentation missing",
      description: "Documentation must be updated.",
      status: COMPLETION_RESULTS.INCOMPLETE,
      metadata: {
        file: "README.md",
      },
    })],
  });
  const result = engine.evaluate(createSession());

  assert.equal(result.result, COMPLETION_RESULTS.INCOMPLETE);
  assert.equal(result.findings[0].code, "DOCS_MISSING");
  assert.equal(engine.isComplete(createSession()), false);
  assert.deepEqual(engine.getIncompleteReasons(createSession()), ["Documentation must be updated."]);
});

function createEngine(options = {}) {
  return new ObjectiveCompletionEngine({
    now: () => BASE_TIME,
    ...options,
  });
}

function createSession(input = {}) {
  return {
    sessionId: "session-1",
    objective: "Implement objective completion.",
    currentState: "VALIDATING",
    completedSteps: ["task-1"],
    remainingSteps: [],
    approvalRequired: false,
    errors: [],
    metadata: {
      validationPassed: true,
    },
    ...input,
  };
}
