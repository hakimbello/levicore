const PROVIDER_TYPES = new Set(["local", "remote"]);

function createModelGateway(options) {
  validateOptions(options);

  let spent = 0;
  let iterations = 0;

  async function route(request) {
    validateRequest(request);

    if (iterations >= options.limits.maxIterations) {
      throw new Error("Model gateway iteration limit exceeded.");
    }

    const primary = selectProvider(request, options.providers);
    const fallback = selectFallback(primary, options.providers);
    const estimatedCost = primary.estimateCost(request);

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

  if (!Array.isArray(options.providers) || options.providers.length === 0) {
    throw new Error("At least one model provider is required.");
  }

  const hasLocal = options.providers.some((provider) => provider.type === "local");
  const hasRemote = options.providers.some((provider) => provider.type === "remote");

  if (!hasLocal || !hasRemote) {
    throw new Error("At least one local provider and one remote provider are required.");
  }

  for (const provider of options.providers) {
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

function validateProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    throw new Error("Model provider must be an object.");
  }

  requireString(provider.name, "provider name");
  requireString(provider.model, "provider model");
  requireString(provider.reason, "provider reason");

  if (!PROVIDER_TYPES.has(provider.type)) {
    throw new Error("Model provider type must be local or remote.");
  }

  if (typeof provider.estimateCost !== "function") {
    throw new Error("Model provider estimateCost function is required.");
  }
}

function validateRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("Model gateway request is required.");
  }

  if (request.providerType && !PROVIDER_TYPES.has(request.providerType)) {
    throw new Error("Requested providerType must be local or remote.");
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Model gateway ${fieldName} is required.`);
  }
}

module.exports = {
  createModelGateway,
};
