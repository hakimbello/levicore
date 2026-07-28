const PRODUCT_EXPERIENCE_SCHEMA_VERSION = 1;
const LEVI_ACTIVITY_CONTAINER_ID = "levi";
const LEVI_BUILD_VIEW_ID = "levi.build";
const LEVI_BUILD_FOCUS_COMMAND_ID = "levi.build.focus";
const LEVI_OPEN_CONTAINER_COMMAND_ID = "workbench.view.extension.levi";

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
  "openSettings",
  "openOnboarding",
  "toggleTimelineDetails",
  "openChangeReview",
  "openValidationDetails",
]);

const HOME_WEBVIEW_COMMANDS = Object.freeze([
  "testConnection",
  "selectModel",
  "openSetupGuide",
  "openProjectFolder",
  "analyzeProject",
  "startBuilding",
  "openComposer",
  "setupOllama",
  "openSettings",
]);

const WIZARD_WEBVIEW_COMMANDS = Object.freeze([
  "selectTemplate",
  "updateAnswers",
  "nextStep",
  "previousStep",
  "generatePlan",
  "approvePlan",
  "editPlan",
  "cancelWizard",
  "launchComposer",
]);

const WIZARD_TEMPLATE_IDS = Object.freeze([
  "landing-page",
  "web-app",
  "mobile-app",
  "rest-api",
  "vscode-extension",
  "existing-project",
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
  LEVI_ACTIVITY_CONTAINER_ID,
  LEVI_BUILD_FOCUS_COMMAND_ID,
  LEVI_BUILD_VIEW_ID,
  LEVI_OPEN_CONTAINER_COMMAND_ID,
  HOME_WEBVIEW_COMMANDS,
  PRODUCT_COMMANDS,
  PRODUCT_EXPERIENCE_SCHEMA_VERSION,
  PRODUCT_MODES,
  PRODUCT_STAGES,
  WIZARD_TEMPLATE_IDS,
  WIZARD_WEBVIEW_COMMANDS,
};
