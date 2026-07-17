const REPAIR_RESULTS = Object.freeze({
  REPAIRED: "REPAIRED",
  RETRY_VALIDATION: "RETRY_VALIDATION",
  CANNOT_REPAIR: "CANNOT_REPAIR",
  REPAIR_FAILED: "REPAIR_FAILED",
  RESTORE_REQUIRED: "RESTORE_REQUIRED",
});

class RepairEngine {
  constructor(options = {}) {
    validateOptions(options);

    this.canRepairCallback = options.canRepair || defaultCanRepair;
    this.createRepairPlanCallback = options.createRepairPlan || defaultCreateRepairPlan;
    this.repairCallback = options.repair || defaultRepair;
  }

  canRepair(context) {
    return this.canRepairCallback(normalizeRepairContext(context)) === true;
  }

  createRepairPlan(context) {
    const normalized = normalizeRepairContext(context);
    const plan = this.createRepairPlanCallback(normalized);

    if (!isPlainObject(plan)) {
      throw new Error("Repair engine repair plan must be an object.");
    }

    return clonePlainObject(plan);
  }

  async repair(context) {
    const normalized = normalizeRepairContext(context);
    const result = await this.repairCallback(normalized);

    return normalizeRepairResult(result);
  }
}

function normalizeRepairContext(context) {
  if (!isPlainObject(context)) {
    throw new Error("Repair engine context is required.");
  }

  if (!isPlainObject(context.session)) {
    throw new Error("Repair engine session is required.");
  }

  return {
    session: context.session,
    validationResult: isPlainObject(context.validationResult) ? clonePlainObject(context.validationResult) : context.validationResult,
    failureDetails: context.failureDetails === undefined ? null : clonePlainObjectOrValue(context.failureDetails),
    failedTask: context.failedTask === undefined ? null : clonePlainObjectOrValue(context.failedTask),
    currentRepairCount: normalizeNonnegativeInteger(context.currentRepairCount || 0, "currentRepairCount"),
    metadata: normalizeMetadata(context.metadata || {}),
  };
}

function normalizeRepairResult(result) {
  if (typeof result === "string") {
    return {
      result: normalizeResultConstant(result),
      action: result,
      metadata: {},
    };
  }

  if (!isPlainObject(result)) {
    throw new Error("Repair engine result must be a string or object.");
  }

  return {
    result: normalizeResultConstant(result.result),
    action: typeof result.action === "string" && result.action.trim() !== "" ? result.action.trim() : result.result,
    metadata: normalizeMetadata(result.metadata || {}),
    failureSummary: typeof result.failureSummary === "string" && result.failureSummary.trim() !== ""
      ? result.failureSummary.trim()
      : undefined,
  };
}

function normalizeResultConstant(result) {
  if (typeof result !== "string" || result.trim() === "") {
    throw new Error("Repair engine result is required.");
  }

  const normalized = result.trim().toUpperCase();

  if (!Object.values(REPAIR_RESULTS).includes(normalized)) {
    throw new Error("Repair engine result is invalid.");
  }

  return normalized;
}

function defaultCanRepair(context) {
  return Boolean(context.metadata.canRepair);
}

function defaultCreateRepairPlan(context) {
  return {
    action: "No repair callback configured.",
    metadata: context.metadata,
  };
}

function defaultRepair() {
  return {
    result: REPAIR_RESULTS.CANNOT_REPAIR,
    action: "No repair callback configured.",
  };
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Repair engine options must be an object.");
  }

  for (const fieldName of ["canRepair", "createRepairPlan", "repair"]) {
    if (options[fieldName] !== undefined && typeof options[fieldName] !== "function") {
      throw new Error(`Repair engine ${fieldName} must be a function.`);
    }
  }
}

function normalizeNonnegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Repair engine ${fieldName} must be a nonnegative integer.`);
  }

  return value;
}

function normalizeMetadata(metadata) {
  if (!isPlainObject(metadata)) {
    throw new Error("Repair engine metadata must be an object.");
  }

  return clonePlainObject(metadata);
}

function clonePlainObjectOrValue(value) {
  return isPlainObject(value) || Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value;
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  REPAIR_RESULTS,
  RepairEngine,
};
