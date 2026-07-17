const crypto = require("node:crypto");

const SECURITY_RESULTS = Object.freeze({
  SAFE: "SAFE",
  WARNING: "WARNING",
  BLOCKED: "BLOCKED",
  REQUIRES_REVIEW: "REQUIRES_REVIEW",
});

const SECURITY_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const SECURITY_TARGETS = Object.freeze({
  ACTION: "action",
  RESULT: "result",
  SESSION: "session",
});

class SecurityValidator {
  constructor(options = {}) {
    validateOptions(options);

    this.actionValidators = options.actionValidators || options.validators || [];
    this.resultValidators = options.resultValidators || options.validators || [];
    this.sessionValidators = options.sessionValidators || options.validators || [];
    this.now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  }

  validateAction(action, context = {}) {
    return this.runValidators(this.actionValidators, SECURITY_TARGETS.ACTION, action, context);
  }

  validateResult(result, context = {}) {
    return this.runValidators(this.resultValidators, SECURITY_TARGETS.RESULT, result, context);
  }

  validateSession(session, context = {}) {
    return this.runValidators(this.sessionValidators, SECURITY_TARGETS.SESSION, session, context);
  }

  runValidators(validators, target, subject, context) {
    const findings = [];

    for (const validator of validators) {
      const output = validator(subject, normalizeContext(context));
      findings.push(...findingsFromOutput(output, target, this.now));
    }

    return {
      status: statusForFindings(findings),
      findings,
    };
  }
}

function findingsFromOutput(output, target, now) {
  if (output === undefined || output === null || output === false) {
    return [];
  }

  if (Array.isArray(output)) {
    return output.flatMap((entry) => findingsFromOutput(entry, target, now));
  }

  if (typeof output === "string") {
    return output === SECURITY_RESULTS.SAFE ? [] : [
      normalizeFinding({
        ruleId: `security-${target}`,
        title: output,
        description: output,
        severity: SECURITY_SEVERITIES.MEDIUM,
        status: output,
        evidence: {},
        remediation: "Review the reported security concern.",
        metadata: {},
      }, now),
    ];
  }

  if (!isPlainObject(output)) {
    throw new Error("Security validator output must be an object, string, array, or empty value.");
  }

  if (Array.isArray(output.findings)) {
    return output.findings.map((finding) => normalizeFinding({
      status: output.status,
      ...finding,
    }, now));
  }

  if (output.status === undefined || output.status === SECURITY_RESULTS.SAFE) {
    return [];
  }

  return [normalizeFinding(output, now)];
}

function normalizeFinding(finding, now) {
  if (!isPlainObject(finding)) {
    throw new Error("Security finding must be an object.");
  }

  const status = normalizeStatus(finding.status || statusForSeverity(finding.severity));
  const severity = normalizeSeverity(finding.severity || severityForStatus(status));
  const evidence = normalizeObject(finding.evidence || {});
  const ruleId = requiredString(finding.ruleId, "Security finding ruleId is required.");
  const timestamp = normalizeTimestamp(finding.timestamp || nowIso(now), "timestamp");

  return {
    id: optionalString(finding.id) || findingId({
      ruleId,
      evidence,
      timestamp,
    }),
    ruleId,
    title: requiredString(finding.title, "Security finding title is required."),
    description: requiredString(finding.description, "Security finding description is required."),
    severity,
    status,
    evidence,
    remediation: requiredString(finding.remediation, "Security finding remediation is required."),
    timestamp,
    metadata: normalizeObject(finding.metadata || {}),
  };
}

function statusForFindings(findings) {
  if (findings.some((finding) => finding.status === SECURITY_RESULTS.BLOCKED)) {
    return SECURITY_RESULTS.BLOCKED;
  }

  if (findings.some((finding) => finding.status === SECURITY_RESULTS.REQUIRES_REVIEW)) {
    return SECURITY_RESULTS.REQUIRES_REVIEW;
  }

  if (findings.some((finding) => finding.status === SECURITY_RESULTS.WARNING)) {
    return SECURITY_RESULTS.WARNING;
  }

  return SECURITY_RESULTS.SAFE;
}

function statusForSeverity(severity) {
  const normalized = normalizeSeverity(severity || SECURITY_SEVERITIES.MEDIUM);

  if (normalized === SECURITY_SEVERITIES.CRITICAL) {
    return SECURITY_RESULTS.BLOCKED;
  }

  if (normalized === SECURITY_SEVERITIES.HIGH) {
    return SECURITY_RESULTS.REQUIRES_REVIEW;
  }

  return SECURITY_RESULTS.WARNING;
}

function severityForStatus(status) {
  if (status === SECURITY_RESULTS.BLOCKED) {
    return SECURITY_SEVERITIES.CRITICAL;
  }

  if (status === SECURITY_RESULTS.REQUIRES_REVIEW) {
    return SECURITY_SEVERITIES.HIGH;
  }

  if (status === SECURITY_RESULTS.WARNING) {
    return SECURITY_SEVERITIES.MEDIUM;
  }

  return SECURITY_SEVERITIES.INFO;
}

function normalizeStatus(status) {
  const normalized = requiredString(status, "Security result status is required.").toUpperCase();

  if (!Object.values(SECURITY_RESULTS).includes(normalized)) {
    throw new Error("Security result status is invalid.");
  }

  return normalized;
}

function normalizeSeverity(severity) {
  const normalized = requiredString(severity, "Security severity is required.").toUpperCase();

  if (!Object.values(SECURITY_SEVERITIES).includes(normalized)) {
    throw new Error("Security severity is invalid.");
  }

  return normalized;
}

function normalizeContext(context) {
  if (!isPlainObject(context)) {
    throw new Error("Security validator context must be an object.");
  }

  return clonePlainObject(context);
}

function normalizeObject(value) {
  if (!isPlainObject(value)) {
    throw new Error("Security finding object field must be an object.");
  }

  return clonePlainObject(value);
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Security validator options must be an object.");
  }

  for (const fieldName of ["validators", "actionValidators", "resultValidators", "sessionValidators"]) {
    if (options[fieldName] !== undefined && !Array.isArray(options[fieldName])) {
      throw new Error(`Security validator ${fieldName} must be an array.`);
    }

    if (Array.isArray(options[fieldName]) && options[fieldName].some((validator) => typeof validator !== "function")) {
      throw new Error(`Security validator ${fieldName} entries must be functions.`);
    }
  }
}

function findingId(input) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);

  return `security-${digest}`;
}

function findingKey(finding) {
  return `${finding.ruleId}:${JSON.stringify(finding.evidence)}`;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = requiredString(value, `Security finding ${fieldName} is required.`);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Security finding ${fieldName} must be an ISO timestamp.`);
  }

  return timestamp;
}

function nowIso(now) {
  const value = now();
  return typeof value === "string" ? value : new Date(value).toISOString();
}

function optionalString(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  SECURITY_RESULTS,
  SECURITY_SEVERITIES,
  SECURITY_TARGETS,
  SecurityValidator,
  findingKey,
};
