const fs = require("node:fs");
const path = require("node:path");
const { createApprovalDecision, createApprovalSummary } = require("./approval-summary");
const { createCodeGenerationPipeline } = require("./code-generation-pipeline");
const { createCompletionReport, recordVerifiedTaskOutcome } = require("./completion-reporter");
const { buildContext } = require("./context-builder");
const { createContextPreview } = require("./context-preview");
const { createMemoryStore } = require("./memory-store");
const { createLocalReadinessReport } = require("./local-readiness-check");
const { createModelGateway } = require("./model-gateway");
const { summarizeProject } = require("./project-summary");
const { scanRepository } = require("./repository-scanner");
const { applySafePatch } = require("./safe-patch");
const { inspectRestorePoint, restoreFromRestorePoint } = require("./restore-points");
const { checkScope } = require("./scope-checker");
const { createTaskIntake } = require("./task-intake");
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
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb", ".java", ".cs"]);
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs"]);
const DEFAULT_LIMITS = {
  maxSteps: 10,
  maxMilliseconds: 10000,
  maxCost: 1,
};

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

function inspectLocalReadiness() {
  return createLocalReadinessReport();
}

function intakeTask(repositoryPath, taskTextParts) {
  if (!Array.isArray(taskTextParts) || taskTextParts.length === 0) {
    throw new Error("Usage: levi intake <repository-path> <task-description>");
  }

  return createTaskIntake({
    repositoryPath,
    taskText: taskTextParts.join(" "),
  });
}

function requestTask(repositoryPath, requirementId, requestArgs) {
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

  const repositorySummary = summarizeProject(scanRepository(repositoryPath));
  const expectedFile = normalizeExpectedPath(
    requestArgs && requestArgs.length > 0 ? requestArgs[0] : selectDefaultExpectedFile(repositorySummary),
  );
  const validationCommand =
    requestArgs && requestArgs.length > 1
      ? requestArgs.slice(1).join(" ")
      : defaultValidationCommand(expectedFile);
  const objective = `Apply an approved assistant change to ${expectedFile} for ${requirementId}.`;
  const plan = createTaskPlan({
    requirementId,
    objective,
    expectedFiles: [expectedFile],
    acceptanceCriteria: [`${expectedFile} is updated only through approved structured operations.`],
    validationCommands: [validationCommand],
    risks: ["Low: execution is limited to approved planned files and validation blocks completion."],
    exclusions: ["Do not change files outside the approved expected files."],
    plannedOperations: [plannedOperationSummary(repositoryPath, expectedFile)],
  });
  plan.scopeBoundaries = [`Only ${expectedFile} may be changed by the assistant patch.`];
  plan.approvalSummary = createApprovalSummary(plan);
  plan.approvalDecision = createApprovalDecision(plan);
  plan.contextPreview = createPreviewForPlan(repositoryPath, plan, repositorySummary);
  const state = loadState(repositoryPath);
  state.request = { requirementId, scope };
  state.plan = plan;
  state.repositorySummary = repositorySummary;
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
  state.plan.approvalSummary = createApprovalSummary(state.plan);
  state.plan.approvalDecision = createApprovalDecision(state.plan);
  state.plan.contextPreview = createPreviewForPlan(
    repositoryPath,
    state.plan,
    summarizeProject(scanRepository(repositoryPath)),
  );
  saveState(repositoryPath, state);
  return state.plan;
}

function executeApprovedPlan(repositoryPath) {
  const state = loadState(repositoryPath);

  if (!state.plan) {
    throw new Error("No approved task plan exists to execute.");
  }

  if (state.plan.approvalState !== "APPROVED") {
    throw new Error("Task plan must be APPROVED before execution.");
  }

  state.plan.approvalDecision = createApprovalDecision(state.plan);

  if (state.plan.approvalDecision.decision !== "APPROVED") {
    state.execution = {
      status: "FAILED",
      error: state.plan.approvalDecision.reason,
      approvalDecision: state.plan.approvalDecision,
    };
    saveState(repositoryPath, state);
    return state.execution;
  }

  const repositorySummary = summarizeProject(scanRepository(repositoryPath));
  const memoryStore = createMemoryStore(path.join(repositoryPath, ".levi", "memory.json"));
  const gateway = createModelGateway({
    providers: [createCliLocalProvider(repositoryPath, state.plan)],
    limits: {
      maxSpend: 1,
      maxIterations: 2,
    },
  });
  const pipeline = createCodeGenerationPipeline({ modelGateway: gateway });

  return pipeline
    .generate({
      projectId: "default",
      taskPlan: state.plan,
      approvedRequirements: APPROVED_REQUIREMENTS,
      projectSummary: repositorySummary,
      memoryStore,
    })
    .then((generation) => {
      const patch = applySafePatch({
        repositoryRoot: repositoryPath,
        plannedFiles: state.plan.expectedFiles,
        operations: generation.operations,
        requirementId: state.plan.requirementId,
        limits: {
          ...DEFAULT_LIMITS,
          maxSteps: Math.max(generation.operations.length, 1),
        },
      });

      state.generation = generation;
      state.patch = patch;

      if (patch.status !== "COMPLETED") {
        state.execution = {
          status: "FAILED",
          error: patch.error,
        };
        saveState(repositoryPath, state);
        return state.execution;
      }

      const validation = runValidation({
        repositoryRoot: repositoryPath,
        commands: state.plan.validationCommands,
      });
      const report = createCompletionReport({
        requirementId: state.plan.requirementId,
        filesChanged: patch.changes.filter((change) => change.changed).map((change) => change.path),
        changeSummary: patch.summary,
        validationResults: validation.results,
        knownFailures: validation.status === "FAILED" ? ["Validation failed."] : [],
        remainingWork: validation.status === "FAILED" ? ["Resolve failed validation."] : [],
        status: validation.status === "COMPLETED" ? "COMPLETED" : "FAILED",
      });
      const memoryRecord = recordVerifiedTaskOutcome(memoryStore, "default", report);

      state.repositorySummary = repositorySummary;
      state.validation = validation;
      state.report = report;
      state.memoryRecord = memoryRecord;
      state.execution = {
        status: report.status,
      };
      saveState(repositoryPath, state);

      return {
        status: report.status,
        generation,
        patch,
        validation,
        report,
        memoryRecord,
      };
    })
    .catch((error) => {
      state.execution = {
        status: "FAILED",
        error: error.message,
      };
      saveState(repositoryPath, state);
      return state.execution;
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

function inspectLatestRestorePoint(repositoryPath) {
  const state = loadState(repositoryPath);
  const restorePoint = latestRestorePoint(state);

  if (!restorePoint) {
    throw new Error("No restore point exists.");
  }

  return inspectRestorePoint(restorePoint);
}

function restoreProject(repositoryPath, restorePointId, confirmation) {
  const state = loadState(repositoryPath);
  const restorePoint = latestRestorePoint(state);

  if (!restorePoint) {
    throw new Error("No restore point exists.");
  }

  const restore = restoreFromRestorePoint({
    repositoryRoot: repositoryPath,
    restorePoint,
    restorePointId,
    confirmation,
  });

  state.restore = restore;
  saveState(repositoryPath, state);
  return restore;
}

function reviewProject(repositoryPath) {
  const state = loadState(repositoryPath);

  if (state.report) {
    return state.report;
  }

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

function latestRestorePoint(state) {
  if (state && state.patch && state.patch.restorePoint) {
    return state.patch.restorePoint;
  }

  return null;
}

function createPreviewForPlan(repositoryPath, plan, repositorySummary) {
  const memoryStore = createMemoryStore(path.join(repositoryPath, ".levi", "memory.json"));
  const context = buildContext({
    projectId: "default",
    taskPlan: plan,
    approvedRequirements: APPROVED_REQUIREMENTS,
    projectSummary: repositorySummary,
    memoryStore,
  });

  return createContextPreview(context);
}

function selectDefaultExpectedFile(repositorySummary) {
  const sourceFile = repositorySummary.files.find((file) => {
    if (!file || typeof file.path !== "string") {
      return false;
    }

    if (file.path.startsWith(".levi/")) {
      return false;
    }

    return SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase());
  });

  if (!sourceFile) {
    throw new Error("No supported source file exists for a default assistant task plan.");
  }

  return sourceFile.path;
}

function normalizeExpectedPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("Task request expected file is required.");
  }

  if (path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Task request expected file must be relative.");
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Task request expected file must stay inside the repository.");
  }

  return parts.join("/");
}

function defaultValidationCommand(expectedFile) {
  if (JAVASCRIPT_EXTENSIONS.has(path.extname(expectedFile).toLowerCase())) {
    return `node --check ${quoteCommandArg(expectedFile)}`;
  }

  return `node -e "require('node:fs').accessSync(process.argv[1])" ${quoteCommandArg(expectedFile)}`;
}

function quoteCommandArg(value) {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function createCliLocalProvider(repositoryPath, taskPlan) {
  return {
    name: "levi-local-planned-provider",
    type: "local",
    model: "levi-local-structured-operation",
    reason: "Local structured provider for the approved CLI assistant pipeline.",
    estimateCost() {
      return {
        amount: 0,
        costClass: "free-local",
      };
    },
    async sendRequest() {
      return {
        content: JSON.stringify({
          operations: taskPlan.expectedFiles.map((expectedFile) => plannedOperation(repositoryPath, expectedFile)),
        }),
        finishReason: "stop",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      };
    },
  };
}

function plannedOperation(repositoryPath, expectedFile) {
  const targetPath = path.join(repositoryPath, expectedFile);
  const exists = fs.existsSync(targetPath);
  const content = exists ? fs.readFileSync(targetPath, "utf8") : "";

  return {
    type: exists ? "update" : "create",
    path: expectedFile,
    content: nextContent(expectedFile, content),
  };
}

function plannedOperationSummary(repositoryPath, expectedFile) {
  const targetPath = path.join(repositoryPath, expectedFile);

  return {
    type: fs.existsSync(targetPath) ? "update" : "create",
    path: expectedFile,
  };
}

function nextContent(expectedFile, content) {
  const marker = markerForFile(expectedFile);

  if (content.includes(marker.trim())) {
    return content;
  }

  const separator = content === "" || content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}${marker}`;
}

function markerForFile(expectedFile) {
  const extension = path.extname(expectedFile).toLowerCase();

  if (JAVASCRIPT_EXTENSIONS.has(extension) || extension === ".ts" || extension === ".tsx") {
    return "// Levi assistant validated change\n";
  }

  if (extension === ".py" || extension === ".rb") {
    return "# Levi assistant validated change\n";
  }

  if (extension === ".css") {
    return "/* Levi assistant validated change */\n";
  }

  if (extension === ".html") {
    return "<!-- Levi assistant validated change -->\n";
  }

  return "Levi assistant validated change.\n";
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
  intakeTask,
  inspectLatestRestorePoint,
  inspectLocalReadiness,
  inspectStatus,
  requestTask,
  restoreProject,
  reviewProject,
  validateProject,
};
