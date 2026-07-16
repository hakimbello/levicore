const fs = require("node:fs");
const path = require("node:path");
const { intakeRepository } = require("./repository-intake");
const { scanRepository } = require("./repository-scanner");
const { summarizeProject } = require("./project-summary");
const { collectProjectHealthSignals, recommendProjectHealth, summarizeProjectHealth } = require("./project-health");
const { createTaskIntake } = require("./task-intake");
const { createApprovalDecision, createApprovalSummary } = require("./approval-summary");
const {
  approvePlan,
  executeApprovedPlan,
  inspectLatestRestorePoint,
  inspectLocalReadiness,
  requestTask,
  restoreProject,
} = require("./cli-workflow");

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
      taskPlan: state.plan,
      latestValidation: state.validation,
      readinessReport: state.readiness,
      providerHealth: state.providerHealth,
      fallbackDiagnostics: state.fallbackDiagnostics,
      costDecision: state.costDecision || state.plan && state.plan.budgetState,
      restorePoint: state.restorePoint || state.patch && state.patch.restorePoint,
      context: state.context || state.contextPreview,
      knownFailures: state.knownFailures || state.report && state.report.knownFailures,
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

function submitHomeRequest(repositoryPath, taskText) {
  if (!repositoryPath) {
    return {
      status: "ERROR",
      reason: "Select a project before creating a plan.",
      intake: {
        status: "ERROR",
        reason: "Select a project before creating a plan.",
      },
      plan: null,
    };
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return {
      status: "ERROR",
      reason: intake.error,
      intake: {
        status: "ERROR",
        reason: intake.error,
      },
      plan: null,
    };
  }

  const preview = createHomeIntakePreview(intake.path, taskText);

  if (preview.status !== "READY_FOR_PLANNING") {
    return {
      status: preview.status,
      reason: preview.reason,
      intake: preview,
      plan: null,
    };
  }

  try {
    const result = requestTask(intake.path, preview.originalRequest, []);

    if (result.exitCode !== 0) {
      const payload = result.payload || {};

      return {
        status: presentationText(payload.status || "ACTION_REQUIRED"),
        reason: presentationText(payload.reason || payload.scope && payload.scope.reason || preview.reason),
        intake: payload.intake || preview,
        plan: null,
      };
    }

    return {
      status: "PLAN_READY",
      reason: "Plan is ready for review.",
      intake: preview,
      plan: createPlanApprovalView(intake.path),
    };
  } catch (error) {
    return {
      status: "ERROR",
      reason: error.message,
      intake: preview,
      plan: null,
    };
  }
}

function createPlanApprovalView(repositoryPath, options = {}) {
  if (!repositoryPath) {
    return emptyPlanApprovalView(null, "Select a project before reviewing a plan.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return planApprovalErrorView(repositoryPath, intake.error);
  }

  try {
    const state = loadRuntimeState(intake.path);
    const view = planApprovalViewFor(intake.path, state);

    if (options.submitResult) {
      view.submitResult = options.submitResult;
    }

    return view;
  } catch (error) {
    return planApprovalErrorView(intake.path, error.message);
  }
}

function submitPlanApproval(repositoryPath, input = {}) {
  if (!repositoryPath) {
    return emptyPlanApprovalView(null, "Select a project before approving a plan.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return planApprovalErrorView(repositoryPath, intake.error);
  }

  const state = loadRuntimeState(intake.path);

  if (!state.plan) {
    return createPlanApprovalView(intake.path, {
      submitResult: {
        status: "EMPTY",
        message: "No plan exists to approve.",
      },
    });
  }

  const missingConfirmations = requiredConfirmationIds(state.plan).filter((id) => input[id] !== true);

  if (missingConfirmations.length > 0) {
    return createPlanApprovalView(intake.path, {
      submitResult: {
        status: "CONFIRMATION_REQUIRED",
        message: "Review and confirm the required approval items before continuing.",
        missingConfirmations,
      },
    });
  }

  const currentView = planApprovalViewFor(intake.path, state);

  if (!currentView.actions.canApprove) {
    return createPlanApprovalView(intake.path, {
      submitResult: {
        status: "BLOCKED",
        message: currentView.approval.nextRequiredAction,
      },
    });
  }

  state.plan = applyExplicitApprovalInputs(state.plan, input);
  saveRuntimeState(intake.path, state);

  if (state.plan.approvalState !== "APPROVED") {
    approvePlan(intake.path);
  } else {
    const refreshedState = loadRuntimeState(intake.path);
    refreshedState.plan = refreshPlanReviewFields(refreshedState.plan || approvedPlan);
    saveRuntimeState(intake.path, refreshedState);
  }

  const finalView = createPlanApprovalView(intake.path);
  const finalApprovalStatus = finalView.approval && finalView.approval.status;
  finalView.submitResult = {
    status: finalApprovalStatus === "APPROVED" ? "APPROVED" : "ACTION_REQUIRED",
    message:
      finalApprovalStatus === "APPROVED"
        ? "Plan approval was recorded."
        : "Plan approval was recorded. Review the remaining required action.",
  };

  return finalView;
}

function createExecutionCompletionView(repositoryPath) {
  if (!repositoryPath) {
    return emptyExecutionCompletionView(null, "Select a project before reviewing execution.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return executionCompletionErrorView(repositoryPath, intake.error);
  }

  try {
    const state = loadRuntimeState(intake.path);
    return executionCompletionViewFor(intake.path, state);
  } catch (error) {
    return executionCompletionErrorView(intake.path, error.message);
  }
}

async function startApprovedExecution(repositoryPath) {
  if (!repositoryPath) {
    return emptyExecutionCompletionView(null, "Select a project before starting execution.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return executionCompletionErrorView(repositoryPath, intake.error);
  }

  try {
    await executeApprovedPlan(intake.path);
    return createExecutionCompletionView(intake.path);
  } catch (error) {
    return executionCompletionErrorView(intake.path, error.message);
  }
}

function createProjectHealthView(repositoryPath) {
  if (!repositoryPath) {
    return emptyProjectHealthView(null, "Select a project before reviewing Project Health.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return projectHealthErrorView(repositoryPath, intake.error);
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
      taskPlan: state.plan,
      latestValidation: state.validation,
      readinessReport: state.readiness,
      providerHealth: state.providerHealth,
      fallbackDiagnostics: state.fallbackDiagnostics,
      costDecision: state.costDecision || state.plan && state.plan.budgetState,
      restorePoint: state.restorePoint || state.patch && state.patch.restorePoint,
      context: state.context || state.contextPreview,
      knownFailures: state.knownFailures || state.report && state.report.knownFailures,
    });
    const healthSummary = summarizeProjectHealth({ report: healthReport });
    const recommendationReport = recommendProjectHealth({ report: healthReport, summary: healthSummary });

    return projectHealthViewFor(intake.path, healthReport, healthSummary, recommendationReport);
  } catch (error) {
    return projectHealthErrorView(intake.path, error.message);
  }
}

function createRestoreHistoryView(repositoryPath, options = {}) {
  if (!repositoryPath) {
    return emptyRestoreHistoryView(null, "Select a project before reviewing History.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return restoreHistoryErrorView(repositoryPath, intake.error);
  }

  try {
    const state = loadRuntimeState(intake.path);
    const memoryRecords = loadHistoryMemoryRecords(intake.path);
    const restoreInspection = inspectLatestRestoreForHistory(intake.path);
    const view = restoreHistoryViewFor(intake.path, state, memoryRecords, restoreInspection);

    if (options.restoreResult) {
      view.restoreResult = options.restoreResult;
    }

    return view;
  } catch (error) {
    return restoreHistoryErrorView(intake.path, error.message);
  }
}

function submitRestoreConfirmation(repositoryPath, input = {}) {
  if (!repositoryPath) {
    return emptyRestoreHistoryView(null, "Select a project before restoring.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return restoreHistoryErrorView(repositoryPath, intake.error);
  }

  const currentView = createRestoreHistoryView(intake.path);
  const restorePointId = presentationText(input.restorePointId || currentView.restore && currentView.restore.id);

  if (!currentView.restore || !currentView.restore.available) {
    return createRestoreHistoryView(intake.path, {
      restoreResult: restoreSubmitResultFromError("Restore is unavailable for this project.", "UNAVAILABLE"),
    });
  }

  if (input.confirmRestore !== true) {
    return createRestoreHistoryView(intake.path, {
      restoreResult: {
        status: "CONFIRMATION_REQUIRED",
        label: "Confirmation required",
        headline: "Confirm before restoring",
        message: "Review the restore point and confirm that Levi should restore this version.",
        restoredFiles: [],
        fileCount: 0,
        internalState: "Levi internal state was not changed.",
        error: null,
      },
    });
  }

  try {
    const restoreResult = restoreProject(intake.path, restorePointId, "CONFIRM_RESTORE");
    return createRestoreHistoryView(intake.path, {
      restoreResult: restoreSubmitResultFor(restoreResult),
    });
  } catch (error) {
    return createRestoreHistoryView(intake.path, {
      restoreResult: restoreSubmitResultFromError(error.message),
    });
  }
}

function createAdvancedSettingsView(repositoryPath, options = {}) {
  if (!repositoryPath) {
    return emptyAdvancedSettingsView(null, "Select a project before opening Advanced Settings.");
  }

  const intake = intakeRepository(repositoryPath);

  if (!intake.ok) {
    return advancedSettingsErrorView(repositoryPath, intake.error);
  }

  try {
    const state = loadRuntimeState(intake.path);
    const memoryRecords = loadMemoryRecords(intake.path);
    const scanResult = scanRepository(intake.path);
    const projectSummary = summarizeProject(scanResult);
    const readinessReport = safeAdvancedReadinessReport();
    const healthReport = collectProjectHealthSignals({
      repositoryPath: intake.path,
      projectId: projectIdFor(intake.path),
      scanResult,
      projectSummary,
      state,
      memoryRecords,
      taskPlan: state.plan,
      latestValidation: state.validation,
      readinessReport,
      providerHealth: state.providerHealth,
      fallbackDiagnostics: state.fallbackDiagnostics,
      costDecision: state.costDecision || state.plan && state.plan.budgetState,
      restorePoint: state.restorePoint || state.patch && state.patch.restorePoint,
      context: state.context || state.contextPreview,
      knownFailures: state.knownFailures || state.report && state.report.knownFailures,
    });
    const healthSummary = summarizeProjectHealth({ report: healthReport });
    const recommendationReport = recommendProjectHealth({ report: healthReport, summary: healthSummary });
    const restoreInspection = inspectLatestRestoreForHistory(intake.path);
    const view = advancedSettingsViewFor({
      repositoryPath: intake.path,
      state,
      memoryRecords,
      projectSummary,
      readinessReport,
      healthSummary,
      recommendationReport,
      restoreInspection,
    });

    if (options.saveResult) {
      view.saveResult = options.saveResult;
      view.status = options.saveResult.status;
    }

    return view;
  } catch (error) {
    return advancedSettingsErrorView(intake.path, error.message);
  }
}

function submitAdvancedSettings(repositoryPath) {
  return createAdvancedSettingsView(repositoryPath, {
    saveResult: {
      status: "SAVE_FAILURE",
      label: "Save unavailable",
      message: "No approved writable settings are available in M32-008. Settings remain read-only.",
    },
  });
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
      statusItem("Readiness", "Unknown", "Project readiness is unavailable until a project is selected."),
      statusItem("Cost", "Unknown", "Cost evidence is unavailable until Levi can create a plan."),
      statusItem("Restore", "Unknown", "Restore evidence is unavailable until work is planned and executed."),
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

function emptyPlanApprovalView(repositoryPath, message) {
  return {
    status: "EMPTY",
    project: repositoryPath ? selectedProject(path.resolve(repositoryPath)) : {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    objective: UNKNOWN,
    summary: [
      message || "No plan exists yet.",
      "Create a plan from Home before approving work.",
    ],
    plan: emptyPlanSummary(),
    approval: {
      status: "EMPTY",
      label: "No plan",
      reason: message || "No task plan exists.",
      nextRequiredAction: "Create a plan before approval.",
    },
    validation: {
      status: "MISSING",
      label: "No validation planned",
      commands: [UNKNOWN],
    },
    cost: emptyCostSummary(),
    restore: emptyRestoreSummary(),
    decisions: emptyDecisionSummary(),
    contextEvidence: emptyContextEvidenceSummary(),
    risks: {
      status: "EMPTY",
      risks: [UNKNOWN],
      blockers: ["No task plan exists."],
    },
    destructive: emptyDestructiveSummary(),
    actions: {
      primaryLabel: "Approve",
      secondaryLabel: "Edit Request",
      canApprove: false,
      requiredConfirmations: [],
    },
  };
}

function planApprovalErrorView(repositoryPath, message) {
  return {
    ...emptyPlanApprovalView(repositoryPath, message || "Levi could not read the plan."),
    status: "ERROR",
    approval: {
      status: "ERROR",
      label: "Blocked",
      reason: message || "Levi could not read the plan.",
      nextRequiredAction: "Resolve the project error before approval.",
    },
    error: {
      title: "Plan could not be opened",
      detail: message || "Levi could not read the plan.",
    },
  };
}

function planApprovalViewFor(repositoryPath, state) {
  const plan = state.plan;

  if (!isPlainObject(plan)) {
    return emptyPlanApprovalView(repositoryPath, "No plan exists for this project yet.");
  }

  const approvalSummary = safeApprovalSummary(plan);
  const approvalDecision = safeApprovalDecision(plan);
  const operations = normalizedOperationsForUi(plan.plannedOperations);
  const operationCounts = operationCountsFor(operations);
  const plannedFiles = plannedFilesFor(plan, operations);
  const validation = validationSummaryFor(plan);
  const cost = costSummaryFor(plan);
  const restore = restoreSummaryFor(plan, state);
  const decisions = projectDecisionSummaryFor(plan);
  const destructive = destructiveSummaryFor(plan, approvalSummary);
  const contextEvidence = contextEvidenceSummaryFor(plan, state);
  const risks = riskSummaryFor(plan, approvalDecision, cost, decisions, destructive, validation);
  const requiredConfirmations = requiredConfirmationIds(plan);
  const canApprove = canSubmitPlanApproval(plan, approvalDecision, cost, decisions, requiredConfirmations);
  const objective = planObjectiveFor(plan, state);

  return {
    status: "READY",
    project: selectedProject(path.resolve(repositoryPath)),
    objective,
    summary: plainPlanSummaryFor({
      objective,
      operationCounts,
      validation,
      approvalDecision,
    }),
    plan: {
      requirementId: presentationText(plan.requirementId),
      originalRequest: presentationText(plan.originalRequest || state.request && state.request.intake && state.request.intake.originalRequest),
      taskType: presentationText(plan.taskType || state.request && state.request.intake && state.request.intake.taskType),
      approvalState: presentationText(plan.approvalState),
      acceptanceCriteria: textListOrUnknown(plan.acceptanceCriteria),
      operationCounts,
      plannedFiles,
    },
    approval: {
      status: presentationText(approvalDecision.decision),
      label: approvalLabel(approvalDecision.decision),
      reason: presentationText(approvalDecision.reason),
      nextRequiredAction: presentationText(approvalDecision.nextRequiredAction),
    },
    validation,
    cost,
    restore,
    decisions,
    contextEvidence,
    risks,
    destructive,
    actions: {
      primaryLabel: approvalDecision.decision === "APPROVED" && requiredConfirmations.length === 0 ? "Approved" : "Approve",
      secondaryLabel: "Edit Request",
      canApprove,
      requiredConfirmations,
    },
  };
}

function emptyPlanSummary() {
  return {
    requirementId: UNKNOWN,
    originalRequest: UNKNOWN,
    taskType: UNKNOWN,
    approvalState: UNKNOWN,
    acceptanceCriteria: [UNKNOWN],
    operationCounts: {
      create: UNKNOWN,
      update: UNKNOWN,
      delete: UNKNOWN,
      total: UNKNOWN,
    },
    plannedFiles: [],
  };
}

function emptyCostSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    detail: "No cost decision exists yet.",
    costClass: UNKNOWN,
    estimatedCost: UNKNOWN,
    budgetCeiling: UNKNOWN,
    approvalRequired: false,
    approved: false,
    blocked: false,
  };
}

function emptyRestoreSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    detail: "No restore point exists for the current task yet.",
    available: false,
  };
}

function emptyDecisionSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    reason: "No Project Decision constraints are attached to this plan.",
    constraints: [UNKNOWN],
    decisions: [],
  };
}

function emptyContextEvidenceSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    selectedFiles: [UNKNOWN],
    fileEvidence: [UNKNOWN],
    verifiedFacts: [UNKNOWN],
    projectKnowledge: [UNKNOWN],
    budget: UNKNOWN,
  };
}

function emptyDestructiveSummary() {
  return {
    status: "NOT_REQUIRED",
    label: "Not required",
    required: false,
    confirmed: false,
    actions: [],
  };
}

function safeApprovalSummary(plan) {
  try {
    return createApprovalSummary(plan);
  } catch (error) {
    return {
      text: null,
      details: {
        destructiveActions: [UNKNOWN],
        destructiveConfirmationRequired: UNKNOWN,
      },
      error: error.message,
    };
  }
}

function safeApprovalDecision(plan) {
  try {
    return createApprovalDecision(plan);
  } catch (error) {
    return {
      decision: "BLOCKED",
      reason: error.message,
      nextRequiredAction: "Update the plan before approval.",
    };
  }
}

function planObjectiveFor(plan, state) {
  return firstKnownText([
    plan.objective,
    plan.normalizedObjective,
    plan.originalRequest,
    state.request && state.request.intake && state.request.intake.normalizedObjective,
    state.request && state.request.intake && state.request.intake.originalRequest,
  ]);
}

function plainPlanSummaryFor(input) {
  const counts = input.operationCounts;
  const fileText = counts.total === UNKNOWN
    ? "Levi could not determine the planned file count."
    : `Levi will touch ${counts.total} planned file${counts.total === 1 ? "" : "s"}: ${counts.create} create, ${counts.update} update, ${counts.delete} delete.`;
  const validationText = input.validation.status === "MISSING"
    ? "Validation commands are not available yet."
    : `${input.validation.commands.length} validation command${input.validation.commands.length === 1 ? "" : "s"} will be checked before completion.`;

  return [
    `Levi will review work for: ${presentationText(input.objective)}.`,
    fileText,
    validationText,
    presentationText(input.approvalDecision.nextRequiredAction),
  ];
}

function normalizedOperationsForUi(operations) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations
    .filter(isPlainObject)
    .map((operation) => ({
      type: operationTypeFor(operation.type),
      path: relativePathText(operation.path),
      destructive: isDestructiveOperation(operation),
      confirmed: operation.destructiveConfirmation === true,
      detail: presentationText(operation.destructiveAction),
    }))
    .filter((operation) => operation.path !== UNKNOWN)
    .sort(compareOperationItems);
}

function operationTypeFor(value) {
  const normalized = stringOrUnknown(value).toLowerCase();
  return ["create", "update", "delete", "command"].includes(normalized) ? normalized : UNKNOWN;
}

function operationCountsFor(operations) {
  if (!operations.length) {
    return {
      create: UNKNOWN,
      update: UNKNOWN,
      delete: UNKNOWN,
      total: UNKNOWN,
    };
  }

  return {
    create: operations.filter((operation) => operation.type === "create").length,
    update: operations.filter((operation) => operation.type === "update").length,
    delete: operations.filter((operation) => operation.type === "delete").length,
    total: uniqueSorted(operations.map((operation) => operation.path)).length,
  };
}

function plannedFilesFor(plan, operations) {
  if (operations.length > 0) {
    return operations.map((operation) => ({
      path: operation.path,
      action: titleCase(operation.type),
      destructive: operation.destructive,
      confirmed: operation.confirmed,
    }));
  }

  return textListOrUnknown(plan.expectedFiles)
    .filter((filePath) => filePath !== UNKNOWN)
    .map((filePath) => ({
      path: relativePathText(filePath),
      action: UNKNOWN,
      destructive: false,
      confirmed: false,
    }));
}

function validationSummaryFor(plan) {
  const commands = textListOrUnknown(plan.validationCommands);
  const usableCommands = commands.filter((command) => command !== UNKNOWN);

  if (usableCommands.length === 0) {
    return {
      status: "MISSING",
      label: "Missing",
      commands: [UNKNOWN],
    };
  }

  return {
    status: "PLANNED",
    label: `${usableCommands.length} planned`,
    commands: usableCommands,
  };
}

function costSummaryFor(plan) {
  const budget = isPlainObject(plan.budgetState) ? plan.budgetState : null;
  const estimate = isPlainObject(plan.costEstimate) ? plan.costEstimate : null;

  if (!budget && !estimate) {
    return emptyCostSummary();
  }

  const status = budget ? stringOrUnknown(budget.status).toUpperCase() : costEstimateStatus(estimate);
  const costClass = presentationText(budget && budget.costClass ? budget.costClass : estimate && estimate.costClass);
  const estimatedCost = budget ? moneyText(budget.estimatedCost || budget.exactEstimate || budget.estimatedCostRange) : estimateText(estimate);
  const budgetCeiling = budget ? moneyText(budget.budgetCeiling) : UNKNOWN;
  const approved = plan.costApprovalState === "APPROVED";
  const approvalRequired = costRequiresApprovalForPlan(plan);
  const blocked = status === "BLOCKED";

  return {
    status,
    label: costLabel(status, costClass, approved),
    detail: presentationText(budget && (budget.reason || budget.recommendedNextStep) || "Cost evidence is available for review."),
    costClass,
    estimatedCost,
    budgetCeiling,
    approvalRequired,
    approved,
    blocked,
  };
}

function restoreSummaryFor(plan, state) {
  const restorePoint = plan.restorePoint || state.restorePoint || state.patch && state.patch.restorePoint;
  const planStatus = stringOrUnknown(plan.restorePointStatus);

  if (isPlainObject(restorePoint)) {
    const status = stringOrUnknown(restorePoint.status).toUpperCase();
    const ready = status === "CREATED" || status === "AVAILABLE";

    return {
      status,
      label: ready ? "Ready" : plainStatus(status),
      detail: ready ? "A Levi restore point is available." : "Restore point state needs review.",
      available: ready,
    };
  }

  if (planStatus !== UNKNOWN) {
    return {
      status: planStatus.toUpperCase(),
      label: plainStatus(planStatus),
      detail: presentationText(planStatus),
      available: ["CREATED", "AVAILABLE", "READY"].includes(planStatus.toUpperCase()),
    };
  }

  return emptyRestoreSummary();
}

function projectDecisionSummaryFor(plan) {
  const enforcement = isPlainObject(plan.decisionEnforcement) ? plan.decisionEnforcement : null;
  const constraints = textListOrUnknown(plan.decisionConstraints || enforcement && enforcement.constraints);

  if (!enforcement) {
    return {
      ...emptyDecisionSummary(),
      constraints,
    };
  }

  const status = stringOrUnknown(enforcement.status).toUpperCase();
  const decisions = Array.isArray(enforcement.decisions)
    ? enforcement.decisions.filter(isPlainObject).map((decision) => ({
        id: presentationText(decision.decisionId),
        category: presentationText(decision.category),
        statement: presentationText(decision.statement || decision.reason),
        status: presentationText(decision.status),
      }))
    : [];

  return {
    status,
    label: plainStatus(status),
    reason: presentationText(enforcement.reason),
    constraints,
    decisions,
  };
}

function destructiveSummaryFor(plan, approvalSummary) {
  const operations = normalizedOperationsForUi(plan.plannedOperations).filter((operation) => operation.destructive);
  const summaryActions = approvalSummary && approvalSummary.details
    ? textListOrUnknown(approvalSummary.details.destructiveActions).filter((entry) => !["NONE", UNKNOWN].includes(entry))
    : [];
  const actions = operations.length > 0
    ? operations.map((operation) => operation.detail !== UNKNOWN ? operation.detail : `${titleCase(operation.type)} ${operation.path}`)
    : summaryActions;
  const required = actions.length > 0;
  const confirmed = required && operations.length > 0 && operations.every((operation) => operation.confirmed);

  if (!required) {
    return emptyDestructiveSummary();
  }

  return {
    status: confirmed ? "CONFIRMED" : "REQUIRED",
    label: confirmed ? "Confirmed" : "Confirmation required",
    required: true,
    confirmed,
    actions,
  };
}

function contextEvidenceSummaryFor(plan, state) {
  const preview = isPlainObject(plan.contextPreview) ? plan.contextPreview : state.contextPreview;
  const details = preview && isPlainObject(preview.details) ? preview.details : null;
  const planEvidence = planEvidenceFor(plan);

  if (!details) {
    return {
      status: planEvidence.length > 0 ? "AVAILABLE" : "UNKNOWN",
      label: planEvidence.length > 0 ? "Available" : "Unknown",
      selectedFiles: textListOrUnknown(plan.expectedFiles),
      fileEvidence: planEvidence.length > 0 ? planEvidence : [UNKNOWN],
      verifiedFacts: [UNKNOWN],
      projectKnowledge: [UNKNOWN],
      budget: UNKNOWN,
    };
  }

  const verifiedFacts = details.factGroups && Array.isArray(details.factGroups.verified)
    ? details.factGroups.verified
    : [];
  const projectKnowledge = Array.isArray(details.verifiedMemory) ? details.verifiedMemory : [];

  return {
    status: "AVAILABLE",
    label: "Available",
    selectedFiles: textListOrUnknown(details.selectedFiles),
    fileEvidence: textListOrUnknown(details.fileEvidence),
    verifiedFacts: textListOrUnknown(verifiedFacts).filter((entry) => entry !== "NONE").slice(0, 6),
    projectKnowledge: textListOrUnknown(projectKnowledge).filter((entry) => entry !== "NONE").slice(0, 4),
    budget: contextBudgetText(details.contextBudget),
  };
}

function planEvidenceFor(plan) {
  if (!Array.isArray(plan.evidence)) {
    return [];
  }

  return plan.evidence
    .filter(isPlainObject)
    .map((entry) => {
      const filePath = relativePathText(entry.file || entry.path);
      const source = presentationText(entry.source);
      return filePath === UNKNOWN ? UNKNOWN : source === UNKNOWN ? filePath : `${filePath} (${source})`;
    })
    .filter((entry) => entry !== UNKNOWN)
    .sort();
}

function riskSummaryFor(plan, approvalDecision, cost, decisions, destructive, validation) {
  const risks = textListOrUnknown(plan.risks);
  const blockers = [];

  if (approvalDecision.decision === "BLOCKED") {
    blockers.push(presentationText(approvalDecision.reason));
  }

  if (cost.blocked) {
    blockers.push(presentationText(cost.detail));
  }

  if (decisions.status === "BLOCKED") {
    blockers.push(presentationText(decisions.reason));
  }

  if (validation.status === "MISSING") {
    blockers.push("Validation commands are UNKNOWN.");
  }

  if (destructive.required && !destructive.confirmed) {
    blockers.push("Destructive actions require separate confirmation.");
  }

  const usableBlockers = uniqueSorted(blockers.filter((entry) => entry !== UNKNOWN));

  return {
    status: usableBlockers.length > 0 ? "ACTION_REQUIRED" : "CLEAR",
    risks,
    blockers: usableBlockers.length > 0 ? usableBlockers : ["No blockers reported by Levi Core."],
  };
}

function approvalLabel(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "APPROVED") {
    return "Approved";
  }

  if (normalized === "APPROVAL_REQUIRED") {
    return "Approval required";
  }

  if (normalized === "DESTRUCTIVE_CONFIRMATION_REQUIRED") {
    return "Destructive confirmation required";
  }

  if (normalized === "BLOCKED") {
    return "Blocked";
  }

  return "Needs review";
}

function requiredConfirmationIds(plan) {
  const confirmations = [];

  if (destructiveRequiresConfirmationForPlan(plan)) {
    confirmations.push("destructiveConfirmed");
  }

  if (costRequiresApprovalForPlan(plan)) {
    confirmations.push("costApproved");
  }

  return confirmations;
}

function destructiveRequiresConfirmationForPlan(plan) {
  const operations = normalizedOperationsForUi(plan.plannedOperations).filter((operation) => operation.destructive);
  return operations.length > 0 && operations.some((operation) => !operation.confirmed);
}

function costRequiresApprovalForPlan(plan) {
  if (plan.costApprovalState === "APPROVED") {
    return false;
  }

  if (isPlainObject(plan.budgetState) && plan.budgetState.status === "APPROVAL_REQUIRED") {
    return true;
  }

  return isPlainObject(plan.costEstimate) && plan.costEstimate.costClass === UNKNOWN;
}

function canSubmitPlanApproval(plan, approvalDecision, cost, decisions, requiredConfirmations) {
  if (!isPlainObject(plan)) {
    return false;
  }

  if (approvalDecision.decision === "BLOCKED" || cost.blocked || decisions.status === "BLOCKED") {
    return false;
  }

  if (approvalDecision.decision === "APPROVED" && requiredConfirmations.length === 0) {
    return false;
  }

  return true;
}

function applyExplicitApprovalInputs(plan, input) {
  const updated = {
    ...plan,
  };

  if (input.costApproved === true && costRequiresApprovalForPlan(plan)) {
    updated.costApprovalState = "APPROVED";
  }

  if (input.destructiveConfirmed === true && Array.isArray(plan.plannedOperations)) {
    updated.plannedOperations = plan.plannedOperations.map((operation) => {
      if (!isPlainObject(operation) || !isDestructiveOperation(operation)) {
        return operation;
      }

      return {
        ...operation,
        destructiveConfirmation: true,
      };
    });
  }

  return updated;
}

function refreshPlanReviewFields(plan) {
  if (!isPlainObject(plan)) {
    return plan;
  }

  const refreshed = {
    ...plan,
  };

  try {
    refreshed.approvalSummary = createApprovalSummary(refreshed);
    refreshed.approvalDecision = createApprovalDecision(refreshed);
  } catch (error) {
    refreshed.approvalDecision = {
      decision: "BLOCKED",
      reason: error.message,
      nextRequiredAction: "Update the plan before execution.",
    };
  }

  return refreshed;
}

function isDestructiveOperation(operation) {
  return Boolean(
    isPlainObject(operation) &&
      (operation.type === "delete" ||
        operation.destructive === true ||
        operation.irreversible === true ||
        operation.overwrite === true ||
        operation.broadRewrite === true),
  );
}

function costEstimateStatus(estimate) {
  if (!isPlainObject(estimate)) {
    return UNKNOWN;
  }

  return estimate.costClass === UNKNOWN ? "APPROVAL_REQUIRED" : "KNOWN";
}

function costLabel(status, costClass, approved) {
  if (approved) {
    return "Approved";
  }

  if (status === "ALLOWED") {
    return costClass.toUpperCase && costClass.toUpperCase().includes("FREE") ? "Free" : "Allowed";
  }

  if (status === "APPROVAL_REQUIRED") {
    return "Approval required";
  }

  if (status === "BLOCKED") {
    return "Blocked";
  }

  if (status === "KNOWN") {
    return "Known";
  }

  return "Unknown";
}

function moneyText(value) {
  if (!isPlainObject(value)) {
    return presentationText(value);
  }

  if (Number.isFinite(value.amount) && typeof value.currency === "string") {
    return `${value.currency} ${value.amount}`;
  }

  if (Number.isFinite(value.min) && Number.isFinite(value.max) && typeof value.currency === "string") {
    return `${value.currency} ${value.min}-${value.max}`;
  }

  return UNKNOWN;
}

function estimateText(estimate) {
  if (!isPlainObject(estimate)) {
    return UNKNOWN;
  }

  return moneyText(estimate.exactCost || estimate.estimatedCostRange);
}

function contextBudgetText(budget) {
  if (!isPlainObject(budget)) {
    return UNKNOWN;
  }

  const facts = presentationText(budget.repositoryFacts);
  const knowledge = presentationText(budget.memoryRecords);
  const characters = presentationText(budget.serializedCharacters);
  return `Facts ${facts}; Project Knowledge ${knowledge}; characters ${characters}`;
}

function firstKnownText(values) {
  for (const value of values) {
    const text = presentationText(value);

    if (text !== UNKNOWN) {
      return text;
    }
  }

  return UNKNOWN;
}

function textListOrUnknown(value) {
  const values = collectionTextValues(value).map(presentationText).filter((entry) => entry !== UNKNOWN);
  return values.length > 0 ? uniqueSorted(values) : [UNKNOWN];
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function relativePathText(value) {
  const text = presentationText(value);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  const slashPath = text.replace(/\\/g, "/");

  if (path.isAbsolute(text) || /^[A-Za-z]:\//.test(slashPath)) {
    return path.basename(text) || UNKNOWN;
  }

  const parts = slashPath.split("/").filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return UNKNOWN;
  }

  return parts.join("/");
}

function presentationText(value) {
  return stringOrUnknown(value)
    .replace(/\bproviders?\b/gi, "model setup")
    .replace(/\bprompt(?:s|ing)?\b/gi, "request")
    .replace(/\bpatch(?:es)?\b/gi, "change set")
    .replace(/\bmemory\b/gi, "Project Knowledge");
}

function compareOperationItems(left, right) {
  if (left.type !== right.type) {
    return left.type.localeCompare(right.type);
  }

  return left.path.localeCompare(right.path);
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

function emptyProjectHealthView(repositoryPath, message) {
  return {
    status: "EMPTY",
    project: repositoryPath ? selectedProject(path.resolve(repositoryPath)) : {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    headline: "No Project Health evidence",
    readiness: {
      status: "EMPTY",
      label: "Not started",
      detail: message || "Project Health evidence is not available yet.",
    },
    summary: message || "Project Health evidence is not available yet.",
    counts: emptyHealthCounts(),
    knownProblems: [],
    cards: projectHealthCardsFor([]),
    recommendations: groupedHealthRecommendations([], []),
    evidenceReferences: [],
    actions: projectHealthActionsFor("EMPTY", []),
  };
}

function projectHealthErrorView(repositoryPath, message) {
  return {
    ...emptyProjectHealthView(repositoryPath, message || "Levi could not read Project Health."),
    status: "ERROR",
    headline: "Project Health needs attention",
    readiness: {
      status: "ERROR",
      label: "Blocked",
      detail: message || "Levi could not read Project Health.",
    },
    summary: message || "Levi could not read Project Health.",
    actions: projectHealthActionsFor("ERROR", []),
    error: {
      title: "Project Health could not be opened",
      detail: message || "Levi could not read Project Health.",
    },
  };
}

function projectHealthViewFor(repositoryPath, report, summary, recommendationReport) {
  const signals = Array.isArray(report.signals) ? report.signals : [];
  const status = stringOrUnknown(summary.overallStatus);
  const recommendations = Array.isArray(recommendationReport.recommendations)
    ? recommendationReport.recommendations
    : [];

  return {
    status,
    project: selectedProject(path.resolve(repositoryPath)),
    headline: projectHealthHeadline(status),
    readiness: {
      status,
      label: projectHealthReadinessLabel(status),
      detail: projectHealthReadinessDetail(status, summary),
    },
    summary: presentationText(summary.summary),
    counts: healthCountsFor(summary.signalCounts),
    knownProblems: knownProblemsFor(summary, signals),
    cards: projectHealthCardsFor(signals),
    recommendations: groupedHealthRecommendations(recommendations, signals),
    evidenceReferences: healthEvidenceReferences(summary.evidenceReferences),
    actions: projectHealthActionsFor(status, recommendations),
  };
}

function projectHealthHeadline(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "HEALTHY") {
    return "Project is healthy";
  }

  if (normalized === "ATTENTION") {
    return "Project needs attention";
  }

  if (normalized === "BLOCKED") {
    return "Project is blocked";
  }

  return "Project health is unknown";
}

function projectHealthReadinessLabel(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "HEALTHY") {
    return "Ready to Build";
  }

  if (normalized === "ATTENTION") {
    return "Needs Attention";
  }

  if (normalized === "BLOCKED") {
    return "Blocked";
  }

  if (normalized === "EMPTY") {
    return "Not Started";
  }

  return "Needs Evidence";
}

function projectHealthReadinessDetail(status, summary) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "HEALTHY") {
    return "Levi has no blocking Project Health signals.";
  }

  if (normalized === "ATTENTION") {
    return presentationText(summary.summary || "Review the warnings before continuing.");
  }

  if (normalized === "BLOCKED") {
    return presentationText(summary.summary || "Resolve blockers before continuing.");
  }

  return presentationText(summary.summary || "Gather missing evidence before relying on Project Health.");
}

function healthCountsFor(counts) {
  const source = isPlainObject(counts) ? counts : {};

  return {
    healthy: numberOrZero(source.HEALTHY),
    attention: numberOrZero(source.ATTENTION),
    blocked: numberOrZero(source.BLOCKED),
    unknown: numberOrZero(source.UNKNOWN),
  };
}

function emptyHealthCounts() {
  return {
    healthy: 0,
    attention: 0,
    blocked: 0,
    unknown: 0,
  };
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

function knownProblemsFor(summary, signals) {
  const issues = Array.isArray(summary.highestSeverityIssues) ? summary.highestSeverityIssues : [];
  const knownFailureSignals = Array.isArray(signals)
    ? signals.filter((signal) => signal.category === "problems" && signal.status !== "HEALTHY")
    : [];
  const sourceIssues = issues.length > 0 ? issues : knownFailureSignals;

  return sourceIssues.slice(0, 5).map((issue) => ({
    id: stringOrUnknown(issue.signalId || issue.id),
    status: stringOrUnknown(issue.status),
    label: presentationText(issue.label),
    detail: presentationText(issue.detail),
    evidence: healthEvidenceReferences(issue.evidence),
    timestamp: timestampOrUnknown(issue.timestamp),
  }));
}

function projectHealthCardsFor(signals) {
  const cards = [
    {
      id: "validation",
      title: "Validation",
      subtitle: "Build and test evidence",
      matcher: (signal) => signal.category === "validation",
    },
    {
      id: "restore",
      title: "Restore",
      subtitle: "Recovery readiness",
      matcher: (signal) => signal.category === "restore",
    },
    {
      id: "project-knowledge",
      title: "Project Knowledge",
      subtitle: "Approved project facts",
      matcher: (signal) => signal.signalId && signal.signalId.includes("project-knowledge"),
    },
    {
      id: "durable-decisions",
      title: "Durable Decisions",
      subtitle: "Approved project constraints",
      matcher: (signal) => signal.signalId && signal.signalId.includes("durable-decision"),
    },
    {
      id: "structural-index",
      title: "Structural Index",
      subtitle: "Repository structure evidence",
      matcher: (signal) => signal.category === "structure",
    },
    {
      id: "provider-readiness",
      title: "Provider Readiness",
      subtitle: "Model setup readiness",
      matcher: (signal) => signal.category === "provider",
    },
    {
      id: "context-quality",
      title: "Context Quality",
      subtitle: "Context budget and cache evidence",
      matcher: (signal) => signal.category === "context",
    },
  ];

  return cards.map((card) => {
    const cardSignals = Array.isArray(signals) ? signals.filter(card.matcher).map(healthSignalForUi) : [];
    const status = combinedHealthStatus(cardSignals);
    const attentionSignal = cardSignals.find((signal) => signal.status === "BLOCKED" || signal.status === "ATTENTION" || signal.status === "UNKNOWN");
    const primarySignal = attentionSignal || cardSignals[0];
    const evidence = cardSignals.flatMap((signal) => signal.evidence).slice(0, 3);

    return {
      id: card.id,
      title: card.title,
      subtitle: card.subtitle,
      status,
      label: plainStatus(status),
      explanation: primarySignal ? primarySignal.detail : `${card.title} evidence is UNKNOWN.`,
      evidenceSummary: evidence.length > 0 ? evidence.map(evidenceText) : ["Evidence is UNKNOWN."],
      signals: cardSignals,
    };
  });
}

function healthSignalForUi(signal) {
  return {
    id: stringOrUnknown(signal.signalId),
    category: presentationText(signal.category),
    status: stringOrUnknown(signal.status),
    label: presentationText(signal.label),
    detail: presentationText(signal.detail),
    evidence: healthEvidenceReferences(signal.evidence),
    timestamp: timestampOrUnknown(signal.timestamp),
  };
}

function combinedHealthStatus(signals) {
  const statuses = Array.isArray(signals) ? signals.map((signal) => stringOrUnknown(signal.status).toUpperCase()) : [];

  if (statuses.includes("BLOCKED")) {
    return "BLOCKED";
  }

  if (statuses.includes("ATTENTION")) {
    return "ATTENTION";
  }

  if (statuses.includes("UNKNOWN") || statuses.length === 0) {
    return "UNKNOWN";
  }

  return "HEALTHY";
}

function groupedHealthRecommendations(recommendations, signals) {
  const groups = {
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const recommendation of Array.isArray(recommendations) ? recommendations : []) {
    const priority = stringOrUnknown(recommendation.priority).toUpperCase();
    const groupKey = Object.prototype.hasOwnProperty.call(groups, priority) ? priority : "LOW";
    groups[groupKey].push(healthRecommendationForUi(recommendation, signals));
  }

  return Object.entries(groups).map(([priority, items]) => ({
    priority,
    label: titleCase(priority),
    items: items.sort((left, right) => left.title.localeCompare(right.title)),
  }));
}

function healthRecommendationForUi(recommendation, signals) {
  const relatedSignalIds = textListOrUnknown(recommendation.supportingSignalIds).filter((entry) => entry !== UNKNOWN);
  const relatedSignals = Array.isArray(signals)
    ? signals.filter((signal) => relatedSignalIds.includes(signal.signalId))
    : [];
  const timestamp = latestHealthTimestamp(relatedSignals);

  return {
    id: stringOrUnknown(recommendation.recommendationId || recommendation.id),
    title: healthRecommendationTitle(recommendation),
    reason: presentationText(recommendation.reason),
    action: presentationText(recommendation.action),
    relatedSignalIds,
    supportingEvidence: healthEvidenceReferences(recommendation.evidenceReferences),
    timestamp,
  };
}

function healthRecommendationTitle(recommendation) {
  const category = presentationText(recommendation.category);
  const priority = titleCase(recommendation.priority);

  if (category === UNKNOWN) {
    return priority === UNKNOWN ? "Review Project Health" : `${priority} priority`;
  }

  return `${titleCase(category)} needs review`;
}

function latestHealthTimestamp(signals) {
  const timestamps = Array.isArray(signals)
    ? signals.map((signal) => timestampOrUnknown(signal.timestamp)).filter((timestamp) => timestamp !== UNKNOWN).sort()
    : [];

  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : UNKNOWN;
}

function healthEvidenceReferences(references) {
  const values = Array.isArray(references) ? references : [];
  const seen = new Set();
  const normalized = [];

  for (const reference of values) {
    if (!isPlainObject(reference)) {
      continue;
    }

    const source = relativePathText(reference.source);
    const signal = presentationText(reference.signal);
    const signalId = stringOrUnknown(reference.signalId);
    const label = presentationText(reference.label);
    const key = `${signalId}:${source}:${signal}`;

    if (source === UNKNOWN && signal === UNKNOWN || seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push({
      signalId,
      label,
      source,
      signal,
      text: evidenceText({ source, signal }),
    });
  }

  return normalized.slice(0, 8);
}

function evidenceText(reference) {
  const source = presentationText(reference.source);
  const signal = presentationText(reference.signal);

  if (source === UNKNOWN) {
    return signal;
  }

  if (signal === UNKNOWN) {
    return source;
  }

  return `${source}: ${signal}`;
}

function timestampOrUnknown(value) {
  return stringOrUnknown(value);
}

function projectHealthActionsFor(status, recommendations) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "HEALTHY") {
    return {
      primary: {
        label: "Start New Task",
        href: "#new-task",
      },
    };
  }

  if (normalized === "EMPTY" || normalized === "ERROR") {
    return {
      primary: {
        label: "Return Home",
        href: "#home",
      },
    };
  }

  return {
    primary: {
      label: Array.isArray(recommendations) && recommendations.length > 0 ? "Review Next Step" : "Review Evidence",
      target: "recommendations",
    },
  };
}

function emptyAdvancedSettingsView(repositoryPath, message) {
  return {
    status: "EMPTY",
    mode: "EMPTY",
    project: repositoryPath ? selectedProject(path.resolve(repositoryPath)) : {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    headline: "Advanced Settings",
    summary: message || "Advanced Settings are optional and need a selected project.",
    readiness: {
      status: "EMPTY",
      label: "Not started",
      detail: message || "Select a project before reviewing expert settings.",
    },
    groups: [],
    diagnostics: {
      summaryText: "Advanced Settings summary\nProject: No project selected\nWritable settings: none approved in M32-008.",
    },
    writableSettings: [],
    readOnlySettings: ["Settings are unavailable until a project is selected."],
    actions: advancedSettingsActionsFor(false),
    saveResult: null,
  };
}

function advancedSettingsErrorView(repositoryPath, message) {
  return {
    ...emptyAdvancedSettingsView(repositoryPath, message || "Levi could not read Advanced Settings."),
    status: "ERROR",
    mode: "ERROR",
    headline: "Advanced Settings need attention",
    readiness: {
      status: "ERROR",
      label: "Blocked",
      detail: message || "Levi could not read Advanced Settings.",
    },
    summary: message || "Levi could not read Advanced Settings.",
    actions: advancedSettingsActionsFor(false),
    error: {
      title: "Advanced Settings could not be opened",
      detail: message || "Levi could not read Advanced Settings.",
    },
  };
}

function advancedSettingsViewFor(input) {
  const provider = providerSettingsSummaryFor(input.readinessReport, input.state);
  const cost = costSettingsSummaryFor(input.state);
  const context = contextSettingsSummaryFor(input.state, input.memoryRecords, input.projectSummary);
  const workflow = workflowSettingsGroup();
  const appearance = appearanceSettingsGroup();
  const diagnostics = diagnosticsSettingsGroup({
    repositoryPath: input.repositoryPath,
    provider,
    cost,
    context,
    healthSummary: input.healthSummary,
    recommendationReport: input.recommendationReport,
    restoreInspection: input.restoreInspection,
    readinessReport: input.readinessReport,
  });
  const groups = [
    workflow,
    provider.group,
    cost.group,
    context.group,
    appearance,
    diagnostics.group,
  ];
  const mode = advancedSettingsModeFor(provider, cost);
  const diagnosticSummary = diagnosticSummaryTextFor({
    repositoryPath: input.repositoryPath,
    provider,
    cost,
    context,
    healthSummary: input.healthSummary,
    restoreInspection: input.restoreInspection,
  });

  return {
    status: "READY",
    mode,
    project: selectedProject(path.resolve(input.repositoryPath)),
    headline: "Advanced Settings",
    summary: "Optional expert diagnostics and preferences. The primary workflow stays unchanged.",
    readiness: {
      status: mode,
      label: advancedSettingsModeLabel(mode),
      detail: advancedSettingsModeDetail(mode, provider, cost),
    },
    groups,
    diagnostics: {
      summaryText: diagnosticSummary,
    },
    writableSettings: [],
    readOnlySettings: groups.flatMap((group) => group.items.map((item) => item.label)),
    actions: advancedSettingsActionsFor(false),
    saveResult: null,
  };
}

function workflowSettingsGroup() {
  return settingsGroup({
    id: "workflow",
    title: "Workflow",
    status: "READY",
    label: "Guided",
    summary: "Levi keeps planning, approval, restore, and safety decisions inside Levi Core.",
    items: [
      settingsItem("Default workflow preference", "Guided planning", "Create a plan, review it, then approve before execution.", "locked"),
      settingsItem("Guided Plan mode", "On", "Plan review remains part of the primary task workflow.", "locked"),
      settingsItem("Approval behavior", "Core-owned", "Task approval, cost approval, and destructive confirmation stay separate.", "locked"),
      settingsItem("Destructive confirmation", "Mandatory", "Destructive or irreversible work cannot bypass explicit confirmation.", "locked"),
      settingsItem("Restore protections", "Locked", "Restore inspection and restoration remain Levi Core workflows.", "locked"),
      settingsItem("Safety rules", "Locked", "Safety protections are status only here and cannot be disabled.", "locked"),
    ],
    details: [
      "Quick Build is not shown because PLAN.md does not approve it for M32-008.",
      "No request-construction, low-level change, or routing controls are exposed.",
    ],
  });
}

function providerSettingsSummaryFor(readinessReport, state) {
  const readiness = normalizeReadinessReport(readinessReport);
  const providers = readiness.providers;
  const registered = Array.isArray(providers.registered) ? providers.registered : [];
  const localProviders = Array.isArray(providers.localProviders) ? providers.localProviders : [];
  const defaultProvider = isPlainObject(providers.defaultProvider) ? providers.defaultProvider : registered[0];
  const missingRequiredModels = readiness.models && Array.isArray(readiness.models.missingRequiredModels)
    ? readiness.models.missingRequiredModels
    : [];
  const status = providerSettingsStatusFor(readiness, registered, localProviders, missingRequiredModels);
  const fallback = fallbackSummaryFor(state, registered);
  const group = settingsGroup({
    id: "models-providers",
    title: "Models and Providers",
    status,
    label: providerSettingsLabel(status),
    summary: providerSettingsDetail(status, readiness, missingRequiredModels),
    items: [
      settingsItem("Current provider", providerNameText(defaultProvider, registered), "Provider choice is reported by Levi Core.", "readonly"),
      settingsItem("Current model", providerModelText(defaultProvider), "Model evidence comes from Core readiness diagnostics.", "readonly"),
      settingsItem("Local-first preference", "On", "Levi's public provider order prefers local model setup first.", "locked"),
      settingsItem("Fallback summary", fallback.label, fallback.detail, "readonly"),
      settingsItem("Provider health", providerHealthText(state, readiness), "Health is shown as status; setup is not part of the primary workflow.", "readonly"),
      settingsItem("Readiness status", presentationText(readiness.overallReadiness), providerSettingsDetail(status, readiness, missingRequiredModels), "readonly"),
    ],
    details: providerSettingsDetails(readiness, registered),
  });

  return {
    status,
    label: providerSettingsLabel(status),
    detail: providerSettingsDetail(status, readiness, missingRequiredModels),
    currentProvider: providerNameText(defaultProvider, registered),
    currentModel: providerModelText(defaultProvider),
    fallback,
    group,
  };
}

function providerSettingsStatusFor(readiness, registered, localProviders, missingRequiredModels) {
  if (registered.length === 0 || localProviders.length === 0) {
    return "NO_PROVIDER";
  }

  if (readiness.runtime && (readiness.runtime.installed === false || readiness.runtime.running === false)) {
    return "PROVIDER_UNAVAILABLE";
  }

  if (missingRequiredModels.length > 0) {
    return "LOCAL_MODEL_UNAVAILABLE";
  }

  if (readiness.overallReadiness === "READY") {
    return "READY";
  }

  if (readiness.overallReadiness === "NOT_READY") {
    return "PROVIDER_UNAVAILABLE";
  }

  return "UNKNOWN";
}

function providerSettingsLabel(status) {
  const labels = {
    NO_PROVIDER: "No provider",
    PROVIDER_UNAVAILABLE: "Unavailable",
    LOCAL_MODEL_UNAVAILABLE: "Local model unavailable",
    READY: "Ready",
    UNKNOWN: "Unknown",
  };

  return labels[status] || "Unknown";
}

function providerSettingsDetail(status, readiness, missingRequiredModels) {
  if (status === "NO_PROVIDER") {
    return "No local model setup is registered through Levi Core.";
  }

  if (status === "PROVIDER_UNAVAILABLE") {
    if (readiness.runtime && readiness.runtime.installed === false) {
      return "The local runtime is not installed.";
    }

    if (readiness.runtime && readiness.runtime.running === false) {
      return "The local runtime is not running.";
    }

    return "Provider readiness is not available.";
  }

  if (status === "LOCAL_MODEL_UNAVAILABLE") {
    return `Missing required local model: ${missingRequiredModels.join(", ")}.`;
  }

  if (status === "READY") {
    return "Levi Core reports a usable local model setup.";
  }

  return "Provider readiness evidence is UNKNOWN.";
}

function providerNameText(provider, registered) {
  if (!isPlainObject(provider)) {
    return Array.isArray(registered) && registered.length === 0 ? "No provider configured" : UNKNOWN;
  }

  const name = presentationText(provider.name);
  const type = presentationText(provider.type);

  if (name === UNKNOWN && type === UNKNOWN) {
    return UNKNOWN;
  }

  return type === UNKNOWN ? name : `${name} (${type})`;
}

function providerModelText(provider) {
  return isPlainObject(provider) ? presentationText(provider.model) : UNKNOWN;
}

function providerHealthText(state, readiness) {
  const providerHealth = state && state.providerHealth;

  if (isPlainObject(providerHealth) && isPlainObject(providerHealth.summary)) {
    const summary = providerHealth.summary;
    return `${numberOrZero(summary.healthy)} healthy, ${numberOrZero(summary.unavailable)} unavailable, ${numberOrZero(summary.unknown)} unknown`;
  }

  if (readiness.overallReadiness !== UNKNOWN) {
    return presentationText(readiness.overallReadiness);
  }

  return UNKNOWN;
}

function fallbackSummaryFor(state, registered) {
  const diagnostics = state && state.fallbackDiagnostics;

  if (isPlainObject(diagnostics)) {
    return {
      label: presentationText(diagnostics.fallbackExecutionStatus || (diagnostics.fallbackExecutionAvailable ? "AVAILABLE" : "UNAVAILABLE")),
      detail: presentationText(diagnostics.reason || diagnostics.fallbackSelectionReason),
    };
  }

  if (Array.isArray(registered) && registered.length > 1) {
    return {
      label: "Available",
      detail: "Levi Core has more than one registered model setup path.",
    };
  }

  return {
    label: "No fallback registered",
    detail: "Fallback evidence is not available from Levi Core.",
  };
}

function providerSettingsDetails(readiness, registered) {
  const rows = [
    `Registered model setup paths: ${registered.length}`,
    `Available model setup paths: ${Array.isArray(readiness.providers.available) ? readiness.providers.available.length : UNKNOWN}`,
  ];
  const issues = readiness.providers && readiness.providers.evidence && Array.isArray(readiness.providers.evidence.configurationIssues)
    ? readiness.providers.evidence.configurationIssues.map((issue) => presentationText(issue.reason || issue)).filter((entry) => entry !== UNKNOWN)
    : [];

  return rows.concat(issues.length > 0 ? issues : ["No additional provider configuration issues are recorded."]);
}

function costSettingsSummaryFor(state) {
  const cost = executionCostSummaryFor(state || {});
  const status = costSettingsStatusFor(state, cost);
  const usage = costUsageSummaryFor(state);
  const group = settingsGroup({
    id: "cost",
    title: "Cost",
    status,
    label: costSettingsLabel(status, cost),
    summary: costSettingsDetail(status, cost),
    items: [
      settingsItem("Budget ceiling", firstKnownText([cost.budgetCeiling, state && state.plan && moneyText(state.plan.budgetCeiling)]), "Budget evidence comes from Levi Core plan or execution data.", "readonly"),
      settingsItem("Cost approval behavior", "Separate approval", "UNKNOWN pricing and Core-reported approval requirements remain separate from task approval.", "locked"),
      settingsItem("Current spend", usage.spend, "Spend evidence is reported only when Core records it.", "readonly"),
      settingsItem("Iteration limits", usage.iterations, "Iteration limits remain enforced by Levi Core and Model Gateway.", "readonly"),
      settingsItem("UNKNOWN pricing behavior", cost.approvalRequired ? "Approval required" : "Requires Core evidence", "The UI does not invent pricing or treat UNKNOWN pricing as free.", "locked"),
    ],
    details: [
      cost.detail,
      "Cost, budget, and iteration protections cannot be bypassed from Advanced Settings.",
    ],
  });

  return {
    status,
    label: costSettingsLabel(status, cost),
    detail: costSettingsDetail(status, cost),
    group,
  };
}

function costSettingsStatusFor(state, cost) {
  const detailText = presentationText(cost.detail).toLowerCase();

  if (detailText.includes("invalid budget") || detailText.includes("budget") && detailText.includes("invalid")) {
    return "INVALID_BUDGET";
  }

  if (cost.blocked) {
    return "COST_BLOCKED";
  }

  if (cost.status === "APPROVAL_REQUIRED" || cost.costClass === UNKNOWN || cost.estimatedCost === UNKNOWN) {
    return "UNKNOWN_PRICING";
  }

  const budget = state && state.plan && state.plan.budgetState;
  if (isPlainObject(budget) && budget.pricingEvidence && budget.pricingEvidence.status === "UNKNOWN") {
    return "UNKNOWN_PRICING";
  }

  return cost.status === "UNKNOWN" ? "UNKNOWN_PRICING" : "READY";
}

function costSettingsLabel(status, cost) {
  const labels = {
    READY: cost.label === UNKNOWN ? "Ready" : cost.label,
    UNKNOWN_PRICING: "UNKNOWN pricing",
    COST_BLOCKED: "Blocked",
    INVALID_BUDGET: "Invalid budget",
  };

  return labels[status] || "Unknown";
}

function costSettingsDetail(status, cost) {
  if (status === "COST_BLOCKED" || status === "INVALID_BUDGET") {
    return cost.detail;
  }

  if (status === "UNKNOWN_PRICING") {
    return "Exact pricing evidence is UNKNOWN until Levi Core records a known estimate or approval requirement.";
  }

  return cost.detail === UNKNOWN ? "Cost evidence is available from Levi Core." : cost.detail;
}

function costUsageSummaryFor(state) {
  const candidates = [
    state && state.execution && state.execution.usage,
    state && state.execution && state.execution.costDecision && state.execution.costDecision.usage,
    state && state.costUsage,
  ].filter(isPlainObject);
  const usage = candidates[0] || {};
  const spent = moneyText(usage.spent || usage.currentSpend);
  const iterations = firstKnownText([
    usage.iterations,
    usage.currentIterations,
    usage.maxIterations && usage.iterations !== undefined ? `${usage.iterations}/${usage.maxIterations}` : null,
  ]);

  return {
    spend: spent,
    iterations,
  };
}

function contextSettingsSummaryFor(state, memoryRecords, projectSummary) {
  const contextSource = contextSourceForState(state || {});
  const details = contextDetailsFor(contextSource);
  const cache = isPlainObject(contextSource && contextSource.contextCache) ? contextSource.contextCache : {};
  const structuralIndex = isPlainObject(projectSummary && projectSummary.structuralIndex) ? projectSummary.structuralIndex : null;
  const knowledgeCount = countProjectKnowledgeRecords(memoryRecords);
  const decisionCount = countDurableDecisionRecords(memoryRecords);
  const symbolCount = structuralIndex && Array.isArray(structuralIndex.symbols) ? structuralIndex.symbols.length : UNKNOWN;
  const relationshipCount = structuralIndex && Array.isArray(structuralIndex.relationships) ? structuralIndex.relationships.length : UNKNOWN;
  const status = contextSource ? "READY" : "UNKNOWN";
  const group = settingsGroup({
    id: "context",
    title: "Context",
    status,
    label: status === "READY" ? "Available" : "Unknown",
    summary: status === "READY" ? "Levi Core has context evidence for the current workflow." : "Context evidence is UNKNOWN until Levi Core records it.",
    items: [
      settingsItem("Context status", status === "READY" ? "Available" : UNKNOWN, "Context content stays hidden; only status and budget are shown.", "readonly"),
      settingsItem("Context budget summary", contextBudgetText(details && details.contextBudget), "Budget counts are shown without raw context contents.", "readonly"),
      settingsItem("Cache status", cacheStatusText(cache), "Cache internals remain hidden.", "readonly"),
      settingsItem("Project Knowledge count", knowledgeCount, "Approved or verified project records visible to Core.", "readonly"),
      settingsItem("Durable Decision count", decisionCount, "Approved project decisions recorded for this project.", "readonly"),
      settingsItem("Structural index counts", structuralIndexCountsText(symbolCount, relationshipCount), "Symbol and relationship counts come from deterministic repository scanning.", "readonly"),
    ],
    details: [
      "Raw request context and prompt contents are not exposed.",
      "Manual context selection is not part of M32-008.",
    ],
  });

  return {
    status,
    label: status === "READY" ? "Available" : "Unknown",
    detail: status === "READY" ? "Context diagnostics are available." : "Context diagnostics are UNKNOWN.",
    group,
  };
}

function contextSourceForState(state) {
  if (isPlainObject(state.context)) {
    return state.context;
  }

  if (isPlainObject(state.contextPreview)) {
    return state.contextPreview;
  }

  if (isPlainObject(state.plan) && isPlainObject(state.plan.contextPreview)) {
    return state.plan.contextPreview;
  }

  return null;
}

function contextDetailsFor(contextSource) {
  if (!isPlainObject(contextSource)) {
    return null;
  }

  return isPlainObject(contextSource.details) ? contextSource.details : contextSource;
}

function cacheStatusText(cache) {
  if (!isPlainObject(cache)) {
    return UNKNOWN;
  }

  if (cache.cacheHit === true) {
    return "Cache hit";
  }

  if (cache.cacheMiss === true) {
    return "Cache miss";
  }

  return UNKNOWN;
}

function countProjectKnowledgeRecords(records) {
  return Array.isArray(records)
    ? records.filter((record) => isPlainObject(record) && record.type === "project-fact" && ["APPROVED", "VERIFIED"].includes(stringOrUnknown(record.confidenceState).toUpperCase())).length
    : 0;
}

function countDurableDecisionRecords(records) {
  return Array.isArray(records)
    ? records.filter((record) => isPlainObject(record) && record.type === "approved-decision").length
    : 0;
}

function structuralIndexCountsText(symbolCount, relationshipCount) {
  if (symbolCount === UNKNOWN && relationshipCount === UNKNOWN) {
    return UNKNOWN;
  }

  return `${symbolCount} symbols, ${relationshipCount} relationships`;
}

function appearanceSettingsGroup() {
  return settingsGroup({
    id: "appearance",
    title: "Appearance",
    status: "READY",
    label: "System",
    summary: "Appearance follows system preferences until Core approves writable preferences.",
    items: [
      settingsItem("Light appearance", "Available", "Read-only display option in M32-008.", "readonly"),
      settingsItem("Dark appearance", "Available", "Read-only display option in M32-008.", "readonly"),
      settingsItem("System appearance", "Selected", "The current UI follows the operating-system color scheme.", "readonly"),
      settingsItem("Reduced motion preference", "Follows system", "No motion-heavy behavior is introduced in M32-008.", "readonly"),
      settingsItem("Text-size preference", "Not approved", "PLAN.md does not approve a writable text-size preference in M32-008.", "locked"),
    ],
    details: [
      "Appearance state is presentation-only and does not alter workflow state.",
    ],
  });
}

function diagnosticsSettingsGroup(input) {
  const healthStatus = stringOrUnknown(input.healthSummary && input.healthSummary.overallStatus);
  const recommendationCount = input.recommendationReport && Array.isArray(input.recommendationReport.recommendations)
    ? input.recommendationReport.recommendations.length
    : 0;
  const restore = input.restoreInspection || unavailableRestoreInspection("Restore evidence is UNKNOWN.");
  const group = settingsGroup({
    id: "diagnostics",
    title: "Diagnostics",
    status: diagnosticsStatusFor(input.provider, input.cost, healthStatus),
    label: "Sanitized",
    summary: "Copyable diagnostics summarize readiness without secrets or internal records.",
    items: [
      settingsItem("Readiness", presentationText(input.readinessReport && input.readinessReport.overallReadiness), "Readiness evidence comes from Levi Core.", "readonly"),
      settingsItem("Provider health", input.provider.label, input.provider.detail, "readonly"),
      settingsItem("Fallback availability", input.provider.fallback.label, input.provider.fallback.detail, "readonly"),
      settingsItem("Project Health summary", plainStatus(healthStatus), presentationText(input.healthSummary && input.healthSummary.summary), "readonly"),
      settingsItem("Recommendations", recommendationCount, "Recommendation counts come from Project Health.", "readonly"),
      settingsItem("Restore diagnostics", restore.label, restore.detail, "readonly"),
      settingsItem("Repository path", path.resolve(input.repositoryPath), "Shown only in Advanced Settings diagnostics.", "readonly"),
    ],
    details: [
      "The diagnostic summary excludes secret values, unfiltered state, request text, change-set schemas, and internal records.",
    ],
  });

  return {
    group,
  };
}

function diagnosticsStatusFor(provider, cost, healthStatus) {
  if (provider.status === "NO_PROVIDER" || provider.status === "PROVIDER_UNAVAILABLE" || cost.status === "COST_BLOCKED") {
    return "ATTENTION";
  }

  if (healthStatus === "BLOCKED") {
    return "BLOCKED";
  }

  if (healthStatus === "ATTENTION" || cost.status === "UNKNOWN_PRICING") {
    return "ATTENTION";
  }

  return "READY";
}

function settingsGroup({ id, title, status, label, summary, items, details }) {
  return {
    id,
    title,
    status: stringOrUnknown(status),
    label: presentationText(label),
    summary: presentationText(summary),
    items: Array.isArray(items) ? items : [],
    details: textListOrUnknown(details),
  };
}

function settingsItem(label, value, detail, kind) {
  return {
    label: presentationText(label),
    value: presentationText(value),
    detail: presentationText(detail),
    kind: kind || "readonly",
  };
}

function advancedSettingsActionsFor(canSave) {
  return {
    canSave: canSave === true,
    primary: canSave === true ? {
      label: "Save Settings",
      action: "save",
    } : null,
    secondary: [
      {
        label: "Return Home",
        href: "#home",
      },
      {
        label: "Project Health",
        href: "#health",
      },
      {
        label: "History",
        href: "#history",
      },
    ],
  };
}

function advancedSettingsModeFor(provider, cost) {
  if (provider.status === "NO_PROVIDER") {
    return "NO_PROVIDER";
  }

  if (provider.status === "PROVIDER_UNAVAILABLE") {
    return "PROVIDER_UNAVAILABLE";
  }

  if (provider.status === "LOCAL_MODEL_UNAVAILABLE") {
    return "LOCAL_MODEL_UNAVAILABLE";
  }

  if (cost.status === "INVALID_BUDGET") {
    return "INVALID_BUDGET";
  }

  if (cost.status === "COST_BLOCKED") {
    return "COST_BLOCKED";
  }

  if (cost.status === "UNKNOWN_PRICING") {
    return "UNKNOWN_PRICING";
  }

  return "NORMAL";
}

function advancedSettingsModeLabel(mode) {
  const labels = {
    NORMAL: "Normal",
    NO_PROVIDER: "No provider",
    PROVIDER_UNAVAILABLE: "Provider unavailable",
    LOCAL_MODEL_UNAVAILABLE: "Local model unavailable",
    INVALID_BUDGET: "Invalid budget",
    COST_BLOCKED: "Cost blocked",
    UNKNOWN_PRICING: "UNKNOWN pricing",
  };

  return labels[mode] || "Unknown";
}

function advancedSettingsModeDetail(mode, provider, cost) {
  if (mode === "NO_PROVIDER" || mode === "PROVIDER_UNAVAILABLE" || mode === "LOCAL_MODEL_UNAVAILABLE") {
    return provider.detail;
  }

  if (mode === "INVALID_BUDGET" || mode === "COST_BLOCKED" || mode === "UNKNOWN_PRICING") {
    return cost.detail;
  }

  return "Optional settings are available as read-only status.";
}

function diagnosticSummaryTextFor(input) {
  const restore = input.restoreInspection || {};
  const healthStatus = input.healthSummary && input.healthSummary.overallStatus;

  return [
    "Levi Advanced Settings Summary",
    `Project: ${path.basename(input.repositoryPath) || UNKNOWN}`,
    `Readiness: ${input.provider.label}`,
    `Provider: ${input.provider.currentProvider}`,
    `Model: ${input.provider.currentModel}`,
    `Fallback: ${input.provider.fallback.label}`,
    `Cost: ${input.cost.label} - ${input.cost.detail}`,
    `Context: ${input.context.label} - ${input.context.detail}`,
    `Project Health: ${plainStatus(healthStatus)} - ${presentationText(input.healthSummary && input.healthSummary.summary)}`,
    `Restore: ${presentationText(restore.label)} - ${presentationText(restore.detail)}`,
    "Safety: approval, destructive confirmation, restore, budget, and validation protections remain enforced by Levi Core.",
    "Writable settings: none approved in M32-008.",
  ].join("\n");
}

function normalizeReadinessReport(readinessReport) {
  if (!isPlainObject(readinessReport)) {
    return fallbackReadinessReport("Readiness evidence is UNKNOWN.");
  }

  return {
    overallReadiness: presentationText(readinessReport.overallReadiness || readinessReport.status),
    runtime: isPlainObject(readinessReport.runtime) ? readinessReport.runtime : {},
    models: isPlainObject(readinessReport.models) ? readinessReport.models : {},
    providers: isPlainObject(readinessReport.providers) ? readinessReport.providers : {
      registered: [],
      localProviders: [],
      available: [],
      defaultProvider: UNKNOWN,
      evidence: {},
    },
  };
}

function safeAdvancedReadinessReport() {
  try {
    return inspectLocalReadiness();
  } catch (error) {
    return fallbackReadinessReport(error.message);
  }
}

function fallbackReadinessReport(message) {
  return {
    overallReadiness: UNKNOWN,
    runtime: {
      name: "Ollama",
      installed: UNKNOWN,
      running: UNKNOWN,
      version: UNKNOWN,
      evidence: {},
    },
    models: {
      installedModels: UNKNOWN,
      recommendedModels: {
        configured: [],
        installed: UNKNOWN,
        missing: UNKNOWN,
      },
      requiredModels: {
        configured: [],
        installed: UNKNOWN,
        missing: UNKNOWN,
      },
      missingRequiredModels: UNKNOWN,
    },
    providers: {
      registered: [],
      localProviders: [],
      available: [],
      defaultProvider: UNKNOWN,
      evidence: {
        configurationIssues: [{
          reason: presentationText(message),
        }],
      },
    },
  };
}

function emptyRestoreHistoryView(repositoryPath, message) {
  const restore = unavailableRestoreInspection(message || "No restore point is available yet.");

  return {
    status: "EMPTY",
    project: repositoryPath ? selectedProject(path.resolve(repositoryPath)) : {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    headline: "No history yet",
    summary: message || "No task history or restore point is recorded for this project yet.",
    topSummary: restoreHistoryTopSummary([], restore),
    historyCount: 0,
    lastSuccessfulTask: "No successful task is recorded yet.",
    restore,
    timeline: [],
    actions: restoreHistoryActionsFor(restore),
    restoreResult: null,
  };
}

function restoreHistoryErrorView(repositoryPath, message) {
  return {
    ...emptyRestoreHistoryView(repositoryPath, message || "Levi could not read restore history."),
    status: "ERROR",
    headline: "History needs attention",
    summary: message || "Levi could not read restore history.",
    restore: restoreInspectionErrorFor(message || "Levi could not read restore history."),
    actions: restoreHistoryActionsFor(unavailableRestoreInspection("Restore is unavailable while history is blocked.")),
    error: {
      title: "History could not be opened",
      detail: message || "Levi could not read restore history.",
    },
  };
}

function restoreHistoryViewFor(repositoryPath, state, memoryRecords, restoreInspection) {
  const timeline = restoreHistoryEntriesFor(state, memoryRecords, restoreInspection);

  if (timeline.length === 0 && !restoreInspection.available) {
    return emptyRestoreHistoryView(repositoryPath, "No task history or restore point is recorded for this project yet.");
  }

  return {
    status: restoreInspection.status === "CORRUPTED" || restoreInspection.status === "ERROR" ? "ATTENTION" : "READY",
    project: selectedProject(path.resolve(repositoryPath)),
    headline: timeline.length > 0 ? "Recent activity" : "Restore point available",
    summary: restoreHistorySummaryText(timeline, restoreInspection),
    topSummary: restoreHistoryTopSummary(timeline, restoreInspection),
    historyCount: timeline.length,
    lastSuccessfulTask: lastSuccessfulTaskText(timeline),
    restore: restoreInspection,
    timeline,
    actions: restoreHistoryActionsFor(restoreInspection),
    restoreResult: null,
  };
}

function inspectLatestRestoreForHistory(repositoryPath) {
  try {
    return restoreInspectionForUi(inspectLatestRestorePoint(repositoryPath));
  } catch (error) {
    return restoreInspectionErrorFor(error.message);
  }
}

function restoreInspectionForUi(inspection) {
  if (!isPlainObject(inspection) || !isPlainObject(inspection.metadata)) {
    return restoreInspectionErrorFor("Restore point evidence is corrupted.");
  }

  const metadata = inspection.metadata;
  const files = Array.isArray(inspection.files) ? inspection.files.map(restoreFileForUi).filter(Boolean) : [];
  const counts = operationCountsForRestoreFiles(files);
  const runtime = isPlainObject(inspection.runtime) ? inspection.runtime : {};
  const fileCount = Number.isFinite(runtime.fileCount) ? runtime.fileCount : 0;
  const directoryCount = Number.isFinite(runtime.directoryCount) ? runtime.directoryCount : 0;

  return {
    status: "AVAILABLE",
    label: "Available",
    available: true,
    id: presentationText(metadata.id),
    timestamp: timestampOrUnknown(metadata.timestamp),
    displayTime: formatTimestampForUi(metadata.timestamp),
    requirementId: presentationText(metadata.requirementId),
    detail: "Levi can inspect this restore point before any restore action.",
    exactState: "Restoring returns tracked project files and Levi internal state to the recorded pre-task boundary.",
    internalState: fileCount > 0 || directoryCount > 0
      ? `${fileCount} internal file${fileCount === 1 ? "" : "s"} and ${directoryCount} internal folder${directoryCount === 1 ? "" : "s"} have recorded state.`
      : "No pre-existing Levi internal state files are recorded for this point.",
    plannedFiles: textListOrUnknown(metadata.plannedFiles),
    operationTypes: textListOrUnknown(metadata.operationTypes),
    files,
    counts,
  };
}

function restoreFileForUi(file) {
  if (!isPlainObject(file)) {
    return null;
  }

  const filePath = relativePathText(file.path);

  if (filePath === UNKNOWN) {
    return null;
  }

  const action = operationTypeFor(file.operationType);
  const existed = typeof file.existed === "boolean" ? file.existed : null;

  return {
    path: filePath,
    action: titleCase(action),
    operationType: action,
    state: existed === null ? UNKNOWN : existed ? "Will restore prior content" : "Will remove file created by Levi",
  };
}

function operationCountsForRestoreFiles(files) {
  const items = Array.isArray(files) ? files : [];

  return {
    create: items.filter((file) => file.operationType === "create").length,
    update: items.filter((file) => file.operationType === "update").length,
    delete: items.filter((file) => file.operationType === "delete").length,
    total: items.length,
  };
}

function restoreInspectionErrorFor(message) {
  const detail = presentationText(message);
  const status = restoreErrorStatus(detail);

  if (status === "UNAVAILABLE") {
    return unavailableRestoreInspection(detail);
  }

  return {
    status,
    label: restoreStatusLabel(status),
    available: false,
    id: UNKNOWN,
    timestamp: UNKNOWN,
    displayTime: UNKNOWN,
    requirementId: UNKNOWN,
    detail,
    exactState: "Restore state cannot be trusted until Levi Core can inspect the restore point.",
    internalState: "Levi internal state was not inspected.",
    plannedFiles: [UNKNOWN],
    operationTypes: [UNKNOWN],
    files: [],
    counts: {
      create: 0,
      update: 0,
      delete: 0,
      total: 0,
    },
  };
}

function unavailableRestoreInspection(message) {
  return {
    status: "UNAVAILABLE",
    label: "Unavailable",
    available: false,
    id: UNKNOWN,
    timestamp: UNKNOWN,
    displayTime: UNKNOWN,
    requirementId: UNKNOWN,
    detail: presentationText(message || "No restore point exists for the latest Levi-managed operation."),
    exactState: "No exact restore boundary is available yet.",
    internalState: "Levi internal state was not changed by a restore.",
    plannedFiles: [UNKNOWN],
    operationTypes: [UNKNOWN],
    files: [],
    counts: {
      create: 0,
      update: 0,
      delete: 0,
      total: 0,
    },
  };
}

function restoreErrorStatus(message) {
  const normalized = stringOrUnknown(message).toLowerCase();

  if (normalized.includes("no restore point")) {
    return "UNAVAILABLE";
  }

  if (normalized.includes("corrupt") || normalized.includes("does not match restore data")) {
    return "CORRUPTED";
  }

  if (normalized.includes("invalid")) {
    return "INVALID";
  }

  return "ERROR";
}

function restoreStatusLabel(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "COMPLETED") {
    return "Restored";
  }

  if (normalized === "CONFIRMATION_REQUIRED") {
    return "Confirmation required";
  }

  if (normalized === "PARTIAL_ROLLBACK") {
    return "Partial rollback";
  }

  if (normalized === "CORRUPTED") {
    return "Corrupted";
  }

  if (normalized === "INVALID") {
    return "Invalid";
  }

  if (normalized === "FAILED" || normalized === "ERROR") {
    return "Failed";
  }

  if (normalized === "UNAVAILABLE") {
    return "Unavailable";
  }

  if (normalized === "AVAILABLE") {
    return "Available";
  }

  return "Unknown";
}

function restoreHistoryEntriesFor(state, memoryRecords, restoreInspection) {
  const entries = new Map();
  let order = 0;

  for (const record of Array.isArray(memoryRecords) ? memoryRecords : []) {
    if (!isPlainObject(record) || !isPlainObject(record.value)) {
      continue;
    }

    addRestoreHistoryEntry(entries, historyEntryForReport(record.value, {
      source: "memory",
      order: order += 1,
      timestamp: record.timestamp,
      memoryRecord: record,
      restoreInspection,
    }));
  }

  for (const report of reportCandidatesFromState(state)) {
    addRestoreHistoryEntry(entries, historyEntryForReport(report.report, {
      source: report.source,
      order: order += 1,
      timestamp: report.timestamp,
      state,
      isCurrent: report.isCurrent,
      restoreInspection,
    }));
  }

  return Array.from(entries.values()).sort(compareHistoryEntries).map((entry, index) => ({
    ...entry,
    position: index + 1,
  }));
}

function addRestoreHistoryEntry(entries, entry) {
  if (!entry) {
    return;
  }

  const existing = entries.get(entry.key);

  if (!existing || existing.timestamp === UNKNOWN && entry.timestamp !== UNKNOWN) {
    entries.set(entry.key, entry);
  }
}

function reportCandidatesFromState(state) {
  const candidates = [];

  if (state && isPlainObject(state.report)) {
    candidates.push({
      source: "current-report",
      report: state.report,
      timestamp: state.memoryRecord && state.memoryRecord.timestamp || state.report.timestamp,
      isCurrent: true,
    });
  }

  for (const key of ["completionReports", "reports", "taskHistory", "history"]) {
    const items = state && Array.isArray(state[key]) ? state[key] : [];

    items.forEach((item, index) => {
      const report = isPlainObject(item && item.report) ? item.report : item;

      if (!isPlainObject(report)) {
        return;
      }

      candidates.push({
        source: key,
        report,
        timestamp: item.timestamp || report.timestamp,
        isCurrent: false,
        order: index,
      });
    });
  }

  return candidates;
}

function historyEntryForReport(report, context) {
  if (!isPlainObject(report)) {
    return null;
  }

  const state = context.state || {};
  const timestamp = timestampOrUnknown(context.timestamp || report.timestamp);
  const changedFiles = historyChangedFilesFor(report, state);
  const validation = historyValidationFor(report, state);
  const cost = historyCostFor(report, state);
  const restore = historyRestoreFor(context.restoreInspection, context.isCurrent);
  const memoryOutcome = historyMemoryOutcomeFor(context.memoryRecord, state);
  const objective = firstKnownText([
    report.objective,
    report.normalizedObjective,
    state.plan && state.plan.objective,
    state.request && state.request.intake && state.request.intake.normalizedObjective,
    state.request && state.request.intake && state.request.intake.originalRequest,
    report.changeSummary,
    report.requirementId,
  ]);
  const summary = firstKnownText([report.changeSummary, report.summary, "No completion summary is recorded."]);
  const status = presentationText(report.status);
  const key = [
    presentationText(report.requirementId),
    status,
    summary,
    changedFiles.created.join("|"),
    changedFiles.updated.join("|"),
    changedFiles.deleted.join("|"),
    changedFiles.changed.join("|"),
  ].join("::");

  return {
    key,
    id: `history-${Math.abs(hashText(key)).toString(16)}`,
    source: presentationText(context.source),
    objective,
    timestamp,
    displayTime: formatTimestampForUi(timestamp),
    status,
    label: plainStatus(status),
    summary,
    requirementId: presentationText(report.requirementId),
    changedFiles,
    validation,
    cost,
    restore,
    memoryOutcome,
    knownFailures: textListOrUnknown(report.knownFailures).filter((entry) => entry !== UNKNOWN),
    remainingWork: textListOrUnknown(report.remainingWork).filter((entry) => entry !== UNKNOWN),
    commandsRun: historyCommandsFor(report, validation),
    order: context.order || 0,
  };
}

function historyChangedFilesFor(report, state) {
  if (isPlainObject(report.changedFiles)) {
    return normalizeChangedFileGroups(report.changedFiles);
  }

  if (isPlainObject(state.patch) && Array.isArray(state.patch.changes)) {
    return normalizeChangedFileGroups({
      changes: state.patch.changes,
    });
  }

  return normalizeChangedFileGroups({
    changed: report.filesChanged,
    created: report.filesCreated || report.createdFiles,
    updated: report.filesUpdated || report.updatedFiles,
    deleted: report.filesDeleted || report.deletedFiles,
  });
}

function normalizeChangedFileGroups(input) {
  const source = isPlainObject(input) ? input : {};
  const changes = Array.isArray(source.changes) ? source.changes.filter(isPlainObject) : [];
  const created = [
    ...textListOrEmpty(source.created),
    ...changes.filter((change) => operationTypeFor(change.type) === "create").map((change) => historyPathText(change.path)),
  ];
  const updated = [
    ...textListOrEmpty(source.updated),
    ...changes.filter((change) => operationTypeFor(change.type) === "update").map((change) => historyPathText(change.path)),
  ];
  const deleted = [
    ...textListOrEmpty(source.deleted),
    ...changes.filter((change) => operationTypeFor(change.type) === "delete").map((change) => historyPathText(change.path)),
  ];
  const typed = new Set([...created, ...updated, ...deleted].filter((entry) => entry !== UNKNOWN));
  const changed = [
    ...textListOrEmpty(source.changed),
    ...changes
      .filter((change) => !["create", "update", "delete"].includes(operationTypeFor(change.type)))
      .map((change) => historyPathText(change.path)),
  ].filter((entry) => !typed.has(entry));

  const groups = {
    created: uniqueSorted(created.filter((entry) => entry !== UNKNOWN)),
    updated: uniqueSorted(updated.filter((entry) => entry !== UNKNOWN)),
    deleted: uniqueSorted(deleted.filter((entry) => entry !== UNKNOWN)),
    changed: uniqueSorted(changed.filter((entry) => entry !== UNKNOWN)),
  };

  return {
    ...groups,
    counts: {
      create: groups.created.length,
      update: groups.updated.length,
      delete: groups.deleted.length,
      changed: groups.changed.length,
      total: uniqueSorted([...groups.created, ...groups.updated, ...groups.deleted, ...groups.changed]).length,
    },
  };
}

function textListOrEmpty(value) {
  return collectionTextValues(value).map(historyPathText).filter((entry) => entry !== UNKNOWN);
}

function historyPathText(value) {
  const filePath = relativePathText(value);

  if (filePath === UNKNOWN) {
    return UNKNOWN;
  }

  if (filePath === ".levi" || filePath.startsWith(".levi/")) {
    return "Levi internal state";
  }

  return filePath;
}

function historyValidationFor(report, state) {
  const sourceResults = Array.isArray(report.validationResults)
    ? report.validationResults
    : state.validation && Array.isArray(state.validation.results)
      ? state.validation.results
      : [];
  const commands = Array.isArray(report.commandsRun)
    ? report.commandsRun.map((entry) => isPlainObject(entry) ? entry.command : entry)
    : state.plan && Array.isArray(state.plan.validationCommands)
      ? state.plan.validationCommands
      : [];
  const results = sourceResults.map(validationResultForUi);
  const failed = results.some((result) => result.status === "FAILED");
  const status = results.length > 0 ? failed ? "FAILED" : "COMPLETED" : commands.length > 0 ? "PLANNED" : "UNKNOWN";

  return {
    status,
    label: validationLabelFor(status, results.length),
    commands: textListOrUnknown(commands),
    results,
  };
}

function historyCommandsFor(report, validation) {
  const commands = Array.isArray(report.commandsRun)
    ? report.commandsRun.map((entry) => isPlainObject(entry) ? entry.command : entry)
    : validation.commands;

  return textListOrUnknown(commands).filter((entry) => entry !== UNKNOWN);
}

function historyCostFor(report, state) {
  const cost = report.costResult || report.costDecision || state.execution && state.execution.costDecision || state.plan && state.plan.budgetState;

  if (!isPlainObject(cost)) {
    return {
      ...emptyCostSummary(),
      detail: "No cost result was recorded for this task.",
    };
  }

  const status = stringOrUnknown(cost.status).toUpperCase();
  const costClass = presentationText(cost.costClass);

  return {
    status,
    label: costLabel(status, costClass, false),
    detail: presentationText(cost.reason || cost.recommendedNextStep || "Cost result was recorded."),
    costClass,
    estimatedCost: moneyText(cost.estimatedCost || cost.exactEstimate || cost.estimatedCostRange),
    budgetCeiling: moneyText(cost.budgetCeiling),
    approvalRequired: status === "APPROVAL_REQUIRED",
    approved: false,
    blocked: status === "BLOCKED",
  };
}

function historyRestoreFor(restoreInspection, isCurrent) {
  if (restoreInspection && restoreInspection.available && isCurrent) {
    return {
      status: "AVAILABLE",
      label: "Available",
      available: true,
      detail: "Restore is available for the latest Levi-managed operation.",
      restorePointId: restoreInspection.id,
    };
  }

  return {
    status: "UNAVAILABLE",
    label: "Unavailable",
    available: false,
    detail: "No restore point is attached to this history entry.",
    restorePointId: UNKNOWN,
  };
}

function historyMemoryOutcomeFor(memoryRecord, state) {
  const record = isPlainObject(memoryRecord) ? memoryRecord : state.memoryRecord;

  if (!isPlainObject(record)) {
    return {
      status: "UNKNOWN",
      label: "Unknown",
      detail: "Verified Project Knowledge outcome is UNKNOWN for this task.",
      timestamp: UNKNOWN,
    };
  }

  const confidence = presentationText(record.confidenceState || "VERIFIED");

  return {
    status: confidence === "VERIFIED" ? "VERIFIED" : "UNKNOWN",
    label: confidence === "VERIFIED" ? "Verified" : "Unknown",
    detail: confidence === "VERIFIED"
      ? "Verified task outcome was recorded for Project Knowledge."
      : "Project Knowledge outcome needs review.",
    timestamp: timestampOrUnknown(record.timestamp),
  };
}

function compareHistoryEntries(left, right) {
  const leftTime = timestampSortValue(left.timestamp);
  const rightTime = timestampSortValue(right.timestamp);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.order - right.order || left.id.localeCompare(right.id);
}

function timestampSortValue(value) {
  const text = timestampOrUnknown(value);
  const milliseconds = Date.parse(text);
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function formatTimestampForUi(value) {
  const text = timestampOrUnknown(value);
  const milliseconds = Date.parse(text);

  if (!Number.isFinite(milliseconds)) {
    return UNKNOWN;
  }

  const date = new Date(milliseconds);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute} UTC`;
}

function hashText(value) {
  const text = stringOrUnknown(value);
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}

function restoreHistorySummaryText(timeline, restoreInspection) {
  if (timeline.length === 0 && restoreInspection.available) {
    return "A restore point is available for inspection. No completion history is recorded yet.";
  }

  if (timeline.length === 0) {
    return "No task history is recorded yet.";
  }

  const restoreText = restoreInspection.available ? "A restore point is available." : "No restore point is available.";
  return `${timeline.length} task ${timeline.length === 1 ? "entry is" : "entries are"} recorded. ${restoreText}`;
}

function restoreHistoryTopSummary(timeline, restoreInspection) {
  return [
    {
      label: "Recent activity",
      value: timeline.length === 0 ? "None" : `${timeline.length} recorded`,
      detail: timeline.length === 0 ? "No task history is recorded yet." : "Levi has recorded task activity for this project.",
    },
    {
      label: "Last successful task",
      value: lastSuccessfulTaskValue(timeline),
      detail: lastSuccessfulTaskText(timeline),
    },
    {
      label: "Latest restore point",
      value: restoreInspection.label,
      detail: restoreInspection.detail,
    },
    {
      label: "Project history",
      value: `${timeline.length}`,
      detail: "Recorded completion entries available to this screen.",
    },
  ];
}

function lastSuccessfulTaskValue(timeline) {
  const entry = timeline.find((item) => stringOrUnknown(item.status).toUpperCase() === "COMPLETED");
  return entry ? "Completed" : "None";
}

function lastSuccessfulTaskText(timeline) {
  const entry = timeline.find((item) => stringOrUnknown(item.status).toUpperCase() === "COMPLETED");

  if (!entry) {
    return "No successful task is recorded yet.";
  }

  const time = entry.displayTime === UNKNOWN ? "time UNKNOWN" : entry.displayTime;
  return `${entry.objective} at ${time}.`;
}

function restoreHistoryActionsFor(restoreInspection) {
  if (restoreInspection && restoreInspection.available) {
    return {
      primary: {
        label: "Restore this version",
        action: "restore",
        enabled: true,
      },
      secondary: [
        {
          label: "View details",
          target: "details",
          enabled: true,
        },
        {
          label: "Start New Task",
          href: "#new-task",
          enabled: true,
        },
      ],
    };
  }

  return {
    primary: {
      label: "Start New Task",
      href: "#new-task",
      enabled: true,
    },
    secondary: [
      {
        label: "View details",
        target: "details",
        enabled: false,
      },
      {
        label: "Start New Task",
        href: "#new-task",
        enabled: true,
      },
    ],
  };
}

function restoreSubmitResultFor(result) {
  if (!isPlainObject(result)) {
    return restoreSubmitResultFromError("Restore result is UNKNOWN.");
  }

  const status = restoreResultStatusFor(result);
  const restoredFiles = textListOrEmpty(result.restoredFiles);
  const runtimeCount = Array.isArray(result.runtimeFiles) ? result.runtimeFiles.length : 0;

  return {
    status,
    label: restoreStatusLabel(status),
    headline: restoreResultHeadline(status),
    message: restoreResultMessage(status, result.error),
    restoredFiles,
    fileCount: restoredFiles.length,
    internalState: runtimeCount > 0
      ? `Levi internal state was returned to the recorded boundary for ${runtimeCount} item${runtimeCount === 1 ? "" : "s"}.`
      : "No Levi internal state files changed during restore.",
    error: presentationText(result.error),
  };
}

function restoreSubmitResultFromError(message, forcedStatus) {
  const status = forcedStatus || restoreErrorStatus(message);

  return {
    status,
    label: restoreStatusLabel(status),
    headline: restoreResultHeadline(status),
    message: restoreResultMessage(status, message),
    restoredFiles: [],
    fileCount: 0,
    internalState: "Levi internal state was not changed.",
    error: presentationText(message),
  };
}

function restoreResultStatusFor(result) {
  const status = stringOrUnknown(result.status).toUpperCase();
  const error = stringOrUnknown(result.error).toLowerCase();

  if (status === "COMPLETED") {
    return "COMPLETED";
  }

  if (status === "CONFIRMATION_REQUIRED") {
    return "CONFIRMATION_REQUIRED";
  }

  if (status === "FAILED" && error.includes("rollback failed")) {
    return "PARTIAL_ROLLBACK";
  }

  if (status === "FAILED") {
    return "FAILED";
  }

  return status === UNKNOWN ? "UNKNOWN" : status;
}

function restoreResultHeadline(status) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "COMPLETED") {
    return "Restore completed";
  }

  if (normalized === "CONFIRMATION_REQUIRED") {
    return "Confirm before restoring";
  }

  if (normalized === "PARTIAL_ROLLBACK") {
    return "Restore rollback needs attention";
  }

  if (normalized === "INVALID") {
    return "Restore point is invalid";
  }

  if (normalized === "CORRUPTED") {
    return "Restore point is corrupted";
  }

  if (normalized === "UNAVAILABLE") {
    return "Restore unavailable";
  }

  return "Restore failed";
}

function restoreResultMessage(status, message) {
  const normalized = stringOrUnknown(status).toUpperCase();

  if (normalized === "COMPLETED") {
    return "Levi restored the tracked files for this restore point.";
  }

  if (normalized === "CONFIRMATION_REQUIRED") {
    return "Explicit confirmation is required before Levi Core can restore files.";
  }

  if (normalized === "PARTIAL_ROLLBACK") {
    return presentationText(message || "Restore failed and rollback also needs attention.");
  }

  if (normalized === "UNAVAILABLE") {
    return presentationText(message || "No restore point is available.");
  }

  return presentationText(message || "Restore could not be completed.");
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
  return [
    statusItem("Readiness", plainStatus(healthSummary.overallStatus), healthSummary.summary),
    costStatusFor(state),
    restoreStatusFor(state),
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

function costStatusFor(state) {
  const costDecision = state.costDecision || state.execution && state.execution.costDecision || state.plan && state.plan.budgetState;

  if (!isPlainObject(costDecision)) {
    return statusItem("Cost", "Unknown", "Cost evidence appears after Levi creates a plan.");
  }

  const status = stringOrUnknown(costDecision.status).toUpperCase();
  const costClass = stringOrUnknown(costDecision.costClass);
  const detail = stringOrUnknown(costDecision.reason || costDecision.recommendedNextStep);

  if (status === "ALLOWED") {
    return statusItem("Cost", costClass === UNKNOWN ? "Ready" : titleCase(costClass), detail);
  }

  if (status === "BLOCKED") {
    return statusItem("Cost", "Blocked", detail);
  }

  return statusItem("Cost", "Needs attention", detail);
}

function restoreStatusFor(state) {
  const restorePoint = state.restorePoint || state.patch && state.patch.restorePoint;

  if (!isPlainObject(restorePoint)) {
    return statusItem("Restore", "Unknown", "No restore point exists for the current task yet.");
  }

  const status = stringOrUnknown(restorePoint.status).toUpperCase();

  if (status === "CREATED" || status === "AVAILABLE") {
    return statusItem("Restore", "Ready", "A Levi restore point is available.");
  }

  if (status === "FAILED" || status === "ERROR" || status === "BLOCKED") {
    return statusItem("Restore", "Blocked", "Restore point state needs attention.");
  }

  return statusItem("Restore", "Needs attention", "Restore point state needs review.");
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

function emptyExecutionCompletionView(repositoryPath, message) {
  return {
    status: "EMPTY",
    mode: "EMPTY",
    project: repositoryPath ? selectedProject(path.resolve(repositoryPath)) : {
      status: "NONE",
      name: "No project selected",
      root: UNKNOWN,
    },
    objective: UNKNOWN,
    headline: "No execution history",
    summary: message || "No approved execution or completion result exists yet.",
    currentStep: UNKNOWN,
    failureReason: UNKNOWN,
    progress: executionStepsFor("EMPTY", null, {}),
    cost: executionCostSummaryFor({}),
    restore: executionRestoreSummaryFor({}),
    changedFiles: emptyChangedFilesSummary(),
    validation: executionValidationSummaryFor({}),
    completion: emptyCompletionSummary(),
    projectHealth: executionProjectHealthSummaryFor({}),
    warnings: [message || "No execution history is available."],
    knownFailures: [UNKNOWN],
    remainingWork: ["Create and approve a plan before execution."],
    providerReadiness: emptyProviderReadinessSummary(),
    actions: executionActionsFor("EMPTY", false, false),
  };
}

function executionCompletionErrorView(repositoryPath, message) {
  return {
    ...emptyExecutionCompletionView(repositoryPath, message || "Levi could not read execution state."),
    status: "ERROR",
    mode: "ERROR",
    headline: "Execution state needs attention",
    summary: message || "Levi could not read execution state.",
    failureReason: message || "Levi could not read execution state.",
    actions: executionActionsFor("ERROR", false, false),
    error: {
      title: "Execution could not be opened",
      detail: message || "Levi could not read execution state.",
    },
  };
}

function executionCompletionViewFor(repositoryPath, state) {
  if (!hasExecutionRelatedState(state)) {
    return emptyExecutionCompletionView(repositoryPath, "No execution history exists for this project yet.");
  }

  const status = executionStatusFor(state);
  const mode = status === "COMPLETED" || status === "FAILED" || status === "PARTIAL" ? "COMPLETION" : "EXECUTION";
  const objective = planObjectiveFor(state.plan || {}, state);
  const failureReason = executionFailureReasonFor(state, status);
  const changedFiles = executionChangedFilesFor(state);
  const validation = executionValidationSummaryFor(state);
  const restore = executionRestoreSummaryFor(state);
  const cost = executionCostSummaryFor(state);
  const projectHealth = executionProjectHealthSummaryFor(state);
  const providerReadiness = providerReadinessSummaryFor(state);
  const progress = executionStepsFor(status, failureReason, state);
  const currentStep = currentStepForProgress(progress);
  const completion = completionSummaryFor(state, status);
  const knownFailures = textListOrUnknown(state.report && state.report.knownFailures).filter((entry) => entry !== UNKNOWN);
  const remainingWork = textListOrUnknown(state.report && state.report.remainingWork).filter((entry) => entry !== UNKNOWN);
  const warnings = executionWarningsFor(state, status, cost, restore, validation, providerReadiness);

  return {
    status,
    mode,
    project: selectedProject(path.resolve(repositoryPath)),
    objective,
    headline: executionHeadlineFor(status),
    summary: executionSummaryTextFor(status, state, failureReason),
    currentStep,
    failureReason,
    progress,
    cost,
    restore,
    changedFiles,
    validation,
    completion,
    projectHealth,
    warnings: warnings.length > 0 ? warnings : ["No warnings reported by Levi Core."],
    knownFailures: knownFailures.length > 0 ? knownFailures : ["No known failures reported."],
    remainingWork: remainingWork.length > 0 ? remainingWork : ["No remaining work reported."],
    providerReadiness,
    actions: executionActionsFor(status, changedFiles.total > 0, restore.available),
  };
}

function hasExecutionRelatedState(state) {
  return Boolean(state && (state.plan || state.execution || state.generation || state.patch || state.validation || state.report));
}

function executionStatusFor(state) {
  const cost = state.plan && state.plan.budgetState || state.execution && state.execution.costDecision;

  if (isPlainObject(cost) && cost.status === "BLOCKED") {
    return "COST_BLOCKED";
  }

  if (state.report && typeof state.report.status === "string") {
    return state.report.status === "COMPLETED" ? "COMPLETED" : state.report.status === "PARTIAL" ? "PARTIAL" : "FAILED";
  }

  if (state.validation && state.validation.status === "FAILED") {
    return "FAILED";
  }

  if (state.patch && state.patch.status === "FAILED") {
    return "FAILED";
  }

  if (state.generation && state.generation.status === "FAILED") {
    return providerUnavailableState(state) ? "PROVIDER_UNAVAILABLE" : "FAILED";
  }

  if (state.execution && state.execution.status === "FAILED") {
    return providerUnavailableState(state) ? "PROVIDER_UNAVAILABLE" : "FAILED";
  }

  if (state.execution && ["RUNNING", "EXECUTING", "VALIDATING"].includes(stringOrUnknown(state.execution.status).toUpperCase())) {
    return "RUNNING";
  }

  if (state.patch && state.patch.status === "COMPLETED" && state.validation && state.validation.status === "COMPLETED") {
    return "COMPLETED";
  }

  if (state.generation || state.patch || state.validation || state.execution && state.execution.status) {
    return "RUNNING";
  }

  if (state.plan && state.plan.approvalState === "APPROVED") {
    return "WAITING_TO_START";
  }

  if (state.plan) {
    return "WAITING_FOR_APPROVAL";
  }

  return "EMPTY";
}

function executionHeadlineFor(status) {
  const headlines = {
    COMPLETED: "Task completed",
    PARTIAL: "Task partially completed",
    FAILED: "Task failed",
    PROVIDER_UNAVAILABLE: "Model setup unavailable",
    COST_BLOCKED: "Cost blocks execution",
    RUNNING: "Running approved work",
    WAITING_TO_START: "Ready to run",
    WAITING_FOR_APPROVAL: "Waiting for approval",
    EMPTY: "No execution history",
    ERROR: "Execution state needs attention",
  };

  return headlines[status] || "Execution needs review";
}

function executionSummaryTextFor(status, state, failureReason) {
  if (status === "COMPLETED") {
    return firstKnownText([state.report && state.report.changeSummary, "Levi completed the approved task."]);
  }

  if (status === "PARTIAL") {
    return firstKnownText([state.report && state.report.changeSummary, "Levi recorded partial work and remaining items."]);
  }

  if (status === "FAILED" || status === "PROVIDER_UNAVAILABLE" || status === "COST_BLOCKED") {
    return failureReason === UNKNOWN ? "Levi stopped before completion." : failureReason;
  }

  if (status === "WAITING_TO_START") {
    return "The plan is approved. Execution has not started in Levi Core yet.";
  }

  if (status === "WAITING_FOR_APPROVAL") {
    return "Approve the plan before execution can begin.";
  }

  if (status === "RUNNING") {
    return "Levi Core is working through the approved workflow.";
  }

  return "Execution evidence is UNKNOWN.";
}

function executionFailureReasonFor(state, status) {
  if (status === "COST_BLOCKED") {
    const cost = state.plan && state.plan.budgetState || state.execution && state.execution.costDecision;
    return presentationText(cost && (cost.reason || cost.recommendedNextStep));
  }

  if (state.report && state.report.status === "FAILED") {
    const knownFailures = textListOrUnknown(state.report.knownFailures).filter((entry) => entry !== UNKNOWN);
    return knownFailures.length > 0 ? knownFailures[0] : "Completion report is failed.";
  }

  if (state.validation && state.validation.status === "FAILED") {
    return "Validation failed, so Levi did not mark the task complete.";
  }

  if (state.patch && state.patch.status === "FAILED") {
    return presentationText(state.patch.error || "Safe changes could not be applied.");
  }

  if (state.execution && state.execution.status === "FAILED") {
    return presentationText(state.execution.error || "Execution failed before completion.");
  }

  if (state.generation && state.generation.status === "FAILED") {
    return presentationText(state.generation.error || "Levi could not generate proposed changes.");
  }

  return UNKNOWN;
}

function executionStepsFor(status, failureReason, state) {
  const failedStep = failedExecutionStepFor(state, status);
  const currentStep = currentExecutionStepIdFor(state, status, failedStep);
  const stepIds = [
    "context",
    "generation",
    "operations",
    "restore",
    "apply",
    "validation",
    "memory",
    "complete",
  ];

  return stepIds.map((id) => ({
    id,
    label: executionStepLabel(id),
    status: executionStepStatusFor(id, stepIds, status, currentStep, failedStep, state),
    detail: executionStepDetailFor(id, state, failureReason),
  }));
}

function executionStepLabel(id) {
  return {
    context: "Preparing context",
    generation: "Generating changes",
    operations: "Checking operations",
    restore: "Creating restore point",
    apply: "Applying changes",
    validation: "Running validation",
    memory: "Updating verified memory",
    complete: "Completing task",
  }[id];
}

function failedExecutionStepFor(state, status) {
  if (status === "COST_BLOCKED") {
    return "context";
  }

  if (state.execution && state.execution.status === "FAILED" && !state.generation && !state.patch) {
    return "generation";
  }

  if (state.generation && state.generation.status === "FAILED") {
    return "generation";
  }

  if (state.generation && Array.isArray(state.generation.operations) && state.generation.operations.length === 0) {
    return "operations";
  }

  if (state.patch && state.patch.status === "FAILED") {
    return state.patch.restorePoint ? "apply" : "restore";
  }

  if (state.validation && state.validation.status === "FAILED") {
    return "validation";
  }

  if (state.report && state.report.status === "FAILED") {
    return state.validation && state.validation.status === "FAILED" ? "validation" : "complete";
  }

  return null;
}

function currentExecutionStepIdFor(state, status, failedStep) {
  if (failedStep) {
    return failedStep;
  }

  if (status === "COMPLETED" || status === "PARTIAL") {
    return "complete";
  }

  if (status === "WAITING_TO_START" || status === "WAITING_FOR_APPROVAL" || status === "EMPTY") {
    return "context";
  }

  if (!state.generation) {
    return "generation";
  }

  if (!state.patch) {
    return "operations";
  }

  if (state.patch && !state.patch.restorePoint) {
    return "restore";
  }

  if (state.patch && state.patch.status !== "COMPLETED") {
    return "apply";
  }

  if (!state.validation) {
    return "validation";
  }

  if (!state.memoryRecord && state.validation.status === "COMPLETED" && !state.report) {
    return "memory";
  }

  return "complete";
}

function executionStepStatusFor(id, stepIds, status, currentStep, failedStep, state) {
  if (status === "EMPTY") {
    return "NOT_STARTED";
  }

  if (id === failedStep) {
    return "FAILED";
  }

  if (failedStep) {
    return stepIds.indexOf(id) < stepIds.indexOf(failedStep) ? "COMPLETED" : "NOT_STARTED";
  }

  if (status === "COMPLETED" || status === "PARTIAL") {
    return "COMPLETED";
  }

  if (status === "WAITING_TO_START" || status === "WAITING_FOR_APPROVAL") {
    return id === "context" ? "CURRENT" : "NOT_STARTED";
  }

  const currentIndex = stepIds.indexOf(currentStep);
  const stepIndex = stepIds.indexOf(id);

  if (stepIndex < currentIndex) {
    return "COMPLETED";
  }

  if (stepIndex === currentIndex) {
    return "CURRENT";
  }

  return "NOT_STARTED";
}

function executionStepDetailFor(id, state, failureReason) {
  if (id === "context") {
    return state.plan ? "Approved task context is available." : "Task context is UNKNOWN.";
  }

  if (id === "generation") {
    if (state.generation && state.generation.status) {
      return `Generation status: ${presentationText(state.generation.status)}.`;
    }

    if (state.execution && state.execution.error) {
      return presentationText(state.execution.error);
    }

    return "No generated change proposal is recorded yet.";
  }

  if (id === "operations") {
    const operations = state.generation && Array.isArray(state.generation.operations) ? state.generation.operations.length : null;
    return operations === null ? "Proposed operations are not recorded yet." : `${operations} proposed operation${operations === 1 ? "" : "s"} recorded.`;
  }

  if (id === "restore") {
    const restorePoint = state.patch && state.patch.restorePoint;
    return restorePoint ? "Restore point evidence is available." : "Restore point evidence is UNKNOWN.";
  }

  if (id === "apply") {
    if (state.patch && state.patch.status) {
      return state.patch.error ? presentationText(state.patch.error) : `Safe changes status: ${presentationText(state.patch.status)}.`;
    }

    return "Safe changes have not been applied yet.";
  }

  if (id === "validation") {
    if (state.validation && state.validation.status) {
      return `Validation status: ${presentationText(state.validation.status)}.`;
    }

    return "Validation has not run yet.";
  }

  if (id === "memory") {
    if (state.memoryRecord) {
      return "Verified task outcome was recorded.";
    }

    return state.report && state.report.status === "COMPLETED" ? "Verified task outcome evidence is UNKNOWN." : "Project Knowledge updates wait for successful completion.";
  }

  if (id === "complete") {
    if (state.report && state.report.status) {
      return `Completion status: ${presentationText(state.report.status)}.`;
    }

    return failureReason === UNKNOWN ? "Completion report is not available yet." : failureReason;
  }

  return UNKNOWN;
}

function currentStepForProgress(progress) {
  const failed = progress.find((step) => step.status === "FAILED");

  if (failed) {
    return failed.label;
  }

  const current = progress.find((step) => step.status === "CURRENT");

  if (current) {
    return current.label;
  }

  const completed = progress.filter((step) => step.status === "COMPLETED");
  return completed.length > 0 ? completed[completed.length - 1].label : UNKNOWN;
}

function executionChangedFilesFor(state) {
  const patchChanges = state.patch && Array.isArray(state.patch.changes) ? state.patch.changes : [];
  const reportFiles = state.report && Array.isArray(state.report.filesChanged) ? state.report.filesChanged : [];
  const changes = patchChanges.length > 0
    ? patchChanges.filter((change) => change.changed !== false).map((change) => ({
        path: relativePathText(change.path),
        type: operationTypeFor(change.type),
      }))
    : reportFiles.map((filePath) => ({
        path: relativePathText(filePath),
        type: "changed",
      }));
  const cleanChanges = changes.filter((change) => change.path !== UNKNOWN);

  return {
    created: cleanChanges.filter((change) => change.type === "create").map((change) => change.path).sort(),
    updated: cleanChanges.filter((change) => change.type === "update").map((change) => change.path).sort(),
    deleted: cleanChanges.filter((change) => change.type === "delete").map((change) => change.path).sort(),
    changed: cleanChanges.filter((change) => !["create", "update", "delete"].includes(change.type)).map((change) => change.path).sort(),
    total: uniqueSorted(cleanChanges.map((change) => change.path)).length,
  };
}

function emptyChangedFilesSummary() {
  return {
    created: [],
    updated: [],
    deleted: [],
    changed: [],
    total: 0,
  };
}

function executionValidationSummaryFor(state) {
  const sourceResults = state.report && Array.isArray(state.report.validationResults)
    ? state.report.validationResults
    : state.validation && Array.isArray(state.validation.results)
      ? state.validation.results
      : [];
  const commands = state.report && Array.isArray(state.report.commandsRun)
    ? state.report.commandsRun.map((entry) => entry.command)
    : state.plan && Array.isArray(state.plan.validationCommands)
      ? state.plan.validationCommands
      : [];
  const results = sourceResults.map(validationResultForUi);
  const failed = results.some((result) => result.status === "FAILED");
  const status = sourceResults.length > 0 ? failed ? "FAILED" : "COMPLETED" : commands.length > 0 ? "PLANNED" : "UNKNOWN";

  return {
    status,
    label: validationLabelFor(status, results.length),
    commands: textListOrUnknown(commands),
    results,
  };
}

function validationResultForUi(result) {
  const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : UNKNOWN;

  return {
    command: presentationText(result.command),
    cwd: result.cwd ? path.basename(String(result.cwd)) || UNKNOWN : UNKNOWN,
    exitCode,
    status: exitCode === 0 ? "COMPLETED" : "FAILED",
    output: validationOutputSummary(result),
  };
}

function validationOutputSummary(result) {
  const error = presentationText(result.error);

  if (error !== UNKNOWN) {
    return error;
  }

  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const text = stderr || stdout;

  if (!text) {
    return "No output.";
  }

  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function validationLabelFor(status, count) {
  if (status === "COMPLETED") {
    return `${count} passed`;
  }

  if (status === "FAILED") {
    return "Failed";
  }

  if (status === "PLANNED") {
    return "Planned";
  }

  return "Unknown";
}

function executionRestoreSummaryFor(state) {
  const restorePoint = state.patch && state.patch.restorePoint || state.restorePoint;

  if (!isPlainObject(restorePoint)) {
    return {
      status: "UNAVAILABLE",
      label: "Unavailable",
      detail: "No restore point is recorded for this task.",
      available: false,
      files: [],
    };
  }

  const status = stringOrUnknown(restorePoint.status).toUpperCase();
  const files = Array.isArray(restorePoint.files)
    ? restorePoint.files.map((file) => relativePathText(file.path || file.relativePath)).filter((entry) => entry !== UNKNOWN).sort()
    : [];
  const available = status === "CREATED" || status === "AVAILABLE";

  return {
    status,
    label: available ? "Available" : plainStatus(status),
    detail: available ? "A Levi restore point is available." : "Restore point state needs review.",
    available,
    files,
  };
}

function executionCostSummaryFor(state) {
  const cost = state.execution && state.execution.costDecision || state.plan && state.plan.budgetState;

  if (!isPlainObject(cost)) {
    return emptyCostSummary();
  }

  const status = stringOrUnknown(cost.status).toUpperCase();
  const costClass = presentationText(cost.costClass);

  return {
    status,
    label: costLabel(status, costClass, state.plan && state.plan.costApprovalState === "APPROVED"),
    detail: presentationText(cost.reason || cost.recommendedNextStep),
    costClass,
    estimatedCost: moneyText(cost.estimatedCost || cost.exactEstimate || cost.estimatedCostRange),
    budgetCeiling: moneyText(cost.budgetCeiling),
    approvalRequired: status === "APPROVAL_REQUIRED",
    approved: state.plan && state.plan.costApprovalState === "APPROVED",
    blocked: status === "BLOCKED",
  };
}

function executionProjectHealthSummaryFor(state) {
  const health = state.report && state.report.projectHealthSummary;

  if (!isPlainObject(health)) {
    return {
      status: "UNKNOWN",
      label: "Unknown",
      summary: "Project Health summary is UNKNOWN for this result.",
      readyToWork: false,
      issues: [],
      recommendations: [],
    };
  }

  const issues = Array.isArray(health.highestSeverityIssues) ? health.highestSeverityIssues.slice(0, 4).map((issue) => ({
    label: presentationText(issue.label || issue.signalId),
    detail: presentationText(issue.detail),
    status: presentationText(issue.status),
    severity: presentationText(issue.severity),
  })) : [];
  const recommendations = Array.isArray(health.recommendations) ? health.recommendations.slice(0, 4).map((recommendation) => ({
    action: presentationText(recommendation.action),
    reason: presentationText(recommendation.reason),
    priority: presentationText(recommendation.priority),
  })) : [];

  return {
    status: presentationText(health.overallStatus),
    label: plainStatus(health.overallStatus),
    summary: presentationText(health.summary),
    readyToWork: health.readyToWork === true,
    issues,
    recommendations,
  };
}

function emptyProviderReadinessSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    detail: "Provider readiness is UNKNOWN.",
    availableCount: UNKNOWN,
  };
}

function providerReadinessSummaryFor(state) {
  const readiness = state.execution && state.execution.readiness;
  const providerState = state.execution && state.execution.providerState;

  if (isPlainObject(readiness)) {
    const status = presentationText(readiness.overallReadiness || readiness.status);
    return {
      status,
      label: plainStatus(status),
      detail: providerReadinessDetail(readiness),
      availableCount: Array.isArray(readiness.availableProviders) ? readiness.availableProviders.length : UNKNOWN,
    };
  }

  if (isPlainObject(providerState)) {
    const available = Array.isArray(providerState.available) ? providerState.available.length : 0;
    const registered = Array.isArray(providerState.registered) ? providerState.registered.length : UNKNOWN;
    return {
      status: available > 0 ? "READY" : registered === 0 ? "NOT_READY" : "UNKNOWN",
      label: available > 0 ? "Ready" : registered === 0 ? "Blocked" : "Unknown",
      detail: available > 0 ? `${available} model setup path is available.` : "No usable model setup path is available.",
      availableCount: available,
    };
  }

  return emptyProviderReadinessSummary();
}

function providerReadinessDetail(readiness) {
  if (Array.isArray(readiness.configurationIssues) && readiness.configurationIssues.length > 0) {
    return presentationText(readiness.configurationIssues[0]);
  }

  const count = Array.isArray(readiness.availableProviders) ? readiness.availableProviders.length : null;

  if (count !== null) {
    return count > 0 ? `${count} model setup path is available.` : "No usable model setup path is available.";
  }

  return "Provider readiness was reported by Levi Core.";
}

function completionSummaryFor(state, status) {
  const report = state.report;

  if (!isPlainObject(report)) {
    return emptyCompletionSummary();
  }

  return {
    status: presentationText(report.status || status),
    label: plainStatus(report.status || status),
    summary: presentationText(report.changeSummary),
    requirementId: presentationText(report.requirementId),
    commandsRun: Array.isArray(report.commandsRun)
      ? report.commandsRun.map((entry) => presentationText(entry.command)).filter((entry) => entry !== UNKNOWN)
      : [],
    memoryUpdated: Boolean(state.memoryRecord),
  };
}

function emptyCompletionSummary() {
  return {
    status: "UNKNOWN",
    label: "Unknown",
    summary: "Completion report is not available yet.",
    requirementId: UNKNOWN,
    commandsRun: [],
    memoryUpdated: false,
  };
}

function executionWarningsFor(state, status, cost, restore, validation, providerReadiness) {
  const warnings = [];

  if (status === "PROVIDER_UNAVAILABLE") {
    warnings.push("Model setup is unavailable for this execution.");
  }

  if (cost.blocked) {
    warnings.push(cost.detail);
  }

  if (!restore.available) {
    warnings.push("Restore point is unavailable for this task.");
  }

  if (validation.status === "FAILED") {
    warnings.push("Validation failed.");
  }

  if (providerReadiness.status === "NOT_READY") {
    warnings.push(providerReadiness.detail);
  }

  if (state.patch && state.patch.status === "FAILED") {
    warnings.push(presentationText(state.patch.error));
  }

  return uniqueSorted(warnings.filter((entry) => entry && entry !== UNKNOWN));
}

function executionActionsFor(status, hasChanges, restoreAvailable) {
  const primary = {
    label: "Review Plan",
    href: "#plan-approval",
  };

  if (status === "COMPLETED") {
    primary.label = "Start New Task";
    primary.href = "#new-task";
  } else if (status === "FAILED" || status === "PARTIAL" || status === "PROVIDER_UNAVAILABLE" || status === "COST_BLOCKED") {
    primary.label = "Review Plan";
    primary.href = "#plan-approval";
  } else if (status === "RUNNING") {
    primary.label = "Refresh";
    primary.href = "#execution-progress";
  } else if (status === "WAITING_TO_START") {
    primary.label = "Start Execution";
    primary.action = "execute";
  }

  return {
    primary,
    secondary: [
      {
        label: "View Changes",
        href: "#execution-changes",
        enabled: hasChanges,
      },
      {
        label: "Restore",
        href: "#history",
        enabled: restoreAvailable,
      },
      {
        label: "Start New Task",
        href: "#new-task",
        enabled: true,
      },
    ],
  };
}

function providerUnavailableState(state) {
  const text = presentationText(state.execution && state.execution.error || state.generation && state.generation.error).toLowerCase();
  return text.includes("provider") || text.includes("model setup") || text.includes("no usable model") || text.includes("fallback");
}

function loadRuntimeState(repositoryPath) {
  const filePath = path.join(repositoryPath, ".levi", "state.json");

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveRuntimeState(repositoryPath, state) {
  const filePath = path.join(repositoryPath, ".levi", "state.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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

function loadHistoryMemoryRecords(repositoryPath) {
  const filePath = path.join(repositoryPath, ".levi", "memory.json");

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const projects = isPlainObject(store.projects) ? store.projects : {};
  const projectIds = uniqueSorted([projectIdFor(repositoryPath), "default"]);
  const records = [];
  const seen = new Set();

  for (const projectId of projectIds) {
    const project = projects[projectId];

    if (!project || !Array.isArray(project.records)) {
      continue;
    }

    for (const record of project.records) {
      if (!isPlainObject(record) || record.type !== "task-outcome") {
        continue;
      }

      const id = stringOrUnknown(record.id);
      const key = id === UNKNOWN ? JSON.stringify(record.source || {}) : id;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      records.push(record);
    }
  }

  return records;
}

function projectIdFor(repositoryPath) {
  return path.resolve(repositoryPath);
}

function listOrUnknown(value) {
  const values = collectionTextValues(value);

  if (values.length === 0) {
    return [UNKNOWN];
  }

  return values.sort();
}

function collectionTextValues(value) {
  if (value === undefined || value === null || value === UNKNOWN) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];

  return Array.from(new Set(values.flatMap(textValuesFor))).filter((entry) => entry !== UNKNOWN);
}

function textValuesFor(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = stringOrUnknown(value);
    return text === UNKNOWN ? [] : [text];
  }

  if (!isPlainObject(value)) {
    return [];
  }

  for (const key of ["name", "label", "path", "command", "source", "signal", "value"]) {
    const text = stringOrUnknown(value[key]);

    if (text !== UNKNOWN) {
      return [text];
    }
  }

  return [];
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  if (typeof value === "object") {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function titleCase(value) {
  const text = stringOrUnknown(value);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  return text.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  createAdvancedSettingsView,
  createHomeDashboardView,
  createHomeIntakePreview,
  createExecutionCompletionView,
  createProjectHealthView,
  createPlanApprovalView,
  createRestoreHistoryView,
  startApprovedExecution,
  submitAdvancedSettings,
  submitHomeRequest,
  submitPlanApproval,
  submitRestoreConfirmation,
};
