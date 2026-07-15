const APPROVAL_STATES = {
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "APPROVED",
};

function createTaskPlan(input) {
  validatePlanInput(input);

  const plan = {
    requirementId: input.requirementId,
    expectedFiles: [...input.expectedFiles],
    acceptanceCriteria: [...input.acceptanceCriteria],
    validationCommands: [...input.validationCommands],
    risks: [...input.risks],
    exclusions: [...input.exclusions],
    approvalState: APPROVAL_STATES.AWAITING_APPROVAL,
  };

  if (input.costEstimate !== undefined) {
    plan.costEstimate = normalizeCostEstimate(input.costEstimate);
  }

  if (input.budgetState !== undefined) {
    plan.budgetState = normalizeBudgetState(input.budgetState);
  }

  return plan;
}

function approveTaskPlan(plan) {
  validatePlan(plan);

  return {
    ...plan,
    approvalState: APPROVAL_STATES.APPROVED,
  };
}

function canBeginExecution(plan) {
  validatePlan(plan);
  return plan.approvalState === APPROVAL_STATES.APPROVED;
}

function validatePlanInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Task plan input must be an object.");
  }

  requireString(input.requirementId, "requirementId");
  requireStringArray(input.expectedFiles, "expectedFiles");
  requireStringArray(input.acceptanceCriteria, "acceptanceCriteria");
  requireStringArray(input.validationCommands, "validationCommands");
  requireStringArray(input.risks, "risks");
  requireStringArray(input.exclusions, "exclusions");
}

function validatePlan(plan) {
  validatePlanInput(plan);

  if (!Object.values(APPROVAL_STATES).includes(plan.approvalState)) {
    throw new Error("Task plan approvalState is required.");
  }

  if (plan.costEstimate !== undefined) {
    normalizeCostEstimate(plan.costEstimate);
  }

  if (plan.budgetState !== undefined) {
    normalizeBudgetState(plan.budgetState);
  }
}

function attachCostEstimate(plan, costEstimate) {
  validatePlan(plan);

  return {
    ...plan,
    costEstimate: normalizeCostEstimate(costEstimate),
  };
}

function attachBudgetState(plan, budgetState) {
  validatePlan(plan);

  return {
    ...plan,
    budgetState: normalizeBudgetState(budgetState),
  };
}

function normalizeCostEstimate(costEstimate) {
  if (!costEstimate || typeof costEstimate !== "object" || Array.isArray(costEstimate)) {
    throw new Error("Task plan costEstimate must be an object.");
  }

  for (const fieldName of [
    "selectedProvider",
    "selectedModel",
    "costClass",
    "currency",
    "evidenceSource",
  ]) {
    requireString(costEstimate[fieldName], `costEstimate.${fieldName}`);
  }

  return JSON.parse(JSON.stringify(costEstimate));
}

function normalizeBudgetState(budgetState) {
  if (!budgetState || typeof budgetState !== "object" || Array.isArray(budgetState)) {
    throw new Error("Task plan budgetState must be an object.");
  }

  if (!["ALLOWED", "APPROVAL_REQUIRED", "BLOCKED"].includes(budgetState.status)) {
    throw new Error("Task plan budgetState.status is required.");
  }

  for (const fieldName of ["provider", "model", "reason"]) {
    requireString(budgetState[fieldName], `budgetState.${fieldName}`);
  }

  if (budgetState.estimatedCost === undefined) {
    throw new Error("Task plan budgetState.estimatedCost is required.");
  }

  if (!budgetState.budgetCeiling || typeof budgetState.budgetCeiling !== "object") {
    throw new Error("Task plan budgetState.budgetCeiling is required.");
  }

  if (!budgetState.pricingEvidence || typeof budgetState.pricingEvidence !== "object") {
    throw new Error("Task plan budgetState.pricingEvidence is required.");
  }

  return JSON.parse(JSON.stringify(budgetState));
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Task plan ${fieldName} is required.`);
  }
}

function requireStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Task plan ${fieldName} is required.`);
  }

  for (const item of value) {
    requireString(item, fieldName);
  }
}

module.exports = {
  APPROVAL_STATES,
  attachBudgetState,
  attachCostEstimate,
  approveTaskPlan,
  canBeginExecution,
  createTaskPlan,
};
