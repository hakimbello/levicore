const fs = require("node:fs");
const path = require("node:path");
const { intakeRepository } = require("./repository-intake");
const { scanRepository } = require("./repository-scanner");
const { summarizeProject } = require("./project-summary");
const { collectProjectHealthSignals, recommendProjectHealth, summarizeProjectHealth } = require("./project-health");
const { createTaskIntake } = require("./task-intake");

const UNKNOWN = "UNKNOWN";
const POST_MVP_REQUIREMENT_ID = "POST_MVP until approved by owner";

function createHomeDashboardView(repositoryPath, options = {}) {
  if (!repositoryPath) {
    return noProjectView();
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return projectErrorView(repositoryPath, intake.error);
  }

  try {
    const state = loadRuntimeState(intake.path);
    const memoryRecords = loadMemoryRecords(intake.path);
    const scanResult = scanRepository(intake.path);
    const projectSummary = summarizeProject(scanResult);
    const healthReport = collectProjectHealthSignals({
      repositoryPath: intake.path,
      projectId: projectIdFor(intake.path),
      scanResult,
      projectSummary,
      state,
      memoryRecords,
    });
    const healthSummary = summarizeProjectHealth({ report: healthReport });
    const recommendationReport = recommendProjectHealth({ report: healthReport, summary: healthSummary });

    return {
      status: "READY",
      project: selectedProject(intake.path),
      repository: summarizeRepositoryForUi(projectSummary),
      health: summarizeHealthForUi(healthSummary, recommendationReport),
      readyToWork: healthSummary.readyToWork === true,
      currentTask: currentTaskFor(state),
      recentActivity: recentActivityFor(state),
      emptyStates: emptyStatesFor(state, recommendationReport),
      statusSummary: statusSummaryFor(healthSummary, state),
      controls: {
        canCreateTask: true,
      },
    };
  } catch (error) {
    return projectErrorView(intake.path, error.message);
  }
}

function createHomeIntakePreview(repositoryPath, taskText) {
  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return {
      status: "ERROR",
      reason: intake.error,
    };
  }

  const result = createTaskIntake({
    repositoryPath: intake.path,
    taskText: typeof taskText === "string" ? taskText : "",
    requirementId: POST_MVP_REQUIREMENT_ID,
  });

  return {
    status: result.status,
    originalRequest: result.originalRequest,
    normalizedObjective: result.normalizedObjective,
    taskType: result.taskType,
    reason: result.reason,
    proceedToPlanning: result.proceedToPlanning,
    nextQuestions: result.nextQuestions,
    missingInformation: result.missingInformation,
    ambiguityReasons: result.ambiguityReasons,
    boundaries: result.boundaries,
  };
}

function noProjectView() {
  return {
    status: "EMPTY",
    project: {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    repository: emptyRepositorySummary(),
    health: emptyHealthSummary(),
    readyToWork: false,
    currentTask: {
      status: "EMPTY",
      label: "No task started",
      detail: "Select a project to begin.",
    },
    recentActivity: [],
    emptyStates: ["No project selected.", "No task started."],
    statusSummary: [
      statusItem("Project", "Unknown", "No project selected."),
      statusItem("Readiness", "Unknown", "Project readiness is unavailable until a project is selected."),
    ],
    controls: {
      canCreateTask: false,
    },
  };
}

function projectErrorView(repositoryPath, message) {
  return {
    status: "ERROR",
    project: {
      status: "ERROR",
      name: path.basename(String(repositoryPath || "")) || "Project",
      root: String(repositoryPath || UNKNOWN),
    },
    repository: emptyRepositorySummary(),
    health: emptyHealthSummary(),
    readyToWork: false,
    currentTask: {
      status: "BLOCKED",
      label: "Project unavailable",
      detail: message || "Levi could not read the selected project.",
    },
    recentActivity: [],
    emptyStates: [],
    statusSummary: [
      statusItem("Project", "Blocked", message || "Levi could not read the selected project."),
      statusItem("Readiness", "Unknown", "Project readiness is unavailable."),
    ],
    controls: {
      canCreateTask: false,
    },
    error: {
      title: "Project could not be opened",
      detail: message || "Levi could not read the selected project.",
    },
  };
}

function selectedProject(repositoryPath) {
  return {
    status: "SELECTED",
    name: path.basename(repositoryPath) || repositoryPath,
    root: repositoryPath,
  };
}

function summarizeRepositoryForUi(summary) {
  return {
    root: summary.root,
    fileCount: Array.isArray(summary.files) ? summary.files.length : 0,
    skippedCount: Array.isArray(summary.skipped) ? summary.skipped.length : 0,
    languages: listOrUnknown(summary.languages),
    frameworks: listOrUnknown(summary.frameworks),
    packageManagers: listOrUnknown(summary.packageManagers),
    entryPoints: listOrUnknown(summary.entryPoints),
    tests: listOrUnknown(summary.tests),
    majorDirectories: Array.isArray(summary.majorDirectories)
      ? summary.majorDirectories.map((directory) => directory.name).sort()
      : [UNKNOWN],
  };
}

function emptyRepositorySummary() {
  return {
    root: UNKNOWN,
    fileCount: 0,
    skippedCount: 0,
    languages: [UNKNOWN],
    frameworks: [UNKNOWN],
    packageManagers: [UNKNOWN],
    entryPoints: [UNKNOWN],
    tests: [UNKNOWN],
    majorDirectories: [UNKNOWN],
  };
}

function summarizeHealthForUi(summary, recommendationReport) {
  return {
    overallStatus: summary.overallStatus || UNKNOWN,
    summary: summary.summary || "Project Health evidence is UNKNOWN.",
    readyToWork: summary.readyToWork === true,
    signalCounts: summary.signalCounts || {},
    highestSeverityIssues: listIssues(summary.highestSeverityIssues),
    recommendations: Array.isArray(recommendationReport.recommendations)
      ? recommendationReport.recommendations.map((recommendation) => ({
          id: stringOrUnknown(recommendation.id || recommendation.recommendationId),
          priority: stringOrUnknown(recommendation.priority),
          action: stringOrUnknown(recommendation.action),
          reason: stringOrUnknown(recommendation.reason),
        }))
      : [],
    evidenceReferences: Array.isArray(summary.evidenceReferences) ? summary.evidenceReferences.slice(0, 6) : [],
  };
}

function emptyHealthSummary() {
  return {
    overallStatus: UNKNOWN,
    summary: "Project Health evidence is UNKNOWN.",
    readyToWork: false,
    signalCounts: {},
    highestSeverityIssues: [],
    recommendations: [],
    evidenceReferences: [],
  };
}

function listIssues(issues) {
  if (!Array.isArray(issues)) {
    return [];
  }

  return issues.slice(0, 4).map((issue) => ({
    id: stringOrUnknown(issue.id || issue.signalId || issue.name),
    label: stringOrUnknown(issue.label),
    detail: stringOrUnknown(issue.detail),
    status: stringOrUnknown(issue.status),
    severity: stringOrUnknown(issue.severity),
  }));
}

function currentTaskFor(state) {
  if (state.report && typeof state.report.status === "string") {
    return {
      status: state.report.status,
      label: "Latest task result",
      detail: statusDetail(state.report.status, "Completion report is available."),
    };
  }

  if (state.execution && typeof state.execution.status === "string") {
    return {
      status: state.execution.status,
      label: "Task execution",
      detail: statusDetail(state.execution.status, "Approved work has execution status."),
    };
  }

  if (state.plan) {
    return {
      status: state.plan.approved ? "APPROVED" : "READY_FOR_REVIEW",
      label: state.plan.approved ? "Plan approved" : "Plan ready",
      detail: stringOrUnknown(state.plan.objective),
    };
  }

  if (state.request && state.request.intake) {
    return {
      status: stringOrUnknown(state.request.intake.status),
      label: "Request received",
      detail: stringOrUnknown(state.request.intake.normalizedObjective || state.request.intake.originalRequest),
    };
  }

  return {
    status: "EMPTY",
    label: "No task started",
    detail: "Start with a plain-language request.",
  };
}

function recentActivityFor(state) {
  const activity = [];

  if (state.request && state.request.intake) {
    activity.push({
      label: "Request saved",
      detail: stringOrUnknown(state.request.intake.originalRequest),
    });
  }

  if (state.plan) {
    activity.push({
      label: state.plan.approved ? "Plan approved" : "Plan created",
      detail: stringOrUnknown(state.plan.objective),
    });
  }

  if (state.execution && state.execution.status) {
    activity.push({
      label: "Execution status",
      detail: stringOrUnknown(state.execution.status),
    });
  }

  if (state.validation && state.validation.status) {
    activity.push({
      label: "Validation status",
      detail: stringOrUnknown(state.validation.status),
    });
  }

  if (state.report && state.report.status) {
    activity.push({
      label: "Completion report",
      detail: stringOrUnknown(state.report.status),
    });
  }

  const restorePoint = state.restorePoint || state.patch && state.patch.restorePoint;
  if (restorePoint && restorePoint.status) {
    activity.push({
      label: "Restore point",
      detail: stringOrUnknown(restorePoint.status),
    });
  }

  return activity.slice(-5).reverse();
}

function emptyStatesFor(state, recommendationReport) {
  const emptyStates = [];

  if (!state.request && !state.plan && !state.execution && !state.report) {
    emptyStates.push("No task started.");
  }

  if (!Array.isArray(recommendationReport.recommendations) || recommendationReport.recommendations.length === 0) {
    emptyStates.push("No Project Health recommendations.");
  }

  return emptyStates;
}

function statusSummaryFor(healthSummary, state) {
  const task = currentTaskFor(state);

  return [
    statusItem("Project", "Ready", "Project is selected."),
    statusItem("Readiness", plainStatus(healthSummary.overallStatus), healthSummary.summary),
    statusItem("Ready to work", healthSummary.readyToWork ? "Ready" : "Needs attention", readyDetail(healthSummary)),
    statusItem("Current task", plainStatus(task.status), task.detail),
  ];
}

function statusItem(label, value, detail) {
  return {
    label,
    value,
    detail,
  };
}

function readyDetail(healthSummary) {
  if (healthSummary.readyToWork) {
    return "Levi has no blocking Project Health signals.";
  }

  return "Review Project Health before starting work.";
}

function plainStatus(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "HEALTHY" || normalized === "READY" || normalized === "COMPLETED" || normalized === "APPROVED") {
    return "Ready";
  }

  if (normalized === "ATTENTION" || normalized === "PARTIAL" || normalized === "READY_FOR_REVIEW") {
    return "Needs attention";
  }

  if (normalized === "BLOCKED" || normalized === "FAILED" || normalized === "NOT_READY") {
    return "Blocked";
  }

  if (normalized === "EMPTY") {
    return "Not started";
  }

  return "Unknown";
}

function statusDetail(status, fallback) {
  const normalized = stringOrUnknown(status);
  return normalized === UNKNOWN ? fallback : `${fallback} Status: ${normalized}.`;
}

function loadRuntimeState(repositoryPath) {
  const filePath = path.join(repositoryPath, ".levi", "state.json");

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadMemoryRecords(repositoryPath) {
  const filePath = path.join(repositoryPath, ".levi", "memory.json");

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const project = store.projects && store.projects[projectIdFor(repositoryPath)];

  return project && Array.isArray(project.records) ? project.records : [];
}

function projectIdFor(repositoryPath) {
  return path.resolve(repositoryPath);
}

function listOrUnknown(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [UNKNOWN];
  }

  return value.map(stringOrUnknown).sort();
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

module.exports = {
  createHomeDashboardView,
  createHomeIntakePreview,
};
