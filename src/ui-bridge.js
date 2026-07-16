const fs = require("node:fs");
const path = require("node:path");
const { intakeRepository } = require("./repository-intake");
const { scanRepository } = require("./repository-scanner");
const { summarizeProject } = require("./project-summary");
const { collectProjectHealthSignals, recommendProjectHealth, summarizeProjectHealth } = require("./project-health");
const { createTaskIntake } = require("./task-intake");
const { createApprovalDecision, createApprovalSummary } = require("./approval-summary");
const { approvePlan } = require("./cli-workflow");

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
  createHomeDashboardView,
  createHomeIntakePreview,
  createExecutionCompletionView,
  createProjectHealthView,
  createPlanApprovalView,
  submitPlanApproval,
};
