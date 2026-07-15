const UNKNOWN = "UNKNOWN";
const UNESTIMABLE = Symbol("UNESTIMABLE");
const WITHIN_BUDGET = "WITHIN_BUDGET";
const NEAR_LIMIT = "NEAR_LIMIT";
const OVER_BUDGET = "OVER_BUDGET";
const BUDGET_UNKNOWN = "UNKNOWN";

const DEFAULT_TOKEN_CEILING = 8000;
const NEAR_LIMIT_RATIO = 0.9;
const ESTIMATION_RULE = "DETERMINISTIC_CHARACTERS_DIVIDED_BY_FOUR_ROUNDED_UP";

const CATEGORY_PRIORITY = [
  "approvedRequirements",
  "taskPlan",
  "repositoryFacts",
  "projectMemory",
  "repositoryRoot",
  "contextMetadata",
];
const PRESERVED_CATEGORIES = new Set([
  "approvedRequirements",
  "taskPlan",
  "repositoryFacts",
  "projectMemory",
]);

function applyContextBudget(context, options = {}) {
  validateContext(context);
  validateOptions(options);

  const tokenCeiling = normalizeTokenCeiling(options.tokenCeiling, DEFAULT_TOKEN_CEILING);
  const budgeted = buildBudgetedContext(context, tokenCeiling);
  const report = createContextBudgetReport(budgeted.context, {
    tokenCeiling,
    omittedContextCategories: budgeted.omittedContextCategories,
  });

  return {
    context: budgeted.context,
    report,
  };
}

function createContextBudgetReport(context, options = {}) {
  validateContext(context);
  validateOptions(options);

  const tokenCeiling = normalizeTokenCeiling(options.tokenCeiling, UNKNOWN);
  const categories = contextCategories(context);
  const estimation = estimateContextTokens(categories);
  const omittedContextCategories = normalizeOmitted(options.omittedContextCategories);
  const budgetStatus = budgetStatusFor(estimation.totalEstimatedTokens, tokenCeiling);
  const remainingTokenBudget = remainingBudget(estimation.totalEstimatedTokens, tokenCeiling);

  return {
    totalEstimatedTokens: estimation.totalEstimatedTokens,
    configuredTokenCeiling: tokenCeiling,
    remainingTokenBudget,
    budgetStatus,
    includedContextCategories: categories.map((category) => category.name),
    omittedContextCategories,
    reason: reasonFor(budgetStatus, estimation.totalEstimatedTokens, tokenCeiling, omittedContextCategories),
    estimation: {
      rule: ESTIMATION_RULE,
      evidenceStatus: estimation.evidenceStatus,
    },
  };
}

function buildBudgetedContext(context, tokenCeiling) {
  const categories = contextCategories(context);

  if (tokenCeiling === UNKNOWN) {
    return {
      context: contextFromCategories(categories),
      omittedContextCategories: [],
    };
  }

  const included = categories.slice();
  const omitted = [];

  while (estimatedTotal(included) !== UNKNOWN && estimatedTotal(included) > tokenCeiling) {
    const index = lastOmittableIndex(included);

    if (index < 0) {
      break;
    }

    const [removed] = included.splice(index, 1);
    omitted.push({
      category: removed.name,
      reason: "Omitted lower-priority context to preserve approved requirements, task plan, cited facts, and verified memory.",
    });
  }

  return {
    context: contextFromCategories(included),
    omittedContextCategories: omitted.sort(compareOmissions),
  };
}

function contextCategories(context) {
  return CATEGORY_PRIORITY
    .map((name) => categoryFromContext(name, context))
    .filter((category) => category.included);
}

function categoryFromContext(name, context) {
  if (name === "contextMetadata") {
    const metadata = {};

    if (context.contextBudget !== undefined) {
      metadata.contextBudget = context.contextBudget;
    }

    return {
      name,
      value: metadata,
      included: Object.keys(metadata).length > 0,
    };
  }

  return {
    name,
    value: context[name],
    included: context[name] !== undefined,
  };
}

function contextFromCategories(categories) {
  const context = {};

  for (const category of categories) {
    if (category.name === "contextMetadata") {
      if (isPlainObject(category.value) && category.value.contextBudget !== undefined) {
        context.contextBudget = category.value.contextBudget;
      }
      continue;
    }

    context[category.name] = category.value;
  }

  return context;
}

function estimateContextTokens(categories) {
  const estimates = categories.map((category) => estimatedTokens(category.value));

  if (estimates.some((estimate) => estimate === UNKNOWN)) {
    return {
      totalEstimatedTokens: UNKNOWN,
      evidenceStatus: UNKNOWN,
    };
  }

  return {
    totalEstimatedTokens: estimates.reduce((total, estimate) => total + estimate, 0),
    evidenceStatus: "ESTIMATED",
  };
}

function estimatedTotal(categories) {
  return estimateContextTokens(categories).totalEstimatedTokens;
}

function estimatedTokens(value) {
  const serialized = stableSerialize(value);

  if (serialized === UNESTIMABLE) {
    return UNKNOWN;
  }

  return Math.ceil(serialized.length / 4);
}

function budgetStatusFor(totalEstimatedTokens, tokenCeiling) {
  if (totalEstimatedTokens === UNKNOWN || tokenCeiling === UNKNOWN) {
    return BUDGET_UNKNOWN;
  }

  if (totalEstimatedTokens > tokenCeiling) {
    return OVER_BUDGET;
  }

  if (totalEstimatedTokens >= Math.ceil(tokenCeiling * NEAR_LIMIT_RATIO)) {
    return NEAR_LIMIT;
  }

  return WITHIN_BUDGET;
}

function remainingBudget(totalEstimatedTokens, tokenCeiling) {
  if (totalEstimatedTokens === UNKNOWN || tokenCeiling === UNKNOWN) {
    return UNKNOWN;
  }

  return tokenCeiling - totalEstimatedTokens;
}

function reasonFor(status, totalEstimatedTokens, tokenCeiling, omittedContextCategories) {
  if (status === BUDGET_UNKNOWN) {
    return "Context budget is UNKNOWN because token estimation evidence or token ceiling is UNKNOWN.";
  }

  if (status === OVER_BUDGET) {
    return "Context remains over the configured token ceiling after preserving required context categories.";
  }

  if (omittedContextCategories.length > 0) {
    return "Lower-priority context was omitted to keep required context categories within the configured token ceiling.";
  }

  if (status === NEAR_LIMIT) {
    return "Context is near the configured token ceiling.";
  }

  return "Context is within the configured token ceiling.";
}

function lastOmittableIndex(categories) {
  for (let index = categories.length - 1; index >= 0; index -= 1) {
    if (!PRESERVED_CATEGORIES.has(categories[index].name)) {
      return index;
    }
  }

  return -1;
}

function normalizeTokenCeiling(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1) {
    return UNKNOWN;
  }

  return value;
}

function normalizeOmitted(omitted) {
  if (!Array.isArray(omitted)) {
    return [];
  }

  return omitted
    .filter(isPlainObject)
    .map((entry) => ({
      category: stringOrUnknown(entry.category),
      reason: stringOrUnknown(entry.reason),
    }))
    .sort(compareOmissions);
}

function compareOmissions(left, right) {
  const leftIndex = CATEGORY_PRIORITY.indexOf(left.category);
  const rightIndex = CATEGORY_PRIORITY.indexOf(right.category);

  return normalizedIndex(leftIndex) - normalizedIndex(rightIndex);
}

function normalizedIndex(index) {
  return index < 0 ? CATEGORY_PRIORITY.length : index;
}

function stableSerialize(value) {
  if (value === undefined) {
    return UNESTIMABLE;
  }

  if (value === null) {
    return "null";
  }

  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
    return UNESTIMABLE;
  }

  if (typeof value === "string") {
    return value.trim() === "" ? UNKNOWN : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const serialized = value.map(stableSerialize);

    if (serialized.some((entry) => entry === UNESTIMABLE)) {
      return UNESTIMABLE;
    }

    return `[${serialized.join(", ")}]`;
  }

  if (isPlainObject(value)) {
    const parts = [];

    for (const key of Object.keys(value).sort()) {
      const serialized = stableSerialize(value[key]);

      if (serialized === UNESTIMABLE) {
        return UNESTIMABLE;
      }

      parts.push(`${key}: ${serialized}`);
    }

    return `{${parts.join(", ")}}`;
  }

  return UNESTIMABLE;
}

function validateContext(context) {
  if (!isPlainObject(context)) {
    throw new Error("Context budget input is required.");
  }
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Context budget options must be an object.");
  }
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
  BUDGET_UNKNOWN,
  DEFAULT_TOKEN_CEILING,
  NEAR_LIMIT,
  OVER_BUDGET,
  UNKNOWN,
  WITHIN_BUDGET,
  applyContextBudget,
  createContextBudgetReport,
};
