const { ENVIRONMENT_SECTIONS } = require("./product-experience-constants");

function environmentModel(state = {}) {
  const product = state.productExperience || {};
  const sections = {
    Workspace: objectItems(product.workspace),
    Git: objectItems(product.git),
    Changes: objectItems(product.changes),
    Workflow: timelineItems(product.workflowTimeline),
    Agents: agentItems(product.multiAgentTeam),
    Models: objectItems(product.model),
    Validation: objectItems({ state: product.changes && product.changes.validationResult || "Not run" }),
    Approvals: (product.approvals || []).map((approval) => item(approval.title, `${approval.status} ${approval.risk}`.trim(), "approval-card")),
    Performance: objectItems(state.performance && state.performance.health || {}),
    Reliability: objectItems(state.reliability && state.reliability.health || {}),
    Security: objectItems(product.safety),
    Context: objectItems(product.context),
  };
  return section("Levi Environment", ENVIRONMENT_SECTIONS.map((name) => section(name, sections[name] || [])));
}

function timelineItems(timeline = {}) {
  return (timeline.stages || []).map((stage) => item(stage.name, stage.state, "timeline-stage"));
}

function agentItems(team = {}) {
  return (team.roles || []).map((role) => item(role.role, `${role.state} ${role.assignment}`.trim(), "agent-role"));
}

function objectItems(value = {}) {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value).slice(0, 30).map((key) => {
    const entry = value[key];
    if (Array.isArray(entry)) return item(label(key), String(entry.length), `env-${key}`);
    if (entry && typeof entry === "object") return item(label(key), entry.name || entry.status || entry.state || "Available", `env-${key}`);
    return item(label(key), String(entry === undefined || entry === null ? "Unavailable" : entry), `env-${key}`);
  });
}

function section(label, children = []) {
  return { label, kind: "product-section", children };
}

function item(labelText, description = "", kind = "product-item") {
  return { label: String(labelText), description: String(description), kind };
}

function label(key) {
  return String(key).replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

module.exports = {
  environmentModel,
};
