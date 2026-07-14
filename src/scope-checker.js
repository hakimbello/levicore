const ASSUMPTION_REQUIRES_APPROVAL = "ASSUMPTION REQUIRES APPROVAL";

function checkScope(request, approvedRequirements) {
  validateInputs(request, approvedRequirements);

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

  const requirement = approvedRequirements.find((candidate) => candidate.id === request.requirementId);

  if (!requirement) {
    return {
      status: "REJECTED_OUT_OF_SCOPE",
      proceedToPlanning: false,
    };
  }

  return {
    status: "IN_SCOPE",
    proceedToPlanning: true,
    requirement,
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

module.exports = {
  ASSUMPTION_REQUIRES_APPROVAL,
  checkScope,
};
