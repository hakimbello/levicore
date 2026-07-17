const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const APPROVAL_POLICIES = Object.freeze({
  NEVER: "NEVER",
  SAFE_ONLY: "SAFE_ONLY",
  DESTRUCTIVE_ONLY: "DESTRUCTIVE_ONLY",
  ALWAYS: "ALWAYS",
  CUSTOM: "CUSTOM",
});

const APPROVAL_DECISIONS = Object.freeze({
  APPROVED: "APPROVED",
  REQUIRES_APPROVAL: "REQUIRES_APPROVAL",
  DENIED: "DENIED",
});

const APPROVAL_ACTIONS = Object.freeze({
  DELETE_FILE: "delete_file",
  OVERWRITE_FILE: "overwrite_file",
  RENAME_FILE: "rename_file",
  EXECUTE_SHELL_COMMAND: "execute_shell_command",
  INSTALL_PACKAGE: "install_package",
  MODIFY_CONFIGURATION: "modify_configuration",
  GIT_OPERATION: "git_operation",
  NETWORK_OPERATION: "network_operation",
  SECURITY_REVIEW: "security_review",
  COMPLETION_REVIEW: "completion_review",
  SAFE_FILE_READ: "safe_file_read",
  SAFE_FILE_CREATE: "safe_file_create",
});

const APPROVAL_RISK_LEVELS = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const APPROVAL_GATEWAY_EVENTS = Object.freeze({
  REQUEST_CREATED: "approval_request_created",
  REQUEST_APPROVED: "approval_request_approved",
});

const DESTRUCTIVE_ACTIONS = new Set([
  APPROVAL_ACTIONS.DELETE_FILE,
  APPROVAL_ACTIONS.OVERWRITE_FILE,
  APPROVAL_ACTIONS.RENAME_FILE,
]);

const CONTROLLED_ACTIONS = new Set(Object.values(APPROVAL_ACTIONS));

class ApprovalGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    validateOptions(options);

    this.policy = options.policy || APPROVAL_POLICIES.SAFE_ONLY;
    this.customPolicy = options.customPolicy || null;
    this.now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    this.requests = new Map();
    this.approvedRequestIds = new Set(options.approvedRequestIds || []);
  }

  evaluate(action, input = {}) {
    const normalizedAction = normalizeAction(action);
    const decision = evaluateAction(this, normalizedAction);

    if (decision === APPROVAL_DECISIONS.REQUIRES_APPROVAL) {
      const request = this.createApprovalRequest(normalizedAction, input);
      return {
        decision,
        request,
      };
    }

    return {
      decision,
      request: null,
    };
  }

  evaluateActions(actions, input = {}) {
    if (!Array.isArray(actions)) {
      throw new Error("Approval gateway actions must be an array.");
    }

    for (const action of actions) {
      const result = this.evaluate(action, input);

      if (result.decision !== APPROVAL_DECISIONS.APPROVED) {
        return result;
      }
    }

    return {
      decision: APPROVAL_DECISIONS.APPROVED,
      request: null,
    };
  }

  approveRequest(requestId) {
    const normalizedId = requiredString(requestId, "Approval request id is required.");

    if (!this.requests.has(normalizedId)) {
      throw new Error("Approval request does not exist.");
    }

    this.approvedRequestIds.add(normalizedId);
    const request = this.requests.get(normalizedId);

    this.emit(APPROVAL_GATEWAY_EVENTS.REQUEST_APPROVED, request);
    return request;
  }

  isApproved(requestId) {
    return this.approvedRequestIds.has(requiredString(requestId, "Approval request id is required."));
  }

  getRequest(requestId) {
    return this.requests.get(requiredString(requestId, "Approval request id is required.")) || null;
  }

  createApprovalRequest(action, input) {
    const timestamp = normalizeTimestamp(input.timestamp || nowIso(this.now), "timestamp");
    const request = {
      id: approvalRequestId(action, timestamp),
      action,
      reason: reasonFor(action),
      riskLevel: action.riskLevel,
      timestamp,
      metadata: {
        ...(isPlainObject(input.metadata) ? clonePlainObject(input.metadata) : {}),
        ...action.metadata,
      },
    };

    this.requests.set(request.id, request);
    this.emit(APPROVAL_GATEWAY_EVENTS.REQUEST_CREATED, request);
    return request;
  }
}

function evaluateAction(gateway, action) {
  if (action.denied === true || action.blocked === true || action.decision === APPROVAL_DECISIONS.DENIED) {
    return APPROVAL_DECISIONS.DENIED;
  }

  if (action.approvalRequestId && gateway.isApproved(action.approvalRequestId)) {
    return APPROVAL_DECISIONS.APPROVED;
  }

  if (gateway.policy === APPROVAL_POLICIES.CUSTOM) {
    return normalizeCustomDecision(gateway.customPolicy(action));
  }

  if (gateway.policy === APPROVAL_POLICIES.NEVER) {
    return APPROVAL_DECISIONS.APPROVED;
  }

  if (gateway.policy === APPROVAL_POLICIES.ALWAYS) {
    return APPROVAL_DECISIONS.REQUIRES_APPROVAL;
  }

  if (gateway.policy === APPROVAL_POLICIES.DESTRUCTIVE_ONLY) {
    return isDestructiveAction(action) ? APPROVAL_DECISIONS.REQUIRES_APPROVAL : APPROVAL_DECISIONS.APPROVED;
  }

  if (gateway.policy === APPROVAL_POLICIES.SAFE_ONLY) {
    return isSafeAction(action) ? APPROVAL_DECISIONS.APPROVED : APPROVAL_DECISIONS.REQUIRES_APPROVAL;
  }

  throw new Error("Approval gateway policy is invalid.");
}

function isSafeAction(action) {
  return action.safe === true || action.riskLevel === APPROVAL_RISK_LEVELS.LOW && !isControlledRiskAction(action);
}

function isControlledRiskAction(action) {
  return CONTROLLED_ACTIONS.has(action.action) && ![
    APPROVAL_ACTIONS.SAFE_FILE_READ,
    APPROVAL_ACTIONS.SAFE_FILE_CREATE,
  ].includes(action.action);
}

function isDestructiveAction(action) {
  return action.destructive === true || DESTRUCTIVE_ACTIONS.has(action.action);
}

function normalizeAction(action) {
  if (!isPlainObject(action)) {
    throw new Error("Approval gateway action must be an object.");
  }

  const normalizedAction = requiredString(action.action || action.type, "Approval gateway action is required.");

  if (!CONTROLLED_ACTIONS.has(normalizedAction)) {
    throw new Error("Approval gateway action is unsupported.");
  }

  return {
    action: normalizedAction,
    reason: optionalString(action.reason),
    riskLevel: normalizeRiskLevel(action.riskLevel || riskLevelFor(normalizedAction)),
    metadata: normalizeMetadata(action.metadata || {}),
    safe: action.safe === true,
    destructive: action.destructive === true,
    denied: action.denied === true,
    blocked: action.blocked === true,
    decision: typeof action.decision === "string" ? action.decision.trim().toUpperCase() : null,
    approvalRequestId: optionalString(action.approvalRequestId),
  };
}

function riskLevelFor(action) {
  if ([
    APPROVAL_ACTIONS.DELETE_FILE,
    APPROVAL_ACTIONS.OVERWRITE_FILE,
    APPROVAL_ACTIONS.INSTALL_PACKAGE,
    APPROVAL_ACTIONS.GIT_OPERATION,
    APPROVAL_ACTIONS.NETWORK_OPERATION,
  ].includes(action)) {
    return APPROVAL_RISK_LEVELS.HIGH;
  }

  if ([
    APPROVAL_ACTIONS.RENAME_FILE,
    APPROVAL_ACTIONS.EXECUTE_SHELL_COMMAND,
    APPROVAL_ACTIONS.MODIFY_CONFIGURATION,
    APPROVAL_ACTIONS.SECURITY_REVIEW,
    APPROVAL_ACTIONS.COMPLETION_REVIEW,
  ].includes(action)) {
    return APPROVAL_RISK_LEVELS.MEDIUM;
  }

  return APPROVAL_RISK_LEVELS.LOW;
}

function reasonFor(action) {
  if (action.reason) {
    return action.reason;
  }

  return `Approval is required for ${action.action}.`;
}

function normalizeCustomDecision(decision) {
  if (isPlainObject(decision)) {
    return normalizeDecision(decision.decision);
  }

  return normalizeDecision(decision);
}

function normalizeDecision(decision) {
  const normalized = requiredString(decision, "Approval gateway decision is required.").toUpperCase();

  if (!Object.values(APPROVAL_DECISIONS).includes(normalized)) {
    throw new Error("Approval gateway decision is invalid.");
  }

  return normalized;
}

function normalizeRiskLevel(riskLevel) {
  const normalized = requiredString(riskLevel, "Approval gateway riskLevel is required.").toUpperCase();

  if (!Object.values(APPROVAL_RISK_LEVELS).includes(normalized)) {
    throw new Error("Approval gateway riskLevel is invalid.");
  }

  return normalized;
}

function normalizeMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error("Approval gateway metadata must be an object.");
  }

  return clonePlainObject(metadata);
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Approval gateway options must be an object.");
  }

  const policy = options.policy || APPROVAL_POLICIES.SAFE_ONLY;

  if (!Object.values(APPROVAL_POLICIES).includes(policy)) {
    throw new Error("Approval gateway policy is invalid.");
  }

  if (policy === APPROVAL_POLICIES.CUSTOM && typeof options.customPolicy !== "function") {
    throw new Error("Approval gateway customPolicy is required for CUSTOM policy.");
  }

  if (options.approvedRequestIds !== undefined && !Array.isArray(options.approvedRequestIds)) {
    throw new Error("Approval gateway approvedRequestIds must be an array.");
  }
}

function approvalRequestId(action, timestamp) {
  const digest = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      action,
      timestamp,
    }))
    .digest("hex")
    .slice(0, 16);

  return `approval-${digest}`;
}

function normalizeTimestamp(value, fieldName) {
  const timestamp = requiredString(value, `Approval gateway ${fieldName} is required.`);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error(`Approval gateway ${fieldName} must be an ISO timestamp.`);
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
  APPROVAL_ACTIONS,
  APPROVAL_DECISIONS,
  APPROVAL_GATEWAY_EVENTS,
  APPROVAL_POLICIES,
  APPROVAL_RISK_LEVELS,
  ApprovalGateway,
};
