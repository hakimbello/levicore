const { serializeProductExperience } = require("./product-experience-serializer");

const BUILD_TIMELINE_SCHEMA_VERSION = 1;

const BUILD_STAGE_IDS = Object.freeze([
  "requirements",
  "architecture",
  "planning",
  "implementation",
  "review",
  "testing",
  "complete",
]);

const STAGE_STATUS = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETE: "complete",
  BLOCKED: "blocked",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const OVERALL_STATUS = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETE: "complete",
  FAILED: "failed",
  CANCELLED: "cancelled",
  BLOCKED: "blocked",
});

const CHECK_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  PASSED: "passed",
  FAILED: "failed",
  SKIPPED: "skipped",
  UNAVAILABLE: "unavailable",
});

const STAGE_LABELS = Object.freeze({
  requirements: "Requirements",
  architecture: "Architecture",
  planning: "Planning",
  implementation: "Implementation",
  review: "Review",
  testing: "Testing",
  complete: "Complete",
});

const TERMINAL_OVERALL = new Set([
  OVERALL_STATUS.COMPLETE,
  OVERALL_STATUS.FAILED,
  OVERALL_STATUS.CANCELLED,
]);

const STAGE_ORDER = Object.freeze(Object.fromEntries(BUILD_STAGE_IDS.map((id, index) => [id, index])));

function createBuildTimeline(input = {}) {
  const startedAt = input.startedAt || null;
  return cloneTimeline({
    schemaVersion: BUILD_TIMELINE_SCHEMA_VERSION,
    buildId: String(input.buildId || createId("build")),
    operationId: input.operationId || null,
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    overallStatus: startedAt ? OVERALL_STATUS.ACTIVE : OVERALL_STATUS.PENDING,
    currentStageId: "requirements",
    startedAt,
    completedAt: null,
    stages: BUILD_STAGE_IDS.map((id) => createStage(id)),
    latestActivity: null,
    blockers: [],
    warnings: [],
    checks: [],
    review: null,
    completionSummary: null,
    diagnostics: [],
    terminal: false,
    detailsExpanded: false,
  });
}

function createStage(id) {
  return {
    id,
    label: STAGE_LABELS[id] || id,
    status: STAGE_STATUS.PENDING,
    currentTask: null,
    startedAt: null,
    completedAt: null,
    elapsedMs: null,
    progressPercentage: null,
    completionEvidence: null,
    blockerReason: null,
    failureReason: null,
  };
}

function transitionBuildStage(timeline, stageId, status, options = {}) {
  return mutateTimeline(timeline, (draft) => {
    assertStageId(stageId);
    assertStageStatus(status);
    const stage = requireStage(draft, stageId);
    if (draft.terminal && !options.allowTerminalMutation) return reject("Timeline is terminal.");
    if (stage.status === STAGE_STATUS.COMPLETE && status === STAGE_STATUS.PENDING) return reject("Completed stages cannot return to pending.");
    if (stage.status === STAGE_STATUS.SKIPPED && status === STAGE_STATUS.PENDING) return reject("Skipped stages cannot return to pending.");
    if (status === STAGE_STATUS.ACTIVE && stage.status === STAGE_STATUS.COMPLETE) return reject("Completed stages cannot become active again.");
    const timestamp = normalizeTimestamp(options.timestamp || draft.startedAt || new Date().toISOString());
    if (stage.startedAt && timestamp && Date.parse(timestamp) < Date.parse(stage.startedAt)) return reject("Timestamps cannot move backward.");
    if (status === STAGE_STATUS.ACTIVE) activateStage(draft, stage, timestamp, options);
    else if (status === STAGE_STATUS.COMPLETE) completeStage(draft, stage, timestamp, options);
    else if (status === STAGE_STATUS.SKIPPED) skipStage(draft, stage, timestamp, options);
    else if (status === STAGE_STATUS.BLOCKED) blockStage(draft, stage, timestamp, options);
    else if (status === STAGE_STATUS.FAILED) failStage(draft, stage, timestamp, options);
    else if (status === STAGE_STATUS.PENDING && stage.status !== STAGE_STATUS.PENDING) return reject("Stages cannot revert to pending.");
    else stage.status = status;
    if (Number.isFinite(Number(options.progressPercentage))) stage.progressPercentage = Math.max(0, Math.min(100, Number(options.progressPercentage)));
    draft.currentStageId = stageId;
    if (!draft.startedAt && (status === STAGE_STATUS.ACTIVE || status === STAGE_STATUS.COMPLETE)) draft.startedAt = timestamp;
    if (draft.overallStatus === OVERALL_STATUS.PENDING) draft.overallStatus = OVERALL_STATUS.ACTIVE;
    return accept(draft);
  });
}

function updateBuildActivity(timeline, activity = {}, options = {}) {
  return mutateTimeline(timeline, (draft) => {
    if (draft.terminal && !options.allowTerminalMutation) return reject("Timeline is terminal.");
    if (activity.operationId && draft.operationId && activity.operationId !== draft.operationId) return reject("Operation mismatch.");
    if (activity.turnId && draft.turnId && activity.turnId !== draft.turnId) return reject("Turn mismatch.");
    bindOperation(draft, activity);
    draft.latestActivity = boundedText(activity.message || activity.summary || draft.latestActivity, 500);
    if (Array.isArray(activity.warnings)) draft.warnings = uniqueStrings(draft.warnings.concat(activity.warnings)).slice(0, 20);
    if (Number.isFinite(Number(activity.progressPercentage))) {
      const stage = requireStage(draft, draft.currentStageId);
      stage.progressPercentage = Math.max(0, Math.min(100, Number(activity.progressPercentage)));
    }
    return accept(draft);
  });
}

function blockBuildStage(timeline, stageId, reason, options = {}) {
  const text = boundedText(reason, 500);
  if (!text) return rejectResult("Blocked stages require a reason.");
  return transitionBuildStage(timeline, stageId, STAGE_STATUS.BLOCKED, {
    ...options,
    blockerReason: text,
    currentTask: options.currentTask || text,
  });
}

function failBuildStage(timeline, stageId, reason, options = {}) {
  const text = boundedText(reason, 500);
  if (!text) return rejectResult("Failed stages require a reason.");
  const result = transitionBuildStage(timeline, stageId, STAGE_STATUS.FAILED, {
    ...options,
    failureReason: text,
    currentTask: options.currentTask || text,
  });
  if (!result.applied) return result;
  const draft = result.timeline;
  draft.overallStatus = OVERALL_STATUS.FAILED;
  draft.completedAt = normalizeTimestamp(options.timestamp) || draft.completedAt;
  draft.terminal = true;
  return acceptTimeline(draft);
}

function completeBuildStage(timeline, stageId, options = {}) {
  return transitionBuildStage(timeline, stageId, STAGE_STATUS.COMPLETE, options);
}

function completeBuildTimeline(timeline, summary = {}, options = {}) {
  return mutateTimeline(timeline, (draft) => {
    if (draft.terminal && draft.overallStatus === OVERALL_STATUS.COMPLETE) return accept(draft);
    if (draft.overallStatus === OVERALL_STATUS.CANCELLED || draft.overallStatus === OVERALL_STATUS.FAILED) return reject("Cancelled or failed builds cannot complete.");
    const timestamp = normalizeTimestamp(options.timestamp || new Date().toISOString());
    for (const stageId of BUILD_STAGE_IDS) {
      if (stageId === "complete") continue;
      const stage = requireStage(draft, stageId);
      if ([STAGE_STATUS.PENDING, STAGE_STATUS.ACTIVE].includes(stage.status)) {
        if (stageId === draft.currentStageId && options.skipRemaining) skipStage(draft, stage, timestamp, { completionEvidence: "Not reported" });
        else if (stage.status === STAGE_STATUS.ACTIVE) completeStage(draft, stage, timestamp, { completionEvidence: options.implicitCompletionEvidence || null });
      }
    }
    const complete = requireStage(draft, "complete");
    completeStage(draft, complete, timestamp, { completionEvidence: summary.finalStatus || "Build complete" });
    draft.overallStatus = OVERALL_STATUS.COMPLETE;
    draft.currentStageId = "complete";
    draft.completedAt = timestamp;
    draft.terminal = true;
    draft.completionSummary = sanitizeCompletionSummary(summary, draft);
    return accept(draft);
  });
}

function cancelBuildTimeline(timeline, reason, options = {}) {
  return mutateTimeline(timeline, (draft) => {
    if (draft.terminal) return accept(draft);
    const text = boundedText(reason, 500) || "Build cancelled";
    const timestamp = normalizeTimestamp(options.timestamp || new Date().toISOString());
    const stage = requireStage(draft, draft.currentStageId);
    stage.status = stage.status === STAGE_STATUS.COMPLETE ? stage.status : STAGE_STATUS.FAILED;
    stage.failureReason = stage.failureReason || text;
    stage.completedAt = stage.completedAt || timestamp;
    stage.elapsedMs = computeElapsed(stage.startedAt, stage.completedAt);
    draft.overallStatus = OVERALL_STATUS.CANCELLED;
    draft.completedAt = timestamp;
    draft.terminal = true;
    draft.latestActivity = text;
    draft.completionSummary = sanitizeCompletionSummary({ finalStatus: "Cancelled", cancellationReason: text }, draft);
    return accept(draft);
  });
}

function mapRuntimeEventToTimeline(timeline, event = {}, options = {}) {
  if (!timeline) return rejectResult("Timeline is required.");
  const type = String(event.type || "");
  if (!type) return rejectResult("Event type is required.");
  if (timeline.terminal && !options.allowTerminalMutation) return rejectResult("Timeline is terminal.");
  if (event.operationId && timeline.operationId && event.operationId !== timeline.operationId) return rejectResult("Operation mismatch.");

  let draft = cloneTimeline(timeline);
  if (!draft.operationId && event.operationId) draft.operationId = event.operationId;
  bindOperation(draft, event.payload || {});

  const payload = event.payload || {};
  const timestamp = eventTimestamp(event, draft);
  const progress = payload.progress && Number.isFinite(Number(payload.progress.percentage)) ? Number(payload.progress.percentage) : null;
  const activity = {
    operationId: event.operationId || draft.operationId,
    turnId: payload.turnId || draft.turnId,
    message: payload.stage || payload.message || payload.summary || null,
    progressPercentage: progress,
  };

  switch (type) {
    case "operation_submitted":
    case "operation_started":
      draft = applyResult(updateBuildActivity(draft, { ...activity, message: activity.message || "Operation started" }, { timestamp })).timeline;
      return routeOperationCommand(draft, payload.command || payload.commandId || payload.type, timestamp, activity);
    case "operation_progress":
      return updateBuildActivity(draft, {
        ...activity,
        message: payload.stage ? `${payload.stage}${progress !== null ? ` (${progress}%)` : ""}` : activity.message || "Operation in progress",
        progressPercentage: progress,
      }, { timestamp });
    case "operation_waiting_for_approval":
    case "approval_requested":
      draft = applyResult(updateBuildActivity(draft, { message: "Waiting for approval" }, { timestamp })).timeline;
      draft = applyResult(updateReviewEvidence(draft, payload, { approvalStatus: "Waiting for approval" })).timeline;
      return blockBuildStage(draft, "review", payload.reason || payload.message || "Approval required", { timestamp, currentTask: "Waiting for approval" });
    case "approval_resolved":
      draft = applyResult(updateReviewEvidence(draft, payload, { approvalStatus: payload.decision || payload.status || "Resolved" })).timeline;
      return transitionBuildStage(draft, "review", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Approval resolved" });
    case "operation_succeeded":
    case "operation_partially_succeeded":
      return handleOperationTerminal(draft, type, payload, timestamp, false);
    case "operation_failed":
    case "operation_timed_out":
      return failBuildStage(draft, draft.currentStageId, payload.message || payload.error || "Operation failed", { timestamp });
    case "operation_cancelled":
    case "operation_cancellation_requested":
      return cancelBuildTimeline(draft, payload.message || "Operation cancelled", { timestamp });
    case "workspace_analysis_started":
      return transitionBuildStage(draft, "architecture", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Analyzing workspace" });
    case "workspace_analysis_completed":
      draft = applyResult(completeBuildStage(draft, "architecture", { timestamp, completionEvidence: "Workspace analysis completed", currentTask: "Workspace analyzed" })).timeline;
      return transitionBuildStage(draft, "planning", STAGE_STATUS.PENDING, { timestamp });
    case "workspace_failed":
      return failBuildStage(draft, "architecture", payload.message || "Workspace analysis failed", { timestamp });
    case "command_execution_started":
      return routeOperationCommand(draft, payload.commandId || payload.command, timestamp, activity);
    case "command_execution_completed":
      return updateBuildActivity(draft, { message: payload.commandId ? `${payload.commandId} completed` : "Command completed" }, { timestamp });
    case "command_execution_failed":
      return failBuildStage(draft, draft.currentStageId, payload.message || payload.error || "Command failed", { timestamp });
    default:
      return recordDiagnostic(draft, type, options);
  }
}

function mapAgentEventToTimeline(timeline, event = {}, options = {}) {
  if (!timeline) return rejectResult("Timeline is required.");
  const type = String(event.type || "");
  if (!type) return rejectResult("Event type is required.");
  if (timeline.terminal && !options.allowTerminalMutation) return rejectResult("Timeline is terminal.");

  let draft = cloneTimeline(timeline);
  const payload = event.payload || {};
  bindOperation(draft, payload);
  const timestamp = eventTimestamp(event, draft);

  switch (type) {
    case "turn_created":
      if (!draft.startedAt) draft.startedAt = timestamp;
      draft.overallStatus = OVERALL_STATUS.ACTIVE;
      return transitionBuildStage(draft, "requirements", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Understanding request" });
    case "turn_classification_started":
      return transitionBuildStage(draft, "requirements", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Classifying request" });
    case "turn_classified":
      draft = applyResult(updateBuildActivity(draft, { message: "Request classified" }, { timestamp })).timeline;
      return completeBuildStage(draft, "requirements", { timestamp, completionEvidence: payload.classification || "Request classified" });
    case "turn_context_started": {
      const requirements = requireStage(draft, "requirements");
      if (requirements.status !== STAGE_STATUS.COMPLETE) {
        draft = applyResult(completeBuildStage(draft, "requirements", { timestamp, completionEvidence: "Requirements captured" })).timeline;
      }
      return transitionBuildStage(draft, "architecture", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Gathering context" });
    }
    case "turn_context_completed":
      draft = applyResult(completeBuildStage(draft, "architecture", { timestamp, completionEvidence: "Context gathered" })).timeline;
      return transitionBuildStage(draft, "planning", STAGE_STATUS.PENDING, { timestamp });
    case "turn_planning_started":
      return transitionBuildStage(draft, "planning", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Planning implementation" });
    case "turn_planning_completed":
      draft = applyResult(completeBuildStage(draft, "planning", { timestamp, completionEvidence: payload.planId ? `Plan ${payload.planId}` : "Plan ready" })).timeline;
      return transitionBuildStage(draft, "implementation", STAGE_STATUS.PENDING, { timestamp });
    case "turn_model_request_started":
    case "turn_stream_started":
      return transitionBuildStage(draft, "implementation", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Implementation in progress" });
    case "tool_call_proposed":
      draft = applyResult(transitionBuildStage(draft, "implementation", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Preparing workspace actions" })).timeline;
      return updateReviewEvidence(draft, payload, { approvalStatus: "Not required yet" });
    case "tool_call_started":
      return transitionBuildStage(draft, "implementation", STAGE_STATUS.ACTIVE, { timestamp, currentTask: payload.toolName || payload.toolId || "Running tool" });
    case "tool_call_waiting_for_approval":
      draft = applyResult(updateReviewEvidence(draft, payload, { approvalStatus: "Waiting for approval" })).timeline;
      return blockBuildStage(draft, "review", payload.reason || "Tool call requires approval", { timestamp, currentTask: "Waiting for approval" });
    case "tool_call_completed":
      draft = applyResult(completeBuildStage(draft, "implementation", { timestamp, completionEvidence: payload.toolName || payload.toolId || "Tool completed" })).timeline;
      return transitionBuildStage(draft, "review", STAGE_STATUS.PENDING, { timestamp });
    case "tool_call_failed":
      return failBuildStage(draft, "implementation", payload.message || payload.error || "Tool call failed", { timestamp });
    case "turn_validation_started":
      draft = applyResult(transitionBuildStage(draft, "testing", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Running validation" })).timeline;
      return upsertCheck(draft, payload.checkId || payload.name || "validation", CHECK_STATUS.RUNNING, payload, timestamp);
    case "turn_validation_completed":
      draft = applyResult(updateChecksFromPayload(draft, payload, timestamp)).timeline;
      return completeBuildStage(draft, "testing", { timestamp, completionEvidence: payload.status || "Validation finished" });
    case "turn_completed":
      draft = applyResult(completeBuildStage(draft, "testing", { timestamp, completionEvidence: "Validation finished", allowTerminalMutation: true })).timeline;
      return completeBuildTimeline(draft, summaryFromPayload(payload, draft), { timestamp });
    case "turn_partially_completed":
      draft = applyResult(updateBuildActivity(draft, { message: "Build partially completed", warnings: payload.warnings }, { timestamp })).timeline;
      return completeBuildTimeline(draft, summaryFromPayload(payload, draft), { timestamp, skipRemaining: true });
    case "turn_failed":
      return failBuildStage(draft, draft.currentStageId, payload.message || payload.error || "Build failed", { timestamp });
    case "turn_cancelled":
    case "conversation_cancelled":
      return cancelBuildTimeline(draft, payload.message || "Build cancelled", { timestamp });
    default:
      return recordDiagnostic(draft, type, options);
  }
}

function presentBuildTimeline(timeline, options = {}) {
  if (!timeline) return null;
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const presented = cloneTimeline(timeline);
  presented.stages = presented.stages.map((stage) => presentStage(stage, nowMs));
  presented.elapsedMs = computeElapsed(presented.startedAt, presented.completedAt || (presented.startedAt ? new Date(nowMs).toISOString() : null));
  presented.elapsedLabel = presented.elapsedMs === null ? null : formatElapsed(presented.elapsedMs);
  const current = presented.stages.find((stage) => stage.id === presented.currentStageId) || null;
  presented.currentStage = current ? { ...current } : null;
  presented.statusLabel = overallStatusLabel(presented.overallStatus);
  presented.progressPercentage = presented.stages.find((stage) => stage.id === presented.currentStageId)?.progressPercentage ?? null;
  presented.showProgressPercentage = Number.isFinite(presented.progressPercentage);
  presented.activeLabel = activeStageLabel(presented);
  presented.checks = (presented.checks || []).map((check) => ({
    id: check.id,
    label: check.label,
    status: check.status,
    detail: check.detail || null,
  }));
  presented.review = presented.review ? {
    filesToCreate: listOrEmpty(presented.review.filesToCreate),
    filesToModify: listOrEmpty(presented.review.filesToModify),
    filesToDelete: listOrEmpty(presented.review.filesToDelete),
    warnings: listOrEmpty(presented.review.warnings),
    riskSummary: presented.review.riskSummary || null,
    approvalStatus: presented.review.approvalStatus || null,
  } : null;
  presented.completionSummary = presented.completionSummary ? sanitizeCompletionSummary(presented.completionSummary, presented) : null;
  if (!options.diagnosticsEnabled) presented.diagnostics = [];
  return serializeProductExperience(presented);
}

function routeOperationCommand(timeline, commandId, timestamp, activity) {
  const command = String(commandId || "").toLowerCase();
  if (!command) return updateBuildActivity(timeline, activity, { timestamp });
  if (/plan|planning/.test(command)) return transitionBuildStage(timeline, "planning", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Planning" });
  if (/change\.|proposal|preview/.test(command)) {
    let draft = applyResult(transitionBuildStage(timeline, "review", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Reviewing proposed changes" })).timeline;
    return updateReviewEvidence(draft, activity, { approvalStatus: "Review in progress" });
  }
  if (/validation|test/.test(command)) {
    let draft = applyResult(transitionBuildStage(timeline, "testing", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Running validation" })).timeline;
    return upsertCheck(draft, command, CHECK_STATUS.RUNNING, activity, timestamp);
  }
  if (/apply|write|patch/.test(command)) return transitionBuildStage(timeline, "implementation", STAGE_STATUS.ACTIVE, { timestamp, currentTask: "Applying changes" });
  if (/context|understand|analysis|architecture/.test(command)) return transitionBuildStage(timeline, "architecture", STAGE_STATUS.ACTIVE, { timestamp, currentTask: activity.message || "Gathering context" });
  return updateBuildActivity(timeline, activity, { timestamp });
}

function handleOperationTerminal(timeline, type, payload, timestamp, cancelled) {
  if (cancelled) return cancelBuildTimeline(timeline, payload.message || "Operation cancelled", { timestamp });
  if (/validation|test/.test(String(payload.command || payload.commandId || ""))) {
    let draft = applyResult(updateChecksFromPayload(timeline, payload, timestamp)).timeline;
    draft = applyResult(completeBuildStage(draft, "testing", { timestamp, completionEvidence: payload.status || "Validation finished" })).timeline;
    return completeBuildTimeline(draft, summaryFromPayload(payload, draft), { timestamp });
  }
  return updateBuildActivity(timeline, { message: type === "operation_partially_succeeded" ? "Operation partially succeeded" : "Operation succeeded" }, { timestamp });
}

function updateReviewEvidence(timeline, payload = {}, extra = {}) {
  return mutateTimeline(timeline, (draft) => {
    const review = draft.review || {};
    draft.review = {
      filesToCreate: mergePaths(review.filesToCreate, payload.filesToCreate || payload.createdFiles),
      filesToModify: mergePaths(review.filesToModify, payload.filesToModify || payload.modifiedFiles || pathsFromChanges(payload.fileChanges, "UPDATE")),
      filesToDelete: mergePaths(review.filesToDelete, payload.filesToDelete || payload.deletedFiles || pathsFromChanges(payload.fileChanges, "DELETE")),
      warnings: uniqueStrings(listOrEmpty(review.warnings).concat(listOrEmpty(payload.warnings))).slice(0, 20),
      riskSummary: payload.riskSummary || payload.risk || review.riskSummary || null,
      approvalStatus: extra.approvalStatus || review.approvalStatus || null,
    };
    return accept(draft);
  });
}

function updateChecksFromPayload(timeline, payload = {}, timestamp) {
  let draft = timeline;
  const checks = Array.isArray(payload.checks) ? payload.checks : [];
  if (checks.length) {
    for (const check of checks) {
      const status = normalizeCheckStatus(check.status, check.passed, check);
      draft = applyResult(upsertCheck(draft, check.id || check.name || "check", status, check, timestamp)).timeline;
    }
    return acceptTimeline(draft);
  }
  if (payload.valid === true) return upsertCheck(draft, payload.name || "validation", CHECK_STATUS.PASSED, payload, timestamp);
  if (payload.valid === false) return upsertCheck(draft, payload.name || "validation", CHECK_STATUS.FAILED, payload, timestamp);
  return upsertCheck(draft, payload.name || "validation", CHECK_STATUS.UNAVAILABLE, payload, timestamp);
}

function upsertCheck(timeline, id, status, payload = {}, timestamp) {
  return mutateTimeline(timeline, (draft) => {
    const label = boundedText(payload.label || payload.name || id, 120);
    const normalizedStatus = normalizeCheckStatus(status, payload.passed, payload);
    if (normalizedStatus === CHECK_STATUS.PASSED && !hasPassEvidence(payload)) return reject("Passed checks require explicit pass evidence.");
    const existing = draft.checks.find((entry) => entry.id === id);
    const next = {
      id,
      label,
      status: normalizedStatus,
      detail: boundedText(payload.detail || payload.message, 300) || null,
      updatedAt: timestamp || null,
    };
    if (existing) Object.assign(existing, next);
    else draft.checks.push(next);
    draft.checks = draft.checks.slice(-20);
    return accept(draft);
  });
}

function summaryFromPayload(payload = {}, timeline) {
  return sanitizeCompletionSummary({
    finalStatus: payload.outcome || payload.status || "Complete",
    filesCreated: countList(payload.filesCreated || payload.createdFiles),
    filesModified: countList(payload.filesModified || payload.modifiedFiles),
    filesDeleted: countList(payload.filesDeleted || payload.deletedFiles),
    checksPassed: timeline.checks.filter((check) => check.status === CHECK_STATUS.PASSED).length || null,
    checksFailed: timeline.checks.filter((check) => check.status === CHECK_STATUS.FAILED).length || null,
    warnings: listOrEmpty(payload.warnings),
    elapsedMs: computeElapsed(timeline.startedAt, payload.completedAt || timeline.completedAt),
  }, timeline);
}

function sanitizeCompletionSummary(summary = {}, timeline) {
  const output = {};
  if (summary.finalStatus) output.finalStatus = boundedText(summary.finalStatus, 120);
  output.filesCreated = numericOrNull(summary.filesCreated);
  output.filesModified = numericOrNull(summary.filesModified);
  output.filesDeleted = numericOrNull(summary.filesDeleted);
  output.checksPassed = numericOrNull(summary.checksPassed);
  output.checksFailed = numericOrNull(summary.checksFailed);
  output.warnings = listOrEmpty(summary.warnings).slice(0, 20);
  output.elapsedMs = summary.elapsedMs === undefined ? computeElapsed(timeline.startedAt, timeline.completedAt) : numericOrNull(summary.elapsedMs);
  output.elapsedLabel = output.elapsedMs === null ? "Not reported" : formatElapsed(output.elapsedMs);
  if (summary.cancellationReason) output.cancellationReason = boundedText(summary.cancellationReason, 300);
  return output;
}

function presentStage(stage, nowMs) {
  const elapsedMs = computeElapsed(stage.startedAt, stage.completedAt || (stage.status === STAGE_STATUS.ACTIVE ? new Date(nowMs).toISOString() : null));
  return {
    ...stage,
    elapsedMs,
    elapsedLabel: elapsedMs === null ? null : formatElapsed(elapsedMs),
    statusLabel: stageStatusLabel(stage.status),
    showProgressPercentage: Number.isFinite(stage.progressPercentage),
  };
}

function activeStageLabel(timeline) {
  const stage = timeline.stages.find((entry) => entry.id === timeline.currentStageId);
  if (!stage) return null;
  if (stage.status === STAGE_STATUS.ACTIVE) return stage.currentTask || `${stage.label} in progress`;
  if (stage.status === STAGE_STATUS.BLOCKED) return stage.blockerReason || `${stage.label} blocked`;
  if (stage.status === STAGE_STATUS.FAILED) return stage.failureReason || `${stage.label} failed`;
  return stage.currentTask || timeline.latestActivity || null;
}

function overallStatusLabel(status) {
  if (status === OVERALL_STATUS.COMPLETE) return "Complete";
  if (status === OVERALL_STATUS.FAILED) return "Failed";
  if (status === OVERALL_STATUS.CANCELLED) return "Cancelled";
  if (status === OVERALL_STATUS.BLOCKED) return "Blocked";
  if (status === OVERALL_STATUS.ACTIVE) return "In progress";
  return "Pending";
}

function stageStatusLabel(status) {
  if (status === STAGE_STATUS.COMPLETE) return "Complete";
  if (status === STAGE_STATUS.ACTIVE) return "Active";
  if (status === STAGE_STATUS.BLOCKED) return "Blocked";
  if (status === STAGE_STATUS.FAILED) return "Failed";
  if (status === STAGE_STATUS.SKIPPED) return "Skipped";
  return "Pending";
}

function activateStage(draft, stage, timestamp, options) {
  if (!stage.startedAt) stage.startedAt = timestamp;
  stage.status = STAGE_STATUS.ACTIVE;
  stage.currentTask = boundedText(options.currentTask, 300) || stage.currentTask;
  stage.blockerReason = null;
  stage.failureReason = null;
  for (const other of draft.stages) {
    if (STAGE_ORDER[other.id] < STAGE_ORDER[stage.id] && other.status === STAGE_STATUS.ACTIVE) {
      completeStage(draft, other, timestamp, { completionEvidence: options.implicitCompletionEvidence || null });
    }
  }
}

function completeStage(draft, stage, timestamp, options) {
  if (!stage.startedAt) stage.startedAt = timestamp;
  stage.completedAt = timestamp;
  stage.status = STAGE_STATUS.COMPLETE;
  stage.currentTask = boundedText(options.currentTask, 300) || stage.currentTask;
  stage.completionEvidence = boundedText(options.completionEvidence, 300) || stage.completionEvidence;
  stage.elapsedMs = computeElapsed(stage.startedAt, stage.completedAt);
  stage.blockerReason = null;
  stage.failureReason = null;
}

function skipStage(draft, stage, timestamp, options) {
  stage.status = STAGE_STATUS.SKIPPED;
  stage.completedAt = timestamp;
  stage.completionEvidence = boundedText(options.completionEvidence || options.reason, 300) || "Skipped";
  stage.elapsedMs = computeElapsed(stage.startedAt, stage.completedAt);
}

function blockStage(draft, stage, timestamp, options) {
  if (!stage.startedAt) stage.startedAt = timestamp;
  stage.status = STAGE_STATUS.BLOCKED;
  stage.blockerReason = boundedText(options.blockerReason || options.reason, 500);
  stage.currentTask = boundedText(options.currentTask, 300) || stage.blockerReason;
  draft.overallStatus = OVERALL_STATUS.BLOCKED;
  draft.blockers = uniqueStrings(draft.blockers.concat(stage.blockerReason)).slice(0, 20);
}

function failStage(draft, stage, timestamp, options) {
  if (!stage.startedAt) stage.startedAt = timestamp;
  stage.status = STAGE_STATUS.FAILED;
  stage.failureReason = boundedText(options.failureReason || options.reason, 500);
  stage.completedAt = timestamp;
  stage.elapsedMs = computeElapsed(stage.startedAt, stage.completedAt);
  draft.overallStatus = OVERALL_STATUS.FAILED;
  draft.terminal = true;
  draft.completedAt = timestamp;
}

function bindOperation(draft, payload = {}) {
  if (!draft.operationId && payload.operationId) draft.operationId = payload.operationId;
  if (!draft.conversationId && payload.conversationId) draft.conversationId = payload.conversationId;
  if (!draft.turnId && payload.turnId) draft.turnId = payload.turnId;
}

function recordDiagnostic(timeline, type, options = {}) {
  if (!options.diagnosticsEnabled) return rejectResult("Unknown event ignored.");
  return mutateTimeline(timeline, (draft) => {
    draft.diagnostics = draft.diagnostics.concat({ type, at: new Date().toISOString() }).slice(-20);
    return accept(draft);
  });
}

function mutateTimeline(timeline, mutator) {
  const draft = cloneTimeline(timeline);
  const result = mutator(draft);
  return result.applied ? acceptTimeline(result.timeline) : result;
}

function applyResult(result) {
  if (!result.applied) throw new Error(result.reason || "Timeline update rejected.");
  return result;
}

function acceptTimeline(timeline) {
  return { applied: true, timeline: cloneTimeline(timeline) };
}

function accept(timeline) {
  return { applied: true, timeline: cloneTimeline(timeline) };
}

function reject(reason) {
  return { applied: false, reason };
}

function rejectResult(reason) {
  return { applied: false, reason, timeline: null };
}

function assertStageId(stageId) {
  if (!BUILD_STAGE_IDS.includes(stageId)) throw new Error(`Unknown build stage: ${stageId}`);
}

function assertStageStatus(status) {
  if (!Object.values(STAGE_STATUS).includes(status)) throw new Error(`Unknown stage status: ${status}`);
}

function requireStage(timeline, stageId) {
  const stage = timeline.stages.find((entry) => entry.id === stageId);
  if (!stage) throw new Error(`Missing build stage: ${stageId}`);
  return stage;
}

function normalizeCheckStatus(status, passed, payload = {}) {
  if (passed === true) return CHECK_STATUS.PASSED;
  if (passed === false) return CHECK_STATUS.FAILED;
  const normalized = String(status || "").toLowerCase();
  if (Object.values(CHECK_STATUS).includes(normalized)) {
    if (normalized === CHECK_STATUS.PASSED && !hasPassEvidence(payload)) return CHECK_STATUS.UNAVAILABLE;
    return normalized;
  }
  if (normalized === "success" || normalized === "succeeded" || normalized === "passed") {
    return hasPassEvidence(payload) ? CHECK_STATUS.PASSED : CHECK_STATUS.UNAVAILABLE;
  }
  if (normalized === "fail" || normalized === "failed" || normalized === "error") return CHECK_STATUS.FAILED;
  return CHECK_STATUS.UNAVAILABLE;
}

function hasPassEvidence(payload = {}) {
  if (payload.passed === true || payload.valid === true) return true;
  if (Array.isArray(payload.checks) && payload.checks.some((check) => check.passed === true || check.valid === true)) return true;
  return false;
}

function pathsFromChanges(changes, operation) {
  if (!Array.isArray(changes)) return [];
  return changes.filter((entry) => String(entry.operation || "").toUpperCase() === operation).map((entry) => entry.path).filter(Boolean);
}

function mergePaths(existing = [], incoming = []) {
  return uniqueStrings(listOrEmpty(existing).concat(listOrEmpty(incoming))).slice(0, 50);
}

function listOrEmpty(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map((entry) => boundedText(entry, 300)).filter(Boolean) : [boundedText(value, 300)].filter(Boolean);
}

function countList(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function numericOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function computeElapsed(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function normalizeTimestamp(value) {
  if (!value) return new Date().toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function latestTimelineTimestamp(timeline) {
  let latest = timeline.completedAt || timeline.startedAt || null;
  for (const stage of timeline.stages || []) {
    if (stage.completedAt && (!latest || Date.parse(stage.completedAt) > Date.parse(latest))) latest = stage.completedAt;
    if (stage.startedAt && (!latest || Date.parse(stage.startedAt) > Date.parse(latest))) latest = stage.startedAt;
  }
  return latest;
}

function eventTimestamp(event, timeline) {
  if (event && event.timestamp) return normalizeTimestamp(event.timestamp);
  const anchor = latestTimelineTimestamp(timeline) || timeline.startedAt;
  if (anchor) return normalizeTimestamp(anchor);
  return normalizeTimestamp(new Date().toISOString());
}

function boundedText(value, max) {
  const text = String(value === undefined || value === null ? "" : value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneTimeline(timeline) {
  return JSON.parse(JSON.stringify(timeline));
}

module.exports = {
  BUILD_STAGE_IDS,
  BUILD_TIMELINE_SCHEMA_VERSION,
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
};
