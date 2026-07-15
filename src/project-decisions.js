const crypto = require("node:crypto");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";
const APPROVED = "APPROVED";
const VERIFIED = "VERIFIED";
const REJECTED = "REJECTED";
const NON_ENFORCING = "NON_ENFORCING";
const APPROVE_PROJECT_DECISION = "APPROVE_PROJECT_DECISION";
const CONTROL_CONFIDENCE_STATES = new Set([APPROVED, VERIFIED]);
const DECISION_CATEGORIES = [
  "architecture",
  "framework",
  "language",
  "coding standard",
  "validation requirement",
  "dependency policy",
  "protected subsystem",
  "naming convention",
  "business rule",
];
const SOURCE_EXTENSIONS = new Set([
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
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const GENERATED_PATH_PATTERN = /(^|\/)(coverage|dist|build|out|generated|\.next)($|\/)|(^|\/).*\.min\.[a-z0-9]+$/i;
const DEPENDENCY_PATH_PATTERN = /(^|\/)(node_modules|vendor)($|\/)/i;
const BINARY_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|so|dylib|bin|wasm)$/i;
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;

function recordProjectDecision(options) {
  const result = recordProjectDecisions({
    ...options,
    decisions: [options.decision],
  });

  return {
    ...result,
    record: result.records[0] || null,
    decisionResult: result.results[0] || null,
  };
}

function recordProjectDecisions(options) {
  validateRecordOptions(options);

  const projectId = stringOrUnknown(options.projectId || "default");
  const decisions = normalizeDecisionInputs(options);
  const timestamp = normalizeTimestamp(options.timestamp);
  const existingRecords = options.memoryStore.listRecords(projectId);
  const explicitApproval = options.approval === APPROVE_PROJECT_DECISION;
  const records = [];
  const results = [];

  for (const decision of decisions) {
    const validation = explicitApproval
      ? validateRecordableDecision(decision)
      : { ok: false, reason: "Explicit project decision approval is required." };

    if (!validation.ok) {
      results.push(rejectedDecisionResult(decision, validation.reason));
      continue;
    }

    const duplicate = findDuplicateDecisionRecord(existingRecords, projectId, decision);

    if (duplicate) {
      results.push({
        status: "DUPLICATE",
        reason: "Approved project decision already exists.",
        record: duplicate,
        decision,
      });
      continue;
    }

    const record = projectDecisionRecord({
      decision,
      projectId,
      timestamp,
    });
    const stored = options.memoryStore.addRecord(projectId, record);

    existingRecords.push(stored);
    records.push(stored);
    results.push({
      status: APPROVED,
      record: stored,
      decision,
    });
  }

  return {
    status: decisionBatchStatus(results),
    projectId,
    records,
    results,
  };
}

function validateRecordOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project decision record options are required.");
  }

  if (!isMemoryStore(options.memoryStore)) {
    throw new Error("Project decision recording requires a memoryStore.");
  }
}

function normalizeDecisionInputs(options) {
  const decisions = options.decisions || (options.decision ? [options.decision] : []);

  if (!Array.isArray(decisions) || decisions.length === 0) {
    throw new Error("Project decision recording requires at least one decision.");
  }

  return decisions.map(cloneJson);
}

function normalizeTimestamp(timestamp) {
  if (timestamp === undefined) {
    return new Date().toISOString();
  }

  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Project decision approval timestamp must be valid.");
  }

  return timestamp;
}

function validateRecordableDecision(decision) {
  if (!isPlainObject(decision)) {
    return { ok: false, reason: "Project decision must be an object." };
  }

  const category = normalizeCategory(decision.category);

  if (!DECISION_CATEGORIES.includes(category)) {
    return { ok: false, reason: "Unsupported project decision category." };
  }

  const statement = stringOrUnknown(decision.statement || decision.decision || decision.value);

  if (statement === UNKNOWN) {
    return { ok: false, reason: "UNKNOWN project decision cannot be recorded." };
  }

  if (decision.approvalStatus === REJECTED || decision.status === REJECTED || decision.rejected === true) {
    return { ok: false, reason: "Rejected project decision cannot be recorded." };
  }

  if (decision.status === "UNRESOLVED" || decision.unresolved === true) {
    return { ok: false, reason: "Unresolved project decision cannot be recorded." };
  }

  const rawConfidence = decision.confidence || decision.confidenceState;

  if (stringOrUnknown(rawConfidence) === UNKNOWN) {
    return { ok: false, reason: "Project decision confidence is required." };
  }

  const confidence = normalizeConfidence(rawConfidence);

  if (!CONTROL_CONFIDENCE_STATES.has(confidence)) {
    return { ok: false, reason: "Unverified project decision cannot be recorded." };
  }

  const evidence = rawEvidence(decision);

  if (!Array.isArray(evidence) || evidence.length === 0 || normalizeEvidence(evidence).length === 0) {
    return { ok: false, reason: "Project decision recording requires source evidence." };
  }

  if (hasUnsafeEvidenceSource(evidence) || containsSecretValue(decision) || containsModelOutputEvidence(decision)) {
    return { ok: false, reason: "Unsafe or model-output project decision cannot be recorded." };
  }

  return { ok: true };
}

function projectDecisionRecord(input) {
  const normalized = normalizeDecision(input.decision);
  const decisionId = projectDecisionId(input.projectId, normalized);

  return {
    id: decisionId,
    projectId: input.projectId,
    type: "approved-decision",
    source: {
      kind: "project-decision",
      category: normalized.category,
      evidence: normalized.evidence,
    },
    timestamp: input.timestamp,
    confidenceState: APPROVED,
    value: {
      decisionId,
      projectId: input.projectId,
      category: normalized.category,
      statement: normalized.statement,
      scope: normalized.scope,
      approvalStatus: APPROVED,
      enforcementState: NON_ENFORCING,
      evidence: normalized.evidence,
      approvalTimestamp: input.timestamp,
      confidence: normalized.confidence,
    },
  };
}

function normalizeDecision(decision) {
  return {
    category: normalizeCategory(decision.category),
    statement: stringOrUnknown(decision.statement || decision.decision || decision.value),
    scope: stringOrUnknown(decision.scope || "PROJECT"),
    evidence: normalizeEvidence(rawEvidence(decision)),
    confidence: normalizeConfidence(decision.confidence || decision.confidenceState),
  };
}

function rawEvidence(decision) {
  return decision.evidence || decision.sourceEvidence || decision.sources || [];
}

function findDuplicateDecisionRecord(records, projectId, decision) {
  const fingerprint = projectDecisionFingerprint(projectId, normalizeDecision(decision));

  return records.find((record) => {
    if (!isApprovedDecisionRecord(record, projectId)) {
      return false;
    }

    return projectDecisionRecordFingerprint(record) === fingerprint;
  });
}

function isApprovedDecisionRecord(record, projectId) {
  if (!isPlainObject(record) || record.type !== "approved-decision") {
    return false;
  }

  if (record.projectId !== projectId || record.confidenceState !== APPROVED) {
    return false;
  }

  if (!isPlainObject(record.source) || record.source.kind !== "project-decision") {
    return false;
  }

  if (!isPlainObject(record.value) || record.value.approvalStatus !== APPROVED) {
    return false;
  }

  if (!DECISION_CATEGORIES.includes(record.value.category)) {
    return false;
  }

  return (
    stringOrUnknown(record.value.statement) !== UNKNOWN &&
    normalizeEvidence(record.value.evidence || record.source.evidence).length > 0 &&
    !hasUnsafeEvidenceSource(record.value.evidence || record.source.evidence) &&
    !containsSecretValue(record) &&
    !containsModelOutputEvidence(record)
  );
}

function projectDecisionId(projectId, decision) {
  return `project-decision-${crypto
    .createHash("sha256")
    .update(projectDecisionFingerprint(projectId, decision))
    .digest("hex")
    .slice(0, 16)}`;
}

function projectDecisionFingerprint(projectId, decision) {
  return stableSerialize({
    projectId,
    category: decision.category,
    statement: decision.statement,
  });
}

function projectDecisionRecordFingerprint(record) {
  return stableSerialize({
    projectId: record.projectId || UNKNOWN,
    category: record.value.category,
    statement: record.value.statement,
  });
}

function decisionBatchStatus(results) {
  if (results.every((result) => result.status === APPROVED)) {
    return APPROVED;
  }

  if (results.every((result) => result.status === "DUPLICATE")) {
    return "DUPLICATE";
  }

  if (results.every((result) => result.status === REJECTED)) {
    return REJECTED;
  }

  return "PARTIAL";
}

function rejectedDecisionResult(decision, reason) {
  return {
    status: REJECTED,
    reason,
    decision,
  };
}

function normalizeCategory(category) {
  return stringOrUnknown(category).toLowerCase().replace(/\s+/g, " ");
}

function normalizeConfidence(confidence) {
  return stringOrUnknown(confidence || VERIFIED).toUpperCase();
}

function normalizeEvidence(evidence) {
  return asArray(evidence)
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const source = normalizeSource(entry.source);
      const signal = stringOrUnknown(entry.signal);

      if (source === UNKNOWN || signal === UNKNOWN) {
        return null;
      }

      return { source, signal };
    })
    .filter(Boolean)
    .sort(compareStable);
}

function normalizeSource(source) {
  const text = stringOrUnknown(source).replace(/\\/g, "/");

  if (text === UNKNOWN || isUnsafeSource(text)) {
    return UNKNOWN;
  }

  const extension = path.extname(text).toLowerCase();

  if (extension && !SOURCE_EXTENSIONS.has(extension)) {
    return UNKNOWN;
  }

  return text;
}

function hasUnsafeEvidenceSource(evidence) {
  return asArray(evidence).some((entry) => {
    if (!isPlainObject(entry)) {
      return false;
    }

    return isUnsafeSource(stringOrUnknown(entry.source));
  });
}

function isUnsafeSource(source) {
  const normalized = source.replace(/\\/g, "/");
  return (
    isLeviRuntimePath(normalized) ||
    SECRET_PATH_PATTERN.test(normalized) ||
    GENERATED_PATH_PATTERN.test(normalized) ||
    DEPENDENCY_PATH_PATTERN.test(normalized) ||
    BINARY_EXTENSION_PATTERN.test(normalized)
  );
}

function isLeviRuntimePath(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[0] === ".levi";
}

function containsModelOutputEvidence(value) {
  if (typeof value === "string") {
    return value.toLowerCase().includes("model-output");
  }

  if (Array.isArray(value)) {
    return value.some(containsModelOutputEvidence);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).some(containsModelOutputEvidence);
}

function containsSecretValue(value) {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsSecretValue);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => SECRET_KEY_PATTERN.test(key) || containsSecretValue(child));
}

function asArray(value) {
  if (value === undefined || value === null || value === UNKNOWN) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function compareStable(left, right) {
  return stableSerialize(left).localeCompare(stableSerialize(right));
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

  return String(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isMemoryStore(value) {
  return isPlainObject(value) && typeof value.listRecords === "function" && typeof value.addRecord === "function";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  APPROVE_PROJECT_DECISION,
  DECISION_CATEGORIES,
  NON_ENFORCING,
  UNKNOWN,
  recordProjectDecision,
  recordProjectDecisions,
};
