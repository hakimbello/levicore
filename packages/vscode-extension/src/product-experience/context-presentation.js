const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { safePlainText, serializeProductExperience } = require("./product-experience-serializer");

function presentContext(state = {}) {
  const agent = state.agent || {};
  const turn = agent.activeTurn || {};
  const workspace = state.workspace || {};
  const activeFile = state.activeFile || {};
  return serializeProductExperience({
    workspace: workspace.name || workspace.id || "No workspace",
    scope: contextScope(turn, state),
    currentFile: activeFile.path || activeFile.uri || "Use Attach Current File",
    selectedCode: state.selectedCode ? "Attached" : "Not attached",
    projectContext: Boolean(state.project),
    workflowContext: Boolean(state.workflows && state.workflows.activeWorkflow),
    planContext: toList(agent.planSummary || turn.planId).slice(0, 5),
    pendingApprovalContext: (state.approvals || []).filter((approval) => approval.status === "PENDING").length,
    activeChangeContext: state.changes && state.changes.activeProposal && state.changes.activeProposal.id || null,
    evidenceReferences: toList(turn.evidence || turn.contextPackageIds || agent.contextSummary || []).slice(0, EXPERIENCE_BOUNDS.maximumEvidenceReferences).map(safePlainText),
    limitations: toList(turn.limitations || agent.health && agent.health.limitations || []).slice(0, 5),
  });
}

function contextScope(turn, state) {
  if (turn && turn.contextPackageIds && turn.contextPackageIds.length) return "Focused context package";
  if (state.workflows && state.workflows.activeWorkflow) return "Workflow";
  if (state.changes && state.changes.activeProposal) return "Change proposal";
  return "Workspace";
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

module.exports = {
  presentContext,
};
