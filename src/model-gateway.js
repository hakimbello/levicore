const {
  validateProvider,
  validateProviderCostEstimate,
  validateProviderRequest,
} = require("./model-provider-interface");
const { discoverLocalModels: discoverLocalModelEvidence } = require("./local-model-discovery");

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
    discoverLocalModels,
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
