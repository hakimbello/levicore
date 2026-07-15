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
}

function attachCostEstimate(plan, costEstimate) {
  validatePlan(plan);

  return {
    ...plan,
    costEstimate: normalizeCostEstimate(costEstimate),
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
  attachCostEstimate,
  approveTaskPlan,
  canBeginExecution,
  createTaskPlan,
};
