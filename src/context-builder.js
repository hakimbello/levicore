const path = require("node:path");
const CONTROL_CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED"]);
const { getOrBuildCachedContext } = require("./context-cache");
const { DEFAULT_TOKEN_CEILING, applyContextBudget } = require("./context-budget");

const DEFAULT_LIMITS = {
  maxRepositoryFacts: 50,
  maxMemoryRecords: 20,
  maxFactLength: 500,
  maxMemoryValueLength: 1000,
};
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const SUPPORTED_EVIDENCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

function buildContext(input) {
  validateInput(input);

  const resolvedInput = {
    ...input,
    memoryStore: undefined,
    projectMemory: resolveMemoryRecords(input),
  };

  return getOrBuildCachedContext(resolvedInput, buildContextUncached, {
    cacheTimestamp: input.cacheTimestamp,
  });
}

function buildContextUncached(input) {
  const limits = normalizeLimits(input.limits);
  const repositoryFacts = limitItems(
    factsFromProjectSummary(input.projectSummary),
    limits.maxRepositoryFacts,
    limits.maxFactLength,
  );
  const projectMemory = limitItems(
    filterMemory(resolveMemoryRecords(input), input.projectId),
    limits.maxMemoryRecords,
    limits.maxMemoryValueLength,
  );
  const baseContext = {
    projectId: input.projectId,
    repositoryRoot: stringOrUnknown(input.projectSummary.root),
    taskPlan: sanitizeValue(input.taskPlan),
    approvedRequirements: sanitizeCollection(input.approvedRequirements || []),
    repositoryFacts,
    projectMemory,
    contextBudget: {
      repositoryFacts: `${repositoryFacts.length}/${limits.maxRepositoryFacts}`,
      memoryRecords: `${projectMemory.length}/${limits.maxMemoryRecords}`,
      serializedCharacters: stableSerialize({
        approvedRequirements: sanitizeCollection(input.approvedRequirements || []),
        projectMemory,
        repositoryFacts,
        taskPlan: sanitizeValue(input.taskPlan),
      }).length,
    },
  };
  const budgeted = applyContextBudget(baseContext, {
    tokenCeiling: DEFAULT_TOKEN_CEILING,
  });

  return {
    ...budgeted.context,
    projectId: baseContext.projectId,
    contextBudget: {
      ...baseContext.contextBudget,
      ...budgeted.report,
    },
  };
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Context builder input is required.");
  }

  requireString(input.projectId, "projectId");

  if (!isPlainObject(input.taskPlan)) {
    throw new Error("Context builder taskPlan is required.");
  }

  if (!isPlainObject(input.projectSummary)) {
    throw new Error("Context builder projectSummary is required.");
  }

  if (input.approvedRequirements !== undefined && !Array.isArray(input.approvedRequirements)) {
    throw new Error("Context builder approvedRequirements must be an array.");
  }

  if (input.projectMemory !== undefined && !Array.isArray(input.projectMemory)) {
    throw new Error("Context builder projectMemory must be an array.");
  }

  if (input.memoryStore !== undefined && !isMemoryStore(input.memoryStore)) {
    throw new Error("Context builder memoryStore must provide listRecords.");
  }
}

function resolveMemoryRecords(input) {
  if (input.memoryStore) {
    return input.memoryStore.listRecords(input.projectId);
  }

  return input.projectMemory || [];
}

function factsFromProjectSummary(summary) {
  return [
    ...factsFromValue("languages", summary.languages),
    ...factsFromValue("frameworks", summary.frameworks),
    ...factsFromValue("packageManagers", summary.packageManagers),
    ...factsFromValue("entryPoints", summary.entryPoints),
    ...factsFromValue("tests", summary.tests),
    ...factsFromValue("majorDirectories", summary.majorDirectories),
    ...factsFromValue("dependencies", summary.dependencies),
  ].sort(compareFacts);
}

function factsFromValue(category, value) {
  if (value === undefined || value === null || value === "UNKNOWN") {
    return [
      {
        category,
        value: "UNKNOWN",
        evidence: [],
      },
    ];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => factFromEntry(category, entry));
  }

  return factFromEntry(category, value);
}

function factFromEntry(category, entry) {
  const sanitized = sanitizeValue(entry);

  if (sanitized === undefined) {
    return [];
  }

  const evidence = extractEvidence(sanitized);

  if (evidence.length === 0 && sanitized !== "UNKNOWN") {
    return [];
  }

  return [
    {
      category,
      value: removeEvidence(sanitized),
      evidence,
    },
  ];
}

function extractEvidence(value) {
  const evidence = [];

  collectEvidence(value, evidence);

  return evidence
    .filter((entry) => !isSecretLikePath(entry.source))
    .filter((entry) => !isLeviRuntimePath(entry.source))
    .filter((entry) => isSupportedEvidencePath(entry.source))
    .sort(compareStable);
}

function collectEvidence(value, evidence) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEvidence(item, evidence);
    }
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  if (typeof value.source === "string" && typeof value.signal === "string") {
    const entry = {
      source: value.source,
      signal: value.signal,
    };
    const type = optionalString(value.type || value.evidenceType);

    if (type) {
      entry.type = type;
    }

    evidence.push(entry);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence") {
      collectEvidence(child, evidence);
      continue;
    }

    if (key === "source" || key === "signal") {
      continue;
    }

    collectEvidence(child, evidence);
  }
}

function removeEvidence(value) {
  if (Array.isArray(value)) {
    return value.map(removeEvidence).filter((entry) => entry !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const cleaned = {};

  for (const key of Object.keys(value).sort()) {
    if (key === "evidence" || key === "source" || key === "signal") {
      continue;
    }

    const child = removeEvidence(value[key]);

    if (child !== undefined) {
      cleaned[key] = child;
    }
  }

  return Object.keys(cleaned).length === 0 ? "UNKNOWN" : cleaned;
}

function optionalString(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "UNKNOWN";
  }

  return value.trim();
}

function filterMemory(records, projectId) {
  return records
    .filter((record) => {
      if (!isPlainObject(record)) {
        return false;
      }

      if (!CONTROL_CONFIDENCE_STATES.has(record.confidenceState)) {
        return false;
      }

      if (record.projectId !== undefined && record.projectId !== projectId) {
        return false;
      }

      if (record.source && record.source.kind === "model-output") {
        return false;
      }

      if (containsLeviRuntimePath(record.source)) {
        return false;
      }

      return true;
    })
    .map(sanitizeValue)
    .filter(hasMeaningfulMemoryValue)
    .sort(compareStable);
}

function limitItems(items, maxItems, maxSerializedLength) {
  return items
    .map(sanitizeValue)
    .filter((item) => stableSerialize(item).length <= maxSerializedLength)
    .slice(0, maxItems);
}

function normalizeLimits(limits) {
  if (limits === undefined) {
    return DEFAULT_LIMITS;
  }

  if (!isPlainObject(limits)) {
    throw new Error("Context builder limits must be an object.");
  }

  return {
    maxRepositoryFacts: positiveIntegerOrDefault(
      limits.maxRepositoryFacts,
      DEFAULT_LIMITS.maxRepositoryFacts,
      "maxRepositoryFacts",
    ),
    maxMemoryRecords: positiveIntegerOrDefault(
      limits.maxMemoryRecords,
      DEFAULT_LIMITS.maxMemoryRecords,
      "maxMemoryRecords",
    ),
    maxFactLength: positiveIntegerOrDefault(limits.maxFactLength, DEFAULT_LIMITS.maxFactLength, "maxFactLength"),
    maxMemoryValueLength: positiveIntegerOrDefault(
      limits.maxMemoryValueLength,
      DEFAULT_LIMITS.maxMemoryValueLength,
      "maxMemoryValueLength",
    ),
  };
}

function positiveIntegerOrDefault(value, defaultValue, fieldName) {
  if (value === undefined) {
    return defaultValue;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Context builder ${fieldName} must be a positive integer.`);
  }

  return value;
}

function sanitizeCollection(values) {
  return values.map(sanitizeValue).sort(compareStable);
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((entry) => entry !== undefined);
  }

  if (typeof value === "string") {
    if (isLeviRuntimePath(value)) {
      return undefined;
    }

    return SECRET_VALUE_PATTERN.test(value) ? undefined : value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  if (hasLeviRuntimePathValue(value)) {
    return undefined;
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

function compareStable(left, right) {
  return stableSerialize(left).localeCompare(stableSerialize(right));
}

function compareFacts(left, right) {
  const leftUnknown = left.value === "UNKNOWN";
  const rightUnknown = right.value === "UNKNOWN";

  if (leftUnknown !== rightUnknown) {
    return leftUnknown ? 1 : -1;
  }

  return compareStable(left, right);
}

function stableSerialize(value) {
  if (value === undefined || value === null) {
    return "UNKNOWN";
  }

  if (typeof value === "string") {
    return value.trim() === "" ? "UNKNOWN" : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(", ")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}: ${stableSerialize(value[key])}`)
      .join(", ")}}`;
  }

  return String(value);
}

function isSecretLikePath(filePath) {
  return SECRET_PATH_PATTERN.test(filePath);
}

function isLeviRuntimePath(filePath) {
  if (typeof filePath !== "string") {
    return false;
  }

  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[0] === ".levi";
}

function hasLeviRuntimePathValue(value) {
  return ["path", "file", "source"].some((key) => isLeviRuntimePath(value[key]));
}

function containsLeviRuntimePath(value) {
  if (typeof value === "string") {
    return isLeviRuntimePath(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsLeviRuntimePath);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).some(containsLeviRuntimePath);
}

function isSupportedEvidencePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();
  return extension === "" || SUPPORTED_EVIDENCE_EXTENSIONS.has(extension);
}

function isMemoryStore(value) {
  return isPlainObject(value) && typeof value.listRecords === "function";
}

function hasMeaningfulMemoryValue(record) {
  if (!isPlainObject(record)) {
    return false;
  }

  if (record.value === undefined) {
    return false;
  }

  if (isPlainObject(record.value) && Object.keys(record.value).length === 0) {
    return false;
  }

  if (Array.isArray(record.value) && record.value.length === 0) {
    return false;
  }

  return true;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Context builder ${fieldName} is required.`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  buildContext,
};
