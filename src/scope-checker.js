const ASSUMPTION_REQUIRES_APPROVAL = "ASSUMPTION REQUIRES APPROVAL";
const UNKNOWN = "UNKNOWN";
const INTAKE_BLOCKING_STATUSES = new Set(["MORE_INFORMATION_REQUIRED", "AMBIGUOUS", "REJECTED"]);
const { enforceProjectDecisions } = require("./project-decisions");

function checkScope(request, approvedRequirements, options = {}) {
  validateInputs(request, approvedRequirements);

  const intakeBlock = intakeBlockFor(request);

  if (intakeBlock) {
    return intakeBlock;
  }

  if (request.isNewIdea) {
    return {
      status: "NEW_IDEA_RECORDED",
      proceedToPlanning: false,
      newIdea: request,
    };
  }

  if (request.ambiguous) {
    return {
      status: ASSUMPTION_REQUIRES_APPROVAL,
      proceedToPlanning: false,
    };
  }

  if (typeof request.requirementId !== "string" || request.requirementId.trim() === "" || request.requirementId === UNKNOWN) {
    return {
      status: "REJECTED_OUT_OF_SCOPE",
      proceedToPlanning: false,
      reason: "Scope request does not name an approved requirement.",
    };
  }

  const requirement = approvedRequirements.find((candidate) => candidate.id === request.requirementId);

  if (!requirement) {
    return {
      status: "REJECTED_OUT_OF_SCOPE",
      proceedToPlanning: false,
    };
  }

  const decisionEnforcement = hasDecisionInputs(options)
    ? enforceProjectDecisions({
        projectId: options.projectId || "default",
        memoryStore: options.memoryStore,
        decisionRecords: options.decisionRecords,
        task: {
          objective: request.normalizedObjective || request.originalRequest,
        },
      })
    : null;

  if (decisionEnforcement && decisionEnforcement.status === "BLOCKED") {
    return {
      status: "BLOCKED",
      proceedToPlanning: false,
      requirement,
      decisionEnforcement,
      reason: decisionEnforcement.reason,
    };
  }

  const result = {
    status: "IN_SCOPE",
    proceedToPlanning: true,
    requirement,
    handoff: {
      originalRequest: request.originalRequest,
      normalizedObjective: request.normalizedObjective,
      taskType: request.taskType,
      requestedActionClass: request.requestedActionClass,
    },
  };

  if (decisionEnforcement) {
    result.decisionEnforcement = decisionEnforcement;
  }

  return result;
}

function intakeBlockFor(request) {
  if (!INTAKE_BLOCKING_STATUSES.has(request.intakeStatus)) {
    return null;
  }

  if (request.intakeStatus === "AMBIGUOUS") {
    return {
      status: ASSUMPTION_REQUIRES_APPROVAL,
      proceedToPlanning: false,
      reason: "Ambiguous intake cannot proceed to planning.",
      ambiguityReasons: arrayOrEmpty(request.ambiguityReasons),
      nextQuestions: arrayOrEmpty(request.nextQuestions),
    };
  }

  if (request.intakeStatus === "MORE_INFORMATION_REQUIRED") {
    return {
      status: "MORE_INFORMATION_REQUIRED",
      proceedToPlanning: false,
      reason: "Missing intake information blocks planning.",
      missingInformation: arrayOrEmpty(request.missingInformation),
      nextQuestions: arrayOrEmpty(request.nextQuestions),
    };
  }

  return {
    status: "REJECTED_OUT_OF_SCOPE",
    proceedToPlanning: false,
    reason: "Rejected intake cannot proceed to planning.",
  };
}

function validateInputs(request, approvedRequirements) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Scope request must be an object.");
  }

  if (!Array.isArray(approvedRequirements)) {
    throw new Error("Approved requirements must be an array.");
  }

  for (const requirement of approvedRequirements) {
    if (!requirement || typeof requirement.id !== "string") {
      throw new Error("Approved requirement ID is required.");
    }
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? [...value].sort() : [];
}

function hasDecisionInputs(options) {
  return Boolean(
    options &&
      typeof options === "object" &&
      (Array.isArray(options.decisionRecords) || (options.memoryStore && typeof options.memoryStore.listRecords === "function")),
  );
}

module.exports = {
  ASSUMPTION_REQUIRES_APPROVAL,
  checkScope,
};
