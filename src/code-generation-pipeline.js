const path = require("node:path");
const { buildContext } = require("./context-builder");
const { buildCorrectiveStructuredOutputPrompt, buildPrompt } = require("./prompt-engine");

const OPERATION_TYPES = new Set(["create", "update", "delete"]);
const OPERATION_KEYS = new Set(["type", "path", "content"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|secret|token)/i;
const MARKDOWN_FENCE_PATTERN = /```/;
const OUTPUT_INSTRUCTIONS = [
  "Return exactly one strict JSON object and nothing else.",
  "Use this exact shape: {\"operations\":[{\"type\":\"create|update|delete\",\"path\":\"relative/path\",\"content\":\"text for create or update\"}]}",
  "Use only create, update, or delete operations.",
  "Use only paths listed in Expected Files.",
  "Do not include explanations, markdown, code fences, comments, patch text, or extra JSON objects.",
];
const LEVI_OPERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["operations"],
  properties: {
    operations: {
      type: "array",
      minItems: 1,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "path", "content"],
            properties: {
              type: { enum: ["create", "update"] },
              path: { type: "string" },
              content: { type: "string" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "path"],
            properties: {
              type: { enum: ["delete"] },
              path: { type: "string" },
            },
          },
        ],
      },
    },
  },
};

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
    const compatibility = evaluateProviderCompatibility(routeResult.provider);

    if (compatibility.status !== "SUPPORTED") {
      throw structuredOutputError(compatibility.reason);
    }

    const structuredOutput = structuredOutputRequestFor(compatibility);
    const providerAttempt = await requestProviderWithFallback(
      options.modelGateway,
      routeResult,
      prompt.prompt,
      structuredOutput,
    );
    const providerResponse = providerAttempt.response;
    const adapted = await adaptProviderOperations({
      modelGateway: options.modelGateway,
      routeResult: providerAttempt.routeResult,
      providerResponse,
      taskPlan: input.taskPlan,
      structuredOutput,
    });

    return {
      status: "PROPOSED",
      operations: adapted.operations,
      compatibility,
      routing: sanitizeRouting(adapted.routing || providerAttempt.routing),
      usage: {
        gateway: sanitizeValue(adapted.usage || providerAttempt.usage || {}),
        provider: sanitizeValue(adapted.providerUsage || providerResponse.usage || {}),
      },
      providerResponse: {
        finishReason: adapted.finishReason || providerResponse.finishReason || "UNKNOWN",
        correctiveRetry: adapted.correctiveRetry === true,
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

async function adaptProviderOperations(input) {
  try {
    return {
      operations: parseProposedOperations(input.providerResponse, input.taskPlan),
      routing: input.routeResult.routing,
      usage: input.routeResult.usage,
      providerUsage: input.providerResponse.usage,
      finishReason: input.providerResponse.finishReason,
      correctiveRetry: false,
    };
  } catch (error) {
    return retryStructuredOutput(input, error);
  }
}

async function retryStructuredOutput(input, validationError) {
  const correctivePrompt = buildCorrectiveStructuredOutputPrompt({
    validationError: validationError.message,
    schema: LEVI_OPERATION_SCHEMA,
  });
  let retryRoute;

  try {
    retryRoute = await routePrompt(input.modelGateway, correctivePrompt.prompt, {
      preferredProvider: input.routeResult.provider.name,
    });
  } catch (error) {
    throw structuredOutputError(`Model output did not satisfy Levi's operation contract: ${validationError.message}`);
  }

  try {
    const retryResponse = await requestProvider(retryRoute, correctivePrompt.prompt, input.structuredOutput);

    return {
      operations: parseProposedOperations(retryResponse, input.taskPlan),
      routing: retryRouting(input.routeResult.routing, retryRoute.routing, validationError),
      usage: retryRoute.usage,
      providerUsage: retryResponse.usage,
      finishReason: retryResponse.finishReason,
      correctiveRetry: true,
    };
  } catch (error) {
    const reason = error.code === "CODE_GENERATION_STRUCTURED_OUTPUT_INVALID"
      ? error.message
      : `Model output did not satisfy Levi's operation contract: ${error.message}`;
    throw structuredOutputError(reason);
  }
}

async function requestProviderWithFallback(modelGateway, routeResult, prompt, structuredOutput) {
  try {
    const response = await requestProvider(routeResult, prompt, structuredOutput);

    return {
      response,
      routeResult,
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
      const fallbackCompatibility = evaluateProviderCompatibility(fallbackRoute.provider);

      if (fallbackCompatibility.status !== "SUPPORTED") {
        throw structuredOutputError(fallbackCompatibility.reason);
      }

      const response = await requestProvider(
        fallbackRoute,
        prompt,
        structuredOutputRequestFor(fallbackCompatibility),
      );

      return {
        response,
        routeResult: fallbackRoute,
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

async function requestProvider(routeResult, prompt, structuredOutput) {
  try {
    const response = await routeResult.provider.sendRequest({
      prompt,
      structuredOutput,
    });
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

function retryRouting(primaryRouting, retryRouteRouting, validationError) {
  return {
    selectedModel: retryRouteRouting.selectedModel,
    selectedProvider: retryRouteRouting.selectedProvider,
    reason: retryRouteRouting.reason,
    estimatedCostClass: retryRouteRouting.estimatedCostClass,
    correctiveRetry: {
      selected: true,
      reason: validationError.message,
    },
    primary: {
      selectedModel: primaryRouting.selectedModel,
      selectedProvider: primaryRouting.selectedProvider,
      reason: primaryRouting.reason,
      estimatedCostClass: primaryRouting.estimatedCostClass,
      failure: validationError.message,
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
  const parsed = parseSingleOperationsObject(providerResponse.content);

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
  const seenPaths = new Map();

  return parsed.operations.map((operation) => {
    const normalized = normalizeOperation(operation, plannedFiles, approvedOperations);
    const previous = seenPaths.get(normalized.path);

    if (previous) {
      throw new Error(`Model response contains contradictory operations for ${normalized.path}.`);
    }

    seenPaths.set(normalized.path, normalized.type);
    return normalized;
  });
}

function parseSingleOperationsObject(content) {
  const text = typeof content === "string" ? content.trim() : "";

  if (text === "") {
    throw new Error("Model response content is required.");
  }

  if (MARKDOWN_FENCE_PATTERN.test(text)) {
    throw new Error("Model response must not use markdown-wrapped JSON.");
  }

  if (text[0] !== "{" || text[text.length - 1] !== "}") {
    throw new Error("Model response must be exactly one JSON object.");
  }

  const objectEnd = topLevelObjectEndIndex(text);

  if (objectEnd === -1) {
    throw new Error("Model response JSON is malformed or incomplete.");
  }

  if (objectEnd !== text.length - 1) {
    throw new Error("Model response must not contain multiple JSON objects.");
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model response JSON is malformed or incomplete.");
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Model response must be exactly one JSON object.");
  }

  return parsed;
}

function topLevelObjectEndIndex(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }

      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }

      if (depth < 0) {
        return index;
      }
    }
  }

  return -1;
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
    const pathKey = `path:${relativePath}`;
    approvedOperations.set(key, {
      type: operation.type,
      path: relativePath,
      destructiveConfirmation: operation.destructiveConfirmation === true,
    });
    approvedOperations.set(pathKey, {
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
  const approvedPath = approvedOperations.get(`path:${relativePath}`);

  if (!plannedFiles.has(relativePath)) {
    throw new Error(`Proposed operation is outside planned boundaries: ${relativePath}`);
  }

  if (approvedPath && approvedPath.type !== operation.type) {
    throw new Error(`Proposed operation contradicts approved plan for ${relativePath}.`);
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

function evaluateProviderCompatibility(provider) {
  if (!isPlainObject(provider)) {
    return unsupportedCompatibility("Selected model provider is unavailable.");
  }

  const capability = provider.structuredOutput;

  if (isPlainObject(capability) && capability.mode === "native-json-schema") {
    return {
      status: "SUPPORTED",
      mode: "native-json-schema",
      provider: provider.name,
      model: provider.model,
      reason: capability.reason || "Provider supports native structured output.",
    };
  }

  if (isPlainObject(capability) && capability.mode === "deterministic-json-prompt") {
    return {
      status: "SUPPORTED",
      mode: "deterministic-json-prompt",
      provider: provider.name,
      model: provider.model,
      reason: capability.reason || "Provider supports Levi's deterministic JSON prompt contract.",
    };
  }

  if (isPlainObject(capability) && capability.mode === "unsupported") {
    return unsupportedCompatibility(
      capability.reason || "This model supports conversational coding but cannot satisfy Levi's structured execution contract.",
      provider,
    );
  }

  return unsupportedCompatibility(
    "This model supports conversational coding but cannot satisfy Levi's structured execution contract.",
    provider,
  );
}

function unsupportedCompatibility(reason, provider) {
  return {
    status: "UNSUPPORTED",
    mode: "unsupported",
    provider: provider && provider.name ? provider.name : "UNKNOWN",
    model: provider && provider.model ? provider.model : "UNKNOWN",
    reason,
  };
}

function structuredOutputRequestFor(compatibility) {
  return {
    mode: compatibility.mode,
    schema: LEVI_OPERATION_SCHEMA,
  };
}

function structuredOutputError(message) {
  const error = new Error(message);
  error.code = "CODE_GENERATION_STRUCTURED_OUTPUT_INVALID";
  return error;
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
    correctiveRetry: sanitizeValue(routing.correctiveRetry || null),
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
  evaluateProviderCompatibility,
  parseProposedOperations,
};
