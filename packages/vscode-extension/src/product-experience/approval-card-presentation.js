const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { safePlainText, serializeProductExperience } = require("./product-experience-serializer");

function presentApprovalCard(approval = {}, state = {}) {
  const scope = approval.scope || {};
  const change = state.changes && state.changes.activeProposal || {};
  return serializeProductExperience({
    id: approval.id || "approval",
    title: safePlainText(approval.requestedAction || approval.title || "Levi needs approval"),
    why: safePlainText(approval.reason || approval.description || "This action changes protected workspace state or runs a protected operation."),
    exactScope: exactScope(scope, change),
    risk: safePlainText(approval.riskLevel || highestRisk(approval.risks) || "Review required"),
    workspace: scope.workspaceId || approval.workspaceId || state.workspace && state.workspace.name || "Current workspace",
    branch: scope.branch || change.branch || "Unavailable",
    diffSummary: diffSummary(change),
    validationPlan: toList(approval.validationPlan || change.validationPlan || ["Validate through Levi runtime before trust."]).slice(0, 5),
    rollbackAvailability: change.revertible === false ? "Unavailable" : "Available when adapter supports it",
    expiration: approval.expiresAt || "No expiration recorded",
    status: approval.status || "PENDING",
    warnings: toList(approval.warnings || []).slice(0, EXPERIENCE_BOUNDS.maximumCards),
    limitations: toList(approval.limitations || []).slice(0, EXPERIENCE_BOUNDS.maximumCards),
    actions: ["Approve", "Reject", "Explain", "Review Diff", "Show Technical Details"],
    runtimeConfirmationRequired: true,
  });
}

function exactScope(scope, change) {
  if (scope.commandId || scope.command) return scope.commandId || scope.command;
  const files = toList(scope.files || change.fileChanges || change.files || []).map((file) => file.path || file);
  return files.length ? files.slice(0, 20) : ["Current Levi operation"];
}

function diffSummary(change = {}) {
  const fileChanges = toList(change.fileChanges || change.files || []);
  const additions = change.additions || fileChanges.reduce((sum, file) => sum + Number(file.additions || 0), 0);
  const deletions = change.deletions || fileChanges.reduce((sum, file) => sum + Number(file.deletions || 0), 0);
  return {
    files: fileChanges.length,
    additions,
    deletions,
    summary: change.summary || change.title || "Diff available after preview.",
  };
}

function highestRisk(risks = []) {
  const text = toList(risks).join(" ").toLowerCase();
  if (/critical|credential|secret|delete|protected/.test(text)) return "High";
  if (/source|command|rename|write/.test(text)) return "Medium";
  if (text) return "Low";
  return null;
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

module.exports = {
  presentApprovalCard,
};
