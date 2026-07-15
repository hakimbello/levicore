const fs = require("node:fs");
const path = require("node:path");

const OPERATIONS = new Set(["create", "update", "delete"]);

function createCodingExecutor(options) {
  validateOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const plannedFiles = new Set(options.plannedFiles.map((file) => normalizeRelativePath(file)));
  const limits = options.limits;

  function execute(plan) {
    validatePlan(plan);

    const startedAt = Date.now();
    let cost = 0;
    const changes = [];

    if (plan.operations.length > limits.maxSteps) {
      throw new Error("Coding executor step limit exceeded.");
    }

    for (const operation of plan.operations) {
      enforceTimeLimit(startedAt, limits.maxMilliseconds);
      cost += operation.cost || 0;

      if (cost > limits.maxCost) {
        throw new Error("Coding executor cost limit exceeded.");
      }

      const relativePath = normalizeRelativePath(operation.path);
      const targetPath = resolveInsideRepository(repositoryRoot, relativePath);

      if (!plannedFiles.has(relativePath)) {
        throw new Error(`File is outside planned boundaries: ${relativePath}`);
      }

      if (isDestructiveOperation(operation) && operation.destructiveConfirmation !== true) {
        throw new Error(`Destructive confirmation required: ${relativePath}`);
      }

      if (operation.type === "delete") {
        const existed = fs.existsSync(targetPath);

        if (existed) {
          fs.unlinkSync(targetPath);
        }

        changes.push({
          type: operation.type,
          path: relativePath,
          changed: existed,
        });
        continue;
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const existed = fs.existsSync(targetPath);
      fs.writeFileSync(targetPath, operation.content, "utf8");
      changes.push({
        type: existed ? "update" : "create",
        path: relativePath,
        changed: true,
      });
    }

    return {
      changes,
      usage: {
        steps: plan.operations.length,
        cost,
        milliseconds: Date.now() - startedAt,
      },
    };
  }

  return {
    execute,
  };
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Coding executor options are required.");
  }

  if (typeof options.repositoryRoot !== "string" || options.repositoryRoot.trim() === "") {
    throw new Error("Coding executor repositoryRoot is required.");
  }

  if (!Array.isArray(options.plannedFiles) || options.plannedFiles.length === 0) {
    throw new Error("Coding executor plannedFiles are required.");
  }

  validateLimits(options.limits);
}

function validateLimits(limits) {
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("Coding executor limits are required.");
  }

  if (!Number.isInteger(limits.maxSteps) || limits.maxSteps < 1) {
    throw new Error("Coding executor maxSteps limit is required.");
  }

  if (!Number.isInteger(limits.maxMilliseconds) || limits.maxMilliseconds < 1) {
    throw new Error("Coding executor maxMilliseconds limit is required.");
  }

  if (!Number.isFinite(limits.maxCost) || limits.maxCost < 0) {
    throw new Error("Coding executor maxCost limit is required.");
  }
}

function validatePlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("Coding executor plan is required.");
  }

  if (!Array.isArray(plan.operations)) {
    throw new Error("Coding executor operations are required.");
  }

  for (const operation of plan.operations) {
    validateOperation(operation);
  }
}

function validateOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("Coding executor operation is required.");
  }

  if (!OPERATIONS.has(operation.type)) {
    throw new Error("Coding executor operation type is invalid.");
  }

  if (typeof operation.path !== "string" || operation.path.trim() === "") {
    throw new Error("Coding executor operation path is required.");
  }

  if ((operation.type === "create" || operation.type === "update") && typeof operation.content !== "string") {
    throw new Error("Coding executor operation content is required.");
  }
}

function isDestructiveOperation(operation) {
  return operation.type === "delete" || operation.destructive === true;
}

function resolveInsideRepository(repositoryRoot, relativePath) {
  const targetPath = path.resolve(repositoryRoot, relativePath);
  const relativeToRoot = path.relative(repositoryRoot, targetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`File is outside active repository: ${relativePath}`);
  }

  return targetPath;
}

function normalizeRelativePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "" || path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Coding executor path must be relative.");
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Coding executor path must stay inside active repository.");
  }

  return parts.join("/");
}

function enforceTimeLimit(startedAt, maxMilliseconds) {
  if (Date.now() - startedAt > maxMilliseconds) {
    throw new Error("Coding executor time limit exceeded.");
  }
}

module.exports = {
  createCodingExecutor,
};
