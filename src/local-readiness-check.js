const { createModelGateway } = require("./model-gateway");
const { UNKNOWN } = require("./local-model-discovery");

const READY = "READY";
const PARTIAL = "PARTIAL";
const NOT_READY = "NOT_READY";

function createLocalReadinessReport(options = {}) {
  validateOptions(options);

  const gateway = options.modelGateway || createModelGateway({
    providers: options.providers || [],
    limits: {
      maxSpend: 0,
      maxIterations: 1,
    },
  });
  const discoveryOptions = options.discoveryOptions || {};
  const discovery = gateway.discoverLocalModels(discoveryOptions);
  const ollama = discovery.runtimes.ollama;
  const modelSummary = summarizeModels(ollama);
  const providers = summarizeProviders(gateway.getProviders(), ollama);
  const overallReadiness = determineOverallReadiness({
    ollama,
    providers,
    modelSummary,
  });
  const report = {
    overallReadiness,
    runtime: {
      name: "Ollama",
      installed: ollama.installed,
      running: ollama.available,
      version: ollama.version,
      evidence: {
        installed: ollama.evidence.version,
        running: ollama.evidence.models,
      },
    },
    models: modelSummary,
    providers,
    evidence: {
      discovery: discovery.runtimes.ollama.evidence,
      providers: providers.evidence,
    },
  };

  return {
    ...report,
    text: formatLocalReadinessReport(report),
  };
}

function validateLocalSetup(options = {}) {
  const readiness = createLocalReadinessReport(options);
  const checks = [
    checkLocalModelDiscovery(readiness),
    checkReadinessReport(readiness),
    checkModelGatewayRegistration(readiness),
    checkProviderAvailability(readiness),
    checkRequiredModelVerification(readiness),
  ];
  const failedChecks = checks.filter((check) => check.status === NOT_READY);
  const partialChecks = checks.filter((check) => check.status === PARTIAL);
  const status = determineValidationStatus(failedChecks, partialChecks);

  return {
    status,
    summary: validationSummary(status, failedChecks, partialChecks),
    checks,
    failedChecks,
    recommendedNextSteps: recommendedNextStepsForValidation(readiness, failedChecks, partialChecks),
    readiness,
  };
}

function checkLocalModelDiscovery(readiness) {
  if (readiness.runtime.installed === true && readiness.runtime.running === true) {
    return validationCheck({
      id: "local-model-discovery",
      title: "Local Model Discovery",
      status: READY,
      summary: "Ollama was detected and model listing succeeded.",
      evidence: readiness.evidence.discovery,
    });
  }

  if (readiness.runtime.installed === false || readiness.runtime.running === false) {
    return validationCheck({
      id: "local-model-discovery",
      title: "Local Model Discovery",
      status: NOT_READY,
      summary: "Local model discovery found Ollama missing or unavailable.",
      evidence: readiness.evidence.discovery,
    });
  }

  return validationCheck({
    id: "local-model-discovery",
    title: "Local Model Discovery",
    status: PARTIAL,
    summary: "Local model discovery could not determine the full Ollama state.",
    evidence: readiness.evidence.discovery,
  });
}

function checkReadinessReport(readiness) {
  const validStatus = [READY, PARTIAL, NOT_READY].includes(readiness.overallReadiness);
  const hasPlainText = typeof readiness.text === "string" && readiness.text.trim() !== "";

  return validationCheck({
    id: "one-minute-readiness-check",
    title: "One-Minute Readiness Check",
    status: validStatus && hasPlainText ? READY : NOT_READY,
    summary:
      validStatus && hasPlainText
        ? "Readiness report produced a plain-language result."
        : "Readiness report did not produce a valid plain-language result.",
    evidence: {
      overallReadiness: readiness.overallReadiness,
      hasPlainText,
    },
  });
}

function checkModelGatewayRegistration(readiness) {
  if (readiness.providers.localProviders.length > 0) {
    return validationCheck({
      id: "model-gateway-registration",
      title: "Model Gateway Registration",
      status: READY,
      summary: "At least one local provider is registered with Model Gateway.",
      evidence: readiness.providers.evidence,
    });
  }

  return validationCheck({
    id: "model-gateway-registration",
    title: "Model Gateway Registration",
    status: NOT_READY,
    summary: "No local provider is registered with Model Gateway.",
    evidence: readiness.providers.evidence,
  });
}

function checkProviderAvailability(readiness) {
  if (readiness.providers.available.length > 0) {
    return validationCheck({
      id: "provider-availability",
      title: "Provider Availability",
      status: READY,
      summary: "At least one registered local provider has an available required model.",
      evidence: providerStatusEvidence(readiness),
    });
  }

  const unknownProvider = readiness.providers.localProviders.some((provider) => provider.status === UNKNOWN);

  if (unknownProvider) {
    return validationCheck({
      id: "provider-availability",
      title: "Provider Availability",
      status: PARTIAL,
      summary: "Provider availability is UNKNOWN because local runtime evidence is incomplete.",
      evidence: providerStatusEvidence(readiness),
    });
  }

  return validationCheck({
    id: "provider-availability",
    title: "Provider Availability",
    status: NOT_READY,
    summary: "Registered local providers are not available.",
    evidence: providerStatusEvidence(readiness),
  });
}

function checkRequiredModelVerification(readiness) {
  if (Array.isArray(readiness.models.missingRequiredModels)) {
    const status = readiness.models.missingRequiredModels.length === 0 ? READY : NOT_READY;

    return validationCheck({
      id: "required-model-verification",
      title: "Required Model Verification",
      status,
      summary:
        status === READY
          ? "All required local models are installed."
          : "One or more required local models are missing.",
      evidence: {
        requiredModels: readiness.models.requiredModels.configured,
        missingRequiredModels: readiness.models.missingRequiredModels,
        modelList: readiness.models.evidence.command,
      },
    });
  }

  return validationCheck({
    id: "required-model-verification",
    title: "Required Model Verification",
    status: PARTIAL,
    summary: "Required model verification is UNKNOWN from available evidence.",
    evidence: {
      requiredModels: readiness.models.requiredModels.configured,
      missingRequiredModels: UNKNOWN,
      modelList: readiness.models.evidence.command,
    },
  });
}

function summarizeProviders(providers, ollama) {
  const installedModels = new Set(ollama.models.map((model) => model.name));
  const registered = providers.map((provider, index) => ({
    name: provider.name,
    type: provider.type,
    model: provider.model,
    default: index === 0,
    status: providerAvailability(provider, ollama, installedModels),
  }));
  const defaultProvider = registered[0] || UNKNOWN;
  const localProviders = registered.filter((provider) => provider.type === "local");
  const available = registered.filter((provider) => provider.status === READY);

  return {
    registered,
    localProviders,
    available,
    defaultProvider,
    evidence: {
      source: "Model Gateway provider registry",
      registeredProviderCount: registered.length,
    },
  };
}

function summarizeModels(ollama) {
  const installedNames = new Set(ollama.models.map((model) => model.name));
  const recommendedModels = summarizeConfiguredModels(
    ollama.recommendedModels,
    installedNames,
    ollama.available,
  );
  const requiredModels = summarizeConfiguredModels(
    ollama.requiredModels,
    installedNames,
    ollama.available,
  );
  const missingRequiredModels =
    ollama.requiredModels.length === 0 ? UNKNOWN : ollama.missingRequiredModels;

  return {
    installedModels: ollama.available === true ? ollama.models : UNKNOWN,
    recommendedModels,
    requiredModels,
    missingRequiredModels,
    evidence: {
      source: "Ollama model list",
      command: ollama.evidence.models,
    },
  };
}

function summarizeConfiguredModels(modelNames, installedNames, runtimeAvailable) {
  if (modelNames.length === 0) {
    return {
      configured: [],
      installed: UNKNOWN,
      missing: UNKNOWN,
    };
  }

  if (runtimeAvailable !== true) {
    return {
      configured: modelNames,
      installed: UNKNOWN,
      missing: UNKNOWN,
    };
  }

  const installed = modelNames.filter((modelName) => installedNames.has(modelName));
  const missing = modelNames.filter((modelName) => !installedNames.has(modelName));

  return {
    configured: modelNames,
    installed,
    missing,
  };
}

function determineOverallReadiness({ ollama, providers, modelSummary }) {
  if (providers.localProviders.length === 0) {
    return NOT_READY;
  }

  if (ollama.installed === false || ollama.available === false) {
    return NOT_READY;
  }

  if (Array.isArray(modelSummary.missingRequiredModels) && modelSummary.missingRequiredModels.length > 0) {
    return NOT_READY;
  }

  if (
    ollama.installed === UNKNOWN ||
    ollama.available === UNKNOWN ||
    modelSummary.missingRequiredModels === UNKNOWN
  ) {
    return PARTIAL;
  }

  if (providers.available.length === 0) {
    return NOT_READY;
  }

  if (providers.defaultProvider !== UNKNOWN && providers.defaultProvider.type !== "local") {
    return PARTIAL;
  }

  return READY;
}

function formatLocalReadinessReport(report) {
  const lines = [
    `Local readiness: ${report.overallReadiness}`,
    "",
    "Runtime",
    `- Ollama installed: ${formatBoolean(report.runtime.installed)} (${formatEvidence(report.runtime.evidence.installed)})`,
    `- Ollama running: ${formatBoolean(report.runtime.running)} (${formatEvidence(report.runtime.evidence.running)})`,
    `- Ollama version: ${report.runtime.version || UNKNOWN}`,
    "",
    "Models",
    `- Installed models: ${formatInstalledModels(report.models.installedModels)}`,
    `- Recommended models installed: ${formatModelCheck(report.models.recommendedModels)}`,
    `- Required models installed: ${formatModelCheck(report.models.requiredModels)}`,
    `- Missing required models: ${formatMissingRequiredModels(report.models.missingRequiredModels)}`,
    "",
    "Providers",
    `- Available providers: ${formatAvailableProviders(report.providers)}`,
    `- Default provider: ${formatDefaultProvider(report.providers.defaultProvider)}`,
    "",
    `Next step: ${nextStepFor(report)}`,
  ];

  return lines.join("\n");
}

function determineValidationStatus(failedChecks, partialChecks) {
  if (failedChecks.length > 0) {
    return NOT_READY;
  }

  if (partialChecks.length > 0) {
    return PARTIAL;
  }

  return READY;
}

function validationSummary(status, failedChecks, partialChecks) {
  if (status === READY) {
    return "Local setup validation passed. Levi can use the local provider.";
  }

  if (status === PARTIAL) {
    return `Local setup validation is partial. ${partialChecks.length} check(s) returned UNKNOWN evidence.`;
  }

  return `Local setup validation is not ready. ${failedChecks.length} check(s) failed.`;
}

function recommendedNextStepsForValidation(readiness, failedChecks, partialChecks) {
  const steps = [];

  if (readiness.runtime.installed === false) {
    steps.push("Install Ollama outside Levi, then run validation again.");
  }

  if (readiness.runtime.running === false) {
    steps.push("Start Ollama outside Levi, then run validation again.");
  }

  if (Array.isArray(readiness.models.missingRequiredModels) && readiness.models.missingRequiredModels.length > 0) {
    steps.push(`Install the missing required model outside Levi: ${readiness.models.missingRequiredModels.join(", ")}.`);
  }

  if (readiness.providers.localProviders.length === 0) {
    steps.push("Register a local provider with Model Gateway, then run validation again.");
  }

  if (steps.length === 0 && partialChecks.length > 0) {
    steps.push("Resolve UNKNOWN local evidence, then run validation again.");
  }

  if (steps.length === 0 && failedChecks.length === 0) {
    steps.push("No action needed.");
  }

  return steps;
}

function validationCheck({ id, title, status, summary, evidence }) {
  return {
    id,
    title,
    status,
    summary,
    evidence,
  };
}

function providerStatusEvidence(readiness) {
  return {
    providers: readiness.providers.registered.map((provider) => ({
      name: provider.name,
      type: provider.type,
      model: provider.model,
      status: provider.status,
    })),
    modelList: readiness.models.evidence.command,
  };
}

function nextStepFor(report) {
  if (report.overallReadiness === READY) {
    return "Levi is ready to use the local provider.";
  }

  if (report.runtime.installed === false) {
    return "Install Ollama outside Levi, then run this check again.";
  }

  if (report.runtime.running === false) {
    return "Start Ollama outside Levi, then run this check again.";
  }

  if (Array.isArray(report.models.missingRequiredModels) && report.models.missingRequiredModels.length > 0) {
    return `Install the missing required model outside Levi: ${report.models.missingRequiredModels.join(", ")}.`;
  }

  if (report.providers.localProviders.length === 0) {
    return "Configure a local provider outside this readiness check, then run it again.";
  }

  return "Some local evidence is UNKNOWN; fix the reported UNKNOWN items, then run this check again.";
}

function formatBoolean(value) {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return UNKNOWN;
}

function formatEvidence(evidence) {
  if (!evidence) {
    return "evidence unavailable";
  }

  if (evidence.ok === true) {
    return `${evidence.source} succeeded`;
  }

  if (evidence.ok === false) {
    return `${evidence.source} failed with ${evidence.errorCode || UNKNOWN}`;
  }

  return UNKNOWN;
}

function formatInstalledModels(models) {
  if (models === UNKNOWN) {
    return UNKNOWN;
  }

  if (models.length === 0) {
    return "None";
  }

  return models.map((model) => {
    const size = model.size && model.size !== UNKNOWN ? ` (${model.size})` : "";
    return `${model.name}${size}`;
  }).join(", ");
}

function formatModelCheck(modelCheck) {
  if (modelCheck.configured.length === 0) {
    return UNKNOWN;
  }

  if (modelCheck.installed === UNKNOWN) {
    return UNKNOWN;
  }

  if (modelCheck.missing.length === 0) {
    return `Yes (${modelCheck.installed.join(", ")})`;
  }

  if (modelCheck.installed.length === 0) {
    return "No";
  }

  return `Partially (${modelCheck.installed.join(", ")})`;
}

function formatMissingRequiredModels(missingRequiredModels) {
  if (missingRequiredModels === UNKNOWN) {
    return UNKNOWN;
  }

  if (missingRequiredModels.length === 0) {
    return "None";
  }

  return missingRequiredModels.join(", ");
}

function formatAvailableProviders(providers) {
  const availableProviders = providers.available;

  if (availableProviders.length === 0) {
    return "None";
  }

  return availableProviders.map((provider) => `${provider.name} (${provider.type})`).join(", ");
}

function formatDefaultProvider(defaultProvider) {
  if (defaultProvider === UNKNOWN) {
    return UNKNOWN;
  }

  return `${defaultProvider.name} (${defaultProvider.type})`;
}

function providerAvailability(provider, ollama, installedModels) {
  if (provider.type !== "local") {
    return UNKNOWN;
  }

  if (ollama.installed === false || ollama.available === false) {
    return NOT_READY;
  }

  if (ollama.available === UNKNOWN) {
    return UNKNOWN;
  }

  return installedModels.has(provider.model) ? READY : NOT_READY;
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Local readiness options must be an object.");
  }

  if (options.providers !== undefined && !Array.isArray(options.providers)) {
    throw new Error("Local readiness providers must be an array.");
  }

  if (
    options.modelGateway !== undefined &&
    (!options.modelGateway ||
      typeof options.modelGateway.getProviders !== "function" ||
      typeof options.modelGateway.discoverLocalModels !== "function")
  ) {
    throw new Error("Local readiness modelGateway must expose getProviders and discoverLocalModels.");
  }
}

module.exports = {
  NOT_READY,
  PARTIAL,
  READY,
  createLocalReadinessReport,
  formatLocalReadinessReport,
  validateLocalSetup,
};
