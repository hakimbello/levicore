const {
  validateProvider,
  validateProviderCostEstimate,
  validateProviderRequest,
} = require("./model-provider-interface");

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

  async function route(request) {
    validateProviderRequest(request);

    if (providers.length === 0) {
      throw new Error("No model providers are registered.");
    }

    if (iterations >= options.limits.maxIterations) {
      throw new Error("Model gateway iteration limit exceeded.");
    }

    const primary = selectProvider(request, providers);
    const fallback = selectFallback(primary, providers);
    const estimatedCost = primary.estimateCost(request);
    validateProviderCostEstimate(estimatedCost);

    if (spent + estimatedCost.amount > options.limits.maxSpend) {
      throw new Error("Model gateway spending limit exceeded.");
    }

    iterations += 1;
    spent += estimatedCost.amount;

    return {
      provider: primary,
      fallback,
      routing: {
        selectedModel: primary.model,
        selectedProvider: primary.name,
        reason: primary.reason,
        estimatedCostClass: estimatedCost.costClass,
        fallback: fallback
          ? {
              model: fallback.model,
              provider: fallback.name,
            }
          : null,
      },
      usage: {
        spent,
        iterations,
      },
    };
  }

  return {
    getProviders,
    registerProvider,
    route,
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
};
