const UNKNOWN = "UNKNOWN";
const FREE = "FREE";
const ESTIMATED = "ESTIMATED";

function estimateTaskCost(input) {
  validateInput(input);

  const provider = input.provider;
  const request = input.request || {};

  if (provider.type === "local") {
    return estimateLocalCost(provider, request);
  }

  return estimateRemoteCost(provider, request);
}

function estimateLocalCost(provider, request) {
  const estimate = provider.estimateCost(request);

  if (!isPlainObject(estimate) || !Number.isFinite(estimate.amount) || estimate.amount < 0) {
    return unknownEstimate(provider, "Invalid local provider cost estimate.");
  }

  const currency = stringOrUnknown(estimate.currency || provider.currency);
  const evidenceSource = stringOrUnknown(estimate.evidenceSource || "Provider configured monetary cost.");

  if (estimate.amount === 0) {
    return {
      status: FREE,
      selectedProvider: provider.name,
      selectedModel: provider.model,
      providerType: provider.type,
      costClass: FREE,
      currency,
      evidenceSource,
      exactCost: {
        amount: 0,
        currency,
      },
      estimatedCostRange: {
        min: 0,
        max: 0,
        currency,
      },
      usage: UNKNOWN,
    };
  }

  return {
    status: ESTIMATED,
    selectedProvider: provider.name,
    selectedModel: provider.model,
    providerType: provider.type,
    costClass: stringOrUnknown(estimate.costClass),
    currency,
    evidenceSource,
    exactCost: {
      amount: roundCurrency(estimate.amount),
      currency,
    },
    estimatedCostRange: {
      min: roundCurrency(estimate.amount),
      max: roundCurrency(estimate.amount),
      currency,
    },
    usage: UNKNOWN,
  };
}

function estimateRemoteCost(provider, request) {
  const evidence = provider.pricingEvidence;
  const validation = validatePricingEvidence(evidence, provider);

  if (!validation.valid) {
    return unknownEstimate(provider, validation.reason);
  }

  const usage = normalizeUsage(request);
  const base = {
    selectedProvider: provider.name,
    selectedModel: provider.model,
    providerType: provider.type,
    costClass: evidence.costClass,
    currency: evidence.currency,
    evidenceSource: evidence.source,
  };

  if (isPlainObject(evidence.exactCost)) {
    return {
      ...base,
      status: ESTIMATED,
      exactCost: {
        amount: roundCurrency(evidence.exactCost.amount),
        currency: evidence.exactCost.currency,
      },
      estimatedCostRange: {
        min: roundCurrency(evidence.exactCost.amount),
        max: roundCurrency(evidence.exactCost.amount),
        currency: evidence.exactCost.currency,
      },
      usage: UNKNOWN,
    };
  }

  if (isPlainObject(evidence.estimatedCostRange)) {
    return {
      ...base,
      status: ESTIMATED,
      exactCost: UNKNOWN,
      estimatedCostRange: {
        min: roundCurrency(evidence.estimatedCostRange.min),
        max: roundCurrency(evidence.estimatedCostRange.max),
        currency: evidence.estimatedCostRange.currency,
      },
      usage: UNKNOWN,
    };
  }

  if (usage.type === "exact") {
    const amount = calculateTokenCost(evidence, usage.inputTokens, usage.outputTokens);
    return {
      ...base,
      status: ESTIMATED,
      exactCost: {
        amount,
        currency: evidence.currency,
      },
      estimatedCostRange: {
        min: amount,
        max: amount,
        currency: evidence.currency,
      },
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    };
  }

  if (usage.type === "range") {
    return {
      ...base,
      status: ESTIMATED,
      exactCost: UNKNOWN,
      estimatedCostRange: {
        min: calculateTokenCost(evidence, usage.inputTokens.min, usage.outputTokens.min),
        max: calculateTokenCost(evidence, usage.inputTokens.max, usage.outputTokens.max),
        currency: evidence.currency,
      },
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    };
  }

  return {
    ...base,
    status: UNKNOWN,
    exactCost: UNKNOWN,
    estimatedCostRange: UNKNOWN,
    usage: UNKNOWN,
  };
}

function unknownEstimate(provider, evidenceSource) {
  return {
    status: UNKNOWN,
    selectedProvider: provider.name,
    selectedModel: provider.model,
    providerType: provider.type,
    costClass: UNKNOWN,
    currency: UNKNOWN,
    evidenceSource: stringOrUnknown(evidenceSource),
    exactCost: UNKNOWN,
    estimatedCostRange: UNKNOWN,
    usage: UNKNOWN,
  };
}

function validatePricingEvidence(evidence, provider) {
  if (!isPlainObject(evidence)) {
    return { valid: false, reason: "UNKNOWN" };
  }

  for (const fieldName of ["source", "currency", "costClass"]) {
    if (typeof evidence[fieldName] !== "string" || evidence[fieldName].trim() === "") {
      return { valid: false, reason: "Invalid pricing evidence." };
    }
  }

  if (evidence.provider !== undefined && evidence.provider !== provider.name) {
    return { valid: false, reason: "Invalid pricing evidence." };
  }

  if (evidence.model !== undefined && evidence.model !== provider.model) {
    return { valid: false, reason: "Invalid pricing evidence." };
  }

  if (evidence.exactCost !== undefined && !validExactCost(evidence.exactCost)) {
    return { valid: false, reason: "Invalid pricing evidence." };
  }

  if (evidence.estimatedCostRange !== undefined && !validCostRange(evidence.estimatedCostRange)) {
    return { valid: false, reason: "Invalid pricing evidence." };
  }

  if (evidence.exactCost !== undefined || evidence.estimatedCostRange !== undefined) {
    return { valid: true };
  }

  if (!validTokenPrice(evidence.inputTokenPrice) || !validTokenPrice(evidence.outputTokenPrice)) {
    return { valid: false, reason: "Invalid pricing evidence." };
  }

  return { valid: true };
}

function validTokenPrice(price) {
  return (
    isPlainObject(price) &&
    Number.isFinite(price.amount) &&
    price.amount >= 0 &&
    Number.isInteger(price.perTokens) &&
    price.perTokens > 0
  );
}

function validExactCost(exactCost) {
  return (
    isPlainObject(exactCost) &&
    Number.isFinite(exactCost.amount) &&
    exactCost.amount >= 0 &&
    typeof exactCost.currency === "string" &&
    exactCost.currency.trim() !== ""
  );
}

function validCostRange(costRange) {
  return (
    isPlainObject(costRange) &&
    Number.isFinite(costRange.min) &&
    Number.isFinite(costRange.max) &&
    costRange.min >= 0 &&
    costRange.max >= costRange.min &&
    typeof costRange.currency === "string" &&
    costRange.currency.trim() !== ""
  );
}

function normalizeUsage(request) {
  if (isPlainObject(request.usage)) {
    const inputTokens = request.usage.inputTokens;
    const outputTokens = request.usage.outputTokens;

    if (validTokenCount(inputTokens) && validTokenCount(outputTokens)) {
      return {
        type: "exact",
        inputTokens,
        outputTokens,
      };
    }
  }

  if (isPlainObject(request.usageRange)) {
    const inputTokens = normalizeTokenRange(request.usageRange.inputTokens);
    const outputTokens = normalizeTokenRange(request.usageRange.outputTokens);

    if (inputTokens && outputTokens) {
      return {
        type: "range",
        inputTokens,
        outputTokens,
      };
    }
  }

  return { type: UNKNOWN };
}

function normalizeTokenRange(range) {
  if (!isPlainObject(range) || !validTokenCount(range.min) || !validTokenCount(range.max)) {
    return null;
  }

  if (range.max < range.min) {
    return null;
  }

  return {
    min: range.min,
    max: range.max,
  };
}

function calculateTokenCost(evidence, inputTokens, outputTokens) {
  const inputCost = (inputTokens * evidence.inputTokenPrice.amount) / evidence.inputTokenPrice.perTokens;
  const outputCost = (outputTokens * evidence.outputTokenPrice.amount) / evidence.outputTokenPrice.perTokens;

  return roundCurrency(inputCost + outputCost);
}

function roundCurrency(amount) {
  return Math.round(amount * 100000000) / 100000000;
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Cost estimator input is required.");
  }

  if (!isPlainObject(input.provider)) {
    throw new Error("Cost estimator provider is required.");
  }

  for (const fieldName of ["name", "type", "model"]) {
    if (typeof input.provider[fieldName] !== "string" || input.provider[fieldName].trim() === "") {
      throw new Error(`Cost estimator provider ${fieldName} is required.`);
    }
  }

  if (!["local", "remote"].includes(input.provider.type)) {
    throw new Error("Cost estimator provider type must be local or remote.");
  }

  if (typeof input.provider.estimateCost !== "function") {
    throw new Error("Cost estimator provider estimateCost function is required.");
  }

  if (input.request !== undefined && !isPlainObject(input.request)) {
    throw new Error("Cost estimator request must be an object.");
  }
}

function validTokenCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function stringOrUnknown(value) {
  return typeof value === "string" && value.trim() !== "" ? value : UNKNOWN;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  ESTIMATED,
  FREE,
  UNKNOWN,
  estimateTaskCost,
};
