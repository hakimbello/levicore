const UNKNOWN = "UNKNOWN";
const NONE = "NONE";
const {
  evaluateCostDecisionApproval,
} = require("./budget-guardrails");
const OPERATION_TYPES = new Set(["create", "update", "delete", "command"]);
const DECISIONS = {
  APPROVED: "APPROVED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  DESTRUCTIVE_CONFIRMATION_REQUIRED: "DESTRUCTIVE_CONFIRMATION_REQUIRED",
  BLOCKED: "BLOCKED",
};

function createApprovalSummary(taskPlan) {
  validateTaskPlan(taskPlan);

  const operations = normalizeOperations(taskPlan.plannedOperations);
  const hasOperations = Array.isArray(operations);
  const createdFiles = hasOperations ? filesForType(operations, "create") : [UNKNOWN];
  const updatedFiles = hasOperations ? filesForType(operations, "update") : [UNKNOWN];
  const deletedFiles = hasOperations ? filesForType(operations, "delete") : [UNKNOWN];
  const destructiveActions = hasOperations ? destructiveActionsFor(operations) : [UNKNOWN];
  const destructiveConfirmationRequired = hasOperations ? confirmationRequirement(destructiveActions) : UNKNOWN;
  const totalFilesAffected = hasOperations ? uniqueSorted(operations.map((operation) => operation.path)).length : UNKNOWN;
  const details = {
    taskObjective: stringOrUnknown(taskPlan.objective),
    filesCreated: withNone(createdFiles),
    filesUpdated: withNone(updatedFiles),
    filesDeleted: withNone(deletedFiles),
    totalFilesAffected,
    destructiveActions: withNone(destructiveActions),
    destructiveConfirmationRequired,
    validationCommands: listOrUnknown(taskPlan.validationCommands),
    estimatedCostDecision: costDecision(taskPlan),
    restorePointStatus: restorePointStatus(taskPlan),
    decisionEnforcement: decisionEnforcementText(taskPlan),
    risks: listOrUnknown(taskPlan.risks),
    plannedOperations: hasOperations ? operations.map(operationText) : [UNKNOWN],
  };

  return {
    text: renderSummary(details),
    details,
  };
}

function createApprovalDecision(taskPlan) {
  if (!isPlainObject(taskPlan)) {
    const details = {
      decision: DECISIONS.BLOCKED,
      taskObjective: UNKNOWN,
      filesCreated: [UNKNOWN],
      filesUpdated: [UNKNOWN],
      filesDeleted: [UNKNOWN],
      totalFilesAffected: UNKNOWN,
      destructiveActions: [UNKNOWN],
      validationCommands: [UNKNOWN],
      costDecision: UNKNOWN,
      restorePointStatus: UNKNOWN,
      decisionEnforcement: UNKNOWN,
      reason: "No task plan exists.",
      nextRequiredAction: "Create an approved task plan before execution.",
    };

    return {
      ...details,
      summary: null,
      text: renderDecision(details),
    };
  }

  const summary = createApprovalSummary(taskPlan);
  const blockingIssue = blockingIssueFor(taskPlan);
  const decision = decisionFor(taskPlan, summary.details, blockingIssue);
  const details = {
    decision: decision.status,
    taskObjective: summary.details.taskObjective,
    filesCreated: summary.details.filesCreated,
    filesUpdated: summary.details.filesUpdated,
    filesDeleted: summary.details.filesDeleted,
    totalFilesAffected: summary.details.totalFilesAffected,
    destructiveActions: summary.details.destructiveActions,
    validationCommands: summary.details.validationCommands,
    costDecision: summary.details.estimatedCostDecision,
    restorePointStatus: summary.details.restorePointStatus,
    decisionEnforcement: summary.details.decisionEnforcement,
    reason: decision.reason,
    nextRequiredAction: decision.nextRequiredAction,
  };

  return {
    ...details,
    summary,
    text: renderDecision(details),
  };
}

function validateTaskPlan(taskPlan) {
  if (!isPlainObject(taskPlan)) {
    throw new Error("Approval summary task plan is required.");
  }
}

function normalizeOperations(operations) {
  if (operations === undefined) {
    return null;
  }

  if (!Array.isArray(operations)) {
    throw new Error("Approval summary plannedOperations must be an array.");
  }

  return operations.map(normalizeOperation).sort(compareOperations);
}

function normalizeOperation(operation) {
  if (!isPlainObject(operation)) {
    throw new Error("Approval summary planned operation must be an object.");
  }

  if (!OPERATION_TYPES.has(operation.type)) {
    throw new Error("Approval summary planned operation type is invalid.");
  }

  return {
    type: operation.type,
    path: stringOrThrow(operation.path, "Approval summary planned operation path is required."),
    destructive: operation.destructive === true,
    destructiveAction: optionalString(operation.destructiveAction),
    irreversible: operation.irreversible === true,
    overwrite: operation.overwrite === true,
    broadRewrite: operation.broadRewrite === true,
    destructiveConfirmation: operation.destructiveConfirmation === true,
  };
}

function filesForType(operations, type) {
  return uniqueSorted(operations.filter((operation) => operation.type === type).map((operation) => operation.path));
}

function destructiveActionsFor(operations) {
  return uniqueSorted(
    operations.flatMap((operation) => {
      const actions = [];

      if (operation.type === "delete") {
        actions.push(`Delete ${operation.path}`);
      }

      if (operation.overwrite) {
        actions.push(`Overwrite ${operation.path}`);
      }

      if (operation.broadRewrite) {
        actions.push(`Broad rewrite ${operation.path}`);
      }

      if (operation.irreversible) {
        actions.push(`Irreversible action ${operation.path}`);
      }

      if (operation.destructive) {
        actions.push(operation.destructiveAction || `Destructive action ${operation.path}`);
      }

      return actions;
    }),
  );
}

function confirmationRequirement(destructiveActions) {
  return destructiveActions.length > 0 ? "REQUIRED" : "NOT REQUIRED";
}

function blockingIssueFor(taskPlan) {
  if (!isPlainObject(taskPlan)) {
    return "No task plan exists.";
  }

  const decisionIssue = decisionBlockingIssue(taskPlan);

  if (decisionIssue) {
    return decisionIssue;
  }

  const plannedFiles = plannedFileSet(taskPlan.expectedFiles);

  if (plannedFiles === null) {
    return null;
  }

  const operations = normalizeOperations(taskPlan.plannedOperations);

  if (!operations) {
    return null;
  }

  for (const operation of operations) {
    if (!plannedFiles.has(operation.path)) {
      return `Operation is outside approved files: ${operation.path}`;
    }
  }

  return null;
}

function decisionFor(taskPlan, details, blockingIssue) {
  if (blockingIssue) {
    return {
      status: DECISIONS.BLOCKED,
      reason: blockingIssue,
      nextRequiredAction: "Update the approved plan before execution.",
    };
  }

  if (taskPlan.approvalState !== "APPROVED") {
    return {
      status: DECISIONS.APPROVAL_REQUIRED,
      reason: "Task plan approval is required before execution.",
      nextRequiredAction: "Approve the task plan.",
    };
  }

  if (details.destructiveConfirmationRequired === "REQUIRED" && !allDestructiveOperationsConfirmed(taskPlan)) {
    return {
      status: DECISIONS.DESTRUCTIVE_CONFIRMATION_REQUIRED,
      reason: "Destructive actions need separate confirmation.",
      nextRequiredAction: "Confirm destructive actions before execution.",
    };
  }

  const costApproval = evaluateCostDecisionApproval({
    costDecision: taskPlan.budgetState,
    costApprovalState: taskPlan.costApprovalState,
  });

  if (!costApproval.ok) {
    return {
      status: costApproval.status,
      reason: costApproval.reason,
      nextRequiredAction:
        costApproval.status === DECISIONS.APPROVAL_REQUIRED
          ? "Approve the cost decision before execution."
          : "Resolve the cost decision before execution.",
    };
  }

  if (isPlainObject(taskPlan.costEstimate) && taskPlan.costEstimate.costClass === UNKNOWN) {
    return {
      status: DECISIONS.APPROVAL_REQUIRED,
      reason: "Estimated cost is UNKNOWN.",
      nextRequiredAction: "Approve UNKNOWN cost before execution.",
    };
  }

  return {
    status: DECISIONS.APPROVED,
    reason: "Task plan is approved and ready for execution.",
    nextRequiredAction: "Proceed with execution.",
  };
}

function allDestructiveOperationsConfirmed(taskPlan) {
  const operations = normalizeOperations(taskPlan.plannedOperations);

  if (!operations) {
    return true;
  }

  return operations.every((operation) => !isDestructiveOperation(operation) || operation.destructiveConfirmation === true);
}

function isDestructiveOperation(operation) {
  return (
    operation.type === "delete" ||
    operation.destructive === true ||
    operation.irreversible === true ||
    operation.overwrite === true ||
    operation.broadRewrite === true
  );
}

function plannedFileSet(expectedFiles) {
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) {
    return null;
  }

  const plannedFiles = new Set();

  for (const filePath of expectedFiles) {
    plannedFiles.add(stringOrThrow(filePath, "Approval summary expected file path is required."));
  }

  return plannedFiles;
}

function operationText(operation) {
  const verb = {
    command: "Run command for",
    create: "Create",
    update: "Update",
    delete: "Delete",
  }[operation.type];

  return `${verb} ${operation.path}`;
}

function costDecision(taskPlan) {
  if (isPlainObject(taskPlan.budgetState)) {
    const status = stringOrUnknown(taskPlan.budgetState.status);
    const costClass = stringOrUnknown(taskPlan.budgetState.costClass);
    const reason = stringOrUnknown(taskPlan.budgetState.reason);

    return `${status}. Cost class: ${costClass}. Reason: ${reason}.`;
  }

  if (isPlainObject(taskPlan.costEstimate)) {
    const costClass = stringOrUnknown(taskPlan.costEstimate.costClass);

    if (costClass === UNKNOWN) {
      return "UNKNOWN. Cost class is UNKNOWN.";
    }

    return `Cost class: ${costClass}.`;
  }

  return UNKNOWN;
}

function restorePointStatus(taskPlan) {
  if (typeof taskPlan.restorePointStatus === "string" && taskPlan.restorePointStatus.trim() !== "") {
    return taskPlan.restorePointStatus;
  }

  if (isPlainObject(taskPlan.restorePoint) && typeof taskPlan.restorePoint.status === "string") {
    return stringOrUnknown(taskPlan.restorePoint.status);
  }

  return UNKNOWN;
}

function decisionEnforcementText(taskPlan) {
  if (!isPlainObject(taskPlan.decisionEnforcement)) {
    return UNKNOWN;
  }

  const status = stringOrUnknown(taskPlan.decisionEnforcement.status);
  const reason = stringOrUnknown(taskPlan.decisionEnforcement.reason);
  const decisions = Array.isArray(taskPlan.decisionEnforcement.decisions)
    ? taskPlan.decisionEnforcement.decisions
        .map((decision) => `${stringOrUnknown(decision.decisionId)} ${stringOrUnknown(decision.category)}`)
        .sort()
    : [UNKNOWN];

  return `${status}. Reason: ${reason}. Decisions: ${joinList(decisions)}.`;
}

function decisionBlockingIssue(taskPlan) {
  if (!isPlainObject(taskPlan.decisionEnforcement)) {
    return null;
  }

  if (taskPlan.decisionEnforcement.status === "BLOCKED") {
    return `Project decision blocks execution: ${stringOrUnknown(taskPlan.decisionEnforcement.reason)}`;
  }

  return null;
}

function renderSummary(details) {
  return [
    "Safe approval summary",
    `Task objective: ${details.taskObjective}`,
    `Files created: ${joinList(details.filesCreated)}`,
    `Files updated: ${joinList(details.filesUpdated)}`,
    `Files deleted: ${joinList(details.filesDeleted)}`,
    `Total files affected: ${details.totalFilesAffected}`,
    `DESTRUCTIVE ACTIONS: ${joinList(details.destructiveActions)}`,
    `Destructive confirmation: ${details.destructiveConfirmationRequired}`,
    `Validation commands: ${joinList(details.validationCommands)}`,
    `Estimated cost decision: ${details.estimatedCostDecision}`,
    `Restore-point status: ${details.restorePointStatus}`,
    `Decision enforcement: ${details.decisionEnforcement}`,
    `Risks: ${joinList(details.risks)}`,
    `Planned operations: ${joinList(details.plannedOperations)}`,
  ].join("\n");
}

function renderDecision(details) {
  return [
    `Approval decision: ${details.decision}`,
    `Task objective: ${details.taskObjective}`,
    `Files created: ${joinList(details.filesCreated)}`,
    `Files updated: ${joinList(details.filesUpdated)}`,
    `Files deleted: ${joinList(details.filesDeleted)}`,
    `Total files affected: ${details.totalFilesAffected}`,
    `DESTRUCTIVE ACTIONS: ${joinList(details.destructiveActions)}`,
    `Validation commands: ${joinList(details.validationCommands)}`,
    `Cost decision: ${details.costDecision}`,
    `Restore-point status: ${details.restorePointStatus}`,
    `Decision enforcement: ${details.decisionEnforcement}`,
    `Reason: ${details.reason}`,
    `Next required action: ${details.nextRequiredAction}`,
  ].join("\n");
}

function listOrUnknown(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [UNKNOWN];
  }

  return value.map((item) => stringOrUnknown(item));
}

function withNone(value) {
  return value.length === 0 ? [NONE] : value;
}

function uniqueSorted(value) {
  return Array.from(new Set(value)).sort();
}

function compareOperations(left, right) {
  if (left.type !== right.type) {
    return left.type.localeCompare(right.type);
  }

  return left.path.localeCompare(right.path);
}

function joinList(value) {
  return value.join(", ");
}

function stringOrThrow(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return UNKNOWN;
  }

  return value.trim();
}

function optionalString(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  DECISIONS,
  UNKNOWN,
  createApprovalDecision,
  createApprovalSummary,
};
