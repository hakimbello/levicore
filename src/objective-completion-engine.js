const crypto = require("node:crypto");

const COMPLETION_RESULTS = Object.freeze({
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
  BLOCKED: "BLOCKED",
  REQUIRES_REVIEW: "REQUIRES_REVIEW",
});

class ObjectiveCompletionEngine {
  constructor(options = {}) {
    validateOptions(options);

    this.rules = options.rules || [];
    this.now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  }

  evaluate(session, context = {}) {
    const normalizedSession = normalizeSession(session);
    const normalizedContext = normalizeContext(context);
    const findings = [
      ...defaultFindings(normalizedSession, normalizedContext, this.now),
      ...customFindings(this.rules, normalizedSession, normalizedContext, this.now),
    ];

    return {
      result: resultForFindings(findings),
      reasons: findings.map((finding) => finding.description),
      findings,
      timestamp: nowIso(this.now),
      metadata: normalizeObject(normalizedContext.metadata || {}),
    };
  }

  isComplete(session, context = {}) {
    return this.evaluate(session, context).result === COMPLETION_RESULTS.COMPLETE;
  }

  getIncompleteReasons(session, context = {}) {
    return this.evaluate(session, context).reasons;
  }
}

function defaultFindings(session, context, now) {
  const findings = [];

  if (session.objective === "UNKNOWN") {
    findings.push(finding("OBJECTIVE_MISSING", "Objective is missing", "The execution session has no objective.", COMPLETION_RESULTS.INCOMPLETE, now));
  }

  const plannedStepsRequired = context.requirePlannedSteps === true || session.metadata.requirePlannedSteps === true;

  if (plannedStepsRequired && session.completedSteps.length === 0 && session.remainingSteps.length === 0) {
    findings.push(finding("PLANNED_STEPS_MISSING", "Planned steps are missing", "Completion requires planned steps.", COMPLETION_RESULTS.INCOMPLETE, now));
  }

  if (session.remainingSteps.length > 0) {
    findings.push(finding("REMAINING_STEPS", "Executable steps remain", "The objective still has remaining executable steps.", COMPLETION_RESULTS.INCOMPLETE, now, {
      remainingSteps: session.remainingSteps,
    }));
  }

  for (const requiredStep of requiredStepsFor(session, context)) {
    if (!session.completedSteps.includes(requiredStep)) {
      findings.push(finding("REQUIRED_STEP_INCOMPLETE", "Required step incomplete", `Required step is not complete: ${requiredStep}.`, COMPLETION_RESULTS.INCOMPLETE, now, {
        requiredStep,
      }));
    }
  }

  if (session.metadata.validationPassed !== true) {
    findings.push(finding("VALIDATION_NOT_PASSED", "Latest validation has not passed", "The latest validation result must pass before completion.", COMPLETION_RESULTS.INCOMPLETE, now));
  }

  if (hasUnresolvedValidationFailure(session)) {
    findings.push(finding("UNRESOLVED_VALIDATION_FAILURE", "Validation failure unresolved", "There is an unresolved validation failure.", COMPLETION_RESULTS.INCOMPLETE, now));
  }

  if (hasUnresolvedRepair(session)) {
    findings.push(finding("UNRESOLVED_REPAIR", "Repair attempt unresolved", "There is an unresolved repair attempt.", COMPLETION_RESULTS.BLOCKED, now));
  }

  if (isPlainObject(session.metadata.approvalRequest)) {
    findings.push(finding("PENDING_APPROVAL", "Approval is pending", "A pending approval request must be resolved before completion.", COMPLETION_RESULTS.REQUIRES_REVIEW, now));
  }

  for (const securityFinding of highSeveritySecurityFindings(session)) {
    findings.push(finding(
      "UNRESOLVED_SECURITY_FINDING",
      "Security finding unresolved",
      `Unresolved ${securityFinding.severity} security finding: ${securityFinding.title}.`,
      securityFinding.severity === "CRITICAL" ? COMPLETION_RESULTS.BLOCKED : COMPLETION_RESULTS.REQUIRES_REVIEW,
      now,
      {
        securityFindingId: securityFinding.id,
        severity: securityFinding.severity,
        ruleId: securityFinding.ruleId,
      },
    ));
  }

  if (activeSecurityReview(session)) {
    findings.push(finding("ACTIVE_SECURITY_REVIEW", "Security review is active", "Security review must be resolved before completion.", COMPLETION_RESULTS.REQUIRES_REVIEW, now));
  }

  if (session.currentState === "FAILED" || session.metadata.executionFailed === true) {
    findings.push(finding("EXECUTION_FAILED", "Execution failed", "A failed execution session cannot be completed.", COMPLETION_RESULTS.BLOCKED, now));
  }

  if (session.currentState === "CANCELLED" || session.metadata.userCancelled === true) {
    findings.push(finding("EXECUTION_CANCELLED", "Execution cancelled", "A cancelled execution session cannot be completed.", COMPLETION_RESULTS.BLOCKED, now));
  }

  if (session.metadata.restoreRequired === true || latestRepairResult(session) === "RESTORE_REQUIRED") {
    findings.push(finding("RESTORE_REQUIRED", "Restore required", "A restore is required before completion.", COMPLETION_RESULTS.BLOCKED, now));
  }

  for (const blocker of unresolvedBlockers(session)) {
    findings.push(finding("UNRESOLVED_BLOCKER", "Unresolved blocker", `Unresolved blocker: ${blocker}.`, COMPLETION_RESULTS.BLOCKED, now, {
      blocker,
    }));
  }

  return findings;
}

function customFindings(rules, session, context, now) {
  return rules.flatMap((rule) => findingsFromRuleOutput(rule(session, context), now));
}

function findingsFromRuleOutput(output, now) {
  if (output === undefined || output === null || output === false) {
    return [];
  }

  if (Array.isArray(output)) {
    return output.flatMap((item) => findingsFromRuleOutput(item, now));
  }

  if (typeof output === "string") {
    return output === COMPLETION_RESULTS.COMPLETE ? [] : [
      normalizeFinding({
        code: "CUSTOM_COMPLETION_RULE",
        title: output,
        description: output,
        status: output,
        metadata: {},
      }, now),
    ];
  }

  if (!isPlainObject(output)) {
    throw new Error("Completion rule output must be an object, string, array, or empty value.");
  }

  if (Array.isArray(output.findings)) {
    return output.findings.map((finding) => normalizeFinding({
      status: output.result || output.status,
      ...finding,
    }, now));
  }

  if ((output.result || output.status) === COMPLETION_RESULTS.COMPLETE) {
    return [];
  }

  return [normalizeFinding(output, now)];
}

function normalizeFinding(input, now) {
  if (!isPlainObject(input)) {
    throw new Error("Completion finding must be an object.");
  }

  const code = requiredString(input.code, "Completion finding code is required.");
  const status = normalizeResult(input.status || input.result || COMPLETION_RESULTS.INCOMPLETE);
  const timestamp = normalizeTimestamp(input.timestamp || nowIso(now), "timestamp");
  const metadata = normalizeObject(input.metadata || {});

  return {
    id: optionalString(input.id) || completionFindingId({
      code,
      status,
      metadata,
      timestamp,
    }),
    code,
    title: requiredString(input.title, "Completion finding title is required."),
    description: requiredString(input.description, "Completion finding description is required."),
    status,
    timestamp,
    metadata,
  };
}

function finding(code, title, description, status, now, metadata = {}) {
  return normalizeFinding({
    code,
    title,
    description,
    status,
    metadata,
  }, now);
}

function resultForFindings(findings) {
  if (findings.some((finding) => finding.status === COMPLETION_RESULTS.BLOCKED)) {
    return COMPLETION_RESULTS.BLOCKED;
  }

  if (findings.some((finding) => finding.status === COMPLETION_RESULTS.REQUIRES_REVIEW)) {
    return COMPLETION_RESULTS.REQUIRES_REVIEW;
  }

  if (findings.some((finding) => finding.status === COMPLETION_RESULTS.INCOMPLETE)) {
    return COMPLETION_RESULTS.INCOMPLETE;
  }

  return COMPLETION_RESULTS.COMPLETE;
}

function requiredStepsFor(session, context) {
  if (Array.isArray(context.requiredSteps)) {
    return normalizeStringArray(context.requiredSteps);
  }

  if (Array.isArray(session.metadata.requiredSteps)) {
    return normalizeStringArray(session.metadata.requiredSteps);
  }

  return [];
}

function hasUnresolvedValidationFailure(session) {
  if (session.metadata.validationPassed === false) {
    return true;
  }

  const failures = session.metadata.validationFailures;
  return Array.isArray(failures) && failures.some((failure) => !isPlainObject(failure) || failure.resolved !== true);
}

function hasUnresolvedRepair(session) {
  const history = Array.isArray(session.metadata.repairHistory) ? session.metadata.repairHistory : [];

  if (history.length === 0) {
    return false;
  }

  return ["REPAIR_FAILED", "CANNOT_REPAIR", "RESTORE_REQUIRED"].includes(latestRepairResult(session));
}

function latestRepairResult(session) {
  const history = Array.isArray(session.metadata.repairHistory) ? session.metadata.repairHistory : [];
  const latest = history[history.length - 1];
  return latest && typeof latest.result === "string" ? latest.result : null;
}

function highSeveritySecurityFindings(session) {
  const findings = Array.isArray(session.metadata.securityFindings) ? session.metadata.securityFindings : [];

  return findings.filter((finding) => {
    if (!isPlainObject(finding)) {
      return false;
    }

    if (finding.resolved === true || finding.status === "RESOLVED") {
      return false;
    }

    return finding.severity === "HIGH" || finding.severity === "CRITICAL";
  });
}

function activeSecurityReview(session) {
  const request = session.metadata.approvalRequest;
  return isPlainObject(request) && request.action && request.action.action === "security_review";
}

function unresolvedBlockers(session) {
  const blockers = session.metadata.blockers || session.metadata.unresolvedBlockers || [];

  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers
    .filter((blocker) => !(isPlainObject(blocker) && blocker.resolved === true))
    .map((blocker) => isPlainObject(blocker) ? String(blocker.reason || blocker.title || blocker.code || "UNKNOWN") : String(blocker));
}

function normalizeSession(session) {
  const source = typeof session.snapshot === "function" ? session.snapshot() : session;

  if (!isPlainObject(source)) {
    throw new Error("Completion session is required.");
  }

  return {
    sessionId: requiredString(source.sessionId, "Completion sessionId is required."),
    objective: stringOrUnknown(source.objective),
    currentState: stringOrUnknown(source.currentState),
    completedSteps: normalizeStringArray(source.completedSteps || []),
    remainingSteps: normalizeStringArray(source.remainingSteps || []),
    approvalRequired: source.approvalRequired === true,
    errors: Array.isArray(source.errors) ? clonePlainObject(source.errors) : [],
    metadata: normalizeObject(source.metadata || {}),
  };
}

function normalizeContext(context) {
  if (!isPlainObject(context)) {
    throw new Error("Completion context must be an object.");
  }

  return clonePlainObject(context);
}

function normalizeResult(result) {
  const normalized = requiredString(result, "Completion result is required.").toUpperCase();

  if (!Object.values(COMPLETION_RESULTS).includes(normalized)) {
    throw new Error("Completion result is invalid.");
  }

  return normalized;
}

function normalizeObject(value) {
  if (!isPlainObject(value)) {
    throw new Error("Completion object field must be an object.");
  }

  return clonePlainObject(value);
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    throw new Error("Completion string array is required.");
  }

  return values.map((value) => requiredString(value, "Completion string array entry is required."));
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Completion engine options must be an object.");
  }

  if (options.rules !== undefined && !Array.isArray(options.rules)) {
    throw new Error("Completion engine rules must be an array.");
  }

  if (Array.isArray(options.rules) && options.rules.some((rule) => typeof rule !== "function")) {
    throw new Error("Completion engine rules must be functions.");
  }
}

function completionFindingId(input) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);

  return `completion-${digest}`;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = requiredString(value, `Completion finding ${fieldName} is required.`);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Completion finding ${fieldName} must be an ISO timestamp.`);
  }

  return timestamp;
}

function nowIso(now) {
  const value = now();
  return typeof value === "string" ? value : new Date(value).toISOString();
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return "UNKNOWN";
  }

  return value.trim();
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
  COMPLETION_RESULTS,
  ObjectiveCompletionEngine,
};
