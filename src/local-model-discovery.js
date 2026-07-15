const { execFileSync } = require("node:child_process");

const UNKNOWN = "UNKNOWN";
const DEFAULT_TIMEOUT_MS = 5000;
const OLLAMA_COMMAND = "ollama";

function discoverLocalModels(options = {}) {
  validateDiscoveryOptions(options);

  const ollamaOptions = options.ollama === undefined ? options : options.ollama;

  return {
    runtimes: {
      ollama: discoverOllama(ollamaOptions),
    },
  };
}

function discoverOllama(options = {}) {
  validateDiscoveryOptions(options);

  const command = options.command || OLLAMA_COMMAND;
  const runCommand = options.runCommand || createExecFileRunner(options.timeoutMs);
  const recommendedModels = normalizeModelNames(options.recommendedModels);
  const requiredModels = normalizeModelNames(options.requiredModels);

  const versionEvidence = runEvidenceCommand(runCommand, command, ["--version"]);
  const installed = getInstalledStatus(versionEvidence);
  const version = installed === true ? parseOllamaVersion(versionEvidence.stdout) : UNKNOWN;

  if (installed === false) {
    return buildOllamaResult({
      installed,
      version,
      available: false,
      models: [],
      recommendedModels,
      requiredModels,
      evidence: {
        version: summarizeEvidence(versionEvidence),
        models: null,
      },
    });
  }

  const modelEvidence = runEvidenceCommand(runCommand, command, ["list"]);
  const available = getAvailabilityStatus(installed, modelEvidence);
  const models = available === true ? parseOllamaList(modelEvidence.stdout) : [];

  return buildOllamaResult({
    installed,
    version,
    available,
    models,
    recommendedModels,
    requiredModels,
    evidence: {
      version: summarizeEvidence(versionEvidence),
      models: summarizeEvidence(modelEvidence),
    },
  });
}

function createExecFileRunner(timeoutMs) {
  const commandTimeoutMs = timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : timeoutMs;

  if (!Number.isInteger(commandTimeoutMs) || commandTimeoutMs < 1) {
    throw new Error("Local model discovery timeoutMs must be a positive integer.");
  }

  return function runCommand(command, args) {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: commandTimeoutMs,
      windowsHide: true,
    });
  };
}

function runEvidenceCommand(runCommand, command, args) {
  try {
    const stdout = runCommand(command, args);
    return {
      ok: true,
      source: formatEvidenceSource(command, args),
      stdout: stringOrEmpty(stdout),
      stderr: "",
      errorCode: null,
    };
  } catch (error) {
    return {
      ok: false,
      source: formatEvidenceSource(command, args),
      stdout: stringOrEmpty(error && error.stdout),
      stderr: stringOrEmpty(error && error.stderr),
      errorCode: sanitizeErrorCode(error && (error.code || error.status || error.signal)),
    };
  }
}

function getInstalledStatus(evidence) {
  if (evidence.ok) {
    return true;
  }

  if (evidence.errorCode === "ENOENT") {
    return false;
  }

  return UNKNOWN;
}

function getAvailabilityStatus(installed, evidence) {
  if (installed === false) {
    return false;
  }

  if (evidence.ok) {
    return true;
  }

  if (evidence.errorCode === "ENOENT") {
    return false;
  }

  if (isRuntimeUnavailableEvidence(evidence)) {
    return false;
  }

  return UNKNOWN;
}

function parseOllamaVersion(stdout) {
  const text = stringOrEmpty(stdout).trim();
  const match = text.match(/\b(?:ollama\s+version\s+)?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/i);
  return match ? match[1] : UNKNOWN;
}

function parseOllamaList(stdout) {
  const lines = stringOrEmpty(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return [];
  }

  return lines.slice(1).map(parseOllamaModelLine).filter(Boolean);
}

function parseOllamaModelLine(line) {
  const columns = line.split(/\s{2,}/).map((column) => column.trim()).filter(Boolean);
  const name = columns[0];

  if (!name) {
    return null;
  }

  return {
    name,
    size: columns[2] || UNKNOWN,
    status: "installed",
    evidence: {
      source: "ollama list",
    },
  };
}

function buildOllamaResult({
  installed,
  version,
  available,
  models,
  recommendedModels,
  requiredModels,
  evidence,
}) {
  const installedModels = new Set(models.map((model) => model.name));
  const missingRequiredModels =
    available === true
      ? requiredModels.filter((modelName) => !installedModels.has(modelName))
      : requiredModels.length > 0
        ? UNKNOWN
        : [];

  return {
    runtime: "ollama",
    installed,
    runtimeInstalled: installed,
    version,
    available,
    runtimeAvailability: available,
    models,
    modelCount: models.length,
    recommendedModels,
    requiredModels,
    missingRequiredModels,
    recommendationStatus: recommendedModels.length > 0 ? "configured" : UNKNOWN,
    requiredModelStatus: requiredModels.length > 0 ? "configured" : UNKNOWN,
    evidence,
  };
}

function summarizeEvidence(evidence) {
  if (!evidence) {
    return null;
  }

  return {
    ok: evidence.ok,
    source: evidence.source,
    errorCode: evidence.errorCode || null,
  };
}

function formatEvidenceSource(command, args) {
  return [command, ...args].join(" ");
}

function normalizeModelNames(models) {
  if (models === undefined) {
    return [];
  }

  if (!Array.isArray(models)) {
    throw new Error("Local model discovery model lists must be arrays.");
  }

  return models
    .filter((model) => typeof model === "string" && model.trim() !== "")
    .map((model) => model.trim());
}

function validateDiscoveryOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Local model discovery options must be an object.");
  }

  if (options.runCommand !== undefined && typeof options.runCommand !== "function") {
    throw new Error("Local model discovery runCommand must be a function.");
  }

  if (
    options.command !== undefined &&
    (typeof options.command !== "string" || options.command.trim() === "")
  ) {
    throw new Error("Local model discovery command must be a non-empty string.");
  }
}

function isRuntimeUnavailableEvidence(evidence) {
  const text = `${evidence.stderr}\n${evidence.stdout}`.toLowerCase();
  return (
    text.includes("connection refused") ||
    text.includes("could not connect") ||
    text.includes("failed to connect") ||
    text.includes("server is not running")
  );
}

function sanitizeErrorCode(value) {
  if (value === undefined || value === null || value === "") {
    return UNKNOWN;
  }

  if (typeof value === "number") {
    return `EXIT_${value}`;
  }

  return String(value).replace(/[^0-9A-Za-z_-]/g, "_");
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  discoverLocalModels,
  discoverOllama,
  parseOllamaList,
  parseOllamaVersion,
};
