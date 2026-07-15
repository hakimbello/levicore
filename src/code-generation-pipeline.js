const path = require("node:path");
const { buildContext } = require("./context-builder");
const { buildPrompt } = require("./prompt-engine");

const OPERATION_TYPES = new Set(["create", "update", "delete"]);
const OPERATION_KEYS = new Set(["type", "path", "content"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|secret|token)/i;
const OUTPUT_INSTRUCTIONS = [
  "Return strict JSON only.",
  "Use this exact shape: {\"operations\":[{\"type\":\"create|update|delete\",\"path\":\"relative/path\",\"content\":\"text for create or update\"}]}",
  "Use only create, update, or delete operations.",
  "Use only paths listed in Expected Files.",
  "Do not include explanations, markdown, comments, or patch text outside JSON.",
];

function createCodeGenerationPipeline(options) {
  validateOptions(options);

  async function generate(input) {
    validateGenerationInput(input);

    const context = buildContext({
      projectId: input.projectId,
      taskPlan: input.taskPlan,
      approvedRequirements: input.approvedRequirements,
      projectSummary: input.projectSummary,
      projectMemory: input.projectMemory,
      memoryStore: input.memoryStore,
      limits: input.contextLimits,
    });
    const prompt = buildPrompt({
      ...context,
      outputInstructions: OUTPUT_INSTRUCTIONS,
    });
    const routeResult = await routePrompt(options.modelGateway, prompt.prompt);
    const providerAttempt = await requestProviderWithFallback(
      options.modelGateway,
      routeResult,
      prompt.prompt,
    );
    const providerResponse = providerAttempt.response;
    const operations = parseProposedOperations(providerResponse, input.taskPlan);

    return {
      status: "PROPOSED",
      operations,
      routing: sanitizeRouting(providerAttempt.routing),
      usage: {
        gateway: sanitizeValue(providerAttempt.usage || {}),
        provider: sanitizeValue(providerResponse.usage || {}),
      },
      providerResponse: {
        finishReason: providerResponse.finishReason || "UNKNOWN",
      },
    };
  }

  return {
    generate,
  };
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Code generation pipeline options are required.");
  }

  if (!isPlainObject(options.modelGateway) || typeof options.modelGateway.route !== "function") {
    throw new Error("Code generation pipeline modelGateway is required.");
  }
}

function validateGenerationInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Code generation pipeline input is required.");
  }

  if (!isPlainObject(input.taskPlan)) {
    throw new Error("Code generation pipeline taskPlan is required.");
  }

  if (input.taskPlan.approvalState !== "APPROVED") {
    throw new Error("Code generation pipeline requires an approved task plan.");
  }

  if (!Array.isArray(input.taskPlan.expectedFiles)) {
    throw new Error("Code generation pipeline expectedFiles are required.");
  }
}

async function requestProviderWithFallback(modelGateway, routeResult, prompt) {
  try {
    const response = await requestProvider(routeResult, prompt);

    return {
      response,
      routing: routeResult.routing,
      usage: routeResult.usage,
    };
  } catch (primaryError) {
    if (!routeResult.fallback) {
      throw primaryError;
    }

    let fallbackRoute;

    try {
      fallbackRoute = await routePrompt(modelGateway, prompt, {
        preferredProvider: routeResult.fallback.name,
      });
    } catch (routingError) {
      const fallbackRoutingError = new Error("Code generation fallback routing failed.");
      fallbackRoutingError.code = "CODE_GENERATION_FALLBACK_ROUTING_FAILED";
      fallbackRoutingError.primaryProvider = routeResult.provider.name;
      fallbackRoutingError.fallbackProvider = routeResult.fallback.name;
      fallbackRoutingError.cause = routingError;
      throw fallbackRoutingError;
    }

    try {
      const response = await requestProvider(fallbackRoute, prompt);

      return {
        response,
        routing: fallbackRouting(routeResult.routing, fallbackRoute.routing, primaryError),
        usage: fallbackRoute.usage,
      };
    } catch (fallbackError) {
      const providerError = new Error("Code generation provider and fallback failed.");
      providerError.code = "CODE_GENERATION_PROVIDER_AND_FALLBACK_FAILED";
      providerError.primaryProvider = routeResult.provider.name;
      providerError.fallbackProvider = fallbackRoute.provider.name;
      providerError.primaryCause = primaryError;
      providerError.cause = fallbackError;
      throw providerError;
    }
  }
}

async function requestProvider(routeResult, prompt) {
  try {
    const response = await routeResult.provider.sendRequest({ prompt });
    validateProviderResponse(response);
    return response;
  } catch (error) {
    const providerError = new Error("Code generation provider failed.");
    providerError.code = "CODE_GENERATION_PROVIDER_FAILED";
    providerError.providerName = error.providerName || routeResult.provider.name;
    providerError.cause = error;
    throw providerError;
  }
}

async function routePrompt(modelGateway, prompt, requestOverrides) {
  try {
    const routeResult = await modelGateway.route({ prompt, ...(requestOverrides || {}) });
    validateRouteResult(routeResult);
    return routeResult;
  } catch (error) {
    const routingError = new Error("Code generation routing failed.");
    routingError.code = "CODE_GENERATION_ROUTING_FAILED";
    routingError.cause = error;
    throw routingError;
  }
}

function validateRouteResult(routeResult) {
  if (!isPlainObject(routeResult)) {
    throw new Error("Model gateway route result is required.");
  }

  if (!isPlainObject(routeResult.provider) || typeof routeResult.provider.sendRequest !== "function") {
    throw new Error("Model gateway route result provider is required.");
  }

  if (!isPlainObject(routeResult.routing)) {
    throw new Error("Model gateway routing metadata is required.");
  }
}

function fallbackRouting(primaryRouting, fallbackRouteRouting, primaryError) {
  return {
    selectedModel: fallbackRouteRouting.selectedModel,
    selectedProvider: fallbackRouteRouting.selectedProvider,
    reason: fallbackRouteRouting.reason,
    estimatedCostClass: fallbackRouteRouting.estimatedCostClass,
    primary: {
      selectedModel: primaryRouting.selectedModel,
      selectedProvider: primaryRouting.selectedProvider,
      reason: primaryRouting.reason,
      estimatedCostClass: primaryRouting.estimatedCostClass,
      failure: primaryError.message,
    },
    fallback: {
      ...(primaryRouting.fallback || {}),
      selected: true,
    },
  };
}

function validateProviderResponse(response) {
  if (!isPlainObject(response)) {
    throw new Error("Provider response must be an object.");
  }

  if (typeof response.content !== "string" || response.content.trim() === "") {
    throw new Error("Provider response content is required.");
  }
}

function parseProposedOperations(providerResponse, taskPlan) {
  let parsed;

  try {
    parsed = JSON.parse(providerResponse.content);
  } catch {
    throw new Error("Model response must be strict JSON.");
  }

  if (!isPlainObject(parsed) || !Array.isArray(parsed.operations)) {
    throw new Error("Model response operations array is required.");
  }

  if (parsed.operations.length === 0) {
    throw new Error("Model response must include at least one operation.");
  }

  const parsedKeys = Object.keys(parsed);

  if (parsedKeys.length !== 1 || parsedKeys[0] !== "operations") {
    throw new Error("Model response contains unsupported fields.");
  }

  const plannedFiles = plannedFileSet(taskPlan.expectedFiles);
  const approvedOperations = approvedOperationMap(taskPlan.plannedOperations);

  return parsed.operations.map((operation) => normalizeOperation(operation, plannedFiles, approvedOperations));
}

function plannedFileSet(expectedFiles) {
  const plannedFiles = new Set();

  for (const file of expectedFiles) {
    if (typeof file !== "string" || file.trim() === "" || file === "UNKNOWN") {
      continue;
    }

    plannedFiles.add(normalizeRelativePath(file));
  }

  return plannedFiles;
}

function approvedOperationMap(plannedOperations) {
  const approvedOperations = new Map();

  if (!Array.isArray(plannedOperations)) {
    return approvedOperations;
  }

  for (const operation of plannedOperations) {
    if (!isPlainObject(operation) || typeof operation.path !== "string" || typeof operation.type !== "string") {
      continue;
    }

    const relativePath = normalizeRelativePath(operation.path);
    const key = `${operation.type}:${relativePath}`;
    approvedOperations.set(key, {
      type: operation.type,
      path: relativePath,
      destructiveConfirmation: operation.destructiveConfirmation === true,
    });
  }

  return approvedOperations;
}

function normalizeOperation(operation, plannedFiles, approvedOperations) {
  if (!isPlainObject(operation)) {
    throw new Error("Proposed operation must be an object.");
  }

  for (const key of Object.keys(operation)) {
    if (!OPERATION_KEYS.has(key)) {
      throw new Error(`Unsupported operation field: ${key}`);
    }
  }

  if (!OPERATION_TYPES.has(operation.type)) {
    throw new Error("Proposed operation type is invalid.");
  }

  if (typeof operation.path !== "string" || operation.path.trim() === "") {
    throw new Error("Proposed operation path is required.");
  }

  const relativePath = normalizeRelativePath(operation.path);

  if (!plannedFiles.has(relativePath)) {
    throw new Error(`Proposed operation is outside planned boundaries: ${relativePath}`);
  }

  if ((operation.type === "create" || operation.type === "update") && typeof operation.content !== "string") {
    throw new Error("Proposed create or update operation content is required.");
  }

  if (operation.type === "delete" && operation.content !== undefined) {
    throw new Error("Proposed delete operation must not include content.");
  }

  if (operation.type === "delete") {
    const approvedDelete = approvedOperations.get(`delete:${relativePath}`);

    if (!approvedDelete || approvedDelete.destructiveConfirmation !== true) {
      throw new Error(`Proposed delete operation is not approved: ${relativePath}`);
    }

    return {
      type: operation.type,
      path: relativePath,
      destructive: true,
      destructiveConfirmation: true,
    };
  }

  return {
    type: operation.type,
    path: relativePath,
    content: operation.content,
  };
}

function normalizeRelativePath(filePath) {
  if (path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Proposed operation path must be relative.");
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Proposed operation path must stay inside planned boundaries.");
  }

  return parts.join("/");
}

function sanitizeRouting(routing) {
  return {
    selectedModel: routing.selectedModel,
    selectedProvider: routing.selectedProvider,
    reason: routing.reason,
    estimatedCostClass: routing.estimatedCostClass,
    primary: sanitizeValue(routing.primary || null),
    fallback: sanitizeValue(routing.fallback || null),
  };
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((entry) => entry !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};

  for (const key of Object.keys(value).sort()) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }

    const child = sanitizeValue(value[key]);

    if (child !== undefined) {
      sanitized[key] = child;
    }
  }

  return sanitized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  createCodeGenerationPipeline,
};
