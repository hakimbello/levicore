const assert = require("node:assert/strict");
const test = require("node:test");
const {
  APPROVAL_ACTIONS,
  APPROVAL_DECISIONS,
  APPROVAL_GATEWAY_EVENTS,
  APPROVAL_POLICIES,
  APPROVAL_RISK_LEVELS,
  ApprovalGateway,
} = require("../src/approval-gateway");

const BASE_TIME = "2026-07-17T00:00:00.000Z";

test("approves safe actions under SAFE_ONLY policy", () => {
  const gateway = createGateway({
    policy: APPROVAL_POLICIES.SAFE_ONLY,
  });

  const result = gateway.evaluate({
    action: APPROVAL_ACTIONS.SAFE_FILE_CREATE,
    riskLevel: APPROVAL_RISK_LEVELS.LOW,
    safe: true,
  });

  assert.equal(result.decision, APPROVAL_DECISIONS.APPROVED);
  assert.equal(result.request, null);
});

test("requires approval for destructive actions", () => {
  const gateway = createGateway({
    policy: APPROVAL_POLICIES.DESTRUCTIVE_ONLY,
  });
  const events = [];

  gateway.on(APPROVAL_GATEWAY_EVENTS.REQUEST_CREATED, (request) => events.push(request));

  const result = gateway.evaluate({
    action: APPROVAL_ACTIONS.DELETE_FILE,
    metadata: {
      path: "src/old.js",
    },
  });

  assert.equal(result.decision, APPROVAL_DECISIONS.REQUIRES_APPROVAL);
  assert.equal(result.request.action.action, APPROVAL_ACTIONS.DELETE_FILE);
  assert.equal(result.request.reason, "Approval is required for delete_file.");
  assert.equal(result.request.riskLevel, APPROVAL_RISK_LEVELS.HIGH);
  assert.equal(result.request.timestamp, BASE_TIME);
  assert.deepEqual(result.request.metadata, { path: "src/old.js" });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], result.request);
});

test("supports custom policy decisions", () => {
  const gateway = createGateway({
    policy: APPROVAL_POLICIES.CUSTOM,
    customPolicy: (action) => action.metadata.allow === true
      ? APPROVAL_DECISIONS.APPROVED
      : APPROVAL_DECISIONS.REQUIRES_APPROVAL,
  });

  assert.equal(gateway.evaluate({
    action: APPROVAL_ACTIONS.EXECUTE_SHELL_COMMAND,
    metadata: {
      allow: true,
    },
  }).decision, APPROVAL_DECISIONS.APPROVED);

  assert.equal(gateway.evaluate({
    action: APPROVAL_ACTIONS.NETWORK_OPERATION,
  }).decision, APPROVAL_DECISIONS.REQUIRES_APPROVAL);
});

test("returns DENIED for blocked actions", () => {
  const gateway = createGateway({
    policy: APPROVAL_POLICIES.NEVER,
  });

  const result = gateway.evaluate({
    action: APPROVAL_ACTIONS.INSTALL_PACKAGE,
    blocked: true,
  });

  assert.equal(result.decision, APPROVAL_DECISIONS.DENIED);
  assert.equal(result.request, null);
});

test("records approved request ids for future evaluation", () => {
  const gateway = createGateway({
    policy: APPROVAL_POLICIES.ALWAYS,
  });
  const approvalEvents = [];
  const result = gateway.evaluate({
    action: APPROVAL_ACTIONS.GIT_OPERATION,
  });

  gateway.on(APPROVAL_GATEWAY_EVENTS.REQUEST_APPROVED, (request) => approvalEvents.push(request));
  const approvedRequest = gateway.approveRequest(result.request.id);

  assert.equal(gateway.isApproved(result.request.id), true);
  assert.deepEqual(approvedRequest, result.request);
  assert.deepEqual(approvalEvents, [result.request]);
  assert.equal(gateway.evaluate({
    action: APPROVAL_ACTIONS.GIT_OPERATION,
    approvalRequestId: result.request.id,
  }).decision, APPROVAL_DECISIONS.APPROVED);
});

function createGateway(options = {}) {
  return new ApprovalGateway({
    now: () => BASE_TIME,
    ...options,
  });
}
