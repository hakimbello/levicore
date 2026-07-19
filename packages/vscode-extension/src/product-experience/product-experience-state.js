const { EXPERIENCE_BOUNDS, PRODUCT_EXPERIENCE_SCHEMA_VERSION, PRODUCT_MODES, PRODUCT_STAGES } = require("./product-experience-constants");
const { presentApprovalCard } = require("./approval-card-presentation");
const { presentChangeReview } = require("./change-review-presentation");
const { presentContext } = require("./context-presentation");
const { presentGitState } = require("./git-presentation");
const { presentModelPickerState } = require("./model-picker-controller");
const { presentOnboarding } = require("./onboarding-controller");
const { presentTeam } = require("./timeline-presentation");
const { presentTimeline } = require("./timeline-presentation");
const { serializeProductExperience } = require("./product-experience-serializer");

function normalizeProductExperienceState(input = {}, options = {}) {
  const state = input || {};
  const config = options.configuration || {};
  const mode = normalizeMode(state.productExperience && state.productExperience.mode || config.defaultMode || PRODUCT_MODES.ASK);
  const activeOperation = firstActive(state.operations || []);
  const activeWorkflow = state.workflows && state.workflows.activeWorkflow || null;
  const activeTurn = state.agent && state.agent.activeTurn || null;
  const activeApproval = (state.approvals || []).find((approval) => approval.status === "PENDING") || null;
  const activeChange = state.changes && state.changes.activeProposal || null;
  const stage = mapProductStage({ activeOperation, activeWorkflow, activeTurn, activeApproval, activeChange, runtimeState: state.runtimeState });
  const status = summarizeProductStatus(state, stage);
  const productState = {
    schemaVersion: PRODUCT_EXPERIENCE_SCHEMA_VERSION,
    enabled: config.enabled !== false,
    mode,
    stage,
    status,
    workspace: presentWorkspace(state),
    model: presentModelPickerState(state),
    git: presentGitState(state),
    context: presentContext(state),
    approvals: (state.approvals || []).slice(-EXPERIENCE_BOUNDS.maximumCards).map((approval) => presentApprovalCard(approval, state)),
    activeApproval: activeApproval ? presentApprovalCard(activeApproval, state) : null,
    changes: presentChangeReview(state),
    workflowTimeline: presentTimeline(state),
    multiAgentTeam: presentTeam(state),
    onboarding: presentOnboarding(state, config),
    activity: presentActivity(state),
    recovery: presentRecovery(state),
    safety: presentSafety(state),
    preferences: normalizePreferences(state.productExperience && state.productExperience.preferences || {}, config),
    updatedAt: new Date().toISOString(),
  };
  return serializeProductExperience(productState, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes });
}

function mapProductStage(input = {}) {
  const activeOperation = input.activeOperation || {};
  const operationState = String(activeOperation.state || "").toUpperCase();
  const operationType = String(activeOperation.type || activeOperation.command || "").toUpperCase();
  const workflowState = String(input.activeWorkflow && input.activeWorkflow.state || "").toUpperCase();
  const turnState = String(input.activeTurn && input.activeTurn.state || "").toUpperCase();
  const changeState = String(input.activeChange && input.activeChange.state || "").toUpperCase();
  if ([operationState, workflowState, turnState, changeState].some((state) => state.includes("CANCEL"))) return PRODUCT_STAGES.CANCELLED;
  if ([operationState, workflowState, turnState, changeState].some((state) => ["FAILED", "TIMED_OUT", "BLOCKED", "INTERRUPTED", "PARTIALLY_SUCCEEDED"].includes(state))) return PRODUCT_STAGES.NEEDS_ATTENTION;
  if (operationState === "WAITING_FOR_APPROVAL" || workflowState === "WAITING_FOR_APPROVAL" || input.activeApproval) return PRODUCT_STAGES.WAITING_FOR_APPROVAL;
  if (workflowState.includes("REPAIR") || operationType.includes("REPAIR")) return PRODUCT_STAGES.REPAIRING;
  if (operationType.includes("VALIDATION") || operationType.includes("TEST") || workflowState.includes("VALIDAT")) return PRODUCT_STAGES.TESTING;
  if (operationType.includes("APPLY") || changeState.includes("APPLY")) return PRODUCT_STAGES.APPLYING;
  if (changeState && !["NONE", "SUCCEEDED", "APPLIED"].includes(changeState)) return PRODUCT_STAGES.PREPARING_CHANGES;
  if (workflowState === "PLANNING" || turnState === "PLANNING") return PRODUCT_STAGES.PLANNING;
  if (operationState === "RUNNING" || workflowState === "RUNNING" || turnState === "RUNNING") return PRODUCT_STAGES.GATHERING_CONTEXT;
  if ([operationState, workflowState, turnState].some((state) => ["SUCCEEDED", "COMPLETED"].includes(state))) return PRODUCT_STAGES.COMPLETE;
  if (input.runtimeState === "READY") return PRODUCT_STAGES.UNDERSTANDING;
  return PRODUCT_STAGES.NEEDS_ATTENTION;
}

function presentWorkspace(state) {
  const workspace = state.workspace || {};
  const project = state.project || {};
  return {
    name: workspace.name || "No workspace",
    root: workspace.uri || workspace.root || "Unavailable",
    trust: workspace.trusted === false ? "Untrusted" : "Trusted",
    languageMix: toList(project.languageMix || project.classifications || []).slice(0, 5),
    framework: project.framework || project.summary && project.summary.framework || "Unknown",
    packageManager: project.packageManager || "Unknown",
    health: plainHealth(state.health && state.health.overallRuntimeHealth),
    activeSession: workspace.activeSessionId || "None",
    revision: workspace.revision || "Unknown",
  };
}

function presentActivity(state) {
  const operations = (state.operations || []).slice(-EXPERIENCE_BOUNDS.maximumCards);
  return operations.map((operation) => ({
    name: operation.command || operation.type || "Levi action",
    purpose: operation.description || operation.type || "Workspace assistance",
    state: mapProductStage({ activeOperation: operation }),
    affectedScope: operation.workspaceId || operation.sessionId || "Current workspace",
    resultSummary: operation.result && (operation.result.status || operation.result.disposition) || operation.state || "Pending",
    approvalRequirement: operation.approval && operation.approval.status || "Only when required",
    validationState: operation.validation && operation.validation.status || "Not run",
    duration: durationText(operation.startedAt, operation.completedAt),
    evidenceCount: (operation.evidence || []).length,
  }));
}

function presentRecovery(state) {
  const workflows = state.workflows || {};
  const interrupted = (workflows.items || []).filter((workflow) => ["INTERRUPTED", "RECOVERING", "PAUSED", "FAILED"].includes(workflow.state));
  return {
    interruptedWorkflows: interrupted.length,
    staleApprovals: (state.approvals || []).filter((approval) => ["EXPIRED", "STALE"].includes(approval.status)).length,
    staleProposals: ((state.changes && state.changes.proposals) || []).filter((proposal) => proposal.stale || proposal.state === "STALE").length,
    protectedActionsResumeAutomatically: false,
    message: interrupted.length ? "Levi preserved interrupted work. Retry is explicit." : "No interrupted work needs recovery.",
  };
}

function presentSafety(state) {
  const health = state.health || {};
  const security = state.securityAssurance || {};
  return {
    approvalBoundary: "Explicit runtime approval only",
    privacy: state.modelHealth && state.modelHealth.privacyPolicyStatus || "ENFORCED",
    security: security.certification && security.certification.level || security.health && security.health.status || "Available",
    blockers: toList(health.blockers || []).length + toList(security.blockers || []).length,
    warnings: toList(health.warnings || []).slice(0, 5),
  };
}

function summarizeProductStatus(state, stage) {
  const pendingApprovals = (state.approvals || []).filter((approval) => approval.status === "PENDING").length;
  if (pendingApprovals) return `${pendingApprovals} approval${pendingApprovals === 1 ? "" : "s"} waiting`;
  if (stage === PRODUCT_STAGES.NEEDS_ATTENTION) return "Levi needs attention";
  if (stage === PRODUCT_STAGES.COMPLETE) return "Last action completed";
  if (state.runtimeState === "READY") return "Ready";
  return state.runtimeState || "Starting";
}

function normalizePreferences(preferences, config) {
  return {
    showAdvancedDetails: config.showAdvancedDetails === true || preferences.showAdvancedDetails === true,
    compactEnvironment: config.compactEnvironment !== false && preferences.compactEnvironment !== false,
    timelineExpanded: config.timelineExpanded === true || preferences.timelineExpanded === true,
    preferredPanelLocation: config.preferredPanelLocation || preferences.preferredPanelLocation || "beside",
    collapsedSections: Array.isArray(preferences.collapsedSections) ? preferences.collapsedSections.slice(0, 20) : [],
  };
}

function firstActive(operations) {
  return operations.find((operation) => ["QUEUED", "STARTING", "RUNNING", "WAITING", "WAITING_FOR_APPROVAL", "PAUSED", "CANCELLING"].includes(operation.state)) || null;
}

function normalizeMode(mode) {
  return Object.values(PRODUCT_MODES).includes(mode) ? mode : PRODUCT_MODES.ASK;
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [value];
}

function plainHealth(value) {
  if (value === undefined || value === null) return "Unknown";
  const numeric = Number(value);
  if (numeric >= 90) return "Healthy";
  if (numeric >= 70) return "Needs a look";
  return "Blocked";
}

function durationText(startedAt, completedAt) {
  if (!startedAt) return "Not started";
  const start = Date.parse(startedAt);
  const end = completedAt ? Date.parse(completedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Unknown";
  return `${Math.max(0, Math.round((end - start) / 1000))}s`;
}

module.exports = {
  mapProductStage,
  normalizeProductExperienceState,
};
