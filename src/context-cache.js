const crypto = require("node:crypto");

const UNKNOWN = "UNKNOWN";
const CACHE_HIT_REASON = "Context cache hit because deterministic context inputs are unchanged.";
const FIRST_MISS_REASON = "Context cache miss because no cached context exists for this project.";
const INVALIDATED_REASON = "Context cache miss because deterministic context inputs changed.";
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;

const cacheByProject = new Map();

function getOrBuildCachedContext(input, buildContext, options = {}) {
  validateInput(input, buildContext, options);

  const projectId = stringOrUnknown(input.projectId);
  const cacheId = createContextCacheId(input);
  const cacheTimestamp = normalizeCacheTimestamp(options.cacheTimestamp);
  const projectCache = cacheByProject.get(projectId);

  if (projectCache && projectCache.entries.has(cacheId)) {
    const entry = projectCache.entries.get(cacheId);
    return withCacheReport(entry.context, {
      cacheHit: true,
      cacheMiss: false,
      cacheReason: CACHE_HIT_REASON,
      cacheTimestamp: entry.cacheTimestamp,
      cacheId,
    });
  }

  const context = buildContext(input);
  const safeContext = cloneJson(context);
  const entries = projectCache ? projectCache.entries : new Map();
  const reason = projectCache ? INVALIDATED_REASON : FIRST_MISS_REASON;

  entries.set(cacheId, {
    cacheTimestamp,
    context: safeContext,
  });
  cacheByProject.set(projectId, {
    entries,
    latestCacheId: cacheId,
  });

  return withCacheReport(safeContext, {
    cacheHit: false,
    cacheMiss: true,
    cacheReason: reason,
    cacheTimestamp,
    cacheId,
  });
}

function createContextCacheId(input) {
  const fingerprint = {
    approvedRequirements: sanitizeForFingerprint(input.approvedRequirements || []),
    budgetConfiguration: sanitizeForFingerprint(input.limits || {}),
    projectId: stringOrUnknown(input.projectId),
    projectMemory: sanitizeForFingerprint(input.projectMemory || []),
    projectSummary: sanitizeForFingerprint(input.projectSummary || {}),
    taskPlan: sanitizeForFingerprint(input.taskPlan || {}),
  };

  return crypto
    .createHash("sha256")
    .update(stableSerialize(fingerprint))
    .digest("hex");
}

function withCacheReport(context, report) {
  return {
    ...cloneJson(context),
    contextCache: {
      cacheHit: report.cacheHit,
      cacheMiss: report.cacheMiss,
      cacheReason: report.cacheReason,
      cacheTimestamp: report.cacheTimestamp,
      cacheId: report.cacheId,
    },
  };
}

function sanitizeForFingerprint(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeForFingerprint).filter((entry) => entry !== undefined);
  }

  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value) ? undefined : value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};

  for (const key of Object.keys(value).sort()) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }

    const child = sanitizeForFingerprint(value[key]);

    if (child !== undefined) {
      sanitized[key] = child;
    }
  }

  return sanitized;
}

function stableSerialize(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  if (typeof value === "string") {
    return value.trim() === "" ? UNKNOWN : value;
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

  return UNKNOWN;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCacheTimestamp(timestamp) {
  if (timestamp === undefined) {
    return UNKNOWN;
  }

  if (typeof timestamp !== "string" || timestamp.trim() === "") {
    return UNKNOWN;
  }

  return timestamp.trim();
}

function validateInput(input, buildContext, options) {
  if (!isPlainObject(input)) {
    throw new Error("Context cache input is required.");
  }

  if (typeof buildContext !== "function") {
    throw new Error("Context cache buildContext function is required.");
  }

  if (!isPlainObject(options)) {
    throw new Error("Context cache options must be an object.");
  }
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return UNKNOWN;
  }

  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CACHE_HIT_REASON,
  FIRST_MISS_REASON,
  INVALIDATED_REASON,
  createContextCacheId,
  getOrBuildCachedContext,
};
