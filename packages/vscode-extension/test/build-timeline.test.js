const assert = require("node:assert/strict");
const test = require("node:test");

const { createLeviExtension } = require("../src/levi-extension");
const {
  CHECK_STATUS,
  OVERALL_STATUS,
  STAGE_STATUS,
  blockBuildStage,
  cancelBuildTimeline,
  completeBuildStage,
  completeBuildTimeline,
  createBuildTimeline,
  failBuildStage,
  mapAgentEventToTimeline,
  mapRuntimeEventToTimeline,
  presentBuildTimeline,
  transitionBuildStage,
  updateBuildActivity,
} = require("../src/product-experience/build-timeline-state");
const { renderCopilotHtml } = require("../src/product-experience/copilot-view-provider");
const { validateCopilotMessage } = require("../src/product-experience/product-experience-serializer");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const baseConfig = {
  "levi.autoInitialize": true,
  "levi.autoAnalyzeWorkspace": false,
  "levi.experience.autoOpenOnFirstRun": false,
  "levi.ui.showNotifications": false,
  "levi.models.enabled": true,
  "levi.ollama.enabled": true,
  "levi.openAICompatible.enabled": false,
  "levi.diagnostics.enabled": false,
};

function createReadyRuntime() {
  return {
    calls: [],
    initialize: () => Promise.resolve({ success: true, status: "SUCCEEDED", data: { state: "READY" } }),
    getState: () => ({ state: "READY" }),
    getRuntimeHealth: () => ({ runtimeState: "READY", overallRuntimeHealth: 100, blockers: [], warnings: [] }),
    executeCommand(commandId) {
      this.calls.push(commandId);
      if (commandId === "model.health") {
        return Promise.resolve({
          success: true,
          data: {
            summary: { availableModels: 1, defaultModelId: "local:chat" },
            providers: [{ id: "ollama-local", state: "AVAILABLE" }],
            models: [{ id: "local:chat", name: "chat", providerId: "ollama-local" }],
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    },
    listOperations: () => [],
    agentEngine: () => ({
      subscribe: () => "agent-sub",
      unsubscribe: () => {},
      sendMessage: () => Promise.resolve({ success: true }),
      cancelTurn: () => Promise.resolve({ success: true }),
      retryTurn: () => Promise.resolve({ success: true }),
      createConversation: () => ({ id: "conv-1" }),
    }),
    subscribe: () => "sub-1",
    unsubscribe: () => {},
    save: () => {},
    shutdown: () => Promise.resolve(),
  };
}

async function createReadyExtension() {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: baseConfig,
    files: { "file:/workspace/src/app.js": "console.log('stay');\n" },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();
  await extension.refreshHomeConnectionState({ connectionChecked: true });
  extension.presentationCache.selectedModel = { id: "local:chat", name: "chat" };
  return { extension, runtime, vscode };
}

function advanceTimeline(timeline) {
  let current = timeline;
  const steps = [
    { fn: mapAgentEventToTimeline, event: { type: "turn_created", payload: { turnId: "turn-1", conversationId: "conv-1" }, timestamp: "2026-07-21T10:00:00.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_classified", payload: { turnId: "turn-1" }, timestamp: "2026-07-21T10:00:05.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_context_started", payload: { turnId: "turn-1" }, timestamp: "2026-07-21T10:00:10.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_context_completed", payload: { turnId: "turn-1" }, timestamp: "2026-07-21T10:00:20.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_planning_started", payload: { turnId: "turn-1" }, timestamp: "2026-07-21T10:00:25.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_planning_completed", payload: { turnId: "turn-1", planId: "plan-1" }, timestamp: "2026-07-21T10:00:40.000Z" } },
    { fn: mapAgentEventToTimeline, event: { type: "turn_model_request_started", payload: { turnId: "turn-1" }, timestamp: "2026-07-21T10:00:45.000Z" } },
  ];
  for (const step of steps) {
    const result = step.fn(current, step.event);
    assert.equal(result.applied, true, `${step.event.type} should apply`);
    current = result.timeline;
  }
  return current;
}

test("timeline initializes with all stages pending", () => {
  const timeline = createBuildTimeline();
  assert.equal(timeline.overallStatus, OVERALL_STATUS.PENDING);
  assert.ok(timeline.stages.every((stage) => stage.status === STAGE_STATUS.PENDING));
});

test("valid stage transitions succeed", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  const active = transitionBuildStage(timeline, "requirements", STAGE_STATUS.ACTIVE, { currentTask: "Reviewing request" });
  assert.equal(active.applied, true);
  timeline = active.timeline;
  const complete = completeBuildStage(timeline, "requirements", { completionEvidence: "Request captured" });
  assert.equal(complete.applied, true);
  assert.equal(complete.timeline.stages.find((stage) => stage.id === "requirements").status, STAGE_STATUS.COMPLETE);
});

test("invalid backward transitions are rejected", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  timeline = completeBuildStage(transitionBuildStage(timeline, "requirements", STAGE_STATUS.ACTIVE).timeline, "requirements").timeline;
  const rejected = transitionBuildStage(timeline, "requirements", STAGE_STATUS.PENDING);
  assert.equal(rejected.applied, false);
});

test("unknown runtime events do not alter state", () => {
  const timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", operationId: "op-1" });
  const result = mapRuntimeEventToTimeline(timeline, { type: "runtime_created", operationId: "op-1" });
  assert.equal(result.applied, false);
  assert.equal(JSON.stringify(timeline), JSON.stringify(createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", operationId: "op-1", buildId: timeline.buildId })));
});

test("runtime and agent events map to the correct stages", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", operationId: "op-1" });
  timeline = mapRuntimeEventToTimeline(timeline, {
    type: "workspace_analysis_started",
    operationId: "op-1",
    timestamp: "2026-07-21T10:00:01.000Z",
  }).timeline;
  assert.equal(timeline.currentStageId, "architecture");
  timeline = advanceTimeline(timeline);
  assert.equal(timeline.currentStageId, "implementation");
  timeline = mapAgentEventToTimeline(timeline, { type: "tool_call_waiting_for_approval", payload: { reason: "Approval required" } }).timeline;
  assert.equal(timeline.currentStageId, "review");
  timeline = mapAgentEventToTimeline(timeline, { type: "turn_validation_started", payload: { name: "syntax" } }).timeline;
  assert.equal(timeline.currentStageId, "testing");
});

test("no percentage appears without measurable evidence", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", operationId: "op-1" });
  timeline = transitionBuildStage(timeline, "implementation", STAGE_STATUS.ACTIVE, { currentTask: "Implementation in progress" }).timeline;
  let presented = presentBuildTimeline(timeline, { nowMs: Date.parse("2026-07-21T10:01:00.000Z") });
  assert.equal(presented.showProgressPercentage, false);
  timeline = mapRuntimeEventToTimeline(timeline, {
    type: "operation_progress",
    operationId: "op-1",
    payload: { progress: { percentage: 42 }, stage: "Applying changes" },
  }).timeline;
  presented = presentBuildTimeline(timeline, { nowMs: Date.parse("2026-07-21T10:01:30.000Z") });
  assert.equal(presented.showProgressPercentage, true);
  assert.equal(presented.progressPercentage, 42);
});

test("blocked stages require and display a reason", () => {
  const timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  const missing = blockBuildStage(timeline, "review", "");
  assert.equal(missing.applied, false);
  const blocked = blockBuildStage(timeline, "review", "Waiting for approval");
  assert.equal(blocked.applied, true);
  const presented = presentBuildTimeline(blocked.timeline);
  const review = presented.stages.find((stage) => stage.id === "review");
  assert.equal(review.status, STAGE_STATUS.BLOCKED);
  assert.match(review.blockerReason, /approval/i);
});

test("failed stages require and display a reason", () => {
  const timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  const missing = failBuildStage(timeline, "implementation", "");
  assert.equal(missing.applied, false);
  const failed = failBuildStage(timeline, "implementation", "Tool call failed");
  assert.equal(failed.applied, true);
  const presented = presentBuildTimeline(failed.timeline);
  const stage = presented.stages.find((entry) => entry.id === "implementation");
  assert.equal(stage.failureReason, "Tool call failed");
  assert.equal(presented.overallStatus, OVERALL_STATUS.FAILED);
});

test("cancellation is not displayed as completion", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  timeline = transitionBuildStage(timeline, "implementation", STAGE_STATUS.ACTIVE).timeline;
  timeline = cancelBuildTimeline(timeline, "User cancelled").timeline;
  const presented = presentBuildTimeline(timeline);
  assert.equal(presented.overallStatus, OVERALL_STATUS.CANCELLED);
  assert.notEqual(presented.statusLabel, "Complete");
  assert.match(presented.completionSummary.finalStatus, /Cancelled/i);
});

test("completion summary uses only grounded evidence", () => {
  let timeline = advanceTimeline(createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" }));
  timeline = completeBuildTimeline(timeline, {
    finalStatus: "Complete",
    filesCreated: 2,
    filesModified: 1,
    checksPassed: 1,
  }, { timestamp: "2026-07-21T10:05:00.000Z" }).timeline;
  const presented = presentBuildTimeline(timeline);
  assert.equal(presented.completionSummary.filesCreated, 2);
  assert.equal(presented.completionSummary.filesModified, 1);
  assert.equal(presented.completionSummary.filesDeleted, null);
});

test("unknown values are not converted to zero", () => {
  const timeline = completeBuildTimeline(createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" }), {
    finalStatus: "Complete",
  }).timeline;
  const presented = presentBuildTimeline(timeline);
  assert.equal(presented.completionSummary.filesCreated, null);
  assert.equal(presented.completionSummary.checksFailed, null);
});

test("events from another operation ID are ignored", () => {
  const timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", operationId: "op-1" });
  const result = mapRuntimeEventToTimeline(timeline, { type: "operation_progress", operationId: "op-2", payload: { stage: "Other build" } });
  assert.equal(result.applied, false);
});

test("terminal timelines reject unrelated late updates", () => {
  let timeline = completeBuildTimeline(createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" }), { finalStatus: "Complete" }).timeline;
  assert.equal(timeline.terminal, true);
  const result = mapRuntimeEventToTimeline(timeline, { type: "operation_progress", operationId: timeline.operationId, payload: { stage: "Late update" } });
  assert.equal(result.applied, false);
});

test("composer renders the live build timeline", async () => {
  const { extension } = await createReadyExtension();
  await extension.openProductExperience();
  const html = extension.productExperience.panel.webview.html;
  assert.match(html, /Live Build Timeline/);
  assert.match(html, /buildTimelineStages/);
  assert.match(html, /aria-live="polite"/);
  await extension.deactivate();
});

test("webview updates timeline state without auto-executing actions", async () => {
  const { extension, runtime } = await createReadyExtension();
  await extension.openProductExperience();
  extension.productExperience.startBuildTimeline({ message: "Build started" });
  const beforeCalls = runtime.calls.length;
  extension.productExperience.postBuildTimeline();
  const message = extension.vscode.__webviewMessages.find((entry) => entry.type === "buildTimeline");
  assert.ok(message);
  assert.equal(message.state.latestActivity, "Build started");
  assert.equal(runtime.calls.length, beforeCalls);
  await extension.deactivate();
});

test("timeline rendering does not mutate workspace files", async () => {
  const { extension, vscode } = await createReadyExtension();
  const original = vscode.__files["file:/workspace/src/app.js"];
  await extension.openProductExperience();
  extension.productExperience.startBuildTimeline();
  extension.productExperience.postBuildTimeline();
  renderCopilotHtml({ buildTimeline: extension.productExperience.buildTimelineState() }, { nonce: "timeline1" });
  assert.equal(vscode.__files["file:/workspace/src/app.js"], original);
  await extension.deactivate();
});

test("timeline rendering does not execute runtime commands", async () => {
  const { extension, runtime } = await createReadyExtension();
  await extension.openProductExperience();
  const callsBefore = runtime.calls.length;
  renderCopilotHtml({ buildTimeline: extension.productExperience.buildTimelineState() }, { nonce: "timeline2" });
  assert.equal(runtime.calls.length, callsBefore);
  await extension.deactivate();
});

test("approval remains controlled by the existing approval system", async () => {
  const { extension } = await createReadyExtension();
  await extension.openProductExperience();
  await extension.productExperience.handleMessage({ command: "openChangeReview" });
  assert.ok(extension.vscode.__lastDocument);
  assert.equal(validateCopilotMessage({ command: "approveChange" }).valid, false);
  await extension.deactivate();
});

test("testing status does not report passed without real evidence", () => {
  let timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" });
  timeline = transitionBuildStage(timeline, "testing", STAGE_STATUS.ACTIVE).timeline;
  const result = mapAgentEventToTimeline(timeline, {
    type: "turn_validation_completed",
    payload: { name: "tests", status: "passed" },
  });
  assert.equal(result.applied, true);
  assert.notEqual(result.timeline.checks[0].status, CHECK_STATUS.PASSED);
  assert.equal(result.timeline.checks[0].status, CHECK_STATUS.UNAVAILABLE);
  const accepted = mapAgentEventToTimeline(timeline, {
    type: "turn_validation_completed",
    payload: { name: "tests", valid: true },
  });
  assert.equal(accepted.applied, true);
  assert.equal(accepted.timeline.checks[0].status, CHECK_STATUS.PASSED);
});

test("csp escaping accessibility and message allowlisting remain enforced", () => {
  const malicious = "<img src=x onerror=alert(1)>";
  const html = renderCopilotHtml({
    buildTimeline: presentBuildTimeline(createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z" })),
    mode: malicious,
  }, { nonce: "timeline3" });
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /nonce-timeline3/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /toggleTimelineDetails/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.equal(validateCopilotMessage({ command: "toggleTimelineDetails" }).valid, true);
  assert.equal(validateCopilotMessage({ command: "openValidationDetails" }).valid, true);
  assert.equal(validateCopilotMessage({ command: "runShell" }).valid, false);
});

test("updateBuildActivity ignores mismatched turn IDs", () => {
  const timeline = createBuildTimeline({ startedAt: "2026-07-21T10:00:00.000Z", turnId: "turn-1" });
  const result = updateBuildActivity(timeline, { turnId: "turn-2", message: "Other turn" });
  assert.equal(result.applied, false);
});

test("extension activation and disposal remain clean", async () => {
  const { extension } = await createReadyExtension();
  await extension.openProductExperience();
  extension.productExperience.startBuildTimeline();
  await extension.deactivate();
  assert.equal(extension.productExperience.buildTimeline, null);
});
