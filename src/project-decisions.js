const crypto = require("node:crypto");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";
const APPROVED = "APPROVED";
const VERIFIED = "VERIFIED";
const REJECTED = "REJECTED";
const NON_ENFORCING = "NON_ENFORCING";
const APPROVE_PROJECT_DECISION = "APPROVE_PROJECT_DECISION";
const ENFORCEMENT_STATUSES = {
  ALLOWED: "ALLOWED",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  BLOCKED: "BLOCKED",
  UNKNOWN: UNKNOWN,
};
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
const CONFLICT_CATEGORIES = new Set(["architecture", "framework", "language", "dependency policy", "protected subsystem"]);
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

function enforceProjectDecisions(options = {}) {
  const projectId = stringOrUnknown(options.projectId || "default");
  const task = normalizeEnforcementTask(options.task || options);
  const decisions = activeDecisionRecords(options, projectId).map(decisionFromRecord);
  const matched = decisions.map((decision) => evaluateDecision(decision, task)).filter(Boolean);
  const conflicts = conflictingDecisionCategories(matched);

  if (task.objective === UNKNOWN && task.expectedFiles.length === 0) {
    return enforcementResult({
      status: ENFORCEMENT_STATUSES.UNKNOWN,
      projectId,
      reason: "Decision enforcement needs a task objective or planned files.",
      matched,
      conflicts,
    });
  }

  if (conflicts.length > 0) {
    return enforcementResult({
      status: ENFORCEMENT_STATUSES.APPROVAL_REQUIRED,
      projectId,
      reason: `Conflicting active project decisions require review: ${conflicts.join(", ")}.`,
      matched,
      conflicts,
    });
  }

  if (matched.some((decision) => decision.status === ENFORCEMENT_STATUSES.BLOCKED)) {
    return enforcementResult({
      status: ENFORCEMENT_STATUSES.BLOCKED,
      projectId,
      reason: firstReason(matched, ENFORCEMENT_STATUSES.BLOCKED),
      matched,
      conflicts,
    });
  }

  if (matched.some((decision) => decision.status === ENFORCEMENT_STATUSES.APPROVAL_REQUIRED)) {
    return enforcementResult({
      status: ENFORCEMENT_STATUSES.APPROVAL_REQUIRED,
      projectId,
      reason: firstReason(matched, ENFORCEMENT_STATUSES.APPROVAL_REQUIRED),
      matched,
      conflicts,
    });
  }

  return enforcementResult({
    status: ENFORCEMENT_STATUSES.ALLOWED,
    projectId,
    reason: matched.length > 0 ? "Active project decisions are reflected as planning constraints." : "No active project decision restricts this task.",
    matched,
    conflicts,
  });
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

  if (["REMOVED", "REJECTED", "UNRESOLVED"].includes(record.value.enforcementState)) {
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

function activeDecisionRecords(options, projectId) {
  const records = Array.isArray(options.decisionRecords)
    ? options.decisionRecords
    : options.memoryStore && typeof options.memoryStore.listRecords === "function"
      ? options.memoryStore.listRecords(projectId)
      : [];

  return records.filter((record) => isApprovedDecisionRecord(record, projectId)).sort(compareStable);
}

function decisionFromRecord(record) {
  return {
    decisionId: record.value.decisionId || record.id,
    projectId: record.projectId,
    category: record.value.category,
    statement: record.value.statement,
    scope: record.value.scope || "PROJECT",
    approvalStatus: record.value.approvalStatus,
    enforcementState: record.value.enforcementState || NON_ENFORCING,
    evidence: normalizeEvidence(record.value.evidence || record.source.evidence),
    approvalTimestamp: record.value.approvalTimestamp || record.timestamp,
    confidence: record.value.confidence || record.confidenceState,
  };
}

function normalizeEnforcementTask(task) {
  return {
    objective: stringOrUnknown(task.objective || task.normalizedObjective || task.originalRequest),
    expectedFiles: normalizeStringArray(task.expectedFiles || task.files || task.plannedFiles),
    plannedOperations: normalizeOperations(task.plannedOperations),
    validationCommands: normalizeStringArray(task.validationCommands),
  };
}

function normalizeStringArray(value) {
  return uniqueSorted(asArray(value).map(stringOrUnknown).filter((entry) => entry !== UNKNOWN));
}

function normalizeOperations(operations) {
  if (!Array.isArray(operations)) {
    return [];
  }

  return operations
    .filter(isPlainObject)
    .map((operation) => ({
      type: stringOrUnknown(operation.type),
      path: stringOrUnknown(operation.path),
    }))
    .filter((operation) => operation.path !== UNKNOWN)
    .sort(compareStable);
}

function evaluateDecision(decision, task) {
  const text = taskText(task);
  const decisionText = `${decision.statement} ${decision.scope}`.toLowerCase();
  const matched = decisionApplies(decision, task, text);

  if (!matched) {
    return null;
  }

  if (decision.category === "dependency policy") {
    const status = blockingPolicyText(decisionText)
      ? ENFORCEMENT_STATUSES.BLOCKED
      : ENFORCEMENT_STATUSES.APPROVAL_REQUIRED;

    return decisionMatch(decision, status, `Dependency policy applies: ${decision.statement}`);
  }

  if (decision.category === "protected subsystem") {
    return decisionMatch(
      decision,
      ENFORCEMENT_STATUSES.APPROVAL_REQUIRED,
      `Protected subsystem changes require explicit approval: ${decision.statement}`,
    );
  }

  if (decision.category === "validation requirement") {
    return {
      ...decisionMatch(decision, ENFORCEMENT_STATUSES.ALLOWED, `Validation requirement applies: ${decision.statement}`),
      validationCommand: validationCommandFor(decision.statement),
    };
  }

  return decisionMatch(decision, ENFORCEMENT_STATUSES.ALLOWED, `Planning constraint applies: ${decision.statement}`);
}

function decisionApplies(decision, task, text) {
  if (decision.category === "validation requirement") {
    return true;
  }

  if (decision.category === "dependency policy") {
    return /\b(dependencies|dependency|package|npm|install|library|module)\b/i.test(text) || task.expectedFiles.some(isDependencyManifest);
  }

  if (decision.category === "protected subsystem") {
    return tokenOverlap(decision.statement, text) || tokenOverlap(decision.scope, text);
  }

  return tokenOverlap(decision.statement, text) || tokenOverlap(decision.scope, text);
}

function taskText(task) {
  return `${task.objective} ${task.expectedFiles.join(" ")} ${task.plannedOperations
    .map((operation) => `${operation.type} ${operation.path}`)
    .join(" ")} ${task.validationCommands.join(" ")}`.toLowerCase();
}

function isDependencyManifest(filePath) {
  return /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|poetry\.lock|cargo\.toml|go\.mod)$/i.test(filePath);
}

function tokenOverlap(source, target) {
  const tokens = meaningfulTokens(source);

  if (tokens.length === 0) {
    return false;
  }

  return tokens.some((token) => target.includes(token));
}

function meaningfulTokens(value) {
  return uniqueSorted(
    stringOrUnknown(value)
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter((token) => token.length > 3)
      .filter((token) => !["approved", "decision", "project", "should", "must", "requires", "require", "always", "never", "only"].includes(token)),
  );
}

function blockingPolicyText(text) {
  return /\b(block|blocked|forbid|forbidden|prohibit|prohibited|must not|do not|never|disallow|disallowed)\b/i.test(text);
}

function validationCommandFor(statement) {
  const text = stringOrUnknown(statement);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  const quoted = text.match(/["'`]([^"'`]+)["'`]/);

  if (quoted) {
    return quoted[1].trim();
  }

  const runMatch = text.match(/\b(?:run|require|requires)\s+(.+?)\.?$/i);

  if (runMatch) {
    return runMatch[1].trim();
  }

  return text;
}

function decisionMatch(decision, status, reason) {
  return {
    status,
    reason,
    decisionId: decision.decisionId,
    category: decision.category,
    statement: decision.statement,
    evidence: decision.evidence,
    confidence: decision.confidence,
    approvalTimestamp: decision.approvalTimestamp,
  };
}

function conflictingDecisionCategories(matches) {
  const byCategory = new Map();

  for (const match of matches) {
    if (!CONFLICT_CATEGORIES.has(match.category)) {
      continue;
    }

    const existing = byCategory.get(match.category) || new Set();
    existing.add(match.statement);
    byCategory.set(match.category, existing);
  }

  return Array.from(byCategory.entries())
    .filter(([, statements]) => statements.size > 1)
    .map(([category]) => category)
    .sort();
}

function enforcementResult(input) {
  const matches = input.matched.sort(compareStable);

  return {
    status: input.status,
    projectId: input.projectId,
    reason: input.reason,
    decisions: matches.map((match) => ({
      decisionId: match.decisionId,
      category: match.category,
      statement: match.statement,
      status: match.status,
      reason: match.reason,
      evidence: match.evidence,
      confidence: match.confidence,
      approvalTimestamp: match.approvalTimestamp,
    })),
    constraints: uniqueSorted(matches.map((match) => `${match.category}: ${match.statement}`)),
    validationCommands: uniqueSorted(
      matches
        .map((match) => match.validationCommand)
        .filter((command) => command && command !== UNKNOWN),
    ),
    conflicts: input.conflicts,
  };
}

function firstReason(matches, status) {
  const match = matches.find((candidate) => candidate.status === status);
  return match ? match.reason : "Project decision enforcement requires review.";
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

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
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
  ENFORCEMENT_STATUSES,
  NON_ENFORCING,
  UNKNOWN,
  enforceProjectDecisions,
  recordProjectDecision,
  recordProjectDecisions,
};
