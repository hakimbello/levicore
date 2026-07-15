const {
  HEALTH_STATUSES,
  PROVIDER_TYPES,
  validateProviderHealthEvidence,
} = require("./model-provider-interface");

const PRICING_EVIDENCE_PRESENT = "PRESENT";
const PRICING_EVIDENCE_MISSING = "MISSING";
const PRICING_EVIDENCE_UNKNOWN = "UNKNOWN";
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|secret|token)/i;

function checkProviderHealth(input = {}) {
  validateInput(input);

  const checkedAt = normalizeCheckedAt(input.checkedAt);

  return Promise.all(
    input.providers.map((provider) => checkSingleProvider(provider, checkedAt)),
  ).then((providerResults) => ({
    checkedAt,
    providers: providerResults,
    summary: summarize(providerResults),
  }));
}

function createFallbackDiagnostics(input = {}) {
  validateFallbackInput(input);

  const checkedAt = input.providerHealth.checkedAt;
  const providers = input.providers;
  const primaryIndex = providerIndex(providers, input.primaryProvider);
  const fallbackIndex = providerIndex(providers, input.fallbackProvider);
  const primaryProvider = input.primaryProvider
    ? providerDiagnostic(input.primaryProvider, healthAt(input.providerHealth, primaryIndex), primaryIndex)
    : null;
  const fallbackProvider = input.fallbackProvider
    ? providerDiagnostic(input.fallbackProvider, healthAt(input.providerHealth, fallbackIndex), fallbackIndex)
    : null;
  const fallbackExecution = fallbackExecutionState(primaryProvider, fallbackProvider);

  return {
    checkedAt,
    selectedPrimaryProvider: primaryProvider,
    selectedFallbackProvider: fallbackProvider,
    providerPriorityOrder: providers.map((provider, index) =>
      providerPriorityEntry(provider, healthAt(input.providerHealth, index), index),
    ),
    fallbackCandidates: providers
      .map((provider, index) => ({ provider, index }))
      .filter((entry) => entry.provider !== input.primaryProvider)
      .map((entry) => providerPriorityEntry(entry.provider, healthAt(input.providerHealth, entry.index), entry.index)),
    fallbackSelectionReason: fallbackSelectionReason(primaryProvider, fallbackProvider),
    fallbackExecutionAvailable: fallbackExecution.available,
    fallbackExecutionStatus: fallbackExecution.status,
    reason: fallbackExecution.reason,
    primaryFailure: normalizeFailure(input.primaryFailure),
    usage: sanitizePlainObject(input.usage || {}),
    limits: sanitizePlainObject(input.limits || {}),
  };
}

async function checkSingleProvider(provider, checkedAt) {
  const base = baseResult(provider, checkedAt);
  const configState = configurationState(provider);

  if (configState.availability !== "CONFIGURED") {
    return {
      ...base,
      availability: configState.availability,
      healthStatus: configState.healthStatus,
      reason: configState.reason,
    };
  }

  if (typeof provider.checkHealth !== "function") {
    return {
      ...base,
      availability: "CONFIGURED",
      healthStatus: "UNKNOWN",
      reason: missingEvidenceReason(provider.type),
    };
  }

  try {
    const evidence = await provider.checkHealth({ checkedAt });
    return normalizeEvidenceResult(provider, evidence, base);
  } catch (error) {
    return {
      ...base,
      availability: "UNKNOWN",
      healthStatus: "UNKNOWN",
      reason: failedHealthReason(error),
    };
  }
}

function normalizeEvidenceResult(provider, evidence, base) {
  try {
    validateProviderHealthEvidence(evidence);
  } catch {
    return {
      ...base,
      availability: "UNKNOWN",
      healthStatus: "UNKNOWN",
      reason: "Provider health evidence is UNKNOWN.",
    };
  }

  const requiredEvidenceType =
    provider.type === "local" ? "LOCAL_DETERMINISTIC" : "REMOTE_APPROVED";

  if (evidence.evidenceType !== requiredEvidenceType) {
    return {
      ...base,
      availability: "UNKNOWN",
      healthStatus: "UNKNOWN",
      reason: provider.type === "local"
        ? "Local provider health requires local deterministic evidence."
        : "Remote provider health requires approved health evidence.",
    };
  }

  return {
    ...base,
    availability: evidence.availability,
    healthStatus: normalizeHealthStatus(evidence.healthStatus, evidence.availability),
    reason: sanitizeReason(evidence.reason),
  };
}

function configurationState(provider) {
  if (!isPlainObject(provider)) {
    return {
      availability: "MISSING_CONFIGURATION",
      healthStatus: "UNAVAILABLE",
      reason: "Provider configuration is missing.",
    };
  }

  if (!PROVIDER_TYPES.has(provider.type)) {
    return {
      availability: "UNSUPPORTED",
      healthStatus: "UNKNOWN",
      reason: "Provider type is unsupported.",
    };
  }

  const missingFields = ["name", "model"].filter(
    (fieldName) => typeof provider[fieldName] !== "string" || provider[fieldName].trim() === "",
  );

  if (missingFields.length > 0) {
    return {
      availability: "MISSING_CONFIGURATION",
      healthStatus: "UNAVAILABLE",
      reason: "Provider required configuration is missing.",
    };
  }

  if (typeof provider.estimateCost !== "function" || typeof provider.sendRequest !== "function") {
    return {
      availability: "MISSING_CONFIGURATION",
      healthStatus: "UNAVAILABLE",
      reason: "Provider required interface functions are missing.",
    };
  }

  return {
    availability: "CONFIGURED",
    healthStatus: "UNKNOWN",
    reason: "Provider configuration is complete.",
  };
}

function baseResult(provider, checkedAt) {
  return {
    providerName: stringOrUnknown(provider && provider.name),
    providerType: stringOrUnknown(provider && provider.type),
    model: stringOrUnknown(provider && provider.model),
    availability: "UNKNOWN",
    healthStatus: "UNKNOWN",
    reason: "Provider health is UNKNOWN.",
    lastCheckedAt: checkedAt,
    pricingEvidenceStatus: pricingEvidenceStatus(provider),
  };
}

function providerDiagnostic(provider, health, index) {
  return {
    priority: index >= 0 ? index + 1 : "UNKNOWN",
    providerName: stringOrUnknown(provider && provider.name),
    providerType: stringOrUnknown(provider && provider.type),
    model: stringOrUnknown(provider && provider.model),
    availability: stringOrUnknown(health && health.availability),
    healthStatus: stringOrUnknown(health && health.healthStatus),
    reason: sanitizeReason(health && health.reason),
    lastCheckedAt: stringOrUnknown(health && health.lastCheckedAt),
    pricingEvidenceStatus: stringOrUnknown(health && health.pricingEvidenceStatus),
  };
}

function providerPriorityEntry(provider, health, index) {
  return {
    priority: index + 1,
    providerName: stringOrUnknown(provider && provider.name),
    providerType: stringOrUnknown(provider && provider.type),
    model: stringOrUnknown(provider && provider.model),
    healthStatus: stringOrUnknown(health && health.healthStatus),
    pricingEvidenceStatus: stringOrUnknown(health && health.pricingEvidenceStatus),
  };
}

function fallbackExecutionState(primaryProvider, fallbackProvider) {
  if (!fallbackProvider) {
    if (primaryProvider && primaryProvider.healthStatus === "UNAVAILABLE") {
      return {
        available: false,
        status: "NO_FALLBACK",
        reason: "Primary provider is unavailable and no fallback provider is registered.",
      };
    }

    return {
      available: false,
      status: "NO_FALLBACK",
      reason: "No fallback provider is registered.",
    };
  }

  if (isExecutionReady(fallbackProvider.healthStatus)) {
    if (primaryProvider && primaryProvider.healthStatus === "HEALTHY") {
      return {
        available: true,
        status: "AVAILABLE",
        reason: "Primary provider is healthy and fallback is ready if the primary provider fails.",
      };
    }

    return {
      available: true,
      status: "AVAILABLE",
      reason: "Fallback provider is ready if the selected primary provider cannot complete the request.",
    };
  }

  if (
    primaryProvider &&
    primaryProvider.healthStatus === "UNAVAILABLE" &&
    fallbackProvider.healthStatus === "UNAVAILABLE"
  ) {
    return {
      available: false,
      status: "UNAVAILABLE",
      reason: "Primary and fallback providers are unavailable.",
    };
  }

  if (fallbackProvider.healthStatus === "UNAVAILABLE") {
    return {
      available: false,
      status: "UNAVAILABLE",
      reason: "Fallback provider is unavailable.",
    };
  }

  return {
    available: false,
    status: "UNKNOWN",
    reason: "Fallback availability is UNKNOWN.",
  };
}

function fallbackSelectionReason(primaryProvider, fallbackProvider) {
  if (!primaryProvider) {
    return "No primary provider is selected.";
  }

  if (!fallbackProvider) {
    return "No fallback provider is registered after the selected primary provider.";
  }

  return `Fallback provider ${fallbackProvider.providerName} was selected because it is the next provider in the registered priority order after primary provider ${primaryProvider.providerName}.`;
}

function isExecutionReady(healthStatus) {
  return healthStatus === "HEALTHY" || healthStatus === "DEGRADED";
}

function normalizeHealthStatus(healthStatus, availability) {
  if (HEALTH_STATUSES.has(healthStatus)) {
    return healthStatus;
  }

  if (availability === "AVAILABLE") {
    return "HEALTHY";
  }

  if (availability === "UNAVAILABLE" || availability === "MISSING_CONFIGURATION") {
    return "UNAVAILABLE";
  }

  return "UNKNOWN";
}

function pricingEvidenceStatus(provider) {
  if (!isPlainObject(provider) || provider.pricingEvidence === undefined) {
    return PRICING_EVIDENCE_MISSING;
  }

  const evidence = provider.pricingEvidence;

  if (!isPlainObject(evidence)) {
    return PRICING_EVIDENCE_UNKNOWN;
  }

  for (const fieldName of ["source", "currency", "costClass"]) {
    if (typeof evidence[fieldName] !== "string" || evidence[fieldName].trim() === "") {
      return PRICING_EVIDENCE_UNKNOWN;
    }
  }

  return PRICING_EVIDENCE_PRESENT;
}

function summarize(results) {
  return {
    totalProviders: results.length,
    healthy: countStatus(results, "HEALTHY"),
    degraded: countStatus(results, "DEGRADED"),
    unavailable: countStatus(results, "UNAVAILABLE"),
    unknown: countStatus(results, "UNKNOWN"),
  };
}

function countStatus(results, status) {
  return results.filter((result) => result.healthStatus === status).length;
}

function missingEvidenceReason(providerType) {
  if (providerType === "local") {
    return "Local provider does not expose local deterministic health evidence.";
  }

  if (providerType === "remote") {
    return "Remote provider does not expose approved health evidence.";
  }

  return "Provider does not expose health evidence.";
}

function failedHealthReason(error) {
  if (error && error.code === "PROVIDER_UNAVAILABLE") {
    return "Provider health evidence reports the provider is unavailable.";
  }

  return "Provider health check failed without approved health evidence.";
}

function normalizeCheckedAt(checkedAt) {
  if (checkedAt === undefined) {
    return new Date().toISOString();
  }

  if (typeof checkedAt !== "string" || checkedAt.trim() === "") {
    throw new Error("Provider health checkedAt must be an ISO timestamp string.");
  }

  const parsed = new Date(checkedAt);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Provider health checkedAt must be an ISO timestamp string.");
  }

  return checkedAt;
}

function normalizeFailure(failure) {
  if (failure === undefined || failure === null) {
    return null;
  }

  if (typeof failure === "string") {
    return {
      code: "UNKNOWN",
      providerName: "UNKNOWN",
      message: sanitizeReason(failure),
    };
  }

  if (!isPlainObject(failure) && !(failure instanceof Error)) {
    return {
      code: "UNKNOWN",
      providerName: "UNKNOWN",
      message: "Primary provider failure details are UNKNOWN.",
    };
  }

  return {
    code: stringOrUnknown(failure.code),
    providerName: stringOrUnknown(failure.providerName),
    message: sanitizeReason(failure.message),
  };
}

function sanitizeReason(reason) {
  const text = typeof reason === "string" && reason.trim() !== "" ? reason : "Provider health is UNKNOWN.";

  return text
    .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/\b(api[_-]?key|token|credential|secret|password)=\S+/gi, "$1=[REDACTED]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED]");
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Provider health input is required.");
  }

  if (!Array.isArray(input.providers)) {
    throw new Error("Provider health providers must be an array.");
  }

  if (input.checkedAt !== undefined) {
    normalizeCheckedAt(input.checkedAt);
  }
}

function validateFallbackInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Fallback diagnostics input is required.");
  }

  if (!Array.isArray(input.providers)) {
    throw new Error("Fallback diagnostics providers must be an array.");
  }

  if (!isPlainObject(input.providerHealth) || !Array.isArray(input.providerHealth.providers)) {
    throw new Error("Fallback diagnostics provider health is required.");
  }

  if (typeof input.providerHealth.checkedAt !== "string" || input.providerHealth.checkedAt.trim() === "") {
    throw new Error("Fallback diagnostics provider health checkedAt is required.");
  }
}

function healthAt(providerHealth, index) {
  if (index < 0) {
    return null;
  }

  return providerHealth.providers[index] || null;
}

function providerIndex(providers, provider) {
  if (!provider) {
    return -1;
  }

  const directIndex = providers.indexOf(provider);

  if (directIndex >= 0) {
    return directIndex;
  }

  return providers.findIndex((candidate) =>
    candidate &&
    candidate.name === provider.name &&
    candidate.type === provider.type &&
    candidate.model === provider.model,
  );
}

function sanitizePlainObject(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const sanitized = {};

  for (const key of Object.keys(value).sort()) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }

    const child = value[key];

    if (isPlainObject(child)) {
      sanitized[key] = sanitizePlainObject(child);
    } else if (Array.isArray(child)) {
      sanitized[key] = child.map((entry) => (isPlainObject(entry) ? sanitizePlainObject(entry) : entry));
    } else if (typeof child === "string") {
      sanitized[key] = sanitizeReason(child);
    } else {
      sanitized[key] = child;
    }
  }

  return sanitized;
}

function stringOrUnknown(value) {
  return typeof value === "string" && value.trim() !== "" ? value : "UNKNOWN";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  PRICING_EVIDENCE_MISSING,
  PRICING_EVIDENCE_PRESENT,
  PRICING_EVIDENCE_UNKNOWN,
  checkProviderHealth,
  createFallbackDiagnostics,
};
