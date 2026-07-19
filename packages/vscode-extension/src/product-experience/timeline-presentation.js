const { EXPERIENCE_BOUNDS, PRODUCT_STAGES } = require("./product-experience-constants");
const { safePlainText, serializeProductExperience } = require("./product-experience-serializer");

function presentTimeline(state = {}) {
  const workflows = state.workflows || {};
  const active = workflows.activeWorkflow || {};
  const steps = workflows.steps || [];
  const activeStage = workflowStage(active, steps);
  const stageNames = Object.values(PRODUCT_STAGES);
  return serializeProductExperience({
    active: Boolean(active.id),
    workflowId: active.id || null,
    title: safePlainText(active.title || active.objective || "No active workflow"),
    progress: active.progress && active.progress.percentage !== undefined ? active.progress.percentage : 0,
    stages: stageNames.slice(0, EXPERIENCE_BOUNDS.maximumTimelineStages).map((stage) => ({
      name: stage,
      state: stageState(stage, activeStage),
      purpose: purposeForStage(stage),
      evidence: evidenceForStage(stage, steps),
      approval: stage === PRODUCT_STAGES.WAITING_FOR_APPROVAL ? waitingApprovals(steps) : 0,
      validation: validationState(steps),
      retry: retryState(steps),
      warnings: warningsForStage(stage, active, steps),
    })),
    technicalGraphAvailable: true,
  });
}

function presentTeam(state = {}) {
  const multiAgent = state.multiAgent || {};
  const assignments = multiAgent.assignments || [];
  const roles = ["Coordinator", "Planner", "Implementer", "Reviewer", "Tester", "Security Reviewer"];
  return serializeProductExperience({
    active: Boolean(multiAgent.activeTeam && multiAgent.activeTeam.id),
    team: multiAgent.activeTeam && (multiAgent.activeTeam.objective || multiAgent.activeTeam.id) || "No active team",
    roles: roles.concat(assignments.map((assignment) => titleRole(assignment.role))).filter(unique).slice(0, EXPERIENCE_BOUNDS.maximumCards).map((role) => {
      const assignment = assignments.find((entry) => titleRole(entry.role) === role) || {};
      return {
        role,
        state: plainState(assignment.state || (role === "Coordinator" && multiAgent.activeTeam && multiAgent.activeTeam.state) || "Unavailable"),
        assignment: safePlainText(assignment.objective || assignment.type || "No assignment"),
        progress: assignment.progress && assignment.progress.percentage || 0,
        findings: toList(assignment.findings || []).length,
        limitations: toList(assignment.limitations || []).slice(0, 3),
      };
    }),
    conflicts: toList(multiAgent.conflicts || []).slice(0, 8).map((conflict) => ({
      title: safePlainText(conflict.title || conflict.category || conflict.id),
      severity: conflict.severity || "UNKNOWN",
      state: conflict.resolutionStatus || "Open",
    })),
    agreementIsApproval: false,
  });
}

function workflowStage(active, steps) {
  const states = steps.map((step) => String(step.state || "").toUpperCase());
  if (states.some((state) => state.includes("APPROVAL"))) return PRODUCT_STAGES.WAITING_FOR_APPROVAL;
  if (states.some((state) => state.includes("REPAIR"))) return PRODUCT_STAGES.REPAIRING;
  if (states.some((state) => state.includes("VALIDAT"))) return PRODUCT_STAGES.TESTING;
  if (states.some((state) => state === "FAILED" || state === "BLOCKED")) return PRODUCT_STAGES.NEEDS_ATTENTION;
  const workflowState = String(active.state || "").toUpperCase();
  if (workflowState === "COMPLETED" || workflowState === "SUCCEEDED") return PRODUCT_STAGES.COMPLETE;
  if (workflowState === "CANCELLED") return PRODUCT_STAGES.CANCELLED;
  if (workflowState === "RUNNING") return PRODUCT_STAGES.GATHERING_CONTEXT;
  return PRODUCT_STAGES.UNDERSTANDING;
}

function stageState(stage, activeStage) {
  const order = Object.values(PRODUCT_STAGES);
  if (stage === activeStage) return "Active";
  return order.indexOf(stage) < order.indexOf(activeStage) ? "Completed" : "Upcoming";
}

function purposeForStage(stage) {
  const purposes = {
    [PRODUCT_STAGES.UNDERSTANDING]: "Read the request and workspace signals.",
    [PRODUCT_STAGES.GATHERING_CONTEXT]: "Collect bounded project context.",
    [PRODUCT_STAGES.PLANNING]: "Prepare a bounded plan.",
    [PRODUCT_STAGES.PREPARING_CHANGES]: "Create reviewable changes.",
    [PRODUCT_STAGES.REVIEWING]: "Review evidence and risks.",
    [PRODUCT_STAGES.WAITING_FOR_APPROVAL]: "Wait for explicit user approval.",
    [PRODUCT_STAGES.APPLYING]: "Apply approved changes.",
    [PRODUCT_STAGES.TESTING]: "Run validation evidence.",
    [PRODUCT_STAGES.REPAIRING]: "Repair bounded failures.",
    [PRODUCT_STAGES.COMPLETE]: "Summarize completed work.",
    [PRODUCT_STAGES.NEEDS_ATTENTION]: "Surface blockers.",
    [PRODUCT_STAGES.CANCELLED]: "Stop work cleanly.",
  };
  return purposes[stage] || "Work stage.";
}

function evidenceForStage(stage, steps) {
  return steps.filter((step) => String(step.title || step.type || "").toLowerCase().includes(stage.split(" ")[0].toLowerCase())).reduce((sum, step) => sum + toList(step.evidence || []).length, 0);
}

function waitingApprovals(steps) {
  return steps.filter((step) => String(step.state || "").toUpperCase() === "WAITING_FOR_APPROVAL").length;
}

function validationState(steps) {
  if (steps.some((step) => String(step.state || "").toUpperCase().includes("VALIDAT"))) return "Running";
  if (steps.some((step) => step.validation && step.validation.status)) return "Available";
  return "Not run";
}

function retryState(steps) {
  return steps.some((step) => Number(step.attempt || 0) > 0) ? "Retry evidence available" : "No retry";
}

function warningsForStage(stage, active, steps) {
  if (stage === PRODUCT_STAGES.NEEDS_ATTENTION) return toList(active.warnings || []).concat(steps.flatMap((step) => toList(step.warnings || []))).slice(0, 3);
  return [];
}

function titleRole(role) {
  return String(role || "").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Contributor";
}

function plainState(state) {
  return String(state || "UNKNOWN").toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function unique(value, index, array) {
  return value && array.indexOf(value) === index;
}

module.exports = {
  presentTeam,
  presentTimeline,
};
