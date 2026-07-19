const { serializeProductExperience } = require("./product-experience-serializer");

function presentGitState(state = {}) {
  const source = state.sourceControl || state.git || {};
  const changes = source.changes || source.files || [];
  const validation = state.changes && state.changes.lastValidation || {};
  const available = source.available === true || Boolean(source.branch || source.status || changes.length);
  return serializeProductExperience({
    available,
    status: available ? source.status || "Available" : "Unavailable",
    branch: source.branch || source.currentBranch || "Unavailable",
    changedFiles: changes.length || source.changedFiles || 0,
    additions: source.additions || count(changes, "additions"),
    deletions: source.deletions || count(changes, "deletions"),
    ahead: source.ahead || 0,
    behind: source.behind || 0,
    latestCommit: source.latestCommit || source.head || "Unavailable",
    checkpointAvailability: source.checkpointAvailable === false ? "Unavailable" : "Available when source-control adapter supports it",
    validationState: validation.status || validation.state || "Not run",
    commitReadiness: available ? readiness(validation, state.securityAssurance) : "Unavailable: no safe Git adapter status",
    pushReadiness: "Unavailable until explicit approved push support exists",
    remote: source.remote || "Unavailable",
    forcePush: "Unavailable",
    actions: {
      showStatus: true,
      showDiff: true,
      createCheckpoint: source.checkpointAvailable !== false,
      prepareCommitMessage: available,
      commit: false,
      push: false,
    },
    explicitApprovalRequired: true,
  });
}

function readiness(validation, security) {
  const blockers = security && (security.blockers || security.releaseBlockers || []);
  if (blockers && blockers.length) return "Blocked by security finding";
  if (validation && ["FAILED", "BLOCKED"].includes(validation.status || validation.state)) return "Blocked by validation";
  return "Review required before commit";
}

function count(items, key) {
  return (items || []).reduce((sum, item) => sum + Number(item && item[key] || 0), 0);
}

module.exports = {
  presentGitState,
};
