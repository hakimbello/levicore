const assert = require("node:assert/strict");
const test = require("node:test");

const { renderCopilotHtml } = require("../src/product-experience/copilot-view-provider");
const { presentApprovalCard } = require("../src/product-experience/approval-card-presentation");
const { presentChangeReview } = require("../src/product-experience/change-review-presentation");
const { presentGitState } = require("../src/product-experience/git-presentation");
const { presentOnboarding } = require("../src/product-experience/onboarding-controller");
const { presentTeam, presentTimeline } = require("../src/product-experience/timeline-presentation");
const { mapProductStage, normalizeProductExperienceState } = require("../src/product-experience/product-experience-state");
const { sanitizeProductValue, validateCopilotMessage } = require("../src/product-experience/product-experience-serializer");

test("normalizes product state into plain-language stages and bounded summaries", () => {
  const state = normalizeProductExperienceState({
    runtimeState: "READY",
    workspace: { id: "ws", name: "Workspace", uri: "file:/workspace" },
    operations: [{ id: "op", state: "WAITING_FOR_APPROVAL", type: "APPLY_CHANGE" }],
    approvals: [{ id: "approval", status: "PENDING", requestedAction: "Apply change", risks: ["source change"] }],
    changes: { activeProposal: { id: "proposal", title: "Update app", fileChanges: [{ path: "src/app.js", operation: "UPDATE", additions: 1 }] } },
    modelProviders: [{ id: "local", name: "Local", local: true }],
    models: [{ id: "local:chat", name: "chat", providerId: "local", local: true }],
  }, { configuration: { defaultMode: "Build" } });

  assert.equal(state.mode, "Build");
  assert.equal(state.stage, "Waiting for Approval");
  assert.equal(state.status, "1 approval waiting");
  assert.equal(state.workspace.name, "Workspace");
  assert.equal(state.model.selected.id, "local:chat");
  assert.equal(state.activeApproval.runtimeConfirmationRequired, true);
  assert.equal(state.changes.files[0].path, "src/app.js");
});

test("maps internal states without exposing raw state-machine names by default", () => {
  assert.equal(mapProductStage({ activeOperation: { state: "RUNNING" } }), "Gathering Context");
  assert.equal(mapProductStage({ activeOperation: { state: "WAITING_FOR_APPROVAL" } }), "Waiting for Approval");
  assert.equal(mapProductStage({ activeWorkflow: { state: "FAILED" } }), "Needs Attention");
  assert.equal(mapProductStage({ activeTurn: { state: "CANCELLED" } }), "Cancelled");
});

test("sanitizes product state and validates allowlisted Copilot messages", () => {
  const sanitized = sanitizeProductValue({
    token: "sk-thisshouldnotappear",
    stack: "unsafe",
    nested: { authorization: "Bearer hidden", ok: "<b>data</b>" },
  });

  assert.equal(sanitized.token, "[REDACTED]");
  assert.equal(sanitized.stack, "[REDACTED]");
  assert.equal(sanitized.nested.authorization, "[REDACTED]");
  assert.equal(sanitized.nested.ok, "<b>data</b>");
  assert.equal(validateCopilotMessage({ command: "submit", content: "hello", mode: "Ask" }).valid, true);
  assert.equal(validateCopilotMessage({ command: "workbench.action.terminal.sendSequence" }).valid, false);
});

test("renders approval cards without granting approval", () => {
  const card = presentApprovalCard({ id: "a1", status: "PENDING", requestedAction: "Run validation", scope: { commandId: "validation.run" }, risks: ["command"] }, {});

  assert.equal(card.status, "PENDING");
  assert.equal(card.exactScope, "validation.run");
  assert.equal(card.runtimeConfirmationRequired, true);
  assert.ok(card.actions.includes("Approve"));
});

test("presents changes, workflow timeline, and multi-agent work compactly", () => {
  const state = {
    changes: { activeProposal: { id: "p1", title: "Patch", state: "READY_FOR_REVIEW", fileChanges: [{ path: "src/a.js", additions: 2, deletions: 1 }] }, lastValidation: { status: "PASSED" } },
    workflows: { activeWorkflow: { id: "w1", title: "Build", state: "RUNNING", progress: { percentage: 50 } }, steps: [{ title: "Validate", state: "VALIDATING", evidence: ["e1"] }] },
    multiAgent: { activeTeam: { id: "t1", state: "ACTIVE" }, assignments: [{ role: "security_reviewer", state: "RUNNING", objective: "Review risk", findings: [{}] }] },
  };

  assert.equal(presentChangeReview(state).validationResult, "PASSED");
  assert.equal(presentTimeline(state).stages.some((stage) => stage.state === "Active"), true);
  assert.equal(presentTeam(state).agreementIsApproval, false);
});

test("presents Git and onboarding truthfully when capabilities are unavailable", () => {
  const git = presentGitState({});
  const onboarding = presentOnboarding({ models: [], modelProviders: [] }, { autoOpenOnFirstRun: true });

  assert.equal(git.available, false);
  assert.equal(git.commitReadiness, "Unavailable: no safe Git adapter status");
  assert.equal(git.pushReadiness, "Unavailable until explicit approved push support exists");
  assert.equal(git.forcePush, "Unavailable");
  assert.equal(onboarding.shouldShow, true);
  assert.equal(onboarding.noCloudRequired, true);
});

test("renders secure accessible Copilot webview HTML", () => {
  const html = renderCopilotHtml({ mode: "Ask", stage: "Understanding" }, { nonce: "abc123" });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc123'/);
  assert.match(html, /aria-label="Send message to Levi"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.equal(html.includes("http://"), false);
});
