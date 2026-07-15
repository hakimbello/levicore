const {
  isControlledProvider,
  validateProvider,
  validateProviderCostEstimate,
  validateProviderRequest,
} = require("./model-provider-interface");
const { ALLOWED, BLOCKED, UNKNOWN, checkBudget } = require("./budget-guardrails");
const { estimateTaskCost } = require("./cost-estimator");
const { discoverLocalModels: discoverLocalModelEvidence } = require("./local-model-discovery");
const {
  checkProviderHealth: checkProviderHealthForProviders,
  createFallbackDiagnostics,
} = require("./provider-health");
const { createOllamaProvider } = require("./providers/ollama-provider");
const { createRemoteProvider } = require("./providers/remote-provider");

const DEFAULT_PUBLIC_GATEWAY_LIMITS = {
  maxSpend: 1,
  maxIterations: 2,
};

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

  async function inspectFallbackDiagnostics(request = {}, diagnosticOptions = {}) {
    validateProviderRequest(request);

    if (
      !diagnosticOptions ||
      typeof diagnosticOptions !== "object" ||
      Array.isArray(diagnosticOptions)
    ) {
      throw new Error("Fallback diagnostics options must be an object.");
    }

    const providerHealth = await checkProviderHealth({
      checkedAt: diagnosticOptions.checkedAt,
    });

    if (providers.length === 0) {
      return createFallbackDiagnostics({
        providers,
        providerHealth,
        primaryProvider: null,
        fallbackProvider: null,
        primaryFailure: diagnosticOptions.primaryFailure,
        usage: {
          spent,
          iterations,
        },
        limits: options.limits,
      });
    }

    const preview = estimateCost(request);

    return createFallbackDiagnostics({
      providers,
      providerHealth,
      primaryProvider: preview.provider,
      fallbackProvider: preview.fallback,
      primaryFailure: diagnosticOptions.primaryFailure,
      usage: {
        spent,
        iterations,
      },
      limits: options.limits,
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
    inspectFallbackDiagnostics,
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

function createPublicModelGateway(options = {}) {
  validatePublicGatewayOptions(options);

  const registry = createPublicProviderRegistry(options);
  const gateway = createModelGateway({
    providers: registry.providers,
    limits: normalizeGatewayLimits(options.limits),
  });

  return {
    ...gateway,
    getProviderRegistry() {
      return cloneRegistry(registry);
    },
    getPublicProviderState() {
      return {
        mode: registry.mode,
        source: registry.source,
        registeredProviderCount: registry.providers.length,
        providerPriorityOrder: registry.providers.map(providerRegistryEntry),
        configurationIssues: registry.configurationIssues.slice(),
      };
    },
  };
}

function createPublicProviderRegistry(options = {}) {
  validatePublicRegistryOptions(options);

  const environment = normalizeEnvironment(options.environment);
  const configurationIssues = [];
  const environmentProviders = providersFromEnvironment(environment, configurationIssues);
  const injectedProviders = normalizeInjectedProviders(options.providers || [], options.testMode === true);
  const providers = orderProvidersLocalFirst([...environmentProviders, ...injectedProviders]);

  return {
    mode: options.testMode === true ? "test" : "public",
    source: "public-provider-registry",
    providers,
    configurationIssues,
  };
}

function providersFromEnvironment(environment, configurationIssues) {
  return [
    ...localProvidersFromEnvironment(environment, configurationIssues),
    ...remoteProvidersFromEnvironment(environment, configurationIssues),
  ];
}

function localProvidersFromEnvironment(environment, configurationIssues) {
  const model = environmentValue(environment, "LEVI_OLLAMA_MODEL");
  const endpoint = environmentValue(environment, "LEVI_OLLAMA_ENDPOINT");
  const name = environmentValue(environment, "LEVI_OLLAMA_PROVIDER_NAME");

  if (!model) {
    if (endpoint || name) {
      configurationIssues.push(configurationIssue({
        providerType: "local",
        reason: "Ollama provider configuration is incomplete.",
        missingFields: ["LEVI_OLLAMA_MODEL"],
      }));
    }

    return [];
  }

  try {
    return [
      createOllamaProvider({
        model,
        endpoint,
        name,
      }),
    ];
  } catch (error) {
    configurationIssues.push(configurationIssue({
      providerType: "local",
      reason: error.message,
      missingFields: [],
    }));
    return [];
  }
}

function remoteProvidersFromEnvironment(environment, configurationIssues) {
  const endpoint = environmentValue(environment, "LEVI_REMOTE_ENDPOINT");
  const model = environmentValue(environment, "LEVI_REMOTE_MODEL");
  const credential = environmentValue(environment, "LEVI_REMOTE_CREDENTIAL");
  const name = environmentValue(environment, "LEVI_REMOTE_PROVIDER_NAME");
  const costClass = environmentValue(environment, "LEVI_REMOTE_COST_CLASS");
  const estimatedCost = environmentValue(environment, "LEVI_REMOTE_ESTIMATED_COST");
  const configuredFieldNames = [
    ["LEVI_REMOTE_ENDPOINT", endpoint],
    ["LEVI_REMOTE_MODEL", model],
    ["LEVI_REMOTE_CREDENTIAL", credential],
    ["LEVI_REMOTE_PROVIDER_NAME", name],
    ["LEVI_REMOTE_COST_CLASS", costClass],
    ["LEVI_REMOTE_ESTIMATED_COST", estimatedCost],
  ].filter(([, value]) => value !== undefined);

  if (configuredFieldNames.length === 0) {
    return [];
  }

  const missingFields = [
    ["LEVI_REMOTE_ENDPOINT", endpoint],
    ["LEVI_REMOTE_MODEL", model],
    ["LEVI_REMOTE_CREDENTIAL", credential],
  ].filter(([, value]) => value === undefined).map(([fieldName]) => fieldName);

  if (missingFields.length > 0) {
    configurationIssues.push(configurationIssue({
      providerType: "remote",
      reason: "Remote provider configuration is incomplete.",
      missingFields,
    }));
    return [];
  }

  try {
    return [
      createRemoteProvider({
        endpoint,
        model,
        credential,
        name,
        costClass,
        estimatedCost: estimatedCost === undefined ? undefined : Number(estimatedCost),
      }),
    ];
  } catch (error) {
    configurationIssues.push(configurationIssue({
      providerType: "remote",
      reason: error.message,
      missingFields: [],
    }));
    return [];
  }
}

function normalizeInjectedProviders(providers, testMode) {
  if (providers.length > 0 && !testMode) {
    throw new Error("Public provider injection is allowed only in explicit test mode.");
  }

  return providers.map((provider) => {
    validateProvider(provider);

    if (!isControlledProvider(provider)) {
      throw new Error("Injected public providers must be marked as controlled test providers.");
    }

    return provider;
  });
}

function orderProvidersLocalFirst(providers) {
  return providers
    .map((provider, index) => ({ provider, index }))
    .sort((left, right) => {
      if (left.provider.type === right.provider.type) {
        return left.index - right.index;
      }

      if (left.provider.type === "local") {
        return -1;
      }

      if (right.provider.type === "local") {
        return 1;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.provider);
}

function configurationIssue({ providerType, reason, missingFields }) {
  return {
    providerType,
    availability: "MISSING_CONFIGURATION",
    reason,
    missingFields,
  };
}

function cloneRegistry(registry) {
  return {
    mode: registry.mode,
    source: registry.source,
    providers: registry.providers.slice(),
    configurationIssues: registry.configurationIssues.slice(),
  };
}

function providerRegistryEntry(provider, index) {
  return {
    priority: index + 1,
    name: provider.name,
    type: provider.type,
    model: provider.model,
  };
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

function validatePublicGatewayOptions(options) {
  validatePublicRegistryOptions(options);

  if (options.limits !== undefined) {
    validateLimits(options.limits);
  }
}

function validatePublicRegistryOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Public provider registry options must be an object.");
  }

  if (options.environment !== undefined && (!options.environment || typeof options.environment !== "object")) {
    throw new Error("Public provider registry environment must be an object.");
  }

  if (options.providers !== undefined && !Array.isArray(options.providers)) {
    throw new Error("Public provider registry providers must be an array.");
  }

  if (options.testMode !== undefined && typeof options.testMode !== "boolean") {
    throw new Error("Public provider registry testMode must be boolean.");
  }
}

function normalizeGatewayLimits(limits) {
  const normalized = limits || DEFAULT_PUBLIC_GATEWAY_LIMITS;
  validateLimits(normalized);
  return {
    maxSpend: normalized.maxSpend,
    maxIterations: normalized.maxIterations,
  };
}

function validateLimits(limits) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("Model gateway limits are required.");
  }

  if (!Number.isFinite(limits.maxSpend) || limits.maxSpend < 0) {
    throw new Error("Model gateway maxSpend limit is required.");
  }

  if (!Number.isInteger(limits.maxIterations) || limits.maxIterations < 1) {
    throw new Error("Model gateway maxIterations limit is required.");
  }
}

function normalizeEnvironment(environment) {
  if (environment === undefined) {
    return process.env;
  }

  return environment;
}

function environmentValue(environment, fieldName) {
  const value = environment[fieldName];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
module.exports = {
  createPublicModelGateway,
  createPublicProviderRegistry,
  createModelGateway,
  discoverLocalModels: discoverLocalModelEvidence,
};
