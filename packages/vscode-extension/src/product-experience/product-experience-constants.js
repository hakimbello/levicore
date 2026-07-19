const PRODUCT_EXPERIENCE_SCHEMA_VERSION = 1;

const PRODUCT_MODES = Object.freeze({
  ASK: "Ask",
  PLAN: "Plan",
  BUILD: "Build",
  FIX: "Fix",
  REVIEW: "Review",
  TEACH: "Teach",
});

const PRODUCT_STAGES = Object.freeze({
  UNDERSTANDING: "Understanding",
  GATHERING_CONTEXT: "Gathering Context",
  PLANNING: "Planning",
  PREPARING_CHANGES: "Preparing Changes",
  REVIEWING: "Reviewing",
  WAITING_FOR_APPROVAL: "Waiting for Approval",
  APPLYING: "Applying",
  TESTING: "Testing",
  REPAIRING: "Repairing",
  COMPLETE: "Complete",
  NEEDS_ATTENTION: "Needs Attention",
  CANCELLED: "Cancelled",
});

const PRODUCT_COMMANDS = Object.freeze([
  "levi.open",
  "levi.focusComposer",
  "levi.newChat",
  "levi.showEnvironment",
  "levi.showActiveWorkflow",
  "levi.showActiveApproval",
  "levi.showActiveChange",
  "levi.openOnboarding",
  "levi.showContext",
  "levi.showTechnicalDetails",
]);

const COPILOT_WEBVIEW_COMMANDS = Object.freeze([
  "newChat",
  "submit",
  "cancel",
  "retry",
  "setMode",
  "selectModel",
  "attachCurrentFile",
  "attachSelectedCode",
  "showContext",
  "showEnvironment",
  "showTechnicalDetails",
  "openOnboarding",
]);

const ENVIRONMENT_SECTIONS = Object.freeze([
  "Workspace",
  "Git",
  "Changes",
  "Workflow",
  "Agents",
  "Models",
  "Validation",
  "Approvals",
  "Performance",
  "Reliability",
  "Security",
  "Context",
]);

const EXPERIENCE_BOUNDS = Object.freeze({
  maximumInputBytes: 12000,
  maximumRecentConversations: 12,
  maximumCards: 20,
  maximumTimelineStages: 12,
  maximumEvidenceReferences: 20,
  maximumEnvironmentItems: 80,
  maximumSerializedStateBytes: 64000,
});

module.exports = {
  COPILOT_WEBVIEW_COMMANDS,
  ENVIRONMENT_SECTIONS,
  EXPERIENCE_BOUNDS,
  PRODUCT_COMMANDS,
  PRODUCT_EXPERIENCE_SCHEMA_VERSION,
  PRODUCT_MODES,
  PRODUCT_STAGES,
};
