const UNKNOWN = "UNKNOWN";
const NONE = "NONE";
const OPERATION_TYPES = new Set(["create", "update", "delete"]);

function createApprovalSummary(taskPlan) {
  validateTaskPlan(taskPlan);

  const operations = normalizeOperations(taskPlan.plannedOperations);
  const hasOperations = Array.isArray(operations);
  const createdFiles = hasOperations ? filesForType(operations, "create") : [UNKNOWN];
  const updatedFiles = hasOperations ? filesForType(operations, "update") : [UNKNOWN];
  const deletedFiles = hasOperations ? filesForType(operations, "delete") : [UNKNOWN];
  const destructiveActions = hasOperations ? destructiveActionsFor(operations) : [UNKNOWN];
  const totalFilesAffected = hasOperations ? uniqueSorted(operations.map((operation) => operation.path)).length : UNKNOWN;
  const details = {
    taskObjective: stringOrUnknown(taskPlan.objective),
    filesCreated: withNone(createdFiles),
    filesUpdated: withNone(updatedFiles),
    filesDeleted: withNone(deletedFiles),
    totalFilesAffected,
    destructiveActions: withNone(destructiveActions),
    validationCommands: listOrUnknown(taskPlan.validationCommands),
    estimatedCostDecision: costDecision(taskPlan),
    restorePointStatus: restorePointStatus(taskPlan),
    risks: listOrUnknown(taskPlan.risks),
    plannedOperations: hasOperations ? operations.map(operationText) : [UNKNOWN],
  };

  return {
    text: renderSummary(details),
    details,
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
  };
}

function filesForType(operations, type) {
  return uniqueSorted(operations.filter((operation) => operation.type === type).map((operation) => operation.path));
}

function destructiveActionsFor(operations) {
  return uniqueSorted(
    operations
      .filter((operation) => operation.type === "delete")
      .map((operation) => `Delete ${operation.path}`),
  );
}

function operationText(operation) {
  const verb = {
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

function renderSummary(details) {
  return [
    "Safe approval summary",
    `Task objective: ${details.taskObjective}`,
    `Files created: ${joinList(details.filesCreated)}`,
    `Files updated: ${joinList(details.filesUpdated)}`,
    `Files deleted: ${joinList(details.filesDeleted)}`,
    `Total files affected: ${details.totalFilesAffected}`,
    `Destructive actions: ${joinList(details.destructiveActions)}`,
    `Validation commands: ${joinList(details.validationCommands)}`,
    `Estimated cost decision: ${details.estimatedCostDecision}`,
    `Restore-point status: ${details.restorePointStatus}`,
    `Risks: ${joinList(details.risks)}`,
    `Planned operations: ${joinList(details.plannedOperations)}`,
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createApprovalSummary,
};
