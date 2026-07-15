const ALLOWED = "ALLOWED";
const APPROVAL_REQUIRED = "APPROVAL_REQUIRED";
const BLOCKED = "BLOCKED";
const UNKNOWN = "UNKNOWN";

function checkBudget(input) {
  validateInput(input);

  const costEstimate = input.costEstimate;
  const budgetCeiling = normalizeBudgetCeiling(input.budgetCeiling);
  const estimatedCost = normalizeEstimatedCost(costEstimate);
  const exactEstimate = isExactCost(estimatedCost) ? estimatedCost : UNKNOWN;
  const estimatedCostRange = isCostRange(estimatedCost) ? estimatedCost : UNKNOWN;
  const pricingEvidence = pricingEvidenceFrom(costEstimate);
  const base = {
    provider: costEstimate.selectedProvider,
    model: costEstimate.selectedModel,
    costClass: costEstimate.costClass,
    currency: costEstimate.currency,
    exactEstimate,
    estimatedCostRange,
    estimatedCost,
    budgetCeiling,
    pricingEvidence,
  };

  if (costEstimate.costClass === "FREE" && exactAmount(costEstimate) === 0) {
    return {
      ...base,
      status: ALLOWED,
      reason: "Free local execution is within the task spending ceiling.",
      recommendedNextStep: "Proceed with free local execution.",
    };
  }

  if (estimatedCost === UNKNOWN) {
    return {
      ...base,
      status: APPROVAL_REQUIRED,
      reason: "Estimated cost is UNKNOWN, so explicit approval is required before execution.",
      recommendedNextStep: "Review UNKNOWN pricing evidence and explicitly approve before execution.",
    };
  }

  if (
    estimatedCost.currency !== UNKNOWN &&
    budgetCeiling.currency !== estimatedCost.currency
  ) {
    return {
      ...base,
      status: APPROVAL_REQUIRED,
      reason: "Estimated cost currency differs from the task spending ceiling, so explicit approval is required before execution.",
      recommendedNextStep: "Review the currency mismatch and explicitly approve before execution.",
    };
  }

  if (isExactCost(estimatedCost)) {
    if (estimatedCost.amount > budgetCeiling.amount) {
      return {
        ...base,
        status: BLOCKED,
        reason: "Estimated cost exceeds the task spending ceiling.",
        recommendedNextStep: "Lower the estimated cost or raise the configured task spending ceiling before execution.",
      };
    }

    return {
      ...base,
      status: ALLOWED,
      reason: "Estimated cost is within the task spending ceiling.",
      recommendedNextStep: "Proceed with execution.",
    };
  }

  if (estimatedCost.min > budgetCeiling.amount) {
    return {
      ...base,
      status: BLOCKED,
      reason: "Estimated cost range exceeds the task spending ceiling.",
      recommendedNextStep: "Reduce the expected usage or raise the configured task spending ceiling before execution.",
    };
  }

  if (estimatedCost.max > budgetCeiling.amount) {
    return {
      ...base,
      status: APPROVAL_REQUIRED,
      reason: "Estimated cost range crosses the task spending ceiling, so explicit approval is required before execution.",
      recommendedNextStep: "Review the estimate range and explicitly approve before execution.",
    };
  }

  return {
    ...base,
    status: ALLOWED,
    reason: "Estimated cost range is within the task spending ceiling.",
    recommendedNextStep: "Proceed with execution.",
  };
}

function evaluateCostDecisionApproval(input = {}) {
  if (!isPlainObject(input)) {
    throw new Error("Cost decision approval input is required.");
  }

  const costDecision = input.costDecision;

  if (!isPlainObject(costDecision)) {
    return {
      ok: false,
      status: BLOCKED,
      reason: "Cost decision is required before execution.",
    };
  }

  if (costDecision.status === ALLOWED) {
    return {
      ok: true,
      status: ALLOWED,
      reason: costDecision.reason,
    };
  }

  if (costDecision.status === BLOCKED) {
    return {
      ok: false,
      status: BLOCKED,
      reason: stringOrDefault(costDecision.reason, "Cost decision blocks execution."),
    };
  }

  if (costDecision.status === APPROVAL_REQUIRED) {
    if (input.costApprovalState === "APPROVED") {
      return {
        ok: true,
        status: ALLOWED,
        reason: "Cost decision approved.",
      };
    }

    return {
      ok: false,
      status: APPROVAL_REQUIRED,
      reason: stringOrDefault(costDecision.reason, "Cost approval is required before execution."),
    };
  }

  return {
    ok: false,
    status: BLOCKED,
    reason: "Cost decision status is invalid.",
  };
}

function normalizeEstimatedCost(costEstimate) {
  if (isPlainObject(costEstimate.exactCost)) {
    return {
      amount: costEstimate.exactCost.amount,
      currency: costEstimate.exactCost.currency,
    };
  }

  if (isPlainObject(costEstimate.estimatedCostRange)) {
    return {
      min: costEstimate.estimatedCostRange.min,
      max: costEstimate.estimatedCostRange.max,
      currency: costEstimate.estimatedCostRange.currency,
    };
  }

  return UNKNOWN;
}

function pricingEvidenceFrom(costEstimate) {
  return {
    source: costEstimate.evidenceSource,
    currency: costEstimate.currency,
    costClass: costEstimate.costClass,
  };
}

function exactAmount(costEstimate) {
  return isPlainObject(costEstimate.exactCost) ? costEstimate.exactCost.amount : null;
}

function isExactCost(estimatedCost) {
  return isPlainObject(estimatedCost) && Number.isFinite(estimatedCost.amount);
}

function isCostRange(estimatedCost) {
  return (
    isPlainObject(estimatedCost) &&
    Number.isFinite(estimatedCost.min) &&
    Number.isFinite(estimatedCost.max)
  );
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Budget guardrail input is required.");
  }

  validateCostEstimate(input.costEstimate);
  normalizeBudgetCeiling(input.budgetCeiling);
}

function validateCostEstimate(costEstimate) {
  if (!isPlainObject(costEstimate)) {
    throw new Error("Budget guardrail costEstimate is required.");
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

  const exactCost = costEstimate.exactCost;
  const costRange = costEstimate.estimatedCostRange;

  if (exactCost !== UNKNOWN && exactCost !== undefined && !validExactCost(exactCost)) {
    throw new Error("Budget guardrail exact cost is invalid.");
  }

  if (costRange !== UNKNOWN && costRange !== undefined && !validCostRange(costRange)) {
    throw new Error("Budget guardrail estimated cost range is invalid.");
  }
}

function validExactCost(exactCost) {
  return (
    isPlainObject(exactCost) &&
    Number.isFinite(exactCost.amount) &&
    exactCost.amount >= 0 &&
    typeof exactCost.currency === "string" &&
    exactCost.currency.trim() !== ""
  );
}

function validCostRange(costRange) {
  return (
    isPlainObject(costRange) &&
    Number.isFinite(costRange.min) &&
    Number.isFinite(costRange.max) &&
    costRange.min >= 0 &&
    costRange.max >= costRange.min &&
    typeof costRange.currency === "string" &&
    costRange.currency.trim() !== ""
  );
}

function normalizeBudgetCeiling(budgetCeiling) {
  if (!isPlainObject(budgetCeiling)) {
    throw new Error("Budget guardrail budgetCeiling is required.");
  }

  if (!Number.isFinite(budgetCeiling.amount) || budgetCeiling.amount < 0) {
    throw new Error("Budget guardrail budgetCeiling amount must be a nonnegative number.");
  }

  requireString(budgetCeiling.currency, "budgetCeiling.currency");

  return {
    amount: budgetCeiling.amount,
    currency: budgetCeiling.currency,
  };
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Budget guardrail ${fieldName} is required.`);
  }
}

function stringOrDefault(value, defaultValue) {
  return typeof value === "string" && value.trim() !== "" ? value : defaultValue;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  ALLOWED,
  APPROVAL_REQUIRED,
  BLOCKED,
  UNKNOWN,
  checkBudget,
  evaluateCostDecisionApproval,
};
