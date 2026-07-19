const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { safePlainText, serializeProductExperience } = require("./product-experience-serializer");

function presentChangeReview(state = {}) {
  const changes = state.changes || {};
  const active = changes.activeProposal || {};
  const fileChanges = toList(active.fileChanges || active.files || []);
  return serializeProductExperience({
    active: Boolean(active.id),
    id: active.id || null,
    summary: safePlainText(active.title || active.summary || "No active change proposal"),
    state: plainChangeState(active.state),
    files: fileChanges.slice(0, EXPERIENCE_BOUNDS.maximumCards).map((file) => ({
      path: safePlainText(file.path || file.filePath || "unknown"),
      operation: safePlainText(file.operation || file.type || "UPDATE"),
      additions: Number(file.additions || 0),
      deletions: Number(file.deletions || 0),
      protectedPathWarning: Boolean(file.protectedPath || file.protected),
      stale: Boolean(file.stale),
    })),
    badges: badges(active, changes),
    riskIndicators: toList(active.risks || active.warnings || []).slice(0, 8),
    staleStatus: active.stale || active.state === "STALE" ? "Stale" : "Current",
    approveRejectState: active.approvalStatus || active.approval && active.approval.status || "Runtime approval required before apply",
    applicationState: changes.lastApplication && (changes.lastApplication.status || changes.lastApplication.state) || active.applicationState || "Not applied",
    validationResult: changes.lastValidation && (changes.lastValidation.status || changes.lastValidation.state || changes.lastValidation.disposition) || "Not run",
    revertEligibility: active.revertible === false ? "Unavailable" : "Available after successful application when adapter supports it",
    diffNavigation: fileChanges.length ? "Use Review Diff for per-file details" : "No diff available",
  });
}

function badges(active, changes) {
  const result = [];
  if (active.riskLevel) result.push(active.riskLevel);
  if (active.state) result.push(plainChangeState(active.state));
  if (changes.lastValidation) result.push("Validated");
  if (active.stale) result.push("Stale");
  return result.slice(0, 6);
}

function plainChangeState(state) {
  const normalized = String(state || "NONE").toUpperCase();
  if (normalized === "READY_FOR_REVIEW") return "Ready for review";
  if (normalized === "WAITING_FOR_APPROVAL") return "Waiting for approval";
  if (normalized === "APPLIED" || normalized === "SUCCEEDED") return "Applied";
  if (normalized === "FAILED") return "Needs attention";
  if (normalized === "NONE") return "No active change";
  return normalized.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

module.exports = {
  presentChangeReview,
};
