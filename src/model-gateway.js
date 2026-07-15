const {
  validateProvider,
  validateProviderCostEstimate,
  validateProviderRequest,
} = require("./model-provider-interface");
const { ALLOWED, BLOCKED, UNKNOWN, checkBudget } = require("./budget-guardrails");
const { estimateTaskCost } = require("./cost-estimator");
const { discoverLocalModels: discoverLocalModelEvidence } = require("./local-model-discovery");
const { checkProviderHealth: checkProviderHealthForProviders } = require("./provider-health");

function createModelGateway(options) {
  validateOptions(options);

  const providers = [];
  let spent = 0;
  let iterations = 0;

  for (const provider of options.providers || []) {
    registerProvider(provider);
  }

  function registerProvider(provider) {
    validateProvider(provider);
    providers.push(provider);
    return provider;
  }

  function getProviders() {
    return providers.slice();
  }

  function discoverLocalModels(discoveryOptions = {}) {
    if (
      !discoveryOptions ||
      typeof discoveryOptions !== "object" ||
      Array.isArray(discoveryOptions)
    ) {
      throw new Error("Local model discovery options must be an object.");
    }

    const configuredLocalModels = providers
      .filter((provider) => provider.type === "local")
      .map((provider) => provider.model);
    const hasOllamaOptions = Object.prototype.hasOwnProperty.call(discoveryOptions, "ollama");
    const localOptions = hasOllamaOptions ? discoveryOptions.ollama : discoveryOptions;

    if (!localOptions || typeof localOptions !== "object" || Array.isArray(localOptions)) {
      throw new Error("Local model discovery options must be an object.");
    }

    const ollamaOptions = {
      ...localOptions,
      requiredModels: mergeModelLists(localOptions.requiredModels, configuredLocalModels),
    };

    if (hasOllamaOptions) {
      return discoverLocalModelEvidence({
        ...discoveryOptions,
        ollama: ollamaOptions,
      });
    }

    return discoverLocalModelEvidence(ollamaOptions);
  }

  function estimateCost(request) {
    const provider = selectProviderForRequest(request);
    const fallback = selectFallback(provider, providers);
    const costEstimate = estimateTaskCost({ provider, request });
    const costDecision = request.budgetCeiling
      ? checkBudget({
          costEstimate,
          budgetCeiling: request.budgetCeiling,
        })
      : null;

    return {
      provider,
      fallback,
      costEstimate,
      budget: costDecision,
      costDecision,
      routing: routingMetadata(provider, fallback, costEstimate, costDecision),
      usage: {
        spent,
        iterations,
      },
    };
  }

  function estimateCostDecision(request) {
    validateProviderRequest(request);

    if (!request.budgetCeiling) {
      throw new Error("Model gateway cost decision budgetCeiling is required.");
    }

    if (providers.length === 0) {
      return missingProviderDecision(request.budgetCeiling);
    }

    return estimateCost(request).costDecision;
  }

  function checkProviderHealth(healthOptions = {}) {
    if (
      !healthOptions ||
      typeof healthOptions !== "object" ||
      Array.isArray(healthOptions)
    ) {
      throw new Error("Provider health options must be an object.");
    }

    return checkProviderHealthForProviders({
      ...healthOptions,
      providers,
    });
  }

  async function route(request) {
    validateProviderRequest(request);

    if (iterations >= options.limits.maxIterations) {
      throw new Error("Model gateway iteration limit exceeded.");
    }

    const preview = estimateCost(request);
    enforceBudget(preview.budget);
    const executionCost = preview.provider.estimateCost(request);
    validateProviderCostEstimate(executionCost);

    if (spent + executionCost.amount > options.limits.maxSpend) {
      throw new Error("Model gateway spending limit exceeded.");
    }

    iterations += 1;
    spent += executionCost.amount;

    return {
      provider: preview.provider,
      fallback: preview.fallback,
      routing: preview.routing,
      usage: {
        spent,
        iterations,
      },
    };
  }

  return {
    checkProviderHealth,
    discoverLocalModels,
    estimateCost,
    estimateCostDecision,
    getProviders,
    registerProvider,
    route,
  };

  function selectProviderForRequest(request) {
    validateProviderRequest(request);

    if (providers.length === 0) {
      throw new Error("No model providers are registered.");
    }

    return selectProvider(request, providers);
  }
}

function routingMetadata(provider, fallback, costEstimate, budget) {
  return {
    selectedModel: provider.model,
    selectedProvider: provider.name,
    reason: provider.reason,
    estimatedCostClass: costEstimate.costClass,
    costEstimate,
    budget,
    costDecision: budget,
    fallback: fallback
      ? {
          model: fallback.model,
          provider: fallback.name,
        }
      : null,
  };
}

function enforceBudget(budget) {
  if (!budget || budget.status === ALLOWED) {
    return;
  }

  if (budget.status === "APPROVAL_REQUIRED") {
    throw new Error("Model gateway budget approval required.");
  }

  throw new Error("Model gateway budget ceiling exceeded.");
}

function missingProviderDecision(budgetCeiling) {
  return {
    status: BLOCKED,
    provider: UNKNOWN,
    model: UNKNOWN,
    costClass: UNKNOWN,
    currency: UNKNOWN,
    exactEstimate: UNKNOWN,
    estimatedCostRange: UNKNOWN,
    estimatedCost: UNKNOWN,
    budgetCeiling: normalizeBudgetCeiling(budgetCeiling),
    pricingEvidence: {
      source: UNKNOWN,
      currency: UNKNOWN,
      costClass: UNKNOWN,
    },
    reason: "No model providers are registered, so cost cannot be estimated before execution.",
    recommendedNextStep: "Configure a local or remote provider before execution.",
  };
}

function normalizeBudgetCeiling(budgetCeiling) {
  if (!budgetCeiling || typeof budgetCeiling !== "object" || Array.isArray(budgetCeiling)) {
    throw new Error("Model gateway cost decision budgetCeiling is required.");
  }

  if (!Number.isFinite(budgetCeiling.amount) || budgetCeiling.amount < 0) {
    throw new Error("Model gateway cost decision budgetCeiling amount must be a nonnegative number.");
  }

  if (typeof budgetCeiling.currency !== "string" || budgetCeiling.currency.trim() === "") {
    throw new Error("Model gateway cost decision budgetCeiling currency is required.");
  }

  return {
    amount: budgetCeiling.amount,
    currency: budgetCeiling.currency,
  };
}

function selectProvider(request, providers) {
  const preferred = request.preferredProvider
    ? providers.find((provider) => provider.name === request.preferredProvider)
    : null;

  if (preferred) {
    return preferred;
  }

  const byType = request.providerType
    ? providers.find((provider) => provider.type === request.providerType)
    : null;

  if (byType) {
    return byType;
  }

  return providers[0];
}

function selectFallback(primary, providers) {
  return providers.find((provider) => provider.name !== primary.name) || null;
}

function mergeModelLists(first, second) {
  const modelNames = new Set();

  for (const list of [first, second]) {
    if (list === undefined) {
      continue;
    }

    if (!Array.isArray(list)) {
      throw new Error("Local model discovery model lists must be arrays.");
    }

    for (const modelName of list) {
      if (typeof modelName === "string" && modelName.trim() !== "") {
        modelNames.add(modelName.trim());
      }
    }
  }

  return Array.from(modelNames);
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Model gateway options are required.");
  }

  if (options.providers !== undefined && !Array.isArray(options.providers)) {
    throw new Error("Model gateway providers must be an array.");
  }

  for (const provider of options.providers || []) {
    validateProvider(provider);
  }

  if (!options.limits || typeof options.limits !== "object" || Array.isArray(options.limits)) {
    throw new Error("Model gateway limits are required.");
  }

  if (!Number.isFinite(options.limits.maxSpend) || options.limits.maxSpend < 0) {
    throw new Error("Model gateway maxSpend limit is required.");
  }

  if (!Number.isInteger(options.limits.maxIterations) || options.limits.maxIterations < 1) {
    throw new Error("Model gateway maxIterations limit is required.");
  }
}
module.exports = {
  createModelGateway,
  discoverLocalModels: discoverLocalModelEvidence,
};
