const PROVIDER_TYPES = new Set(["local", "remote"]);
const HEALTH_STATUSES = new Set(["HEALTHY", "DEGRADED", "UNAVAILABLE", "UNKNOWN"]);
const PROVIDER_AVAILABILITY_STATES = new Set([
  "CONFIGURED",
  "MISSING_CONFIGURATION",
  "AVAILABLE",
  "UNAVAILABLE",
  "UNSUPPORTED",
  "UNKNOWN",
]);
const HEALTH_EVIDENCE_TYPES = new Set([
  "LOCAL_DETERMINISTIC",
  "REMOTE_APPROVED",
  "CONFIGURATION",
  "UNKNOWN",
]);
const STRUCTURED_OUTPUT_CAPABILITIES = new Set([
  "native-json-schema",
  "deterministic-json-prompt",
  "unsupported",
]);

function validateProvider(provider) {
  if (!isPlainObject(provider)) {
    throw new Error("Model provider must be an object.");
  }

  requireString(provider.name, "provider name");
  requireString(provider.model, "provider model");
  requireString(provider.reason, "provider reason");

  if (!PROVIDER_TYPES.has(provider.type)) {
    throw new Error("Model provider type must be local or remote.");
  }

  requireFunction(provider.estimateCost, "provider estimateCost");
  requireFunction(provider.sendRequest, "provider sendRequest");

  if (provider.checkHealth !== undefined) {
    requireFunction(provider.checkHealth, "provider checkHealth");
  }

  if (provider.structuredOutput !== undefined) {
    validateStructuredOutputCapability(provider.structuredOutput);
  }
}

function isControlledProvider(provider) {
  return Boolean(
    isPlainObject(provider) &&
      (provider.controlled === true || provider.testProvider === true || provider.testModeOnly === true),
  );
}

function validateProviderRequest(request) {
  if (!isPlainObject(request)) {
    throw new Error("Model provider request is required.");
  }

  if (request.providerType && !PROVIDER_TYPES.has(request.providerType)) {
    throw new Error("Requested providerType must be local or remote.");
  }

  if (request.preferredProvider !== undefined) {
    requireString(request.preferredProvider, "preferred provider");
  }

  if (request.structuredOutput !== undefined) {
    validateStructuredOutputRequest(request.structuredOutput);
  }
}

function validateProviderCostEstimate(estimate) {
  if (!isPlainObject(estimate)) {
    throw new Error("Model provider cost estimate is required.");
  }

  if (!Number.isFinite(estimate.amount) || estimate.amount < 0) {
    throw new Error("Model provider cost estimate amount is required.");
  }

  requireString(estimate.costClass, "cost estimate class");
}

function validateProviderResponse(response) {
  if (!isPlainObject(response)) {
    throw new Error("Model provider response is required.");
  }

  requireString(response.content, "response content");

  if (response.finishReason !== undefined) {
    requireString(response.finishReason, "response finish reason");
  }

  if (response.usage !== undefined && !isPlainObject(response.usage)) {
    throw new Error("Model provider response usage must be an object.");
  }
}

function validateProviderHealthEvidence(evidence) {
  if (!isPlainObject(evidence)) {
    throw new Error("Model provider health evidence is required.");
  }

  if (!PROVIDER_AVAILABILITY_STATES.has(evidence.availability)) {
    throw new Error("Model provider health availability is invalid.");
  }

  if (evidence.healthStatus !== undefined && !HEALTH_STATUSES.has(evidence.healthStatus)) {
    throw new Error("Model provider health status is invalid.");
  }

  if (!HEALTH_EVIDENCE_TYPES.has(evidence.evidenceType)) {
    throw new Error("Model provider health evidence type is invalid.");
  }

  requireString(evidence.reason, "health reason");
}

function createProviderError(options) {
  if (!isPlainObject(options)) {
    throw new Error("Model provider error options are required.");
  }

  requireString(options.code, "error code");
  requireString(options.message, "error message");

  const error = new Error(options.message);
  error.code = options.code;
  error.providerName = options.providerName || null;
  error.retryable = options.retryable === true;
  return error;
}

function validateStructuredOutputCapability(capability) {
  if (!isPlainObject(capability)) {
    throw new Error("Model provider structuredOutput capability must be an object.");
  }

  if (!STRUCTURED_OUTPUT_CAPABILITIES.has(capability.mode)) {
    throw new Error("Model provider structuredOutput capability mode is invalid.");
  }

  if (capability.reason !== undefined) {
    requireString(capability.reason, "structuredOutput reason");
  }
}

function validateStructuredOutputRequest(structuredOutput) {
  if (!isPlainObject(structuredOutput)) {
    throw new Error("Model provider structuredOutput request must be an object.");
  }

  if (structuredOutput.schema !== undefined && !isPlainObject(structuredOutput.schema)) {
    throw new Error("Model provider structuredOutput schema must be an object.");
  }

  if (structuredOutput.mode !== undefined && !STRUCTURED_OUTPUT_CAPABILITIES.has(structuredOutput.mode)) {
    throw new Error("Model provider structuredOutput request mode is invalid.");
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireFunction(value, fieldName) {
  if (typeof value !== "function") {
    throw new Error(`Model ${fieldName} function is required.`);
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Model provider ${fieldName} is required.`);
  }
}

module.exports = {
  HEALTH_EVIDENCE_TYPES,
  HEALTH_STATUSES,
  PROVIDER_AVAILABILITY_STATES,
  PROVIDER_TYPES,
  STRUCTURED_OUTPUT_CAPABILITIES,
  createProviderError,
  isControlledProvider,
  validateProvider,
  validateProviderCostEstimate,
  validateProviderHealthEvidence,
  validateProviderRequest,
  validateProviderResponse,
  validateStructuredOutputCapability,
  validateStructuredOutputRequest,
};
