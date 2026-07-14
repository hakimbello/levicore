const fs = require("node:fs");
const path = require("node:path");
const { createCodingExecutor } = require("./coding-executor");
const { createCompletionReport } = require("./completion-reporter");
const { createMemoryStore } = require("./memory-store");
const { checkScope } = require("./scope-checker");
const { approveTaskPlan, createTaskPlan } = require("./task-planner");
const { runValidation } = require("./validation-runner");

const APPROVED_REQUIREMENTS = [
  { id: "LC-MVP-001", title: "Repository Intake" },
  { id: "LC-MVP-002", title: "Repository Analysis" },
  { id: "LC-MVP-003", title: "Persistent Project Memory" },
  { id: "LC-MVP-004", title: "Scope Enforcement" },
  { id: "LC-MVP-005", title: "Task Planning" },
  { id: "LC-MVP-006", title: "Model Gateway and Routing" },
  { id: "LC-MVP-007", title: "Coding Execution" },
  { id: "LC-MVP-008", title: "Validation" },
  { id: "LC-MVP-009", title: "Completion Reporting" },
  { id: "LC-MVP-010", title: "Primary User Interface" },
];

function initializeProject(repositoryPath) {
  const state = loadState(repositoryPath);
  state.project = {
    root: repositoryPath,
    initialized: true,
  };
  saveState(repositoryPath, state);
  return state;
}

function inspectStatus(repositoryPath) {
  return loadState(repositoryPath);
}

function requestTask(repositoryPath, requirementId) {
  if (!requirementId) {
    throw new Error("Usage: levi request <repository-path> <requirement-id>");
  }

  const scope = checkScope({ requirementId }, APPROVED_REQUIREMENTS);

  if (!scope.proceedToPlanning) {
    return {
      exitCode: 1,
      payload: scope,
    };
  }

  const plan = createTaskPlan({
    requirementId,
    expectedFiles: ["UNKNOWN"],
    acceptanceCriteria: ["UNKNOWN"],
    validationCommands: ["UNKNOWN"],
    risks: ["UNKNOWN"],
    exclusions: ["UNKNOWN"],
  });
  const state = loadState(repositoryPath);
  state.request = { requirementId, scope };
  state.plan = plan;
  saveState(repositoryPath, state);
  return {
    exitCode: 0,
    payload: plan,
  };
}

function approvePlan(repositoryPath) {
  const state = loadState(repositoryPath);

  if (!state.plan) {
    throw new Error("No task plan exists to approve.");
  }

  state.plan = approveTaskPlan(state.plan);
  saveState(repositoryPath, state);
  return state.plan;
}

function executeApprovedPlan(repositoryPath) {
  const state = loadState(repositoryPath);

  if (!state.plan) {
    throw new Error("No approved task plan exists to execute.");
  }

  const executor = createCodingExecutor({
    repositoryRoot: repositoryPath,
    plannedFiles: [".levi/state.json"],
    limits: {
      maxSteps: 1,
      maxMilliseconds: 10000,
      maxCost: 1,
    },
  });

  return executor.execute({
    operations: [
      {
        type: "update",
        path: ".levi/state.json",
        content: `${JSON.stringify({ ...state, executed: true }, null, 2)}\n`,
        cost: 1,
      },
    ],
  });
}

function validateProject(repositoryPath, commandParts) {
  if (commandParts.length === 0) {
    throw new Error("Usage: levi validate <repository-path> <command>");
  }

  const validation = runValidation({
    repositoryRoot: repositoryPath,
    commands: [commandParts.join(" ")],
  });
  const state = loadState(repositoryPath);
  state.validation = validation;
  saveState(repositoryPath, state);
  return validation;
}

function reviewProject(repositoryPath) {
  const state = loadState(repositoryPath);

  if (!state.request || !state.validation) {
    throw new Error("A request and validation result are required before review.");
  }

  const report = createCompletionReport({
    requirementId: state.request.requirementId,
    filesChanged: [".levi/state.json"],
    changeSummary: "CLI workflow state updated.",
    validationResults: state.validation.results,
    knownFailures: state.validation.status === "FAILED" ? ["Validation failed."] : [],
    remainingWork: state.validation.status === "FAILED" ? ["Resolve failed validation."] : [],
    status: state.validation.status === "COMPLETED" ? "COMPLETED" : "FAILED",
  });
  const memoryStore = createMemoryStore(path.join(repositoryPath, ".levi", "memory.json"));

  if (report.status === "COMPLETED") {
    memoryStore.addRecord("default", {
      type: "task-outcome",
      source: {
        kind: "completion-report",
        requirementId: report.requirementId,
      },
      confidenceState: "VERIFIED",
      value: report,
    });
  }

  state.report = report;
  saveState(repositoryPath, state);
  return report;
}

function loadState(repositoryPath) {
  const filePath = statePath(repositoryPath);

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveState(repositoryPath, state) {
  const filePath = statePath(repositoryPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function statePath(repositoryPath) {
  return path.join(repositoryPath, ".levi", "state.json");
}

module.exports = {
  approvePlan,
  executeApprovedPlan,
  initializeProject,
  inspectStatus,
  requestTask,
  reviewProject,
  validateProject,
};
